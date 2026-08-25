/**
 * Počasí podle průběhu sezóny.
 *
 * Sezóna začíná i končí v létě a uprostřed je zima. Kalendářní měsíc se
 * záměrně neptáme: sezóny v datech startují pokaždé jindy (duben, červenec,
 * dvakrát srpen), takže vázat počasí na datum dávalo nesmysly — sníh v srpnu
 * a žně uprostřed mrazů.
 *
 * Determinismus je podmínka, ne pohodlí. Předpověď u nadcházejícího zápasu,
 * SMS s omluvenkami i simulace musí dostat **stejné** počasí, jinak hra hráči
 * lže: naskladní bufet podle předpovědi a zápas dostane něco jiného.
 *
 * Počasí je jednotné pro celé kolo — liga se hraje na malé oblasti, takže
 * nemůže být v jedné vesnici vedro a ve vedlejší sníh.
 */

import type { Weather } from "../engine/types";

/** Profily krajních fází. Mezi nimi se lineárně interpoluje podle zimavosti. */
const LETO: Record<Weather, number> = { sunny: 45, cloudy: 20, rain: 30, wind: 5, snow: 0 };
const ZIMA: Record<Weather, number> = { sunny: 5, cloudy: 20, rain: 10, wind: 15, snow: 50 };

const TEMP_STRED = 11;
const TEMP_AMPLITUDA = 13;

/**
 * Jak hluboko v zimě je dané místo sezóny. 0 = léto (start i konec), 1 = vrchol zimy.
 *
 * Kosinus, aby přechod byl plynulý a oba konce sezóny vyšly stejně teplé.
 */
export function winternessAt(postup: number): number {
  const p = Math.max(0, Math.min(1, postup));
  return (1 - Math.cos(2 * Math.PI * p)) / 2;
}

/**
 * Zimavost pro konkrétní den podle jeho pozice v sezóně.
 *
 * Tohle je základ celého systému: počasí je vlastnost DNE, ne zápasu. Trénink
 * ve čtvrtek i zápas v neděli si sáhnou na stejnou funkci a dostanou počasí
 * svého dne.
 */
export function winternessForDate(isoDate: string, seasonStart: string, seasonEnd: string): number {
  const d = Date.parse(isoDate);
  const a = Date.parse(seasonStart);
  const b = Date.parse(seasonEnd);
  if (!Number.isFinite(d) || !Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return winternessAt((d - a) / (b - a));
}

/**
 * Jak hluboko v zimě dané kolo je. Zachováno pro testy oblouku; produkční cesta
 * jde přes `winternessForDate`, aby počasí měly i dny bez zápasu.
 */
export function seasonWinterness(gameWeek: number, totalWeeks: number): number {
  if (!Number.isFinite(gameWeek) || !Number.isFinite(totalWeeks) || totalWeeks <= 1) return 0;
  const w = Math.max(1, Math.min(totalWeeks, gameWeek));
  const postup = (w - 1) / (totalWeeks - 1);
  return (1 - Math.cos(2 * Math.PI * postup)) / 2;
}

/** Průměrná teplota fáze: 24 °C na koncích sezóny, −2 °C uprostřed. */
export function seasonTemperature(winterness: number): number {
  const z = Math.max(0, Math.min(1, winterness));
  return TEMP_STRED + TEMP_AMPLITUDA * (1 - 2 * z);
}

/** Váhy počasí pro danou fázi sezóny. */
/** Nad touhle teplotou sníh nepadá — spadne místo něj déšť. */
const SNIH_MAX_TEPLOTA = 3;

export function seasonWeatherWeights(winterness: number): Record<Weather, number> {
  const z = Math.max(0, Math.min(1, winterness));
  const out = {} as Record<Weather, number>;
  for (const key of Object.keys(LETO) as Weather[]) {
    out[key] = LETO[key] * (1 - z) + ZIMA[key] * z;
  }
  // Lineární interpolace sama o sobě dovolila sníh při +12 °C, protože jeho váha
  // rostla dřív, než stihlo přituhnout. Nad bodem mrazu se váha sněhu přelije
  // do deště — sněžit smí jen když je na to dost zima.
  if (seasonTemperature(z) > SNIH_MAX_TEPLOTA) {
    out.rain += out.snow;
    out.snow = 0;
  }
  return out;
}

/** Stabilní hash řetězce — musí dávat totéž napříč běhy i workery. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface RoundWeather {
  weather: Weather;
  /** °C, průměr fáze — stejné číslo pohání i poptávku v bufetu. */
  temperature: number;
}

