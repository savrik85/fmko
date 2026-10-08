# Postava hráče (výška a váha, část 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Výška a váha hráče začnou ovlivňovat vlastnosti v zápase a v profilu: nadváha ubírá rychlost a výdrž, hmotnost přidá sílu, podváha sílu ubere, výška mění hlavičky a dosah brankáře.

**Architecture:** Všechny vzorce žijí v jediném modulu `apps/api/src/generators/physicals.ts`. Engine se postavy dotkne jen přes upravené vlastnosti `MatchPlayer` (dvě stavby hráčů: `buildMatchPlayers` a `mapRowToMatchPlayer`) a přes dosah brankáře (`MatchPlayer.height`). Detail hráče v API přidá pole `body`, web ho ukáže v profilu. Stávající data dostanou `physical.bodyType` migrací 0255, výška ani váha se jim nemění.

**Tech Stack:** TypeScript, Hono na Cloudflare Workers, D1 (SQLite), Vitest, Next.js 15.

**Spec:** `docs/superpowers/specs/2026-10-08-player-body-design.md`

## Global Constraints

- Identifikátory, názvy souborů i id v testech anglicky. Česky jen texty pro hráče, komentáře a popisy testů (CLAUDE.md, pravidlo 6). Před commitem: `git diff --cached | grep "^+" | grep -oE "\b(const|let|function|interface|type|class)\s+\w+" | sort -u`.
- Žádný prázdný `catch`: server `logger.warn({ module: "..." }, "popis", e)`, web `console.error("popis:", e)`.
- V textech pro hráče nikdy dlouhá pomlčka (—). Záporná úprava se píše znakem minus `−` (U+2212).
- `overallRatingFromFlat`, tržní cena, mzdy, trénink ani roční vývoj se NEMĚNÍ. Úpravy postavou se použijí jen v `buildMatchPlayers`, `mapRowToMatchPlayer` a v detailu hráče v API.
- Konstanty ze spec: `IDEAL_BMI = 23.5`, `WEIGHT_TOLERANCE_KG = 4`; nadváha −1 rychlost a −1 výdrž za každé 2 kg nad tolerancí, strop −12; hmotnost +1 síla za každé 4 kg nadváhy, strop +4; podváha −1 síla za každé 2 kg pod tolerancí, strop −6; hlavičky `(výška − 180) × 0,4`, strop ±5; dosah brankáře `1 + (výška − 185) × 0,008`, rozsah 0,9–1,1; zaokrouhlení `Math.round`, vlastnost po úpravě nejméně 1.
- Upřesnění spec (jinak by si tabulka a tolerance odporovaly): sílu za hmotnost dostane jen hráč s nadváhou nad tolerancí, počítá se `Math.floor(excess / 4)` (180 cm / 90 kg: +3 jako ve spec). Kód nesmí vracet `-0`.
- Koeficienty generátoru: thin 0,88, athletic 1,00, normal 1,05, stocky 1,15, obese 1,32; váha ± 3 kg.
- Převod BMI → postava: pod 20 `thin`; 20–25 `athletic`, když `speed + stamina ≥ 70`, jinak `normal`; 25–30 `stocky`; 30+ `obese`.
- Mobile-first: do tabulek nepřidávat sloupce, písmo nejméně `text-sm`. Poznámka „(−5 nadváha)“ jde pod název vlastnosti, ne vedle hodnoty: dvousloupcová mřížka dovedností na 375 px ji vedle odznaku nepojme. To je jediná odchylka od spec.
- Nasazení jen na `testing`. Produkce až po výslovném „nasaď na main“. Migrace na produkci po záloze (`wrangler d1 export`), spouští ji uživatel přes `!`.
- Rovnováha: gólovost a poměr výher vyrovnaných zápasů se nesmí pohnout o víc než ±3 %.

## Review Focus

- Hráč bez výšky nebo váhy (starý záznam, pohárový velkoklub, `physical` = `{}`): úpravy nulové, dosah 1, žádné `NaN` v zápase ani v profilu. Test: Task 1 (`bodyEffects` s chybějícími údaji), Task 3 (`applyBodyEffects` s `{}`).
- Výška nebo váha uložená jako text nebo nula (`"180"`, `0`): bere se jako chybějící údaj, ne jako číslo. Test: Task 1.
- Vlastnost, která by úpravou spadla pod 1 (rychlost 5 a nadváha 30 kg): zůstane 1. Hodnota bez úpravy (třeba hlavičky 0 u brankáře) se nesmí zvednout na 1. Test: Task 3.
- Zamlžený profil cizího hráče (výška a váha zaokrouhlené na 5): `body` se počítá až ze zamlžených hodnot, aby neprozradil přesnou váhu. Ověření: Task 4, krok s cizím hráčem.
- Opakované spuštění migrace: druhý běh nic nezmění. Hráči s výškou a váhou se výška ani váha nezmění. Ověření: Task 5.

---

## File Structure

| Soubor | Změna | Odpovědnost |
|---|---|---|
| `apps/api/src/generators/physicals.ts` | upravit | jediný zdroj vzorců postavy a generování výšky a váhy |
| `apps/api/src/generators/physicals.test.ts` | vytvořit | testy vzorců a generátoru |
| `apps/api/src/generators/create-player.ts` | upravit | typ `CreatedPlayer.physical` dostane `bodyType` |
| `apps/api/src/season/daily-tick.ts`, `season/league-round.ts`, `routes/game.ts` | upravit | číst uložený `bodyType` místo natvrdo `"normal"` |
| `apps/api/src/engine/types.ts` | upravit | `MatchPlayer.height` |
| `apps/api/src/engine/simulation.ts` | upravit | dosah brankáře v `calcAerialProb` a `calcGoalProb` |
| `apps/api/src/engine/body-effects.test.ts` | vytvořit | testy `applyBodyEffects` a dosahu brankáře v enginu |
| `apps/api/src/multiplayer/match-runner.ts`, `engine/lineup-loader.ts` | upravit | použít `applyBodyEffects` |
| `apps/api/src/routes/teams.ts` | upravit | pole `body` v detailu hráče |
| `apps/web/src/lib/api.ts`, `apps/web/src/app/(hra)/hrac/[id]/page.tsx` | upravit | typ a zobrazení postavy |
| `apps/api/migrations/0255_player_body_type.sql` | vytvořit | převod stávajících dat |

---

### Task 1: Vzorce postavy

**Files:**
- Modify: `apps/api/src/generators/physicals.ts`
- Create: `apps/api/src/generators/physicals.test.ts`

