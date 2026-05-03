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
