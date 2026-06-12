/**
 * Vztahy mezi manažery — API.
 *
 * GET  /teams/:teamId/relations            — přehled vztahů týmu v lize
 * GET  /teams/:teamId/relations/:otherId   — detail vztahu + dostupné interakce
 * POST /teams/:teamId/relations/:otherId/interact — provedení interakce
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import {
  getRelation, applyRelationEvent, relationStatus, relationLabel, aiArchetype, AI_ARCHETYPE_LABELS,
  isAiTeam, aiGestureResponse, aiAcceptsBet, aiStatementResponse, shiftSquadMorale, insertRelationNews,
  getManagerName, getTeamName, getTeamGameDate,
  type GestureChoice, type StatementTone,
} from "../community/manager-relations";
import { recordTransaction, assertPurchaseAllowed } from "../season/finance-processor";
import { createNotification } from "../community/notifications";
import { requireTeamOwnership } from "../auth/middleware";
import {
  statementRespectQuote, statementProvokeQuote, statementHumbleQuote,
  adTextFor, jabNewsBody, praiseReplyText, praiseNews,
  beerSceneText, dartsWinText, dartsLossText,
  giftSincereMessage, giftPoisonMessage,
  stammtischNews, stammtischQuarrelText, stammtischDeclineText, stammtischSceneText,
  pubRoundMessage,
  type RelationNames,
} from "../community/relation-texts";

export const relationsRouter = new Hono<{ Bindings: Bindings }>();

// Write operace (interact, štamtiš, runda) smí provádět jen vlastník týmu z :teamId.
relationsRouter.use("/teams/:teamId/relations/*", requireTeamOwnership);
relationsRouter.use("/teams/:teamId/stammtisch", requireTeamOwnership);
relationsRouter.use("/teams/:teamId/pub-round", requireTeamOwnership);

const BEER_COST = 50;
const BET_AMOUNT = 500;
const AD_COST = 100;
const GIFT_COST = 80;
const BEER_COOLDOWN_DAYS = 7;
const AD_COOLDOWN_DAYS = 14;
const PRAISE_COOLDOWN_DAYS = 7;
const BEER_MIN_RESPECT = 30;

interface MatchRow {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  round: number | null;
  league_id: string | null;
}

/**
 * Poslední odehraný zápas týmu `a` — ale jen pokud byl proti `b`.
 * Pozápasové interakce (gesto, dárek) se vážou na čerstvý zážitek: jakmile tým
 * odehraje další zápas, moment u kabin je pryč.
 */
async function lastMutualFinishedMatch(db: D1Database, a: string, b: string): Promise<MatchRow | null> {
  const last = await db.prepare(
    `SELECT id, home_team_id, away_team_id, home_score, away_score, status, round, league_id
     FROM matches
     WHERE status IN ('simulated', 'finished')
       AND (home_team_id = ? OR away_team_id = ?)
     ORDER BY simulated_at DESC LIMIT 1`
  ).bind(a, a).first<MatchRow>();
  if (!last) return null;
  const opponent = last.home_team_id === a ? last.away_team_id : last.home_team_id;
  return opponent === b ? last : null;
}

async function nextMutualMatch(db: D1Database, a: string, b: string): Promise<MatchRow | null> {
  return await db.prepare(
    `SELECT id, home_team_id, away_team_id, home_score, away_score, status, round, league_id
     FROM matches
     WHERE status IN ('scheduled', 'lineups_open')
       AND ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?))
     ORDER BY round ASC LIMIT 1`
  ).bind(a, b, b, a).first<MatchRow>();
}

async function hasInteraction(
  db: D1Database, type: string, actorId: string, matchId: string,
): Promise<boolean> {
  const row = await db.prepare(
    "SELECT id FROM manager_interactions WHERE type = ? AND actor_team_id = ? AND match_id = ? LIMIT 1"
  ).bind(type, actorId, matchId).first<{ id: string }>();
  return !!row;
}

async function lastInteractionAt(
  db: D1Database, type: string, teamA: string, teamB: string,
): Promise<string | null> {
  const row = await db.prepare(
    `SELECT created_at FROM manager_interactions
     WHERE type = ? AND ((actor_team_id = ? AND target_team_id = ?) OR (actor_team_id = ? AND target_team_id = ?))
     ORDER BY created_at DESC LIMIT 1`
  ).bind(type, teamA, teamB, teamB, teamA).first<{ created_at: string }>();
  return row?.created_at ?? null;
}

function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

async function insertInteraction(
  db: D1Database, type: string, actorId: string, targetId: string,
  matchId: string | null, payload: Record<string, unknown>, status = "resolved",
): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO manager_interactions (id, type, actor_team_id, target_team_id, match_id, payload, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, type, actorId, targetId, matchId, JSON.stringify(payload), status).run();
  return id;
}

const STAMMTISCH_COOLDOWN_DAYS = 14;
const STAMMTISCH_COST_PER_HEAD = 80;

// ────────────────────────────────────────────────────────────────────────────
// GET /teams/:teamId/social-info — dostupnost štamtiše a rundy
// ────────────────────────────────────────────────────────────────────────────

