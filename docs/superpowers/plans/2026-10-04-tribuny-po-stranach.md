# Tribuny po stranách Implementation Plan (část 1 ze 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Z jedné úrovně `stands` (0–3) udělat čtyři samostatně stavěné a vylepšované tribuny (hlavní, protější, dvě za brankami) se zachovanou celkovou kapacitou a převodem stávajících klubů.

**Architecture:** Čtyři nové sloupce `stand_*` v `stadiums` jsou jediný zdroj pravdy. Starý sloupec `stands` zůstává jako odvozená hodnota (maximum čtyř stran, drží ho trigger v DB), takže všechno, co `stands` jen čte jako podmínku (střecha, VIP lóže, sektory, 3D scéna), funguje beze změny. Kapacitu počítá nová čistá funkce nad úrovněmi stran. Každá strana je pro stávající generickou stavbu, poškození a opravu samostatné „zařízení".

**Tech Stack:** Cloudflare D1 (SQLite), Hono, TypeScript, vitest, Next.js 15.

**Spec:** `docs/superpowers/specs/2026-10-04-tribuny-pristavby-design.md`

**Rozsah této části:** kroky 1 a 2 ze spec (model, převod, kapacita, nabídka a stavba po stranách, UI karty). **Mimo rozsah (další plány):** 3D tribun po stranách (část 2), přístavby a rohy (část 3), náhled před stavbou (část 3). Dokud nebude část 2, 3D scéna kreslí tribuny podle `stands` (nejvyšší strana), tedy beze změny proti dnešku.

## Global Constraints

- Identifikátory v kódu anglicky, texty pro hráče česky (`feedback_kod_anglicky`).
- V textech pro hráče žádná dlouhá pomlčka (—) a žádná angličtina v UI.
- Žádný prázdný catch; server loguje `logger.warn({ module: "xyz" }, "popis", e)`.
- Na prod žádný zápis bez výslovného souhlasu; migrace na prod jen po záloze. Práce na větvi `testing`, ne na `main`.
- Střecha (`roof`), VIP lóže (`vip_box`) a sektor kotle (`ultras_stand`) se nemění.
- Celková kapacita při převodu: každý klub musí mít po převodu přesně stejnou kapacitu tribun jako před ním (L1 = 90, L2 = 290, L3 = 500).
- Wrangler se spouští holý (bez `cd`/roury), jinak ho blokuje klasifikátor. D1 příkazy: vnější `'`, vnitřní `"`.

## Review Focus

- Klub s `stands = 0`: po převodu všechny čtyři strany 0, kapacita beze změny, lóže a střecha dál zamčené (testuje Task 3).
- Klub, který má rozbitou tribunu (otevřený záznam v `stadium_damage` s `facility = 'stands'`): po migraci se oprava musí dát provést (Task 2 přesune záznam na `stand_main`).
- Nově založený klub s `stands > 0` (generátor dává 1 nebo 2): strany se musí naplnit z `stands` a kapacita sedět (trigger při INSERT, Task 2).
- Stavba jedné strany dvakrát rychle za sebou: druhý požadavek musí selhat bez strhnutí peněz (stávající atomický zámek, ověří se curl v Task 6).
- Obecní spolufinancování `stands`: musí zvednout nejnižší stranu, ne jen odvozený sloupec (Task 4).

---

## File Structure

- Create: `apps/api/src/stadium/stands-model.ts`: čistá logika (strany, kapacita po stranách, ceny, převod z úrovně). Nezná DB.
- Create: `apps/api/src/stadium/stands-model.test.ts`
- Create: `apps/api/migrations/0239_tribuny_po_stranach.sql` (číslo ověřit v Task 2)
- Modify: `apps/api/src/stadium/stadium-generator.ts`: katalog zařízení, ceny, efekty, nabídka upgradů, `calculateFacilityEffects`.
- Modify: `apps/api/src/stadium/stadium-damage.ts`: `ROZBITNE`.
- Modify: čtečky `facilities`: `routes/game.ts`, `multiplayer/match-runner.ts`, `season/finance-processor.ts`, `fans/resolve-match-incidents.ts`, `news/ultras-report.ts`, `routes/teams.ts`, `routes/matches.ts`, `routes/villages.ts`.
- Modify: `apps/web/src/app/(hra)/stadion/page.tsx`, `apps/web/src/components/dashboard/widgets/items/fans-widgets.tsx`, `apps/web/src/components/stadium/stadium-view.tsx` (jen pokud test `facility-keys.test.ts` vyžaduje).

---

### Task 0: Příprava větve a ověření čísla migrace

- [ ] **Step 1: Aktualizovat refy a přepnout se na testing bez ztráty rozdělaných změn**

Strom je špinavý (`.claude/*`, `.serena/project.yml`, `docs/...`). `git checkout` s nezastaveným stromem nic nesmaže, ale NIKDY `reset --hard`.

```bash
git fetch origin
git checkout testing
git status --short
```
Expected: větev `testing`, stejné modifikované soubory jako předtím. Pokud checkout selže kvůli konfliktu, STOP a zeptat se uživatele.

- [ ] **Step 2: Zjistit nejvyšší číslo migrace na origin**

