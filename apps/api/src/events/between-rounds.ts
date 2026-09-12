/**
 * Mezikolový event engine — generuje 1-3 události mezi zápasy.
 *
 * Události ovlivněné atributy hráčů, výsledky, rozpočtem.
 */

import type { Rng } from "../generators/rng";
import type { GeneratedPlayer } from "../generators/player";

export type EventCategory = "positive" | "negative" | "neutral";

export interface GameEvent {
  category: EventCategory;
  title: string;
  description: string;
  emoji: string;
  playerIndex?: number;
  effect?: EventEffect;
}

/**
 * Popisy zranění z tréninku — vlastní sada, jiná než zápasová `POPISY_ZRANENI`.
 * Export je schválně: překlad na typ v `injuries/injury-types.ts` musí pokrýt obě sady
 * a `injury-types.test.ts` to hlídá. Dokud seznam žil uvnitř funkce, zápis o něm nevěděl
 * a ukládal nepovolený typ „training", takže se tréninková zranění vůbec neuložila.
 */
export const POPISY_ZRANENI_TRENINK = [
  "natažený sval", "podvrtnutý kotník", "naražené žebro",
  "pohmožděný palec", "bolest kolene",
] as const;

export interface EventEffect {
  type: "morale" | "condition" | "budget" | "reputation" | "player_leave" | "injury";
  value?: number;
  playerIndex?: number;
  duration?: number; // Rounds
  /** U zranění: který popis padl, ať se uloží správný typ a ne jen obecné zranění. */
  popisZraneni?: (typeof POPISY_ZRANENI_TRENINK)[number];
  /**
   * Peníze putují do pokladny soutěže, ne do vzduchu — a soutěží odhlasovaný
   * sazebník pokut na ně sedne. Příznak je na efektu schválně: podle titulku
   * událost poznat nejde, texty se lokalizují podle okresu.
   */
  toLeague?: boolean;
}

interface EventRule {
  category: EventCategory;
  title: string;
  emoji: string;
  baseProb: number;
  /** Returns probability modifier and description */
  evaluate: (ctx: EventContext) => { prob: number; description: string; effect?: EventEffect } | null;
}

interface EventContext {
  rng: Rng;
  squad: GeneratedPlayer[];
  budget: number;
  reputation: number;
  lastMatchWon: boolean | null;
  round: number;
}

