/**
 * Sponzoři jako entita: detail sponzora s majitelem a náklonnost ke klubům (etapa 1).
 * Smlouvy (podpis, prodloužení, výpověď) zůstávají v routes/game.ts.
 */
import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireTeamOwnership } from "../auth/middleware";
import { logger } from "../lib/logger";
import { isGameExpired } from "../lib/game-time";
import { budgetEstimateRange, sponsorBudgetB } from "../sponsors/budget";
import {
  DEFAULT_FAVOR, FAVOR_REASONS, invitationAcceptance, invitationAcceptedDelta, invitationGiftCost, PUB_BEER_FAVOR, pubBeerCost,
} from "../sponsors/favor-math";
import {
  applySponsorFavorDelta, ensureSponsorOwner, ensureSponsorOwners, getFavor, getFavorsForTeam,
} from "../sponsors/favor";
import { averageFavor, countBands, pickExtremes, rankAmongClubs, seasonAtDate, type FirmFavor } from "../sponsors/overview";
import type { OwnerPersonality } from "../sponsors/owners";

export const sponsorsRouter = new Hono<{ Bindings: Bindings }>();
sponsorsRouter.use("/teams/:teamId/sponsor-owners/*", requireTeamOwnership);

interface TeamCtx { id: string; reputation: number; district: string; size: string; name: string }

async function loadTeam(db: D1Database, teamId: string): Promise<TeamCtx | null> {
  return db.prepare(
    `SELECT t.id, t.reputation, t.name, v.district, v.size FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?`,
  ).bind(teamId).first<TeamCtx>();
}

/**
 * Nejbližší domácí ligový zápas klubu, který ještě vůbec nezačal.
 *
 * `match-runner.ts` má životní cyklus zápasu 'scheduled' → 'lineups_open' (kolo je
 * zamčené, běží/čeká na simulaci) → 'simulated'. Pozvánky obce (`routes/villages.ts`)
 * berou `status != 'simulated'`, což pustí i 'lineups_open' — pozvat majitele firmy by
 * pak šlo i v okamžiku, kdy se kolo právě dohrává. Tady chceme jen 'scheduled'.
 */
async function nextHomeMatch(db: D1Database, teamId: string) {
  return db.prepare(
    `SELECT m.id, sc.scheduled_at, aw.name AS opponent_name
     FROM matches m
     JOIN season_calendar sc ON sc.id = m.calendar_id
     JOIN teams aw ON aw.id = m.away_team_id
     WHERE m.home_team_id = ? AND m.status = 'scheduled' AND sc.scheduled_at >= date('now', '-1 day')
     ORDER BY sc.scheduled_at ASC LIMIT 1`,
  ).bind(teamId).first<{ id: string; scheduled_at: string; opponent_name: string }>();
}

const REJECT_REASONS: Record<OwnerPersonality, string[]> = {
  patriot: ["Ten den mám zabijačku u bratra, příště určitě.", "Na hřiště rád, ale teď to nevyjde."],
  businessman: ["Mám jednání v Praze, nestihnu to.", "Pošlete mi termíny na další měsíc, ozvu se."],
  fan: ["Po tom, jak jste hráli minule? Letos ne.", "Mám lístky na ligu, sorry."],
  cautious: ["Nejdřív se chci podívat, jak to u vás funguje.", "Radši počkám, až se to u vás usadí."],
};

