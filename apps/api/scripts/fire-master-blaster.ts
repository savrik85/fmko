/**
 * Ad-hoc skript: reset SK Čkyně z lidské správy zpět na AI tým.
 *
 * Smaže 20 lidských hráčů (a jejich stats/kontrakty/zranění/vztahy/training log),
 * stadion, equipment, sponzory, transakce, konverzace, transfer aktivitu, manažera
 * Master Blastera a další lidsko-specifická data. Pak vygeneruje čerstvou AI sadu:
 * 20 nových hráčů, manažer, stadion, relationships. Nakonec přidá článek o vyhození.
 *
 * Zachovává: teams řádek (jen user_id='ai' + reset herních polí), historii zápasů,
 * badge/barvy/nickname/anthem/founding_story.
 *
 * Skript nepíše do D1 přímo (D1 binding je Workers-only). Místo toho vygeneruje
 * SQL soubor, který se ručně spustí přes wrangler:
 *
 *   npx tsx apps/api/scripts/fire-master-blaster.ts
 *   npx wrangler d1 execute prales-db-prod --remote --file scripts/fire-master-blaster/run.sql
 */

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { createRng } from "../src/generators/rng";
import { generateSquad } from "../src/generators/player";
import { generateNickname } from "../src/generators/nickname";
import { generateRelationships } from "../src/generators/relationships";
import { generateAiManager } from "../src/generators/manager-generator";
import { generateStadium } from "../src/stadium/stadium-generator";
import {
  generateFieldSkills,
  generateGKSkills,
  generateHiddenTalent,
  calculateOverallRating,
} from "../src/skills/generator";
import { generateDescription } from "../src/generators/description-generator";
import { pickOccupation } from "../src/generators/occupations";

// ===== KONSTANTY =====
const TEAM_ID = "01f283b9-6e9b-42f0-a214-410175a65a96";
const LEAGUE_ID = "7a82b469-d4db-4ee6-b730-2ec85a68122d";
const VILLAGE_DISTRICT = "Prachatice";
const VILLAGE_POPULATION = 1550;
const VILLAGE_SIZE = "village"; // raw value z DB sloupce
const SEASON_ID = "season-1";
const AI_BUDGET = 40000; // 1550 obyvatel → mid tier (500-5000 → 40k)

// ===== PATHS =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../../..");

// ===== DATA: surnames (CZ031 = Jihočeský kraj, kam patří Prachatice) =====
type SurnameJson = Record<string, { surnames: Record<string, number>; female_forms: Record<string, string> }>;
const surnamesJson = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "data/seed/surnames_by_region.json"), "utf8"),
) as SurnameJson;
const surnameData = surnamesJson["CZ031"];

// ===== DATA: firstnames (hardcoded z apps/api/src/routes/teams.ts:238-247) =====
const firstnameData = {
  male: {
    "1960s": { "Jiří": 0.08, "Jan": 0.07, "Petr": 0.06, "Josef": 0.06, "Jaroslav": 0.05, "Milan": 0.05, "Zdeněk": 0.04 },
    "1970s": { "Petr": 0.08, "Jan": 0.07, "Martin": 0.06, "Jiří": 0.06, "Pavel": 0.05, "Tomáš": 0.04, "Roman": 0.03 },
    "1980s": { "Jan": 0.08, "Martin": 0.07, "Tomáš": 0.06, "Pavel": 0.05, "Michal": 0.05, "David": 0.05, "Lukáš": 0.04 },
    "1990s": { "Jan": 0.09, "Tomáš": 0.07, "Jakub": 0.06, "David": 0.06, "Lukáš": 0.05, "Ondřej": 0.05, "Filip": 0.04 },
    "2000s": { "Jakub": 0.08, "Jan": 0.07, "Adam": 0.06, "Matěj": 0.06, "Ondřej": 0.05, "Filip": 0.05, "Vojtěch": 0.04 },
    "2010s": { "Jakub": 0.07, "Jan": 0.07, "Adam": 0.06, "Vojtěch": 0.05, "Filip": 0.05, "Tomáš": 0.05, "Šimon": 0.04 },
  },
  female: {} as Record<string, Record<string, number>>,
};

// ===== VILLAGE INFO (mapování village.size → category per teams.ts:222-226) =====
// hamlet → vesnice; village → obec; town → mestys; else → mesto
const villageInfo = {
  region_code: "CZ031",
  category: "obec" as const,
  population: VILLAGE_POPULATION,
  district: VILLAGE_DISTRICT,
};

