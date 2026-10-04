/**
 * Obecní spolufinancování „Rozšíření tribuny" zvedne VŠECHNY strany o jednu
 * úroveň (nejvýš na 3), stejně jako dřív zvedlo jedno číslo `stands`. Šablona
 * nabídky (village-processor) má pevnou cenu a slibuje celé tribuny, takže by
 * jedna strana klubu nestála za podíl, který platí.
 *
 * Odvozené `stands` srovná trigger z migrace 0239.
 */
export async function raiseAllStandSides(db: D1Database, teamId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE stadiums SET
         stand_main = MIN(3, stand_main + 1),
         stand_opposite = MIN(3, stand_opposite + 1),
         stand_goal_west = MIN(3, stand_goal_west + 1),
         stand_goal_east = MIN(3, stand_goal_east + 1)
       WHERE team_id = ?`,
    )
    .bind(teamId)
    .run();
}
