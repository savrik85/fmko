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

export interface EventEffect {
  type: "morale" | "condition" | "budget" | "reputation" | "player_add" | "player_leave" | "injury";
  value?: number;
  playerIndex?: number;
  duration?: number; // Rounds
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
  {
    category: "positive",
    title: "Nový hráč se nabídl",
    emoji: "\u{1F44B}",
    baseProb: 0.06,
    evaluate: (ctx) => {
      if (ctx.squad.length >= 25) return null;
      return {
        prob: 1.0,
        description: "V hospodě se ozval chlápek, že by chtěl chodit kopat. Prý hrával za sousední vesnici.",
        effect: { type: "player_add" },
      };
    },
  },
  {
    category: "positive",
    title: "Sponzor nabízí smlouvu",
    emoji: "\u{1F4B0}",
    baseProb: 0.04,
    evaluate: (ctx) => {
      const bonus = ctx.reputation > 60 ? 1.5 : 0.8;
      const amount = ctx.rng.int(200, 1000);
      const sponsors = [
        "Řeznictví u Nováků", "Autoservis Dvořák", "Hospoda Na Růžku",
        "Potraviny u Mařky", "Stavby Procházka", "Pila Hájek",
        "Truhlářství Sedláček", "Zemědělské družstvo", "Pekárna Šimek",
      ];
      return {
        prob: bonus,
        description: `${ctx.rng.pick(sponsors)} nabízí sponzoring ${amount} Kč měsíčně.`,
        effect: { type: "budget", value: amount },
      };
    },
  },
  {
    category: "positive",
    title: "Dotace od obce",
    emoji: "\u{1F3DB}",
    baseProb: 0.02,
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
      const injuries = [
        "natažený sval", "podvrtnutý kotník", "naražené žebro",
        "pohmožděný palec", "bolest kolene",
      ];
      const duration = ctx.rng.int(1, 4);
      return {
        prob: player.injuryProneness / 20,
        description: `${player.firstName} ${player.lastName} si na tréninku přivodil ${ctx.rng.pick(injuries)}. Bude chybět ${duration} ${duration === 1 ? "kolo" : duration < 5 ? "kola" : "kol"}.`,
        effect: { type: "injury", playerIndex: idx, duration },
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

  // === NEUTRÁLNÍ ===
  {
    category: "neutral",
    title: "Obecní zpravodaj",
    emoji: "\u{1F4F0}",
    baseProb: 0.1,
    evaluate: (ctx) => {
      const headlines = [
        "V obecním zpravodaji se píše o víkendovém zápase. Prý to bylo drama.",
        "Místní noviny zveřejnily rozhovor s trenérem. Tvrdí, že tým se zlepšuje.",
        "V hospodě visí nový plakát s výsledky kola. Někdo k nim připsal komentáře.",
        "Starosta se zmínil o fotbale na zastupitelstvu. Prý by to chtělo nové sítě.",
      ];
      return {
        prob: 1.0,
        description: ctx.rng.pick(headlines),
      };
    },
  },
  {
    category: "neutral",
    title: "Počasí ovlivní trénink",
    emoji: "\u{26C5}",
    baseProb: 0.08,
    evaluate: (ctx) => {
      const weather = [
        "Celý týden pršelo — trénink se přesunul do hospody (teoretická příprava u piva).",
        "Krásné počasí celý týden, kluci trénovali s chutí.",
        "Na hřišti napadla rosa a Franta uklouzl. Ale nic vážného.",
        "Hřiště bylo tak tvrdé, že se na něm dalo hrát kuličky.",
      ];
      return {
        prob: 1.0,
        description: ctx.rng.pick(weather),
      };
    },
  },
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

    events.push({
      category: rule.category,
      title: rule.title,
      description: result.description,
      emoji: rule.emoji,
      effect: result.effect,
    });
  }

  return events;
}
