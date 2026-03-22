import type { Rng } from "./rng";
import type { GeneratedPlayer } from "./player";
import type { GeneratedRelationship } from "./relationships";
import type { ManagerBackstory } from "@okresni-masina/shared";

interface ManagerModifiers {
  moraleMods: number[];
  personalityMods: Array<{ discipline?: number; patriotism?: number }>;
  extraRelationships: GeneratedRelationship[];
}

/**
 * Aplikuje efekty trenérova příběhu na nově vygenerovaný kádr.
 * Volat po generateSquad() a před uložením do DB.
 */
export function applyManagerModifiers(
  squad: GeneratedPlayer[],
  backstory: ManagerBackstory,
  rng: Rng,
): ManagerModifiers {
  const moraleMods = new Array(squad.length).fill(0);
  const personalityMods: Array<{ discipline?: number; patriotism?: number }> =
    squad.map(() => ({}));
  const extraRelationships: GeneratedRelationship[] = [];

  switch (backstory) {
    case "byvaly_hrac": {
      // Starší hráči ho znají → vyšší morálka
      for (let i = 0; i < squad.length; i++) {
        moraleMods[i] = squad[i].age >= 30 ? 5 : 1;
      }
      // Extra classmates vazba mezi staršími hráči
      const older = squad
        .map((p, i) => ({ i, age: p.age }))
        .filter((p) => p.age >= 28);
      if (older.length >= 2) {
        const a = older[rng.int(0, older.length - 1)];
        let b = older[rng.int(0, older.length - 1)];
        let tries = 0;
        while (b.i === a.i && tries < 5) {
          b = older[rng.int(0, older.length - 1)];
          tries++;
        }
        if (a.i !== b.i) {
          extraRelationships.push({
            playerAIndex: a.i,
            playerBIndex: b.i,
            type: "classmates",
            strength: rng.int(50, 70),
          });
        }
      }
      break;
    }

    case "mistni_ucitel": {
      // Zná každou rodinu → +3 všichni
      for (let i = 0; i < squad.length; i++) {
        moraleMods[i] = 3;
      }
      // 2 extra vazby s vyšší sílou
      for (let r = 0; r < 2; r++) {
        const a = rng.int(0, squad.length - 1);
        let b = rng.int(0, squad.length - 1);
        let tries = 0;
        while (b === a && tries < 5) {
          b = rng.int(0, squad.length - 1);
          tries++;
        }
        if (a !== b) {
          const types: GeneratedRelationship["type"][] = [
            "classmates",
            "coworkers",
            "in_laws",
          ];
          extraRelationships.push({
            playerAIndex: a,
            playerBIndex: b,
            type: types[rng.int(0, types.length - 1)],
            strength: rng.int(55, 80),
          });
        }
      }
      break;
    }

    case "pristehovalec": {
      // Nikdo ho nezná → -5 morálka, ale +2 disciplína a patriotismus
      for (let i = 0; i < squad.length; i++) {
        moraleMods[i] = -5;
        personalityMods[i] = { discipline: 2, patriotism: 2 };
      }
      break;
    }

    case "syn_trenera": {
      // Mladí nadšení, starší skeptičtí
      for (let i = 0; i < squad.length; i++) {
        if (squad[i].age < 25) moraleMods[i] = 3;
        else if (squad[i].age >= 35) moraleMods[i] = -2;
      }
      // Extra father_son vazba
      const candidates = squad.map((p, i) => ({ i, age: p.age }));
      const young = candidates.filter((p) => p.age < 25);
      const old = candidates.filter((p) => p.age >= 40);
      if (young.length > 0 && old.length > 0) {
        const y = young[rng.int(0, young.length - 1)];
        const o = old[rng.int(0, old.length - 1)];
        extraRelationships.push({
          playerAIndex: o.i,
          playerBIndex: y.i,
          type: "father_son",
          strength: rng.int(65, 85),
        });
      }
      break;
    }

    case "hospodsky": {
      // Oblíbený, extra bonus pro piváky
      for (let i = 0; i < squad.length; i++) {
        moraleMods[i] = squad[i].alcohol > 12 ? 5 : 2;
      }
      // Extra coworkers vazba
      const nonStudents = squad
        .map((p, i) => ({ i, occ: p.occupation }))
        .filter(
          (p) =>
            p.occ !== "Student" &&
            p.occ !== "Nezaměstnaný" &&
            p.occ !== "Důchodce",
        );
      if (nonStudents.length >= 2) {
        const a = nonStudents[rng.int(0, nonStudents.length - 1)];
        let b = nonStudents[rng.int(0, nonStudents.length - 1)];
        let tries = 0;
        while (b.i === a.i && tries < 5) {
          b = nonStudents[rng.int(0, nonStudents.length - 1)];
          tries++;
        }
        if (a.i !== b.i) {
          extraRelationships.push({
            playerAIndex: a.i,
            playerBIndex: b.i,
            type: "coworkers",
            strength: rng.int(40, 65),
          });
        }
      }
      break;
    }
  }

  return { moraleMods, personalityMods, extraRelationships };
}
