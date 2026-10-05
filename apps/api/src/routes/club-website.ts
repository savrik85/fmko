import { Hono, type Context } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { getSession } from "../auth/session";
import { recordTransaction } from "../season/finance-processor";
import {
  CLUB_WEBSITE_TEMPLATES,
  CLUB_WEBSITE_ADDONS,
  slugifyTeamName,
  type ClubWebsiteTemplate,
  type ClubWebsiteAddon,
  type ClubWebsiteMatchHighlight,
  type ClubWebsiteMatchSummary,
} from "@okresni-masina/shared";
import { STAND_COLUMNS, standFacilities, type StandSide } from "../stadium/stands-model";

export const clubWebsiteRouter = new Hono<{ Bindings: Bindings }>();

function formatPlayerPositionCZ(pos: string): string {
  const p = (pos || "").toUpperCase();
  switch (p) {
    case "GK":
    case "BRA":
      return "Brankář";
    case "DEF":
    case "OBR":
      return "Obránce";
    case "CB":
      return "Stoper";
    case "LB":
      return "Levý obránce";
    case "RB":
      return "Pravý obránce";
    case "LWB":
    case "RWB":
      return "Krajní obránce";
    case "MID":
    case "ZAL":
    case "ZÁL":
      return "Záložník";
    case "CM":
      return "Střední záložník";
    case "LM":
      return "Levý záložník";
    case "RM":
      return "Pravý záložník";
    case "CDM":
    case "DM":
      return "Defenzivní záložník";
    case "CAM":
    case "AM":
      return "Ofenzivní záložník";
    case "FWD":
    case "UTO":
    case "ÚTO":
      return "Útočník";
    case "ST":
      return "Hrotový útočník";
    case "CF":
      return "Útočník";
    case "LW":
      return "Levé křídlo";
    case "RW":
      return "Pravé křídlo";
    default:
      return pos || "Hráč";
  }
}

// Helper for generating unique team slug based on team name
async function generateUniqueTeamSlug(db: D1Database, teamId: string, teamName: string): Promise<string> {
  const baseSlug = slugifyTeamName(teamName) || `tym-${teamId.slice(0, 8)}`;
  let candidate = baseSlug;
  let counter = 1;

  while (counter <= 50) {
    const existing = await db
      .prepare("SELECT team_id FROM team_websites WHERE custom_slug = ? AND team_id <> ?")
      .bind(candidate, teamId)
      .first<{ team_id: string }>()
      .catch((e) => {
        logger.warn({ module: "club-website" }, "check slug uniqueness", e);
        return null;
      });

    if (!existing) {
      return candidate;
    }

    counter++;
    candidate = `${baseSlug}-${counter}`;
  }

  return `${baseSlug}-${teamId.slice(0, 4)}`;
}

// Helper to resolve teamId either from direct ID or from custom_slug / team name slug
async function resolveTeamId(db: D1Database, identifier: string): Promise<string | null> {
  // 1. Direct team id check
  const direct = await db
    .prepare("SELECT id FROM teams WHERE id = ?")
    .bind(identifier)
    .first<{ id: string }>()
    .catch((e) => {
      logger.warn({ module: "club-website" }, "resolveTeamId direct check", e);
      return null;
    });
  if (direct) return direct.id;

  // 2. Custom slug check
  const bySlug = await db
    .prepare("SELECT team_id FROM team_websites WHERE custom_slug = ?")
    .bind(identifier)
    .first<{ team_id: string }>()
    .catch((e) => {
      logger.warn({ module: "club-website" }, "resolveTeamId bySlug check", e);
      return null;
    });
  if (bySlug) return bySlug.team_id;

  // 3. Fallback: match by slugified team name across teams
  const allTeams = await db
    .prepare("SELECT id, name FROM teams WHERE name IS NOT NULL")
    .all<{ id: string; name: string }>()
    .catch((e) => {
      logger.warn({ module: "club-website" }, "resolveTeamId all teams check", e);
      return { results: [] };
    });

  const matching = (allTeams.results ?? []).find(
    (t) => slugifyTeamName(t.name) === identifier,
  );
  if (matching) {
    // Persist this slug in team_websites so future requests hit index directly
    await ensureWebsiteRow(db, matching.id, identifier).catch((e) =>
      logger.warn({ module: "club-website" }, "persist slug in resolveTeamId", e),
    );
    return matching.id;
  }

  return null;
}

// Ensure website row exists in team_websites (with default slug derived from team name)
async function ensureWebsiteRow(db: D1Database, teamId: string, preferredSlug?: string) {
  const existing = await db
    .prepare("SELECT * FROM team_websites WHERE team_id = ?")
    .bind(teamId)
    .first<{
      team_id: string;
      template: string;
      unlocked_templates: string;
      unlocked_addons: string;
      custom_slug: string | null;
      announcement: string | null;
      sponsor_banner_enabled: number;
      visitor_count: number;
    }>();

  if (!existing) {
    const team = await db
      .prepare("SELECT name FROM teams WHERE id = ?")
      .bind(teamId)
      .first<{ name: string }>()
      .catch((e) => {
        logger.warn({ module: "club-website" }, "lookup team name for slug", e);
        return null;
      });

    const defaultSlug = await generateUniqueTeamSlug(
      db,
      teamId,
      preferredSlug || team?.name || `tym-${teamId.slice(0, 8)}`,
    );

    await db
      .prepare(
        `INSERT OR IGNORE INTO team_websites 
         (team_id, template, unlocked_templates, unlocked_addons, custom_slug, announcement, sponsor_banner_enabled, visitor_count) 
         VALUES (?, 'retro_2004', '["retro_2004"]', '[]', ?, NULL, 0, 1)`,
      )
      .bind(teamId, defaultSlug)
      .run()
      .catch((e) => logger.warn({ module: "club-website" }, "ensureWebsiteRow insert", e));

    return {
      template: "retro_2004" as ClubWebsiteTemplate,
      unlockedTemplates: ["retro_2004"] as ClubWebsiteTemplate[],
      unlockedAddons: [] as ClubWebsiteAddon[],
      customSlug: defaultSlug,
      announcement: null,
      sponsorBannerEnabled: false,
      visitorCount: 1,
    };
  }

  // If existing row has NO custom_slug, generate and backfill it from team name
  let customSlug = existing.custom_slug;
  if (!customSlug) {
    const team = await db
      .prepare("SELECT name FROM teams WHERE id = ?")
      .bind(teamId)
      .first<{ name: string }>()
      .catch((e) => {
        logger.warn({ module: "club-website" }, "lookup team name for backfill slug", e);
        return null;
      });

    customSlug = await generateUniqueTeamSlug(db, teamId, team?.name || `tym-${teamId.slice(0, 8)}`);
    await db
      .prepare("UPDATE team_websites SET custom_slug = ? WHERE team_id = ?")
      .bind(customSlug, teamId)
      .run()
      .catch((e) => logger.warn({ module: "club-website" }, "backfill custom_slug", e));
  }

  // Increment visitor count quietly
  db.prepare("UPDATE team_websites SET visitor_count = visitor_count + 1 WHERE team_id = ?")
    .bind(teamId)
    .run()
    .catch((e) => logger.warn({ module: "club-website" }, "increment visitor count", e));

  let unlockedTemplates: ClubWebsiteTemplate[] = ["retro_2004"];
  try {
    unlockedTemplates = JSON.parse(existing.unlocked_templates);
  } catch (e) {
    logger.warn({ module: "club-website" }, "parse unlocked templates", e);
  }

  let unlockedAddons: ClubWebsiteAddon[] = [];
  try {
    unlockedAddons = JSON.parse(existing.unlocked_addons);
  } catch (e) {
    logger.warn({ module: "club-website" }, "parse unlocked addons", e);
  }

  return {
    template: (existing.template || "retro_2004") as ClubWebsiteTemplate,
    unlockedTemplates,
    unlockedAddons,
    customSlug,
    announcement: existing.announcement,
    sponsorBannerEnabled: existing.sponsor_banner_enabled === 1,
    visitorCount: (existing.visitor_count || 0) + 1,
  };
}

