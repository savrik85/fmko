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
  doKlubu: string | null;
  castka: number;
  gameDate: string;
  /** Proč to stojí za pohled. Prázdné = nic nápadného. */
  priznaky: string[];
}

/**
 * Realizované přestupy soutěže s upozorněním na to, co stojí za prověření.
 *
 * Příznaky NEJSOU obvinění — jen zvýraznění. Rozhodnutí je na komisaři,
 * stejně jako u sázek. Strojová detekce domluvy nefunguje a falešné
 * obvinění je horší než přehlédnutý obchod.
 */
export async function listinaPrestupu(
  db: D1Database, leagueId: string, seasonNumber: number, limit = 60,
): Promise<ZaznamPrestupu[]> {
  const rows = await db.prepare(
    `SELECT tr.id, tr.amount, tr.game_date, tr.description,
            tr.team_id AS kupujici,
            p.first_name, p.last_name, p.id AS player_id,
            p.overall_rating, p.age,
            kt.name AS kupujici_nazev, kt.user_id AS kupujici_user
       FROM transactions tr
       JOIN teams kt ON kt.id = tr.team_id
       LEFT JOIN players p ON p.id = tr.reference_id
      WHERE tr.type = 'transfer_fee' AND kt.league_id = ?
      ORDER BY tr.created_at DESC LIMIT ?`
  ).bind(leagueId, limit).all<Record<string, unknown>>()
    .catch((e) => { logger.error({ module: M }, `listina přestupů ${leagueId}`, e); return { results: [] }; });

  // Protistrana obchodu: prodávající dostal transfer_income se stejnou referencí.
  const refs = rows.results.map((r) => r.id as string);
  const prodavajici = new Map<string, { name: string; userId: string }>();
  if (refs.length > 0) {
    const p = await db.prepare(
      `SELECT tr.reference_id, t.name, t.user_id
         FROM transactions tr JOIN teams t ON t.id = tr.team_id
        WHERE tr.type = 'transfer_income' AND tr.reference_id IN (${refs.map(() => "?").join(",")})`
    ).bind(...refs).all<{ reference_id: string; name: string; user_id: string }>()
      .catch((e) => { logger.warn({ module: M }, "protistrany přestupů", e); return { results: [] }; });
    for (const r of p.results) prodavajici.set(r.reference_id, { name: r.name, userId: r.user_id });
  }

  // Kolikrát spolu tytéž dva kluby obchodovaly
  const dvojice = new Map<string, number>();
  for (const r of rows.results) {
    const prot = prodavajici.get(r.id as string);
    if (!prot) continue;
    const klic = [r.kupujici_nazev as string, prot.name].sort().join("|");
    dvojice.set(klic, (dvojice.get(klic) ?? 0) + 1);
  }

  return rows.results.map((r) => {
    const prot = prodavajici.get(r.id as string);
    const castka = Math.abs(r.amount as number);
    // Hodnota se v databázi nedrží, počítá se z ratingu a věku — stejnou
    // funkcí, jakou používá přestupový trh při posuzování nabídek.
    const hodnota = r.overall_rating
      ? estimateMarketValue(r.overall_rating as number, (r.age as number) ?? 26)
      : 0;
    const priznaky: string[] = [];

    if (prot && prot.userId !== "ai" && prot.userId === (r.kupujici_user as string)) {
      priznaky.push("Oba kluby patří témuž majiteli");
    }
    if (hodnota > 0) {
      if (castka > hodnota * 2.5) priznaky.push("Cena výrazně nad odhadem hodnoty hráče");
      if (castka < hodnota * 0.4) priznaky.push("Cena výrazně pod odhadem hodnoty hráče");
    }
    if (prot) {
      const klic = [r.kupujici_nazev as string, prot.name].sort().join("|");
      if ((dvojice.get(klic) ?? 0) >= 3) priznaky.push("Tyhle dva kluby spolu obchodují opakovaně");
    }

    return {
      hrac: r.first_name ? `${r.first_name} ${r.last_name}` : "neznámý hráč",
      playerId: (r.player_id as string) ?? "",
      zKlubu: prot?.name ?? null,
      doKlubu: r.kupujici_nazev as string,
      castka,
      gameDate: r.game_date as string,
      priznaky,
    };
  });
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
