/**
 * Hráči, kteří se nevešli ani na lavičku.
 *
 * Po ligovém nebo pohárovém zápase (ne U21, tam sestavu skládá automat) klesne morálka každému zdravému hráči,
 * který na zápas nejel. Nejvýš jeden z nich (ten nejnaštvanější) napíše trenérovi SMS.
 * U AI klubu platí morálka i vztah k trenérovi stejně, SMS (a s ní truc) jen u lidského.
 * Omluvení, zranění a suspendovaní se nezlobí, o zápas nepřišli kvůli trenérovi.
 *
 * Kdo nejel, určuje `buildMatchPlayers` (match-runner.ts): `leftOutIds` jsou zdraví
 * hráči mimo osmnáctku, `benchIds` náhradníci, kteří jeli.
 *
 * Pisatel SMS může začít trucovat (`life_context.leftOutSulk`): většinu tréninků
 * vynechá (season/training.ts). Truc skončí, když ho trenér přemluví v SMS (AI vlákno
 * `left_out`, routes/messaging.ts + ai-player-spawn.ts), když jede na zápas, nebo
 * po `SULK_DAYS` herních dnech.
 */

import { leftOutRelationDrop, motivationLeftOutSoftening, motivationSulkMod } from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { coachTalkedSince } from "../hearsay/effects";
import { coachRelationStmts } from "../lib/coach-relation";
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { TEMPLATE_HISTORY_LIMIT, loadOwnRecentLines, pickFreshVariant } from "../messaging/repetition";
import { loadActiveListing } from "../transfers/listing-status";

type Rng = ReturnType<typeof createRng>;

export interface LeftOutPlayer {
  id: string;
  lastName: string;
  position: string;
  overallRating: number;
  temper: number;
  discipline: number;
  /** Kolikrát po sobě hráč nejel už PŘED tímhle zápasem. */
  previousStreak: number;
  /** Trenér mu před zápasem sám psal (Kabina má uši): zklamání i truc jsou poloviční. */
  toldInAdvance?: boolean;
}

export interface BenchPlayer {
  /** Jak ho hráč v SMS jmenuje: příjmení, při shodě příjmení v kádru celé jméno. */
  lastName: string;
  position: string;
  overallRating: number;
}

export type ComplaintReason = "skipped_for_weaker" | "streak" | "generic";

/** O kolik musí být hráč lepší než náhradník, aby to bral jako křivdu. */
const SKIPPED_GAP = 3;

/**
 * Nejslabší náhradník, se kterým se hráč srovnává. Brankář se srovnává jen s brankáři
 * a hráč v poli jen s hráči v poli: rezervní gólman na lavičce nikomu místo nebere.
 */
export function weakestComparableSub(player: LeftOutPlayer, bench: BenchPlayer[]): BenchPlayer | null {
  const isGk = player.position === "GK";
  const comparable = bench.filter((b) => (b.position === "GK") === isGk);
  if (comparable.length === 0) return null;
  return comparable.reduce((min, b) => (b.overallRating < min.overallRating ? b : min));
}

function skippedFor(player: LeftOutPlayer, bench: BenchPlayer[]): BenchPlayer | null {
  const weakest = weakestComparableSub(player, bench);
  return weakest && player.overallRating - weakest.overallRating >= SKIPPED_GAP ? weakest : null;
}

/** O kolik hráči klesne morálka za to, že nejel. Trenér-motivátor to zmírní, lajdák zhorší. */
export function moraleLoss(player: LeftOutPlayer, bench: BenchPlayer[], coachMotivation = 40): number {
  let loss = 3;
  if (skippedFor(player, bench)) loss += 2;
  if (player.previousStreak >= 1) loss += 2;
  return Math.max(1, Math.round(loss * (1 - motivationLeftOutSoftening(coachMotivation)) * (player.toldInAdvance ? 0.5 : 1)));
}

