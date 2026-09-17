# Incidenty v klubu, fáze 5 (Bazar) — implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ukradené prodejné vybavení se po pár dnech objeví v bazaru ligy jako soukromý inzerát. Okradený klub pozná jen poznatelné věci (dresy s čísly, dodávku s logem, poháry, šály), dostane SMS a stopu, může věci koupit zpátky nebo inzerát nahlásit policii. Když je koupí jiný klub, okradený se to dozví.

**Architecture:** Čisté jádro `incidents/bazar.ts` rozhoduje, jestli a kdy zboží půjde do bazaru, za kolik, kdo ho prodává a co okradený klub pozná. `zapisIncident` při vzniku uloží `bazar_on`. `incidents/bazar-db.ts` v denním kroku vystaví inzerát (`equipment_listings` s `incident_id`), při poznání pošle SMS a zapíše stopu `bazar` s bonusem pro policii, po nákupu označí vrácení nebo zapíše, kdo věci koupil, a obslouží nahlášení policii. Route bazaru dostane nová pole a endpoint `nahlasit`, frontend štítek, odznak a tlačítko.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, D1, Vitest, Next.js 15

**Spec:** `docs/superpowers/specs/2026-09-16-incidenty-design.md` (Části 5b stopa `bazar`, 6b krok 6, 7c šance policie, 8 Bazar, 11 frontend)

## Global Constraints

- **Branch:** `testing`. Push dělá až controller v posledním tasku. Push na `main` je zakázaný bez výslovného souhlasu uživatele.
- **UI a texty pro hráče česky**, s diakritikou, minimálně `text-sm`, jména `text-base`, ceny nikdy v tlačítkách, mobile-first, do tabulek nepřidávat sloupce, žádné `confirm()`/`alert()` prohlížeče (stránka vybavení má vlastní `useConfirm`).
- **V textech pro hráče nikdy dlouhá pomlčka „—".** Jména a názvy obcí jen v 1. pádě (za dvojtečkou nebo za čárkou). Každá šablona v `TEXTY` končí tečkou nebo vykřičníkem (hlídá `texty.test.ts`).
- **Žádný prázdný catch.** Server `logger.warn({ module: "xyz" }, "popis", e)` nebo `logger.error`, klient `console.error("popis:", e)`.
- **Invariant ceny:** cena kradeného zboží nikdy pod `getBazarPriceBand(...).min` (= výkup zastavárny při stavu 100 %). Jinak koupě a okamžité zastavení tiskne peníze.
- **Kradený inzerát:** `team_id = NULL`, `is_ai_listing = 0` (nesmí ubírat z cíle AI nabídek), `incident_id` vyplněné, id deterministické `bazar-{incidentId}-{kategorie}`, zápis `INSERT OR IGNORE`.
- **Tajné údaje:** cizí klub z API nepozná, čí zboží to je (`vypadaJakoVase` a `incidentId` jen okradenému klubu a jen u poznatelného zboží). Neodhalený pachatel se nikde nejmenuje.
- **Herní vs. reálný čas:** `bazar_on` je herní den; expirace inzerátu je reálný čas jako u ostatních inzerátů.
- **Determinismus:** los bazaru `createRng(seedFromString("bazar|" + incidentId))`, stejný incident dá vždy stejný den, cenu i prodejce.
- **Názvy sloupců do SQL jen z konstant nebo whitelistu `CATEGORIES`**, nikdy ze vstupu. Parametry jen `?`.
- **Testy:** `cd apps/api && npx vitest run <cesta>`. **Typecheck:** `cd apps/api && npx tsc --noEmit`, FE `cd apps/web && npx tsc --noEmit`.
- **Commit** po každém tasku: `git add <soubory> && git commit -F - <<'EOF'` se zprávou a posledním řádkem `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Nikdy `git add -A`.
- **Migrace** `0207_incidenty_bazar.sql` se na `prales-db-test` aplikuje až v posledním tasku (controller), před pushem. Na produkci nic.

---

## Odchylky od specu (zapsat do specu v Tasku 7)

| Místo ve specu | Plán | Proč |
|---|---|---|
| 8 prodejce „Láďa z Volar" | 1. pád: „Láďa, Volary" nebo „Soukromý inzerát, Volary"; obec náhodně z `villages` okresu ligy, bez obcí záložní seznam | skloňování názvů obcí generátor spolehlivě neumí, pravidlo 1. pádu |
| 7c „aktivní poznaný inzerát 0,3" | stopa `bazar` s `police_bonus 0,3` vznikne při poznání a platí i po stažení nebo prodeji inzerátu | šance policie se sčítá z nalezených stop (fáze 2); jednou poznané zboží je důkaz |
| 8 nahlásit | jen poznatelné, jen okradený klub; když policie ještě nešetřila, spustí tok 7c; když právě šetří, inzerát se jen zajistí (SMS policie); po skončeném šetření, u odhaleného pachatele nebo uzavřeného incidentu 409 a inzerát zůstane | policie jen jednou na incident (7c) |
| 8 GET `incidentId` | jen okradenému klubu a jen u poznatelného zboží | u nepoznatelného by id prozradilo, že jde o jeho věci |
| 8 koupí jiný klub | stopa „koupil klub X" a SMS Kustoda jen u poznatelného zboží; stopa jen u neuzavřeného incidentu | okradený klub o nepoznatelném zboží neví; stopy u uzavřených incidentů nevznikají (5b) |
| 8 koupit zpět | `recovered = 1`, SMS Kustoda; incident zůstává ve svém stavu | pachatel pořád není známý, vyšetřování běží dál |
| 8 uzavřený incident | inzerát se vystaví i u uzavřeného incidentu, SMS a odznak ano, stopa ne | zloděj prodává bez ohledu na lhůtu klubu |
| 8 vrácené věci | `recovered = 1` (policie dopadla cizího pachatele) → inzerát nevznikne | věci jsou zpátky |
| 6b krok 6 | vystavení běží v denním kroku po vyšetřování a křivdě, před losem nových incidentů | výsledek policie téhož dne může věci vrátit |
| ověření | admin `POST /api/admin/incidents/vysetrovani` přijme `bazarTed`: u otevřených prodejných krádeží bez inzerátu nastaví `bazar_on` na dnešek (přebije los 60 %) a hned vystaví | jinak se na testingu čeká 1–5 dní a na los |

---

## Struktura souborů

| Soubor | Odpovědnost |
|---|---|
| `apps/api/migrations/0207_incidenty_bazar.sql` 🆕 | sloupec `equipment_listings.incident_id` a index |
| `apps/api/src/incidents/nastaveni.ts` | konstanty bazaru, bonus policie za bazar |
| `apps/api/src/incidents/texty.ts` | SMS a stopy bazaru |
| `apps/api/src/incidents/bazar.ts` 🆕 | čisté: prodejné krádeže, den bazaru, cena, prodejce, poznání, označení inzerátu |
| `apps/api/src/incidents/dopady.ts` | `bazar_on` při vzniku incidentu |
| `apps/api/src/incidents/stopy-db.ts` | `prikazyStop` s volitelným počátečním pořadím |
| `apps/api/src/incidents/bazar-db.ts` 🆕 | vystavení a poznání, nákup kradeného zboží, nahlášení policii |
| `apps/api/src/incidents/denni-krok.ts` | volání vystavení |
| `apps/api/src/routes/equipment-market.ts` | nová pole v GET, hook nákupu, POST `nahlasit` |
| `apps/api/src/routes/incidents.ts` | admin `bazarTed` |
| `apps/web/src/app/dashboard/equipment/{types.ts,BazarTab.tsx,page.tsx}` | štítek, odznak, tlačítko Nahlásit policii |

---
## Task 1: Migrace a čisté jádro bazaru

**Files:**
- Create: `apps/api/migrations/0207_incidenty_bazar.sql`
- Modify: `apps/api/src/incidents/nastaveni.ts` (na konec; `BONUS_POLICIE` o `bazar`)
- Modify: `apps/api/src/incidents/texty.ts` (nové klíče za `krivda_obvineny`)
- Create: `apps/api/src/incidents/bazar.ts`
- Test: `apps/api/src/incidents/bazar.test.ts`

**Interfaces:**
- Consumes: `getBazarPriceBand`, `getPawnQuote`, `CATEGORIES` (`equipment/equipment-generator`); `gameExpiry` (`lib/game-time`); `Ztrata` (`typy.ts`); `Rng`.
- Produces:
  - konstanty `PRODEJNE_KRADEZE`, `SANCE_BAZARU`, `BAZAR_DNI_MIN`, `BAZAR_DNI_MAX`, `SLEVA_KRADENEHO`, `KRADENE_INZERAT_DNI`, `BONUS_POLICIE.bazar = 0.3`
  - `jePoznatelne(kategorie: string, uroven: number): boolean`
  - `jeProdejnaKradez(kind: string): boolean`
  - `type KradeneZbozi = Extract<Ztrata, { typ: "vybaveni" }>`, `kradeneZbozi(ztraty): KradeneZbozi[]`
  - `denBazaru(kind: string, ztraty: readonly Ztrata[], gameDate: string, rng: Rng): string | null`
  - `cenaKradenehoZbozi(kategorie: string, uroven: number, stav: number): number`
  - `jmenoProdejce(obce: readonly string[], rng: Rng): string`
  - `oznaceniInzeratu(inzerat: { teamId; isAiListing; incidentId; incidentTeamId; category; level }, divakTeamId: string): { isPrivateListing: boolean; vypadaJakoVase: boolean; incidentId: string | null }`
  - texty `bazar_poznano`, `stopa_bazar`, `bazar_vraceno`, `bazar_koupil_jiny`, `policie_bazar`

- [ ] **Step 1: Migrace**

`apps/api/migrations/0207_incidenty_bazar.sql`:

```sql
-- Incidenty v klubu, fáze 5: kradené zboží jako soukromý inzerát v bazaru.
-- Spec docs/superpowers/specs/2026-09-16-incidenty-design.md, Část 3 a 8.
-- Spouštět ručně: npx wrangler d1 execute <db> --remote --file migrations/0207_incidenty_bazar.sql