// Helper pro generování vesnické fotbalové představovačky a rozlučky (kluby nikdy nezveřejňují částky)
function generateTransferFlavor(
  t: {
    direction: "in" | "out";
    kind: string;
    fee: number | null;
    playerName: string;
    otherTeamName: string | null;
  },
  teamName: string,
  villageName: string,
) {
  const isArrival = t.direction === "in";
  const otherClub = t.otherTeamName || (isArrival ? "předchozího působiště" : "nového klubu");

  if (isArrival) {
    let headline = `Nová posila: ${t.playerName} přichází do ${teamName}!`;
    let story = "";
    let quote = "";

    if (t.kind === "free_agent") {
      headline = `Podpis volného hráče: ${t.playerName} posiluje ${teamName}!`;
      story = `Klubové vedení dotáhlo jednání s volným hráčem. Do kabiny v ${villageName} přichází ${t.playerName} jako volný hráč bez angažmá. Trenér si od něj slibuje okamžité zkvalitnění herního projevu a novou energii do týmu.`;
      quote = `„Kluci v kabině mě vzali parádně, zápisné do týmové kasy mám zaplacené a po zápase se těším na jedno orosené u klandru!“ — ${t.playerName}`;
    } else {
      headline = `Nová posila: ${t.playerName} přichází z ${otherClub}!`;
      story = `Vedení klubu dotáhlo jednání o přestupu! Z celku ${otherClub} přichází ${t.playerName}. Oba kluby se po vzájemné dohodě rozhodly výši odstupného nezveřejňovat. Hráč se okamžitě zapojil do tréninkového procesu v ${villageName}.`;
      quote = `„Nabídka ${teamName} se nedala odmítnout. Je tu skvělá parta, výborný pažit a hlad po bodech. Udělám všechno pro to, abychom potěšili naše fanoušky.“ — ${t.playerName}`;
    }

    return { headline, story, quote };
  } else {
    // Departure / Rozlučka
    let headline = `Klubová rozlučka: ${t.playerName} opouští ${teamName}`;
    let story = "";
    let quote = "";

    if (t.kind === "released") {
      headline = `Rozvázání smlouvy: ${t.playerName} končí v dresu ${teamName}`;
      story = `Po vzájemné dohodě obou stran došlo k ukončení působení ${t.playerName} v našem klubu. Za všechny odehrané zápasy, obětavost a bojovnost mu patří upřímné poděkování celého klubu.`;
      quote = `„V ${villageName} jsem zažil krásné fotbalové roky a poznal skvělé lidi. Klukům budu i dál na dálku držet palce.“ — ${t.playerName}`;
    } else {
      headline = `Přestup zpečetěn: ${t.playerName} odchází do ${otherClub}`;
      story = `Klub ${teamName} oznamuje přestup svého hráče. ${t.playerName} bude nově oblékat dres ${otherClub}. Výše odstupného nebyla po dohodě obou klubů zveřejněna. Vedení i spoluhráči mu přejí hodně štěstí v nové sportovní výzvě.`;
      quote = `„Na roky v ${teamName} nikdy nezapomenu. Děkuju všem fanouškům za podporu u klandru i v hospodě po zápase.“ — ${t.playerName}`;
    }

    return { headline, story, quote };
  }
}

