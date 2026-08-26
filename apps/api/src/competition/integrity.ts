/**
 * Agenda komisaře pro integritu soutěže.
 *
 * Kniha sázek a listina přestupů. Obojí je odpověď na tutéž otázku —
 * „nejde tady o něco podezřelého?" — a proto to drží jeden funkcionář.
 *
 * Žádná automatická detekce ani sankce. Kód jen zpřístupní stopu a upozorní
 * na obchody, které stojí za pohled; rozhodnutí je na člověku.
 */

import { logger } from "../lib/logger";
import { actsFor, presidentOf } from "./officials";
import { estimateMarketValue } from "../season/economy";

const M = "competition-integrity";

/** Kolikrát za sezónu smí komisař zablokovat sázení sám, bez hlasování. */
export const KOMISAR_BAN_LIMIT = 2;

/** Kolik výher smí sám zabavit. Vyšší počet už patří na zasedání. */
export const KOMISAR_VOID_LIMIT = 2;

/**
 * Smí tenhle klub vidět knihu sázek a listinu přestupů?
 *
 * Komisař ano, prezident soutěže taky — je nadřízený ostatním předsedům
 * a bez přístupu by nemohl posoudit, jestli komisař koná. Nikdo další ne:
 * běžící tikety by se daly kopírovat a číst z nich záměry soupeřů.
 */
export async function muzeDoKnihy(
  db: D1Database, leagueId: string, teamId: string, seasonNumber: number,
): Promise<boolean> {
  const komisar = await actsFor(db, leagueId, teamId, "integrita", seasonNumber);
  if (komisar.ok) return true;
  const prezident = await presidentOf(db, leagueId, seasonNumber);
  return prezident?.teamId === teamId;
}

export interface ZaznamKnihy {
  ticketId: string;
  cislo: string;
  teamId: string;
  teamName: string;
  stake: number;
  totalOddsX100: number;
  payout: number;
  status: string;
  gameWeek: number | null;
  bezici: boolean;
  tipy: Array<{ label: string; oddsX100: number; result: string; zapas: string }>;
}

/** Kniha sázek soutěže — kdo, na co, kolik a jak to dopadlo. */
export async function knihaSazek(
  db: D1Database, leagueId: string, seasonNumber: number, limit = 60,
): Promise<ZaznamKnihy[]> {
  const tikety = await db.prepare(
    `SELECT t.id, t.team_id, t.stake, t.total_odds_x100, t.payout, t.status,
            tm.name AS team_name, sc.game_week
       FROM bet_tickets t
       JOIN teams tm ON tm.id = t.team_id
       LEFT JOIN season_calendar sc ON sc.id = t.calendar_id
      WHERE t.league_id = ? AND t.season_number = ? AND t.status <> 'pending'
      ORDER BY t.created_at DESC LIMIT ?`
  ).bind(leagueId, seasonNumber, limit).all<Record<string, unknown>>()
    .catch((e) => { logger.error({ module: M }, `kniha sázek ligy ${leagueId}`, e); return { results: [] }; });

  if (tikety.results.length === 0) return [];
  const ids = tikety.results.map((t) => t.id as string);

  const tipy = await db.prepare(
    `SELECT s.ticket_id, s.label, s.odds_x100, s.result,
            h.name AS home_name, a.name AS away_name
       FROM bet_selections s
       JOIN matches m ON m.id = s.match_id
       JOIN teams h ON h.id = m.home_team_id
       JOIN teams a ON a.id = m.away_team_id
      WHERE s.ticket_id IN (${ids.map(() => "?").join(",")})`
  ).bind(...ids).all<Record<string, unknown>>()
    .catch((e) => { logger.error({ module: M }, "tipy knihy sázek", e); return { results: [] }; });

  const podle = new Map<string, ZaznamKnihy["tipy"]>();
  for (const t of tipy.results) {
    const arr = podle.get(t.ticket_id as string) ?? [];
    arr.push({
      label: t.label as string,
      oddsX100: t.odds_x100 as number,
      result: t.result as string,
      zapas: `${t.home_name} — ${t.away_name}`,
    });
    podle.set(t.ticket_id as string, arr);
  }

  return tikety.results.map((t) => ({
    ticketId: t.id as string,
    cislo: String(t.id).slice(0, 4).toUpperCase(),
    teamId: t.team_id as string,
    teamName: t.team_name as string,
    stake: t.stake as number,
    totalOddsX100: t.total_odds_x100 as number,
    payout: t.payout as number,
    status: t.status as string,
    gameWeek: (t.game_week as number) ?? null,
    bezici: t.status === "open",
    tipy: podle.get(t.id as string) ?? [],
  }));
}

