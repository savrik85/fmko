/**
 * Zkratka v názvu klubu (FK, SK, AC…). Klub si ji vybírá ze seznamu, zdarma, jednou za sezónu.
 * Mění se jen zkratka; sponzor a obec v názvu zůstávají. Nový název se promítne
 * i do poháru, U21 a stará adresa klubového webu dál vede na web klubu.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireTeamOwnership } from "../auth/middleware";
import { CLUB_PREFIXES, clubPrefixOf, isClubPrefix, slugifyTeamName, withClubPrefix } from "@okresni-masina/shared";
import { logger } from "../lib/logger";

const M = "club-prefix";
const MAX_NAME_LENGTH = 50;

const clubPrefixRouter = new Hono<{ Bindings: Bindings }>();

clubPrefixRouter.use("/teams/:teamId/club/prefix", requireTeamOwnership);

async function activeSeason(db: D1Database): Promise<number | null> {
  const row = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>();
  return row?.number ?? null;
}

interface TeamRow {
  name: string;
  team_type: string | null;
  user_id: string | null;
  prefix_changed_season: number | null;
}

async function loadTeam(db: D1Database, teamId: string): Promise<TeamRow | null> {
  return db.prepare("SELECT name, team_type, user_id, prefix_changed_season FROM teams WHERE id = ?")
    .bind(teamId).first<TeamRow>();
}

/** Aktuální zkratka, nabídka a jestli ji klub v téhle sezóně ještě může změnit. */
clubPrefixRouter.get("/teams/:teamId/club/prefix", async (c) => {
  const teamId = c.req.param("teamId");
  const team = await loadTeam(c.env.DB, teamId);
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);
  const season = await activeSeason(c.env.DB);
  return c.json({
    name: team.name,
    prefix: clubPrefixOf(team.name),
    options: CLUB_PREFIXES,
    canChange: season == null || (team.prefix_changed_season ?? 0) < season,
  });
});

clubPrefixRouter.patch("/teams/:teamId/club/prefix", async (c) => {
  const teamId = c.req.param("teamId");
  const db = c.env.DB;
  const body = await c.req.json<{ prefix?: unknown }>().catch((e) => {
    logger.warn({ module: M }, "invalid body", e);
    return {} as { prefix?: unknown };
  });
  if (!isClubPrefix(body.prefix)) return c.json({ error: "Vyber zkratku ze seznamu" }, 400);
  const prefix = body.prefix;

  const team = await loadTeam(db, teamId);
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);
  if (team.team_type && team.team_type !== "senior") return c.json({ error: "Zkratku mění A-tým" }, 400);
  if (clubPrefixOf(team.name) === prefix) return c.json({ error: "Klub už tuhle zkratku má" }, 400);

  const season = await activeSeason(db);
  if (season != null && (team.prefix_changed_season ?? 0) >= season) {
    return c.json({ error: "Zkratku jde změnit jednou za sezónu" }, 400);
  }

  const oldName = team.name;
  const newName = withClubPrefix(oldName, prefix);
  // Stejný strop jako ruční přejmenování (POST /teams/:id/rename).
  if (newName.length > MAX_NAME_LENGTH) return c.json({ error: `Název by měl víc než ${MAX_NAME_LENGTH} znaků` }, 400);

  // Nový název nesmí patřit jinému klubu ani převzít adresu jeho webu (vlastní adresa,
  // stará adresa po přejmenování) — jinak by odkazy na cizí web vedly sem.
  const newSlug = slugifyTeamName(newName);
  const clash = await db.prepare(
    `SELECT 1 FROM teams WHERE id <> ?1 AND team_type = 'senior' AND lower(name) = lower(?2)
     UNION ALL SELECT 1 FROM team_websites WHERE team_id <> ?1 AND custom_slug = ?3
     UNION ALL SELECT 1 FROM team_website_slug_aliases WHERE team_id <> ?1 AND slug = ?3
     LIMIT 1`
  ).bind(teamId, newName, newSlug).first();
  if (clash) return c.json({ error: "Takový název už má jiný klub" }, 409);

  // Podmínka na starý název: dvě souběžné změny nepřepíšou jedna druhou.
  const res = await db.prepare("UPDATE teams SET name = ?, prefix_changed_season = ? WHERE id = ? AND name = ?")
    .bind(newName, season, teamId, oldName).run();
  if (res.meta.changes === 0) return c.json({ error: "Název se mezitím změnil, zkus to znovu" }, 409);

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
  const oldSlug = slugifyTeamName(oldName);
  if (!site?.custom_slug && oldSlug) {
    await db.prepare("INSERT OR IGNORE INTO team_website_slug_aliases (slug, team_id) VALUES (?, ?)")
      .bind(oldSlug, teamId).run()
      .catch((e) => logger.warn({ module: M, teamId }, "save old website slug alias", e));
  }

  await db.prepare(
    "INSERT INTO news (id, league_id, type, headline, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
  ).bind(crypto.randomUUID(), teamId, `${oldName} mění název na ${newName}`, `Klub ${oldName} nově vystupuje jako ${newName}.`)
    .run().catch((e) => logger.warn({ module: M, teamId }, "insert rename news", e));

  return c.json({ ok: true, name: newName });
});

export default clubPrefixRouter;
