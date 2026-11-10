/**
 * Žádné tiché fallbacky na sezónu 1. Když dotaz na aktivní sezónu selže,
 * mustSeason() spadne s chybou (endpoint vrátí 500) místo defaultu na sezónu 1.
 */
export function mustSeason<T>(v: T | null | undefined, what = "aktivní sezóna"): T {
  if (v == null) throw new Error(`Chybí ${what} — dotaz na seasons(status='active') selhal`);
  return v;
}

/**
 * SQL podmínka: řádek kalendáře `alias` patří do aktuální (nejvyšší) sezóny své ligy.
 *
 * Liga má jeden řádek pro všechny sezóny a v kalendáři zůstávají neodehraná kola starších
 * sezón. Dotaz „nejbližší neodehrané kolo“ bez téhle podmínky vrátí kolo z loňska.
 * `alias` je alias (nebo jméno) tabulky season_calendar v dotazu.
 */
export function currentSeasonSql(alias = "sc"): string {
  return `${alias}.season_number = (SELECT MAX(cur_season.season_number) FROM season_calendar cur_season WHERE cur_season.league_id = ${alias}.league_id)`;
}