relationsRouter.get("/teams/:teamId/social-info", async (c) => {
  const teamId = c.req.param("teamId");
  const db = c.env.DB;

  const lastStammtisch = await db.prepare(
    "SELECT created_at FROM manager_interactions WHERE type = 'stammtisch' AND actor_team_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(teamId).first<{ created_at: string }>();
  const stammtischCooldownLeft = Math.max(0, Math.ceil(STAMMTISCH_COOLDOWN_DAYS - daysSince(lastStammtisch?.created_at ?? null)));

  // Runda: poslední odehraný zápas musí být výhra a runda za něj ještě nebyla
  const lastMatch = await db.prepare(
    `SELECT id, home_team_id, home_score, away_score FROM matches
     WHERE status IN ('simulated', 'finished') AND (home_team_id = ? OR away_team_id = ?)
     ORDER BY simulated_at DESC LIMIT 1`
  ).bind(teamId, teamId).first<{ id: string; home_team_id: string; home_score: number; away_score: number }>();

  let pubRound: { available: boolean; reason: string | null } = { available: false, reason: "Žádný odehraný zápas." };
  if (lastMatch) {
    const myScore = lastMatch.home_team_id === teamId ? lastMatch.home_score : lastMatch.away_score;
    const theirScore = lastMatch.home_team_id === teamId ? lastMatch.away_score : lastMatch.home_score;
    if (myScore <= theirScore) {
      pubRound = { available: false, reason: "Runda se kupuje po výhře. Nejdřív vyhraj." };
    } else if (await hasInteraction(db, "pub_round", teamId, lastMatch.id)) {
      pubRound = { available: false, reason: "Za tuhle výhru už hospoda pila." };
    } else {
      pubRound = { available: true, reason: null };
    }
  }

  return c.json({
    stammtisch: {
      available: stammtischCooldownLeft === 0,
      cooldownDaysLeft: stammtischCooldownLeft === Infinity ? 0 : stammtischCooldownLeft,
      costPerHead: STAMMTISCH_COST_PER_HEAD,
    },
    pubRound,
  });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /teams/:teamId/relations — přehled
// ────────────────────────────────────────────────────────────────────────────

relationsRouter.get("/teams/:teamId/relations", async (c) => {
  const teamId = c.req.param("teamId");

  const team = await c.env.DB.prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null }>();
  if (!team?.league_id) return c.json({ relations: [] });

  const rows = await c.env.DB.prepare(
    `SELECT t.id as other_team_id, t.name as team_name, t.primary_color,
            m.name as manager_name, m.user_id as manager_user_id,
            r.respect, r.heat
     FROM teams t
     LEFT JOIN managers m ON m.team_id = t.id
     LEFT JOIN manager_relations r
       ON (r.team_a_id = MIN(t.id, ?) AND r.team_b_id = MAX(t.id, ?))
     WHERE t.league_id = ? AND t.id != ?`
  ).bind(teamId, teamId, team.league_id, teamId).all<{
    other_team_id: string; team_name: string; primary_color: string | null;
    manager_name: string | null; manager_user_id: string | null;
    respect: number | null; heat: number | null;
  }>();

  const relations = rows.results.map((r) => {
    const respect = r.respect ?? 0;
    const heat = r.heat ?? 0;
    const isAi = !r.manager_user_id || r.manager_user_id === "ai";
    return {
      teamId: r.other_team_id,
      teamName: r.team_name,
      primaryColor: r.primary_color,
      managerName: r.manager_name ?? `Trenér ${r.team_name}`,
      isAi,
      archetypeLabel: isAi ? AI_ARCHETYPE_LABELS[aiArchetype(r.other_team_id)] : null,
      respect,
      heat,
      status: relationStatus(respect, heat),
      label: relationLabel(respect, heat),
    };
  }).sort((a, b) => (Math.abs(b.respect) + b.heat) - (Math.abs(a.respect) + a.heat));

  return c.json({ relations });
});

// ────────────────────────────────────────────────────────────────────────────
// GET /teams/:teamId/relations/:otherId — detail + dostupné interakce
// ────────────────────────────────────────────────────────────────────────────

relationsRouter.get("/teams/:teamId/relations/:otherId", async (c) => {
  const teamId = c.req.param("teamId");
  const otherId = c.req.param("otherId");
  if (teamId === otherId) return c.json({ error: "Vztah sám se sebou neexistuje. Zatím." }, 400);
  const db = c.env.DB;

  const otherExists = await db.prepare("SELECT id FROM teams WHERE id = ?").bind(otherId).first();
  if (!otherExists) return c.json({ error: "Tým nenalezen." }, 404);

  const rel = await getRelation(db, teamId, otherId);
  const otherIsAi = await isAiTeam(db, otherId);

  const [lastMatch, nextMatch] = await Promise.all([
    lastMutualFinishedMatch(db, teamId, otherId),
    nextMutualMatch(db, teamId, otherId),
  ]);

  // Gesto + dárek — vázané na poslední odehraný vzájemný zápas
  let gesture: { matchId: string; score: string; won: boolean } | null = null;
  let gift: { matchId: string; score: string } | null = null;
  if (lastMatch && lastMatch.home_score != null && lastMatch.away_score != null) {
    const myScore = lastMatch.home_team_id === teamId ? lastMatch.home_score : lastMatch.away_score;
    const theirScore = lastMatch.home_team_id === teamId ? lastMatch.away_score : lastMatch.home_score;
    const score = `${lastMatch.home_score}:${lastMatch.away_score}`;
    if (!(await hasInteraction(db, "gesture", teamId, lastMatch.id))) {
      gesture = { matchId: lastMatch.id, score, won: myScore > theirScore };
    }
    if (myScore - theirScore >= 4 && !(await hasInteraction(db, "gift", teamId, lastMatch.id))) {
      gift = { matchId: lastMatch.id, score };
    }
  }

  // Pivo — respekt + cooldown
  const beerAt = await lastInteractionAt(db, "beer", teamId, otherId);
  const beerCooldownLeft = Math.max(0, Math.ceil(BEER_COOLDOWN_DAYS - daysSince(beerAt)));
  const beer = {
    available: rel.respect >= BEER_MIN_RESPECT && beerCooldownLeft === 0,
    minRespect: BEER_MIN_RESPECT,
    cooldownDaysLeft: beerCooldownLeft === Infinity ? 0 : beerCooldownLeft,
    cost: BEER_COST,
  };

  // Předzápasový výrok do novin — 1× na vzájemný zápas
  let statement: { matchId: string; round: number | null } | null = null;
  if (nextMatch && !(await hasInteraction(db, "statement", teamId, nextMatch.id))) {
    statement = { matchId: nextMatch.id, round: nextMatch.round };
  }

  // Sázka — vázaná na příští vzájemný zápas
  let bet: { matchId: string; round: number | null; amount: number } | null = null;
  let pendingBet: { matchId: string; status: string; offeredByMe: boolean } | null = null;
  if (nextMatch) {
    const existing = await db.prepare(
      `SELECT actor_team_id, status FROM manager_interactions
       WHERE type = 'bet' AND match_id = ? AND status IN ('pending', 'offered') LIMIT 1`
    ).bind(nextMatch.id).first<{ actor_team_id: string; status: string }>();
    if (existing) {
      pendingBet = { matchId: nextMatch.id, status: existing.status, offeredByMe: existing.actor_team_id === teamId };
    } else {
      bet = { matchId: nextMatch.id, round: nextMatch.round, amount: BET_AMOUNT };
    }
  }

  // Pochvala — vstupní přátelská interakce, jen cooldown
  const praiseAt = await lastInteractionAt(db, "praise", teamId, otherId);
  const praiseCooldownLeft = Math.max(0, Math.ceil(PRAISE_COOLDOWN_DAYS - daysSince(praiseAt)));

  // Inzerát — cooldown
  const adAt = await lastInteractionAt(db, "ad", teamId, otherId);
  const adCooldownLeft = Math.max(0, Math.ceil(AD_COOLDOWN_DAYS - daysSince(adAt)));

  return c.json({
    respect: rel.respect,
    heat: rel.heat,
    status: relationStatus(rel.respect, rel.heat),
    label: relationLabel(rel.respect, rel.heat),
    history: rel.history,
    otherIsAi,
    archetypeLabel: otherIsAi ? AI_ARCHETYPE_LABELS[aiArchetype(otherId)] : null,
    interactions: {
      gesture,
      gift,
      beer,
      bet,
      pendingBet,
      statement,
      praise: { available: praiseCooldownLeft === 0, cooldownDaysLeft: praiseCooldownLeft === Infinity ? 0 : praiseCooldownLeft },
      ad: { available: adCooldownLeft === 0, cooldownDaysLeft: adCooldownLeft === Infinity ? 0 : adCooldownLeft, cost: AD_COST },
    },
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /teams/:teamId/relations/:otherId/interact
// ────────────────────────────────────────────────────────────────────────────

interface InteractBody {
  type: "gesture" | "beer" | "bet" | "bet_accept" | "bet_decline" | "ad" | "gift" | "statement" | "praise";
  matchId?: string;
  choice?: GestureChoice;
  tone?: "sincere" | "poison" | StatementTone;
}

relationsRouter.post("/teams/:teamId/relations/:otherId/interact", async (c) => {
  const teamId = c.req.param("teamId");
  const otherId = c.req.param("otherId");
  if (teamId === otherId) return c.json({ error: "Neplatný cíl." }, 400);
  const db = c.env.DB;
  const body = await c.req.json<InteractBody>().catch((e) => {
    logger.warn({ module: "relations" }, "parse interact body", e);
    return null;
  });
  if (!body?.type) return c.json({ error: "Chybí typ interakce." }, 400);

  const otherExists = await db.prepare("SELECT id FROM teams WHERE id = ?").bind(otherId).first();
  if (!otherExists) return c.json({ error: "Tým nenalezen." }, 404);

  const [myName, theirName, myManager, theirManager] = await Promise.all([
    getTeamName(db, teamId), getTeamName(db, otherId),
    getManagerName(db, teamId), getManagerName(db, otherId),
  ]);
  const otherIsAi = await isAiTeam(db, otherId);
  const gameDate = await getTeamGameDate(db, teamId);
  const names: RelationNames = { myName, theirName, myManager, theirManager };

  try {
    switch (body.type) {
      // ── Pozápasové gesto ────────────────────────────────────────────────
      case "gesture": {
        const choice = body.choice;
        if (!choice || !["handshake", "silent", "jab"].includes(choice)) {
          return c.json({ error: "Neplatná volba gesta." }, 400);
        }
        const match = body.matchId ? await lastMutualFinishedMatch(db, teamId, otherId) : null;
        if (!match || match.id !== body.matchId) return c.json({ error: "Zápas nenalezen nebo už není aktuální." }, 400);
        if (await hasInteraction(db, "gesture", teamId, match.id)) {
          return c.json({ error: "Gesto po tomto zápase už proběhlo." }, 400);
        }

        let resultText: string;
        if (choice === "handshake") {
          await applyRelationEvent(db, teamId, otherId, {
            respect: 5, icon: "🤝", text: `${myManager} podal po zápase ruku`,
          });
          resultText = "Podal jsi ruku.";
        } else if (choice === "jab") {
          await applyRelationEvent(db, teamId, otherId, {
            heat: 10, icon: "🗞️", text: `${myManager} si rýpl do novin na účet ${theirName}`,
          });
          await shiftSquadMorale(db, teamId, 2);
          await insertRelationNews(
            db, match.league_id,
            `${myManager} si po zápase pustil pusu na špacír`,
            jabNewsBody(names),
            teamId,
          );
          if (!otherIsAi) {
            await createNotification(db, otherId, "event", "🗞️ Rýpnutí v novinách",
              `Trenér ${myName} si na tebe otevřel pusu v novinách. Necháš to tak?`,
              `/dashboard/manager/${teamId}`, c.env as never)
              .catch((e) => logger.warn({ module: "relations" }, "jab notification", e));
          }
          resultText = "Rýpnutí je v novinách. Kabina se baví.";
        } else {
          resultText = "Odešel jsi beze slova.";
        }

        // AI protějšek reaguje hned
        let aiResponseText: string | null = null;
        if (otherIsAi) {
          const myScore = match.home_team_id === teamId ? match.home_score! : match.away_score!;
          const theirScore = match.home_team_id === teamId ? match.away_score! : match.home_score!;
          const resp = aiGestureResponse(aiArchetype(otherId), choice, theirScore > myScore);
          if (resp.choice === "handshake") {
            await applyRelationEvent(db, teamId, otherId, {
              respect: 3, icon: "🤝", text: `${theirManager} ${resp.flavor}`,
            });
          } else if (resp.choice === "jab") {
            await applyRelationEvent(db, teamId, otherId, {
              heat: 8, icon: "💢", text: `${theirManager} ${resp.flavor}`,
            });
          } else {
            await applyRelationEvent(db, teamId, otherId, {
              icon: "🚪", text: `${theirManager} ${resp.flavor}`,
            });
          }
          aiResponseText = `${theirManager} ${resp.flavor}.`;
        }

        await insertInteraction(db, "gesture", teamId, otherId, match.id, { choice });
        return c.json({ ok: true, message: resultText, aiResponse: aiResponseText });
      }

      // ── Pochvala ────────────────────────────────────────────────────────
      case "praise": {
        const praiseAt = await lastInteractionAt(db, "praise", teamId, otherId);
        if (daysSince(praiseAt) < PRAISE_COOLDOWN_DAYS) {
          return c.json({ error: "Chválil jsi nedávno. Moc cukru kazí zuby." }, 400);
        }

        await applyRelationEvent(db, teamId, otherId, {
          respect: 4, icon: "👏", text: `${myManager} pochválil práci, kterou ${theirManager} v ${theirName} odvádí`,
        });

        // Pochvala jde i do novin — na okrese se chválí tak málo, že je to zpráva
        const myTeamRow = await db.prepare("SELECT league_id FROM teams WHERE id = ?")
          .bind(teamId).first<{ league_id: string | null }>();
        const praiseArticle = praiseNews(names);
        await insertRelationNews(db, myTeamRow?.league_id ?? null, praiseArticle.headline, praiseArticle.body, teamId);

        let aiResponseText: string | null = null;
        if (otherIsAi) {
          const archetype = aiArchetype(otherId);
          const deltas: Record<string, { respect: number; heat: number }> = {
            ferovka: { respect: 2, heat: 0 },
            pohodar: { respect: 2, heat: 0 },
            urazeny: { respect: 1, heat: 0 },
            provokater: { respect: 1, heat: -2 },
          };
          const r = deltas[archetype];
          await applyRelationEvent(db, teamId, otherId, {
            respect: r.respect, heat: r.heat, icon: "🗣️", text: `${theirManager} pochvalu ocenil`,
          });
          aiResponseText = praiseReplyText(archetype, names);
        } else {
          await createNotification(db, otherId, "event", "👏 Pochvala od kolegy",
            `Trenér ${myName} ocenil práci, kterou v klubu odvádíš. Respekt mezi vámi roste.`,
            `/dashboard/manager/${teamId}`, c.env as never)
            .catch((e) => logger.warn({ module: "relations" }, "praise notification", e));
        }

        await insertInteraction(db, "praise", teamId, otherId, null, {});
        return c.json({ ok: true, message: `Vzkázal jsi trenérovi ${theirName} uznání.`, aiResponse: aiResponseText });
      }

      // ── Pivo po zápase (+ šipky) ────────────────────────────────────────
      case "beer": {
        const rel = await getRelation(db, teamId, otherId);
        if (rel.respect < BEER_MIN_RESPECT) {
          return c.json({ error: `Na pivo potřebuješ aspoň trochu respektu (${BEER_MIN_RESPECT}+).` }, 400);
        }
        const beerAt = await lastInteractionAt(db, "beer", teamId, otherId);
        if (daysSince(beerAt) < BEER_COOLDOWN_DAYS) {
          return c.json({ error: "Na pivo jste spolu byli nedávno. Nepřeháněj to." }, 400);
        }
        const purchase = await assertPurchaseAllowed(db, teamId, BEER_COST);
        if (!purchase.ok) return c.json({ error: purchase.reason }, 400);

        // Uražený AI manažer s vysokým heat odmítne
        if (otherIsAi && aiArchetype(otherId) === "urazeny" && rel.heat > 50) {
          await insertInteraction(db, "beer", teamId, otherId, null, { declined: true });
          return c.json({ ok: true, message: `${theirManager} pozvání odmítl. Pořád se zlobí.` });
        }

        await recordTransaction(db, teamId, "manager_social", -BEER_COST,
          `Pivo s trenérem ${theirName}`, gameDate);
        await applyRelationEvent(db, teamId, otherId, {
          respect: 8, icon: "🍻", text: `${myManager} a ${theirManager} zašli na pivo`,
        });

        // 50% šance na šipky
        let dartsText: string | null = null;
        if (Math.random() < 0.5) {
          const won = Math.random() < 0.5;
          if (won) {
            await applyRelationEvent(db, teamId, otherId, {
              respect: 3, icon: "🎯", text: `${myManager} porazil ${theirManager} v šipkách`,
            });
            dartsText = dartsWinText(names);
          } else {
            await recordTransaction(db, teamId, "manager_social", -BEER_COST,
              `Prohrané šipky — runda pro hospodu`, gameDate);
            await shiftSquadMorale(db, otherId, 1);
            dartsText = dartsLossText(names);
          }
        }

        await insertInteraction(db, "beer", teamId, otherId, null, { darts: dartsText != null });
        if (!otherIsAi) {
          await createNotification(db, otherId, "event", "🍻 Pivo s kolegou",
            `Trenér ${myName} tě vzal na pivo. Respekt mezi vámi roste.`,
            `/dashboard/manager/${teamId}`, c.env as never)
            .catch((e) => logger.warn({ module: "relations" }, "beer notification", e));
        }
        return c.json({ ok: true, message: beerSceneText(names), darts: dartsText });
      }

      // ── Sázka o bečku ───────────────────────────────────────────────────
      case "bet": {
        const match = await nextMutualMatch(db, teamId, otherId);
        if (!match || match.id !== body.matchId) return c.json({ error: "Žádný nadcházející vzájemný zápas." }, 400);
        const existing = await db.prepare(
          "SELECT id FROM manager_interactions WHERE type = 'bet' AND match_id = ? AND status IN ('pending', 'offered') LIMIT 1"
        ).bind(match.id).first<{ id: string }>();
        if (existing) return c.json({ error: "Sázka na tento zápas už existuje." }, 400);
        const purchase = await assertPurchaseAllowed(db, teamId, BET_AMOUNT);
        if (!purchase.ok) return c.json({ error: purchase.reason }, 400);

        if (otherIsAi) {
          const rel = await getRelation(db, teamId, otherId);
          if (!aiAcceptsBet(aiArchetype(otherId), rel.heat)) {
            await insertInteraction(db, "bet", teamId, otherId, match.id, { declined: true }, "resolved");
            return c.json({ ok: true, accepted: false, message: `${theirManager} mávl rukou: „Já se nesázím." Možná příště.` });
          }
          await insertInteraction(db, "bet", teamId, otherId, match.id, { amount: BET_AMOUNT }, "pending");
          await applyRelationEvent(db, teamId, otherId, {
            heat: 3, icon: "🍺", text: `Sázka o bečku na ${match.round != null ? `${match.round}. kolo` : "příští zápas"}`,
          });
          return c.json({ ok: true, accepted: true, message: `${theirManager} plácl: „Platí. Bečka." Teď to musíte urvat na hřišti.` });
        }

        // Lidský protějšek — nabídka čeká na přijetí
        await insertInteraction(db, "bet", teamId, otherId, match.id, { amount: BET_AMOUNT }, "offered");
        await createNotification(db, otherId, "event", "🍺 Sázka o bečku!",
          `Trenér ${myName} se s tebou chce vsadit o bečku (${BET_AMOUNT} Kč) na váš vzájemný zápas. Přijmeš?`,
          `/dashboard/manager/${teamId}`, c.env as never)
          .catch((e) => logger.warn({ module: "relations" }, "bet offer notification", e));
        return c.json({ ok: true, accepted: null, message: `Nabídka odeslána. Uvidíme, jestli má ${theirManager} kuráž.` });
      }

      case "bet_accept":
      case "bet_decline": {
        const offer = await db.prepare(
          `SELECT id, actor_team_id, match_id FROM manager_interactions
           WHERE type = 'bet' AND status = 'offered' AND actor_team_id = ? AND target_team_id = ? LIMIT 1`
        ).bind(otherId, teamId).first<{ id: string; actor_team_id: string; match_id: string }>();
        if (!offer) return c.json({ error: "Žádná čekající sázka." }, 400);

        if (body.type === "bet_decline") {
          await db.prepare("UPDATE manager_interactions SET status = 'resolved', payload = json_set(payload, '$.declined', 1) WHERE id = ?")
            .bind(offer.id).run();
          return c.json({ ok: true, message: "Sázku jsi odmítl. Bečka zůstává v bezpečí." });
        }
        const purchase = await assertPurchaseAllowed(db, teamId, BET_AMOUNT);
        if (!purchase.ok) return c.json({ error: purchase.reason }, 400);
        await db.prepare("UPDATE manager_interactions SET status = 'pending' WHERE id = ?").bind(offer.id).run();
        await applyRelationEvent(db, teamId, otherId, {
          heat: 3, icon: "🍺", text: "Sázka o bečku uzavřena",
        });
        await createNotification(db, otherId, "event", "🍺 Sázka přijata!",
          `Trenér ${myName} sázku o bečku přijal. Teď se hraje o pivo.`,
          `/dashboard/manager/${teamId}`, c.env as never)
          .catch((e) => logger.warn({ module: "relations" }, "bet accept notification", e));
        return c.json({ ok: true, message: "Sázka platí. Hraje se o bečku." });
      }

      // ── Předzápasový výrok do novin ─────────────────────────────────────
      case "statement": {
        const tone = body.tone as StatementTone | undefined;
        if (!tone || !["respect", "provoke", "humble"].includes(tone)) {
          return c.json({ error: "Neplatný tón výroku." }, 400);
        }
        const match = await nextMutualMatch(db, teamId, otherId);
        if (!match || match.id !== body.matchId) return c.json({ error: "Žádný nadcházející vzájemný zápas." }, 400);
        if (await hasInteraction(db, "statement", teamId, match.id)) {
          return c.json({ error: "Před tímhle zápasem už jsi do novin mluvil. Jednou stačí." }, 400);
        }

        const roundLabel = match.round != null ? `${match.round}. kolo` : "nadcházející zápas";
        let message: string;

        if (tone === "respect") {
          await insertRelationNews(db, match.league_id, `Před zápasem: ${myName} smeká`, statementRespectQuote(names), teamId);
          await applyRelationEvent(db, teamId, otherId, {
            respect: 5, icon: "🫡", text: `${myManager} před ${roundLabel} veřejně uznal kvality soupeře`,
          });
          await shiftSquadMorale(db, teamId, 1);
          message = "Uznání vyšlo v novinách. Kabina hraje bez tlaku.";
        } else if (tone === "provoke") {
          await insertRelationNews(db, match.league_id, `PŘESTŘELKA: ${myManager} provokuje před ${roundLabel}`, statementProvokeQuote(names), teamId);
          await applyRelationEvent(db, teamId, otherId, {
            heat: 10, icon: "😏", text: `${myManager} před ${roundLabel} provokoval v novinách`,
          });
          await shiftSquadMorale(db, teamId, 2);
          await shiftSquadMorale(db, otherId, 2); // provokace soupeře nabudí — má to cenu
          message = "Provokace vyšla v novinách. Kabina hoří — jenže soupeř taky.";
        } else {
          await insertRelationNews(db, match.league_id, `${myName} hraje chudáčka`, statementHumbleQuote(names), teamId);
          message = "Skromnost vyšla v novinách. Teď nesmíš vyhrát moc vysoko… nebo vlastně smíš?";
        }

        // AI protějšek reaguje podle archetypu
        let aiResponseText: string | null = null;
        if (otherIsAi) {
          const resp = aiStatementResponse(aiArchetype(otherId), tone, names);
          if (resp.respect !== 0 || resp.heat !== 0) {
            await applyRelationEvent(db, teamId, otherId, {
              respect: resp.respect, heat: resp.heat, icon: "🗣️", text: resp.historyText,
            });
          }
          if (resp.counterQuote) {
            await insertRelationNews(db, match.league_id, `${theirManager} odpovídá`, resp.counterQuote, otherId);
            aiResponseText = resp.counterQuote;
          }
        } else {
          await createNotification(db, otherId, "event", "🗣️ Soupeř mluví do novin",
            `Trenér ${myName} se před vaším zápasem rozpovídal v novinách. Přečti si zpravodaj — a klidně odpověz.`,
            `/dashboard/manager/${teamId}`, c.env as never)
            .catch((e) => logger.warn({ module: "relations" }, "statement notification", e));
        }

        await insertInteraction(db, "statement", teamId, otherId, match.id, { tone }, tone === "humble" ? "pending" : "resolved");
        return c.json({ ok: true, message, aiResponse: aiResponseText });
      }

      // ── Anonymní inzerát ────────────────────────────────────────────────
      case "ad": {
        const adAt = await lastInteractionAt(db, "ad", teamId, otherId);
        if (daysSince(adAt) < AD_COOLDOWN_DAYS) {
          return c.json({ error: "Redakce další anonymní inzerát zatím nepřijme. Nech to vychladnout." }, 400);
        }
        const purchase = await assertPurchaseAllowed(db, teamId, AD_COST);
        if (!purchase.ok) return c.json({ error: purchase.reason }, 400);

        const team = await db.prepare("SELECT league_id FROM teams WHERE id = ?")
          .bind(teamId).first<{ league_id: string | null }>();

        await recordTransaction(db, teamId, "manager_social", -AD_COST, "Inzerát v novinách", gameDate);

        const adText = adTextFor(names);
        await insertRelationNews(db, team?.league_id ?? null, "Inzerce", adText);
        await shiftSquadMorale(db, otherId, -2);

        // 30% šance na prozrazení
        let revealed = false;
        if (Math.random() < 0.3) {
          revealed = true;
          await applyRelationEvent(db, teamId, otherId, {
            heat: 15, respect: -5, icon: "🕵️", text: `Provalilo se, že jedovatý inzerát podal ${myManager}`,
          });
          await insertRelationNews(db, team?.league_id ?? null,
            "Redakce má jasno: anonym nebyl anonym",
            `Jedovatý inzerát na adresu ${theirName} podal podle dobře informovaných zdrojů sám trenér ${myName}. „Platil dvacetikorunama z kasičky," směje se redaktor. Na okrese se tohle nedělá.`,
            teamId,
          );
          if (!otherIsAi) {
            await createNotification(db, otherId, "event", "🕵️ Anonym odhalen",
              `Ten jedovatý inzerát na váš tým podal trenér ${myName}. Teď to víš.`,
              `/dashboard/manager/${teamId}`, c.env as never)
              .catch((e) => logger.warn({ module: "relations" }, "ad reveal notification", e));
          }
        }

        await insertInteraction(db, "ad", teamId, otherId, null, { text: adText, revealed });
        return c.json({
          ok: true,
          message: revealed
            ? "Inzerát vyšel… a redaktor tě práskl. Celý okres ví, kdo ho podal."
            : "Inzerát vyšel. Nikdo neví, kdo ho podal. Zatím.",
          revealed,
        });
      }

      // ── Dárek po debaklu ────────────────────────────────────────────────
      case "gift": {
        const tone = body.tone;
        if (!tone || !["sincere", "poison"].includes(tone)) return c.json({ error: "Neplatný tón dárku." }, 400);
        const match = body.matchId ? await lastMutualFinishedMatch(db, teamId, otherId) : null;
        if (!match || match.id !== body.matchId) return c.json({ error: "Zápas nenalezen." }, 400);
        const myScore = match.home_team_id === teamId ? match.home_score! : match.away_score!;
        const theirScore = match.home_team_id === teamId ? match.away_score! : match.home_score!;
        if (myScore - theirScore < 4) return c.json({ error: "Dárkový koš se posílá jen po pořádném debaklu (4+ góly)." }, 400);
        if (await hasInteraction(db, "gift", teamId, match.id)) return c.json({ error: "Dárek už jsi poslal." }, 400);
        const purchase = await assertPurchaseAllowed(db, teamId, GIFT_COST);
        if (!purchase.ok) return c.json({ error: purchase.reason }, 400);

        await recordTransaction(db, teamId, "manager_social", -GIFT_COST,
          `Dárkový koš pro ${theirName}`, gameDate);

        let message: string;
        if (tone === "sincere") {
          await applyRelationEvent(db, teamId, otherId, {
            respect: 8, icon: "🎁", text: `${myManager} poslal po výhře ${myScore}:${theirScore} upřímný dárkový koš`,
          });
          message = giftSincereMessage();
          if (!otherIsAi) {
            await createNotification(db, otherId, "event", "🎁 Dárkový koš",
              `Trenér ${myName} poslal po zápase koš s lahví a vzkazem: „Hlavu vzhůru, příště to vyjde."`,
              `/dashboard/manager/${teamId}`, c.env as never)
              .catch((e) => logger.warn({ module: "relations" }, "gift notification", e));
          }
        } else {
          await applyRelationEvent(db, teamId, otherId, {
            heat: 15, icon: "🎁", text: `${myManager} poslal po debaklu ${myScore}:${theirScore} jedovatý dárkový koš`,
          });
          await shiftSquadMorale(db, teamId, 3);
          message = giftPoisonMessage();
          if (!otherIsAi) {
            await createNotification(db, otherId, "event", "🎁 „Dárek“",
              `Trenér ${myName} poslal koš s kartičkou: „Ať se daří aspoň v hospodě.“ Tohle si zapamatuj.`,
              `/dashboard/manager/${teamId}`, c.env as never)
              .catch((e) => logger.warn({ module: "relations" }, "gift poison notification", e));
          }
        }

        await insertInteraction(db, "gift", teamId, otherId, match.id, { tone });
        return c.json({ ok: true, message });
      }

      default:
        return c.json({ error: "Neznámý typ interakce." }, 400);
    }
  } catch (e) {
    logger.error({ module: "relations" }, "interact failed", e);
    return c.json({ error: "Interakce se nepovedla. Zkus to znovu." }, 500);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /teams/:teamId/stammtisch — skupinové pivo pro 2–4 trenéry
// ────────────────────────────────────────────────────────────────────────────

relationsRouter.post("/teams/:teamId/stammtisch", async (c) => {
  const teamId = c.req.param("teamId");
  const db = c.env.DB;
  const body = await c.req.json<{ guestTeamIds?: string[] }>().catch((e) => {
    logger.warn({ module: "relations" }, "parse stammtisch body", e);
    return null;
  });
  const guestIds = [...new Set(body?.guestTeamIds ?? [])].filter((id) => id !== teamId);
  if (guestIds.length < 2 || guestIds.length > 4) {
    return c.json({ error: "Pozvi 2 až 4 trenéry — na míň je obyčejné pivo, na víc nemá hospoda stůl." }, 400);
  }

  // Cooldown
  const lastStammtisch = await db.prepare(
    "SELECT created_at FROM manager_interactions WHERE type = 'stammtisch' AND actor_team_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(teamId).first<{ created_at: string }>();
  if (daysSince(lastStammtisch?.created_at ?? null) < STAMMTISCH_COOLDOWN_DAYS) {
    return c.json({ error: "Štamtiš byl nedávno. Hospodský potřebuje doplnit sudy." }, 400);
  }

  // Hosté musí být ze stejné ligy
  const host = await db.prepare("SELECT league_id FROM teams WHERE id = ?").bind(teamId).first<{ league_id: string | null }>();
  if (!host?.league_id) return c.json({ error: "Tým není v lize." }, 400);
  const guestsRes = await db.prepare(
    `SELECT id, name FROM teams WHERE league_id = ? AND id IN (${guestIds.map(() => "?").join(",")})`
  ).bind(host.league_id, ...guestIds).all<{ id: string; name: string }>();
  if (guestsRes.results.length !== guestIds.length) {
    return c.json({ error: "Někteří pozvaní nejsou z tvojí ligy." }, 400);
  }

  // Rozpočet — host platí všem dorazivším + sobě, ověř maximum předem
  const maxCost = STAMMTISCH_COST_PER_HEAD * (guestIds.length + 1);
  const purchase = await assertPurchaseAllowed(db, teamId, maxCost);
  if (!purchase.ok) return c.json({ error: purchase.reason }, 400);

  const [myName, myManager] = await Promise.all([getTeamName(db, teamId), getManagerName(db, teamId)]);
  const gameDate = await getTeamGameDate(db, teamId);
  const eventId = crypto.randomUUID();

  try {
    // 1. Kdo dorazí
    const attendees: Array<{ teamId: string; teamName: string; manager: string }> = [];
    const details: Array<{ manager: string; teamName: string; came: boolean; note: string | null }> = [];

    for (const g of guestsRes.results) {
      const manager = await getManagerName(db, g.id);
      const rel = await getRelation(db, teamId, g.id);
      const guestIsAi = await isAiTeam(db, g.id);
      let comes: boolean;
      let note: string | null = null;
      if (guestIsAi) {
        const archetype = aiArchetype(g.id);
        comes = archetype === "pohodar" || archetype === "provokater"
          ? true
          : archetype === "ferovka" ? rel.respect >= 0 : rel.respect >= 20;
        if (!comes) note = stammtischDeclineText(archetype, manager);
      } else {
        comes = rel.respect >= 0;
        if (!comes) note = `${manager} pozvánku nechal bez odpovědi.`;
        else {
          await createNotification(db, g.id, "event", "🍻 Štamtiš trenérů",
            `Trenér ${myName} tě pozval ke společnému stolu s dalšími trenéry z ligy. Bylo to dobré pivo — respekt mezi vámi roste.`,
            `/dashboard/manager/${teamId}`, c.env as never)
            .catch((e) => logger.warn({ module: "relations" }, "stammtisch notification", e));
        }
      }
      if (comes) attendees.push({ teamId: g.id, teamName: g.name, manager });
      details.push({ manager, teamName: g.name, came: comes, note });
      await insertInteraction(db, "stammtisch", teamId, g.id, null, { eventId, came: comes });
    }

    if (attendees.length === 0) {
      // Hospodský aspoň prodal jedno pivo hostiteli
      await recordTransaction(db, teamId, "manager_social", -STAMMTISCH_COST_PER_HEAD,
        "Štamtiš — nikdo nedorazil, pivo na žal", gameDate, eventId);
      return c.json({ ok: true, message: "Nikdo nedorazil. Seděl jsi u velkého stolu sám a hospodský se tvářil soucitně.", details });
    }

    // 2. Útrata podle skutečné účasti
    const cost = STAMMTISCH_COST_PER_HEAD * (attendees.length + 1);
    await recordTransaction(db, teamId, "manager_social", -cost,
      `Štamtiš trenérů — rundy pro ${attendees.length + 1} lidí`, gameDate, eventId);

    // 3. Efekty: hostitel × každý host
    for (const a of attendees) {
      await applyRelationEvent(db, teamId, a.teamId, {
        respect: 5, icon: "🍻", text: `Štamtiš u ${myManager} — ${a.manager} seděl u stolu`,
      });
    }

    // 4. Dynamika mezi hosty: pár s heat ≥ 50 → 50% hádka, jinak sbližování
    const quarrels: string[] = [];
    for (let i = 0; i < attendees.length; i++) {
      for (let j = i + 1; j < attendees.length; j++) {
        const a = attendees[i];
        const b = attendees[j];
        const rel = await getRelation(db, a.teamId, b.teamId);
        if (rel.heat >= 50 && Math.random() < 0.5) {
          const quarrelText = stammtischQuarrelText(a.manager, b.manager);
          await applyRelationEvent(db, a.teamId, b.teamId, { heat: 8, icon: "💢", text: quarrelText });
          // Hostitel je aspoň posadil k jednomu stolu — to se cení
          await applyRelationEvent(db, teamId, a.teamId, { respect: 3, icon: "⚖️", text: `${myManager} se snažil hádku uklidnit` });
          await applyRelationEvent(db, teamId, b.teamId, { respect: 3, icon: "⚖️", text: `${myManager} se snažil hádku uklidnit` });
          quarrels.push(quarrelText);
        } else {
          await applyRelationEvent(db, a.teamId, b.teamId, {
            respect: 2, icon: "🍻", text: `Sblížení u štamtiše trenéra ${myManager}`,
          });
        }
      }
    }

    // 5. Zpravodaj — summit od 3 účastníků výš
    if (attendees.length >= 3) {
      const article = stammtischNews(myManager, myName, attendees.map((a) => `${a.manager} (${a.teamName})`));
      await insertRelationNews(db, host.league_id, article.headline, article.body, teamId);
    }

    const parts = [
      `Dorazili: ${attendees.map((a) => a.manager).join(", ")}.`,
      stammtischSceneText(attendees.length),
      ...quarrels,
      ...details.filter((d) => !d.came && d.note).map((d) => d.note as string),
      `Útrata: ${cost} Kč.`,
    ];
    return c.json({ ok: true, message: parts.join(" "), details });
  } catch (e) {
    logger.error({ module: "relations" }, "stammtisch failed", e);
    return c.json({ error: "Štamtiš se nepovedl. Zkus to znovu." }, 500);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /teams/:teamId/pub-round — runda pro celou hospodu po výhře
// ────────────────────────────────────────────────────────────────────────────

relationsRouter.post("/teams/:teamId/pub-round", async (c) => {
  const teamId = c.req.param("teamId");
  const db = c.env.DB;

  const lastMatch = await db.prepare(
    `SELECT id, home_team_id, home_score, away_score FROM matches
     WHERE status IN ('simulated', 'finished') AND (home_team_id = ? OR away_team_id = ?)
     ORDER BY simulated_at DESC LIMIT 1`
  ).bind(teamId, teamId).first<{ id: string; home_team_id: string; home_score: number; away_score: number }>();
  if (!lastMatch) return c.json({ error: "Žádný odehraný zápas." }, 400);

  const myScore = lastMatch.home_team_id === teamId ? lastMatch.home_score : lastMatch.away_score;
  const theirScore = lastMatch.home_team_id === teamId ? lastMatch.away_score : lastMatch.home_score;
  if (myScore <= theirScore) return c.json({ error: "Runda se kupuje po výhře. Nejdřív vyhraj." }, 400);
  if (await hasInteraction(db, "pub_round", teamId, lastMatch.id)) {
    return c.json({ error: "Za tuhle výhru už hospoda pila." }, 400);
  }

  // Štamgasti: 15–30 lidí × 12 Kč pivo
  const patrons = 15 + Math.floor(Math.random() * 16);
  const cost = patrons * 12;
  const purchase = await assertPurchaseAllowed(db, teamId, cost);
  if (!purchase.ok) return c.json({ error: purchase.reason }, 400);

  const gameDate = await getTeamGameDate(db, teamId);

  try {
    await recordTransaction(db, teamId, "manager_social", -cost,
      `Runda pro hospodu po výhře (${patrons} štamgastů)`, gameDate, lastMatch.id);
    await shiftSquadMorale(db, teamId, 2);
    await db.prepare("UPDATE fans SET satisfaction = MIN(100, satisfaction + 1) WHERE team_id = ?")
      .bind(teamId).run().catch((e) => logger.warn({ module: "relations" }, "pub round fans satisfaction", e));
    // Starosta sedí v rohu — přízeň obce roste
    const team = await db.prepare("SELECT village_id FROM teams WHERE id = ?").bind(teamId).first<{ village_id: string | null }>();
    if (team?.village_id) {
      await db.prepare(
        "UPDATE village_team_favor SET favor = MIN(100, favor + 2) WHERE village_id = ? AND team_id = ?"
      ).bind(team.village_id, teamId).run().catch((e) => logger.warn({ module: "relations" }, "pub round favor", e));
    }
    await insertInteraction(db, "pub_round", teamId, teamId, lastMatch.id, { patrons, cost });

    return c.json({ ok: true, message: pubRoundMessage(patrons), patrons, cost });
  } catch (e) {
    logger.error({ module: "relations" }, "pub round failed", e);
    return c.json({ error: "Runda se nepovedla. Zkus to znovu." }, 500);
  }
});