**Interfaces:**
- Consumes: nic.
- Produces (pro Task 2–4):
  - `type BodyType = "thin" | "athletic" | "stocky" | "obese" | "normal"` (beze změny)
  - `isBodyType(v: unknown): v is BodyType`
  - `idealWeight(heightCm: number): number` (nezaokrouhlené kg)
  - `interface BodyEffects { speed: number; stamina: number; strength: number; heading: number; gkReach: number }`
  - `bodyEffects(physical: Record<string, unknown> | null | undefined): BodyEffects`
  - `gkReachFactor(heightCm: number | undefined): number`
  - `interface PlayerBodyView { bodyType: BodyType | null; idealWeight: number | null; effects: { speed: number; stamina: number; strength: number; heading: number } }`
  - `playerBodyView(physical: Record<string, unknown> | null | undefined): PlayerBodyView`

- [ ] **Step 1: Write the failing test**

Vytvoř `apps/api/src/generators/physicals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bodyEffects, gkReachFactor, idealWeight, isBodyType, playerBodyView } from "./physicals";

describe("idealWeight", () => {
  it("BMI 23,5: 180 cm → 76 kg, 190 cm → 85 kg", () => {
    expect(Math.round(idealWeight(180))).toBe(76);
    expect(Math.round(idealWeight(190))).toBe(85);
  });
});

describe("bodyEffects", () => {
  it("180 cm / 90 kg: −5 rychlost, −5 výdrž, +3 síla", () => {
    const e = bodyEffects({ height: 180, weight: 90 });
    expect(e).toMatchObject({ speed: -5, stamina: -5, strength: 3, heading: 0 });
    expect(e.gkReach).toBeCloseTo(0.96);
  });

  it("v toleranci ±4 kg se nic neděje", () => {
    const e = bodyEffects({ height: 180, weight: 79 });
    expect([e.speed, e.stamina, e.strength]).toEqual([0, 0, 0]);
  });

  it("190 cm / 70 kg: podváha −5 síla, rychlost beze změny", () => {
    const e = bodyEffects({ height: 190, weight: 70 });
    expect(e.strength).toBe(-5);
    expect(e.speed).toBe(0);
  });

  it("stropy: nadváha −12, hmotnost +4, podváha −6", () => {
    const fat = bodyEffects({ height: 170, weight: 140 });
    expect(fat.speed).toBe(-12);
    expect(fat.stamina).toBe(-12);
    expect(fat.strength).toBe(4);
    expect(bodyEffects({ height: 194, weight: 55 }).strength).toBe(-6);
  });

  it("výška: 192 cm +5 hlavičky, 170 cm −4, 179 cm 0 (ne −0)", () => {
    expect(bodyEffects({ height: 192, weight: 87 }).heading).toBe(5);
    expect(bodyEffects({ height: 170, weight: 68 }).heading).toBe(-4);
    expect(Object.is(bodyEffects({ height: 179, weight: 75 }).heading, 0)).toBe(true);
  });

  it("chybějící nebo nečíselné údaje jsou neutrální", () => {
    const neutral = { speed: 0, stamina: 0, strength: 0, heading: 0, gkReach: 1 };
    expect(bodyEffects({})).toEqual(neutral);
    expect(bodyEffects(null)).toEqual(neutral);
    expect(bodyEffects({ height: "180", weight: "90" })).toEqual(neutral);
    expect(bodyEffects({ height: 0, weight: 90 })).toEqual(neutral);
  });

  it("výška bez váhy: hlavičky a dosah ano, váhové úpravy ne", () => {
    const e = bodyEffects({ height: 190 });
    expect(e).toMatchObject({ speed: 0, stamina: 0, strength: 0, heading: 4 });
    expect(e.gkReach).toBeCloseTo(1.04);
  });

  it("nevrací zápornou nulu", () => {
    const e = bodyEffects({ height: 180, weight: 80 });
    for (const v of [e.speed, e.stamina, e.strength, e.heading]) expect(Object.is(v, -0)).toBe(false);
  });
});

describe("gkReachFactor", () => {
  it("185 cm = 1, 193 cm = 1,064, strop 0,9–1,1, bez výšky 1", () => {
    expect(gkReachFactor(185)).toBe(1);
    expect(gkReachFactor(193)).toBeCloseTo(1.064);
    expect(gkReachFactor(210)).toBe(1.1);
    expect(gkReachFactor(160)).toBe(0.9);
    expect(gkReachFactor(undefined)).toBe(1);
  });
});

describe("playerBodyView", () => {
  it("vrátí typ postavy, zaokrouhlený ideál a úpravy bez dosahu", () => {
    expect(playerBodyView({ height: 180, weight: 90, bodyType: "stocky" })).toEqual({
      bodyType: "stocky", idealWeight: 76, effects: { speed: -5, stamina: -5, strength: 3, heading: 0 },
    });
  });

  it("neznámý typ postavy a chybějící výška", () => {
    expect(playerBodyView({ bodyType: "giant" })).toEqual({
      bodyType: null, idealWeight: null, effects: { speed: 0, stamina: 0, strength: 0, heading: 0 },
    });
  });

  it("isBodyType zná jen pět typů", () => {
    expect(isBodyType("obese")).toBe(true);
    expect(isBodyType("giant")).toBe(false);
    expect(isBodyType(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/generators/physicals.test.ts`
Expected: FAIL, `bodyEffects` / `idealWeight` / `gkReachFactor` / `playerBodyView` / `isBodyType` nejsou exportované.

- [ ] **Step 3: Write minimal implementation**

V `apps/api/src/generators/physicals.ts` nech `generateHeightWeight` beze změny (upraví ho Task 2) a pod typy přidej:

