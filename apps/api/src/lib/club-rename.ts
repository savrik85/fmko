/**
 * Přejmenování klubu a pravidla adres klubového webu.
 *
 * Název A-týmu má kopie: tým v poháru (`cup_teams.name`), U21 („<název> U21“) a adresu
 * klubového webu, která bez vlastní adresy vzniká z názvu. Každá změna názvu (zkratka,
 * ruční přejmenování, podpis a výpověď hlavního sponzora) jde přes `renameClub`, aby se
 * žádná kopie nezapomněla.
 *
 * Adresa webu nesmí vést na cizí klub ani převzít adresu, pod kterou lidé hledají soupeře.
 * Stejné pravidlo (`slugTakenByOtherTeam`) hlídá vlastní adresu webu (routes/club-website.ts)
 * i název, který si zvolí manažer.
 */

import { slugifyTeamName } from "@okresni-masina/shared";
import { logger } from "./logger";

const M = "club-rename";

/** Nejdelší název klubu, který si manažer může zvolit (ruční přejmenování i zkratka). */
export const MAX_CLUB_NAME_LENGTH = 50;

/** Kolik starých adres webu si klub pamatuje. Víc by šlo zneužít k zabírání adres přejmenováváním. */
export const MAX_SLUG_ALIASES = 3;

/** Odpověď hráči, když by se zvolený název pletl s jiným klubem. */
export const NAME_TAKEN_ERROR = "Takový název by se pletl s jiným klubem.";

export interface TeamSlugRow {
  id: string;
  slug: string;
  villageSlug: string;
}

/** Seniorské týmy se slugem názvu a obce. U21 má vlastní web jen přes ID, nikdy přes odhad. */
export async function loadSeniorTeamSlugs(db: D1Database): Promise<TeamSlugRow[]> {
  const rows = await db
    .prepare(
      `SELECT t.id, t.name, v.name AS village_name
       FROM teams t LEFT JOIN villages v ON v.id = t.village_id
       WHERE t.name IS NOT NULL AND (t.team_type IS NULL OR t.team_type <> 'u21')`,
    )
    .all<{ id: string; name: string; village_name: string | null }>()
    .catch((e) => {
      logger.warn({ module: M }, "load senior team slugs", e);
      return { results: [] as Array<{ id: string; name: string; village_name: string | null }> };
    });
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    slug: slugifyTeamName(r.name),
    villageSlug: r.village_name ? slugifyTeamName(r.village_name) : "",
  }));
}

/**
 * Je adresa obsazená jiným klubem? Jeho id, vlastní nebo stará adresa webu, adresa z jeho
 * názvu, nebo celé slovo z jeho názvu či obce, které náš klub nemá. Hlídá názvy i staré
 * adresy, aby si nikdo nepřivlastnil web soupeře.
 */
export async function slugTakenByOtherTeam(
  db: D1Database,
  slug: string,
  teamId: string,
  seniorTeams?: TeamSlugRow[],
): Promise<boolean> {
  const [website, alias, byId] = await Promise.all([
    db.prepare("SELECT team_id FROM team_websites WHERE custom_slug = ? AND team_id <> ?")
      .bind(slug, teamId).first<{ team_id: string }>(),
    db.prepare("SELECT team_id FROM team_website_slug_aliases WHERE slug = ? AND team_id <> ?")
      .bind(slug, teamId).first<{ team_id: string }>()
      .catch((e) => {
        logger.warn({ module: M, teamId }, "check slug alias collision", e);
        return null;
      }),
    db.prepare("SELECT id FROM teams WHERE id = ? AND id <> ?").bind(slug, teamId).first<{ id: string }>(),
  ]);
  if (website || alias || byId) return true;
  const teams = seniorTeams ?? (await loadSeniorTeamSlugs(db));
  // Slovo z názvu nebo obce jiného klubu (např. "vimperk") patří jemu, pokud ho nemá
  // i náš klub. Vlastní adresa i přesný název mají při hledání přednost před odhadem
  // podle slov, takže by jinak šlo převzít adresu, pod kterou lidé hledají soupeře.
  const contains = (haystack: string) => !!haystack && `-${haystack}-`.includes(`-${slug}-`);
  const own = teams.find((t) => t.id === teamId);
  const ownsWord = !!own && (contains(own.slug) || contains(own.villageSlug));
  return teams.some((t) => t.id !== teamId && (t.slug === slug || (!ownsWord && (contains(t.slug) || contains(t.villageSlug)))));
}

