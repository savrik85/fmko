/**
 * Atomický zámek stavby: podmíněný UPDATE sedne, jen když sloupec ještě drží
 * `currentLevel`. Dvojklik tak zapíše úroveň jednou a druhý běh prohraje BEZ
 * účtování.
 *
 * Úspěch se pozná podle `changes >= 1`, ne `=== 1`: u stran tribun běží trigger
 * (migrace 0239), který přepočítá odvozené `stands`, a D1 do `meta.changes`
 * počítá i jeho řádek. Úspěšná stavba proto hlásí 2. Prohraný zámek hlásí 0.
 *
 * `facility` jde do SQL, volající ho musí vzít z whitelistu (`getUpgradeOptions`).
 */
export async function claimStadiumUpgrade(
  db: D1Database,
  teamId: string,
  facility: string,
  currentLevel: number,
  nextLevel: number,
): Promise<boolean> {
  const res = await db
    .prepare(`UPDATE stadiums SET ${facility} = ? WHERE team_id = ? AND ${facility} = ?`)
    .bind(nextLevel, teamId, currentLevel)
    .run();
  return (res.meta?.changes ?? 0) >= 1;
}