const EVENT_RULES: EventRule[] = [
  // === POZITIVNÍ ===
  // „Nový hráč se nabídl" odsud zmizel. Posílal DOSLOVA stejnou větu jako
  // skutečné nabídky hráčů z `events/player-offers.ts` („V hospodě se ozval
  // chlápek…"), jenže bez jména, bez věku, bez postu a bez možnosti kohokoli
  // přijmout — jen dosypal volné hráče do okresního poolu. Trenér tedy četl, že
  // se někdo nabídl, a neměl kde ho hledat. Jmenovité nabídky chodí dál z
  // denního ticku; ty mají tlačítka Přijmi/Odmítni.
  {
    category: "positive",
    // Pozor na slovo „nabízí": peníze tady rovnou přistanou na účtu a není co
    // podepisovat. Dřív zpráva zněla „nabízí sponzoring 1290 Kč měsíčně" — trenér
    // šel hledat smlouvu na stránku Sponzoři, kde žádná nebyla, a částka navíc
    // nebyla měsíční, ale jednorázová. Skutečné sponzorské smlouvy jsou vlastní
    // mechanika (`sponsor_contracts`); tohle je reklama na plotě za hotové.
    title: "Reklama na plotě",
    emoji: "\u{1F4B0}",
    baseProb: 0.12,
    evaluate: (ctx) => {
      const bonus = ctx.reputation > 60 ? 1.5 : 0.8;
      const amount = ctx.rng.int(500, 2000);
      const sponsors = [
        "Řeznictví u Nováků", "Autoservis Dvořák", "Hospoda Na Růžku",
        "Potraviny u Mařky", "Stavby Procházka", "Pila Hájek",
        "Truhlářství Sedláček", "Zemědělské družstvo", "Pekárna Šimek",
      ];
      return {
        prob: bonus,
        description: `${ctx.rng.pick(sponsors)} si koupilo reklamu na plot ${amount} Kč je na účtu.`,
        effect: { type: "budget", value: amount },
      };
    },
  },
  {
    category: "positive",
    title: "Dotace od obce",
    emoji: "\u{1F3DB}",
    baseProb: 0.06,
    evaluate: (ctx) => {
      const amount = ctx.rng.int(1000, 5000);
      return {
        prob: ctx.reputation > 50 ? 1.3 : 0.7,
        description: `Obecní zastupitelstvo schválilo dotaci ${amount} Kč na údržbu hřiště.`,
        effect: { type: "budget", value: amount },
      };
    },
  },
  {
    category: "positive",
    title: "Morálka stoupla",
    emoji: "\u{1F4AA}",
    baseProb: 0.08,
    evaluate: (ctx) => {
      if (!ctx.lastMatchWon) return null;
      return {
        prob: 1.2,
        description: "Po výhře je v kabině skvělá nálada. Kluci chodí na tréninky s úsměvem.",
        effect: { type: "morale", value: 5 },
      };
    },
  },

  // === NEGATIVNÍ ===
  {
    category: "negative",
    title: "Hráč chce odejít",
    emoji: "\u{1F6AA}",
    baseProb: 0.03,
    evaluate: (ctx) => {
      const candidates = ctx.squad
        .map((p, i) => ({ player: p, index: i }))
        .filter((x) => x.player.patriotism <= 8 && x.player.morale < 40);
      if (candidates.length === 0) return null;
      const pick = ctx.rng.pick(candidates);
      return {
        prob: 1.0,
        description: `${pick.player.firstName} ${pick.player.lastName} říká, že ho to nebaví a přemýšlí, jestli nepřejde jinam.`,
        effect: { type: "player_leave", playerIndex: pick.index },
      };
    },
  },
  {
    category: "negative",
    title: "Zranění na tréninku",
    emoji: "\u{1F915}",
    baseProb: 0.05,
    evaluate: (ctx) => {
      const idx = ctx.rng.int(0, ctx.squad.length - 1);
      const player = ctx.squad[idx];
      const popis = ctx.rng.pick(POPISY_ZRANENI_TRENINK);
      const duration = ctx.rng.int(1, 4);
      return {
        prob: player.injuryProneness / 20,
        description: `${player.firstName} ${player.lastName} si na tréninku přivodil ${popis}. Bude chybět ${duration} ${duration === 1 ? "kolo" : duration < 5 ? "kola" : "kol"}.`,
        effect: { type: "injury", playerIndex: idx, duration, popisZraneni: popis },
      };
    },
  },
  {
    category: "negative",
    title: "Hádka v kabině",
    emoji: "\u{1F4A2}",
    baseProb: 0.04,
    evaluate: (ctx) => {
      const hotHeads = ctx.squad.filter((p) => p.temper >= 14);
      if (hotHeads.length < 2) return null;
      const a = ctx.rng.pick(hotHeads);
      const b = ctx.rng.pick(hotHeads.filter((p) => p !== a));
      if (!b) return null;
      return {
        prob: 1.0,
        description: `${a.firstName} ${a.lastName} se pohádal s ${b.firstName} ${b.lastName}. V kabině to vřelo.`,
        effect: { type: "morale", value: -5 },
      };
    },
  },
  {
    category: "negative",
    title: "Morálka klesla",
    emoji: "\u{1F614}",
    baseProb: 0.06,
    evaluate: (ctx) => {
      if (ctx.lastMatchWon !== false) return null;
      return {
        prob: 1.0,
        description: "Po prohře jsou kluci na dně. Někteří přemýšlejí, jestli to má cenu.",
        effect: { type: "morale", value: -3 },
      };
    },
  },

  {
    category: "negative",
    title: "Vykradení kabiny",
    emoji: "\u{1F977}",
    baseProb: 0.03,
    evaluate: (ctx) => {
      const amount = ctx.rng.int(800, 3000);
      const stolen = [
        `Z kabiny zmizely míče a dresy. Škoda ${amount} Kč.`,
        `Někdo vykradl kabinu přes noc. Ukradli výstroj za ${amount} Kč.`,
        `Rozbité okno u kabiny, chybí sada tréninkových leiblů. Oprava a náhrada: ${amount} Kč.`,
      ];
      return {
        prob: 1.0,
        description: ctx.rng.pick(stolen),
        effect: { type: "budget", value: -amount },
      };
    },
  },
  {
    category: "negative",
    title: "Havárie na hřišti",
    emoji: "\u{1F527}",
    baseProb: 0.05,
    evaluate: (ctx) => {
      const amount = ctx.rng.int(500, 4000);
      const issues = [
        { text: `Rozbitý bojler v kabinách. Oprava: ${amount} Kč.`, sender: "boiler" },
        { text: `Praskla vodovodní trubka pod hřištěm. Instalatér si řekl ${amount} Kč.`, sender: "pipe" },
        { text: `Spadl kus střechy z tribunky. Tesař počítá ${amount} Kč.`, sender: "roof" },
        { text: `Sekačka na trávu odešla. Nová stojí ${amount} Kč.`, sender: "mower" },
        { text: `Zateklo do skladu s výstrojí. Škoda na dresech: ${amount} Kč.`, sender: "flood" },
        { text: `Branky zrezivěly, potřebujeme nové sítě a svařování. Náklad: ${amount} Kč.`, sender: "goals" },
      ];
      const issue = ctx.rng.pick(issues);
      return {
        prob: 1.0,
        description: issue.text,
        effect: { type: "budget", value: -amount },
      };
    },
  },
  {
    category: "negative",
    title: "Pokuta od svazu",
    emoji: "\u{1F4C4}",
    baseProb: 0.02,
    evaluate: (ctx) => {
      const amount = ctx.rng.int(300, 1500);
      const reasons = [
        `Pokuta od svazu za pozdní přihlášku soupisky: ${amount} Kč.`,
        `Svaz udělil pokutu za neuklizené kabiny po zápase: ${amount} Kč.`,
        `Rozhodčí nahlásil nesportovní chování fanoušků. Pokuta: ${amount} Kč.`,
        `Nedodaný zápis ze zápasu, pokuta ${amount} Kč.`,
      ];
      return {
        prob: 1.0,
        description: ctx.rng.pick(reasons),
        effect: { type: "budget", value: -amount, toLeague: true },
      };
    },
  },
  {
    category: "negative",
    title: "Vandalizmus",
    emoji: "\u{1F4A5}",
    baseProb: 0.02,
    evaluate: (ctx) => {
      const amount = ctx.rng.int(500, 2500);
      const acts = [
        `Někdo pomaloval kabiny sprejem. Přemalování: ${amount} Kč.`,
        `Na hřišti někdo udělal burnout autem. Oprava trávníku: ${amount} Kč.`,
        `Rozbité lavičky na tribuně. Oprava: ${amount} Kč.`,
      ];
      return {
        prob: 1.0,
        description: ctx.rng.pick(acts),
        effect: { type: "budget", value: -amount },
      };
    },
  },

  // === NEUTRÁLNÍ ===
  //
  // Byly tu dvě: „Obecní zpravodaj" a „Počasí ovlivní trénink". Ani jedna neměla
  // efekt — jen čtyři pevné věty dokola (na testovacím účtu přistála ta o sítích
  // na zastupitelstvu čtrnáctkrát). Telefon je na zprávy, se kterými se dá něco
  // dělat; tohle se s ničím nepotkávalo a obojí navíc lhalo vedle skutečných
  // mechanik: články má Zpravodaj, počasí má jediný zdroj v `season-weather.ts`
  // a s tréninkem si nic nevymýšlelo. Sezónní „Obecní zpravodaj" v
  // `seasonal-events.ts` zůstává — ten reputaci opravdu hne.
];

