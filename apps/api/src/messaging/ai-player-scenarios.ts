/**
 * AI player chat scénáře — pool situací, kdy hráč iniciuje konverzaci s trenérem.
 *
 * Každý scénář má:
 *  - triggerCondition: závislost na hráčově stavu (morale/condition/atributy/odehrané minuty)
 *  - personalityWeight: jak moc daná povaha tíhne k tomuto scénáři
 *  - description: text který Gemini dostane jako kontext "co chceš trenérovi napsat"
 *  - expectedTurns: kolik výměn trenér ↔ hráč proběhne (vždy 2 nebo 3)
 *  - category: pro analytiku a UI tag
 */

export type ScenarioCategory = "complaint" | "positive" | "personal" | "transfer";

export interface PlayerSnapshot {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  position: "GK" | "DEF" | "MID" | "FWD";
  morale: number;
  condition: number;
  coachRelationship: number;
  // personality
  discipline: number;
  patriotism: number;
  alcohol: number;
  temper: number;
  leadership: number;
  workRate: number;
  aggression: number;
  // play time stats (last 5 matches)
  recentMinutes: number;     // 0-450
  recentRatingAvg: number;   // 1-10
  isCelebrity: boolean;
  // optional context
  occupation?: string;
  injuredUntil?: string | null;
}

export interface AiScenario {
  id: string;
  label: string;
  category: ScenarioCategory;
  expectedTurns: 2 | 3;
  description: string;
  /** Vrací 0 pokud scénář není relevantní, jinak waha (vyšší = vhodnější). */
  weight: (p: PlayerSnapshot) => number;
}

const w = (cond: boolean, value: number): number => (cond ? value : 0);