// GET /api/sponsors/:id?teamId= — sponzor jako entita + majitel + náklonnost klubu
sponsorsRouter.get("/sponsors/:sponsorId", async (c) => {
  const db = c.env.DB;
  const sponsorId = Number(c.req.param("sponsorId"));
  if (!Number.isInteger(sponsorId)) return c.json({ error: "Neplatný sponzor" }, 400);
  const teamId = c.req.query("teamId") ?? null;

  const sponsor = await db.prepare(
    `SELECT ds.id, ds.name, ds.type, ds.district, ds.monthly_max, ds.priority_season, ds.priority_team_id, t.name AS priority_team_name
     FROM district_sponsors ds LEFT JOIN teams t ON t.id = ds.priority_team_id WHERE ds.id = ?`,
  ).bind(sponsorId).first<{ id: number; name: string; type: string; district: string; monthly_max: number; priority_season: number | null; priority_team_id: string | null; priority_team_name: string | null }>();
  if (!sponsor) return c.json({ error: "Sponzor nenalezen" }, 404);

  const [contracts, season, owner] = await Promise.all([
    db.prepare(
      `SELECT sc.team_id, t.name AS team_name, sc.category, sc.status, sc.seasons_total, sc.seasons_remaining, sc.signed_at
       FROM sponsor_contracts sc JOIN teams t ON t.id = sc.team_id
       WHERE sc.sponsor_id = ? ORDER BY sc.signed_at DESC LIMIT 100`,
    ).bind(sponsorId).all<{ team_id: string; team_name: string; category: string; status: string; seasons_total: number; seasons_remaining: number; signed_at: string }>(),
    db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ number: number }>(),
    ensureSponsorOwner(db, sponsorId),
  ]);

  const mapRow = (r: (typeof contracts.results)[number]) => ({
    teamId: r.team_id, teamName: r.team_name, category: r.category, status: r.status,
    seasonsTotal: r.seasons_total, seasonsRemaining: r.seasons_remaining, signedAt: r.signed_at,
  });
  const active = contracts.results.filter((r) => r.status === "active");
  const priorityActive = sponsor.priority_team_id && sponsor.priority_season === season?.number
    && !active.some((r) => r.category === "main");

  let myTeam = null;
  if (teamId) {
    const team = await loadTeam(db, teamId);
    if (team && team.district === sponsor.district) {
      const favor = await getFavor(db, sponsorId, teamId);
      const b = sponsorBudgetB({ monthlyMax: sponsor.monthly_max, reputation: team.reputation, villageSize: team.size, category: "main", favor });
      const match = await nextHomeMatch(db, teamId);
      let next = null;
      if (match) {
        const day = match.scheduled_at.slice(0, 10);
        const [mine, taken] = await Promise.all([
          db.prepare("SELECT status, reject_reason FROM sponsor_invitations WHERE sponsor_id = ? AND team_id = ? AND match_id = ?")
            .bind(sponsorId, teamId, match.id).first<{ status: "accepted" | "declined" | "attended"; reject_reason: string | null }>(),
          db.prepare(
            `SELECT t.name FROM sponsor_invitations si JOIN teams t ON t.id = si.team_id
             WHERE si.sponsor_id = ? AND si.match_day = ? AND si.status IN ('accepted','attended') AND si.team_id != ? LIMIT 1`,
          ).bind(sponsorId, day, teamId).first<{ name: string }>(),
        ]);
        next = {
          matchId: match.id, scheduledAt: match.scheduled_at, opponentName: match.opponent_name,
          giftCost: invitationGiftCost(favor),
          invitation: mine ? { status: mine.status, rejectReason: mine.reject_reason } : null,
          slotTakenBy: taken?.name ?? null,
        };
      }
      myTeam = { favor, budgetEstimate: budgetEstimateRange(b, favor), nextHomeMatch: next };
    }
  }

  return c.json({
    id: sponsor.id,
    name: sponsor.name,
    type: sponsor.type,
    district: sponsor.district,
    owner: owner ? { firstName: owner.firstName, lastName: owner.lastName, age: owner.age, faceConfig: owner.faceConfig, personality: owner.personality } : null,
    myTeam,
    mainClub: active.filter((r) => r.category === "main").map(mapRow)[0] ?? null,
    priorityClub: priorityActive ? { teamId: sponsor.priority_team_id, teamName: sponsor.priority_team_name } : null,
    activeContracts: active.map(mapRow),
    history: contracts.results.filter((r) => r.status !== "active").map(mapRow),
  });
});

