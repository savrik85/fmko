# Incidenty v klubu, fáze 1 (Základ) — implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klub může být vykraden nebo poškozen: skutečně zmizí vybavení, rozbije se zařízení stadionu nebo trávník, přijde SMS a notifikace a incident je vidět na nové stránce. K dispozici je nová kategorie vybavení Zabezpečení areálu.

**Architecture:** Nový modul `apps/api/src/incidents/` rozdělený na čisté funkce (typy, nastavení, texty, pachatel, katalog, losování, popis) a DB vrstvu (stav klubu, dopady, denní krok). Denní krok běží v `processTeamDay` před blokem fanoušků. Pravdu drží tabulka `club_incidents`, škoda se provádí až po úspěšném zápisu incidentu.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, D1, Vitest, Next.js 15

**Spec:** `docs/superpowers/specs/2026-09-16-incidenty-design.md` (Části 3, 4a, 4b, 4e, 5a, 5c, 6, 11, 12, 16.1)

## Global Constraints

- **Branch:** `testing`. Push na `main` je zakázaný bez výslovného souhlasu uživatele.
- **UI a texty pro hráče česky**, s diakritikou, minimálně `text-sm`, jména hráčů klikatelná.
- **V textech pro hráče nikdy dlouhá pomlčka „—".** Jméno hráče jen v 1. pádě jako podmět; název věci nebo zařízení stojí samostatně za dvojtečkou.
- **Žádný prázdný catch.** Server `logger.warn({ module: "xyz" }, "popis", e)`, klient `console.error("popis:", e)`.
- **Tvrdé pravidlo konzistence:** incident nikdy nesáhne na věc, kterou klub nemá. Každá podmínka má test.
- **Determinismus:** denní los `createRng(seedFromString("incident|" + teamId + "|" + den))`. Nepřidávej `Math.random` do incidentních cest (výjimka: admin force).
- **Idempotence:** nejdřív `INSERT OR IGNORE` incidentu s deterministickým id, škoda až po `changes > 0`.
- **Migrace ručně:** `cd apps/api && npx wrangler d1 execute prales-db-test --remote --file migrations/<soubor>`. Na produkci nic.
- **Testy:** `cd apps/api && npx vitest run <cesta>`
- **Typecheck:** `cd apps/api && npx tsc --noEmit -p .` a `npm run typecheck` z rootu
- **Build FE:** `cd apps/web && npx next build --no-lint`

---

## Odchylky od specu (zapsat do specu v Tasku 13)

| Místo ve specu | Plán | Proč |
|---|---|---|
| 3 `loss` | JSON **pole** ztrát (`Ztrata[]`) | požár grilu může poškodit gril i stánek |
| 5a podíl cizího pachatele | pokus zvenku 50 %, **úspěch pokusu** = plot × světla × zabezpečení; neúspěch = nic se nestane | původní vzorec zabezpečením jen přesouval krádeže na hráče, místo aby je ubíral |
| 4b `kopnute_dvere` pokuta svazu | až ve fázi 10 (grémium) | sankce patří k napojení na grémium |
| 4b `svetlice` | pachatel hráč nebo cizí 50:50 | spec pachatele neurčoval |
| 5c startovní úroveň zabezpečení | vždy 0 | ostatní pozdější kategorie začínají taky na 0 |
| 6a AI kluby | ve fázi 1 se přeskakují | pozitivní incidenty AI klubů jsou fáze 11 |
| 7e uplynutí lhůty | ve fázi 1 jen výsledek `nevyreseno` + SMS | recidiva a tresty jsou fáze 2 |

---

## Struktura souborů

| Soubor | Odpovědnost |
|---|---|
| `apps/api/migrations/0204_incidenty_zaklad.sql` | tabulka `club_incidents`, sloupce `equipment.area_security*` |
| `apps/api/src/equipment/equipment-generator.ts` | kategorie `area_security` a `efektyZabezpeceni` |
| `apps/api/src/incidents/typy.ts` | typy, bez logiky |
| `apps/api/src/incidents/nastaveni.ts` | ladicí konstanty |
| `apps/api/src/incidents/texty.ts` | šablony textů |
| `apps/api/src/incidents/pachatel.ts` | váha hráče jako pachatele, úspěch zloděje zvenku |
| `apps/api/src/incidents/katalog.ts` | definice typů incidentů: podmínky a návrh |
| `apps/api/src/incidents/losovani.ts` | jeden los za den: spouštěné, pak náhodný problém |
| `apps/api/src/incidents/popis.ts` | ztráta do věty pro UI |
| `apps/api/src/incidents/testovaci-stav.ts` | fixture `stavKlubu()` a `hrac()` pro testy |
| `apps/api/src/incidents/stav-klubu.ts` | načtení `StavKlubu` z DB |
| `apps/api/src/incidents/dopady.ts` | zápis incidentu, provedení škody, oznámení, uplynutí lhůty |
| `apps/api/src/incidents/denni-krok.ts` | `zpracujIncidentyDne` |
| `apps/api/src/stadium/stadium-damage.ts` | `ROZBITNE_ZEVNITR`, `poskodZarizeni`, opravitelná zařízení |
| `apps/api/src/routes/incidents.ts` | GET seznam, admin force |
| `apps/web/src/app/dashboard/incidenty/page.tsx` | stránka incidentů (jen zobrazení) |

---

## Task 1: Migrace a kategorie Zabezpečení areálu

**Files:**
- Create: `apps/api/migrations/0204_incidenty_zaklad.sql`
- Modify: `apps/api/src/equipment/equipment-generator.ts` (`CATEGORIES` ř. 11, `CATEGORY_LABELS` ř. 22, `LEVEL_DESCRIPTIONS` konec, `EquipmentEffects`, `calculateEffects`, `UPGRADE_COSTS`, `UPGRADE_EFFECT_LABELS`)
- Modify: `apps/api/src/staff/staff-tick.ts:38` (`EQUIP_CATEGORIES`), `apps/api/src/season/daily-tick.ts:801` (`equipCategories`)
- Modify: `apps/web/src/app/dashboard/equipment/types.ts` (`EquipmentEffects`, `EQUIPMENT_ICONS`), `apps/web/src/app/dashboard/equipment/page.tsx` (`activeEffects`)
- Test: `apps/api/src/equipment/zabezpeceni.test.ts`

**Interfaces:**
- Produces: `efektyZabezpeceni(level: number, condition: number): { theftRiskMul: number; alarmChance: number; cameraCoverage: number }`, `ZABEZPECENI_MIN_STAV = 40`, pole `theftRiskMul`, `alarmChance`, `cameraCoverage` v `EquipmentEffects`. `cameraCoverage`: 0 žádná, 1 kabiny a sklad, 2 celý areál.

- [ ] **Step 1: Napsat migraci**

`apps/api/migrations/0204_incidenty_zaklad.sql`:

```sql
-- 0204: Incidenty v klubu, fáze 1 (docs/superpowers/specs/2026-09-16-incidenty-design.md, Část 3)
--
-- Aplikovat ručně:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0204_incidenty_zaklad.sql
-- ALTER TABLE ADD COLUMN nezná IF NOT EXISTS: při opakovaném běhu je „duplicate column" v pořádku.

CREATE TABLE IF NOT EXISTS club_incidents (
  id                TEXT PRIMARY KEY,        -- inc-{teamId}-{kind}-{YYYY-MM-DD}
  team_id           TEXT NOT NULL,
  league_id         TEXT,
  season_number     INTEGER NOT NULL,
  kind              TEXT NOT NULL,
  category          TEXT NOT NULL CHECK(category IN ('kradez','poskozeni','zivotni','pozitivni')),
  status            TEXT NOT NULL CHECK(status IN ('hrozi','otevreny','policie','probiha','uzavreny')),
  severity          INTEGER NOT NULL DEFAULT 1 CHECK(severity BETWEEN 1 AND 3),
  game_date         TEXT NOT NULL,
  deadline          TEXT,
  ends_on           TEXT,
  culprit_type      TEXT CHECK(culprit_type IN ('hrac','cizi','zamestnanec','nikdo')),
  culprit_player_id TEXT,                    -- PRAVDA, API ji vrací jen při culprit_revealed = 1
  culprit_staff_id  TEXT,
  culprit_revealed  INTEGER NOT NULL DEFAULT 0,
  subject_player_id TEXT,
  loss              TEXT NOT NULL DEFAULT '[]', -- JSON pole ztrát (typ Ztrata v incidents/typy.ts)
  recovered         INTEGER NOT NULL DEFAULT 0,
  accusations       INTEGER NOT NULL DEFAULT 0,
  police_result_on  TEXT,
  police_success    INTEGER,
  bazar_on          TEXT,
  resolution        TEXT,
  resolution_data   TEXT,
  text              TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  resolved_on       TEXT
);
CREATE INDEX IF NOT EXISTS idx_club_incidents_team ON club_incidents(team_id, status, game_date DESC);
CREATE INDEX IF NOT EXISTS idx_club_incidents_player ON club_incidents(culprit_player_id);

ALTER TABLE equipment ADD COLUMN area_security INTEGER NOT NULL DEFAULT 0;
ALTER TABLE equipment ADD COLUMN area_security_condition INTEGER NOT NULL DEFAULT 50;
```

- [ ] **Step 2: Napsat padající test**

`apps/api/src/equipment/zabezpeceni.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  calculateEffects, CATEGORIES, CATEGORY_LABELS, efektyZabezpeceni,
  getLevelDescription, getUpgradeEffectLabel,
} from "./equipment-generator";

describe("zabezpečení areálu", () => {
  it("je plnohodnotná kategorie vybavení", () => {
    expect(CATEGORIES).toContain("area_security");
    expect(CATEGORY_LABELS.area_security).toBe("Zabezpečení areálu");
    for (const lv of [0, 1, 2, 3]) expect(getLevelDescription("area_security", lv)).not.toBe("");
    for (const lv of [1, 2, 3]) expect(getUpgradeEffectLabel("area_security", lv)).not.toBe("");
  });

  it("zámek chrání i sešlý, alarm a kamera jen v použitelném stavu", () => {
    expect(efektyZabezpeceni(1, 10)).toEqual({ theftRiskMul: 0.6, alarmChance: 0, cameraCoverage: 0 });
    expect(efektyZabezpeceni(2, 39)).toEqual({ theftRiskMul: 0.35, alarmChance: 0, cameraCoverage: 0 });
    expect(efektyZabezpeceni(2, 40)).toEqual({ theftRiskMul: 0.35, alarmChance: 0.5, cameraCoverage: 1 });
    expect(efektyZabezpeceni(3, 90)).toEqual({ theftRiskMul: 0.2, alarmChance: 0.7, cameraCoverage: 2 });
  });

  it("klub bez zabezpečení nemá žádnou ochranu", () => {
    const fx = calculateEffects({}, {});
    expect(fx.theftRiskMul).toBe(1);
    expect(fx.alarmChance).toBe(0);
    expect(fx.cameraCoverage).toBe(0);
  });
});
```

- [ ] **Step 3: Spustit test, musí selhat**

Run: `cd apps/api && npx vitest run src/equipment/zabezpeceni.test.ts`
Expected: FAIL, `efektyZabezpeceni` není exportovaná.

- [ ] **Step 4: Implementovat kategorii v `equipment-generator.ts`**

`CATEGORIES`: poslední řádek pole změnit na

```ts
  "sports_drinks", "raffle", "pa_system", "trophy_case", "area_security",
```

`CATEGORY_LABELS`: za `trophy_case: "Klubová kronika a vitrína",` přidat

```ts
  area_security: "Zabezpečení areálu",
```

`LEVEL_DESCRIPTIONS`: za blok `trophy_case: [ … ],` přidat

```ts
  area_security: [
    "Klíč je pod rohožkou",
    "Nový zámek a mříže na skladu",
    "Alarm a kamera nad vchodem do kabin",
    "Kamerový systém s nahráváním, čidly a světly",
  ],
```

`EquipmentEffects`: za `loyaltyMod: number; …` přidat

```ts
  theftRiskMul: number;         // zabezpečení: úspěch vloupání zvenku ×mul (zámek chrání i sešlý)
  alarmChance: number;          // zabezpečení: šance, že alarm zloděje vyplaší (0 pod ZABEZPECENI_MIN_STAV)
  cameraCoverage: number;       // zabezpečení: 0 nic, 1 kabiny a sklad, 2 celý areál (0 pod ZABEZPECENI_MIN_STAV)
```

Nad `export function calculateEffects` vložit:

```ts
/** Pod tímhle stavem alarm ani kamera nefungují. Zámek chrání dál. */
export const ZABEZPECENI_MIN_STAV = 40;
const ZABEZPECENI_RIZIKO = [1, 0.6, 0.35, 0.2];
const ZABEZPECENI_ALARM = [0, 0, 0.5, 0.7];

/**
 * Efekty zabezpečení areálu. Nepočítají se přes `lv × stav` jako ostatní vybavení:
 * zámek je zámek i zrezivělý, kdežto kamera, která nenahrává, nechrání vůbec.
 */
export function efektyZabezpeceni(level: number, condition: number): {
  theftRiskMul: number; alarmChance: number; cameraCoverage: number;
} {
  const lv = Math.max(0, Math.min(MAX_LEVEL, Math.round(level)));
  const funguje = condition >= ZABEZPECENI_MIN_STAV;
  return {
    theftRiskMul: ZABEZPECENI_RIZIKO[lv],
    alarmChance: funguje ? ZABEZPECENI_ALARM[lv] : 0,
    cameraCoverage: funguje ? Math.max(0, lv - 1) : 0,
  };
}
```

`calculateEffects`: v návratovém objektu za `loyaltyMod: eff("trophy_case") * 0.12,` přidat

```ts
    ...efektyZabezpeceni(levels.area_security ?? 0, conditions.area_security_condition ?? 50),
```

`UPGRADE_COSTS`: za `trophy_case: [0, 3000, 12000, 35000],` přidat

```ts
  area_security:   [0, 5000, 25000, 70000],
```

`UPGRADE_EFFECT_LABELS`: za řádek `trophy_case` přidat

```ts
  area_security:   ["", "Vloupání zvenku o 40 % méně", "Vloupání zvenku o 65 % méně, alarm a kamera u kabin", "Vloupání zvenku o 80 % méně, kamery v celém areálu"],
```

- [ ] **Step 5: Doplnit ruční seznamy kategorií**

`apps/api/src/staff/staff-tick.ts`, konec `EQUIP_CATEGORIES`:

```ts
  "sports_drinks", "raffle", "pa_system", "trophy_case", "area_security",
];
```

`apps/api/src/season/daily-tick.ts:803`, konec `equipCategories`:

```ts
    "sports_drinks", "raffle", "pa_system", "trophy_case", "area_security"];
```

- [ ] **Step 6: Frontend vybavení**

`apps/web/src/app/dashboard/equipment/types.ts`, v `EquipmentEffects` za `loyaltyMod?: number;` přidat `theftRiskMul?: number; alarmChance?: number; cameraCoverage?: number;` a v `EQUIPMENT_ICONS` za `trophy_case: "🏆",` přidat `area_security: "🔒",`.

`apps/web/src/app/dashboard/equipment/page.tsx`, v poli `activeEffects` za řádek `loyaltyMod` přidat:

```tsx
    (fx.theftRiskMul ?? 1) < 0.99 && { label: "Zabezpečení", value: `vloupání zvenku -${Math.round((1 - (fx.theftRiskMul ?? 1)) * 100)}%`, icon: "🔒" },
    (fx.cameraCoverage ?? 0) > 0 && { label: "Kamery", value: fx.cameraCoverage === 2 ? "celý areál" : "kabiny a sklad", icon: "📹" },
```

- [ ] **Step 7: Spustit testy**

Run: `cd apps/api && npx vitest run src/equipment && npx tsc --noEmit -p .`
Expected: PASS včetně `equipment-pricing.test.ts` (iteruje přes `CATEGORIES`, nová kategorie musí projít invarianty bazaru).

