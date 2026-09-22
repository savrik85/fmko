# Sponzoři, etapa 1: majitelé firem a náklonnost — plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Každý sponzor dostane majitele (postavu s povahou) a náklonnost ke klubům; klub ho může zvát na domácí zápasy a potkat v hospodě, náklonnost se hýbe i výsledky, výtržnostmi a spoluprací.

**Architecture:** Čisté funkce (generátor majitele, pravděpodobnosti, změny náklonnosti, rozpočet B) v `apps/api/src/sponsors/*` s unit testy; tenká DB vrstva `sponsors/favor.ts` a háčky `sponsors/hooks.ts` volané z match-runneru, vyhodnocení výtržností, rolloveru a denního ticku. Nový router `routes/sponsors.ts` převezme detail sponzora z `game.ts`. Web: karta majitele na `/sponzor/[id]` a sekce „Firmy v okrese“ na `/sponzori`.

**Tech Stack:** Hono + Cloudflare D1 (SQLite), vitest, Next.js 15 (client komponenty), Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-22-vyjednavani-se-sponzory-design.md` (sekce „Etapa 1“)

## Global Constraints

- Identifikátory v kódu anglicky, texty pro hráče a komentáře česky.
- V textech pro hráče nikdy dlouhá pomlčka (—).
- Nikdy prázdný `catch`; server `logger.warn/error({ module }, "popis", e)`, klient `console.error("popis:", e)`.
- UI: minimum `text-sm`, jména min `text-base`, jména sponzorů/týmů jsou odkazy, ceny nikdy v tlačítkách (jen v info řádku), mobil nejdřív, bez nových sloupců v tabulkách.
- Výchozí náklonnost 40, rozsah 0–100.
- Testovací DB `prales-db-test`; produkce jen po výslovném souhlasu. D1 dotazy: vnější `'`, vnitřní `"`.
- Nic na `main`. Push jen na `testing`.
- Migrace 0217 se aplikuje ručně: `npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0217_sponsor_owners.sql`.

## Souborová struktura

| Soubor | Odpovědnost |
|---|---|
| `apps/api/migrations/0217_sponsor_owners.sql` | tabulky majitelů, náklonnosti, pozvánek, setkání v hospodě |
| `apps/api/src/villages/officials-generator.ts` | jen export `hashSeed`, `generateOfficialFace`, `MALE_FIRST_NAMES`, `LAST_NAMES_M` (beze změny chování) |
| `apps/api/src/sponsors/owners.ts` (+ `.test.ts`) | deterministický generátor majitele |
| `apps/api/src/sponsors/favor-math.ts` (+ `.test.ts`) | čisté vzorce: dárek, šance pozvání, změny náklonnosti |
| `apps/api/src/sponsors/budget.ts` (+ `.test.ts`) | rozpočet B a odhad rozmezí |
| `apps/api/src/sponsors/favor.ts` | DB: majitel (líně), čtení a změna náklonnosti |
| `apps/api/src/sponsors/hooks.ts` | DB háčky: vyhodnocení pozvánek po zápase, výtržnosti, spolupráce, hospoda |
| `apps/api/src/routes/sponsors.ts` | API detail sponzora, firmy v okrese, pozvání, hospoda |
| `apps/web/src/lib/sponsor-owners.ts` | české popisky povah a pásem náklonnosti |
| `apps/web/src/components/sponsors/owner-card.tsx` | karta majitele s pozváním |
| `apps/web/src/app/(hra)/sponzor/[id]/page.tsx` | napojení karty majitele |
| `apps/web/src/app/(hra)/sponzori/page.tsx` | sekce Firmy v okrese a setkání v hospodě |

---

### Task 1: Migrace 0217 a export sdílených helperů generátoru

**Files:**
- Create: `apps/api/migrations/0217_sponsor_owners.sql`
- Modify: `apps/api/src/villages/officials-generator.ts` (přidat `export` k `MALE_FIRST_NAMES`, `LAST_NAMES_M`, `hashSeed`, `generateOfficialFace`)

**Interfaces:**
- Produces: tabulky `sponsor_owners`, `sponsor_team_favor`, `sponsor_invitations`, `sponsor_pub_encounters`; exporty `hashSeed(input: string): number`, `generateOfficialFace(rng: Rng, isFemale: boolean): Record<string, unknown>`, `MALE_FIRST_NAMES: string[]`, `LAST_NAMES_M: string[]`.

- [ ] **Step 1: Napsat migraci**

```sql
-- 0217: Majitelé firem (sponzorů) a jejich náklonnost ke klubům. Etapa 1 vyjednávání.
-- Aplikovat ručně: npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0217_sponsor_owners.sql

CREATE TABLE IF NOT EXISTS sponsor_owners (
  sponsor_id INTEGER PRIMARY KEY REFERENCES district_sponsors(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  face_config TEXT NOT NULL,
  personality TEXT NOT NULL CHECK(personality IN ('patriot','businessman','fan','cautious')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chybějící řádek = výchozí náklonnost 40.
CREATE TABLE IF NOT EXISTS sponsor_team_favor (
  sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  favor INTEGER NOT NULL DEFAULT 40,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sponsor_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_sponsor_team_favor_team ON sponsor_team_favor(team_id);

CREATE TABLE IF NOT EXISTS sponsor_invitations (
  id TEXT PRIMARY KEY,
  sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  match_id TEXT NOT NULL,
  match_day TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('accepted','declined','attended')),
  gift_cost INTEGER NOT NULL DEFAULT 0,
  reject_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Majitel přijme na jeden zápasový den jen jedno pozvání.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sponsor_invitations_slot
  ON sponsor_invitations(sponsor_id, match_day) WHERE status IN ('accepted','attended');
-- Jeden klub zve jednoho majitele na jeden zápas jen jednou.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sponsor_invitations_attempt
  ON sponsor_invitations(sponsor_id, team_id, match_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_invitations_match ON sponsor_invitations(match_id, team_id);

CREATE TABLE IF NOT EXISTS sponsor_pub_encounters (
  id TEXT PRIMARY KEY,
  sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','beer','ignored','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sponsor_pub_team ON sponsor_pub_encounters(team_id, status);
```

- [ ] **Step 2: Exportovat helpery v `officials-generator.ts`**

Změnit deklarace (nic jiného):

```ts
export const MALE_FIRST_NAMES = [
```
```ts
export const LAST_NAMES_M = [
```
```ts
export function hashSeed(input: string): number {
```
```ts
export function generateOfficialFace(rng: Rng, isFemale: boolean): Record<string, unknown> {
```

- [ ] **Step 3: Aplikovat migraci na test DB a ověřit**

Run: `npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0217_sponsor_owners.sql`
Then: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT name FROM sqlite_master WHERE name LIKE "sponsor_%" ORDER BY name'`
Expected: `sponsor_contracts`, `sponsor_invitations`, `sponsor_owners`, `sponsor_pub_encounters`, `sponsor_team_favor`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: `Tasks: 5 successful`

- [ ] **Step 5: Commit**

```bash
git add apps/api/migrations/0217_sponsor_owners.sql apps/api/src/villages/officials-generator.ts
git commit -m "feat(sponzori): migrace majitelu firem a naklonnosti"
```

---

### Task 2: Generátor majitele

**Files:**
- Create: `apps/api/src/sponsors/owners.ts`
- Test: `apps/api/src/sponsors/owners.test.ts`

**Interfaces:**
- Consumes: `hashSeed`, `generateOfficialFace`, `MALE_FIRST_NAMES`, `LAST_NAMES_M` (Task 1), `createRng` (`../generators/rng`).
- Produces:
  - `type OwnerPersonality = "patriot" | "businessman" | "fan" | "cautious"`
  - `const OWNER_PERSONALITIES: readonly OwnerPersonality[]`
  - `isOwnerPersonality(v: unknown): v is OwnerPersonality`
  - `interface GeneratedOwner { firstName: string; lastName: string; age: number; faceConfig: Record<string, unknown>; personality: OwnerPersonality }`
  - `generateSponsorOwner(sponsorId: number, sponsorType: string): GeneratedOwner`

- [ ] **Step 1: Napsat test**

```ts
/**
 * Majitel firmy: deterministický podle id sponzora, povaha vážená oborem.
 */
import { describe, it, expect } from "vitest";
import { generateSponsorOwner, isOwnerPersonality, OWNER_PERSONALITIES } from "./owners";

describe("generateSponsorOwner", () => {
  it("je deterministický pro stejné id", () => {
    expect(generateSponsorOwner(93, "club")).toEqual(generateSponsorOwner(93, "club"));
  });

  it("různá id dávají různé majitele", () => {
    const names = new Set(Array.from({ length: 30 }, (_, i) => {
      const o = generateSponsorOwner(i + 1, "company");
      return `${o.firstName} ${o.lastName} ${o.age}`;
    }));
    expect(names.size).toBeGreaterThan(20);
  });

  it("má platnou povahu, věk 32–68 a portrét", () => {
    for (let id = 1; id <= 50; id++) {
      const o = generateSponsorOwner(id, "pub");
      expect(isOwnerPersonality(o.personality)).toBe(true);
      expect(o.age).toBeGreaterThanOrEqual(32);
      expect(o.age).toBeLessThanOrEqual(68);
      expect(o.faceConfig).toHaveProperty("head");
    }
  });

  it("pokrývá všechny povahy napříč obory", () => {
    const seen = new Set<string>();
    for (let id = 1; id <= 200; id++) seen.add(generateSponsorOwner(id, id % 2 ? "pub" : "company").personality);
    expect([...seen].sort()).toEqual([...OWNER_PERSONALITIES].sort());
  });
});
```

- [ ] **Step 2: Spustit test, ověřit selhání**

Run: `cd apps/api && npx vitest run src/sponsors/owners.test.ts`
Expected: FAIL (`Cannot find module './owners'`)

- [ ] **Step 3: Implementace**

