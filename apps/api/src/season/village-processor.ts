/**
 * Týdenní cyklus pro feature "Obec":
 *  - generuje brigády per obec (1–3, podle velikosti),
 *  - propaduje neuzavřené brigády (status='expired') po deadline,
 *  - lazy seedy globálního favor pro existující týmy.
 *
 * Volá se z daily-tick na začátku pondělí, JEDNOU pro celou DB
 * (NE v per-team loopu).
 */

import { logger } from "../lib/logger";
import { createRng } from "../generators/rng";

export interface BrigadeTemplate {
  type: string;
  title: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  durationHours: number;
  rewardFavor: number;
  conditionDrain: number;
  moraleChange: number;
  preferredPersonality?: string[]; // pokud má jeden z těchto, vyšší šance že vyhlásí
}

const BRIGADE_TEMPLATES: BrigadeTemplate[] = [
  {
    type: "uklid_namesti",
    title: "Úklid náměstí po hodech",
    description: "Po víkendových hodech zbývá uklidit pivní stánky a sebrat odpad. Obec hledá pomocné ruce.",
    minPlayers: 3, maxPlayers: 5, durationHours: 5,
    rewardFavor: 8, conditionDrain: 12, moraleChange: -3,
    preferredPersonality: ["populista", "tradicionalista"],
  },
  {
    type: "sekani_trav",
    title: "Sekání obecní zeleně",
    description: "Posekat travnaté plochy okolo obecního úřadu, hřbitova a zastávek. Práce v horku.",
    minPlayers: 4, maxPlayers: 6, durationHours: 7,
    rewardFavor: 10, conditionDrain: 22, moraleChange: -5,
    preferredPersonality: ["podnikatel"],
  },
  {
    type: "oprava_plotu",
    title: "Oprava plotu kolem obecního hřiště",
    description: "Plot kolem dětského hřiště je v havarijním stavu. Nutno vyměnit prkna a natřít.",
    minPlayers: 4, maxPlayers: 6, durationHours: 8,
    rewardFavor: 14, conditionDrain: 25, moraleChange: -4,
    preferredPersonality: ["podnikatel", "tradicionalista"],
  },
  {
    type: "kulturak_setup",
    title: "Příprava sálu na ples",
    description: "Postavit pódium, rozestavět stoly a židle, pomoci s ozvučením.",
    minPlayers: 3, maxPlayers: 5, durationHours: 4,
    rewardFavor: 12, conditionDrain: 8, moraleChange: -2,
    preferredPersonality: ["aktivista", "populista"],
  },
  {
    type: "zimni_udrzba",
    title: "Odhrnování chodníků po sněhové kalamitě",
    description: "Obec potřebuje rychle zprůjeznit hlavní chodníky a přístup k obchodu a škole.",
    minPlayers: 4, maxPlayers: 7, durationHours: 6,
    rewardFavor: 15, conditionDrain: 20, moraleChange: -5,
    preferredPersonality: ["tradicionalista", "populista"],
  },
  {
    type: "sber_papiru",
    title: "Sběr starého papíru pro školu",
    description: "Místní ZŠ pořádá sběr a obecní úřad prosí o pomoc s odvozem ke kontejneru.",
    minPlayers: 3, maxPlayers: 5, durationHours: 4,
    rewardFavor: 10, conditionDrain: 10, moraleChange: -2,
    preferredPersonality: ["aktivista"],
  },
  {
    type: "uprava_hrobu",
    title: "Údržba pomníků padlých",
    description: "Před státním svátkem upravit prostranství kolem památníku.",
    minPlayers: 3, maxPlayers: 4, durationHours: 4,
    rewardFavor: 12, conditionDrain: 9, moraleChange: -2,
    preferredPersonality: ["tradicionalista"],
  },
  {
    type: "hasici_pomoc",
    title: "Pomoc dobrovolným hasičům",
    description: "Obec vyhlásila brigádu na úklid hasičské zbrojnice a údržbu techniky.",
    minPlayers: 4, maxPlayers: 6, durationHours: 6,
    rewardFavor: 13, conditionDrain: 15, moraleChange: -3,
    preferredPersonality: ["tradicionalista", "sportovec"],
  },
];

