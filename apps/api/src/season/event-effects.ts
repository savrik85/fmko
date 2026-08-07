import { logger } from "../lib/logger";

/**
 * Aplikace efektů sezónních událostí.
 *
 * Bylo to inline v `/seasonal-events/:id/choose`, takže události BEZ voleb
 * (ty se nikdy neresolvují přes ten endpoint) svoje efekty nikdy nedostaly —
 * hráč v UI viděl „+5 reputace", ale nikdy je nedostal na účet.
 * Teď to volá jak endpoint s volbou, tak automatický resolver v denním ticku.
 */

export interface EventEffect {
  type: string;
  value: number;
  description?: string;
}

/**
 * Aplikuje efekty na tým. `label` jde do popisu transakce a condition logu,
 * `gameDate` do transakce.
 */
export async function applyEventEffects(
  db: D1Database,
  teamId: string,
  effects: EventEffect[],
  label: string,
  gameDate: string,
  referenceId?: string,
): Promise<void> {
  const { recordTransaction } = await import("./finance-processor");

  for (const [i, effect] of effects.entries()) {
    if (effect.type === "budget") {
      await recordTransaction(db, teamId, "event", effect.value, `Událost: ${label}`, gameDate)
        .catch((e) => logger.warn({ module: "event-effects" }, "record event transaction", e));
    }
    if (effect.type === "reputation") {
      const { applyReputationDelta } = await import("../lib/reputation");
      // Index v klíči — jedna volba může mít víc reputačních efektů a bez něj by
      // druhý spadl na unikátní index jako duplicita a tiše se zahodil.
      await applyReputationDelta(db, teamId, effect.value, "event", `Událost: ${label}`, {
        referenceId: referenceId ? `${referenceId}-rep-${i}` : undefined,
        gameDate,
      });
    }
    if (effect.type === "morale") {
      await db.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.morale',
          MIN(100, MAX(0, json_extract(life_context, '$.morale') + ?)))
        WHERE team_id = ?`,
      ).bind(effect.value, teamId).run()
        .catch((e) => logger.warn({ module: "event-effects" }, "update morale from event", e));
    }
    if (effect.type === "stamina_boost") {
      await db.prepare(
        `UPDATE players SET skills = json_set(skills, '$.stamina', MIN(100, json_extract(skills, '$.stamina') + ?)) WHERE team_id = ?`,
      ).bind(effect.value, teamId).run()
        .catch((e) => logger.warn({ module: "event-effects" }, "apply stamina boost", e));
    }
    if (effect.type === "experience") {
      await db.prepare(
        `UPDATE players SET skills = json_set(skills, '$.experience', MIN(100, COALESCE(json_extract(skills, '$.experience'), 0) + ?)) WHERE team_id = ?`,
      ).bind(effect.value, teamId).run()
        .catch((e) => logger.warn({ module: "event-effects" }, "apply experience event", e));
    }
    if (effect.type === "alcohol_event") {
      // Pijanům klesne kondice — zvýší to šanci, že příště chybí.
      await db.prepare(
        `INSERT INTO condition_log (player_id, team_id, old_value, new_value, delta, source, description)
         SELECT id, team_id,
           json_extract(life_context, '$.condition'),
           MAX(10, json_extract(life_context, '$.condition') - 20),
           MAX(10, json_extract(life_context, '$.condition') - 20) - json_extract(life_context, '$.condition'),
           'event', 'Alkoholová událost (pijani)'
         FROM players
         WHERE team_id = ? AND json_extract(personality, '$.alcohol') > 50
           AND json_extract(life_context, '$.condition') IS NOT NULL`,
      ).bind(teamId).run()
        .catch((e) => logger.warn({ module: "event-effects" }, "log alcohol event", e));
      await db.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.condition', MAX(10, json_extract(life_context, '$.condition') - 20))
        WHERE team_id = ? AND json_extract(personality, '$.alcohol') > 50`,
      ).bind(teamId).run()
        .catch((e) => logger.warn({ module: "event-effects" }, "apply alcohol event", e));
    }
    if (effect.type === "condition") {
      const desc = `Událost: ${label}`;
      await db.prepare(
        `INSERT INTO condition_log (player_id, team_id, old_value, new_value, delta, source, description)
         SELECT id, team_id,
           json_extract(life_context, '$.condition'),
           MIN(100, MAX(0, json_extract(life_context, '$.condition') + ?)),
           MIN(100, MAX(0, json_extract(life_context, '$.condition') + ?)) - json_extract(life_context, '$.condition'),
           'event', ?
         FROM players
         WHERE team_id = ? AND json_extract(life_context, '$.condition') IS NOT NULL`,
      ).bind(effect.value, effect.value, desc, teamId).run()
        .catch((e) => logger.warn({ module: "event-effects" }, "log condition event", e));
      await db.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.condition',
          MIN(100, MAX(0, json_extract(life_context, '$.condition') + ?)))
        WHERE team_id = ?`,
      ).bind(effect.value, teamId).run()
        .catch((e) => logger.warn({ module: "event-effects" }, "update condition from event", e));
    }
    if (effect.type === "pitch_condition") {
      await db.prepare(
        "UPDATE stadiums SET pitch_condition = MIN(100, MAX(0, pitch_condition + ?)) WHERE team_id = ?",
      ).bind(effect.value, teamId).run()
        .catch((e) => logger.warn({ module: "event-effects" }, "update pitch condition from event", e));
    }
  }
}

/**
 * Vyřeší události, které nemají volby a jejich týden už nastal.
 * Atomický claim → efekty se aplikují nejvýš jednou, i při souběžných tickách.
 *
 * Vrací počet vyřešených událostí.
 */
export async function resolveDueAutoEvents(
  db: D1Database,
  teamId: string,
  currentGameWeek: number,
  gameDate: string,
  season: string,
): Promise<Array<{ title: string; description: string; effects: EventEffect[] }>> {
  const due = await db.prepare(
    `SELECT id, title, description, effects FROM seasonal_events
     WHERE team_id = ? AND season = ? AND status = 'pending'
       AND choices IS NULL AND game_week <= ?`,
  ).bind(teamId, season, currentGameWeek).all<{
    id: string; title: string; description: string; effects: string;
  }>().catch((e) => {
    logger.warn({ module: "event-effects" }, "load due auto events", e);
    return { results: [] as Array<{ id: string; title: string; description: string; effects: string }> };
  });

  const resolved: Array<{ title: string; description: string; effects: EventEffect[] }> = [];

  for (const row of due.results ?? []) {
    // Parsovat PŘED claimem — jinak by se událost s rozbitým JSONem označila jako
    // vyřešená a nenávratně zmizela, aniž by hráč cokoli dostal.
    let effects: EventEffect[] = [];
    try {
      effects = JSON.parse(row.effects) as EventEffect[];
    } catch (e) {
      logger.error({ module: "event-effects" }, `nevalidní effects u události ${row.id} — přeskočeno, zůstává pending`, e);
      continue;
    }
    if (effects.length === 0) continue;

    const claimed = await db.prepare(
      "UPDATE seasonal_events SET status = 'resolved' WHERE id = ? AND status = 'pending'",
    ).bind(row.id).run().catch((e) => {
      logger.warn({ module: "event-effects" }, "claim auto event", e);
      return { meta: { changes: 0 } };
    });
    if (claimed.meta.changes === 0) continue;

    await applyEventEffects(db, teamId, effects, row.title, gameDate, `sev-${row.id}`);
    resolved.push({ title: row.title, description: row.description, effects });
  }

  return resolved;
}