```ts
/**
 * Majitel firmy (sponzora): postava s povahou, podle které se chová při pozvání
 * a později při jednání o smlouvě. Deterministický podle id sponzora, takže je
 * stejný na testu i na produkci.
 */
import { createRng } from "../generators/rng";
import { generateOfficialFace, hashSeed, LAST_NAMES_M, MALE_FIRST_NAMES } from "../villages/officials-generator";

export const OWNER_PERSONALITIES = ["patriot", "businessman", "fan", "cautious"] as const;
export type OwnerPersonality = (typeof OWNER_PERSONALITIES)[number];

export function isOwnerPersonality(v: unknown): v is OwnerPersonality {
  return typeof v === "string" && (OWNER_PERSONALITIES as readonly string[]).includes(v);
}

export interface GeneratedOwner {
  firstName: string;
  lastName: string;
  age: number;
  faceConfig: Record<string, unknown>;
  personality: OwnerPersonality;
}

type Weights = Record<OwnerPersonality, number>;
const DEFAULT_WEIGHTS: Weights = { patriot: 2, businessman: 2, fan: 2, cautious: 2 };

// Hospodský spíš fandí, velká firma spíš počítá, stavař spíš hlídá riziko.
const TYPE_WEIGHTS: Record<string, Weights> = {
  pub: { patriot: 3, businessman: 1, fan: 4, cautious: 1 },
  restaurant: { patriot: 2, businessman: 2, fan: 3, cautious: 1 },
  fast_food: { patriot: 1, businessman: 3, fan: 3, cautious: 1 },
  brewery: { patriot: 2, businessman: 3, fan: 3, cautious: 1 },
  farm: { patriot: 4, businessman: 1, fan: 2, cautious: 2 },
  municipality: { patriot: 5, businessman: 1, fan: 1, cautious: 2 },
  club: { patriot: 3, businessman: 1, fan: 4, cautious: 1 },
  company: { patriot: 1, businessman: 4, fan: 1, cautious: 3 },
  industry: { patriot: 1, businessman: 3, fan: 1, cautious: 4 },
  it: { patriot: 1, businessman: 4, fan: 2, cautious: 2 },
  ecommerce: { patriot: 1, businessman: 5, fan: 1, cautious: 2 },
  construction: { patriot: 2, businessman: 2, fan: 1, cautious: 4 },
};

export function generateSponsorOwner(sponsorId: number, sponsorType: string): GeneratedOwner {
  const rng = createRng(hashSeed(`sponsor-owner|${sponsorId}|v1`));
  const personality = rng.weighted(TYPE_WEIGHTS[sponsorType] ?? DEFAULT_WEIGHTS) as OwnerPersonality;
  const firstName = MALE_FIRST_NAMES[rng.int(0, MALE_FIRST_NAMES.length - 1)];
  const lastName = LAST_NAMES_M[rng.int(0, LAST_NAMES_M.length - 1)];
  const age = rng.int(32, 68);
  const faceConfig = generateOfficialFace(rng, false);
  return { firstName, lastName, age, faceConfig, personality };
}
```

- [ ] **Step 4: Spustit test**

Run: `cd apps/api && npx vitest run src/sponsors/owners.test.ts`
Expected: PASS (4 testy)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/sponsors/owners.ts apps/api/src/sponsors/owners.test.ts
git commit -m "feat(sponzori): generator majitelu firem"
```

---

### Task 3: Čisté vzorce náklonnosti a rozpočtu

**Files:**
- Create: `apps/api/src/sponsors/favor-math.ts`, `apps/api/src/sponsors/budget.ts`
- Test: `apps/api/src/sponsors/favor-math.test.ts`, `apps/api/src/sponsors/budget.test.ts`

**Interfaces:**
- Consumes: `OwnerPersonality` (Task 2).
- Produces (`favor-math.ts`):
  - `DEFAULT_FAVOR = 40`, `SEASON_PARTNERSHIP_FAVOR = 5`, `PUB_BEER_FAVOR = 2`
  - `clampFavor(v: number): number`
  - `invitationGiftCost(favor: number): number`
  - `invitationAcceptance(i: { favor: number; personality: OwnerPersonality; recentLosses: number; noise: number }): number`
  - `invitationAcceptedDelta(personality: OwnerPersonality): number`
  - `postMatchFavorDelta(personality: OwnerPersonality, ourGoals: number, theirGoals: number): number`
  - `riotFavorDelta(personality: OwnerPersonality): number`
  - `pubBeerCost(personality: OwnerPersonality): number`
- Produces (`budget.ts`):
  - `villageSizeMod(size: string): number`
  - `sponsorBudgetB(i: { monthlyMax: number; reputation: number; villageSize: string; category: "main" | "stadium"; favor: number }): number`
  - `budgetEstimateRange(b: number, favor: number): { low: number; high: number }`

- [ ] **Step 1: Napsat testy**

`favor-math.test.ts`:

```ts
/**
 * Náklonnost majitele: pozvání, změny po zápase, výtržnosti (čisté funkce).
 */
import { describe, it, expect } from "vitest";
import {
  clampFavor, invitationAcceptance, invitationAcceptedDelta, invitationGiftCost,
  postMatchFavorDelta, pubBeerCost, riotFavorDelta,
} from "./favor-math";

describe("favor-math", () => {
  it("ořez 0–100 a zaokrouhlení", () => {
    expect(clampFavor(-5)).toBe(0);
    expect(clampFavor(120)).toBe(100);
    expect(clampFavor(41.6)).toBe(42);
  });

  it("dárek zlevňuje s náklonností, minimum 300", () => {
    expect(invitationGiftCost(50)).toBe(500);
    expect(invitationGiftCost(0)).toBe(1000);
    expect(invitationGiftCost(100)).toBe(300);
  });

  it("šance roste s náklonností a drží se v 5–95 %", () => {
    const low = invitationAcceptance({ favor: 10, personality: "businessman", recentLosses: 0, noise: 0 });
    const high = invitationAcceptance({ favor: 90, personality: "businessman", recentLosses: 0, noise: 0 });
    expect(high).toBeGreaterThan(low);
    expect(invitationAcceptance({ favor: 0, personality: "cautious", recentLosses: 5, noise: -0.1 })).toBe(0.05);
    expect(invitationAcceptance({ favor: 100, personality: "patriot", recentLosses: 0, noise: 0.1 })).toBe(0.95);
  });

  it("fanoušek nejde na klub v krizi", () => {
    const calm = invitationAcceptance({ favor: 50, personality: "fan", recentLosses: 0, noise: 0 });
    const crisis = invitationAcceptance({ favor: 50, personality: "fan", recentLosses: 3, noise: 0 });
    expect(crisis).toBeCloseTo(calm - 0.2, 5);
  });

  it("přijaté pozvání: +3, patriot +5", () => {
    expect(invitationAcceptedDelta("businessman")).toBe(3);
    expect(invitationAcceptedDelta("patriot")).toBe(5);
  });

  it("po zápase: výhra +4, remíza +1, prohra -1, fanoušek dvojnásob", () => {
    expect(postMatchFavorDelta("businessman", 2, 1)).toBe(4);
    expect(postMatchFavorDelta("businessman", 1, 1)).toBe(1);
    expect(postMatchFavorDelta("businessman", 0, 1)).toBe(-1);
    expect(postMatchFavorDelta("fan", 3, 0)).toBe(8);
    expect(postMatchFavorDelta("fan", 0, 3)).toBe(-2);
  });

  it("výtržnost: -2, opatrný -4", () => {
    expect(riotFavorDelta("fan")).toBe(-2);
    expect(riotFavorDelta("cautious")).toBe(-4);
  });

  it("pivo stojí 300–400", () => {
    expect(pubBeerCost("fan")).toBe(300);
    expect(pubBeerCost("businessman")).toBe(400);
  });
});
```

`budget.test.ts`:

```ts
/**
 * Rozpočet sponzora B a odhad, který klub vidí (čisté funkce).
 */
import { describe, it, expect } from "vitest";
import { budgetEstimateRange, sponsorBudgetB } from "./budget";

describe("sponsorBudgetB", () => {
  it("hlavní sponzor, reputace 50, obec, neutrální náklonnost 50 = max × 3", () => {
    expect(sponsorBudgetB({ monthlyMax: 1000, reputation: 50, villageSize: "obec", category: "main", favor: 50 })).toBe(3000);
  });

  it("stadion je poloviční než hlavní", () => {
    const main = sponsorBudgetB({ monthlyMax: 4000, reputation: 80, villageSize: "mesto", category: "main", favor: 60 });
    const stadium = sponsorBudgetB({ monthlyMax: 4000, reputation: 80, villageSize: "mesto", category: "stadium", favor: 60 });
    expect(stadium).toBe(Math.round(main / 2));
  });

  it("náklonnost 0 → ×0,8, náklonnost 100 → ×1,2", () => {
    const base = { monthlyMax: 1000, reputation: 50, villageSize: "obec", category: "main" as const };
    expect(sponsorBudgetB({ ...base, favor: 0 })).toBe(2400);
    expect(sponsorBudgetB({ ...base, favor: 100 })).toBe(3600);
  });
});

describe("budgetEstimateRange", () => {
  it("nízká náklonnost = široké rozmezí ±30 %", () => {
    expect(budgetEstimateRange(10000, 0)).toEqual({ low: 7000, high: 13000 });
  });
  it("vysoká náklonnost = úzké rozmezí ±5 %", () => {
    expect(budgetEstimateRange(10000, 100)).toEqual({ low: 9500, high: 10500 });
  });
});
```

- [ ] **Step 2: Spustit testy, ověřit selhání**

Run: `cd apps/api && npx vitest run src/sponsors/favor-math.test.ts src/sponsors/budget.test.ts`
Expected: FAIL (moduly neexistují)

- [ ] **Step 3: Implementace `favor-math.ts`**

```ts
/**
 * Náklonnost majitele firmy ke klubu — čisté vzorce bez DB.
 * Pozvání kopíruje logiku zastupitelů obce (routes/villages.ts), jen povahy jsou sponzorské.
 */
import type { OwnerPersonality } from "./owners";