// GET /api/teams/:teamId/sponsor-owners — firmy v okrese klubu a aktuální setkání v hospodě
sponsorsRouter.get("/teams/:teamId/sponsor-owners", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const team = await loadTeam(db, teamId);
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const sponsors = await db.prepare(
    `SELECT ds.id, ds.name, ds.type, ds.monthly_max,
            (SELECT sc.team_id FROM sponsor_contracts sc WHERE sc.sponsor_id = ds.id AND sc.status = 'active' AND sc.category = 'main' LIMIT 1) AS holder_id,
            (SELECT t.name FROM sponsor_contracts sc JOIN teams t ON t.id = sc.team_id WHERE sc.sponsor_id = ds.id AND sc.status = 'active' AND sc.category = 'main' LIMIT 1) AS holder_name
     FROM district_sponsors ds WHERE ds.district = ? ORDER BY ds.monthly_max DESC`,
  ).bind(team.district).all<{ id: number; name: string; type: string; monthly_max: number; holder_id: string | null; holder_name: string | null }>();

  const [owners, favors] = await Promise.all([
    ensureSponsorOwners(db, sponsors.results.map((s) => s.id)),
    getFavorsForTeam(db, teamId),
  ]);

  const firms = sponsors.results.map((s) => {
    const favor = favors.get(s.id) ?? DEFAULT_FAVOR;
    const owner = owners.get(s.id);
    const b = sponsorBudgetB({ monthlyMax: s.monthly_max, reputation: team.reputation, villageSize: team.size, category: "main", favor });
    return {
      sponsorId: s.id, name: s.name, type: s.type,
      owner: owner ? { firstName: owner.firstName, lastName: owner.lastName, personality: owner.personality } : null,
      favor,
      budgetEstimate: budgetEstimateRange(b, favor),
      mainHolder: s.holder_id ? { teamId: s.holder_id, teamName: s.holder_name ?? "" } : null,
      isMine: s.holder_id === teamId,
    };
  });
  // Volní nahoře, pak podle velikosti (pořadí z SQL).
  firms.sort((a, b) => Number(a.mainHolder !== null) - Number(b.mainHolder !== null));

  const pubRow = await db.prepare(
    `SELECT e.id, e.sponsor_id, ds.name AS sponsor_name FROM sponsor_pub_encounters e
     JOIN district_sponsors ds ON ds.id = e.sponsor_id
     WHERE e.team_id = ? AND e.status = 'active' ORDER BY e.created_at DESC LIMIT 1`,
  ).bind(teamId).first<{ id: string; sponsor_id: number; sponsor_name: string }>();
  let pub = null;
  if (pubRow) {
    const o = owners.get(pubRow.sponsor_id) ?? await ensureSponsorOwner(db, pubRow.sponsor_id);
    if (o) {
      pub = {
        id: pubRow.id, sponsorId: pubRow.sponsor_id, sponsorName: pubRow.sponsor_name,
        ownerName: `${o.firstName} ${o.lastName}`, personality: o.personality, beerCost: pubBeerCost(o.personality),
      };
    }
  }

  return c.json({ firms, pub });
});

/**
 * Průměrná náklonnost všech firem okresu ke každému seniorskému klubu okresu (jen lidské, bez U21,
 * bez smazaných — stejný filtr jako generateSponsorPubEncounters v sponsors/hooks.ts).
 * Chybějící řádek náklonnosti = výchozí hodnota (?2); ?3 = počet firem v okrese (> 0).
 */
const CLUB_AVERAGES_SQL = `
  SELECT t.id AS team_id,
         (COALESCE(SUM(f.favor), 0) + ?2 * (?3 - COUNT(f.sponsor_id))) * 1.0 / ?3 AS avg_favor
  FROM teams t
  JOIN villages v ON v.id = t.village_id
  LEFT JOIN sponsor_team_favor f ON f.team_id = t.id
    AND f.sponsor_id IN (SELECT id FROM district_sponsors WHERE district = ?1)
  WHERE v.district = ?1 AND t.user_id != 'ai' AND COALESCE(t.team_type, 'senior') != 'u21' AND t.name NOT LIKE 'DELETED-%'
  GROUP BY t.id`;

