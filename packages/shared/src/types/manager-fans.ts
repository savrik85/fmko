/**
 * Vliv trenéra na fanoušky — jediný zdroj pravdy pro celou hru.
 *
 *  - engine po zápase (`apps/api/src/season/fans-processor.ts`) přičítá `matchBoost`
 *    ke spokojenosti fanoušků
 *  - denní tick (`apps/api/src/season/daily-tick.ts`) posouvá o `loyaltyOffset` cíl,
 *    ke kterému se táhne loajalita (posouvá se CÍL, ne hodnota — jednorázový bonus
 *    by druhý den zmizel, protože drift stahuje loajalitu k reputaci klubu)
 *  - API (`GET /api/teams/:teamId/fans`) vrací spočítané hodnoty
 *  - web (`/dashboard/fans`, `/dashboard/napoveda`) renderuje žebříček přímo
 *    z `MANAGER_FANS_BANDS` — hráč vidí přesně tu tabulku, podle které engine počítá
 *
 * Nikdy nekopíruj čísla jinam — přidej sem funkci. Dřív byl vzorec na třech místech
 * a UI ukazovalo něco jiného, než engine počítal.
 */

export const MANAGER_FANS = {
  /** Reputace váží víc — fanoušky zajímá hlavně to, co má trenér za sebou. */
  REP_WEIGHT: 0.6,
  MOT_WEIGHT: 0.4,
  /** Reputace trenéra je v enginu tvrdě clampnutá na 15–75 (match-runner, cup, season-rewards, párty). */
  REP_MIN: 15,
  REP_MAX: 75,
  /** Motivace 1–99 (season-development clampuje na 1–99, match-runner drží podlahu 10). */
  MOT_MIN: 1,
  MOT_MAX: 99,
  /** Vliv, při kterém trenér fanoušky ani netěší, ani nezlobí. */
  NEUTRAL: 44,
  /** Meze ostatních atributů trenéra (koučink, taktika, disciplína, mládež). */
  ATTR_MIN: 10,
  ATTR_MAX: 99,
} as const;

export interface ManagerFansBand {
  key: string;
  /** Dolní hranice vlivu, včetně. */
  min: number;
  /** ± spokojenost po každém zápase. */
  matchBoost: number;
  /** ± posun rovnovážné hladiny loajality. */
  loyaltyOffset: number;
  label: string;
  /** Jak to berou fanoušci — jde přímo do UI. */
  fanView: string;
}

/** Seřazeno sestupně podle `min` — `managerFansBand` bere první vyhovující. */
export const MANAGER_FANS_BANDS: readonly ManagerFansBand[] = [
  { key: "vyhlaseny", min: 57, matchBoost: 3, loyaltyOffset: 2, label: "Vyhlášený", fanView: "Chodí se i na něj, nejen na tým." },
  { key: "uznavany", min: 52, matchBoost: 2, loyaltyOffset: 1, label: "Uznávaný", fanView: "Lidem imponuje, věří jeho rozhodnutím." },
  { key: "nadprumerny", min: 47, matchBoost: 1, loyaltyOffset: 1, label: "Nadprůměrný", fanView: "Fanoušci ho berou jako správnou volbu." },
  { key: "prumerny", min: 42, matchBoost: 0, loyaltyOffset: 0, label: "Průměrný", fanView: "Nikoho neurazí, ale nikoho ani nenadchne." },
  { key: "slabsi", min: 37, matchBoost: -1, loyaltyOffset: -1, label: "Slabší", fanView: "Za brankou se ozývá remcání." },
  { key: "neduveryhodny", min: 32, matchBoost: -2, loyaltyOffset: -1, label: "Nedůvěryhodný", fanView: "Po prohře na něj pokřikují." },
  { key: "odepsany", min: 0, matchBoost: -3, loyaltyOffset: -2, label: "Odepsaný", fanView: "Fanoušci otevřeně volají po odvolání." },
] as const;

