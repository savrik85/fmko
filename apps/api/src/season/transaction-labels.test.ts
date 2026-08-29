import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Každý typ transakce musí mít český popisek a ikonu ve finančním UI.
 *
 * Když se přidá nový typ a mapa na frontendu se nedoplní, historie transakcí
 * vypíše syrový klíč — přesně takhle se hráči v účetnictví klubu objevilo
 * `raffle_income` mezi Tombolou a Vstupným. V UI nemá být ani slovo anglicky.
 *
 * Test schválně sahá přes hranici balíčku: mapy žijí na frontendu, ale zdroj
 * pravdy (union typů) je tady. Když se soubor přesune, test spadne — a to je
 * správně, protože přesun je právě ta chvíle, kdy se na tohle zapomíná.
 */

const FE_FINANCE = join(__dirname, "../../../web/src/app/dashboard/finances/page.tsx");

function klice(zdroj: string, mapa: string): Set<string> {
  const m = new RegExp(`${mapa}\\s*:\\s*Record<string, string>\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`).exec(zdroj);
  if (!m) throw new Error(`mapa ${mapa} se v FE souboru nenašla`);
  return new Set([...m[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]));
}

/**
 * Typy, které v účetnictví leží z ručních zásahů, ale kód je už negeneruje.
 * Popisek mít musí (hráč je v historii vidí), v unionu být nemají.
 */
const HISTORICKE = new Set(["admin_correction", "bonus", "transfer_correction"]);

function typyTransakci(): Set<string> {
  const api = readFileSync(join(__dirname, "finance-processor.ts"), "utf-8");
  const blok = api.split("export type TransactionType")[1].split(";")[0];
  return new Set([...blok.matchAll(/\|\s*"([a-z_]+)"/g)].map((x) => x[1]));
}

describe("popisky transakcí", () => {
  const typy = typyTransakci();
  const fe = readFileSync(FE_FINANCE, "utf-8");

  it("každý typ má český popisek", () => {
    expect([...typy, ...HISTORICKE].filter((t) => !klice(fe, "TXN_LABELS").has(t))).toEqual([]);
  });

  it("každý typ má ikonu", () => {
    expect([...typy, ...HISTORICKE].filter((t) => !klice(fe, "TXN_ICONS").has(t))).toEqual([]);
  });

  it("mapy neobsahují typy, které už neexistují", () => {
    expect([...klice(fe, "TXN_LABELS")].filter((k) => !typy.has(k) && !HISTORICKE.has(k))).toEqual([]);
  });

  it("popisky jsou česky, ne klíče", () => {
    const podezrele = [...klice(fe, "TXN_LABELS")].filter((k) => {
      const m = new RegExp(`\\b${k}\\s*:\\s*"([^"]+)"`).exec(fe);
      return m && (m[1] === k || /^[a-z_]+$/.test(m[1]));
    });
    expect(podezrele).toEqual([]);
  });
});