export const DEFAULT_FAVOR = 40;
export const SEASON_PARTNERSHIP_FAVOR = 5;
export const PUB_BEER_FAVOR = 2;

export function clampFavor(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Dárek k pozvání: lepší vztah = levnější, minimum 300 Kč. */
export function invitationGiftCost(favor: number): number {
  return Math.max(300, 500 + (50 - favor) * 10);
}

/** Šance, že majitel pozvání na domácí zápas přijme. `noise` je v rozmezí -0,1 až 0,1. */
export function invitationAcceptance(i: {
  favor: number; personality: OwnerPersonality; recentLosses: number; noise: number;
}): number {
  let p = 0.40 + 0.008 * (i.favor - 50);
  if (i.personality === "fan") {
    if (i.recentLosses >= 3) p -= 0.15;
    else if (i.recentLosses === 0) p += 0.05;
  }
  if (i.personality === "patriot") p += 0.05;
  if (i.personality === "cautious") p -= 0.05;
  p += i.noise;
  return Math.max(0.05, Math.min(0.95, p));
}

/** Přijaté pozvání potěší hned; patriotovi na domácím hřišti nejvíc. */
export function invitationAcceptedDelta(personality: OwnerPersonality): number {
  return personality === "patriot" ? 5 : 3;
}

/** Jak zápas, na kterém majitel seděl, pohne náklonností. Fanoušek prožívá dvojnásob. */
export function postMatchFavorDelta(personality: OwnerPersonality, ourGoals: number, theirGoals: number): number {
  const base = ourGoals > theirGoals ? 4 : ourGoals === theirGoals ? 1 : -1;
  return personality === "fan" ? base * 2 : base;
}

/** Výtržnost fanoušků klubu. Opatrného majitele to odradí dvojnásob. */
export function riotFavorDelta(personality: OwnerPersonality): number {
  return personality === "cautious" ? -4 : -2;
}

export function pubBeerCost(personality: OwnerPersonality): number {
  return personality === "fan" || personality === "patriot" ? 300 : 400;
}
```

- [ ] **Step 4: Implementace `budget.ts`**

```ts
/**
 * Rozpočet sponzora B (měsíčně) — ze stejných veličin jako dřívější nabídky, ale z horní
 * hranice sponzora, takže nová smlouva typicky vychází nad dnešními náhodnými.
 */
export function villageSizeMod(size: string): number {
  return size === "mesto" ? 1.3 : size === "mestys" ? 1.1 : size === "obec" ? 1.0 : 0.8;
}

export function sponsorBudgetB(i: {
  monthlyMax: number; reputation: number; villageSize: string; category: "main" | "stadium"; favor: number;
}): number {
  const categoryMult = i.category === "main" ? 3 : 1.5;
  const favorMod = 0.8 + 0.4 * i.favor / 100;
  return Math.round(i.monthlyMax * (i.reputation / 50) * villageSizeMod(i.villageSize) * categoryMult * favorMod);
}

/** Co klub vidí: rozmezí, které se s náklonností zužuje z ±30 % na ±5 %. */
export function budgetEstimateRange(b: number, favor: number): { low: number; high: number } {
  const width = 0.30 - 0.25 * Math.max(0, Math.min(100, favor)) / 100;
  return { low: Math.round(b * (1 - width)), high: Math.round(b * (1 + width)) };
}
```

- [ ] **Step 5: Spustit testy**

Run: `cd apps/api && npx vitest run src/sponsors/`
Expected: PASS (všechny testy v `sponsors/`)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/sponsors/favor-math.ts apps/api/src/sponsors/favor-math.test.ts apps/api/src/sponsors/budget.ts apps/api/src/sponsors/budget.test.ts
git commit -m "feat(sponzori): vzorce naklonnosti majitelu a rozpoctu sponzora"
```

---

### Task 4: DB vrstva majitelů a náklonnosti

**Files:**
- Create: `apps/api/src/sponsors/favor.ts`

**Interfaces:**
- Consumes: `generateSponsorOwner`, `OwnerPersonality`, `isOwnerPersonality` (Task 2); `DEFAULT_FAVOR` (Task 3).
- Produces:
  - `interface SponsorOwner { sponsorId: number; firstName: string; lastName: string; age: number; faceConfig: Record<string, unknown>; personality: OwnerPersonality }`
  - `ensureSponsorOwners(db: D1Database, sponsorIds: number[]): Promise<Map<number, SponsorOwner>>`
  - `ensureSponsorOwner(db: D1Database, sponsorId: number): Promise<SponsorOwner | null>`
  - `getFavorsForTeam(db: D1Database, teamId: string): Promise<Map<number, number>>`
  - `getFavor(db: D1Database, sponsorId: number, teamId: string): Promise<number>`
  - `favorDeltaStmt(db: D1Database, sponsorId: number, teamId: string, delta: number): D1PreparedStatement`
  - `applySponsorFavorDelta(db: D1Database, sponsorId: number, teamId: string, delta: number, reason: string): Promise<void>`

- [ ] **Step 1: Implementace**

```ts
/**
 * Majitelé firem a jejich náklonnost ke klubům — DB vrstva.
 * Majitel se generuje líně při prvním čtení (jako zastupitelé obce).
 * Chybějící řádek náklonnosti = DEFAULT_FAVOR.
 */
import { logger } from "../lib/logger";
import { DEFAULT_FAVOR } from "./favor-math";
import { generateSponsorOwner, isOwnerPersonality, type OwnerPersonality } from "./owners";

export interface SponsorOwner {
  sponsorId: number;
  firstName: string;
  lastName: string;
  age: number;
  faceConfig: Record<string, unknown>;
  personality: OwnerPersonality;
}

interface OwnerRow {
  sponsor_id: number; first_name: string; last_name: string; age: number; face_config: string; personality: string;
}

function mapOwner(r: OwnerRow): SponsorOwner {
  return {
    sponsorId: r.sponsor_id,
    firstName: r.first_name,
    lastName: r.last_name,
    age: r.age,
    faceConfig: JSON.parse(r.face_config) as Record<string, unknown>,
    personality: isOwnerPersonality(r.personality) ? r.personality : "businessman",
  };
}

export async function ensureSponsorOwners(db: D1Database, sponsorIds: number[]): Promise<Map<number, SponsorOwner>> {
  const out = new Map<number, SponsorOwner>();
  if (sponsorIds.length === 0) return out;
  const marks = sponsorIds.map(() => "?").join(",");
  const existing = await db.prepare(`SELECT * FROM sponsor_owners WHERE sponsor_id IN (${marks})`)
    .bind(...sponsorIds).all<OwnerRow>();
  for (const r of existing.results) out.set(r.sponsor_id, mapOwner(r));

  const missing = sponsorIds.filter((id) => !out.has(id));
  if (missing.length === 0) return out;
  const types = await db.prepare(`SELECT id, type FROM district_sponsors WHERE id IN (${missing.map(() => "?").join(",")})`)
    .bind(...missing).all<{ id: number; type: string }>();
  const inserts: D1PreparedStatement[] = [];
  for (const t of types.results) {
    const g = generateSponsorOwner(t.id, t.type);
    inserts.push(db.prepare(
      `INSERT OR IGNORE INTO sponsor_owners (sponsor_id, first_name, last_name, age, face_config, personality)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(t.id, g.firstName, g.lastName, g.age, JSON.stringify(g.faceConfig), g.personality));
    out.set(t.id, { sponsorId: t.id, ...g });
  }
  if (inserts.length > 0) await db.batch(inserts);
  return out;
}

export async function ensureSponsorOwner(db: D1Database, sponsorId: number): Promise<SponsorOwner | null> {
  return (await ensureSponsorOwners(db, [sponsorId])).get(sponsorId) ?? null;
}

export async function getFavorsForTeam(db: D1Database, teamId: string): Promise<Map<number, number>> {
  const rows = await db.prepare("SELECT sponsor_id, favor FROM sponsor_team_favor WHERE team_id = ?")
    .bind(teamId).all<{ sponsor_id: number; favor: number }>();
  return new Map(rows.results.map((r) => [r.sponsor_id, r.favor]));
}

export async function getFavor(db: D1Database, sponsorId: number, teamId: string): Promise<number> {
  const row = await db.prepare("SELECT favor FROM sponsor_team_favor WHERE sponsor_id = ? AND team_id = ?")
    .bind(sponsorId, teamId).first<{ favor: number }>();
  return row?.favor ?? DEFAULT_FAVOR;
}

