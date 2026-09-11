/**
 * Každé zařízení musí být ve VŠECH seznamech, které staví objekt `facilities`.
 *
 * Klíč, který v seznamu chybí, se nečte z DB a `calculateFacilityEffects` ho
 * dostane jako nulu — zařízení je koupené, ukazuje se, a přitom nedělá nic.
 * Tichá chyba, kterou nezachytí typechecker ani build; pořadatelská služba by
 * takhle mlčky nefungovala ve financích i v simulaci zápasu.
 *
 * Vzor je `season/transaction-labels.test.ts`, který stejným způsobem hlídá,
 * že každý typ transakce má na frontendu popisek.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FACILITY_LABELS } from "./stadium-generator";

const ROOT = join(__dirname, "..", "..");

/** Soubory, které si skládají `facilities` z jednotlivých sloupců. */
const MISTA = [
  { soubor: "src/season/finance-processor.ts", popis: "zápasové finance" },
  { soubor: "src/multiplayer/match-runner.ts", popis: "simulace zápasu" },
  { soubor: "src/routes/game.ts", popis: "API stadionu" },
  { soubor: "src/fans/resolve-match-incidents.ts", popis: "vyhodnocení výtržností" },
];

/**
 * Kotel v rubrice Zpravodaje čte jen kapacitu, takže tam nemusí být všechno —
 * ale co v seznamu JE, musí být i v SELECTu, jinak to tiše čte nulu.
 */
const ULTRAS = "src/news/ultras-report.ts";

function zdroj(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("klíče zařízení jsou všude, kde se čtou", () => {
  const klice = Object.keys(FACILITY_LABELS);

  it("katalog má aspoň deset zařízení (pojistka proti prázdnému importu)", () => {
    expect(klice.length).toBeGreaterThanOrEqual(10);
  });

  for (const { soubor, popis } of MISTA) {
    it(`${popis} (${soubor}) zná všechna zařízení`, () => {
      const s = zdroj(soubor);
      // Hledá se výskyt klíče jako celého slova — jednou je to prvek pole
      // (`"fence"`), jinde vlastnost objektu (`fence:`) a jinde sloupec v SQL
      // (`, fence,`). Sjednotit ty tvary by znamenalo přepsat čtyři call sites.
      const chybi = klice.filter((k) => !new RegExp(`\\b${k}\\b`).test(s));
      expect(chybi, `chybí v ${soubor}`).toEqual([]);
    });
  }

  it("rubrika kotle má v SELECTu každý klíč, který si vypisuje", () => {
    const s = zdroj(ULTRAS);
    const seznam = s.match(/const FACILITY_KEYS = \[(.*?)\]/s);
    expect(seznam, "FACILITY_KEYS v ultras-report.ts nenalezen").not.toBeNull();
    const pouzite = [...seznam![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(pouzite.length).toBeGreaterThan(0);
    for (const k of pouzite) {
      expect(s, `${k} je v FACILITY_KEYS, ale chybí v SELECTu`).toContain(`s.${k}`);
      expect(klice, `${k} není známé zařízení`).toContain(k);
    }
  });
});
