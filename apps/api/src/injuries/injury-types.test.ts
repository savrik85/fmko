import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POPISY_ZRANENI } from "../engine/simulation";
import { POPISY_ZRANENI_TRENINK } from "../events/between-rounds";
import { TYP_PODLE_POPISU, typZraneniZPopisu, zavaznostZeDnu } from "./injury-types";

/** Všechny popisy, které hra umí vyrobit — ze zápasu i z tréninku. */
const VSECHNY_POPISY: readonly string[] = [...POPISY_ZRANENI, ...POPISY_ZRANENI_TRENINK];

const MIGRACE = new URL("../../migrations/0173_zraneni_kotniku.sql", import.meta.url);

/** Povolené typy vytažené z migrace, ne opsané — opis by se rozešel stejně jako mapa. */
function povoleneTypy(): string[] {
  const sql = readFileSync(MIGRACE, "utf8");
  const vycet = /type TEXT NOT NULL CHECK\(type IN \(([\s\S]*?)\)\)/.exec(sql);
  if (!vycet) throw new Error("v migraci 0173 nejde najít výčet typů zranění");
  return [...vycet[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("překlad zranění na typ v databázi", () => {
  it("každý popis, který hra vyrobí, má překlad", () => {
    const bez = VSECHNY_POPISY.filter((p) => !(p in TYP_PODLE_POPISU));
    expect(bez, `popisy bez překladu: ${bez.join(", ")}`).toEqual([]);
  });

  it("žádný klíč v překladu není mrtvý", () => {
    // Šest z osmi klíčů bývalo mrtvých („bolest kolene" proti „koleno" ze zápasu)
    // a právě to tu chybu schovávalo — tabulka vypadala plná.
    const mrtve = Object.keys(TYP_PODLE_POPISU).filter((k) => !VSECHNY_POPISY.includes(k));
    expect(mrtve, `klíče, které hra nikdy nepošle: ${mrtve.join(", ")}`).toEqual([]);
  });

  it("každý přeložený typ projde CHECK omezením", () => {
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
    expect(typZraneniZPopisu("bolest kolene")).toBe("koleno");
    expect(typZraneniZPopisu("křeče")).toBe("sval");
    expect(typZraneniZPopisu("naražené žebro")).toBe("zebra");
  });

  it("závažnost drží se svého vlastního CHECK omezení", () => {
    const sql = readFileSync(MIGRACE, "utf8");
    const povolene = [...(/severity TEXT NOT NULL CHECK\(severity IN \(([^)]*)\)\)/.exec(sql)?.[1] ?? "")
      .matchAll(/'([^']+)'/g)].map((m) => m[1]);
    for (const dnu of [1, 7, 8, 14, 15, 60]) {
      expect(povolene, `${dnu} dní → ${zavaznostZeDnu(dnu)}`).toContain(zavaznostZeDnu(dnu));
    }
  });
});

describe("zápis zranění doopravdy projde", () => {
  it("tréninkové zranění se uloží se všemi povinnými sloupci", () => {
    // Sloupce jsou NOT NULL a `type` má výčet. Dokud se zapisovaly jen čtyři z nich
    // a typ „training", zápis pokaždé porušil omezení — a `INSERT OR IGNORE` to spolkl,
    // takže se za celou historii hry neuložilo ani jedno tréninkové zranění.
    const dir = mkdtempSync(join(tmpdir(), "zraneni-"));
    const db = join(dir, "t.sqlite");
    try {
      const schema = readFileSync(MIGRACE, "utf8")
        .replace(/CREATE TABLE injuries_nove/, "CREATE TABLE injuries")
        .replace(/REFERENCES \w+\(id\)/g, "")
        .split("INSERT INTO injuries_nove")[0];
      // Schéma jde po stdin: začíná komentářem `--` a jako argument by ho sqlite3
      // považoval za přepínač.
      execFileSync("sqlite3", [db], { input: schema });

      for (const popis of POPISY_ZRANENI_TRENINK) {
        const dnu = 14;
        execFileSync("sqlite3", [db], {
          input: `INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total)
                  VALUES ('${popis}', 'h1', 't1', '${typZraneniZPopisu(popis)}', '${popis}', '${zavaznostZeDnu(dnu)}', ${dnu}, ${dnu});`,
        });
      }

      const ulozeno = execFileSync("sqlite3", [db], { input: "SELECT COUNT(*) FROM injuries;", encoding: "utf8" }).trim();
      expect(Number(ulozeno), "uložená tréninková zranění").toBe(POPISY_ZRANENI_TRENINK.length);

      const typy = execFileSync("sqlite3", [db], { input: "SELECT DISTINCT type FROM injuries ORDER BY type;", encoding: "utf8" })
        .trim().split("\n");
      expect(typy, "tréninková zranění nesmí skončit všechna jako obecná").not.toEqual(["obecne"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