```bash
git ls-tree --name-only origin/main apps/api/migrations/ | tail -2
git ls-tree --name-only origin/testing apps/api/migrations/ | tail -2
```
Expected: nejvyšší je zatím `0238_scout_positions.sql`. Pokud je vyšší, v celém plánu nahradit `0239` číslem o jedna vyšším než nejvyšší nalezené.

- [ ] **Step 3: Zjistit, zda testing obsahuje aktuální stav `origin/main`**

```bash
git rev-list --count testing..origin/main
```
Pokud je výsledek > 0, zeptat se uživatele, zda `testing` aktualizovat (merge `origin/main` do `testing`), než se začne. Do `main` se nepushuje.

---

### Task 1: Čistý model tribun

**Files:**
- Create: `apps/api/src/stadium/stands-model.ts`
- Test: `apps/api/src/stadium/stands-model.test.ts`

**Interfaces:**
- Produces:
  - `STAND_SIDES: readonly ["stand_main","stand_opposite","stand_goal_west","stand_goal_east"]`
  - `type StandSide`
  - `STAND_SIDE_LABELS: Record<StandSide, string>`
  - `STAND_SIDE_CAPACITY: Record<StandSide, readonly number[]>` (index = úroveň 0–3)
  - `type StandLevels = Record<StandSide, number>`
  - `hasStandSides(f: Record<string, unknown>): boolean`
  - `readStandLevels(f: Record<string, unknown>): StandLevels` (ořezává na 0–3, nečíselné → 0)
  - `legacyStandsToSides(level: number): StandLevels`
  - `standsCapacity(levels: StandLevels): number`
  - `standsMaxLevel(levels: StandLevels): number`
  - `standSideGain(side: StandSide, from: number, to: number): number`
  - `standSideCosts(side: StandSide, legacyCosts: readonly number[]): number[]`

- [ ] **Step 1: Napsat selhávající test**

```ts
// apps/api/src/stadium/stands-model.test.ts
import { describe, it, expect } from "vitest";
import {
  STAND_SIDES, STAND_SIDE_CAPACITY, hasStandSides, readStandLevels,
  legacyStandsToSides, standsCapacity, standsMaxLevel, standSideGain, standSideCosts,
} from "./stands-model";

const LEGACY_CAP = [0, 90, 290, 500];
const LEGACY_COST = [0, 55000, 170000, 450000];

describe("kapacita tribun po stranách", () => {
  for (const level of [0, 1, 2, 3]) {
    it(`čtyři strany na L${level} dají přesně dnešní kapacitu`, () => {
      expect(standsCapacity(legacyStandsToSides(level))).toBe(LEGACY_CAP[level]);
    });
  }

  it("smíšené úrovně se sčítají po stranách", () => {
    const l = { ...legacyStandsToSides(0), stand_main: 3, stand_goal_east: 1 };
    expect(standsCapacity(l)).toBe(STAND_SIDE_CAPACITY.stand_main[3] + STAND_SIDE_CAPACITY.stand_goal_east[1]);
    expect(standsMaxLevel(l)).toBe(3);
  });

  it("úroveň mimo 0–3 se ořízne a nečíslo je nula", () => {
    const l = readStandLevels({ stand_main: 9, stand_opposite: -2, stand_goal_west: "x", stand_goal_east: 2.4 });
    expect(l).toEqual({ stand_main: 3, stand_opposite: 0, stand_goal_west: 0, stand_goal_east: 2 });
  });

  it("hasStandSides pozná, že volající sloupce stran nepředal", () => {
    expect(hasStandSides({ stands: 2 })).toBe(false);
    expect(hasStandSides({ stand_main: 0 })).toBe(true);
  });
});

describe("ceny a přírůstky po stranách", () => {
  it("součet cen čtyř stran za jednu úroveň se od staré ceny liší nejvýš o zaokrouhlení", () => {
    for (const next of [1, 2, 3]) {
      const sum = STAND_SIDES.reduce((s, side) => s + standSideCosts(side, LEGACY_COST)[next], 0);
      expect(Math.abs(sum - LEGACY_COST[next])).toBeLessThanOrEqual(400);
    }
  });

  it("přírůstek mezi úrovněmi sedí na tabulku", () => {
    expect(standSideGain("stand_main", 0, 2)).toBe(STAND_SIDE_CAPACITY.stand_main[2]);
    expect(standSideGain("stand_main", 1, 3)).toBe(STAND_SIDE_CAPACITY.stand_main[3] - STAND_SIDE_CAPACITY.stand_main[1]);
  });

  it("cena nulté úrovně je nula a ceny rostou", () => {
    for (const side of STAND_SIDES) {
      const c = standSideCosts(side, LEGACY_COST);
      expect(c[0]).toBe(0);
      expect(c[1]).toBeGreaterThan(0);
      expect(c[3]).toBeGreaterThan(c[2]);
    }
  });
});
```

- [ ] **Step 2: Spustit test, ověřit selhání**

Run (z kořene repa): `npm run test --workspace=apps/api -- stands-model`
Expected: FAIL, modul `./stands-model` neexistuje.