- [ ] **Step 8: Commit**

```bash
git add apps/api/migrations/0204_incidenty_zaklad.sql apps/api/src/equipment apps/api/src/staff/staff-tick.ts apps/api/src/season/daily-tick.ts apps/web/src/app/dashboard/equipment
git commit -m "feat(vybaveni): zabezpeceni arealu a tabulka incidentu"
```

---
## Task 2: Typy, nastavení a texty

**Files:**
- Create: `apps/api/src/incidents/typy.ts`, `apps/api/src/incidents/nastaveni.ts`, `apps/api/src/incidents/texty.ts`, `apps/api/src/incidents/testovaci-stav.ts`
- Test: `apps/api/src/incidents/texty.test.ts`

**Interfaces:**
- Produces: typy `KategorieIncidentu`, `StavIncidentu`, `TypPachatele`, `Ztrata`, `HracKlubu`, `StavKlubu`, `NavrhIncidentu`; konstanty z `nastaveni.ts`; `TEXTY`, `text(rng, klic, hodnoty)`, `vypln(sablona, hodnoty)`; fixture `stavKlubu(over)`, `hrac(over)`.

- [ ] **Step 1: Typy**

`apps/api/src/incidents/typy.ts`:

```ts
/**
 * Typy klubových incidentů (docs/superpowers/specs/2026-09-16-incidenty-design.md).
 * Jen typy, žádná logika.
 */

export type KategorieIncidentu = "kradez" | "poskozeni" | "zivotni" | "pozitivni";
export type StavIncidentu = "hrozi" | "otevreny" | "policie" | "probiha" | "uzavreny";
export type TypPachatele = "hrac" | "cizi" | "zamestnanec" | "nikdo";

/** Jedna skutečná škoda. Incident jich může mít víc (gril i stánek). */
export type Ztrata =
  | { typ: "vybaveni"; kategorie: string; uroven: number; stav: number; urovniDolu: number }
  | { typ: "vybaveni_stav"; kategorie: string; stavPred: number; stavPo: number }
  | { typ: "stadion"; zarizeni: string; urovni: number; damageId?: string }
  | { typ: "travnik"; pred: number; po: number };

export interface HracKlubu {
  id: string;
  /** „Franta Novák", vždy 1. pád. */
  jmeno: string;
  alkohol: number;
  disciplina: number;
  vernost: number;
  temperament: number;
  vztahKTrenerovi: number;
  transferUnrest: number;
}

export interface StavKlubu {
  teamId: string;
  leagueId: string | null;
  seasonNumber: number;
  /** Herní datum ISO, tvar `teams.game_date`. */
  gameDate: string;
  /** `YYYY-MM-DD` herního dne. */
  den: string;
  /** Úrovně i stavy vybavení: `balls`, `balls_condition`, … */
  vybaveni: Record<string, number>;
  /** Úrovně zařízení stadionu a `pitch_condition`. */
  stadion: Record<string, number>;
  /** Aktivní hráči klubu. */
  kadr: HracKlubu[];
  /** Soutěžní zápas předchozího herního dne, `null` když se nehrálo. */
  vcera: { vyhra: boolean; cervenaKarta: string[] } | null;
  /** Hráči klubu (ne hosté, ne trenér), kteří byli předchozí den v hospodě. */
  hospodaVcera: string[];
  odehranychZapasu: number;
  /** Otevřené krádeže a poškození (`otevreny` nebo `policie`). */
  otevreneProblemy: number;
  /** kind → `YYYY-MM-DD` posledního výskytu v aktuální sezóně. */
  posledniVyskyt: Record<string, string>;
}

export interface NavrhIncidentu {
  kind: string;
  category: KategorieIncidentu;
  status: StavIncidentu;
  severity: 1 | 2 | 3;
  culpritType: TypPachatele;
  culpritPlayerId: string | null;
  culpritRevealed: boolean;
  ztraty: Ztrata[];
  text: string;
}
```

- [ ] **Step 2: Nastavení**

`apps/api/src/incidents/nastaveni.ts`:

```ts
/** Ladicí konstanty incidentů. Výchozí hodnoty ze specu, Část 4e a 5a. */

export const SANCE_PROBLEMU_ZA_DEN = 0.04;
export const COOLDOWN_TYPU_DNI = 21;
export const LHUTA_ROZHODNUTI_DNI = 7;
export const MIN_ODEHRANYCH_ZAPASU = 3;
export const MAX_OTEVRENYCH_PROBLEMU = 1;
/** Pod touhle vahou (pachatel.ts) hráč nekrade ani neničí. */
export const PRAH_VAHY_PACHATELE = 1.2;
/** Kolik pokusů o krádež je zvenku. Zbytek jsou hráči s klíčem. */
export const PODIL_POKUSU_ZVENKU = 0.5;
/** Šance, že se spouštěný incident stane, když je spouštěč splněný. */
export const SANCE_SPOUSTENYCH: Record<string, number> = {
  oslava_v_kabine: 0.25,
  kopnute_dvere: 0.35,
  svetlice: 0.15,
};
/** Odesílatel SMS o incidentech. Obecná klubová role, existuje v každém klubu. */
export const SMS_ROLE_KUSTOD = "Kustod";
```

- [ ] **Step 3: Napsat padající test textů**

`apps/api/src/incidents/texty.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { TEXTY, text, vypln } from "./texty";

describe("texty incidentů", () => {
  it("žádná šablona nemá dlouhou pomlčku a každá končí tečkou", () => {
    for (const [klic, sablony] of Object.entries(TEXTY)) {
      expect(sablony.length, klic).toBeGreaterThan(0);
      for (const s of sablony) {
        expect(s, klic).not.toContain("—");
        expect(s.trim(), klic).toMatch(/[.!]$/);
      }
    }
  });

  it("doplní hodnoty a neznámou značku nechá být", () => {
    expect(vypln("Pryč je: {vec}.", { vec: "Dresy" })).toBe("Pryč je: Dresy.");
    expect(vypln("{x}.", {})).toBe("{x}.");
  });

  it("výběr šablony je deterministický", () => {
    expect(text(createRng(7), "svetlice")).toBe(text(createRng(7), "svetlice"));
  });
});
```

Run: `cd apps/api && npx vitest run src/incidents/texty.test.ts` → FAIL (modul neexistuje).

- [ ] **Step 4: Texty**

`apps/api/src/incidents/texty.ts`:

```ts
import type { Rng } from "../generators/rng";

/**
 * Šablony textů incidentů.
 *
 * Pravidla (feedback uživatele a reference_generovane_ceske_texty):
 * - nikdy dlouhá pomlčka;
 * - jméno hráče jen v 1. pádě jako podmět ({hrac});
 * - název věci nebo zařízení stojí samostatně za dvojtečkou ({vec}, {zarizeni}),
 *   protože názvy mají různý rod i číslo a nedá se s nimi shodovat sloveso.
 */
export const TEXTY = {
  vloupani_zvenku: [
    "V noci někdo vypáčil dveře skladu. Zmizelo vybavení: {vec}.",
    "Rozbité okýnko u skladu a prázdné regály. Chybí vybavení: {vec}.",
    "Někdo přelezl plot a vykradl sklad. Pryč je vybavení: {vec}.",
  ],
  vloupani_zevnitr: [
    "Ze skladu zmizelo vybavení: {vec}. Zámek je celý, někdo odemkl klíčem.",
    "Ráno chybělo ve skladu vybavení: {vec}. Po vloupání nejsou žádné stopy.",
    "Sklad byl zamčený, a přesto je pryč vybavení: {vec}.",
  ],
  vitrina: [
    "Z vitríny v klubovně zmizely poháry.",
    "Někdo vybral vitrínu s poháry, zůstaly jen prázdné poličky.",
    "Poháry z vitríny jsou pryč, v kronice zbyly jen fotky.",
  ],
  dodavka_pujcena: [
    "Klubová dodávka stála ráno jinde, s prázdnou nádrží a novou ťukou na blatníku.",
    "Někdo si přes noc půjčil klubovou dodávku. Vrátila se s rozbitým zrcátkem a blátem až po střechu.",
    "Dodávka se vrátila z nočního výletu a je na ní každý kilometr znát.",
  ],
  dodavka_ukradena: [
    "Z parkoviště u hřiště přes noc zmizela klubová dodávka.",
    "Klubová dodávka ráno nestála na svém místě. Zůstaly jen střepy z okénka.",
    "Někdo ukradl klubovou dodávku. Na parkovišti je jen olejová skvrna.",
  ],
  kradez_kamery: [
    "Někdo v noci ukradl kameru nad vchodem do kabin.",
    "Kamerový systém je pryč, zloděj odnesl i nahrávací box.",
    "Z areálu zmizely kamery. Kdo je sebral, nenatočila ani jedna.",
  ],
  oslava_v_kabine: [
    "Oslava výhry se z hospody přesunula do kabiny a skončila špatně. Rozbité: {zarizeni}.",
    "Po včerejší výhře to kluci v kabině přehnali. Rozbité: {zarizeni}.",
    "Noční pokračování oslavy v kabině klub něco stálo. Rozbité: {zarizeni}.",
  ],
  kopnute_dvere: [
    "{hrac} po vyloučení vykopl dveře kabiny. Rozbité: {zarizeni}.",
    "{hrac} si vztek z červené karty vybil na kabině. Rozbité: {zarizeni}.",
    "{hrac} po červené kartě mlátil do všeho, co bylo v kabině. Rozbité: {zarizeni}.",
  ],
  koleje_trakturek: [
    "Někdo se v noci projel na zahradním traktůrku po hřišti. Trávník má koleje.",
    "Přes hřiště vedou koleje od traktůrku. Kdo se vozil, se neví.",
    "Traktůrek stál ráno uprostřed hřiště a za ním rozrytý trávník.",
  ],
  pozar_grilu: [
    "Při grilování se to vymklo kontrole a oheň poničil vybavení: {vec}.",
    "Od grilu chytil přístřešek. Poškozené vybavení: {vec}.",
    "Oheň od grilu musel hasit až soused. Poškozené vybavení: {vec}.",
  ],
  pozar_grilu_stanek: [
    "Oheň přeskočil i na stánek. Rozbité: {zarizeni}.",
    "Plameny olízly i stánek. Rozbité: {zarizeni}.",
    "Shořela i část stánku. Rozbité: {zarizeni}.",
  ],
  svetlice: [
    "Po výhře někdo odpálil světlice přímo na hřišti. Trávník má spálené fleky.",
    "Oslava výhry skončila světlicemi na trávníku. Na hřišti jsou černé kruhy.",
    "Kdosi po zápase zapálil světlice na hřišti. Trávník to odnesl.",
  ],
  vandal_zarizeni: [
    "Vandalové v noci řádili v areálu. Rozbité: {zarizeni}.",
    "Někdo přes noc ničil areál. Rozbité: {zarizeni}.",
    "Ráno bylo v areálu co uklízet. Rozbité: {zarizeni}.",
  ],
  vandal_travnik: [
    "Někdo v noci dělal na hřišti hodiny autem. Trávník je rozrytý.",
    "Přes hřiště vedou stopy od auta, někdo si tu v noci zajezdil.",
    "Vandalové rozryli trávník, na hřišti jsou hluboké koleje.",
  ],
  alarm_vyplasil: [
    "V noci se u skladu rozječel alarm. Zloděj utekl a nic neodnesl.",
    "Alarm vyplašil někoho, kdo se dobýval do skladu. Nic nechybí.",
    "Kamera zachytila stín u dveří skladu, pak se spustil alarm. Nic nezmizelo.",
  ],
  lhuta_kradez: [
    "Uzavřeno bez výsledku: {nazev}. Kdo za tím stál, se nezjistilo.",
  ],
  lhuta_poskozeni: [
    "Uzavřeno bez výsledku: {nazev}. Škoda zůstává na klubu.",
  ],
} as const satisfies Record<string, readonly string[]>;

export type KlicTextu = keyof typeof TEXTY;

export function vypln(sablona: string, hodnoty: Record<string, string>): string {
  return sablona.replace(/\{(\w+)\}/g, (cela, klic: string) => hodnoty[klic] ?? cela);
}

export function text(rng: Rng, klic: KlicTextu, hodnoty: Record<string, string> = {}): string {
  return vypln(rng.pick(TEXTY[klic]), hodnoty);
}
```

- [ ] **Step 5: Fixture pro testy**

`apps/api/src/incidents/testovaci-stav.ts`:

```ts
/** Fixture pro testy incidentů. Mimo testy se nepoužívá. */
import type { HracKlubu, StavKlubu } from "./typy";

export function hrac(over: Partial<HracKlubu> = {}): HracKlubu {
  return {
    id: "h1", jmeno: "Franta Novák",
    alkohol: 50, disciplina: 50, vernost: 50, temperament: 50,
    vztahKTrenerovi: 50, transferUnrest: 0,
    ...over,
  };
}

/** Problémový hráč: jistý kandidát na pachatele. */
export const PROBLEMOVY = hrac({ id: "p", jmeno: "Pepa Průšvih", alkohol: 90, disciplina: 15, vernost: 20, vztahKTrenerovi: 25 });

export function stavKlubu(over: Partial<StavKlubu> = {}): StavKlubu {
  return {
    teamId: "tym-a", leagueId: "liga-1", seasonNumber: 4,
    gameDate: "2026-09-16T16:00:00.000Z", den: "2026-09-16",
    vybaveni: {}, stadion: { pitch_condition: 70 }, kadr: [],
    vcera: null, hospodaVcera: [], odehranychZapasu: 10,
    otevreneProblemy: 0, posledniVyskyt: {},
    ...over,
  };
}
```

- [ ] **Step 6: Testy musí projít**

Run: `cd apps/api && npx vitest run src/incidents/texty.test.ts && npx tsc --noEmit -p .`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/incidents
git commit -m "feat(incidenty): typy, nastaveni a texty"
```

---

## Task 3: Pachatel

**Files:**
- Create: `apps/api/src/incidents/pachatel.ts`
- Test: `apps/api/src/incidents/pachatel.test.ts`

**Interfaces:**
- Consumes: `HracKlubu` (Task 2), `PRAH_VAHY_PACHATELE` (Task 2)
- Produces: `vahaPachatele(h: HracKlubu): number`, `vyberHrace(kandidati: HracKlubu[], rng: Rng): HracKlubu | null`, `sanceUspechuZvenku(stadion: Record<string, number>, theftRiskMul: number): number`

- [ ] **Step 1: Napsat padající test**

`apps/api/src/incidents/pachatel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { PRAH_VAHY_PACHATELE } from "./nastaveni";
import { sanceUspechuZvenku, vahaPachatele, vyberHrace } from "./pachatel";
import { hrac, PROBLEMOVY } from "./testovaci-stav";