export interface ZaznamPrestupu {
  hrac: string;
  playerId: string;
  zKlubu: string | null;
  doKlubu: string;
  castka: number;
  /** „přestup" nebo „hostování" — hostování se posuzuje jinak. */
  druh: string;
  gameDate: string;
  /** Proč to stojí za pohled. Prázdné = nic nápadného. */
  priznaky: string[];
  /** Výměna: hráč šel jako protihodnota, ne za peníze. */
  vymena?: boolean;
  /** Kdo šel opačným směrem. Obě strany výměny na sebe takhle ukazují. */
  protihrac?: string | null;
}

/**
 * Realizované přestupy soutěže s upozorněním na to, co stojí za prověření.
 *
 * Zdrojem jsou přijaté nabídky, ne transakce: transactions.reference_id je
 * u přestupů prázdné a jméno hráče se dá vyčíst jen z popisu, takže by se
 * protistrana nedala spolehlivě spárovat.
 *
 * Příznaky NEJSOU obvinění — jen zvýraznění. Rozhodnutí je na komisaři.
 * Strojová detekce domluvy nefunguje a falešné obvinění je horší než
 * přehlédnutý obchod.
 */
export async function listinaPrestupu(
  db: D1Database, leagueId: string, seasonNumber: number, limit = 60,
): Promise<ZaznamPrestupu[]> {
  const rows = await db.prepare(
    `SELECT o.id, o.offer_amount, o.counter_amount, o.offer_type, o.resolved_at,
            o.offered_player_id,
            p.first_name, p.last_name, p.id AS player_id, p.overall_rating, p.age,
            sp.first_name AS sw_first, sp.last_name AS sw_last,
            sp.overall_rating AS sw_rating, sp.age AS sw_age,
            sdp.first_name AS swd_first, sdp.last_name AS swd_last,
            sdp.overall_rating AS swd_rating, sdp.age AS swd_age,
            fromT.name AS z_klubu, fromT.user_id AS z_user, fromT.id AS z_id,
            toT.name AS do_klubu, toT.user_id AS do_user, toT.id AS do_id
       FROM transfer_offers o
       LEFT JOIN players p ON p.id = o.player_id
       LEFT JOIN players sp ON sp.id = o.offered_player_id
       LEFT JOIN departed_players sdp ON sdp.id = o.offered_player_id
       LEFT JOIN teams fromT ON fromT.id = o.from_team_id
       JOIN teams toT ON toT.id = o.to_team_id
      WHERE o.status = 'accepted'
        AND (toT.league_id = ? OR fromT.league_id = ?)
      ORDER BY o.resolved_at DESC LIMIT ?`
  ).bind(leagueId, leagueId, limit).all<Record<string, unknown>>()
    .catch((e) => { logger.error({ module: M }, `listina přestupů ${leagueId}`, e); return { results: [] }; });

  // Kolikrát spolu tytéž dva kluby obchodovaly
  const dvojice = new Map<string, number>();
  for (const r of rows.results) {
    if (!r.z_id) continue;
    const klic = [r.z_id as string, r.do_id as string].sort().join("|");
    dvojice.set(klic, (dvojice.get(klic) ?? 0) + 1);
  }

  const out: ZaznamPrestupu[] = [];

  for (const r of rows.results) {
    // Dohodnutá cena, ne původní nabídka. Když se smlouvalo, platí protinávrh.
    const castka = Math.abs((r.counter_amount as number) ?? (r.offer_amount as number) ?? 0);
    // Hodnota se v databázi nedrží, počítá se z ratingu a věku — stejnou
    // funkcí, jakou používá přestupový trh při posuzování nabídek.
    const hodnota = r.overall_rating
      ? estimateMarketValue(r.overall_rating as number, (r.age as number) ?? 26)
      : 0;

    // Výměna: druhý hráč šel opačným směrem jako protihodnota. Bez něj by
    // desetikorunový doplatek vypadal jako obchod za deset korun a komisař by
    // dostal falešné podezření z podhodnocené ceny.
    const swFirst = (r.sw_first ?? r.swd_first) as string | null;
    const swLast = (r.sw_last ?? r.swd_last) as string | null;
    const swRating = (r.sw_rating ?? r.swd_rating) as number | null;
    const swAge = (r.swd_age ?? r.sw_age) as number | null;
    const jeVymena = !!r.offered_player_id;
    const protihodnota = swRating ? estimateMarketValue(swRating, swAge ?? 26) : 0;
    const swJmeno = swFirst ? `${swFirst} ${swLast}` : jeVymena ? "hráč už v databázi není" : null;

    const priznaky: string[] = [];
    const zUser = r.z_user as string | null;
    const doUser = r.do_user as string | null;
    if (zUser && doUser && zUser !== "ai" && zUser === doUser) {
      priznaky.push("Oba kluby patří témuž majiteli");
    }
    const hostovani = r.offer_type === "loan";
    // U výměny se poměřuje celé plnění — hotovost plus hráč, který šel zpátky.
    const plneni = castka + protihodnota;
    if (hodnota > 0 && plneni > 0) {
      if (hostovani) {
        // U hostování se neporovnává cena hráče, ale poplatek za jeho půjčení.
        if (plneni > hodnota) priznaky.push("Poplatek za hostování je vyšší než hodnota hráče");
      } else {
        if (plneni > hodnota * 2.5) priznaky.push("Plnění výrazně nad odhadem hodnoty hráče");
        if (plneni < hodnota * 0.4) priznaky.push("Plnění výrazně pod odhadem hodnoty hráče");
      }
    }
    if (r.z_id) {
      const klic = [r.z_id as string, r.do_id as string].sort().join("|");
      if ((dvojice.get(klic) ?? 0) >= 3) priznaky.push("Tyhle dva kluby spolu obchodují opakovaně");
    }

    const zKlubu = (r.z_klubu as string) ?? null;
    const doKlubu = r.do_klubu as string;
    const gameDate = (r.resolved_at as string) ?? "";
    const druh = hostovani ? "hostování" : jeVymena ? "výměna" : "přestup";

    out.push({
      hrac: r.first_name ? `${r.first_name} ${r.last_name}` : "hráč už v databázi není",
      playerId: (r.player_id as string) ?? "",
      zKlubu, doKlubu, castka, druh, gameDate, priznaky,
      vymena: jeVymena, protihrac: swJmeno,
    });

    // Druhý hráč výměny je taky přestup a musí být v listině vidět. Jde opačným
    // směrem a peníze nenese — ty visí u prvního záznamu, ať se nesčítají dvakrát.
    if (jeVymena) {
      out.push({
        hrac: swJmeno ?? "hráč už v databázi není",
        playerId: (r.offered_player_id as string) ?? "",
        zKlubu: doKlubu, doKlubu: zKlubu ?? doKlubu,
        castka: 0, druh, gameDate, priznaky,
        vymena: true,
        protihrac: r.first_name ? `${r.first_name} ${r.last_name}` : null,
      });
    }
  }

  return out;
}