/** Příkaz pro cizí batch: přičte deltu k náklonnosti (založí řádek z výchozí hodnoty), ořez 0–100. */
export function favorDeltaStmt(db: D1Database, sponsorId: number, teamId: string, delta: number): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO sponsor_team_favor (sponsor_id, team_id, favor, updated_at)
     VALUES (?, ?, MAX(0, MIN(100, ? + ?)), datetime('now'))
     ON CONFLICT(sponsor_id, team_id) DO UPDATE SET
       favor = MAX(0, MIN(100, favor + ?)), updated_at = datetime('now')`,
  ).bind(sponsorId, teamId, DEFAULT_FAVOR, delta, delta);
}

export async function applySponsorFavorDelta(
  db: D1Database, sponsorId: number, teamId: string, delta: number, reason: string,
): Promise<void> {
  if (delta === 0) return;
  await favorDeltaStmt(db, sponsorId, teamId, delta).run();
  logger.info({ module: "sponsors", sponsorId, teamId }, `náklonnost ${delta > 0 ? "+" : ""}${delta}: ${reason}`);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: `Tasks: 5 successful`

- [ ] **Step 3: Ověřit proti izolované lokální D1**

Vytvořit `<scratchpad>/favor-db/run.ts` (scratchpad = adresář session, symlink `node_modules` → kořenový `node_modules`):

```ts
import { getPlatformProxy } from "wrangler";
import { ensureSponsorOwners, applySponsorFavorDelta, getFavor } from "/Users/savrik/Projects/fmko/apps/api/src/sponsors/favor";
const proxy = await getPlatformProxy<{ DB: D1Database }>({
  configPath: "/Users/savrik/Projects/fmko/apps/api/wrangler.toml", environment: "testing",
  persist: { path: process.cwd() + "/state" },
});
const db = proxy.env.DB;
await db.exec("DROP TABLE IF EXISTS district_sponsors; DROP TABLE IF EXISTS sponsor_owners; DROP TABLE IF EXISTS sponsor_team_favor;");
await db.exec("CREATE TABLE district_sponsors (id INTEGER PRIMARY KEY, type TEXT);");
await db.exec("CREATE TABLE sponsor_owners (sponsor_id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, age INTEGER, face_config TEXT, personality TEXT, created_at TEXT DEFAULT (datetime('now')));");
await db.exec("CREATE TABLE sponsor_team_favor (sponsor_id INTEGER, team_id TEXT, favor INTEGER DEFAULT 40, updated_at TEXT, PRIMARY KEY (sponsor_id, team_id));");
await db.exec("INSERT INTO district_sponsors VALUES (1,'pub'),(2,'company');");
const a = await ensureSponsorOwners(db, [1, 2]);
const b = await ensureSponsorOwners(db, [1, 2]);
console.log("same owner twice:", JSON.stringify(a.get(1)) === JSON.stringify(b.get(1)));
console.log("default favor (expect 40):", await getFavor(db, 1, "T"));
await applySponsorFavorDelta(db, 1, "T", 5, "test");
await applySponsorFavorDelta(db, 1, "T", 200, "test");
console.log("after +5, +200 (expect 100):", await getFavor(db, 1, "T"));
await applySponsorFavorDelta(db, 1, "T", -150, "test");
console.log("after -150 (expect 0):", await getFavor(db, 1, "T"));
await proxy.dispose();
```

Run: `npx esbuild run.ts --bundle --platform=node --format=esm --external:wrangler "--external:cloudflare:*" --outfile=run.mjs --log-level=warning && node run.mjs`
Expected: `same owner twice: true`, `40`, `100`, `0`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/sponsors/favor.ts
git commit -m "feat(sponzori): DB vrstva majitelu a naklonnosti"
```

---

### Task 5: API — detail sponzora s majitelem, firmy v okrese, pozvání, hospoda

**Files:**
- Create: `apps/api/src/routes/sponsors.ts`
- Modify: `apps/api/src/routes/game.ts` (smazat blok `// GET /api/sponsors/:sponsorId …` až po konec `gameRouter.get("/sponsors/:sponsorId", …)`)
- Modify: `apps/api/src/index.ts` (registrace routeru před `gameRouter`)

**Interfaces:**
- Consumes: Task 3 (`DEFAULT_FAVOR`, `invitationGiftCost`, `invitationAcceptance`, `invitationAcceptedDelta`, `pubBeerCost`, `PUB_BEER_FAVOR`, `sponsorBudgetB`, `budgetEstimateRange`), Task 4 (`ensureSponsorOwner(s)`, `getFavor`, `getFavorsForTeam`, `applySponsorFavorDelta`, `SponsorOwner`), `recordTransaction`, `mustSeason`.
- Produces (JSON kontrakty pro web, Task 7 a 8):
  - `GET /api/sponsors/:id?teamId=` → dosavadní pole (`id, name, type, district, mainClub, priorityClub, activeContracts, history`) + `owner: { firstName, lastName, age, faceConfig, personality } | null` + `myTeam: null | { favor: number; budgetEstimate: { low: number; high: number }; nextHomeMatch: null | { matchId: string; scheduledAt: string; opponentName: string; giftCost: number; invitation: null | { status: "accepted" | "declined" | "attended"; rejectReason: string | null }; slotTakenBy: string | null } }` (`myTeam` jen když `teamId` je ze stejného okresu).
  - `GET /api/teams/:teamId/sponsor-owners` → `{ firms: Array<{ sponsorId, name, type, owner: { firstName, lastName, personality }, favor, budgetEstimate: { low, high }, mainHolder: { teamId, teamName } | null, isMine: boolean }>, pub: null | { id, sponsorId, sponsorName, ownerName, personality, beerCost } }`
  - `POST /api/teams/:teamId/sponsor-owners/:sponsorId/invite` body `{ matchId }` → `{ status: "accepted" | "declined", giftCost, probability, rejectReason: string | null, favor }`; chyby 400/404/409.
  - `POST /api/teams/:teamId/sponsor-owners/pub/:encId` body `{ action: "beer" | "ignore" }` → `{ ok: true, favor?: number }`.

- [ ] **Step 1: Napsat router**

