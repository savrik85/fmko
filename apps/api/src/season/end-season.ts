/**
 * Orchestrátor konce sezóny — GLOBÁLNÍ, chunkovaný, idempotentní.
 *
 * Sezóna je GLOBÁLNÍ: jeden trigger zakončí celý ročník napříč VŠEMI senior
 * ligami a založí JEDEN nový globální ročník se synchronizovaným kalendářem.
 * Volá se OPAKOVANĚ (admin tlačítko / curl loop) dokud allDone=true.
 *
 * Pořadí per-liga wrap fází (awards+archive PŘED odchody — retired se mažou
 * z players): finalize → rewards → awards → archive → departures → replenish
 * → village → articles → interviews. Pak JEDEN globální rollover, taky po krocích
 * (season-rollover.ts, ROLLOVER_PHASES). Rozběhnutý rollover má při dalším volání
 * přednost před vším ostatním, i když už je aktivní nová sezóna.
 *
 * Gate: zakončí se, až jsou dohrané LIDSKÉ senior ligy (AI-only ligy, které
 * match-tick nezpracovává, neblokují). `force` přebije. Wrap běží jen pro ligy,
 * co aspoň 1 zápas odehrály; rollnou se ale VŠECHNY senior ligy (kvůli poháru).
 */

import { calculateStandings } from "../stats/standings";
import { applySeasonRewards } from "./season-rewards";
import { generateSeasonAwards } from "./season-awards";
import { archiveLeagueSeason } from "./season-archive";
import { processTeamDepartures, refreshFreeAgents } from "./season-departures";
import { captureDepartures, buildTeamRecap } from "./season-recap";
import { applyVillageSeasonReaction } from "./season-village";
import { generateSeasonWrapArticle } from "../news/season-wrap";
import { createSeasonWrapInterviews } from "../news/season-interview";
import { beginRollover, findPendingRollover, runRolloverStep } from "./season-rollover";
import { ROLLOVER_KEY } from "./season-progress";
import { createRng, cryptoSeed } from "../generators/rng";
import { logger } from "../lib/logger";

const WRAP_PHASES = [
  "finalize", "rewards", "awards", "archive", "departures",
  // Akademie až PO odchodech: odchovanec má nahradit toho, kdo skončil, ne se do kádru
  // přidat vedle něj.
  "academy",
  "replenish", "village", "articles", "interviews", "recap",
] as const;
type WrapPhase = (typeof WRAP_PHASES)[number];

// U21 je plnohodnotná soutěž (od 2026-10-22): dostane ocenění a archiv sezóny. Peníze,
// odchody, akademie, obec ani články se jí netýkají, ty řeší liga áčka.
const U21_WRAP_PHASES = ["awards", "archive"] as const satisfies readonly WrapPhase[];

const DEPARTURES_CHUNK = 3;

export interface EndSeasonStepResult {
  allDone: boolean;
  ready?: boolean;
  seasonNumber?: number;
  leagueId?: string;
  phase?: string;
  status?: "done" | "in_progress" | "error";
  remainingLeagues: number;
  detail?: string;
}

interface LeagueState {
  leagueId: string;
  total: number;
  pending: number;
  humans: number;
  started: boolean;
  complete: boolean;
}

async function getGlobalSeason(db: D1Database): Promise<number | null> {
  const row = await db.prepare("SELECT MAX(number) AS n FROM seasons WHERE status = 'active'")
    .first<{ n: number | null }>()
    .catch((e) => { logger.warn({ module: "end-season" }, "global season", e); return null; });
  if (row?.n != null) return row.n;
  // fallback: nejvyšší season_number senior kalendářů
  const fb = await db.prepare("SELECT MAX(sc.season_number) AS n FROM season_calendar sc JOIN leagues l ON l.id = sc.league_id WHERE l.league_type = 'senior'")
    .first<{ n: number | null }>()
    .catch((e) => { logger.warn({ module: "end-season" }, "global season fallback", e); return null; });
  return fb?.n ?? null;
}

