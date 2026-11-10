/**
 * Vypořádání sázek po odehraném kole.
 *
 * Volá se z konce runScheduledMatches (multiplayer/match-runner.ts) a jako záchranná
 * síť z denního ticku (settleOpenRounds). Tiket se vypořádá, jakmile jsou rozhodnuté
 * všechny jeho zápasy; kombinovaný tiket tedy čeká na svůj poslední zápas, ne na celé kolo.
 */

import { logger } from "../lib/logger";
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

/** Po kolika hodinách od termínu kola se neodehraný zápas na tiketu anuluje. */
export const VOID_AFTER_HOURS = 48;

/** Stavy zápasu, které znamenají, že se hrát nebude. */
const CANCELLED_MATCH_STATUSES = new Set(["cancelled", "void"]);

export interface MatchForSettlement {
  status: string;
  home_score: number | null;
  away_score: number | null;
}

/**
 * Co se dá říct o tipu na tenhle zápas. Čistá funkce.
 *
 *  - 'played': zápas má výsledek, tip se vyhodnotí.
 *  - 'void': zápas byl zrušen, zmizel, nebo se neodehrál do VOID_AFTER_HOURS
 *    po termínu kola. Tip se počítá kurzem 1,00.
 *  - 'waiting': zápas se ještě může odehrát, tiket počká.
 */
export function legState(
  match: MatchForSettlement | undefined, deadlinePassed: boolean,
): "played" | "void" | "waiting" {
  if (!match) return "void";
  if (CANCELLED_MATCH_STATUSES.has(match.status)) return "void";
  if (match.status === "simulated") {
    // Odsimulovaný zápas bez skóre už výsledek mít nebude.
    return match.home_score !== null && match.away_score !== null ? "played" : "void";
  }
  return deadlinePassed ? "void" : "waiting";
}

/**
 * Vypořádá otevřené tikety daného kola, které už vypořádat jdou.
 *
 * Tiket se vypořádá, jakmile jsou rozhodnuté všechny JEHO zápasy, ne celé kolo.
 * Dřív se čekalo na všechny zápasy kola: když kolo spadlo a jeden zápas zůstal
 * neodehraný, visely navždy i tikety, které na něj vůbec nesázely.
 *
 * Je bezpečné volat opakovaně. Výplata, zápis do transakcí, výsledky tipů a změna
 * stavu tiketu jdou jednou transakcí (db.batch) a každý příkaz je podmíněný tím,
 * že tiket je pořád 'open'. Dva souběžné běhy tak nevyplatí dvakrát a pád uprostřed
 * nenechá tiket označený jako vyhraný bez peněz. Idempotence NEMŮŽE stát na
 * reference_id v transakcích: ten sloupec nemá unikátní index
 * (migrations/0034_transactions.sql).
 */
