import { describe, it, expect } from "vitest";
import io from "node:fs";

/**
 * Hlídač úplnosti dovedností u hráčů z přestupového trhu.
 *
 * Historie: generátor si zakládal prázdný objekt a přepisoval do něj jen sedm
 * dovedností, takže hráč koupený z trhu měl nulovou kreativitu, standardky,
 * přehled, výdrž, sílu i zkušenost. Do zápasu se počítají jako nula, takže byl
 * reálně slabší, než říkal jeho rating — a ten se počítal jen z těch sedmi,
 * takže vypadal v pořádku. Na produkci takhle vzniklo devět hráčů.
 *
 * Test čte zdrojový kód, protože generátor je hluboko uvnitř funkce se
 * závislostí na databázi a nedá se zavolat samostatně. Je to hrubé, ale chytí
 * přesně tu chybu, která se už jednou stala.
 */
const KANONICKE_DOVEDNOSTI = [
  "speed", "technique", "shooting", "passing", "heading", "defense", "goalkeeping",
  "creativity", "setPieces", "vision", "stamina", "strength", "experience",
] as const;

describe("hráči z přestupového trhu", () => {
  const zdroj = io.readFileSync(new URL("./virtual-teams.ts", import.meta.url), "utf-8");

  // Blok, kde se skládají dovednosti — od založení objektu po zápis do playerData.
  const blok = zdroj.slice(
    zdroj.indexOf("const adjustedSkills"),
    zdroj.indexOf("const playerData"),
  );

  it("generátor vyplní všech třináct dovedností", () => {
    expect(blok.length).toBeGreaterThan(100);
    for (const k of KANONICKE_DOVEDNOSTI) {
      expect(blok, `chybí dovednost „${k}" — hráč z trhu ji bude mít nulovou`)
        .toContain(k);
    }
  });

  it("dovednosti se zapisují do adjustedSkills, ne někam jinam", () => {
    for (const k of ["creativity", "setPieces", "vision", "experience"]) {
      expect(blok, `„${k}" se nepřiřazuje do adjustedSkills`)
        .toMatch(new RegExp(`adjustedSkills\\.${k}\\s*=|"${k}"|'${k}'`));
    }
  });
});