async function getLeagueStates(db: D1Database, seasonNumber: number, leagueType: "senior" | "u21" = "senior"): Promise<LeagueState[]> {
  const res = await db.prepare(
    `SELECT l.id AS league_id,
            (SELECT COUNT(*) FROM season_calendar sc WHERE sc.league_id = l.id AND sc.season_number = ? AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id)) AS total,
            (SELECT COUNT(*) FROM season_calendar sc WHERE sc.league_id = l.id AND sc.season_number = ? AND sc.status != 'simulated' AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id)) AS pending,
            (SELECT COUNT(*) FROM teams t WHERE t.league_id = l.id AND t.user_id != 'ai') AS humans
     FROM leagues l WHERE l.league_type = ?`,
  ).bind(seasonNumber, seasonNumber, leagueType).all<{ league_id: string; total: number; pending: number; humans: number }>()
    .catch((e) => { logger.warn({ module: "end-season" }, `${leagueType} states`, e); return { results: [] as { league_id: string; total: number; pending: number; humans: number }[] }; });

  return res.results.map((r) => ({
    leagueId: r.league_id,
    total: r.total,
    pending: r.pending,
    humans: r.humans,
    started: r.total > 0 && r.pending < r.total,
    complete: r.total > 0 && r.pending === 0,
  }));
}

async function getProgress(db: D1Database, leagueId: string, seasonNumber: number, phase: string) {
  return db.prepare("SELECT status, cursor FROM season_end_progress WHERE league_id = ? AND season_number = ? AND phase = ?")
    .bind(leagueId, seasonNumber, phase).first<{ status: string; cursor: string | null }>()
    .catch((e) => { logger.warn({ module: "end-season" }, "get progress", e); return null; });
}

async function setProgress(db: D1Database, leagueId: string, seasonNumber: number, phase: string, status: string, cursor?: string | null): Promise<void> {
  await db.prepare(
    `INSERT INTO season_end_progress (league_id, season_number, phase, status, cursor, updated_at)
     VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     ON CONFLICT(league_id, season_number, phase)
     DO UPDATE SET status = excluded.status, cursor = excluded.cursor, updated_at = excluded.updated_at`,
  ).bind(leagueId, seasonNumber, phase, status, cursor ?? null).run()
    .catch((e) => logger.warn({ module: "end-season" }, "set progress", e));
}

async function getGameDate(db: D1Database, leagueId: string): Promise<string> {
  const row = await db.prepare("SELECT game_date FROM teams WHERE league_id = ? AND game_date IS NOT NULL ORDER BY game_date DESC LIMIT 1")
    .bind(leagueId).first<{ game_date: string }>()
    .catch((e) => { logger.warn({ module: "end-season" }, "game date", e); return null; });
  return row?.game_date ?? new Date().toISOString();
}

