import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";

/**
 * Hook za předčasným `return` = React #310 a bílá obrazovka.
 *
 * Stalo se to na produkci: `SurroundTrack.tsx` měl `return null` pro trávu MEZI
 * `useMemo` voláními, takže se při trávě volaly dva hooky a při dlaždicích tři.
 * Dokud se povrch platil při každé změně, nikdo tam a zpět nepřepínal a chyba spala.
 * Jakmile se přepínání zdarma, stránka stadionu spadla.
 *
 * Projekt nemá ESLint, takže `react-hooks/rules-of-hooks` tuhle třídu chyb nehlídá.
 * Tenhle test je náhrada za něj: hlídá úroveň závorek, aby nehlásil konec jedné
 * komponenty a hooky té následující ve stejném souboru.
 */

const WEB = fileURLToPath(new URL("../../../web/src/", import.meta.url));

const ZACATEK_KOMPONENTY = /^(export )?(default )?function [A-Z]/;
const HOOK = /\buse(Memo|State|Effect|Ref|Callback|LayoutEffect|Reducer|Context|Frame|Loader|Texture)\s*\(/;

interface Nalez { soubor: string; hook: number; ret: number }

/**
 * Hooky volané za předčasným returnem TÉŽE komponenty.
 *
 * Jede podle odsazení, ne podle závorek: kód je formátovaný důsledně, tělo komponenty
 * má dvě mezery. Počítání závorek tuhle chybu minulo, protože `return null` sedí uvnitř
 * `if` bloku, tedy o úroveň hlouběji než tělo.
 *
 *   function X() {          ← začátek na nultém sloupci
 *     const a = useMemo()   ← tělo, dvě mezery
 *     if (…) {
 *       return null         ← předčasný return, čtyři mezery
 *     }
 *     const b = useMemo()   ← TOHLE je chyba: hook v těle za returnem
 *   }
 */
export function najdiHookyZaReturnem(zdroj: string, soubor: string): Nalez[] {
  const radky = zdroj.split("\n");
  const nalezy: Nalez[] = [];
  let vKomponente = false;
  let ret: number | null = null;

  for (let i = 0; i < radky.length; i++) {
    const r = radky[i];
    if (ZACATEK_KOMPONENTY.test(r)) { vKomponente = true; ret = null; continue; }
    if (!vKomponente) continue;
    if (r === "}") { vKomponente = false; ret = null; continue; }   // konec komponenty

    const cisty = r.replace(/\/\/.*$/, "");

    if (ret === null) {
      // `  return …` přímo v těle
      if (/^ {2}return\b/.test(cisty)) ret = i + 1;
      // `  if (…) return …;` na jednom řádku
      else if (/^ {2}if \(.*\) return\b/.test(cisty)) ret = i + 1;
      // `  if (…) {` … `    return` … `  }` — blok přímo v těle.
      // Čtyřmezerový return se NESMÍ brát bez tohohle ověření: uvnitř `useEffect`
      // je na stejném odsazení úklidová funkce `return () => …`, a to předčasný
      // return komponenty není.
      else if (/^ {2}if \(.*\) \{\s*$/.test(cisty)) {
        for (let j = i + 1; j < radky.length && !/^ {2}\}/.test(radky[j]); j++) {
          if (/^ {4}return\b/.test(radky[j])) { ret = j + 1; break; }
        }
      }
    }

    // Hook PŘÍMO v těle komponenty (dvě mezery). Hlouběji jsou vnořené funkce.
    if (ret !== null && /^ {2}\S/.test(cisty) && HOOK.test(cisty)) {
      nalezy.push({ soubor, hook: i + 1, ret });
    }
  }
  return nalezy;
}

describe("žádný hook se nevolá za předčasným returnem", () => {
  it("vzor z produkce se pozná", () => {
    const rozbite = `
function SurroundTrack({ surroundSurface }: Props) {
  const a = useMemo(() => 1, []);
  if (surroundSurface === "grass") {
    return null;
  }
  const b = useMemo(() => 2, []);
  return <group />;
}`;
    expect(najdiHookyZaReturnem(rozbite, "vzor.tsx")).toHaveLength(1);
  });

  it("dvě komponenty v jednom souboru nejsou planý nález", () => {
    const dobre = `
function Prvni() {
  return <div />;
}

function Druha() {
  const a = useMemo(() => 1, []);
  return <div />;
}`;
    expect(najdiHookyZaReturnem(dobre, "dve.tsx")).toEqual([]);
  });

  it("celý frontend je čistý", () => {
    const soubory = globSync("**/*.tsx", { cwd: WEB }) as string[];
    expect(soubory.length, "žádné .tsx nenalezeno — špatná cesta?").toBeGreaterThan(50);
    const nalezy = soubory.flatMap((f) => najdiHookyZaReturnem(readFileSync(WEB + f, "utf8"), f));
    expect(
      nalezy.map((n) => `${n.soubor}:${n.hook} (return na ${n.ret})`),
      `${nalezy.length} hooků za předčasným returnem`,
    ).toEqual([]);
  });
});
