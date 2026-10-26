/**
 * Sponzoři jako entita: detail sponzora s majitelem a náklonnost ke klubům (etapa 1).
 * Smlouvy (podpis, prodloužení, výpověď) zůstávají v routes/game.ts.
 */
import { Hono, type Context } from "hono";
import type { Bindings } from "../index";
import { requireTeamOwnership } from "../auth/middleware";
import { getSession, getTokenFromRequest } from "../auth/session";
import { logger } from "../lib/logger";
import { isGameExpired } from "../lib/game-time";
import { budgetEstimateRange, sponsorBudgetB } from "../sponsors/budget";
import { DEFAULT_FAVOR, FAVOR_REASONS, invitationGiftCost, PUB_BEER_FAVOR, pubBeerCost } from "../sponsors/favor-math";
import {
  applySponsorFavorDelta, ensureSponsorOwner, ensureSponsorOwners, getFavor, getFavorsForTeam,
} from "../sponsors/favor";
import { inviteSponsorOwner, nextHomeMatch } from "../sponsors/invitations";
import { BASE_WILLINGNESS, WILLINGNESS_CAP } from "../sponsors/negotiation";
import {
  closeNegotiation, loadNegotiationSponsor, loadNegotiationState, loadNegotiationTeam, negotiationAvailability, openNegotiation,
} from "../sponsors/negotiation-db";
import { proposeRound } from "../sponsors/negotiation-round";
import { averageFavor, countBands, pickExtremes, rankAmongClubs, seasonAtDate, type FirmFavor } from "../sponsors/overview";
import { signNegotiation, viewWithClawback } from "../sponsors/signing";

export const sponsorsRouter = new Hono<{ Bindings: Bindings }>();
sponsorsRouter.use("/teams/:teamId/sponsor-owners/*", requireTeamOwnership);

// Jednání se sponzory: zápisy jen vlastník klubu. (Stejná cesta je i v gameRouteru
// pro bannery, dvojí kontrola vlastnictví nevadí.)
sponsorsRouter.use("/teams/:teamId/sponsors/*", requireTeamOwnership);

/**
 * requireTeamOwnership propouští GET bez tokenu. Stav jednání (rozpočet, návrhy, protinabídky)
 * ale patří jen vlastníkovi klubu, proto si ho čtení ověří samo (vzor assertOwnsTeam v game.ts).
 */
async function assertTeamOwner(
  c: Context<{ Bindings: Bindings }>, teamId: string,
): Promise<{ error: string; status: 401 | 403 } | null> {
  const token = getTokenFromRequest(c);
  if (!token) return { error: "Nepřihlášen", status: 401 };
  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return { error: "Neplatná session", status: 401 };
  const own = await c.env.DB.prepare("SELECT 1 AS x FROM teams WHERE id = ? AND user_id = ?")
    .bind(teamId, session.userId).first<{ x: number }>();
  return own ? null : { error: "Přístup odepřen", status: 403 };
}

interface TeamCtx { id: string; reputation: number; district: string; size: string; name: string }

async function loadTeam(db: D1Database, teamId: string): Promise<TeamCtx | null> {
  return db.prepare(
    `SELECT t.id, t.reputation, t.name, v.district, v.size FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?`,
  ).bind(teamId).first<TeamCtx>();
}

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
      // S kým a o co jde jednat (hlavní sponzor, název stadionu), nebo proč ne.
      let negotiation = null;
      const [negTeam, negSponsor] = await Promise.all([loadNegotiationTeam(db, teamId), loadNegotiationSponsor(db, sponsorId)]);
      if (negTeam && negSponsor && season?.number) {
        const [main, stadium] = await Promise.all([
          negotiationAvailability(db, negTeam, negSponsor, "main", season.number),
          negotiationAvailability(db, negTeam, negSponsor, "stadium", season.number),
        ]);
        negotiation = { main, stadium };
      }
      myTeam = {
        favor,
        budgetEstimate: { base: budgetEstimateRange(BASE_WILLINGNESS * b, favor), cap: budgetEstimateRange(WILLINGNESS_CAP * b, favor) },
        nextHomeMatch: next, negotiation,
      };
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

// GET /api/teams/:teamId/sponsor-owners/:sponsorId/request — prosba o příspěvek: odhady, závazky, historie
sponsorsRouter.get("/teams/:teamId/sponsor-owners/:sponsorId/request", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await assertTeamOwner(c, teamId);
  if (denied) return c.json({ error: denied.error }, denied.status);
  const sponsorId = Number(c.req.param("sponsorId"));
  if (!Number.isInteger(sponsorId)) return c.json({ error: "Neplatný sponzor" }, 400);
  const { requestInfo } = await import("../sponsors/requests-db");
  const info = await requestInfo(c.env.DB, teamId, sponsorId);
  if ("error" in info) return c.json({ error: info.error }, info.status);
  return c.json(info);
});

