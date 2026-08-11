/**
 * Dopad odmítnutí/vypršení přestupové nabídky na hráče + zpracování trucu.
 *
 * Hráč NIKDY neodejde bez souhlasu manažera — nejhorší dopad je morálka,
 * docházka a simulované ("fake") zranění. Stav trucu žije v
 * players.life_context → $.transferUnrest:
 *   { level: 0-100, reason, offerId, teamName, since, lastImpactAt, lastActionAt,
 *     fakeInjuryUsed, fakeInjuryAt, fakeInjuryHintSent, wageRaised,
 *     pledge: {type: "minutes"|"transfer", madeAt, deadline} | null }
 */

import { computeInterestForOffer, INTEREST_LABELS } from "./player-interest";
import { sendPlayerSMS, sendSystemSMS } from "../messaging/system-sms";
import { logger } from "../lib/logger";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const DAY_MS = 86400000;

export interface TransferUnrest {
  level: number;
  reason?: string;
  offerId?: string;
  teamName?: string;
  since?: string;
  lastImpactAt?: string;
  lastActionAt?: string;
  fakeInjuryUsed?: boolean;
  fakeInjuryAt?: string;
  fakeInjuryHintSent?: boolean;
  wageRaised?: boolean;
  pledge?: { type: "minutes" | "transfer"; madeAt: string; deadline: string } | null;
}

export function parseUnrest(lifeContext: string | null | undefined): TransferUnrest | null {
  try {
    const lc = lifeContext ? JSON.parse(lifeContext) : {};
    return lc.transferUnrest ?? null;
  } catch {
    return null;
  }
}

// ── SMS šablony hráče po odmítnuté nabídce (deterministické, bez AI) ──
const REJECTED_SMS_WANTS: string[] = [
  "Trenére, slyšel jsem, že {team} o mě stál. A vy jste to smetl ze stolu? Tohle si budu pamatovat.",
  "Trenére, proč jste mi neřekl o té nabídce od {team}? Chtěl jsem to aspoň probrat. Zklamání.",
  "Trenére, {team} mě chtěl a vy jste to zařízl. Nevím, jestli tu ještě vidím budoucnost.",
];
const REJECTED_SMS_WANTS_HOT: string[] = [
  "To si děláte srandu?! {team} mě chtěl a vy to hodíte do koše bez jediného slova?!",
  "Tak takhle teda ne, trenére. {team} byla moje šance a vy jste mi ji sebral. Uvidíme, jak se vám bude hrát beze mě.",
];
const REJECTED_SMS_LOYAL: string[] = [
  "Trenére, díky že jste tu nabídku odmítl. Jsem tady doma a jinam nechci.",
  "Trenére, slyšel jsem o té nabídce. Dobře, že jste ji poslal k šípku. Já svůj dres nevyměním.",
];

// ── Fake injury katalog (vypadá jako běžné zranění, smsText je výmluva hráče) ──
const FAKE_INJURIES: { type: string; description: string; smsText: string }[] = [
  { type: "zada", description: "Bolesti zad", smsText: "Trenére, chytly mě záda. Doktor říká, že to bude na pár týdnů. Nemůžu se ani ohnout." },
  { type: "sval", description: "Natažený sval", smsText: "Trenére, cítím ten sval už od tréninku. Radši to nebudu pokoušet, nechci si to utrhnout." },
  { type: "koleno", description: "Bolest v koleni", smsText: "Trenére, to koleno prostě nejde. Píchá v něm při každém kroku, musím pauzírovat." },
];

interface OfferLike {
  id?: unknown;
  player_id?: unknown;
  from_team_id?: unknown;
  to_team_id?: unknown;
  offer_amount?: unknown;
  counter_amount?: unknown;
  offer_type?: unknown;
  virtual_team_data?: unknown;
  message?: unknown;
}

/**
 * Aplikuje dopad odmítnutí (reject) nebo vypršení (expire) nabídky na hráče.
 * Volat JEN když nabídku zamítl/nechal vypršet vlastník hráče.
 */