describe("pachatel", () => {
  it("disciplinovaný, věrný a střízlivý hráč s dobrým vztahem k trenérovi nekrade", () => {
    const svatous = hrac({ id: "s", alkohol: 5, disciplina: 95, vernost: 95, vztahKTrenerovi: 90 });
    expect(vahaPachatele(svatous)).toBeLessThan(PRAH_VAHY_PACHATELE);
    for (let seed = 1; seed <= 200; seed++) expect(vyberHrace([svatous], createRng(seed))).toBeNull();
  });

  it("problémový hráč je kandidát", () => {
    expect(vahaPachatele(PROBLEMOVY)).toBeGreaterThanOrEqual(PRAH_VAHY_PACHATELE);
    expect(vyberHrace([PROBLEMOVY], createRng(3))?.id).toBe("p");
  });

  it("truc po odmítnutém přestupu váhu zvedá", () => {
    expect(vahaPachatele(hrac({ transferUnrest: 80 }))).toBeGreaterThan(vahaPachatele(hrac({ transferUnrest: 0 })));
  });

  it("výběr je deterministický", () => {
    const kadr = [PROBLEMOVY, hrac({ id: "q", alkohol: 80, disciplina: 20 }), hrac({ id: "r" })];
    expect(vyberHrace(kadr, createRng(42))?.id).toBe(vyberHrace(kadr, createRng(42))?.id);
  });

  it("plot, osvětlení a zabezpečení odrazují zloděje zvenku", () => {
    expect(sanceUspechuZvenku({}, 1)).toBe(1);
    expect(sanceUspechuZvenku({ fence: 3, lighting: 3 }, 0.2)).toBeCloseTo(0.6 * 0.8 * 0.2);
  });
});
```

Run: `cd apps/api && npx vitest run src/incidents/pachatel.test.ts` → FAIL (modul neexistuje).

- [ ] **Step 2: Implementace**

`apps/api/src/incidents/pachatel.ts`:

```ts
/**
 * Kdo za incidentem stojí (spec Část 5a).
 *
 * Čisté funkce bez DB. Hráč krade nebo ničí podle povahy; pod prahem váhy
 * se nestane pachatelem nikdy. Zloděje zvenku odrazuje plot, osvětlení
 * a zabezpečení areálu, na hráče s klíčem od kabiny to nepůsobí.
 */

import type { Rng } from "../generators/rng";
import { PRAH_VAHY_PACHATELE } from "./nastaveni";
import type { HracKlubu } from "./typy";

export function vahaPachatele(h: HracKlubu): number {
  return (h.alkohol / 100) * 1.0
    + ((100 - h.disciplina) / 100) * 1.2
    + ((100 - h.vernost) / 100) * 0.8
    + ((100 - h.vztahKTrenerovi) / 100) * 0.6
    + (h.transferUnrest / 100) * 0.5;
}

/** Vážený výběr pachatele z kandidátů nad prahem. `null`, když nikdo práh nepřekročí. */
export function vyberHrace(kandidati: HracKlubu[], rng: Rng): HracKlubu | null {
  const vahy: Record<string, number> = {};
  for (const h of kandidati) {
    const v = vahaPachatele(h);
    // +0,1, aby i hráč těsně nad prahem měl nenulovou váhu.
    if (v >= PRAH_VAHY_PACHATELE) vahy[h.id] = v - PRAH_VAHY_PACHATELE + 0.1;
  }
  if (Object.keys(vahy).length === 0) return null;
  const id = rng.weighted(vahy);
  return kandidati.find((h) => h.id === id) ?? null;
}

const PLOT = [1, 0.85, 0.7, 0.6];
const SVETLA = [1, 0.9, 0.85, 0.8];

function index(uroven: number | undefined): number {
  return Math.max(0, Math.min(3, Math.round(uroven ?? 0)));
}

/**
 * Šance, že pokus zvenku uspěje. `theftRiskMul` z `efektyZabezpeceni`;
 * tam, kde zabezpečení nehraje roli (krádež samotných kamer, vandal), se předává 1.
 */
export function sanceUspechuZvenku(stadion: Record<string, number>, theftRiskMul: number): number {
  return PLOT[index(stadion.fence)] * SVETLA[index(stadion.lighting)] * theftRiskMul;
}
```

- [ ] **Step 3: Testy musí projít**

Run: `cd apps/api && npx vitest run src/incidents/pachatel.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/incidents/pachatel.ts apps/api/src/incidents/pachatel.test.ts
git commit -m "feat(incidenty): vyber pachatele a odrazeni zlodeje zvenku"
```

---

## Task 4: Poškození zevnitř ve `stadium-damage.ts`

**Files:**
- Modify: `apps/api/src/stadium/stadium-damage.ts` (za `ROZBITNE` ř. 24–27; `opravVybaveni` ř. ~163 `ROZBITNE.find`)
- Test: `apps/api/src/stadium/stadium-damage.test.ts`

**Interfaces:**
- Produces: `ROZBITNE_ZEVNITR` (`readonly ["changing_rooms","showers","toilets","refreshments"]`), `jeOpravitelne(facility: string): boolean`, `poskodZarizeni(db, { teamId, incidentId, facility, levels, gameDate, popis }): Promise<{ damageId: string; label: string; levels: number; cost: number } | null>`

- [ ] **Step 1: Napsat padající test**

`apps/api/src/stadium/stadium-damage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { jeOpravitelne, ROZBITNE, ROZBITNE_ZEVNITR } from "./stadium-damage";

describe("co jde rozbít a opravit", () => {
  it("hráči se dostanou i do kabin, fanoušci ne", () => {
    expect(ROZBITNE_ZEVNITR).toContain("changing_rooms");
    expect(ROZBITNE).not.toContain("changing_rooms");
  });

  it("opravit jde všechno, co jde rozbít, a nic jiného", () => {
    for (const k of [...ROZBITNE, ...ROZBITNE_ZEVNITR]) expect(jeOpravitelne(k)).toBe(true);
    expect(jeOpravitelne("lighting")).toBe(false);
    expect(jeOpravitelne("security")).toBe(false);
  });
});
```

Run: `cd apps/api && npx vitest run src/stadium/stadium-damage.test.ts` → FAIL.

- [ ] **Step 2: Implementace**

Za `export type RozbitnyPrvek = (typeof ROZBITNE)[number];` vložit:

```ts
/**
 * Co můžou rozbít hráči klubu. Na rozdíl od fanoušků se dostanou i do kabin
 * (spec incidentů, Část 4b).
 */
export const ROZBITNE_ZEVNITR = ["changing_rooms", "showers", "toilets", "refreshments"] as const;

const OPRAVITELNE: readonly string[] = [...new Set<string>([...ROZBITNE, ...ROZBITNE_ZEVNITR])];

/** Zařízení, které jde poškodit a opravit. Název jde do SQL, proto whitelist. */
export function jeOpravitelne(facility: string): boolean {
  return OPRAVITELNE.includes(facility);
}
```

Za funkci `rozbijVybaveni` vložit:

```ts
/**
 * Poškodí konkrétní zařízení kvůli klubovému incidentu.
 *
 * Stejná idempotence jako `rozbijVybaveni`: klíč `incident_id` je `{incidentId}-{zařízení}`,
 * takže jeden incident smí poškodit dvě různá zařízení (gril i stánek), ale žádné dvakrát.
 */