/**
 * Pletl by se název s jiným klubem? Adresa z názvu (bez diakritiky, velikosti písmen
 * a interpunkce) podle stejných pravidel jako vlastní adresa webu: „SK Lhota“ a „SK Lhotá“
 * hráči nerozliší a web by pod společnou adresou nenašel ani jeden z nich.
 */
export async function clubNameTaken(db: D1Database, teamId: string, name: string): Promise<boolean> {
  return slugTakenByOtherTeam(db, slugifyTeamName(name), teamId);
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

/** Sloupec s poslední sezónou změny, název i zkratka jdou měnit jednou za sezónu. */
export type RenameSeasonColumn = "last_main_sponsor_change_season" | "prefix_changed_season";

export interface ClubRename {
  teamId: string;
  /** Název, ze kterého se změna počítala. Když už je v databázi jiný, nezapíše se nic. */
  oldName: string;
  newName: string;
  /**
   * Název zvolil manažer (ruční přejmenování, zkratka): nesmí se plést s jiným klubem.
   * Název daný hrou (sponzor, návrat k obci) se zapíše vždy a stará adresa jiného klubu
   * stejného znění ustoupí, protože přesný název má při hledání webu přednost.
   */
  chosenByManager?: boolean;
  /** Sezóna změny do sloupce limitu, ve stejném zápisu jako název. */
  seasonMark?: { column: RenameSeasonColumn; season: number | null };
}

/**
 * `renamed` = přejmenováno, `name_taken` = manažerem zvolený název by se pletl s jiným
 * klubem, `name_changed` = název se mezitím změnil. V obou posledních se nezapsalo nic.
 */
export type RenameOutcome = "renamed" | "name_taken" | "name_changed";

/**
 * Přejmenuje klub: A-tým, jeho kopii v poháru, U21 a starou adresu webu.
 * Zápis názvu je podmíněný starým názvem, dvě souběžné změny nepřepíšou jedna druhou.
 */
export async function renameClub(db: D1Database, rename: ClubRename): Promise<RenameOutcome> {
  const { teamId, oldName, newName, seasonMark } = rename;
  if (rename.chosenByManager && await clubNameTaken(db, teamId, newName)) return "name_taken";

  const set = seasonMark ? `name = ?, ${seasonMark.column} = ?` : "name = ?";
  const values: unknown[] = seasonMark ? [newName, seasonMark.season] : [newName];
  const res = await db.prepare(`UPDATE teams SET ${set} WHERE id = ? AND name = ?`)
    .bind(...values, teamId, oldName).run();
  if (!res.meta.changes) return "name_changed";

  // Pohár a U21 drží název jako kopii, bez přepsání by tam zůstal starý.
  await db.batch([
    db.prepare("UPDATE cup_teams SET name = ? WHERE team_id = ?").bind(newName, teamId),
    db.prepare("UPDATE teams SET name = ? WHERE parent_team_id = ? AND team_type = 'u21'").bind(`${newName} U21`, teamId),
  ]).catch((e) => logger.warn({ module: M, teamId }, "sync cup/U21 name", e));

  const newSlug = slugifyTeamName(newName);
  // Adresa z názvu teď patří tomuhle klubu (resolveTeamId dává přesnému názvu přednost
  // před starou adresou). Stará adresa jiného klubu stejného znění by vedla jinam, ustoupí.
  if (newSlug) {
    await db.prepare("DELETE FROM team_website_slug_aliases WHERE slug = ? AND team_id <> ?")
      .bind(newSlug, teamId).run()
      .catch((e) => logger.warn({ module: M, teamId }, "drop other club's alias of the new name", e));
  }

  // Klubový web bez vlastní adresy běží na adrese z názvu; stará adresa (sdílené odkazy)
  // musí dál vést na tenhle klub.
  const site = await db.prepare("SELECT custom_slug FROM team_websites WHERE team_id = ?")
    .bind(teamId).first<{ custom_slug: string | null }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "load website slug", e); return null; });
  if (!site?.custom_slug) {
    await rememberOldWebsiteSlug(db, teamId, slugifyTeamName(oldName), newSlug);
  }
  return "renamed";
}
