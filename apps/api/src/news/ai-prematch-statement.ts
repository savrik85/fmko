/**
 * Předzápasové výroky AI trenérů.
 *
 * AI trenér byl dosud čistě reaktivní — sám od sebe do novin nikdy nic neřekl.
 * Bez toho by ale pozápasová otázka „co říkáte na výrok soupeřova trenéra" neměla
 * o co opřít u drtivé většiny zápasů, protože lidských soupeřů je v okrese málo.
 *
 * Výrok musí vyjít PŘED zápasem, jinak nedává smysl — publikuje se proto dva herní
 * dny předem, spolu s delegací rozhodčího a předzápasovým rozhovorem.
 */

import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { logger } from "../lib/logger";
import {
  aiArchetype, aiPreMatchStatement, getRelation, getManagerName, getTeamName,
  insertInteraction, insertRelationNews,
} from "../community/manager-relations";
import {
  statementRespectQuote, statementProvokeQuote, statementHumbleQuote,
  type RelationNames,
} from "../community/relation-texts";

const M = "ai-statement";

/** Ne dvakrát po sobě proti témuž soupeři — jinak by to v novinách znělo jako porucha. */
const REPEAT_COOLDOWN_DAYS = 14;

interface UpcomingMatch {
  match_id: string;
  league_id: string;
  home_team_id: string;
  away_team_id: string;
  home_user: string;
  away_user: string;
}

async function districtOfTeam(db: D1Database, teamId: string): Promise<string | undefined> {
  const row = await db.prepare(
    "SELECT v.district AS district FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?"
  ).bind(teamId).first<{ district: string }>()
    .catch((e) => { logger.warn({ module: M }, "okres týmu", e); return null; });
  return row?.district ?? undefined;
}

function quoteFor(tone: "respect" | "provoke" | "humble", names: RelationNames, district?: string): string {
  if (tone === "provoke") return statementProvokeQuote(names, district);
  if (tone === "respect") return statementRespectQuote(names, district);
  return statementHumbleQuote(names);
}

function headlineFor(tone: "respect" | "provoke" | "humble", names: RelationNames, gameWeek: number): string {
  if (tone === "provoke") return `PŘESTŘELKA: ${names.myManager} provokuje před ${gameWeek}. kolem`;
  if (tone === "respect") return `Před zápasem: ${names.myName} smeká`;
  return `${names.myName} hraje chudáčka`;
}

/**
 * Projde zápasy hrané za dva herní dny a nechá AI trenéry promluvit.
 *
 * Jen dvojice AI vs. člověk — výrok dvou AI trenérů o sobě navzájem by nikoho
 * nezajímal a jen by zaplevelil zpravodaj.
 */
export async function publishAiPreMatchStatements(
  db: D1Database,
  from: string,
  to: string,
): Promise<number> {
  const rows = await db.prepare(
    `SELECT m.id AS match_id, sc.league_id, sc.game_week,
            m.home_team_id, m.away_team_id,
            ht.user_id AS home_user, at.user_id AS away_user
     FROM season_calendar sc
     JOIN matches m ON m.calendar_id = sc.id
     JOIN teams ht ON ht.id = m.home_team_id
     JOIN teams at ON at.id = m.away_team_id
     WHERE sc.scheduled_at BETWEEN ? AND ? AND sc.status = 'scheduled'
       AND ((ht.user_id = 'ai') != (at.user_id = 'ai'))`
  ).bind(from, to).all<UpcomingMatch & { game_week: number }>()
    .catch((e) => { logger.warn({ module: M }, "hledání zápasů pro výroky", e); return null; });

  let published = 0;

  for (const row of rows?.results ?? []) {
    try {
      const aiTeamId = row.home_user === "ai" ? row.home_team_id : row.away_team_id;
      const humanTeamId = row.home_user === "ai" ? row.away_team_id : row.home_team_id;

      // Idempotence: jeden výrok na zápas.
      const already = await db.prepare(
        "SELECT id FROM manager_interactions WHERE type = 'statement' AND actor_team_id = ? AND match_id = ? LIMIT 1"
      ).bind(aiTeamId, row.match_id).first<{ id: string }>();
      if (already) continue;

      // Cooldown proti opakování vůči témuž soupeři.
      const recent = await db.prepare(
        `SELECT created_at FROM manager_interactions
         WHERE type = 'statement' AND actor_team_id = ? AND target_team_id = ?
         ORDER BY created_at DESC LIMIT 1`
      ).bind(aiTeamId, humanTeamId).first<{ created_at: string }>();
      if (recent?.created_at) {
        const daysSince = (Date.now() - new Date(recent.created_at).getTime()) / 86_400_000;
        if (daysSince < REPEAT_COOLDOWN_DAYS) continue;
      }

      const archetype = aiArchetype(aiTeamId);
      const relation = await getRelation(db, aiTeamId, humanTeamId);
      const rng = createRng(seedFromString(`${row.match_id}|${aiTeamId}`));

      // Kdo je favorit — pohodář se podle toho buď shazuje, nebo smeká.
      const powers = await db.prepare(
        `SELECT team_id, AVG(overall_rating) AS p FROM players
         WHERE team_id IN (?, ?) AND (status IS NULL OR status = 'active') GROUP BY team_id`
      ).bind(aiTeamId, humanTeamId).all<{ team_id: string; p: number }>()
        .catch((e) => { logger.warn({ module: M }, "síla kádrů pro určení favorita", e); return null; });
      const powerOf = new Map((powers?.results ?? []).map((r) => [r.team_id, r.p]));
      const weAreFavourite = (powerOf.get(aiTeamId) ?? 0) > (powerOf.get(humanTeamId) ?? 0);

      const decision = aiPreMatchStatement(archetype, {
        heat: relation.heat,
        respect: relation.respect,
        roll: rng.random(),
        weAreFavourite,
      });
      if (!decision) continue;

      const names: RelationNames = {
        myName: await getTeamName(db, aiTeamId),
        theirName: await getTeamName(db, humanTeamId),
        myManager: await getManagerName(db, aiTeamId),
        theirManager: await getManagerName(db, humanTeamId),
      };
      const quote = quoteFor(decision.tone, names, await districtOfTeam(db, aiTeamId));

      await insertRelationNews(db, row.league_id, headlineFor(decision.tone, names, row.game_week), quote, aiTeamId);
      // Skromný výrok zůstává 'pending' — existující resolveHumbleStatements pak po
      // zápase sám vyhodnotí „falešnou skromnost", nově i pro AI trenéry.
      await insertInteraction(
        db, "statement", aiTeamId, humanTeamId, row.match_id,
        { tone: decision.tone, quote, source: "ai_auto" },
        decision.tone === "humble" ? "pending" : "resolved",
      );
      published++;
    } catch (e) {
      logger.warn({ module: M }, `výrok pro zápas ${row.match_id}`, e);
    }
  }

  return published;
}

/** Výrok soupeřova trenéra k danému zápasu — pro náhled kola i pozápasový rozhovor. */
export async function loadPreMatchStatement(
  db: D1Database,
  actorTeamId: string,
  matchId: string,
): Promise<{ quote: string; tone: string } | null> {
  const row = await db.prepare(
    `SELECT json_extract(payload, '$.quote') AS quote, json_extract(payload, '$.tone') AS tone
     FROM manager_interactions
     WHERE type = 'statement' AND actor_team_id = ? AND match_id = ? LIMIT 1`
  ).bind(actorTeamId, matchId).first<{ quote: string | null; tone: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "načtení výroku k zápasu", e); return null; });

  if (!row?.quote) return null;
  return { quote: row.quote, tone: row.tone ?? "respect" };
}