/**
 * Po skončení zápasu: pokud místní hráč (z obce týmu) zaznamenal MOTM nebo
 * hat-trick, přihoď bonus do globálního favor a morálku celému domácímu kádru.
 * Lokální senzace = transparentní událost (zapsaná v village_history).
 */
export async function applyLocalSensations(
  db: D1Database,
  matchId: string,
  homeTeamId: string,
  homeUpdates: Array<{ playerId: string; goals: number }>,
  momPlayerId: string | null,
  gameDate: string,
): Promise<void> {
  const team = await db.prepare(
    `SELECT t.village_id, v.name as village_name FROM teams t
     JOIN villages v ON v.id = t.village_id
     WHERE t.id = ?`
  ).bind(homeTeamId).first<{ village_id: string; village_name: string }>().catch((e) => {
    logger.warn({ module: "village-processor" }, "load team village", e);
    return null;
  });
  if (!team) return;

  // Hráči s ≥3 góly nebo MOTM
  const candidateIds = new Set<string>();
  for (const u of homeUpdates) {
    if (u.goals >= 3) candidateIds.add(u.playerId);
  }
  if (momPlayerId) candidateIds.add(momPlayerId);
  if (candidateIds.size === 0) return;

  // Místní mezi nimi (life_context.residence === village_name nebo player.villageName?)
  // V DB vidím sloupec residence. Použijeme ten.
  const placeholders = Array.from(candidateIds).map(() => "?").join(",");
  const players = await db.prepare(
    `SELECT id, first_name, last_name, residence FROM players
     WHERE id IN (${placeholders}) AND residence = ?`
  ).bind(...Array.from(candidateIds), team.village_name).all<{
    id: string; first_name: string; last_name: string; residence: string;
  }>();

  const locals = players.results ?? [];
  if (locals.length === 0) return;

  // Bonus per local sensation: +3 favor, +5 morale celému kádru
  const now = new Date().toISOString();
  for (const p of locals) {
    const isHatTrick = (homeUpdates.find((u) => u.playerId === p.id)?.goals ?? 0) >= 3;
    const isMom = momPlayerId === p.id;
    const reason = isHatTrick && isMom ? "hat-trick a hráčem zápasu"
      : isHatTrick ? "hat-trickem"
      : "hráčem zápasu";
    const desc = `Místní rodák ${p.first_name} ${p.last_name} se stal ${reason}!`;
    await db.prepare(
      `INSERT INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
       VALUES (?, ?, ?, NULL, 'local_sensation', ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), team.village_id, homeTeamId, desc,
      JSON.stringify({ playerId: p.id, hatTrick: isHatTrick, mom: isMom }),
      gameDate, now,
    ).run().catch((e) => logger.warn({ module: "village-processor" }, "insert local sensation history", e));
  }

  // Favor +3 globálnímu řádku (jeden bump per zápas, ne per hráč)
  const favorRow = await db.prepare(
    `SELECT id FROM village_team_favor WHERE team_id = ? AND official_id IS NULL`
  ).bind(homeTeamId).first<{ id: string }>();
  if (favorRow) {
    await db.prepare(
      `UPDATE village_team_favor SET favor = MIN(100, favor + 3),
       last_interaction_at = ?, updated_at = ? WHERE id = ?`
    ).bind(now, now, favorRow.id).run().catch((e) => {
      logger.warn({ module: "village-processor" }, "bump global favor", e);
    });
  } else {
    await db.prepare(
      `INSERT INTO village_team_favor (id, village_id, team_id, official_id, favor, trust, last_interaction_at, updated_at)
       VALUES (?, ?, ?, NULL, 53, 50, ?, ?)`
    ).bind(crypto.randomUUID(), team.village_id, homeTeamId, now, now).run().catch((e) => {
      logger.warn({ module: "village-processor" }, "seed favor with sensation", e);
    });
  }

  // Morale boost +5 celému domácímu kádru (clamp 100)
  await db.prepare(
    `UPDATE players
     SET life_context = json_set(life_context, '$.morale',
       MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + 5))
     WHERE team_id = ? AND (status IS NULL OR status != 'released')`
  ).bind(homeTeamId).run().catch((e) => {
    logger.warn({ module: "village-processor" }, "boost team morale local sensation", e);
  });
}

/**
 * Pokud byl prodaný hráč rodákem z obce týmu, sníží se globální favor
 * a sportovec persona zatratí prodej (-10 favor), zatímco podnikatel
 * vidí finance (+5).
 */
export async function applyLocalSale(
  db: D1Database,
  sellerTeamId: string,
  playerId: string,
  gameDate: string,
): Promise<void> {
  const team = await db.prepare(
    `SELECT t.village_id, v.name as village_name FROM teams t
     JOIN villages v ON v.id = t.village_id WHERE t.id = ?`
  ).bind(sellerTeamId).first<{ village_id: string; village_name: string }>();
  if (!team) return;

  const player = await db.prepare(
    `SELECT first_name, last_name, residence, overall_rating FROM players WHERE id = ?`
  ).bind(playerId).first<{
    first_name: string; last_name: string; residence: string | null; overall_rating: number;
  }>();
  if (!player || player.residence !== team.village_name) return;

  const isStar = player.overall_rating >= 65;
  const now = new Date().toISOString();

  // Globální favor penalty
  const globalDelta = isStar ? -10 : -3;
  await db.prepare(
    `UPDATE village_team_favor SET favor = MAX(0, favor + ?), updated_at = ?
     WHERE team_id = ? AND official_id IS NULL`
  ).bind(globalDelta, now, sellerTeamId).run().catch((e) => {
    logger.warn({ module: "village-processor" }, "local sale global favor", e);
  });

  // Per-persona reakce
  const officials = await db.prepare(
    `SELECT vo.id, vo.personality FROM village_officials vo
     LEFT JOIN village_team_favor vtf ON vtf.official_id = vo.id AND vtf.team_id = ?
     WHERE vo.village_id = ?`
  ).bind(sellerTeamId, team.village_id).all<{ id: string; personality: string }>();

  for (const o of officials.results ?? []) {
    let delta = 0;
    if (o.personality === "sportovec") delta = isStar ? -10 : -4;
    else if (o.personality === "podnikatel") delta = isStar ? 5 : 2;
    else if (o.personality === "tradicionalista") delta = isStar ? -8 : -3;
    else delta = isStar ? -3 : -1;

    const fav = await db.prepare(
      `SELECT id FROM village_team_favor WHERE team_id = ? AND official_id = ?`
    ).bind(sellerTeamId, o.id).first<{ id: string }>();
    if (fav) {
      await db.prepare(
        `UPDATE village_team_favor SET favor = MAX(0, MIN(100, favor + ?)),
         updated_at = ? WHERE id = ?`
      ).bind(delta, now, fav.id).run();
    } else {
      await db.prepare(
        `INSERT INTO village_team_favor (id, village_id, team_id, official_id, favor, trust, updated_at)
         VALUES (?, ?, ?, ?, ?, 50, ?)`
      ).bind(crypto.randomUUID(), team.village_id, sellerTeamId, o.id, 50 + delta, now).run();
    }
  }

  const desc = isStar
    ? `Klub prodal místního ${player.first_name} ${player.last_name} (rating ${player.overall_rating}). Občané jsou v šoku.`
    : `Klub prodal místního ${player.first_name} ${player.last_name}.`;
  await db.prepare(
    `INSERT INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
     VALUES (?, ?, ?, NULL, 'local_player_sold', ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), team.village_id, sellerTeamId, desc,
    JSON.stringify({ playerId, rating: player.overall_rating, isStar }),
    gameDate, now,
  ).run().catch((e) => logger.warn({ module: "village-processor" }, "local sale history", e));
}

