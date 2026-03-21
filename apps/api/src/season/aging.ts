/**
 * Stárnutí hráčů a pokles atributů.
 *
 * Každou sezónu: +1 rok, pokles atributů dle věku,
 * šance na ukončení kariéry.
 */

import type { Rng } from "../generators/rng";
import type { GeneratedPlayer } from "../generators/player";

export interface AgingResult {
  playerIndex: number;
  retired: boolean;
  retirementReason?: string;
  attributeChanges: Record<string, number>;
}

const RETIREMENT_REASONS = [
  "Už mě to nebaví, trenére. Dávám přednost zahradě.",
  "Kolena už nedávají. Doktor říkal, že mám přestat.",
  "Manželka řekla dost. Buď fotbal, nebo ona.",
  "Stěhuju se pryč. Dostal jsem práci v Praze.",
  "Přestal jsem chodit a tým si zvykl bez mě.",
  "Mám malou firmu, nemám čas. Ale přijdu fandit!",
  "Po tom posledním zranění už to nejde.",
  "Radši budu trénovat mládež, než se trápit na hřišti.",
];

/**
 * Apply aging to a squad at end of season.
 */
export function applyAging(rng: Rng, squad: GeneratedPlayer[]): AgingResult[] {
  const results: AgingResult[] = [];

  for (let i = 0; i < squad.length; i++) {
    const player = squad[i];
    player.age += 1;

    const changes: Record<string, number> = {};

    // Retirement check
    let retireProb = 0;
    if (player.age >= 45) retireProb = 0.8;
    else if (player.age >= 40) retireProb = 0.4;
    else if (player.age >= 37) retireProb = 0.15;
    else if (player.age >= 35) retireProb = 0.05;

    // Discipline reduces retirement chance
    retireProb *= (20 - player.discipline * 0.3) / 20;
    // Low morale increases it
    if (player.morale < 30) retireProb *= 1.5;

    if (rng.random() < retireProb) {
      results.push({
        playerIndex: i,
        retired: true,
        retirementReason: rng.pick(RETIREMENT_REASONS),
        attributeChanges: {},
      });
      continue;
    }

    // Attribute decay
    if (player.age >= 30) {
      const decayRate = player.age >= 40 ? 2.0
        : player.age >= 35 ? 1.0
        : 0.5;

      // Discipline slows decay
      const disciplineMod = 1 - (player.discipline / 40);

      // Physical attributes decay faster
      const speedDecay = Math.round(decayRate * disciplineMod * (0.8 + rng.random() * 0.4));
      const staminaDecay = Math.round(decayRate * disciplineMod * (0.8 + rng.random() * 0.4));
      const strengthDecay = Math.round(decayRate * disciplineMod * 0.5);

      // Technical attributes decay slower
      const techniqueDecay = Math.round(decayRate * disciplineMod * 0.3);
      const passingDecay = Math.round(decayRate * disciplineMod * 0.2);

      if (speedDecay > 0) { player.speed = Math.max(1, player.speed - speedDecay); changes.speed = -speedDecay; }
      if (staminaDecay > 0) { player.stamina = Math.max(1, player.stamina - staminaDecay); changes.stamina = -staminaDecay; }
      if (strengthDecay > 0) { player.strength = Math.max(1, player.strength - strengthDecay); changes.strength = -strengthDecay; }
      if (techniqueDecay > 0) { player.technique = Math.max(1, player.technique - techniqueDecay); changes.technique = -techniqueDecay; }
      if (passingDecay > 0) { player.passing = Math.max(1, player.passing - passingDecay); changes.passing = -passingDecay; }
    }

    // Young players can improve
    if (player.age <= 24) {
      const growthRate = player.age <= 20 ? 1.5 : 0.8;
      const attrs: Array<keyof GeneratedPlayer> = ["speed", "technique", "shooting", "passing", "stamina"];
      const attr = rng.pick(attrs);
      const growth = rng.random() < growthRate * 0.3 ? 1 : 0;
      if (growth > 0) {
        (player as unknown as Record<string, number>)[attr] = Math.min(20, (player[attr] as number) + growth);
        changes[attr] = growth;
      }
    }

    if (Object.keys(changes).length > 0) {
      results.push({ playerIndex: i, retired: false, attributeChanges: changes });
    }
  }

  return results;
}
