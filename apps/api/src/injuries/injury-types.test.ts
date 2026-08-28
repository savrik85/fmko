import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { POPISY_ZRANENI } from "../engine/simulation";
import { TYP_PODLE_POPISU, typZraneniZPopisu } from "./injury-types";

/** Povolené typy vytažené z migrace, ne opsané — opis by se rozešel stejně jako mapa. */
function povoleneTypy(): string[] {
  const sql = readFileSync(new URL("../../migrations/0173_zraneni_kotniku.sql", import.meta.url), "utf8");
  const vycet = /type TEXT NOT NULL CHECK\(type IN \(([\s\S]*?)\)\)/.exec(sql);
  if (!vycet) throw new Error("v migraci 0173 nejde najít výčet typů zranění");
  return [...vycet[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("překlad zranění ze zápasu na typ v databázi", () => {
  it("každý popis, který zápas vyrobí, má překlad", () => {
    const bez = POPISY_ZRANENI.filter((p) => !(p in TYP_PODLE_POPISU));
    expect(bez, `popisy bez překladu: ${bez.join(", ")}`).toEqual([]);
  });

  it("žádný klíč v překladu není mrtvý", () => {
    // Šest z osmi klíčů bývalo mrtvých („bolest kolene" proti „koleno" ze zápasu)
    // a právě to tu chybu schovávalo — vypadala jako plná tabulka.
    const mrtve = Object.keys(TYP_PODLE_POPISU).filter((k) => !(POPISY_ZRANENI as readonly string[]).includes(k));
    expect(mrtve, `klíče, které zápas nikdy nepošle: ${mrtve.join(", ")}`).toEqual([]);
  });

  it("každý přeložený typ projde CHECK omezením v databázi", () => {
    const povolene = povoleneTypy();
    const mimo = Object.values(TYP_PODLE_POPISU).filter((t) => !povolene.includes(t));
    expect(mimo, `typy, které by DB odmítla: ${mimo.join(", ")}`).toEqual([]);
  });

  it("neznámý popis spadne na obecné zranění, ne pod stůl", () => {
    // Zápis se nesmí ztratit: v D1 běží ukládání jako dávka, takže jedno odmítnuté
    // zranění shodí i všechna ostatní z téhož zápasu.
    expect(typZraneniZPopisu("něco úplně nového")).toBe("obecne");
    expect(typZraneniZPopisu(undefined)).toBe("obecne");
  });

  it("zranění, kvůli kterým se to řešilo, mají svůj vlastní typ", () => {
    expect(typZraneniZPopisu("podvrtnutý kotník")).toBe("kotnik");
    expect(typZraneniZPopisu("koleno")).toBe("koleno");
    expect(typZraneniZPopisu("křeče")).toBe("sval");
    expect(typZraneniZPopisu("naraženina")).toBe("obecne");
  });
});