- [ ] **Step 3: Implementace**

```ts
// apps/api/src/stadium/stands-model.ts
/**
 * Tribuny po stranách.
 *
 * Dřív byly tribuny jedno číslo `stadiums.stands` (0–3). Teď má každá ze čtyř
 * stran vlastní úroveň, stavbu i cenu. Tabulka kapacit je sestavená tak, aby
 * čtyři strany na stejné úrovni daly přesně dnešních +90 / +290 / +500 míst,
 * takže převod stávajících klubů nikomu nepřidá ani neubere místa.
 *
 * Tenhle soubor nezná databázi. Sloupec `stands` v DB zůstává jako odvozené
 * maximum (drží ho trigger z migrace 0239), aby ho mohlo dál číst všechno,
 * co se ptá jen „jsou tribuny postavené".
 */

export const STAND_SIDES = [
  "stand_main", "stand_opposite", "stand_goal_west", "stand_goal_east",
] as const;
export type StandSide = (typeof STAND_SIDES)[number];
export type StandLevels = Record<StandSide, number>;

export const STAND_SIDE_LABELS: Record<StandSide, string> = {
  stand_main: "Hlavní tribuna",
  stand_opposite: "Protější tribuna",
  stand_goal_west: "Tribuna za levou brankou",
  stand_goal_east: "Tribuna za pravou brankou",
};

/**
 * Kapacita strany podle úrovně (index 0–3).
 * Součty po úrovních: 0, 30+20+20+20 = 90, 100+70+60+60 = 290, 170+110+110+110 = 500.
 */
export const STAND_SIDE_CAPACITY: Record<StandSide, readonly number[]> = {
  stand_main: [0, 30, 100, 170],
  stand_opposite: [0, 20, 70, 110],
  stand_goal_west: [0, 20, 60, 110],
  stand_goal_east: [0, 20, 60, 110],
};

function clampLevel(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
  return Math.max(0, Math.min(3, n));
}

/** Předal volající sloupce stran? Starší volání posílají jen `stands`. */
export function hasStandSides(f: Record<string, unknown>): boolean {
  return STAND_SIDES.some((s) => s in f);
}

export function readStandLevels(f: Record<string, unknown>): StandLevels {
  return {
    stand_main: clampLevel(f.stand_main),
    stand_opposite: clampLevel(f.stand_opposite),
    stand_goal_west: clampLevel(f.stand_goal_west),
    stand_goal_east: clampLevel(f.stand_goal_east),
  };
}

/** Starý model: jedna úroveň platí pro všechny čtyři strany. */
export function legacyStandsToSides(level: number): StandLevels {
  const l = clampLevel(level);
  return { stand_main: l, stand_opposite: l, stand_goal_west: l, stand_goal_east: l };
}

export function standsCapacity(levels: StandLevels): number {
  return STAND_SIDES.reduce((sum, s) => sum + (STAND_SIDE_CAPACITY[s][clampLevel(levels[s])] ?? 0), 0);
}

export function standsMaxLevel(levels: StandLevels): number {
  return Math.max(...STAND_SIDES.map((s) => clampLevel(levels[s])));
}

/** O kolik míst strana přibude přechodem mezi úrovněmi. */
export function standSideGain(side: StandSide, from: number, to: number): number {
  const cap = STAND_SIDE_CAPACITY[side];
  return (cap[clampLevel(to)] ?? 0) - (cap[clampLevel(from)] ?? 0);
}

/**
 * Cena stavby strany na úroveň 1–3.
 *
 * Staré ceny tribun (`legacyCosts`) se rozdělí mezi strany podle toho, kolik
 * míst která strana v daném kroku přidá, takže všechny čtyři dohromady stojí
 * zhruba totéž co dřív jedna úroveň. Zaokrouhleno na stovky.
 */
export function standSideCosts(side: StandSide, legacyCosts: readonly number[]): number[] {
  const totalAt = (l: number) => STAND_SIDES.reduce((s, x) => s + STAND_SIDE_CAPACITY[x][l], 0);
  const out = [0];
  for (let l = 1; l <= 3; l++) {
    const share = (STAND_SIDE_CAPACITY[side][l] - STAND_SIDE_CAPACITY[side][l - 1]) / (totalAt(l) - totalAt(l - 1));
    out.push(Math.round(((legacyCosts[l] ?? 0) * share) / 100) * 100);
  }
  return out;
}
```

- [ ] **Step 4: Spustit test, ověřit průchod**

Run: `npm run test --workspace=apps/api -- stands-model`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/stadium/stands-model.ts apps/api/src/stadium/stands-model.test.ts
git commit -m "feat(stadion): model tribun po stranach, kapacita sedi na dnesni urovne"
```

---

### Task 2: Migrace a převod dat

**Files:**
- Create: `apps/api/migrations/0239_tribuny_po_stranach.sql`

**Interfaces:**
- Produces: sloupce `stadiums.stand_main`, `stand_opposite`, `stand_goal_west`, `stand_goal_east` (INTEGER NOT NULL DEFAULT 0, hodnoty 0–3); triggery udržující `stands = MAX(strany)` a plnící strany z `stands` při INSERT nového řádku.

- [ ] **Step 1: Napsat migraci**

```sql
-- Tribuny po stranách. Každá ze čtyř stran má vlastní úroveň 0–3.
-- Sloupec `stands` zůstává jako odvozené maximum (čtou ho podmínky střechy,
-- lóže, sektorů a 3D scéna), proto ho drží trigger.
ALTER TABLE stadiums ADD COLUMN stand_main INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stadiums ADD COLUMN stand_opposite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stadiums ADD COLUMN stand_goal_west INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stadiums ADD COLUMN stand_goal_east INTEGER NOT NULL DEFAULT 0;

