/**
 * Lóže musí dorazit všude, kde se kapacita počítá jen z tribun.
 *
 * `calculateFacilityEffects({ stands })` bez lóže by klubu s lóží ukázal v náhledu
 * zápasu a v profilu víc míst, než kolik jich v zápase opravdu je. Stejný vzor
 * jako `facility-keys.test.ts`: test čte zdroják, protože jde o tichou chybu.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const zdroj = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("VIP lóže je zapojená", () => {
  for (const soubor of ["routes/matches.ts", "routes/teams.ts"]) {
    it(`${soubor}: každý výpočet kapacity z tribun zná i lóži`, () => {
      const volani = [...zdroj(soubor).matchAll(/\(\{\s*stands:[^}]*\}\)/g)].map((m) => m[0]);
      expect(volani.length).toBeGreaterThan(0);
      expect(volani.filter((v) => !v.includes("vip_box"))).toEqual([]);
    });
  }

  it("finance zápasu strhávají provoz lóže", () => {
    const s = zdroj("season/finance-processor.ts");
    expect(s).toContain("facilityFx.vipBoxMatchCost");
    expect(s).toContain("VIP lóže (raut a obsluha)");
  });
});
