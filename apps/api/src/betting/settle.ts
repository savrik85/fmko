/**
 * Vypořádání sázek po odehraném kole.
 *
 * Volá se z konce runScheduledMatches (multiplayer/match-runner.ts), tedy až
 * když jsou VŠECHNY zápasy kola odsimulované. Dřív to nejde: kombinovaný tiket
 * může mít tipy ze všech zápasů kola, takže vyhodnocení po jednotlivých zápasech
 * (jako resolveBets u sázky o bečku) by na akumulátor nestačilo.
 */

import { logger } from "../lib/logger";
import { recordTransaction } from "../season/finance-processor";
import { gradeSelection, gradeTicket, type Appearances, type SelectionResult } from "./grade";
import { capPayout } from "./odds-model";
import { resolveRules } from "../competition/rules";

const M = "betting-settle";

/** Od jaké výhry se o tiketu píše ve Zpravodaji. */
const NEWS_THRESHOLD = 10_000;

interface TicketRow {
  id: string; team_id: string; league_id: string; season_number: number;
  stake: number; total_odds_x100: number;
}

interface LegRow {
  id: string; ticket_id: string; match_id: string;
  market: string; selection: string; odds_x100: number; label: string;
}

export interface SettleSummary {
  tickets: number;
  paidOut: number;
}

/**
 * Vypořádá všechny otevřené tikety daného kola.
 *
 * Je bezpečné volat opakovaně — zámkem je atomický UPDATE stavu tiketu.
 * Idempotence NEMŮŽE stát na reference_id v transakcích: ten sloupec nemá
 * unikátní index (migrations/0034_transactions.sql), takže recordTransaction
 * duplicitní zápis nezachytí.
 */
export async function settleRound(db: D1Database, calendarId: string): Promise<SettleSummary> {
  // Kolo musí být dohrané celé. Když ne, nedělá se nic a doběhne to po
  // recoverStuckRounds — díky zámku níž bez rizika dvojí výplaty.
  const zbyva = await db.prepare(
    "SELECT COUNT(*) AS n FROM matches WHERE calendar_id = ? AND status <> 'simulated'"
  ).bind(calendarId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `kontrola dohranosti kola ${calendarId}`, e); return null; });

  if (!zbyva || zbyva.n > 0) return { tickets: 0, paidOut: 0 };

  const tikety = await db.prepare(
    `SELECT id, team_id, league_id, season_number, stake, total_odds_x100
       FROM bet_tickets WHERE calendar_id = ? AND status = 'open'`
  ).bind(calendarId).all<TicketRow>()
    .catch((e) => { logger.error({ module: M }, `otevřené tikety kola ${calendarId}`, e); return { results: [] }; });

  if (tikety.results.length === 0) return { tickets: 0, paidOut: 0 };

  // Výsledky a sestavy celého kola načteme dvěma dotazy, ne po tiketech.
  const [vysledky, nastupy] = await Promise.all([
    loadResults(db, calendarId),
    loadAppearances(db, calendarId),
  ]);

  const legs = await db.prepare(
    `SELECT s.id, s.ticket_id, s.match_id, s.market, s.selection, s.odds_x100, s.label
       FROM bet_selections s
       JOIN bet_tickets t ON t.id = s.ticket_id
      WHERE t.calendar_id = ? AND t.status = 'open'`
  ).bind(calendarId).all<LegRow>()
    .catch((e) => { logger.error({ module: M }, `tipy kola ${calendarId}`, e); return { results: [] }; });

  const podleTiketu = new Map<string, LegRow[]>();
  for (const l of legs.results) {
    const arr = podleTiketu.get(l.ticket_id) ?? [];
    arr.push(l);
    podleTiketu.set(l.ticket_id, arr);
  }

  const gameDate = await gameDateOf(db, calendarId);
  let vyplaceno = 0;
  let vyporadano = 0;

  for (const t of tikety.results) {
    const moje = podleTiketu.get(t.id) ?? [];
    const ohodnocene = moje.map((l) => {
      const v = vysledky.get(l.match_id);
      const result: SelectionResult = v
        ? gradeSelection(l.market, l.selection, v, nastupy.get(l.match_id) ?? new Map())
        : "void";
      return { ...l, result };
    });

    const limity = await resolveRules(db, t.league_id, t.season_number);
    const vysledek = gradeTicket(ohodnocene.map((l) => ({ result: l.result, oddsX100: l.odds_x100 })));

    const payout = vysledek.status === "won"
      ? capPayout(t.stake, vysledek.effectiveOddsX100, limity.bet_max_payout).payout
      : vysledek.status === "void" ? t.stake : 0;

    // ZÁMEK. changes === 0 znamená, že tiket vypořádal jiný běh.
    const gate = await db.prepare(
      `UPDATE bet_tickets
          SET status = ?, payout = ?, settled_game_date = ?,
              settled_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
        WHERE id = ? AND status = 'open'`
    ).bind(vysledek.status, payout, gameDate, t.id).run()
      .catch((e) => { logger.error({ module: M }, `zámek tiketu ${t.id}`, e); return null; });

    if (!gate || (gate.meta?.changes ?? 0) === 0) continue;

    await db.batch(ohodnocene.map((l) =>
      db.prepare("UPDATE bet_selections SET result = ? WHERE id = ?").bind(l.result, l.id)
    )).catch((e) => logger.error({ module: M }, `zápis výsledků tipů tiketu ${t.id}`, e));

    // Prohraný tiket neúčtuje nic — vklad odešel při podání.
    if (payout > 0) {
      const typ = vysledek.status === "won" ? "bet_win" : "bet_refund";
      const popis = vysledek.status === "won"
        ? `Výhra u sázkové kanceláře (${(vysledek.effectiveOddsX100 / 100).toFixed(2).replace(".", ",")}×)`
        : "Vrácený vklad — tiket anulován";
      await recordTransaction(db, t.team_id, typ, payout, popis, gameDate, `bet-payout-${t.id}`);
      vyplaceno += payout;
    }

    await oznam(db, t, ohodnocene, vysledek.status, payout, vysledek.effectiveOddsX100)
      .catch((e) => logger.warn({ module: M }, `oznámení k tiketu ${t.id}`, e));

    vyporadano++;
  }

  return { tickets: vyporadano, paidOut: vyplaceno };
}