ALTER TABLE equipment_listings ADD COLUMN incident_id TEXT;
CREATE INDEX IF NOT EXISTS idx_listings_incident ON equipment_listings(incident_id) WHERE incident_id IS NOT NULL;
```

- [ ] **Step 2: Konstanty**

V `apps/api/src/incidents/nastaveni.ts` do objektu `BONUS_POLICIE` za `svedek: 0.1,` přidej:

```ts
  /** Poznaný inzerát s kradeným zbožím (spec 7c, 8). */
  bazar: 0.3,
```

a na konec souboru:

```ts

/** Bazar (spec Část 8). */
/** Krádeže, jejichž lup se dá prodat v bazaru. */
export const PRODEJNE_KRADEZE = ["vloupani_sklad", "vitrina", "dodavka_ukradena", "kradez_kamery"] as const;
/** Šance, že zloděj věci zkusí prodat v bazaru ligy. Zbytek prodá jinde. */
export const SANCE_BAZARU = 0.6;
export const BAZAR_DNI_MIN = 1;
export const BAZAR_DNI_MAX = 5;
/** Kradené jde levněji než běžná nabídka, nikdy ale pod výkup zastavárny. */
export const SLEVA_KRADENEHO = 0.55;
/** Soukromý inzerát vydrží jako lidský inzerát, v reálných dnech. */
export const KRADENE_INZERAT_DNI = 7;
```

- [ ] **Step 3: Texty**

Do `TEXTY` v `apps/api/src/incidents/texty.ts` za klíč `krivda_obvineny`:

```ts
  bazar_poznano: [
    "V bazaru je vybavení, které vypadá jako naše: {vec}. Dá se koupit zpátky, nebo to nahlásit policii.",
    "Na inzerátu v bazaru jsou věci, které vypadají jako ty naše ukradené: {vec}.",
    "Někdo v bazaru prodává vybavení, které se podobá našemu: {vec}. Stojí za to se podívat.",
  ],
  stopa_bazar: [
    "V bazaru se objevilo vybavení, které vypadá jako naše: {vec}.",
    "Na soukromém inzerátu v bazaru jsou věci, které vypadají jako naše: {vec}.",
    "Kradené věci se nejspíš objevily v bazaru: {vec}.",
  ],
  bazar_vraceno: [
    "Věci jsou zpátky v klubu: {vec}.",
    "Koupili jsme zpátky, co nám ukradli: {vec}.",
    "Vybavení z bazaru je zase naše: {vec}.",
  ],
  bazar_koupil_jiny: [
    "Vybavení z bazaru, které vypadalo jako naše, koupil klub: {klub}.",
    "Věci, které vypadaly jako naše, si z bazaru odvezl klub: {klub}.",
    "Inzerát s věcmi podobnými našim už je pryč, koupil je klub: {klub}.",
  ],
  policie_bazar: [
    "Inzerát jsme zajistili a přidali k šetření: {vec}.",
    "Zboží z bazaru je zajištěné a patří k probíhajícímu šetření: {vec}.",
    "Inzerát je stažený, věci prověříme v rámci šetření: {vec}.",
  ],
