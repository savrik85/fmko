import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Povrch areálu se platí jednou. Dřív se účtovalo při každé změně na jinou hodnotu,
 * takže kdo si prohlédl trávu (zdarma) a vrátil se ke koberci, zaplatil ho podruhé —
 * na produkci se to stalo za 50 000 Kč.
 */

const CENIK: Record<string, number> = {
  grass: 0, cinders: 3000, paving: 10000, astro: 25000, tartan: 50000,
};

/** Stav klubu: co má položené a co má zaplacené. */
interface Areal { polozene: string; vlastnene: string[] }

/**
 * Jeden pokus o položení povrchu — táž logika jako `vlastnenePovrchy` a účtování
 * v `game.ts`. Vrací cenu a NOVÝ stav, aby šlo projet celou posloupnost kliknutí.
 */
function poloz(stav: Areal, cil: string): { cena: number; stav: Areal } {
  if (cil === stav.polozene) return { cena: 0, stav };
  // Pojistka: za položený povrch klub zaplatil, i když o tom není záznam
  // (kluby z doby před migrací 0177 mají sloupec prázdný).
  const owned = [...stav.vlastnene];
  if (stav.polozene !== "grass" && !owned.includes(stav.polozene)) owned.push(stav.polozene);

  const cena = owned.includes(cil) ? 0 : (CENIK[cil] ?? 0);
  const nove = owned.includes(cil) ? owned : [...owned, cil].filter((x) => x !== "grass");
  return { cena, stav: { polozene: cil, vlastnene: nove } };
}

describe("povrch areálu se platí jen jednou", () => {
  it("přesně ten případ z produkce: koberec, tráva, zpět koberec", () => {
    let s: Areal = { polozene: "grass", vlastnene: [] };
    let k = poloz(s, "tartan");
    expect(k.cena, "první nákup koberce").toBe(50000);
    s = k.stav;

    k = poloz(s, "grass");
    expect(k.cena, "prohlédnout si trávu").toBe(0);
    s = k.stav;
    expect(s.vlastnene, "koberec musí zůstat zaplacený").toContain("tartan");

    k = poloz(s, "tartan");
    expect(k.cena, "návrat ke koberci — TADY se dřív platilo znovu").toBe(0);
  });

  it("nový povrch se zaplatí, i když už klub jiný vlastní", () => {
    expect(poloz({ polozene: "grass", vlastnene: ["tartan"] }, "paving").cena).toBe(10000);
  });

  it("položený povrch se počítá za zaplacený i bez záznamu ve vlastnictví", () => {
    // Kluby z doby před migrací 0177 mají sloupec prázdný. Za to, co mají položené,
    // ale zaplatily — nesmí se jim to účtovat znovu.
    const s = poloz({ polozene: "astro", vlastnene: [] }, "grass");
    expect(s.cena).toBe(0);
    expect(s.stav.vlastnene).toEqual(["astro"]);
    expect(poloz(s.stav, "astro").cena, "návrat na vlastní astro").toBe(0);
  });

  it("tráva je zdarma vždy", () => {
    for (const odkud of ["cinders", "tartan"]) {
      expect(poloz({ polozene: odkud, vlastnene: [odkud] }, "grass").cena, odkud).toBe(0);
    }
  });
});

describe("migrace 0177 dopočte vlastnictví z účetnictví", () => {
  it("kdo zaplatil a přepnul na trávu, o povrch nepřijde", () => {
    const dir = mkdtempSync(join(tmpdir(), "povrch-"));
    const db = join(dir, "t.sqlite");
    try {
      execFileSync("sqlite3", [db], { input: `
        CREATE TABLE stadiums (team_id TEXT PRIMARY KEY, surround_surface TEXT);
        CREATE TABLE transactions (team_id TEXT, description TEXT, amount INTEGER);
        INSERT INTO stadiums VALUES ('geo','grass');
        INSERT INTO transactions VALUES ('geo','Povrch areálu: Klubový VIP koberec',-50000);
        INSERT INTO stadiums VALUES ('dva','paving');
        INSERT INTO transactions VALUES ('dva','Povrch areálu: Antukový pás',-3000);
        INSERT INTO transactions VALUES ('dva','Povrch areálu: Zámková dlažba',-10000);
        INSERT INTO stadiums VALUES ('nic','grass');
        INSERT INTO stadiums VALUES ('sta','astro');
      ` });

      const migrace = readFileSync(
        new URL("../../migrations/0177_vlastnene_povrchy_arealu.sql", import.meta.url), "utf8");
      execFileSync("sqlite3", [db], { input: migrace });

      const radky = execFileSync("sqlite3", [db], {
        input: "SELECT team_id || '=' || COALESCE(surround_owned,'-') FROM stadiums ORDER BY team_id;",
        encoding: "utf8",
      }).trim().split("\n");

      expect(radky).toEqual([
        'dva=["cinders","paving"]',
        'geo=["tartan"]',   // koupil koberec, má trávu — koberec mu zůstává
        'nic=-',
        'sta=["astro"]',    // položené bez transakce se taky počítá
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