/**
 * Vybere, kdo trenérovi napíše. Nejvýš jeden hráč; když je nejnaštvanější hráč kliďas
 * a nic se neděje, nenapíše nikdo.
 */
export function pickComplainer(
  leftOut: LeftOutPlayer[],
  bench: BenchPlayer[],
  rng: Rng,
): { player: LeftOutPlayer; reason: ComplaintReason; weaker: BenchPlayer | null; streak: number } | null {
  if (leftOut.length === 0) return null;
  const scored = leftOut.map((p) => {
    const weaker = skippedFor(p, bench);
    const streak = p.previousStreak + 1;
    const gap = weaker ? Math.min(20, p.overallRating - weaker.overallRating) : 0;
    const score = gap + (streak - 1) * 6 + (p.temper - 50) / 5 + p.overallRating / 10;
    return { p, weaker, streak, score };
  });
  const top = scored.reduce((best, s) => (s.score > best.score ? s : best));

  const chance = Math.min(0.9,
    0.25
    + (top.weaker ? 0.3 : 0)
    + Math.min(0.3, (top.streak - 1) * 0.15)
    + (top.p.temper > 60 ? 0.15 : 0));
  if (rng.random() >= chance) return null;

  const reason: ComplaintReason = top.weaker ? "skipped_for_weaker" : top.streak >= 2 ? "streak" : "generic";
  return { player: top.p, reason, weaker: top.weaker, streak: top.streak };
}

// ── Truc ───────────────────────────────────────────────────────────────────

/** Jak dlouho truc vydrží, když se s hráčem nic nestane. */
export const SULK_DAYS = 7;

/** Uložený truc (life_context.leftOutSulk). Data jsou herní dny YYYY-MM-DD. */
export interface LeftOutSulk {
  since: string;
  until: string;
  matchId: string;
  /** Tým, za který hráč nejel. Starší truce ho nemají. */
  teamId?: string;
  /** Proč nejel, jak to napsal trenérovi (`ComplaintReason` nebo `NotCountedOn`). Starší truce ho nemají. */
  reason?: string;
}

/**
 * Trucuje hráč v daný herní den? `teamId` je tým, ve kterém hráč teď je: truc patří týmu,
 * kde hráč nejel, a s hráčem po přestupu ani na hostování nejde. Dřív Říha trucoval
 * za Spůli i v Chlumanech a odbyl tam trenéra, který ho ještě nikdy nevynechal (2026-11-04).
 */
export function isSulking(sulk: unknown, gameDay: string, teamId: string): boolean {
  if (!sulk || typeof sulk !== "object") return false;
  const { until, teamId: sulkTeamId } = sulk as Partial<LeftOutSulk>;
  if (typeof sulkTeamId === "string" && sulkTeamId !== teamId) return false;
  return typeof until === "string" && until >= gameDay.slice(0, 10);
}

/** Kolik zápasů po sobě hráč za tenhle tým nejel. Série z jiného týmu se nepočítá. */
export function leftOutStreakFor(life: Record<string, unknown>, teamId: string): number {
  const team = life.leftOutTeamId;
  if (typeof team === "string" && team !== teamId) return 0;
  return Number(life.leftOutStreak ?? 0) || 0;
}

/**
 * Jednorázová oprava dat (2026-11-05): série a truce z doby před `leftOutTeamId` nevědí,
 * ke kterému týmu patří. Hráči, který je pořád v týmu, za který nejel (`leftOutMatch`),
 * se tým doplní. Hráči, který mezitím odešel jinam (přestup, hostování), se série i truc
 * smažou. Bez dohledatelného zápasu se nic nemění.
 */