/** Mapuje village.size na počet brigád za týden. */
function brigadesPerWeek(size: string): number {
  switch (size) {
    case "city": return 3;
    case "small_city": return 3;
    case "town": return 2;
    case "village": return 2;
    case "hamlet": return 1;
    default: return 1;
  }
}

/**
 * Vygeneruje brigády pro všechny aktivní obce na následujících 7 dní.
 * Idempotentní per (village_id, week_key) — pokud už brigády na tento týden
 * existují, neopakuje.
 */
export async function generateWeeklyBrigades(
  db: D1Database,
  gameDate: string,
): Promise<{ generated: number; skipped: number }> {
  const villageRows = await db.prepare(
    `SELECT DISTINCT v.id, v.size FROM villages v
     JOIN teams t ON t.village_id = v.id
     WHERE t.user_id != 'ai' OR EXISTS (SELECT 1 FROM teams t2 WHERE t2.village_id = v.id AND t2.user_id != 'ai')`
  ).all<{ id: string; size: string }>();

  const weekKey = isoWeekKey(gameDate);
  let generated = 0;
  let skipped = 0;

  for (const v of villageRows.results ?? []) {
    const existing = await db.prepare(
      `SELECT COUNT(*) as cnt FROM village_brigades
       WHERE village_id = ? AND offered_at LIKE ?`
    ).bind(v.id, `${weekKey}%`).first<{ cnt: number }>();

    if ((existing?.cnt ?? 0) > 0) {
      skipped++;
      continue;
    }

    const officials = await db.prepare(
      "SELECT id, personality FROM village_officials WHERE village_id = ?"
    ).bind(v.id).all<{ id: string; personality: string }>();

    const seed = hashSeed(`${v.id}|${weekKey}`);
    const rng = createRng(seed);
    const count = brigadesPerWeek(v.size);

    const expiresAt = addDays(gameDate, 7);

    for (let i = 0; i < count; i++) {
      const template = pickTemplateWeighted(rng, officials.results ?? []);
      const offeringOfficial = pickOfferingOfficial(rng, officials.results ?? [], template);

      const id = crypto.randomUUID();
      const requiredCount = rng.int(template.minPlayers, template.maxPlayers);

      try {
        await db.prepare(
          `INSERT INTO village_brigades
            (id, village_id, type, title, description, offered_at, expires_at,
             status, required_player_count, duration_hours, offered_by_official_id,
             reward_money, reward_favor, condition_drain, morale_change)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, 0, ?, ?, ?)`
        ).bind(
          id, v.id, template.type, template.title, template.description,
          gameDate, expiresAt,
          requiredCount, template.durationHours, offeringOfficial,
          template.rewardFavor, template.conditionDrain, template.moraleChange,
        ).run();
        generated++;
      } catch (e) {
        logger.warn({ module: "village-processor" }, `insert brigade ${template.type} for village ${v.id}`, e);
      }
    }
  }

  return { generated, skipped };
}