export async function poskodZarizeni(
  db: D1Database,
  opts: { teamId: string; incidentId: string; facility: string; levels: number; gameDate: string; popis: string },
): Promise<{ damageId: string; label: string; levels: number; cost: number } | null> {
  if (!jeOpravitelne(opts.facility)) {
    logger.error({ module: M }, `poškození neznámého zařízení ${opts.facility}`);
    return null;
  }
  const stadion = await db
    .prepare(`SELECT ${opts.facility} AS u FROM stadiums WHERE team_id = ?`)
    .bind(opts.teamId)
    .first<{ u: number }>()
    .catch((e) => { logger.warn({ module: M }, `stadion ${opts.teamId}`, e); return null; });
  const pred = stadion?.u ?? 0;
  const levels = Math.min(pred, opts.levels);
  if (levels <= 0) return null;

  const label = FACILITY_LABELS[opts.facility] ?? opts.facility;
  const cost = cenaOpravy(opts.facility, pred, levels);
  const klic = `${opts.incidentId}-${opts.facility}`;
  const damageId = `dmg-${klic}`;

  const zapis = await db
    .prepare(
      `INSERT OR IGNORE INTO stadium_damage
         (id, team_id, facility, levels, repair_cost, incident_id, popis, game_date)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .bind(damageId, opts.teamId, opts.facility, levels, cost, klic, opts.popis, opts.gameDate)
    .run()
    .catch((e) => { logger.error({ module: M }, `zápis poškození ${klic}`, e); return null; });
  if ((zapis?.meta?.changes ?? 0) === 0) return null;

  await db
    .prepare(`UPDATE stadiums SET ${opts.facility} = MAX(0, ${opts.facility} - ?) WHERE team_id = ?`)
    .bind(levels, opts.teamId)
    .run()
    .catch((e) => { logger.error({ module: M }, `sražení ${opts.facility} u ${opts.teamId}`, e); });

  return { damageId, label, levels, cost };
}
```

V `opravVybaveni` nahradit

```ts
  const facility = ROZBITNE.find((k) => k === dmg.facility);
```

za

```ts
  // Opravit jde i to, co rozbili hráči uvnitř (šatny, sprchy). Dřív whitelist znal jen
  // věci rozbitné fanoušky a oprava šaten by skončila „neznámé zařízení".
  const facility = OPRAVITELNE.find((k) => k === dmg.facility);
```

- [ ] **Step 3: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/stadium && npx tsc --noEmit -p .`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/stadium/stadium-damage.ts apps/api/src/stadium/stadium-damage.test.ts
git commit -m "feat(stadion): poskozeni zarizeni hraci vcetne kabin a jejich oprava"
```

---

## Task 5: Katalog krádeží a poškození

**Files:**
- Create: `apps/api/src/incidents/katalog.ts`
- Test: `apps/api/src/incidents/katalog.test.ts`

**Interfaces:**
- Consumes: `vyberHrace`, `sanceUspechuZvenku` (Task 3); `ROZBITNE_ZEVNITR` (Task 4); `efektyZabezpeceni`, `cumulativeInvestment`, `CATEGORY_LABELS` (Task 1, `equipment-generator.ts`); `FACILITY_LABELS` (`stadium/stadium-generator.ts`); `text` (Task 2); `PODIL_POKUSU_ZVENKU` (Task 2)
- Produces:

```ts
export interface DefiniceIncidentu {
  kind: string;
  label: string;
  emoji: string;
  category: KategorieIncidentu;
  vaha: number;           // váha v náhodném losu, 0 = jen spouštěný nebo vedlejší výsledek
  spousteny: boolean;
  muze: (stav: StavKlubu) => boolean;
  vytvor: (stav: StavKlubu, rng: Rng) => NavrhIncidentu | null;
}
export const PRENOSNE: readonly string[];
export const KATALOG: DefiniceIncidentu[];
export const KATALOG_PODLE_KIND: Map<string, DefiniceIncidentu>;
```

Kindy fáze 1: `vloupani_sklad`, `vitrina`, `dodavka_pujcena`, `dodavka_ukradena`, `kradez_kamery`, `oslava_v_kabine`, `kopnute_dvere`, `koleje_trakturek`, `pozar_grilu`, `svetlice`, `vandal`, `alarm_vyplasil` (jen výsledek jiného typu, sám se nelosuje).

- [ ] **Step 1: Napsat padající test**

`apps/api/src/incidents/katalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "../generators/rng";
import { KATALOG, KATALOG_PODLE_KIND } from "./katalog";
import { hrac, PROBLEMOVY, stavKlubu } from "./testovaci-stav";

const def = (kind: string) => {
  const d = KATALOG_PODLE_KIND.get(kind);
  if (!d) throw new Error(`chybí ${kind}`);
  return d;
};
const proSeedy = (fn: (rng: Rng) => void, pocet = 300) => {
  for (let s = 1; s <= pocet; s++) fn(createRng(s));
};

describe("katalog: každý typ je jednou a má popisek", () => {
  it("unikátní kindy", () => {
    const kindy = KATALOG.map((d) => d.kind);
    expect(new Set(kindy).size).toBe(kindy.length);
    for (const d of KATALOG) {
      expect(d.label.length, d.kind).toBeGreaterThan(0);
      expect(d.emoji.length, d.kind).toBeGreaterThan(0);
    }
  });
});

describe("katalog: nikdy se nesáhne na věc, kterou klub nemá", () => {
  it("vloupání jen s něčím ve skladu a vezme jen to, co klub má", () => {
    expect(def("vloupani_sklad").muze(stavKlubu())).toBe(false);
    const s = stavKlubu({ vybaveni: { jerseys: 2, jerseys_condition: 70 }, kadr: [PROBLEMOVY] });
    expect(def("vloupani_sklad").muze(s)).toBe(true);
    let kradezi = 0;
    proSeedy((rng) => {
      const n = def("vloupani_sklad").vytvor(s, rng);
      if (n?.kind !== "vloupani_sklad") return;
      kradezi++;
      expect(n.ztraty).toEqual([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }]);
    });
    expect(kradezi).toBeGreaterThan(0);
  });

  it("zabezpečení areálu ani vitrína ze skladu nezmizí vloupáním", () => {
    const s = stavKlubu({ vybaveni: { balls: 1, area_security: 1, trophy_case: 3 } });
    proSeedy((rng) => {
      const n = def("vloupani_sklad").vytvor(s, rng);
      if (n?.ztraty[0]?.typ === "vybaveni") expect(n.ztraty[0].kategorie).toBe("balls");
    });
  });

  it("bez dodávky žádná dodávka", () => {
    expect(def("dodavka_pujcena").muze(stavKlubu({ kadr: [PROBLEMOVY] }))).toBe(false);
    expect(def("dodavka_ukradena").muze(stavKlubu())).toBe(false);
    const s = stavKlubu({ vybaveni: { team_van: 2, team_van_condition: 80 }, kadr: [PROBLEMOVY] });
    proSeedy((rng) => {
      const n = def("dodavka_pujcena").vytvor(s, rng);
      if (!n) return;
      const z = n.ztraty[0];
      expect(z.typ).toBe("vybaveni_stav");
      if (z.typ === "vybaveni_stav") expect(z.stavPo).toBeLessThan(80);
    });
  });

  it("vitrína až od úrovně 2 a přijde jen o jednu úroveň", () => {
    expect(def("vitrina").muze(stavKlubu({ vybaveni: { trophy_case: 1 } }))).toBe(false);
    const s = stavKlubu({ vybaveni: { trophy_case: 3 } });
    proSeedy((rng) => {
      const n = def("vitrina").vytvor(s, rng);
      if (n?.kind === "vitrina") expect(n.ztraty[0]).toMatchObject({ kategorie: "trophy_case", uroven: 3, urovniDolu: 1 });
    });
  });

  it("kamery jde ukrást jen se zabezpečením aspoň 2", () => {
    expect(def("kradez_kamery").muze(stavKlubu({ vybaveni: { area_security: 1 } }))).toBe(false);
    expect(def("kradez_kamery").muze(stavKlubu({ vybaveni: { area_security: 2 } }))).toBe(true);
  });

  it("traktůrek až od sekačky úrovně 2", () => {
    expect(def("koleje_trakturek").muze(stavKlubu({ vybaveni: { mower: 1 } }))).toBe(false);
    expect(def("koleje_trakturek").muze(stavKlubu({ vybaveni: { mower: 2 } }))).toBe(true);
  });

  it("požár jen s grilem, klubovka s krbem přijde jen o jednu úroveň", () => {
    expect(def("pozar_grilu").muze(stavKlubu())).toBe(false);
    const s = stavKlubu({ vybaveni: { club_grill: 3 }, stadion: { refreshments: 0, pitch_condition: 70 } });
    proSeedy((rng) => {
      const n = def("pozar_grilu").vytvor(s, rng);
      expect(n?.ztraty).toHaveLength(1);
      expect(n?.ztraty[0]).toMatchObject({ kategorie: "club_grill", urovniDolu: 1 });
    });
  });

  it("stánek při požáru shoří jen tomu, kdo stánek má", () => {
    const bezStanku = stavKlubu({ vybaveni: { club_grill: 1 } });
    proSeedy((rng) => expect(def("pozar_grilu").vytvor(bezStanku, rng)?.ztraty.some((z) => z.typ === "stadion")).toBe(false));
    const seStankem = stavKlubu({ vybaveni: { club_grill: 1 }, stadion: { refreshments: 1, pitch_condition: 70 } });
    let stanek = 0;
    proSeedy((rng) => { if (def("pozar_grilu").vytvor(seStankem, rng)?.ztraty.some((z) => z.typ === "stadion")) stanek++; });
    expect(stanek).toBeGreaterThan(0);
  });
});

describe("katalog: spouštěné incidenty", () => {
  const piti = [hrac({ id: "a", alkohol: 70 }), hrac({ id: "b", alkohol: 85 }), hrac({ id: "c", alkohol: 20 })];
  const zaklad = { stadion: { changing_rooms: 1, pitch_condition: 70 }, kadr: piti };

  it("oslava jen po výhře, se dvěma pijáky ze včerejší hospody a s kabinou", () => {
    const d = def("oslava_v_kabine");
    expect(d.muze(stavKlubu({ ...zaklad, vcera: { vyhra: true, cervenaKarta: [] }, hospodaVcera: ["a", "b"] }))).toBe(true);
    expect(d.muze(stavKlubu({ ...zaklad, vcera: { vyhra: false, cervenaKarta: [] }, hospodaVcera: ["a", "b"] }))).toBe(false);
    expect(d.muze(stavKlubu({ ...zaklad, vcera: { vyhra: true, cervenaKarta: [] }, hospodaVcera: ["a", "c"] }))).toBe(false);
    expect(d.muze(stavKlubu({ ...zaklad, stadion: { pitch_condition: 70 }, vcera: { vyhra: true, cervenaKarta: [] }, hospodaVcera: ["a", "b"] }))).toBe(false);
  });

  it("za oslavou stojí nejvíc pijící návštěvník hospody", () => {
    const s = stavKlubu({ ...zaklad, vcera: { vyhra: true, cervenaKarta: [] }, hospodaVcera: ["a", "b"] });
    expect(def("oslava_v_kabine").vytvor(s, createRng(1))?.culpritPlayerId).toBe("b");
  });

  it("kopnuté dveře jen vyloučený vzteklý hráč a pachatel je hned známý", () => {
    const vztekloun = hrac({ id: "k", jmeno: "Karel Vzteklý", temperament: 80 });
    const s = stavKlubu({ stadion: { changing_rooms: 2, pitch_condition: 70 }, kadr: [vztekloun], vcera: { vyhra: false, cervenaKarta: ["k"] } });
    const n = def("kopnute_dvere").vytvor(s, createRng(5));
    expect(n).toMatchObject({ culpritPlayerId: "k", culpritRevealed: true });
    expect(n?.text).toContain("Karel Vzteklý");
    const klidas = stavKlubu({ ...s, kadr: [hrac({ id: "k", temperament: 50 })] });
    expect(def("kopnute_dvere").muze(klidas)).toBe(false);
  });

  it("světlice jen po výhře", () => {
    expect(def("svetlice").muze(stavKlubu())).toBe(false);
    expect(def("svetlice").muze(stavKlubu({ vcera: { vyhra: true, cervenaKarta: [] } }))).toBe(true);
  });
});

describe("katalog: alarm", () => {
  it("bez zabezpečení areálu nikdy", () => {
    const s = stavKlubu({ vybaveni: { balls: 1 } });
    proSeedy((rng) => expect(def("vloupani_sklad").vytvor(s, rng)?.kind).not.toBe("alarm_vyplasil"));
  });

  it("se zabezpečením 2 v dobrém stavu někdy zloděje vyplaší", () => {
    const s = stavKlubu({ vybaveni: { balls: 1, area_security: 2, area_security_condition: 80 } });
    let alarmu = 0;
    proSeedy((rng) => { if (def("vloupani_sklad").vytvor(s, rng)?.kind === "alarm_vyplasil") alarmu++; });
    expect(alarmu).toBeGreaterThan(0);
  });

  it("sešlé zabezpečení alarm nespustí", () => {
    const s = stavKlubu({ vybaveni: { balls: 1, area_security: 3, area_security_condition: 20 } });
    proSeedy((rng) => expect(def("vloupani_sklad").vytvor(s, rng)?.kind).not.toBe("alarm_vyplasil"));
  });

  it("alarm sám se nelosuje", () => {
    expect(def("alarm_vyplasil").muze(stavKlubu({ vybaveni: { area_security: 3 } }))).toBe(false);
  });
});
```

Run: `cd apps/api && npx vitest run src/incidents/katalog.test.ts` → FAIL (modul neexistuje).

- [ ] **Step 2: Implementace**

`apps/api/src/incidents/katalog.ts`:

```ts
/**
 * Katalog incidentů fáze 1: krádeže a poškození (spec Část 4a, 4b).
 *
 * Čisté funkce bez DB. `muze` je levná kontrola podmínek bez náhody,
 * `vytvor` vybere pachatele a škodu. Tvrdé pravidlo: každá škoda míří jen
 * na věc, kterou klub skutečně má; testy v katalog.test.ts to hlídají.
 */

import { CATEGORY_LABELS, cumulativeInvestment, efektyZabezpeceni } from "../equipment/equipment-generator";
import type { Rng } from "../generators/rng";
import { ROZBITNE_ZEVNITR } from "../stadium/stadium-damage";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import { PODIL_POKUSU_ZVENKU } from "./nastaveni";
import { sanceUspechuZvenku, vyberHrace } from "./pachatel";
import { text } from "./texty";
import type { HracKlubu, KategorieIncidentu, NavrhIncidentu, StavKlubu, Ztrata } from "./typy";

export interface DefiniceIncidentu {
  kind: string;
  label: string;
  emoji: string;
  category: KategorieIncidentu;
  /** Váha v náhodném losu. 0 = jen spouštěný nebo vedlejší výsledek. */
  vaha: number;
  spousteny: boolean;
  muze: (stav: StavKlubu) => boolean;
  /** `null`, když se nakonec nic nestane (odradil zámek, chybí kandidát). */
  vytvor: (stav: StavKlubu, rng: Rng) => NavrhIncidentu | null;
}

/** Co jde odnést ze skladu. Dodávka, vitrína a zabezpečení mají vlastní typy. */
export const PRENOSNE: readonly string[] = [
  "balls", "jerseys", "boots_stock", "goalkeeper_gear", "bibs", "training_cones", "first_aid",
  "sports_drinks", "water_bottles", "coffee_maker", "video_setup", "pa_system", "fan_drums", "winter_gear",
];

/** Venkovní zařízení, na které dosáhne vandal. */
const VENKOVNI_ZARIZENI = ["fence", "stands", "entrance_gate"] as const;

const uroven = (s: StavKlubu, k: string) => s.vybaveni[k] ?? 0;
const stavVeci = (s: StavKlubu, k: string) => s.vybaveni[`${k}_condition`] ?? 50;
const zarizeni = (s: StavKlubu, k: string) => s.stadion[k] ?? 0;

function zavaznostPodleHodnoty(kategorie: string, lv: number): 1 | 2 | 3 {
  const hodnota = cumulativeInvestment(kategorie, lv);
  return hodnota < 10_000 ? 1 : hodnota < 60_000 ? 2 : 3;
}

function zabezpeceni(s: StavKlubu) {
  return efektyZabezpeceni(uroven(s, "area_security"), stavVeci(s, "area_security"));
}

function pijaciZHospody(s: StavKlubu): HracKlubu[] {
  const byli = new Set(s.hospodaVcera);
  return s.kadr
    .filter((h) => byli.has(h.id) && h.alkohol >= 60)
    .sort((a, b) => b.alkohol - a.alkohol || a.id.localeCompare(b.id));
}

function vzteklounSCervenou(s: StavKlubu): HracKlubu | null {
  const vylouceni = new Set(s.vcera?.cervenaKarta ?? []);
  return s.kadr
    .filter((h) => vylouceni.has(h.id) && h.temperament >= 65)
    .sort((a, b) => b.temperament - a.temperament || a.id.localeCompare(b.id))[0] ?? null;
}

type Pokus = { typ: "hrac"; hrac: HracKlubu } | { typ: "cizi" } | { typ: "alarm" };

/**
 * Kdo krade: hráč s klíčem, nebo zloděj zvenku. Zloděje zvenku může odradit
 * plot, osvětlení a zámek (pak se nestane nic) nebo vyplašit alarm, když ho
 * klub má v použitelném stavu a místo pokrývá (`alarmOdUrovne`).
 */
function pokusOKradez(s: StavKlubu, rng: Rng, alarmOdUrovne: number): Pokus | null {
  const hrac = vyberHrace(s.kadr, rng);
  const zvenku = !hrac || rng.random() < PODIL_POKUSU_ZVENKU;
  if (!zvenku && hrac) return { typ: "hrac", hrac };
  const fx = zabezpeceni(s);
  if (rng.random() >= sanceUspechuZvenku(s.stadion, fx.theftRiskMul)) return null;
  if (uroven(s, "area_security") >= alarmOdUrovne && rng.random() < fx.alarmChance) return { typ: "alarm" };
  return { typ: "cizi" };
}

function alarmNavrh(rng: Rng): NavrhIncidentu {
  return {
    kind: "alarm_vyplasil", category: "pozitivni", status: "uzavreny", severity: 1,
    culpritType: "cizi", culpritPlayerId: null, culpritRevealed: false,
    ztraty: [], text: text(rng, "alarm_vyplasil"),
  };
}

function pachatel(p: Pokus & { typ: "hrac" | "cizi" }) {
  return {
    culpritType: p.typ,
    culpritPlayerId: p.typ === "hrac" ? p.hrac.id : null,
    culpritRevealed: false,
  } as const;
}

export const KATALOG: DefiniceIncidentu[] = [
  {
    kind: "vloupani_sklad", label: "Vloupání do skladu", emoji: "🥷", category: "kradez", vaha: 5, spousteny: false,
    muze: (s) => PRENOSNE.some((k) => uroven(s, k) >= 1),
    vytvor: (s, rng) => {
      const vlastnene = PRENOSNE.filter((k) => uroven(s, k) >= 1);
      if (vlastnene.length === 0) return null;
      const kdo = pokusOKradez(s, rng, 2);
      if (!kdo) return null;
      if (kdo.typ === "alarm") return alarmNavrh(rng);
      // Zloděj bere to, co za něco stojí.
      const kategorie = rng.weighted(Object.fromEntries(vlastnene.map((k) => [k, cumulativeInvestment(k, uroven(s, k))])));
      const lv = uroven(s, kategorie);
      return {
        kind: "vloupani_sklad", category: "kradez", status: "otevreny",
        severity: zavaznostPodleHodnoty(kategorie, lv), ...pachatel(kdo),
        ztraty: [{ typ: "vybaveni", kategorie, uroven: lv, stav: stavVeci(s, kategorie), urovniDolu: lv }],
        text: text(rng, kdo.typ === "hrac" ? "vloupani_zevnitr" : "vloupani_zvenku", { vec: CATEGORY_LABELS[kategorie] ?? kategorie }),
      };
    },
  },
  {
    kind: "vitrina", label: "Poháry z vitríny", emoji: "🏆", category: "kradez", vaha: 1, spousteny: false,
    muze: (s) => uroven(s, "trophy_case") >= 2,
    vytvor: (s, rng) => {
      const lv = uroven(s, "trophy_case");
      if (lv < 2) return null;
      const kdo = pokusOKradez(s, rng, 2);
      if (!kdo) return null;
      if (kdo.typ === "alarm") return alarmNavrh(rng);
      // Síň slávy se neukradne, poháry ano: vitrína přijde jen o jednu úroveň.
      return {
        kind: "vitrina", category: "kradez", status: "otevreny", severity: 2, ...pachatel(kdo),
        ztraty: [{ typ: "vybaveni", kategorie: "trophy_case", uroven: lv, stav: stavVeci(s, "trophy_case"), urovniDolu: 1 }],
        text: text(rng, "vitrina"),
      };
    },
  },
  {
    kind: "dodavka_pujcena", label: "Půjčená dodávka", emoji: "🚐", category: "kradez", vaha: 2, spousteny: false,
    muze: (s) => uroven(s, "team_van") >= 1,
    vytvor: (s, rng) => {
      if (uroven(s, "team_van") < 1) return null;
      const hrac = vyberHrace(s.kadr, rng);
      if (!hrac) return null;
      const pred = stavVeci(s, "team_van");
      const po = Math.max(5, pred - rng.int(30, 60));
      if (po >= pred) return null;
      return {
        kind: "dodavka_pujcena", category: "kradez", status: "otevreny", severity: 2,
        culpritType: "hrac", culpritPlayerId: hrac.id, culpritRevealed: false,
        ztraty: [{ typ: "vybaveni_stav", kategorie: "team_van", stavPred: pred, stavPo: po }],
        text: text(rng, "dodavka_pujcena"),
      };
    },
  },
  {
    kind: "dodavka_ukradena", label: "Ukradená dodávka", emoji: "🚐", category: "kradez", vaha: 0.3, spousteny: false,
    muze: (s) => uroven(s, "team_van") >= 1,
    vytvor: (s, rng) => {
      const lv = uroven(s, "team_van");
      if (lv < 1) return null;
      const fx = zabezpeceni(s);
      if (rng.random() >= sanceUspechuZvenku(s.stadion, fx.theftRiskMul)) return null;
      // Parkoviště pokrývá jen kamerový systém celého areálu.
      if (uroven(s, "area_security") >= 3 && rng.random() < fx.alarmChance) return alarmNavrh(rng);
      return {
        kind: "dodavka_ukradena", category: "kradez", status: "otevreny", severity: 3,
        culpritType: "cizi", culpritPlayerId: null, culpritRevealed: false,
        ztraty: [{ typ: "vybaveni", kategorie: "team_van", uroven: lv, stav: stavVeci(s, "team_van"), urovniDolu: lv }],
        text: text(rng, "dodavka_ukradena"),
      };
    },
  },
  {
    kind: "kradez_kamery", label: "Ukradené kamery", emoji: "📹", category: "kradez", vaha: 0.5, spousteny: false,
    muze: (s) => uroven(s, "area_security") >= 2,
    vytvor: (s, rng) => {
      const lv = uroven(s, "area_security");
      if (lv < 2) return null;
      // Zabezpečení nechrání samo sebe, zloděj ho vyřadí jako první.
      if (rng.random() >= sanceUspechuZvenku(s.stadion, 1)) return null;
      return {
        kind: "kradez_kamery", category: "kradez", status: "otevreny",
        severity: zavaznostPodleHodnoty("area_security", lv),
        culpritType: "cizi", culpritPlayerId: null, culpritRevealed: false,
        ztraty: [{ typ: "vybaveni", kategorie: "area_security", uroven: lv, stav: stavVeci(s, "area_security"), urovniDolu: lv }],
        text: text(rng, "kradez_kamery"),
      };
    },
  },
  {
    kind: "oslava_v_kabine", label: "Oslava v kabině", emoji: "🍻", category: "poskozeni", vaha: 0, spousteny: true,
    muze: (s) => !!s.vcera?.vyhra && pijaciZHospody(s).length >= 2 && ROZBITNE_ZEVNITR.some((k) => zarizeni(s, k) >= 1),
    vytvor: (s, rng) => {
      const pijaci = pijaciZHospody(s);
      const mozne = ROZBITNE_ZEVNITR.filter((k) => zarizeni(s, k) >= 1);
      if (!s.vcera?.vyhra || pijaci.length < 2 || mozne.length === 0) return null;
      const kde = rng.pick(mozne);
      return {
        kind: "oslava_v_kabine", category: "poskozeni", status: "otevreny", severity: 2,
        culpritType: "hrac", culpritPlayerId: pijaci[0].id, culpritRevealed: false,
        ztraty: [{ typ: "stadion", zarizeni: kde, urovni: 1 }],
        text: text(rng, "oslava_v_kabine", { zarizeni: FACILITY_LABELS[kde] ?? kde }),
      };
    },
  },
  {
    kind: "kopnute_dvere", label: "Kopnuté dveře", emoji: "🚪", category: "poskozeni", vaha: 0, spousteny: true,
    muze: (s) => zarizeni(s, "changing_rooms") >= 1 && vzteklounSCervenou(s) !== null,
    vytvor: (s, rng) => {
      const h = vzteklounSCervenou(s);
      if (!h || zarizeni(s, "changing_rooms") < 1) return null;
      // Všichni viděli, kdo to byl: pachatel je známý hned.
      return {
        kind: "kopnute_dvere", category: "poskozeni", status: "otevreny", severity: 2,
        culpritType: "hrac", culpritPlayerId: h.id, culpritRevealed: true,
        ztraty: [{ typ: "stadion", zarizeni: "changing_rooms", urovni: 1 }],
        text: text(rng, "kopnute_dvere", { hrac: h.jmeno, zarizeni: FACILITY_LABELS.changing_rooms }),
      };
    },
  },
  {
    kind: "koleje_trakturek", label: "Koleje od traktůrku", emoji: "🚜", category: "poskozeni", vaha: 1.5, spousteny: false,
    muze: (s) => uroven(s, "mower") >= 2,
    vytvor: (s, rng) => {
      if (uroven(s, "mower") < 2) return null;
      const hrac = vyberHrace(s.kadr, rng);
      if (!hrac) return null;
      const pred = zarizeni(s, "pitch_condition") || 50;
      const po = Math.max(5, pred - rng.int(8, 15));
      if (po >= pred) return null;
      return {
        kind: "koleje_trakturek", category: "poskozeni", status: "otevreny", severity: 1,
        culpritType: "hrac", culpritPlayerId: hrac.id, culpritRevealed: false,
        ztraty: [{ typ: "travnik", pred, po }],
        text: text(rng, "koleje_trakturek"),
      };
    },
  },
  {
    kind: "pozar_grilu", label: "Požár od grilu", emoji: "🔥", category: "poskozeni", vaha: 1, spousteny: false,
    muze: (s) => uroven(s, "club_grill") >= 1,
    vytvor: (s, rng) => {
      const lv = uroven(s, "club_grill");
      if (lv < 1) return null;
      const hrac = rng.random() < 0.5 ? vyberHrace(s.kadr, rng) : null;
      // Klubovna s krbem neshoří celá, přijde o úroveň. Menší gril je na odpis.
      const ztraty: Ztrata[] = [{ typ: "vybaveni", kategorie: "club_grill", uroven: lv, stav: stavVeci(s, "club_grill"), urovniDolu: lv === 3 ? 1 : lv }];
      let t = text(rng, "pozar_grilu", { vec: CATEGORY_LABELS.club_grill });
      if (zarizeni(s, "refreshments") >= 1 && rng.random() < 0.3) {
        ztraty.push({ typ: "stadion", zarizeni: "refreshments", urovni: 1 });
        t += ` ${text(rng, "pozar_grilu_stanek", { zarizeni: FACILITY_LABELS.refreshments })}`;
      }
      return {
        kind: "pozar_grilu", category: "poskozeni", status: "otevreny", severity: 2,
        culpritType: hrac ? "hrac" : "nikdo", culpritPlayerId: hrac?.id ?? null, culpritRevealed: false,
        ztraty, text: t,
      };
    },
  },
  {
    kind: "svetlice", label: "Světlice na hřišti", emoji: "🎆", category: "poskozeni", vaha: 0, spousteny: true,
    muze: (s) => !!s.vcera?.vyhra,
    vytvor: (s, rng) => {
      if (!s.vcera?.vyhra) return null;
      const hrac = rng.random() < 0.5 ? vyberHrace(s.kadr, rng) : null;
      const pred = zarizeni(s, "pitch_condition") || 50;
      const po = Math.max(5, pred - rng.int(5, 10));
      if (po >= pred) return null;
      return {
        kind: "svetlice", category: "poskozeni", status: "otevreny", severity: 1,
        culpritType: hrac ? "hrac" : "cizi", culpritPlayerId: hrac?.id ?? null, culpritRevealed: false,
        ztraty: [{ typ: "travnik", pred, po }],
        text: text(rng, "svetlice"),
      };
    },
  },
  {
    kind: "vandal", label: "Vandalové", emoji: "💥", category: "poskozeni", vaha: 2, spousteny: false,
    muze: () => true,
    vytvor: (s, rng) => {
      if (rng.random() >= sanceUspechuZvenku(s.stadion, 1)) return null;
      const mozne = VENKOVNI_ZARIZENI.filter((k) => zarizeni(s, k) >= 1);
      if (mozne.length > 0 && rng.random() < 0.6) {
        const kde = rng.pick(mozne);
        return {
          kind: "vandal", category: "poskozeni", status: "otevreny", severity: 2,
          culpritType: "cizi", culpritPlayerId: null, culpritRevealed: false,
          ztraty: [{ typ: "stadion", zarizeni: kde, urovni: 1 }],
          text: text(rng, "vandal_zarizeni", { zarizeni: FACILITY_LABELS[kde] ?? kde }),
        };
      }
      const pred = zarizeni(s, "pitch_condition") || 50;
      const po = Math.max(5, pred - 5);
      if (po >= pred) return null;
      return {
        kind: "vandal", category: "poskozeni", status: "otevreny", severity: 1,
        culpritType: "cizi", culpritPlayerId: null, culpritRevealed: false,
        ztraty: [{ typ: "travnik", pred, po }],
        text: text(rng, "vandal_travnik"),
      };
    },
  },
  {
    // Nelosuje se: vzniká jen jako výsledek pokusu o krádež (pokusOKradez).
    kind: "alarm_vyplasil", label: "Alarm vyplašil zloděje", emoji: "🚨", category: "pozitivni", vaha: 0, spousteny: false,
    muze: () => false,
    vytvor: () => null,
  },
];

export const KATALOG_PODLE_KIND = new Map(KATALOG.map((d) => [d.kind, d]));
```

- [ ] **Step 3: Testy musí projít**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit -p .`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/incidents/katalog.ts apps/api/src/incidents/katalog.test.ts
git commit -m "feat(incidenty): katalog kradezi a poskozeni s podminkami"
```

---

## Task 6: Denní los a popis škody

**Files:**
- Create: `apps/api/src/incidents/losovani.ts`, `apps/api/src/incidents/popis.ts`
- Test: `apps/api/src/incidents/losovani.test.ts`, `apps/api/src/incidents/popis.test.ts`

**Interfaces:**
- Consumes: `KATALOG` (Task 5), konstanty (Task 2)
- Produces: `naCooldownu(stav: StavKlubu, kind: string): boolean`, `vylosujIncident(stav: StavKlubu, rng: Rng): NavrhIncidentu | null`, `popisZtraty(z: Ztrata): string`, `nactiZtraty(raw: unknown): Ztrata[]`

- [ ] **Step 1: Napsat padající testy**

`apps/api/src/incidents/losovani.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { naCooldownu, vylosujIncident } from "./losovani";
import { hrac, PROBLEMOVY, stavKlubu } from "./testovaci-stav";

const VYBAVENY = { vybaveni: { balls: 2, jerseys: 1 }, kadr: [PROBLEMOVY] };

describe("denní los incidentů", () => {
  it("nový tým je chráněný", () => {
    const s = stavKlubu({ ...VYBAVENY, odehranychZapasu: 2 });
    for (let seed = 1; seed <= 500; seed++) expect(vylosujIncident(s, createRng(seed))).toBeNull();
  });

  it("s otevřeným problémem nevznikne další", () => {
    const s = stavKlubu({ ...VYBAVENY, otevreneProblemy: 1 });
    for (let seed = 1; seed <= 500; seed++) expect(vylosujIncident(s, createRng(seed))).toBeNull();
  });

  it("typ v cooldownu se nevylosuje", () => {
    const s = stavKlubu({ ...VYBAVENY, posledniVyskyt: { vloupani_sklad: "2026-09-11" } });
    for (let seed = 1; seed <= 3000; seed++) expect(vylosujIncident(s, createRng(seed))?.kind).not.toBe("vloupani_sklad");
  });

  it("po rolloveru (herní datum skočí zpět) cooldown neplatí", () => {
    expect(naCooldownu(stavKlubu({ den: "2026-01-10", posledniVyskyt: { vandal: "2026-09-01" } }), "vandal")).toBe(false);
    expect(naCooldownu(stavKlubu({ den: "2026-09-16", posledniVyskyt: { vandal: "2026-09-01" } }), "vandal")).toBe(true);
    expect(naCooldownu(stavKlubu({ den: "2026-09-30", posledniVyskyt: { vandal: "2026-09-01" } }), "vandal")).toBe(false);
  });

  it("náhodný problém přijde zhruba jednou za 25 dní", () => {
    const s = stavKlubu(VYBAVENY);
    let pocet = 0;
    for (let seed = 1; seed <= 4000; seed++) if (vylosujIncident(s, createRng(seed))) pocet++;
    expect(pocet / 4000).toBeGreaterThan(0.02);
    expect(pocet / 4000).toBeLessThan(0.06);
  });

  it("spouštěný incident přijde i bez náhodného losu", () => {
    const s = stavKlubu({
      stadion: { changing_rooms: 1, pitch_condition: 70 },
      kadr: [hrac({ id: "a", alkohol: 70 }), hrac({ id: "b", alkohol: 85 })],
      vcera: { vyhra: true, cervenaKarta: [] }, hospodaVcera: ["a", "b"],
    });
    let oslav = 0;
    for (let seed = 1; seed <= 1000; seed++) if (vylosujIncident(s, createRng(seed))?.kind === "oslava_v_kabine") oslav++;
    expect(oslav / 1000).toBeGreaterThan(0.15);
  });

  it("stejný stav a seed dají stejný incident", () => {
    const s = stavKlubu(VYBAVENY);
    for (let seed = 1; seed <= 200; seed++) {
      expect(vylosujIncident(s, createRng(seed))).toEqual(vylosujIncident(s, createRng(seed)));
    }
  });
});
```

`apps/api/src/incidents/popis.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nactiZtraty, popisZtraty } from "./popis";

describe("popis škody", () => {
  it("převede ztráty do vět bez dlouhé pomlčky", () => {
    const vety = [
      popisZtraty({ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }),
      popisZtraty({ typ: "vybaveni", kategorie: "trophy_case", uroven: 3, stav: 70, urovniDolu: 1 }),
      popisZtraty({ typ: "vybaveni_stav", kategorie: "team_van", stavPred: 80, stavPo: 35 }),
      popisZtraty({ typ: "stadion", zarizeni: "changing_rooms", urovni: 1 }),
      popisZtraty({ typ: "travnik", pred: 70, po: 58 }),
    ];
    expect(vety).toEqual([
      "Zmizelo vybavení: Dresy (úroveň 2)",
      "Klubová kronika a vitrína: úroveň 3 → 2",
      "Klubová dodávka: stav 80 % → 35 %",
      "Rozbité zařízení: Šatny (o 1 úroveň)",
      "Trávník: stav 70 % → 58 %",
    ]);
    for (const v of vety) expect(v).not.toContain("—");
  });

  it("rozbitý JSON dá prázdný seznam", () => {
    expect(nactiZtraty("{rozbite")).toEqual([]);
    expect(nactiZtraty(null)).toEqual([]);
    expect(nactiZtraty('[{"typ":"travnik","pred":70,"po":60}]')).toEqual([{ typ: "travnik", pred: 70, po: 60 }]);
  });
});
```

Run: `cd apps/api && npx vitest run src/incidents/losovani.test.ts src/incidents/popis.test.ts` → FAIL.

- [ ] **Step 2: Implementace losování**

`apps/api/src/incidents/losovani.ts`:

```ts
/**
 * Jeden herní den jednoho klubu: nejvýš jeden nový problém (spec Část 4e).
 * Čistá funkce, náhoda jen přes předané `rng`.
 */

import type { Rng } from "../generators/rng";
import { KATALOG } from "./katalog";
import {
  COOLDOWN_TYPU_DNI, MAX_OTEVRENYCH_PROBLEMU, MIN_ODEHRANYCH_ZAPASU,
  SANCE_PROBLEMU_ZA_DEN, SANCE_SPOUSTENYCH,
} from "./nastaveni";
import type { NavrhIncidentu, StavKlubu } from "./typy";

const DEN_MS = 86_400_000;

export function naCooldownu(stav: StavKlubu, kind: string): boolean {
  const posledni = stav.posledniVyskyt[kind];
  if (!posledni) return false;
  const rozdil = (Date.parse(stav.den) - Date.parse(posledni)) / DEN_MS;
  // Záporný rozdíl: herní datum po rolloveru sezóny skočilo zpět, cooldown pak neplatí.
  return rozdil >= 0 && rozdil < COOLDOWN_TYPU_DNI;
}

export function vylosujIncident(stav: StavKlubu, rng: Rng): NavrhIncidentu | null {
  if (stav.odehranychZapasu < MIN_ODEHRANYCH_ZAPASU) return null;
  if (stav.otevreneProblemy >= MAX_OTEVRENYCH_PROBLEMU) return null;

  // Spouštěné (výhra, červená karta) mají přednost a vlastní šanci.
  for (const def of KATALOG) {
    if (!def.spousteny || naCooldownu(stav, def.kind) || !def.muze(stav)) continue;
    if (rng.random() >= (SANCE_SPOUSTENYCH[def.kind] ?? 0)) continue;
    const navrh = def.vytvor(stav, rng);
    if (navrh) return navrh;
  }

  if (rng.random() >= SANCE_PROBLEMU_ZA_DEN) return null;
  const kandidati = KATALOG.filter((d) => !d.spousteny && d.vaha > 0 && !naCooldownu(stav, d.kind) && d.muze(stav));
  if (kandidati.length === 0) return null;
  const kind = rng.weighted(Object.fromEntries(kandidati.map((d) => [d.kind, d.vaha])));
  return kandidati.find((d) => d.kind === kind)?.vytvor(stav, rng) ?? null;
}
```

- [ ] **Step 3: Implementace popisu**

`apps/api/src/incidents/popis.ts`:

```ts
/** Škoda incidentu jako věta pro UI. Čisté funkce. */

import { CATEGORY_LABELS } from "../equipment/equipment-generator";
import { logger } from "../lib/logger";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import type { Ztrata } from "./typy";

export function popisZtraty(z: Ztrata): string {
  switch (z.typ) {
    case "vybaveni": {
      const nazev = CATEGORY_LABELS[z.kategorie] ?? z.kategorie;
      return z.urovniDolu >= z.uroven
        ? `Zmizelo vybavení: ${nazev} (úroveň ${z.uroven})`
        : `${nazev}: úroveň ${z.uroven} → ${z.uroven - z.urovniDolu}`;
    }
    case "vybaveni_stav":
      return `${CATEGORY_LABELS[z.kategorie] ?? z.kategorie}: stav ${z.stavPred} % → ${z.stavPo} %`;
    case "stadion":
      return `Rozbité zařízení: ${FACILITY_LABELS[z.zarizeni] ?? z.zarizeni} (o ${z.urovni} ${z.urovni === 1 ? "úroveň" : "úrovně"})`;
    case "travnik":
      return `Trávník: stav ${z.pred} % → ${z.po} %`;
  }
}

export function nactiZtraty(raw: unknown): Ztrata[] {
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as Ztrata[]) : [];
  } catch (e) {
    logger.warn({ module: "incidents-popis" }, "nečitelný JSON škody incidentu", e);
    return [];
  }
}
```

- [ ] **Step 4: Testy musí projít**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit -p .`
Expected: PASS. Když test četnosti mimo 2–6 %, nezměkčovat test: zkontrolovat `SANCE_PROBLEMU_ZA_DEN` a že `vytvor` pro vybavený klub vrací návrh.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/incidents/losovani.ts apps/api/src/incidents/losovani.test.ts apps/api/src/incidents/popis.ts apps/api/src/incidents/popis.test.ts
git commit -m "feat(incidenty): denni los s cooldownem a popis skody"
```

---

## Task 7: Stav klubu z databáze

**Files:**
- Create: `apps/api/src/incidents/stav-klubu.ts`

**Interfaces:**
- Consumes: `ensureEquipmentRow` (`equipment/equipment-service.ts`), `StavKlubu`, `HracKlubu` (Task 2)
- Produces: `nactiStavKlubu(db: D1Database, team: { id: string; league_id: string | null }, gameDate: string, seasonNumber: number): Promise<StavKlubu | null>`

Kontext pro implementátora:
- `pub_sessions.game_date` je `YYYY-MM-DD`, `attendees` JSON `[{ playerId, teamId, isVisitor?, isCoach?, alcohol, … }]`.
- `season_calendar.scheduled_at` je herní ISO (`2026-09-14T16:00:00.000Z`), soutěžní zápas se páruje přes `matches.calendar_id`.
- `match_player_stats` má sloupce `match_id, player_id, team_id, red_cards`.
- Vázané parametry `?1`, `?2` D1 podporuje (vzor `news/feed.ts:102`).

Tahle vrstva nemá unit test (je to jen čtení z D1). Ověří se typecheckem a na testingu v Tasku 13.

- [ ] **Step 1: Implementace**

`apps/api/src/incidents/stav-klubu.ts`:

```ts
/**
 * Načtení stavu klubu pro incidenty (spec Část 4, `StavKlubu`).
 * Jen čtení. Všechno, co katalog potřebuje k podmínkám, v jednom průchodu.
 */

import { ensureEquipmentRow } from "../equipment/equipment-service";
import { logger } from "../lib/logger";
import type { HracKlubu, StavKlubu } from "./typy";

const M = "incidents-stav";

function cislo(v: unknown, vychozi: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : vychozi;
}

function objekt(raw: unknown, co: string): Record<string, any> {
  if (typeof raw !== "string" || raw === "") return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, any>) : {};
  } catch (e) {
    logger.warn({ module: M }, `nečitelný JSON (${co})`, e);
    return {};
  }
}

function pole(raw: unknown, co: string): Array<Record<string, unknown>> {
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
  } catch (e) {
    logger.warn({ module: M }, `nečitelný JSON (${co})`, e);
    return [];
  }
}

function predchoziDen(den: string): string {
  const d = new Date(`${den}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function nactiStavKlubu(
  db: D1Database,
  team: { id: string; league_id: string | null },
  gameDate: string,
  seasonNumber: number,
): Promise<StavKlubu | null> {
  const teamId = team.id;
  const den = gameDate.slice(0, 10);
  const vcera = predchoziDen(den);

  const vybaveniRow = await ensureEquipmentRow(db, teamId);
  if (!vybaveniRow) return null;
  const vybaveni: Record<string, number> = {};
  for (const [k, v] of Object.entries(vybaveniRow)) if (typeof v === "number") vybaveni[k] = v;

  const vysledky = await db.batch([
    db.prepare("SELECT changing_rooms, showers, toilets, refreshments, fence, stands, entrance_gate, lighting, pitch_condition FROM stadiums WHERE team_id = ?").bind(teamId),
    db.prepare("SELECT id, first_name, last_name, personality, life_context, coach_relationship FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')").bind(teamId),
    db.prepare(
      `SELECT m.id, m.home_team_id, m.home_score, m.away_score
         FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
        WHERE (m.home_team_id = ?1 OR m.away_team_id = ?1) AND m.status = 'simulated'
          AND substr(sc.scheduled_at, 1, 10) = ?2
        LIMIT 1`,
    ).bind(teamId, vcera),
    db.prepare("SELECT attendees FROM pub_sessions WHERE team_id = ? AND game_date = ?").bind(teamId, vcera),
    db.prepare("SELECT COUNT(*) AS n FROM matches WHERE (home_team_id = ?1 OR away_team_id = ?1) AND status = 'simulated'").bind(teamId),
    db.prepare(
      `SELECT kind, MAX(game_date) AS posledni,
              SUM(CASE WHEN status IN ('otevreny', 'policie') AND category IN ('kradez', 'poskozeni') THEN 1 ELSE 0 END) AS otevrene
         FROM club_incidents WHERE team_id = ? AND season_number = ? GROUP BY kind`,
    ).bind(teamId, seasonNumber),
  ]).catch((e) => { logger.warn({ module: M }, `stav klubu ${teamId}`, e); return null; });
  if (!vysledky) return null;
  const [stadionRes, kadrRes, zapasRes, hospodaRes, pocetRes, incidentyRes] = vysledky;

  const stadion: Record<string, number> = {};
  for (const [k, v] of Object.entries((stadionRes.results[0] ?? {}) as Record<string, unknown>)) {
    if (typeof v === "number") stadion[k] = v;
  }

  const kadr: HracKlubu[] = (kadrRes.results as Array<Record<string, unknown>>).map((r) => {
    const p = objekt(r.personality, "personality");
    const lc = objekt(r.life_context, "life_context");
    return {
      id: String(r.id),
      jmeno: `${r.first_name} ${r.last_name}`,
      alkohol: cislo(p.alcohol, 30),
      disciplina: cislo(p.discipline, 50),
      vernost: cislo(p.patriotism, 50),
      temperament: cislo(p.temper, 40),
      vztahKTrenerovi: cislo(r.coach_relationship, 50),
      transferUnrest: cislo(lc.transferUnrest?.level, 0),
    };
  });

  let vceraZapas: StavKlubu["vcera"] = null;
  const zapas = zapasRes.results[0] as { id: string; home_team_id: string; home_score: number; away_score: number } | undefined;
  if (zapas) {
    const doma = zapas.home_team_id === teamId;
    const vyhra = doma ? zapas.home_score > zapas.away_score : zapas.away_score > zapas.home_score;
    const cervene = await db.prepare("SELECT player_id FROM match_player_stats WHERE match_id = ? AND team_id = ? AND red_cards > 0")
      .bind(zapas.id, teamId).all<{ player_id: string }>()
      .catch((e) => { logger.warn({ module: M }, `červené karty ${zapas.id}`, e); return { results: [] as Array<{ player_id: string }> }; });
    vceraZapas = { vyhra, cervenaKarta: cervene.results.map((r) => r.player_id) };
  }

  const hospodaVcera = pole((hospodaRes.results[0] as { attendees?: unknown } | undefined)?.attendees, "attendees")
    .filter((a) => a.teamId === teamId && !a.isVisitor && !a.isCoach && typeof a.playerId === "string")
    .map((a) => String(a.playerId));

  const posledniVyskyt: Record<string, string> = {};
  let otevreneProblemy = 0;
  for (const r of incidentyRes.results as Array<{ kind: string; posledni: string; otevrene: number }>) {
    posledniVyskyt[r.kind] = String(r.posledni).slice(0, 10);
    otevreneProblemy += r.otevrene ?? 0;
  }

  return {
    teamId, leagueId: team.league_id, seasonNumber, gameDate, den,
    vybaveni, stadion, kadr, vcera: vceraZapas, hospodaVcera,
    odehranychZapasu: cislo((pocetRes.results[0] as { n?: number } | undefined)?.n, 0),
    otevreneProblemy, posledniVyskyt,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p .`
Expected: bez chyb.

- [ ] **Step 3: Ověřit dotazy nad testovací DB (jen čtení)**

Run (tým testovacího účtu FK Duplex Břevnov):

```bash
cd apps/api && npx wrangler d1 execute prales-db-test --remote --json --command 'EXPLAIN SELECT m.id FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id WHERE (m.home_team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" OR m.away_team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1") AND m.status = "simulated" AND substr(sc.scheduled_at, 1, 10) = "2026-09-14" LIMIT 1'
```

Expected: `"success": true`. Dotaz na `club_incidents` projde až po migraci 0204 (Task 13).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/incidents/stav-klubu.ts
git commit -m "feat(incidenty): nacteni stavu klubu"
```

---

## Task 8: Zápis incidentu, skutečná škoda a oznámení

**Files:**
- Create: `apps/api/src/incidents/dopady.ts`

**Interfaces:**
- Consumes: `poskodZarizeni` (Task 4), `KATALOG_PODLE_KIND`, `DefiniceIncidentu` (Task 5), `TEXTY`, `vypln` (Task 2), `gameExpiry` (`lib/game-time.ts`), `sendSystemSMS` (`messaging/system-sms.ts`), `createNotification` (`community/notifications.ts`)
- Produces:
  - `idIncidentu(teamId: string, kind: string, den: string): string` → `inc-{teamId}-{kind}-{den}`
  - `zapisIncident(db: D1Database, stav: StavKlubu, navrh: NavrhIncidentu, id?: string): Promise<string | null>`
  - `oznamIncident(env: Bindings, teamId: string, navrh: NavrhIncidentu): Promise<void>`
  - `uzavriProsleIncidenty(env: Bindings, t: { teamId: string; gameDate: string; seasonNumber: number }): Promise<number>`

Kontext pro implementátora:
- Den týmu se zabírá **před** prací (`claimTeamDay`, `season/team-day.ts:44`). Když zpracování dne spadne a zopakuje se, nesmí se ukrást podruhé. Proto nejdřív `INSERT OR IGNORE` incidentu, škoda až při `changes > 0`.
- `UPDATE equipment` jde s názvem sloupce z dat: kategorie musí projít whitelistem `CATEGORIES`.
- Každý UPDATE škody má podmínku na původní hodnotu (`AND {kat} = ?`). Když mezitím klub vybavení prodal, škoda se neprovede a incident se uzavře jako `bez_skody`, bez SMS.
- `sendSystemSMS` chyby loguje sám. `createNotification` může vyhodit, obalit `.catch`.

Tahle vrstva nemá unit test (zápisy do D1). Ověří se v Tasku 13 přes admin force a kontrolu `equipment`, `stadiums`, `stadium_damage` a `club_incidents`.

- [ ] **Step 1: Implementace**

`apps/api/src/incidents/dopady.ts`:

```ts
/**
 * Zápis incidentu a jeho skutečné následky (spec Část 6c, 7e, 7f).
 */

import { createNotification } from "../community/notifications";
import { CATEGORIES } from "../equipment/equipment-generator";
import type { Bindings } from "../index";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { sendSystemSMS } from "../messaging/system-sms";
import { poskodZarizeni } from "../stadium/stadium-damage";
import { KATALOG_PODLE_KIND } from "./katalog";
import { LHUTA_ROZHODNUTI_DNI, SMS_ROLE_KUSTOD } from "./nastaveni";
import { TEXTY, vypln } from "./texty";
import type { NavrhIncidentu, StavKlubu, Ztrata } from "./typy";

const M = "incidents-dopady";

export function idIncidentu(teamId: string, kind: string, den: string): string {
  return `inc-${teamId}-${kind}-${den}`;
}

/**
 * Zapíše incident a teprve potom provede škody.
 *
 * Vrací id incidentu, nebo `null`, když už existoval (opakované zpracování dne)
 * nebo se žádná škoda nepovedla (vybavení mezitím prodáno, zařízení už na nule).
 */
export async function zapisIncident(
  db: D1Database,
  stav: StavKlubu,
  navrh: NavrhIncidentu,
  id: string = idIncidentu(stav.teamId, navrh.kind, stav.den),
): Promise<string | null> {
  const deadline = navrh.status === "otevreny" ? gameExpiry(stav.gameDate, LHUTA_ROZHODNUTI_DNI) : null;
  const resolvedOn = navrh.status === "uzavreny" ? stav.gameDate : null;

  const vlozeno = await db.prepare(
    `INSERT OR IGNORE INTO club_incidents
       (id, team_id, league_id, season_number, kind, category, status, severity, game_date, deadline,
        culprit_type, culprit_player_id, culprit_revealed, loss, text, resolved_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, stav.teamId, stav.leagueId, stav.seasonNumber, navrh.kind, navrh.category, navrh.status,
    navrh.severity, stav.gameDate, deadline, navrh.culpritType, navrh.culpritPlayerId,
    navrh.culpritRevealed ? 1 : 0, JSON.stringify(navrh.ztraty), navrh.text, resolvedOn,
  ).run().catch((e) => { logger.error({ module: M }, `zápis incidentu ${id}`, e); return null; });
  if ((vlozeno?.meta?.changes ?? 0) === 0) return null;

  if (navrh.ztraty.length === 0) return id;

  const provedene: Ztrata[] = [];
  for (const z of navrh.ztraty) {
    const hotovo = await provedZtratu(db, stav, id, z, navrh.text);
    if (hotovo) provedene.push(hotovo);
  }

  if (provedene.length === 0) {
    await db.prepare("UPDATE club_incidents SET status = 'uzavreny', resolution = 'bez_skody', resolved_on = ?, loss = '[]' WHERE id = ?")
      .bind(stav.gameDate, id).run()
      .catch((e) => logger.warn({ module: M }, `uzavření incidentu bez škody ${id}`, e));
    return null;
  }
  await db.prepare("UPDATE club_incidents SET loss = ? WHERE id = ?")
    .bind(JSON.stringify(provedene), id).run()
    .catch((e) => logger.warn({ module: M }, `uložení provedené škody ${id}`, e));
  return id;
}

async function provedZtratu(db: D1Database, stav: StavKlubu, incidentId: string, z: Ztrata, popis: string): Promise<Ztrata | null> {
  const zmeneno = (r: D1Result | null) => (r?.meta?.changes ?? 0) > 0;

  if (z.typ === "vybaveni" || z.typ === "vybaveni_stav") {
    // Kategorie jde do názvu sloupce: whitelist je povinný.
    if (!(CATEGORIES as readonly string[]).includes(z.kategorie)) {
      logger.error({ module: M }, `neznámá kategorie vybavení ${z.kategorie} v ${incidentId}`);
      return null;
    }
  }

  switch (z.typ) {
    case "vybaveni": {
      const nova = Math.max(0, z.uroven - z.urovniDolu);
      // Úplně ztracená kategorie se vrací na výchozí stav 50, stejně jako prodej v bazaru.
      const stavPo = nova === 0 ? 50 : z.stav;
      const r = await db.prepare(`UPDATE equipment SET ${z.kategorie} = ?, ${z.kategorie}_condition = ? WHERE team_id = ? AND ${z.kategorie} = ?`)
        .bind(nova, stavPo, stav.teamId, z.uroven).run()
        .catch((e) => { logger.error({ module: M }, `ztráta vybavení ${incidentId}`, e); return null; });
      return zmeneno(r) ? z : null;
    }
    case "vybaveni_stav": {
      const r = await db.prepare(`UPDATE equipment SET ${z.kategorie}_condition = ? WHERE team_id = ? AND ${z.kategorie}_condition = ?`)
        .bind(z.stavPo, stav.teamId, z.stavPred).run()
        .catch((e) => { logger.error({ module: M }, `opotřebení vybavení ${incidentId}`, e); return null; });
      return zmeneno(r) ? z : null;
    }
    case "stadion": {
      const d = await poskodZarizeni(db, {
        teamId: stav.teamId, incidentId, facility: z.zarizeni, levels: z.urovni, gameDate: stav.gameDate, popis,
      });
      return d ? { ...z, urovni: d.levels, damageId: d.damageId } : null;
    }
    case "travnik": {
      const r = await db.prepare("UPDATE stadiums SET pitch_condition = ? WHERE team_id = ? AND pitch_condition = ?")
        .bind(z.po, stav.teamId, z.pred).run()
        .catch((e) => { logger.error({ module: M }, `poškození trávníku ${incidentId}`, e); return null; });
      return zmeneno(r) ? z : null;
    }
  }
  return null;
}

/** SMS od kustoda a notifikace. Selhání oznámení incident nezvrací. */
export async function oznamIncident(env: Bindings, teamId: string, navrh: NavrhIncidentu): Promise<void> {
  const def = KATALOG_PODLE_KIND.get(navrh.kind);
  const emoji = def?.emoji ?? "❗";
  await sendSystemSMS(env.DB, teamId, SMS_ROLE_KUSTOD, `${emoji} ${navrh.text}`);
  await createNotification(env.DB, teamId, "event", `${emoji} ${def?.label ?? "Incident v klubu"}`, navrh.text.slice(0, 140), "/dashboard/incidenty", env)
    .catch((e) => logger.warn({ module: M }, `notifikace incidentu ${navrh.kind}`, e));
}

/**
 * Uzavře incidenty z minulé sezóny a otevřené incidenty po lhůtě (spec 7e, fáze 1:
 * jen výsledek `nevyreseno`). Vrací počet uzavřených po lhůtě.
 */
export async function uzavriProsleIncidenty(
  env: Bindings,
  t: { teamId: string; gameDate: string; seasonNumber: number },
): Promise<number> {
  const db = env.DB;
  await db.prepare(
    `UPDATE club_incidents SET status = 'uzavreny', resolution = 'konec_sezony', resolved_on = ?
      WHERE team_id = ? AND season_number < ? AND status IN ('hrozi', 'otevreny', 'policie', 'probiha')`,
  ).bind(t.gameDate, t.teamId, t.seasonNumber).run()
    .catch((e) => logger.warn({ module: M }, `uzavření incidentů minulé sezóny ${t.teamId}`, e));

  const prosle = await db.prepare(
    `UPDATE club_incidents SET status = 'uzavreny', resolution = 'nevyreseno', resolved_on = ?
      WHERE team_id = ? AND status = 'otevreny' AND deadline IS NOT NULL AND deadline <= ?
      RETURNING kind, category`,
  ).bind(t.gameDate, t.teamId, t.gameDate).all<{ kind: string; category: string }>()
    .catch((e) => { logger.warn({ module: M }, `uzavření incidentů po lhůtě ${t.teamId}`, e); return { results: [] as Array<{ kind: string; category: string }> }; });

  for (const r of prosle.results) {
    const nazev = KATALOG_PODLE_KIND.get(r.kind)?.label ?? r.kind;
    const sablona = r.category === "kradez" ? TEXTY.lhuta_kradez[0] : TEXTY.lhuta_poskozeni[0];
    await sendSystemSMS(db, t.teamId, SMS_ROLE_KUSTOD, vypln(sablona, { nazev }));
  }
  return prosle.results.length;
}
```

- [ ] **Step 2: Typecheck a testy modulu**

Run: `cd apps/api && npx tsc --noEmit -p . && npx vitest run src/incidents`
Expected: bez chyb, PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/incidents/dopady.ts
git commit -m "feat(incidenty): zapis incidentu, skutecna skoda a oznameni"
```

---

## Task 9: Denní krok v `processTeamDay`

**Files:**
- Create: `apps/api/src/incidents/denni-krok.ts`
- Modify: `apps/api/src/season/team-day.ts` (před komentářem `// ── Fanouškovské party: velikost podle fanbáze, nálada o den dál ──`, a SELECT v `processLeagueDay` ~ř. 647)
- Modify: `apps/api/src/season/daily-tick.ts:1082` (SELECT `allTeams`)

**Interfaces:**
- Consumes: `nactiStavKlubu` (Task 7), `vylosujIncident` (Task 6), `zapisIncident`, `oznamIncident`, `uzavriProsleIncidenty` (Task 8)
- Produces: `zpracujIncidentyDne(env: Bindings, team: Record<string, unknown>, gameDate: string): Promise<void>`

Kontext pro implementátora:
- Rezervy U21 mají v `teams.user_id` id majitele áčka, takže `user_id !== "ai"` je za lidské nepozná. Proto se do obou SELECTů týmů přidává `t.team_type` a krok rezervy přeskočí. Vybavení i stadion patří áčku.
- Krok běží před blokem fanoušků, aby `club_events` z pozdějších fází fanoušci zpracovali týž den (spec 6a).
- Chyba v kroku nesmí shodit zpracování dne týmu: obalit `try/catch` s `logger.warn`.

- [ ] **Step 1: Implementace kroku**

`apps/api/src/incidents/denni-krok.ts`:

```ts
/**
 * Incidenty jednoho klubu za jeden herní den (spec Část 6b, fáze 1).
 * Volá `processTeamDay`. AI kluby a rezervy U21 se ve fázi 1 přeskakují.
 */

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { oznamIncident, uzavriProsleIncidenty, zapisIncident } from "./dopady";
import { vylosujIncident } from "./losovani";
import { nactiStavKlubu } from "./stav-klubu";

const M = "incidents-den";

export async function zpracujIncidentyDne(env: Bindings, team: Record<string, unknown>, gameDate: string): Promise<void> {
  if (team.user_id === "ai" || team.team_type === "u21") return;
  const teamId = team.id as string;

  const sezona = await env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>()
    .catch((e) => { logger.warn({ module: M }, "aktivní sezóna", e); return null; });
  if (!sezona) return;

  // Nejdřív uzavřít staré, aby se uvolnil limit otevřených problémů.
  await uzavriProsleIncidenty(env, { teamId, gameDate, seasonNumber: sezona.number });

  const stav = await nactiStavKlubu(env.DB, { id: teamId, league_id: (team.league_id as string | null) ?? null }, gameDate, sezona.number);
  if (!stav) return;

  const rng = createRng(seedFromString(`incident|${teamId}|${stav.den}`));
  const navrh = vylosujIncident(stav, rng);
  if (!navrh) return;

  const id = await zapisIncident(env.DB, stav, navrh);
  if (!id) return;
  await oznamIncident(env, teamId, navrh);
  logger.info({ module: M, teamId }, `incident ${navrh.kind}, pachatel ${navrh.culpritType}`);
}
```

- [ ] **Step 2: Zapojit do `team-day.ts`**

Těsně nad řádek `    // ── Fanouškovské party: velikost podle fanbáze, nálada o den dál ──` vložit:

```ts
    // ── Incidenty v klubu: krádeže a poškození ──
    // Před fanoušky, aby reakce fanoušků na incident (club_events) proběhla týž den.
    try {
      const { zpracujIncidentyDne } = await import("../incidents/denni-krok");
      await zpracujIncidentyDne(env, team, newGameDate);
    } catch (e) {
      logger.warn({ module: "team-day", teamId }, "incidenty dne", e);
    }

```

V `processLeagueDay` (SELECT začínající `"SELECT t.id, t.user_id, t.league_id, t.game_date, t.training_type, …`) přidat za `t.user_id,` sloupec `t.team_type,`. Totéž v `apps/api/src/season/daily-tick.ts` v dotazu `allTeams`.

- [ ] **Step 3: Typecheck a všechny testy API**

Run: `cd apps/api && npx tsc --noEmit -p . && npx vitest run`
Expected: bez chyb, PASS (žádný existující test se nerozbil).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/incidents/denni-krok.ts apps/api/src/season/team-day.ts apps/api/src/season/daily-tick.ts
git commit -m "feat(incidenty): denni krok v processTeamDay"
```

---

## Task 10: API incidentů a admin spuštění

**Files:**
- Create: `apps/api/src/routes/incidents.ts`
- Modify: `apps/api/src/index.ts` (import za `fansRouter`, `app.route("/api", incidentsRouter);` za `app.route("/api", fansRouter);`)

**Interfaces:**
- Consumes: `tymyDivaka` (`auth/divak.ts`), `requireAdmin` (`auth/middleware.ts`), `KATALOG_PODLE_KIND` (Task 5), `popisZtraty`, `nactiZtraty` (Task 6), `nactiStavKlubu` (Task 7), `zapisIncident`, `oznamIncident` (Task 8)
- Produces:
  - `GET /api/teams/:teamId/incidents` → `{ incidents: IncidentVerejny[] }`, 403 pro cizí tým
  - `POST /api/admin/incidents/force` `{ teamId, kind }` → `{ ok: true, id, incident }` nebo 400/404/409

```ts
interface IncidentVerejny {
  id: string; kind: string; label: string; emoji: string;
  category: string; status: string; severity: number;
  gameDate: string; deadline: string | null; text: string;
  ztraty: string[];
  pachatel: { playerId: string; jmeno: string | null } | null; // jen při culprit_revealed = 1
  resolution: string | null; resolvedOn: string | null;
}
```

Kontext pro implementátora:
- `requireTeamOwnership` pouští GET bez kontroly. Incident nese podezřelé a pachatele, proto GET ověřuje vlastnictví výslovně přes `tymyDivaka`.
- Neodhaleného pachatele API **nikdy** nevrací (spec Část 7).
- Admin force obchází šanci, cooldown, ochranu nového týmu i limit otevřených problémů, **podmínky ne**. Slouží k ověření na testingu.
- Žádný prázdný catch ani u `c.req.json()`.

- [ ] **Step 1: Implementace**

`apps/api/src/routes/incidents.ts`:

```ts
/**
 * Incidenty v klubu: přehled pro manažera a ruční spuštění pro testování.
 * Spec docs/superpowers/specs/2026-09-16-incidenty-design.md, Část 7 a 11.
 */

import { Hono } from "hono";
import { tymyDivaka } from "../auth/divak";
import { requireAdmin } from "../auth/middleware";
import { cryptoSeed, createRng } from "../generators/rng";
import { oznamIncident, zapisIncident } from "../incidents/dopady";
import { KATALOG_PODLE_KIND } from "../incidents/katalog";
import { nactiZtraty, popisZtraty } from "../incidents/popis";
import { nactiStavKlubu } from "../incidents/stav-klubu";
import type { NavrhIncidentu } from "../incidents/typy";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";

export const incidentsRouter = new Hono<{ Bindings: Bindings }>();
incidentsRouter.use("/admin/incidents/*", requireAdmin);

const M = "incidents-api";

interface IncidentRow {
  id: string; kind: string; category: string; status: string; severity: number;
  game_date: string; deadline: string | null; culprit_player_id: string | null;
  culprit_revealed: number; loss: string; text: string;
  resolution: string | null; resolved_on: string | null;
  jmeno: string | null; prijmeni: string | null;
}

function verejnyIncident(r: IncidentRow) {
  const def = KATALOG_PODLE_KIND.get(r.kind);
  const odhalen = r.culprit_revealed === 1 && !!r.culprit_player_id;
  return {
    id: r.id, kind: r.kind, label: def?.label ?? r.kind, emoji: def?.emoji ?? "❗",
    category: r.category, status: r.status, severity: r.severity,
    gameDate: r.game_date, deadline: r.deadline, text: r.text,
    ztraty: nactiZtraty(r.loss).map(popisZtraty),
    // Neodhaleného pachatele API nevrací nikdy.
    pachatel: odhalen
      ? { playerId: r.culprit_player_id as string, jmeno: [r.jmeno, r.prijmeni].filter(Boolean).join(" ") || null }
      : null,
    resolution: r.resolution, resolvedOn: r.resolved_on,
  };
}

// ── GET /api/teams/:teamId/incidents ─────────────────────────────────────────
incidentsRouter.get("/teams/:teamId/incidents", async (c) => {
  const teamId = c.req.param("teamId");
  if (!(await tymyDivaka(c)).has(teamId)) return c.json({ error: "Přístup odepřen" }, 403);

  const rows = await c.env.DB.prepare(
    `SELECT i.id, i.kind, i.category, i.status, i.severity, i.game_date, i.deadline,
            i.culprit_player_id, i.culprit_revealed, i.loss, i.text, i.resolution, i.resolved_on,
            COALESCE(p.first_name, d.first_name) AS jmeno, COALESCE(p.last_name, d.last_name) AS prijmeni
       FROM club_incidents i
       LEFT JOIN players p ON p.id = i.culprit_player_id
       LEFT JOIN departed_players d ON d.id = i.culprit_player_id
      WHERE i.team_id = ?
        AND (i.status != 'uzavreny' OR i.game_date >= date((SELECT game_date FROM teams WHERE id = ?), '-30 days'))
      ORDER BY i.game_date DESC
      LIMIT 50`,
  ).bind(teamId, teamId).all<IncidentRow>()
    .catch((e) => { logger.warn({ module: M }, `incidenty ${teamId}`, e); return null; });
  if (!rows) return c.json({ error: "Incidenty se nepodařilo načíst" }, 500);

  return c.json({ incidents: rows.results.map(verejnyIncident) });
});

// ── POST /api/admin/incidents/force ──────────────────────────────────────────
// Jen pro ověření na testingu. Obchází šanci, cooldown, ochranu nového týmu
// a limit otevřených problémů. Podmínky (co klub má) neobchází nikdy.
incidentsRouter.post("/admin/incidents/force", async (c) => {
  const body = await c.req.json<{ teamId?: string; kind?: string }>()
    .catch((e) => { logger.warn({ module: M }, "admin force: neplatné tělo", e); return null; });
  if (!body?.teamId || !body.kind) return c.json({ error: "Chybí teamId nebo kind" }, 400);

  const def = KATALOG_PODLE_KIND.get(body.kind);
  if (!def) return c.json({ error: `Neznámý typ incidentu ${body.kind}` }, 400);

  const team = await c.env.DB.prepare("SELECT id, league_id, game_date FROM teams WHERE id = ?")
    .bind(body.teamId).first<{ id: string; league_id: string | null; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "admin force: tým", e); return null; });
  if (!team?.game_date) return c.json({ error: "Tým nenalezen nebo nemá herní datum" }, 404);

  const sezona = await c.env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>()
    .catch((e) => { logger.warn({ module: M }, "admin force: sezóna", e); return null; });
  if (!sezona) return c.json({ error: "Není aktivní sezóna" }, 500);

  const stav = await nactiStavKlubu(c.env.DB, team, team.game_date, sezona.number);
  if (!stav) return c.json({ error: "Stav klubu se nepodařilo načíst" }, 500);
  if (!def.muze(stav)) return c.json({ error: "Klub podmínky pro tenhle incident nesplňuje", kind: def.kind }, 409);

  let navrh: NavrhIncidentu | null = null;
  for (let pokus = 0; pokus < 50 && !navrh; pokus++) navrh = def.vytvor(stav, createRng(cryptoSeed()));
  if (!navrh) return c.json({ error: "Incident se nestal ani na 50 pokusů (odradil zámek nebo chybí kandidát)" }, 409);

  const id = await zapisIncident(c.env.DB, stav, navrh, `inc-${team.id}-${navrh.kind}-${stav.den}-admin-${Date.now()}`);
  if (!id) return c.json({ error: "Škodu se nepodařilo provést", incident: navrh }, 409);

  await oznamIncident(c.env, team.id, navrh);
  return c.json({ ok: true, id, incident: navrh });
});
```

- [ ] **Step 2: Registrace routeru**

`apps/api/src/index.ts`: za `import { fansRouter } from "./routes/fans";` přidat `import { incidentsRouter } from "./routes/incidents";` a za `app.route("/api", fansRouter);` přidat `app.route("/api", incidentsRouter);`.

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p .`
Expected: bez chyb.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/incidents.ts apps/api/src/index.ts
git commit -m "feat(incidenty): API prehledu incidentu a admin spusteni"
```

---

## Task 11: Odstranit ploché krádeže a vandalismus z událostí mezi koly

**Files:**
- Modify: `apps/api/src/events/between-rounds.ts` (pravidla „Vykradení kabiny" ř. ~196–214, „Vandalizmus" ř. ~258–276, pražské varianty ř. ~325–327)

Kontext: tyhle dvě události strhávaly peníze bez pachatele a bez skutečné škody. Jejich roli převzal katalog incidentů (spec Část 12). „Havárie na hřišti" a „Pokuta od svazu" zůstávají.

- [ ] **Step 1: Smazat pravidla**

Z pole pravidel odstranit celý objekt začínající

```ts
  {
    category: "negative",
    title: "Vykradení kabiny",
```

až po jeho uzavírací `},` (před objektem `title: "Havárie na hřišti"`), a celý objekt začínající

```ts
  {
    category: "negative",
    title: "Vandalizmus",
```

až po jeho `},` (před komentářem `// === NEUTRÁLNÍ ===`).

V mapě `pragueTexts` odstranit řádky s klíči `"Vykradení kabiny"` a `"Vandalizmus"`.

- [ ] **Step 2: Ověřit, že nic dalšího na texty neodkazuje**

Run: `grep -rn "Vykradení kabiny\|Vandalizmus" apps/api/src apps/web/src`
Expected: žádný výstup.

- [ ] **Step 3: Typecheck a testy**

Run: `cd apps/api && npx tsc --noEmit -p . && npx vitest run src/events src/season`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/events/between-rounds.ts
git commit -m "refactor(udalosti): krádež a vandalismus mezi koly nahrazují incidenty"
```

---

## Task 12: Stránka Incidenty a navigace

**Files:**
- Create: `apps/web/src/app/dashboard/incidenty/page.tsx`
- Modify: `apps/web/src/components/dashboard/fm-sidebar.tsx` (za položku Hospoda), `apps/web/src/app/dashboard/more/page.tsx` (sekce Klub, za Hospodu)

**Interfaces:**
- Consumes: `GET /api/teams/:teamId/incidents` (Task 10)

Kontext pro implementátora: vzor stránky `apps/web/src/app/dashboard/reputace/page.tsx` (`useTeam`, `apiFetch`, `Spinner`, `SectionLabel`, třída `card`, `page-container`). Pravidla UI: mobile-first, minimálně `text-sm`, jméno pachatele jako odkaz, žádná angličtina, žádné ceny v tlačítkách. Fáze 1 jen zobrazuje, akce přijdou ve fázi 2.

- [ ] **Step 1: Stránka**

`apps/web/src/app/dashboard/incidenty/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel } from "@/components/ui";