// ===== RNG (deterministický seed s time-component, aby každé spuštění bylo unikátní) =====
function hashStringToInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}
const seed = (hashStringToInt(`${TEAM_ID}-reset-${Date.now()}`) & 0x7fffffff) | 0;
const rng = createRng(seed);

// ===== generatePlayerFace (kopie z apps/api/src/routes/teams.ts:42-104) =====
// Routes/teams.ts importuje Hono → nelze přímo importovat v Node.js skriptu.
// Funkce je čistá, jen Math.random + statické arrays.
function generatePlayerFace(player: { age: number; bodyType: string }): Record<string, unknown> {
  const r = () => Math.random();
  const pick = <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)];
  const skinColors = ["#f2d6cb", "#ddb7a0", "#e8c4a0", "#f5d5c0", "#d4a882", "#eabd93", "#f0c8a8"];
  const hairColors = ["#1a1a1a", "#3b2214", "#5b3a1a", "#8b6e3e", "#d4a843", "#a0330a"];
  const headIds = ["head1", "head3", "head6", "head8", "head9", "head10", "head11", "head13"];
  const eyeIds = ["eye1", "eye3", "eye6", "eye9", "eye11", "eye13", "eye16"];
  const noseIds = ["nose1", "nose2", "nose6", "nose9", "nose13", "nose14", "honker", "pinocchio"];
  const mouthIds = ["mouth", "mouth2", "mouth3", "mouth5", "smile3", "smile4", "straight", "closed"];
  const hairIds = ["short-fade", "tall-fade", "crop-fade2", "fauxhawk-fade", "spike4", "curly", "shaggy1", "emo", "short-bald"];
  const earIds = ["ear1", "ear2", "ear3"];
  const eyebrowIds = ["eyebrow2", "eyebrow3", "eyebrow4", "eyebrow7", "eyebrow10", "eyebrow13", "eyebrow14", "eyebrow16", "eyebrow20"];
  const facialHairIds = ["none", "none", "none", "goatee3", "goatee4", "goatee6", "goatee15", "fullgoatee2", "goatee-thin-stache"];

  let fatness = 0.3 + r() * 0.4;
  if (player.bodyType === "obese") fatness = 0.7 + r() * 0.3;
  else if (player.bodyType === "stocky") fatness = 0.55 + r() * 0.25;
  else if (player.bodyType === "thin") fatness = 0.05 + r() * 0.2;
  else if (player.bodyType === "athletic") fatness = 0.15 + r() * 0.2;

  const youngHairIds = ["curly", "shaggy1", "emo", "fauxhawk-fade", "tall-fade", "spike4"];
  let hairId = player.age < 25 ? pick(youngHairIds) : pick(hairIds);
  let hairColor = pick(hairColors);
  if (player.age > 45 && r() < 0.6) hairId = "short-bald";
  else if (player.age > 38 && r() < 0.35) hairId = "short-bald";
  if (player.age > 42) hairColor = r() < 0.5 ? "#8e8e8e" : "#b0b0b0";
  if (player.age > 50) hairColor = "#c0c0c0";

  let facialHairId = "none";
  if (player.age > 20 && r() < 0.35) facialHairId = pick(facialHairIds);
  const skinColor = pick(skinColors);

  return {
    fatness,
    teamColors: ["#F59E0B", "#FFFFFF", "#1D4ED8"], // barvy SK Čkyně
    hairBg: { id: "none" },
    body: { id: pick(["body", "body2", "body3", "body5"]), color: skinColor, size: 0.95 + r() * 0.1 },
    jersey: { id: "jersey" },
    ear: { id: pick(earIds), size: 0.6 + r() * 0.4 },
    head: { id: pick(headIds), shave: "rgba(0,0,0,0)", fatness },
    eyeLine: { id: pick(["line1", "line2", "line3", "line4"]) },
    smileLine: { id: pick(["line1", "line2", "line3"]), size: 0.8 + r() * 0.4 },
    miscLine: { id: "none" },
    facialHair: { id: facialHairId },
    eye: { id: pick(eyeIds), angle: -4 + r() * 8 },
    eyebrow: { id: pick(eyebrowIds), angle: -4 + r() * 8 },
    hair: { id: hairId, color: hairColor, flip: r() < 0.5 },
    mouth: { id: pick(mouthIds), flip: r() < 0.5 },
    nose: { id: pick(noseIds), flip: r() < 0.5, size: 0.7 + r() * 0.6 },
    glasses: { id: r() < 0.08 ? "glasses1" : "none" },
    accessories: { id: "none" },
  };
}

