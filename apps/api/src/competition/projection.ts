/**
 * Rozpočtová matematika soutěže — čisté funkce, žádné I/O.
 *
 * Dvě věci, na kterých stojí celý rozpočtový strop:
 *  1) Počet zápasů se počítá jako n·(n−1), NIKDY z tabulky season_calendar.
 *     calendar.ts generuje vždy 30 řádků, ale při 14 týmech se hraje jen 26 kol —
 *     řádky 27–30 zůstávají navěky prázdné a součet by byl nesmyslný.
 *  2) Svazová dotace se počítá z VÝCHOZÍCH sazeb, nikdy z odhlasovaných. Kdyby
 *     dotace následovala odměny, přestala by být stropem a kluby by si mohly
 *     odhlasovat libovolnou částku.
 */

import {
  DEFAULT_RULES, LEVEL_MULT, MIN_RESERVE, SUBSIDY_CUSHION,
  type CompetitionRules,
} from "./defaults";

/** Počet zápasů dvoukolového turnaje každý s každým. */
export function matchCount(teams: number): number {
  return teams <= 1 ? 0 : teams * (teams - 1);
}

/**
 * Součet odměn za umístění pro celou tabulku.
 * Zrcadlí season-rewards.ts: base = max(floor, top × decay^(pos−1)), reward = round(base × levelMult).
 * Floor se uplatní PŘED násobičem úrovně, stejně jako tam.
 */
export function placementSum(rules: CompetitionRules, teams: number, level: string): number {
  let sum = 0;
  for (let pos = 1; pos <= teams; pos++) {
    sum += placementReward(rules, pos, level);
  }
  return sum;
}

/** Odměna za jedno konkrétní místo. */
export function placementReward(rules: CompetitionRules, pos: number, level: string): number {
  const mult = LEVEL_MULT[level] ?? 1.0;
  const base = Math.max(rules.place_floor, rules.place_top * Math.pow(rules.place_decay, pos - 1));
  return Math.round(base * mult);
}

/** Očekávaná výplata prémie na zápas při ~25 % remíz. Pro výchozí sazby dá 450 Kč. */
export function expectedBonusPerMatch(rules: CompetitionRules): number {
  return 0.75 * rules.win_bonus + 0.5 * rules.draw_bonus;
}

/** Nejdražší možná výplata na zápas — buď výhra, nebo dvě remízové odměny. */
export function worstBonusPerMatch(rules: CompetitionRules): number {
  return Math.max(rules.win_bonus, 2 * rules.draw_bonus);
}

export interface SeasonCost {
  placement: number;
  bonus: number;
  referees: number;
  total: number;
}

/**
 * Náklady soutěže na sezónu.
 * `worstCase` použij pro rozpočtový strop (konzervativní), jinak očekávanou hodnotu.
 */
export function projectSeasonCost(
  rules: CompetitionRules, teams: number, level: string, worstCase = false,
): SeasonCost {
  const matches = matchCount(teams);
  const placement = placementSum(rules, teams, level);
  const perMatch = worstCase ? worstBonusPerMatch(rules) : expectedBonusPerMatch(rules);
  const bonus = Math.round(matches * perMatch);
  const referees = matches * rules.referee_fee;
  return { placement, bonus, referees, total: placement + bonus + referees };
}

/**
 * Svazová dotace. Počítá se z DEFAULT_RULES — viz komentář v hlavičce souboru.
 * Polštář 1,03 drží výchozí bilanci lehce kladnou i v nejhorším průběhu sezóny.
 */
export function subsidyFor(teams: number, level: string): number {
  const base = projectSeasonCost(DEFAULT_RULES as unknown as CompetitionRules, teams, level);
  const fees = teams * DEFAULT_RULES.entry_fee;
  return Math.round(SUBSIDY_CUSHION * (base.total - fees));
}

/**
 * Závazky rozehrané sezóny, které pokladna teprve zaplatí.
 *
 * Odměny za umístění se vyplácejí až po posledním kole, takže i v polovině sezóny
 * leží v pokladně peníze, které už jsou fakticky utracené. Bez tohohle odpočtu by
 * projekce brala celý zůstatek jako volný a soutěž by si mohla odhlasovat trvalé
 * zvýšení odměn z peněz, které za měsíc stejně rozdá.
 */
export function outstandingCommitments(
  rules: CompetitionRules, teams: number, level: string, matchesPlayed: number,
): SeasonCost {
  const remaining = Math.max(0, matchCount(teams) - Math.max(0, matchesPlayed));
  const placement = placementSum(rules, teams, level);
  const bonus = Math.round(remaining * worstBonusPerMatch(rules));
  const referees = remaining * rules.referee_fee;
  return { placement, bonus, referees, total: placement + bonus + referees };
}

