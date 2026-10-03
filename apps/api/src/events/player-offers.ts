/**
 * Organické nabídky hráčů — kamarád, hospodský, dorost, doporučení.
 * Generují se jako between-round events a přijdou jako SMS.
 */

import type { Rng } from "../generators/rng";
import { FIRSTNAMES } from "../data/czech-names";
import type { VillageInfo } from "../generators/player";
import { getDistrictDataFromDB } from "../data/districts";
import { createPlayer, levelFromCategory, MARKET_SHIFT } from "../generators/create-player";
import { shiftForRating } from "../skills/generator";
import { logger } from "../lib/logger";

const SOURCES = [
  {
    source: "pub" as const,
    senderName: "Hospodský",
    senderTitle: "Místní kontakt",
    messages: [
      "V hospodě se ozval chlápek, že by chtěl chodit kopat. Prý hrával za sousední vesnici.",
      "Jeden štamgast říkal, že zná fotbalistu co hledá nový tým. Prej je šikovnej.",
      "Přišel tady jeden, prý umí kopat a nemá kde hrát. Dáte mu šanci?",
      "Slyšel jsem, že syn od Dvořáků se vrátil z vojny a hledá tým.",
    ],
  },
  {
    source: "youth" as const,
    senderName: "Trenér dorostu",
    senderTitle: "Mládež",
    messages: [
      "Mám tady jednoho šikovného kluka z dorostu, mohl by posílit áčko.",
      "V dorostu vyrostl zajímavý hráč, dal bych mu šanci v mužích.",
      "Jeden z mladých je připravený na přechod do mužského fotbalu.",
    ],
    ageRange: [16, 19] as [number, number],
  },
  {
    source: "friend" as const,
    senderName: "Kapitán",
    senderTitle: "Kapitán týmu",
    messages: [
      "Kámo, znám jednoho borce co hrál za okres vedle. Zeptám se ho jestli by nechtěl k nám?",
      "Můj spolužák z učňáku umí kopat, mohl bych ho přivést na trénink?",
      "Brácha od Nováka hrával za Lhenice, teď nemá tým. Chceš ho vidět?",
    ],
  },
  {
    source: "recommendation" as const,
    senderName: "Starosta",
    senderTitle: "Starosta obce",
    messages: [
      "Přistěhoval se tady jeden pán, prej hrával fotbal. Mohl by posílit váš tým.",
      "Na obci se hlásil nový občan, prý má zkušenosti s fotbalem.",
    ],
    ageRange: [28, 42] as [number, number],
  },
];

/** Zdroj nabídky — kdo hráče přivedl. */
export type OfferSource = (typeof SOURCES)[number]["source"];

/** Věk, pro který platí cíl „4–12 bodů pod průměrem áčka". Mladší kluk vyjde slabší podle věkové křivky. */
const YOUTH_TARGET_AGE = 20;

/**
 * Posun úrovně kluka z nabídky dorostu: dvacetiletý by vyšel 4–12 bodů pod průměrem áčka,
 * mladší podle věkové křivky méně (šestnáctiletý ~78 % toho, co by měl ve dvaceti). Nikdy
 * ale hůř, než jak ho dá generátor obci bez posunu. Posun zvedá jen dnešní úroveň, strop
 * zůstává podle obce (`keepLevelCaps`), jinak by kluk ze SMS předčil placenou akademii.
 */
export function youthOfferShift(level: string, position: "GK" | "DEF" | "MID" | "FWD", squadAverage: number | null | undefined, rng: Rng): number {
  if (!squadAverage) return 0;
  return Math.max(0, shiftForRating(level, position, YOUTH_TARGET_AGE, Math.round(squadAverage) - rng.int(4, 12)));
}

/**
 * Generate a player offer for a team. Returns null if conditions not met.
 * Called from daily-tick between-round events.
 */