export async function backfillLeftOutTeams(db: D1Database): Promise<{ tagged: number; cleared: number; skipped: number }> {
  const rows = await db.prepare(
    `SELECT p.id, p.team_id, m.home_team_id, m.away_team_id,
            json_extract(p.life_context, '$.leftOutSulk') IS NOT NULL AS has_sulk
       FROM players p
       LEFT JOIN matches m ON m.id = json_extract(p.life_context, '$.leftOutMatch')
      WHERE json_extract(p.life_context, '$.leftOutTeamId') IS NULL
        AND (COALESCE(json_extract(p.life_context, '$.leftOutStreak'), 0) > 0
             OR json_extract(p.life_context, '$.leftOutSulk') IS NOT NULL)`,
  ).all<{ id: string; team_id: string; home_team_id: string | null; away_team_id: string | null; has_sulk: number }>();

  let tagged = 0;
  let cleared = 0;
  let skipped = 0;
  const stmts: D1PreparedStatement[] = [];
  for (const r of rows.results) {
    if (!r.home_team_id && !r.away_team_id) { skipped++; continue; }
    if (r.home_team_id === r.team_id || r.away_team_id === r.team_id) {
      stmts.push(r.has_sulk
        ? db.prepare("UPDATE players SET life_context = json_set(life_context, '$.leftOutTeamId', ?, '$.leftOutSulk.teamId', ?) WHERE id = ?")
          .bind(r.team_id, r.team_id, r.id)
        : db.prepare("UPDATE players SET life_context = json_set(life_context, '$.leftOutTeamId', ?) WHERE id = ?")
          .bind(r.team_id, r.id));
      tagged++;
    } else {
      stmts.push(db.prepare(
        "UPDATE players SET life_context = json_remove(life_context, '$.leftOutStreak', '$.leftOutMatch', '$.leftOutSulk') WHERE id = ?",
      ).bind(r.id));
      cleared++;
    }
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  logger.info({ module: "left-out" }, `doplnění týmu u sérií bez nominace: ${tagged} označeno, ${cleared} smazáno, ${skipped} beze změny`);
  return { tagged, cleared, skipped };
}

/** Šance, že pisatel naštvané SMS začne trucovat a vynechávat tréninky. */
export function sulkChance(
  player: LeftOutPlayer,
  complaint: { reason: ComplaintReason; streak: number },
  coachMotivation = 40,
): number {
  const chance = 0.3
    + (complaint.reason === "skipped_for_weaker" ? 0.2 : 0)
    + (complaint.streak >= 2 ? 0.25 : 0)
    + (player.temper > 60 ? 0.2 : 0)
    - (player.discipline > 70 ? 0.25 : 0)
    + motivationSulkMod(coachMotivation);
  const told = player.toldInAdvance ? 0.5 : 1;
  return Math.max(0.05, Math.min(0.9, chance) * told);
}

/** Dovětek SMS, když hráč začne trucovat — trenér se to dozví hned, ne až z docházky. */
const SULK_SUFFIXES: readonly string[] = [
  "Na trénink tenhle týden nečekejte.",
  "Tak to na trénink asi nepřijdu, stejně to nemá cenu.",
  "Na trénink se zatím vykašlu.",
  "Tak mě na tréninku nehledejte.",
];

/** Výmluvy do docházky na trénink (třetí osoba, jako ostatní omluvenky). */
export const SULK_TRAINING_REASONS: readonly string[] = [
  "Trucuje, že nejel na zápas",
  "Prý stejně nehraje, tak proč by chodil",
  "Vzkázal, že když ho nebereš ani na lavičku, na trénink nepřijde",
  "Naštvaný kvůli nominaci, nebere telefon",
  "Sedí v hospodě, prý je mu to jedno, když stejně nehraje",
  "Prý přijde, až ho budeš potřebovat",
];

// ── Texty ──────────────────────────────────────────────────────────────────
// Jméno spoluhráče stojí vždy v prvním pádě jako podmět (šablony nemají skloňovadlo).

const SKIPPED_TEXTS: ReadonlyArray<(who: string) => string> = [
  (who) => `Trenére, ${who} jede na zápas a já zůstanu doma? To snad nemyslíte vážně.`,
  (who) => `Takže ${who} je lepší než já? Na tréninku to teda tak nevypadá.`,
  (who) => `Viděl jsem soupisku. ${who} na lavičce a já nic. Dík, fakt.`,
  (who) => `${who} jede a já ani na střídačku? Tohle jsem si od vás nezasloužil.`,
  (who) => `Nechápu to. ${who} dostal místo na lavičce a já koukám na výsledek doma z gauče.`,
  (who) => `Trenére, co vám ${who} udělal, že jede místo mě? Já makám na každým tréninku.`,
  (who) => `Takže ${who} jede a já budu koukat z hospody? Fakt díky, trenére.`,
  (who) => `${who} dostal přednost přede mnou. Tak to mi teda vysvětlete, trenére.`,
];

const STREAK_TEXTS: ReadonlyArray<(nth: string) => string> = [
  (nth) => `Už ${nth} po sobě jsem zůstal doma. Mám si začít hledat jinej klub?`,
  (nth) => `${capitalize(nth)} za sebou bez nominace. Řekněte mi rovnou, jestli se se mnou ještě počítá.`,
  (nth) => `Zase doma, už ${nth} v řadě. Tohle mě fakt nebaví.`,
  (nth) => `Už ${nth} jsem nejel ani na lavičku. Kluci se mi v hospodě smějou.`,
  (nth) => `Trenére, ${nth} po sobě nic. Jestli o mě nestojíte, tak to řekněte.`,
  (nth) => `${capitalize(nth)} jsem doma, trenére. Asi už se mnou nepočítáte, co?`,
  (nth) => `Už ${nth} mě nevezmete ani na lavičku. Co mám ještě udělat, trenére?`,
  (nth) => `Trenére, ${nth} v řadě koukám na zápas z domu. Takhle mě to nebaví.`,
];

const GENERIC_TEXTS: readonly string[] = [
  "Ani na střídačku? Trenére, to mě fakt zamrzelo.",
  "Tak jsem se dozvěděl, že nejedu. Mohl jste mi to aspoň říct do očí.",
  "Celej tejden makám na tréninku a pak ani lavička. Tohle mě mrzí.",
  "Sedím doma a koukám na výsledky. Příště mě snad vezmete aspoň na lavičku.",
  "Trenére, co mám dělat jinak, abych se dostal aspoň do zápisu?",
  "Nejedu ani jako náhradník? To jsem teda nečekal.",
  "Trenére, ani lavička? Myslel jsem, že aspoň náhradníka dělat můžu.",
  "Tak jsem zůstal doma. Dobře, trenére, ale moc mě to nebere.",
  "Trenére, na zápas jsem se těšil a nakonec nic. Aspoň mi řekněte proč.",
];

// Hráč, se kterým trenér nepočítá (je na listině nebo mu to trenér napsal), si nestěžuje, že
// nejel, a neptá se, jestli se s ním počítá: ví to. Ozve se trucovitě, nejvýš jednou za týden.
const MARKET_TEXTS: readonly string[] = [
  "Na zápas jsem nejel, ale co jsem čekal. Stejně mě chcete prodat.",
  "Vím, že mě máte na prodej. Tak se nedivím, že nejedu.",
  "Jasně, kdo je na prodej, ten nehraje. Chápu, trenére.",
  "Zase doma. Asi abych se nezranil, než mě prodáte, co?",
  "Trenére, kdyby se mnou někdo počítal, nebyl bych na prodej. Takže nic nečekám.",
  "Tak to už je jasný. Na prodej a ani na lavičku. Aspoň vím, jak na tom jsem.",
  "Doma koukám na výsledky. Na prodej se holt nehraje.",
  "Neberete mě, protože mě chcete prodat. Tak ať to proběhne rychle.",
];
const LOAN_TEXTS: readonly string[] = [
  "Na hostování mě nabízíte a hrát mě nenecháte. Tak ať aspoň někam jdu.",
  "Vím, že mě chcete poslat na hostování. Tak aspoň chápu, proč nejedu.",
  "Zase doma. Asi už se počítá s tím, že půjdu hostovat jinam.",
  "Trenére, kdo je na hostování, ten tady nehraje. Jasný.",
  "Radši ať mě někdo vezme na hostování. Tady stejně jen sedím doma.",
  "Nabízíte mě jinam a já koukám z gauče. Aspoň vím, na čem jsem.",
  "Jestli mě chcete poslat hostovat, tak rychle. Takhle to nemá cenu.",
  "Tak nic, další zápas beze mě. Snad mě brzo pošlete hrát jinam.",
];
const TOLD_OUT_TEXTS: readonly string[] = [
  "Tak jsem nejel. Řekl jste mi to dopředu, tak se aspoň nedivím.",
  "Vím, že se mnou nepočítáte. Beru to, ale líbit se mi to nemusí.",
  "Zase doma, jak jste říkal. Aspoň že jste to řekl na rovinu.",
  "Už vím, na čem jsem. Bez nominace, bez šance. Fajn.",
  "Nečekal jsem nic jinýho. Po tom, co jste mi napsal, je to jasný.",
  "Takže platí, co jste řekl. Já na gauči a kluci hrajou.",
  "Trenére, beru na vědomí. Ale doma mě to fakt nebaví.",
  "Jasně, nepočítá se se mnou. Tak aspoň nemusím nikam jezdit.",
];

/** Proč hráč ví, že se s ním nepočítá. Stížnost „jestli se se mnou počítá“ by byla nesmysl. */
export type NotCountedOn = "on_market" | "on_loan" | "told_out";

export function notCountedOn(o: { listing: { kind: "transfer" | "loan" } | null; toldOut: boolean }): NotCountedOn | null {
  if (o.listing) return o.listing.kind === "loan" ? "on_loan" : "on_market";
  return o.toldOut ? "told_out" : null;
}

/** Trucovitá SMS hráče, se kterým se nepočítá: varianta, kterou trenérovi ještě neposlal. */
export function notCountedOnText(reason: NotCountedOn, rng: Rng, previous: readonly string[]): string {
  const pool = reason === "on_market" ? MARKET_TEXTS : reason === "on_loan" ? LOAN_TEXTS : TOLD_OUT_TEXTS;
  return pickFreshVariant(pool, previous, `left-out-out|${Math.floor(rng.random() * 1e9)}`).text;
}

/** Jak dlouho platí, co trenér hráči napsal o tom, že s ním nepočítá (Študlar 7. 10. → stížnost 8. 10.). */
export const NOT_COUNTED_ON_DAYS = 14;
/** Trucovitá SMS „vím, že mě chcete prodat“ nejvýš jednou za tolik dní. */
const NOT_COUNTED_ON_REPEAT_DAYS = 7;

function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase("cs") + s.slice(1);
}