export interface ManagerFansEffect {
  /** Výsledný vliv 0–100 (zaokrouhlený). */
  influence: number;
  /** Kolik bodů vlivu dala reputace (na 1 desetinné místo) — do rozpadu v UI. */
  repPoints: number;
  /** Kolik bodů vlivu dala motivace. */
  motPoints: number;
  band: ManagerFansBand;
  /** ± spokojenost po každém zápase. */
  matchBoost: number;
  /** ± posun cíle, ke kterému se táhne loajalita. */
  loyaltyOffset: number;
  /** Nejbližší lepší stupeň, nebo null když je trenér na vrcholu. */
  nextBand: ManagerFansBand | null;
  /** Kolik bodů vlivu chybí do dalšího stupně (0 na vrcholu). */
  pointsToNext: number;
  /** Kolik bodů reputace to znamená. 0 = na vrcholu nebo už na stropu reputace. */
  repPointsToNext: number;
  /** Kolik bodů motivace to znamená. 0 = na vrcholu nebo už na stropu motivace. */
  motPointsToNext: number;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/** Spočítá vliv trenéra 0–100 z jeho reputace a motivace. */
export function managerInfluence(reputation: number, motivation: number): number {
  const rep = clamp(reputation, MANAGER_FANS.REP_MIN, MANAGER_FANS.REP_MAX);
  const mot = clamp(motivation, MANAGER_FANS.MOT_MIN, MANAGER_FANS.MOT_MAX);
  return Math.round(rep * MANAGER_FANS.REP_WEIGHT + mot * MANAGER_FANS.MOT_WEIGHT);
}

/** Najde pásmo pro daný vliv. Poslední pásmo má `min: 0`, takže vždy něco vrátí. */
export function managerFansBand(influence: number): ManagerFansBand {
  return MANAGER_FANS_BANDS.find((b) => influence >= b.min) ?? MANAGER_FANS_BANDS[MANAGER_FANS_BANDS.length - 1];
}

/**
 * Kompletní dopad trenéra na fanoušky včetně rozpadu a návodu na další stupeň.
 * UI z toho renderuje celou kartu a nic nedopočítává.
 */
export function managerFansEffect(reputation: number, motivation: number): ManagerFansEffect {
  const rep = clamp(reputation, MANAGER_FANS.REP_MIN, MANAGER_FANS.REP_MAX);
  const mot = clamp(motivation, MANAGER_FANS.MOT_MIN, MANAGER_FANS.MOT_MAX);
  const influence = managerInfluence(rep, mot);
  const band = managerFansBand(influence);

  // Pásma jsou seřazená sestupně, takže lepší stupeň je ten předchozí v poli.
  const bandIndex = MANAGER_FANS_BANDS.indexOf(band);
  const nextBand = bandIndex > 0 ? MANAGER_FANS_BANDS[bandIndex - 1] : null;
  const pointsToNext = nextBand ? nextBand.min - influence : 0;

  // Rada musí být splnitelná. Reputace i motivace mají strop, takže trenér na
  // maximu reputace nesmí dostat "stačí +5 reputace" — 80 se dosáhnout nedá.
  // 0 znamená "tudy cesta nevede", UI pak nabídne jen druhou možnost.
  const repNeedRaw = nextBand ? Math.ceil(pointsToNext / MANAGER_FANS.REP_WEIGHT) : 0;
  const motNeedRaw = nextBand ? Math.ceil(pointsToNext / MANAGER_FANS.MOT_WEIGHT) : 0;
  const repPointsToNext = rep + repNeedRaw <= MANAGER_FANS.REP_MAX ? repNeedRaw : 0;
  const motPointsToNext = mot + motNeedRaw <= MANAGER_FANS.MOT_MAX ? motNeedRaw : 0;

  return {
    influence,
    repPoints: Math.round(rep * MANAGER_FANS.REP_WEIGHT * 10) / 10,
    motPoints: Math.round(mot * MANAGER_FANS.MOT_WEIGHT * 10) / 10,
    band,
    matchBoost: band.matchBoost,
    loyaltyOffset: band.loyaltyOffset,
    nextBand,
    pointsToNext,
    // Ceil je bezpečný: influence vzniká zaokrouhlením, k překlopení do dalšího
    // pásma stačí zvednout surovou hodnotu o pointsToNext.
    repPointsToNext,
    motPointsToNext,
  };
}
