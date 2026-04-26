/**
 * Log změn kondice hráčů — pro timeline v detailu hráče.
 * Tabulka condition_log (migrace 0082).
 */

export type ConditionSource =
  | "training"   // 🏃 Tréninkový drain
  | "recovery"   // 💤 Denní regenerace
  | "facility"   // 🚿 Bonus z vybavení (sprchy)
  | "match"      // ⚽ Zápas
  | "friendly"   // 🤝 Přátelák
  | "hangover"   // 🍺 Ranní kocovina po výhře
  | "pub"        // 🍻 Hospodská akce
  | "event";     // 🎉 Sezónní událost / náhoda

export function logConditionStmt(
  db: D1Database,
  playerId: string,
  teamId: string,
  oldVal: number,
  newVal: number,
  source: ConditionSource,
  description: string | null,
  gameDate: string | null = null,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO condition_log (player_id, team_id, old_value, new_value, delta, source, description, game_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    playerId, teamId,
    Math.round(oldVal), Math.round(newVal), Math.round(newVal - oldVal),
    source, description, gameDate,
  );
}

/**
 * Mass log pro hromadné UPDATE: vytáhne pre-update condition v INSERT...SELECT podle WHERE klauzule.
 * Zavolat PŘED UPDATE — log obsahuje old hodnotu a delta. Volající dodá `newValueSql`,
 * což je SQL výraz počítající novou hodnotu (musí odpovídat tomu co následující UPDATE provede).
 *
 * Pozn.: SELECT a navazující UPDATE nejsou atomické. V jednom daily-tick / requestu jsou
 * idempotentní operace, takže riziko nesouladu je v praxi minimální. Pokud někdy začne vadit,
 * přesunout do D1 batch transakce.
 */
export async function logMassConditionChange(
  db: D1Database,
  source: ConditionSource,
  description: string,
  newValueSql: string,
  whereSql: string,
  whereParams: unknown[],
): Promise<void> {
  const sql = `INSERT INTO condition_log (player_id, team_id, old_value, new_value, delta, source, description)
    SELECT id, team_id,
      json_extract(life_context, '$.condition') AS old_v,
      ${newValueSql} AS new_v,
      ${newValueSql} - json_extract(life_context, '$.condition') AS delta_v,
      ?, ?
    FROM players
    WHERE ${whereSql}
      AND json_extract(life_context, '$.condition') IS NOT NULL
      AND ${newValueSql} != json_extract(life_context, '$.condition')`;
  await db.prepare(sql).bind(...whereParams, source, description).run();
}