```ts
/**
 * Sponzoři jako entita: detail sponzora s majitelem a náklonnost ke klubům (etapa 1).
 * Smlouvy (podpis, prodloužení, výpověď) zůstávají v routes/game.ts.
 */
import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireTeamOwnership } from "../auth/middleware";
import { logger } from "../lib/logger";
import { budgetEstimateRange, sponsorBudgetB } from "../sponsors/budget";
import {
  DEFAULT_FAVOR, invitationAcceptance, invitationAcceptedDelta, invitationGiftCost, PUB_BEER_FAVOR, pubBeerCost,
} from "../sponsors/favor-math";
import {
  applySponsorFavorDelta, ensureSponsorOwner, ensureSponsorOwners, getFavor, getFavorsForTeam,
} from "../sponsors/favor";
import type { OwnerPersonality } from "../sponsors/owners";

export const sponsorsRouter = new Hono<{ Bindings: Bindings }>();
sponsorsRouter.use("/teams/:teamId/sponsor-owners/*", requireTeamOwnership);

interface TeamCtx { id: string; reputation: number; district: string; size: string; name: string }

async function loadTeam(db: D1Database, teamId: string): Promise<TeamCtx | null> {
  return db.prepare(
    `SELECT t.id, t.reputation, t.name, v.district, v.size FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?`,
  ).bind(teamId).first<TeamCtx>();
}

/** Nejbližší domácí ligový zápas klubu, který se ještě nehrál (stejný dotaz jako pozvánky obce). */
async function nextHomeMatch(db: D1Database, teamId: string) {
  return db.prepare(
    `SELECT m.id, sc.scheduled_at, aw.name AS opponent_name
     FROM matches m
     JOIN season_calendar sc ON sc.id = m.calendar_id
     JOIN teams aw ON aw.id = m.away_team_id
     WHERE m.home_team_id = ? AND m.status != 'simulated' AND sc.scheduled_at >= date('now', '-1 day')
     ORDER BY sc.scheduled_at ASC LIMIT 1`,
  ).bind(teamId).first<{ id: string; scheduled_at: string; opponent_name: string }>();
}

const REJECT_REASONS: Record<OwnerPersonality, string[]> = {
  patriot: ["Ten den mám zabijačku u bratra, příště určitě.", "Na hřiště rád, ale teď to nevyjde."],
  businessman: ["Mám jednání v Praze, nestihnu to.", "Pošlete mi termíny na další měsíc, ozvu se."],
  fan: ["Po tom, jak jste hráli minule? Letos ne.", "Mám lístky na ligu, sorry."],
  cautious: ["Nejdřív se chci podívat, jak to u vás funguje.", "Radši počkám, až se to u vás usadí."],
};

// GET /api/sponsors/:id?teamId= — sponzor jako entita + majitel + náklonnost klubu
sponsorsRouter.get("/sponsors/:sponsorId", async (c) => {
  const db = c.env.DB;
  const sponsorId = Number(c.req.param("sponsorId"));
  if (!Number.isInteger(sponsorId)) return c.json({ error: "Neplatný sponzor" }, 400);
  const teamId = c.req.query("teamId") ?? null;

  const sponsor = await db.prepare(
    `SELECT ds.id, ds.name, ds.type, ds.district, ds.monthly_max, ds.priority_season, ds.priority_team_id, t.name AS priority_team_name
     FROM district_sponsors ds LEFT JOIN teams t ON t.id = ds.priority_team_id WHERE ds.id = ?`,
  ).bind(sponsorId).first<{ id: number; name: string; type: string; district: string; monthly_max: number; priority_season: number | null; priority_team_id: string | null; priority_team_name: string | null }>();
  if (!sponsor) return c.json({ error: "Sponzor nenalezen" }, 404);

  const [contracts, season, owner] = await Promise.all([
    db.prepare(
      `SELECT sc.team_id, t.name AS team_name, sc.category, sc.status, sc.seasons_total, sc.seasons_remaining, sc.signed_at
       FROM sponsor_contracts sc JOIN teams t ON t.id = sc.team_id
       WHERE sc.sponsor_id = ? ORDER BY sc.signed_at DESC LIMIT 100`,
    ).bind(sponsorId).all<{ team_id: string; team_name: string; category: string; status: string; seasons_total: number; seasons_remaining: number; signed_at: string }>(),
    db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ number: number }>(),
    ensureSponsorOwner(db, sponsorId),
  ]);

  const mapRow = (r: (typeof contracts.results)[number]) => ({
    teamId: r.team_id, teamName: r.team_name, category: r.category, status: r.status,
    seasonsTotal: r.seasons_total, seasonsRemaining: r.seasons_remaining, signedAt: r.signed_at,
  });
  const active = contracts.results.filter((r) => r.status === "active");
  const priorityActive = sponsor.priority_team_id && sponsor.priority_season === season?.number
    && !active.some((r) => r.category === "main");

  let myTeam = null;
  if (teamId) {
    const team = await loadTeam(db, teamId);
    if (team && team.district === sponsor.district) {
      const favor = await getFavor(db, sponsorId, teamId);
      const b = sponsorBudgetB({ monthlyMax: sponsor.monthly_max, reputation: team.reputation, villageSize: team.size, category: "main", favor });
      const match = await nextHomeMatch(db, teamId);
      let next = null;
      if (match) {
        const day = match.scheduled_at.slice(0, 10);
        const [mine, taken] = await Promise.all([
          db.prepare("SELECT status, reject_reason FROM sponsor_invitations WHERE sponsor_id = ? AND team_id = ? AND match_id = ?")
            .bind(sponsorId, teamId, match.id).first<{ status: "accepted" | "declined" | "attended"; reject_reason: string | null }>(),
          db.prepare(
            `SELECT t.name FROM sponsor_invitations si JOIN teams t ON t.id = si.team_id
             WHERE si.sponsor_id = ? AND si.match_day = ? AND si.status IN ('accepted','attended') AND si.team_id != ? LIMIT 1`,
          ).bind(sponsorId, day, teamId).first<{ name: string }>(),
        ]);
        next = {
          matchId: match.id, scheduledAt: match.scheduled_at, opponentName: match.opponent_name,
          giftCost: invitationGiftCost(favor),
          invitation: mine ? { status: mine.status, rejectReason: mine.reject_reason } : null,
          slotTakenBy: taken?.name ?? null,
        };
      }
      myTeam = { favor, budgetEstimate: budgetEstimateRange(b, favor), nextHomeMatch: next };
    }
  }

  return c.json({
    id: sponsor.id,
    name: sponsor.name,
    type: sponsor.type,
    district: sponsor.district,
    owner: owner ? { firstName: owner.firstName, lastName: owner.lastName, age: owner.age, faceConfig: owner.faceConfig, personality: owner.personality } : null,
    myTeam,
    mainClub: active.filter((r) => r.category === "main").map(mapRow)[0] ?? null,
    priorityClub: priorityActive ? { teamId: sponsor.priority_team_id, teamName: sponsor.priority_team_name } : null,
    activeContracts: active.map(mapRow),
    history: contracts.results.filter((r) => r.status !== "active").map(mapRow),
  });
});

// GET /api/teams/:teamId/sponsor-owners — firmy v okrese klubu a aktuální setkání v hospodě
sponsorsRouter.get("/teams/:teamId/sponsor-owners", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const team = await loadTeam(db, teamId);
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const sponsors = await db.prepare(
    `SELECT ds.id, ds.name, ds.type, ds.monthly_max,
            (SELECT sc.team_id FROM sponsor_contracts sc WHERE sc.sponsor_id = ds.id AND sc.status = 'active' AND sc.category = 'main' LIMIT 1) AS holder_id,
            (SELECT t.name FROM sponsor_contracts sc JOIN teams t ON t.id = sc.team_id WHERE sc.sponsor_id = ds.id AND sc.status = 'active' AND sc.category = 'main' LIMIT 1) AS holder_name
     FROM district_sponsors ds WHERE ds.district = ? ORDER BY ds.monthly_max DESC`,
  ).bind(team.district).all<{ id: number; name: string; type: string; monthly_max: number; holder_id: string | null; holder_name: string | null }>();

  const [owners, favors] = await Promise.all([
    ensureSponsorOwners(db, sponsors.results.map((s) => s.id)),
    getFavorsForTeam(db, teamId),
  ]);

  const firms = sponsors.results.map((s) => {
    const favor = favors.get(s.id) ?? DEFAULT_FAVOR;
    const owner = owners.get(s.id);
    const b = sponsorBudgetB({ monthlyMax: s.monthly_max, reputation: team.reputation, villageSize: team.size, category: "main", favor });
    return {
      sponsorId: s.id, name: s.name, type: s.type,
      owner: owner ? { firstName: owner.firstName, lastName: owner.lastName, personality: owner.personality } : null,
      favor,
      budgetEstimate: budgetEstimateRange(b, favor),
      mainHolder: s.holder_id ? { teamId: s.holder_id, teamName: s.holder_name ?? "" } : null,
      isMine: s.holder_id === teamId,
    };
  });
  // Volní nahoře, pak podle velikosti (pořadí z SQL).
  firms.sort((a, b) => Number(a.mainHolder !== null) - Number(b.mainHolder !== null));

  const pubRow = await db.prepare(
    `SELECT e.id, e.sponsor_id, ds.name AS sponsor_name FROM sponsor_pub_encounters e
     JOIN district_sponsors ds ON ds.id = e.sponsor_id
     WHERE e.team_id = ? AND e.status = 'active' ORDER BY e.created_at DESC LIMIT 1`,
  ).bind(teamId).first<{ id: string; sponsor_id: number; sponsor_name: string }>();
  let pub = null;
  if (pubRow) {
    const o = owners.get(pubRow.sponsor_id) ?? await ensureSponsorOwner(db, pubRow.sponsor_id);
    if (o) {
      pub = {
        id: pubRow.id, sponsorId: pubRow.sponsor_id, sponsorName: pubRow.sponsor_name,
        ownerName: `${o.firstName} ${o.lastName}`, personality: o.personality, beerCost: pubBeerCost(o.personality),
      };
    }
  }

  return c.json({ firms, pub });
});

// POST /api/teams/:teamId/sponsor-owners/:sponsorId/invite — pozvat majitele na domácí zápas
sponsorsRouter.post("/teams/:teamId/sponsor-owners/:sponsorId/invite", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const sponsorId = Number(c.req.param("sponsorId"));
  const body = await c.req.json<{ matchId?: string }>()
    .catch((e) => { logger.warn({ module: "sponsors", teamId }, "parse invite body", e); return null; });
  if (!Number.isInteger(sponsorId) || !body?.matchId) return c.json({ error: "Chybí sponzor nebo zápas" }, 400);

  const team = await loadTeam(db, teamId);
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);
  const sponsor = await db.prepare("SELECT id, district FROM district_sponsors WHERE id = ?")
    .bind(sponsorId).first<{ id: number; district: string }>();
  if (!sponsor) return c.json({ error: "Sponzor nenalezen" }, 404);
  if (sponsor.district !== team.district) return c.json({ error: "Zvát jde jen firmy z vlastního okresu" }, 400);

  const match = await nextHomeMatch(db, teamId);
  if (!match || match.id !== body.matchId) return c.json({ error: "Zvát jde jen na nejbližší domácí zápas" }, 400);
  const matchDay = match.scheduled_at.slice(0, 10);

  const taken = await db.prepare(
    `SELECT 1 FROM sponsor_invitations WHERE sponsor_id = ? AND match_day = ? AND status IN ('accepted','attended') AND team_id != ?`,
  ).bind(sponsorId, matchDay, teamId).first();
  if (taken) return c.json({ error: "Majitel už ten den přijal pozvání jiného klubu" }, 409);

  const owner = await ensureSponsorOwner(db, sponsorId);
  if (!owner) return c.json({ error: "Majitel nenalezen" }, 404);
  const favor = await getFavor(db, sponsorId, teamId);
  const giftCost = invitationGiftCost(favor);

  const budget = await db.prepare("SELECT budget, game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ budget: number; game_date: string | null }>();
  if (!budget || budget.budget < giftCost) return c.json({ error: "Na dárek nemáš peníze" }, 400);

  const recent = await db.prepare(
    `SELECT home_team_id, home_score, away_score FROM matches
     WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated' ORDER BY simulated_at DESC LIMIT 5`,
  ).bind(teamId, teamId).all<{ home_team_id: string; home_score: number; away_score: number }>();
  const recentLosses = recent.results.filter((m) => {
    const ours = m.home_team_id === teamId ? m.home_score : m.away_score;
    const theirs = m.home_team_id === teamId ? m.away_score : m.home_score;
    return ours < theirs;
  }).length;

  const probability = invitationAcceptance({
    favor, personality: owner.personality, recentLosses, noise: (Math.random() - 0.5) * 0.2,
  });
  const accepted = Math.random() < probability;
  const reasons = REJECT_REASONS[owner.personality];
  const rejectReason = accepted ? null : reasons[Math.floor(Math.random() * reasons.length)];

  try {
    await db.prepare(
      `INSERT INTO sponsor_invitations (id, sponsor_id, team_id, match_id, match_day, status, gift_cost, reject_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), sponsorId, teamId, match.id, matchDay, accepted ? "accepted" : "declined", giftCost, rejectReason).run();
  } catch (e) {
    // Unikátní index: už pozváno na tenhle zápas, nebo slot mezitím obsadil jiný klub.
    logger.warn({ module: "sponsors", teamId, sponsorId }, "insert sponsor invitation", e);
    return c.json({ error: "Tohohle majitele už na ten zápas zvát nejde" }, 409);
  }

  const { recordTransaction } = await import("../season/finance-processor");
  await recordTransaction(db, teamId, "event", -giftCost, `Pozvání ${owner.firstName} ${owner.lastName} na zápas`,
    budget.game_date ?? new Date().toISOString());
  if (accepted) {
    await applySponsorFavorDelta(db, sponsorId, teamId, invitationAcceptedDelta(owner.personality), "přijal pozvání na zápas");
  }

  return c.json({
    status: accepted ? "accepted" : "declined",
    giftCost,
    probability: Math.round(probability * 100) / 100,
    rejectReason,
    favor: await getFavor(db, sponsorId, teamId),
  });
});

// POST /api/teams/:teamId/sponsor-owners/pub/:encId — pivo s majitelem, nebo ho nechat být
sponsorsRouter.post("/teams/:teamId/sponsor-owners/pub/:encId", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const encId = c.req.param("encId");
  const body = await c.req.json<{ action?: string }>()
    .catch((e) => { logger.warn({ module: "sponsors", teamId }, "parse pub body", e); return null; });
  if (body?.action !== "beer" && body?.action !== "ignore") return c.json({ error: "Neplatná akce" }, 400);

  const enc = await db.prepare(
    "SELECT id, sponsor_id FROM sponsor_pub_encounters WHERE id = ? AND team_id = ? AND status = 'active'",
  ).bind(encId, teamId).first<{ id: string; sponsor_id: number }>();
  if (!enc) return c.json({ error: "Setkání už není aktivní" }, 410);

  const claim = await db.prepare("UPDATE sponsor_pub_encounters SET status = ? WHERE id = ? AND status = 'active'")
    .bind(body.action === "beer" ? "beer" : "ignored", encId).run();
  if (!claim.meta.changes) return c.json({ error: "Setkání už není aktivní" }, 410);
  if (body.action === "ignore") return c.json({ ok: true });

  const owner = await ensureSponsorOwner(db, enc.sponsor_id);
  if (!owner) return c.json({ error: "Majitel nenalezen" }, 404);
  const cost = pubBeerCost(owner.personality);
  const gd = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>();
  const { recordTransaction } = await import("../season/finance-processor");
  await recordTransaction(db, teamId, "event", -cost, `Pivo s ${owner.firstName} ${owner.lastName}`, gd?.game_date ?? new Date().toISOString());
  await applySponsorFavorDelta(db, enc.sponsor_id, teamId, PUB_BEER_FAVOR, "pivo v hospodě");
  return c.json({ ok: true, favor: await getFavor(db, enc.sponsor_id, teamId) });
});
```

- [ ] **Step 2: Odstranit starý detail z `game.ts`**

Smazat celý blok začínající komentářem `// GET /api/sponsors/:sponsorId — sponzor jako entita: kde sponzoruje teď a s kým spolupracoval dřív` až po jeho uzavírací `});` (bezprostředně před `// POST /api/teams/:id/sponsors/sign`).

- [ ] **Step 3: Registrovat router v `index.ts`**

Přidat import k ostatním routerům a řádek **před** `app.route("/api", gameRouter);`:

```ts
import { sponsorsRouter } from "./routes/sponsors";
```
```ts
app.route("/api", sponsorsRouter);
```

- [ ] **Step 4: Typecheck a testy**

Run: `npm run typecheck && cd apps/api && npx vitest run src/sponsors/`
Expected: typecheck `5 successful`, testy PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/sponsors.ts apps/api/src/routes/game.ts apps/api/src/index.ts
git commit -m "feat(sponzori): API majitelu firem, pozvani na zapas a hospoda"
```

---

### Task 6: Háčky — po zápase, výtržnosti, spolupráce, hospoda v denním ticku

**Files:**
- Create: `apps/api/src/sponsors/hooks.ts`
- Modify: `apps/api/src/multiplayer/match-runner.ts` (za blok `// Označit pozvánky jako attended`)
- Modify: `apps/api/src/fans/resolve-match-incidents.ts` (za zápis snapshotu `UPDATE ${tabulka} SET fan_incidents = ?, away_fans = ?`)
- Modify: `apps/api/src/season/season-rollover.ts` (v bloku 4b před `assignMainPriorities`)
- Modify: `apps/api/src/season/daily-tick.ts` (v týdenním cyklu obce)

**Interfaces:**
- Consumes: Task 3 (`postMatchFavorDelta`, `riotFavorDelta`, `SEASON_PARTNERSHIP_FAVOR`, `DEFAULT_FAVOR`), Task 4 (`favorDeltaStmt`), Task 2 (`isOwnerPersonality`), `createRng`, `hashSeed`, `gameExpiry`.
- Produces:
  - `settleSponsorInvitations(db: D1Database, matchId: string, homeTeamId: string, homeScore: number, awayScore: number): Promise<void>`
  - `applyRiotFavorPenalty(db: D1Database, teamId: string): Promise<void>`
  - `rewardSeasonPartnerships(db: D1Database): Promise<number>`
  - `generateSponsorPubEncounters(db: D1Database, gameDate: string): Promise<number>`
  - `expireSponsorPubEncounters(db: D1Database, gameDate: string): Promise<number>`

- [ ] **Step 1: Implementace `hooks.ts`**

```ts
/**
 * Automatické změny náklonnosti majitelů firem a setkání v hospodě.
 * Volá se z match-runneru, vyhodnocení výtržností, rolloveru a denního ticku.
 */
import { createRng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { hashSeed } from "../villages/officials-generator";
import { favorDeltaStmt } from "./favor";
import { DEFAULT_FAVOR, postMatchFavorDelta, SEASON_PARTNERSHIP_FAVOR } from "./favor-math";
import { isOwnerPersonality, type OwnerPersonality } from "./owners";

/** Majitelé, kteří přijali pozvání na tenhle zápas: označit jako přítomné a promítnout výsledek. */
export async function settleSponsorInvitations(
  db: D1Database, matchId: string, homeTeamId: string, homeScore: number, awayScore: number,
): Promise<void> {
  const rows = await db.prepare(
    `SELECT si.id, si.sponsor_id, so.personality FROM sponsor_invitations si
     LEFT JOIN sponsor_owners so ON so.sponsor_id = si.sponsor_id
     WHERE si.match_id = ? AND si.team_id = ? AND si.status = 'accepted'`,
  ).bind(matchId, homeTeamId).all<{ id: string; sponsor_id: number; personality: string | null }>();
  if (rows.results.length === 0) return;
  const stmts: D1PreparedStatement[] = [];
  for (const r of rows.results) {
    const p: OwnerPersonality = isOwnerPersonality(r.personality) ? r.personality : "businessman";
    stmts.push(db.prepare("UPDATE sponsor_invitations SET status = 'attended' WHERE id = ? AND status = 'accepted'").bind(r.id));
    stmts.push(favorDeltaStmt(db, r.sponsor_id, homeTeamId, postMatchFavorDelta(p, homeScore, awayScore)));
  }
  await db.batch(stmts);
  logger.info({ module: "sponsors", matchId }, `majitelé na tribuně: ${rows.results.length}`);
}

/** Výtržnost fanoušků: náklonnost klesne u všech majitelů, se kterými má klub vztah. */
export async function applyRiotFavorPenalty(db: D1Database, teamId: string): Promise<void> {
  await db.prepare(
    `UPDATE sponsor_team_favor SET
       favor = MAX(0, favor + CASE
         WHEN (SELECT personality FROM sponsor_owners so WHERE so.sponsor_id = sponsor_team_favor.sponsor_id) = 'cautious' THEN -4
         ELSE -2 END),
       updated_at = datetime('now')
     WHERE team_id = ?`,
  ).bind(teamId).run();
}

/** Rollover: sezóna spolupráce s hlavním sponzorem +5 náklonnosti. Vrací počet smluv. */
export async function rewardSeasonPartnerships(db: D1Database): Promise<number> {
  const res = await db.prepare(
    `INSERT INTO sponsor_team_favor (sponsor_id, team_id, favor, updated_at)
     SELECT sponsor_id, team_id, MIN(100, ? + ?), datetime('now') FROM sponsor_contracts
     WHERE status = 'active' AND category = 'main' AND sponsor_id IS NOT NULL
     ON CONFLICT(sponsor_id, team_id) DO UPDATE SET favor = MIN(100, favor + ?), updated_at = datetime('now')`,
  ).bind(DEFAULT_FAVOR, SEASON_PARTNERSHIP_FAVOR, SEASON_PARTNERSHIP_FAVOR).run();
  return res.meta.changes ?? 0;
}

/**
 * Týdenní: lidský klub bez aktivního setkání a bez setkání za posledních 21 dní
 * potká v hospodě majitele některé firmy z okresu. Fanoušci a patrioti chodí do hospody častěji.
 */
export async function generateSponsorPubEncounters(db: D1Database, gameDate: string): Promise<number> {
  const teams = await db.prepare(
    `SELECT t.id AS team_id, v.district FROM teams t JOIN villages v ON v.id = t.village_id
     WHERE t.user_id != 'ai' AND COALESCE(t.team_type, 'senior') != 'u21' AND t.name NOT LIKE 'DELETED-%'
       AND NOT EXISTS (SELECT 1 FROM sponsor_pub_encounters e WHERE e.team_id = t.id AND e.status = 'active')
       AND NOT EXISTS (SELECT 1 FROM sponsor_pub_encounters e WHERE e.team_id = t.id AND e.created_at > datetime(?, '-21 days'))`,
  ).bind(gameDate).all<{ team_id: string; district: string }>();

  const expiresAt = gameExpiry(gameDate, 5);
  let generated = 0;
  for (const t of teams.results) {
    const candidates = await db.prepare(
      `SELECT ds.id, COALESCE(so.personality, 'businessman') AS personality
       FROM district_sponsors ds LEFT JOIN sponsor_owners so ON so.sponsor_id = ds.id WHERE ds.district = ?`,
    ).bind(t.district).all<{ id: number; personality: string }>();
    if (candidates.results.length === 0) continue;
    const weights: Record<string, number> = {};
    for (const s of candidates.results) {
      weights[String(s.id)] = s.personality === "fan" || s.personality === "patriot" ? 3 : 1;
    }
    const rng = createRng(hashSeed(`${t.team_id}|sponsor-pub|${gameDate.slice(0, 10)}`));
    const sponsorId = Number(rng.weighted(weights));
    try {
      await db.prepare(
        `INSERT INTO sponsor_pub_encounters (id, sponsor_id, team_id, status, expires_at, created_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
      ).bind(crypto.randomUUID(), sponsorId, t.team_id, expiresAt, gameDate).run();
      generated++;
    } catch (e) {
      logger.warn({ module: "sponsors", teamId: t.team_id }, "insert sponsor pub encounter", e);
    }
  }
  return generated;
}