/** Smí komisař zablokovat sázení právě tomuhle klubu? */
export async function muzeZablokovat(
  db: D1Database, leagueId: string, komisarTeamId: string, cilTeamId: string, seasonNumber: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const opravneni = await actsFor(db, leagueId, komisarTeamId, "integrita", seasonNumber);
  if (!opravneni.ok) {
    return { ok: false, reason: opravneni.reason ?? "Tuhle pravomoc nemáš." };
  }
  if (cilTeamId === komisarTeamId) {
    return { ok: false, reason: "Vlastnímu klubu zákaz uložit nemůžeš." };
  }

  const pouzito = await db.prepare(
    `SELECT used_bet_ban FROM competition_officials
      WHERE league_id = ? AND role = 'integrita' AND season_number = ? AND status = 'active'`
  ).bind(leagueId, seasonNumber).first<{ used_bet_ban: number }>()
    .catch((e) => { logger.warn({ module: M }, "počítadlo zákazů", e); return null; });

  if ((pouzito?.used_bet_ban ?? 0) >= KOMISAR_BAN_LIMIT) {
    return { ok: false, reason: `Letos jsi tuhle pravomoc vyčerpal (${KOMISAR_BAN_LIMIT}×). Dál už jen přes zasedání.` };
  }

  // Vyhrocený vztah diskvalifikuje stejně jako u disciplinární rady — jinak by
  // se ze zákazu stala zbraň v osobním sporu.
  const heat = await db.prepare(
    `SELECT heat FROM manager_relations
      WHERE (team_a_id = ? AND team_b_id = ?) OR (team_a_id = ? AND team_b_id = ?)`
  ).bind(komisarTeamId, cilTeamId, cilTeamId, komisarTeamId).first<{ heat: number }>()
    .catch((e) => { logger.warn({ module: M }, "vztah komisaře k cíli", e); return null; });

  if ((heat?.heat ?? 0) >= 60) {
    return { ok: false, reason: "S tímhle trenérem máš vyhrocený vztah. Ať to posoudí zasedání." };
  }
  return { ok: true };
}