export async function settleRound(
  db: D1Database, calendarId: string,
  /** Herní čas v ms. Výchozí je herní datum klubů kola; zadává se jen v testech. */
  gameNow?: number,
): Promise<SettleSummary> {
  const roundRow = await db.prepare("SELECT scheduled_at FROM season_calendar WHERE id = ?")
    .bind(calendarId).first<{ scheduled_at: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `termín kola ${calendarId}`, e); return null; });
  const scheduledAt = roundRow?.scheduled_at ? new Date(roundRow.scheduled_at).getTime() : NaN;
  // Lhůta běží v herním čase, stejně jako termín kola: herní datum není reálné
  // (game_clock.offset_days) a na testovacím prostředí se liší o týdny.
  const gameDate = await gameDateOf(db, calendarId);
  const now = gameNow ?? new Date(gameDate).getTime();
  // Bez termínu se neanuluje nic: radši nechat tiket čekat než vrátit vklad za zápas, který se odehraje.
  const deadlinePassed = Number.isFinite(scheduledAt) && Number.isFinite(now)
    && now - scheduledAt >= VOID_AFTER_HOURS * 3_600_000;

  const matchRows = await db.prepare(
    "SELECT id, status, home_score, away_score FROM matches WHERE calendar_id = ?"
  ).bind(calendarId).all<MatchForSettlement & { id: string }>()
    .catch((e) => { logger.warn({ module: M }, `zápasy kola ${calendarId}`, e); return null; });
  if (!matchRows) return { tickets: 0, paidOut: 0 };
  const matchById = new Map(matchRows.results.map((z) => [z.id, z]));

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

  let vyplaceno = 0;
  let vyporadano = 0;

  for (const t of tikety.results) {
    const moje = podleTiketu.get(t.id) ?? [];
    const states = moje.map((l) => {
      const state = legState(matchById.get(l.match_id), deadlinePassed);
      // Střelec se hodnotí podle sestav. Zápas se skóre, ale ještě bez statistik hráčů
      // (jiný běh ho právě dopisuje) by každého střelce anuloval jako „nenastoupil".
      if (state === "played" && l.market === "scorer" && !nastupy.has(l.match_id) && !deadlinePassed) return "waiting";
      return state;
    });
    // Aspoň jeden zápas tiketu se ještě může odehrát: tiket počká na další běh.
    if (states.includes("waiting")) continue;

    const graded = moje.map((l, i) => {
      const v = vysledky.get(l.match_id);
      const notPlayed = states[i] === "void" || !v;
      const result: SelectionResult = notPlayed
        ? "void"
        : gradeSelection(l.market, l.selection, v, nastupy.get(l.match_id) ?? new Map());
      return { ...l, result, notPlayed };
    });

    const limity = await resolveRules(db, t.league_id, t.season_number);
    const vysledek = gradeTicket(graded.map((l) => ({ result: l.result, oddsX100: l.odds_x100 })));

    const payout = vysledek.status === "won"
      ? capPayout(t.stake, vysledek.effectiveOddsX100, limity.bet_max_payout).payout
      : vysledek.status === "void" ? t.stake : 0;

    // Všechno podmíněné tím, že tiket je pořád 'open'; zámek (změna stavu) jde poslední.
    const stillOpen = "EXISTS (SELECT 1 FROM bet_tickets WHERE id = ? AND status = 'open')";
    const statements: D1PreparedStatement[] = [];
    // Prohraný tiket neúčtuje nic, vklad odešel při podání.
    if (payout > 0) {
      const typ = vysledek.status === "won" ? "bet_win" : "bet_refund";
      const popis = vysledek.status === "won"
        ? `Výhra u sázkové kanceláře (${(vysledek.effectiveOddsX100 / 100).toFixed(2).replace(".", ",")}×)`
        : "Vrácený vklad, tiket anulován";
      statements.push(
        db.prepare(`UPDATE teams SET budget = budget + ? WHERE id = ? AND ${stillOpen}`)
          .bind(payout, t.team_id, t.id),
        db.prepare(
          `INSERT INTO transactions (id, team_id, type, amount, balance_after, description, reference_id, game_date)
           SELECT ?, ?, ?, ?, (SELECT budget FROM teams WHERE id = ?), ?, ?, ?
            WHERE ${stillOpen}`
        ).bind(crypto.randomUUID(), t.team_id, typ, payout, t.team_id, popis, `bet-payout-${t.id}`, gameDate, t.id),
      );
    }
    for (const l of graded) {
      statements.push(db.prepare(`UPDATE bet_selections SET result = ? WHERE id = ? AND ${stillOpen}`).bind(l.result, l.id, t.id));
    }
    statements.push(db.prepare(
      `UPDATE bet_tickets
          SET status = ?, payout = ?, settled_game_date = ?,
              settled_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
        WHERE id = ? AND status = 'open'`
    ).bind(vysledek.status, payout, gameDate, t.id));

    const results = await db.batch(statements)
      .catch((e) => { logger.error({ module: M }, `vypořádání tiketu ${t.id}`, e); return null; });
    // changes === 0 u zámku znamená, že tiket vypořádal jiný běh a tenhle nic nezapsal.
    if (!results || (results[results.length - 1]?.meta?.changes ?? 0) === 0) continue;
    vyplaceno += payout;

    await oznam(db, t, graded, vysledek.status, payout, vysledek.effectiveOddsX100)
      .catch((e) => logger.warn({ module: M }, `oznámení k tiketu ${t.id}`, e));

    vyporadano++;
  }

  return { tickets: vyporadano, paidOut: vyplaceno };
}

