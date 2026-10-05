import { Hono, type Context } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { getSession } from "../auth/session";
import { recordTransaction } from "../season/finance-processor";
import {
  CLUB_WEBSITE_TEMPLATES,
  CLUB_WEBSITE_ADDONS,
  type ClubWebsiteTemplate,
  type ClubWebsiteAddon,
} from "@okresni-masina/shared";
import { STAND_COLUMNS, standFacilities, type StandSide } from "../stadium/stands-model";

export const clubWebsiteRouter = new Hono<{ Bindings: Bindings }>();

// Helper to resolve teamId either from direct ID or from custom_slug
async function resolveTeamId(db: D1Database, identifier: string): Promise<string | null> {
  // 1. Direct team id check
  const direct = await db
    .prepare("SELECT id FROM teams WHERE id = ?")
    .bind(identifier)
    .first<{ id: string }>();
  if (direct) return direct.id;

  // 2. Custom slug check
  const bySlug = await db
    .prepare("SELECT team_id FROM team_websites WHERE custom_slug = ?")
    .bind(identifier)
    .first<{ team_id: string }>();
  if (bySlug) return bySlug.team_id;

  return null;
}

// Ensure website row exists in team_websites
async function ensureWebsiteRow(db: D1Database, teamId: string) {
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
    await db
      .prepare(
        `INSERT OR IGNORE INTO team_websites 
         (team_id, template, unlocked_templates, unlocked_addons, custom_slug, announcement, sponsor_banner_enabled, visitor_count) 
         VALUES (?, 'retro_2004', '["retro_2004"]', '[]', NULL, NULL, 0, 1)`,
      )
      .bind(teamId)
      .run()
      .catch((e) => logger.warn({ module: "club-website" }, "ensureWebsiteRow insert", e));

    return {
      template: "retro_2004" as ClubWebsiteTemplate,
      unlockedTemplates: ["retro_2004"] as ClubWebsiteTemplate[],
      unlockedAddons: [] as ClubWebsiteAddon[],
      customSlug: null,
      announcement: null,
      sponsorBannerEnabled: false,
      visitorCount: 1,
    };
  }

  // Increment visitor count quietly
  db.prepare("UPDATE team_websites SET visitor_count = visitor_count + 1 WHERE team_id = ?")
    .bind(teamId)
    .run()
    .catch(() => {});

  let unlockedTemplates: ClubWebsiteTemplate[] = ["retro_2004"];
  try {
    unlockedTemplates = JSON.parse(existing.unlocked_templates);
  } catch {}

  let unlockedAddons: ClubWebsiteAddon[] = [];
  try {
    unlockedAddons = JSON.parse(existing.unlocked_addons);
  } catch {}

  return {
    template: (existing.template || "retro_2004") as ClubWebsiteTemplate,
    unlockedTemplates,
    unlockedAddons,
    customSlug: existing.custom_slug,
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
            v.name as village_name, v.district, v.region, v.population, v.category as village_category
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
    `SELECT capacity, ${STAND_COLUMNS}, vip_box, pitch_condition, pitch_type FROM stadiums WHERE team_id = ? LIMIT 1`,
  ).bind(teamId).first<{ capacity: number; vip_box: number | null; pitch_condition: number; pitch_type: string } & Partial<Record<StandSide | "stand_ext_capacity", number | null>>>()
    .catch((e) => { logger.warn({ module: "club-website" }, "fetch stadium", e); return null; });
  const { calculateFacilityEffects: calcFxClub } = await import("../stadium/stadium-generator");
  const clubCapacity = stadium ? stadium.capacity + calcFxClub({ ...standFacilities(stadium), vip_box: stadium.vip_box ?? 0 }).capacityBonus : null;

  // Main & Stadium Sponsor
  const mainSponsor = await c.env.DB.prepare(
    "SELECT sponsor_name FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND (category = 'main' OR category IS NULL) LIMIT 1",
  ).bind(teamId).first<{ sponsor_name: string }>()
    .catch(() => null);

  const stadiumNamingSponsor = await c.env.DB.prepare(
    "SELECT sponsor_name FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND category = 'stadium' LIMIT 1",
  ).bind(teamId).first<{ sponsor_name: string }>()
    .catch(() => null);

  // Chants
  const zaklad = c.env.API_BASE_URL || new URL(c.req.url).origin;
  const chantsRows = await c.env.DB.prepare(
    `SELECT id, kind, text, duvod, sila, audio_vybrana
     FROM fan_chants
     WHERE team_id = ? AND status = 'zpiva' AND audio_a IS NOT NULL
     ORDER BY (kind = 'domov') DESC, sila DESC LIMIT 5`,
  ).bind(teamId).all<{
    id: string; kind: string; text: string; duvod: string; sila: number; audio_vybrana: string | null;
  }>().catch(() => ({ results: [] }));
  const chants = (chantsRows.results ?? []).map((r) => ({
    id: r.id, kind: r.kind, text: r.text, duvod: r.duvod, sila: r.sila,
    url: `${zaklad}/api/choraly/${r.id}/audio?v=${r.audio_vybrana ?? "a"}`,
  }));

  // Mascot
  const mascotRow = await c.env.DB.prepare(
    "SELECT name, image_url, story FROM team_mascots WHERE team_id = ? AND is_selected = 1 LIMIT 1",
  ).bind(teamId).first<{ name: string; image_url: string | null; story: string | null }>();

  // 2. Website settings & increment
  const website = await ensureWebsiteRow(c.env.DB, teamId);

  // 3. Manager & Head coach
  const managerRow = await c.env.DB.prepare(
    `SELECT m.id, m.name, m.age, m.reputation, m.avatar, m.coaching, m.tactics, m.motivation, m.discipline, m.licence
     FROM managers m JOIN teams t ON t.user_id = m.user_id WHERE t.id = ?`,
  ).bind(teamId).first<{
    id: string; name: string; age: number; reputation: number; avatar: string;
    coaching: number; tactics: number; motivation: number; discipline: number; licence: string | null;
  }>();

  // 4. Staff members (trenérský štáb a personál)
  const staffRows = await c.env.DB.prepare(
    `SELECT id, role, profession, first_name, last_name, gender, age, avatar, description
     FROM staff_members WHERE team_id = ? ORDER BY role ASC`,
  ).bind(teamId).all<{
    id: string; role: string; profession: string; first_name: string; last_name: string;
    gender: string; age: number; avatar: string; description: string | null;
  }>().catch(() => ({ results: [] }));

  const staffMembers = (staffRows.results ?? []).map((s) => {
    let av = {};
    try { av = typeof s.avatar === "string" ? JSON.parse(s.avatar) : s.avatar; } catch {}
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

  // 5. Players (A-tým)
  const playersRows = await c.env.DB.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.position, p.overall_rating, p.age, p.squad_number, p.avatar,
            COALESCE(ps.appearances, 0) as appearances,
            COALESCE(ps.goals, 0) as goals,
            COALESCE(ps.assists, 0) as assists,
            COALESCE(ps.clean_sheets, 0) as clean_sheets,
            COALESCE(ps.minutes_played, 0) as minutes_played
     FROM players p
     LEFT JOIN player_stats ps ON ps.player_id = p.id AND ps.team_id = p.team_id
     WHERE p.team_id = ?
     ORDER BY CASE p.position WHEN 'GK' THEN 1 WHEN 'CB' THEN 2 WHEN 'LB' THEN 2 WHEN 'RB' THEN 2 
                              WHEN 'CM' THEN 3 WHEN 'LM' THEN 3 WHEN 'RM' THEN 3 
                              WHEN 'ST' THEN 4 WHEN 'CF' THEN 4 ELSE 5 END, p.squad_number ASC`,
  ).bind(teamId).all<{
    id: string; first_name: string; last_name: string; position: string; overall_rating: number;
    age: number; squad_number: number | null; avatar: string;
    appearances: number; goals: number; assists: number; clean_sheets: number; minutes_played: number;
  }>().catch(() => ({ results: [] }));

  const aTeamPlayers = (playersRows.results ?? []).map((p) => {
    let av = {};
    try { av = typeof p.avatar === "string" ? JSON.parse(p.avatar) : p.avatar; } catch {}
    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      position: p.position,
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
  ).bind(teamId).first<{ id: string; name: string }>().catch(() => null);

  let u21Players: typeof aTeamPlayers = [];
  if (u21Team) {
    const u21Rows = await c.env.DB.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.position, p.overall_rating, p.age, p.squad_number, p.avatar,
              COALESCE(ps.appearances, 0) as appearances,
              COALESCE(ps.goals, 0) as goals,
              COALESCE(ps.assists, 0) as assists,
              COALESCE(ps.clean_sheets, 0) as clean_sheets,
              COALESCE(ps.minutes_played, 0) as minutes_played
       FROM players p
       LEFT JOIN player_stats ps ON ps.player_id = p.id AND ps.team_id = p.team_id
       WHERE p.team_id = ?
       ORDER BY p.squad_number ASC`,
    ).bind(u21Team.id).all<any>().catch(() => ({ results: [] }));

    u21Players = (u21Rows.results ?? []).map((p: any) => {
      let av = {};
      try { av = typeof p.avatar === "string" ? JSON.parse(p.avatar) : p.avatar; } catch {}
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        position: p.position,
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

  // 7. Matches: Last simulated match + Next scheduled match
  const lastMatch = await c.env.DB.prepare(
    `SELECT m.id, m.round, m.home_score, m.away_score, m.events, m.simulated_at,
            ht.id as home_id, ht.name as home_name, ht.primary_color as home_primary, ht.badge_pattern as home_badge,
            at.id as away_id, at.name as away_name, at.primary_color as away_primary, at.badge_pattern as away_badge
     FROM matches m
     JOIN teams ht ON m.home_team_id = ht.id
     JOIN teams at ON m.away_team_id = at.id
     WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'simulated'
     ORDER BY m.simulated_at DESC LIMIT 1`,
  ).bind(teamId, teamId).first<any>().catch(() => null);

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
  ).bind(teamId, teamId).first<any>().catch(() => null);

  // Check derby rivalry for next match
  let isRival = false;
  if (nextMatch) {
    const oppId = nextMatch.home_id === teamId ? nextMatch.away_id : nextMatch.home_id;
    const rivalry = await c.env.DB.prepare(
      "SELECT 1 FROM fan_rivalries WHERE (team_a = ? AND team_b = ?) OR (team_a = ? AND team_b = ?) LIMIT 1",
    ).bind(teamId, oppId, oppId, teamId).first().catch(() => null);
    if (rivalry) isRival = true;
  }

  // 8. Concessions & Buffet
  const concessionRows = await c.env.DB.prepare(
    "SELECT product_key, quality_level, sell_price FROM concession_products WHERE team_id = ?",
  ).bind(teamId).all<{ product_key: string; quality_level: number; sell_price: number }>().catch(() => ({ results: [] }));
  
  const beerProd = (concessionRows.results ?? []).find((r) => r.product_key === "beer");
  const sausageProd = (concessionRows.results ?? []).find((r) => r.product_key === "sausage");
  const limoProd = (concessionRows.results ?? []).find((r) => r.product_key === "lemonade");

  // 9. Ticket prices
  const fansRow = await c.env.DB.prepare(
    "SELECT base_ticket_price FROM fans WHERE team_id = ? LIMIT 1",
  ).bind(teamId).first<{ base_ticket_price: number }>().catch(() => null);

  const defaultVillageTicketPrice =
    team.village_category === "mesto" ? 50 : team.village_category === "mestys" ? 40 : team.village_category === "obec" ? 30 : 20;
  const adultTicketPrice = (fansRow?.base_ticket_price && fansRow.base_ticket_price > 0)
    ? fansRow.base_ticket_price
    : defaultVillageTicketPrice;

  // 10. Coach interviews
  const interviewRows = await c.env.DB.prepare(
    `SELECT id, game_week, questions, answers, created_at
     FROM coach_interviews
     WHERE team_id = ? AND status = 'answered'
     ORDER BY created_at DESC LIMIT 6`,
  ).bind(teamId).all<{ id: string; game_week: number; questions: string; answers: string | null; created_at: string }>().catch(() => ({ results: [] }));

  const interviews = (interviewRows.results ?? []).map((r) => {
    let q: string[] = [];
    let a: string[] = [];
    try { q = JSON.parse(r.questions); } catch {}
    try { a = r.answers ? JSON.parse(r.answers) : []; } catch {}
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
  ).bind(teamId).all<{ id: string; type: string; headline: string; body: string; created_at: string }>().catch(() => ({ results: [] }));

  // 12. Transfers (Představovačky a rozlučky)
  const { loadTransferOverview } = await import("../transfers/transfer-overview");
  const transferRows = await loadTransferOverview(c.env.DB, teamId, 8).catch(() => []);
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
        pitchCondition: stadium?.pitch_condition ?? null,
        pitchType: stadium?.pitch_type ?? null,
        nickname: team.stadium_nickname,
        builtYear: team.stadium_built_year,
        specialita: team.stadium_specialita,
        tribunaNorth: team.stadium_tribuna_north,
        tribunaSouth: team.stadium_tribuna_south,
        namingSponsor: stadiumNamingSponsor?.sponsor_name ?? null,
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
      avatar: (() => { try { return JSON.parse(managerRow.avatar); } catch { return {}; } })(),
      licence: managerRow.licence ?? "D",
    } : null,
    staff: staffMembers,
    roster: {
      aTeam: aTeamPlayers,
      u21Team: u21Players,
    },
    matches: {
      lastMatch: lastMatch ? {
        id: lastMatch.id,
        round: lastMatch.round,
        isHome: lastMatch.home_id === teamId,
        scoreHome: lastMatch.home_score,
        scoreAway: lastMatch.away_score,
        opponent: lastMatch.home_id === teamId
          ? { id: lastMatch.away_id, name: lastMatch.away_name, primaryColor: lastMatch.away_primary, badge: lastMatch.away_badge }
          : { id: lastMatch.home_id, name: lastMatch.home_name, primaryColor: lastMatch.home_primary, badge: lastMatch.home_badge },
        date: lastMatch.simulated_at,
      } : null,
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
      beerName: "Měšťan 10°",
      sausageName: "Kostelecká klobása z udírny",
      lemonadeName: "Točená malinovka",
    },
    tickets: {
      adultPrice: adultTicketPrice,
      childPrice: 0,
      seasonPassPrice: Math.round(15 * adultTicketPrice * 0.8),
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

  const team = await c.env.DB.prepare("SELECT user_id, budget, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ user_id: string; budget: number; game_date: string }>();
  if (!team) return { error: "Tým nenalezen", status: 404 };
  if (team.user_id !== session.userId) return { error: "Přístup odepřen", status: 403 };

  return { team, session };
}

// POST /api/teams/:id/website/buy-template
clubWebsiteRouter.post("/:id/website/buy-template", async (c) => {
  const teamId = c.req.param("id");
  const auth = await checkTeamAuth(c, teamId);
  if ("error" in auth) return c.json({ error: auth.error }, auth.status as any);

  const body = await c.req.json().catch(() => null) as { template?: ClubWebsiteTemplate } | null;
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

  const body = await c.req.json().catch(() => null) as { template?: ClubWebsiteTemplate } | null;
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

  const body = await c.req.json().catch(() => null) as { addon?: ClubWebsiteAddon } | null;
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
  await c.env.DB.prepare(
    "UPDATE team_websites SET unlocked_addons = ?, updated_at = datetime('now') WHERE team_id = ?",
  ).bind(JSON.stringify(newAddons), teamId).run();

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

  const body = await c.req.json().catch(() => null) as {
    customSlug?: string | null;
    announcement?: string | null;
    sponsorBannerEnabled?: boolean;
  } | null;

  if (!body) return c.json({ error: "Neplatná data" }, 400);
  const web = await ensureWebsiteRow(c.env.DB, teamId);

  // Slug update
  if (body.customSlug !== undefined) {
    if (body.customSlug !== null && !web.unlockedAddons.includes("custom_slug")) {
      return c.json({ error: "Pro nastavení vlastní adresy musíš nejprve zakoupit doplněk Vlastní URL adresa." }, 400);
    }
    if (body.customSlug) {
      const sanitized = body.customSlug.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
      if (sanitized.length < 3 || sanitized.length > 30) {
        return c.json({ error: "Adresa musí mít 3 až 30 znaků (jen malá písmena bez diakritiky, čísla a pomlčky)." }, 400);
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
      await c.env.DB.prepare("UPDATE team_websites SET custom_slug = NULL WHERE team_id = ?")
        .bind(teamId).run();
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

  const body = (await c.req.json().catch(() => null)) as {
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