-- Převod: dnešní úroveň platí pro všechny čtyři strany (L2 = čtyři tribuny L2).
-- Kapacita se nemění, protože tabulka stran je sestavená na stejný součet.
UPDATE stadiums
SET stand_main = COALESCE(stands, 0),
    stand_opposite = COALESCE(stands, 0),
    stand_goal_west = COALESCE(stands, 0),
    stand_goal_east = COALESCE(stands, 0);

-- Nezaplacená oprava rozbité tribuny: sloupec `stands` už neexistuje jako zařízení.
UPDATE stadium_damage SET facility = 'stand_main'
WHERE facility = 'stands' AND repaired_at IS NULL;

-- `stands` = nejvyšší ze čtyř stran. UPDATE OF na strany se `stands` netýká,
-- takže se trigger sám nespouští dokola.
CREATE TRIGGER stadiums_stands_derived
AFTER UPDATE OF stand_main, stand_opposite, stand_goal_west, stand_goal_east ON stadiums
BEGIN
  UPDATE stadiums
  SET stands = MAX(stand_main, stand_opposite, stand_goal_west, stand_goal_east)
  WHERE id = NEW.id;
END;

-- Nový klub se zakládá s `stands` z generátoru (0, 1 nebo 2). Strany se
-- naplní z něj, jinak by nový klub měl kapacitu bez tribun.
CREATE TRIGGER stadiums_stands_fill_sides
AFTER INSERT ON stadiums
WHEN NEW.stands > 0 AND NEW.stand_main = 0 AND NEW.stand_opposite = 0
  AND NEW.stand_goal_west = 0 AND NEW.stand_goal_east = 0
BEGIN
  UPDATE stadiums
  SET stand_main = NEW.stands, stand_opposite = NEW.stands,
      stand_goal_west = NEW.stands, stand_goal_east = NEW.stands
  WHERE id = NEW.id;
END;
```

- [ ] **Step 2: Ověřit, že tabulka `stadiums` má sloupec `id`**

Run: `grep -rn "CREATE TABLE.*stadiums" apps/api/migrations packages/db/src | head -3`
Expected: definice s `id TEXT PRIMARY KEY`. Pokud `id` chybí, v triggerech nahradit `WHERE id = NEW.id` za `WHERE team_id = NEW.team_id`.

- [ ] **Step 3: Aplikovat lokálně**

Run: `npm run db:migrate:local`
Expected: migrace 0239 aplikovaná. Pokud selže na „already exists", spustit ručně: `npx wrangler d1 execute okresni-masina-db --local --file apps/api/migrations/0239_tribuny_po_stranach.sql`.

- [ ] **Step 4: Ověřit převod a oba triggery na lokální DB**

```bash
npx wrangler d1 execute okresni-masina-db --local --json --command 'SELECT stands, stand_main, stand_opposite, stand_goal_west, stand_goal_east, COUNT(*) AS n FROM stadiums GROUP BY stands, stand_main, stand_opposite, stand_goal_west, stand_goal_east'
```
Expected: v každém řádku se `stands` rovná všem čtyřem stranám.

```bash
npx wrangler d1 execute okresni-masina-db --local --command 'UPDATE stadiums SET stand_main = 3 WHERE team_id = (SELECT team_id FROM stadiums LIMIT 1)'
npx wrangler d1 execute okresni-masina-db --local --json --command 'SELECT stands, stand_main FROM stadiums WHERE stand_main = 3 LIMIT 1'
```
Expected: `stands = 3`. Poté vrátit hodnotu zpět na původní (`stand_main = stands` tohoto týmu před testem, zjistit předem).

- [ ] **Step 5: Commit**

```bash
git add apps/api/migrations/0239_tribuny_po_stranach.sql
git commit -m "feat(stadion): migrace 0239, ctyri tribuny po strane a trigger na stands"
```

---

### Task 3: Katalog, ceny, nabídka upgradů a kapacita

**Files:**
- Modify: `apps/api/src/stadium/stadium-generator.ts` (`FACILITY_LABELS` kolem ř. 95–115, `UPGRADE_COSTS` ř. 118–134, `UPGRADE_EFFECTS` ř. ~228–240, `popisPrirustku` ř. ~265, `getUpgradeOptions` ř. ~365, `calculateFacilityEffects` ř. ~495)
- Test: `apps/api/src/stadium/stadium-generator.test.ts` (přidat bloky)

**Interfaces:**
- Consumes: Task 1 (`STAND_SIDES`, `STAND_SIDE_LABELS`, `standSideCosts`, `standSideGain`, `hasStandSides`, `readStandLevels`, `legacyStandsToSides`, `standsCapacity`, `standsMaxLevel`).
- Produces: v `FACILITY_LABELS` a `UPGRADE_COSTS` klíče čtyř stran; `getUpgradeOptions` nabízí strany a nenabízí `stands`; `calculateFacilityEffects` počítá `capacityBonus` ze stran.

- [ ] **Step 1: Napsat selhávající testy** (přidat na konec `stadium-generator.test.ts`, import doplnit podle stávajícího stylu souboru)

```ts
import { calculateFacilityEffects, getUpgradeOptions, FACILITY_LABELS, UPGRADE_COSTS } from "./stadium-generator";
import { STAND_SIDES, STAND_SIDE_CAPACITY } from "./stands-model";

