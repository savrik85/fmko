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
import { FACILITY_LABELS, SECURITY_POPIS } from "./stadium-generator";

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

/**
 * Frontend má vlastní mapy popisků a ikon: stránka stadionu je samostatná
 * aplikace a katalog z API si netahá. Chybějící klíč tam není tichý, je
 * ošklivě vidět — hráči se ukáže holé `cage` místo „Klec nad kotlem" a
 * krabice místo ikony. Přesně to se stalo, když přibyla klec.
 *
 * Stránka stadionu vypisuje VŠECHNA zařízení, takže tam musí být každý klíč.
 */
const FE_UPLNE = [
  { soubor: "../web/src/app/(hra)/stadion/page.tsx", mapa: "FACILITY_ICONS", popis: "ikony na stránce stadionu" },
  { soubor: "../web/src/app/(hra)/stadion/page.tsx", mapa: "FACILITY_LABELS", popis: "popisky na stránce stadionu" },
  { soubor: "../web/src/app/(hra)/stadion/page.tsx", mapa: "FACILITY_DESCRIPTIONS", popis: "popisy úrovní na stránce stadionu" },
  { soubor: "../web/src/components/dashboard/widgets/items/fans-widgets.tsx", mapa: "FACILITY_LABELS", popis: "radar stadionu ve widgetu" },
];

/**
 * Náhled stadionu kreslí většinu zařízení jako tvary a jen část jako ikonové
 * čipy, takže úplný být nemusí. Hlídá se opačný směr: co v mapě JE, musí být
 * skutečné zařízení, a každý čip musí mít svůj záznam. Překlep v klíči by
 * jinak tiše zmizel.
 */
const FE_CASTECNE = {
  soubor: "../web/src/components/stadium/stadium-view.tsx",
  mapa: "FACILITY_CONFIG",
};

function zdroj(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Tělo objektové mapy `const NAZEV ... = { ... };` jako text. */
function vytahniMapu(s: string, nazev: string): string {
  const m = s.match(new RegExp(`const ${nazev}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!m) throw new Error(`mapa ${nazev} nenalezena`);
  return m[1];
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

  for (const { soubor, mapa, popis } of FE_UPLNE) {
    it(`${popis} zná všechna zařízení`, () => {
      const blok = vytahniMapu(zdroj(soubor), mapa);
      const maKlic = (k: string) => new RegExp(`(^|\\s)${k}\\s*:`, "m").test(blok);
      expect(klice.filter((k) => !maKlic(k)), `${mapa} v ${soubor} nezná`).toEqual([]);
    });
  }

  it("náhled stadionu nemá v mapě vymyšlené zařízení a každý čip má záznam", () => {
    const s = zdroj(FE_CASTECNE.soubor);
    const blok = vytahniMapu(s, FE_CASTECNE.mapa);
    const vMape = [...blok.matchAll(/^\s*([a-z_]+)\s*:/gm)].map((m) => m[1]);
    expect(vMape.length).toBeGreaterThan(3);
    for (const k of vMape) {
      expect(klice, `${k} v ${FE_CASTECNE.mapa} není známé zařízení`).toContain(k);
    }
    // Čipy se skládají ze seznamů řetězců; každý tam uvedený klíč potřebuje ikonu.
    for (const seznam of s.matchAll(/\[((?:\s*"[a-z_]+",?)+)\]\.filter\(\(k\)/g)) {
      for (const m of seznam[1].matchAll(/"([a-z_]+)"/g)) {
        expect(vMape, `čip ${m[1]} nemá záznam v ${FE_CASTECNE.mapa}`).toContain(m[1]);
      }
    }
  });

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

/**
 * Popis úrovní ochranky existuje na dvou místech: v enginu (`SECURITY_POPIS`)
 * a v mapě popisků na stránce stadionu. Rozejít se nesmí — hráč by na jedné
 * stránce četl „dva hasiči" a na druhé „parta v reflexních vestách" o téže
 * úrovni. Přesně to se stalo, než vznikl jediný zdroj.
 */
describe("popis pořadatelské služby drží na jednom znění", () => {
  it("stránka stadionu má stejné texty jako engine", () => {
    const s = zdroj("../web/src/app/(hra)/stadion/page.tsx");
    const radek = s.match(/^\s*security: \[(.*)\],$/m);
    expect(radek, "řádek se security popisky na stránce stadionu nenalezen").not.toBeNull();
    const texty = [...radek![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(texty).toEqual([...SECURITY_POPIS]);
  });
});