```ts
/**
 * Postava hráče: jak výška a váha mění vlastnosti v zápase a v profilu.
 * Spec: docs/superpowers/specs/2026-10-08-player-body-design.md
 *
 * Hodnocení, cena, mzda ani trénink se postavou neřídí. Úpravy se přičítají jen
 * k vlastnostem hráče pro engine (buildMatchPlayers, mapRowToMatchPlayer) a ukazují
 * se v profilu (detail hráče v API).
 */

/** BMI, při kterém je hráč „v normě“. 180 cm → 76 kg, 190 cm → 85 kg. */
export const IDEAL_BMI = 23.5;
/** Kolik kg od ideálu se ještě nic neděje. */
export const WEIGHT_TOLERANCE_KG = 4;
const OVERWEIGHT_CAP = 12;
const MASS_STRENGTH_CAP = 4;
const UNDERWEIGHT_CAP = 6;
const HEADING_REFERENCE_CM = 180;
const HEADING_PER_CM = 0.4;
const HEADING_CAP = 5;
const GK_REFERENCE_CM = 185;
const GK_REACH_PER_CM = 0.008;

const BODY_TYPES: readonly BodyType[] = ["thin", "athletic", "stocky", "obese", "normal"];

export function isBodyType(v: unknown): v is BodyType {
  return typeof v === "string" && (BODY_TYPES as readonly string[]).includes(v);
}

export interface BodyEffects {
  speed: number;
  stamina: number;
  strength: number;
  heading: number;
  /** Násobek brankářského chytání u vysokých míčů (0,9–1,1). */
  gkReach: number;
}

const NO_EFFECTS: BodyEffects = { speed: 0, stamina: 0, strength: 0, heading: 0, gkReach: 1 };

/** Kladné konečné číslo, jinak null. Text („180“) a nula jsou chybějící údaj. */
function positive(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** `-0` → `0`. Math.round(-0,4) i 0 − 0 při záporu dávají zápornou nulu. */
function noNegativeZero(v: number): number {
  return v === 0 ? 0 : v;
}

export function idealWeight(heightCm: number): number {
  return IDEAL_BMI * (heightCm / 100) ** 2;
}

export function gkReachFactor(heightCm: number | undefined): number {
  const h = positive(heightCm);
  if (h === null) return 1;
  return Math.max(0.9, Math.min(1.1, 1 + (h - GK_REFERENCE_CM) * GK_REACH_PER_CM));
}

export function bodyEffects(physical: Record<string, unknown> | null | undefined): BodyEffects {
  const height = positive(physical?.height);
  if (height === null) return { ...NO_EFFECTS };
  const heading = noNegativeZero(Math.max(-HEADING_CAP, Math.min(HEADING_CAP,
    Math.round((height - HEADING_REFERENCE_CM) * HEADING_PER_CM))));
  const gkReach = gkReachFactor(height);

  const weight = positive(physical?.weight);
  if (weight === null) return { speed: 0, stamina: 0, strength: 0, heading, gkReach };

  const excess = weight - idealWeight(height);
  let speed = 0;
  let strength = 0;
  if (excess > WEIGHT_TOLERANCE_KG) {
    speed = noNegativeZero(-Math.min(OVERWEIGHT_CAP, Math.round((excess - WEIGHT_TOLERANCE_KG) / 2)));
    strength = Math.min(MASS_STRENGTH_CAP, Math.floor(excess / 4));
  } else if (excess < -WEIGHT_TOLERANCE_KG) {
    strength = noNegativeZero(-Math.min(UNDERWEIGHT_CAP, Math.round((-excess - WEIGHT_TOLERANCE_KG) / 2)));
  }
  return { speed, stamina: speed, strength, heading, gkReach };
}

export interface PlayerBodyView {
  bodyType: BodyType | null;
  /** Ideální váha v celých kg, null bez výšky. */
  idealWeight: number | null;
  effects: { speed: number; stamina: number; strength: number; heading: number };
}

/** Co o postavě ukazuje profil hráče (detail hráče v API). */
export function playerBodyView(physical: Record<string, unknown> | null | undefined): PlayerBodyView {
  const height = positive(physical?.height);
  const e = bodyEffects(physical);
  return {
    bodyType: isBodyType(physical?.bodyType) ? physical!.bodyType as BodyType : null,
    idealWeight: height === null ? null : Math.round(idealWeight(height)),
    effects: { speed: e.speed, stamina: e.stamina, strength: e.strength, heading: e.heading },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/generators/physicals.test.ts`
Expected: PASS (všechny testy).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/generators/physicals.ts apps/api/src/generators/physicals.test.ts
git commit -m "feat(postava): vzorce vlivu vysky a vahy na vlastnosti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Generátor ukládá postavu a váhu podle výšky

**Files:**
- Modify: `apps/api/src/generators/physicals.ts` (`generateHeightWeight`)
- Modify: `apps/api/src/generators/create-player.ts:76-80` (typ `physical`)
- Modify: `apps/api/src/season/daily-tick.ts:401`, `apps/api/src/season/league-round.ts:517`, `apps/api/src/routes/game.ts:1342`
- Test: `apps/api/src/generators/physicals.test.ts`

**Interfaces:**
- Consumes: `idealWeight`, `isBodyType`, `BodyType` z Task 1.
- Produces: `generateHeightWeight(rng: Rng, position: string, bodyType?: string): { height: number; weight: number; bodyType: BodyType }`. Volající (`create-player.ts:114`, `season/celebrity-spawn.ts:80`) ho rozbalují do `physical`, takže `bodyType` se uloží sám.

- [ ] **Step 1: Write the failing test**

Přidej na konec `apps/api/src/generators/physicals.test.ts`:

```ts
import { createRng } from "./rng";
import { generateHeightWeight } from "./physicals";
import type { BodyType } from "./physicals";

describe("generateHeightWeight", () => {
  const avgBmi = (bodyType: BodyType) => {
    const rng = createRng(99);
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const { height, weight } = generateHeightWeight(rng, "MID", bodyType);
      sum += weight / (height / 100) ** 2;
    }
    return sum / 2000;
  };

  it("průměrné BMI podle postavy: hubený ~21, atletický ~23,5, normální ~25, zavalitý ~27, obézní ~31", () => {
    expect(avgBmi("thin")).toBeCloseTo(20.7, 0);
    expect(avgBmi("athletic")).toBeCloseTo(23.5, 0);
    expect(avgBmi("normal")).toBeCloseTo(24.7, 0);
    expect(avgBmi("stocky")).toBeCloseTo(27, 0);
    expect(avgBmi("obese")).toBeCloseTo(31, 0);
  });

  it("vrací uložitelný typ postavy, neznámý typ je normal", () => {
    const rng = createRng(1);
    expect(generateHeightWeight(rng, "GK", "stocky").bodyType).toBe("stocky");
    expect(generateHeightWeight(rng, "GK", "giant").bodyType).toBe("normal");
  });

  it("vyšší hráč je při stejné postavě těžší", () => {
    const rng = createRng(5);
    const samples = Array.from({ length: 3000 }, () => generateHeightWeight(rng, "DEF", "normal"));
    const tall = samples.filter((s) => s.height >= 185);
    const short = samples.filter((s) => s.height <= 175);
    const mean = (xs: typeof samples) => xs.reduce((a, s) => a + s.weight, 0) / xs.length;
    expect(mean(tall)).toBeGreaterThan(mean(short) + 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/generators/physicals.test.ts`
Expected: FAIL (BMI hubeného kolem 23, `bodyType` v návratu chybí).

