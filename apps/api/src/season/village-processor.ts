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