async function loadResults(
  db: D1Database, calendarId: string,
): Promise<Map<string, { homeScore: number; awayScore: number }>> {
  const rows = await db.prepare(
    `SELECT id, home_score, away_score FROM matches
      WHERE calendar_id = ? AND status = 'simulated' AND home_score IS NOT NULL`
  ).bind(calendarId).all<{ id: string; home_score: number; away_score: number }>()
    .catch((e) => { logger.error({ module: M }, `výsledky kola ${calendarId}`, e); return { results: [] }; });

  const out = new Map<string, { homeScore: number; awayScore: number }>();
  for (const r of rows.results) out.set(r.id, { homeScore: r.home_score, awayScore: r.away_score });
  return out;
}

/**
 * Kdo v kole nastoupil a kolik dal gólů.
 *
 * Chybějící hráč znamená, že vůbec nehrál — match_player_stats má i střídající
 * a i hráče s nulou (naměřeno 22,9 řádku na zápas), takže je ten test spolehlivý.
 */
async function loadAppearances(db: D1Database, calendarId: string): Promise<Map<string, Appearances>> {
  const rows = await db.prepare(
    `SELECT mps.match_id, mps.player_id, mps.goals
       FROM match_player_stats mps
       JOIN matches m ON m.id = mps.match_id
      WHERE m.calendar_id = ?`
  ).bind(calendarId).all<{ match_id: string; player_id: string; goals: number }>()
    .catch((e) => { logger.error({ module: M }, `sestavy kola ${calendarId}`, e); return { results: [] }; });

  const out = new Map<string, Appearances>();
  for (const r of rows.results) {
    const m = out.get(r.match_id) ?? new Map<string, number>();
    m.set(r.player_id, r.goals);
    out.set(r.match_id, m);
  }
  return out;
}

async function gameDateOf(db: D1Database, calendarId: string): Promise<string> {
  const row = await db.prepare(
    `SELECT COALESCE(MAX(t.game_date), strftime('%Y-%m-%dT%H:%M:%SZ','now')) AS gd
       FROM teams t JOIN matches m ON m.home_team_id = t.id WHERE m.calendar_id = ?`
  ).bind(calendarId).first<{ gd: string }>()
    .catch((e) => { logger.warn({ module: M }, "herní datum kola", e); return null; });
  return row?.gd ?? new Date().toISOString();
}

/**
 * Zpráva hráči.
 *
 * Posílá se SMS I notifikace: frontend na tabulku notifications vůbec nesahá
 * (je to zdroj pro push), takže samotná notifikace by zapadla.
 *
 * Tón je hospodský — krátké věty, žádné vykřičníky, žádné „Gratulujeme".
 */
/** Slovní číslovky do druhého pádu: „ze tří", ne „z 3". */
const ZE: Record<number, string> = {
  1: "z jednoho", 2: "ze dvou", 3: "ze tří", 4: "ze čtyř", 5: "z pěti", 6: "ze šesti",
};

/**
 * Kolik tipů sedlo, česky.
 *
 * Sázková kancelář v hospodě nepíše „Sedlo 1 z 3" — a hráč to čte jako zprávu,
 * ne jako výpis z databáze.
 */