describe("tribuny po stranách v generátoru", () => {
  it("každá strana je zařízení s cenami", () => {
    for (const s of STAND_SIDES) {
      expect(FACILITY_LABELS[s]).toBeTruthy();
      expect(UPGRADE_COSTS[s]).toHaveLength(4);
    }
  });

  it("kapacita ze stran: čtyři strany L2 dají +290", () => {
    const fx = calculateFacilityEffects({
      stand_main: 2, stand_opposite: 2, stand_goal_west: 2, stand_goal_east: 2, stands: 2,
    });
    expect(fx.capacityBonus).toBe(290);
  });

  it("starý tvar (jen stands) funguje dál", () => {
    expect(calculateFacilityEffects({ stands: 3 }).capacityBonus).toBe(500);
  });

  it("jedna postavená strana odemkne lóži a dá kapacitu jen té straně", () => {
    const fx = calculateFacilityEffects({
      stand_main: 3, stand_opposite: 0, stand_goal_west: 0, stand_goal_east: 0, vip_box: 1,
    });
    expect(fx.capacityBonus).toBe(STAND_SIDE_CAPACITY.stand_main[3] - fx.vipBoxCapacityLoss);
    expect(fx.vipBoxEffectiveLevel).toBe(1);
  });

  it("bez jediné tribuny lóže nefunguje", () => {
    const fx = calculateFacilityEffects({
      stand_main: 0, stand_opposite: 0, stand_goal_west: 0, stand_goal_east: 0, vip_box: 2,
    });
    expect(fx.vipBoxEffectiveLevel).toBe(0);
  });

  it("nabídka upgradů obsahuje strany a ne odvozené `stands`", () => {
    const o = getUpgradeOptions({ stand_main: 2, stand_opposite: 2, stand_goal_west: 2, stand_goal_east: 2, stands: 2 }, 100, 100, 5, true);
    const keys = o.map((x) => x.facility);
    expect(keys).not.toContain("stands");
    for (const s of STAND_SIDES) expect(keys).toContain(s);
    const main = o.find((x) => x.facility === "stand_main")!;
    expect(main.nextLevel).toBe(3);
    expect(main.effect).toContain("+70 míst");
  });

  it("střecha se odemkne, když stojí aspoň jedna strana", () => {
    const o = getUpgradeOptions({ stand_goal_east: 1, stands: 1, roof: 0 }, 100, 100, 5, true);
    expect(o.find((x) => x.facility === "roof")!.locked).toBe(false);
  });
});
```

- [ ] **Step 2: Spustit, ověřit selhání**

Run: `npm run test --workspace=apps/api -- stadium-generator`
Expected: FAIL (chybí klíče stran).

- [ ] **Step 3: Implementace v `stadium-generator.ts`**

a) Import na začátku souboru (za `import type { Rng }`):

```ts
import {
  STAND_SIDES, STAND_SIDE_LABELS, standSideCosts, standSideGain,
  hasStandSides, readStandLevels, legacyStandsToSides, standsCapacity, standsMaxLevel,
  type StandSide,
} from "./stands-model";
```

b) Do `FACILITY_LABELS` hned za řádek `stands: "Tribuny",` přidat strany:

```ts
  stands: "Tribuny",
  ...STAND_SIDE_LABELS,
```
(`stands` zůstává v katalogu jako odvozené maximum, kvůli historickým textům a testu klíčů.)

c) Pod objekt `UPGRADE_COSTS` (za jeho uzavírací `};`) doplnit:

```ts
// Ceny jednotlivých stran: staré ceny tribun rozdělené podle přírůstku míst.
for (const side of STAND_SIDES) UPGRADE_COSTS[side] = standSideCosts(side, UPGRADE_COSTS.stands);
```

d) Do `UPGRADE_EFFECTS` přidat popisy stran (za řádek `stands: [...]`):

```ts
  stand_main: ["", "Pár řad lavic u hlavní strany", "Krytá hlavní tribuna se sedačkami", "Hlavní tribuna přes celou délku hřiště"],
  stand_opposite: ["", "Lavičky na protější straně", "Menší tribunka naproti hlavní", "Plná tribuna na protější straně"],
  stand_goal_west: ["", "Stání s ohrádkou za levou brankou", "Tribunka za levou brankou", "Velká tribuna za levou brankou"],
  stand_goal_east: ["", "Stání s ohrádkou za pravou brankou", "Tribunka za pravou brankou", "Velká tribuna za pravou brankou"],