// ===== SQL helpers =====
function sqlStr(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  return "'" + String(v).replace(/'/g, "''") + "'";
}
const sqlJson = (v: unknown): string => sqlStr(JSON.stringify(v));

// ===== GENEROVÁNÍ HRÁČŮ =====
const squad = generateSquad(rng, villageInfo, surnameData, firstnameData);
const usedNicknames = new Set<string>();

interface PreparedPlayer {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string;
  age: number;
  position: string;
  rating: number;
  skills: unknown;
  physical: unknown;
  personality: unknown;
  lifeContext: unknown;
  avatar: unknown;
  description: string;
  skillsMax: unknown;
  hiddenTalent: number;
  experience: number;
  weeklyWage: number;
}

const prepared: PreparedPlayer[] = [];

for (const ap of squad) {
  const isGK = ap.position === "GK";
  const fieldSkills = !isGK
    ? generateFieldSkills(rng, ap.position as "DEF" | "MID" | "FWD", VILLAGE_SIZE, ap.age, true)
    : null;
  const gkSkills = isGK ? generateGKSkills(rng, VILLAGE_SIZE, ap.age, true) : null;
  const hiddenTalent = generateHiddenTalent(rng, VILLAGE_SIZE);
  const nickname = generateNickname(rng, ap, usedNicknames) ?? "";

  const skills = isGK
    ? { speed: 0, technique: 0, shooting: 0, passing: gkSkills!.distribution.current, heading: 0, defense: 0, goalkeeping: gkSkills!.reflexes.current, creativity: 0, setPieces: 0 }
    : { speed: fieldSkills!.speed.current, technique: fieldSkills!.technique.current, shooting: fieldSkills!.shooting.current, passing: fieldSkills!.passing.current, heading: fieldSkills!.heading.current, defense: fieldSkills!.defense.current, goalkeeping: 0, creativity: fieldSkills!.creativity.current, setPieces: fieldSkills!.setPieces.current };

  const height = (ap.position === "GK" ? 185 : ap.position === "DEF" ? 180 : ap.position === "FWD" ? 178 : 176) + rng.int(-8, 8);
  const baseWeight = ap.bodyType === "obese" ? 100 : ap.bodyType === "stocky" ? 88 : ap.bodyType === "thin" ? 68 : ap.bodyType === "athletic" ? 78 : 80;
  const weight = baseWeight + rng.int(-5, 8);

  const physical = {
    stamina: isGK ? gkSkills!.strength.current : fieldSkills!.stamina.current,
    strength: isGK ? gkSkills!.strength.current : fieldSkills!.strength.current,
    injuryProneness: rng.int(10, 80),
    height,
    weight,
    preferredFoot: ap.preferredFoot,
    preferredSide: ap.preferredSide,
  };
  const personality = {
    discipline: rng.int(10, 90),
    patriotism: rng.int(20, 90),
    alcohol: rng.int(5, 85),
    temper: rng.int(10, 80),
    leadership: ap.leadership,
    workRate: ap.workRate,
    aggression: ap.aggression,
    consistency: ap.consistency,
    clutch: ap.clutch,
  };
  const occ = pickOccupation(rng, VILLAGE_SIZE, ap.age, VILLAGE_DISTRICT);
  const lifeContext = { occupation: occ.name, condition: 100, morale: 50 + rng.int(-15, 15) };
  const rating = calculateOverallRating(ap.position, (isGK ? gkSkills! : fieldSkills!) as any, hiddenTalent);
  const description = generateDescription(rng, {
    firstName: ap.firstName,
    lastName: ap.lastName,
    nickname,
    age: ap.age,
    position: ap.position,
    occupation: occ.name,
    bodyType: ap.bodyType,
    alcohol: personality.alcohol,
    discipline: personality.discipline,
    speed: skills.speed,
    shooting: skills.shooting,
    technique: skills.technique,
    patriotism: personality.patriotism,
  });

  prepared.push({
    id: randomUUID(),
    firstName: ap.firstName,
    lastName: ap.lastName,
    nickname,
    age: ap.age,
    position: ap.position,
    rating,
    skills,
    physical,
    personality,
    lifeContext,
    avatar: generatePlayerFace(ap),
    description,
    skillsMax: isGK ? gkSkills : fieldSkills,
    hiddenTalent,
    experience: isGK ? gkSkills!.experience.current : fieldSkills!.experience.current,
    weeklyWage: Math.round(10 + rating * 4),
  });
}

// ===== MANAGER =====
const manager = generateAiManager(rng);
const managerId = randomUUID();

// ===== STADIUM =====
const stadium = generateStadium(rng, VILLAGE_SIZE);
const stadiumId = randomUUID();

// ===== RELATIONSHIPS =====
const rels = generateRelationships(rng, squad, villageInfo);

// ===== ČLÁNEK =====
const newsId = randomUUID();
const headline = "Master Blaster vyhozen — Čkyně hledá kouče, který si pamatuje, kdy je trénink";
const newsBody = `Vedení SK Čkyně se po měsících apatického vedení rozhodlo udělat tlustou čáru: Master Blaster (37, bývalý hráč, poslední dobou převážně bývalý) má padáka. Posledního tréninku se zúčastnilo 12 z 20 chlapů — zbytek sekal trávu do noci, vyklízel stodolu po dědovi, byl na nočce nebo si prostě "myslel, že je trénink zítra". "Když to nebere vážně kouč, proč bysme my?" uvedl pro Hospodský Zpravodaj anonymní záložník.

Master Blaster údajně naposledy dorazil na hřiště před třemi týdny, a to jen aby zkontroloval, zda hospoda U Pumpy ještě stojí. Tu šanci využil důkladně. Klub mu poděkoval za jeho slavnou hráčskou minulost a popřál mu hodně štěstí v dalším angažmá — pokud možno daleko od Čkyně. Otěže přebírá ${manager.name} (${manager.age}), kterému první úkol zní jasně: zjistit, kolik hráčů ještě bydlí v dojezdu hřiště.`;

// ===== SESTAVENÍ SQL =====
const lines: string[] = [];
lines.push("-- ============================================================");
lines.push(`-- Reset SK Čkyně (${TEAM_ID}) z human → AI`);
lines.push(`-- Generováno: ${new Date().toISOString()}`);
lines.push(`-- RNG seed: ${seed}`);
lines.push(`-- New manager: ${manager.name} (${manager.backstory}, age ${manager.age})`);
lines.push(`-- Players: ${prepared.length}, relationships: ${rels.length}`);
lines.push("-- ============================================================");
lines.push("-- D1 wraps --file execution in implicit transaction (rollback on failure)");
lines.push("");

// PHASE 1: Cleanup
lines.push("-- PHASE 1: Cleanup human-era data (FK order: children first)");
lines.push(`DELETE FROM relationships WHERE player_a_id IN (SELECT id FROM players WHERE team_id = ${sqlStr(TEAM_ID)}) OR player_b_id IN (SELECT id FROM players WHERE team_id = ${sqlStr(TEAM_ID)});`);
lines.push(`DELETE FROM match_player_stats WHERE player_id IN (SELECT id FROM players WHERE team_id = ${sqlStr(TEAM_ID)});`);
lines.push(`DELETE FROM player_stats WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM player_contracts WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM injuries WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM training_log WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`UPDATE teams SET captain_id = NULL, penalty_taker_id = NULL, freekick_taker_id = NULL WHERE id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM players WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE team_id = ${sqlStr(TEAM_ID)});`);
lines.push(`DELETE FROM conversations WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM stadiums WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM equipment WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM sponsor_contracts WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM transactions WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM transfer_bids WHERE listing_id IN (SELECT id FROM transfer_listings WHERE team_id = ${sqlStr(TEAM_ID)}) OR team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM transfer_listings WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM transfer_offers WHERE from_team_id = ${sqlStr(TEAM_ID)} OR to_team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM player_watchlist WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM player_offers WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM push_subscriptions WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM notification_preferences WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM lineups WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push(`DELETE FROM managers WHERE team_id = ${sqlStr(TEAM_ID)};`);
lines.push("");

// PHASE 2: Convert
lines.push("-- PHASE 2: Convert team to AI managed (zachová: name, barvy, badge, anthem, stadium_nickname, founding_story)");
lines.push(
  `UPDATE teams SET user_id = 'ai', budget = ${AI_BUDGET}, last_training_at = NULL, last_training_result = NULL, training_attendance = '{}', tactic_familiarity = '{}', formation_familiarity = '{}', last_ai_player_thread_at = NULL WHERE id = ${sqlStr(TEAM_ID)};`,
);
lines.push("");

// PHASE 3: Players
lines.push(`-- PHASE 3: INSERT ${prepared.length} new AI players`);
for (const p of prepared) {
  lines.push(
    `INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, description, skills_max, hidden_talent, experience, weekly_wage) VALUES (${sqlStr(p.id)}, ${sqlStr(TEAM_ID)}, ${sqlStr(p.firstName)}, ${sqlStr(p.lastName)}, ${sqlStr(p.nickname)}, ${p.age}, ${sqlStr(p.position)}, ${p.rating}, ${sqlJson(p.skills)}, ${sqlJson(p.physical)}, ${sqlJson(p.personality)}, ${sqlJson(p.lifeContext)}, ${sqlJson(p.avatar)}, ${sqlStr(p.description)}, ${sqlJson(p.skillsMax)}, ${p.hiddenTalent}, ${p.experience}, ${p.weeklyWage});`,
  );
}
lines.push("");

// PHASE 4: Contracts
lines.push("-- PHASE 4: INSERT player_contracts");
for (const p of prepared) {
  lines.push(
    `INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (${sqlStr(randomUUID())}, ${sqlStr(p.id)}, ${sqlStr(TEAM_ID)}, ${sqlStr(SEASON_ID)}, 'generated', 0, 1);`,
  );
}
lines.push("");

// PHASE 5: Relationships
lines.push(`-- PHASE 5: INSERT ${rels.length} relationships`);
for (const rel of rels) {
  if (rel.playerAIndex < prepared.length && rel.playerBIndex < prepared.length) {
    lines.push(
      `INSERT INTO relationships (id, player_a_id, player_b_id, type) VALUES (${sqlStr(randomUUID())}, ${sqlStr(prepared[rel.playerAIndex].id)}, ${sqlStr(prepared[rel.playerBIndex].id)}, ${sqlStr(rel.type)});`,
    );
  }
}
lines.push("");

// PHASE 6: Manager
lines.push(`-- PHASE 6: INSERT new AI manager (${manager.name})`);
lines.push(
  `INSERT INTO managers (id, user_id, team_id, name, age, backstory, avatar, coaching, motivation, tactics, youth_development, discipline, reputation, bio, birthplace) VALUES (${sqlStr(managerId)}, 'ai', ${sqlStr(TEAM_ID)}, ${sqlStr(manager.name)}, ${manager.age}, ${sqlStr(manager.backstory)}, ${sqlJson(manager.avatar)}, ${manager.coaching}, ${manager.motivation}, ${manager.tactics}, ${manager.youthDevelopment}, ${manager.discipline}, ${manager.reputation}, ${sqlStr(manager.bio)}, ${sqlStr(manager.birthplace)});`,
);
lines.push("");

// PHASE 7: Stadium
lines.push("-- PHASE 7: INSERT fresh stadium");
lines.push(
  `INSERT INTO stadiums (id, team_id, capacity, pitch_condition, pitch_type, changing_rooms, showers, refreshments, lighting, stands, parking, fence) VALUES (${sqlStr(stadiumId)}, ${sqlStr(TEAM_ID)}, ${stadium.capacity}, ${stadium.pitchCondition}, ${sqlStr(stadium.pitchType)}, ${stadium.changingRooms}, ${stadium.showers}, ${stadium.refreshments}, 0, ${stadium.stands}, ${stadium.parking}, ${stadium.fence});`,
);
lines.push("");

// PHASE 8: News
lines.push("-- PHASE 8: INSERT article (Master Blaster fired)");
lines.push(
  `INSERT INTO news (id, league_id, team_id, type, headline, body, created_at) VALUES (${sqlStr(newsId)}, ${sqlStr(LEAGUE_ID)}, ${sqlStr(TEAM_ID)}, 'manager_arrival', ${sqlStr(headline)}, ${sqlStr(newsBody)}, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));`,
);
lines.push("");


// ===== ZÁPIS =====
const outDir = resolve(REPO_ROOT, "scripts/fire-master-blaster");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "run.sql");
writeFileSync(outPath, lines.join("\n"));

console.log(`OK — SQL zapsáno: ${outPath}`);
console.log(`  Players: ${prepared.length}`);
console.log(`  Relationships: ${rels.length}`);
console.log(`  Manager: ${manager.name} (${manager.backstory}, age ${manager.age}, rep ${manager.reputation})`);
console.log(`  Stadium: cap ${stadium.capacity}, pitch ${stadium.pitchCondition}, type ${stadium.pitchType}`);
console.log(`  News: "${headline}"`);
console.log(`  RNG seed: ${seed}`);
console.log("");
console.log("Spustit (PROD WRITE!):");
console.log("  npx wrangler d1 execute prales-db-prod --remote --file scripts/fire-master-blaster/run.sql");