- [ ] **Step 3: Write minimal implementation**

V `apps/api/src/generators/physicals.ts` nahraď `generateHeightWeight` celé:

```ts
/** Váha k ideálu podle výšky. BMI: hubený ~21, atletický 23,5, normální ~25, zavalitý ~27, obézní ~31. */
const BODY_WEIGHT_FACTOR: Record<BodyType, number> = {
  thin: 0.88, athletic: 1.0, normal: 1.05, stocky: 1.15, obese: 1.32,
};

/**
 * Výška podle postu ±8 cm, váha z výšky a postavy ±3 kg. Dřív se váha losovala
 * nezávisle na výšce (170 cm i 194 cm kolem 80 kg) a postava se po vzniku hráče zahodila.
 */
export function generateHeightWeight(
  rng: Rng,
  position: string,
  bodyType: string = "normal",
): { height: number; weight: number; bodyType: BodyType } {
  const type: BodyType = isBodyType(bodyType) ? bodyType : "normal";
  const baseHeight = position === "GK" ? 185 : position === "DEF" ? 180 : position === "FWD" ? 178 : 176;
  const height = baseHeight + rng.int(-8, 8);
  const weight = Math.round(idealWeight(height) * BODY_WEIGHT_FACTOR[type]) + rng.int(-3, 3);
  return { height, weight, bodyType: type };
}
```

`BODY_TYPES`, `isBodyType` a `idealWeight` z Task 1 musí v souboru stát nad touto funkcí (přesuň `generateHeightWeight` pod ně).

V `apps/api/src/generators/create-player.ts` uprav typ:

```ts
  physical: {
    stamina: number; strength: number; injuryProneness: number;
    height: number; weight: number; bodyType: BodyType;
    preferredFoot: PlayerIdentity["preferredFoot"]; preferredSide: PlayerIdentity["preferredSide"];
  };
```

a doplň import `import type { BodyType } from "./physicals";` (pokud tam `BodyType` ještě není; `generateHeightWeight` se z `./physicals` už importuje).

Tři místa s natvrdo dosazenou postavou:

`apps/api/src/season/daily-tick.ts:401`:
```ts
            bodyType: isBodyType(physical.bodyType) ? physical.bodyType : "normal", avatarConfig: {} as any,
```
`apps/api/src/season/league-round.ts:517` (proměnná s physical se tu jmenuje `ph`):
```ts
            bodyType: isBodyType(ph.bodyType) ? ph.bodyType : "normal", avatarConfig: {} as any, condition: lc.condition ?? 100, morale: lc.morale ?? 50,
```
`apps/api/src/routes/game.ts:1342`:
```ts
      bodyType: isBodyType(physical.bodyType) ? physical.bodyType : "normal", avatarConfig: {} as any,
```
Do všech tří souborů přidej `import { isBodyType } from "../generators/physicals";`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/generators && npx tsc --noEmit -p .`
Expected: PASS a žádná chyba typů. Pokud spadne `jediny-generator.test.ts` na přesných hodnotách váhy, je to očekávaná změna generátoru: oprav očekávanou hodnotu jen tam, kde test měří váhu, a do commitu napiš proč.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/generators apps/api/src/season/daily-tick.ts apps/api/src/season/league-round.ts apps/api/src/routes/game.ts
git commit -m "feat(postava): generator uklada postavu, vaha podle vysky

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Engine počítá s postavou

**Files:**
- Modify: `apps/api/src/generators/physicals.ts` (přidat `applyBodyEffects`)
- Modify: `apps/api/src/engine/types.ts` (`MatchPlayer.height`)
- Modify: `apps/api/src/engine/simulation.ts` (`calcAerialProb` export + dosah, `calcGoalProb` dosah u hlaviček)
- Modify: `apps/api/src/multiplayer/match-runner.ts` (`buildMatchPlayers`, map od ř. 1710)
- Modify: `apps/api/src/engine/lineup-loader.ts` (`mapRowToMatchPlayer`)
- Create: `apps/api/src/engine/body-effects.test.ts`

**Interfaces:**
- Consumes: `bodyEffects`, `gkReachFactor` z Task 1.
- Produces: `applyBodyEffects(player: MatchPlayer, physical: Record<string, unknown> | null | undefined): void`; `MatchPlayer.height?: number`; `export function calcAerialProb(...)` (dosud neexportovaná, signatura beze změny).

- [ ] **Step 1: Write the failing test**

Vytvoř `apps/api/src/engine/body-effects.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyBodyEffects } from "../generators/physicals";
import { calcAerialProb, calcGoalProb } from "./simulation";
import { mapRowToMatchPlayer } from "./lineup-loader";
import { createPlayer, createTeam } from "./test-helpers/lineup";
import { createRng } from "../generators/rng";

describe("applyBodyEffects", () => {
  it("nadváha ubere rychlost a výdrž, hmotnost přidá sílu, výška nastaví height", () => {
    const p = { ...createPlayer(1, "DEF", 40), stamina: 40 };
    applyBodyEffects(p, { height: 180, weight: 90 });
    expect([p.speed, p.stamina, p.strength, p.heading, p.height]).toEqual([35, 35, 43, 40, 180]);
  });

  it("vlastnost úpravou nespadne pod 1", () => {
    const p = { ...createPlayer(1, "MID", 5), stamina: 5 };
    applyBodyEffects(p, { height: 170, weight: 140 });
    expect(p.speed).toBe(1);
    expect(p.stamina).toBe(1);
  });

  it("vysoký útočník má víc hlaviček, malý méně", () => {
    const tall = createPlayer(1, "FWD", 40);
    const short = createPlayer(2, "FWD", 40);
    applyBodyEffects(tall, { height: 192, weight: 87 });
    applyBodyEffects(short, { height: 170, weight: 68 });
    expect(tall.heading).toBe(45);
    expect(short.heading).toBe(36);
  });

  it("bez úpravy se nic nemění, ani nula se nezvedne na 1", () => {
    const p = { ...createPlayer(1, "GK", 50), heading: 0 };
    applyBodyEffects(p, {});
    expect(p.heading).toBe(0);
    expect(p.height).toBeUndefined();
  });
});