/** Označí prošlé brigády (open + expires_at < today) jako expired. */
export async function expireOldBrigades(db: D1Database, gameDate: string): Promise<number> {
  const result = await db.prepare(
    `UPDATE village_brigades
     SET status = 'expired'
     WHERE status = 'open' AND expires_at < ?`
  ).bind(gameDate).run();
  return result.meta?.changes ?? 0;
}

interface PetitionTemplate {
  topic: string;
  title: string;
  description: string;
  costMoney: number;
  rewardFavor: number;
  ignorePenalty: number;
}

const PETITION_TEMPLATES: PetitionTemplate[] = [
  {
    topic: "detsky_den",
    title: "Petice za dětský den",
    description: "Občané žádají, aby klub uspořádal pro místní děti odpoledne s autogramiádou a soutěžemi.",
    costMoney: 1500, rewardFavor: 6, ignorePenalty: -3,
  },
  {
    topic: "oprava_satnen",
    title: "Stížnost na stav šaten",
    description: "Občané si stěžují, že šatny v obecních prostorách potřebují drobnou opravu — dveře, sedátka, věšáky.",
    costMoney: 3000, rewardFavor: 8, ignorePenalty: -4,
  },
  {
    topic: "verejny_trenink",
    title: "Petice za otevřený trénink",
    description: "Místní by chtěli vidět tým v akci — žádají uspořádat veřejný trénink s občerstvením.",
    costMoney: 800, rewardFavor: 5, ignorePenalty: -2,
  },
  {
    topic: "darek_seniori",
    title: "Dárek seniorům",
    description: "Klub Senior obce prosí o symbolický příspěvek — dresy nebo balíčky pro účastníky setkání.",
    costMoney: 1200, rewardFavor: 6, ignorePenalty: -3,
  },
  {
    topic: "zahrebenec_kasna",
    title: "Petice za záhonek u kašny",
    description: "Občané chtějí, aby se klub podílel na úpravě veřejné zeleně. Stačí finanční příspěvek na sazenice.",
    costMoney: 600, rewardFavor: 4, ignorePenalty: -2,
  },
  {
    topic: "podpora_hasicu",
    title: "Příspěvek hasičům",
    description: "SDH potřebuje pomoct s nákupem nářadí pro nadcházející soutěž. Občané čekají, že klub přispěje.",
    costMoney: 2000, rewardFavor: 7, ignorePenalty: -3,
  },
];