// POST /api/teams/:teamId/sponsor-owners/:sponsorId/conversation — otevře (založí) SMS s majitelem firmy
sponsorsRouter.post("/teams/:teamId/sponsor-owners/:sponsorId/conversation", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const sponsorId = Number(c.req.param("sponsorId"));
  if (!Number.isInteger(sponsorId)) return c.json({ error: "Neplatný sponzor" }, 400);
  const [team, sponsor, owner] = await Promise.all([
    loadTeam(db, teamId),
    db.prepare("SELECT id, name, district FROM district_sponsors WHERE id = ?").bind(sponsorId).first<{ id: number; name: string; district: string }>(),
    ensureSponsorOwner(db, sponsorId),
  ]);
  if (!team || !sponsor || !owner) return c.json({ error: "Firma nenalezena" }, 404);
  if (team.district !== sponsor.district) return c.json({ error: "Firma není z tvého okresu" }, 400);
  const { ownerConversationId } = await import("../messaging/system-sms");
  const conversationId = await ownerConversationId(db, teamId, {
    sponsorId, name: `${owner.firstName} ${owner.lastName}`, firmName: sponsor.name, avatar: JSON.stringify(owner.faceConfig),
  });
  return c.json({ conversationId });
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
      budgetEstimate: { base: budgetEstimateRange(BASE_WILLINGNESS * b, favor), cap: budgetEstimateRange(WILLINGNESS_CAP * b, favor) },
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

// POST /api/teams/:teamId/sponsor-owners/:sponsorId/invite — pozvat majitele na domácí zápas.
// Pravidla, šance, dárek a náklonnost: služba sdílená s AI trenérem (sponsors/invitations.ts).
sponsorsRouter.post("/teams/:teamId/sponsor-owners/:sponsorId/invite", async (c) => {
  const teamId = c.req.param("teamId");
  const sponsorId = Number(c.req.param("sponsorId"));
  const body = await c.req.json<{ matchId?: string }>()
    .catch((e) => { logger.warn({ module: "sponsors", teamId }, "parse invite body", e); return null; });
  if (!Number.isInteger(sponsorId) || !body?.matchId) return c.json({ error: "Chybí sponzor nebo zápas" }, 400);

  const res = await inviteSponsorOwner(c.env.DB, teamId, sponsorId, body.matchId);
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({
    status: res.status,
    giftCost: res.giftCost,
    probability: res.probability,
    rejectReason: res.rejectReason,
    favor: res.favor,
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

// POST /api/teams/:teamId/sponsors/:sponsorId/negotiations: otevřít jednání (nebo vrátit běžící)
sponsorsRouter.post("/teams/:teamId/sponsors/:sponsorId/negotiations", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const sponsorId = Number(c.req.param("sponsorId"));
  const body = await c.req.json<{ category?: string }>()
    .catch((e) => { logger.warn({ module: "sponsors", teamId }, "parse negotiation open body", e); return null; });
  if (!Number.isInteger(sponsorId)) return c.json({ error: "Neplatný sponzor" }, 400);
  const category = body?.category;
  if (category !== "main" && category !== "stadium") {
    return c.json({ error: "Jednat jde o hlavního sponzora nebo o název stadionu" }, 400);
  }
  const opened = await openNegotiation(db, teamId, sponsorId, category);
  if (!opened.ok) return c.json({ error: opened.error }, opened.status);
  const st = await loadNegotiationState(db, teamId, opened.id);
  if ("error" in st) return c.json({ error: st.error }, st.status);
  return c.json(await viewWithClawback(db, st));
});

// GET /api/teams/:teamId/sponsors/negotiations/:negotiationId: stav jednání (jen vlastník klubu)
sponsorsRouter.get("/teams/:teamId/sponsors/negotiations/:negotiationId", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await assertTeamOwner(c, teamId);
  if (denied) return c.json({ error: denied.error }, denied.status);
  const st = await loadNegotiationState(c.env.DB, teamId, c.req.param("negotiationId"));
  if ("error" in st) return c.json({ error: st.error }, st.status);
  return c.json(await viewWithClawback(c.env.DB, st));
});

// POST /api/teams/:teamId/sponsors/negotiations/:negotiationId/propose: návrh klubu, odpověď majitele.
// Klient posílá jen návrh; cenu, ochotu i protinabídku počítá server z vlastního kontextu.
// Stav, strop kol, validace, odpověď majitele a zápis kola dělá služba sdílená s AI trenérem
// (sponsors/negotiation-round.ts).
sponsorsRouter.post("/teams/:teamId/sponsors/negotiations/:negotiationId/propose", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const st = await loadNegotiationState(db, teamId, c.req.param("negotiationId"));
  if ("error" in st) return c.json({ error: st.error }, st.status);
  const raw = await c.req.json<unknown>()
    .catch((e) => { logger.warn({ module: "sponsors", teamId }, "parse negotiation proposal", e); return null; });
  const res = await proposeRound(db, st, raw);
  if (!res.ok) return c.json({ error: res.error }, res.status);

  const fresh = await loadNegotiationState(db, teamId, st.neg.id);
  if ("error" in fresh) return c.json({ error: fresh.error }, fresh.status);
  return c.json(await viewWithClawback(db, fresh));
});

// POST /api/teams/:teamId/sponsors/negotiations/:negotiationId/close: klub jednání dobrovolně
// ukončí (tlačítko „Ukončit jednání"). Bez pokuty na náklonnost a bez cooldownu — na rozdíl od
// odchodu majitele (walked_away) tohle je krok klubu, majitel to nebere zle.
sponsorsRouter.post("/teams/:teamId/sponsors/negotiations/:negotiationId/close", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const negotiationId = c.req.param("negotiationId");
  const st = await loadNegotiationState(db, teamId, negotiationId);
  if ("error" in st) return c.json({ error: st.error }, st.status);
  if (st.neg.status !== "open" && st.neg.status !== "accepted") {
    return c.json({ error: "Jednání už je uzavřené" }, 409);
  }
  const closed = await closeNegotiation(db, teamId, negotiationId);
  if (!closed) return c.json({ error: "Jednání už je uzavřené" }, 409);
  logger.info({ module: "sponsors", teamId }, `jednání ${negotiationId}: klub jednání dobrovolně ukončil`);

  const fresh = await loadNegotiationState(db, teamId, negotiationId);
  if ("error" in fresh) return c.json({ error: fresh.error }, fresh.status);
  return c.json(await viewWithClawback(db, fresh));
});

// POST /api/teams/:teamId/sponsors/negotiations/:negotiationId/accept: podpis přijatého návrhu
// nebo protinabídky. Tělo se nečte: podepisují se podmínky uložené v jednání.
sponsorsRouter.post("/teams/:teamId/sponsors/negotiations/:negotiationId/accept", async (c) => {
  const res = await signNegotiation(c.env.DB, c.req.param("teamId"), c.req.param("negotiationId"));
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json(res);
});

// GET /api/teams/:teamId/sponsor-promises — sliby u aktivních smluv klubu (etapa 3).
// Na rozdíl od sponsor-history jen pro vlastníka: pokuty a bonusy jiného klubu nejsou veřejné (R11).
sponsorsRouter.get("/teams/:teamId/sponsor-promises", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await assertTeamOwner(c, teamId);
  if (denied) return c.json({ error: denied.error }, denied.status);
  const { listTeamPromises } = await import("../sponsors/promise-runs");
  const promises = await listTeamPromises(c.env.DB, teamId);
  return c.json({ promises });
});

