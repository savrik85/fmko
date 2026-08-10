/**
 * Organické nabídky hráčů — kamarád, hospodský, dorost, doporučení.
 * Generují se jako between-round events a přijdou jako SMS.
 */

import type { Rng } from "../generators/rng";
import { FIRSTNAMES } from "../data/czech-names";
import { generatePlayer, type VillageInfo } from "../generators/player";
import { generateHeightWeight } from "../generators/physicals";
import { getDistrictDataFromDB } from "../data/districts";
import { generatePlayerFace } from "../routes/teams";
import { overallRatingFromFlat } from "../skills/generator";
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
    ageRange: [16, 20] as [number, number],
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
    .bind(teamId).first<{ cnt: number }>().catch(() => ({ cnt: 0 }));
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

  const player = generatePlayer(rng, villageInfo, pos, surnameData, firstnameData);

  // Override age for source-specific ranges
  const age = rng.int(ageRange[0], ageRange[1]);
  const isYouth = sourceType.source === "youth";
  // Youth players are local kids — higher patriotism
  if (isYouth) player.patriotism = Math.min(20, (player.patriotism ?? 10) + rng.int(3, 6));

  // Dovednosti. MUSÍ jich být kompletní sada — dřív se generovalo jen 9 z 13 a hráčům
  // z nabídek pak v profilu svítily nuly u přehledu, kreativity a standardek, protože
  // je nikdo nikdy nedoplnil. Zkušenost chyběla taky.
  const fb = () => isYouth ? rng.int(3, 30) : rng.int(15, 45);
  const skills = {
    speed: isYouth ? rng.int(3, 30) : (player.speed ?? fb()),
    technique: isYouth ? rng.int(3, 30) : (player.technique ?? fb()),
    shooting: isYouth ? rng.int(3, 28) : (player.shooting ?? fb()),
    passing: isYouth ? rng.int(3, 28) : (player.passing ?? fb()),
    heading: isYouth ? rng.int(2, 25) : (player.heading ?? fb()),
    defense: isYouth ? rng.int(3, 28) : (player.defense ?? fb()),
    goalkeeping: isYouth ? (pos === "GK" ? rng.int(10, 35) : 0) : (player.goalkeeping ?? (pos === "GK" ? rng.int(30, 60) : 0)),
    stamina: isYouth ? rng.int(15, 45) : (player.stamina ?? fb()),
    strength: isYouth ? rng.int(5, 25) : (player.strength ?? fb()),
    vision: isYouth ? rng.int(3, 30) : fb(),
    creativity: isYouth ? rng.int(3, 28) : fb(),
    setPieces: isYouth ? rng.int(2, 26) : fb(),
    // Zkušenost roste s věkem stejně jako v hlavním generátoru (skills/generator.ts)
    experience: Math.min(100, Math.max(0, (age - 16) * rng.int(3, 6))),
  };

  // Výdrž a síla se ukládají do skills i do physical — MUSÍ tam být stejné číslo.
  // Dřív se do physical psaly hodnoty z generátoru a do skills jiné náhodné, takže
  // hodnocení počítalo s jednou a zápasový engine s druhou (u dorostenců rozdíl i 37 bodů).
  const physical = {
    stamina: skills.stamina,
    strength: skills.strength,
    injuryProneness: player.injuryProneness ?? 50,
    ...generateHeightWeight(rng, pos, player.bodyType ?? "normal"),
    preferredFoot: player.preferredFoot,
    preferredSide: player.preferredSide,
  };

  const hiddenTalent = isYouth ? rng.int(20, 65) : 0;

  // Hodnocení počítá TÁŽ funkce jako zbytek hry (včetně bonusu za skrytý talent).
  // Vlastní zjednodušený vzorec tu dřív dával jiné číslo, než jaké hráči vyšlo hned
  // po prvním tréninku — v UI to vypadalo, že mu rating bez důvodu skočil.
  const overallRating = overallRatingFromFlat(pos, skills, physical, hiddenTalent) ?? 30;
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
      discipline: player.discipline, patriotism: player.patriotism,
      alcohol: player.alcohol, temper: player.temper,
      ...(isYouth ? { hiddenTalent } : {}),
    }),
    JSON.stringify({ occupation: player.occupation, condition: 100, morale: 50 }),
    JSON.stringify(generatePlayerFace({ age: player.age ?? age, bodyType: player.bodyType ?? "normal", ethnicity: player.ethnicity })),
    weeklyWage, expiresAt.toISOString(), player.nationality ?? "CZ",
  ).run();

  logger.info({ module: "player-offers", teamId }, `new offer: ${player.firstName} ${player.lastName} (${pos}, ${overallRating}) from ${sourceType.source}`);

  // Pošli SMS notifikaci — najdi nebo vytvoř konverzaci pro tohoto odesílatele
  try {
    const posLabel: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
    const smsBody = `${message} — ${player.firstName} ${player.lastName}, ${age} let (${posLabel[pos] ?? pos}). Přijmi v Přestupy → Nabídky, pak ho najdeš v Kádru.`;
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