export async function expireSponsorPubEncounters(db: D1Database, gameDate: string): Promise<number> {
  const res = await db.prepare("UPDATE sponsor_pub_encounters SET status = 'expired' WHERE status = 'active' AND expires_at < ?")
    .bind(gameDate).run();
  return res.meta.changes ?? 0;
}
```

- [ ] **Step 2: Napojit match-runner**

V `apps/api/src/multiplayer/match-runner.ts` hned za blok `// Označit pozvánky jako attended` (za jeho uzavírající `}`) vložit:

```ts
            // Majitelé firem na tribuně: výsledek jim pohne náklonností ke klubu.
            try {
                const { settleSponsorInvitations } = await import("../sponsors/hooks");
                await settleSponsorInvitations(db, matchId, homeTeamId, result.homeScore, result.awayScore);
            } catch (e) {
                logger.warn({module: "match-runner"}, "settle sponsor invitations", e);
            }
```

- [ ] **Step 3: Napojit výtržnosti**

V `apps/api/src/fans/resolve-match-incidents.ts` hned za `.catch(...)` zápisu snapshotu (`UPDATE ${tabulka} SET fan_incidents = ?, away_fans = ? WHERE id = ?`) vložit:

```ts
  // Výtržnost domácích fanoušků odradí majitele firem, se kterými má klub vztah.
  if (snapshoty.length > 0) {
    const { applyRiotFavorPenalty } = await import("../sponsors/hooks");
    await applyRiotFavorPenalty(db, opts.homeTeamId)
      .catch((e) => { logger.warn({ module: M }, "náklonnost sponzorů po výtržnosti", e); });
  }
```