/**
 * Vygeneruje 1 petici pro každý lidský tým, který nemá aktivní petici a
 * od minulé uplynulo > 25 dní. Idempotentní per (team_id, week).
 */
export async function generateMonthlyPetitions(
  db: D1Database,
  gameDate: string,
): Promise<{ generated: number }> {
  const eligibleTeams = await db.prepare(
    `SELECT t.id as team_id, t.village_id FROM teams t
     WHERE t.user_id != 'ai'
       AND NOT EXISTS (
         SELECT 1 FROM village_petitions vp
         WHERE vp.team_id = t.id AND vp.status = 'active'
       )
       AND NOT EXISTS (
         SELECT 1 FROM village_petitions vp
         WHERE vp.team_id = t.id AND vp.created_at > datetime(?, '-25 days')
       )`
  ).bind(gameDate).all<{ team_id: string; village_id: string }>();

  let generated = 0;
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(now.getDate() + 14); // 14 dní na odpověď

  for (const t of eligibleTeams.results ?? []) {
    const seed = hashSeed(`${t.team_id}|${gameDate.slice(0, 7)}`);
    const rng = createRng(seed);
    const template = PETITION_TEMPLATES[rng.int(0, PETITION_TEMPLATES.length - 1)];
    const id = crypto.randomUUID();
    try {
      await db.prepare(
        `INSERT INTO village_petitions
          (id, village_id, team_id, topic, title, description, cost_money,
           reward_favor, ignore_penalty, expires_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
      ).bind(
        id, t.village_id, t.team_id, template.topic, template.title, template.description,
        template.costMoney, template.rewardFavor, template.ignorePenalty,
        expiresAt.toISOString(), gameDate,
      ).run();
      generated++;
    } catch (e) {
      logger.warn({ module: "village-processor" }, `insert petition for team ${t.team_id}`, e);
    }
  }

  return { generated };
}

interface InvestmentTemplate {
  type: "stadium_upgrade" | "pitch_renovation" | "youth_facility" | "bus_subsidy";
  targetFacility: string;
  title: string;
  description: string;
  totalCost: number;          // celková cena upgradu
  subsidyRatio: number;       // 0.3-0.7 jakou část obec uhradí
  favorThreshold: number;     // 60-90
  politicalCost: number;      // -favor u opozice (favor < 40)
}

const INVESTMENT_TEMPLATES: InvestmentTemplate[] = [
  {
    type: "stadium_upgrade", targetFacility: "showers",
    title: "Modernizace šaten — sprchy",
    description: "Obec nabízí spolufinancování upgradu sprch. Lepší regenerace pro hráče.",
    totalCost: 25000, subsidyRatio: 0.6, favorThreshold: 60, politicalCost: 2,
  },
  {
    type: "pitch_renovation", targetFacility: "pitch",
    title: "Renovace travnatého povrchu",
    description: "Obec přispěje na nový drén a osivo hřiště před začátkem sezóny.",
    totalCost: 15000, subsidyRatio: 0.7, favorThreshold: 55, politicalCost: 1,
  },
  {
    type: "stadium_upgrade", targetFacility: "stands",
    title: "Rozšíření tribuny",
    description: "Obec zafinancuje +150 míst na tribuně. Více diváků = víc atmosféry.",
    totalCost: 75000, subsidyRatio: 0.4, favorThreshold: 80, politicalCost: 4,
  },
  {
    type: "stadium_upgrade", targetFacility: "parking",
    title: "Parkoviště u stadionu",
    description: "Vyasfaltování plochy pro auta diváků. Vyšší dostupnost = víc návštěv.",
    totalCost: 40000, subsidyRatio: 0.5, favorThreshold: 70, politicalCost: 3,
  },
  {
    type: "youth_facility", targetFacility: "youth",
    title: "Mládežnické zázemí",
    description: "Obec přispěje na vybavení pro mládežnický fotbal — pomůže náboru talentů.",
    totalCost: 30000, subsidyRatio: 0.6, favorThreshold: 65, politicalCost: 2,
  },
];

/** Generuje investiční nabídky pro top-favor tým v obci, jednou měsíčně. */
export async function generateMonthlyInvestments(
  db: D1Database,
  gameDate: string,
): Promise<{ generated: number }> {
  // Pro každou obec najdi top-favor lidský tým a zkontroluj jestli má favor ≥ threshold
  const villages = await db.prepare(
    `SELECT DISTINCT v.id FROM villages v
     JOIN teams t ON t.village_id = v.id
     WHERE t.user_id != 'ai'`
  ).all<{ id: string }>();

  let generated = 0;
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(now.getDate() + 21); // 3 týdny na rozmyšlenou

  for (const v of villages.results ?? []) {
    // Top tým podle favor v této obci
    const topTeam = await db.prepare(
      `SELECT t.id as team_id, COALESCE(vtf.favor, 50) as favor
       FROM teams t
       LEFT JOIN village_team_favor vtf ON vtf.team_id = t.id AND vtf.official_id IS NULL
       WHERE t.village_id = ? AND t.user_id != 'ai'
       ORDER BY favor DESC LIMIT 1`
    ).bind(v.id).first<{ team_id: string; favor: number }>();

    if (!topTeam) continue;

    // Cooldown: 30 dní od poslední nabídky pro tento tým
    const recent = await db.prepare(
      `SELECT id FROM village_investments
       WHERE team_id = ? AND created_at > datetime(?, '-30 days') LIMIT 1`
    ).bind(topTeam.team_id, gameDate).first();
    if (recent) continue;

    // Vyber template podle dosaženého favor
    const eligible = INVESTMENT_TEMPLATES.filter((t) => topTeam.favor >= t.favorThreshold);
    if (eligible.length === 0) continue;

    const seed = hashSeed(`${v.id}|${topTeam.team_id}|${gameDate.slice(0, 7)}`);
    const rng = createRng(seed);
    const template = eligible[rng.int(0, eligible.length - 1)];

    const offeredAmount = Math.round(template.totalCost * template.subsidyRatio);
    const requiredContribution = template.totalCost - offeredAmount;
    const id = crypto.randomUUID();
    try {
      await db.prepare(
        `INSERT INTO village_investments
          (id, village_id, team_id, type, target_facility, offered_amount,
           required_contribution, favor_threshold, expires_at, status,
           political_cost, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'offered', ?, ?)`
      ).bind(
        id, v.id, topTeam.team_id, template.type, template.targetFacility,
        offeredAmount, requiredContribution, template.favorThreshold,
        expiresAt.toISOString(), template.politicalCost, gameDate,
      ).run();
      generated++;

      // Audit history
      const teamName = await db.prepare("SELECT name FROM teams WHERE id = ?")
        .bind(topTeam.team_id).first<{ name: string }>();
      await db.prepare(
        `INSERT INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
         VALUES (?, ?, ?, NULL, 'investment_offered', ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(), v.id, topTeam.team_id,
        `Obec nabídla ${teamName?.name ?? "týmu"} spolufinancování: „${template.title}" (${offeredAmount.toLocaleString("cs")} Kč).`,
        JSON.stringify({ offeredAmount, requiredContribution, favor: topTeam.favor }),
        gameDate, now.toISOString(),
      ).run().catch((e) => logger.warn({ module: "village-processor" }, "investment audit", e));
    } catch (e) {
      logger.warn({ module: "village-processor" }, `insert investment for ${topTeam.team_id}`, e);
    }
  }
  return { generated };
}

/**
 * Vygeneruje pub encounters: 1× za 14-21 dní per (village, human team).
 * Persona populista/tradicionalista chodí do hospody častěji než aktivista.
 */
export async function generatePubEncounters(
  db: D1Database,
  gameDate: string,
): Promise<{ generated: number }> {
  const teams = await db.prepare(
    `SELECT t.id as team_id, t.village_id FROM teams t
     WHERE t.user_id != 'ai'
       AND NOT EXISTS (
         SELECT 1 FROM village_pub_encounters vpe
         WHERE vpe.team_id = t.id AND vpe.status = 'active'
       )
       AND NOT EXISTS (
         SELECT 1 FROM village_pub_encounters vpe
         WHERE vpe.team_id = t.id AND vpe.created_at > datetime(?, '-14 days')
       )`
  ).bind(gameDate).all<{ team_id: string; village_id: string }>();

  let generated = 0;
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(now.getDate() + 5); // 5 dní na rozhodnutí

  for (const t of teams.results ?? []) {
    const officials = await db.prepare(
      "SELECT id, personality FROM village_officials WHERE village_id = ?"
    ).bind(t.village_id).all<{ id: string; personality: string }>();
    if ((officials.results ?? []).length === 0) continue;

    const seed = hashSeed(`${t.team_id}|pub|${gameDate.slice(0, 10)}`);
    const rng = createRng(seed);

    // Vážit dle persona — populista/tradicionalista chodí často
    const weights: Record<string, number> = {};
    for (const o of officials.results ?? []) {
      weights[o.id] = o.personality === "populista" ? 4
        : o.personality === "tradicionalista" ? 3
        : o.personality === "sportovec" ? 2
        : o.personality === "podnikatel" ? 1.5
        : 0.5; // aktivista
    }
    const officialId = rng.weighted(weights);
    if (!officialId) continue;

    const id = crypto.randomUUID();
    try {
      await db.prepare(
        `INSERT INTO village_pub_encounters
          (id, village_id, team_id, official_id, status, expires_at, created_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`
      ).bind(id, t.village_id, t.team_id, officialId, expiresAt.toISOString(), gameDate).run();
      generated++;
    } catch (e) {
      logger.warn({ module: "village-processor" }, `insert pub encounter for team ${t.team_id}`, e);
    }
  }
  return { generated };
}

/** Označí prošlé pub encounters jako 'expired' (žádná penalty — NPC prostě nečekal). */
export async function expirePubEncounters(db: D1Database, gameDate: string): Promise<number> {
  const result = await db.prepare(
    `UPDATE village_pub_encounters SET status = 'expired'
     WHERE status = 'active' AND expires_at < ?`
  ).bind(gameDate).run();
  return result.meta?.changes ?? 0;
}

/** Označí prošlé investice jako 'expired'. */
export async function expireInvestments(db: D1Database, gameDate: string): Promise<number> {
  const result = await db.prepare(
    `UPDATE village_investments SET status = 'expired'
     WHERE status = 'offered' AND expires_at < ?`
  ).bind(gameDate).run();
  return result.meta?.changes ?? 0;
}

/**
 * Označí prošlé petice (active + expires_at < now) jako 'ignored' a aplikuje penalty.
 */
export async function expirePetitions(db: D1Database, gameDate: string): Promise<number> {
  const expired = await db.prepare(
    `SELECT id, village_id, team_id, ignore_penalty, title FROM village_petitions
     WHERE status = 'active' AND expires_at < ?`
  ).bind(gameDate).all<{
    id: string; village_id: string; team_id: string; ignore_penalty: number; title: string;
  }>();

  const now = new Date().toISOString();
  for (const p of expired.results ?? []) {
    await db.prepare(
      `UPDATE village_petitions SET status = 'ignored', responded_at = ? WHERE id = ?`
    ).bind(now, p.id).run();

    // Penalize globální favor
    const favorRow = await db.prepare(
      `SELECT id, favor FROM village_team_favor WHERE team_id = ? AND official_id IS NULL`
    ).bind(p.team_id).first<{ id: string; favor: number }>();
    if (favorRow) {
      await db.prepare(
        `UPDATE village_team_favor
         SET favor = MAX(0, favor + ?), last_interaction_at = ?, updated_at = ?
         WHERE id = ?`
      ).bind(p.ignore_penalty, now, now, favorRow.id).run();
    }

    await db.prepare(
      `INSERT INTO village_history (id, village_id, team_id, official_id, event_type, description, impact, game_date, created_at)
       VALUES (?, ?, ?, NULL, 'petition_ignored', ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), p.village_id, p.team_id,
      `Petice „${p.title}" zůstala bez odezvy. Občané jsou zklamaní.`,
      JSON.stringify({ penalty: p.ignore_penalty }),
      gameDate, now,
    ).run().catch((e) => logger.warn({ module: "village-processor" }, "petition ignored history", e));
  }

  return expired.results?.length ?? 0;
}

function pickTemplateWeighted(
  rng: ReturnType<typeof createRng>,
  officials: Array<{ personality: string }>,
): BrigadeTemplate {
  const personas = new Set(officials.map((o) => o.personality));
  const weights: Record<string, number> = {};
  for (const t of BRIGADE_TEMPLATES) {
    const matches = (t.preferredPersonality ?? []).filter((p) => personas.has(p)).length;
    weights[t.type] = 1 + matches * 1.5;
  }
  const chosenType = rng.weighted(weights);
  return BRIGADE_TEMPLATES.find((t) => t.type === chosenType) ?? BRIGADE_TEMPLATES[0];
}

function pickOfferingOfficial(
  rng: ReturnType<typeof createRng>,
  officials: Array<{ id: string; personality: string }>,
  template: BrigadeTemplate,
): string | null {
  if (officials.length === 0) return null;
  const preferred = officials.filter((o) =>
    (template.preferredPersonality ?? []).includes(o.personality)
  );
  const pool = preferred.length > 0 ? preferred : officials;
  return pool[rng.int(0, pool.length - 1)].id;
}

function isoWeekKey(date: string): string {
  // YYYY-Www format na základě data; pro idempotency stačí ISO date prefix YYYY-MM-DD
  // Použijeme Monday-of-week jako klíč.
  const d = new Date(date);
  const day = d.getUTCDay() || 7; // sunday = 7
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - day + 1);
  return monday.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function hashSeed(input: string): number {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) ^ (h1 >>> 0);
}
