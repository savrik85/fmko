import type { Weather } from "./types";
import { WEATHER_MODS, pitchTechniqueFactor, pitchLongBallBonus } from "./simulation";
import { drynessFromMoisture, wetnessFromMoisture } from "../stadium/pitch-moisture";

/**
 * Tipy k sestavě podle podmínek na zápas.
 *
 * Čte PŘÍMO konstanty enginu (WEATHER_MODS, pitchTechniqueFactor, …), ne vlastní
 * kopii čísel. Když se balanc přeladí, tipy se posunou s ním a nezačnou lhát.
 *
 * Záměrně radí, nerozhoduje: nenavrhuje konkrétní taktiku k nastavení, jen říká,
 * co podmínky dělají. Trenér ať se rozhodne sám.
 */

export type HintTone = "warning" | "opportunity" | "info";

export interface TacticHint {
  tone: HintTone;
  /** Krátký nadpis do seznamu. */
  label: string;
  /** Věta, která vysvětluje proč. */
  detail: string;
}

export interface TacticHintInput {
  weather: Weather;
  /** Stav trávníku 0–100. */
  pitchCondition?: number | null;
  /** Vlhkost půdy 0–100 (50 = normál). */
  pitchMoisture?: number | null;
  /** Zvolená taktika, pokud už je sestava uložená. */
  tactic?: string | null;
  /** Zimní výbava lavičky 0–0,45 — tlumí postihy počasí. */
  weatherResist?: number;
}

/** Vrací tipy seřazené: nejdřív varování, pak příležitosti, pak info. */
export function tacticHints(input: TacticHintInput): TacticHint[] {
  const mods = WEATHER_MODS[input.weather];
  if (!mods) return [];

  const hints: TacticHint[] = [];
  const resist = Math.max(0, Math.min(1, input.weatherResist ?? 0));
  const cond = input.pitchCondition ?? null;
  const isLongBall = input.tactic === "long_ball";

  // ── Technika: počasí i hřiště srážejí hru po zemi ──
  const pitchTech = pitchTechniqueFactor(cond);
  const weatherTech = 1 - (1 - mods.techniqueMod) * (1 - resist);
  const techLoss = 1 - weatherTech * pitchTech;
  if (techLoss >= 0.08) {
    hints.push({
      tone: "warning",
      label: "Kombinační hra bude váznout",
      detail: cond != null && pitchTech < 0.95
        ? `Počasí i stav hřiště srážejí techniku zhruba o ${Math.round(techLoss * 100)} %. Krátká přihrávka po zemi tady nebude sedět.`
        : `Technika je horší zhruba o ${Math.round(techLoss * 100)} %. Míč nedrží tak, jak jsi zvyklý.`,
    });
  }

  // ── Nakopávaný balon ──
  const longBall = mods.longBallBonus + pitchLongBallBonus(cond);
  // Práh 0,05: samotné rozorané hřiště dá nejvýš 0,057, a to už je podle měření
  // +2 góly za zápas u nakopávané taktiky. Vyšší práh by tenhle případ přeskočil.
  if (longBall >= 0.05) {
    hints.push({
      tone: "opportunity",
      label: isLongBall ? "Nakopávaný balon tu sedí" : "Zvaž nakopávaný balon",
      detail: isLongBall
        ? "Podmínky tvojí taktice nahrávají — dlouhé míče dopředu jsou dneska účinnější než obvykle."
        : "Za těchhle podmínek je dlouhý míč dopředu účinnější než obvykle. Kombinace po zemi bude trpět.",
    });
  } else if (longBall <= -0.05 && isLongBall) {
    hints.push({
      tone: "warning",
      label: "Nakopávat se dneska nevyplatí",
      detail: "Vítr si s dlouhými míči dělá, co chce. Máš nastavený nakopávaný balon — zvaž změnu.",
    });
  }

  // ── Kondice ──
  const drain = 1 + (mods.conditionDrainMod - 1) * (1 - resist);
  if (drain >= 1.1) {
    hints.push({
      tone: "warning",
      label: "Kondice půjde dolů rychleji",
      detail: `Tým se unaví asi o ${Math.round((drain - 1) * 100)} % rychleji. Nech si síly na střídání a nezačínej vysokým presinkem.`,
    });
  } else if (drain > 1.0) {
    hints.push({
      tone: "info",
      label: "Vedro trochu ubere",
      detail: "Není to dramatické, ale v závěru to bude znát. Čerství střídající se hodí.",
    });
  }

  // ── Zranění ──
  const injury = 1 + (mods.injuryMod - 1) * (1 - resist);
  const pitchInjury = cond != null ? 1 + (100 - cond) / 50 : 1;
  if (injury >= 1.3 || pitchInjury >= 2) {
    hints.push({
      tone: "warning",
      label: "Zvýšené riziko zranění",
      detail: pitchInjury >= 2
        ? "Rozbité hřiště je na zdraví horší než jakékoli počasí. Zvaž měkčí hru a nešetři křehkými hráči."
        : "V tomhle počasí se zraňuje víc. Tvrdá hra to ještě znásobí.",
    });
  }

  // ── Stav půdy ──
  const wet = wetnessFromMoisture(input.pitchMoisture);
  const dry = drynessFromMoisture(input.pitchMoisture);
  if (wet >= 0.3) {
    hints.push({
      tone: "info",
      label: "Rozmáčený terén",
      detail: "Na hřišti stojí voda. Míč se v kalužích zastavuje a přihrávka do běhu často nedojde.",
    });
  } else if (dry >= 0.3) {
    hints.push({
      tone: "info",
      label: "Vyprahlý terén",
      detail: "Tvrdá zem, míč skáče a běží rychleji. Zvaž to u přihrávek na delší vzdálenost.",
    });
  }

  // ── Zimní výbava ──
  if (resist > 0 && (mods.techniqueMod < 1 || mods.conditionDrainMod > 1)) {
    hints.push({
      tone: "info",
      label: "Zimní výbava zabírá",
      detail: `Vybavení lavičky tlumí postihy počasí zhruba o ${Math.round(resist * 100)} %.`,
    });
  }

  const order: Record<HintTone, number> = { warning: 0, opportunity: 1, info: 2 };
  return hints.sort((a, b) => order[a.tone] - order[b.tone]);
}