/**
 * Počasí jednoho dne. Deterministické z data — celý okres má týž den totéž
 * počasí, protože se hraje na malé oblasti.
 *
 * JEDINÝ ZDROJ PRAVDY. Předpověď u zápasu, simulace, omluvenky hráčů,
 * docházka na trénink i poptávka v bufetu čtou tohle. Kdo si počasí spočítá
 * po svém, rozejde se se zbytkem a hra začne hráči lhát.
 */
export function weatherForDay(isoDate: string, winterness: number): RoundWeather {
  const weights = seasonWeatherWeights(winterness);
  const den = isoDate.slice(0, 10);
  const seed = hash(den);
  const roll = (seed % 100000) / 100000;

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let cumulative = 0;
  let weather: Weather = "cloudy";
  for (const key of Object.keys(weights) as Weather[]) {
    cumulative += weights[key] / total;
    if (roll < cumulative) { weather = key; break; }
  }

  return { weather, temperature: Math.round(seasonTemperature(winterness)) };
}

/** Zpětně kompatibilní obal — počasí kola je prostě počasí jeho dne. */
export function roundWeather(calendarId: string, gameWeek: number, totalWeeks: number): RoundWeather {
  return weatherForDay(`${calendarId}|${gameWeek}`, seasonWinterness(gameWeek, totalWeeks));
}

/** Hranice aktuální sezóny. Jsou pro celý svět stejné, stačí je vzít z libovolného týmu. */
async function seasonBounds(db: D1Database): Promise<{ start: string; end: string } | null> {
  const row = await db.prepare(
    "SELECT season_start, season_end FROM teams WHERE season_start IS NOT NULL AND season_end IS NOT NULL LIMIT 1",
  ).first<{ season_start: string; season_end: string }>().catch(() => null);
  return row ? { start: row.season_start, end: row.season_end } : null;
}

/**
 * Počasí daného dne. **Tohle je ten jediný zdroj pravdy.**
 *
 * Všechno ostatní — předpověď, simulace zápasu, omluvenky, docházka na
 * trénink, poptávka v bufetu — si sáhne sem. Žádná další cesta k počasí
 * ve hře být nesmí.
 */
export async function resolveWeatherForDate(
  db: D1Database,
  isoDate: string,
): Promise<RoundWeather | null> {
  if (!isoDate) return null;
  const bounds = await seasonBounds(db);
  if (!bounds) return null;
  return weatherForDay(isoDate, winternessForDate(isoDate, bounds.start, bounds.end));
}

/** Počasí kola = počasí dne, na který je kolo naplánované. */
export async function resolveRoundWeather(
  db: D1Database,
  calendarId: string,
): Promise<RoundWeather | null> {
  const row = await db.prepare("SELECT scheduled_at FROM season_calendar WHERE id = ?")
    .bind(calendarId).first<{ scheduled_at: string }>().catch(() => null);
  if (!row?.scheduled_at) return null;
  return resolveWeatherForDate(db, row.scheduled_at);
}

export interface MatchForecast {
  expected: Weather;
  temperature: number;
  description: string;
  icon: string;
}

/**
 * Předpověď pro konkrétní zápas.
 *
 * Vrací TOTÉŽ počasí, které dostane simulace — předpověď tedy skutečně
 * předpovídá. Dřív se počítala nezávisle přes `generateForecast`, zatímco
 * zápas losoval `Math.random()`, takže spolu ta dvě čísla vůbec nesouvisela.
 *
 * `calendarId` už není potřeba: počasí je vlastnost dne, takže stačí datum.
 * Pohár tím pádem není zvláštní případ.
 */
export async function forecastForMatch(
  db: D1Database,
  _calendarId: string | null,
  scheduledAt: string,
  matchId: string,
): Promise<MatchForecast> {
  const { describeWeather } = await import("./weather");
  const rw = await resolveWeatherForDate(db, scheduledAt);
  const weather = rw?.weather ?? "cloudy";
  return {
    expected: weather,
    temperature: rw?.temperature ?? 12,
    ...describeWeather(weather, matchId),
  };
}