export async function applyOfferRejectionImpact(
  db: D1Database,
  offer: OfferLike,
  trigger: "reject" | "expire",
  env?: { GEMINI_API_KEY?: string; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_SUBJECT?: string; DB?: D1Database },
): Promise<void> {
  const playerId = offer.player_id as string;
  const sellerTeamId = offer.to_team_id as string;
  const fromTeamId = offer.from_team_id as string;
  const amount = (offer.counter_amount != null ? offer.counter_amount : offer.offer_amount) as number;
  const isLoan = (offer.offer_type as string) === "loan";

  // Hráč musí pořád patřit prodávajícímu (mohl mezitím odejít)
  const player = await db.prepare(
    "SELECT id, first_name, last_name, nickname, avatar, team_id, personality, life_context, coach_relationship FROM players WHERE id = ? AND team_id = ?"
  ).bind(playerId, sellerTeamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "rejection-impact" }, "load player", e); return null; });
  if (!player) return;

  // Jméno nabízejícího klubu
  let teamName = "Neznámý klub";
  let virtualRating: number | null = null;
  if (fromTeamId === "virtual_ai") {
    try {
      const vd = offer.virtual_team_data ? JSON.parse(offer.virtual_team_data as string) : null;
      if (vd?.name) teamName = vd.name;
      if (vd?.rating) virtualRating = vd.rating;
    } catch (e) { logger.warn({ module: "rejection-impact" }, "parse vtd", e); }
  } else {
    const t = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(fromTeamId).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: "rejection-impact" }, "load buyer name", e); return null; });
    if (t?.name) teamName = t.name;
  }

  // Čerstvý přepočet zájmu — dopad odpovídá AKTUÁLNÍMU stavu hráče
  const interest = await computeInterestForOffer(db, playerId, { fromTeamId, offerAmount: amount, virtualRating });
  if (!interest) return;

  const pers = (() => { try { return JSON.parse(player.personality as string) ?? {}; } catch { return {}; } })();
  const lc = (() => { try { return JSON.parse(player.life_context as string) ?? {}; } catch { return {}; } })();
  const unrest: TransferUnrest = lc.transferUnrest ?? { level: 0 };
  const morale: number = typeof lc.morale === "number" ? lc.morale : 50;
  const nowIso = new Date().toISOString();
  const playerRef = {
    id: player.id as string,
    firstName: player.first_name as string,
    lastName: player.last_name as string,
    nickname: player.nickname as string | null,
    avatar: player.avatar as string | null,
  };

  // Hráč odejít nechtěl → žádný trest; věrný patriot má z odmítnutí radost
  if (interest.level <= 1) {
    if (interest.level === 0 && (pers.patriotism ?? 50) > 70) {
      const newMorale = clamp(morale + 2, 0, 100);
      await db.prepare("UPDATE players SET life_context = json_set(life_context, '$.morale', ?) WHERE id = ?")
        .bind(newMorale, playerId).run().catch((e) => logger.warn({ module: "rejection-impact" }, "loyal morale boost", e));
      await sendPlayerSMS(db, sellerTeamId, playerRef, pick(REJECTED_SMS_LOYAL).replace("{team}", teamName));
    }
    return;
  }

  // Slib prodeje porušen dalším odmítnutím → maximální vztek
  const brokenTransferPledge = unrest.pledge?.type === "transfer" && new Date(unrest.pledge.deadline) > new Date();

  // Anti-stack: dopad max 1× za 7 dní v plné síle
  const recentImpact = unrest.lastImpactAt && (Date.now() - new Date(unrest.lastImpactAt).getTime()) < 7 * DAY_MS;
  const stackFactor = recentImpact ? 0.3 : 1;
  const loanFactor = isLoan ? 0.5 : 1;
  const temper: number = pers.temper ?? 40;
  const temperScale = 0.75 + temper / 200; // 0.75–1.25

  let moraleDelta = Math.round((interest.level === 3 ? -10 : -6) * temperScale * loanFactor * stackFactor);
  let coachRelDelta = Math.round((interest.level === 3 ? -6 : -3) * loanFactor * stackFactor);
  // Klubová kronika a vitrína — hráč, kterému klub něco znamená, odchází neradi.
  // U rodáků (vysoký patriotism) váží dvojnásob: ty fotky v klubovně jsou jejich.
  const trophyFx = await (async () => {
    const row = await db.prepare("SELECT trophy_case, trophy_case_condition FROM equipment WHERE team_id = ?")
      .bind(sellerTeamId).first<{ trophy_case: number; trophy_case_condition: number }>()
      .catch((e) => { logger.warn({ module: "rejection-impact" }, "load trophy case", e); return null; });
    if (!row?.trophy_case) return 0;
    return row.trophy_case * ((row.trophy_case_condition ?? 50) / 100) * 0.12;
  })();
  const patriotism: number = pers.patriotism ?? 50;
  const loyaltyMod = Math.min(0.6, trophyFx * (patriotism >= 70 ? 2 : 1));

  let unrestAdd = Math.round((interest.level === 3 ? 55 : 35) * loanFactor * stackFactor * (1 - loyaltyMod));
  let newLevel = clamp(Math.round(unrest.level + unrestAdd), 0, 100);

  if (brokenTransferPledge) {
    moraleDelta = -12;
    coachRelDelta = -8;
    newLevel = 90;
  }

  const newMorale = clamp(morale + moraleDelta, 0, 100);
  const newUnrest: TransferUnrest = {
    ...unrest,
    level: newLevel,
    reason: brokenTransferPledge ? "broken_pledge" : "rejected_offer",
    offerId: (offer.id as string) ?? unrest.offerId,
    teamName,
    since: unrest.since ?? nowIso,
    lastImpactAt: nowIso,
    pledge: brokenTransferPledge ? null : (unrest.pledge ?? null),
  };

  await db.prepare(
    "UPDATE players SET life_context = json_set(life_context, '$.morale', ?, '$.transferUnrest', json(?)), coach_relationship = MAX(0, COALESCE(coach_relationship, 50) + ?) WHERE id = ?"
  ).bind(newMorale, JSON.stringify(newUnrest), coachRelDelta, playerId).run()
    .catch((e) => logger.warn({ module: "rejection-impact" }, "apply impact", e));

  // SMS od hráče — naštvání podle tempera; při porušeném slibu vždy nejostřejší
  const pool = brokenTransferPledge || temper > 65 ? REJECTED_SMS_WANTS_HOT : REJECTED_SMS_WANTS;
  const smsBody = brokenTransferPledge
    ? `Slíbil jste, že mě při další dobré nabídce pustíte! ${teamName} přišel a vy nic. S vámi jsem skončil.`
    : pick(pool).replace("{team}", teamName);
  const convId = await sendPlayerSMS(db, sellerTeamId, playerRef, smsBody);

  // Otevřít živou konverzaci (AI thread): trenér může volně odpovědět, hráč reaguje,
  // po max 2 výměnách AI vyhodnotí dopad (viz applyResolutionAndClose — upravuje i truc).
  // Bez Gemini klíče thread neaktivujeme — zůstanou usmiřovací chips.
  if (env?.GEMINI_API_KEY) {
    await db.prepare(
      `UPDATE conversations
       SET ai_thread_active = 1, ai_thread_last_at = ?,
           ai_thread_state = ?
       WHERE id = ? AND ai_thread_active != 1`
    ).bind(
      nowIso,
      JSON.stringify({
        trigger: "rejected_offer",
        scenario_id: "rejected_offer",
        max_replies: 2,
        current_replies: 0,
        awaiting: "coach",
        initiated_at: nowIso,
        player_id: playerId,
        resolution: null,
      }),
      convId,
    ).run().catch((e) => logger.warn({ module: "rejection-impact" }, "activate unrest thread", e));
  }

  // In-app notifikace (+push, pokud má env VAPID klíče)
  try {
    const { createNotification } = await import("../community/notifications");
    const pushEnv = env?.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
      ? { VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: env.VAPID_SUBJECT, DB: db }
      : undefined;
    await createNotification(db, sellerTeamId, "transfer",
      `😠 ${playerRef.firstName} ${playerRef.lastName} je naštvaný`,
      `${trigger === "expire" ? "Nabídka od" : "Odmítl jsi nabídku od"} ${teamName} — hráč o přestup stál (${INTEREST_LABELS[interest.level]}).`,
      `/dashboard/player/${playerId}`,
      pushEnv);
  } catch (e) { logger.warn({ module: "rejection-impact" }, "unrest notification", e); }

  logger.info({ module: "rejection-impact" },
    `${trigger}: ${playerRef.firstName} ${playerRef.lastName} interest=${interest.level} morale ${morale}→${newMorale} unrest ${unrest.level}→${newLevel}`);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Denní zpracování trucu (volané z transfer pressure ticku):
 * decay, fake injury, fyzio nápověda, zázračné uzdravení, kontrola slibů.
 * Jeden SELECT + malé množství cílených UPDATE (trucujících hráčů je jednotky).
 */
