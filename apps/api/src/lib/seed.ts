/** Deterministický seed z textu (calendar ID) */
export function seedFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Seed náhody jednoho týmu pro daný okamžik (den ticku, týden…). Hashuje CELÉ ID týmu.
 *
 * Dřív se k času přičítal jen `teamId.charCodeAt(0)`. UUID ale začíná jedním z 16 znaků
 * (0–9, a–f), takže všechny týmy se stejným prvním znakem měly stejnou náhodu: starosta,
 * hospodský, kapitán i dorost poslali třem klubům naráz téhož hráče a trénink jim padal stejně.
 * `purpose` drží proudy náhody oddělené (nabídky ≠ trénink), i když jde o stejný tým a čas.
 */
export function teamSeed(teamId: string, time: number, purpose: string): number {
  return seedFromString(`${purpose}:${teamId}:${time}`);
}

/**
 * Jednotný seed pro generování absencí.
 *
 * MUSÍ být použit ve všech místech kde se volá generateAbsences, aby UI preview,
 * day-before SMS, match-day SMS i skutečná simulace produkovaly stejnou sadu absencí
 * pro daný (zápas, tým, fáze) trojúhelník.
 *
 * - `matchKey`: pro ligové zápasy = `season_calendar.id` (calendarId), pro přátelák = `matches.id`
 * - `teamId`: ID týmu — každý tým dostane vlastní RNG instance (nikdy nesdílet RNG
 *   mezi home+away, jinak pořadí volání konzumuje sekvenci a druhý tým je nedeterministický)
 * - `phase`: `"day_before"` pro výmluvy hlášené den předem (práce, rodina, zdraví),
 *   `"match_day"` pro výmluvy v den zápasu (kocovina, doprava, akutní výmluva).
 *   Každá fáze má vlastní seed — jinak by hráč mohl dostat omluvu 2× (den předem + v den zápasu).
 *   Simulace (match-runner) spouští generateAbsences DVAKRÁT, jednou per fáze, a výsledky
 *   spojuje s deduplikací dle playerIndex.
 */
export function absenceSeedForMatch(params: {
  matchKey: string;
  teamId: string;
  phase: "day_before" | "match_day";
}): number {
  const phaseOffset = params.phase === "match_day" ? 7777 : 0;
  return seedFromString(`${params.matchKey}:${params.teamId}`) + phaseOffset;
}