- [ ] **Step 4: Napojit rollover**

V `apps/api/src/season/season-rollover.ts` v bloku 4b hned před `const { assignMainPriorities } = await import("../sponsors/exclusivity");` vložit:

```ts
    // Sezóna spolupráce s hlavním sponzorem zvedne náklonnost jeho majitele (+5).
    const { rewardSeasonPartnerships } = await import("../sponsors/hooks");
    await rewardSeasonPartnerships(db)
      .catch((e) => { logger.error({ module: "season-rollover" }, "náklonnost za sezónu spolupráce", e); });
```

- [ ] **Step 5: Napojit denní tick**

V `apps/api/src/season/daily-tick.ts` za blok `const expiredPub = await expirePubEncounters(...)` (a jeho `if`) vložit:

```ts
    const { expireSponsorPubEncounters, generateSponsorPubEncounters } = await import("../sponsors/hooks");
    const expiredSponsorPub = await expireSponsorPubEncounters(env.DB, effectiveDate.toISOString());
    if (expiredSponsorPub > 0) {
      logger.info({ module: "daily-tick" }, `${expiredSponsorPub} setkání s majiteli firem vypršelo`);
    }
```

a uvnitř `if (dayOfWeek === 1) {` za blok `pubRes` vložit:

```ts
      const sponsorPub = await generateSponsorPubEncounters(env.DB, effectiveDate.toISOString());
      if (sponsorPub > 0) {
        logger.info({ module: "daily-tick" }, `setkání s majiteli firem: ${sponsorPub} nových`);
      }
```

- [ ] **Step 6: Typecheck a testy**

Run: `npm run typecheck && cd apps/api && npx vitest run`
Expected: typecheck `5 successful`, všechny testy API PASS

- [ ] **Step 7: Ověřit háčky proti izolované lokální D1**

Rozšířit skript z Task 4 (nový soubor `<scratchpad>/hooks-db/run.ts`, stejný bundle a spuštění): vytvořit tabulky `sponsor_owners`, `sponsor_team_favor`, `sponsor_invitations` (sloupce jako v migraci), `sponsor_contracts(sponsor_id, team_id, status, category)`; vložit majitele 1 `fan`, 2 `cautious`; pozvánku `accepted` pro sponzora 1 na zápas `M1` klubu `T`; náklonnost 2→`T` = 50; aktivní hlavní smlouvu sponzora 2 s `T`. Zavolat:

```ts
await settleSponsorInvitations(db, "M1", "T", 2, 0);   // fan: 40 + 8 = 48, pozvánka attended
await applyRiotFavorPenalty(db, "T");                  // fan 48 - 2 = 46, cautious 50 - 4 = 46
console.log("rewarded:", await rewardSeasonPartnerships(db)); // 1; cautious 46 + 5 = 51
console.log((await db.prepare("SELECT sponsor_id, favor FROM sponsor_team_favor ORDER BY sponsor_id").all()).results);
console.log((await db.prepare("SELECT status FROM sponsor_invitations").all()).results);
```

Expected: `rewarded: 1`, `[{sponsor_id:1,favor:46},{sponsor_id:2,favor:51}]`, `[{status:"attended"}]`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/sponsors/hooks.ts apps/api/src/multiplayer/match-runner.ts apps/api/src/fans/resolve-match-incidents.ts apps/api/src/season/season-rollover.ts apps/api/src/season/daily-tick.ts
git commit -m "feat(sponzori): naklonnost majitelu po zapase, vytrznostech, spolupraci a hospoda"
```

---

### Task 7: Web — karta majitele na stránce sponzora

**Files:**
- Create: `apps/web/src/lib/sponsor-owners.ts`
- Create: `apps/web/src/components/sponsors/owner-card.tsx`
- Modify: `apps/web/src/app/(hra)/sponzor/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/sponsors/:id?teamId=`, `POST /api/teams/:teamId/sponsor-owners/:sponsorId/invite` (Task 5), `FaceAvatar` (`@/components/players/face-avatar`), `useTeam` (`@/context/team-context`), `useConfirm` (`@/components/ui`).
- Produces: `personalityLabel(p: string): string`, `personalityHint(p: string): string`, `favorLabel(f: number): string`, `formatCZK(v: number): string` (v `sponsor-owners.ts`); komponenta `OwnerCard`.

- [ ] **Step 1: `lib/sponsor-owners.ts`**

```ts
/** Majitelé firem: české popisky povah a náklonnosti. Klíče drží API (apps/api/src/sponsors/owners.ts). */
const PERSONALITY_LABELS: Record<string, string> = {
  patriot: "Patriot",
  businessman: "Obchodník",
  fan: "Fanoušek",
  cautious: "Opatrný",
};

const PERSONALITY_HINTS: Record<string, string> = {
  patriot: "Fandí místnímu klubu, chce vidět mladé hráče a klid na tribunách.",
  businessman: "Počítá s každou korunou, chce plný stadion a být vidět.",
  fan: "Žije výsledky. Na klub v krizi nepřijde.",
  cautious: "Nesnáší riziko a skandály, chce jistotu.",
};

export function personalityLabel(p: string): string {
  return PERSONALITY_LABELS[p] ?? "Neznámá povaha";
}

export function personalityHint(p: string): string {
  return PERSONALITY_HINTS[p] ?? "";
}

export function favorLabel(f: number): string {
  if (f >= 80) return "Fandí vám";
  if (f >= 60) return "Příznivý";
  if (f >= 40) return "Neutrální";
  if (f >= 20) return "Chladný";
  return "Nemá vás rád";
}

export function formatCZK(v: number): string {
  return v.toLocaleString("cs") + " Kč";
}
```

- [ ] **Step 2: `components/sponsors/owner-card.tsx`**

```tsx
"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardBody, useConfirm } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { favorLabel, formatCZK, personalityHint, personalityLabel } from "@/lib/sponsor-owners";

export interface OwnerInfo {
  firstName: string;
  lastName: string;
  age: number;
  faceConfig: Record<string, unknown>;
  personality: string;
}

export interface MyTeamInfo {
  favor: number;
  budgetEstimate: { low: number; high: number };
  nextHomeMatch: null | {
    matchId: string;
    scheduledAt: string;
    opponentName: string;
    giftCost: number;
    invitation: null | { status: "accepted" | "declined" | "attended"; rejectReason: string | null };
    slotTakenBy: string | null;
  };
}