/** Spustí jednu jednotku práce globálního konce sezóny. */
export async function runEndSeasonStep(
  db: D1Database,
  geminiApiKey: string | undefined,
  opts: { force?: boolean } = {},
): Promise<EndSeasonStepResult> {
  // 0. Rozběhnutý rollover dokončit dřív, než se cokoli posoudí. Nová sezóna je v tu chvíli
  //    už aktivní a nic se v ní nehrálo, takže by ji kontrola níž odbyla „sezóna zatím
  //    nezačala" a rollover by zůstal napůl.
  let pendingRollover: number | null;
  try {
    pendingRollover = await findPendingRollover(db);
  } catch (e) {
    logger.error({ module: "end-season" }, "stav rolloveru nejde načíst", e);
    return { allDone: false, ready: true, phase: "rollover", status: "error", remainingLeagues: 0, detail: "stav rolloveru nejde načíst" };
  }
  if (pendingRollover != null) return stepRollover(db, pendingRollover);

  const seasonNumber = await getGlobalSeason(db);
  if (seasonNumber == null) return { allDone: true, ready: false, remainingLeagues: 0, detail: "žádná aktivní sezóna" };

  const states = await getLeagueStates(db, seasonNumber);
  const started = states.filter((s) => s.started);

  // Žádná odehraná liga → není co zakončit (a guard proti smyčce: čerstvě rollnutá sezóna)
  if (started.length === 0) {
    return { allDone: true, ready: false, seasonNumber, remainingLeagues: 0, detail: "sezóna zatím nezačala, žádná odehraná liga" };
  }

  // Gate: rozehraný Turnaj P-Mobile. Platí i s force — rollover by uprostřed turnaje
  // měnil kádry (stárnutí, odchody) a zrušil by stopky i rozpis. Konec sezóny až po finále.
  const runningTournament = await db.prepare(
    "SELECT name FROM tournaments WHERE status IN ('drawing', 'drawn', 'running') LIMIT 1"
  ).first<{ name: string }>();
  if (runningTournament) {
    return { allDone: true, ready: false, seasonNumber, remainingLeagues: 0, detail: `${runningTournament.name} ještě běží, sezónu jde zakončit až po finále` };
  }

  // Gate: neodehraný pohár téhle sezóny. Taky i s force: po rolloveru berou maybeAdvanceCup
  // i admin advance jen pohár aktivní sezóny, takže by starý zůstal navždy rozehraný, bez
  // finále a bez výplat. Finále padá na sobotu po posledním kole ligy (cupRoundDates).
  let runningCup: { detail: string } | null;
  try {
    runningCup = await runningCupGate(db, seasonNumber);
  } catch (e) {
    logger.error({ module: "end-season" }, "stav poháru nejde načíst", e);
    return { allDone: false, ready: false, seasonNumber, status: "error", remainingLeagues: 0, detail: "stav poháru nejde načíst, konec sezóny čeká" };
  }
  if (runningCup) return { allDone: true, ready: false, seasonNumber, remainingLeagues: 0, detail: runningCup.detail };

  const u21Started = (await getLeagueStates(db, seasonNumber, "u21")).filter((s) => s.started);

  // Gate: lidské odehrané ligy musí být dohrané (AI-only neblokují), i U21. force přebije.
  if (!opts.force) {
    const blocking = [...started, ...u21Started].filter((s) => s.humans > 0 && !s.complete);
    if (blocking.length > 0) {
      return { allDone: true, ready: false, seasonNumber, remainingLeagues: blocking.length, detail: `sezóna ještě běží ${blocking.length} lidských lig nedohraných (force=1 přebije)` };
    }
  }

  // 1. Per-liga wrap pro odehrané ligy
  for (const st of started) {
    let firstPending: WrapPhase | null = null;
    for (const phase of WRAP_PHASES) {
      const prog = await getProgress(db, st.leagueId, seasonNumber, phase);
      if (prog?.status !== "done") { firstPending = phase; break; }
    }
    if (firstPending) {
      const status = await runWrapPhase(db, geminiApiKey, st.leagueId, seasonNumber, firstPending);
      return { allDone: false, ready: true, seasonNumber, leagueId: st.leagueId, phase: firstPending, status, remainingLeagues: started.length, detail: `${firstPending} → ${status}` };
    }
  }

  // 1b. U21: ocenění a archiv sezóny
  for (const st of u21Started) {
    for (const phase of U21_WRAP_PHASES) {
      const prog = await getProgress(db, st.leagueId, seasonNumber, phase);
      if (prog?.status === "done") continue;
      const status = await runWrapPhase(db, geminiApiKey, st.leagueId, seasonNumber, phase);
      return { allDone: false, ready: true, seasonNumber, leagueId: st.leagueId, phase, status, remainingLeagues: u21Started.length, detail: `U21 ${phase} → ${status}` };
    }
  }

  // 2. Globální rollover (jednou, až mají všechny odehrané ligy wrap hotový). Založí se
  //    markerem s kotvou nové sezóny a pak jde po krocích, jeden krok na volání.
  const rollProg = await getProgress(db, ROLLOVER_KEY, seasonNumber, "rollover");
  if (rollProg?.status !== "done") {
    try {
      if (await beginRollover(db, seasonNumber) === "done") {
        return { allDone: true, ready: true, seasonNumber, remainingLeagues: 0, detail: "sezóna zakončena" };
      }
    } catch (e) {
      logger.error({ module: "end-season" }, "global rollover: založení selhalo", e);
      return { allDone: false, ready: true, seasonNumber, phase: "rollover", status: "error", remainingLeagues: 0, detail: "rollover nejde založit" };
    }
    return stepRollover(db, seasonNumber);
  }

  return { allDone: true, ready: true, seasonNumber, remainingLeagues: 0, detail: "sezóna zakončena" };
}