type StavIncidentu = "hrozi" | "otevreny" | "policie" | "probiha" | "uzavreny";

interface Incident {
  id: string;
  kind: string;
  label: string;
  emoji: string;
  category: string;
  status: StavIncidentu;
  severity: number;
  gameDate: string;
  deadline: string | null;
  text: string;
  ztraty: string[];
  pachatel: { playerId: string; jmeno: string | null } | null;
  resolution: string | null;
  resolvedOn: string | null;
}

const STAV_LABEL: Record<StavIncidentu, string> = {
  hrozi: "Hrozí", otevreny: "Řeší se", policie: "Šetří policie", probiha: "Probíhá", uzavreny: "Uzavřeno",
};

const STAV_TRIDA: Record<StavIncidentu, string> = {
  hrozi: "bg-amber-100 text-amber-700",
  otevreny: "bg-red-100 text-red-700",
  policie: "bg-blue-100 text-blue-700",
  probiha: "bg-amber-100 text-amber-700",
  uzavreny: "bg-gray-100 text-muted",
};

const VYSLEDEK_LABEL: Record<string, string> = {
  nevyreseno: "Nevyřešeno",
  konec_sezony: "Uzavřeno koncem sezóny",
  bez_skody: "Bez škody",
};

function datum(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", timeZone: "UTC" });
}