interface FavorLogRow { sponsor_id: number; sponsor_name: string; delta: number; reason: string; game_date: string }

// GET /api/teams/:teamId/sponsor-overview — oblíbenost klubu u firem v okrese.
// Veřejné jako ostatní GET; o ostatních klubech vrací jen počet a naše pořadí.
sponsorsRouter.get("/teams/:teamId/sponsor-overview", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const team = await loadTeam(db, teamId);
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const sponsors = await db.prepare("SELECT id, name FROM district_sponsors WHERE district = ?")
    .bind(team.district).all<{ id: number; name: string }>();
  const ids = sponsors.results.map((s) => s.id);

  const [owners, favorMap, clubs, log] = await Promise.all([
    ensureSponsorOwners(db, ids),
    getFavorsForTeam(db, teamId),
    ids.length === 0
      ? Promise.resolve({ results: [] as Array<{ team_id: string; avg_favor: number }> })
      : db.prepare(CLUB_AVERAGES_SQL).bind(team.district, DEFAULT_FAVOR, ids.length)
        .all<{ team_id: string; avg_favor: number }>(),
    db.prepare(
      `SELECT l.sponsor_id, ds.name AS sponsor_name, l.delta, l.reason, l.game_date
       FROM sponsor_favor_log l JOIN district_sponsors ds ON ds.id = l.sponsor_id
       WHERE l.team_id = ? ORDER BY l.id DESC LIMIT 20`,
    ).bind(teamId).all<FavorLogRow>(),
  ]);

  const ownerName = (sponsorId: number): string | null => {
    const o = owners.get(sponsorId);
    return o ? `${o.firstName} ${o.lastName}` : null;
  };
  const firms: FirmFavor[] = sponsors.results.map((s) => ({
    sponsorId: s.id, name: s.name, ownerName: ownerName(s.id), favor: favorMap.get(s.id) ?? DEFAULT_FAVOR,
  }));
  const favors = firms.map((f) => f.favor);
  const place = rankAmongClubs(clubs.results.map((r) => ({ teamId: r.team_id, avgFavor: r.avg_favor })), teamId);
  const { top, coldest } = pickExtremes(firms);

  return c.json({
    avgFavor: averageFavor(favors),
    rank: place?.rank ?? null,
    clubsInDistrict: place?.clubsInDistrict ?? clubs.results.length,
    firmsCount: firms.length,
    bands: countBands(favors),
    top,
    coldest,
    recentChanges: log.results.map((r) => ({
      sponsorId: r.sponsor_id, sponsorName: r.sponsor_name, ownerName: ownerName(r.sponsor_id),
      delta: r.delta, reason: r.reason, gameDate: r.game_date,
    })),
  });
});

interface HistoryRow {
  id: string; sponsor_id: number | null; sponsor_name: string; category: string | null;
  status: "expired" | "terminated"; seasons_total: number; monthly_amount: number; signed_at: string;
}

// GET /api/teams/:teamId/sponsor-history — skončené smlouvy klubu.
// Celkové výdělky se nevrací: sponsor_income se v transakcích zapisuje za všechny smlouvy dohromady.
sponsorsRouter.get("/teams/:teamId/sponsor-history", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const team = await loadTeam(db, teamId);
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const [rows, seasons] = await Promise.all([
    db.prepare(
      `SELECT id, sponsor_id, sponsor_name, category, status, seasons_total, monthly_amount, signed_at
       FROM sponsor_contracts WHERE team_id = ? AND status IN ('expired','terminated')
       ORDER BY signed_at DESC LIMIT 50`,
    ).bind(teamId).all<HistoryRow>(),
    db.prepare("SELECT number, created_at FROM seasons ORDER BY number").all<{ number: number; created_at: string }>(),
  ]);
  const seasonList = seasons.results.map((s) => ({ number: s.number, createdAt: s.created_at }));

  return c.json({
    contracts: rows.results.map((r) => ({
      id: r.id,
      sponsorId: r.sponsor_id,
      sponsorName: r.sponsor_name,
      category: r.category === "stadium" || r.category === "banner" ? r.category : "main",
      status: r.status,
      seasonsTotal: r.seasons_total,
      monthlyAmount: r.monthly_amount,
      signedSeason: seasonAtDate(seasonList, r.signed_at),
    })),
  });
});

