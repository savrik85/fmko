/**
 * Kurzový model sázkové kanceláře.
 *
 * Čisté funkce, žádné I/O — celý soubor je testovatelný bez databáze.
 *
 * KALIBRACE. Konstanty nejsou odhad, jsou nafitované na 747 odehraných ligových
 * zápasech testovací databáze (stav 2026-08). Přeměřit je jde tímhle dotazem:
 *
 *   npx wrangler d1 execute prales-db-test --remote --json --command \
 *     'SELECT COUNT(*) AS n, AVG(home_score) AS doma, AVG(away_score) AS venku,
 *             AVG(home_score+away_score) AS celkem,
 *             AVG((home_score+away_score)*(home_score+away_score))
 *               - AVG(home_score+away_score)*AVG(home_score+away_score) AS rozptyl
 *        FROM matches WHERE status = "simulated" AND league_id IS NOT NULL
 *          AND home_score IS NOT NULL'
 *
 * Naměřeno: 1,842 doma / 1,590 venku / 3,432 celkem, rozptyl 4,752.
 *
 * Když se změní engine (OPEN_PLAY_GOAL_SCALE, taktiky, rozhodčí), model se
 * rozejde s realitou a marže kanceláře tiše zmizí — spadnou na to kalibrační
 * testy v odds-model.test.ts. Ty jsou tam přesně proto.
 */

// ── Očekávané góly ──────────────────────────────────────────────────────────

/** Naměřeno 1,842. Domácí výhoda není zvláštní člen, je v rozdílu bází. */
export const BASE_HOME_GOALS = 1.84;
/** Naměřeno 1,590. */
export const BASE_AWAY_GOALS = 1.59;

/**
 * Vliv jednoho bodu síly na log λ.
 *
 * Přefitováno 2026-08-22, když se síla přestala počítat z celého kádru
 * a začala z nejlepších jedenácti (viz TeamInput.strength).
 *
 * Naměřený log-poměr gólů podle rozdílu top-11 síly:
 *   +3 → +0,543 · +6 → +0,945 · +12 → +1,017
 *   −3 → −0,215 · −6 → −0,733 · −12 → −0,227
 *
 * Data jsou zašuměná (rating se od zápasu mohl posunout), takže konstanta
 * míří na horní okraj rozumného pásma: model favorita spíš mírně přecení.
 * Je to schválně — podcenění favorita by znamenalo příliš vysoký kurz na
 * něj, a to je jediná chyba, ze které dokáže sázející systematicky těžit.
 */
export const STRENGTH_K = 0.085;

/**
 * Sražení extrémů. U síly z celého kádru bylo potřeba (0,85), protože rozdíly
 * nafukovala velikost soupisky. Top-11 se chová lineárněji, takže se nesráží.
 */
export const STRENGTH_SHRINK = 1.0;

/** Strop efektivního rozdílu sil. Nad ním už kurzy nedávají smysl. */
export const STRENGTH_CAP = 10;

/**
 * Přerozptýlení. Góly nejsou Poissonovy — naměřený rozptyl/průměr je 1,384,
 * ne 1,0. Volba r = C·λ dělá p = C/(C+1) konstantní, takže součet gólů obou
 * týmů je zase negativní binomický: trh „výsledek" a trh „počet gólů" se pak
 * nemohou dostat do sporu.
 *
 * Z rozptyl/průměr = 1 + μ/r plyne C = 1 / 0,384 = 2,60.
 */
export const DISPERSION_C = 2.6;

/** Nejvyšší počet gólů, se kterým se počítá. Data přes 12 nesahají. */
export const MAX_GOALS = 12;

export interface TeamInput {
  /**
   * Průměrný overall_rating NEJLEPŠÍCH JEDENÁCTI aktivních hráčů.
   *
   * Ne celý kádr: průměr přes soupisku netrestá slabý tým, ale široký. Klub
   * s 31 hráči včetně dorostenců od ratingu 16 měl proti klubu s 21 vybranými
   * průměr nižší o jedenáct bodů, přestože jeho sestava byla o kus lepší —
   * a model z něj dělal outsidera (Vlachovo Březí vs Čkyně, produkce 2026-08-22).
   *
   * Definice je součástí kalibrace: změna znamená přefitovat STRENGTH_K.
   */
  strength: number;
  /** Korekce na formu ve stejných jednotkách jako síla. Viz formAdjustment. */
  form: number;
}

export interface Lambdas {
  home: number;
  away: number;
}

/** Očekávané góly obou týmů. */
export function expectedGoals(home: TeamInput, away: TeamInput): Lambdas {
  const raw = (home.strength + home.form) - (away.strength + away.form);
  const d = clamp(STRENGTH_SHRINK * raw, -STRENGTH_CAP, STRENGTH_CAP);
  return {
    home: BASE_HOME_GOALS * Math.exp(STRENGTH_K * d),
    away: BASE_AWAY_GOALS * Math.exp(-STRENGTH_K * d),
  };
}

