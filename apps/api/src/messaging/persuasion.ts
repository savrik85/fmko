/**
 * Trenér v SMS přemlouvá hráče, který na zápas nebo trénink nepřijde: o tom, jestli kývne,
 * rozhoduje hra, ne model.
 *
 * Přetest 3 (22. 11.): pokyn „Když tě trenér rozumně přemluví, dáš se přemluvit. Dokud tě
 * nepřemluví, drž se omluvenky“ model (Workers AI) poslechl jen napůl. Ze 10 pokusů u lehkých
 * důvodů prošel jeden (Veselý s kocovinou 0/3: „Bez tebe nemáme útok, fakt tě potřebuju…“, „zítra
 * v pět tě vyzvednu autem…“ → „To není možný. 🤕“; Filip s leností 0/2). Teď:
 *  1. Zpráva trenéra (routes/messaging.ts, před odpovědí): je to přemlouvání (`isPersuasion`)
 *     a hráč má omluvenku nebo řekl, že nepřijde, z lehčího důvodu? Hra podle důvodu, vztahu,
 *     ukázněnosti a počtu pokusů deterministicky rozhodne a uloží `life_context.persuasion`.
 *  2. Model dostane pevný pokyn (ai-player-chat.ts): „Rozhodl ses: PŘIJDEŠ, řekni to jasně.“
 *     nebo „Nepřijdeš, vymluv se po svém.“ Na takovou zprávu hráč odpoví vždycky.
 *  3. Po odpovědi (`afterPlayerReply`) se „přijdu“ zapíše jako slib (attendance-pledge.ts) bez
 *     spoléhání na příznak od modelu a přepíše omluvenku jako dosud.
 * Vážný důvod (nemoc, pohřeb, zranění, stopka, výslech) se nepřemlouvá.
 */

import { logger } from "../lib/logger";
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import type { PlayerSnapshot } from "./ai-player-scenarios";
import {
  COACH_REST_REASON, WEEKDAY_KEYS, absenceEase, decidedLine, lifeOf, pledgesFromLife, recordAttendancePledge, type PledgeEvent, type WeekdayKey,
} from "./attendance-pledge";

const M = "persuasion";

/** Rozhodnutí k přemlouvací zprávě platí pro odpověď na ni, i opožděnou po výpadku modelu (retry_reply za ~50 min). */
export const PERSUASION_FRESH_MS = 3 * 3600_000;
/** Po tolika neúspěšných pokusech už hráč nekývne, trenér ho otravuje. */
export const PERSUASION_MAX_ATTEMPTS = 3;

/** `life_context.persuasion`: na co trenér přemlouvá, kolikrát a jak to hra rozhodla naposledy. */
export interface PersuasionState {
  /** Zápas (`match:` + klíč zápasu) nebo trénink (`training:` + herní den). */
  key: string;
  event: PledgeEvent;
  /** Den tréninku (YYYY-MM-DD), u zápasu není. */
  day?: string;
  attempts: number;
  decided: "attend" | "skip";
  at: string;
  convId: string;
  /** Slib „přijdu“ z rozhodnutí se už zapsal. */
  applied?: boolean;
}

function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Výzva přijít, sama o sobě o docházce: „přijď“, „přijdeš?“, „dorazíš?“, „aspoň poločas“, „beru zpátky“. */
const ATTEND_URGE_RE = /\b(prijd|prijdes|prijed|prijedes|doraz|dorazis|aspon (polocas|jeden polocas|na polocas|na chvili|na lavicku)|beru (to )?zpatky|nakonec (prijd\w*|doraz\w*))/;
/** Prosba a naléhání („potřebuju tě“, „udělej to pro mě“, „bez tebe“): o docházce jen spolu s tématem. */
const SOFT_URGE_RE = /\b(potrebuj\w* te|potreboval\w* te|udelej to pro|udelas to pro|prosim|bez tebe|kluci (na tebe )?cekaj\w*|pocitam s tebou|nenechavej nas)/;
/** Téma docházky: zápas, trénink, den, poločas, lavička, sestava, hrát. */
const ATTEND_TOPIC_RE = /(zapas|trenin|pratelak|zitr|dnes|v (pondeli|utery|stredu|ctvrtek|patek|sobotu|nedeli)|polocas|lavick|sestav|nastoup|hrat|hrajem|utok|vepred|zaloz)/;
/** Nabídka řešení: odvoz, hlídání, výměna směny. Zvedá šanci. */
const OFFER_RE = /\b(vyzvednu|odvezu|vezmu te|hodim te|zavezu|pro tebe (prijedu|dojedu|zajedu)|pohlida|vymenim|zaridim|zaplatim ti)/;