describe("dosah brankáře", () => {
  it("vysoký brankář pustí z rohu méně než malý", () => {
    const attacking = createTeam(1, "Útok", 40);
    const defending = createTeam(2, "Obrana", 40);
    const kicker = attacking.lineup[9];
    const header = attacking.lineup[10];
    const gk = defending.lineup[0];
    const tall = calcAerialProb(kicker, header, { ...gk, height: 195 }, defending, true, "cloudy");
    const short = calcAerialProb(kicker, header, { ...gk, height: 175 }, defending, true, "cloudy");
    expect(tall).toBeLessThan(short);
  });

  it("vysoký brankář chytá víc hlaviček ze hry, na střely nohou výška nepůsobí", () => {
    const attacker = createPlayer(1, "FWD", 50);
    const gk = createPlayer(2, "GK", 50);
    let tallSum = 0, shortSum = 0;
    for (let s = 1; s <= 500; s++) {
      tallSum += calcGoalProb(createRng(s), attacker, { ...gk, height: 195 }, 50, 30, 0);
      shortSum += calcGoalProb(createRng(s), attacker, { ...gk, height: 175 }, 50, 30, 0);
    }
    expect(tallSum).toBeLessThan(shortSum);
  });
});

describe("mapRowToMatchPlayer", () => {
  it("náhled sestavy počítá s postavou", () => {
    const row = {
      id: "p1", first_name: "Jan", last_name: "Novák", nickname: null, position: "DEF",
      skills: JSON.stringify({ speed: 40, heading: 40, defense: 40 }),
      personality: "{}", life_context: "{}",
      physical: JSON.stringify({ stamina: 40, strength: 40, height: 180, weight: 90 }),
    };
    const p = mapRowToMatchPlayer(row);
    expect([p.speed, p.stamina, p.strength, p.height]).toEqual([35, 35, 43, 180]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/engine/body-effects.test.ts`
Expected: FAIL (`applyBodyEffects` neexistuje, `calcAerialProb` není exportovaná).

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/engine/types.ts`, za řádek s `form?:`:
```ts
  height?: number; // cm; dosah brankáře na vysoké míče (generators/physicals.ts)
```

`apps/api/src/generators/physicals.ts`, nahoru `import type { MatchPlayer } from "../engine/types";` a na konec:

```ts
/**
 * Přičte úpravy postavou k vlastnostem hráče pro engine. Volá se jen při stavbě
 * hráčů pro zápas a náhled, nikdy nad uloženými dovednostmi. Vlastnost bez úpravy
 * se nemění (ani nula), upravená neklesne pod 1.
 */
export function applyBodyEffects(player: MatchPlayer, physical: Record<string, unknown> | null | undefined): void {
  const e = bodyEffects(physical);
  if (e.speed !== 0) player.speed = Math.max(1, player.speed + e.speed);
  if (e.stamina !== 0) player.stamina = Math.max(1, player.stamina + e.stamina);
  if (e.strength !== 0) player.strength = Math.max(1, player.strength + e.strength);
  if (e.heading !== 0) player.heading = Math.max(1, player.heading + e.heading);
  const height = positive(physical?.height);
  if (height !== null) player.height = height;
}
```

`apps/api/src/engine/simulation.ts`:
- import: `import { gkReachFactor } from "../generators/physicals";`
- `function calcAerialProb(` → `export function calcAerialProb(`
- v `calcAerialProb` nahraď výpočet `cover`:
```ts
  // Vysoký brankář dosáhne na centr, malý ho pustí (generators/physicals.ts).
  const gkCover = gk.goalkeeping * gkReachFactor(gk.height);
  const cover = defenders.length > 0
    ? (teamAvg(defenders, "heading") * 0.5 + teamAvg(defenders, "strength") * 0.3 + gkCover * 0.2) / 100
    : gkCover / 100;
```
- v `calcGoalProb` nahraď `defenseVal`:
```ts
  // Dosah brankáře platí jen u hlaviček, na střelu nohou výška nepůsobí.
  const reach = isHeader ? gkReachFactor(gk.height) : 1;
  const defenseVal = (gk.goalkeeping * gkHandlingMod * freshness(gk) * reach * 2 + defenseAvg) / 3;
```

`apps/api/src/multiplayer/match-runner.ts`, v `buildMatchPlayers` (map od ř. 1710):
- `        return {\n            id: engineId,` → `        const player = {\n            id: engineId,`
- konec mapy:
```ts
            morale: lifeContext.morale ?? 50,
        };
        applyBodyEffects(player, physical);
        return player;
    });
```
- import: `import {applyBodyEffects} from "../generators/physicals";`

`apps/api/src/engine/lineup-loader.ts`:
- `PlayerRow` dostane `age?: number;` jen pokud tam ještě není (Task z 2026-10-08 ho přidal).
- v `mapRowToMatchPlayer`: `  return {\n    id: engineIdCounter++,` → `  const player: MatchPlayer = {\n    id: engineIdCounter++,` a konec:
```ts
    morale: (lifeContext.morale as number) ?? 50,
  };
  applyBodyEffects(player, physical);
  return player;
}
```
- import: `import { applyBodyEffects } from "../generators/physicals";`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/engine src/multiplayer src/generators && npx tsc --noEmit -p .`
Expected: PASS, žádná chyba typů. Stávající testy enginu používají `createPlayer` bez výšky, takže se nesmí změnit.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/generators/physicals.ts apps/api/src/engine apps/api/src/multiplayer/match-runner.ts
git commit -m "feat(postava): zapas a nahled sestavy pocitaji s vyskou a vahou

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Profil hráče ukazuje postavu

**Files:**
- Modify: `apps/api/src/routes/teams.ts:1022-1148` (detail hráče)
- Modify: `apps/web/src/lib/api.ts:158` (typ `Player`)
- Modify: `apps/web/src/app/(hra)/hrac/[id]/page.tsx:1029-1060` a `AttrRow` (ř. 2069)

**Interfaces:**
- Consumes: `playerBodyView` z Task 1.
- Produces: odpověď `GET /api/teams/:id/players/:playerId` má navíc `body: PlayerBodyView`.

- [ ] **Step 1: API: pole `body`**

V `apps/api/src/routes/teams.ts` v handleru `teamsRouter.get("/:id/players/:playerId"` přidej do `return c.json({ ... })` za `physical,`:
```ts
    // Počítá se až ze zamlžených hodnot: u cizího hráče nesmí prozradit přesnou váhu.
    body: playerBodyView(physical),
```
a nahoru do souboru `import { playerBodyView } from "../generators/physicals";`.

Run: `cd apps/api && npx tsc --noEmit -p .`
Expected: bez chyb.

- [ ] **Step 2: Web: typ**

V `apps/web/src/lib/api.ts` do `Player.physical` přidej `bodyType?: "thin" | "normal" | "athletic" | "stocky" | "obese";` a do `Player`:
```ts
  /** Postava z detailu hráče: ideální váha a úpravy vlastností (API playerBodyView). */
  body?: {
    bodyType: "thin" | "normal" | "athletic" | "stocky" | "obese" | null;
    idealWeight: number | null;
    effects: { speed: number; stamina: number; strength: number; heading: number };
  };
```

- [ ] **Step 3: Web: profil**

V `apps/web/src/app/(hra)/hrac/[id]/page.tsx`:

Na úroveň modulu (k ostatním pomocným funkcím, např. nad `function AttrRow`):
```tsx
const BODY_TYPE_LABEL: Record<"thin" | "normal" | "athletic" | "stocky" | "obese", string> = {
  thin: "Hubená", normal: "Normální", athletic: "Atletická", stocky: "Zavalitá", obese: "Obézní",
};

/** Vlastnost po úpravě postavou. Bez úpravy beze změny, upravená nikdy pod 1 (stejně jako engine). */
function withBody(base: number, delta: number | undefined): number {
  return delta ? Math.max(1, base + delta) : base;
}

/** Poznámka k vlastnosti, např. „−5 nadváha“. Znaménko minus, ne pomlčka. */
function bodyNote(delta: number | undefined, reason: string): string | undefined {
  if (!delta) return undefined;
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)} ${reason}`;
}
```

`AttrRow` dostane volitelnou poznámku pod názvem:
```tsx
function AttrRow({ label, value, inverted, importance, note }: {
  label: string;
  value: number;
  inverted?: boolean;
  /** Váha atributu na hráčově pozici — řídí zvýraznění. */
  importance?: AttrImportance;
  /** Úprava postavou, např. „−5 nadváha“ (detail hráče, pole body). */
  note?: string;
}) {
  const colorValue = inverted ? 100 - value : value;
  const isKey = importance === "key";
  return (
    <div
      className={`flex items-center justify-between py-1.5 border-b border-gray-50 last:border-b-0 ${
        isKey ? "-mx-2 px-2 bg-pitch-50/70 rounded border-b-pitch-100" : ""
      }`}
    >
      <span className="flex flex-col">
        <span className={`text-sm flex items-center gap-1.5 ${isKey ? "text-pitch-700 font-bold" : "text-ink-light"}`}>
          {isKey && <span className="text-pitch-500 text-micro leading-none" aria-hidden>●</span>}
          {label}
        </span>
        {note && <span className={`text-sm ${note.startsWith("+") ? "text-pitch-500" : "text-card-red"}`}>{note}</span>}
      </span>
      <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-heading font-bold tabular-nums ${attrBg(colorValue)}`}>
        {value}
      </span>
    </div>
  );
}
```

Řádky „Výška“ a „Váha“ (ř. 1029–1030) nahraď:
```tsx
            <DetailRow label="Výška" value={player.physical?.height ? `${player.physical.height} cm` : "—"} />
            <DetailRow
              label="Váha"
              value={player.physical?.weight
                ? `${player.physical.weight} kg${player.body?.idealWeight ? ` (ideál ${player.body.idealWeight} kg)` : ""}`
                : "—"}
            />
            {player.body?.bodyType && <DetailRow label="Postava" value={BODY_TYPE_LABEL[player.body.bodyType]} />}
```

Řádky dovedností (Rychlost, Hlavičky) a fyzických (Výdrž, Síla):
```tsx
            <AttrRow label="Rychlost" value={withBody(player.skills?.speed ?? 0, player.body?.effects.speed)} note={bodyNote(player.body?.effects.speed, "nadváha")} importance={imp("speed")} />
            <AttrRow label="Hlavičky" value={withBody(player.skills?.heading ?? 0, player.body?.effects.heading)} note={bodyNote(player.body?.effects.heading, "výška")} importance={imp("heading")} />
              <AttrRow label="Výdrž" value={withBody(player.physical?.stamina ?? 0, player.body?.effects.stamina)} note={bodyNote(player.body?.effects.stamina, "nadváha")} importance={imp("stamina")} />
              <AttrRow
                label="Síla"
                value={withBody(player.physical?.strength ?? 0, player.body?.effects.strength)}
                note={bodyNote(player.body?.effects.strength, (player.body?.effects.strength ?? 0) > 0 ? "hmotnost" : "podváha")}
                importance={imp("strength")}
              />
```

- [ ] **Step 4: Build**

Run: `cd apps/web && npx next build --no-lint 2>&1 | tail -5`
Expected: build projde.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/teams.ts apps/web/src/lib/api.ts "apps/web/src/app/(hra)/hrac/[id]/page.tsx"
git commit -m "feat(postava): profil hrace ukazuje postavu, ideal a upravy vlastnosti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Migrace 0255 (typ postavy pro stávající hráče)

**Files:**
- Create: `apps/api/migrations/0255_player_body_type.sql` (číslo ověř: `ls apps/api/migrations | tail -1`; když už 0255 existuje, vezmi další volné)

**Interfaces:**
- Consumes: pravidla převodu z Global Constraints.
- Produces: `physical.bodyType` u všech hráčů a pohárových velkoklubů; výška a váha u těch, kdo je neměli.

- [ ] **Step 1: Napiš migraci**

```sql
-- Typ postavy hráče do physical.bodyType
-- (spec docs/superpowers/specs/2026-10-08-player-body-design.md).
-- Výška ani váha se nemění, kromě hráčů, kteří je nemají vůbec. Idempotentní:
-- každý krok sahá jen na chybějící hodnotu, druhé spuštění nic nezmění.
-- Spouštět ručně: npx wrangler d1 execute <db> --remote --file migrations/0255_player_body_type.sql
-- Produkce: nejdřív záloha (wrangler d1 export), spouští uživatel přes `!`.

-- 1) Chybějící výška: podle postu ±8 cm (jako generator).
UPDATE players SET physical = json_set(COALESCE(physical, '{}'), '$.height',
  (CASE position WHEN 'GK' THEN 185 WHEN 'DEF' THEN 180 WHEN 'FWD' THEN 178 ELSE 176 END) + (abs(random()) % 17) - 8)
WHERE json_extract(physical, '$.height') IS NULL;

-- 2) Chybějící váha: ideál (BMI 23,5) × 1,05 ± 3 kg.
UPDATE players SET physical = json_set(physical, '$.weight',
  CAST(round(23.5 * json_extract(physical, '$.height') * json_extract(physical, '$.height') / 10000.0 * 1.05) AS INTEGER)
    + (abs(random()) % 7) - 3)