/** „podruhé", „potřetí"… pro sérii zápasů bez nominace. */
export function nthTime(n: number): string {
  const words: Record<number, string> = {
    2: "podruhé", 3: "potřetí", 4: "počtvrté", 5: "popáté", 6: "pošesté",
    7: "posedmé", 8: "poosmé", 9: "podeváté", 10: "podesáté",
  };
  return words[n] ?? "po několikáté";
}

/**
 * Text SMS. `previous` jsou poslední zprávy téhož hráče (repetition.ts): dostane větu,
 * kterou trenérovi ještě neposlal. Dřív se hlídala jen ta úplně poslední a „Celej tejden
 * makám…“ nebo „Sedím doma a koukám na výsledky“ chodily pořád dokola (prod 9–11/2026).
 */
export function complaintText(
  complaint: { reason: ComplaintReason; weaker: BenchPlayer | null; streak: number },
  rng: Rng,
  previous: readonly string[] | string | null = [],
): string {
  const variants: string[] = complaint.reason === "skipped_for_weaker" && complaint.weaker
    ? SKIPPED_TEXTS.map((t) => t(complaint.weaker!.lastName))
    : complaint.reason === "streak"
      ? STREAK_TEXTS.map((t) => t(nthTime(complaint.streak)))
      : [...GENERIC_TEXTS];
  const lines = typeof previous === "string" ? [previous] : previous ?? [];
  return pickFreshVariant(variants, lines, `left-out|${Math.floor(rng.random() * 1e9)}`).text;
}