/**
 * Korekce na formu z průměru bodů na zápas za posledních pět kol.
 *
 * Strop ±1,8 bodu síly je záměrně nízký: pět zápasů je statisticky šum a kdyby
 * forma hýbala kurzem víc než rozdíl kádrů, stačilo by sázet na sérii.
 */
export function formAdjustment(pointsPerGame: number): number {
  return clamp((pointsPerGame - 1.5) * 1.2, -1.8, 1.8);
}

// ── Rozdělení gólů ──────────────────────────────────────────────────────────

/**
 * Negativní binomické rozdělení počtu gólů, useknuté na MAX_GOALS
 * a přenormované na součet 1.
 *
 * Počítá se rekurentně (P(k) = P(k−1) · (r+k−1)/k · (1−p)), ne přes funkci
 * gamma — je to numericky stabilnější a nepotřebuje to lgamma.
 */
export function goalDistribution(mu: number, maxGoals = MAX_GOALS): number[] {
  const safeMu = Math.max(0.05, mu);
  const r = DISPERSION_C * safeMu;
  const p = r / (r + safeMu); // = C/(C+1), konstantní
  const q = 1 - p;

  const out: number[] = [Math.pow(p, r)];
  for (let k = 1; k <= maxGoals; k++) {
    out.push(out[k - 1] * ((r + k - 1) / k) * q);
  }

  const sum = out.reduce((a, b) => a + b, 0);
  return out.map((x) => x / sum);
}

export interface OutcomeProbs {
  home: number;
  draw: number;
  away: number;
}

/**
 * Pravděpodobnosti výhry domácích, remízy a výhry hostů.
 * Konvoluce dvou nezávislých rozdělení přes mřížku (MAX_GOALS+1)².
 */
