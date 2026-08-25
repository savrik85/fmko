/**
 * Počasí a jeho dopady, které potřebuje engine i frontend.
 *
 * Násobič docházky tu je schválně: dřív existoval jen v API a frontend měl vlastní
 * kopii čísel natvrdo v komponentě. Ta se s ním rozešla — widget hlásil u sněhu
 * −30 % docházky, přestože skutečná hodnota je −38 %. Jedna definice pro obě strany.
 */

export type Weather = "sunny" | "cloudy" | "rain" | "wind" | "snow";

/** Násobič návštěvy podle počasí. Za sucha a tepla se chodí víc, v plískanici míň. */
export function weatherAttendanceFactor(weather: Weather): number {
  switch (weather) {
    case "sunny": return 1.12;
    case "cloudy": return 1.0;
    case "wind": return 0.92;
    case "rain": return 0.80;
    case "snow": return 0.62;
    default: return 1.0;
  }
}

/** Dopad počasí na návštěvu v procentech, zaokrouhlený — pro zobrazení. */
export function weatherAttendancePct(weather: Weather): number {
  return Math.round((weatherAttendanceFactor(weather) - 1) * 100);
}