// POST /api/teams/:teamId/sponsor-promises/:promiseId/sleeve-logo — logo sponzora stadionu na rukáv
// dresu (slib jersey_logo). Slib se vyhodnotí hned, SMS majitele se zkusí doručit ještě teď.
sponsorsRouter.post("/teams/:teamId/sponsor-promises/:promiseId/sleeve-logo", requireTeamOwnership, async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  // Herní datum týmu; když chybí (nemělo by u existujícího týmu nastat), spadni na herní datum
  // libovolného jiného týmu (stejný vzorec jako jinde v kódu, např. routes/competition.ts), nikdy
  // na reálný čas — herní čas se od reálného posouvá (game_clock.offset_days).
  const team = await db.prepare(
    "SELECT game_date, (SELECT MAX(game_date) FROM teams WHERE game_date IS NOT NULL) AS any_game_date FROM teams WHERE id = ?",
  ).bind(teamId).first<{ game_date: string | null; any_game_date: string | null }>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);
  const gameDate = team.game_date ?? team.any_game_date;
  if (!gameDate) return c.json({ error: "Herní datum není známé, zkus to znovu" }, 409);
  const { placeSleeveLogo } = await import("../sponsors/promise-runs");
  const res = await placeSleeveLogo(db, teamId, c.req.param("promiseId"), gameDate);
  if (!res.ok) return c.json({ error: res.error }, res.code);
  try {
    const { deliverOwnerSmsForTeam } = await import("../sponsors/owner-sms");
    await deliverOwnerSmsForTeam(db, teamId);
  } catch (e) {
    logger.warn({ module: "sponsors", teamId }, "SMS majitele po logu na rukávu", e);
  }
  return c.json({ ok: true, status: res.status });
});