```

e) V `popisPrirustku` přidat na začátek `switch` větev:

```ts
    case "stand_main":
    case "stand_opposite":
    case "stand_goal_west":
    case "stand_goal_east":
      return `+${standSideGain(key, from, to)} míst`;
```

f) V `getUpgradeOptions` na začátek těla smyčky `for (const [key, label] of ...)` přidat přeskočení odvozeného klíče:

```ts
    if (key === "stands") continue; // odvozené maximum čtyř stran, staví se po stranách
```

a podmínky střechy a lóže změnit tak, aby braly jakoukoli postavenou stranu:

```ts
  const anyStand = hasStandSides(stadium)
    ? standsMaxLevel(readStandLevels(stadium)) >= 1
    : (stadium.stands ?? 0) >= 1;
```
(deklarovat před `for`) a nahradit v obou místech `(stadium.stands ?? 0) < 1` za `!anyStand`.

g) V `calculateFacilityEffects` nahradit řádky `const st = ...` a `capacityBonus`:

```ts
  const sides = hasStandSides(facilities)
    ? readStandLevels(facilities)
    : legacyStandsToSides(facilities.stands ?? 0);
  const st = standsMaxLevel(sides);
```
a
```ts
    capacityBonus: standsCapacity(sides) - SKALY.vip_box.seatsLost[vb],
```
(`STANDS_CAPACITY` a `standsCapacityGain` zůstávají exportované pro zpětnou kompatibilitu a staré testy.)

- [ ] **Step 4: Spustit testy generátoru**

Run: `npm run test --workspace=apps/api -- stadium-generator vip-box`
Expected: PASS. Pokud selže starý test na `getUpgradeOptions` očekávající `stands` v nabídce, upravit ho na strany (je to záměrná změna chování).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/stadium/stadium-generator.ts apps/api/src/stadium/stadium-generator.test.ts
git commit -m "feat(stadion): nabidka a kapacita tribun po stranach"
```

---

### Task 4: Napojení čtecích míst, poškození a obce

**Files:**
- Modify: `apps/api/src/stadium/stadium-damage.ts:24-26`
- Modify: `apps/api/src/routes/game.ts` (dva literály `facilities` kolem ř. 1565 a 1915)
- Modify: `apps/api/src/multiplayer/match-runner.ts:343`
- Modify: `apps/api/src/season/finance-processor.ts:429`
- Modify: `apps/api/src/fans/resolve-match-incidents.ts:444-445`
- Modify: `apps/api/src/news/ultras-report.ts:41,166`
- Modify: `apps/api/src/routes/teams.ts` (ř. ~953, ~1469, ~3204), `apps/api/src/routes/matches.ts` (~132)
- Modify: `apps/api/src/routes/villages.ts` (~1146–1180)
- Test: `apps/api/src/stadium/facility-keys.test.ts` (existující, jen spustit)

**Interfaces:**
- Consumes: Task 1 (`STAND_SIDES`), Task 3 (`calculateFacilityEffects` čte strany).

- [ ] **Step 1: Spustit hlídací test, ať ukáže, co chybí**

Run: `npm run test --workspace=apps/api -- facility-keys`
Expected: FAIL, chybí `stand_main`, `stand_opposite`, `stand_goal_west`, `stand_goal_east` v `finance-processor.ts`, `match-runner.ts`, `game.ts`, `resolve-match-incidents.ts`, na FE stránce stadionu a ve widgetu.

- [ ] **Step 2: `stadium-damage.ts`: poškodit jde strana, ne odvozené maximum**

```ts
export const ROZBITNE = [
  "toilets", "stand_main", "stand_opposite", "stand_goal_west", "stand_goal_east",
  "fence", "roof", "ultras_stand", "refreshments", "entrance_gate",
] as const;
```

- [ ] **Step 3: Seznamy sloupců a literály `facilities`**

V `match-runner.ts:343` a `finance-processor.ts:429` do pole klíčů za `"stands"` přidat `"stand_main", "stand_opposite", "stand_goal_west", "stand_goal_east"`.

V `resolve-match-incidents.ts:444` SELECT rozšířit: `... lighting, stands, stand_main, stand_opposite, stand_goal_west, stand_goal_east, parking, fence, ...`.

V `game.ts` do obou literálů `facilities` za `stands: ...` přidat:

```ts
    stand_main: stadium.stand_main as number ?? 0,
    stand_opposite: stadium.stand_opposite as number ?? 0,
    stand_goal_west: stadium.stand_goal_west as number ?? 0,
    stand_goal_east: stadium.stand_goal_east as number ?? 0,
```

V `ultras-report.ts` do `FACILITY_KEYS` přidat čtyři klíče a do SELECTu (ř. ~166) `s.stand_main, s.stand_opposite, s.stand_goal_west, s.stand_goal_east`.

- [ ] **Step 4: `teams.ts` a `matches.ts`: dotazy na kapacitu**