export default function IncidentyPage() {
  const { teamId } = useTeam();
  const [incidenty, setIncidenty] = useState<Incident[] | null>(null);
  const [chyba, setChyba] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ incidents: Incident[] }>(`/api/teams/${teamId}/incidents`)
      .then((d) => setIncidenty(d.incidents))
      .catch((e) => { console.error("incidents fetch:", e); setChyba(true); });
  }, [teamId]);

  if (chyba) {
    return <div className="page-container"><div className="card p-4 text-sm text-muted">Incidenty se nepodařilo načíst.</div></div>;
  }
  if (!incidenty) {
    return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  }

  const zive = incidenty.filter((i) => i.status !== "uzavreny");
  const uzavrene = incidenty.filter((i) => i.status === "uzavreny");

  return (
    <div className="page-container space-y-5">
      <div className="card p-4 sm:p-5">
        <SectionLabel>Incidenty v klubu</SectionLabel>
        <p className="text-sm text-muted">
          Krádeže, rozbité vybavení a další průšvihy. Ukradené vybavení v klubu opravdu chybí
          a rozbité zařízení nefunguje, dokud ho neopravíš. Proti zlodějům zvenku pomáhá
          zabezpečení areálu ve vybavení.
        </p>
      </div>
      <Seznam titulek="Řeší se" incidenty={zive} prazdne="Teď je v klubu klid." />
      {uzavrene.length > 0 && <Seznam titulek="Uzavřené za poslední měsíc" incidenty={uzavrene} />}
    </div>
  );
}