export function OwnerCard({ sponsorId, teamId, owner, myTeam, onChanged }: {
  sponsorId: number;
  teamId: string | null;
  owner: OwnerInfo;
  myTeam: MyTeamInfo | null;
  onChanged: () => void;
}) {
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const name = `${owner.firstName} ${owner.lastName}`;
  const match = myTeam?.nextHomeMatch ?? null;
  const date = match ? new Date(match.scheduledAt).toLocaleDateString("cs", { day: "numeric", month: "numeric" }) : "";

  const invite = async () => {
    if (!teamId || !match || acting) return;
    const ok = await confirm({
      title: `Pozvat ${name} na zápas?`,
      description: `Domácí zápas ${date} proti ${match.opponentName}. Když pozvání přijme, náklonnost stoupne a po zápase se promítne i výsledek.`,
      details: [{ label: "Dárek a občerstvení", value: `-${formatCZK(match.giftCost)}`, color: "text-card-red" }],
      confirmLabel: "Pozvat",
    });
    if (!ok) return;
    setActing(true); setError(null); setMessage(null);
    const res = await apiFetch<{ status: "accepted" | "declined"; rejectReason: string | null }>(
      `/api/teams/${teamId}/sponsor-owners/${sponsorId}/invite`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchId: match.matchId }) },
    ).catch((e) => { console.error("sponsor invite:", e); setError((e as Error).message); return null; });
    if (res) setMessage(res.status === "accepted" ? `${name} pozvání přijal.` : `${name} odmítl: „${res.rejectReason ?? ""}“`);
    onChanged();
    setActing(false);
  };

  return (
    <Card>
      <CardBody>
        {dialog}
        <div className="flex items-start gap-4">
          <FaceAvatar faceConfig={owner.faceConfig} size={72} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted font-heading uppercase tracking-wide">Majitel</div>
            <div className="font-heading font-bold text-base">{name}, {owner.age} let</div>
            <div className="text-sm text-muted">{personalityLabel(owner.personality)}. {personalityHint(owner.personality)}</div>
          </div>
        </div>

        {myTeam && (
          <div className="mt-4 space-y-3">
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Náklonnost k vašemu klubu</span>
                <span className="font-heading font-bold">{favorLabel(myTeam.favor)} ({myTeam.favor})</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden">
                <div className="h-full bg-pitch-500" style={{ width: `${myTeam.favor}%` }} />
              </div>
            </div>
            <div className="text-sm text-muted">
              Jako hlavní sponzor by dal zhruba {formatCZK(myTeam.budgetEstimate.low)} až {formatCZK(myTeam.budgetEstimate.high)} měsíčně.
              Čím lepší vztah, tím přesnější odhad.
            </div>

            {match ? (
              <div className="pt-3 border-t border-gray-100">
                <div className="text-sm">
                  Nejbližší domácí zápas {date} proti {match.opponentName}. Dárek {formatCZK(match.giftCost)}.
                </div>
                {match.invitation ? (
                  <div className="text-sm text-muted mt-1">
                    {match.invitation.status === "declined"
                      ? `Pozvání odmítl: „${match.invitation.rejectReason ?? ""}“`
                      : "Pozvání přijal, sedí na tribuně."}
                  </div>
                ) : match.slotTakenBy ? (
                  <div className="text-sm text-muted mt-1">Ten den už jde na zápas klubu {match.slotTakenBy}.</div>
                ) : (
                  <button onClick={invite} disabled={acting} className="btn btn-primary btn-sm mt-2">Pozvat na zápas</button>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted pt-3 border-t border-gray-100">Žádný domácí zápas, na který by šlo pozvat.</div>
            )}
            {message && <div className="text-sm text-pitch-600">{message}</div>}
            {error && <div className="text-sm text-card-red">{error}</div>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 3: Napojit na `/sponzor/[id]`**

V `apps/web/src/app/(hra)/sponzor/[id]/page.tsx`:
- doplnit importy `import { useTeam } from "@/context/team-context";` a `import { OwnerCard, type OwnerInfo, type MyTeamInfo } from "@/components/sponsors/owner-card";`
- do `interface SponsorDetail` přidat `owner: OwnerInfo | null;` a `myTeam: MyTeamInfo | null;`
- načítání přepsat na funkci s `teamId`:

```tsx
  const { teamId } = useTeam();
  const load = () => {
    apiFetch<SponsorDetail>(`/api/sponsors/${id}${teamId ? `?teamId=${teamId}` : ""}`)
      .then(setData)
      .catch((e) => { console.error("sponsor detail:", e); setError((e as Error).message); });
  };
  useEffect(load, [id, teamId]);
```

- hned za první `<Card>` (hlavička sponzora) vložit:

```tsx
      {data.owner && (
        <OwnerCard sponsorId={data.id} teamId={teamId} owner={data.owner} myTeam={data.myTeam} onChanged={load} />
      )}
```

- [ ] **Step 4: Typecheck a build**

Run: `npm run typecheck && cd apps/web && npx next build --no-lint`
Expected: typecheck `5 successful`, build projde, v seznamu `ƒ /sponzor/[id]`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/sponsor-owners.ts apps/web/src/components/sponsors/owner-card.tsx "apps/web/src/app/(hra)/sponzor/[id]/page.tsx"
git commit -m "feat(web): karta majitele firmy s pozvanim na zapas"
```

---

### Task 8: Web — Firmy v okrese a setkání v hospodě na `/sponzori`

**Files:**
- Modify: `apps/web/src/app/(hra)/sponzori/page.tsx`

**Interfaces:**
- Consumes: `GET /api/teams/:teamId/sponsor-owners`, `POST /api/teams/:teamId/sponsor-owners/pub/:encId` (Task 5); `favorLabel`, `personalityLabel`, `formatCZK` z `@/lib/sponsor-owners` (Task 7); `sponsorTypeLabel` (existuje).

- [ ] **Step 1: Typy, načítání a akce**

Do stránky přidat typy:

```tsx
interface DistrictFirm {
  sponsorId: number;
  name: string;
  type: string;
  owner: { firstName: string; lastName: string; personality: string } | null;
  favor: number;
  budgetEstimate: { low: number; high: number };
  mainHolder: { teamId: string; teamName: string } | null;
  isMine: boolean;
}
interface PubEncounter { id: string; sponsorId: number; sponsorName: string; ownerName: string; personality: string; beerCost: number }
```

stav `const [firms, setFirms] = useState<{ firms: DistrictFirm[]; pub: PubEncounter | null } | null>(null);`, do `refresh` přidat třetí požadavek:

```tsx
    const [s, t, f] = await Promise.all([
      apiFetch<SponsorsData>(`/api/teams/${teamId}/sponsors`),
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<{ firms: DistrictFirm[]; pub: PubEncounter | null }>(`/api/teams/${teamId}/sponsor-owners`),
    ]);
    setData(s); setTeam(t); setFirms(f);
```

a akci pro hospodu:

```tsx
  const handlePub = async (action: "beer" | "ignore") => {
    if (!teamId || !firms?.pub || acting) return;
    setActionError(null);
    setActing(true);
    await apiFetch(`/api/teams/${teamId}/sponsor-owners/pub/${firms.pub.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    }).catch((e) => { console.error("sponsor pub:", e); setActionError((e as Error).message); return null; });
    await refresh();
    setActing(false);
  };
```

- [ ] **Step 2: Karta hospody nahoře**

Hned za blok `{actionError && (...)}` vložit:

```tsx
      {firms?.pub && (
        <Card>
          <CardBody>
            <div className="text-sm">
              🍺 V hospodě sedí <span className="font-heading font-bold text-base">{firms.pub.ownerName}</span>, majitel{" "}
              <SponsorLink id={firms.pub.sponsorId} name={firms.pub.sponsorName} className="font-heading font-bold" />.
              Pozvat ho na pivo stojí {formatCZK(firms.pub.beerCost)}.
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => handlePub("beer")} disabled={acting} className="btn btn-primary btn-sm">Pozvat na pivo</button>
              <button onClick={() => handlePub("ignore")} disabled={acting} className="btn btn-ghost btn-sm">Nechat ho být</button>
            </div>
          </CardBody>
        </Card>
      )}
```

(Stávající lokální `formatCZK` na stránce nahradit importem z `@/lib/sponsor-owners`, ať nejsou dvě stejné funkce.)

- [ ] **Step 3: Sekce Firmy v okrese na konci stránky**

Za sekci Reklamní bannery vložit:

```tsx
      {firms && firms.firms.length > 0 && (
        <div>
          <SectionLabel>{"\u{1F91D}"} Firmy v okrese</SectionLabel>
          <p className="text-sm text-muted mb-2">
            Vztah k majitelům si budujte dopředu: pozvěte je na zápas, potkejte je v hospodě. Kdo vás má rád, dá víc.
          </p>
          <div className="space-y-2">
            {firms.firms.map((f) => (
              <Card key={f.sponsorId}>
                <CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <SponsorLink id={f.sponsorId} name={f.name} className="font-heading font-bold text-base" />
                      <div className="text-sm text-muted">
                        {sponsorTypeLabel(f.type)}
                        {f.owner ? ` · ${f.owner.firstName} ${f.owner.lastName}, ${personalityLabel(f.owner.personality)}` : ""}
                      </div>
                      <div className="text-sm mt-1">
                        {f.isMine
                          ? "Váš hlavní sponzor"
                          : f.mainHolder
                            ? <>Hlavní sponzor klubu <Link href={`/tym/${f.mainHolder.teamId}`} className="underline">{f.mainHolder.teamName}</Link></>
                            : `Volný, rozpočet zhruba ${formatCZK(f.budgetEstimate.low)} až ${formatCZK(f.budgetEstimate.high)} měsíčně`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-heading font-bold tabular-nums">{f.favor}</div>
                      <div className="text-xs text-muted">{favorLabel(f.favor)}</div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}
```

Doplnit import: `import { favorLabel, formatCZK, personalityLabel } from "@/lib/sponsor-owners";`

- [ ] **Step 4: Typecheck a build**

Run: `npm run typecheck && cd apps/web && npx next build --no-lint`
Expected: typecheck `5 successful`, build projde

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(hra)/sponzori/page.tsx"
git commit -m "feat(web): firmy v okrese a setkani s majitelem v hospode"
```

---

### Task 9: Nasazení na testing a ověření

**Files:** žádné nové (jen ověření; testovací data se po ověření vrátí)

- [ ] **Step 1: Push a počkat na deploy**

```bash
git push origin testing
```
Počkat, až `gh run list --branch testing --limit 1 --json headSha,status,conclusion` ukáže **aktuální** `headSha` jako `completed success` (ne předchozí běh). Při pádu `deploy-api-test` na síťové chybě Cloudflare spustit `gh run rerun <id> --failed`.

- [ ] **Step 2: API přes curl**

```bash
B=https://api-test.prales.fun/api; T=302a0ce7-428a-4da8-b4ac-40f27eb9a7d1
curl -s "$B/sponsors/93?teamId=$T" | python3 -m json.tool | head -40
curl -s "$B/teams/$T/sponsor-owners" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['firms']), d['firms'][0], d['pub'])"
curl -s "$B/sponsors/93" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['owner'], d['myTeam'])"
```
Expected: majitel s povahou; `myTeam` s náklonností 40 a rozmezím; 31 firem Prahy, volné nahoře; bez `teamId` je `myTeam: null`; opakované volání vrací stejného majitele.

- [ ] **Step 3: Chyby API (přihlášený prohlížeč, `javascript_tool`)**

- pozvání s cizím `matchId` → 400 „Zvát jde jen na nejbližší domácí zápas“,
- sponzor z jiného okresu (id z Prachatic) → 400,
- druhé pozvání stejného majitele na stejný zápas → 409.

Pozor: prázdný výsledek asynchronního `fetch` neznamená, že se neprovedl. Před opakováním ověřit stav v DB.

- [ ] **Step 4: Prohlížeč**

Na `https://test.prales.fun/sponzor/<id>` (sponzor z Prahy): karta majitele, pruh náklonnosti, odhad rozpočtu, tlačítko Pozvat na zápas → potvrzení → výsledek (přijal / odmítl s důvodem), transakce dárku ve Financích. Na `/sponzori` sekce Firmy v okrese (volné nahoře, odkazy na sponzory a kluby).

Setkání v hospodě ověřit vložením řádku do test DB:

```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'INSERT INTO sponsor_pub_encounters (id, sponsor_id, team_id, status, expires_at, created_at) VALUES ("test-pub-1", 90, "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1", "active", "2099-01-01", datetime("now"))'
```
Na `/sponzori` karta hospody → Pozvat na pivo → náklonnost +2, transakce. Druhý klik už vrací 410.

- [ ] **Step 5: Po zápase**

Po nejbližším odehraném domácím zápase testovacího týmu (testing má crony jako produkce) ověřit:

```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT status FROM sponsor_invitations WHERE team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1"'
```
Expected: přijaté pozvání má stav `attended` a náklonnost se posunula podle výsledku.

- [ ] **Step 6: Úklid testovacích dat a zpráva uživateli**

Smazat `test-pub-1`, pokud zůstal. Shrnout uživateli, co je na testingu a co čeká (prod: záloha, migrace 0215, 0216, 0217, pak merge; jen po výslovném souhlasu).