Na všech čtyřech místech, kde se čte `capacity, stands, vip_box` a volá `calcFx*({ stands, vip_box })`, přidat sloupce a předat je. Příklad pro `teams.ts:953`:

```ts
"SELECT capacity, stands, stand_main, stand_opposite, stand_goal_west, stand_goal_east, vip_box, pitch_condition, pitch_type FROM stadiums WHERE team_id = ? LIMIT 1"
```
a typ `first<{ capacity: number; stands: number | null; stand_main: number | null; stand_opposite: number | null; stand_goal_west: number | null; stand_goal_east: number | null; vip_box: number | null; ... }>`, volání:

```ts
calcFxTeam({
  stands: stadium.stands ?? 0, stand_main: stadium.stand_main ?? 0, stand_opposite: stadium.stand_opposite ?? 0,
  stand_goal_west: stadium.stand_goal_west ?? 0, stand_goal_east: stadium.stand_goal_east ?? 0,
  vip_box: stadium.vip_box ?? 0,
}).capacityBonus
```
Stejný vzor použít na `teams.ts` ř. ~1469 a ~3204 (tam je `stadiumRow?.stands`) a `matches.ts` ř. ~132. Dohledat případné další: `grep -rn "stands: .*vip_box" apps/api/src | grep -v test`.

- [ ] **Step 5: Obecní spolufinancování `stands` zvedne nejnižší stranu**

V `routes/villages.ts` nahradit generický UPDATE pro `stands`. Před blok `if (inv.target_facility && stadiumFacilities.includes(...))` přidat:

```ts
  if (inv.target_facility === "stands") {
    const { STAND_SIDES } = await import("../stadium/stands-model");
    const row = await c.env.DB.prepare(
      `SELECT ${STAND_SIDES.join(", ")} FROM stadiums WHERE team_id = ?`,
    ).bind(teamRowAuth.id).first<Record<string, number>>().catch((e) => {
      logger.warn({ module: "villages" }, "read stands for investment", e);
      return null;
    });
    // Nejnižší strana pod L3 (při shodě první v pořadí hlavní, protější, branky).
    const target = row ? STAND_SIDES.filter((s) => (row[s] ?? 0) < 3).sort((a, b) => (row![a] ?? 0) - (row![b] ?? 0))[0] : undefined;
    if (target) {
      await c.env.DB.prepare(
        `UPDATE stadiums SET ${target} = MIN(3, COALESCE(${target}, 0) + 1) WHERE team_id = ?`,
      ).bind(teamRowAuth.id).run().catch((e) => logger.warn({ module: "villages" }, `upgrade ${target}`, e));
    }
  } else
```
a ze seznamu `stadiumFacilities` odstranit `"stands"` (zůstane `["showers","parking","changing_rooms","refreshments","fence"]`). `Array.prototype.sort` je stabilní, takže při shodě rozhoduje pořadí v `STAND_SIDES`.

- [ ] **Step 6: Spustit testy a typecheck**

Run: `npm run test --workspace=apps/api` a `npm run typecheck`
Expected: `facility-keys` zůstane červený jen kvůli FE (to řeší Task 5), ostatní PASS. Pre-existing selhání reportovat, neopravovat.

- [ ] **Step 7: Commit**

```bash
git add -A apps/api/src
git commit -m "feat(stadion): tribuny po stranach ve ctenich, poskozeni a obecni investici"
```

---

### Task 5: Frontend, karty stran na stránce stadionu

**Files:**
- Modify: `apps/web/src/app/(hra)/stadion/page.tsx` (`FACILITY_ICONS`, `FACILITY_LABELS`, `FACILITY_DESCRIPTIONS` ř. ~151–200; výpis ř. ~1128)
- Modify: `apps/web/src/components/dashboard/widgets/items/fans-widgets.tsx:~138` (`FACILITY_LABELS`)

**Interfaces:**
- Consumes: z API `stadium.facilities` obsahuje čtyři klíče stran a `stadium.upgrades` nabídky stran.

- [ ] **Step 1: Mapy popisků, ikon a popisů úrovní**

Do `FACILITY_ICONS` za `stands: "🏟",`:

```ts
  stand_main: "🏟",
  stand_opposite: "🏟",
  stand_goal_west: "🏟",
  stand_goal_east: "🏟",
```

Do `FACILITY_LABELS` za `stands: "Tribuny",`:

```ts
  stand_main: "Hlavní tribuna",
  stand_opposite: "Protější tribuna",
  stand_goal_west: "Tribuna za levou brankou",
  stand_goal_east: "Tribuna za pravou brankou",
```

Do `FACILITY_DESCRIPTIONS` za řádek `stands: [...]`:

```ts
  stand_main: ["Zatím žádná", "Pár řad lavic", "Krytá tribuna se sedačkami", "Tribuna přes celou délku hřiště"],
  stand_opposite: ["Zatím žádná", "Lavičky naproti hlavní", "Menší tribunka", "Plná tribuna naproti hlavní"],
  stand_goal_west: ["Zatím žádná", "Stání s ohrádkou", "Tribunka za brankou", "Velká tribuna za brankou"],
  stand_goal_east: ["Zatím žádná", "Stání s ohrádkou", "Tribunka za brankou", "Velká tribuna za brankou"],
```

