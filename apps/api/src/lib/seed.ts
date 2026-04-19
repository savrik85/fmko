/** Deterministický seed z textu (calendar ID) */
export function seedFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Jednotný seed pro generování absencí.
 *
 * MUSÍ být použit ve všech místech kde se volá generateAbsences, aby UI preview,
 * day-before SMS, match-day SMS i skutečná simulace produkovaly stejnou sadu absencí
 * pro daný (zápas, tým) pár.
 *
 * - `matchKey`: pro ligové zápasy = `season_calendar.id` (calendarId), pro přátelák = `matches.id`
 * - `teamId`: ID týmu — každý tým dostane vlastní RNG instance (nikdy nesdílet RNG
 *   mezi home+away, jinak pořadí volání konzumuje sekvenci a druhý tým je nedeterministický)
 *
 * Filtrování day_before / match_day dělat po volání dle `absence.timing` vlastnosti,
 * ne duplicitním RNG seedem.
 */
export function absenceSeedForMatch(params: {
  matchKey: string;
  teamId: string;
}): number {
  return seedFromString(`${params.matchKey}:${params.teamId}`);
}
