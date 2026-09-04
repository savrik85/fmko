/**
 * Každý runner musí předat enginu pokyny z lavičky.
 *
 * Tenhle test je schválně čtení zdrojáku, ne simulace. Chybu, kvůli které vznikl,
 * by žádný test enginu nechytil: `TeamSetup.plan` je NEPOVINNÉ pole, takže když
 * ho runner nepředá, nic nespadne — engine jen tiše přeskočí celý blok pokynů.
 * Přátelácké zápasy tak měsíc ignorovaly každé naplánované střídání, změnu
 * taktiky i tvrdosti, a to bez jediné chyby v logu.
 *
 * Runnery jsou tři a každý si sestavy načítá po svém. Když přibude čtvrtý,
 * dopiš ho sem — jinak zopakuje totéž.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUNNERY = [
  { popis: "ligový", soubor: "multiplayer/match-runner.ts" },
  { popis: "přátelácký", soubor: "multiplayer/friendly-runner.ts" },
  { popis: "pohárový", soubor: "cup/cup.ts" },
];

const zdroj = (soubor: string) => readFileSync(join(__dirname, "..", soubor), "utf-8");

describe.each(RUNNERY)("$popis runner předává pokyny z lavičky", ({ soubor }) => {
  const kod = zdroj(soubor);

  it("načítá match_plan ze sestavy", () => {
    // Sloupec musí být v SELECTu. Bez něj je `match_plan` undefined a plán se ztratí
    // dřív, než se ho engine stihne zeptat.
    const selectyZeSestav = kod.match(/SELECT[^"'`]*FROM lineups/g) ?? [];
    expect(selectyZeSestav.length, "runner nečte tabulku lineups").toBeGreaterThan(0);

    // Stačí, aby match_plan byl aspoň v jednom SELECTu — runnery si vedle plánu
    // tahají i kontrolní dotazy typu „existuje sestava?", kam nepatří.
    expect(
      selectyZeSestav.some((sql) => sql.includes("match_plan")),
      "žádný SELECT ze sestav nebere sloupec match_plan",
    ).toBe(true);
  });

  it("převádí plán na engine ID", () => {
    // UUID z databáze engine nezná — bez toEnginePlan by pravidla ukazovala
    // na hráče, které v simulaci nikdo nenajde.
    expect(kod.includes("toEnginePlan"), "chybí volání toEnginePlan").toBe(true);
  });

  it("předá plán oběma týmům do TeamSetup", () => {
    // Tady byla ta díra: plán se načetl, ale do TeamSetup se nedostal.
    const predani = kod.match(/\bplan:\s*\w+/g) ?? [];
    expect(predani.length, `plan: se předává ${predani.length}× místo dvakrát`).toBe(2);
  });
});