function kolikSedlo(sedlo: number, celkem: number): string {
  const z = ZE[celkem] ?? `z ${celkem}`;
  if (sedlo === 0) return `Nesedl ani jeden ${z}`;
  if (sedlo === 1) return `Sedl jeden ${z}`;
  if (sedlo <= 4) return `Sedly ${sedlo} ${z}`;
  return `Sedlo ${sedlo} ${z}`;
}

async function oznam(
  db: D1Database, t: TicketRow,
  legs: Array<{ label: string; result: SelectionResult }>,
  status: "won" | "lost" | "void", payout: number, oddsX100: number,
): Promise<void> {
  const { sendSystemSMS } = await import("../messaging/system-sms");
  const { createNotification } = await import("../community/notifications");
  const kc = (n: number) => `${n.toLocaleString("cs")} Kč`;
  /** Kurz s desetinnou čárkou — tečka do české zprávy nepatří. */
  const ku = (x100: number) => (x100 / 100).toFixed(2).replace(".", ",");
  const cislo = t.id.slice(0, 4).toUpperCase();

  let sms: string;
  let titulek: string;

  if (status === "won") {
    const anulovane = legs.filter((l) => l.result === "void").length;
    titulek = "🎫 Vyhraný tiket";
    sms = legs.length === 1
      ? `Tiket č. ${cislo} je vyhraný. Vklad ${kc(t.stake)}, kurz ${ku(oddsX100)}, výplata ${kc(payout)}. Peníze máš na klubovém účtu.`
      : `Tiket č. ${cislo} — všech ${legs.length} tipů sedlo. Kurz ${ku(oddsX100)}, výplata ${kc(payout)}.`;
    if (anulovane > 0) {
      sms += ` ${anulovane === 1 ? "Jeden tip se anuloval" : `${anulovane} tipy se anulovaly`} — hráč nenastoupil, kurz o něj klesl.`;
    }
  } else if (status === "void") {
    titulek = "🎫 Tiket anulován";
    sms = `Tiket č. ${cislo} rušíme — nikdo ze sázených hráčů nenastoupil. Vklad ${kc(t.stake)} je zpátky na účtu.`;
  } else {
    const sedlo = legs.filter((l) => l.result === "won").length;
    const anulovane = legs.filter((l) => l.result === "void").length;
    const hralo = legs.length - anulovane;
    titulek = "🎫 Tiket neprošel";

    if (legs.length === 1) {
      sms = `Tiket č. ${cislo} nevyšel. Vklad ${kc(t.stake)} propadá.`;
    } else if (sedlo === hralo - 1 && anulovane === 0) {
      // Nejbolestivější případ si zaslouží vlastní větu.
      sms = `Tiket č. ${cislo} neprošel. ${kolikSedlo(sedlo, hralo)}, poslední ne. Vklad ${kc(t.stake)} propadá.`;
    } else {
      sms = `Tiket č. ${cislo} je pryč. ${kolikSedlo(sedlo, hralo)}, vklad ${kc(t.stake)} propadá.`;
    }

    // Anulovaný tip musí být vidět i u prohry — jinak hráč počítá tipy na tiketu
    // a nesedí mu to s tím, co mu kancelář napsala.
    if (anulovane > 0) {
      sms += anulovane === 1
        ? " Jeden tip se anuloval, hráč vůbec nenastoupil."
        : ` ${anulovane} tipy se anulovaly, hráči vůbec nenastoupili.`;
    }
  }

  await sendSystemSMS(db, t.team_id, "Sázková kancelář", sms)
    .catch((e) => logger.warn({ module: M }, "SMS o tiketu", e));

  await createNotification(db, t.team_id, "event", titulek, sms, "/dashboard/sazky")
    .catch((e) => logger.warn({ module: M }, "notifikace o tiketu", e));

  if (status === "won" && payout >= NEWS_THRESHOLD) {
    await doNovin(db, t, payout, oddsX100)
      .catch((e) => logger.warn({ module: M }, "článek o výhře", e));
  }
}

/** Velká výhra patří do Zpravodaje — je to lore, ne jen účetní položka. */
async function doNovin(db: D1Database, t: TicketRow, payout: number, oddsX100: number): Promise<void> {
  const tym = await db.prepare("SELECT name FROM teams WHERE id = ?")
    .bind(t.team_id).first<{ name: string }>();
  if (!tym) return;

  const kc = (n: number) => `${n.toLocaleString("cs")} Kč`;
  await db.prepare(
    `INSERT INTO news (id, league_id, team_id, type, headline, body, created_at)
     VALUES (?,?,?,'betting',?,?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`
  ).bind(
    crypto.randomUUID(), t.league_id, t.team_id,
    `${tym.name} trefil u kanceláře ${kc(payout)}`,
    `Tiket za ${kc(t.stake)} při kurzu ${(oddsX100 / 100).toFixed(2).replace(".", ",")}. `
    + `Sázková kancelář vyplácí ${kc(payout)}. V hospodě se o tom bude mluvit do jara.`,
  ).run();
}