const SHORT_WEEKDAY = ["ne", "po", "út", "st", "čt", "pá", "so"];

/**
 * Běží pohár sezóny? Vrací zprávu pro admina (kolo a den dalšího zápasu), jinak null.
 * Chyba čtení propadne: neznámý stav poháru nesmí pustit rollover.
 */
async function runningCupGate(db: D1Database, seasonNumber: number): Promise<{ detail: string } | null> {
  const cup = await db.prepare(
    "SELECT id, name, current_round, total_rounds FROM cup_competitions WHERE season_number = ? AND status = 'active' LIMIT 1",
  ).bind(seasonNumber).first<{ id: string; name: string; current_round: number; total_rounds: number }>();
  if (!cup) return null;

  const { roundName } = await import("../cup/cup");
  const next = await db.prepare(
    "SELECT MIN(scheduled_at) AS at FROM cup_matches WHERE cup_id = ? AND status = 'scheduled'",
  ).bind(cup.id).first<{ at: string | null }>();
  // Pohárová kola se hrají v 16:00 UTC, den je v Praze stejný.
  const when = next?.at ? new Date(next.at) : null;
  const day = when && Number.isFinite(when.getTime())
    ? `, ${SHORT_WEEKDAY[when.getUTCDay()]} ${when.getUTCDate()}. ${when.getUTCMonth() + 1}.`
    : "";
  return {
    detail: `${cup.name} ještě běží (${roundName(cup.current_round, cup.total_rounds)}${day}), sezónu jde zakončit až po finále`,
  };
}

/**
 * Jeden krok rolloveru. `allDone` jen když doběhla poslední fáze. Admin tlačítko volá
 * dál, dokud ho nedostane, takže rollover se nemůže tvářit hotový v půlce.
 */
async function stepRollover(db: D1Database, oldSeasonNumber: number): Promise<EndSeasonStepResult> {
  try {
    const r = await runRolloverStep(db, oldSeasonNumber);
    if (r.finished) {
      return { allDone: true, ready: true, seasonNumber: oldSeasonNumber, phase: "rollover", status: "done", remainingLeagues: 0, detail: r.detail };
    }
    return { allDone: false, ready: true, seasonNumber: oldSeasonNumber, phase: `rollover:${r.phase}`, status: r.status, remainingLeagues: 0, detail: r.detail };
  } catch (e) {
    logger.error({ module: "end-season" }, "global rollover failed", e);
    return { allDone: false, ready: true, seasonNumber: oldSeasonNumber, phase: "rollover", status: "error", remainingLeagues: 0, detail: "rollover selhal, další krok ho zkusí znovu" };
  }
}

