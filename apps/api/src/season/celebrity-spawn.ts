/**
 * Celebrity spawn logic — generates special players (legend, fallen star, glass man)
 * and inserts them into the free_agents table with is_celebrity = 1.
 * Also generates news articles and broadcast messages.
 */

import { logger } from "../lib/logger";
import type { Rng } from "../generators/rng";
import {
  generateCelebrityLegend,
  generateFallenStar,
  generateGlassMan,
  TIER_CONFIG,
  type CelebrityType,
  type CelebrityTier,
} from "../generators/player";
import { generatePlayerFace } from "../routes/teams";

const FIRSTNAMES: Record<string, Record<string, number>> = {
  "1960s": { "Jiří": 0.08, "Jan": 0.07, "Petr": 0.06, "Josef": 0.06, "Jaroslav": 0.05 },
  "1970s": { "Petr": 0.08, "Jan": 0.07, "Martin": 0.06, "Jiří": 0.06, "Pavel": 0.05 },
  "1980s": { "Jan": 0.08, "Martin": 0.07, "Tomáš": 0.06, "Pavel": 0.05, "Michal": 0.05 },
  "1990s": { "Jan": 0.09, "Tomáš": 0.07, "Jakub": 0.06, "David": 0.06, "Lukáš": 0.05 },
  "2000s": { "Jakub": 0.08, "Jan": 0.07, "Adam": 0.06, "Matěj": 0.06, "Ondřej": 0.05 },
  "2010s": { "Jakub": 0.07, "Jan": 0.07, "Adam": 0.06, "Vojtěch": 0.05, "Filip": 0.05 },
};

interface SpawnResult {
  name: string;
  type: CelebrityType;
  tier?: CelebrityTier;
}

