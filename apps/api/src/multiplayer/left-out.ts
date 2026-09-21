/**
 * Hráči, kteří se nevešli ani na lavičku.
 *
 * Po ligovém nebo pohárovém zápase lidského týmu klesne morálka každému zdravému hráči,
 * který na zápas nejel. Nejvýš jeden z nich (ten nejnaštvanější) napíše trenérovi SMS.
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

import { logger } from "../lib/logger";
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";

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

/** O kolik hráči klesne morálka za to, že nejel. */
export function moraleLoss(player: LeftOutPlayer, bench: BenchPlayer[]): number {
  let loss = 3;
  if (skippedFor(player, bench)) loss += 2;
  if (player.previousStreak >= 1) loss += 2;
  return loss;
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
}

/** Trucuje hráč v daný herní den? */
export function isSulking(sulk: unknown, gameDay: string): boolean {
  if (!sulk || typeof sulk !== "object") return false;
  const until = (sulk as Partial<LeftOutSulk>).until;
  return typeof until === "string" && until >= gameDay.slice(0, 10);
}

/** Šance, že pisatel naštvané SMS začne trucovat a vynechávat tréninky. */
export function sulkChance(player: LeftOutPlayer, complaint: { reason: ComplaintReason; streak: number }): number {
  const chance = 0.3
    + (complaint.reason === "skipped_for_weaker" ? 0.2 : 0)
    + (complaint.streak >= 2 ? 0.25 : 0)
    + (player.temper > 60 ? 0.2 : 0)
    - (player.discipline > 70 ? 0.25 : 0);
  return Math.max(0.05, Math.min(0.9, chance));
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
];

const STREAK_TEXTS: ReadonlyArray<(nth: string) => string> = [
  (nth) => `Už ${nth} po sobě jsem zůstal doma. Mám si začít hledat jinej klub?`,
  (nth) => `${capitalize(nth)} za sebou bez nominace. Řekněte mi rovnou, jestli se se mnou ještě počítá.`,
  (nth) => `Zase doma, už ${nth} v řadě. Tohle mě fakt nebaví.`,
  (nth) => `Už ${nth} jsem nejel ani na lavičku. Kluci se mi v hospodě smějou.`,
  (nth) => `Trenére, ${nth} po sobě nic. Jestli o mě nestojíte, tak to řekněte.`,
];

const GENERIC_TEXTS: readonly string[] = [
  "Ani na střídačku? Trenére, to mě fakt zamrzelo.",
  "Tak jsem se dozvěděl, že nejedu. Mohl jste mi to aspoň říct do očí.",
  "Celej tejden makám na tréninku a pak ani lavička. Tohle mě mrzí.",
  "Sedím doma a koukám na výsledky. Příště mě snad vezmete aspoň na lavičku.",
  "Trenére, co mám dělat jinak, abych se dostal aspoň do zápisu?",
  "Nejedu ani jako náhradník? To jsem teda nečekal.",
];

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
 * Text SMS. `previousText` je poslední zpráva téhož hráče — stejná věta dvakrát
 * po sobě by prozradila šablonu.
 */
export function complaintText(
  complaint: { reason: ComplaintReason; weaker: BenchPlayer | null; streak: number },
  rng: Rng,
  previousText?: string | null,
): string {
  const variants: string[] = complaint.reason === "skipped_for_weaker" && complaint.weaker
    ? SKIPPED_TEXTS.map((t) => t(complaint.weaker!.lastName))
    : complaint.reason === "streak"
      ? STREAK_TEXTS.map((t) => t(nthTime(complaint.streak)))
      : [...GENERIC_TEXTS];
  const start = Math.floor(rng.random() * variants.length);
  for (let i = 0; i < variants.length; i++) {
    const text = variants[(start + i) % variants.length];
    if (text !== previousText) return text;
  }
  return variants[start];
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
  const team = await db.prepare("SELECT user_id, game_date FROM teams WHERE id = ?").bind(teamId)
    .first<{ user_id: string | null; game_date: string | null }>();
  if (!team || team.user_id === "ai") return;
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

  const leftOut: Array<LeftOutPlayer & { row: PlayerRow; life: Record<string, unknown> }> = [];
  for (const id of squad.leftOutIds) {
    const row = byId.get(id);
    if (!row) continue;
    const life = parseJson(row.life_context, "life_context");
    // Tenhle zápas už jednou zpracovaný — obnova kola nesmí trestat dvakrát ani psát znovu
    if (life.leftOutMatch === matchId) return;
    const personality = parseJson(row.personality, "personality");
    leftOut.push({
      id: row.id,
      lastName: row.last_name,
      position: row.position,
      overallRating: row.overall_rating,
      temper: Number(personality.temper ?? 40),
      discipline: Number(personality.discipline ?? 50),
      previousStreak: Number(life.leftOutStreak ?? 0),
      row,
      life,
    });
  }

  const stmts = leftOut.map((p) => {
    const morale = Number(p.life.morale ?? 50);
    const newMorale = Math.max(0, Math.round(morale - moraleLoss(p, bench)));
    return db.prepare(
      `UPDATE players SET life_context = json_set(life_context, '$.morale', ?, '$.leftOutStreak', ?, '$.leftOutMatch', ?)
       WHERE id = ?`,
    ).bind(newMorale, p.previousStreak + 1, matchId, p.id);
  });
  if (stmts.length > 0) await db.batch(stmts);

  const rng = createRng(seedFromString(`left-out:${matchId}:${teamId}`));
  const complaint = pickComplainer(leftOut, bench, rng);
  if (!complaint) return;

  const sender = leftOut.find((p) => p.id === complaint.player.id)!;
  const previous = await db.prepare(
    `SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.team_id = ? AND c.participant_id = ? AND m.sender_type = 'player'
     ORDER BY m.sent_at DESC LIMIT 1`,
  ).bind(teamId, sender.id).first<{ body: string }>()
    .catch((e) => { logger.warn({ module: "left-out" }, "poslední zpráva hráče", e); return null; });

  let text = complaintText(complaint, rng, previous?.body);
  const sulks = rng.random() < sulkChance(sender, complaint);
  if (sulks) {
    text += ` ${SULK_SUFFIXES[Math.floor(rng.random() * SULK_SUFFIXES.length)]}`;
    const until = new Date(`${gameDay}T12:00:00Z`);
    until.setUTCDate(until.getUTCDate() + SULK_DAYS);
    const sulk: LeftOutSulk = { since: gameDay, until: until.toISOString().slice(0, 10), matchId };
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
  }, text, { type: "left_out", matchId, reason: complaint.reason, sulk: sulks });
  logger.info({ module: "left-out", teamId }, `${sender.row.last_name} píše trenérovi, nejel na zápas (${complaint.reason}${sulks ? ", trucuje" : ""})`);
}