function Seznam({ titulek, incidenty, prazdne }: { titulek: string; incidenty: Incident[]; prazdne?: string }) {
  return (
    <div className="card p-4 sm:p-5">
      <SectionLabel>{titulek}</SectionLabel>
      {incidenty.length === 0
        ? <div className="text-sm text-muted">{prazdne}</div>
        : <div className="space-y-3">{incidenty.map((i) => <Karta key={i.id} incident={i} />)}</div>}
    </div>
  );
}

function Karta({ incident: i }: { incident: Incident }) {
  const vysledek = i.resolution ? VYSLEDEK_LABEL[i.resolution] : undefined;
  return (
    <div className="border border-gray-100 rounded-soft p-3">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>{i.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading font-bold text-base">{i.label}</span>
            <span className={`text-xs font-heading font-bold px-2 py-0.5 rounded-full ${STAV_TRIDA[i.status]}`}>{STAV_LABEL[i.status]}</span>
          </div>
          <div className="text-sm text-muted">
            {datum(i.gameDate)}
            {i.status === "otevreny" && i.deadline && ` · uzavře se ${datum(i.deadline)}`}
            {vysledek && ` · ${vysledek}`}
          </div>
          <p className="text-sm mt-2">{i.text}</p>
          {i.ztraty.length > 0 && (
            <ul className="mt-2 space-y-1">
              {i.ztraty.map((z, n) => <li key={n} className="text-sm text-card-red">{z}</li>)}
            </ul>
          )}
          {i.pachatel?.jmeno && (
            <div className="text-sm mt-2">
              Pachatel:{" "}
              <Link href={`/dashboard/player/${i.pachatel.playerId}`} className="font-heading font-bold underline decoration-pitch-500/20 hover:text-pitch-500">
                {i.pachatel.jmeno}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Navigace**

`fm-sidebar.tsx`, za `{ href: "/dashboard/hospoda", label: "Hospoda", icon: "\u{1F37A}", group: "club" },` přidat:

```tsx
  { href: "/dashboard/incidenty", label: "Incidenty", icon: "\u{1F6A8}", group: "club" },
```

`more/page.tsx`, za `{ href: "/dashboard/hospoda", icon: "\u{1F37A}", label: "Hospoda", color: "#8B5A2B" },` přidat:

```tsx
    { href: "/dashboard/incidenty", icon: "\u{1F6A8}", label: "Incidenty", color: "#7A2E2E" },
```

- [ ] **Step 3: Build**

Run: `cd apps/web && npx next build --no-lint`
Expected: build projde, v seznamu stránek je `/dashboard/incidenty`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/incidenty apps/web/src/components/dashboard/fm-sidebar.tsx apps/web/src/app/dashboard/more/page.tsx
git commit -m "feat(incidenty): stranka incidentu a navigace"
```

---

## Task 13: Zapsat odchylky do specu

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-incidenty-design.md`

- [ ] **Step 1: Upravit spec**

1. Část 3, komentář u `loss` a blok `type Ztrata`: `loss` je **JSON pole** `Ztrata[]`, u `stadion` volitelné `damageId`.
2. Část 4b, `pozar_grilu`: škoda na stánku je druhá položka pole ztrát. `kopnute_dvere`: pokuta svazu až ve fázi 10.
3. Část 5a, odstavec „Podíl cizího pachatele u vloupání" nahradit:

   > Pokus o krádež: nejdřív se vybere kandidát z kádru (`vyberHrace`). S pravděpodobností 50 % (nebo vždy, když kandidát není) jde o pokus zvenku. Pokus zvenku uspěje s pravděpodobností plot × osvětlení × `theftRiskMul`; když neuspěje, nestane se nic. Úspěšného zloděje ještě může vyplašit alarm (zabezpečení ≥ 2 u skladu a kabin, = 3 u parkoviště). Zabezpečení tak krádeže ubírá, nepřesouvá je na hráče.
4. Část 5c: startovní úroveň zabezpečení je u všech klubů 0.
5. Část 6a: ve fázi 1 se AI kluby přeskakují úplně.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-09-16-incidenty-design.md
git commit -m "docs(incidenty): zpresneni specu podle planu faze 1"
```

---

## Task 14: Nasazení na testing a ověření

**Files:** žádné nové

Předpoklad: Tasky 1–13 commitnuté, `npx vitest run` a `npm run typecheck` zelené, `cd apps/web && npx next build --no-lint` projde.

- [ ] **Step 1: Migrace na testovací DB (před pushem kódu)**

```bash
cd apps/api && npx wrangler d1 execute prales-db-test --remote --file migrations/0204_incidenty_zaklad.sql
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT (SELECT COUNT(*) FROM pragma_table_info("club_incidents")) AS sloupcu_incidentu, (SELECT COUNT(*) FROM pragma_table_info("equipment") WHERE name LIKE "area_security%") AS sloupcu_zabezpeceni'
```

Expected: `sloupcu_incidentu` 27, `sloupcu_zabezpeceni` 2. Bez migrace by denní krok a `/equipment` padaly na neznámém sloupci.

- [ ] **Step 2: Push a počkat na CI**

```bash
git push origin testing
gh run list --branch testing --limit 1 --json status,conclusion,headSha
```

Čekat, dokud `status` není `completed`. Expected: `conclusion: success`.

- [ ] **Step 3: API bez přihlášení**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://api-test.prales.fun/api/teams/302a0ce7-428a-4da8-b4ac-40f27eb9a7d1/incidents"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://api-test.prales.fun/api/admin/incidents/force" -H "Content-Type: application/json" -d '{"teamId":"302a0ce7-428a-4da8-b4ac-40f27eb9a7d1","kind":"vandal"}'
```

Expected: `403` a `401`.

- [ ] **Step 4: Prohlížeč, přihlášený testovací účet (heslo nezadávat, použít existující relaci uživatele)**

1. `tabs_context_mcp` → nový tab → `https://test.prales.fun/dashboard/equipment`. Screenshot: v seznamu je „Zabezpečení areálu" s ikonou 🔒 a úrovní 0.
2. `https://test.prales.fun/dashboard/incidenty`: screenshot, prázdný stav „Teď je v klubu klid.".
3. Stav před pokusem (javascript_tool, token zůstává v prohlížeči):

```js
const h = { Authorization: "Bearer " + localStorage.getItem("om_token") };
const t = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1";
const eq = await fetch(`https://api-test.prales.fun/api/teams/${t}/equipment`, { headers: h }).then(r => r.json());
eq.categories.filter(k => k.level > 0).map(k => `${k.key}:${k.level}`)
```

4. Spustit krádež ze skladu a vandala:

```js
const h = { Authorization: "Bearer " + localStorage.getItem("om_token"), "Content-Type": "application/json" };
const t = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1";
const kradez = await fetch("https://api-test.prales.fun/api/admin/incidents/force", { method: "POST", headers: h, body: JSON.stringify({ teamId: t, kind: "vloupani_sklad" }) }).then(r => r.json());
const vandal = await fetch("https://api-test.prales.fun/api/admin/incidents/force", { method: "POST", headers: h, body: JSON.stringify({ teamId: t, kind: "vandal" }) }).then(r => r.json());
({ kradez, vandal })
```

   Pozor (reference_browser_async_fetch): prázdný výsledek neznamená, že se nic nestalo. Před opakováním zkontrolovat DB (Step 5).

5. Ověřit skutečnou škodu v DB:

```bash
cd apps/api && npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT kind, status, culprit_type, culprit_revealed, loss, text FROM club_incidents WHERE team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" ORDER BY created_at DESC LIMIT 5'
```

   Expected: u `vloupani_sklad` je v `loss` kategorie, která byla v kroku 3 na úrovni > 0, a v `equipment` je teď na 0 (zkontrolovat stejným fetchem jako v kroku 3). U `vandal` buď nový řádek v `stadium_damage` (`incident_id` začíná `inc-…-admin-`) a snížená úroveň zařízení, nebo nižší `stadiums.pitch_condition`.

6. `https://test.prales.fun/dashboard/incidenty`: screenshot, obě karty se štítkem „Řeší se", text, řádek škody červeně, **bez jména pachatele**.
7. `https://test.prales.fun/dashboard/phone`: SMS od „Kustod" s textem incidentu.
8. Chybová cesta: `force` s `kind: "dodavka_ukradena"` u klubu bez dodávky vrací 409 „Klub podmínky pro tenhle incident nesplňuje" (pokud klub dodávku má, použít `kradez_kamery`, zabezpečení je na 0).
9. Mobilní šířka: `resize_window` 390×844, screenshot stránky incidentů.
10. Zavřít tab.

- [ ] **Step 5: Vrátit testovací klub do původního stavu**

Ukradenou kategorii vrátit podle `loss` (úroveň a stav z kroku 5), např.:

```bash
cd apps/api && npx wrangler d1 execute prales-db-test --remote --command 'UPDATE equipment SET <kategorie> = <uroven>, <kategorie>_condition = <stav> WHERE team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1"'
```

Poškození stadionu opravit tlačítkem Opravit na stránce Incidenty (sekce Rozbité zařízení), nebo nechat.

- [ ] **Step 6: Denní běh**

Po nejbližším denním ticku na testingu (cron `0 3 * * *` UTC) zkontrolovat, že krok nepadá:

```bash
cd apps/api && npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT COUNT(*) AS incidentu, SUM(id NOT LIKE "%-admin-%") AS z_ticku FROM club_incidents'
```

a v logu workeru (`npx wrangler tail --env testing` během ticku nebo Cloudflare dashboard) nejsou chyby `incidents-*`. Nula incidentů z ticku po jednom dni je v pořádku (šance ~4 % na klub).

- [ ] **Step 7: Zapsat do paměti**

Do `project_prod_deploy_pending.md` doplnit: migrace 0204 musí na produkci **před** merge kódu, jinak padá `/equipment` i denní krok.

✋ **STOP.** Na produkci nic bez výslovného „nasaď na main".

---

## Další fáze (plán se píše vždy před začátkem fáze nad aktuálním kódem)

| Fáze | Spec | Staví na fázi 1 |
|---|---|---|
| 2 Vyšetřování | 5b, 7a–7e | tabulka `club_incident_clues`, stopy se generují v `zapisIncident` po provedení škody; akce obvinit, policie, tresty nad `club_incidents.status`; `uzavriProsleIncidenty` dostane recidivu |
| 3 Absence, trénink, zápas | 17a–17c | `hracProAbsenci` (už existuje), tabulka `club_incident_absences`, post-pass v 6 místech omluvenek |
| 4 Znalosti a chat | 10, 17d | `club_incident_knowledge` se plní v `zapisIncident`; `PlayerSnapshot.znalostiIncidentu` |
| 5 Bazar | 8 | `equipment_listings.incident_id`; `bazar_on` se nastaví v `zapisIncident` pro kradené prodejné kategorie |
| 6 Hospoda | 9, 9a | stav `hrozi` už je v CHECK; příhody v `season/pub.ts` čtou `club_incidents` a znalosti |
| 7 Peníze a životní situace | 4a (kasa, tombola, útěk, ekonom), 4c | nové kindy v `KATALOG`, typ ztráty `penize`, transakce `incident_*` |
| 8 Obec | 17e | reakce po přechodu stavu incidentu |
| 9 Tisk, fanoušci, sponzoři | 17f, 17h | `ClubEventKind` z `oznamIncident` |
| 10 Přestupy, grémium, rivalové | 17g, 17i | pokuta za kopnuté dveře přes `issueSanction` |
| 11 Sezóna a pozitivní | 4d, 17k | pozitivní kindy, AI kluby v `zpracujIncidentyDne` |
