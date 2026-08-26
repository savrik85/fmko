/**
 * Absolventi mládežnické akademie.
 *
 * Na konci sezóny z akademie vypadne odchovanec — do U21, ne rovnou do áčka: je to
 * šestnáctiletý kluk, ne hotový hráč. Manažer si ho pak vypipluje sám, nebo ho rovnou
 * povýší, když je na to.
 *
 * `tryGraduateYouth()` v `season/youth.ts` existovala od začátku, ale nikdo ji nikdy
 * nezavolal — akademie byla mrtvá a investice do ní se nikdy nevrátila.
 */

import { createRng, cryptoSeed } from "../generators/rng";
import { tryGraduateYouth, YOUTH_POCET_POKUSU, type YouthInvestment } from "./youth";
import { generatePlayerFace } from "../routes/teams";
import { generateHiddenTalent, generateFieldSkills, generateGKSkills } from "../skills/generator";
import { getDistrictDataFromDB } from "../data/districts";
import { FIRSTNAMES } from "../data/czech-names";
import { logger } from "../lib/logger";

const M = "academy";

/**
 * Odchovanec je z vlastní vesnice, takže má vyšší strop než náhodný cizí kluk —
 * klub ho vede od žáků. Bonus se přičítá k vygenerovanému potenciálu.
 */
const BONUS_STROPU: Record<Exclude<YouthInvestment, "none">, number> = {
  minimal: 0,
  medium: 5,
  high: 12,
};

export interface AcademyResult {
  teamId: string;
  playerName: string;
  position: string;
  age: number;
  hiddenTalent: number;
}

/**
 * Vychová klubu celý ročník odchovanců — kolik kluků to zkusí, určuje výše investice
 * (`YOUTH_POCET_POKUSU`). Vrací jen ty, kterým to vyšlo; prázdné pole znamená, že klub
 * do mládeže nesype nebo že z ročníku nic nevyrostlo.
 */
export async function graduateAcademyClass(
  db: D1Database,
  teamId: string,
  seasonId: string | null,
): Promise<AcademyResult[]> {
  const team = await db.prepare("SELECT youth_investment FROM teams WHERE id = ?")
    .bind(teamId).first<{ youth_investment: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load investment for class", e); return null; });

  const investment = (team?.youth_investment ?? "none") as YouthInvestment;
  const pokusu = YOUTH_POCET_POKUSU[investment] ?? 0;

  const odchovanci: AcademyResult[] = [];
  for (let i = 0; i < pokusu; i++) {
    const res = await graduateAcademyPlayer(db, teamId, seasonId)
      .catch((e) => { logger.warn({ module: M, teamId }, `academy attempt ${i + 1}`, e); return null; });
    if (res) odchovanci.push(res);
  }

  if (pokusu > 0) {
    logger.info({ module: M, teamId }, `akademie (${investment}): ${odchovanci.length}/${pokusu} odchovanců`);
  }
  return odchovanci;
}

/**
 * Zkusí vychovat jednoho odchovance. Vrací null, když klub do mládeže nesype
 * nebo když ten konkrétní kluk neprorazil.
 */
export async function graduateAcademyPlayer(
  db: D1Database,
  teamId: string,
  seasonId: string | null,
): Promise<AcademyResult | null> {
  const team = await db.prepare(
    `SELECT t.id, t.youth_investment, v.district, v.population, v.size
       FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?`,
  ).bind(teamId).first<{ id: string; youth_investment: string | null; district: string; population: number; size: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load team for academy", e); return null; });

  if (!team) return null;

  const investment = (team.youth_investment ?? "none") as YouthInvestment;
  if (investment === "none") return null;

  // Odchovanec jde do dorostu; bez U21 týmu není kam ho dát
  const u21 = await db.prepare("SELECT id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'")
    .bind(teamId).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load u21 team", e); return null; });
  if (!u21) {
    logger.info({ module: M, teamId }, "akademie: klub nemá U21 tým, odchovanec se nenarodil");
    return null;
  }

  const rng = createRng(cryptoSeed());
  const sizeMap: Record<string, "vesnice" | "obec" | "mestys" | "mesto"> = {
    hamlet: "vesnice", village: "obec", town: "mestys", small_city: "mesto", city: "mesto",
  };
  const villageInfo = {
    region_code: team.district,
    category: sizeMap[team.size] ?? "obec",
    population: team.population ?? 500,
    district: team.district,
  };

  const districtData = await getDistrictDataFromDB(db, team.district);
  const graduate = tryGraduateYouth(
    rng,
    { investment, villagPopulation: team.population ?? 500 },
    villageInfo,
    { surnames: districtData.surnames, female_forms: {} },
    { male: FIRSTNAMES, female: {} },
  );
  if (!graduate) return null;

  const p = graduate.player;
  const position = p.position as "GK" | "DEF" | "MID" | "FWD";
  const isGK = position === "GK";
  const villageSize = team.size ?? "village";

  // Potenciál se generuje stejným generátorem jako u ostatních hráčů — odchovanec
  // není podřadný. Investice do akademie zvedá strop, ne současné hodnoty: kluk je
  // pořád šestnáctiletý, jen se s ním líp pracovalo.
  const fieldSkills = !isGK ? generateFieldSkills(rng, position as "DEF" | "MID" | "FWD", villageSize, p.age) : null;
  const gkSkills = isGK ? generateGKSkills(rng, villageSize, p.age) : null;
  const bonus = BONUS_STROPU[investment as Exclude<YouthInvestment, "none">] ?? 0;
  const dovednosti = (isGK ? gkSkills : fieldSkills) as unknown as Record<string, { current: number; maxPotential: number }>;
  if (bonus > 0) {
    for (const d of Object.values(dovednosti)) d.maxPotential = Math.min(100, d.maxPotential + bonus);
  }

  // Vychovanec klubu má i vyšší talent — právě proto se do akademie vyplatí sypat
  const hiddenTalent = Math.min(100, generateHiddenTalent(rng, villageSize) + (investment === "high" ? rng.int(10, 25) : investment === "medium" ? rng.int(5, 15) : 0));

  // Současné hodnoty bere z tryGraduateYouth (SKILL_RANGE podle investice) — jsou nízké
  // schválně, kluk teprve začíná.
  const skills = {
    speed: p.speed, technique: p.technique, shooting: p.shooting, passing: p.passing,
    heading: p.heading, defense: p.defense, goalkeeping: isGK ? rng.int(10, 30) : 1,
    // Kreativita a standardky nejsou součástí GeneratedPlayer — u šestnáctiletého kluka
    // stejně začínají skoro na nule a vytrénuje si je až v dorostu.
    creativity: rng.int(3, 20), setPieces: rng.int(3, 20),
    stamina: p.stamina, strength: p.strength, vision: rng.int(3, 20),
    experience: Math.max(0, (p.age - 16) * rng.int(2, 4)),
  };
  const physical = {
    stamina: p.stamina, strength: p.strength, injuryProneness: p.injuryProneness ?? 50,
    height: (isGK ? 183 : 176) + rng.int(-8, 8),
    weight: 68 + rng.int(-5, 8),
    preferredFoot: p.preferredFoot, preferredSide: p.preferredSide,
  };
  const personality = {
    discipline: p.discipline, patriotism: p.patriotism, alcohol: p.alcohol, temper: p.temper,
    leadership: Math.max(5, (p.leadership ?? 30) - 15),
    workRate: p.workRate, aggression: p.aggression,
    consistency: Math.max(5, (p.consistency ?? 50) - 10), clutch: p.clutch,
  };

  const { overallRatingFromFlat } = await import("../skills/generator");
  const rating = overallRatingFromFlat(position, skills, physical, hiddenTalent) ?? 15;
  const playerId = crypto.randomUUID();

  await db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating,
       skills, physical, personality, life_context, avatar, description, skills_max, hidden_talent,
       experience, weekly_wage, status, nationality)
     VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  ).bind(
    playerId, u21.id, p.firstName, p.lastName, p.age, position, Math.max(1, rating),
    JSON.stringify(skills), JSON.stringify(physical), JSON.stringify(personality),
    JSON.stringify({ occupation: p.occupation ?? "student", condition: 100, morale: 60 }),
    JSON.stringify(generatePlayerFace({ age: p.age, bodyType: p.bodyType ?? "normal", ethnicity: p.ethnicity })),
    graduate.description,
    JSON.stringify(dovednosti), hiddenTalent, skills.experience,
    Math.round(5 + rating * 2), p.nationality ?? "CZ",
  ).run();

  if (seasonId) {
    await db.prepare(
      "INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, ?, 'youth', 0, 1)",
    ).bind(crypto.randomUUID(), playerId, u21.id, seasonId).run()
      .catch((e) => logger.warn({ module: M, teamId }, "academy contract", e));
  }

  logger.info({ module: M, teamId }, `odchovanec ${p.firstName} ${p.lastName} (${position}, ${p.age}, talent ${hiddenTalent})`);

  return { teamId, playerName: `${p.firstName} ${p.lastName}`, position, age: p.age, hiddenTalent };
}