async function runWrapPhase(
  db: D1Database,
  geminiApiKey: string | undefined,
  leagueId: string,
  seasonNumber: number,
  phase: WrapPhase,
): Promise<"done" | "in_progress" | "error"> {
  try {
    switch (phase) {
      case "finalize":
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      case "rewards": {
        const standings = await calculateStandings(db, leagueId);
        // Level ligy MUSÍ být načtený — bez něj se odměny počítají špatně (tichý fallback na okresní
        // přebor podhodnotí vyšší soutěže o 30-43 %). Když chybí, propadne throw → fáze se zopakuje.
        const levelRow = await db.prepare("SELECT level FROM leagues WHERE id = ?").bind(leagueId).first<{ level: string }>();
        if (!levelRow?.level) throw new Error(`rewards: nelze načíst level ligy ${leagueId}`);
        const gameDate = await getGameDate(db, leagueId);
        await applySeasonRewards(db, standings, seasonNumber, gameDate, levelRow.level, leagueId);
        // Sezónní ceny a rozdělení přebytku, které si soutěž odhlasovala. Až po
        // odměnách za umístění — z pokladny se rozdává to, co po nich zbude.
        try {
          const { paySeasonEndGrants } = await import("../competition/season-grants");
          await paySeasonEndGrants(db, { leagueId, seasonNumber, level: levelRow.level, gameDate });
        } catch (e) {
          // Cena navíc nesmí shodit konec sezóny — odměny už jsou vyplacené.
          logger.warn({ module: "end-season" }, `sezónní ceny soutěže ${leagueId}`, e);
        }
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
      case "awards": {
        await generateSeasonAwards(db, geminiApiKey, leagueId, seasonNumber);
        // Kořaly „Šampion" vítězi ligy. Vítěz se čte ze zapsaných ocenění, takže
        // opakovaný běh fáze nic neudělí podruhé. Dřív trofej neuděloval nikdo.
        const { awardLeagueChampion } = await import("../services/achievements");
        await awardLeagueChampion(db, leagueId, seasonNumber)
          .catch((e) => logger.warn({ module: "end-season" }, `kořaly šampiona ligy ${leagueId}`, e));
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
      case "archive":
        await archiveLeagueSeason(db, leagueId, seasonNumber);
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      case "departures": {
        const prog = await getProgress(db, leagueId, seasonNumber, phase);
        let processed: string[] = [];
        try { processed = JSON.parse(prog?.cursor ?? "[]"); } catch { processed = []; }
        const processedSet = new Set(processed);
        const teamsRes = await db.prepare("SELECT id FROM teams WHERE league_id = ?").bind(leagueId).all<{ id: string }>()
          .catch((e) => { logger.warn({ module: "end-season" }, "load teams for departures", e); return { results: [] as { id: string }[] }; });
        const teamIds = teamsRes.results.map((r) => r.id);
        const todo = teamIds.filter((id) => !processedSet.has(id)).slice(0, DEPARTURES_CHUNK);
        for (const tid of todo) {
          // Cursor PŘED mutacemi (bumpAges/development jsou NEidempotentní) — pád uprostřed týmu →
          // tým je už označen → retry ho přeskočí → NIKDY dvojité stárnutí (age+2). Cena: vzácně
          // částečné odchody u týmu, kde pád nastal (přijatelnější než trvalá korupce věku).
          processedSet.add(tid);
          await setProgress(db, leagueId, seasonNumber, phase, "pending", JSON.stringify([...processedSet]));
          const res = await processTeamDepartures(db, leagueId, tid, seasonNumber);
          await captureDepartures(db, tid, seasonNumber, res);
        }
        const done = processedSet.size >= teamIds.length;
        await setProgress(db, leagueId, seasonNumber, phase, done ? "done" : "pending", JSON.stringify([...processedSet]));
        return done ? "done" : "in_progress";
      }
      case "academy": {
        // Odchovanci z akademie: každý klub, který do ní za sezónu platil, lidský i AI.
        // Zprávu o ročníku dostane jen lidský klub.
        // Fáze je idempotentní přes kurzor: kdo je odbavený, ten se znovu nevychová.
        const prog = await getProgress(db, leagueId, seasonNumber, phase);
        let processed: string[] = [];
        try { processed = JSON.parse(prog?.cursor ?? "[]"); }
        catch (e) { logger.warn({ module: "end-season" }, "parse academy cursor", e); processed = []; }
        const processedSet = new Set(processed);

        const teamsRes = await db.prepare(
          // I klub, který akademii před koncem zrušil: ročník se řídí tím, co za sezónu zaplatil
          "SELECT id, user_id FROM teams WHERE league_id = ? AND parent_team_id IS NULL AND (youth_investment != 'none' OR youth_paid_base > 0)",
        ).bind(leagueId).all<{ id: string; user_id: string | null }>()
          .catch((e) => { logger.warn({ module: "end-season" }, "load teams for academy", e); return { results: [] as { id: string; user_id: string | null }[] }; });
        const humanTeams = new Set(teamsRes.results.filter((r) => !!r.user_id && r.user_id !== "ai").map((r) => r.id));

        const seasonRow = await db.prepare("SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
          .first<{ id: string }>()
          .catch((e) => { logger.warn({ module: "end-season" }, "load active season for academy", e); return null; });

        const { graduateAcademyClass, notifyAcademyGraduates } = await import("./academy-graduation");
        const todo = teamsRes.results.map((r) => r.id).filter((id) => !processedSet.has(id)).slice(0, DEPARTURES_CHUNK);
        for (const tid of todo) {
          // Kurzor PŘED zápisem hráčů — pád uprostřed radši znamená chybějící ročník
          // než dva stejné.
          processedSet.add(tid);
          await setProgress(db, leagueId, seasonNumber, phase, "pending", JSON.stringify([...processedSet]));
          const odchovanci = await graduateAcademyClass(db, tid, seasonRow?.id ?? null)
            .catch((e) => { logger.warn({ module: "end-season", teamId: tid }, "academy graduation", e); return []; });
          if (odchovanci.length > 0 && humanTeams.has(tid)) await notifyAcademyGraduates(db, tid, odchovanci);
          // Nová sezóna počítá platby od nuly
          await db.prepare("UPDATE teams SET youth_paid_base = 0, youth_paid_weeks = 0 WHERE id = ?").bind(tid).run()
            .catch((e) => logger.warn({ module: "end-season", teamId: tid }, "reset youth paid counters", e));
        }

        const done = processedSet.size >= teamsRes.results.length;
        if (done) {
          // Kdo za sezónu nezaplatil nic, do fáze nevstoupil — jeho týdny by se jinak přenesly
          // do další sezóny a zředily průměr, až akademii zapne
          await db.prepare("UPDATE teams SET youth_paid_base = 0, youth_paid_weeks = 0 WHERE league_id = ? AND youth_paid_base = 0 AND youth_paid_weeks > 0")
            .bind(leagueId).run()
            .catch((e) => logger.warn({ module: "end-season", leagueId }, "reset unpaid youth counters", e));
        }
        await setProgress(db, leagueId, seasonNumber, phase, done ? "done" : "pending", JSON.stringify([...processedSet]));
        return done ? "done" : "in_progress";
      }
      case "replenish": {
        const rng = createRng(cryptoSeed());
        const gameDate = await getGameDate(db, leagueId);
        await refreshFreeAgents(db, rng, new Date(gameDate));
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
      case "village": {
        const standings = await calculateStandings(db, leagueId);
        await applyVillageSeasonReaction(db, standings, seasonNumber);
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
      case "articles":
        await generateSeasonWrapArticle(db, geminiApiKey, leagueId, seasonNumber);
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      case "interviews": {
        const { remaining } = await createSeasonWrapInterviews(db, geminiApiKey, leagueId, seasonNumber, DEPARTURES_CHUNK);
        const done = remaining === 0;
        await setProgress(db, leagueId, seasonNumber, phase, done ? "done" : "pending");
        return done ? "done" : "in_progress";
      }
      case "recap": {
        // Sestav per-tým recap pro lidské týmy (PŘED rolloverem — jména hráčů ještě existují)
        const humansRes = await db.prepare("SELECT id FROM teams WHERE league_id = ? AND user_id != 'ai'").bind(leagueId).all<{ id: string }>()
          .catch((e) => { logger.warn({ module: "end-season" }, "load humans for recap", e); return { results: [] as { id: string }[] }; });
        for (const h of humansRes.results) {
          await buildTeamRecap(db, h.id, leagueId, seasonNumber);
        }
        await setProgress(db, leagueId, seasonNumber, phase, "done");
        return "done";
      }
    }
  } catch (e) {
    logger.error({ module: "end-season" }, `wrap phase ${phase} failed league=${leagueId}`, e);
    return "error";
  }
  return "error";
}