WHERE json_extract(physical, '$.weight') IS NULL;

-- 3) Typ postavy z BMI.
UPDATE players SET physical = json_set(physical, '$.bodyType',
  CASE
    WHEN json_extract(physical, '$.weight') * 10000.0 / (json_extract(physical, '$.height') * json_extract(physical, '$.height')) < 20 THEN 'thin'
    WHEN json_extract(physical, '$.weight') * 10000.0 / (json_extract(physical, '$.height') * json_extract(physical, '$.height')) < 25 THEN
      CASE WHEN COALESCE(json_extract(skills, '$.speed'), 0)
              + COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 0) >= 70
           THEN 'athletic' ELSE 'normal' END
    WHEN json_extract(physical, '$.weight') * 10000.0 / (json_extract(physical, '$.height') * json_extract(physical, '$.height')) < 30 THEN 'stocky'
    ELSE 'obese'
  END)
WHERE json_extract(physical, '$.bodyType') IS NULL;

-- Totéž pro pohárové velkokluby.
UPDATE cup_club_players SET physical = json_set(COALESCE(physical, '{}'), '$.height',
  (CASE position WHEN 'GK' THEN 185 WHEN 'DEF' THEN 180 WHEN 'FWD' THEN 178 ELSE 176 END) + (abs(random()) % 17) - 8)