Do `FACILITY_LABELS` ve `fans-widgets.tsx` za řádek se `stands`:

```ts
  stand_main: "Hlavní tribuna",
  stand_opposite: "Protější tribuna",
  stand_goal_west: "Tribuna za levou brankou",
  stand_goal_east: "Tribuna za pravou brankou",
```

- [ ] **Step 2: Nezobrazovat odvozené `stands` jako kartu**

Ve výpisu zázemí (ř. ~1128) změnit

```tsx
{Object.entries(stadium.facilities).map(([key, level]) => {
```
na
```tsx
{Object.entries(stadium.facilities).filter(([key]) => key !== "stands").map(([key, level]) => {
```

- [ ] **Step 3: Test klíčů**

Run: `npm run test --workspace=apps/api -- facility-keys`
Expected: PASS. Pokud selže na `FACILITY_CONFIG` ve `stadium-view.tsx`, ten test kontroluje jen opačný směr (klíč v mapě musí být zařízení), takže se tam nic přidávat nemusí.

- [ ] **Step 4: Build FE**

Run: `cd apps/web && npx next build --no-lint`
Expected: build projde.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(stadion): karty ctyr tribun na strance stadionu"
```

---

### Task 6: Ověření na localhostu (API i prohlížeč)

**Files:** žádné změny kódu (jen případné opravy chyb nalezených ověřením, každá po schválení).

- [ ] **Step 1: Spustit lokální API i web**

Run: `npm run dev` (pokud už neběží; nekillovat fungující servery, nefunkční restartovat). Ověřit `curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/api/health` a web na `localhost:3000`. Lokální `.env.local` musí mířit na `localhost:8787` (`feedback_local_dev_setup`).

- [ ] **Step 2: API: nabídka a kapacita**

```bash
curl -s "http://localhost:8787/api/teams/TEAMID/stadium" | python3 -m json.tool | grep -E "stand_|stands|capacity|facility|cost"
```
Expected: v `facilities` čtyři strany a `stands` jako maximum; v `upgrades` čtyři strany bez `stands`; `capacity` stejná jako před migrací u klubů s původním `stands` (porovnat s hodnotou před převodem).

- [ ] **Step 3: API: stavba jedné strany a dvojklik**

```bash
curl -s -X POST "http://localhost:8787/api/teams/TEAMID/stadium/upgrade" -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" -d '{"facility":"stand_opposite"}'
```
Expected: `ok:true`, `newLevel` o 1 vyšší, peníze strženy jednou. Stejné volání hned znovu pošlet paralelně dvakrát; Expected: druhé selže (409 nebo další úroveň) a peníze se nestrhnou dvakrát. Po testu nic neuklízet, jen v reportu říct, co se změnilo (`feedback_test_neuklizet`).

- [ ] **Step 4: MCP browser (jako hráč)**

Přes `mcp__claude-in-chrome__*` přihlásit se na localhostu testovacím účtem, otevřít stránku Stadion, ověřit: čtyři karty tribun, žádná karta „Tribuny", popisy úrovní, tlačítko stavby u strany, zamčená/nezamčená střecha, hláška při nedostatku peněz (druhá větev). Pak totéž v iframe 375 px (`reference_mobil_iframe_mcp`). Screenshot každé větve.

- [ ] **Step 5: Spustit celé testy a typecheck**

Run: `npm run test --workspace=apps/api` a `npm run typecheck`
Expected: PASS, případná předchozí selhání reportovat zvlášť.

- [ ] **Step 6: Report uživateli**

Co funguje, co bylo ověřeno (API, browser, mobil), co se změnilo v lokálních datech. Do `testing` se nepushuje, dokud uživatel neřekne (`feedback_localhost_pred_testingem`).

---

## Navazující plány (nejsou součástí této části)

- **Část 2, 3D po stranách:** `Stand.tsx` a `Stadium3D.tsx` kreslí každou stranu podle její úrovně (dnes podle `stands`). Vyžaduje samostatné čtení `getStadiumLayout`, `Floodlights`, `StandRoof`, `VipBox` a kamer.
- **Část 3, přístavby a náhled:** nové tabulka/sloupce přístaveb, katalog 13 přístaveb, rohy, náhled před stavbou.

## Self-Review (spec coverage)

- Čtyři tribuny s vlastní úrovní: Task 1–3.
- Převod se zachováním kapacity: Task 1 (test součtu) a Task 2 (migrace).
- Střecha, lóže a kotel beze změny, podmínka „aspoň jedna tribuna": Task 3 (`anyStand`, `st` ze stran).
- Poškození, oprava a obec přes strany: Task 2 (přesun záznamu), Task 4.
- UI karty: Task 5. Ověření: Task 6.
- Přístavby, rohy, náhled, 3D: vědomě odloženo do částí 2 a 3.
- Typová konzistence: názvy `STAND_SIDES`, `standSideCosts`, `standSideGain`, `readStandLevels`, `hasStandSides`, `legacyStandsToSides`, `standsCapacity`, `standsMaxLevel` jsou v Task 1 definované a v Task 3–4 používané stejně.