// POST /api/teams/:teamId/sponsor-owners/:sponsorId/invite — pozvat majitele na domácí zápas
sponsorsRouter.post("/teams/:teamId/sponsor-owners/:sponsorId/invite", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const sponsorId = Number(c.req.param("sponsorId"));
  const body = await c.req.json<{ matchId?: string }>()
    .catch((e) => { logger.warn({ module: "sponsors", teamId }, "parse invite body", e); return null; });
  if (!Number.isInteger(sponsorId) || !body?.matchId) return c.json({ error: "Chybí sponzor nebo zápas" }, 400);

  const team = await loadTeam(db, teamId);
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);
  const sponsor = await db.prepare("SELECT id, district FROM district_sponsors WHERE id = ?")
    .bind(sponsorId).first<{ id: number; district: string }>();
  if (!sponsor) return c.json({ error: "Sponzor nenalezen" }, 404);
  if (sponsor.district !== team.district) return c.json({ error: "Zvát jde jen firmy z vlastního okresu" }, 400);

  const match = await nextHomeMatch(db, teamId);
  if (!match || match.id !== body.matchId) return c.json({ error: "Zvát jde jen na nejbližší domácí zápas" }, 400);
  const matchDay = match.scheduled_at.slice(0, 10);

  const taken = await db.prepare(
    `SELECT 1 FROM sponsor_invitations WHERE sponsor_id = ? AND match_day = ? AND status IN ('accepted','attended') AND team_id != ?`,
  ).bind(sponsorId, matchDay, teamId).first();
  if (taken) return c.json({ error: "Majitel už ten den přijal pozvání jiného klubu" }, 409);

  const owner = await ensureSponsorOwner(db, sponsorId);
  if (!owner) return c.json({ error: "Majitel nenalezen" }, 404);
  const favor = await getFavor(db, sponsorId, teamId);
  const giftCost = invitationGiftCost(favor);

  const budget = await db.prepare("SELECT budget, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number; game_date: string | null }>();
  if (!budget || budget.budget < giftCost) return c.json({ error: "Na dárek nemáš peníze" }, 400);

  const recent = await db.prepare(
    `SELECT home_team_id, home_score, away_score FROM matches
     WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated' ORDER BY simulated_at DESC LIMIT 5`,
  ).bind(teamId, teamId).all<{ home_team_id: string; home_score: number; away_score: number }>();
  const recentLosses = recent.results.filter((m) => {
    const ours = m.home_team_id === teamId ? m.home_score : m.away_score;
    const theirs = m.home_team_id === teamId ? m.away_score : m.home_score;
    return ours < theirs;
  }).length;

  // Lóže dělá z pozvání zážitek. Když se úroveň nenačte, zve se jako bez lóže.
  // Bez tribun (stands < 1) je efektivní úroveň 0, i kdyby v DB zůstal vip_box > 0
  // po tom, co výtržnosti tribuny zbořily pod stojící lóží (viz calculateFacilityEffects).
  const vipRow = await db.prepare("SELECT vip_box, stands FROM stadiums WHERE team_id = ?")
    .bind(teamId).first<{ vip_box: number | null; stands: number | null }>()
    .catch((e) => { logger.warn({ module: "sponsors", teamId }, "load vip box for invite", e); return null; });
  const vipBoxEffectiveLevel = (vipRow?.stands ?? 0) >= 1 ? (vipRow?.vip_box ?? 0) : 0;

  const probability = invitationAcceptance({
    favor, personality: owner.personality, recentLosses, noise: (Math.random() - 0.5) * 0.2,
    vipBoxLevel: vipBoxEffectiveLevel,
  });
  const accepted = Math.random() < probability;
  const reasons = REJECT_REASONS[owner.personality];
  const rejectReason = accepted ? null : reasons[Math.floor(Math.random() * reasons.length)];

  try {
    await db.prepare(
      `INSERT INTO sponsor_invitations (id, sponsor_id, team_id, match_id, match_day, status, gift_cost, reject_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), sponsorId, teamId, match.id, matchDay, accepted ? "accepted" : "declined", giftCost, rejectReason).run();
  } catch (e) {
    // Unikátní index: už pozváno na tenhle zápas, nebo slot mezitím obsadil jiný klub.
    logger.warn({ module: "sponsors", teamId }, `insert sponsor invitation sponsor=${sponsorId}`, e);
    return c.json({ error: "Tohohle majitele už na ten zápas zvát nejde" }, 409);
  }

  const { recordTransaction } = await import("../season/finance-processor");
  await recordTransaction(db, teamId, "event", -giftCost, `Pozvání ${owner.firstName} ${owner.lastName} na zápas`,
    budget.game_date ?? new Date().toISOString());
  if (accepted) {
    await applySponsorFavorDelta(db, sponsorId, teamId, invitationAcceptedDelta(owner.personality), FAVOR_REASONS.invitationAccepted);
  }

  return c.json({
    status: accepted ? "accepted" : "declined",
    giftCost,
    probability: Math.round(probability * 100) / 100,
    rejectReason,
    favor: await getFavor(db, sponsorId, teamId),
  });
});

// POST /api/teams/:teamId/sponsor-owners/pub/:encId — pivo s majitelem, nebo ho nechat být
sponsorsRouter.post("/teams/:teamId/sponsor-owners/pub/:encId", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const encId = c.req.param("encId");
  const body = await c.req.json<{ action?: string }>()
    .catch((e) => { logger.warn({ module: "sponsors", teamId }, "parse pub body", e); return null; });
  if (body?.action !== "beer" && body?.action !== "ignore") return c.json({ error: "Neplatná akce" }, 400);

  const enc = await db.prepare(
    "SELECT e.id, e.sponsor_id, e.expires_at, t.game_date FROM sponsor_pub_encounters e JOIN teams t ON t.id = e.team_id WHERE e.id = ? AND e.team_id = ? AND e.status = 'active'",
  ).bind(encId, teamId).first<{ id: string; sponsor_id: number; expires_at: string; game_date: string | null }>();
  if (!enc) return c.json({ error: "Setkání už není aktivní" }, 410);
  if (isGameExpired(enc.expires_at, enc.game_date ?? new Date().toISOString())) {
    return c.json({ error: "Setkání už není aktivní" }, 410);
  }

  const claim = await db.prepare("UPDATE sponsor_pub_encounters SET status = ? WHERE id = ? AND status = 'active'")
    .bind(body.action === "beer" ? "beer" : "ignored", encId).run();
  if (!claim.meta.changes) return c.json({ error: "Setkání už není aktivní" }, 410);
  if (body.action === "ignore") return c.json({ ok: true });

  const owner = await ensureSponsorOwner(db, enc.sponsor_id);
  if (!owner) return c.json({ error: "Majitel nenalezen" }, 404);
  const cost = pubBeerCost(owner.personality);
  const gd = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>();
  const { recordTransaction } = await import("../season/finance-processor");
  await recordTransaction(db, teamId, "event", -cost, `Pivo s ${owner.firstName} ${owner.lastName}`, gd?.game_date ?? new Date().toISOString());
  await applySponsorFavorDelta(db, enc.sponsor_id, teamId, PUB_BEER_FAVOR, FAVOR_REASONS.pubBeer);
  return c.json({ ok: true, favor: await getFavor(db, enc.sponsor_id, teamId) });
});