export async function spawnCelebrity(
  db: D1Database,
  leagueId: string,
  rng: Rng,
  forceType?: CelebrityType,
  forceTier?: CelebrityTier,
): Promise<SpawnResult | null> {
  let celebType: CelebrityType;
  let tier: CelebrityTier | undefined;

  if (forceType) {
    celebType = forceType;
    tier = forceTier ?? (celebType === "legend" ? "A" : undefined);
  } else {
    // Determine type: 50% legend, 25% fallen_star, 25% glass_man
    const roll = rng.random();
    if (roll < 0.50) {
      celebType = "legend";
      // Tier distribution: S=10%, A=25%, B=35%, C=30%
      const tierRoll = rng.random();
      tier = tierRoll < 0.10 ? "S" : tierRoll < 0.35 ? "A" : tierRoll < 0.70 ? "B" : "C";
    } else if (roll < 0.75) {
      celebType = "fallen_star";
    } else {
      celebType = "glass_man";
    }
  }

  const firstnameData = { male: FIRSTNAMES, female: {} as Record<string, Record<string, number>> };

  const celeb = celebType === "legend"
    ? generateCelebrityLegend(rng, tier!, firstnameData)
    : celebType === "fallen_star"
      ? generateFallenStar(rng, firstnameData)
      : generateGlassMan(rng, firstnameData);

  // Get league info
  const leagueInfo = await db.prepare(
    "SELECT name, district FROM leagues WHERE id = ?"
  ).bind(leagueId).first<{ name: string; district: string }>();
  if (!leagueInfo) return null;

  // Pick a random village in the district for the celebrity to live in
  const villageRow = await db.prepare(
    "SELECT id FROM villages WHERE district = ? ORDER BY RANDOM() LIMIT 1"
  ).bind(leagueInfo.district).first<{ id: string }>().catch((e) => { logger.warn({ module: "celebrity-spawn" }, "pick village", e); return null; });

  // Calculate overall rating
  const skillKeys = ["speed", "technique", "shooting", "passing", "heading", "defense", "goalkeeping"] as const;
  const posWeights: Record<string, Record<string, number>> = {
    GK: { speed: 0.05, technique: 0.05, shooting: 0.02, passing: 0.08, heading: 0.05, defense: 0.15, goalkeeping: 0.60 },
    DEF: { speed: 0.12, technique: 0.10, shooting: 0.05, passing: 0.12, heading: 0.18, defense: 0.35, goalkeeping: 0.08 },
    MID: { speed: 0.12, technique: 0.20, shooting: 0.12, passing: 0.25, heading: 0.08, defense: 0.15, goalkeeping: 0.08 },
    FWD: { speed: 0.18, technique: 0.18, shooting: 0.28, passing: 0.12, heading: 0.15, defense: 0.05, goalkeeping: 0.04 },
  };
  const w = posWeights[celeb.position] ?? posWeights.MID;
  const overallRating = Math.round(skillKeys.reduce((sum, k) => sum + (celeb[k] ?? 0) * (w[k] ?? 0.14), 0));

  const skills = JSON.stringify({
    speed: celeb.speed, technique: celeb.technique, shooting: celeb.shooting,
    passing: celeb.passing, heading: celeb.heading, defense: celeb.defense,
    goalkeeping: celeb.goalkeeping, stamina: celeb.stamina, strength: celeb.strength,
    creativity: Math.round((celeb.technique + celeb.passing) / 2),
    setPieces: rng.int(30, 70),
  });
  const personality = JSON.stringify({
    discipline: celeb.discipline, patriotism: celeb.patriotism,
    alcohol: celeb.alcohol, temper: celeb.temper,
    leadership: celeb.leadership, workRate: celeb.workRate,
    aggression: celeb.aggression, consistency: celeb.consistency,
    clutch: celeb.clutch,
    celebrityType: celeb.celebrityType,
    ...(celeb.celebrityTier ? { celebrityTier: celeb.celebrityTier } : {}),
  });
  let lifeContext = JSON.stringify({
    occupation: celeb.occupation,
    condition: celeb.condition,
    morale: celeb.morale,
    celebrityTransportCost: celeb.transportCost,
  });
  const physical = JSON.stringify({
    stamina: celeb.stamina, strength: celeb.strength,
    injuryProneness: celeb.injuryProneness,
    height: rng.int(170, 195), weight: rng.int(70, 95),
    preferredFoot: celeb.preferredFoot, preferredSide: celeb.preferredSide,
  });

  const faId = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const weeklyWage = Math.round(10 + (overallRating / 100) * 400) + celeb.transportCost;
  const avatar = JSON.stringify(generatePlayerFace({ age: celeb.age, bodyType: celeb.bodyType }));

  const hiddenTalent = celeb.hiddenTalent ?? 0;
  const nickname = celeb.nickname;
  const fullName = `${celeb.firstName} ${celeb.lastName}`;

  // Store skillsMax in life_context if present (for fallen_star)
  if (celeb.skillsMax) {
    const lc = JSON.parse(lifeContext);
    lc.skillsMax = celeb.skillsMax;
    lifeContext = JSON.stringify(lc);
  }

  await db.prepare(`
    INSERT INTO free_agents (id, first_name, last_name, nickname, age, position, overall_rating,
      skills, personality, life_context, physical, avatar, weekly_wage, district,
      source, village_id, expires_at, is_celebrity, hidden_talent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?, 1, ?, datetime('now'))
  `).bind(
    faId, celeb.firstName, celeb.lastName, nickname, celeb.age, celeb.position, overallRating,
    skills, personality, lifeContext, physical, avatar, weeklyWage, leagueInfo.district,
    villageRow?.id ?? null, expiresAt.toISOString(), hiddenTalent,
  ).run();

  // ── News article: celebrity arrival ──
  const tierDesc = celebType === "legend"
    ? TIER_CONFIG[tier!].tierLabel
    : celeb.tierLabel;

  const headlineMap: Record<CelebrityType, string> = {
    legend: `BOMBA: ${fullName} se přistěhoval do okresu! ${tierDesc.charAt(0).toUpperCase() + tierDesc.slice(1)} hledá angažmá`,
    fallen_star: `${fullName}, kdysi velká naděje české ligy, se vrátil do rodného kraje`,
    glass_man: `${fullName} hledá nový začátek v okresním přeboru`,
  };

  const bodyMap: Record<CelebrityType, string> = {
    legend: tier === "S"
      ? `Okresním přeborem otřásla zpráva — do oblasti se přistěhoval ${fullName}, ${tierDesc} a legenda české kopané. Podle našich informací se zajímá o účast v místním přeboru. Fanoušci v celém okresu nevěří vlastním očím. Kdo si ho podepíše?`
      : `Překvapivá zpráva: ${fullName}, ${tierDesc}, se usadil v okrese a hledá tým kde by si zakopal. Je k dispozici jako volný hráč.`,
    fallen_star: `${fullName}, kdysi velká naděje na pozici ${celeb.position === "FWD" ? "útočníka" : celeb.position === "MID" ? "záložníka" : "obránce"}, se vrátil do rodného kraje. Kariéru v první lize mu zničil alkohol a životní styl. Talent ale zůstal — otázka zní, jestli ho někdo dokáže vychovat zpět.`,
    glass_man: `${fullName}, talentovaný ${celeb.position === "FWD" ? "útočník" : celeb.position === "MID" ? "záložník" : "obránce"} v nejlepších letech, musel kvůli chronickým zraněním opustit profesionální fotbal. Teď hledá tým v okresním přeboru. Když hraje, je výborný — ale vydrží jeho kolena?`,
  };

  await db.prepare(
    "INSERT INTO news (id, league_id, type, headline, body, created_at) VALUES (?, ?, 'celebrity_arrival', ?, ?, datetime('now'))"
  ).bind(crypto.randomUUID(), leagueId, headlineMap[celebType], bodyMap[celebType]).run();

  // ── Messages to human teams — player tips off + assistant analyzes ──
  const humanTeams = await db.prepare(
    "SELECT t.id FROM teams t WHERE t.league_id = ? AND t.user_id != 'ai'"
  ).bind(leagueId).all().catch((e) => { logger.warn({ module: "celebrity-spawn" }, "fetch teams for broadcast", e); return { results: [] }; });

  // Player tip-off messages — different reactions per type
  const playerReactions: Record<CelebrityType, string[]> = {
    legend: [
      `Trenére, četl jste noviny?! ${fullName} se přistěhoval sem do okresu! To je přece ${tierDesc}! To by bylo něco, kdyby hrál za nás!`,
      `Šéfe! Slyšel jsem v hospodě, že ${fullName} je tady v okrese! Prej hledá tým! Musíme ho mít!`,
      `Trenére, nevěřím vlastním očím — ${fullName} je na trhu volných hráčů! Ten hrál přece za repre! Můžem ho podepsat?`,
    ],
    fallen_star: [
      `Trenére, víte co se povídá? ${fullName} je zpátky v kraji. Prej to s ním šlo z kopce, ale talent tam prej furt je. Co říkáte?`,
      `Šéfe, ${fullName} je na trhu. Znám ho ze školy — byl to bůh na hřišti. Teď prej pije, ale třeba by se dal dohromady u nás?`,
      `Trenére, četl jsem v novinách o ${fullName}. Ten mladej co hrál za ligu a pak to zabalil. Prej je v okrese, nechceme ho zkusit?`,
    ],
    glass_man: [
      `Trenére, ${fullName} je volnej! Ten hrál přece profi fotbal, akorát ho zradily nohy. Ale když hraje, je to jiná třída. Stojí to za to?`,
      `Šéfe, slyšel jsem že ${fullName} hledá tým. Prej odešel z profíků kvůli zraněním, ale jinak je to bombarďák. Co říkáte?`,
      `Trenére, víte o ${fullName}? Prej seknul s ligou kvůli kolenům, ale je mu teprv ${celeb.age}. Kdyby vydržel zdravej...`,
    ],
  };

  // Scout report — general risks without specific numbers
  const scoutReports: Record<CelebrityType, string> = {
    legend: `Tak já se na to podíval. ${fullName} je kvalitou úplně jinde než naši kluci, to je jasný. `
      + `Ale pozor — tenhle typ hráče má svoje návyky. Na tréninky moc nechodí, má vlastní program. `
      + `Na zápasy taky ne vždycky — má spoustu akcí a povinností mimo fotbal. `
      + `A nebude to zadarmo — bude chtít příplatek za dojíždění. `
      + `Ale když nastoupí, diváci se pohrnou a na hřišti to bude vidět. `
      + `Já bych do toho šel, ale počítejte s tím, že spolehlivý nebude.`,
    fallen_star: `Podíval jsem se na to. ${fullName} teď na tom není nejlíp, ale talent tam furt je — a velkej. `
      + `Problém je životní styl. Hodně pije a disciplínu moc neřeší. Bude vynechávat tréninky, bude chodit na kocovinu. `
      + `Pokud ho dokážeme vychovat a dostat zpátky do formy, může z něj být hvězda kádru. `
      + `Pokud ne, budeme mít v kabině problém. Za mě — zkusit to, ale mít realistický očekávání.`,
    glass_man: `Prověřil jsem ho. ${fullName} je fakt kvalitní hráč, o tom žádná. `
      + `Odešel z profi fotbalu kvůli zraněním — a to je taky ten hlavní háček. Tělo ho zrazuje. `
      + `Jinak je disciplinovanej, žádnej průšvihář. Ale bude chybět na spoustě zápasů kvůli zdraví. `
      + `Když ale nastoupí, bude nejlepší hráč na hřišti. `
      + `Za mě jednoznačně podepsat — jen počítejte s tím, že ho budeme mít tak na polovinu zápasů.`,
  };

  for (const t of humanTeams.results) {
    const teamId = t.id as string;
    // Find "Kabina" squad group conversation (the main team chat, not match-specific ones)
    const squadConv = await db.prepare(
      "SELECT id FROM conversations WHERE team_id = ? AND type = 'squad_group' AND title = 'Kabina' ORDER BY created_at DESC LIMIT 1"
    ).bind(teamId).first<{ id: string }>().catch((e) => { logger.warn({ module: "celebrity-spawn" }, "find conv", e); return null; });
    if (!squadConv) continue;

    // Pick a random player from the team to "tip off" the coach
    const randomPlayer = await db.prepare(
      "SELECT id, first_name, last_name FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') AND is_celebrity = 0 ORDER BY RANDOM() LIMIT 1"
    ).bind(teamId).first<{ id: string; first_name: string; last_name: string }>().catch((e) => { logger.warn({ module: "celebrity-spawn" }, "pick random player", e); return null; });

    const playerName = randomPlayer ? `${randomPlayer.first_name} ${randomPlayer.last_name}` : "Hráč";
    const tipText = rng.pick(playerReactions[celebType]);

    // Player message
    await db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at) VALUES (?, ?, 'player', ?, ?, ?, datetime('now'))"
    ).bind(crypto.randomUUID(), squadConv.id, randomPlayer?.id ?? teamId, playerName, tipText).run()
      .catch((e) => logger.warn({ module: "celebrity-spawn" }, "player tip msg", e));
    // Assistant coach analysis — use 'player' type so it renders as a chat bubble
    await db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'player', 'Asistent trenéra', ?, datetime('now', '+10 seconds'))"
    ).bind(crypto.randomUUID(), squadConv.id, scoutReports[celebType]).run()
      .catch((e) => logger.warn({ module: "celebrity-spawn" }, "scout report msg", e));
    await db.prepare("UPDATE conversations SET unread_count = unread_count + 2, last_message_text = ?, last_message_at = datetime('now') WHERE id = ?")
      .bind(`⭐ ${playerName} upozorňuje na ${fullName}`, squadConv.id).run()
      .catch((e) => logger.warn({ module: "celebrity-spawn" }, "update conv", e));
  }

  logger.info({ module: "celebrity-spawn" }, `spawned ${celebType}${tier ? ` tier ${tier}` : ""}: ${fullName} in ${leagueInfo.district}`);
  return { name: fullName, type: celebType, tier };
}