/**
 * Záchranná síť: projde všechna kola, jejichž termín už byl a visí na nich otevřený tiket.
 *
 * Hlavní cesta je konec runScheduledMatches. Sem spadne tiket z kola, které dohrál
 * ruční endpoint nebo recovery, a tiket se zápasem, který se neodehrál vůbec: ten se
 * anuluje, až uplyne VOID_AFTER_HOURS. Dřív se zametala jen kola ve stavu 'simulated',
 * takže kolo zaseklé po pádu drželo tikety napořád.
 */
export async function settleOpenRounds(
  db: D1Database,
  /** Herní čas v ms, jen pro testy. Jinak herní datum klubů soutěže. */
  gameNow?: number,
): Promise<SettleSummary & { rounds: number }> {
  const rounds = await db.prepare(
    `SELECT DISTINCT t.calendar_id FROM bet_tickets t
       JOIN season_calendar sc ON sc.id = t.calendar_id
      WHERE t.status = 'open'
        AND (sc.status = 'simulated'
             OR sc.scheduled_at <= COALESCE(?, (SELECT MAX(tm.game_date) FROM teams tm WHERE tm.league_id = sc.league_id)))`
  ).bind(gameNow === undefined ? null : new Date(gameNow).toISOString()).all<{ calendar_id: string }>()
    .catch((e) => { logger.error({ module: M }, "kola k dovypořádání", e); return { results: [] }; });

  let tickets = 0, paidOut = 0;
  for (const r of rounds.results) {
    const out = await settleRound(db, r.calendar_id, gameNow);
    tickets += out.tickets;
    paidOut += out.paidOut;
  }
  return { rounds: rounds.results.length, tickets, paidOut };
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
  legs: Array<{ label: string; result: SelectionResult; notPlayed?: boolean }>,
  status: "won" | "lost" | "void", payout: number, oddsX100: number,
): Promise<void> {
  // Tip se anuluje ze dvou důvodů: sázený hráč nenastoupil, nebo se zápas vůbec neodehrál.
  const unplayed = legs.some((l) => l.notPlayed);
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
      : `Tiket č. ${cislo}, všech ${legs.length} tipů sedlo. Kurz ${ku(oddsX100)}, výplata ${kc(payout)}.`;
    if (anulovane > 0) {
      sms += ` ${anulovane === 1 ? "Jeden tip se anuloval" : `${anulovane} tipy se anulovaly`}, ${unplayed ? "zápas se neodehrál" : "hráč nenastoupil"} a kurz o něj klesl.`;
    }
  } else if (status === "void") {
    titulek = "🎫 Tiket anulován";
    sms = `Tiket č. ${cislo} rušíme, ${unplayed ? "zápas se neodehrál" : "nikdo ze sázených hráčů nenastoupil"}. Vklad ${kc(t.stake)} je zpátky na účtu.`;
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
        ? ` Jeden tip se anuloval, ${unplayed ? "zápas se neodehrál" : "hráč vůbec nenastoupil"}.`
        : ` ${anulovane} tipy se anulovaly, ${unplayed ? "zápasy se neodehrály" : "hráči vůbec nenastoupili"}.`;
    }
  }

  await sendSystemSMS(db, t.team_id, "Sázková kancelář", sms)
    .catch((e) => logger.warn({ module: M }, "SMS o tiketu", e));

  await createNotification(db, t.team_id, "event", titulek, sms, "/sazky")
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
