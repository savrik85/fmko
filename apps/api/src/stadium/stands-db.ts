import { STAND_SIDES, effectiveStandLevel, legacyStandsToSides, type StandLevels } from "./stands-model";

/**
 * Obecní spolufinancování „Rozšíření tribuny" zvedne tribuny o jednu
 * starou úroveň (podle `effectiveStandLevel`), stejně jako dřív zvedlo jedno číslo `stands`. Šablona
 * nabídky (village-processor) má pevnou cenu a slibuje celé tribuny, takže by
 * jedna strana klubu nestála za podíl, který platí.
 *
 * Odvozené `stands` srovná trigger z migrace 0239.
 */
export async function raiseAllStandSides(db: D1Database, teamId: string): Promise<void> {
  const row = await db
    .prepare("SELECT stand_main, stand_opposite, stand_goal_west, stand_goal_east FROM stadiums WHERE team_id = ?")
    .bind(teamId)
    .first<StandLevels>();
  if (!row) return;
  // Cíl je sestava o jednu starou úroveň výš, takže převedený klub dostane tolik míst co dřív.
  const target = legacyStandsToSides(Math.min(3, effectiveStandLevel(row) + 1));
  const next = Object.fromEntries(
    STAND_SIDES.map((s) => [s, Math.max(Number(row[s]) || 0, target[s])]),
  ) as unknown as StandLevels;
  await db
    .prepare("UPDATE stadiums SET stand_main = ?, stand_opposite = ?, stand_goal_west = ?, stand_goal_east = ? WHERE team_id = ?")
    .bind(next.stand_main, next.stand_opposite, next.stand_goal_west, next.stand_goal_east, teamId)
    .run();
}