```

- [ ] **Step 4: Napiš selhávající test**

`apps/api/src/incidents/bazar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CATEGORIES, getBazarPriceBand, getPawnQuote } from "../equipment/equipment-generator";
import { createRng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { seedFromString } from "../lib/seed";
import { cenaKradenehoZbozi, denBazaru, jePoznatelne, jmenoProdejce, kradeneZbozi, oznaceniInzeratu } from "./bazar";
import type { Ztrata } from "./typy";

const DNES = "2026-09-16T16:00:00.000Z";
const DRESY: Ztrata[] = [{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }];
const los = (id: string) => createRng(seedFromString(`bazar|${id}`));

describe("cena kradeného zboží", () => {
  it("nikdy pod výkupem zastavárny, pro všechny kategorie, úrovně a stavy", () => {
    for (const k of CATEGORIES) {
      for (let lv = 1; lv <= 3; lv++) {
        for (let s = 0; s <= 100; s += 5) {
          const cena = cenaKradenehoZbozi(k, lv, s);
          expect(cena, `${k} ${lv} ${s}`).toBeGreaterThanOrEqual(getBazarPriceBand(k, lv, s).min);
          expect(cena, `${k} ${lv} ${s}`).toBeGreaterThanOrEqual(getPawnQuote(k, lv, s));
        }
      }
    }
  });

  it("je levnější než běžná doporučená cena", () => {
    expect(cenaKradenehoZbozi("team_van", 2, 100)).toBeLessThan(getBazarPriceBand("team_van", 2, 100).suggested);
  });
});

describe("poznání", () => {
  it.each([
    ["jerseys", 1, false], ["jerseys", 2, true], ["team_van", 2, false], ["team_van", 3, true],
    ["trophy_case", 1, true], ["fan_drums", 1, false], ["fan_drums", 2, true], ["balls", 3, false], ["area_security", 3, false],
  ] as const)("%s úroveň %i: %s", (kategorie, uroven, ano) => {
    expect(jePoznatelne(kategorie, uroven)).toBe(ano);
  });
});

describe("co zloděj odnesl", () => {
  it("jen celé vybavení úrovně 1 až 3, ne opotřebení ani stadion", () => {
    expect(kradeneZbozi([
      ...DRESY,
      { typ: "vybaveni_stav", kategorie: "team_van", stavPred: 80, stavPo: 40 },
      { typ: "stadion", zarizeni: "fence", urovni: 1 },
      { typ: "vybaveni", kategorie: "balls", uroven: 0, stav: 50, urovniDolu: 0 },
    ])).toEqual(DRESY);
  });
});

describe("den bazaru", () => {
  it("jen prodejné krádeže s odneseným vybavením", () => {
    for (let i = 0; i < 50; i++) {
      expect(denBazaru("vandal", DRESY, DNES, los(`v${i}`))).toBeNull();
      expect(denBazaru("vloupani_sklad", [{ typ: "vybaveni_stav", kategorie: "team_van", stavPred: 80, stavPo: 40 }], DNES, los(`s${i}`))).toBeNull();
    }
  });

  it("zhruba 60 % krádeží, 1 až 5 herních dní po vzniku", () => {
    const povolene = [1, 2, 3, 4, 5].map((d) => gameExpiry(DNES, d));
    let vBazaru = 0;
    for (let i = 0; i < 400; i++) {
      const den = denBazaru("vloupani_sklad", DRESY, DNES, los(`inc-${i}`));
      if (den === null) continue;
      vBazaru++;
      expect(povolene).toContain(den);
    }
    expect(vBazaru / 400).toBeGreaterThan(0.5);
    expect(vBazaru / 400).toBeLessThan(0.7);
  });

  it("stejný incident dá stejný den", () => {
    expect(denBazaru("vitrina", DRESY, DNES, los("inc-x"))).toBe(denBazaru("vitrina", DRESY, DNES, los("inc-x")));
  });
});

describe("prodejce", () => {
  it("obec z okresu v 1. pádě, bez obcí záložní", () => {
    for (let i = 0; i < 30; i++) {
      const jmeno = jmenoProdejce(["Volary"], createRng(i));
      expect(jmeno).toMatch(/^(Soukromý inzerát|Láďa|Pepík|Franta|Jirka|Mirek|Standa|Honza|Zdeněk), Volary$/);
    }
    expect(jmenoProdejce([], createRng(1))).toMatch(/, (Lhota|Újezd|Dvory|Zálesí)$/);
  });
});

describe("co vidí klub v bazaru", () => {
  const inzerat = { teamId: null, isAiListing: false, incidentId: "inc-1", incidentTeamId: "tym-a", category: "jerseys", level: 2 };

  it("okradený klub pozná poznatelné zboží a dostane id incidentu", () => {
    expect(oznaceniInzeratu(inzerat, "tym-a")).toEqual({ isPrivateListing: true, vypadaJakoVase: true, incidentId: "inc-1" });
  });

  it("cizí klub vidí jen soukromý inzerát", () => {
    expect(oznaceniInzeratu(inzerat, "tym-b")).toEqual({ isPrivateListing: true, vypadaJakoVase: false, incidentId: null });
  });

  it("nepoznatelné zboží nepozná ani okradený klub", () => {
    expect(oznaceniInzeratu({ ...inzerat, category: "balls" }, "tym-a")).toEqual({ isPrivateListing: true, vypadaJakoVase: false, incidentId: null });
  });

  it("inzeráty klubů a okolí nejsou soukromé", () => {
    expect(oznaceniInzeratu({ ...inzerat, teamId: "tym-c", incidentId: null, incidentTeamId: null }, "tym-a").isPrivateListing).toBe(false);
    expect(oznaceniInzeratu({ ...inzerat, isAiListing: true, incidentId: null, incidentTeamId: null }, "tym-a").isPrivateListing).toBe(false);
  });
});
```

- [ ] **Step 5: Spusť test, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/bazar.test.ts`
Expected: FAIL, modul `./bazar` neexistuje.

- [ ] **Step 6: Implementace**

`apps/api/src/incidents/bazar.ts`:

```ts
/**
 * Kradené zboží v bazaru (spec Část 8). Čisté funkce bez DB.
 *
 * Invariant: cena nikdy pod výkupem zastavárny při stavu 100 % (`getBazarPriceBand().min`).
 * Jinak by se kradené zboží dalo koupit, hned zastavit a vyrobit tím peníze.
 */

import { getBazarPriceBand } from "../equipment/equipment-generator";
import type { Rng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { BAZAR_DNI_MAX, BAZAR_DNI_MIN, PRODEJNE_KRADEZE, SANCE_BAZARU, SLEVA_KRADENEHO } from "./nastaveni";
import type { Ztrata } from "./typy";

/** Od jaké úrovně okradený klub své věci v bazaru pozná: čísla na dresech, logo, nápisy. Ostatní nepozná nikdo. */
const POZNATELNE_OD: Record<string, number> = { jerseys: 2, team_van: 3, trophy_case: 1, fan_drums: 2 };

export function jePoznatelne(kategorie: string, uroven: number): boolean {
  const od = POZNATELNE_OD[kategorie];
  return od !== undefined && uroven >= od;
}

export function jeProdejnaKradez(kind: string): boolean {
  return (PRODEJNE_KRADEZE as readonly string[]).includes(kind);
}

export type KradeneZbozi = Extract<Ztrata, { typ: "vybaveni" }>;

/** Vybavení, které zloděj opravdu odnesl a dá se prodat (inzerát má úroveň 1 až 3). */
export function kradeneZbozi(ztraty: readonly Ztrata[]): KradeneZbozi[] {
  return ztraty.filter((z): z is KradeneZbozi => z.typ === "vybaveni" && z.uroven >= 1 && z.uroven <= 3);
}

/**
 * Herní den, kdy se zboží objeví v bazaru, nebo `null` (zloděj prodal jinde).
 * `rng` je `createRng(seedFromString("bazar|" + incidentId))`, první číslo je los.
 */
export function denBazaru(kind: string, ztraty: readonly Ztrata[], gameDate: string, rng: Rng): string | null {
  if (!jeProdejnaKradez(kind) || kradeneZbozi(ztraty).length === 0) return null;
  if (rng.random() >= SANCE_BAZARU) return null;
  return gameExpiry(gameDate, rng.int(BAZAR_DNI_MIN, BAZAR_DNI_MAX));
}

export function cenaKradenehoZbozi(kategorie: string, uroven: number, stav: number): number {
  const pasmo = getBazarPriceBand(kategorie, uroven, stav);
  return Math.max(pasmo.min, Math.round(pasmo.suggested * SLEVA_KRADENEHO));
}

const PREZDIVKY = ["Láďa", "Pepík", "Franta", "Jirka", "Mirek", "Standa", "Honza", "Zdeněk"] as const;
const ZALOZNI_OBCE = ["Lhota", "Újezd", "Dvory", "Zálesí"] as const;

/** „Láďa, Volary" nebo „Soukromý inzerát, Volary". Obec v 1. pádě, skloňovat názvy obcí neumíme. */
export function jmenoProdejce(obce: readonly string[], rng: Rng): string {
  const obec = obce.length > 0 ? rng.pick(obce) : rng.pick(ZALOZNI_OBCE);
  return rng.random() < 0.3 ? `Soukromý inzerát, ${obec}` : `${rng.pick(PREZDIVKY)}, ${obec}`;
}

/**
 * Co o inzerátu smí vidět klub, který se dívá do bazaru (spec 8, GET).
 * Že jde o jeho věci, pozná jen okradený klub a jen u poznatelného zboží.
 */
export function oznaceniInzeratu(
  inzerat: {
    teamId: string | null; isAiListing: boolean; incidentId: string | null; incidentTeamId: string | null;
    category: string; level: number;
  },
  divakTeamId: string,
): { isPrivateListing: boolean; vypadaJakoVase: boolean; incidentId: string | null } {
  const vypadaJakoVase = inzerat.incidentId !== null && inzerat.incidentTeamId === divakTeamId
    && jePoznatelne(inzerat.category, inzerat.level);
  return {
    isPrivateListing: inzerat.teamId === null && !inzerat.isAiListing,
    vypadaJakoVase,
    incidentId: vypadaJakoVase ? inzerat.incidentId : null,
  };
}
```

- [ ] **Step 7: Spusť testy**

Run: `cd apps/api && npx vitest run src/incidents/bazar.test.ts src/incidents/texty.test.ts src/equipment && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/migrations/0207_incidenty_bazar.sql apps/api/src/incidents/nastaveni.ts apps/api/src/incidents/texty.ts apps/api/src/incidents/bazar.ts apps/api/src/incidents/bazar.test.ts
git commit -F - <<'EOF'
feat(incidenty): jadro bazaru kradeneho zbozi

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Den bazaru při vzniku incidentu

**Files:**
- Modify: `apps/api/src/incidents/dopady.ts` (`zapisIncident`)
- Test: `apps/api/src/incidents/dopady.test.ts`

**Interfaces:**
- Consumes (Task 1): `denBazaru(kind, ztraty, gameDate, rng)`.
- Produces: `club_incidents.bazar_on` vyplněný u prodejných krádeží podle losu `bazar|{incidentId}`; stejné SQL a parametry v dávce i v záložním zápisu škody.

- [ ] **Step 1: Uprav a doplň testy**

V `apps/api/src/incidents/dopady.test.ts`:
1. importy doplň o:
```ts
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { denBazaru } from "./bazar";
```
2. V testu „selhání zápisu škody a stop (db.batch spadne)…" nahraď kontrolu záložního zápisu škody za:
```ts
    const zapisSkody = db.dotazy.find((d) => /UPDATE club_incidents SET loss = \?, bazar_on = \? WHERE id = \?/.test(d.sql));
    const bazarOn = denBazaru(NAVRH.kind, NAVRH.ztraty, stavKlubu().gameDate, createRng(seedFromString("bazar|inc-test")));
    expect(zapisSkody?.params).toEqual([JSON.stringify(NAVRH.ztraty), bazarOn, "inc-test"]);
```
3. Na konec `describe` přidej:
```ts
  it("den bazaru: prodejná krádež podle losu incidentu, poškození nikdy", async () => {
    const stav = stavKlubu({ kadr: [PROBLEMOVY], vybaveni: { jerseys: 2, jerseys_condition: 70 } });
    const ocekavany = denBazaru(NAVRH.kind, NAVRH.ztraty, stav.gameDate, createRng(seedFromString("bazar|inc-kradez")));
    const kradez = new FalesnaD1([{ sql: /FROM staff_members/, first: { usudek: null } }]);
    await zapisIncident(jakoD1(kradez), stav, NAVRH, "inc-kradez");
    const skoda = kradez.davky.flat().find((d) => /UPDATE club_incidents SET loss = \?, culprit_revealed = \?, bazar_on = \?/.test(d.sql));
    expect(skoda?.params[2]).toBe(ocekavany);

    const vandal: NavrhIncidentu = {
      kind: "vandal", category: "poskozeni", status: "otevreny", severity: 1,
      culpritType: "cizi", culpritPlayerId: null, culpritRevealed: false,
      ztraty: [{ typ: "travnik", pred: 70, po: 40 }], text: "Vandalové rozryli trávník.",
    };
    const poskozeni = new FalesnaD1([{ sql: /FROM staff_members/, first: { usudek: null } }]);
    await zapisIncident(jakoD1(poskozeni), stav, vandal, "inc-vandal");
    const skodaVandal = poskozeni.davky.flat().find((d) => /UPDATE club_incidents SET loss = \?, culprit_revealed = \?, bazar_on = \?/.test(d.sql));
    expect(skodaVandal?.params[2]).toBeNull();
  });
```

- [ ] **Step 2: Spusť testy, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/dopady.test.ts`
Expected: FAIL (SQL bez `bazar_on`).

- [ ] **Step 3: Implementace**

V `apps/api/src/incidents/dopady.ts`:
1. import `import { denBazaru } from "./bazar";`
2. hned za `const odhalen = navrh.culpritRevealed || odhalujePachatele(stopy);` přidej:
```ts
  // Kradené prodejné zboží se po pár dnech může objevit v bazaru (spec 8). Vlastní seed: stejný incident, stejný den.
  const bazarOn = denBazaru(navrh.kind, provedene, stav.gameDate, createRng(seedFromString(`bazar|${id}`)));
```
3. v dávce nahraď první příkaz za:
```ts
    db.prepare("UPDATE club_incidents SET loss = ?, culprit_revealed = ?, bazar_on = ? WHERE id = ?")
      .bind(JSON.stringify(provedene), odhalen ? 1 : 0, bazarOn, id),
```
4. v záložním zápisu po selhání dávky nahraď příkaz za:
```ts
    await db.prepare("UPDATE club_incidents SET loss = ?, bazar_on = ? WHERE id = ?")
      .bind(JSON.stringify(provedene), bazarOn, id).run()
      .catch((e) => logger.error({ module: M }, `zápis škody po selhání dávky ${id}`, e));
```

- [ ] **Step 4: Spusť testy**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/incidents/dopady.ts apps/api/src/incidents/dopady.test.ts
git commit -F - <<'EOF'
feat(incidenty): den bazaru pri vzniku kradeze

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Vystavení kradeného zboží a poznání

**Files:**
- Modify: `apps/api/src/incidents/stopy-db.ts` (`prikazyStop` s parametrem `prvniPoradi`)
- Create: `apps/api/src/incidents/bazar-db.ts`
- Modify: `apps/api/src/incidents/denni-krok.ts`
- Test: `apps/api/src/incidents/stopy-db.test.ts`, `apps/api/src/incidents/bazar-db.test.ts`

**Interfaces:**
- Consumes (Task 1): `kradeneZbozi`, `cenaKradenehoZbozi`, `jmenoProdejce`, `jePoznatelne`, `BONUS_POLICIE.bazar`, `KRADENE_INZERAT_DNI`, texty `stopa_bazar`, `bazar_poznano`; `smsIncidentu` (`incident-db.ts`); `sendSystemSMS(db, teamId, role, body, metadata?)`; `SMS_ROLE_KUSTOD`; `nactiZtraty`.
- Produces:
  - `prikazyStop(db, teamId, incidentId, stopy, gameDate, prvniPoradi = 1)` — id `{incidentId}-{zdroj}-{n}`, `n` začíná na `prvniPoradi`
  - `vystavKradeneZbozi(env: Bindings, t: { teamId: string; gameDate: string; seasonNumber: number }, ted?: Date): Promise<number>` — počet nových inzerátů

- [ ] **Step 1: Napiš selhávající testy**

Do `apps/api/src/incidents/stopy-db.test.ts` přidej test (použij existující importy a styl souboru; `prikazyStop` a `FalesnaD1` v něm už jsou nebo je doplň):

```ts
  it("pozdější stopa téhož zdroje dostane další pořadí", () => {
    const [p] = prikazyStop(jakoD1(new FalesnaD1()), "tym-a", "inc-1", [{
      zdroj: "bazar", ukazujeNa: null, podezreli: null, drzitel: null, sila: 1, bonusPolicie: 0, text: "Koupil klub.", nalezena: true,
    }], "2026-09-16T16:00:00.000Z", 2);
    expect((p as unknown as { params: unknown[] }).params[0]).toBe("inc-1-bazar-2");
  });
```

`apps/api/src/incidents/bazar-db.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({ sendSystemSMS: vi.fn(async () => undefined), sendPlayerSMS: vi.fn() }));

import type { Bindings } from "../index";
import { sendSystemSMS } from "../messaging/system-sms";
import { cenaKradenehoZbozi } from "./bazar";
import { vystavKradeneZbozi } from "./bazar-db";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";

const DNES = "2026-09-16T16:00:00.000Z";
const TED = new Date("2026-09-16T10:00:00.000Z");
const T = { teamId: "tym-a", gameDate: DNES, seasonNumber: 4 };
const DRESY = JSON.stringify([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }]);

const radek = (over: Record<string, unknown> = {}) => ({
  id: "inc-1", league_id: "liga-1", status: "otevreny", loss: DRESY, district: "Prachatice", ...over,
});

function prostredi(radky: unknown[], dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /FROM club_incidents i/, all: radky },
    { sql: /FROM villages/, all: [{ name: "Volary" }] },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

beforeEach(() => vi.clearAllMocks());

describe("vystavení kradeného zboží", () => {
  it("poznatelné zboží: soukromý inzerát, stopa pro policii a SMS s odkazem", async () => {
    const { db, env } = prostredi([radek()]);
    expect(await vystavKradeneZbozi(env, T, TED)).toBe(1);
    const inzerat = db.dotazy.find((d) => /INSERT OR IGNORE INTO equipment_listings/.test(d.sql));
    expect(inzerat?.sql).toContain("VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 0, ?, ?)");
    expect(inzerat?.params).toEqual([
      "bazar-inc-1-jerseys", "liga-1", "jerseys", 2, 70, cenaKradenehoZbozi("jerseys", 2, 70),
      "2026-09-23T10:00:00.000Z", expect.stringMatching(/, Volary$/), "inc-1",
    ]);
    const stopa = db.davky.flat().find((d) => /club_incident_clues/.test(d.sql));
    expect(stopa?.params[0]).toBe("inc-1-bazar-1");
    expect(stopa?.params[3]).toBe("bazar");
    expect(stopa?.params[8]).toBe(0.3);
    expect(sendSystemSMS).toHaveBeenCalledWith(
      expect.anything(), "tym-a", "Kustod", expect.stringContaining("Dresy"), { type: "incident", incidentId: "inc-1" },
    );
  });

  it("nepoznatelné zboží: jen inzerát, okradený klub nic neví", async () => {
    const { db, env } = prostredi([radek({ loss: JSON.stringify([{ typ: "vybaveni", kategorie: "balls", uroven: 2, stav: 70, urovniDolu: 2 }]) })]);
    expect(await vystavKradeneZbozi(env, T, TED)).toBe(1);
    expect(db.pocet(/club_incident_clues/)).toBe(0);
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });

  it("uzavřený incident: SMS ano, stopa ne", async () => {
    const { db, env } = prostredi([radek({ status: "uzavreny" })]);
    await vystavKradeneZbozi(env, T, TED);
    expect(db.pocet(/club_incident_clues/)).toBe(0);
    expect(sendSystemSMS).toHaveBeenCalledTimes(1);
  });

  it("inzerát už existuje: nic dalšího se nestane", async () => {
    const { db, env } = prostredi([radek()], [{ sql: /INSERT OR IGNORE INTO equipment_listings/, changes: 0 }]);
    expect(await vystavKradeneZbozi(env, T, TED)).toBe(0);
    expect(db.pocet(/club_incident_clues/)).toBe(0);
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });

  it("hledá dnešní a starší den bazaru, nevrácené věci, aktuální sezónu, bez inzerátu", async () => {
    const { db, env } = prostredi([]);
    await vystavKradeneZbozi(env, T, TED);
    const dotaz = db.dotazy.find((d) => /FROM club_incidents i/.test(d.sql));
    expect(dotaz?.params).toEqual(["tym-a", 4, DNES]);
    expect(dotaz?.sql).toContain("i.recovered = 0");
    expect(dotaz?.sql).toContain("NOT EXISTS (SELECT 1 FROM equipment_listings el WHERE el.incident_id = i.id)");
  });

  it("okres rezervy hledá obce bez přípony U21", async () => {
    const { db, env } = prostredi([radek({ district: "Prachatice U21" })]);
    await vystavKradeneZbozi(env, T, TED);
    expect(db.dotazy.find((d) => /FROM villages/.test(d.sql))?.params).toEqual(["Prachatice"]);
  });
});
```

- [ ] **Step 2: Spusť testy, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/bazar-db.test.ts src/incidents/stopy-db.test.ts`
Expected: FAIL.

- [ ] **Step 3: `prikazyStop` s počátečním pořadím**

V `apps/api/src/incidents/stopy-db.ts` uprav `prikazyStop`:

```ts
/**
 * Příkazy pro `db.batch`. Id `{incidentId}-{zdroj}-{n}`, `n` od `prvniPoradi` v rámci zdroje.
 * `INSERT OR IGNORE`: opakované zpracování dne stopy nezdvojí. Stopa téhož zdroje zapisovaná
 * později (druhá stopa z bazaru) potřebuje `prvniPoradi` 2, jinak by ji zápis tiše zahodil.
 */
export function prikazyStop(
  db: D1Database, teamId: string, incidentId: string, stopy: readonly NavrhStopy[], gameDate: string, prvniPoradi = 1,
): D1PreparedStatement[] {
  const poradi: Record<string, number> = {};
  return stopy.map((s) => {
    poradi[s.zdroj] = (poradi[s.zdroj] ?? prvniPoradi - 1) + 1;
```
(zbytek funkce beze změny)

- [ ] **Step 4: `bazar-db.ts`**

```ts
/**
 * Kradené zboží v bazaru: vystavení, nákup a nahlášení policii (spec Část 8).
 */

import { CATEGORIES, CATEGORY_LABELS } from "../equipment/equipment-generator";
import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { sendSystemSMS } from "../messaging/system-sms";
import { cenaKradenehoZbozi, jePoznatelne, jmenoProdejce, kradeneZbozi } from "./bazar";
import { smsIncidentu } from "./incident-db";
import { BONUS_POLICIE, KRADENE_INZERAT_DNI, SMS_ROLE_KUSTOD } from "./nastaveni";
import { nactiZtraty } from "./popis";
import { prikazyStop } from "./stopy-db";
import { text } from "./texty";

const M = "incidents-bazar";

type RadekKVystaveni = { id: string; league_id: string; status: string; loss: string; district: string | null };

/** Obce okresu ligy pro jméno prodejce. Rezervy mají okres s příponou U21. */
async function obceOkresu(db: D1Database, district: string | null): Promise<string[]> {
  const okres = district?.replace(/\s+U21$/, "").trim();
  if (!okres) return [];
  const rows = await db.prepare("SELECT name FROM villages WHERE district = ? ORDER BY name LIMIT 60")
    .bind(okres).all<{ name: string }>()
    .catch((e) => { logger.warn({ module: M }, `obce okresu ${okres}`, e); return null; });
  return (rows?.results ?? []).map((r) => r.name);
}

/**
 * Vystaví kradené zboží, kterému nastal den bazaru (spec 6b krok 6). Okradený klub pozná jen
 * poznatelné věci: SMS od Kustoda a u neuzavřeného incidentu stopa `bazar` s bonusem pro policii.
 * Vrací počet nových inzerátů. `ted` je reálný čas pro expiraci, shodně s ostatními inzeráty.
 */
export async function vystavKradeneZbozi(
  env: Bindings, t: { teamId: string; gameDate: string; seasonNumber: number }, ted: Date = new Date(),
): Promise<number> {
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT i.id, i.league_id, i.status, i.loss, l.district
       FROM club_incidents i
       LEFT JOIN leagues l ON l.id = i.league_id
      WHERE i.team_id = ? AND i.season_number = ? AND i.bazar_on IS NOT NULL AND i.bazar_on <= ?
        AND i.recovered = 0 AND i.league_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM equipment_listings el WHERE el.incident_id = i.id)`,
  ).bind(t.teamId, t.seasonNumber, t.gameDate).all<RadekKVystaveni>()
    .catch((e) => { logger.warn({ module: M }, `kradené zboží k vystavení ${t.teamId}`, e); return null; });

  const expirace = new Date(ted);
  expirace.setDate(expirace.getDate() + KRADENE_INZERAT_DNI);

  let vystaveno = 0;
  for (const inc of rows?.results ?? []) {
    const rng = createRng(seedFromString(`bazar-inzerat|${inc.id}`));
    const obce = await obceOkresu(db, inc.district);
    for (const z of kradeneZbozi(nactiZtraty(inc.loss))) {
      // Kategorie jde do bazaru a později do názvu sloupce při nákupu: whitelist je povinný.
      if (!(CATEGORIES as readonly string[]).includes(z.kategorie)) {
        logger.error({ module: M }, `neznámá kategorie vybavení ${z.kategorie} v ${inc.id}`);
        continue;
      }
      const vlozeno = await db.prepare(
        `INSERT OR IGNORE INTO equipment_listings
           (id, team_id, league_id, category, level, condition_at_listing, price, expires_at, is_ai_listing, seller_name, incident_id)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      ).bind(
        `bazar-${inc.id}-${z.kategorie}`, inc.league_id, z.kategorie, z.uroven, z.stav,
        cenaKradenehoZbozi(z.kategorie, z.uroven, z.stav), expirace.toISOString(), jmenoProdejce(obce, rng), inc.id,
      ).run()
        .catch((e) => { logger.error({ module: M }, `inzerát kradeného zboží ${inc.id}`, e); return null; });
      if ((vlozeno?.meta?.changes ?? 0) === 0) continue;
      vystaveno++;
      if (!jePoznatelne(z.kategorie, z.uroven)) continue;

      const vec = CATEGORY_LABELS[z.kategorie] ?? z.kategorie;
      if (inc.status !== "uzavreny") {
        await db.batch(prikazyStop(db, t.teamId, inc.id, [{
          zdroj: "bazar", ukazujeNa: null, podezreli: null, drzitel: null, sila: 1,
          bonusPolicie: BONUS_POLICIE.bazar, nalezena: true, text: text(rng, "stopa_bazar", { vec }),
        }], t.gameDate)).catch((e) => logger.warn({ module: M }, `stopa bazaru ${inc.id}`, e));
      }
      await sendSystemSMS(db, t.teamId, SMS_ROLE_KUSTOD, `🛒 ${text(rng, "bazar_poznano", { vec })}`, smsIncidentu(inc.id))
        .catch((e) => logger.warn({ module: M }, `SMS bazaru ${inc.id}`, e));
    }
  }
  return vystaveno;
}
```

Poznámka: seed `bazar-inzerat|…` je záměrně jiný než los dne `bazar|…` (ten se spotřeboval při vzniku incidentu).

- [ ] **Step 5: Denní krok**

V `apps/api/src/incidents/denni-krok.ts` přidej import `import { vystavKradeneZbozi } from "./bazar-db";` a hned za blok s `ozviSeObvineni(...)`:

```ts
  // Kradené zboží, kterému nastal den bazaru (spec 6b krok 6). Až po policii: dopadený zloděj věci vrátil.
  await vystavKradeneZbozi(env, { teamId, gameDate, seasonNumber: sezona.number })
    .catch((e) => logger.warn({ module: M, teamId }, "kradené zboží do bazaru", e));