// GET /api/teams/:id/website — veřejná i interní data pro Klubový web
clubWebsiteRouter.get("/:id/website", async (c) => {
  const identifier = c.req.param("id");
  const teamId = await resolveTeamId(c.env.DB, identifier);
  if (!teamId) return c.json({ error: "Klub nenalezen" }, 404);

  // 1. Team & Club identity
  const team = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.primary_color, t.secondary_color, t.badge_pattern, t.jersey_pattern, t.stadium_name,
            t.away_primary_color, t.away_secondary_color, t.away_jersey_pattern, t.jersey_sponsor,
            t.home_shorts_color, t.home_socks_color, t.away_shorts_color, t.away_socks_color,
            t.badge_primary_color, t.badge_secondary_color, t.badge_initials, t.badge_symbol,
            t.scarf_pattern, t.budget, t.league_id,
            t.anthem_url, t.anthem_lyrics, t.anthem_title, t.anthem_style,
            t.stadium_nickname, t.stadium_built_year, t.stadium_specialita, t.stadium_tribuna_north, t.stadium_tribuna_south,
            t.team_nickname, t.club_motto, t.founding_year, t.founding_story, t.colors_meaning,
            v.name as village_name, v.district, v.region, v.population, v.size as village_category
     FROM teams t 
     JOIN villages v ON t.village_id = v.id 
     WHERE t.id = ?`,
  ).bind(teamId).first<{
    id: string; name: string; primary_color: string; secondary_color: string;
    badge_pattern: string; jersey_pattern: string; stadium_name: string;
    away_primary_color: string | null; away_secondary_color: string | null; away_jersey_pattern: string | null;
    jersey_sponsor: string | null; home_shorts_color: string | null; home_socks_color: string | null;
    away_shorts_color: string | null; away_socks_color: string | null;
    badge_primary_color: string | null; badge_secondary_color: string | null; badge_initials: string | null;
    badge_symbol: string | null; scarf_pattern: string | null; budget: number; league_id: string;
    anthem_url: string | null; anthem_lyrics: string | null; anthem_title: string | null; anthem_style: string | null;
    stadium_nickname: string | null; stadium_built_year: number | null; stadium_specialita: string | null;
    stadium_tribuna_north: string | null; stadium_tribuna_south: string | null;
    team_nickname: string | null; club_motto: string | null; founding_year: number | null;
    founding_story: string | null; colors_meaning: string | null;
    village_name: string; district: string; region: string; population: number; village_category: string;
  }>();

  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  // Stadium details
  const stadium = await c.env.DB.prepare(
    "SELECT * FROM stadiums WHERE team_id = ? LIMIT 1",
  ).bind(teamId).first<any>()
    .catch((e) => { logger.warn({ module: "club-website" }, "fetch stadium", e); return null; });
  const { calculateFacilityEffects: calcFxClub } = await import("../stadium/stadium-generator");
  const clubCapacity = stadium ? stadium.capacity + calcFxClub({ ...standFacilities(stadium), vip_box: stadium.vip_box ?? 0 }).capacityBonus : null;

  const { loadExtensions } = await import("../stadium/extensions-db");
  const extRows = await loadExtensions(c.env.DB, teamId).catch(() => []);

  const bannerContracts = await c.env.DB.prepare(
    "SELECT sponsor_name FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND (category = 'banner' OR category = 'stadium') LIMIT 8",
  ).bind(teamId).all<{ sponsor_name: string }>().catch(() => ({ results: [] }));

  // Main & Stadium Sponsor
  const mainSponsor = await c.env.DB.prepare(
    "SELECT sponsor_name FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND (category = 'main' OR category IS NULL) LIMIT 1",
  ).bind(teamId).first<{ sponsor_name: string }>()
    .catch((e) => { logger.warn({ module: "club-website" }, "fetch main sponsor", e); return null; });

  const stadiumNamingSponsor = await c.env.DB.prepare(
    "SELECT sponsor_name FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND category = 'stadium' LIMIT 1",
  ).bind(teamId).first<{ sponsor_name: string }>()
    .catch((e) => { logger.warn({ module: "club-website" }, "fetch stadium sponsor", e); return null; });

  // Chants
  const zaklad = c.env.API_BASE_URL || new URL(c.req.url).origin;
  const chantsRows = await c.env.DB.prepare(
    `SELECT id, kind, text, duvod, sila, audio_vybrana
     FROM fan_chants
     WHERE team_id = ? AND status = 'zpiva' AND audio_a IS NOT NULL
     ORDER BY (kind = 'domov') DESC, sila DESC LIMIT 5`,
  ).bind(teamId).all<{
    id: string; kind: string; text: string; duvod: string; sila: number; audio_vybrana: string | null;
  }>().catch((e) => { logger.warn({ module: "club-website" }, "fetch chants", e); return { results: [] }; });
  const chants = (chantsRows.results ?? []).map((r) => ({
    id: r.id, kind: r.kind, text: r.text, duvod: r.duvod, sila: r.sila,
    url: `${zaklad}/api/choraly/${r.id}/audio?v=${r.audio_vybrana ?? "a"}`,
  }));

  // Mascot
  const mascotRow = await c.env.DB.prepare(
    "SELECT name, image_url, story FROM team_mascots WHERE team_id = ? AND is_selected = 1 LIMIT 1",
  ).bind(teamId).first<{ name: string; image_url: string | null; story: string | null }>()
    .catch((e) => { logger.warn({ module: "club-website" }, "fetch mascot", e); return null; });

  // 2. Website settings & increment
  const website = await ensureWebsiteRow(c.env.DB, teamId);

  // 3. Manager & Head coach
  const managerRow = await c.env.DB.prepare(
    `SELECT m.id, m.name, m.age, m.reputation, m.avatar, m.coaching, m.tactics, m.motivation, m.discipline, m.licence_level, m.bio, m.birthplace
     FROM managers m JOIN teams t ON t.user_id = m.user_id WHERE t.id = ?`,
  ).bind(teamId).first<{
    id: string; name: string; age: number; reputation: number; avatar: string;
    coaching: number; tactics: number; motivation: number; discipline: number; licence_level: number | null;
    bio: string | null; birthplace: string | null;
  }>().catch((e) => { logger.warn({ module: "club-website" }, "fetch manager", e); return null; });

  // 4. Staff members (trenérský štáb a personál)
  const staffRows = await c.env.DB.prepare(
    `SELECT id, role, profession, first_name, last_name, gender, age, avatar, description
     FROM staff_members WHERE team_id = ? ORDER BY role ASC`,
  ).bind(teamId).all<{
    id: string; role: string; profession: string; first_name: string; last_name: string;
    gender: string; age: number; avatar: string; description: string | null;
  }>().catch((e) => { logger.warn({ module: "club-website" }, "fetch staff", e); return { results: [] }; });

  const staffMembers = (staffRows.results ?? []).map((s) => {
    let av = {};
    try {
      av = typeof s.avatar === "string" ? JSON.parse(s.avatar) : s.avatar;
    } catch (e) {
      logger.warn({ module: "club-website" }, "parse staff avatar", e);
    }
    return {
      id: s.id,
      role: s.role,
      profession: s.profession,
      firstName: s.first_name,
      lastName: s.last_name,
      gender: s.gender,
      age: s.age,
      avatar: av,
      description: s.description,
    };
  });

  // 5. Players (A-tým) — filtrováno na aktivní/poslední sezonu a s GROUP BY p.id proti duplicitám z více sezon
  const playersRows = await c.env.DB.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.position, p.overall_rating, p.age, p.squad_number, p.avatar,
            COALESCE(SUM(ps.appearances), 0) as appearances,
            COALESCE(SUM(ps.goals), 0) as goals,
            COALESCE(SUM(ps.assists), 0) as assists,
            COALESCE(SUM(ps.clean_sheets), 0) as clean_sheets,
            COALESCE(SUM(ps.minutes_played), 0) as minutes_played
     FROM players p
     LEFT JOIN player_stats ps ON ps.player_id = p.id AND ps.team_id = p.team_id
       AND ps.season_id = (
         SELECT id FROM seasons 
         ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, number DESC 
         LIMIT 1
       )
     WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
     GROUP BY p.id
     ORDER BY CASE p.position 
                WHEN 'GK' THEN 1 
                WHEN 'DEF' THEN 2 WHEN 'CB' THEN 2 WHEN 'LB' THEN 2 WHEN 'RB' THEN 2 WHEN 'LWB' THEN 2 WHEN 'RWB' THEN 2
                WHEN 'MID' THEN 3 WHEN 'CM' THEN 3 WHEN 'LM' THEN 3 WHEN 'RM' THEN 3 WHEN 'CDM' THEN 3 WHEN 'CAM' THEN 3 WHEN 'DM' THEN 3 WHEN 'AM' THEN 3
                WHEN 'FWD' THEN 4 WHEN 'ST' THEN 4 WHEN 'CF' THEN 4 WHEN 'LW' THEN 4 WHEN 'RW' THEN 4 
                ELSE 5 END, 
              CASE WHEN p.squad_number IS NULL OR p.squad_number = 0 THEN 999 ELSE p.squad_number END ASC, 
              p.overall_rating DESC`,
  ).bind(teamId).all<{
    id: string; first_name: string; last_name: string; position: string; overall_rating: number;
    age: number; squad_number: number | null; avatar: string;
    appearances: number; goals: number; assists: number; clean_sheets: number; minutes_played: number;
  }>().catch((e) => { logger.warn({ module: "club-website" }, "fetch players", e); return { results: [] }; });

  const aTeamPlayers = (playersRows.results ?? []).map((p) => {
    let av = {};
    try {
      av = typeof p.avatar === "string" ? JSON.parse(p.avatar) : p.avatar;
    } catch (e) {
      logger.warn({ module: "club-website" }, "parse player avatar", e);
    }
    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      position: p.position,
      positionName: formatPlayerPositionCZ(p.position),
      overallRating: p.overall_rating,
      age: p.age,
      squadNumber: p.squad_number,
      avatar: av,
      stats: {
        appearances: p.appearances,
        goals: p.goals,
        assists: p.assists,
        cleanSheets: p.clean_sheets,
        minutesPlayed: p.minutes_played,
      },
    };
  });

  // 6. Reserve team (U21) if exists
  const u21Team = await c.env.DB.prepare(
    "SELECT id, name FROM teams WHERE parent_team_id = ? AND team_type = 'u21' LIMIT 1",
  ).bind(teamId).first<{ id: string; name: string }>().catch((e) => {
    logger.warn({ module: "club-website" }, "fetch u21 team", e);
    return null;
  });

  let u21Players: typeof aTeamPlayers = [];
  if (u21Team) {
    const u21Rows = await c.env.DB.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.position, p.overall_rating, p.age, p.squad_number, p.avatar,
              COALESCE(SUM(ps.appearances), 0) as appearances,
              COALESCE(SUM(ps.goals), 0) as goals,
              COALESCE(SUM(ps.assists), 0) as assists,
              COALESCE(SUM(ps.clean_sheets), 0) as clean_sheets,
              COALESCE(SUM(ps.minutes_played), 0) as minutes_played
       FROM players p
       LEFT JOIN player_stats ps ON ps.player_id = p.id AND ps.team_id = p.team_id
         AND ps.season_id = (
           SELECT id FROM seasons 
           ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, number DESC 
           LIMIT 1
         )
       WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
       GROUP BY p.id
       ORDER BY CASE p.position 
                  WHEN 'GK' THEN 1 
                  WHEN 'DEF' THEN 2 WHEN 'CB' THEN 2 WHEN 'LB' THEN 2 WHEN 'RB' THEN 2 WHEN 'LWB' THEN 2 WHEN 'RWB' THEN 2
                  WHEN 'MID' THEN 3 WHEN 'CM' THEN 3 WHEN 'LM' THEN 3 WHEN 'RM' THEN 3 WHEN 'CDM' THEN 3 WHEN 'CAM' THEN 3 WHEN 'DM' THEN 3 WHEN 'AM' THEN 3
                  WHEN 'FWD' THEN 4 WHEN 'ST' THEN 4 WHEN 'CF' THEN 4 WHEN 'LW' THEN 4 WHEN 'RW' THEN 4 
                  ELSE 5 END, 
                CASE WHEN p.squad_number IS NULL OR p.squad_number = 0 THEN 999 ELSE p.squad_number END ASC, 
                p.overall_rating DESC`,
    ).bind(u21Team.id).all<any>().catch((e) => {
      logger.warn({ module: "club-website" }, "fetch u21 players", e);
      return { results: [] };
    });

    u21Players = (u21Rows.results ?? []).map((p: any) => {
      let av = {};
      try {
        av = typeof p.avatar === "string" ? JSON.parse(p.avatar) : p.avatar;
      } catch (e) {
        logger.warn({ module: "club-website" }, "parse u21 player avatar", e);
      }
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        position: p.position,
        positionName: formatPlayerPositionCZ(p.position),
        overallRating: p.overall_rating,
        age: p.age,
        squadNumber: p.squad_number,
        avatar: av,
        stats: {
          appearances: p.appearances,
          goals: p.goals,
          assists: p.assists,
          cleanSheets: p.clean_sheets,
          minutesPlayed: p.minutes_played,
        },
      };
    });
  }

  // Helper to extract dramatic highlight moments from match events
  function extractHighlights(rawEvents: unknown): ClubWebsiteMatchHighlight[] {
    let events: any[] = [];
    try {
      events = typeof rawEvents === "string" ? JSON.parse(rawEvents) : ((rawEvents as any[]) || []);
    } catch {
      events = [];
    }
    if (!Array.isArray(events)) return [];

    let keyMoments = events.filter((e) => {
      if (e.type === "goal") return true;
      if (e.type === "card" && (e.detail === "red" || e.detail === "yellow_red")) return true;
      if (e.type === "penalty") return true;
      if (e.type === "chance" && (
        e.detail === "břevno" ||
        e.detail === "tyč" ||
        e.detail === "penalty_missed" ||
        e.detail === "penalty_saved" ||
        e.description?.toLowerCase().includes("břevno") ||
        e.description?.toLowerCase().includes("tyč") ||
        e.description?.toLowerCase().includes("gólová") ||
        e.description?.toLowerCase().includes("tutovka")
      )) return true;
      return false;
    });

    if (keyMoments.length === 0) {
      keyMoments = events
        .filter((e) => e.type === "chance" || (e.type === "card" && e.detail === "yellow"))
        .slice(0, 5);
    }

    return keyMoments
      .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))
      .map((e) => ({
        minute: e.minute ?? 0,
        type: e.type,
        isHome: e.teamId === 1,
        playerName: e.playerName || "Hráč",
        description: e.description || "",
        detail: e.detail,
        source: e.source,
      }));
  }

  // 7. Matches: Last simulated match + Next scheduled match + recent matches for highlights
  const recentMatchesRows = await c.env.DB.prepare(
    `SELECT m.id, m.round, m.home_score, m.away_score, m.events, m.simulated_at,
            ht.id as home_id, ht.name as home_name, ht.primary_color as home_primary, ht.badge_pattern as home_badge,
            at.id as away_id, at.name as away_name, at.primary_color as away_primary, at.badge_pattern as away_badge
     FROM matches m
     JOIN teams ht ON m.home_team_id = ht.id
     JOIN teams at ON m.away_team_id = at.id
     WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'simulated'
     ORDER BY m.simulated_at DESC LIMIT 3`,
  ).bind(teamId, teamId).all<any>().catch((e) => {
    logger.warn({ module: "club-website" }, "fetch recent matches", e);
    return { results: [] };
  });

  const recentMatches: ClubWebsiteMatchSummary[] = (recentMatchesRows?.results || []).map((row: any) => ({
    id: row.id,
    round: row.round,
    isHome: row.home_id === teamId,
    scoreHome: row.home_score,
    scoreAway: row.away_score,
    opponent: row.home_id === teamId
      ? { id: row.away_id, name: row.away_name, primaryColor: row.away_primary, badge: row.away_badge }
      : { id: row.home_id, name: row.home_name, primaryColor: row.home_primary, badge: row.home_badge },
    date: row.simulated_at,
    highlights: extractHighlights(row.events),
  }));

  // Fallback to cup matches if no league matches played yet
  if (recentMatches.length === 0) {
    const cupMatchesRows = await c.env.DB.prepare(
      `SELECT cm.id, cm.round, cm.home_score, cm.away_score, cm.events, cm.simulated_at,
              hct.team_id as home_id, hct.name as home_name, hct.primary_color as home_primary,
              act.team_id as away_id, act.name as away_name, act.primary_color as away_primary
       FROM cup_matches cm
       JOIN cup_teams hct ON cm.home_cup_team_id = hct.id
       JOIN cup_teams act ON cm.away_cup_team_id = act.id
       WHERE (hct.team_id = ? OR act.team_id = ?) AND cm.status = 'simulated'
       ORDER BY cm.simulated_at DESC LIMIT 3`,
    ).bind(teamId, teamId).all<any>().catch((e) => {
      logger.warn({ module: "club-website" }, "fetch recent cup matches", e);
      return { results: [] };
    });

    for (const row of cupMatchesRows?.results || []) {
      recentMatches.push({
        id: row.id,
        round: row.round,
        isHome: row.home_id === teamId,
        scoreHome: row.home_score,
        scoreAway: row.away_score,
        opponent: row.home_id === teamId
          ? { id: row.away_id || "", name: row.away_name, primaryColor: row.away_primary || "#D94032", badge: "shield" }
          : { id: row.home_id || "", name: row.home_name, primaryColor: row.home_primary || "#2D5F2D", badge: "shield" },
        date: row.simulated_at,
        highlights: extractHighlights(row.events),
      });
    }
  }

  const lastMatch = recentMatches[0] || null;

  const nextMatch = await c.env.DB.prepare(
    `SELECT m.id, m.round, sc.scheduled_at,
            ht.id as home_id, ht.name as home_name, ht.stadium_name as home_stadium, ht.primary_color as home_primary, ht.badge_pattern as home_badge,
            at.id as away_id, at.name as away_name, at.primary_color as away_primary, at.badge_pattern as away_badge
     FROM matches m
     LEFT JOIN season_calendar sc ON m.calendar_id = sc.id
     JOIN teams ht ON m.home_team_id = ht.id
     JOIN teams at ON m.away_team_id = at.id
     WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'scheduled'
     ORDER BY sc.scheduled_at ASC LIMIT 1`,
  ).bind(teamId, teamId).first<any>().catch((e) => {
    logger.warn({ module: "club-website" }, "fetch next match", e);
    return null;
  });

  // Upcoming matches (next 5)
  const upcomingMatchesRows = await c.env.DB.prepare(
    `SELECT m.id, m.round, sc.scheduled_at,
            ht.id as home_id, ht.name as home_name, ht.stadium_name as home_stadium, ht.primary_color as home_primary, ht.badge_pattern as home_badge,
            at.id as away_id, at.name as away_name, at.primary_color as away_primary, at.badge_pattern as away_badge
     FROM matches m
     LEFT JOIN season_calendar sc ON m.calendar_id = sc.id
     JOIN teams ht ON m.home_team_id = ht.id
     JOIN teams at ON m.away_team_id = at.id
     WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'scheduled'
     ORDER BY sc.scheduled_at ASC LIMIT 5`,
  ).bind(teamId, teamId).all<any>().catch((e) => {
    logger.warn({ module: "club-website" }, "fetch upcoming matches", e);
    return { results: [] };
  });

  const upcomingMatches = (upcomingMatchesRows?.results || []).map((m: any) => ({
    id: m.id,
    round: m.round,
    isHome: m.home_id === teamId,
    stadiumName: m.home_stadium || team.stadium_name,
    scheduledAt: m.scheduled_at,
    opponent: m.home_id === teamId
      ? { id: m.away_id, name: m.away_name, primaryColor: m.away_primary, badge: m.away_badge }
      : { id: m.home_id, name: m.home_name, primaryColor: m.home_primary, badge: m.home_badge },
  }));

  // League standings
  let leagueStandings: Array<{
    pos: number;
    teamId: string;
    teamName: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    points: number;
    isCurrentTeam: boolean;
  }> = [];

  if (team.league_id) {
    try {
      const { calculateStandings } = await import("../stats/standings");
      const st = await calculateStandings(c.env.DB, team.league_id);
      const leagueTeamsResult = await c.env.DB.prepare(
        "SELECT id, name FROM teams WHERE league_id = ?"
      ).bind(team.league_id).all<{ id: string; name: string }>();
      const teamNameMap = new Map((leagueTeamsResult.results || []).map((t) => [t.id, t.name]));

      leagueStandings = st.map((s) => ({
        pos: s.pos,
        teamId: s.teamId,
        teamName: teamNameMap.get(s.teamId) || "Neznámý tým",
        played: s.played,
        won: s.wins,
        drawn: s.draws,
        lost: s.losses,
        gf: s.gf,
        ga: s.ga,
        points: s.points,
        isCurrentTeam: s.teamId === teamId,
      }));
    } catch (e) {
      logger.warn({ module: "club-website" }, "fetch league standings", e);
    }
  }

  // Check derby rivalry for next match
  let isRival = false;
  if (nextMatch) {
    const oppId = nextMatch.home_id === teamId ? nextMatch.away_id : nextMatch.home_id;
    const rivalry = await c.env.DB.prepare(
      "SELECT 1 FROM fan_rivalries WHERE (team_a = ? AND team_b = ?) OR (team_a = ? AND team_b = ?) LIMIT 1",
    ).bind(teamId, oppId, oppId, teamId).first().catch((e) => {
      logger.warn({ module: "club-website" }, "fetch fan rivalry", e);
      return null;
    });
    if (rivalry) isRival = true;
  }

  // 8. Concessions & Buffet
  const concessionRows = await c.env.DB.prepare(
    "SELECT product_key, quality_level, sell_price FROM concession_products WHERE team_id = ?",
  ).bind(teamId).all<{ product_key: string; quality_level: number; sell_price: number }>().catch((e) => {
    logger.warn({ module: "club-website" }, "fetch concession products", e);
    return { results: [] };
  });
  
  const beerProd = (concessionRows.results ?? []).find((r) => r.product_key === "beer");
  const sausageProd = (concessionRows.results ?? []).find((r) => r.product_key === "sausage");
  const limoProd = (concessionRows.results ?? []).find((r) => r.product_key === "lemonade");

  const { CONCESSION_CATALOG } = await import("../season/concession-catalog");
  const beerName = beerProd && CONCESSION_CATALOG.beer.tiers[beerProd.quality_level]?.label
    ? CONCESSION_CATALOG.beer.tiers[beerProd.quality_level].label
    : "Točené pivo 10°";
  const sausageName = sausageProd && CONCESSION_CATALOG.sausage.tiers[sausageProd.quality_level]?.label
    ? CONCESSION_CATALOG.sausage.tiers[sausageProd.quality_level].label
    : "Klobása z udírny";
  const lemonadeName = limoProd && CONCESSION_CATALOG.lemonade.tiers[limoProd.quality_level]?.label
    ? CONCESSION_CATALOG.lemonade.tiers[limoProd.quality_level].label
    : "Točená malinovka";

  // 9. Ticket prices
  const fansRow = await c.env.DB.prepare(
    "SELECT base_ticket_price FROM fans WHERE team_id = ? LIMIT 1",
  ).bind(teamId).first<{ base_ticket_price: number }>().catch((e) => {
    logger.warn({ module: "club-website" }, "fetch base ticket price", e);
    return null;
  });

  const defaultVillageTicketPrice =
    team.village_category === "city" || team.village_category === "small_city"
      ? 50
      : team.village_category === "town"
        ? 40
        : 30;
  const adultTicketPrice = (fansRow?.base_ticket_price && fansRow.base_ticket_price > 0)
    ? fansRow.base_ticket_price
    : defaultVillageTicketPrice;

  // 10. Coach interviews
  const interviewRows = await c.env.DB.prepare(
    `SELECT id, game_week, questions, answers, created_at
     FROM coach_interviews
     WHERE team_id = ? AND status = 'answered'
     ORDER BY created_at DESC LIMIT 6`,
  ).bind(teamId).all<{ id: string; game_week: number; questions: string; answers: string | null; created_at: string }>().catch((e) => {
    logger.warn({ module: "club-website" }, "fetch coach interviews", e);
    return { results: [] };
  });

  const interviews = (interviewRows.results ?? []).map((r) => {
    let q: string[] = [];
    let a: string[] = [];
    try {
      q = JSON.parse(r.questions);
    } catch (e) {
      logger.warn({ module: "club-website" }, "parse interview questions", e);
    }
    try {
      a = r.answers ? JSON.parse(r.answers) : [];
    } catch (e) {
      logger.warn({ module: "club-website" }, "parse interview answers", e);
    }
    return {
      id: r.id,
      gameWeek: r.game_week,
      questions: q,
      answers: a,
      createdAt: r.created_at,
    };
  });

  // 11. Recent News
  const newsRows = await c.env.DB.prepare(
    "SELECT id, type, headline, body, created_at FROM news WHERE team_id = ? ORDER BY created_at DESC LIMIT 4",
  ).bind(teamId).all<{ id: string; type: string; headline: string; body: string; created_at: string }>().catch((e) => {
    logger.warn({ module: "club-website" }, "fetch news", e);
    return { results: [] };
  });

  // 12. Transfers (Představovačky a rozlučky)
  const { loadTransferOverview } = await import("../transfers/transfer-overview");
  const transferRows = await loadTransferOverview(c.env.DB, teamId, 8).catch((e) => {
    logger.warn({ module: "club-website" }, "load transfer overview", e);
    return [];
  });
  const transfers = transferRows.map((t) => {
    const flavor = generateTransferFlavor(t, team.name, team.village_name);
    return {
      id: `${t.playerId}-${t.date}`,
      direction: t.direction,
      kind: t.kind,
      playerId: t.playerId,
      playerName: t.playerName,
      otherTeamId: t.otherTeamId,
      otherTeamName: t.otherTeamName,
      fee: t.fee,
      date: t.date,
      seasonNumber: t.seasonNumber,
      headline: flavor.headline,
      story: flavor.story,
      quote: flavor.quote,
    };
  });

  return c.json({
    team: {
      id: team.id,
      name: team.name,
      primaryColor: team.primary_color,
      secondaryColor: team.secondary_color,
      badgePattern: team.badge_pattern,
      jerseyPattern: team.jersey_pattern,
      village: {
        name: team.village_name,
        district: team.district,
        region: team.region,
        population: team.population,
      },
      identity: {
        nickname: team.team_nickname,
        motto: team.club_motto,
        foundingYear: team.founding_year,
        foundingStory: team.founding_story,
        colorsMeaning: team.colors_meaning,
      },
      stadium: {
        name: team.stadium_name,
        capacity: clubCapacity,
        pitchCondition: stadium?.pitch_condition ?? 75,
        pitchType: stadium?.pitch_type ?? "natural",
        nickname: team.stadium_nickname,
        builtYear: team.stadium_built_year,
        specialita: team.stadium_specialita,
        tribunaNorth: team.stadium_tribuna_north,
        tribunaSouth: team.stadium_tribuna_south,
        namingSponsor: stadiumNamingSponsor?.sponsor_name ?? null,
        facilities: stadium ? {
          changing_rooms: stadium.changing_rooms ?? 0,
          showers: stadium.showers ?? 0,
          refreshments: stadium.refreshments ?? 0,
          lighting: stadium.lighting ?? 0,
          stands: stadium.stands ?? 0,
          stand_main: stadium.stand_main ?? 0,
          stand_opposite: stadium.stand_opposite ?? 0,
          stand_goal_west: stadium.stand_goal_west ?? 0,
          stand_goal_east: stadium.stand_goal_east ?? 0,
          roof: stadium.roof ?? 0,
          ultras_stand: stadium.ultras_stand ?? 0,
          toilets: stadium.toilets ?? 0,
          parking: stadium.parking ?? 0,
          fence: stadium.fence ?? 0,
          entrance_gate: stadium.entrance_gate ?? 0,
          security: stadium.security ?? 0,
          cage: stadium.cage ?? 0,
          vip_box: stadium.vip_box ?? 0,
        } : undefined,
        customization: stadium ? {
          fenceColor: stadium.fence_color ?? null,
          standColor: stadium.stand_color ?? null,
          seatColor: stadium.seat_color ?? null,
          roofColor: stadium.roof_color ?? null,
          accentColor: stadium.accent_color ?? null,
          scoreboardLevel: stadium.scoreboard_level ?? 0,
          flagSize: stadium.flag_size ?? 0,
          ultrasText: stadium.ultras_text ?? null,
          ultrasBannerColor: stadium.ultras_banner_color ?? null,
          ultrasTextColor: stadium.ultras_text_color ?? null,
          flagColor: stadium.flag_color ?? null,
          mowingPattern: stadium.mowing_pattern ?? "stripes",
          netPattern: stadium.net_pattern ?? "white",
          netStyle: stadium.net_style ?? "loose",
          surroundSurface: stadium.surround_surface ?? "grass",
        } : undefined,
        standExtensions: (extRows || []).map((e: any) => ({
          slot: e.slot,
          kind: e.kind,
          level: e.level,
        })),
        sponsors: (bannerContracts.results || []).map((s: any) => s.sponsor_name).filter(Boolean),
      },
      jersey: {
        pattern: team.jersey_pattern,
        homePrimary: team.primary_color,
        homeSecondary: team.secondary_color,
        awayPrimary: team.away_primary_color,
        awaySecondary: team.away_secondary_color,
        awayPattern: team.away_jersey_pattern,
        sponsor: mainSponsor?.sponsor_name ?? null,
        homeShortsColor: team.home_shorts_color,
        homeSocksColor: team.home_socks_color,
        awayShortsColor: team.away_shorts_color,
        awaySocksColor: team.away_socks_color,
      },
      badge: {
        pattern: team.badge_pattern,
        primary: team.badge_primary_color ?? team.primary_color,
        secondary: team.badge_secondary_color ?? team.secondary_color,
        customPrimary: team.badge_primary_color,
        customSecondary: team.badge_secondary_color,
        customInitials: team.badge_initials,
        symbol: team.badge_symbol,
      },
      scarfPattern: team.scarf_pattern ?? "classic",
      anthem: {
        url: team.anthem_url,
        lyrics: team.anthem_lyrics,
        title: team.anthem_title,
        style: team.anthem_style,
      },
      chants,
      mascot: {
        name: mascotRow?.name ?? null,
        imageUrl: mascotRow?.image_url ?? null,
        story: mascotRow?.story ?? null,
      },
      budget: team.budget,
    },
    website,
    manager: managerRow ? {
      name: managerRow.name,
      age: managerRow.age,
      reputation: managerRow.reputation,
      avatar: (() => {
        try {
          return JSON.parse(managerRow.avatar);
        } catch (e) {
          logger.warn({ module: "club-website" }, "parse manager avatar", e);
          return {};
        }
      })(),
      licence: managerRow.licence_level === 4 ? "PRO" : managerRow.licence_level === 3 ? "UEFA A" : managerRow.licence_level === 2 ? "UEFA B" : managerRow.licence_level === 1 ? "UEFA C" : "Bez licence",
      bio: managerRow.bio,
      birthplace: managerRow.birthplace,
    } : null,
    staff: staffMembers,
    roster: {
      aTeam: aTeamPlayers,
      u21Team: u21Players,
    },
    matches: {
      lastMatch,
      recentMatches,
      upcomingMatches,
      standings: leagueStandings,
      nextMatch: nextMatch ? {
        id: nextMatch.id,
        round: nextMatch.round,
        isHome: nextMatch.home_id === teamId,
        stadiumName: nextMatch.home_stadium || team.stadium_name,
        scheduledAt: nextMatch.scheduled_at,
        isRival,
        opponent: nextMatch.home_id === teamId
          ? { id: nextMatch.away_id, name: nextMatch.away_name, primaryColor: nextMatch.away_primary, badge: nextMatch.away_badge }
          : { id: nextMatch.home_id, name: nextMatch.home_name, primaryColor: nextMatch.home_primary, badge: nextMatch.home_badge },
      } : null,
    },
    concessions: {
      beerPrice: beerProd?.sell_price ?? 25,
      sausagePrice: sausageProd?.sell_price ?? 30,
      lemonadePrice: limoProd?.sell_price ?? 15,
      beerName,
      sausageName,
      lemonadeName,
    },
    tickets: {
      adultPrice: adultTicketPrice,
      price: adultTicketPrice,
    },
    interviews,
    news: newsRows.results ?? [],
    transfers,
  });
});

// Helper auth check for management endpoints
async function checkTeamAuth(c: Context<{ Bindings: Bindings }>, teamId: string) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: "Nepřihlášen", status: 401 };
  const token = authHeader.slice(7);
  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return { error: "Neplatná session", status: 401 };

  const team = await c.env.DB.prepare("SELECT user_id, budget, game_date, name FROM teams WHERE id = ?")
    .bind(teamId).first<{ user_id: string; budget: number; game_date: string; name: string }>();
  if (!team) return { error: "Tým nenalezen", status: 404 };
  if (team.user_id !== session.userId) return { error: "Přístup odepřen", status: 403 };

  return { team, session };
}

// POST /api/teams/:id/website/buy-template
clubWebsiteRouter.post("/:id/website/buy-template", async (c) => {
  const teamId = c.req.param("id");
  const auth = await checkTeamAuth(c, teamId);
  if ("error" in auth) return c.json({ error: auth.error }, auth.status as any);

  const body = (await c.req.json().catch((e) => {
    logger.warn({ module: "club-website" }, "parse buy-template body", e);
    return null;
  })) as { template?: ClubWebsiteTemplate } | null;
  const templateId = body?.template;
  if (!templateId || !(templateId in CLUB_WEBSITE_TEMPLATES)) {
    return c.json({ error: "Neplatná šablona" }, 400);
  }

  const def = CLUB_WEBSITE_TEMPLATES[templateId];
  const web = await ensureWebsiteRow(c.env.DB, teamId);

  if (web.unlockedTemplates.includes(templateId)) {
    // Already owned, just activate
    await c.env.DB.prepare("UPDATE team_websites SET template = ?, updated_at = datetime('now') WHERE team_id = ?")
      .bind(templateId, teamId).run();
    return c.json({ ok: true, activeTemplate: templateId, message: "Šablona aktivována" });
  }

  // Check budget
  if (auth.team.budget < def.price) {
    return c.json({ error: `Nedostatek financí. Potřebuješ ${def.price.toLocaleString("cs")} Kč.` }, 400);
  }

  // Deduct money if price > 0
  if (def.price > 0) {
    await recordTransaction(
      c.env.DB,
      teamId,
      "equipment_upgrade",
      -def.price,
      `Koupě šablony webu: ${def.name}`,
      auth.team.game_date || new Date().toISOString().slice(0, 10),
    );
  }

  const newUnlocked = [...web.unlockedTemplates, templateId];
  await c.env.DB.prepare(
    "UPDATE team_websites SET template = ?, unlocked_templates = ?, updated_at = datetime('now') WHERE team_id = ?",
  ).bind(templateId, JSON.stringify(newUnlocked), teamId).run();

  return c.json({
    ok: true,
    activeTemplate: templateId,
    unlockedTemplates: newUnlocked,
    message: `Šablona ${def.name} byla zakoupena a aktivována!`,
  });
});

// POST /api/teams/:id/website/select-template
clubWebsiteRouter.post("/:id/website/select-template", async (c) => {
  const teamId = c.req.param("id");
  const auth = await checkTeamAuth(c, teamId);
  if ("error" in auth) return c.json({ error: auth.error }, auth.status as any);

  const body = (await c.req.json().catch((e) => {
    logger.warn({ module: "club-website" }, "parse select-template body", e);
    return null;
  })) as { template?: ClubWebsiteTemplate } | null;
  const templateId = body?.template;
  if (!templateId || !(templateId in CLUB_WEBSITE_TEMPLATES)) {
    return c.json({ error: "Neplatná šablona" }, 400);
  }

  const web = await ensureWebsiteRow(c.env.DB, teamId);
  if (!web.unlockedTemplates.includes(templateId)) {
    return c.json({ error: "Tuto šablonu ještě nemáš zakoupenou" }, 400);
  }

  await c.env.DB.prepare("UPDATE team_websites SET template = ?, updated_at = datetime('now') WHERE team_id = ?")
    .bind(templateId, teamId).run();

  return c.json({ ok: true, activeTemplate: templateId });
});

// POST /api/teams/:id/website/buy-addon
clubWebsiteRouter.post("/:id/website/buy-addon", async (c) => {
  const teamId = c.req.param("id");
  const auth = await checkTeamAuth(c, teamId);
  if ("error" in auth) return c.json({ error: auth.error }, auth.status as any);

  const body = (await c.req.json().catch((e) => {
    logger.warn({ module: "club-website" }, "parse buy-addon body", e);
    return null;
  })) as { addon?: ClubWebsiteAddon } | null;
  const addonId = body?.addon;
  if (!addonId || !(addonId in CLUB_WEBSITE_ADDONS)) {
    return c.json({ error: "Neplatný doplněk" }, 400);
  }

  const def = CLUB_WEBSITE_ADDONS[addonId];
  const web = await ensureWebsiteRow(c.env.DB, teamId);

  if (web.unlockedAddons.includes(addonId)) {
    return c.json({ error: "Tento doplněk už máš zakoupený" }, 400);
  }

  if (auth.team.budget < def.price) {
    return c.json({ error: `Nedostatek financí. Potřebuješ ${def.price.toLocaleString("cs")} Kč.` }, 400);
  }

  await recordTransaction(
    c.env.DB,
    teamId,
    "equipment_upgrade",
    -def.price,
    `Koupě doplňku webu: ${def.name}`,
    auth.team.game_date || new Date().toISOString().slice(0, 10),
  );

  const newAddons = [...web.unlockedAddons, addonId];
  if (addonId === "sponsor_banner") {
    await c.env.DB.prepare(
      "UPDATE team_websites SET unlocked_addons = ?, sponsor_banner_enabled = 1, updated_at = datetime('now') WHERE team_id = ?",
    ).bind(JSON.stringify(newAddons), teamId).run();
  } else {
    await c.env.DB.prepare(
      "UPDATE team_websites SET unlocked_addons = ?, updated_at = datetime('now') WHERE team_id = ?",
    ).bind(JSON.stringify(newAddons), teamId).run();
  }

  return c.json({
    ok: true,
    unlockedAddons: newAddons,
    message: `Doplněk ${def.name} byl úspěšně zakoupen!`,
  });
});

// PATCH /api/teams/:id/website
clubWebsiteRouter.patch("/:id/website", async (c) => {
  const teamId = c.req.param("id");
  const auth = await checkTeamAuth(c, teamId);
  if ("error" in auth) return c.json({ error: auth.error }, auth.status as any);

  const body = (await c.req.json().catch((e) => {
    logger.warn({ module: "club-website" }, "parse patch website body", e);
    return null;
  })) as {
    customSlug?: string | null;
    announcement?: string | null;
    sponsorBannerEnabled?: boolean;
  } | null;

  if (!body) return c.json({ error: "Neplatná data" }, 400);
  const web = await ensureWebsiteRow(c.env.DB, teamId);

  // Slug update (defaultně z názvu týmu, možnost libovolné úpravy zdarma)
  if (body.customSlug !== undefined) {
    if (body.customSlug && body.customSlug.trim()) {
      const sanitized = slugifyTeamName(body.customSlug);
      if (sanitized.length < 3 || sanitized.length > 50) {
        return c.json({ error: "Adresa musí mít 3 až 50 znaků (jen písmena bez diakritiky, čísla a pomlčky)." }, 400);
      }
      // Check collision
      const collision = await c.env.DB.prepare(
        "SELECT team_id FROM team_websites WHERE custom_slug = ? AND team_id <> ?",
      ).bind(sanitized, teamId).first();
      if (collision) {
        return c.json({ error: "Tato adresa je již obsazena jiným klubem." }, 400);
      }
      await c.env.DB.prepare("UPDATE team_websites SET custom_slug = ? WHERE team_id = ?")
        .bind(sanitized, teamId).run();
    } else {
      // Obnovit výchozí slug z názvu týmu
      const defaultSlug = await generateUniqueTeamSlug(c.env.DB, teamId, auth.team.name);
      await c.env.DB.prepare("UPDATE team_websites SET custom_slug = ? WHERE team_id = ?")
        .bind(defaultSlug, teamId).run();
    }
  }

  // Announcement update
  if (body.announcement !== undefined) {
    if (body.announcement && !web.unlockedAddons.includes("press_officer")) {
      return c.json({ error: "Pro zveřejnění oficiálního prohlášení musíš mít zakoupený modul Tiskový mluvčí." }, 400);
    }
    await c.env.DB.prepare("UPDATE team_websites SET announcement = ? WHERE team_id = ?")
      .bind(body.announcement ? body.announcement.slice(0, 1000) : null, teamId).run();
  }

  // Sponsor banner update
  if (body.sponsorBannerEnabled !== undefined) {
    if (body.sponsorBannerEnabled && !web.unlockedAddons.includes("sponsor_banner")) {
      return c.json({ error: "Pro aktivaci reklamní lišty musíš mít zakoupený modul Sponzorská lišta." }, 400);
    }
    await c.env.DB.prepare("UPDATE team_websites SET sponsor_banner_enabled = ? WHERE team_id = ?")
      .bind(body.sponsorBannerEnabled ? 1 : 0, teamId).run();
  }

  return c.json({ ok: true, message: "Nastavení webu uloženo" });
});

// POST /api/teams/:id/website/generate-transfer-story — AI generování představení/rozlučky hráče
clubWebsiteRouter.post("/:id/website/generate-transfer-story", async (c) => {
  const identifier = c.req.param("id");
  const teamId = await resolveTeamId(c.env.DB, identifier);
  if (!teamId) return c.json({ error: "Klub nenalezen" }, 404);

  const body = (await c.req.json().catch((e) => {
    logger.warn({ module: "club-website" }, "parse generate-transfer-story body", e);
    return null;
  })) as {
    direction?: "in" | "out";
    playerName?: string;
    otherTeamName?: string;
    fee?: number;
    kind?: string;
  } | null;

  if (!body?.playerName) return c.json({ error: "Chybí jméno hráče" }, 400);

  const team = await c.env.DB.prepare(
    "SELECT t.name, v.name as village_name FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?",
  ).bind(teamId).first<{ name: string; village_name: string }>();

  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const isArrival = body.direction !== "out";
  const fee = body.fee ?? 0;
  const otherClub = body.otherTeamName || (isArrival ? "soupeře" : "nového klubu");

  // Try Gemini AI generation if available
  if (c.env.GEMINI_API_KEY) {
    try {
      const { callGemini } = await import("../news/gemini-helper");
      const prompt = `Jsi vtipný vesnický sportovní zpravodaj okresního přeboru v Česku (ve stylu seriálu Okresní přebor a vesnického fotbalového folklóru).
Napiš ${isArrival ? "PŘEDSTAVOVAČKU nové posily" : "ROZLUČKU s odcházejícím hráčem"} fotbalového klubu ${team.name} (obec ${team.village_name}).
Hráč: ${body.playerName}
${isArrival ? `Přichází z klubu: ${otherClub}` : `Odchází do klubu: ${otherClub}`}
Druh: ${body.kind === "free_agent" ? "volný hráč bez angažmá" : "přestup mezi kluby"}

PŘÍSNÉ PRAVIDLO: Kluby v oficiálních prohlášeních NIKDY nezveřejňují konkrétní přestupové částky ani finance! V textu ani v titulku nesmí být žádná čísla ani koruny. Místo toho můžeš zmínit, že se kluby dohodly výši odstupného nezveřejňovat, případně že hráč přichází jako volný hráč.

Odpověz POUZE ve validním JSON formátu bez markdownu s těmito klíči:
{
  "headline": "Úderný novinový titulek (max 10 slov, bez částek)",
  "story": "Krátký novinový článek (2-3 věty) s vesnickým fotbalovým koloritem (kabina, hospoda, traktor, pivo, klobása z udírny, fotbalový duch)",
  "quote": "Vtipná citace hráče nebo předsedy u piva v uvozovkách"
}`;

      const aiText = await callGemini(c.env.GEMINI_API_KEY, prompt, { json: true, temperature: 0.8 });
      if (aiText) {
        const parsed = JSON.parse(aiText);
        if (parsed.headline && parsed.story) {
          return c.json({
            ok: true,
            headline: parsed.headline,
            story: parsed.story,
            quote: parsed.quote,
            isAiGenerated: true,
          });
        }
      }
    } catch (e) {
      logger.warn({ module: "club-website" }, "AI transfer story error", e);
    }
  }

  // Fallback deterministic flavor
  const flavor = generateTransferFlavor(
    {
      direction: isArrival ? "in" : "out",
      kind: body.kind || "transfer",
      fee: fee,
      playerName: body.playerName,
      otherTeamName: otherClub,
    },
    team.name,
    team.village_name,
  );

  return c.json({
    ok: true,
    headline: flavor.headline,
    story: flavor.story,
    quote: flavor.quote,
    isAiGenerated: false,
  });
});

