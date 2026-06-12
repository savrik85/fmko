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
  getRelation, applyRelationEvent, relationStatus, aiArchetype, AI_ARCHETYPE_LABELS,
  isAiTeam, aiGestureResponse, aiAcceptsBet, aiStatementResponse, shiftSquadMorale, insertRelationNews,
  getManagerName, getTeamName, getTeamGameDate,
  type GestureChoice, type StatementTone,
} from "../community/manager-relations";
import { recordTransaction, assertPurchaseAllowed } from "../season/finance-processor";
import { createNotification } from "../community/notifications";
import { requireTeamOwnership } from "../auth/middleware";

export const relationsRouter = new Hono<{ Bindings: Bindings }>();

// Write operace (interact) smí provádět jen vlastník týmu z :teamId.
relationsRouter.use("/teams/:teamId/relations/*", requireTeamOwnership);

const BEER_COST = 50;
const BET_AMOUNT = 500;
const AD_COST = 100;
const GIFT_COST = 80;
const BEER_COOLDOWN_DAYS = 7;
const AD_COOLDOWN_DAYS = 14;
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

  // Inzerát — cooldown
  const adAt = await lastInteractionAt(db, "ad", teamId, otherId);
  const adCooldownLeft = Math.max(0, Math.ceil(AD_COOLDOWN_DAYS - daysSince(adAt)));

  return c.json({
    respect: rel.respect,
    heat: rel.heat,
    status: relationStatus(rel.respect, rel.heat),
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
      ad: { available: adCooldownLeft === 0, cooldownDaysLeft: adCooldownLeft === Infinity ? 0 : adCooldownLeft, cost: AD_COST },
    },
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /teams/:teamId/relations/:otherId/interact
// ────────────────────────────────────────────────────────────────────────────

interface InteractBody {
  type: "gesture" | "beer" | "bet" | "bet_accept" | "bet_decline" | "ad" | "gift" | "statement";
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
            `„Soupeř? Viděli jste to sami. My jsme aspoň věděli, na kterou stranu se útočí," nechal se slyšet trenér ${myName} na adresu ${theirName}. V kabině ${myName} se prý smáli ještě u třetího piva.`,
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
            dartsText = `Došlo i na šipky — a ${theirManager} kupoval rundu. Tohle se bude vyprávět.`;
          } else {
            await recordTransaction(db, teamId, "manager_social", -BEER_COST,
              `Prohrané šipky — runda pro hospodu`, gameDate);
            await shiftSquadMorale(db, otherId, 1);
            dartsText = `Šipky nevyšly — runda šla za tebou. ${theirManager} se usmíval celý večer.`;
          }
        }

        await insertInteraction(db, "beer", teamId, otherId, null, { darts: dartsText != null });
        if (!otherIsAi) {
          await createNotification(db, otherId, "event", "🍻 Pivo s kolegou",
            `Trenér ${myName} tě vzal na pivo. Respekt mezi vámi roste.`,
            `/dashboard/manager/${teamId}`, c.env as never)
            .catch((e) => logger.warn({ module: "relations" }, "beer notification", e));
        }
        return c.json({ ok: true, message: `Dobrý večer u piva s trenérem ${theirName}.`, darts: dartsText });
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
          const quotes = [
            `„${theirName} má formu a kvalitu, bude to řežba. Máme před nimi respekt,“ řekl před zápasem trenér ${myManager} (${myName}).`,
            `„Znám jejich trenéra, dělá dobrou práci. V neděli to bude férový fotbal a ať vyhraje lepší,“ uvedl trenér ${myManager} z ${myName}.`,
          ];
          await insertRelationNews(db, match.league_id, `Před zápasem: ${myName} smeká`, quotes[Math.floor(Math.random() * quotes.length)], teamId);
          await applyRelationEvent(db, teamId, otherId, {
            respect: 5, icon: "🫡", text: `${myManager} před ${roundLabel} veřejně uznal kvality soupeře`,
          });
          await shiftSquadMorale(db, teamId, 1);
          message = "Uznání vyšlo v novinách. Kabina hraje bez tlaku.";
        } else if (tone === "provoke") {
          const quotes = [
            `„${theirName}? Doma jim tleská třicet lidí a půlka jsou holubi. My se nebojíme,“ provokoval před zápasem trenér ${myManager} (${myName}).`,
            `„Viděl jsem jejich poslední zápas. Kdyby fotbal byl o snaze, mají bod. Takhle nemají nic,“ vzkázal soupeři trenér ${myManager} z ${myName}.`,
            `„Bečku, co s námi prohrají, ať rovnou vychladí,“ hlásil sebevědomě trenér ${myManager} (${myName}).`,
          ];
          await insertRelationNews(db, match.league_id, `PŘESTŘELKA: ${myManager} provokuje před ${roundLabel}`, quotes[Math.floor(Math.random() * quotes.length)], teamId);
          await applyRelationEvent(db, teamId, otherId, {
            heat: 10, icon: "😏", text: `${myManager} před ${roundLabel} provokoval v novinách`,
          });
          await shiftSquadMorale(db, teamId, 2);
          await shiftSquadMorale(db, otherId, 2); // provokace soupeře nabudí — má to cenu
          message = "Provokace vyšla v novinách. Kabina hoří — jenže soupeř taky.";
        } else {
          const quotes = [
            `„Jedeme tam oslabení, půlka kluků má žně. Když to nebude debakl, bereme to,“ krotil očekávání trenér ${myManager} (${myName}).`,
            `„${theirName} je jasný favorit. My si jedeme maximálně pro kanára a klobásu,“ tvrdil skromně trenér ${myManager} z ${myName}.`,
          ];
          await insertRelationNews(db, match.league_id, `${myName} hraje chudáčka`, quotes[Math.floor(Math.random() * quotes.length)], teamId);
          message = "Skromnost vyšla v novinách. Teď nesmíš vyhrát moc vysoko… nebo vlastně smíš?";
        }

        // AI protějšek reaguje podle archetypu
        let aiResponseText: string | null = null;
        if (otherIsAi) {
          const resp = aiStatementResponse(aiArchetype(otherId), tone, {
            aiManager: theirManager, aiTeam: theirName, actorTeam: myName,
          });
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

        const ADS = [
          `Prodám obranu, málo používaná, projeto ${Math.floor(Math.random() * 5) + 5} góly. Zn.: ${theirName}`,
          `Hledá se útočník. Naposledy viděn střílet na bránu před měsícem. Odměna: pivo. Zn.: ${theirName}`,
          `Daruji taktickou tabuli, majitel ji stejně nepoužívá. Zn.: kabina ${theirName}`,
          `Vyměním tři body za cokoliv. I za slepice. Zn.: ${theirName}`,
        ];
        const adText = ADS[Math.floor(Math.random() * ADS.length)];
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
          message = "Koš s lahví a upřímnou kartičkou odeslán. Tohle se na okrese počítá.";
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
          message = "Koš s kartičkou „Ať se daří aspoň v hospodě“ odeslán. Kabina si fotku přeposílá dodnes.";
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