```

- [ ] **Step 6: Spusť testy**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/incidents/stopy-db.ts apps/api/src/incidents/stopy-db.test.ts apps/api/src/incidents/bazar-db.ts apps/api/src/incidents/bazar-db.test.ts apps/api/src/incidents/denni-krok.ts
git commit -F - <<'EOF'
feat(incidenty): kradene zbozi se objevi v bazaru a klub ho pozna

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: Bazar ukáže kradené zboží a zpracuje jeho nákup

**Files:**
- Modify: `apps/api/src/incidents/bazar-db.ts` (`poNakupuKradeneho`)
- Modify: `apps/api/src/routes/equipment-market.ts` (GET nabídek, POST `buy`)
- Test: `apps/api/src/incidents/bazar-db.test.ts`

**Interfaces:**
- Consumes (Task 1, 3): `oznaceniInzeratu`, `jePoznatelne`, `prikazyStop(..., prvniPoradi)`, texty `bazar_vraceno`, `bazar_koupil_jiny`.
- Produces:
  - `poNakupuKradeneho(env, n: { incidentId: string; kategorie: string; uroven: number; kupecTeamId: string; kupecNazev: string; gameDate: string }): Promise<"vraceno" | "koupil_jiny" | null>`
  - GET `/api/teams/:teamId/equipment-market`: každá nabídka navíc `isPrivateListing: boolean`, `vypadaJakoVase: boolean`, `incidentId: string | null`

- [ ] **Step 1: Napiš selhávající testy**

Do `apps/api/src/incidents/bazar-db.test.ts` přidej import `poNakupuKradeneho` do importu z `./bazar-db` a na konec souboru:

```ts
describe("nákup kradeného zboží", () => {
  const nakup = (over: Partial<{ kupecTeamId: string; kategorie: string; uroven: number }> = {}) => ({
    incidentId: "inc-1", kategorie: "jerseys", uroven: 2, kupecTeamId: "tym-a", kupecNazev: "TJ Sokol Lhota", gameDate: DNES, ...over,
  });
  const sIncidentem = (incident: unknown, dalsi: Pravidlo[] = []) => {
    const db = new FalesnaD1([...dalsi, { sql: /SELECT id, team_id, status FROM club_incidents/, first: incident }]);
    return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
  };

  it("okradený klub koupil věci zpátky: vráceno a SMS", async () => {
    const { db, env } = sIncidentem({ id: "inc-1", team_id: "tym-a", status: "otevreny" });
    expect(await poNakupuKradeneho(env, nakup())).toBe("vraceno");
    expect(db.dotazy.find((d) => /UPDATE club_incidents SET recovered = 1/.test(d.sql))?.params).toEqual(["inc-1"]);
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Kustod", expect.stringContaining("Dresy"), { type: "incident", incidentId: "inc-1" });
  });

  it("věci už byly vrácené: nic dalšího", async () => {
    const { env } = sIncidentem({ id: "inc-1", team_id: "tym-a", status: "otevreny" }, [{ sql: /UPDATE club_incidents SET recovered = 1/, changes: 0 }]);
    expect(await poNakupuKradeneho(env, nakup())).toBeNull();
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });

  it("poznatelné zboží koupil jiný klub: stopa s dalším pořadím a SMS okradenému", async () => {
    const { db, env } = sIncidentem({ id: "inc-1", team_id: "tym-a", status: "otevreny" });
    expect(await poNakupuKradeneho(env, nakup({ kupecTeamId: "tym-b" }))).toBe("koupil_jiny");
    const stopa = db.davky.flat().find((d) => /club_incident_clues/.test(d.sql));
    expect(stopa?.params[0]).toBe("inc-1-bazar-2");
    expect(stopa?.params[2]).toBe("tym-a");
    expect(String(stopa?.params[9])).toContain("TJ Sokol Lhota");
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Kustod", expect.stringContaining("TJ Sokol Lhota"), { type: "incident", incidentId: "inc-1" });
  });

  it("nepoznatelné zboží koupil jiný klub: okradený klub se nic nedozví", async () => {
    const { db, env } = sIncidentem({ id: "inc-1", team_id: "tym-a", status: "otevreny" });
    expect(await poNakupuKradeneho(env, nakup({ kupecTeamId: "tym-b", kategorie: "balls" }))).toBeNull();
    expect(db.davky).toHaveLength(0);
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });

  it("uzavřený incident: SMS ano, stopa ne", async () => {
    const { db, env } = sIncidentem({ id: "inc-1", team_id: "tym-a", status: "uzavreny" });
    expect(await poNakupuKradeneho(env, nakup({ kupecTeamId: "tym-b" }))).toBe("koupil_jiny");
    expect(db.davky).toHaveLength(0);
    expect(sendSystemSMS).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Spusť testy, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/bazar-db.test.ts`
Expected: FAIL (`poNakupuKradeneho` neexistuje).

- [ ] **Step 3: `poNakupuKradeneho`**

Na konec `apps/api/src/incidents/bazar-db.ts`:

```ts
/**
 * Po nákupu kradeného zboží (spec 8). Okradený klub si věci koupil zpátky, nebo je koupil
 * jiný klub (v dobré víře, bez postihu) a okradený se to dozví, jen když své věci pozná.
 */
export async function poNakupuKradeneho(
  env: Bindings,
  n: { incidentId: string; kategorie: string; uroven: number; kupecTeamId: string; kupecNazev: string; gameDate: string },
): Promise<"vraceno" | "koupil_jiny" | null> {
  const db = env.DB;
  const inc = await db.prepare("SELECT id, team_id, status FROM club_incidents WHERE id = ?")
    .bind(n.incidentId).first<{ id: string; team_id: string; status: string }>()
    .catch((e) => { logger.warn({ module: M }, `incident kradeného zboží ${n.incidentId}`, e); return null; });
  if (!inc) return null;
  const rng = createRng(seedFromString(`bazar-nakup|${inc.id}`));
  const vec = CATEGORY_LABELS[n.kategorie] ?? n.kategorie;

  if (inc.team_id === n.kupecTeamId) {
    const vraceno = await db.prepare("UPDATE club_incidents SET recovered = 1 WHERE id = ? AND recovered = 0")
      .bind(inc.id).run()
      .catch((e) => { logger.error({ module: M }, `vrácení kradeného zboží ${inc.id}`, e); return null; });
    if ((vraceno?.meta?.changes ?? 0) === 0) return null;
    await sendSystemSMS(db, inc.team_id, SMS_ROLE_KUSTOD, `🛒 ${text(rng, "bazar_vraceno", { vec })}`, smsIncidentu(inc.id))
      .catch((e) => logger.warn({ module: M }, `SMS vrácení ${inc.id}`, e));
    return "vraceno";
  }

  if (!jePoznatelne(n.kategorie, n.uroven)) return null;
  const zprava = text(rng, "bazar_koupil_jiny", { klub: n.kupecNazev });
  if (inc.status !== "uzavreny") {
    // Pořadí 2: stopa z poznání inzerátu už má id {incidentId}-bazar-1.
    await db.batch(prikazyStop(db, inc.team_id, inc.id, [{
      zdroj: "bazar", ukazujeNa: null, podezreli: null, drzitel: null, sila: 1, bonusPolicie: 0, nalezena: true, text: zprava,
    }], n.gameDate, 2)).catch((e) => logger.warn({ module: M }, `stopa nákupu kradeného zboží ${inc.id}`, e));
  }
  await sendSystemSMS(db, inc.team_id, SMS_ROLE_KUSTOD, `🛒 ${zprava}`, smsIncidentu(inc.id))
    .catch((e) => logger.warn({ module: M }, `SMS nákupu kradeného zboží ${inc.id}`, e));
  return "koupil_jiny";
}
```

- [ ] **Step 4: GET nabídek**

V `apps/api/src/routes/equipment-market.ts`:
1. import `import { oznaceniInzeratu } from "../incidents/bazar";`
2. v GET v dotazu nabídek (první příkaz v `c.env.DB.batch`) rozšiř SELECT a JOIN:
```ts
      `SELECT el.id, el.team_id, el.category, el.level, el.price, el.expires_at, el.created_at,
              el.condition_at_listing, el.is_ai_listing, el.seller_name, el.incident_id, t.name AS team_name,
              ci.team_id AS incident_team_id
         FROM equipment_listings el
         LEFT JOIN teams t ON el.team_id = t.id
         LEFT JOIN club_incidents ci ON ci.id = el.incident_id
        WHERE el.league_id = ? AND el.status = 'active'
          AND (el.team_id IS NULL OR el.team_id != ?)
        ORDER BY el.created_at DESC`
```
(komentář nad dotazem ponech a doplň větu „Kradené zboží (incidenty) má `incident_id`; čí je, pozná jen okradený klub.")
3. v mapování nabídek do vraceného objektu za `lockDetail: unlock.locked ? unlock.detail : null,` přidej:
```ts
        ...oznaceniInzeratu({
          teamId: (row.team_id as string | null) ?? null, isAiListing: isAi,
          incidentId: (row.incident_id as string | null) ?? null, incidentTeamId: (row.incident_team_id as string | null) ?? null,
          category, level,
        }, teamId),
```

- [ ] **Step 5: Nákup**

V `apps/api/src/routes/equipment-market.ts`:
1. do `interface ListingRow` přidej `incident_id: string | null;`
2. v POST `buy` doplň do SELECT inzerátu sloupec `incident_id` (za `seller_name`).
3. za blok P6 (`await Promise.all([...]);`) a před `return c.json({ ok: true, ...` vlož:
```ts
  // ── P7: kradené zboží (incidenty, spec 8). Okradený klub si ho koupil zpátky, nebo se o nákupu dozví.
  if (listing.incident_id) {
    const { poNakupuKradeneho } = await import("../incidents/bazar-db");
    await poNakupuKradeneho(c.env, {
      incidentId: listing.incident_id, kategorie: category, uroven: listing.level,
      kupecTeamId: teamId, kupecNazev: buyerRow?.name ?? "jiný klub", gameDate: buyer.game_date ?? now,
    }).catch((e) => logger.warn({ module: MODULE }, `po nákupu kradeného zboží listing=${listingId}`, e));
  }
```

- [ ] **Step 6: Spusť testy**

Run: `cd apps/api && npx vitest run src/incidents src/equipment && npx tsc --noEmit`
Expected: PASS. Route se ověřuje na testingu (Task 8).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/incidents/bazar-db.ts apps/api/src/incidents/bazar-db.test.ts apps/api/src/routes/equipment-market.ts
git commit -F - <<'EOF'
feat(incidenty): bazar oznaci kradene zbozi a zpracuje jeho nakup

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: Nahlásit inzerát policii

**Files:**
- Modify: `apps/api/src/incidents/bazar-db.ts` (`nahlasKradeneZbozi`, `vystavHned`)
- Modify: `apps/api/src/routes/equipment-market.ts` (POST `nahlasit`)
- Modify: `apps/api/src/routes/incidents.ts` (admin `bazarTed`)
- Test: `apps/api/src/incidents/bazar-db.test.ts`

**Interfaces:**
- Consumes: `nactiIncident`, `proAkce`, `smsIncidentu` (`incident-db.ts`); `dostupneAkce` (`vysetrovani.ts`); `zavolejPolicii`, `VysledekAkce` (`akce.ts`); `SMS_ROLE_POLICIE`, `PRODEJNE_KRADEZE`; text `policie_bazar`; `vystavKradeneZbozi` (Task 3).
- Produces:
  - `nahlasKradeneZbozi(env, teamId: string, listingId: string): Promise<VysledekAkce<{ vysledekOn: string | null }>>`
  - `vystavHned(env, t: { teamId; gameDate; seasonNumber }): Promise<number>` (jen admin na testingu)
  - API `POST /api/teams/:teamId/equipment-market/:listingId/nahlasit` → `{ ok: true, vysledekOn }` nebo `{ error }` 404/409/500
  - admin `POST /api/admin/incidents/vysetrovani` přijme `bazarTed: boolean`, odpověď navíc `bazar: number`

- [ ] **Step 1: Napiš selhávající testy**

Do `apps/api/src/incidents/bazar-db.test.ts`: import `nahlasKradeneZbozi, vystavHned` z `./bazar-db`, `import { incidentRadek } from "./testovaci-stav";` a na konec souboru:

```ts
describe("nahlášení inzerátu policii", () => {
  const INZERAT = { id: "bazar-inc-1-jerseys", category: "jerseys", level: 2, status: "active", incident_id: "inc-1" };
  function sInzeratem(inzerat: unknown, incident: unknown, dalsi: Pravidlo[] = []) {
    const db = new FalesnaD1([
      ...dalsi,
      { sql: /FROM equipment_listings WHERE id = \?/, first: inzerat },
      { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: incident },
      { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
    ]);
    return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
  }
  const nahlas = (env: Bindings) => nahlasKradeneZbozi(env, "tym-a", "bazar-inc-1-jerseys");

  it("policie ještě nešetřila: inzerát zmizí a policie případ převezme", async () => {
    const { db, env } = sInzeratem(INZERAT, incidentRadek());
    const v = await nahlas(env);
    expect(v.ok).toBe(true);
    expect(v.ok && v.vysledekOn).toMatch(/^2026-09-/);
    expect(db.dotazy.find((d) => /UPDATE equipment_listings SET status = 'withdrawn'/.test(d.sql))?.params.slice(1)).toEqual(["bazar-inc-1-jerseys"]);
    expect(db.pocet(/UPDATE club_incidents SET status = 'policie'/)).toBe(1);
  });

  it("policie právě šetří: inzerát se zajistí bez nového šetření", async () => {
    const { db, env } = sInzeratem(INZERAT, incidentRadek({ status: "policie", police_result_on: "2026-09-19T16:00:00.000Z" }));
    expect(await nahlas(env)).toEqual({ ok: true, vysledekOn: "2026-09-19T16:00:00.000Z" });
    expect(db.pocet(/UPDATE equipment_listings SET status = 'withdrawn'/)).toBe(1);
    expect(db.pocet(/UPDATE club_incidents SET status = 'policie'/)).toBe(0);
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Policie ČR, obvodní oddělení", expect.stringContaining("Dresy"), { type: "incident", incidentId: "inc-1" });
  });

  it("cizí incident, obyčejný inzerát nebo nepoznatelné zboží: 404 a nic se nestáhne", async () => {
    for (const [inzerat, incident] of [
      [INZERAT, null],
      [{ ...INZERAT, incident_id: null }, incidentRadek()],
      [{ ...INZERAT, category: "balls" }, incidentRadek()],
    ] as const) {
      const { db, env } = sInzeratem(inzerat, incident);
      expect(await nahlas(env)).toMatchObject({ ok: false, kod: 404 });
      expect(db.pocet(/UPDATE equipment_listings/)).toBe(0);
    }
  });

  it("policie už šetřila nebo je incident uzavřený: 409 a inzerát zůstane", async () => {
    for (const incident of [incidentRadek({ police_success: 0 }), incidentRadek({ status: "uzavreny" }), incidentRadek({ culprit_revealed: 1 })]) {
      const { db, env } = sInzeratem(INZERAT, incident);
      expect(await nahlas(env)).toMatchObject({ ok: false, kod: 409 });
      expect(db.pocet(/UPDATE equipment_listings/)).toBe(0);
    }
  });

  it("inzerát už není aktivní: 409", async () => {
    const { env } = sInzeratem({ ...INZERAT, status: "sold" }, incidentRadek());
    expect(await nahlas(env)).toMatchObject({ ok: false, kod: 409 });
  });
});

describe("admin: vystavit hned", () => {
  it("přepíše den bazaru u otevřených prodejných krádeží bez inzerátu a vystaví", async () => {
    const { db, env } = prostredi([radek()]);
    expect(await vystavHned(env, T)).toBe(1);
    const prepis = db.dotazy.find((d) => /UPDATE club_incidents SET bazar_on = \?/.test(d.sql));
    expect(prepis?.params).toEqual([DNES, "tym-a", 4, "vloupani_sklad", "vitrina", "dodavka_ukradena", "kradez_kamery"]);
    expect(prepis?.sql).toContain("status != 'uzavreny'");
  });
});
```

- [ ] **Step 2: Spusť testy, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/bazar-db.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementace v `bazar-db.ts`**

Doplň importy:
```ts
import { zavolejPolicii, type VysledekAkce } from "./akce";
import { nactiIncident, proAkce, smsIncidentu } from "./incident-db";
import { BONUS_POLICIE, KRADENE_INZERAT_DNI, PRODEJNE_KRADEZE, SMS_ROLE_KUSTOD, SMS_ROLE_POLICIE } from "./nastaveni";
import { dostupneAkce } from "./vysetrovani";
```
(nahraď jimi dosavadní import z `./incident-db` a `./nastaveni`)

a na konec souboru:

```ts
/**
 * Okradený klub nahlásí inzerát s poznatelným kradeným zbožím policii (spec 8). Inzerát hned
 * zmizí. Když policie ještě nešetřila, převezme případ (7c); když právě šetří, zboží se jen
 * přidá k šetření. Bonus pro policii nese stopa `bazar` z poznání inzerátu.
 */
export async function nahlasKradeneZbozi(
  env: Bindings, teamId: string, listingId: string,
): Promise<VysledekAkce<{ vysledekOn: string | null }>> {
  const db = env.DB;
  const inzerat = await db.prepare("SELECT id, category, level, status, incident_id FROM equipment_listings WHERE id = ?")
    .bind(listingId).first<{ id: string; category: string; level: number; status: string; incident_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `inzerát k nahlášení ${listingId}`, e); return null; });
  const inc = inzerat?.incident_id ? await nactiIncident(db, teamId, inzerat.incident_id) : null;
  // Cizí, obyčejný i nepoznatelný inzerát dostane stejnou odpověď: z odpovědi se nesmí dát poznat, čí zboží to je.
  if (!inzerat || !inc || !jePoznatelne(inzerat.category, inzerat.level)) {
    return { ok: false, kod: 404, chyba: "Tenhle inzerát nahlásit nejde" };
  }
  if (inzerat.status !== "active") return { ok: false, kod: 409, chyba: "Inzerát už v bazaru není" };

  const prevezme = dostupneAkce(proAkce(inc, false)).policie;
  if (!prevezme && inc.status !== "policie") return { ok: false, kod: 409, chyba: "Tohle už policie řešit nebude" };

  const stazeno = await db.prepare("UPDATE equipment_listings SET status = 'withdrawn', resolved_at = ? WHERE id = ? AND status = 'active'")
    .bind(new Date().toISOString(), listingId).run()
    .catch((e) => { logger.error({ module: M }, `stažení nahlášeného inzerátu ${listingId}`, e); return null; });
  if ((stazeno?.meta?.changes ?? 0) === 0) return { ok: false, kod: 409, chyba: "Inzerát už v bazaru není" };

  if (prevezme) {
    const policie = await zavolejPolicii(env, teamId, inc.id);
    if (policie.ok) return { ok: true, vysledekOn: policie.vysledekOn };
    // Inzerát je stažený, jen policie mezitím případ převzala jinudy (souběh). Nic se nevrací.
    logger.warn({ module: M }, `policie po nahlášení inzerátu ${listingId}: ${policie.chyba}`);
    return { ok: true, vysledekOn: null };
  }
  const rng = createRng(seedFromString(`bazar-policie|${inc.id}`));
  const vec = CATEGORY_LABELS[inzerat.category] ?? inzerat.category;
  await sendSystemSMS(db, teamId, SMS_ROLE_POLICIE, `🚓 ${text(rng, "policie_bazar", { vec })}`, smsIncidentu(inc.id))
    .catch((e) => logger.warn({ module: M }, `SMS policie k inzerátu ${inc.id}`, e));
  return { ok: true, vysledekOn: inc.police_result_on };
}

/** Jen pro ověření na testingu (admin): otevřené prodejné krádeže bez inzerátu vystaví hned, bez losu 60 %. */
export async function vystavHned(env: Bindings, t: { teamId: string; gameDate: string; seasonNumber: number }): Promise<number> {
  await env.DB.prepare(
    `UPDATE club_incidents SET bazar_on = ?
      WHERE team_id = ? AND season_number = ? AND status != 'uzavreny' AND recovered = 0
        AND kind IN (${PRODEJNE_KRADEZE.map(() => "?").join(", ")})
        AND NOT EXISTS (SELECT 1 FROM equipment_listings el WHERE el.incident_id = club_incidents.id)`,
  ).bind(t.gameDate, t.teamId, t.seasonNumber, ...PRODEJNE_KRADEZE).run()
    .catch((e) => logger.warn({ module: M }, `admin: den bazaru na dnešek ${t.teamId}`, e));
  return vystavKradeneZbozi(env, t);
}
```

- [ ] **Step 4: Route**

V `apps/api/src/routes/equipment-market.ts` před POST `buy`:

```ts
// ── POST /api/teams/:teamId/equipment-market/:listingId/nahlasit ─────────────
// Okradený klub nahlásí inzerát se svým kradeným zbožím policii (incidenty, spec 8).
equipmentMarketRouter.post("/teams/:teamId/equipment-market/:listingId/nahlasit", async (c) => {
  const { nahlasKradeneZbozi } = await import("../incidents/bazar-db");
  const v = await nahlasKradeneZbozi(c.env, c.req.param("teamId"), c.req.param("listingId"));
  return v.ok ? c.json(v) : c.json({ error: v.chyba }, v.kod);
});
```

V `apps/api/src/routes/incidents.ts` v admin route `POST /admin/incidents/vysetrovani`:
1. import `import { vystavHned } from "../incidents/bazar-db";`
2. typ těla rozšiř o `bazarTed?: boolean`
3. komentář nad route doplň větou „`bazarTed` vystaví kradené zboží otevřených prodejných krádeží hned, bez losu."
4. konec route:
```ts
  const krivdy = body.krivdy ? await ozviSeObvineni(c.env, t, { denObvineni: team.game_date.slice(0, 10) }) : 0;
  const bazar = body.bazarTed ? await vystavHned(c.env, t) : 0;
  return c.json({ ok: true, ...vysledek, krivdy, bazar });
```

- [ ] **Step 5: Spusť testy**

Run: `cd apps/api && npx vitest run src/incidents src/routes && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/incidents/bazar-db.ts apps/api/src/incidents/bazar-db.test.ts apps/api/src/routes/equipment-market.ts apps/api/src/routes/incidents.ts
git commit -F - <<'EOF'
feat(incidenty): nahlasit inzerat s kradenym zbozim policii

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: Frontend bazaru

**Files:**
- Modify: `apps/web/src/app/dashboard/equipment/types.ts`
- Modify: `apps/web/src/app/dashboard/equipment/BazarTab.tsx`
- Modify: `apps/web/src/app/dashboard/equipment/page.tsx`

**Interfaces:**
- Consumes (Task 4, 5): nabídka `isPrivateListing`, `vypadaJakoVase`, `incidentId`; `POST /api/teams/:teamId/equipment-market/:listingId/nahlasit`.

- [ ] **Step 1: Typ**

V `types.ts` do `BazarListing` za `canBuy: boolean; blockReason: string | null; lockDetail: LockDetailData | null;` přidej:

```ts
  /** Soukromý inzerát: kradené zboží, prodává ho soukromník (incidenty). */
  isPrivateListing: boolean;
  /** Jen okradenému klubu a jen u poznatelného zboží: vypadá to jako jeho ukradené vybavení. */
  vypadaJakoVase: boolean;
  incidentId: string | null;
```

- [ ] **Step 2: Karta nabídky**

V `BazarTab.tsx`:
1. do `Props` přidej `onReport: (listing: BazarListing) => void;` a do destrukturace parametrů komponenty `onReport`.
2. řádek `{l.isAiListing && <span className="text-xs"> · z okolí</span>}` nahraď za:
```tsx
                {l.isPrivateListing
                  ? <span className="text-sm"> · soukromý inzerát</span>
                  : l.isAiListing && <span className="text-xs"> · z okolí</span>}
```
3. hned za `<div className="text-sm text-muted mb-3"> … </div>` s prodejcem vlož:
```tsx
              {l.vypadaJakoVase && (
                <div className="mb-3 rounded-soft bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                  Vypadá to jako vaše ukradené vybavení: {l.categoryLabel}.
                  {l.incidentId && (
                    <>
                      {" "}
                      <Link href={`/dashboard/incidenty?id=${encodeURIComponent(l.incidentId)}`} className="font-heading font-bold underline">
                        Otevřít incident
                      </Link>
                    </>
                  )}
                </div>
              )}
```
4. za blok tlačítka „Koupit" (za `)}` ukončující `l.lockDetail ? … : (…)`) a před `<div className="text-xs text-muted pt-1">{daysLeft(l.expiresAt)}</div>` vlož:
```tsx
                {l.vypadaJakoVase && (
                  <button
                    onClick={() => onReport(l)}
                    disabled={!!busy}
                    className="w-full mt-2 py-2 rounded-soft text-sm font-heading font-bold border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors"
                  >
                    {busy === `n-${l.id}` ? "..." : "Nahlásit policii"}
                  </button>
                )}
```

- [ ] **Step 3: Akce na stránce**

V `page.tsx` za `handleBuy` přidej:

```tsx
  const handleReport = async (l: BazarListing) => {
    if (!teamId || acting) return;
    const ok = await confirm({
      title: "Nahlásit inzerát policii?",
      description: "Inzerát hned zmizí z bazaru a policie ho přidá k vyšetřování krádeže. Když pachatele najde, cizí zloděj věci vrátí a hráč z kádru se odhalí. Policie řeší jednu krádež jen jednou.",
      details: [{ label: "Vybavení", value: `${l.categoryLabel}, úroveň ${l.level}`, color: "text-muted" }],
      confirmLabel: "Nahlásit policii",
    });
    if (!ok) return;
    setActing("n-" + l.id);
    if (await apiAction(apiFetch(`/api/teams/${teamId}/equipment-market/${l.id}/nahlasit`, { method: "POST" }),
      "Nahlášení se nezdařilo")) await refreshAll();
    setActing(null);
  };
```

a do `<BazarTab … />` přidej prop `onReport={handleReport}`.

- [ ] **Step 4: Typecheck a build**

Run: `cd apps/web && npx tsc --noEmit && npx next build --no-lint`
Expected: bez chyb.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/equipment/types.ts apps/web/src/app/dashboard/equipment/BazarTab.tsx apps/web/src/app/dashboard/equipment/page.tsx
git commit -F - <<'EOF'
feat(incidenty): kradene zbozi v bazaru, odznak a nahlasit policii

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 7: Spec podle fáze 5

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-incidenty-design.md`

- [ ] **Step 1: Odchylky**

Každou odchylku z tabulky „Odchylky od specu" tohoto plánu (`docs/superpowers/plans/2026-09-17-incidenty-faze-5.md`) zapiš na své místo v Částech 3 (migrace `0207_incidenty_bazar.sql` u úprav `equipment_listings`), 6b (krok 6), 7c (bonus 0,3 jako stopa), 8 (prodejce, nahlásit, GET, koupí jiný klub, koupit zpět, uzavřený incident, vrácené věci, admin `bazarTed`) a 11 (`BazarTab.tsx`, `page.tsx`). Ověř hodnoty proti kódu (`incidents/nastaveni.ts`, `incidents/bazar.ts`, `incidents/bazar-db.ts`, `routes/equipment-market.ts`).

- [ ] **Step 2: Pořadí implementace (Část 16)**

Za bod 5 doplň „(hotovo na testingu, plán `docs/superpowers/plans/2026-09-17-incidenty-faze-5.md`)".

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-16-incidenty-design.md
git commit -F - <<'EOF'
docs(incidenty): spec podle faze 5 bazar

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 8: Nasazení na testing a ověření (controller)

Tenhle task dělá controller: migrace na testovací DB, push, ověření v prohlížeči.

- [ ] **Step 1: Celá sada testů a build**

```bash
cd apps/api && npx vitest run && npx tsc --noEmit
cd ../web && npx tsc --noEmit && npx next build --no-lint
```

- [ ] **Step 2: Migrace na testovací DB (před pushem)**

```bash
cd apps/api && npx wrangler d1 execute prales-db-test --remote --file migrations/0207_incidenty_bazar.sql
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT COUNT(*) AS n FROM equipment_listings WHERE incident_id IS NOT NULL'
```

- [ ] **Step 3: Push a CI**

`git push origin testing`, počkat na `conclusion: success` běhu pro pushnutý commit.

- [ ] **Step 4: Scénář (testovací klub FK Duplex Břevnov, existující session, heslo nezadávat)**

1. Připravit poznatelné vybavení: dočasně `jerseys = 2` (nebo `trophy_case = 2` pro vitrínu) na testovacím klubu, `area_security = 0`; zaznamenat původní hodnoty.
2. `POST /api/admin/incidents/force` (`vloupani_sklad` nebo `vitrina`, dokud lup není poznatelný) → `POST /api/admin/incidents/vysetrovani {teamId, bazarTed: true}` → `bazar ≥ 1`. DB: inzerát `bazar-{incidentId}-{kategorie}`, `team_id` NULL, `is_ai_listing` 0, `incident_id`; stopa `bazar` s `police_bonus 0.3`; SMS Kustoda s tlačítkem „Otevřít incident".
3. MCP: Vybavení → Bazar: karta „soukromý inzerát", odznak „Vypadá to jako vaše ukradené vybavení" s odkazem na incident, tlačítko „Nahlásit policii"; cena na kartě ≥ výkup zastavárny.
4. Druhý klub ligy (API jako jiný tým jen čtením, nebo kontrola odpovědi GET pro cizí tým přes admin náhled, pokud není session): `vypadaJakoVase` false, `incidentId` null. Když druhá session není, zapsat jako neověřené a opřít se o unit test.
5. „Nahlásit policii" → potvrzení v dialogu → inzerát zmizí, incident ve stavu „Šetří policie".
6. Druhý poznatelný inzerát (nový incident + `bazarTed`) → „Koupit" vlastním klubem → `recovered = 1`, SMS „Věci jsou zpátky", úroveň vybavení zpět.
7. Nepoznatelná krádež (např. míče) + `bazarTed` → inzerát bez odznaku, žádná SMS ani stopa.
8. Mobil 400 px: karta s odznakem a dvěma tlačítky bez přetečení.
9. Uklidit: vrátit dočasné úrovně vybavení, případně stáhnout zbylé testovací inzeráty.

- [ ] **Step 5: Paměť**

Do `project_prod_deploy_pending.md` doplnit: incidenty fáze 5 na testingu, migrace **0207** na prod před merge kódu (po 0206), co zůstalo neověřené.

✋ **STOP.** Na produkci nic bez výslovného „nasaď na main".

---

## Co zůstává na další fáze

| Fáze | Navazuje na fázi 5 |
|---|---|
| 6 Hospoda | `chlubi_se` odhalí pachatele, který prodal zboží; drby o inzerátu |
| 9 Tisk, fanoušci | anonymní inzerát „Koupím zpět vlastní dresy" (`community/relation-texts.ts`) po veřejné krádeži |