export function outcomeProbabilities(l: Lambdas): OutcomeProbs {
  const dh = goalDistribution(l.home);
  const da = goalDistribution(l.away);

  let home = 0, draw = 0, away = 0;
  for (let h = 0; h < dh.length; h++) {
    for (let a = 0; a < da.length; a++) {
      const p = dh[h] * da[a];
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }
  return { home, draw, away };
}

/**
 * Dvojtip — pravděpodobnost, že tým neprohraje.
 *
 * Tři možnosti se navzájem NEvylučují (každý výsledek spadá do dvou z nich),
 * takže se nesmí normalizovat jako trojcestný trh. Každá se maržuje zvlášť
 * jako dvoucestná sázka: „1X" proti „2", „X2" proti „1", „12" proti „X".
 */
export function doubleChanceProbabilities(l: Lambdas): { homeOrDraw: number; awayOrDraw: number; noDraw: number } {
  const o = outcomeProbabilities(l);
  return {
    homeOrDraw: o.home + o.draw,
    awayOrDraw: o.away + o.draw,
    noDraw: o.home + o.away,
  };
}

/**
 * Pravděpodobnost, že padne víc / míň gólů než daná linie.
 *
 * Linie je vždy půlgólová (2,5 / 3,5 / 6,5), takže remíza na trhu nemůže
 * nastat a obě strany dají dohromady přesně 1.
 */
export function totalsProbabilities(l: Lambdas, line: number): { over: number; under: number } {
  const dist = goalDistribution(l.home + l.away);
  let under = 0;
  for (let k = 0; k < dist.length; k++) {
    if (k < line) under += dist[k];
  }
  return { over: 1 - under, under };
}

// ── Střelci ─────────────────────────────────────────────────────────────────

/**
 * Poziční priorita podílu na gólech týmu.
 *
 * Váhy vycházejí z pickAttacker v engine/simulation.ts, jen obránci mají 0,45
 * místo 0,3: v datech dávají 14 % gólů, ne 9 %, protože exekutoři standardek
 * a penalt jsou často stopeři.
 */
export const POS_WEIGHT: Record<string, number> = {
  FWD: 4.0,
  MID: 1.0,
  DEF: 0.45,
  GK: 0,
};

/** Kolik „virtuálních gólů" váží poziční priorita, než ji přebijí skutečné. */
export const SHARE_PRIOR_K = 8;

/**
 * Jak silně kvalita hráče ovlivňuje jeho podíl na gólech.
 *
 * Bez tohohle členu měli na začátku sezóny všichni útočníci téhož týmu stejný
 * kurz — poziční váha je nerozlišuje a góly ještě nikdo nemá. Hvězda se stejnou
 * cenou jako benjamínek je herně nesmysl a hráč to okamžitě pozná.
 *
 * Exponent 1,5: útočník s ratingem 45 má proti třicítce podíl 1,84×, ne 1,5×.
 * Znatelné, ale ne zdrcující.
 */
export const QUALITY_EXP = 1.5;

export interface ScorerInput {
  playerId: string;
  position: string;
  /** Góly hráče v probíhající sezóně. */
  goals: number;
  /** overall_rating. Rozlišuje hráče, dokud sezónní góly nemají co říct. */
  rating: number;
}

/**
 * Podíl každého hráče na gólech svého týmu.
 *
 * Dirichletova aposteriorní směs: na začátku sezóny rozhoduje poziční priorita,
 * po zhruba dvaceti gólech převáží skutečnost. Exekutor penalt se tak nacení
 * sám, bez zvláštní větve v kódu.
 */
export function scorerShares(players: ScorerInput[], teamGoals: number): Map<string, number> {
  // Průměrný rating kádru je vztažná hodnota — dělá váhu nezávislou na tom,
  // jestli je to okresní soutěž nebo krajský přebor.
  const ratings = players.map((p) => Math.max(1, p.rating || 30));
  const prumer = ratings.reduce((a, b) => a + b, 0) / Math.max(1, ratings.length);

  const weights = players.map((p, i) => {
    const pos = POS_WEIGHT[p.position] ?? POS_WEIGHT.MID;
    return pos * Math.pow(ratings[i] / prumer, QUALITY_EXP);
  });
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const out = new Map<string, number>();
  if (weightSum <= 0) return out;

  const denom = SHARE_PRIOR_K + Math.max(0, teamGoals);
  for (let i = 0; i < players.length; i++) {
    const prior = SHARE_PRIOR_K * (weights[i] / weightSum);
    out.set(players[i].playerId, (prior + Math.max(0, players[i].goals)) / denom);
  }
  return out;
}

/**
 * Jak pravděpodobně hráč vůbec nastoupí, z počtu startů.
 *
 * Laplaceovo vyhlazení se stropem 0,95 — i hvězda občas chybí — a podlahou
 * 0,35, aby se rotující hráč nezlevnil až k nule.
 */
export function availability(starts: number, teamMatches: number): number {
  if (teamMatches <= 0) return 0.6;
  return clamp((starts + 2) / (teamMatches + 3), 0.35, 0.95);
}

/** Pravděpodobnost, že hráč dá v zápase aspoň jeden gól. */
export function scorerProbability(teamLambda: number, share: number, avail: number): number {
  return 1 - Math.exp(-(teamLambda * share * avail));
}

// ── Marže a kurzy ───────────────────────────────────────────────────────────

/** Overround 1,08 → očekávaná marže kanceláře 7,4 % obratu. */
export const MARGIN = 0.08;

/** Žádná možnost není nemožná — chrání před kurzem v tisících. */
export const PROB_FLOOR = 0.05;

export const MIN_ODDS_X100 = 105;
export const MAX_ODDS_X100 = 1500;

/**
 * Namaržování jednoho trhu: podlaha → normalizace na součet 1 → ×(1+MARGIN).
 *
 * Vrací pravděpodobnosti implikované kurzem, jejichž součet je 1,08.
 */
export function applyMargin(probs: number[], floor = PROB_FLOOR): number[] {
  const floored = probs.map((p) => Math.max(floor, p));
  const sum = floored.reduce((a, b) => a + b, 0);
  if (sum <= 0) return probs.map(() => (1 + MARGIN) / Math.max(1, probs.length));
  return floored.map((p) => (p / sum) * (1 + MARGIN));
}

/**
 * Implikovaná pravděpodobnost → kurz v setinách.
 *
 * Zaokrouhluje se DOLŮ. Nahoru by zaokrouhlování hrálo systematicky pro
 * sázejícího a ukrojilo by z marže zhruba 0,3 %.
 */
export function toOddsX100(markedProb: number): number {
  if (markedProb <= 0) return MAX_ODDS_X100;
  return clampInt(Math.floor(100 / markedProb), MIN_ODDS_X100, MAX_ODDS_X100);
}

/**
 * Namaržované kurzy celého trhu naráz.
 * Vrací kurzy ve stejném pořadí, v jakém přišly pravděpodobnosti.
 */
export function marketOdds(probs: number[], floor = PROB_FLOOR): number[] {
  return applyMargin(probs, floor).map(toOddsX100);
}

/**
 * Kurz dvoucestného trhu, ze kterého se prodává jen jedna strana (střelec).
 * Namaržovat obě strany a druhou zahodit je totéž jako namaržovat tuhle.
 */
export function singleSideOdds(prob: number): number {
  const [odds] = marketOdds([prob, 1 - prob]);
  return odds;
}

/** Součin kurzů akumulátoru, opět v setinách a zaokrouhleno dolů. */
export function combineOddsX100(oddsList: number[]): number {
  if (oddsList.length === 0) return 100;
  const product = oddsList.reduce((acc, o) => (acc * o) / 100, 1);
  return Math.max(100, Math.floor(product * 100));
}

/** Výplata po uplatnění stropu. */
export function capPayout(
  stake: number, totalOddsX100: number, maxPayout: number,
): { payout: number; capped: boolean } {
  const raw = Math.floor((stake * totalOddsX100) / 100);
  return raw > maxPayout ? { payout: maxPayout, capped: true } : { payout: raw, capped: false };
}

// ── Pomocné ─────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.round(clamp(v, lo, hi));
}