/**
 * Generate between-round events (1-3 per round).
 */
export function generateBetweenRoundEvents(
  rng: Rng,
  squad: GeneratedPlayer[],
  budget: number,
  reputation: number,
  lastMatchWon: boolean | null,
  round: number,
  district?: string,
): GameEvent[] {
  const ctx: EventContext = { rng, squad, budget, reputation, lastMatchWon, round };
  const events: GameEvent[] = [];
  const targetCount = rng.int(1, 3);

  // Shuffle rules to avoid bias
  const shuffled = [...EVENT_RULES];
  rng.shuffle(shuffled);

  for (const rule of shuffled) {
    if (events.length >= targetCount) break;

    if (rng.random() > rule.baseProb) continue;

    const result = rule.evaluate(ctx);
    if (!result) continue;

    if (rng.random() > result.prob) continue;

    let title = rule.title;
    let description = result.description;

    // Pražské varianty textů
    if (district === "Praha") {
      const pragueTexts: Record<string, { title?: string; replace?: [string, string][] }> = {
        "Vykradení kabiny": { title: "Vloupání do kabiny", replace: [["zlodějíčci", "bezdomovci"], ["někdo vykradl", "někdo se vloupal do"]] },
        "Havárie na hřišti": { title: "Havárie v areálu" },
        "Vandalizmus": { replace: [["sprejoval kabiny", "tageři posprejovali plot"], ["po vsi", "po městské části"]] },
        "Dotace od obce": { title: "Grant z městské části", replace: [["obec", "městská část"], ["obce", "městské části"]] },
        "Reklama na plotě": { replace: [["na plot", "na mantinel"]] },
      };
      const pt = pragueTexts[title];
      if (pt) {
        if (pt.title) title = pt.title;
        if (pt.replace) {
          for (const [from, to] of pt.replace) description = description.replace(from, to);
        }
      }
    }

    events.push({
      category: rule.category,
      title,
      description,
      emoji: rule.emoji,
      effect: result.effect,
    });
  }

  return events;
}