export async function generatePlayerOffer(
  db: D1Database,
  rng: Rng,
  teamId: string,
  district: string,
  villageInfo: VillageInfo,
  gameDate: string,
  /** Vynutit konkrétní zdroj nabídky (jinak se losuje). Používá admin hromadné generování. */
  forceSource?: OfferSource,
): Promise<{ offerId: string; source: string; senderName: string; senderTitle: string; message: string; playerName: string } | null> {
  // Check pending offers — max 2 at a time
  const pending = await db.prepare("SELECT COUNT(*) as cnt FROM player_offers WHERE team_id = ? AND status = 'pending'")
    .bind(teamId).first<{ cnt: number }>()
    .catch((e) => { logger.warn({ module: "player-offers", teamId }, "count pending offers", e); return { cnt: 0 }; });
  if ((pending?.cnt ?? 0) >= 2) return null;

  // Pick source type
  const sourceType = (forceSource ? SOURCES.find((s) => s.source === forceSource) : undefined) ?? rng.pick(SOURCES);
  const ageRange = sourceType.ageRange ?? [18, 38];
  const message = rng.pick(sourceType.messages);

  // Generate the player
  const districtData = await getDistrictDataFromDB(db, district);
  const surnameData = { surnames: districtData.surnames, female_forms: {} as Record<string, string> };
  const firstnameData = { male: FIRSTNAMES, female: {} as Record<string, Record<string, number>> };

  const positions = ["GK", "DEF", "MID", "FWD"] as const;
  // Brankáři vzácně (~4 %) — trh i nabídky nemají být zaplavené gólmany
  const pos = rng.weighted({ GK: 1, DEF: 8, MID: 8, FWD: 7 }) as typeof positions[number];

  const age = rng.int(ageRange[0], ageRange[1]);
  const isYouth = sourceType.source === "youth";
  const level = levelFromCategory(villageInfo.category);

  // Kluk z dorostu se srovná s áčkem, dospělý zvenku má tržní posun (viz MARKET_SHIFT).
  const squadAverage = isYouth
    ? (await db.prepare("SELECT AVG(overall_rating) AS avg FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')")
        .bind(teamId).first<{ avg: number | null }>()
        .catch((e) => { logger.warn({ module: "player-offers", teamId }, "load squad average for youth offer", e); return null; }))?.avg
    : null;
  const created = createPlayer(rng, {
    position: pos, village: villageInfo, names: { surnameData, firstnameData }, age, level,
    shift: isYouth ? youthOfferShift(level, pos, squadAverage, rng) : MARKET_SHIFT,
    keepLevelCaps: isYouth,
  });
  const player = created.identity;
  const { skills, skillsMax, physical, hiddenTalent, rating: overallRating } = created;
  // Místní kluk z dorostu drží s klubem víc než přespolní.
  const personality = isYouth
    ? { ...created.personality, patriotism: Math.min(100, created.personality.patriotism + rng.int(10, 20)) }
    : created.personality;
  const weeklyWage = Math.round(10 + (overallRating / 100) * 400);

  const expiresAt = new Date(gameDate);
  expiresAt.setDate(expiresAt.getDate() + rng.int(3, 7));

  const offerId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO player_offers (id, team_id, source, source_name, message, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, expires_at, nationality)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    offerId, teamId, sourceType.source, sourceType.senderName, message,
    player.firstName, player.lastName, null, age, pos, overallRating,
    JSON.stringify(skills),
    JSON.stringify(physical),
    JSON.stringify({
      ...personality,
      // Talent se ukládá vždy — přijetí nabídky ho z personality čte a propisuje
      // do sloupce hidden_talent.
      hiddenTalent,
    }),
    // Strop rozvoje ze společného generátoru; přijetí nabídky ho odsud přenese do skills_max.
    JSON.stringify({ ...created.lifeContext, morale: 50, skillsMax }),
    JSON.stringify(created.avatar),
    weeklyWage, expiresAt.toISOString(), created.nationality,
  ).run();

  logger.info({ module: "player-offers", teamId }, `new offer: ${player.firstName} ${player.lastName} (${pos}, ${overallRating}) from ${sourceType.source}`);

  // Pošli SMS notifikaci — najdi nebo vytvoř konverzaci pro tohoto odesílatele
  try {
    const posLabel: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
    const smsBody = `${message} ${player.firstName} ${player.lastName}, ${age} let (${posLabel[pos] ?? pos}). Přijmi v Přestupy → Nabídky, pak ho najdeš v Kádru.`;
    let convId = await db.prepare(
      "SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?"
    ).bind(teamId, sourceType.senderTitle).first<{ id: string }>().then((r) => r?.id).catch((e) => { logger.warn({ module: "player-offers" }, "find conv", e); return null; });
    if (!convId) {
      convId = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
      ).bind(convId, teamId, sourceType.senderTitle).run().catch((e) => logger.warn({ module: "player-offers" }, "create conv", e));
    }
    await db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
    ).bind(crypto.randomUUID(), convId, sourceType.senderName, smsBody).run().catch((e) => logger.warn({ module: "player-offers" }, "insert msg", e));
    await db.prepare(
      "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?"
    ).bind(smsBody.slice(0, 100), convId).run().catch((e) => logger.warn({ module: "player-offers" }, "update conv", e));
  } catch (e) {
    logger.warn({ module: "player-offers" }, "SMS notification failed", e);
  }

  return {
    offerId,
    source: sourceType.source,
    senderName: sourceType.senderName,
    senderTitle: sourceType.senderTitle,
    message,
    playerName: `${player.firstName} ${player.lastName}`,
  };
}