/** Část pokladny, se kterou se dá počítat pro příští sezónu. Nikdy nejde pod nulu. */
export function freeBalance(
  balance: number, rules: CompetitionRules, teams: number, level: string, matchesPlayed: number,
): number {
  return balance - outstandingCommitments(rules, teams, level, matchesPlayed).total;
}

export interface BudgetCheck {
  ok: boolean;
  /** Kolik pokladně bude chybět (kladné číslo), nebo 0. */
  deficit: number;
  projected: number;
  cost: SeasonCost;
  income: number;
  /** Na kolik by muselo vyskočit startovné, aby návrh prošel. */
  requiredEntryFee: number;
}

/**
 * Ustojí pokladna navržený sazebník po celou příští sezónu?
 *
 * Pokuty se do příjmů ZÁMĚRNĚ nepočítají — na příjem z vlastní hlouposti se
 * plánovat nedá a projekce musí platit i pro sezónu, ve které se nikdo nepohádá.
 */
export function checkBudget(opts: {
  rules: CompetitionRules;
  teams: number;
  level: string;
  /** VOLNÝ zůstatek — co v pokladně zbude po dohrání rozehrané sezóny (viz freeBalance). */
  balance: number;
  sponsor?: number;
}): BudgetCheck {
  const { rules, teams, level, balance } = opts;
  const cost = projectSeasonCost(rules, teams, level, true);
  const income = subsidyFor(teams, level) + teams * rules.entry_fee + (opts.sponsor ?? 0);
  const projected = balance + income - cost.total;
  const deficit = projected >= MIN_RESERVE ? 0 : MIN_RESERVE - projected;
  const requiredEntryFee = teams > 0
    ? Math.ceil((rules.entry_fee * teams + deficit) / teams)
    : rules.entry_fee;
  return { ok: deficit === 0, deficit, projected, cost, income, requiredEntryFee };
}

export interface TeamImpact {
  matchBonus: number;
  placeReward: number;
  entryFee: number;
  net: number;
}

/**
 * Odhad dopadu sazebníku na jeden konkrétní klub při jeho současné formě.
 *
 * Odměny rozhodčím se tu neobjeví schválně: platí je soutěž, takže na klubový
 * rozpočet nemají vliv bez ohledu na sazbu.
 */
export function teamImpact(opts: {
  rules: CompetitionRules;
  teams: number;
  level: string;
  expectedPos: number;
  expectedWins: number;
  expectedDraws: number;
}): TeamImpact {
  const { rules, level, expectedPos, expectedWins, expectedDraws } = opts;
  const matchBonus = expectedWins * rules.win_bonus + expectedDraws * rules.draw_bonus;
  const placeReward = placementReward(rules, Math.max(1, Math.min(opts.teams, expectedPos)), level);
  const entryFee = rules.entry_fee;
  return { matchBonus, placeReward, entryFee, net: matchBonus + placeReward - entryFee };
}

/**
 * Poměrné krácení odměn za umístění, když pokladna nestačí.
 * Vrací násobič 0–1; při dostatku peněz přesně 1.
 */
export function payoutRatio(available: number, required: number): number {
  if (required <= 0) return 1;
  if (available >= required) return 1;
  return Math.max(0, available / required);
}

/** Zaokrouhlení dolů na stovky — pokrácené odměny nemají končit na drobných. */
const roundDown100 = (v: number) => Math.max(0, Math.floor(v / 100) * 100);

export interface ScaledRewards {
  /** Násobič 0–1; 1 znamená plnou výplatu. */
  ratio: number;
  /** Kolik dostane který tým, klíčem je teamId. */
  rewards: Map<string, number>;
  /** Součet vyplacených odměn — nikdy nepřekročí dostupný zůstatek. */
  total: number;
  /** Kolik by odměny stály při plné výplatě. */
  required: number;
}

/**
 * Rozdělení odměn za umístění včetně poměrného krácení, když pokladna nestačí.
 *
 * Krátí se VŠEM stejným poměrem a poměr se počítá dopředu z celé tabulky, takže
 * nezáleží na pořadí zpracování — první tým nevyčerpá pokladnu na úkor posledního.
 * Zaokrouhlování jde dolů, takže součet nikdy nepřeleze dostupný zůstatek.
 */
export function scaledRewards(
  rules: CompetitionRules,
  entries: Array<{ teamId: string; pos: number }>,
  level: string,
  available: number,
): ScaledRewards {
  const full = entries.map((e) => ({ teamId: e.teamId, amount: placementReward(rules, e.pos, level) }));
  const required = full.reduce((s, f) => s + f.amount, 0);
  const ratio = payoutRatio(available, required);

  const rewards = new Map<string, number>();
  let total = 0;
  for (const f of full) {
    const amount = ratio < 1 ? roundDown100(f.amount * ratio) : f.amount;
    rewards.set(f.teamId, amount);
    total += amount;
  }
  return { ratio, rewards, total, required };
}