// ── Zápis do DB ────────────────────────────────────────────────────────────

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  avatar: string | null;
  position: string;
  overall_rating: number;
  personality: string | null;
  life_context: string | null;
}

function parseJson(raw: string | null, what: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    logger.warn({ module: "left-out" }, `nečitelný ${what}`, e);
    return {};
  }
}

/**
 * Reakce hráčů, kteří na zápas nejeli. Volá se po uložení morálky ze zápasu, jinak by
 * ji zápis ze zápasu přepsal. Podruhé pro stejný zápas neudělá nic (obnova uvízlého kola).
 */
export async function reactToLeftOut(
  db: D1Database,
  teamId: string,
  matchId: string,
  squad: { leftOutIds: string[]; benchIds: string[]; matchSquadIds: string[] },
): Promise<void> {
  // Motivace trenéra (rezerva hraje pod trenérem áčka) tlumí zklamání i trucování.
  const team = await db.prepare(
    `SELECT t.user_id, t.game_date, t.team_type, m.motivation FROM teams t
       LEFT JOIN managers m ON m.team_id = COALESCE(t.parent_team_id, t.id)
      WHERE t.id = ?`,
  ).bind(teamId)
    .first<{ user_id: string | null; game_date: string | null; team_type: string | null; motivation: number | null }>();
  if (!team) return;
  // Sestavu U21 skládá vždy automat (copyOrCreateLineup), trenér do ní nesahá.
  // Vyčítat mu, že hráče nevzal, by nedávalo smysl.
  if (team.team_type === "u21") return;
  // AI klub: morálka a vztah k trenérovi platí stejně, jen trenérovi nikdo nepíše
  // a bez SMS nevzniká ani truc (ten končí přemlouváním v Telefonu).
  const writesToCoach = team.user_id !== "ai";
  const coachMotivation = team.motivation ?? 40;
  const gameDay = (team.game_date ?? new Date().toISOString()).slice(0, 10);

  // Kdo jel, tomu se série zápasů bez nominace nuluje a truc končí — dostal, co chtěl
  if (squad.matchSquadIds.length > 0) {
    const ph = squad.matchSquadIds.map(() => "?").join(",");
    await db.prepare(
      `UPDATE players SET life_context = json_remove(json_set(life_context, '$.leftOutStreak', 0), '$.leftOutSulk')
       WHERE id IN (${ph})
         AND (COALESCE(json_extract(life_context, '$.leftOutStreak'), 0) > 0
              OR json_extract(life_context, '$.leftOutSulk') IS NOT NULL)`,
    ).bind(...squad.matchSquadIds).run();
  }
  if (squad.leftOutIds.length === 0) return;

  const ids = [...squad.leftOutIds, ...squad.benchIds];
  const rows = await db.prepare(
    `SELECT id, first_name, last_name, nickname, avatar, position, overall_rating, personality, life_context
     FROM players WHERE id IN (${ids.map(() => "?").join(",")})`,
  ).bind(...ids).all<PlayerRow>();
  const byId = new Map(rows.results.map((r) => [r.id, r]));

  // Tři Novotní v kádru: „Novotný jede a já ne" by nebylo poznat, o kom je řeč
  const surnames = await db.prepare(
    "SELECT last_name, COUNT(*) AS n FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') GROUP BY last_name",
  ).bind(teamId).all<{ last_name: string; n: number }>();
  const sharedSurname = new Set(surnames.results.filter((r) => r.n > 1).map((r) => r.last_name));
  const bench: BenchPlayer[] = squad.benchIds
    .map((id) => byId.get(id))
    .filter((r): r is PlayerRow => !!r)
    .map((r) => ({
      lastName: sharedSurname.has(r.last_name) ? `${r.first_name} ${r.last_name}` : r.last_name,
      position: r.position,
      overallRating: r.overall_rating,
    }));

  const leftOut: Array<LeftOutPlayer & { row: PlayerRow; life: Record<string, unknown>; toldOut: boolean }> = [];
  for (const id of squad.leftOutIds) {
    const row = byId.get(id);
    if (!row) continue;
    const life = parseJson(row.life_context, "life_context");
    // Tenhle zápas už jednou zpracovaný — obnova kola nesmí trestat dvakrát ani psát znovu
    if (life.leftOutMatch === matchId) return;
    const personality = parseJson(row.personality, "personality");
    const toldOut = writesToCoach && await coachTalkedSince(db, {
      clubTeamId: teamId, playerId: row.id, sinceIso: new Date(Date.now() - NOT_COUNTED_ON_DAYS * 86_400_000).toISOString(), about: "not_counted_on",
    });
    leftOut.push({
      id: row.id,
      lastName: row.last_name,
      position: row.position,
      overallRating: row.overall_rating,
      temper: Number(personality.temper ?? 40),
      discipline: Number(personality.discipline ?? 50),
      previousStreak: leftOutStreakFor(life, teamId),
      // Trenér mu v posledních dvou dnech sám psal o sestavě, nebo v posledních dvou týdnech, že
      // s ním nepočítá: ví to od něj, ne až ze sestavy.
      toldInAdvance: toldOut || (writesToCoach && await coachTalkedSince(db, {
        clubTeamId: teamId, playerId: row.id, sinceIso: new Date(Date.now() - 2 * 86_400_000).toISOString(), about: "lineup",
      })),
      toldOut,
      row,
      life,
    });
  }

  const stmts = leftOut.flatMap((p) => {
    const morale = Number(p.life.morale ?? 50);
    const newMorale = Math.max(0, Math.round(morale - moraleLoss(p, bench, coachMotivation)));
    // Opakovaná nenominace leze i do vztahu k trenérovi. Ve stejném batchi jako
    // leftOutMatch, takže obnova kola nemůže vztah strhnout dvakrát.
    const streak = p.previousStreak + 1;
    return [
      db.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.morale', ?, '$.leftOutStreak', ?, '$.leftOutMatch', ?, '$.leftOutTeamId', ?)
         WHERE id = ?`,
      ).bind(newMorale, streak, matchId, teamId, p.id),
      ...coachRelationStmts(db, {
        playerId: p.id,
        delta: -leftOutRelationDrop(p.previousStreak, coachMotivation),
        source: "left_out",
        description: `Už ${streak}. zápas v řadě nejel`,
        gameDate: gameDay,
      }),
    ];
  });
  if (stmts.length > 0) await db.batch(stmts);
  if (!writesToCoach) return;

  const rng = createRng(seedFromString(`left-out:${matchId}:${teamId}`));
  const complaint = pickComplainer(leftOut, bench, rng);
  if (!complaint) return;

  const sender = leftOut.find((p) => p.id === complaint.player.id)!;
  const previous = await loadOwnRecentLines(db, { playerId: sender.id, teamId, limit: TEMPLATE_HISTORY_LIMIT });

  // Na listině, nebo mu trenér napsal, že s ním nepočítá: neptá se, jestli se s ním počítá.
  const outReason = notCountedOn({ listing: await loadActiveListing(db, sender.id), toldOut: sender.toldOut });
  if (outReason && await sentNotCountedOnRecently(db, teamId, sender.id)) {
    logger.info({ module: "left-out", teamId }, `${sender.row.last_name} nejel, se kterým se nepočítá (${outReason}), už to trenérovi napsal`);
    return;
  }
  let text = outReason ? notCountedOnText(outReason, rng, previous) : complaintText(complaint, rng, previous);
  const reason: ComplaintReason | NotCountedOn = outReason ?? complaint.reason;
  const sulks = rng.random() < sulkChance(sender, complaint, coachMotivation);
  if (sulks) {
    text += ` ${SULK_SUFFIXES[Math.floor(rng.random() * SULK_SUFFIXES.length)]}`;
    const until = new Date(`${gameDay}T12:00:00Z`);
    until.setUTCDate(until.getUTCDate() + SULK_DAYS);
    const sulk: LeftOutSulk = { since: gameDay, until: until.toISOString().slice(0, 10), matchId, teamId, reason };
    await db.prepare("UPDATE players SET life_context = json_set(life_context, '$.leftOutSulk', json(?)) WHERE id = ?")
      .bind(JSON.stringify(sulk), sender.id).run();
  }

  const { sendPlayerSMS } = await import("../messaging/system-sms");
  await sendPlayerSMS(db, teamId, {
    id: sender.id,
    firstName: sender.row.first_name,
    lastName: sender.row.last_name,
    nickname: sender.row.nickname,
    avatar: sender.row.avatar,
  }, text, { type: "left_out", matchId, reason, sulk: sulks });
  logger.info({ module: "left-out", teamId }, `${sender.row.last_name} píše trenérovi, nejel na zápas (${reason}${sulks ? ", trucuje" : ""})`);
}

const NOT_COUNTED_ON: readonly string[] = ["on_market", "on_loan", "told_out"];

/**
 * Proč trucující hráč ví, že nejede (trucové vlákno, routes/messaging.ts): je teď na listině
 * nebo na hostování, nebo to napsal v SMS o nenominaci (`sulk.reason`, u starších trucu metadata
 * jeho poslední takové SMS). `null` = neví, ptá se, proč nejel.
 */
export async function knownLeftOutReason(
  db: D1Database, o: { playerId: string; convId: string; sulk?: Partial<LeftOutSulk> | null },
): Promise<NotCountedOn | null> {
  const listed = notCountedOn({ listing: await loadActiveListing(db, o.playerId), toldOut: false });
  if (listed) return listed;
  if (o.sulk?.reason) return NOT_COUNTED_ON.includes(o.sulk.reason) ? o.sulk.reason as NotCountedOn : null;
  const row = await db.prepare(
    `SELECT json_extract(metadata, '$.reason') AS reason FROM messages
      WHERE conversation_id = ? AND sender_type = 'player' AND json_extract(metadata, '$.type') = 'left_out'
      ORDER BY sent_at DESC LIMIT 1`,
  ).bind(o.convId).first<{ reason: string | null }>()
    .catch((e) => { logger.warn({ module: "left-out" }, `důvod nenominace v konverzaci ${o.convId}`, e); return null; });
  return row?.reason && NOT_COUNTED_ON.includes(row.reason) ? row.reason as NotCountedOn : null;
}

/** Napsal hráč v posledním týdnu, že ví, že se s ním nepočítá? Pak po dalším zápase mlčí. */
export async function sentNotCountedOnRecently(db: D1Database, teamId: string, playerId: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS x FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.participant_id = ? AND m.sender_type = 'player'
        AND json_extract(m.metadata, '$.type') = 'left_out'
        AND json_extract(m.metadata, '$.reason') IN ('on_market', 'on_loan', 'told_out')
        AND julianday(m.sent_at) >= julianday(?)
      LIMIT 1`,
  ).bind(teamId, playerId, new Date(Date.now() - NOT_COUNTED_ON_REPEAT_DAYS * 86_400_000).toISOString()).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: "left-out" }, `nedávná SMS hráče, se kterým se nepočítá ${playerId}`, e); return null; });
  return !!row;
}