export const AI_PLAYER_SCENARIOS: AiScenario[] = [
  // ───── COMPLAINT ─────
  {
    id: "bench_complaint",
    label: "Stížnost na lavičku",
    category: "complaint",
    expectedTurns: 2,
    description:
      "Hráč je naštvaný, že nedostává herní minuty. Cítí se zbytečný, ptá se proč ho trenér nestaví. Možná to vzdá pokud nedostane jasnou odpověď.",
    weight: (p) =>
      w(p.recentMinutes < 90, 6) +
      w(p.morale < 50, 3) +
      w(p.temper > 60, 2) +
      w(p.workRate > 60, 2),
  },
  {
    id: "training_complaint",
    label: "Stížnost na trénink",
    category: "complaint",
    expectedTurns: 2,
    description:
      "Hráč si stěžuje, že trénink je moc tvrdý / monotónní / nudný. Chce vědět, jestli to dává smysl. Naštvaný, ironický.",
    weight: (p) =>
      w(p.temper > 65, 4) +
      w(p.workRate < 50, 2) +
      w(p.alcohol > 60, 2) +
      w(p.condition < 50, 2),
  },
  {
    id: "team_chemistry",
    label: "Konflikt se spoluhráčem",
    category: "complaint",
    expectedTurns: 3,
    description:
      "Hráč si stěžuje na konkrétního spoluhráče — že se s ním nedá hrát, je arogantní, nemaká, nebo žárlí. Chce, aby trenér něco udělal.",
    weight: (p) =>
      w(p.aggression > 60, 3) +
      w(p.temper > 60, 3) +
      w(p.leadership > 50, 2),
  },
  {
    id: "position_complaint",
    label: "Nesedí pozice",
    category: "complaint",
    expectedTurns: 2,
    description:
      "Hráč si myslí, že hraje na špatné pozici. Cítí, že by byl lepší jinde. Argumentuje svými přednostmi.",
    weight: (p) =>
      w(p.recentRatingAvg < 6.5 && p.recentMinutes > 90, 4) +
      w(p.leadership > 50, 2),
  },

  // ───── POSITIVE ─────
  {
    id: "praise_after_win",
    label: "Poděkování po výhře",
    category: "positive",
    expectedTurns: 2,
    description:
      "Hráč je nadšený z poslední výhry, děkuje trenérovi za důvěru a taktiku. Pozitivní, energický.",
    weight: (p) =>
      w(p.morale > 65, 4) +
      w(p.recentRatingAvg > 7.0, 3) +
      w(p.leadership > 55, 2) +
      w(p.coachRelationship > 60, 2),
  },
  {
    id: "form_excitement",
    label: "Nadšení z formy",
    category: "positive",
    expectedTurns: 2,
    description:
      "Hráč cítí, že je v životní formě. Chce, aby to trenér věděl, sdílí radost. Možná navrhuje, že zvládne i víc minut.",
    weight: (p) =>
      w(p.condition > 75 && p.morale > 60, 4) +
      w(p.recentRatingAvg > 7.2, 3),
  },
  {
    id: "thanks_for_chance",
    label: "Díky za první šanci",
    category: "positive",
    expectedTurns: 2,
    description:
      "Mladý/náhradní hráč dostal poprvé šanci a chce poděkovat. Přiznává, že byl nervózní, slibuje, že nezklame.",
    weight: (p) =>
      w(p.age <= 22 && p.recentMinutes > 30 && p.recentMinutes < 200, 5) +
      w(p.coachRelationship < 60, 2),
  },

  // ───── PERSONAL ─────
  {
    id: "family_problem",
    label: "Problém v rodině",
    category: "personal",
    expectedTurns: 3,
    description:
      "Hráč se svěřuje s problémem doma — nemoc v rodině, hádka s manželkou, narozená malá. Žádá o pochopení, případně pauzu nebo volno na zápas.",
    weight: (p) =>
      w(p.age >= 25, 3) +
      w(p.coachRelationship > 55, 2) +
      w(p.morale < 55, 2),
  },
  {
    id: "injury_concern",
    label: "Bolavé tělo",
    category: "personal",
    expectedTurns: 2,
    description:
      "Hráč má bolesti — natažený sval, otok kolena, narážený kotník. Není zraněný, ale ptá se, jestli má hrát zápas, nebo radši šetřit. Chce upřímnou radu.",
    weight: (p) =>
      w(p.condition < 60, 4) +
      w(p.age > 30, 3) +
      w(p.workRate > 60, 2),
  },
  {
    id: "personal_milestone",
    label: "Osobní událost",
    category: "personal",
    expectedTurns: 2,
    description:
      "Hráč má v životě milník — svatba, narozeniny, dítě, povýšení v práci. Sdílí radost, možná zve trenéra na oslavu, nebo žádá volno.",
    weight: (p) =>
      w(p.age >= 24 && p.age <= 35, 3) +
      w(p.coachRelationship > 50, 2) +
      w(p.morale > 55, 2),
  },
  {
    id: "alcohol_struggle",
    label: "Boj s flaškou",
    category: "personal",
    expectedTurns: 3,
    description:
      "Hráč přiznává, že to s pivem přehnal. Buď se kaje a slibuje zlepšení, nebo naopak hájí hospodu jako součást vesnického fotbalu. Záleží na temperamentu.",
    weight: (p) =>
      w(p.alcohol > 70, 5) +
      w(p.condition < 55, 2) +
      w(p.discipline < 40, 2),
  },

  // ───── TRANSFER ─────
  {
    id: "transfer_rumor",
    label: "Ozval se jiný klub",
    category: "transfer",
    expectedTurns: 3,
    description:
      "Hráče oslovil jiný klub z okresu. Říká to trenérovi z respektu, ptá se, jestli má jít na schůzku. Záleží mu na trenérově názoru — hlavně pokud je vztah dobrý.",
    weight: (p) =>
      w(p.recentRatingAvg > 7.0 && p.age < 30, 4) +
      w(p.morale < 50, 3) +
      w(p.patriotism < 60, 2),
  },
  {
    id: "agent_call",
    label: "Tlak agenta",
    category: "transfer",
    expectedTurns: 3,
    description:
      "Hráče přemlouvá agent / kamarád z jiné vesnice, aby šel jinam. On sám si není jistý, hledá u trenéra ujištění. Buď chce slyšet 'jsi pro mě klíčový', nebo 'běž'.",
    weight: (p) =>
      w(p.age >= 22 && p.age <= 32, 3) +
      w(p.morale < 55, 3) +
      w(p.coachRelationship < 55, 2),
  },
  {
    id: "loyalty_pledge",
    label: "Přísaha věrnosti",
    category: "transfer",
    expectedTurns: 2,
    description:
      "Hráč chce trenérovi vyloženě říct, že nikam nejde. Slibuje, že tu zůstane a pomůže klubu. Vesnický patriot, hrdý na klub.",
    weight: (p) =>
      w(p.patriotism > 75, 5) +
      w(p.coachRelationship > 65, 3) +
      w(p.age >= 28, 2),
  },
];

/**
 * Vážený výběr scénáře pro daného hráče.
 * Vrací null pokud žádný scénář nemá kladnou váhu.
 */
export function pickScenarioForPlayer(
  player: PlayerSnapshot,
  rng: () => number,
): AiScenario | null {
  const candidates = AI_PLAYER_SCENARIOS.map((s) => ({
    scenario: s,
    weight: Math.max(0, s.weight(player)),
  })).filter((c) => c.weight > 0);

  if (candidates.length === 0) return null;

  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  let pick = rng() * total;
  for (const c of candidates) {
    pick -= c.weight;
    if (pick <= 0) return c.scenario;
  }
  return candidates[candidates.length - 1].scenario;
}

export function getScenarioById(id: string): AiScenario | null {
  return AI_PLAYER_SCENARIOS.find((s) => s.id === id) ?? null;
}