const POZICE: Record<string, string> = { GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník" };

/** Jak trenér mládeže popíše jednoho kluka. */
function popisOdchovance(res: AcademyResult): string {
  const pozice = POZICE[res.position] ?? res.position;
  if (res.hiddenTalent >= 50) return `${res.playerName} (${res.age}, ${pozice}) — z toho něco bude, na to vemte jed`;
  if (res.hiddenTalent >= 30) return `${res.playerName} (${res.age}, ${pozice}) — slibný kluk`;
  return `${res.playerName} (${res.age}, ${pozice})`;
}

/**
 * Pošle manažerovi jednu SMS o celém ročníku odchovanců. Bez zprávy by se kluci objevili
 * v dorostu potichu a nikdo by si jich nevšiml; zvlášť za každého by to zase byl spam.
 */
export async function notifyAcademyGraduates(
  db: D1Database,
  teamId: string,
  odchovanci: AcademyResult[],
): Promise<void> {
  if (odchovanci.length === 0) return;

  // Skloňování: 2–4 kluci postoupili, 5 a víc kluků postoupilo
  const pocet = odchovanci.length;
  const vetaOPoctu = pocet < 5
    ? `postoupili do dorostu ${pocet} kluci`
    : `postoupilo do dorostu ${pocet} kluků`;

  const telo = pocet === 1
    ? `Z akademie postoupil do dorostu ${popisOdchovance(odchovanci[0])}. Vychovanec klubu.`
    : `Z akademie letos ${vetaOPoctu}: ${odchovanci.map(popisOdchovance).join("; ")}.`;

  try {
    const nazev = "Mládež";
    let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
      .bind(teamId, nazev).first<{ id: string }>().then((r) => r?.id)
      .catch((e) => { logger.warn({ module: M }, "find academy conversation", e); return null; });

    if (!convId) {
      convId = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
      ).bind(convId, teamId, nazev).run()
        .catch((e) => logger.warn({ module: M }, "create academy conversation", e));
    }
    await db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Trenér mládeže', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
    ).bind(crypto.randomUUID(), convId, telo).run();
    await db.prepare(
      "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
    ).bind(telo.slice(0, 100), convId).run();
  } catch (e) {
    logger.warn({ module: M, teamId }, "academy SMS failed", e);
  }
}