WHERE json_extract(physical, '$.height') IS NULL;

UPDATE cup_club_players SET physical = json_set(physical, '$.weight',
  CAST(round(23.5 * json_extract(physical, '$.height') * json_extract(physical, '$.height') / 10000.0 * 1.05) AS INTEGER)
    + (abs(random()) % 7) - 3)
WHERE json_extract(physical, '$.weight') IS NULL;

UPDATE cup_club_players SET physical = json_set(physical, '$.bodyType',
  CASE
    WHEN json_extract(physical, '$.weight') * 10000.0 / (json_extract(physical, '$.height') * json_extract(physical, '$.height')) < 20 THEN 'thin'
    WHEN json_extract(physical, '$.weight') * 10000.0 / (json_extract(physical, '$.height') * json_extract(physical, '$.height')) < 25 THEN
      CASE WHEN COALESCE(json_extract(skills, '$.speed'), 0)
              + COALESCE(json_extract(physical, '$.stamina'), json_extract(skills, '$.stamina'), 0) >= 70
           THEN 'athletic' ELSE 'normal' END
    WHEN json_extract(physical, '$.weight') * 10000.0 / (json_extract(physical, '$.height') * json_extract(physical, '$.height')) < 30 THEN 'stocky'
    ELSE 'obese'
  END)
WHERE json_extract(physical, '$.bodyType') IS NULL;
```

Pozn.: Hráči bez výšky dostanou typ podle dopočteného BMI (kolem 25), tedy `normal`, `athletic` nebo `stocky`. Spec říká „typ normal“; výsledek je stejný princip, jen konzistentní s převodem ostatních.

- [ ] **Step 2: Ověř na lokálním SQLite**

```bash
S=/private/tmp/claude-501/-Users-savrik-Projects-fmko/5c020a90-d97d-48be-9f73-d91101adcd4e/scratchpad
rm -f $S/mig.db && sqlite3 $S/mig.db <<'EOF'
CREATE TABLE players (id TEXT, position TEXT, skills TEXT, physical TEXT);
CREATE TABLE cup_club_players (id TEXT, position TEXT, skills TEXT, physical TEXT);
INSERT INTO players VALUES
  ('thin','MID','{"speed":30}','{"stamina":30,"height":190,"weight":70}'),
  ('ath','FWD','{"speed":40}','{"stamina":35,"height":180,"weight":76}'),
  ('norm','DEF','{"speed":20}','{"stamina":20,"height":180,"weight":76}'),
  ('stocky','DEF','{"speed":30}','{"stamina":30,"height":180,"weight":90}'),
  ('obese','GK','{"speed":20}','{"stamina":20,"height":170,"weight":100}'),
  ('none','GK','{"speed":20}','{"stamina":20}'),
  ('typed','MID','{}','{"height":180,"weight":76,"bodyType":"obese"}');
EOF
sqlite3 $S/mig.db < apps/api/migrations/0255_player_body_type.sql
sqlite3 $S/mig.db "SELECT id, json_extract(physical,'$.height'), json_extract(physical,'$.weight'), json_extract(physical,'$.bodyType') FROM players"
sqlite3 $S/mig.db "SELECT group_concat(physical) FROM players" > $S/first.txt
sqlite3 $S/mig.db < apps/api/migrations/0255_player_body_type.sql
sqlite3 $S/mig.db "SELECT group_concat(physical) FROM players" > $S/second.txt
diff $S/first.txt $S/second.txt && echo IDEMPOTENT
```
Expected: `thin|190|70|thin`, `ath|180|76|athletic`, `norm|180|76|normal`, `stocky|180|90|stocky`, `obese|170|100|obese`, `none|177–193|<dopočtená>|normal nebo stocky` (rychlost + výdrž je 40, atletický být nemůže), `typed|180|76|obese` (nepřepsáno), pak `IDEMPOTENT`.

- [ ] **Step 3: Spusť na testovací DB a zkontroluj rozdělení**

```bash
cd apps/api && npx wrangler d1 execute prales-db-test --remote --file migrations/0255_player_body_type.sql
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT json_extract(physical, "$.bodyType") bt, COUNT(*) n FROM players GROUP BY bt'
```
Expected: žádný řádek s `bt = null`; podíly orientačně jako na produkci (hubení ~4 %, zavalití ~42 %, obézní ~6 %), testovací DB se může lišit.

- [ ] **Step 4: Commit**

```bash
git add apps/api/migrations/0255_player_body_type.sql
git commit -m "feat(postava): migrace 0255, typ postavy z BMI pro stavajici hrace

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Rovnováha a ověření na testu

**Files:**
- Create (dočasně, nekomitovat): `apps/api/src/engine/tmp-body-balance.test.ts`
- Případně modify: konstanty v `apps/api/src/generators/physicals.ts` (jen když simulace vyjde mimo ±3 %)

**Interfaces:**
- Consumes: `applyBodyEffects` (Task 3), `simulateMatch`, `createTeam`.
- Produces: čísla pro report; případně upravené konstanty.

- [ ] **Step 1: Vzorek postav z produkce (jen čtení)**

```bash
npx wrangler d1 execute prales-db-prod --remote --json --command 'SELECT position, physical FROM players WHERE json_extract(physical, "$.height") > 0' > /private/tmp/claude-501/-Users-savrik-Projects-fmko/5c020a90-d97d-48be-9f73-d91101adcd4e/scratchpad/bodies.json
```

- [ ] **Step 2: Simulační srovnání**

Vytvoř `apps/api/src/engine/tmp-body-balance.test.ts`:

```ts
import { it } from "vitest";
import { appendFileSync, readFileSync } from "node:fs";
import { createRng } from "../generators/rng";
import { applyBodyEffects } from "../generators/physicals";
import { simulateMatch } from "./simulation";
import { createTeam } from "./test-helpers/lineup";
import type { TeamSetup } from "./types";

const DIR = "/private/tmp/claude-501/-Users-savrik-Projects-fmko/5c020a90-d97d-48be-9f73-d91101adcd4e/scratchpad/";
const OUT = DIR + "body-balance.txt";
const rows = JSON.parse(readFileSync(DIR + "bodies.json", "utf8"))[0].results as { position: string; physical: string }[];
const byPos = new Map<string, Record<string, unknown>[]>();
for (const r of rows) {
  const list = byPos.get(r.position) ?? [];
  list.push(JSON.parse(r.physical));
  byPos.set(r.position, list);
}
const N = 3000;

function withBodies(team: TeamSetup, seed: number, extraKg = 0): TeamSetup {
  const rng = createRng(seed);
  const dress = (p: TeamSetup["lineup"][number]) => {
    const pool = byPos.get(p.position) ?? [];
    const phys = { ...pool[Math.floor(rng.random() * pool.length)] };
    if (typeof phys.weight === "number") phys.weight += extraKg;
    const copy = { ...p };
    applyBodyEffects(copy, phys);
    return copy;
  };
  return { ...team, lineup: team.lineup.map(dress), subs: team.subs.map(dress) };
}

function run(build: (s: number) => { home: TeamSetup; away: TeamSetup }) {
  let goals = 0, hw = 0;
  for (let s = 1; s <= N; s++) {
    const { home, away } = build(s);
    const r = simulateMatch(createRng(s * 7919), { home, away, weather: "cloudy", isHomeAdvantage: true });
    goals += r.homeScore + r.awayScore;
    if (r.homeScore > r.awayScore) hw++;
  }
  return `góly ${(goals / N).toFixed(2)}, výhry domácích ${(100 * hw / N).toFixed(1)} %`;
}

it("postava: srovnání rovnováhy", () => {
  appendFileSync(OUT, `\nVyrovnané 37:37 bez postavy: ${run(() => ({ home: createTeam(1, "D", 37), away: createTeam(2, "H", 37) }))}\n`);
  appendFileSync(OUT, `Vyrovnané 37:37 s postavami z produkce: ${run((s) => ({ home: withBodies(createTeam(1, "D", 37), s), away: withBodies(createTeam(2, "H", 37), s + 100000) }))}\n`);
  appendFileSync(OUT, `Domácí +12 kg, hosté v normě: ${run((s) => ({ home: withBodies(createTeam(1, "D", 37), s, 12), away: withBodies(createTeam(2, "H", 37), s + 100000) }))}\n`);
}, 600000);
```

Run:
```bash
S=/private/tmp/claude-501/-Users-savrik-Projects-fmko/5c020a90-d97d-48be-9f73-d91101adcd4e/scratchpad
cd apps/api && rm -f $S/body-balance.txt && npx vitest run src/engine/tmp-body-balance && cat $S/body-balance.txt
```
(Vitest v tomhle projektu potlačuje `console.log`, proto výsledky jdou do souboru.)
Expected: řádek s postavami se od řádku bez postavy liší v gólech i výhrách nejvýš o ±3 % (relativně); domácí s +12 kg vyhrávají znatelně méně než v řádku s postavami.

Když jsou góly mimo ±3 %, uprav v `physicals.ts` jen `OVERWEIGHT_CAP` nebo poměr „za každé 2 kg“, zopakuj krok a výsledek zapiš do commitu. Pak `rm apps/api/src/engine/tmp-body-balance.test.ts` (nekomitovat).

- [ ] **Step 3: Celé testy, build, push na testing**

```bash
cd apps/api && npx tsc --noEmit -p . && npx vitest run 2>&1 | tail -4
cd ../web && npx next build --no-lint 2>&1 | tail -3
cd ../.. && git status --short && git push origin testing
```
Expected: všechny testy prochází, build projde, v `git status` není `tmp-body-balance.test.ts`. Pak počkat na CI (`gh run list --branch testing --limit 1 --json status,conclusion`), dokud není `completed` / `success`.

- [ ] **Step 4: Ověření na testu (verify)**

Použij skill `/verify`. Konkrétně:
- Vyber hráče na testu (tým AC Rohlík Břevnov, přihlášený v prohlížeči):
  ```bash
  npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT id, team_id, json_extract(physical, "$.height") h, json_extract(physical, "$.weight") w FROM players WHERE team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" ORDER BY json_extract(physical, "$.weight") * 10000.0 / (json_extract(physical, "$.height") * json_extract(physical, "$.height")) DESC LIMIT 1'
  npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT id, team_id FROM players WHERE team_id != "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" AND json_extract(physical, "$.weight") > 95 LIMIT 1'
  ```
- Browser fetch s tokenem z `localStorage.om_token` na `https://api-test.prales.fun/api/teams/302a0ce7-428a-4da8-b4ac-40f27eb9a7d1/players/<id z prvního dotazu>`: pole `body` s `bodyType`, `idealWeight` a `effects` odpovídá `bodyEffects` pro jeho výšku a váhu.
- Totéž pro hráče cizího týmu (id z druhého dotazu, URL pořád s týmem Břevnova): `physical.height` a `physical.weight` jsou dělitelné 5 a `body.effects` odpovídá právě těmto zamlženým hodnotám.
- Profil `https://test.prales.fun/hrac/<id>`: řádky „Váha 90 kg (ideál 76 kg)“ a „Postava“, poznámky „−5 nadváha“ / „+3 hmotnost“ / „+4 výška“ pod názvem vlastnosti. Screenshot na desktopu a v 375 px přes iframe (`reference_mobil_iframe_mcp`); `document.documentElement.scrollWidth ≤ 375`.
- Náhled sestavy `POST /api/teams/302a0ce7-428a-4da8-b4ac-40f27eb9a7d1/lineup-preview` (sestava 4-4-2 z hráčů Břevnova, jako při ověření 2026-10-08) vrátí 200.
- Odehraný zápas (nejbližší kolo na testu nebo přátelák): zápas proběhne a `match_player_stats` má záznamy.

- [ ] **Step 5: Report a stop**

Shrň uživateli výsledky simulace a ověření. Produkce až po „nasaď na main“: záloha, migrace přes uživatelův `!`, cherry-pick commitů Task 1–5 (postup `/ship-prod`).
