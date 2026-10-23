/**
 * Přejmenování klubu. Název A-týmu má kopie: tým v poháru (`cup_teams.name`), U21
 * („<název> U21“) a adresu klubového webu, která bez vlastní adresy vzniká z názvu.
 * Každá změna názvu (zkratka, ruční přejmenování, podpis a výpověď hlavního sponzora)
 * jde přes `renameClub`, aby se žádná kopie nezapomněla.
 */

import { slugifyTeamName } from "@okresni-masina/shared";
import { logger } from "./logger";

const M = "club-rename";

/** Nejdelší název klubu, který si manažer může zvolit (ruční přejmenování i zkratka). */
export const MAX_CLUB_NAME_LENGTH = 50;

/** Kolik starých adres webu si klub pamatuje. Víc by šlo zneužít k zabírání adres přejmenováváním. */
export const MAX_SLUG_ALIASES = 3;

/** Sloupec s poslední sezónou změny, název i zkratka jdou měnit jednou za sezónu. */
export type RenameSeasonColumn = "last_main_sponsor_change_season" | "prefix_changed_season";

export interface ClubRename {
  teamId: string;
  /** Název, ze kterého se změna počítala. Když už je v databázi jiný, nezapíše se nic. */
  oldName: string;
  newName: string;
  /** Sezóna změny do sloupce limitu, ve stejném zápisu jako název. */
  seasonMark?: { column: RenameSeasonColumn; season: number | null };
}

/**
 * Patří název jinému klubu? Porovnává se adresa z názvu (bez diakritiky, velikosti písmen
 * a interpunkce): „SK Lhota“ a „SK Lhotá“ hráči nerozliší a web by pod společnou adresou
 * nenašel ani jeden z nich. Obsazená je i vlastní nebo stará adresa webu jiného klubu,
 * jinak by odkazy na cizí web vedly sem.
 */
export async function clubNameTaken(db: D1Database, teamId: string, name: string): Promise<boolean> {
  const slug = slugifyTeamName(name);
  const website = await db.prepare(
    `SELECT 1 FROM team_websites WHERE team_id <> ?1 AND custom_slug = ?2
     UNION ALL SELECT 1 FROM team_website_slug_aliases WHERE team_id <> ?1 AND slug = ?2
     LIMIT 1`,
  ).bind(teamId, slug).first();
  if (website) return true;
  const others = await db.prepare("SELECT name FROM teams WHERE id <> ? AND team_type = 'senior'")
    .bind(teamId).all<{ name: string }>();
  return (others.results ?? []).some((t) => slugifyTeamName(t.name) === slug);
}

/**
 * Stará adresa webu dál vede na klub (sdílené odkazy). Adresa, ke které se klub vrátil,
 * už není stará, ale hlavní. Pamatuje se jen MAX_SLUG_ALIASES posledních, starší se
 * uvolní ostatním klubům.
 */
export async function rememberOldWebsiteSlug(
  db: D1Database, teamId: string, oldSlug: string | null, newSlug: string,
): Promise<void> {
  await db.prepare("DELETE FROM team_website_slug_aliases WHERE slug = ? AND team_id = ?")
    .bind(newSlug, teamId).run()
    .catch((e) => logger.warn({ module: M, teamId }, "drop alias that became main slug", e));
  if (!oldSlug || oldSlug === newSlug) return;
  await db.prepare("INSERT OR IGNORE INTO team_website_slug_aliases (slug, team_id) VALUES (?, ?)")
    .bind(oldSlug, teamId).run()
    .catch((e) => logger.warn({ module: M, teamId }, "remember previous slug", e));
  await db.prepare(
    `DELETE FROM team_website_slug_aliases WHERE team_id = ? AND slug NOT IN (
       SELECT slug FROM team_website_slug_aliases WHERE team_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
     )`,
  ).bind(teamId, teamId, MAX_SLUG_ALIASES).run()
    .catch((e) => logger.warn({ module: M, teamId }, "trim old slug aliases", e));
}

/**
 * Přejmenuje klub: A-tým, jeho kopii v poháru, U21 a starou adresu webu.
 * Zápis názvu je podmíněný starým názvem, dvě souběžné změny nepřepíšou jedna druhou.
 * `false` = název se mezitím změnil a nezapsalo se nic.
 */
export async function renameClub(db: D1Database, rename: ClubRename): Promise<boolean> {
  const { teamId, oldName, newName, seasonMark } = rename;
  const set = seasonMark ? `name = ?, ${seasonMark.column} = ?` : "name = ?";
  const values: unknown[] = seasonMark ? [newName, seasonMark.season] : [newName];
  const res = await db.prepare(`UPDATE teams SET ${set} WHERE id = ? AND name = ?`)
    .bind(...values, teamId, oldName).run();
  if (!res.meta.changes) return false;

  // Pohár a U21 drží název jako kopii, bez přepsání by tam zůstal starý.
  await db.batch([
    db.prepare("UPDATE cup_teams SET name = ? WHERE team_id = ?").bind(newName, teamId),
    db.prepare("UPDATE teams SET name = ? WHERE parent_team_id = ? AND team_type = 'u21'").bind(`${newName} U21`, teamId),
  ]).catch((e) => logger.warn({ module: M, teamId }, "sync cup/U21 name", e));

  // Klubový web bez vlastní adresy běží na adrese z názvu; stará adresa (sdílené odkazy)
  // musí dál vést na tenhle klub.
  const site = await db.prepare("SELECT custom_slug FROM team_websites WHERE team_id = ?")
    .bind(teamId).first<{ custom_slug: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load website slug", e); return null; });
  if (!site?.custom_slug) {
    await rememberOldWebsiteSlug(db, teamId, slugifyTeamName(oldName), slugifyTeamName(newName));
  }
  return true;
}