/**
 * Přemlouvá trenér hráče, ať přijde? Výzva „přijď“, „dorazíš?“ stačí sama, prosba („potřebuju tě“,
 * „udělej to pro mě“) jen se zmínkou o zápase, tréninku nebo dni. „Prosím tě, kdo ukradl dresy?“ ne.
 */
export function isPersuasion(text: string): boolean {
  const t = plain(text);
  return ATTEND_URGE_RE.test(t) || (SOFT_URGE_RE.test(t) && ATTEND_TOPIC_RE.test(t));
}

/** Nabízí trenér řešení (odvoz, hlídání)? */
export function offersHelp(text: string): boolean {
  return OFFER_RE.test(plain(text));
}

/**
 * Šance, že hráč kývne. `ease` z důvodu, vztahu a ukázněnosti (`absenceEase`): kocovina nebo
 * výmluva snadno, práce těžko. Každý další pokus přidává (trenér to myslí vážně), nabídnuté
 * řešení taky. Strop 90 %.
 */
export function persuasionChance(o: { ease: number; attempt: number; offer: boolean }): number {
  const base = o.ease >= 3 ? 0.6 : o.ease === 2 ? 0.45 : o.ease === 1 ? 0.25 : o.ease === 0 ? 0.1 : 0.03;
  return Math.min(0.9, base + 0.2 * (o.attempt - 1) + (o.offer ? 0.15 : 0));
}

/** Los rozhodnutí: stejný hráč, věc a pokus = stejný výsledek. */
export function persuasionRoll(playerId: string, key: string, attempt: number): number {
  return createRng(seedFromString(`persuade|${playerId}|${key}|${attempt}`)).random();
}

/** Platné rozhodnutí z `life_context` (čerstvé), jinak undefined. */
export function persuasionFromLife(life: Record<string, unknown>, now: Date = new Date()): PersuasionState | undefined {
  const p = life.persuasion as Partial<PersuasionState> | undefined;
  if (!p || (p.decided !== "attend" && p.decided !== "skip") || (p.event !== "match" && p.event !== "training") || typeof p.at !== "string") return undefined;
  if (now.getTime() - Date.parse(p.at) > PERSUASION_FRESH_MS) return undefined;
  return p as PersuasionState;
}

/** Na přemlouvací zprávu s rozhodnutím hráč odpoví vždycky (left-on-read.ts ji nebere). */
export function persuasionPending(player: Pick<PlayerSnapshot, "persuasion">): boolean {
  return !!player.persuasion && !player.persuasion.applied;
}

/** Pevný pokyn do promptu podle rozhodnutí hry. */
export function persuasionLine(p: PersuasionState): string {
  return decidedLine(p.decided);
}

/** Text zprávy hráče z doby, kdy řekl, že nepřijde (vážný důvod se pak nepřemlouvá). */
async function pledgeText(db: D1Database, convId: string, playerId: string, at: string): Promise<string> {
  const row = await db.prepare(
    `SELECT body FROM messages WHERE conversation_id = ? AND sender_type = 'player' AND sender_id = ?
        AND julianday(sent_at) <= julianday(?) + 0.0007 ORDER BY julianday(sent_at) DESC LIMIT 1`,
  ).bind(convId, playerId, at).first<{ body: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `zpráva hráče ke slibu ${playerId}`, e); return null; });
  return row?.body ?? "";
}

interface Candidate { key: string; event: PledgeEvent; day?: string; ease: number }

/**
 * Zpráva trenéra hráči: přemlouvá ho, ať přijde? Když ano a hráč má co přemlouvat, hra rozhodne
 * a rozhodnutí uloží do `life_context.persuasion`. Vrací ho, nebo null. Nikdy nehází.
 */