export async function processTransferUnrest(db: D1Database): Promise<number> {
  const rows = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nickname, p.avatar, p.team_id, p.personality, p.life_context,
            (SELECT COUNT(*) FROM injuries i WHERE i.player_id = p.id AND i.days_remaining > 0) as active_injuries,
            (SELECT COUNT(*) FROM injuries i WHERE i.player_id = p.id AND i.is_fake = 1 AND i.days_remaining > 0) as active_fake
     FROM players p JOIN teams t ON p.team_id = t.id
     WHERE t.user_id != 'ai' AND json_extract(p.life_context, '$.transferUnrest') IS NOT NULL`
  ).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "rejection-impact" }, "load unrest players", e); return { results: [] as Record<string, unknown>[] }; });

  let processed = 0;
  for (const row of rows.results) {
    try {
      await processUnrestPlayer(db, row);
      processed++;
    } catch (e) {
      logger.warn({ module: "rejection-impact" }, `unrest processing for ${row.id} failed`, e);
    }
  }
  return processed;
}

async function processUnrestPlayer(db: D1Database, row: Record<string, unknown>): Promise<void> {
  const playerId = row.id as string;
  const teamId = row.team_id as string;
  const lc = (() => { try { return JSON.parse(row.life_context as string) ?? {}; } catch { return {}; } })();
  const pers = (() => { try { return JSON.parse(row.personality as string) ?? {}; } catch { return {}; } })();
  const unrest: TransferUnrest = lc.transferUnrest;
  if (!unrest) return;
  const playerRef = {
    id: playerId,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    nickname: row.nickname as string | null,
    avatar: row.avatar as string | null,
  };
  const hasFakeInjury = ((row.active_fake as number) ?? 0) > 0;
  const nowIso = new Date().toISOString();

  // 1) Kontrola slibu minut (pledge 'minutes') — 2 ze 3 zápasů týmu od slibu v základu (45+ min)
  let pledgeBroken = false;
  if (unrest.pledge?.type === "minutes") {
    const verdict = await checkMinutesPledge(db, playerId, teamId, unrest.pledge);
    if (verdict === "kept") {
      unrest.pledge = null;
      unrest.level = clamp(unrest.level - 10, 0, 100);
      await sendPlayerSMS(db, teamId, playerRef, "Trenére, díky že jste dodržel slovo s tou sestavou. Vážím si toho.");
    } else if (verdict === "broken") {
      pledgeBroken = true;
      unrest.pledge = null;
      unrest.level = clamp(unrest.level + 35, 0, 100);
      const morale: number = typeof lc.morale === "number" ? lc.morale : 50;
      lc.morale = clamp(morale - 8, 0, 100);
      await sendPlayerSMS(db, teamId, playerRef, "Sliboval jste mi místo v sestavě, trenére. A já zase sedím. Tohle nemá cenu.");
    }
  } else if (unrest.pledge?.type === "transfer" && new Date(unrest.pledge.deadline) < new Date()) {
    // Slib prodeje vypršel bez další nabídky — smazat (porušení řeší applyOfferRejectionImpact)
    unrest.pledge = null;
  }

  // 2) Decay −3/den (když se nic nestalo)
  if (!pledgeBroken) {
    unrest.level = clamp(unrest.level - 3, 0, 100);
  }

  // 3) Konec trucu → uklidit (a zázračně uzdravit případnou fake injury)
  if (unrest.level <= 0) {
    await db.prepare("UPDATE players SET life_context = json_remove(life_context, '$.transferUnrest') WHERE id = ?")
      .bind(playerId).run().catch((e) => logger.warn({ module: "rejection-impact" }, "remove unrest", e));
    if (hasFakeInjury) await healFakeInjury(db, teamId, playerRef);
    return;
  }

  // 4) Zázračné uzdravení — truc klesl pod 40, fake injury ztratila smysl
  if (hasFakeInjury && unrest.level < 40) {
    await healFakeInjury(db, teamId, playerRef);
  } else if (hasFakeInjury && !unrest.fakeInjuryHintSent && unrest.fakeInjuryAt
    && (Date.now() - new Date(unrest.fakeInjuryAt).getTime()) >= 3 * DAY_MS) {
    // 5) Fyzio nápověda 3. den — manažer dostane stopu, že zranění je podezřelé
    await sendSystemSMS(db, teamId, "Fyzioterapeut",
      `Trenére, byl jsem se podívat na ${playerRef.firstName} ${playerRef.lastName}. Na tom zranění mi něco nesedí — na rovinu, podle mě mu nic není. Zkuste si s ním promluvit.`);
    unrest.fakeInjuryHintSent = true;
  }

  // 6) Nová fake injury — hodně naštvaný, zdravý, ještě to nezkusil
  if (!hasFakeInjury && unrest.level >= 60 && !unrest.fakeInjuryUsed && ((row.active_injuries as number) ?? 0) === 0) {
    const temper: number = pers.temper ?? 40;
    const chance = 0.10 + temper / 500; // 0.10–0.30
    if (Math.random() < chance) {
      const inj = FAKE_INJURIES[Math.floor(Math.random() * FAKE_INJURIES.length)];
      const days = 7 + Math.floor(Math.random() * 8); // 7–14
      await db.prepare(
        "INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total, is_fake) VALUES (?, ?, ?, ?, ?, 'stredni', ?, ?, 1)"
      ).bind(crypto.randomUUID(), playerId, teamId, inj.type, inj.description, days, days).run()
        .catch((e) => logger.warn({ module: "rejection-impact" }, "insert fake injury", e));
      await sendPlayerSMS(db, teamId, playerRef, inj.smsText);
      unrest.fakeInjuryUsed = true;
      unrest.fakeInjuryAt = nowIso;
      unrest.level = clamp(Math.min(unrest.level, 55), 0, 100);
      logger.info({ module: "rejection-impact" }, `fake injury: ${playerRef.firstName} ${playerRef.lastName} (${inj.type}, ${days}d)`);
    }
  }

  lc.transferUnrest = unrest;
  await db.prepare("UPDATE players SET life_context = json(?) WHERE id = ?")
    .bind(JSON.stringify(lc), playerId).run()
    .catch((e) => logger.warn({ module: "rejection-impact" }, "save unrest", e));
}

/** Smaže fake injury a pošle zprávu o zázračném uzdravení. */
async function healFakeInjury(
  db: D1Database,
  teamId: string,
  playerRef: { id: string; firstName: string; lastName: string; nickname?: string | null; avatar?: string | null },
): Promise<void> {
  await db.prepare("DELETE FROM injuries WHERE player_id = ? AND is_fake = 1").bind(playerRef.id).run()
    .catch((e) => logger.warn({ module: "rejection-impact" }, "heal fake injury", e));
  await sendPlayerSMS(db, teamId, playerRef, "Trenére, dobrá zpráva — cítím se najednou mnohem líp. Můžu zase naskočit do tréninku.");
}

/**
 * Vyhodnotí slib minut: hráč měl být v základu (45+ min) ve 2 ze 3 zápasů týmu od slibu.
 * "pending" = tým ještě neodehrál 3 zápasy a slib nelze rozhodnout.
 */
async function checkMinutesPledge(
  db: D1Database,
  playerId: string,
  teamId: string,
  pledge: { madeAt: string; deadline: string },
): Promise<"kept" | "broken" | "pending"> {
  const matches = await db.prepare(
    `SELECT m.id FROM matches m
     WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'simulated' AND m.simulated_at > ?
     ORDER BY m.simulated_at ASC LIMIT 3`
  ).bind(teamId, teamId, pledge.madeAt).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "rejection-impact" }, "pledge matches", e); return { results: [] as { id: string }[] }; });

  if (matches.results.length < 3) {
    // Deadline vypršel dřív, než tým odehrál 3 zápasy → posoudit co je (1-2 zápasy: stačí 1 start)
    if (new Date(pledge.deadline) < new Date()) {
      if (matches.results.length === 0) return "kept"; // nebylo co plnit
    } else {
      return "pending";
    }
  }

  const ids = matches.results.map((m) => m.id);
  const placeholders = ids.map(() => "?").join(",");
  const started = await db.prepare(
    `SELECT COUNT(*) as starts FROM match_player_stats WHERE player_id = ? AND match_id IN (${placeholders}) AND minutes_played >= 45`
  ).bind(playerId, ...ids).first<{ starts: number }>()
    .catch((e) => { logger.warn({ module: "rejection-impact" }, "pledge starts", e); return null; });

  const starts = started?.starts ?? 0;
  const needed = matches.results.length >= 3 ? 2 : 1;
  return starts >= needed ? "kept" : "broken";
}
