/**
 * Majitelé firem a jejich náklonnost ke klubům — DB vrstva.
 * Majitel se generuje líně při prvním čtení (jako zastupitelé obce).
 * Chybějící řádek náklonnosti = DEFAULT_FAVOR.
 */
import { logger } from "../lib/logger";
import { DEFAULT_FAVOR } from "./favor-math";
import { generateSponsorOwner, isOwnerPersonality, type OwnerPersonality } from "./owners";

export interface SponsorOwner {
  sponsorId: number;
  firstName: string;
  lastName: string;
  age: number;
  faceConfig: Record<string, unknown>;
  personality: OwnerPersonality;
}

interface OwnerRow {
  sponsor_id: number; first_name: string; last_name: string; age: number; face_config: string; personality: string;
}

function mapOwner(r: OwnerRow): SponsorOwner {
  return {
    sponsorId: r.sponsor_id,
    firstName: r.first_name,
    lastName: r.last_name,
    age: r.age,
    faceConfig: JSON.parse(r.face_config) as Record<string, unknown>,
    personality: isOwnerPersonality(r.personality) ? r.personality : "businessman",
  };
}

export async function ensureSponsorOwners(db: D1Database, sponsorIds: number[]): Promise<Map<number, SponsorOwner>> {
  const out = new Map<number, SponsorOwner>();
  if (sponsorIds.length === 0) return out;
  const marks = sponsorIds.map(() => "?").join(",");
  const existing = await db.prepare(`SELECT * FROM sponsor_owners WHERE sponsor_id IN (${marks})`)
    .bind(...sponsorIds).all<OwnerRow>();
  for (const r of existing.results) out.set(r.sponsor_id, mapOwner(r));

  const missing = sponsorIds.filter((id) => !out.has(id));
  if (missing.length === 0) return out;
  const types = await db.prepare(`SELECT id, type FROM district_sponsors WHERE id IN (${missing.map(() => "?").join(",")})`)
    .bind(...missing).all<{ id: number; type: string }>();
  const inserts: D1PreparedStatement[] = [];
  for (const t of types.results) {
    const g = generateSponsorOwner(t.id, t.type);
    inserts.push(db.prepare(
      `INSERT OR IGNORE INTO sponsor_owners (sponsor_id, first_name, last_name, age, face_config, personality)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(t.id, g.firstName, g.lastName, g.age, JSON.stringify(g.faceConfig), g.personality));
    out.set(t.id, { sponsorId: t.id, ...g });
  }
  if (inserts.length > 0) await db.batch(inserts);
  return out;
}

export async function ensureSponsorOwner(db: D1Database, sponsorId: number): Promise<SponsorOwner | null> {
  return (await ensureSponsorOwners(db, [sponsorId])).get(sponsorId) ?? null;
}

export async function getFavorsForTeam(db: D1Database, teamId: string): Promise<Map<number, number>> {
  const rows = await db.prepare("SELECT sponsor_id, favor FROM sponsor_team_favor WHERE team_id = ?")
    .bind(teamId).all<{ sponsor_id: number; favor: number }>();
  return new Map(rows.results.map((r) => [r.sponsor_id, r.favor]));
}

export async function getFavor(db: D1Database, sponsorId: number, teamId: string): Promise<number> {
  const row = await db.prepare("SELECT favor FROM sponsor_team_favor WHERE sponsor_id = ? AND team_id = ?")
    .bind(sponsorId, teamId).first<{ favor: number }>();
  return row?.favor ?? DEFAULT_FAVOR;
}

/**
 * Přičte deltu k náklonnosti (založí řádek z výchozí hodnoty), ořez 0–100.
 * Záměrně neexportované: změna bez zápisu do deníku nesmí vzniknout. Zvenku jen `favorDeltaStmts`.
 */
function favorDeltaStmt(db: D1Database, sponsorId: number, teamId: string, delta: number, guard?: FavorGuard): D1PreparedStatement {
  if (guard) {
    // INSERT … SELECT … WHERE: u upsertu musí SELECT mít WHERE, jinak SQLite nerozliší ON CONFLICT.
    return db.prepare(
      `INSERT INTO sponsor_team_favor (sponsor_id, team_id, favor, updated_at)
       SELECT ?, ?, MAX(0, MIN(100, ? + ?)), datetime('now') WHERE ${guard.sql}
       ON CONFLICT(sponsor_id, team_id) DO UPDATE SET
         favor = MAX(0, MIN(100, favor + ?)), updated_at = datetime('now')`,
    ).bind(sponsorId, teamId, DEFAULT_FAVOR, delta, ...guard.params, delta);
  }
  return db.prepare(
    `INSERT INTO sponsor_team_favor (sponsor_id, team_id, favor, updated_at)
     VALUES (?, ?, MAX(0, MIN(100, ? + ?)), datetime('now'))
     ON CONFLICT(sponsor_id, team_id) DO UPDATE SET
       favor = MAX(0, MIN(100, favor + ?)), updated_at = datetime('now')`,
  ).bind(sponsorId, teamId, DEFAULT_FAVOR, delta, delta);
}

/**
 * Podmínka pro cizí batch: změna náklonnosti i zápis do deníku proběhnou jen, když platí.
 * `sql` je výraz s pozičními `?`, `params` jeho hodnoty (vzor Guard v signing.ts).
 */
export interface FavorGuard { sql: string; params: unknown[] }

/**
 * Poziční `?` přečísluje na `?N` od `start`. Dotaz s číslovanými parametry (`?1`…`?5`)
 * a za nimi holými `?` SQLite nemusí svázat správně, proto se podmínka číslují výslovně.
 */
function numberedPlaceholders(sql: string, start: number): string {
  let n = start;
  return sql.replace(/\?(?!\d)/g, () => `?${n++}`);
}

/**
 * Zápis do deníku náklonnosti. Musí v batchi běžet PŘED změnou samotnou: skutečnou změnu
 * (po ořezu 0–100) počítá z dosavadní hodnoty. Nulová skutečná změna se nezapíše.
 * Herní datum bere z klubu, bez něj aktuální čas v ISO (jako teams.game_date).
 */
export function favorLogStmt(
  db: D1Database, sponsorId: number, teamId: string, delta: number, reason: string, guard?: FavorGuard,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO sponsor_favor_log (sponsor_id, team_id, delta, reason, game_date)
     SELECT ?1, ?2, d.actual, ?4,
            COALESCE((SELECT game_date FROM teams WHERE id = ?2), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     FROM (
       SELECT MAX(0, MIN(100, cur.v + ?3)) - cur.v AS actual
       FROM (SELECT COALESCE((SELECT favor FROM sponsor_team_favor WHERE sponsor_id = ?1 AND team_id = ?2), ?5) AS v) cur
     ) d
     WHERE d.actual != 0${guard ? ` AND ${numberedPlaceholders(guard.sql, 6)}` : ""}`,
  ).bind(sponsorId, teamId, delta, reason, DEFAULT_FAVOR, ...(guard?.params ?? []));
}

/**
 * Změna náklonnosti pro cizí batch: [zápis do deníku, změna]. Pořadí se nesmí prohodit.
 * `guard`: obojí jen, když platí podmínka (např. nárok na slib proběhl právě v tomhle batchi).
 */
export function favorDeltaStmts(
  db: D1Database, sponsorId: number, teamId: string, delta: number, reason: string, guard?: FavorGuard,
): D1PreparedStatement[] {
  return [favorLogStmt(db, sponsorId, teamId, delta, reason, guard), favorDeltaStmt(db, sponsorId, teamId, delta, guard)];
}

export async function applySponsorFavorDelta(
  db: D1Database, sponsorId: number, teamId: string, delta: number, reason: string,
): Promise<void> {
  if (delta === 0) return;
  await db.batch(favorDeltaStmts(db, sponsorId, teamId, delta, reason));
  logger.info({ module: "sponsors", teamId }, `sponzor ${sponsorId}: náklonnost ${delta > 0 ? "+" : ""}${delta}: ${reason}`);
}