export async function handlePersuasion(
  db: D1Database, o: { teamId: string; convId: string; playerId: string; text: string; now?: Date },
): Promise<PersuasionState | null> {
  try {
    if (!isPersuasion(o.text)) return null;
    const now = o.now ?? new Date();
    const { ownSquadTeamId } = await import("./player-reach");
    const rosterTeamId = await ownSquadTeamId(db, o.playerId, o.teamId);
    if (!rosterTeamId) return null;
    const row = await db.prepare("SELECT life_context, personality, coach_relationship FROM players WHERE id = ?")
      .bind(o.playerId).first<{ life_context: string | null; personality: string | null; coach_relationship: number | null }>();
    if (!row) return null;
    const life = lifeOf(row.life_context);
    const personality = lifeOf(row.personality);
    const traits = { discipline: Number(personality.discipline ?? 50) || 0, coachRelationship: row.coach_relationship ?? 50 };
    const candidates: Candidate[] = [];

    // Zápas: omluvenka z kabiny (los, výmluva) nebo „nepřijdu“ z SMS.
    const { findUpcomingMatchContext } = await import("../events/match-absences");
    const match = await findUpcomingMatchContext(db, rosterTeamId);
    if (match) {
      const { loadUpcomingAbsences } = await import("./ai-player-spawn");
      const absence = (await loadUpcomingAbsences(db, rosterTeamId, now))?.get(o.playerId);
      const { matchPledge } = pledgesFromLife(life);
      const ease = absence
        ? absenceEase(absence, traits)
        : matchPledge?.intent === "skip" && matchPledge.matchKey === match.matchKey
          ? absenceEase({ reason: "", text: await pledgeText(db, matchPledge.convId, o.playerId, matchPledge.at) }, traits)
          : null;
      if (ease !== null) candidates.push({ key: `match:${match.matchKey}`, event: "match", ease });
    }
    // Trénink: „nepřijdu“ z SMS, nebo volno od trenéra, které teď bere zpátky.
    const { trainingPledge } = pledgesFromLife(life);
    if (trainingPledge?.intent === "skip" && !trainingPledge.outcome) {
      const ease = trainingPledge.coachGranted
        ? absenceEase({ reason: COACH_REST_REASON, text: "" }, traits)
        : absenceEase({ reason: "", text: await pledgeText(db, trainingPledge.convId, o.playerId, trainingPledge.at) }, traits);
      if (ease !== null) candidates.push({ key: `training:${trainingPledge.from}`, event: "training", day: trainingPledge.from, ease });
    }
    if (candidates.length === 0) return null;
    const aboutTraining = /tr[eé]nin/i.test(o.text);
    const c = candidates.find((x) => (x.event === "training") === aboutTraining) ?? candidates[0];

    const prev = life.persuasion as Partial<PersuasionState> | undefined;
    if (prev?.key === c.key && prev.decided === "attend") return null;
    const attempt = prev?.key === c.key ? (prev.attempts ?? 0) + 1 : 1;
    const chance = attempt > PERSUASION_MAX_ATTEMPTS ? 0 : persuasionChance({ ease: c.ease, attempt, offer: offersHelp(o.text) });
    const decided = persuasionRoll(o.playerId, c.key, attempt) < chance ? "attend" : "skip";
    const state: PersuasionState = {
      key: c.key, event: c.event, ...(c.day ? { day: c.day } : {}), attempts: attempt, decided, at: now.toISOString(), convId: o.convId,
    };
    await db.prepare("UPDATE players SET life_context = json_set(COALESCE(life_context, '{}'), '$.persuasion', json(?)) WHERE id = ?")
      .bind(JSON.stringify(state), o.playerId).run();
    logger.info({ module: M, teamId: o.teamId }, `přemlouvání ${o.playerId} (${c.key}, pokus ${attempt}, šance ${Math.round(chance * 100)} %): ${decided}`);
    return state;
  } catch (e) {
    logger.warn({ module: M, teamId: o.teamId }, `přemlouvání hráče ${o.playerId}`, e);
    return null;
  }
}

/**
 * Po odpovědi hráče: rozhodnutí „přijde“ se zapíše jako slib (přepíše omluvenku nebo „nepřijdu“),
 * poznámka pro trenéra je pod odpovědí. Rozhodnutí je tím vyřízené (na další zprávu už hráč
 * odpovídat nemusí). Volá `afterPlayerReply`. Nikdy nehází.
 */
export async function applyPersuasion(
  db: D1Database, o: { clubTeamId: string; convId: string; player: Pick<PlayerSnapshot, "id" | "firstName" | "persuasion">; at: string },
): Promise<boolean> {
  const p = o.player.persuasion;
  if (!p || p.applied) return false;
  try {
    if (p.decided !== "attend") {
      await markApplied(db, o.player.id);
      return false;
    }
    const when: WeekdayKey | "next" = p.event === "training" && p.day ? WEEKDAY_KEYS[new Date(`${p.day}T12:00:00Z`).getUTCDay()] : "next";
    const stored = await recordAttendancePledge(db, {
      clubTeamId: o.clubTeamId, convId: o.convId, playerId: o.player.id, playerFirstName: o.player.firstName,
      pledge: { event: p.event, intent: "attend", when }, now: new Date(o.at),
    });
    await markApplied(db, o.player.id);
    return !!stored;
  } catch (e) {
    logger.warn({ module: M, teamId: o.clubTeamId }, `slib po přemluvení ${o.player.id}`, e);
    return false;
  }
}

async function markApplied(db: D1Database, playerId: string): Promise<void> {
  await db.prepare("UPDATE players SET life_context = json_set(life_context, '$.persuasion.applied', json('true')) WHERE id = ?")
    .bind(playerId).run();
}
