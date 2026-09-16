# Incidenty v klubu, fáze 2 (Vyšetřování) — implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manažer může incident vyšetřovat a rozhodnout o pachateli: při vzniku incidentu vzniknou stopy jen ze zdrojů, které klub má (kamera, správce, soused, svědci, kamarádi, rivalové), manažer vidí stav vyšetřování a podezřelé, může obvinit hráče (max. 2×), zavolat policii (jednou, výsledek za 3–7 dní) a odhaleného pachatele potrestat (odpustit, srážka ze mzdy, pokuta, vyhodit, předat policii, nechat být). Lhůty, recidiva a pondělní srážky běží v denním kroku.

**Architecture:** Stávající modul `apps/api/src/incidents/` dostane čistá pravidla (`stopy.ts`, `vysetrovani.ts`, `tresty.ts`) a DB vrstvu (`stopy-db.ts`, `incident-db.ts`, `hraci.ts`, `akce.ts`, `vysetrovani-den.ts`). Stopy se generují v `zapisIncident` po provedení škody. Každá akce manažera si nejdřív hlídaným `UPDATE` zabere přechod stavu a teprve potom provede následky. Stránka Incidenty dostane detail s vyšetřováním a akcemi.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, D1, Vitest, Next.js 15

**Spec:** `docs/superpowers/specs/2026-09-16-incidenty-design.md` (Části 3, 5a, 5b, 7, 7a–7f, 11, 16.2)

## Global Constraints

- **Branch:** `testing`. Push dělá až controller v posledním tasku. Push na `main` je zakázaný bez výslovného souhlasu uživatele.
- **UI a texty pro hráče česky**, s diakritikou, minimálně `text-sm`, jména hráčů `text-base` a klikatelná, ceny nikdy v tlačítkách (jen v info řádku), rozhodovací tlačítka dole, mobile-first.
- **V textech pro hráče nikdy dlouhá pomlčka „—".** Jméno hráče jen v 1. pádě jako podmět nebo samostatně za dvojtečkou. Každá šablona v `TEXTY` končí tečkou nebo vykřičníkem (hlídá `texty.test.ts`).
- **Žádný prázdný catch.** Server `logger.warn({ module: "xyz" }, "popis", e)` nebo `logger.error`, klient `console.error("popis:", e)`.
- **Tvrdé pravidlo konzistence:** stopa nevznikne ze zdroje, který klub nemá. **Stopy nelžou:** `ukazujeNa` i `podezreli` vždy obsahují skutečného pachatele. Každé pravidlo má test.
- **Tajné údaje nikdy do API:** `culprit_player_id` před odhalením, nenalezené stopy, držitelé stop, `willingness`.
- **Vlastnictví:** GET routy ověřují `tymyDivaka(c)`, POST routy `requireTeamOwnership`.
- **Determinismus:** každá náhoda přes `createRng(seedFromString("<účel>|<id>"))`. Žádné `Math.random` (výjimka: admin force).
- **Idempotence:** přechod stavu hlídaným `UPDATE … WHERE id = ? AND status = ?` (případně s dalšími podmínkami) a kontrola `meta.changes`; následky až po `changes > 0`. Transakce s deterministickou referencí.
- **Názvy sloupců do SQL jen z whitelistu** (`CATEGORIES`, konstanty v kódu), nikdy ze vstupu.
- **Herní data** ISO `YYYY-MM-DDT16:00:00.000Z` jako `teams.game_date`, porovnávat jen s herním datem.
- **Testy:** `cd apps/api && npx vitest run src/incidents` (a konkrétní soubor). **Typecheck:** `cd apps/api && npx tsc --noEmit`, FE `cd apps/web && npx tsc --noEmit`.
- **Commit** po každém tasku: `git add <soubory> && git commit -F - <<'EOF'` se zprávou a posledním řádkem `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Nikdy `git add -A`.
- **Migrace** se na `prales-db-test` aplikuje až v posledním tasku (controller). Na produkci nic.

---

## Odchylky od specu (zapsat do specu v Tasku 10)

| Místo ve specu | Plán | Proč |
|---|---|---|
| 3 `club_incident_clues` | navíc sloupec `police_bonus REAL` | šance policie se sčítá z nalezených stop; hospoda (fáze 6) a bazar (fáze 5) přidají stopy s vlastním bonusem bez změny vzorce |
| 3 `club_incidents` | navíc `accused TEXT` (JSON obvinění) | manažer musí vidět, koho už obvinil a s jakým výsledkem |
| 3 `club_incident_knowledge` | tabulka vzniká už ve fázi 2, zapisuje se jen role `obvineny` | 7b ukládá neprávem obviněného na 60 dní; ostatní role plní fáze 4 |
| 5a práh | `PRAH_VAHY_PACHATELE` 1,2 → **1,7** | na testovacích datech bylo při 1,2 kandidátem 89 % hráčů, při 1,7 polovina; povaha pak rozhoduje |
| 5a recidiva | odvozená dotazem: pachatel incidentu uzavřeného v posledních 60 dnech téže sezóny (kromě `bez_skody`, `nestalo_se`, `konec_sezony`) | nic se neukládá navíc, platí i pro nevyřešené |
| 5b místa | tabulka `MISTO_INCIDENTU`: vitrína = kabiny (klubovna), gril = stánek, vandal a trávník = hřiště, dodávka = parkoviště | spec místa u jednotlivých typů neurčoval |
| 5b kamera | nefunkční záznam jen když by kamera místo pokrývala; hráč nepoznaný kamerou = „postava bez obličeje" síla 1, +0,2 pro policii; ukradené kamery nic nenatočí | kamera, která na místo nemíří, nemá co říct |
| 5b správce | hráč: `ukazujeNa` síla 2, policie +0,1; cizí: auto, policie +0,15 | spec bonus správce neuváděl; svědectví správce má pro policii stejnou cenu jako svědek, popis auta jako soused |
| 5b kamarád, rival | policie +0,1, když je stopa nalezená | jsou to svědci |
| 5b rozsah | stopy nevznikají u odhaleného pachatele (kopnuté dveře), u nehody (`nikdo`) a u uzavřených incidentů | není co vyšetřovat |
| 7b stopa na obviněného | počítá i `podezreli` (soused) | zúžení na pár lidí je stopa |
| 7b po odhalení | lhůta se prodlouží aspoň na dnes + 3 dny | manažer musí mít čas na trest |
| 7b kádr −2 | bez obviněného a bez jeho kamarádů (ti mají −3) | nezdvojovat |
| 7c úspěch, hráč | `revealed = 1`, stav zpět `otevreny`, lhůta dnes + 7, trest volí manažer | spec neřekl, co po odhalení policií |
| 7c úspěch, nehoda | výsledek `nehoda`, incident se uzavře | pachatel `nikdo` |
| 7c úspěch, cizí u poškození | náhrada 50–100 % hodnoty škody jako `incident_recovery` | rozbité se vrátit nedá |
| 7c neúspěch | lhůta = dnes + 3 dny | původní lhůta mezitím mohla uplynout |
| 7c udání | `status = policie`, `resolution = policie`, výsledek za 3–7 dní vždy „podmínka" | absence výslech a soud přidá fáze 3 |
| 7d `vyradit` | až fáze 3 | potřebuje `club_incident_absences` a odečet v `match-runner.ts` |
| 7d `vyhodit` | bez `povest` a bez zprávy o vyhazovu zloděje | fáze 10 |
| 7d srážka | `resolution_data = {celkem, tydnuZbyva}`, splátka týdně = celek/4, poslední doplatí zbytek | součet sedí na korunu |
| 7f | ve fázi 2 jen SMS, notifikace a transakce; reputace, Zpravodaj, fanoušci, obec, atributy manažera později | fáze 3, 8, 9 |
| 5b text „zámek je celý" | zůstává v textu incidentu | pravdivá nápověda, zdroj „zámek" ve specu není |

---

## Struktura souborů

| Soubor | Odpovědnost |
|---|---|
| `apps/api/migrations/0205_incidenty_vysetrovani.sql` | `club_incident_clues`, `club_incident_knowledge`, `club_incidents.accused` |
| `apps/api/src/incidents/typy.ts` | nové typy stop, obvinění a trestů |
| `apps/api/src/incidents/nastaveni.ts` | konstanty vyšetřování |
| `apps/api/src/incidents/pachatel.ts` | recidiva ve váze |
| `apps/api/src/incidents/stav-klubu.ts` | `hracZRadku`, `SLOUPCE_HRACE`, recidivisté |
| `apps/api/src/incidents/stopy.ts` | čisté generování stop (5b) |
| `apps/api/src/incidents/stopy-db.ts` | zápis a čtení stop, zdroje stop z DB |
| `apps/api/src/incidents/testovaci-d1.ts` | falešná D1 pro testy |
| `apps/api/src/incidents/dopady.ts` | stopy při vzniku incidentu, oznámení s nalezenými stopami |
| `apps/api/src/incidents/vysetrovani.ts` | stav vyšetřování, obvinění, šance a výsledek policie, dostupné akce |
| `apps/api/src/incidents/tresty.ts` | hodnota škody, srážka, pokuta, oblíbenost |
| `apps/api/src/incidents/incident-db.ts` | načtení incidentu, herního data a hráče kádru |
| `apps/api/src/incidents/hraci.ts` | příkazy morálky a vztahu k trenérovi |
| `apps/api/src/incidents/akce.ts` | obvinit, zavolat policii, rozhodnout o trestu |
| `apps/api/src/incidents/vysetrovani-den.ts` | výsledky policie, lhůty, pondělní srážky |
| `apps/api/src/incidents/denni-krok.ts` | volání vyšetřování ve správném pořadí |
| `apps/api/src/routes/incidents.ts` | detail, akce, admin force s hráčem, admin vyšetřování |
| `apps/api/src/season/finance-processor.ts` | typy transakcí `incident_fine`, `incident_deduction`, `incident_recovery` |
| `apps/web/src/app/dashboard/finances/page.tsx` | popisky a ikony nových transakcí |
| `apps/web/src/app/dashboard/incidenty/{page.tsx,DetailIncidentu.tsx,typy.ts}` | seznam, detail, akce |

---
## Task 1: Migrace, typy, nastavení a recidiva

**Files:**
- Create: `apps/api/migrations/0205_incidenty_vysetrovani.sql`
- Modify: `apps/api/src/incidents/typy.ts`, `nastaveni.ts`, `pachatel.ts`, `stav-klubu.ts`, `testovaci-stav.ts`, `pachatel.test.ts`
- Create: `apps/api/src/incidents/stav-klubu.test.ts`

**Interfaces:**
- Produces: typy `ZdrojStopy`, `NavrhStopy`, `Stopa`, `VysledekObvineni`, `Obvineni`, `AkceTrestu`; `HracKlubu.vudcovstvi|povolani|recidivista`; `Ztrata` stadion `cena?`; konstanty v `nastaveni.ts`; `export const SLOUPCE_HRACE`; `export function hracZRadku(r: Record<string, unknown>, recidiviste?: ReadonlySet<string>): HracKlubu`.

- [ ] **Step 1: Migrace**

`apps/api/migrations/0205_incidenty_vysetrovani.sql`:

```sql
-- Incidenty v klubu, fáze 2: vyšetřování.
-- Spec docs/superpowers/specs/2026-09-16-incidenty-design.md, Část 3, 5b, 7.
-- CREATE jsou idempotentní, ALTER TABLE se spouští jen jednou.

CREATE TABLE IF NOT EXISTS club_incident_clues (
  id                  TEXT PRIMARY KEY,        -- {incidentId}-{zdroj}-{n}
  incident_id         TEXT NOT NULL,
  team_id             TEXT NOT NULL,
  source              TEXT NOT NULL CHECK(source IN
    ('kamera','spravce','soused','svedek','kamarad','rival','hospoda','bazar','policie','priznani')),
  points_to_player_id TEXT,                    -- vždy skutečný pachatel
  suspects            TEXT,                    -- JSON [playerId], vždy včetně pachatele
  holder_player_id    TEXT,                    -- od koho se stopa dá získat výslechem
  strength            INTEGER NOT NULL DEFAULT 1 CHECK(strength BETWEEN 1 AND 3),
  police_bonus        REAL NOT NULL DEFAULT 0, -- o kolik nalezená stopa zvedne šanci policie
  text                TEXT NOT NULL,
  found               INTEGER NOT NULL DEFAULT 0,
  found_on            TEXT
);
CREATE INDEX IF NOT EXISTS idx_clues_incident ON club_incident_clues(incident_id, found);

CREATE TABLE IF NOT EXISTS club_incident_knowledge (
  incident_id     TEXT NOT NULL,
  player_id       TEXT NOT NULL,
  team_id         TEXT NOT NULL,
  role            TEXT NOT NULL CHECK(role IN ('kadr','svedek','kamarad','rival','pachatel','obvineny','drb')),
  fact            TEXT NOT NULL,
  willingness     INTEGER NOT NULL DEFAULT 50,
  interrogation   TEXT CHECK(interrogation IN ('prozradil','kryje','zapira','priznal')),
  interrogated_on TEXT,
  until           TEXT NOT NULL,
  season_number   INTEGER NOT NULL,
  PRIMARY KEY (incident_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_player ON club_incident_knowledge(player_id, until);

-- Koho manažer obvinil a jak to dopadlo: JSON [{playerId, jmeno, den, vysledek}].
ALTER TABLE club_incidents ADD COLUMN accused TEXT NOT NULL DEFAULT '[]';
```

- [ ] **Step 2: Typy**

V `apps/api/src/incidents/typy.ts`:

1. V `Ztrata` nahraď řádek stadionu:

```ts
  | { typ: "stadion"; zarizeni: string; urovni: number; damageId?: string; /** Cena opravy v Kč v okamžiku škody. */ cena?: number }
```

2. Do `HracKlubu` za `transferUnrest: number;` přidej:

```ts
  /** `personality.leadership`, pro oblíbenost v kabině (spec 7c). */
  vudcovstvi: number;
  /** `life_context.occupation`, např. „Policista". */
  povolani: string;
  /** Pachatel incidentu uzavřeného v posledních 60 dnech (spec 5a). */
  recidivista: boolean;
```

3. Na konec souboru přidej:

```ts
export type ZdrojStopy =
  | "kamera" | "spravce" | "soused" | "svedek" | "kamarad" | "rival" | "hospoda" | "bazar" | "policie" | "priznani";

/**
 * Stopa před zápisem do `club_incident_clues` (spec 5b).
 * Stopy nelžou: `ukazujeNa` i `podezreli` vždy obsahují skutečného pachatele.
 */
export interface NavrhStopy {
  zdroj: ZdrojStopy;
  ukazujeNa: string | null;
  podezreli: string[] | null;
  /** Hráč, od kterého se stopa dá získat výslechem (fáze 4). */
  drzitel: string | null;
  sila: 1 | 2 | 3;
  /** O kolik zvedne šanci policie, když je nalezená. */
  bonusPolicie: number;
  text: string;
  nalezena: boolean;
}

export interface Stopa extends NavrhStopy {
  id: string;
}

export type VysledekObvineni = "priznal" | "usvedcen" | "zapira";

export interface Obvineni {
  playerId: string;
  jmeno: string;
  /** `YYYY-MM-DD` herního dne. */
  den: string;
  vysledek: VysledekObvineni;
}

export type AkceTrestu = "odpustit" | "srazka" | "pokuta" | "vyhodit" | "policie" | "nechat_byt";
```

- [ ] **Step 3: Nastavení**

V `apps/api/src/incidents/nastaveni.ts` nahraď definici `PRAH_VAHY_PACHATELE` a na konec souboru přidej zbytek:

```ts
/**
 * Pod touhle vahou (pachatel.ts) hráč nekrade ani neničí. Při 1,7 je kandidátem
 * zhruba polovina běžného kádru (ověřeno na testovacích datech, při 1,2 to bylo 89 %).
 */
export const PRAH_VAHY_PACHATELE = 1.7;
```

```ts
/** Recidivista: pachatel incidentu uzavřeného v posledních dnech (spec 5a). */
export const RECIDIVA_DNI = 60;
export const VAHA_RECIDIVY = 1.0;

/** Vyšetřování (spec 7b–7d). */
export const MAX_OBVINENI = 2;
/** Jak dlouho si neprávem obviněný pamatuje křivdu. */
export const OBVINENI_PAMET_DNI = 60;
/** Po odhalení pachatele má manažer na trest aspoň tolik dní. */
export const LHUTA_PO_ODHALENI_DNI = 3;
export const POLICIE_DNI_MIN = 3;
export const POLICIE_DNI_MAX = 7;
/** Neúspěšné šetření vrátí incident manažerovi s novou lhůtou. */
export const LHUTA_PO_POLICII_DNI = 3;
export const POLICIE_ZAKLAD = 0.15;
export const POLICIE_STROP = 0.9;
export const POLICIE_POLICISTA = 0.1;
export const POVOLANI_POLICISTA = "Policista";
/** Kolik nalezená stopa přidá k šanci policie (spec 7c). */
export const BONUS_POLICIE = {
  kameraIdentita: 0.35,
  kameraBezIdentity: 0.2,
  soused: 0.15,
  spravceCizi: 0.15,
  svedek: 0.1,
} as const;
export const SRAZKA_TYDNU = 4;
export const POKUTA_STROP_KC = 5000;
/** Hodnota jednoho procentního bodu stavu trávníku v Kč (hodnota škody). */
export const CENA_BODU_TRAVNIKU = 150;
export const SMS_ROLE_POLICIE = "Policie ČR, obvodní oddělení";
/** Vztahy, kvůli kterým hráč kamaráda kryje (spec 5b). */
export const KAMARADSKE_VZTAHY = ["brothers", "drinking_buddies", "neighbors", "coworkers", "classmates", "in_laws"] as const;
export const SILA_KAMARADSTVI = 40;
/** Oblíbený hráč (spec 7c): vůdce kabiny, nebo aspoň dva silné vztahy. */
export const OBLIBENY_VUDCOVSTVI = 65;
export const OBLIBENY_SILA_VZTAHU = 50;
export const OBLIBENY_POCET_VZTAHU = 2;
```

- [ ] **Step 4: Fixture hráče**

V `apps/api/src/incidents/testovaci-stav.ts` doplň do výchozích hodnot `hrac()` za `transferUnrest: 0,`:

```ts
    vudcovstvi: 30, povolani: "", recidivista: false,
```

- [ ] **Step 5: Failing testy**

Do `apps/api/src/incidents/pachatel.test.ts` přidej import `VAHA_RECIDIVY` z `./nastaveni` a do `describe("pachatel")`:

```ts
  it("recidivista má váhu vyšší právě o recidivu", () => {
    expect(vahaPachatele(hrac({ recidivista: true })) - vahaPachatele(hrac())).toBeCloseTo(VAHA_RECIDIVY);
  });

  it("slušný hráč s disciplínou a věrností 70 nekrade, recidiva ho nad práh dostane", () => {
    const slusny = hrac({ disciplina: 70, vernost: 70 });
    expect(vahaPachatele(slusny)).toBeLessThan(PRAH_VAHY_PACHATELE);
    expect(vahaPachatele({ ...slusny, recidivista: true })).toBeGreaterThanOrEqual(PRAH_VAHY_PACHATELE);
  });
```

Vytvoř `apps/api/src/incidents/stav-klubu.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hracZRadku } from "./stav-klubu";

describe("hráč z řádku DB", () => {
  const radek = {
    id: "h1", first_name: "Franta", last_name: "Novák",
    personality: JSON.stringify({ alcohol: 80, discipline: 20, patriotism: 30, temper: 70, leadership: 72 }),
    life_context: JSON.stringify({ occupation: "Policista", transferUnrest: { level: 40 } }),
    coach_relationship: 35,
  };

  it("přečte povahu, vůdcovství, povolání a vztah k trenérovi", () => {
    expect(hracZRadku(radek)).toEqual({
      id: "h1", jmeno: "Franta Novák", alkohol: 80, disciplina: 20, vernost: 30, temperament: 70,
      vztahKTrenerovi: 35, transferUnrest: 40, vudcovstvi: 72, povolani: "Policista", recidivista: false,
    });
  });

  it("recidivistu pozná podle množiny", () => {
    expect(hracZRadku(radek, new Set(["h1"])).recidivista).toBe(true);
  });

  it("rozbitý JSON dá výchozí hodnoty", () => {
    const h = hracZRadku({ id: "h2", first_name: "Jan", last_name: "Kos", personality: "{rozbite", life_context: null, coach_relationship: null });
    expect(h).toMatchObject({
      alkohol: 30, disciplina: 50, vernost: 50, temperament: 40, vztahKTrenerovi: 50,
      vudcovstvi: 30, povolani: "", transferUnrest: 0, recidivista: false,
    });
  });
});
```

- [ ] **Step 6: Spusť testy, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/pachatel.test.ts src/incidents/stav-klubu.test.ts`
Expected: FAIL (`hracZRadku` neexistuje, recidiva se nepočítá).

- [ ] **Step 7: Recidiva ve váze**

V `apps/api/src/incidents/pachatel.ts` importuj `VAHA_RECIDIVY` z `./nastaveni` a do `vahaPachatele` přidej poslední sčítanec:

```ts
    + (h.transferUnrest / 100) * 0.5
    + (h.recidivista ? VAHA_RECIDIVY : 0);
```

- [ ] **Step 8: `hracZRadku` a recidivisté ve stavu klubu**

V `apps/api/src/incidents/stav-klubu.ts`:

1. Importuj `gameExpiry` z `../lib/game-time` a `RECIDIVA_DNI` z `./nastaveni`.
2. Pod funkci `pole` přidej:

```ts
/** Sloupce hráče, ze kterých `hracZRadku` skládá `HracKlubu`. */
export const SLOUPCE_HRACE = "id, first_name, last_name, personality, life_context, coach_relationship";

export function hracZRadku(r: Record<string, unknown>, recidiviste: ReadonlySet<string> = new Set()): HracKlubu {
  const p = objekt(r.personality, "personality");
  const lc = objekt(r.life_context, "life_context");
  const id = String(r.id);
  return {
    id,
    jmeno: `${r.first_name} ${r.last_name}`,
    alkohol: cislo(p.alcohol, 30),
    disciplina: cislo(p.discipline, 50),
    vernost: cislo(p.patriotism, 50),
    temperament: cislo(p.temper, 40),
    vztahKTrenerovi: cislo(r.coach_relationship, 50),
    transferUnrest: cislo(lc.transferUnrest?.level, 0),
    vudcovstvi: cislo(p.leadership, 30),
    povolani: typeof lc.occupation === "string" ? lc.occupation : "",
    recidivista: recidiviste.has(id),
  };
}
```

3. V `db.batch` nahraď dotaz na kádr:

```ts
    db.prepare(`SELECT ${SLOUPCE_HRACE} FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')`).bind(teamId),
```

a jako **poslední** položku dávky přidej:

```ts
    db.prepare(
      `SELECT DISTINCT culprit_player_id AS id FROM club_incidents
        WHERE team_id = ? AND season_number = ? AND culprit_type = 'hrac' AND culprit_player_id IS NOT NULL
          AND status = 'uzavreny' AND COALESCE(resolution, '') NOT IN ('bez_skody', 'nestalo_se', 'konec_sezony')
          AND resolved_on >= ?`,
    ).bind(teamId, seasonNumber, gameExpiry(gameDate, -RECIDIVA_DNI)),
```

4. Rozbalení výsledků rozšiř o `recidivisteRes`:

```ts
  const [stadionRes, kadrRes, zapasRes, hospodaRes, pocetRes, incidentyRes, blizkyZapasRes, recidivisteRes] = vysledky;
```

5. Mapování kádru nahraď:

```ts
  const recidiviste = new Set((recidivisteRes.results as Array<{ id: string }>).map((r) => String(r.id)));
  const kadr: HracKlubu[] = (kadrRes.results as Array<Record<string, unknown>>).map((r) => hracZRadku(r, recidiviste));
```

- [ ] **Step 9: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS, bez chyb typů.

- [ ] **Step 10: Commit**

```bash
git add apps/api/migrations/0205_incidenty_vysetrovani.sql apps/api/src/incidents/typy.ts apps/api/src/incidents/nastaveni.ts apps/api/src/incidents/pachatel.ts apps/api/src/incidents/pachatel.test.ts apps/api/src/incidents/stav-klubu.ts apps/api/src/incidents/stav-klubu.test.ts apps/api/src/incidents/testovaci-stav.ts
git commit -F - <<'EOF'
feat(incidenty): migrace vysetrovani, typy stop a recidiva pachatele

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Generování stop (čisté funkce)

**Files:**
- Create: `apps/api/src/incidents/stopy.ts`, `apps/api/src/incidents/stopy.test.ts`
- Modify: `apps/api/src/incidents/texty.ts`

**Interfaces:**
- Consumes: `NavrhStopy`, `NavrhIncidentu`, `StavKlubu`, `HracKlubu` (typy.ts); `BONUS_POLICIE`, `KAMARADSKE_VZTAHY`, `SILA_KAMARADSTVI` (nastaveni.ts); `efektyZabezpeceni(level, condition)`, `ZABEZPECENI_MIN_STAV` (equipment-generator.ts).
- Produces:
  - `export type MistoIncidentu = "sklad" | "kabiny" | "parkoviste" | "hriste" | "stanek"`
  - `export const MISTO_INCIDENTU: Record<string, MistoIncidentu>`, `export const MISTO_TEXT: Record<MistoIncidentu, string>`
  - `export interface ZdrojeStop { spravceUsudek: number | null; vztahyPachatele: Array<{ hracId: string; typ: string; sila: number }> }`
  - `export function vygenerujStopy(stav: StavKlubu, navrh: NavrhIncidentu, zdroje: ZdrojeStop, rng: Rng): NavrhStopy[]`
  - `export function odhalujePachatele(stopy: readonly NavrhStopy[]): boolean`
  - `export function seznamJmen(jmena: string[]): string`
  - nové klíče `TEXTY`: `stopa_kamera_hrac`, `stopa_kamera_postava`, `stopa_kamera_cizi`, `stopa_kamera_nefunkcni`, `stopa_spravce_hrac`, `stopa_spravce_cizi`, `stopa_soused_hraci`, `stopa_soused_cizi`, `stopa_svedek`, `stopa_kamarad`, `stopa_rival`

- [ ] **Step 1: Failing test**

`apps/api/src/incidents/stopy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { MISTO_INCIDENTU, odhalujePachatele, seznamJmen, vygenerujStopy, type ZdrojeStop } from "./stopy";
import { hrac, PROBLEMOVY, stavKlubu } from "./testovaci-stav";
import type { NavrhIncidentu, NavrhStopy, StavKlubu } from "./typy";

const KADR = [PROBLEMOVY, hrac({ id: "a", jmeno: "Adam Kos" }), hrac({ id: "b", jmeno: "Bedřich Vrba" }), hrac({ id: "c", jmeno: "Cyril Malý" })];
const BEZ_ZDROJU: ZdrojeStop = { spravceUsudek: null, vztahyPachatele: [] };

function navrh(over: Partial<NavrhIncidentu> = {}): NavrhIncidentu {
  return {
    kind: "vloupani_sklad", category: "kradez", status: "otevreny", severity: 1,
    culpritType: "hrac", culpritPlayerId: "p", culpritRevealed: false,
    ztraty: [], text: "Ze skladu zmizely dresy.", ...over,
  };
}

function seedy(stav: StavKlubu, n: NavrhIncidentu, zdroje: ZdrojeStop = BEZ_ZDROJU, pocet = 200): NavrhStopy[][] {
  return Array.from({ length: pocet }, (_, i) => vygenerujStopy(stav, n, zdroje, createRng(i + 1)));
}
const zeZdroje = (vysledky: NavrhStopy[][], zdroj: string) => vysledky.flat().filter((s) => s.zdroj === zdroj);

describe("stopy vzniknou jen ze zdroje, který klub má", () => {
  it("bez zabezpečení areálu žádná kamera", () => {
    expect(zeZdroje(seedy(stavKlubu({ kadr: KADR }), navrh()), "kamera")).toEqual([]);
  });

  it("zabezpečení úrovně 1 kameru nemá", () => {
    const s = stavKlubu({ kadr: KADR, vybaveni: { area_security: 1, area_security_condition: 90 } });
    expect(zeZdroje(seedy(s, navrh()), "kamera")).toEqual([]);
  });

  it("sešlá kamera dá jen informaci, že nenahrávala", () => {
    const s = stavKlubu({ kadr: KADR, vybaveni: { area_security: 2, area_security_condition: 30 } });
    const kamery = zeZdroje(seedy(s, navrh()), "kamera");
    expect(kamery).toHaveLength(200);
    for (const k of kamery) {
      expect(k).toMatchObject({ ukazujeNa: null, podezreli: null, sila: 1, bonusPolicie: 0, nalezena: true });
      expect(k.text).toContain("30 %");
    }
  });

  it("úroveň 2 vidí na sklad, ale ne na parkoviště; úroveň 3 vidí i tam", () => {
    const dodavka = navrh({ kind: "dodavka_ukradena", culpritType: "cizi", culpritPlayerId: null });
    const lv2 = stavKlubu({ kadr: KADR, vybaveni: { area_security: 2, area_security_condition: 90 } });
    const lv3 = stavKlubu({ kadr: KADR, vybaveni: { area_security: 3, area_security_condition: 90 } });
    expect(MISTO_INCIDENTU.dodavka_ukradena).toBe("parkoviste");
    expect(zeZdroje(seedy(lv2, dodavka), "kamera")).toEqual([]);
    expect(zeZdroje(seedy(lv2, navrh()), "kamera")).toHaveLength(200);
    expect(zeZdroje(seedy(lv3, dodavka), "kamera")).toHaveLength(200);
  });

  it("ukradené kamery nic nenatočí", () => {
    const s = stavKlubu({ kadr: KADR, vybaveni: { area_security: 3, area_security_condition: 90 } });
    expect(zeZdroje(seedy(s, navrh({ kind: "kradez_kamery", culpritType: "cizi", culpritPlayerId: null })), "kamera")).toEqual([]);
  });

  it("bez správce hřiště nic neviděl správce", () => {
    const s = stavKlubu({ kadr: KADR });
    expect(zeZdroje(seedy(s, navrh()), "spravce")).toEqual([]);
    expect(zeZdroje(seedy(s, navrh(), { spravceUsudek: 20, vztahyPachatele: [] }), "spravce").length).toBeGreaterThan(0);
  });

  it("bez osvětlení nic neviděl soused, s osvětlením dá 2 až 3 podezřelé včetně pachatele", () => {
    expect(zeZdroje(seedy(stavKlubu({ kadr: KADR }), navrh()), "soused")).toEqual([]);
    const sousede = zeZdroje(seedy(stavKlubu({ kadr: KADR, stadion: { lighting: 1, pitch_condition: 70 } }), navrh()), "soused");
    expect(sousede.length).toBeGreaterThan(0);
    for (const s of sousede) {
      expect(s.podezreli).toContain("p");
      expect(s.podezreli?.length).toBeGreaterThanOrEqual(2);
      expect(s.podezreli?.length).toBeLessThanOrEqual(3);
      expect(s.ukazujeNa).toBeNull();
    }
  });

  it("svědek je jen hráč, který byl včera v hospodě, a stopu má u sebe", () => {
    expect(zeZdroje(seedy(stavKlubu({ kadr: KADR }), navrh()), "svedek")).toEqual([]);
    const svedci = zeZdroje(seedy(stavKlubu({ kadr: KADR, hospodaVcera: ["a", "p"] }), navrh()), "svedek");
    expect(svedci.length).toBeGreaterThan(0);
    for (const s of svedci) expect(s).toMatchObject({ drzitel: "a", ukazujeNa: "p", nalezena: false });
  });

  it("kamarád s pevným vztahem ví vždycky, slabý vztah nestačí, rival jen někdy", () => {
    const vztahy: ZdrojeStop = { spravceUsudek: null, vztahyPachatele: [
      { hracId: "a", typ: "drinking_buddies", sila: 60 },
      { hracId: "b", typ: "neighbors", sila: 20 },
      { hracId: "c", typ: "rivals", sila: 50 },
    ] };
    const vysledky = seedy(stavKlubu({ kadr: KADR }), navrh(), vztahy);
    const kamaradi = zeZdroje(vysledky, "kamarad");
    expect(kamaradi).toHaveLength(200);
    for (const k of kamaradi) expect(k).toMatchObject({ drzitel: "a", ukazujeNa: "p", nalezena: false });
    const rivalove = zeZdroje(vysledky, "rival");
    expect(rivalove.length).toBeGreaterThan(0);
    expect(rivalove.length).toBeLessThan(200);
    for (const r of rivalove) expect(r.drzitel).toBe("c");
  });
});

describe("stopy nelžou", () => {
  const plny = stavKlubu({
    kadr: KADR, hospodaVcera: ["a", "b"],
    vybaveni: { area_security: 3, area_security_condition: 70 },
    stadion: { lighting: 2, pitch_condition: 70 },
  });
  const vztahy: ZdrojeStop = {
    spravceUsudek: 15,
    vztahyPachatele: [{ hracId: "c", typ: "brothers", sila: 80 }, { hracId: "b", typ: "rivals", sila: 40 }],
  };

  it("ukazují jen na skutečného pachatele", () => {
    for (const stopy of seedy(plny, navrh(), vztahy)) {
      for (const s of stopy) {
        if (s.ukazujeNa !== null) expect(s.ukazujeNa).toBe("p");
        if (s.podezreli !== null) expect(s.podezreli).toContain("p");
      }
    }
  });

  it("u cizího pachatele neukazují na nikoho z kádru", () => {
    for (const stopy of seedy(plny, navrh({ culpritType: "cizi", culpritPlayerId: null }), vztahy)) {
      for (const s of stopy) {
        expect(s.ukazujeNa).toBeNull();
        expect(s.podezreli).toBeNull();
        expect(s.drzitel).toBeNull();
      }
    }
  });

  it("stejný seed dá stejné stopy", () => {
    expect(vygenerujStopy(plny, navrh(), vztahy, createRng(9))).toEqual(vygenerujStopy(plny, navrh(), vztahy, createRng(9)));
  });

  it("odhalený pachatel, nehoda ani uzavřený incident se nevyšetřují", () => {
    expect(vygenerujStopy(plny, navrh({ culpritRevealed: true }), vztahy, createRng(1))).toEqual([]);
    expect(vygenerujStopy(plny, navrh({ culpritType: "nikdo", culpritPlayerId: null }), vztahy, createRng(1))).toEqual([]);
    expect(vygenerujStopy(plny, navrh({ status: "uzavreny" }), vztahy, createRng(1))).toEqual([]);
  });

  it("pachatele odhalí jen nalezená stopa síly 3, která na něj ukazuje", () => {
    const zaklad: NavrhStopy = { zdroj: "kamera", ukazujeNa: "p", podezreli: null, drzitel: null, sila: 3, bonusPolicie: 0.35, text: "x.", nalezena: true };
    expect(odhalujePachatele([zaklad])).toBe(true);
    expect(odhalujePachatele([{ ...zaklad, nalezena: false }])).toBe(false);
    expect(odhalujePachatele([{ ...zaklad, sila: 2 }])).toBe(false);
    expect(odhalujePachatele([{ ...zaklad, ukazujeNa: null }])).toBe(false);
  });

  it("seznam jmen", () => {
    expect(seznamJmen(["A"])).toBe("A");
    expect(seznamJmen(["A", "B"])).toBe("A nebo B");
    expect(seznamJmen(["A", "B", "C"])).toBe("A, B nebo C");
  });
});
```

- [ ] **Step 2: Spusť, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/stopy.test.ts`
Expected: FAIL (modul `./stopy` neexistuje).

- [ ] **Step 3: Texty stop**

V `apps/api/src/incidents/texty.ts` přidej do objektu `TEXTY` (před `lhuta_kradez`):

```ts
  stopa_kamera_hrac: [
    "Kustod prošel záznam z kamery. {hrac} je na něm {misto} jasně vidět.",
    "Kamera to natočila {misto}. Na záznamu je jasně poznat hráč: {hrac}.",
    "Záznam z kamery nenechává pochybnosti. {hrac} se {misto} ani neschovával.",
  ],
  stopa_kamera_postava: [
    "Kamera zachytila {misto} postavu v kapuci. Obličej vidět není.",
    "Na záznamu z kamery je {misto} jen shrbená postava. Kdo to je, se poznat nedá.",
    "Kamera nahrála {misto} pohyb, ale obličej zůstal ve stínu.",
  ],
  stopa_kamera_cizi: [
    "Kamera zachytila {misto} neznámého muže v kapuci. Z kádru ho nikdo nepoznal.",
    "Na záznamu z kamery je {misto} cizí chlap s kuklou na hlavě.",
    "Kamera nahrála {misto} dva cizí muže. Obličeje měli zakryté.",
  ],
  stopa_kamera_nefunkcni: [
    "Kamera ten den nenahrávala, zabezpečení je sešlé (stav {stav} %).",
    "Záznam z kamery je prázdný. Zabezpečení je v bídném stavu ({stav} %).",
    "Kamera se v noci vypnula. Při stavu {stav} % se není čemu divit.",
  ],
  stopa_spravce_hrac: [
    "Správce hřiště viděl večer {misto} hráče, který tam neměl co dělat: {hrac}.",
    "Správce hřiště říká, že se {misto} pozdě večer motal hráč: {hrac}.",
    "Správce hřiště zamykal a {misto} potkal hráče, který spěchal pryč: {hrac}.",
  ],
  stopa_spravce_cizi: [
    "Správce hřiště viděl večer {misto} cizí auto s okresní značkou.",
    "Správce hřiště si všiml cizího auta, které stálo {misto} se zhasnutými světly.",
    "Správce hřiště zahlédl večer {misto} dva cizí chlapy. U nás je nikdy neviděl.",
  ],
  stopa_soused_hraci: [
    "Soused viděl v noci u hřiště někoho z klubu. Byl to jeden z nich: {jmena}.",
    "Sousedka v noci zahlédla u hřiště někoho z kádru. Tipuje jednoho z nich: {jmena}.",
    "Soused venčil psa a u hřiště potkal někoho z klubu. Mohl to být jeden z nich: {jmena}.",
  ],
  stopa_soused_cizi: [
    "Soused slyšel v noci u hřiště cizí auto bez rozsvícených světel.",
    "Sousedka viděla v noci u areálu dva cizí chlapy s baterkou.",
    "Sousedův pes v noci štěkal na cizího člověka u plotu.",
  ],
  stopa_svedek: [
    "{svedek} šel z hospody kolem hřiště a {misto} viděl hráče: {hrac}.",
    "{svedek} cestou z hospody zahlédl {misto} hráče: {hrac}.",
    "{svedek} viděl v noci {misto} známou postavu. Byl to {hrac}.",
  ],
  stopa_kamarad: [
    "{svedek} ví, kdo to udělal: {hrac}. Jsou kamarádi, tak to dlouho tajil.",
    "{svedek} přiznal, že mu to kamarád sám řekl. Udělal to {hrac}.",
    "{svedek} to ví z první ruky. Udělal to jeho kamarád {hrac}.",
  ],
  stopa_rival: [
    "{svedek} rád prozradil, kdo to byl: {hrac}.",
    "{svedek} viděl, kdo to udělal, a krýt ho nebude: {hrac}.",
    "{svedek} ukázal prstem na hráče, se kterým se nemusí: {hrac}.",
  ],
```

- [ ] **Step 4: Implementace**

`apps/api/src/incidents/stopy.ts`:

```ts
/**
 * Stopy k incidentu (spec Část 5b). Čisté funkce bez DB.
 *
 * Tvrdé pravidlo: stopa vznikne jen ze zdroje, který klub skutečně má. Bez
 * kamery nic nenatočí kamera, bez správce nic neviděl správce. A stopy nelžou:
 * když na někoho ukazují, je to skutečný pachatel.
 */

import { efektyZabezpeceni, ZABEZPECENI_MIN_STAV } from "../equipment/equipment-generator";
import type { Rng } from "../generators/rng";
import { BONUS_POLICIE, KAMARADSKE_VZTAHY, SILA_KAMARADSTVI } from "./nastaveni";
import { text } from "./texty";
import type { NavrhIncidentu, NavrhStopy, StavKlubu, ZdrojStopy } from "./typy";

export type MistoIncidentu = "sklad" | "kabiny" | "parkoviste" | "hriste" | "stanek";

/** Kde se incident stal. Podle místa se pozná, jestli na něj kamera vidí. */
export const MISTO_INCIDENTU: Record<string, MistoIncidentu> = {
  vloupani_sklad: "sklad",
  // Vitrína s poháry stojí v klubovně u kabin.
  vitrina: "kabiny",
  dodavka_pujcena: "parkoviste",
  dodavka_ukradena: "parkoviste",
  kradez_kamery: "kabiny",
  oslava_v_kabine: "kabiny",
  kopnute_dvere: "kabiny",
  koleje_trakturek: "hriste",
  pozar_grilu: "stanek",
  svetlice: "hriste",
  vandal: "hriste",
};

/** Kolik pokrytí kamer (`cameraCoverage`) místo potřebuje: 1 = kabiny a sklad, 2 = celý areál. */
const POTREBNE_POKRYTI: Record<MistoIncidentu, number> = {
  sklad: 1, kabiny: 1, parkoviste: 2, hriste: 2, stanek: 2,
};

export const MISTO_TEXT: Record<MistoIncidentu, string> = {
  sklad: "u skladu", kabiny: "u kabin", parkoviste: "na parkovišti", hriste: "na hřišti", stanek: "u stánku",
};

export interface ZdrojeStop {
  /** Úsudek najatého správce hřiště (`staff_members.judgement`), `null` bez správce. */
  spravceUsudek: number | null;
  /** Vztahy pachatele s ostatními hráči. Prázdné u cizího pachatele. */
  vztahyPachatele: Array<{ hracId: string; typ: string; sila: number }>;
}

/** „Franta Novák, Pepa Kos nebo Jan Vrba". */
export function seznamJmen(jmena: string[]): string {
  if (jmena.length <= 1) return jmena[0] ?? "";
  return `${jmena.slice(0, -1).join(", ")} nebo ${jmena[jmena.length - 1]}`;
}

function stopa(zdroj: ZdrojStopy, sila: 1 | 2 | 3, bonusPolicie: number, textStopy: string, dalsi: Partial<NavrhStopy> = {}): NavrhStopy {
  return { zdroj, ukazujeNa: null, podezreli: null, drzitel: null, sila, bonusPolicie, text: textStopy, nalezena: true, ...dalsi };
}

export function vygenerujStopy(stav: StavKlubu, navrh: NavrhIncidentu, zdroje: ZdrojeStop, rng: Rng): NavrhStopy[] {
  // Vyšetřuje se jen otevřená krádež nebo poškození s neznámým pachatelem.
  if (navrh.status !== "otevreny" || navrh.culpritRevealed) return [];
  if (navrh.category !== "kradez" && navrh.category !== "poskozeni") return [];
  if (navrh.culpritType !== "hrac" && navrh.culpritType !== "cizi") return [];
  const misto = MISTO_INCIDENTU[navrh.kind];
  if (!misto) return [];
  const pachatel = navrh.culpritType === "hrac" ? stav.kadr.find((h) => h.id === navrh.culpritPlayerId) ?? null : null;
  if (navrh.culpritType === "hrac" && !pachatel) return [];

  const kde = MISTO_TEXT[misto];
  const stopy: NavrhStopy[] = [];

  // Kamera. Ukradené kamery nenatočí nic, zloděj je vzal jako první.
  const uroven = stav.vybaveni.area_security ?? 0;
  const stavKamer = stav.vybaveni.area_security_condition ?? 50;
  const miriNaMisto = efektyZabezpeceni(uroven, 100).cameraCoverage >= POTREBNE_POKRYTI[misto];
  if (navrh.kind !== "kradez_kamery" && miriNaMisto) {
    if (stavKamer < ZABEZPECENI_MIN_STAV) {
      stopy.push(stopa("kamera", 1, 0, text(rng, "stopa_kamera_nefunkcni", { stav: String(stavKamer) })));
    } else if (pachatel) {
      const sance = uroven >= 3 ? 0.7 + stavKamer / 333 : 0.5 + stavKamer / 200;
      stopy.push(rng.random() < sance
        ? stopa("kamera", 3, BONUS_POLICIE.kameraIdentita, text(rng, "stopa_kamera_hrac", { hrac: pachatel.jmeno, misto: kde }), { ukazujeNa: pachatel.id })
        : stopa("kamera", 1, BONUS_POLICIE.kameraBezIdentity, text(rng, "stopa_kamera_postava", { misto: kde })));
    } else {
      stopy.push(stopa("kamera", 1, BONUS_POLICIE.kameraBezIdentity, text(rng, "stopa_kamera_cizi", { misto: kde })));
    }
  }

  // Správce hřiště, jen když ho klub má.
  if (zdroje.spravceUsudek !== null && rng.random() < 0.1 + zdroje.spravceUsudek / 40) {
    stopy.push(pachatel
      ? stopa("spravce", 2, BONUS_POLICIE.svedek, text(rng, "stopa_spravce_hrac", { hrac: pachatel.jmeno, misto: kde }), { ukazujeNa: pachatel.id })
      : stopa("spravce", 2, BONUS_POLICIE.spravceCizi, text(rng, "stopa_spravce_cizi", { misto: kde })));
  }

  // Soused něco viděl jen tam, kde se v noci svítí.
  if ((stav.stadion.lighting ?? 0) >= 1 && rng.random() < 0.25) {
    if (pachatel) {
      const ostatni = rng.shuffle(stav.kadr.filter((h) => h.id !== pachatel.id)).slice(0, rng.int(1, 2));
      if (ostatni.length > 0) {
        const podezreli = rng.shuffle([pachatel, ...ostatni]);
        stopy.push(stopa("soused", 1, BONUS_POLICIE.soused,
          text(rng, "stopa_soused_hraci", { jmena: seznamJmen(podezreli.map((h) => h.jmeno)) }),
          { podezreli: podezreli.map((h) => h.id) }));
      }
    } else {
      stopy.push(stopa("soused", 1, BONUS_POLICIE.soused, text(rng, "stopa_soused_cizi")));
    }
  }

  if (!pachatel) return stopy;

  // Svědci, kamarádi a rivalové: stopu mají u sebe, manažer ji získá až výslechem (fáze 4).
  const podleId = new Map(stav.kadr.map((h) => [h.id, h]));
  for (const id of stav.hospodaVcera) {
    const svedek = podleId.get(id);
    if (!svedek || svedek.id === pachatel.id) continue;
    if (rng.random() >= 0.3) continue;
    stopy.push(stopa("svedek", 2, BONUS_POLICIE.svedek,
      text(rng, "stopa_svedek", { svedek: svedek.jmeno, hrac: pachatel.jmeno, misto: kde }),
      { ukazujeNa: pachatel.id, drzitel: svedek.id, nalezena: false }));
  }
  for (const v of zdroje.vztahyPachatele) {
    const hrac = podleId.get(v.hracId);
    if (!hrac || hrac.id === pachatel.id) continue;
    if ((KAMARADSKE_VZTAHY as readonly string[]).includes(v.typ) && v.sila >= SILA_KAMARADSTVI) {
      stopy.push(stopa("kamarad", 2, BONUS_POLICIE.svedek,
        text(rng, "stopa_kamarad", { svedek: hrac.jmeno, hrac: pachatel.jmeno }),
        { ukazujeNa: pachatel.id, drzitel: hrac.id, nalezena: false }));
    } else if (v.typ === "rivals" && rng.random() < 0.4) {
      stopy.push(stopa("rival", 2, BONUS_POLICIE.svedek,
        text(rng, "stopa_rival", { svedek: hrac.jmeno, hrac: pachatel.jmeno }),
        { ukazujeNa: pachatel.id, drzitel: hrac.id, nalezena: false }));
    }
  }
  return stopy;
}

/** Nalezená usvědčující stopa odhalí pachatele hned (spec 5b). */
export function odhalujePachatele(stopy: readonly NavrhStopy[]): boolean {
  return stopy.some((s) => s.nalezena && s.sila === 3 && s.ukazujeNa !== null);
}
```

- [ ] **Step 5: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS (včetně `texty.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/incidents/stopy.ts apps/api/src/incidents/stopy.test.ts apps/api/src/incidents/texty.ts
git commit -F - <<'EOF'
feat(incidenty): stopy jen ze zdroju, ktere klub ma

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Stopy při vzniku incidentu a admin force s hráčem

**Files:**
- Create: `apps/api/src/incidents/testovaci-d1.ts`, `apps/api/src/incidents/stopy-db.ts`, `apps/api/src/incidents/stopy-db.test.ts`, `apps/api/src/incidents/dopady.test.ts`
- Modify: `apps/api/src/incidents/dopady.ts`, `apps/api/src/incidents/denni-krok.ts`, `apps/api/src/routes/incidents.ts`

**Interfaces:**
- Consumes: `vygenerujStopy`, `odhalujePachatele`, `ZdrojeStop` (stopy.ts); `NavrhStopy`, `Stopa`, `ZdrojStopy` (typy.ts).
- Produces:
  - `testovaci-d1.ts`: `export interface Pravidlo { sql: RegExp; first?: unknown; all?: unknown[]; changes?: number }`, `export class FalesnaD1 { dotazy; davky; pocet(re) }`, `export function jakoD1(db: FalesnaD1): D1Database`
  - `stopy-db.ts`: `export function prikazyStop(db: D1Database, teamId: string, incidentId: string, stopy: readonly NavrhStopy[], gameDate: string): D1PreparedStatement[]`, `export function stopaZRadku(r: Record<string, unknown>): Stopa`, `export async function nactiStopy(db: D1Database, incidentId: string): Promise<Stopa[]>`, `export async function nactiZdrojeStop(db: D1Database, teamId: string, pachatelId: string | null): Promise<ZdrojeStop>`
  - `dopady.ts`: `export interface ZapsanyIncident { id: string; nalezeneStopy: string[]; odhalen: boolean }`; `zapisIncident(...)` vrací `Promise<ZapsanyIncident | null>`; `oznamIncident(env, teamId, navrh, zapsany: ZapsanyIncident)`
  - admin `POST /api/admin/incidents/force` přijme volitelné `playerId`

- [ ] **Step 1: Falešná D1 pro testy**

`apps/api/src/incidents/testovaci-d1.ts`:

```ts
/**
 * Falešná D1 pro testy incidentů. Mimo testy se nepoužívá.
 *
 * Pravidla se hledají podle SQL, první shoda vyhrává. Bez shody vrací
 * `first` null, `all` prázdné pole a `run` jednu změněnou řádku.
 */

export interface Pravidlo {
  sql: RegExp;
  first?: unknown;
  all?: unknown[];
  changes?: number;
}

export interface ZaznamDotazu {
  sql: string;
  params: unknown[];
}

class FalesnyDotaz {
  constructor(private readonly db: FalesnaD1, readonly sql: string, readonly params: unknown[]) {}

  bind(...params: unknown[]): FalesnyDotaz {
    return new FalesnyDotaz(this.db, this.sql, params);
  }

  private zaznam(): Pravidlo | undefined {
    this.db.dotazy.push({ sql: this.sql, params: this.params });
    return this.db.pravidlo(this.sql);
  }

  async first<T>(): Promise<T | null> {
    return (this.zaznam()?.first ?? null) as T | null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: (this.zaznam()?.all ?? []) as T[] };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    return { meta: { changes: this.zaznam()?.changes ?? 1 } };
  }
}

export class FalesnaD1 {
  /** Jednotlivě spuštěné dotazy. */
  dotazy: ZaznamDotazu[] = [];
  /** Dávky `db.batch`, každá jako seznam dotazů. */
  davky: ZaznamDotazu[][] = [];

  constructor(public pravidla: Pravidlo[] = []) {}

  prepare(sql: string): FalesnyDotaz {
    return new FalesnyDotaz(this, sql, []);
  }

  pravidlo(sql: string): Pravidlo | undefined {
    return this.pravidla.find((p) => p.sql.test(sql));
  }

  async batch(dotazy: FalesnyDotaz[]): Promise<Array<{ results: unknown[]; meta: { changes: number } }>> {
    this.davky.push(dotazy.map((d) => ({ sql: d.sql, params: d.params })));
    return dotazy.map((d) => ({ results: this.pravidlo(d.sql)?.all ?? [], meta: { changes: this.pravidlo(d.sql)?.changes ?? 1 } }));
  }

  /** Kolikrát padl dotaz odpovídající výrazu, jednotlivě i v dávkách. */
  pocet(re: RegExp): number {
    return [...this.dotazy, ...this.davky.flat()].filter((d) => re.test(d.sql)).length;
  }
}

export function jakoD1(db: FalesnaD1): D1Database {
  return db as unknown as D1Database;
}
```

- [ ] **Step 2: Failing testy zápisu stop**

`apps/api/src/incidents/stopy-db.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nactiZdrojeStop, prikazyStop, stopaZRadku } from "./stopy-db";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";
import type { NavrhStopy } from "./typy";

const SVEDEK: NavrhStopy = {
  zdroj: "svedek", ukazujeNa: "p", podezreli: null, drzitel: "a", sila: 2, bonusPolicie: 0.1, text: "Adam viděl Pepu.", nalezena: false,
};
const DNES = "2026-09-16T16:00:00.000Z";

describe("zápis stop", () => {
  it("id čísluje v rámci zdroje a nalezenou stopu datuje", async () => {
    const db = new FalesnaD1();
    const kamera: NavrhStopy = { ...SVEDEK, zdroj: "kamera", ukazujeNa: null, drzitel: null, podezreli: ["p", "a"], nalezena: true };
    await jakoD1(db).batch(prikazyStop(jakoD1(db), "tym-a", "inc-1", [SVEDEK, { ...SVEDEK, drzitel: "b" }, kamera], DNES));
    const [prvni, druhy, treti] = db.davky[0];
    expect(prvni.sql).toMatch(/INSERT OR IGNORE INTO club_incident_clues/);
    expect(prvni.params).toEqual(["inc-1-svedek-1", "inc-1", "tym-a", "svedek", "p", null, "a", 2, 0.1, "Adam viděl Pepu.", 0, null]);
    expect(druhy.params[0]).toBe("inc-1-svedek-2");
    expect(treti.params[0]).toBe("inc-1-kamera-1");
    expect(treti.params[5]).toBe('["p","a"]');
    expect(treti.params.slice(-2)).toEqual([1, DNES]);
  });

  it("řádek z DB převede zpátky a rozbitý seznam podezřelých zahodí", () => {
    const radek = {
      id: "inc-1-soused-1", source: "soused", points_to_player_id: null, suspects: '["p","a"]',
      holder_player_id: null, strength: 1, police_bonus: 0.15, text: "Soused.", found: 1,
    };
    expect(stopaZRadku(radek)).toEqual({
      id: "inc-1-soused-1", zdroj: "soused", ukazujeNa: null, podezreli: ["p", "a"], drzitel: null,
      sila: 1, bonusPolicie: 0.15, text: "Soused.", nalezena: true,
    });
    expect(stopaZRadku({ ...radek, suspects: "{rozbite" }).podezreli).toBeNull();
  });
});

describe("zdroje stop", () => {
  it("správce podle úsudku a vztahy pachatele z obou stran", async () => {
    const db = new FalesnaD1([
      { sql: /FROM staff_members/, first: { usudek: 12 } },
      { sql: /FROM relationships/, all: [
        { player_a_id: "p", player_b_id: "a", type: "brothers", strength: 70 },
        { player_a_id: "b", player_b_id: "p", type: "rivals", strength: 40 },
      ] },
    ]);
    expect(await nactiZdrojeStop(jakoD1(db), "tym-a", "p")).toEqual({
      spravceUsudek: 12,
      vztahyPachatele: [{ hracId: "a", typ: "brothers", sila: 70 }, { hracId: "b", typ: "rivals", sila: 40 }],
    });
  });

  it("bez pachatele z kádru se vztahy nenačítají, bez správce je úsudek null", async () => {
    const db = new FalesnaD1([{ sql: /FROM staff_members/, first: { usudek: null } }]);
    expect(await nactiZdrojeStop(jakoD1(db), "tym-a", null)).toEqual({ spravceUsudek: null, vztahyPachatele: [] });
    expect(db.pocet(/FROM relationships/)).toBe(0);
  });
});
```

`apps/api/src/incidents/dopady.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { zapisIncident } from "./dopady";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";
import { PROBLEMOVY, stavKlubu } from "./testovaci-stav";
import type { NavrhIncidentu } from "./typy";

const NAVRH: NavrhIncidentu = {
  kind: "vloupani_sklad", category: "kradez", status: "otevreny", severity: 1,
  culpritType: "hrac", culpritPlayerId: "p", culpritRevealed: false,
  ztraty: [{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }],
  text: "Ze skladu zmizelo vybavení: Dresy.",
};

describe("zápis incidentu", () => {
  it("opakovaný den (incident už existuje) nezapíše škodu ani stopy", async () => {
    const db = new FalesnaD1([{ sql: /INSERT OR IGNORE INTO club_incidents/, changes: 0 }]);
    const stav = stavKlubu({ kadr: [PROBLEMOVY], vybaveni: { jerseys: 2, jerseys_condition: 70, area_security: 3, area_security_condition: 100 } });
    expect(await zapisIncident(jakoD1(db), stav, NAVRH)).toBeNull();
    expect(db.pocet(/club_incident_clues/)).toBe(0);
    expect(db.pocet(/UPDATE equipment/)).toBe(0);
  });

  it("kamera natočí hráče: stopa se zapíše a pachatel je hned známý", async () => {
    const db = new FalesnaD1([{ sql: /FROM staff_members/, first: { usudek: null } }]);
    const stav = stavKlubu({ kadr: [PROBLEMOVY], vybaveni: { jerseys: 2, jerseys_condition: 70, area_security: 3, area_security_condition: 100 } });
    // Úroveň 3 se stavem 100: šance 0,7 + 100/333 > 1, kamera ho natočí vždy.
    const zapsany = await zapisIncident(jakoD1(db), stav, NAVRH, "inc-test");
    expect(zapsany?.id).toBe("inc-test");
    expect(zapsany?.odhalen).toBe(true);
    expect(zapsany?.nalezeneStopy.length).toBeGreaterThan(0);
    const davka = db.davky.flat();
    expect(davka.some((d) => /UPDATE club_incidents SET loss = \?, culprit_revealed = \?/.test(d.sql) && d.params[1] === 1)).toBe(true);
    expect(davka.some((d) => /INSERT OR IGNORE INTO club_incident_clues/.test(d.sql) && d.params[3] === "kamera")).toBe(true);
  });
});
```

- [ ] **Step 3: Spusť, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/stopy-db.test.ts src/incidents/dopady.test.ts`
Expected: FAIL (`./stopy-db` neexistuje, `zapisIncident` vrací string).

- [ ] **Step 4: `stopy-db.ts`**

```ts
/** Zápis a čtení stop (`club_incident_clues`) a zdroje stop z DB (spec 5b). */

import { logger } from "../lib/logger";
import type { ZdrojeStop } from "./stopy";
import type { NavrhStopy, Stopa, ZdrojStopy } from "./typy";

const M = "incidents-stopy";

/**
 * Příkazy pro `db.batch`. Id `{incidentId}-{zdroj}-{n}`, `n` od 1 v rámci zdroje.
 * `INSERT OR IGNORE`: opakované zpracování dne stopy nezdvojí.
 */
export function prikazyStop(
  db: D1Database, teamId: string, incidentId: string, stopy: readonly NavrhStopy[], gameDate: string,
): D1PreparedStatement[] {
  const poradi: Record<string, number> = {};
  return stopy.map((s) => {
    poradi[s.zdroj] = (poradi[s.zdroj] ?? 0) + 1;
    return db.prepare(
      `INSERT OR IGNORE INTO club_incident_clues
         (id, incident_id, team_id, source, points_to_player_id, suspects, holder_player_id, strength, police_bonus, text, found, found_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `${incidentId}-${s.zdroj}-${poradi[s.zdroj]}`, incidentId, teamId, s.zdroj, s.ukazujeNa,
      s.podezreli ? JSON.stringify(s.podezreli) : null, s.drzitel, s.sila, s.bonusPolicie, s.text,
      s.nalezena ? 1 : 0, s.nalezena ? gameDate : null,
    );
  });
}

function seznamHracu(raw: unknown): string[] | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.map(String) : null;
  } catch (e) {
    logger.warn({ module: M }, "nečitelný seznam podezřelých", e);
    return null;
  }
}

export function stopaZRadku(r: Record<string, unknown>): Stopa {
  const sila = Number(r.strength);
  return {
    id: String(r.id),
    zdroj: String(r.source) as ZdrojStopy,
    ukazujeNa: typeof r.points_to_player_id === "string" ? r.points_to_player_id : null,
    podezreli: seznamHracu(r.suspects),
    drzitel: typeof r.holder_player_id === "string" ? r.holder_player_id : null,
    sila: sila === 3 ? 3 : sila === 2 ? 2 : 1,
    bonusPolicie: Number(r.police_bonus) || 0,
    text: String(r.text),
    nalezena: r.found === 1,
  };
}

export async function nactiStopy(db: D1Database, incidentId: string): Promise<Stopa[]> {
  const rows = await db.prepare("SELECT * FROM club_incident_clues WHERE incident_id = ? ORDER BY found_on, id")
    .bind(incidentId).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, `stopy ${incidentId}`, e); return { results: [] as Array<Record<string, unknown>> }; });
  return rows.results.map(stopaZRadku);
}

export async function nactiZdrojeStop(db: D1Database, teamId: string, pachatelId: string | null): Promise<ZdrojeStop> {
  const spravce = await db.prepare("SELECT MAX(judgement) AS usudek FROM staff_members WHERE team_id = ? AND role = 'spravce_hriste'")
    .bind(teamId).first<{ usudek: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `správce hřiště ${teamId}`, e); return null; });

  let vztahyPachatele: ZdrojeStop["vztahyPachatele"] = [];
  if (pachatelId) {
    const rows = await db.prepare("SELECT player_a_id, player_b_id, type, strength FROM relationships WHERE player_a_id = ? OR player_b_id = ?")
      .bind(pachatelId, pachatelId)
      .all<{ player_a_id: string; player_b_id: string; type: string; strength: number | null }>()
      .catch((e) => { logger.warn({ module: M }, `vztahy pachatele ${pachatelId}`, e); return { results: [] as Array<{ player_a_id: string; player_b_id: string; type: string; strength: number | null }> }; });
    vztahyPachatele = rows.results.map((r) => ({
      hracId: r.player_a_id === pachatelId ? r.player_b_id : r.player_a_id,
      typ: r.type,
      sila: r.strength ?? 50,
    }));
  }
  return { spravceUsudek: typeof spravce?.usudek === "number" ? spravce.usudek : null, vztahyPachatele };
}
```

- [ ] **Step 5: Stopy v `zapisIncident` a oznámení**

V `apps/api/src/incidents/dopady.ts`:

1. Importy přidej:

```ts
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { odhalujePachatele, vygenerujStopy } from "./stopy";
import { nactiZdrojeStop, prikazyStop } from "./stopy-db";
```

2. Nad `zapisIncident` přidej typ a uprav JSDoc a signaturu:

```ts
export interface ZapsanyIncident {
  id: string;
  /** Texty stop, které klub našel hned (kamera, správce, soused). */
  nalezeneStopy: string[];
  /** Pachatel je známý hned při vzniku (kopnuté dveře, kamera ho natočila). */
  odhalen: boolean;
}
```

```ts
/**
 * Zapíše incident, teprve potom provede škody a nakonec zapíše stopy.
 *
 * Vrací `null`, když incident už existoval (opakované zpracování dne)
 * nebo se žádná škoda nepovedla (vybavení mezitím prodáno, zařízení už na nule).
 */
export async function zapisIncident(
  db: D1Database,
  stav: StavKlubu,
  navrh: NavrhIncidentu,
  id: string = idIncidentu(stav.teamId, navrh.kind, stav.den),
): Promise<ZapsanyIncident | null> {
```

3. Řádek `if (navrh.ztraty.length === 0) return id;` nahraď:

```ts
  if (navrh.ztraty.length === 0) return { id, nalezeneStopy: [], odhalen: navrh.culpritRevealed };
```

4. Závěr funkce (od `await db.prepare("UPDATE club_incidents SET loss = ? WHERE id = ?")` po `return id;`) nahraď:

```ts
  // Stopy až po skutečné škodě. Vlastní seed: stejný incident dá vždy stejné stopy.
  const zdroje = await nactiZdrojeStop(db, stav.teamId, navrh.culpritType === "hrac" ? navrh.culpritPlayerId : null);
  const stopy = vygenerujStopy(stav, navrh, zdroje, createRng(seedFromString(`stopy|${id}`)));
  const odhalen = navrh.culpritRevealed || odhalujePachatele(stopy);
  await db.batch([
    db.prepare("UPDATE club_incidents SET loss = ?, culprit_revealed = ? WHERE id = ?").bind(JSON.stringify(provedene), odhalen ? 1 : 0, id),
    ...prikazyStop(db, stav.teamId, id, stopy, stav.gameDate),
  ]).catch((e) => logger.warn({ module: M }, `uložení škody a stop ${id}`, e));
  return { id, nalezeneStopy: stopy.filter((s) => s.nalezena).map((s) => s.text), odhalen };
```

5. V `provedZtratu`, větev `case "stadion"`, vrať i cenu:

```ts
      return d ? { ...z, urovni: d.levels, damageId: d.damageId, cena: d.cost } : null;
```

6. `oznamIncident` nahraď:

```ts
/** SMS od kustoda (s tím, co se hned zjistilo) a notifikace. Selhání oznámení incident nezvrací. */
export async function oznamIncident(env: Bindings, teamId: string, navrh: NavrhIncidentu, zapsany: ZapsanyIncident): Promise<void> {
  const def = KATALOG_PODLE_KIND.get(navrh.kind);
  const emoji = def?.emoji ?? "❗";
  await sendSystemSMS(env.DB, teamId, SMS_ROLE_KUSTOD, `${emoji} ${[navrh.text, ...zapsany.nalezeneStopy].join(" ")}`);
  await createNotification(
    env.DB, teamId, "event", `${emoji} ${def?.label ?? "Incident v klubu"}`, navrh.text.slice(0, 140),
    `/dashboard/incidenty?id=${encodeURIComponent(zapsany.id)}`, env,
  ).catch((e) => logger.warn({ module: M }, `notifikace incidentu ${navrh.kind}`, e));
}
```

- [ ] **Step 6: Volající**

V `apps/api/src/incidents/denni-krok.ts` konec funkce:

```ts
  const zapsany = await zapisIncident(env.DB, stav, navrh);
  if (!zapsany) return;
  await oznamIncident(env, teamId, navrh, zapsany);
  logger.info({ module: M, teamId }, `incident ${navrh.kind}, pachatel ${navrh.culpritType}, stop nalezeno ${zapsany.nalezeneStopy.length}`);
```

V `apps/api/src/routes/incidents.ts` v `POST /admin/incidents/force`:

```ts
  const body = await c.req.json<{ teamId?: string; kind?: string; playerId?: string }>()
```

za kontrolu `def.muze(stav)` vlož:

```ts
  // Volitelně vynutit pachatele z kádru: je jediným kandidátem s nejhorší povahou.
  let stavProLos = stav;
  if (body.playerId) {
    const hrac = stav.kadr.find((h) => h.id === body.playerId);
    if (!hrac) return c.json({ error: "Hráč není v kádru klubu" }, 400);
    stavProLos = { ...stav, kadr: [{ ...hrac, alkohol: 100, disciplina: 0, vernost: 0, vztahKTrenerovi: 0 }] };
  }
```

cyklus pokusů nahraď:

```ts
  let navrh: NavrhIncidentu | null = null;
  for (let pokus = 0; pokus < 50 && !navrh; pokus++) {
    navrh = def.vytvor(stavProLos, createRng(cryptoSeed()));
    if (navrh && body.playerId && navrh.culpritPlayerId !== body.playerId) navrh = null;
  }
  if (!navrh) return c.json({ error: "Incident se nestal ani na 50 pokusů (odradil zámek, chybí kandidát, nebo tenhle typ nemá pachatele z kádru)" }, 409);

  // Stopy se počítají se skutečným kádrem, ne s upraveným pro los.
  const zapsany = await zapisIncident(c.env.DB, stav, navrh, `inc-${team.id}-${navrh.kind}-${stav.den}-admin-${Date.now()}`);
  if (!zapsany) return c.json({ error: "Škodu se nepodařilo provést", incident: navrh }, 409);

  await oznamIncident(c.env, team.id, navrh, zapsany);
  return c.json({ ok: true, id: zapsany.id, odhalen: zapsany.odhalen, nalezeneStopy: zapsany.nalezeneStopy, incident: navrh });
```

(Smaž původní řádky `const id = await zapisIncident(...)`, `if (!id) …`, `await oznamIncident(c.env, team.id, navrh);` a `return c.json({ ok: true, id, incident: navrh });`.)

- [ ] **Step 7: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/incidents/testovaci-d1.ts apps/api/src/incidents/stopy-db.ts apps/api/src/incidents/stopy-db.test.ts apps/api/src/incidents/dopady.ts apps/api/src/incidents/dopady.test.ts apps/api/src/incidents/denni-krok.ts apps/api/src/routes/incidents.ts
git commit -F - <<'EOF'
feat(incidenty): stopy pri vzniku incidentu a admin force s hracem

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: Pravidla vyšetřování a trestů (čisté funkce)

**Files:**
- Create: `apps/api/src/incidents/vysetrovani.ts`, `vysetrovani.test.ts`, `tresty.ts`, `tresty.test.ts`

**Interfaces:**
- Consumes: `Stopa`, `HracKlubu`, `Obvineni`, `AkceTrestu`, `VysledekObvineni`, `Ztrata` (typy.ts); konstanty z nastaveni.ts; `cumulativeInvestment`, `getRepairCost` (equipment-generator.ts); `cenaOpravy(facility, urovenPred, levels)` (stadium-damage.ts).
- Produces (`vysetrovani.ts`):
  - `export type StavVysetrovani = "znamy" | "podezreli" | "neznamy"`
  - `export function stavVysetrovani(stopy: readonly Stopa[], odhalen: boolean): { stav: StavVysetrovani; podezreli: string[] }`
  - `export function stopaNaHrace(stopy: readonly Stopa[], playerId: string): boolean`
  - `export function sancePriznani(h: HracKlubu, stopaNaNej: boolean): number` (0–100)
  - `export function rozhodniObvineni(opts: { obvineny: HracKlubu; pachatelId: string | null; stopy: readonly Stopa[]; rng: Rng }): { vysledek: VysledekObvineni; vinen: boolean }`
  - `export function sancePolicie(stopy: readonly Stopa[], policistaVKadru: boolean): number`
  - `export type VysledekPolicie = "neuspech" | "podminka" | "odhalen_hrac" | "dopaden_cizi" | "nehoda"`
  - `export function vysledekPolicie(opts: { udani: boolean; pachatel: TypPachatele | null; sance: number; los: number }): VysledekPolicie`
  - `export interface IncidentProAkce { status; category; culpritType; odhalen; obvineni; policieVysledek; pachatelVKadru }`
  - `export interface DostupneAkce { obvinit: boolean; policie: boolean; tresty: AkceTrestu[] }`, `export function dostupneAkce(i: IncidentProAkce): DostupneAkce`
  - `export const AKCE_TRESTU: readonly AkceTrestu[]`
  - `export function nactiObvineni(raw: unknown): Obvineni[]`
- Produces (`tresty.ts`): `hodnotaSkody(ztraty: readonly Ztrata[]): number`, `castkaSrazky(skoda: number, tydenniMzda: number): number`, `splatkaSrazky(celkem: number, tydnuZbyva: number): number`, `castkaPokuty(skoda: number, tydenniMzda: number): number`, `jeOblibeny(vudcovstvi: number, silnychVztahu: number): boolean`

- [ ] **Step 1: Failing testy**

`apps/api/src/incidents/vysetrovani.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { hrac, PROBLEMOVY } from "./testovaci-stav";
import type { Stopa } from "./typy";
import {
  dostupneAkce, nactiObvineni, rozhodniObvineni, sancePolicie, sancePriznani, stavVysetrovani,
  stopaNaHrace, vysledekPolicie, type IncidentProAkce,
} from "./vysetrovani";

function stopa(over: Partial<Stopa> = {}): Stopa {
  return { id: "s1", zdroj: "spravce", ukazujeNa: null, podezreli: null, drzitel: null, sila: 2, bonusPolicie: 0, text: "Stopa.", nalezena: true, ...over };
}

describe("stav vyšetřování", () => {
  it("odhalený pachatel je známý", () => {
    expect(stavVysetrovani([stopa({ ukazujeNa: "p" })], true)).toEqual({ stav: "znamy", podezreli: [] });
  });

  it("nalezené stopy dají sjednocení podezřelých, nenalezené se nepočítají", () => {
    const stopy = [stopa({ ukazujeNa: "p" }), stopa({ podezreli: ["a", "p"] }), stopa({ ukazujeNa: "x", nalezena: false })];
    expect(stavVysetrovani(stopy, false)).toEqual({ stav: "podezreli", podezreli: ["a", "p"] });
  });

  it("bez nalezené stopy s identitou je pachatel neznámý", () => {
    expect(stavVysetrovani([stopa(), stopa({ ukazujeNa: "p", nalezena: false })], false)).toEqual({ stav: "neznamy", podezreli: [] });
  });

  it("stopa na hráče počítá přímé ukázání i podezřelé, ne nenalezené", () => {
    expect(stopaNaHrace([stopa({ podezreli: ["p", "a"] })], "a")).toBe(true);
    expect(stopaNaHrace([stopa({ ukazujeNa: "a", nalezena: false })], "a")).toBe(false);
  });
});

describe("obvinění", () => {
  it("šance na přiznání podle povahy, se stopou o 30 bodů vyšší, v mezích 0 až 100", () => {
    const h = hrac({ disciplina: 70, temperament: 40, vztahKTrenerovi: 60 });
    expect(sancePriznani(h, false)).toBeCloseTo(190 / 3 - 20);
    expect(sancePriznani(h, true)).toBeCloseTo(190 / 3 + 10);
    expect(sancePriznani(hrac({ disciplina: 0, temperament: 100, vztahKTrenerovi: 0 }), false)).toBe(0);
    expect(sancePriznani(hrac({ disciplina: 100, temperament: 0, vztahKTrenerovi: 100 }), true)).toBe(100);
  });

  it("nevinný vždy zapírá", () => {
    for (let s = 1; s <= 100; s++) {
      expect(rozhodniObvineni({ obvineny: hrac({ id: "a" }), pachatelId: "p", stopy: [], rng: createRng(s) }))
        .toEqual({ vysledek: "zapira", vinen: false });
    }
  });

  it("pachatel se stopou nikdy jen nezapírá, bez stopy nikdy není usvědčen", () => {
    const seStopou = [stopa({ ukazujeNa: "p" })];
    for (let s = 1; s <= 200; s++) {
      expect(rozhodniObvineni({ obvineny: PROBLEMOVY, pachatelId: "p", stopy: seStopou, rng: createRng(s) }).vysledek).not.toBe("zapira");
      expect(rozhodniObvineni({ obvineny: PROBLEMOVY, pachatelId: "p", stopy: [], rng: createRng(s) }).vysledek).not.toBe("usvedcen");
    }
  });

  it("u cizího pachatele je každý obviněný nevinný", () => {
    expect(rozhodniObvineni({ obvineny: PROBLEMOVY, pachatelId: null, stopy: [], rng: createRng(1) }).vinen).toBe(false);
  });

  it("rozbitý JSON obvinění dá prázdný seznam", () => {
    expect(nactiObvineni("{x")).toEqual([]);
    expect(nactiObvineni('[{"playerId":"a","jmeno":"Adam Kos","den":"2026-09-16","vysledek":"zapira"}]')).toHaveLength(1);
  });
});

describe("policie", () => {
  it("šance: základ, jen nalezené stopy, policista, strop", () => {
    expect(sancePolicie([], false)).toBeCloseTo(0.15);
    expect(sancePolicie([stopa({ bonusPolicie: 0.35 }), stopa({ bonusPolicie: 0.15, nalezena: false })], false)).toBeCloseTo(0.5);
    expect(sancePolicie([], true)).toBeCloseTo(0.25);
    expect(sancePolicie([stopa({ bonusPolicie: 0.35 }), stopa({ bonusPolicie: 0.35 }), stopa({ bonusPolicie: 0.35 })], true)).toBeCloseTo(0.9);
  });

  it("výsledek podle udání, losu a pachatele", () => {
    expect(vysledekPolicie({ udani: true, pachatel: "hrac", sance: 0, los: 0.99 })).toBe("podminka");
    expect(vysledekPolicie({ udani: false, pachatel: "hrac", sance: 0.3, los: 0.3 })).toBe("neuspech");
    expect(vysledekPolicie({ udani: false, pachatel: "hrac", sance: 0.3, los: 0.29 })).toBe("odhalen_hrac");
    expect(vysledekPolicie({ udani: false, pachatel: "cizi", sance: 0.3, los: 0.1 })).toBe("dopaden_cizi");
    expect(vysledekPolicie({ udani: false, pachatel: "nikdo", sance: 0.3, los: 0.1 })).toBe("nehoda");
    expect(vysledekPolicie({ udani: false, pachatel: "zamestnanec", sance: 0.3, los: 0.1 })).toBe("neuspech");
  });
});

describe("dostupné akce", () => {
  const zaklad: IncidentProAkce = {
    status: "otevreny", category: "kradez", culpritType: "hrac", odhalen: false,
    obvineni: 0, policieVysledek: null, pachatelVKadru: true,
  };
  const nic = { obvinit: false, policie: false, tresty: [] };

  it("neodhalený incident: obvinit a policie, tresty ne", () => {
    expect(dostupneAkce(zaklad)).toEqual({ obvinit: true, policie: true, tresty: [] });
  });

  it("dvě obvinění a jedno šetření policie stačí", () => {
    expect(dostupneAkce({ ...zaklad, obvineni: 2 }).obvinit).toBe(false);
    expect(dostupneAkce({ ...zaklad, policieVysledek: 0 }).policie).toBe(false);
  });

  it("odhalený pachatel v kádru: tresty, předat policii jen když ještě nešetřila", () => {
    expect(dostupneAkce({ ...zaklad, odhalen: true })).toEqual({
      obvinit: false, policie: false, tresty: ["odpustit", "srazka", "pokuta", "vyhodit", "policie", "nechat_byt"],
    });
    expect(dostupneAkce({ ...zaklad, odhalen: true, policieVysledek: 1 }).tresty).not.toContain("policie");
  });

  it("pachatel mimo kádr, šetření policie, uzavřený incident a životní situace nedovolí nic", () => {
    expect(dostupneAkce({ ...zaklad, odhalen: true, pachatelVKadru: false })).toEqual(nic);
    expect(dostupneAkce({ ...zaklad, status: "policie" })).toEqual(nic);
    expect(dostupneAkce({ ...zaklad, status: "uzavreny" })).toEqual(nic);
    expect(dostupneAkce({ ...zaklad, category: "zivotni" })).toEqual(nic);
  });
});
```

`apps/api/src/incidents/tresty.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cumulativeInvestment, getRepairCost } from "../equipment/equipment-generator";
import { castkaPokuty, castkaSrazky, hodnotaSkody, jeOblibeny, splatkaSrazky } from "./tresty";

describe("hodnota škody", () => {
  it("vybavení: cena ztracených úrovní", () => {
    expect(hodnotaSkody([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }]))
      .toBe(cumulativeInvestment("jerseys", 2));
    expect(hodnotaSkody([{ typ: "vybaveni", kategorie: "trophy_case", uroven: 3, stav: 70, urovniDolu: 1 }]))
      .toBe(cumulativeInvestment("trophy_case", 3) - cumulativeInvestment("trophy_case", 2));
  });

  it("opotřebení, zařízení stadionu a trávník", () => {
    expect(hodnotaSkody([{ typ: "vybaveni_stav", kategorie: "team_van", stavPred: 80, stavPo: 35 }])).toBe(getRepairCost("team_van", 1, 55));
    expect(hodnotaSkody([{ typ: "stadion", zarizeni: "fence", urovni: 1, cena: 17_500 }])).toBe(17_500);
    expect(hodnotaSkody([{ typ: "travnik", pred: 70, po: 58 }])).toBe(1_800);
  });

  it("více ztrát se sečte, prázdná škoda je nula", () => {
    expect(hodnotaSkody([])).toBe(0);
    expect(hodnotaSkody([{ typ: "travnik", pred: 70, po: 60 }, { typ: "stadion", zarizeni: "refreshments", urovni: 1, cena: 1_000 }])).toBe(2_500);
  });
});

describe("srážka, pokuta, oblíbenost", () => {
  it("srážka je nejvýš škoda a čtyři mzdy, splátky dají přesně celek", () => {
    expect(castkaSrazky(10_000, 109)).toBe(436);
    expect(castkaSrazky(300, 109)).toBe(300);
    const splatky = [4, 3, 2, 1].map((zbyva) => splatkaSrazky(437, zbyva));
    expect(splatky).toEqual([109, 109, 109, 110]);
    expect(splatky.reduce((a, b) => a + b, 0)).toBe(437);
    expect(splatkaSrazky(437, 0)).toBe(0);
  });

  it("pokuta je nejvýš škoda, dvě mzdy a 5 000 Kč", () => {
    expect(castkaPokuty(10_000, 100)).toBe(200);
    expect(castkaPokuty(150, 100)).toBe(150);
    expect(castkaPokuty(100_000, 4_000)).toBe(5_000);
    expect(castkaPokuty(0, 100)).toBe(0);
  });

  it("oblíbený je vůdce nebo hráč se dvěma silnými vztahy", () => {
    expect(jeOblibeny(65, 0)).toBe(true);
    expect(jeOblibeny(30, 2)).toBe(true);
    expect(jeOblibeny(64, 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Spusť, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/vysetrovani.test.ts src/incidents/tresty.test.ts`
Expected: FAIL (moduly neexistují).

- [ ] **Step 3: `vysetrovani.ts`**

```ts
/**
 * Pravidla vyšetřování (spec Část 5b, 7a–7d). Čisté funkce bez DB.
 */

import type { Rng } from "../generators/rng";
import { logger } from "../lib/logger";
import { MAX_OBVINENI, POLICIE_POLICISTA, POLICIE_STROP, POLICIE_ZAKLAD } from "./nastaveni";
import type {
  AkceTrestu, HracKlubu, KategorieIncidentu, Obvineni, StavIncidentu, Stopa, TypPachatele, VysledekObvineni,
} from "./typy";

export type StavVysetrovani = "znamy" | "podezreli" | "neznamy";

export const AKCE_TRESTU: readonly AkceTrestu[] = ["odpustit", "srazka", "pokuta", "vyhodit", "policie", "nechat_byt"];

/** Co manažer ví (spec 5b): známý pachatel, podezřelí z nalezených stop, nebo nic. */
export function stavVysetrovani(stopy: readonly Stopa[], odhalen: boolean): { stav: StavVysetrovani; podezreli: string[] } {
  if (odhalen) return { stav: "znamy", podezreli: [] };
  const podezreli = new Set<string>();
  for (const s of stopy) {
    if (!s.nalezena) continue;
    if (s.ukazujeNa) podezreli.add(s.ukazujeNa);
    for (const id of s.podezreli ?? []) podezreli.add(id);
  }
  return podezreli.size > 0
    ? { stav: "podezreli", podezreli: [...podezreli].sort() }
    : { stav: "neznamy", podezreli: [] };
}

/** Ukazuje na hráče některá nalezená stopa, přímo nebo mezi podezřelými? */
export function stopaNaHrace(stopy: readonly Stopa[], playerId: string): boolean {
  return stopy.some((s) => s.nalezena && (s.ukazujeNa === playerId || (s.podezreli ?? []).includes(playerId)));
}

/** Šance v procentech, že se pachatel přizná (spec 7a). */
export function sancePriznani(h: HracKlubu, stopaNaNej: boolean): number {
  const sance = (h.disciplina + (100 - h.temperament) + h.vztahKTrenerovi) / 3 - 20 + (stopaNaNej ? 30 : 0);
  return Math.max(0, Math.min(100, sance));
}

/**
 * Výsledek obvinění (spec 7b). Nevinný vždy zapírá. Pachatele se stopou buď
 * přizná, nebo ho stopy usvědčí; bez stopy se přizná, nebo zapírá.
 */
export function rozhodniObvineni(opts: {
  obvineny: HracKlubu; pachatelId: string | null; stopy: readonly Stopa[]; rng: Rng;
}): { vysledek: VysledekObvineni; vinen: boolean } {
  if (opts.pachatelId !== opts.obvineny.id) return { vysledek: "zapira", vinen: false };
  const stopa = stopaNaHrace(opts.stopy, opts.obvineny.id);
  if (opts.rng.random() * 100 < sancePriznani(opts.obvineny, stopa)) return { vysledek: "priznal", vinen: true };
  return { vysledek: stopa ? "usvedcen" : "zapira", vinen: true };
}

/** Šance policie (spec 7c): základ, nalezené stopy a policista v kádru, se stropem. */
export function sancePolicie(stopy: readonly Stopa[], policistaVKadru: boolean): number {
  const zeStop = stopy.reduce((soucet, s) => soucet + (s.nalezena ? s.bonusPolicie : 0), 0);
  return Math.min(POLICIE_STROP, POLICIE_ZAKLAD + zeStop + (policistaVKadru ? POLICIE_POLICISTA : 0));
}

export type VysledekPolicie = "neuspech" | "podminka" | "odhalen_hrac" | "dopaden_cizi" | "nehoda";

/**
 * Co policie zjistila. `los` je první číslo z `createRng(seedFromString("policie|" + id))`.
 * Udání odhaleného hráče uspěje vždy. Zaměstnance jako pachatele ve fázi 2 policie nedopadne.
 */
export function vysledekPolicie(opts: { udani: boolean; pachatel: TypPachatele | null; sance: number; los: number }): VysledekPolicie {
  if (opts.udani) return "podminka";
  if (opts.los >= opts.sance) return "neuspech";
  if (opts.pachatel === "hrac") return "odhalen_hrac";
  if (opts.pachatel === "cizi") return "dopaden_cizi";
  if (opts.pachatel === "nikdo") return "nehoda";
  return "neuspech";
}

export interface IncidentProAkce {
  status: StavIncidentu;
  category: KategorieIncidentu;
  culpritType: TypPachatele | null;
  odhalen: boolean;
  obvineni: number;
  /** `police_success`: `null` = policie ještě nešetřila. */
  policieVysledek: number | null;
  /** Odhalený pachatel je pořád v aktivním kádru klubu. */
  pachatelVKadru: boolean;
}

export interface DostupneAkce {
  obvinit: boolean;
  policie: boolean;
  tresty: AkceTrestu[];
}

export function dostupneAkce(i: IncidentProAkce): DostupneAkce {
  const resitelny = i.status === "otevreny" && (i.category === "kradez" || i.category === "poskozeni");
  const trestat = resitelny && i.odhalen && i.culpritType === "hrac" && i.pachatelVKadru;
  return {
    obvinit: resitelny && !i.odhalen && i.obvineni < MAX_OBVINENI,
    policie: resitelny && !i.odhalen && i.policieVysledek === null,
    tresty: trestat ? AKCE_TRESTU.filter((a) => a !== "policie" || i.policieVysledek === null) : [],
  };
}

export function nactiObvineni(raw: unknown): Obvineni[] {
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as Obvineni[]) : [];
  } catch (e) {
    logger.warn({ module: "incidents-vysetrovani" }, "nečitelný JSON obvinění", e);
    return [];
  }
}
```

- [ ] **Step 4: `tresty.ts`**

```ts
/**
 * Kolik co stojí: hodnota škody, srážka ze mzdy, pokuta (spec 7d). Čisté funkce.
 */

import { cumulativeInvestment, getRepairCost } from "../equipment/equipment-generator";
import { cenaOpravy } from "../stadium/stadium-damage";
import {
  CENA_BODU_TRAVNIKU, OBLIBENY_POCET_VZTAHU, OBLIBENY_VUDCOVSTVI, POKUTA_STROP_KC, SRAZKA_TYDNU,
} from "./nastaveni";
import type { Ztrata } from "./typy";

/** Hodnota škody v Kč: u vybavení cena ztracených úrovní, u zařízení a opotřebení cena opravy. */
export function hodnotaSkody(ztraty: readonly Ztrata[]): number {
  let soucet = 0;
  for (const z of ztraty) {
    switch (z.typ) {
      case "vybaveni":
        soucet += cumulativeInvestment(z.kategorie, z.uroven)
          - cumulativeInvestment(z.kategorie, Math.max(0, z.uroven - z.urovniDolu));
        break;
      case "vybaveni_stav":
        // Úroveň se u opotřebení neukládá, počítá se s opravou první úrovně.
        soucet += getRepairCost(z.kategorie, 1, 100 - Math.max(0, z.stavPred - z.stavPo));
        break;
      case "stadion":
        soucet += z.cena ?? cenaOpravy(z.zarizeni, z.urovni, z.urovni);
        break;
      case "travnik":
        soucet += Math.max(0, z.pred - z.po) * CENA_BODU_TRAVNIKU;
        break;
    }
  }
  return Math.max(0, Math.round(soucet));
}

/** Celková srážka ze mzdy: nejvýš škoda a nejvýš čtyři týdenní mzdy. */
export function castkaSrazky(skoda: number, tydenniMzda: number): number {
  return Math.max(0, Math.round(Math.min(skoda, SRAZKA_TYDNU * tydenniMzda)));
}

/** Splátka v týdnu, kdy zbývá `tydnuZbyva` srážek. Poslední doplatí zaokrouhlení. */
export function splatkaSrazky(celkem: number, tydnuZbyva: number): number {
  if (tydnuZbyva <= 0) return 0;
  const tydne = Math.floor(celkem / SRAZKA_TYDNU);
  return tydnuZbyva === 1 ? celkem - tydne * (SRAZKA_TYDNU - 1) : tydne;
}

/** Jednorázová pokuta: nejvýš škoda, dvě týdenní mzdy a 5 000 Kč. */
export function castkaPokuty(skoda: number, tydenniMzda: number): number {
  return Math.max(0, Math.round(Math.min(skoda, 2 * tydenniMzda, POKUTA_STROP_KC)));
}

/** Oblíbený hráč (spec 7c): vůdce kabiny, nebo aspoň dva silné vztahy. */
export function jeOblibeny(vudcovstvi: number, silnychVztahu: number): boolean {
  return vudcovstvi >= OBLIBENY_VUDCOVSTVI || silnychVztahu >= OBLIBENY_POCET_VZTAHU;
}
```

- [ ] **Step 5: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/incidents/vysetrovani.ts apps/api/src/incidents/vysetrovani.test.ts apps/api/src/incidents/tresty.ts apps/api/src/incidents/tresty.test.ts
git commit -F - <<'EOF'
feat(incidenty): pravidla vysetrovani, policie a trestu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: Obvinění a zavolání policie

**Files:**
- Create: `apps/api/src/incidents/incident-db.ts`, `hraci.ts`, `hraci.test.ts`, `akce.ts`, `akce-obvineni.test.ts`
- Modify: `apps/api/src/incidents/katalog.ts`, `texty.ts`, `testovaci-stav.ts`

**Interfaces:**
- Consumes: `hracZRadku`, `SLOUPCE_HRACE` (stav-klubu.ts); `nactiStopy`, `prikazyStop` (stopy-db.ts); `dostupneAkce`, `rozhodniObvineni`, `nactiObvineni`, `IncidentProAkce` (vysetrovani.ts); `sendPlayerSMS(db, teamId, {id, firstName, lastName}, body)`, `sendSystemSMS(db, teamId, role, body)` (messaging/system-sms.ts); `gameExpiry(gameDate, days)` (lib/game-time.ts).
- Produces:
  - `katalog.ts`: `export function nazevIncidentu(kind: string): string`
  - `incident-db.ts`: `export interface IncidentRadek`, `export const SLOUPCE_INCIDENTU`, `nactiIncident(db, teamId, incidentId): Promise<IncidentRadek | null>`, `herniDatum(db, teamId): Promise<string | null>`, `export interface HracKadru extends HracKlubu { krestni: string; prijmeni: string; mzda: number; silnychVztahu: number }`, `nactiHraceKadru(db, teamId, playerId): Promise<HracKadru | null>`, `proAkce(r, pachatelVKadru): IncidentProAkce`
  - `hraci.ts`: `posunHrace(db, teamId, playerId, { morale?, vztah? })`, `posunKadru(db, teamId, delta, krome?, kromeKamaraduHrace?)`, `posunKamaradu(db, teamId, playerId, delta)`, vše `D1PreparedStatement`
  - `akce.ts`: `export type VysledekAkce<T extends object = object> = ({ ok: true } & T) | { ok: false; kod: 400 | 404 | 409 | 500; chyba: string }`, `obvinHrace(env, teamId, incidentId, playerId): Promise<VysledekAkce<{ vysledek: VysledekObvineni; odhalen: boolean }>>`, `zavolejPolicii(env, teamId, incidentId): Promise<VysledekAkce<{ vysledekOn: string }>>`
  - `testovaci-stav.ts`: `incidentRadek(over?)`, `hracRadek(id, jmeno, prijmeni, over?)`

- [ ] **Step 1: Texty a název incidentu**

V `apps/api/src/incidents/texty.ts` přidej do `TEXTY` (před `lhuta_kradez`):

```ts
  znalost_obvineny: [
    "Trenér tě neprávem obvinil: {nazev}. Nebyl jsi to ty.",
  ],
  obvineni_priznani: [
    "Trenére, máte pravdu. Byl jsem to já a stydím se za to.",
    "No jo, byl jsem to já. Nevím, co mě to popadlo.",
    "Omlouvám se, trenére. Udělal jsem to já.",
  ],
  obvineni_usvedcen: [
    "Myslete si, co chcete, trenére. Nic vám k tomu neřeknu.",
    "Na tohle vám nemám co říct.",
    "Dělejte si, co uznáte za vhodné.",
  ],
  obvineni_zapira: [
    "Já? S tím nemám nic společného, trenére.",
    "To myslíte vážně? Já nic neudělal.",
    "Tohle jsem nebyl já. Hledejte jinde.",
  ],
  stopa_priznani: [
    "{hrac} se trenérovi přiznal.",
    "{hrac} po obvinění všechno přiznal.",
    "{hrac} přiznal, že to byl on.",
  ],
  stopa_usvedcen: [
    "{hrac} zapíral, ale proti stopám neměl šanci.",
    "{hrac} se vykrucoval, jenže stopy mluví jasně.",
    "{hrac} nechtěl nic přiznat, stopy ho ale usvědčily.",
  ],
  policie_prijato: [
    "Přijali jsme oznámení: {nazev}. Výsledek šetření vám dáme vědět do týdne.",
    "Oznámení je zapsané: {nazev}. Do týdne se ozveme s výsledkem.",
    "Případ jsme převzali: {nazev}. Výsledek šetření oznámíme do týdne.",
  ],
```

Na konec `apps/api/src/incidents/katalog.ts` přidej:

```ts
/** Název typu incidentu pro texty a SMS. */
export function nazevIncidentu(kind: string): string {
  return KATALOG_PODLE_KIND.get(kind)?.label ?? "Incident v klubu";
}
```

- [ ] **Step 2: `incident-db.ts`**

```ts
/** Načtení incidentu, herního data a hráče kádru pro akce manažera a denní vyšetřování. */

import { logger } from "../lib/logger";
import { OBLIBENY_SILA_VZTAHU } from "./nastaveni";
import { hracZRadku, SLOUPCE_HRACE } from "./stav-klubu";
import type { HracKlubu, KategorieIncidentu, StavIncidentu, TypPachatele } from "./typy";
import type { IncidentProAkce } from "./vysetrovani";

const M = "incidents-db";

export interface IncidentRadek {
  id: string;
  team_id: string;
  season_number: number;
  kind: string;
  category: KategorieIncidentu;
  status: StavIncidentu;
  severity: number;
  game_date: string;
  deadline: string | null;
  culprit_type: TypPachatele | null;
  culprit_player_id: string | null;
  culprit_revealed: number;
  loss: string;
  accusations: number;
  accused: string;
  police_result_on: string | null;
  police_success: number | null;
  resolution: string | null;
  resolution_data: string | null;
  text: string;
  resolved_on: string | null;
}

export const SLOUPCE_INCIDENTU = [
  "id", "team_id", "season_number", "kind", "category", "status", "severity", "game_date", "deadline",
  "culprit_type", "culprit_player_id", "culprit_revealed", "loss", "accusations", "accused",
  "police_result_on", "police_success", "resolution", "resolution_data", "text", "resolved_on",
] as const;

export async function nactiIncident(db: D1Database, teamId: string, incidentId: string): Promise<IncidentRadek | null> {
  return db.prepare(`SELECT ${SLOUPCE_INCIDENTU.join(", ")} FROM club_incidents WHERE id = ? AND team_id = ?`)
    .bind(incidentId, teamId).first<IncidentRadek>()
    .catch((e) => { logger.warn({ module: M }, `incident ${incidentId}`, e); return null; });
}

export async function herniDatum(db: D1Database, teamId: string): Promise<string | null> {
  const r = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `herní datum ${teamId}`, e); return null; });
  return r?.game_date ?? null;
}

export interface HracKadru extends HracKlubu {
  krestni: string;
  prijmeni: string;
  /** Týdenní mzda v Kč. */
  mzda: number;
  /** Nerivalské vztahy se silou aspoň `OBLIBENY_SILA_VZTAHU`. */
  silnychVztahu: number;
}

/** Aktivní hráč klubu, nebo `null`, když v kádru není (prodaný, vyhozený, cizí). */
export async function nactiHraceKadru(db: D1Database, teamId: string, playerId: string): Promise<HracKadru | null> {
  const r = await db.prepare(
    `SELECT ${SLOUPCE_HRACE}, weekly_wage FROM players WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')`,
  ).bind(playerId, teamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, `hráč ${playerId}`, e); return null; });
  if (!r) return null;
  const vztahy = await db.prepare(
    "SELECT COUNT(*) AS n FROM relationships WHERE (player_a_id = ? OR player_b_id = ?) AND type != 'rivals' AND strength >= ?",
  ).bind(playerId, playerId, OBLIBENY_SILA_VZTAHU).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `vztahy ${playerId}`, e); return null; });
  return {
    ...hracZRadku(r),
    krestni: String(r.first_name),
    prijmeni: String(r.last_name),
    mzda: typeof r.weekly_wage === "number" ? r.weekly_wage : 0,
    silnychVztahu: vztahy?.n ?? 0,
  };
}

export function proAkce(
  r: Pick<IncidentRadek, "status" | "category" | "culprit_type" | "culprit_revealed" | "accusations" | "police_success">,
  pachatelVKadru: boolean,
): IncidentProAkce {
  return {
    status: r.status, category: r.category, culpritType: r.culprit_type,
    odhalen: r.culprit_revealed === 1, obvineni: r.accusations, policieVysledek: r.police_success, pachatelVKadru,
  };
}
```

- [ ] **Step 3: Fixtures**

Na konec `apps/api/src/incidents/testovaci-stav.ts` přidej (a import `import type { IncidentRadek } from "./incident-db";`):

```ts
/** Řádek `club_incidents`: otevřené vloupání, pachatel „p" neodhalen, ukradené dresy úrovně 2. */
export function incidentRadek(over: Partial<IncidentRadek> = {}): IncidentRadek {
  return {
    id: "inc-1", team_id: "tym-a", season_number: 4, kind: "vloupani_sklad", category: "kradez", status: "otevreny",
    severity: 1, game_date: "2026-09-14T16:00:00.000Z", deadline: "2026-09-21T16:00:00.000Z",
    culprit_type: "hrac", culprit_player_id: "p", culprit_revealed: 0,
    loss: JSON.stringify([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }]),
    accusations: 0, accused: "[]", police_result_on: null, police_success: null,
    resolution: null, resolution_data: null, text: "Ze skladu zmizelo vybavení: Dresy.", resolved_on: null,
    ...over,
  };
}

/** Řádek `players` s průměrnou povahou a mzdou 100 Kč týdně. */
export function hracRadek(id: string, jmeno: string, prijmeni: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, first_name: jmeno, last_name: prijmeni,
    personality: JSON.stringify({ alcohol: 50, discipline: 50, patriotism: 50, temper: 50, leadership: 30 }),
    life_context: "{}", coach_relationship: 50, weekly_wage: 100,
    ...over,
  };
}
```

- [ ] **Step 4: Failing testy**

`apps/api/src/incidents/hraci.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { posunHrace, posunKadru, posunKamaradu } from "./hraci";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";

type Dotaz = { sql: string; params: unknown[] };
const jakoDotaz = (p: D1PreparedStatement) => p as unknown as Dotaz;

describe("příkazy pro hráče", () => {
  it("posun hráče ořízne 0 až 100 a hlídá tým", () => {
    const p = jakoDotaz(posunHrace(jakoD1(new FalesnaD1()), "tym-a", "p", { morale: -12, vztah: -20 }));
    expect(p.params).toEqual([-12, -20, "p", "tym-a"]);
    expect(p.sql).toMatch(/MAX\(0, MIN\(100/);
    expect(p.sql.match(/\?/g)).toHaveLength(4);
  });

  it("kádr bez obviněného a bez jeho kamarádů", () => {
    const p = jakoDotaz(posunKadru(jakoD1(new FalesnaD1()), "tym-a", -2, ["a"], "a"));
    expect(p.params).toEqual([-2, "tym-a", "a", "a", "a", "a"]);
    expect(p.sql.match(/\?/g)).toHaveLength(6);
  });

  it("kamarádi jsou jen kamarádské vztahy, ne rivalové", () => {
    const p = jakoDotaz(posunKamaradu(jakoD1(new FalesnaD1()), "tym-a", "a", -3));
    expect(p.params).toEqual([-3, "tym-a", "a", "a", "a"]);
    expect(p.sql).toContain("'drinking_buddies'");
    expect(p.sql).not.toContain("'rivals'");
    expect(p.sql.match(/\?/g)).toHaveLength(5);
  });
});
```

`apps/api/src/incidents/akce-obvineni.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({
  sendPlayerSMS: vi.fn(async () => "konverzace"),
  sendSystemSMS: vi.fn(async () => undefined),
}));

import type { Bindings } from "../index";
import { sendPlayerSMS, sendSystemSMS } from "../messaging/system-sms";
import { obvinHrace, zavolejPolicii } from "./akce";
import { SMS_ROLE_POLICIE } from "./nastaveni";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { hracRadek, incidentRadek } from "./testovaci-stav";

const DNES = "2026-09-16T16:00:00.000Z";

function prostredi(incident: Record<string, unknown>, dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: incident },
    { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
    { sql: /FROM players WHERE id = \? AND team_id = \?/, first: hracRadek("a", "Adam", "Kos") },
    { sql: /FROM relationships/, first: { n: 0 } },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

beforeEach(() => vi.clearAllMocks());

describe("obvinění", () => {
  it("nevinný hráč: zapírá, zapíše se křivé obvinění a dopadne to na morálku", async () => {
    const { db, env } = prostredi(incidentRadek());
    expect(await obvinHrace(env, "tym-a", "inc-1", "a")).toEqual({ ok: true, vysledek: "zapira", odhalen: false });
    const narok = db.dotazy.find((d) => /UPDATE club_incidents SET accusations/.test(d.sql));
    expect(narok?.params[0]).toBe(1);
    expect(JSON.parse(String(narok?.params[1]))).toEqual([{ playerId: "a", jmeno: "Adam Kos", den: "2026-09-16", vysledek: "zapira" }]);
    expect(narok?.params[2]).toBe(0);
    const davka = db.davky.flat();
    expect(davka.some((d) => /INSERT OR REPLACE INTO club_incident_knowledge/.test(d.sql) && d.params[1] === "a")).toBe(true);
    expect(davka.filter((d) => /UPDATE players/.test(d.sql))).toHaveLength(3);
    expect(sendPlayerSMS).toHaveBeenCalledTimes(1);
  });

  it("souběh: když se incident mezitím změnil, nic dalšího se nestane", async () => {
    const { db, env } = prostredi(incidentRadek(), [{ sql: /UPDATE club_incidents SET accusations/, changes: 0 }]);
    expect(await obvinHrace(env, "tym-a", "inc-1", "a")).toMatchObject({ ok: false, kod: 409 });
    expect(db.davky).toHaveLength(0);
    expect(sendPlayerSMS).not.toHaveBeenCalled();
  });

  it("po dvou obviněních už obvinit nejde", async () => {
    const { db, env } = prostredi(incidentRadek({ accusations: 2 }));
    expect(await obvinHrace(env, "tym-a", "inc-1", "a")).toMatchObject({ ok: false, kod: 409 });
    expect(db.pocet(/UPDATE club_incidents/)).toBe(0);
  });

  it("hráč mimo kádr obvinit nejde", async () => {
    const { env } = prostredi(incidentRadek(), [{ sql: /FROM players WHERE id = \? AND team_id = \?/, first: null }]);
    expect(await obvinHrace(env, "tym-a", "inc-1", "x")).toMatchObject({ ok: false, kod: 400 });
  });

  it("pachatel, na kterého ukazuje nalezená stopa, je odhalen a vznikne stopa přiznání", async () => {
    const stopa = {
      id: "inc-1-spravce-1", source: "spravce", points_to_player_id: "p", suspects: null, holder_player_id: null,
      strength: 2, police_bonus: 0.1, text: "Správce.", found: 1,
    };
    const { db, env } = prostredi(incidentRadek(), [
      { sql: /FROM players WHERE id = \? AND team_id = \?/, first: hracRadek("p", "Pepa", "Průšvih") },
      { sql: /FROM club_incident_clues/, all: [stopa] },
    ]);
    expect(await obvinHrace(env, "tym-a", "inc-1", "p")).toMatchObject({ ok: true, odhalen: true });
    const narok = db.dotazy.find((d) => /UPDATE club_incidents SET accusations/.test(d.sql));
    expect(narok?.params[2]).toBe(1);
    expect(db.davky.flat().some((d) => /INSERT OR IGNORE INTO club_incident_clues/.test(d.sql) && d.params[3] === "priznani")).toBe(true);
  });
});

describe("policie", () => {
  it("převezme neodhalený incident a výsledek dá do 3 až 7 dní", async () => {
    const { db, env } = prostredi(incidentRadek());
    const v = await zavolejPolicii(env, "tym-a", "inc-1");
    if (!v.ok) throw new Error(v.chyba);
    const dni = (Date.parse(v.vysledekOn) - Date.parse(DNES)) / 86_400_000;
    expect(dni).toBeGreaterThanOrEqual(3);
    expect(dni).toBeLessThanOrEqual(7);
    expect(db.pocet(/UPDATE club_incidents SET status = 'policie'/)).toBe(1);
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", SMS_ROLE_POLICIE, expect.any(String));
  });

  it("u odhaleného pachatele ani podruhé policii zavolat nejde", async () => {
    expect(await zavolejPolicii(prostredi(incidentRadek({ culprit_revealed: 1 })).env, "tym-a", "inc-1")).toMatchObject({ ok: false, kod: 409 });
    expect(await zavolejPolicii(prostredi(incidentRadek({ police_success: 0 })).env, "tym-a", "inc-1")).toMatchObject({ ok: false, kod: 409 });
  });
});
```

- [ ] **Step 5: Spusť, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/hraci.test.ts src/incidents/akce-obvineni.test.ts`
Expected: FAIL (moduly neexistují).

- [ ] **Step 6: `hraci.ts`**

```ts
/**
 * Následky incidentu pro hráče: morálka a vztah k trenérovi (spec 7b–7d).
 * Vrací připravené příkazy pro `db.batch`, sám nic nespouští.
 */

import { KAMARADSKE_VZTAHY, SILA_KAMARADSTVI } from "./nastaveni";

const AKTIVNI = "(status IS NULL OR status = 'active')";

/** Jeden parametr: posun morálky. Ořez 0–100. */
const MORALKA = `life_context = json_set(COALESCE(life_context, '{}'), '$.morale',
  MAX(0, MIN(100, COALESCE(json_extract(life_context, '$.morale'), 50) + ?)))`;

/** Kamarádi hráče, kteří by ho kryli (spec 5b). Tři parametry: id hráče. Typy vztahů jsou konstanty, ne vstup. */
const KAMARADI = `SELECT CASE WHEN player_a_id = ? THEN player_b_id ELSE player_a_id END FROM relationships
  WHERE (player_a_id = ? OR player_b_id = ?)
    AND type IN (${KAMARADSKE_VZTAHY.map((t) => `'${t}'`).join(", ")}) AND strength >= ${SILA_KAMARADSTVI}`;

export function posunHrace(
  db: D1Database, teamId: string, playerId: string, zmena: { morale?: number; vztah?: number },
): D1PreparedStatement {
  return db.prepare(
    `UPDATE players SET ${MORALKA},
       coach_relationship = MAX(0, MIN(100, COALESCE(coach_relationship, 50) + ?))
     WHERE id = ? AND team_id = ?`,
  ).bind(zmena.morale ?? 0, zmena.vztah ?? 0, playerId, teamId);
}

/** Morálka aktivního kádru. Hráči v `krome` a kamarádi hráče `kromeKamaraduHrace` se vynechají. */
export function posunKadru(
  db: D1Database, teamId: string, delta: number,
  krome: readonly string[] = [], kromeKamaraduHrace: string | null = null,
): D1PreparedStatement {
  let sql = `UPDATE players SET ${MORALKA} WHERE team_id = ? AND ${AKTIVNI}`;
  const parametry: unknown[] = [delta, teamId];
  if (krome.length > 0) {
    sql += ` AND id NOT IN (${krome.map(() => "?").join(", ")})`;
    parametry.push(...krome);
  }
  if (kromeKamaraduHrace) {
    sql += ` AND id NOT IN (${KAMARADI})`;
    parametry.push(kromeKamaraduHrace, kromeKamaraduHrace, kromeKamaraduHrace);
  }
  return db.prepare(sql).bind(...parametry);
}

export function posunKamaradu(db: D1Database, teamId: string, playerId: string, delta: number): D1PreparedStatement {
  return db.prepare(`UPDATE players SET ${MORALKA} WHERE team_id = ? AND ${AKTIVNI} AND id IN (${KAMARADI})`)
    .bind(delta, teamId, playerId, playerId, playerId);
}
```

- [ ] **Step 7: `akce.ts` (obvinění a policie)**

```ts
/**
 * Akce manažera nad incidentem: obvinění, policie, tresty (spec 7b, 7c, 7d).
 *
 * Každá akce si nejdřív hlídaným UPDATE zabere přechod stavu a teprve po
 * úspěchu provede následky. Dvojklik ani souběh je tak nezdvojí.
 */

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { sendPlayerSMS, sendSystemSMS } from "../messaging/system-sms";
import { posunHrace, posunKadru, posunKamaradu } from "./hraci";
import { herniDatum, nactiHraceKadru, nactiIncident, proAkce } from "./incident-db";
import { nazevIncidentu } from "./katalog";
import {
  LHUTA_PO_ODHALENI_DNI, OBVINENI_PAMET_DNI, POLICIE_DNI_MAX, POLICIE_DNI_MIN, SMS_ROLE_POLICIE,
} from "./nastaveni";
import { nactiStopy, prikazyStop } from "./stopy-db";
import { text, TEXTY, vypln } from "./texty";
import type { Obvineni, VysledekObvineni } from "./typy";
import { dostupneAkce, nactiObvineni, rozhodniObvineni } from "./vysetrovani";

const M = "incidents-akce";

export type VysledekAkce<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; kod: 400 | 404 | 409 | 500; chyba: string };

const NENALEZENO = { ok: false, kod: 404, chyba: "Incident nenalezen" } as const;
const ZMENENO = { ok: false, kod: 409, chyba: "Incident se mezitím změnil, načti ho znovu" } as const;

function pozdejsi(a: string | null, b: string): string {
  return a && a > b ? a : b;
}

export async function obvinHrace(
  env: Bindings, teamId: string, incidentId: string, playerId: string,
): Promise<VysledekAkce<{ vysledek: VysledekObvineni; odhalen: boolean }>> {
  const db = env.DB;
  const [inc, gameDate] = await Promise.all([nactiIncident(db, teamId, incidentId), herniDatum(db, teamId)]);
  if (!inc || !gameDate) return NENALEZENO;
  if (!dostupneAkce(proAkce(inc, false)).obvinit) return { ok: false, kod: 409, chyba: "Obvinit teď nejde" };

  const obvineny = await nactiHraceKadru(db, teamId, playerId);
  if (!obvineny) return { ok: false, kod: 400, chyba: "Hráč není v kádru" };

  const stopy = await nactiStopy(db, incidentId);
  const poradi = inc.accusations + 1;
  const rng = createRng(seedFromString(`obvineni|${incidentId}|${playerId}|${poradi}`));
  const { vysledek, vinen } = rozhodniObvineni({
    obvineny, pachatelId: inc.culprit_type === "hrac" ? inc.culprit_player_id : null, stopy, rng,
  });
  const odhalen = vinen && vysledek !== "zapira";
  const obvineni: Obvineni[] = [...nactiObvineni(inc.accused), { playerId, jmeno: obvineny.jmeno, den: gameDate.slice(0, 10), vysledek }];
  const deadline = odhalen ? pozdejsi(inc.deadline, gameExpiry(gameDate, LHUTA_PO_ODHALENI_DNI)) : inc.deadline;

  const narok = await db.prepare(
    `UPDATE club_incidents SET accusations = ?, accused = ?, culprit_revealed = ?, deadline = ?
      WHERE id = ? AND team_id = ? AND status = 'otevreny' AND culprit_revealed = 0 AND accusations = ?`,
  ).bind(poradi, JSON.stringify(obvineni), odhalen ? 1 : 0, deadline, incidentId, teamId, inc.accusations).run()
    .catch((e) => { logger.error({ module: M }, `obvinění ${incidentId}`, e); return null; });
  if ((narok?.meta?.changes ?? 0) === 0) return ZMENENO;

  const davka: D1PreparedStatement[] = [];
  if (odhalen) {
    davka.push(...prikazyStop(db, teamId, incidentId, [{
      zdroj: "priznani", ukazujeNa: playerId, podezreli: null, drzitel: null, sila: 3, bonusPolicie: 0, nalezena: true,
      text: text(rng, vysledek === "priznal" ? "stopa_priznani" : "stopa_usvedcen", { hrac: obvineny.jmeno }),
    }], gameDate));
  } else if (vinen) {
    davka.push(posunHrace(db, teamId, playerId, { vztah: -8 }));
  } else {
    davka.push(
      posunHrace(db, teamId, playerId, { morale: -12, vztah: -20 }),
      posunKamaradu(db, teamId, playerId, -3),
      posunKadru(db, teamId, -2, [playerId], playerId),
      db.prepare(
        `INSERT OR REPLACE INTO club_incident_knowledge (incident_id, player_id, team_id, role, fact, willingness, until, season_number)
         VALUES (?, ?, ?, 'obvineny', ?, 50, ?, ?)`,
      ).bind(
        incidentId, playerId, teamId, vypln(TEXTY.znalost_obvineny[0], { nazev: nazevIncidentu(inc.kind) }),
        gameExpiry(gameDate, OBVINENI_PAMET_DNI), inc.season_number,
      ),
    );
  }
  await db.batch(davka).catch((e) => logger.error({ module: M }, `následky obvinění ${incidentId}`, e));

  const klic = vysledek === "priznal" ? "obvineni_priznani" : vysledek === "usvedcen" ? "obvineni_usvedcen" : "obvineni_zapira";
  await sendPlayerSMS(db, teamId, { id: playerId, firstName: obvineny.krestni, lastName: obvineny.prijmeni }, text(rng, klic))
    .catch((e) => logger.warn({ module: M }, `SMS po obvinění ${incidentId}`, e));
  return { ok: true, vysledek, odhalen };
}

export async function zavolejPolicii(
  env: Bindings, teamId: string, incidentId: string,
): Promise<VysledekAkce<{ vysledekOn: string }>> {
  const db = env.DB;
  const [inc, gameDate] = await Promise.all([nactiIncident(db, teamId, incidentId), herniDatum(db, teamId)]);
  if (!inc || !gameDate) return NENALEZENO;
  if (!dostupneAkce(proAkce(inc, false)).policie) return { ok: false, kod: 409, chyba: "Policii teď zavolat nejde" };

  const rng = createRng(seedFromString(`policie-prijeti|${incidentId}`));
  const vysledekOn = gameExpiry(gameDate, rng.int(POLICIE_DNI_MIN, POLICIE_DNI_MAX));
  const narok = await db.prepare(
    `UPDATE club_incidents SET status = 'policie', police_result_on = ?
      WHERE id = ? AND team_id = ? AND status = 'otevreny' AND culprit_revealed = 0 AND police_success IS NULL`,
  ).bind(vysledekOn, incidentId, teamId).run()
    .catch((e) => { logger.error({ module: M }, `policie ${incidentId}`, e); return null; });
  if ((narok?.meta?.changes ?? 0) === 0) return ZMENENO;

  await sendSystemSMS(db, teamId, SMS_ROLE_POLICIE, `🚓 ${text(rng, "policie_prijato", { nazev: nazevIncidentu(inc.kind) })}`)
    .catch((e) => logger.warn({ module: M }, `SMS policie ${incidentId}`, e));
  return { ok: true, vysledekOn };
}
```

- [ ] **Step 8: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/incidents/incident-db.ts apps/api/src/incidents/hraci.ts apps/api/src/incidents/hraci.test.ts apps/api/src/incidents/akce.ts apps/api/src/incidents/akce-obvineni.test.ts apps/api/src/incidents/katalog.ts apps/api/src/incidents/texty.ts apps/api/src/incidents/testovaci-stav.ts
git commit -F - <<'EOF'
feat(incidenty): obvineni hrace a zavolani policie

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: Tresty pro odhaleného pachatele a nové transakce

**Files:**
- Modify: `apps/api/src/incidents/akce.ts`, `apps/api/src/incidents/texty.ts`, `apps/api/src/season/finance-processor.ts`, `apps/web/src/app/dashboard/finances/page.tsx`
- Create: `apps/api/src/incidents/akce-tresty.test.ts`

**Interfaces:**
- Consumes: `hodnotaSkody`, `castkaSrazky`, `castkaPokuty`, `jeOblibeny` (tresty.ts); `nactiZtraty` (popis.ts); `removePlayer(db, playerId, "released", { toFreeAgent: true, teamId })` (transfers/remove-player.ts); `recordTransaction(db, teamId, type, amount, description, gameDate, referenceId)` (season/finance-processor.ts).
- Produces:
  - `akce.ts`: `rozhodni(env, teamId, incidentId, akce: AkceTrestu): Promise<VysledekAkce<{ castka: number | null }>>`
  - `TransactionType`: `"incident_fine" | "incident_deduction" | "incident_recovery"` (FE popisky a ikony)
  - `resolution_data` srážky: `{"celkem": number, "tydnuZbyva": 4}`; pokuty: `{"castka": number}`

- [ ] **Step 1: Failing test**

`apps/api/src/incidents/akce-tresty.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({
  sendPlayerSMS: vi.fn(async () => "konverzace"),
  sendSystemSMS: vi.fn(async () => undefined),
}));
vi.mock("../season/finance-processor", () => ({ recordTransaction: vi.fn(async () => 0) }));
vi.mock("../transfers/remove-player", () => ({ removePlayer: vi.fn(async () => ({ ok: true })) }));

import type { Bindings } from "../index";
import { sendPlayerSMS, sendSystemSMS } from "../messaging/system-sms";
import { recordTransaction } from "../season/finance-processor";
import { removePlayer } from "../transfers/remove-player";
import { rozhodni } from "./akce";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { hracRadek, incidentRadek } from "./testovaci-stav";

const DNES = "2026-09-16T16:00:00.000Z";
const ODHALENY = incidentRadek({ culprit_revealed: 1 });

function prostredi(incident: Record<string, unknown>, dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: incident },
    { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
    { sql: /FROM players WHERE id = \? AND team_id = \?/, first: hracRadek("p", "Pepa", "Průšvih") },
    { sql: /FROM relationships/, first: { n: 0 } },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

beforeEach(() => vi.clearAllMocks());

describe("tresty", () => {
  it("pokuta: uzavře incident, klub dostane peníze a hráč odpoví", async () => {
    const { db, env } = prostredi(ODHALENY);
    expect(await rozhodni(env, "tym-a", "inc-1", "pokuta")).toEqual({ ok: true, castka: 200 });
    const narok = db.dotazy.find((d) => /UPDATE club_incidents SET status = 'uzavreny'/.test(d.sql));
    expect(narok?.params.slice(0, 3)).toEqual(["pokuta", JSON.stringify({ castka: 200 }), DNES]);
    expect(recordTransaction).toHaveBeenCalledWith(expect.anything(), "tym-a", "incident_fine", 200, expect.any(String), DNES, "pokuta-inc-1");
    expect(sendPlayerSMS).toHaveBeenCalledTimes(1);
  });

  it("srážka: rozloží se do 4 týdnů a teď se nic nestrhne", async () => {
    const { db, env } = prostredi(ODHALENY);
    expect(await rozhodni(env, "tym-a", "inc-1", "srazka")).toEqual({ ok: true, castka: 400 });
    const narok = db.dotazy.find((d) => /UPDATE club_incidents SET status = 'uzavreny'/.test(d.sql));
    expect(narok?.params.slice(0, 2)).toEqual(["srazka", JSON.stringify({ celkem: 400, tydnuZbyva: 4 })]);
    expect(recordTransaction).not.toHaveBeenCalled();
  });

  it("vyhodit: hráč jde mezi volné hráče", async () => {
    const { env } = prostredi(ODHALENY);
    expect(await rozhodni(env, "tym-a", "inc-1", "vyhodit")).toEqual({ ok: true, castka: null });
    expect(removePlayer).toHaveBeenCalledWith(expect.anything(), "p", "released", { toFreeAgent: true, teamId: "tym-a" });
  });

  it("když vyhazov selže, incident se vrátí k rozhodnutí", async () => {
    vi.mocked(removePlayer).mockResolvedValueOnce({ ok: false, reason: "not_found" });
    const { db, env } = prostredi(ODHALENY);
    expect(await rozhodni(env, "tym-a", "inc-1", "vyhodit")).toMatchObject({ ok: false, kod: 500 });
    expect(db.pocet(/SET status = 'otevreny', resolution = NULL/)).toBe(1);
  });

  it("předat policii: incident čeká na soud, nic se neuzavře", async () => {
    const { db, env } = prostredi(ODHALENY);
    expect(await rozhodni(env, "tym-a", "inc-1", "policie")).toEqual({ ok: true, castka: null });
    expect(db.pocet(/SET status = 'policie', resolution = 'policie'/)).toBe(1);
    expect(db.pocet(/SET status = 'uzavreny'/)).toBe(0);
    expect(sendSystemSMS).toHaveBeenCalledTimes(1);
  });

  it("neodhalený pachatel se trestat nedá", async () => {
    const { db, env } = prostredi(incidentRadek());
    expect(await rozhodni(env, "tym-a", "inc-1", "pokuta")).toMatchObject({ ok: false, kod: 409 });
    expect(db.pocet(/UPDATE club_incidents/)).toBe(0);
  });

  it("souběh: druhé kliknutí nic nestrhne", async () => {
    const { env } = prostredi(ODHALENY, [{ sql: /UPDATE club_incidents SET status = 'uzavreny'/, changes: 0 }]);
    expect(await rozhodni(env, "tym-a", "inc-1", "pokuta")).toMatchObject({ ok: false, kod: 409 });
    expect(recordTransaction).not.toHaveBeenCalled();
    expect(sendPlayerSMS).not.toHaveBeenCalled();
  });
});
```

(Hodnota škody dresů úrovně 2 je `cumulativeInvestment("jerseys", 2)`, tedy víc než 400 Kč, takže pokuta = 2 × 100 a srážka = 4 × 100.)

- [ ] **Step 2: Spusť, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/akce-tresty.test.ts`
Expected: FAIL (`rozhodni` neexistuje).

- [ ] **Step 3: Typy transakcí a popisky na FE**

V `apps/api/src/season/finance-processor.ts` v unionu `TransactionType` za řádek `| "disciplinary_fine"` přidej:

```ts
  // Incidenty v klubu: pokuta a srážka ze mzdy od pachatele (příjem klubu) a náhrada
  // škody, když policie dopadne cizího pachatele. Nejsou to nákupy.
  | "incident_fine"
  | "incident_deduction"
  | "incident_recovery"
```

V `apps/web/src/app/dashboard/finances/page.tsx` do `TXN_ICONS` za `disciplinary_fine: "⚖️",` přidej `incident_fine: "🧾", incident_deduction: "✂️", incident_recovery: "🚓",` a do `TXN_LABELS` za řádek `disciplinary_fine: "Pokuta disciplinární komise",` přidej:

```ts
  incident_fine: "Pokuta hráči za incident",
  incident_deduction: "Srážka ze mzdy hráče",
  incident_recovery: "Náhrada škody od pachatele",
```

- [ ] **Step 4: Texty trestů**

V `apps/api/src/incidents/texty.ts` přidej do `TEXTY` (před `lhuta_kradez`):

```ts
  policie_udani: [
    "Převzali jsme oznámení na hráče: {hrac}. Věc předáme soudu.",
    "Oznámení na hráče je zapsané: {hrac}. Rozhodne soud.",
    "Případ jsme převzali, podezřelý je hráč: {hrac}. Věc půjde k soudu.",
  ],
  trest_odpustit: [
    "Díky, trenére. Už se to nestane.",
    "Tohle jsem nečekal. Nezklamu vás.",
    "Díky za šanci, trenére. Beru to vážně.",
  ],
  trest_srazka: [
    "Chápu, trenére. Odpracuju to.",
    "Je to fér. Srážku beru.",
    "Zasloužil jsem si to, strhněte mi to ze mzdy.",
  ],
  trest_pokuta: [
    "Zaplatím to. Zasloužil jsem si to.",
    "Dobře, pokutu beru.",
    "Je to moje chyba, zaplatím.",
  ],
```

- [ ] **Step 5: `rozhodni` v `akce.ts`**

Doplň importy:

```ts
import { recordTransaction } from "../season/finance-processor";
import { removePlayer } from "../transfers/remove-player";
import { nactiZtraty } from "./popis";
import { castkaPokuty, castkaSrazky, hodnotaSkody, jeOblibeny } from "./tresty";
import type { AkceTrestu } from "./typy";
```

a do importu z `./nastaveni` přidej `SRAZKA_TYDNU`. Na konec souboru přidej:

```ts
/** SMS, kterou pachatel odpoví na trest. U ostatních trestů hráč nepíše. */
const SMS_TRESTU = { odpustit: "trest_odpustit", srazka: "trest_srazka", pokuta: "trest_pokuta" } as const;

export async function rozhodni(
  env: Bindings, teamId: string, incidentId: string, akce: AkceTrestu,
): Promise<VysledekAkce<{ castka: number | null }>> {
  const db = env.DB;
  const [inc, gameDate] = await Promise.all([nactiIncident(db, teamId, incidentId), herniDatum(db, teamId)]);
  if (!inc || !gameDate) return NENALEZENO;

  const pachatel = inc.culprit_type === "hrac" && inc.culprit_player_id && inc.culprit_revealed === 1
    ? await nactiHraceKadru(db, teamId, inc.culprit_player_id)
    : null;
  if (!pachatel || !dostupneAkce(proAkce(inc, true)).tresty.includes(akce)) {
    return { ok: false, kod: 409, chyba: "Tohle rozhodnutí teď udělat nejde" };
  }

  const rng = createRng(seedFromString(`trest|${incidentId}|${akce}`));
  const oblibeny = jeOblibeny(pachatel.vudcovstvi, pachatel.silnychVztahu);
  const sms = { id: pachatel.id, firstName: pachatel.krestni, lastName: pachatel.prijmeni };

  if (akce === "policie") {
    // Udání vlastního hráče: výsledek přijde za pár dní a je jistý (spec 7c).
    const vysledekOn = gameExpiry(gameDate, rng.int(POLICIE_DNI_MIN, POLICIE_DNI_MAX));
    const narok = await db.prepare(
      `UPDATE club_incidents SET status = 'policie', resolution = 'policie', police_result_on = ?
        WHERE id = ? AND team_id = ? AND status = 'otevreny' AND culprit_revealed = 1 AND police_success IS NULL`,
    ).bind(vysledekOn, incidentId, teamId).run()
      .catch((e) => { logger.error({ module: M }, `udání ${incidentId}`, e); return null; });
    if ((narok?.meta?.changes ?? 0) === 0) return ZMENENO;
    // Oblíbeného hráče kabina práskači nezapomene.
    if (oblibeny) {
      await posunKadru(db, teamId, -3, [pachatel.id]).run()
        .catch((e) => logger.warn({ module: M }, `morálka po udání ${incidentId}`, e));
    }
    await sendSystemSMS(db, teamId, SMS_ROLE_POLICIE, `🚓 ${text(rng, "policie_udani", { hrac: pachatel.jmeno })}`)
      .catch((e) => logger.warn({ module: M }, `SMS udání ${incidentId}`, e));
    return { ok: true, castka: null };
  }

  const skoda = hodnotaSkody(nactiZtraty(inc.loss));
  const castka = akce === "srazka" ? castkaSrazky(skoda, pachatel.mzda)
    : akce === "pokuta" ? castkaPokuty(skoda, pachatel.mzda)
    : null;
  const data = akce === "srazka" ? JSON.stringify({ celkem: castka, tydnuZbyva: castka ? SRAZKA_TYDNU : 0 })
    : akce === "pokuta" ? JSON.stringify({ castka })
    : null;

  const narok = await db.prepare(
    `UPDATE club_incidents SET status = 'uzavreny', resolution = ?, resolution_data = ?, resolved_on = ?
      WHERE id = ? AND team_id = ? AND status = 'otevreny' AND culprit_revealed = 1`,
  ).bind(akce, data, gameDate, incidentId, teamId).run()
    .catch((e) => { logger.error({ module: M }, `rozhodnutí ${akce} ${incidentId}`, e); return null; });
  if ((narok?.meta?.changes ?? 0) === 0) return ZMENENO;

  if (akce === "vyhodit") {
    const odebrany = await removePlayer(db, pachatel.id, "released", { toFreeAgent: true, teamId })
      .catch((e) => { logger.error({ module: M }, `vyhazov pachatele ${incidentId}`, e); return null; });
    if (!odebrany?.ok) {
      await db.prepare(
        "UPDATE club_incidents SET status = 'otevreny', resolution = NULL, resolution_data = NULL, resolved_on = NULL WHERE id = ? AND resolution = 'vyhodit'",
      ).bind(incidentId).run()
        .catch((e) => logger.error({ module: M }, `vrácení incidentu po nepovedeném vyhazovu ${incidentId}`, e));
      return { ok: false, kod: 500, chyba: "Hráče se nepodařilo vyhodit" };
    }
    await posunKadru(db, teamId, oblibeny ? -4 : 1).run()
      .catch((e) => logger.warn({ module: M }, `morálka po vyhazovu ${incidentId}`, e));
    return { ok: true, castka: null };
  }

  const davka: D1PreparedStatement[] = [];
  if (akce === "odpustit") {
    davka.push(posunHrace(db, teamId, pachatel.id, { morale: 5, vztah: 8 }));
    if (inc.severity >= 2) davka.push(posunKadru(db, teamId, -2, [pachatel.id]));
  } else if (akce === "srazka") {
    davka.push(posunHrace(db, teamId, pachatel.id, { morale: -6, vztah: -4 }));
  } else if (akce === "pokuta") {
    davka.push(posunHrace(db, teamId, pachatel.id, { morale: -8, vztah: -6 }));
  }
  if (davka.length > 0) {
    await db.batch(davka).catch((e) => logger.error({ module: M }, `následky trestu ${incidentId}`, e));
  }

  if (akce === "pokuta" && castka) {
    await recordTransaction(db, teamId, "incident_fine", castka, `Pokuta hráči: ${pachatel.jmeno}`, gameDate, `pokuta-${incidentId}`)
      .catch((e) => logger.error({ module: M }, `pokuta ${incidentId}`, e));
  }
  if (akce === "odpustit" || akce === "srazka" || akce === "pokuta") {
    await sendPlayerSMS(db, teamId, sms, text(rng, SMS_TRESTU[akce]))
      .catch((e) => logger.warn({ module: M }, `SMS po trestu ${incidentId}`, e));
  }
  return { ok: true, castka };
}
```

- [ ] **Step 6: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents src/season/transaction-labels.test.ts && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/incidents/akce.ts apps/api/src/incidents/akce-tresty.test.ts apps/api/src/incidents/texty.ts apps/api/src/season/finance-processor.ts apps/web/src/app/dashboard/finances/page.tsx
git commit -F - <<'EOF'
feat(incidenty): tresty pro odhaleneho pachatele a transakce incidentu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 7: Denní vyšetřování (policie, lhůty, srážky)

**Files:**
- Create: `apps/api/src/incidents/vysetrovani-den.ts`, `apps/api/src/incidents/vysetrovani-den.test.ts`
- Modify: `apps/api/src/incidents/denni-krok.ts`, `apps/api/src/incidents/texty.ts`

**Interfaces:**
- Consumes: `uzavriProsleIncidenty(env, { teamId, gameDate, seasonNumber })` (dopady.ts); `SLOUPCE_INCIDENTU`, `IncidentRadek` (incident-db.ts); `nactiStopy`, `prikazyStop` (stopy-db.ts); `sancePolicie`, `vysledekPolicie` (vysetrovani.ts); `hodnotaSkody`, `splatkaSrazky` (tresty.ts); `nazevIncidentu` (katalog.ts); `recordTransaction`; `createNotification(db, teamId, "event", title, body, actionUrl, env)`.
- Produces:
  - `vyhodnotPolicii(env: Bindings, t: { teamId: string; gameDate: string; seasonNumber: number }): Promise<number>`
  - `zauctujSrazky(env: Bindings, t: { teamId: string; gameDate: string }): Promise<number>`
  - `zpracujVysetrovani(env: Bindings, t: { teamId: string; gameDate: string; seasonNumber: number }, opts: { pondeli: boolean }): Promise<{ policie: number; uzavreno: number; srazky: number }>`
  - Los šetření = **první** číslo z `createRng(seedFromString("policie|" + incidentId))`.

- [ ] **Step 1: Failing test**

`apps/api/src/incidents/vysetrovani-den.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({ sendSystemSMS: vi.fn(async () => undefined), sendPlayerSMS: vi.fn() }));
vi.mock("../community/notifications", () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock("../season/finance-processor", () => ({ recordTransaction: vi.fn(async () => 0) }));

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { seedFromString } from "../lib/seed";
import { sendSystemSMS } from "../messaging/system-sms";
import { recordTransaction } from "../season/finance-processor";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { incidentRadek } from "./testovaci-stav";
import { vyhodnotPolicii, zauctujSrazky, zpracujVysetrovani } from "./vysetrovani-den";

const DNES = "2026-09-16T16:00:00.000Z";
const T = { teamId: "tym-a", gameDate: DNES, seasonNumber: 4 };
const SETRENI = /i\.status = 'policie' AND i\.police_result_on <= \?/;
const SRAZKY = /i\.resolution = 'srazka'/;

/** Id incidentu, jehož los policie splní podmínku. Seed je daný id, takže se dá najít předem. */
function idSLosem(podminka: (los: number) => boolean): string {
  for (let n = 0; n < 1000; n++) {
    const id = `inc-${n}`;
    if (podminka(createRng(seedFromString(`policie|${id}`)).random())) return id;
  }
  throw new Error("žádné vhodné id");
}

function prostredi(pravidla: Pravidlo[]) {
  const db = new FalesnaD1(pravidla);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

beforeEach(() => vi.clearAllMocks());

describe("výsledek policie", () => {
  it("udání: soud dá podmínku a incident se uzavře", async () => {
    const inc = { ...incidentRadek({ status: "policie", culprit_revealed: 1, resolution: "policie", police_result_on: DNES }), first_name: "Pepa", last_name: "Průšvih" };
    const { db, env } = prostredi([{ sql: SETRENI, all: [inc] }]);
    expect(await vyhodnotPolicii(env, T)).toBe(1);
    expect(db.pocet(/SET status = 'uzavreny', police_success = 1, resolved_on = \?/)).toBe(1);
    expect(vi.mocked(sendSystemSMS).mock.calls[0][3]).toContain("Pepa Průšvih");
  });

  it("neúspěch: incident se vrátí manažerovi se lhůtou za 3 dny a jméno pachatele nepadne", async () => {
    const id = idSLosem((los) => los >= 0.9);
    const inc = { ...incidentRadek({ id, status: "policie", police_result_on: DNES }), first_name: "Pepa", last_name: "Průšvih" };
    const { db, env } = prostredi([{ sql: SETRENI, all: [inc] }]);
    await vyhodnotPolicii(env, T);
    const prechod = db.dotazy.find((d) => /SET status = 'otevreny', police_success = 0, deadline = \?/.test(d.sql));
    expect(prechod?.params).toEqual(["2026-09-19T16:00:00.000Z", id]);
    expect(vi.mocked(sendSystemSMS).mock.calls[0][3]).not.toContain("Pepa");
  });

  it("dopadený cizí zloděj: vybavení se vrátí, jen když klub nemá stejné nebo lepší", async () => {
    const id = idSLosem((los) => los < 0.15);
    const inc = { ...incidentRadek({ id, status: "policie", culprit_type: "cizi", culprit_player_id: null, police_result_on: DNES }), first_name: null, last_name: null };
    const { db, env } = prostredi([{ sql: SETRENI, all: [inc] }]);
    await vyhodnotPolicii(env, T);
    expect(db.pocet(/resolution = 'vyreseno_policii'/)).toBe(1);
    const vraceni = db.dotazy.find((d) => /UPDATE equipment SET jerseys = \?, jerseys_condition = \? WHERE team_id = \? AND jerseys < \?/.test(d.sql));
    expect(vraceni?.params).toEqual([2, 70, "tym-a", 2]);
    expect(recordTransaction).not.toHaveBeenCalled();
  });

  it("dopadený vandal zaplatí polovinu až celou škodu", async () => {
    const id = idSLosem((los) => los < 0.15);
    const inc = {
      ...incidentRadek({
        id, kind: "vandal", category: "poskozeni", status: "policie", culprit_type: "cizi", culprit_player_id: null,
        police_result_on: DNES, loss: JSON.stringify([{ typ: "travnik", pred: 70, po: 60 }]),
      }),
      first_name: null, last_name: null,
    };
    await vyhodnotPolicii(prostredi([{ sql: SETRENI, all: [inc] }]).env, T);
    const volani = vi.mocked(recordTransaction).mock.calls[0];
    expect(volani[2]).toBe("incident_recovery");
    expect(volani[3]).toBeGreaterThanOrEqual(750);
    expect(volani[3]).toBeLessThanOrEqual(1500);
    expect(volani[6]).toBe(`nahrada-${id}`);
  });

  it("když přechod mezitím proběhl, nic se neoznámí", async () => {
    const inc = { ...incidentRadek({ status: "policie", culprit_revealed: 1, resolution: "policie", police_result_on: DNES }), first_name: "Pepa", last_name: "Průšvih" };
    const { env } = prostredi([
      { sql: /UPDATE club_incidents SET status = 'uzavreny', police_success = 1/, changes: 0 },
      { sql: SETRENI, all: [inc] },
    ]);
    expect(await vyhodnotPolicii(env, T)).toBe(0);
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });
});

describe("srážky ze mzdy", () => {
  const radek = (tydnuZbyva: number, jmeno: string | null = "Pepa") => ({
    id: "inc-1", resolution_data: JSON.stringify({ celkem: 437, tydnuZbyva }), first_name: jmeno, last_name: jmeno ? "Průšvih" : null,
  });

  it("strhne týdenní splátku s referencí týdne", async () => {
    const { db, env } = prostredi([{ sql: SRAZKY, all: [radek(4)] }]);
    expect(await zauctujSrazky(env, T)).toBe(1);
    const narok = db.dotazy.find((d) => /json_set\(resolution_data, '\$\.tydnuZbyva', \?\) WHERE id = \? AND/.test(d.sql));
    expect(narok?.params).toEqual([3, "inc-1", 4]);
    expect(recordTransaction).toHaveBeenCalledWith(expect.anything(), "tym-a", "incident_deduction", 109, expect.stringContaining("1/4"), DNES, "srazka-inc-1-t1");
  });

  it("poslední týden doplatí zbytek", async () => {
    await zauctujSrazky(prostredi([{ sql: SRAZKY, all: [radek(1)] }]).env, T);
    expect(recordTransaction).toHaveBeenCalledWith(expect.anything(), "tym-a", "incident_deduction", 110, expect.stringContaining("4/4"), DNES, "srazka-inc-1-t4");
  });

  it("hráč odešel: srážka končí bez platby", async () => {
    const { db, env } = prostredi([{ sql: SRAZKY, all: [radek(3, null)] }]);
    expect(await zauctujSrazky(env, T)).toBe(0);
    expect(db.pocet(/'\$\.tydnuZbyva', 0\)/)).toBe(1);
    expect(recordTransaction).not.toHaveBeenCalled();
  });

  it("když splátku už někdo zaúčtoval, podruhé se nestrhne", async () => {
    const { env } = prostredi([
      { sql: /json_set\(resolution_data, '\$\.tydnuZbyva', \?\) WHERE id = \? AND/, changes: 0 },
      { sql: SRAZKY, all: [radek(4)] },
    ]);
    expect(await zauctujSrazky(env, T)).toBe(0);
    expect(recordTransaction).not.toHaveBeenCalled();
  });

  it("mimo pondělí se srážky neúčtují", async () => {
    const { db, env } = prostredi([]);
    await zpracujVysetrovani(env, T, { pondeli: false });
    expect(db.pocet(SRAZKY)).toBe(0);
  });
});
```

- [ ] **Step 2: Spusť, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/vysetrovani-den.test.ts`
Expected: FAIL (modul neexistuje).

- [ ] **Step 3: Texty výsledků policie**

V `apps/api/src/incidents/texty.ts` přidej do `TEXTY` (před `lhuta_kradez`):

```ts
  policie_neuspech: [
    "Šetření jsme odložili: {nazev}. Pachatele se zjistit nepodařilo.",
    "Bohužel nic: {nazev}. Pachatele jsme nenašli, případ vracíme.",
    "Šetření skončilo bez výsledku: {nazev}. Kdyby se něco objevilo, dejte vědět.",
  ],
  policie_podminka: [
    "Soud rozhodl, podmínku dostal hráč: {hrac}.",
    "Rozsudek padl. Podmínku dostal hráč: {hrac}.",
    "Soud to uzavřel podmínkou pro hráče: {hrac}.",
  ],
  policie_hrac: [
    "Šetření je uzavřené. Pachatel je z vašeho kádru: {hrac}.",
    "Máme pachatele a je z vašeho týmu: {hrac}.",
    "Stopy vedly do vaší kabiny. Udělal to hráč: {hrac}.",
  ],
  policie_nehoda: [
    "Šetření je uzavřené: {nazev}. Byla to nehoda, nikdo to neudělal schválně.",
    "Případ uzavíráme jako nehodu: {nazev}. Pachatele nehledáme.",
    "Nešlo o trestný čin: {nazev}. Byla to nešťastná náhoda.",
  ],
  policie_vraceno: [
    "Pachatele jsme dopadli. Věci jsou zpátky v klubu: {vec}.",
    "Zloděje máme. Vrácené vybavení: {vec}.",
    "Dopadli jsme ho a věci jsou zpátky: {vec}.",
  ],
  policie_lepsi: [
    "Pachatele jsme dopadli. Věci jsou na služebně, ale klub už má lepší: {vec}.",
    "Zloděje máme, jenže klub už má stejné nebo lepší vybavení: {vec}.",
    "Věci se našly, klub je ale mezitím nahradil: {vec}.",
  ],
  policie_nahrada: [
    "Pachatele jsme dopadli. Soud mu nařídil uhradit škodu, klub dostane {castka} Kč.",
    "Dopadený pachatel zaplatí klubu náhradu škody: {castka} Kč.",
    "Viník uhradí část škody, na účet klubu přijde {castka} Kč.",
  ],
  policie_dopaden: [
    "Pachatele jsme dopadli: {nazev}.",
    "Případ je vyřešený, pachatele máme: {nazev}.",
    "Šetření skončilo úspěšně: {nazev}.",
  ],
  stopa_policie_hrac: [
    "Policie zjistila, kdo za tím stojí: {hrac}.",
    "Policejní šetření ukázalo na hráče z kádru: {hrac}.",
    "Policie má jasno. Udělal to hráč: {hrac}.",
  ],
```

- [ ] **Step 4: `vysetrovani-den.ts`**

```ts
/**
 * Denní část vyšetřování (spec 6b, kroky 2, 3 a 5): výsledky policie,
 * propadlé lhůty a pondělní srážky ze mzdy.
 */

import { createNotification } from "../community/notifications";
import { CATEGORIES, CATEGORY_LABELS } from "../equipment/equipment-generator";
import { createRng, type Rng } from "../generators/rng";
import type { Bindings } from "../index";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { sendSystemSMS } from "../messaging/system-sms";
import { recordTransaction } from "../season/finance-processor";
import { uzavriProsleIncidenty } from "./dopady";
import { SLOUPCE_INCIDENTU, type IncidentRadek } from "./incident-db";
import { nazevIncidentu } from "./katalog";
import {
  LHUTA_PO_POLICII_DNI, LHUTA_ROZHODNUTI_DNI, POVOLANI_POLICISTA, SMS_ROLE_POLICIE, SRAZKA_TYDNU,
} from "./nastaveni";
import { nactiZtraty } from "./popis";
import { nactiStopy, prikazyStop } from "./stopy-db";
import { text } from "./texty";
import { hodnotaSkody, splatkaSrazky } from "./tresty";
import { sancePolicie, vysledekPolicie } from "./vysetrovani";

const M = "incidents-vysetrovani";

interface Den {
  teamId: string;
  gameDate: string;
  seasonNumber: number;
}

type IncidentSeJmenem = IncidentRadek & { first_name: string | null; last_name: string | null };
type RadekSrazky = { id: string; resolution_data: string | null; first_name: string | null; last_name: string | null };

/** Přechod ze stavu `policie`. `nastav` je vždy konstanta z tohoto souboru, nikdy vstup. */
async function prechodZPolicie(db: D1Database, id: string, nastav: string, parametry: unknown[]): Promise<boolean> {
  const r = await db.prepare(`UPDATE club_incidents SET ${nastav} WHERE id = ? AND status = 'policie'`)
    .bind(...parametry, id).run()
    .catch((e) => { logger.error({ module: M }, `přechod incidentu ${id} z policie`, e); return null; });
  return (r?.meta?.changes ?? 0) > 0;
}

async function oznamVysledek(env: Bindings, teamId: string, incidentId: string, zprava: string): Promise<void> {
  await sendSystemSMS(env.DB, teamId, SMS_ROLE_POLICIE, `🚓 ${zprava}`)
    .catch((e) => logger.warn({ module: M }, `SMS policie ${incidentId}`, e));
  await createNotification(
    env.DB, teamId, "event", "🚓 Výsledek šetření", zprava.slice(0, 140),
    `/dashboard/incidenty?id=${encodeURIComponent(incidentId)}`, env,
  ).catch((e) => logger.warn({ module: M }, `notifikace policie ${incidentId}`, e));
}

/** Cizí pachatel dopaden: ukradené vybavení zpátky (jen když klub nemá stejné nebo lepší), za rozbité náhrada. */
async function vratZtraty(db: D1Database, t: Den, inc: IncidentRadek, nazev: string, rng: Rng): Promise<string[]> {
  const zpravy: string[] = [];
  let nahrada = 0;
  for (const z of nactiZtraty(inc.loss)) {
    if (z.typ !== "vybaveni") {
      // Rozbité se vrátit nedá, pachatel zaplatí polovinu až celou škodu.
      nahrada += Math.round((hodnotaSkody([z]) * rng.int(50, 100)) / 100);
      continue;
    }
    if (!(CATEGORIES as readonly string[]).includes(z.kategorie)) {
      logger.error({ module: M }, `neznámá kategorie vybavení ${z.kategorie} v ${inc.id}`);
      continue;
    }
    const vec = CATEGORY_LABELS[z.kategorie] ?? z.kategorie;
    const r = await db.prepare(
      `UPDATE equipment SET ${z.kategorie} = ?, ${z.kategorie}_condition = ? WHERE team_id = ? AND ${z.kategorie} < ?`,
    ).bind(z.uroven, z.stav, t.teamId, z.uroven).run()
      .catch((e) => { logger.error({ module: M }, `vrácení vybavení ${inc.id}`, e); return null; });
    zpravy.push(text(rng, (r?.meta?.changes ?? 0) > 0 ? "policie_vraceno" : "policie_lepsi", { vec }));
  }
  if (nahrada > 0) {
    await recordTransaction(db, t.teamId, "incident_recovery", nahrada, `Náhrada škody: ${nazev}`, t.gameDate, `nahrada-${inc.id}`)
      .catch((e) => logger.error({ module: M }, `náhrada škody ${inc.id}`, e));
    zpravy.push(text(rng, "policie_nahrada", { castka: nahrada.toLocaleString("cs-CZ") }));
  }
  if (zpravy.length === 0) zpravy.push(text(rng, "policie_dopaden", { nazev }));
  return zpravy;
}

export async function vyhodnotPolicii(env: Bindings, t: Den): Promise<number> {
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT ${SLOUPCE_INCIDENTU.map((s) => `i.${s}`).join(", ")},
            COALESCE(p.first_name, d.first_name) AS first_name, COALESCE(p.last_name, d.last_name) AS last_name
       FROM club_incidents i
       LEFT JOIN players p ON p.id = i.culprit_player_id
       LEFT JOIN departed_players d ON d.id = i.culprit_player_id
      WHERE i.team_id = ? AND i.season_number = ? AND i.status = 'policie' AND i.police_result_on <= ?`,
  ).bind(t.teamId, t.seasonNumber, t.gameDate).all<IncidentSeJmenem>()
    .catch((e) => { logger.warn({ module: M }, `šetření policie ${t.teamId}`, e); return { results: [] as IncidentSeJmenem[] }; });

  let vyrizeno = 0;
  for (const inc of rows.results) {
    const rng = createRng(seedFromString(`policie|${inc.id}`));
    // První číslo z generátoru je los šetření, na tom stojí determinismus i testy.
    const los = rng.random();
    const stopy = await nactiStopy(db, inc.id);
    const policista = await db.prepare(
      `SELECT 1 AS ano FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')
         AND json_extract(life_context, '$.occupation') = ? AND id != ? LIMIT 1`,
    ).bind(t.teamId, POVOLANI_POLICISTA, inc.culprit_player_id ?? "").first()
      .catch((e) => { logger.warn({ module: M }, `policista v kádru ${t.teamId}`, e); return null; });

    const vysledek = vysledekPolicie({
      udani: inc.resolution === "policie", pachatel: inc.culprit_type,
      sance: sancePolicie(stopy, policista !== null), los,
    });
    const nazev = nazevIncidentu(inc.kind);
    const hrac = [inc.first_name, inc.last_name].filter(Boolean).join(" ") || "hráč z kádru";

    let prosel = false;
    let zprava = "";
    switch (vysledek) {
      case "neuspech":
        prosel = await prechodZPolicie(db, inc.id, "status = 'otevreny', police_success = 0, deadline = ?", [gameExpiry(t.gameDate, LHUTA_PO_POLICII_DNI)]);
        zprava = text(rng, "policie_neuspech", { nazev });
        break;
      case "podminka":
        prosel = await prechodZPolicie(db, inc.id, "status = 'uzavreny', police_success = 1, resolved_on = ?", [t.gameDate]);
        zprava = text(rng, "policie_podminka", { hrac });
        break;
      case "odhalen_hrac":
        prosel = await prechodZPolicie(db, inc.id, "status = 'otevreny', police_success = 1, culprit_revealed = 1, deadline = ?", [gameExpiry(t.gameDate, LHUTA_ROZHODNUTI_DNI)]);
        zprava = text(rng, "policie_hrac", { hrac });
        if (prosel) {
          await db.batch(prikazyStop(db, t.teamId, inc.id, [{
            zdroj: "policie", ukazujeNa: inc.culprit_player_id, podezreli: null, drzitel: null,
            sila: 3, bonusPolicie: 0, nalezena: true, text: text(rng, "stopa_policie_hrac", { hrac }),
          }], t.gameDate)).catch((e) => logger.warn({ module: M }, `stopa policie ${inc.id}`, e));
        }
        break;
      case "nehoda":
        prosel = await prechodZPolicie(db, inc.id, "status = 'uzavreny', police_success = 1, resolution = 'nehoda', resolved_on = ?", [t.gameDate]);
        zprava = text(rng, "policie_nehoda", { nazev });
        break;
      case "dopaden_cizi":
        prosel = await prechodZPolicie(db, inc.id, "status = 'uzavreny', police_success = 1, recovered = 1, resolution = 'vyreseno_policii', resolved_on = ?", [t.gameDate]);
        if (prosel) zprava = (await vratZtraty(db, t, inc, nazev, rng)).join(" ");
        break;
    }
    if (!prosel) continue;
    await oznamVysledek(env, t.teamId, inc.id, zprava);
    vyrizeno++;
  }
  return vyrizeno;
}

function nactiSrazku(raw: string | null): { celkem: number; tydnuZbyva: number } | null {
  try {
    const v = JSON.parse(raw ?? "") as { celkem?: unknown; tydnuZbyva?: unknown };
    if (typeof v.celkem === "number" && typeof v.tydnuZbyva === "number") return { celkem: v.celkem, tydnuZbyva: v.tydnuZbyva };
    logger.warn({ module: M }, "srážka bez částky nebo počtu týdnů");
    return null;
  } catch (e) {
    logger.warn({ module: M }, "nečitelná srážka", e);
    return null;
  }
}

export async function zauctujSrazky(env: Bindings, t: { teamId: string; gameDate: string }): Promise<number> {
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT i.id, i.resolution_data, p.first_name, p.last_name
       FROM club_incidents i
       LEFT JOIN players p ON p.id = i.culprit_player_id AND p.team_id = i.team_id
      WHERE i.team_id = ? AND i.resolution = 'srazka' AND COALESCE(json_extract(i.resolution_data, '$.tydnuZbyva'), 0) > 0`,
  ).bind(t.teamId).all<RadekSrazky>()
    .catch((e) => { logger.warn({ module: M }, `srážky ${t.teamId}`, e); return { results: [] as RadekSrazky[] }; });

  let zauctovano = 0;
  for (const r of rows.results) {
    const data = nactiSrazku(r.resolution_data);
    if (!data) continue;
    if (!r.first_name) {
      // Hráč už v klubu není: srážka odchodem končí (spec 7d).
      await db.prepare("UPDATE club_incidents SET resolution_data = json_set(resolution_data, '$.tydnuZbyva', 0) WHERE id = ?")
        .bind(r.id).run()
        .catch((e) => logger.warn({ module: M }, `ukončení srážky ${r.id}`, e));
      continue;
    }
    const narok = await db.prepare(
      "UPDATE club_incidents SET resolution_data = json_set(resolution_data, '$.tydnuZbyva', ?) WHERE id = ? AND json_extract(resolution_data, '$.tydnuZbyva') = ?",
    ).bind(data.tydnuZbyva - 1, r.id, data.tydnuZbyva).run()
      .catch((e) => { logger.error({ module: M }, `nárok na srážku ${r.id}`, e); return null; });
    if ((narok?.meta?.changes ?? 0) === 0) continue;

    const castka = splatkaSrazky(data.celkem, data.tydnuZbyva);
    const tyden = SRAZKA_TYDNU - data.tydnuZbyva + 1;
    if (castka > 0) {
      const jmeno = [r.first_name, r.last_name].filter(Boolean).join(" ");
      await recordTransaction(db, t.teamId, "incident_deduction", castka, `Srážka ze mzdy (${tyden}/${SRAZKA_TYDNU}): ${jmeno}`, t.gameDate, `srazka-${r.id}-t${tyden}`)
        .catch((e) => logger.error({ module: M }, `srážka ${r.id}`, e));
    }
    zauctovano++;
  }
  return zauctovano;
}

export async function zpracujVysetrovani(
  env: Bindings, t: Den, opts: { pondeli: boolean },
): Promise<{ policie: number; uzavreno: number; srazky: number }> {
  // Nejdřív policie: neúspěšné šetření vrací incident s novou lhůtou, ta se pak nesmí hned zavřít.
  const policie = await vyhodnotPolicii(env, t);
  const uzavreno = await uzavriProsleIncidenty(env, t);
  const srazky = opts.pondeli ? await zauctujSrazky(env, t) : 0;
  return { policie, uzavreno, srazky };
}
```

- [ ] **Step 5: Zapojení do denního kroku**

V `apps/api/src/incidents/denni-krok.ts` nahraď import `uzavriProsleIncidenty` (zůstává `oznamIncident, zapisIncident` z `./dopady`), přidej `import { zpracujVysetrovani } from "./vysetrovani-den";` a volání

```ts
  // Nejdřív uzavřít staré, aby se uvolnil limit otevřených problémů.
  await uzavriProsleIncidenty(env, { teamId, gameDate, seasonNumber: sezona.number });
```

nahraď:

```ts
  // Nejdřív vyšetřování: výsledky policie, propadlé lhůty (uvolní limit otevřených
  // problémů) a v pondělí srážky ze mzdy.
  await zpracujVysetrovani(env, { teamId, gameDate, seasonNumber: sezona.number }, { pondeli: new Date(gameDate).getUTCDay() === 1 });
```

Uprav i JSDoc souboru: „Incidenty jednoho klubu za jeden herní den (spec Část 6b, fáze 1 a 2)."

- [ ] **Step 6: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/incidents/vysetrovani-den.ts apps/api/src/incidents/vysetrovani-den.test.ts apps/api/src/incidents/denni-krok.ts apps/api/src/incidents/texty.ts
git commit -F - <<'EOF'
feat(incidenty): denni vysledky policie a pondelni srazky ze mzdy

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 8: API detailu, akcí a admin vyšetřování

**Files:**
- Modify: `apps/api/src/routes/incidents.ts`
- Create: `apps/api/src/routes/incidents.test.ts`

**Interfaces:**
- Consumes: `obvinHrace`, `zavolejPolicii`, `rozhodni`, `VysledekAkce` (akce.ts); `zpracujVysetrovani` (vysetrovani-den.ts); `nactiStopy` (stopy-db.ts); `SLOUPCE_INCIDENTU`, `IncidentRadek`, `proAkce` (incident-db.ts); `stavVysetrovani`, `dostupneAkce`, `nactiObvineni`, `AKCE_TRESTU` (vysetrovani.ts); `hodnotaSkody`, `castkaSrazky`, `castkaPokuty` (tresty.ts); `MAX_OBVINENI`, `SRAZKA_TYDNU` (nastaveni.ts).
- Produces:
  - `GET /api/teams/:teamId/incidents/:id` → `{ incident, vysetrovani: { stav, podezreli: [{playerId, jmeno}] }, stopy: [{zdroj, text, sila}], obvineni: Obvineni[], policie: { vysledekOn, vysledek }, akce: { obvinit, policie, tresty }, zbyvaObvineni, kadr: [{playerId, jmeno}], castky: { srazka, pokuta, tydnu } | null }`
  - `POST /api/teams/:teamId/incidents/:id/obvinit` `{ playerId }` → `{ ok, vysledek, odhalen }`
  - `POST /api/teams/:teamId/incidents/:id/policie` → `{ ok, vysledekOn }`
  - `POST /api/teams/:teamId/incidents/:id/rozhodnuti` `{ akce }` → `{ ok, castka }`
  - `POST /api/admin/incidents/vysetrovani` `{ teamId, policieTed?, srazky? }` → `{ ok, policie, uzavreno, srazky }`
  - chyby akcí `{ error }` se stavem 400/404/409/500

- [ ] **Step 1: Failing test**

`apps/api/src/routes/incidents.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../auth/divak", () => ({ tymyDivaka: vi.fn(async () => new Set(["tym-a"])) }));

import { FalesnaD1, jakoD1, type Pravidlo } from "../incidents/testovaci-d1";
import { incidentRadek } from "../incidents/testovaci-stav";
import type { Bindings } from "../index";
import { incidentsRouter } from "./incidents";

function env(pravidla: Pravidlo[]): Bindings {
  return { DB: jakoD1(new FalesnaD1(pravidla)), SESSION_KV: { get: async () => null } } as unknown as Bindings;
}

const NENALEZENA = {
  id: "inc-1-svedek-1", source: "svedek", points_to_player_id: "p", suspects: null, holder_player_id: "a",
  strength: 2, police_bonus: 0.1, text: "TAJNA_STOPA.", found: 0,
};
const NALEZENA = {
  id: "inc-1-soused-1", source: "soused", points_to_player_id: null, suspects: '["p","a"]', holder_player_id: null,
  strength: 1, police_bonus: 0.15, text: "Soused něco viděl.", found: 1,
};
const KADR = [
  { id: "a", first_name: "Adam", last_name: "Kos", weekly_wage: 90 },
  { id: "p", first_name: "Pepa", last_name: "Průšvih", weekly_wage: 100 },
];

describe("detail incidentu", () => {
  it("cizí tým detail neuvidí", async () => {
    const res = await incidentsRouter.request("/teams/tym-b/incidents/inc-1", {}, env([]));
    expect(res.status).toBe(403);
  });

  it("neprozradí neodhaleného pachatele, nenalezenou stopu ani držitele stop", async () => {
    const res = await incidentsRouter.request("/teams/tym-a/incidents/inc-1", {}, env([
      { sql: /FROM club_incidents i/, first: { ...incidentRadek(), jmeno: "Pepa", prijmeni: "Průšvih" } },
      { sql: /FROM club_incident_clues/, all: [NENALEZENA, NALEZENA] },
      { sql: /FROM players WHERE team_id = \?/, all: KADR },
    ]));
    expect(res.status).toBe(200);
    const telo = await res.json() as Record<string, any>;
    expect(telo.incident.pachatel).toBeNull();
    expect(JSON.stringify(telo)).not.toContain("TAJNA_STOPA");
    expect(telo.stopy).toEqual([{ zdroj: "soused", text: "Soused něco viděl.", sila: 1 }]);
    expect(telo.vysetrovani).toEqual({
      stav: "podezreli",
      podezreli: [{ playerId: "a", jmeno: "Adam Kos" }, { playerId: "p", jmeno: "Pepa Průšvih" }],
    });
    expect(telo.akce).toEqual({ obvinit: true, policie: true, tresty: [] });
    expect(telo.zbyvaObvineni).toBe(2);
    expect(telo.kadr).toHaveLength(2);
    expect(telo.castky).toBeNull();
  });

  it("u odhaleného pachatele v kádru nabídne tresty s částkami", async () => {
    const res = await incidentsRouter.request("/teams/tym-a/incidents/inc-1", {}, env([
      { sql: /FROM club_incidents i/, first: { ...incidentRadek({ culprit_revealed: 1 }), jmeno: "Pepa", prijmeni: "Průšvih" } },
      { sql: /FROM players WHERE team_id = \?/, all: KADR },
    ]));
    const telo = await res.json() as Record<string, any>;
    expect(telo.incident.pachatel).toEqual({ playerId: "p", jmeno: "Pepa Průšvih" });
    expect(telo.akce.tresty).toContain("pokuta");
    expect(telo.castky).toEqual({ srazka: 400, pokuta: 200, tydnu: 4 });
    expect(telo.kadr).toEqual([]);
  });

  it("akce bez přihlášení neprojdou", async () => {
    for (const cesta of ["obvinit", "policie", "rozhodnuti"]) {
      const res = await incidentsRouter.request(`/teams/tym-a/incidents/inc-1/${cesta}`, { method: "POST", body: "{}" }, env([]));
      expect(res.status).toBe(401);
    }
  });
});
```

- [ ] **Step 2: Spusť, musí selhat**

Run: `cd apps/api && npx vitest run src/routes/incidents.test.ts`
Expected: FAIL (detail vrací 404, POST routy neexistují).

- [ ] **Step 3: Routy**

V `apps/api/src/routes/incidents.ts`:

1. Importy uprav a doplň:

```ts
import { Hono, type Context } from "hono";
import { tymyDivaka } from "../auth/divak";
import { requireAdmin, requireTeamOwnership } from "../auth/middleware";
import { obvinHrace, rozhodni, zavolejPolicii, type VysledekAkce } from "../incidents/akce";
import { SLOUPCE_INCIDENTU, proAkce, type IncidentRadek } from "../incidents/incident-db";
import { MAX_OBVINENI, SRAZKA_TYDNU } from "../incidents/nastaveni";
import { nactiStopy } from "../incidents/stopy-db";
import { castkaPokuty, castkaSrazky, hodnotaSkody } from "../incidents/tresty";
import { zpracujVysetrovani } from "../incidents/vysetrovani-den";
import { AKCE_TRESTU, dostupneAkce, nactiObvineni, stavVysetrovani } from "../incidents/vysetrovani";
```

2. Pod `incidentsRouter.use("/admin/incidents/*", requireAdmin);` přidej:

```ts
// Akce nad incidentem smí jen vlastník týmu. GET middleware pustí, detail si vlastnictví ověří sám.
incidentsRouter.use("/teams/:teamId/incidents/*", requireTeamOwnership);
```

3. Za route `GET /teams/:teamId/incidents` přidej:

```ts
type RadekDetailu = IncidentRadek & { jmeno: string | null; prijmeni: string | null };
type HracKadruRadek = { id: string; first_name: string; last_name: string; weekly_wage: number | null };

// ── GET /api/teams/:teamId/incidents/:id ─────────────────────────────────────
incidentsRouter.get("/teams/:teamId/incidents/:id", async (c) => {
  const teamId = c.req.param("teamId");
  const incidentId = c.req.param("id");
  if (!(await tymyDivaka(c)).has(teamId)) return c.json({ error: "Přístup odepřen" }, 403);
  const db = c.env.DB;

  const row = await db.prepare(
    `SELECT ${SLOUPCE_INCIDENTU.map((s) => `i.${s}`).join(", ")},
            COALESCE(p.first_name, d.first_name) AS jmeno, COALESCE(p.last_name, d.last_name) AS prijmeni
       FROM club_incidents i
       LEFT JOIN players p ON p.id = i.culprit_player_id
       LEFT JOIN departed_players d ON d.id = i.culprit_player_id
      WHERE i.id = ? AND i.team_id = ?`,
  ).bind(incidentId, teamId).first<RadekDetailu>()
    .catch((e) => { logger.warn({ module: M }, `detail incidentu ${incidentId}`, e); return null; });
  if (!row) return c.json({ error: "Incident nenalezen" }, 404);

  const stopy = await nactiStopy(db, incidentId);
  const kadr = await db.prepare(
    "SELECT id, first_name, last_name, weekly_wage FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY last_name, first_name",
  ).bind(teamId).all<HracKadruRadek>()
    .catch((e) => { logger.warn({ module: M }, `kádr k incidentu ${incidentId}`, e); return { results: [] as HracKadruRadek[] }; });
  const jmena = new Map(kadr.results.map((h) => [h.id, `${h.first_name} ${h.last_name}`]));

  const odhalen = row.culprit_revealed === 1;
  const pachatelVKadru = odhalen && !!row.culprit_player_id && jmena.has(row.culprit_player_id);
  const akce = dostupneAkce(proAkce(row, pachatelVKadru));
  const vysetrovani = stavVysetrovani(stopy, odhalen);

  let castky: { srazka: number; pokuta: number; tydnu: number } | null = null;
  if (akce.tresty.length > 0) {
    const mzda = kadr.results.find((h) => h.id === row.culprit_player_id)?.weekly_wage ?? 0;
    const skoda = hodnotaSkody(nactiZtraty(row.loss));
    castky = { srazka: castkaSrazky(skoda, mzda), pokuta: castkaPokuty(skoda, mzda), tydnu: SRAZKA_TYDNU };
  }

  return c.json({
    incident: verejnyIncident(row),
    vysetrovani: {
      stav: vysetrovani.stav,
      podezreli: vysetrovani.podezreli.map((playerId) => ({ playerId, jmeno: jmena.get(playerId) ?? null })),
    },
    // Jen nalezené stopy a bez držitelů: kdo co ví, zjistí manažer až vyšetřováním.
    stopy: stopy.filter((s) => s.nalezena).map((s) => ({ zdroj: s.zdroj, text: s.text, sila: s.sila })),
    obvineni: nactiObvineni(row.accused),
    policie: { vysledekOn: row.status === "policie" ? row.police_result_on : null, vysledek: row.police_success },
    akce,
    zbyvaObvineni: Math.max(0, MAX_OBVINENI - row.accusations),
    kadr: akce.obvinit ? kadr.results.map((h) => ({ playerId: h.id, jmeno: `${h.first_name} ${h.last_name}` })) : [],
    castky,
  });
});

function odpovedAkce(c: Context<{ Bindings: Bindings }>, v: VysledekAkce) {
  return v.ok ? c.json(v) : c.json({ error: v.chyba }, v.kod);
}

async function teloPozadavku<T>(c: Context<{ Bindings: Bindings }>, co: string): Promise<T | null> {
  return c.req.json<T>().catch((e) => { logger.warn({ module: M }, `${co}: neplatné tělo`, e); return null; });
}

// ── POST /api/teams/:teamId/incidents/:id/obvinit ───────────────────────────
incidentsRouter.post("/teams/:teamId/incidents/:id/obvinit", async (c) => {
  const body = await teloPozadavku<{ playerId?: string }>(c, "obvinění");
  if (!body?.playerId) return c.json({ error: "Vyber hráče, kterého chceš obvinit" }, 400);
  return odpovedAkce(c, await obvinHrace(c.env, c.req.param("teamId"), c.req.param("id"), body.playerId));
});

// ── POST /api/teams/:teamId/incidents/:id/policie ───────────────────────────
incidentsRouter.post("/teams/:teamId/incidents/:id/policie", async (c) =>
  odpovedAkce(c, await zavolejPolicii(c.env, c.req.param("teamId"), c.req.param("id"))));

// ── POST /api/teams/:teamId/incidents/:id/rozhodnuti ────────────────────────
incidentsRouter.post("/teams/:teamId/incidents/:id/rozhodnuti", async (c) => {
  const body = await teloPozadavku<{ akce?: string }>(c, "rozhodnutí");
  const akce = AKCE_TRESTU.find((a) => a === body?.akce);
  if (!akce) return c.json({ error: "Neznámé rozhodnutí" }, 400);
  return odpovedAkce(c, await rozhodni(c.env, c.req.param("teamId"), c.req.param("id"), akce));
});
```

4. Na konec souboru přidej admin route:

```ts
// ── POST /api/admin/incidents/vysetrovani ────────────────────────────────────
// Jen pro ověření na testingu: spustí denní vyšetřování klubu hned. `policieTed`
// posune výsledky probíhajících šetření na dnešek, `srazky` zaúčtuje srážky i mimo pondělí.
incidentsRouter.post("/admin/incidents/vysetrovani", async (c) => {
  const body = await teloPozadavku<{ teamId?: string; policieTed?: boolean; srazky?: boolean }>(c, "admin vyšetřování");
  if (!body?.teamId) return c.json({ error: "Chybí teamId" }, 400);
  const db = c.env.DB;

  const team = await db.prepare("SELECT id, game_date FROM teams WHERE id = ?").bind(body.teamId)
    .first<{ id: string; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "admin vyšetřování: tým", e); return null; });
  if (!team?.game_date) return c.json({ error: "Tým nenalezen nebo nemá herní datum" }, 404);
  const sezona = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>()
    .catch((e) => { logger.warn({ module: M }, "admin vyšetřování: sezóna", e); return null; });
  if (!sezona) return c.json({ error: "Není aktivní sezóna" }, 500);

  if (body.policieTed) {
    await db.prepare("UPDATE club_incidents SET police_result_on = ? WHERE team_id = ? AND status = 'policie'")
      .bind(team.game_date, team.id).run()
      .catch((e) => logger.warn({ module: M }, "admin vyšetřování: posun výsledku policie", e));
  }
  const vysledek = await zpracujVysetrovani(
    c.env, { teamId: team.id, gameDate: team.game_date, seasonNumber: sezona.number }, { pondeli: !!body.srazky },
  );
  return c.json({ ok: true, ...vysledek });
});
```

- [ ] **Step 4: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents src/routes/incidents.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/incidents.ts apps/api/src/routes/incidents.test.ts
git commit -F - <<'EOF'
feat(incidenty): API detailu incidentu, obvineni, policie a trestu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 9: Stránka Incidenty: detail, vyšetřování a akce

**Files:**
- Create: `apps/web/src/app/dashboard/incidenty/typy.ts`, `apps/web/src/app/dashboard/incidenty/DetailIncidentu.tsx`
- Modify (přepsat celý soubor): `apps/web/src/app/dashboard/incidenty/page.tsx`

**Interfaces:**
- Consumes: API z Tasku 8 (tvary odpovědí přesně podle Interfaces Tasku 8); `apiFetch<T>(path, init)` (`@/lib/api`, při chybě hází `Error` s českou hláškou z API); `useTeam()` → `{ teamId }`; `Spinner`, `SectionLabel` (`@/components/ui`).
- Produces: `/dashboard/incidenty` (seznam) a `/dashboard/incidenty?id=<incidentId>` (detail). Odkaz s `?id=` už posílají notifikace.

- [ ] **Step 1: `typy.ts`**

```ts
/** Typy a popisky stránky Incidenty. Klíče odpovídají API (apps/api/src/routes/incidents.ts). */

export type StavIncidentu = "hrozi" | "otevreny" | "policie" | "probiha" | "uzavreny";
export type AkceTrestu = "odpustit" | "srazka" | "pokuta" | "vyhodit" | "policie" | "nechat_byt";
export type VysledekObvineni = "priznal" | "usvedcen" | "zapira";

export interface Incident {
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

export interface DetailIncidentuData {
  incident: Incident;
  vysetrovani: { stav: "znamy" | "podezreli" | "neznamy"; podezreli: Array<{ playerId: string; jmeno: string | null }> };
  stopy: Array<{ zdroj: string; text: string; sila: number }>;
  obvineni: Array<{ playerId: string; jmeno: string; den: string; vysledek: VysledekObvineni }>;
  policie: { vysledekOn: string | null; vysledek: number | null };
  akce: { obvinit: boolean; policie: boolean; tresty: AkceTrestu[] };
  zbyvaObvineni: number;
  kadr: Array<{ playerId: string; jmeno: string }>;
  castky: { srazka: number; pokuta: number; tydnu: number } | null;
}

export const STAV_LABEL: Record<StavIncidentu, string> = {
  hrozi: "Hrozí", otevreny: "Řeší se", policie: "Šetří policie", probiha: "Probíhá", uzavreny: "Uzavřeno",
};

export const STAV_TRIDA: Record<StavIncidentu, string> = {
  hrozi: "bg-amber-100 text-amber-700",
  otevreny: "bg-red-100 text-red-700",
  policie: "bg-blue-100 text-blue-700",
  probiha: "bg-amber-100 text-amber-700",
  uzavreny: "bg-gray-100 text-muted",
};

export const VYSLEDEK_LABEL: Record<string, string> = {
  nevyreseno: "Nevyřešeno",
  konec_sezony: "Uzavřeno koncem sezóny",
  bez_skody: "Bez škody",
  nechat_byt: "Trenér to nechal být",
  odpustit: "Trenér odpustil",
  srazka: "Srážka ze mzdy",
  pokuta: "Pokuta",
  vyhodit: "Hráč vyhozen",
  policie: "Předáno policii",
  vyreseno_policii: "Vyřešila policie",
  nehoda: "Byla to nehoda",
};

export const TREST_LABEL: Record<AkceTrestu, string> = {
  odpustit: "Odpustit",
  srazka: "Srážka ze mzdy",
  pokuta: "Pokuta",
  vyhodit: "Vyhodit z klubu",
  policie: "Předat policii",
  nechat_byt: "Nechat to být",
};

export const TREST_HOTOVO: Record<AkceTrestu, string> = {
  odpustit: "Odpuštěno.",
  srazka: "Srážka se bude strhávat každé pondělí.",
  pokuta: "Pokuta je zaplacená.",
  vyhodit: "Hráč z klubu odešel.",
  policie: "Předáno policii, výsledek přijde do týdne.",
  nechat_byt: "Necháno být.",
};

export const ZDROJ_EMOJI: Record<string, string> = {
  kamera: "📹", spravce: "🧹", soused: "🏠", svedek: "👀", kamarad: "🤝",
  rival: "😠", hospoda: "🍺", bazar: "🛒", policie: "🚓", priznani: "✋",
};

export const OBVINENI_LABEL: Record<VysledekObvineni, string> = {
  priznal: "přiznal se",
  usvedcen: "stopy ho usvědčily",
  zapira: "zapírá",
};

export function datum(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", timeZone: "UTC" });
}

export function kc(castka: number): string {
  return `${castka.toLocaleString("cs-CZ")} Kč`;
}
```

- [ ] **Step 2: `DetailIncidentu.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel } from "@/components/ui";
import {
  datum, kc, OBVINENI_LABEL, STAV_LABEL, STAV_TRIDA, TREST_HOTOVO, TREST_LABEL, VYSLEDEK_LABEL, ZDROJ_EMOJI,
  type AkceTrestu, type DetailIncidentuData, type VysledekObvineni,
} from "./typy";

const ODKAZ_HRACE = "text-base font-heading font-bold underline decoration-pitch-500/20 hover:text-pitch-500";

function Hrac({ playerId, jmeno }: { playerId: string; jmeno: string }) {
  return <Link href={`/dashboard/player/${playerId}`} className={ODKAZ_HRACE}>{jmeno}</Link>;
}

export function DetailIncidentu({ teamId, incidentId, onZmena }: { teamId: string; incidentId: string; onZmena: () => void }) {
  const [detail, setDetail] = useState<DetailIncidentuData | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [zprava, setZprava] = useState<{ typ: "ok" | "chyba"; text: string } | null>(null);
  const [pracuje, setPracuje] = useState(false);
  const [obvinenyId, setObvinenyId] = useState("");
  const [potvrditVyhazov, setPotvrditVyhazov] = useState(false);

  const cesta = `/api/teams/${teamId}/incidents/${encodeURIComponent(incidentId)}`;

  const nacti = useCallback(() => {
    apiFetch<DetailIncidentuData>(cesta)
      .then((d) => { setDetail(d); setChyba(null); })
      .catch((e) => {
        console.error("incident detail fetch:", e);
        setChyba(e instanceof Error ? e.message : "Incident se nepodařilo načíst.");
      });
  }, [cesta]);

  useEffect(() => { nacti(); }, [nacti]);

  async function proved(akce: string, telo: Record<string, string> | null, hotovo: (odpoved: Record<string, unknown>) => string) {
    setPracuje(true);
    setZprava(null);
    try {
      const odpoved = await apiFetch<Record<string, unknown>>(`${cesta}/${akce}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telo ?? {}),
      });
      setZprava({ typ: "ok", text: hotovo(odpoved) });
      setPotvrditVyhazov(false);
      setObvinenyId("");
      nacti();
      onZmena();
    } catch (e) {
      console.error(`incident ${akce}:`, e);
      setZprava({ typ: "chyba", text: e instanceof Error ? e.message : "Akci se nepodařilo provést." });
    } finally {
      setPracuje(false);
    }
  }

  if (chyba) return <div className="card p-4 text-sm text-muted">{chyba}</div>;
  if (!detail) return <div className="flex justify-center py-10"><Spinner /></div>;

  const { incident: i, vysetrovani: v, akce } = detail;
  const vysledek = i.status === "uzavreny" && i.resolution ? VYSLEDEK_LABEL[i.resolution] : undefined;
  const vysetruje = i.category === "kradez" || i.category === "poskozeni";
  const maAkce = akce.obvinit || akce.policie || akce.tresty.length > 0;
  const podezreli = v.podezreli.filter((p): p is { playerId: string; jmeno: string } => !!p.jmeno);

  function obvinit() {
    const jmeno = detail?.kadr.find((h) => h.playerId === obvinenyId)?.jmeno ?? "Hráč";
    void proved("obvinit", { playerId: obvinenyId }, (o) => `${jmeno}: ${OBVINENI_LABEL[o.vysledek as VysledekObvineni] ?? "hotovo"}.`);
  }

  function rozhodnout(a: AkceTrestu) {
    void proved("rozhodnuti", { akce: a }, () => TREST_HOTOVO[a]);
  }

  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>{i.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading font-bold text-lg">{i.label}</h1>
            <span className={`text-sm font-heading font-bold px-2 py-0.5 rounded-full ${STAV_TRIDA[i.status]}`}>{STAV_LABEL[i.status]}</span>
          </div>
          <div className="text-sm text-muted">
            {datum(i.gameDate)}
            {i.status === "otevreny" && i.deadline && ` · rozhodni do ${datum(i.deadline)}`}
            {vysledek && ` · ${vysledek}`}
          </div>
        </div>
      </div>

      <p className="text-sm">{i.text}</p>
      {i.ztraty.length > 0 && (
        <ul className="space-y-1">
          {i.ztraty.map((z, n) => <li key={n} className="text-sm text-card-red">{z}</li>)}
        </ul>
      )}

      {vysetruje && (
        <div>
          <SectionLabel>Vyšetřování</SectionLabel>
          {v.stav === "znamy" && i.pachatel?.jmeno ? (
            <p className="text-sm">Pachatel: <Hrac playerId={i.pachatel.playerId} jmeno={i.pachatel.jmeno} /></p>
          ) : podezreli.length > 0 ? (
            <p className="text-sm">
              Podezřelí:{" "}
              {podezreli.map((p, n) => (
                <span key={p.playerId}>{n > 0 && ", "}<Hrac playerId={p.playerId} jmeno={p.jmeno} /></span>
              ))}
            </p>
          ) : (
            <p className="text-sm text-muted">Kdo za tím stojí, zatím nikdo neví.</p>
          )}

          {detail.stopy.length > 0 && (
            <ul className="mt-3 space-y-2">
              {detail.stopy.map((s, n) => (
                <li key={n} className="flex gap-2 text-sm">
                  <span aria-hidden>{ZDROJ_EMOJI[s.zdroj] ?? "🔎"}</span>
                  <span>{s.text}</span>
                </li>
              ))}
            </ul>
          )}

          {detail.obvineni.length > 0 && (
            <ul className="mt-3 space-y-1">
              {detail.obvineni.map((o, n) => (
                <li key={n} className="text-sm">
                  Obvinění {datum(o.den)}: <Hrac playerId={o.playerId} jmeno={o.jmeno} />, {OBVINENI_LABEL[o.vysledek]}.
                </li>
              ))}
            </ul>
          )}

          {i.status === "policie" && detail.policie.vysledekOn && (
            <p className="text-sm mt-3">🚓 Případ šetří policie. Výsledek do {datum(detail.policie.vysledekOn)}.</p>
          )}
        </div>
      )}

      {maAkce && (
        <div className="border-t border-gray-100 pt-4 space-y-5">
          {akce.obvinit && (
            <div className="space-y-2">
              <SectionLabel>Obvinit hráče</SectionLabel>
              <p className="text-sm text-muted">
                Zbývá obvinění: {detail.zbyvaObvineni}. Nevinného hráče obvinění hodně urazí a kabina to ponese špatně.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={obvinenyId}
                  onChange={(e) => setObvinenyId(e.target.value)}
                  className="flex-1 min-w-0 rounded-soft border border-gray-200 bg-white px-3 py-2 text-base"
                >
                  <option value="">Vyber hráče</option>
                  {detail.kadr.map((h) => <option key={h.playerId} value={h.playerId}>{h.jmeno}</option>)}
                </select>
                <button
                  onClick={obvinit}
                  disabled={pracuje || !obvinenyId}
                  className="px-4 py-2 rounded-soft text-sm font-heading font-bold bg-card-red text-white disabled:opacity-50"
                >
                  Obvinit
                </button>
              </div>
            </div>
          )}

          {akce.policie && (
            <div className="space-y-2">
              <SectionLabel>Policie</SectionLabel>
              <p className="text-sm text-muted">
                Policie případ převezme a výsledek oznámí za 3 až 7 dní. Čím víc stop, tím větší šance, že pachatele najde. Zavolat ji jde jen jednou.
              </p>
              <button
                onClick={() => void proved("policie", null, (o) => `Policie případ převzala. Výsledek do ${datum(String(o.vysledekOn))}.`)}
                disabled={pracuje}
                className="w-full sm:w-auto px-4 py-2 rounded-soft text-sm font-heading font-bold bg-blue-600 text-white disabled:opacity-50"
              >
                Zavolat policii
              </button>
            </div>
          )}

          {akce.tresty.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>Co s pachatelem</SectionLabel>
              <ul className="text-sm text-muted space-y-1">
                {detail.castky && akce.tresty.includes("srazka") && (
                  <li>Srážka ze mzdy: celkem {kc(detail.castky.srazka)} během {detail.castky.tydnu} týdnů.</li>
                )}
                {detail.castky && akce.tresty.includes("pokuta") && <li>Pokuta: {kc(detail.castky.pokuta)} najednou.</li>}
                {akce.tresty.includes("policie") && <li>Předat policii: soud mu dá podmínku, v klubu zůstane.</li>}
                {akce.tresty.includes("vyhodit") && <li>Vyhodit: hráč odejde mezi volné hráče.</li>}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                {akce.tresty.filter((a) => a !== "vyhodit").map((a) => (
                  <button
                    key={a}
                    onClick={() => rozhodnout(a)}
                    disabled={pracuje}
                    className="px-3 py-2 rounded-soft text-sm font-heading font-bold border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {TREST_LABEL[a]}
                  </button>
                ))}
              </div>
              {akce.tresty.includes("vyhodit") && (potvrditVyhazov ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => rozhodnout("vyhodit")}
                    disabled={pracuje}
                    className="flex-1 px-3 py-2 rounded-soft text-sm font-heading font-bold bg-card-red text-white disabled:opacity-50"
                  >
                    Ano, vyhodit
                  </button>
                  <button
                    onClick={() => setPotvrditVyhazov(false)}
                    disabled={pracuje}
                    className="flex-1 px-3 py-2 rounded-soft text-sm font-heading font-bold border border-gray-200"
                  >
                    Zpět
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setPotvrditVyhazov(true)}
                  disabled={pracuje}
                  className="w-full px-3 py-2 rounded-soft text-sm font-heading font-bold border border-red-200 text-card-red disabled:opacity-50"
                >
                  {TREST_LABEL.vyhodit}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {zprava && (
        <p className={`text-sm ${zprava.typ === "ok" ? "text-pitch-600" : "text-card-red"}`}>{zprava.text}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `page.tsx` (celý soubor)**

```tsx
"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel } from "@/components/ui";
import { DetailIncidentu } from "./DetailIncidentu";
import { datum, STAV_LABEL, STAV_TRIDA, VYSLEDEK_LABEL, type Incident } from "./typy";

interface Poskozeni {
  id: string;
  facility: string;
  label: string;
  levels: number;
  cost: number;
  popis: string;
  gameDate: string | null;
}

const NACITANI = <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

export default function IncidentyStranka() {
  return <Suspense fallback={NACITANI}><Incidenty /></Suspense>;
}

function Incidenty() {
  const { teamId } = useTeam();
  const vybrane = useSearchParams().get("id");
  const [incidenty, setIncidenty] = useState<Incident[] | null>(null);
  const [chyba, setChyba] = useState(false);
  const [poskozeni, setPoskozeni] = useState<Poskozeni[]>([]);
  const [opravujeId, setOpravujeId] = useState<string | null>(null);
  const [opravaZprava, setOpravaZprava] = useState<{ typ: "ok" | "chyba"; text: string } | null>(null);

  const nactiSeznam = useCallback(() => {
    if (!teamId) return;
    apiFetch<{ incidents: Incident[] }>(`/api/teams/${teamId}/incidents`)
      .then((d) => { setIncidenty(d.incidents); setChyba(false); })
      .catch((e) => { console.error("incidents fetch:", e); setChyba(true); });
  }, [teamId]);

  useEffect(() => { nactiSeznam(); }, [nactiSeznam]);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ damage?: Poskozeni[] }>(`/api/teams/${teamId}/fans/groups`)
      .then((d) => setPoskozeni(d.damage ?? []))
      .catch((e) => console.error("damage fetch:", e));
  }, [teamId]);

  async function opravit(p: Poskozeni) {
    if (!teamId) return;
    setOpravujeId(p.id);
    setOpravaZprava(null);
    try {
      await apiFetch(`/api/teams/${teamId}/fans/repair/${p.id}`, { method: "POST" });
      setPoskozeni((list) => list.filter((x) => x.id !== p.id));
      setOpravaZprava({ typ: "ok", text: `Opraveno: ${p.label}.` });
    } catch (e) {
      console.error("repair:", e);
      setOpravaZprava({ typ: "chyba", text: e instanceof Error ? e.message : "Opravu se nepodařilo provést." });
    } finally {
      setOpravujeId(null);
    }
  }

  if (vybrane && teamId) {
    return (
      <div className="page-container space-y-4">
        <Link href="/dashboard/incidenty" className="inline-block text-sm font-heading font-bold text-pitch-600 hover:text-pitch-500">
          ← Všechny incidenty
        </Link>
        <DetailIncidentu key={vybrane} teamId={teamId} incidentId={vybrane} onZmena={nactiSeznam} />
      </div>
    );
  }

  if (chyba) {
    return <div className="page-container"><div className="card p-4 text-sm text-muted">Incidenty se nepodařilo načíst.</div></div>;
  }
  if (!incidenty) return NACITANI;

  const zive = incidenty.filter((i) => i.status !== "uzavreny");
  const uzavrene = incidenty.filter((i) => i.status === "uzavreny");

  return (
    <div className="page-container space-y-5">
      <div className="card p-4 sm:p-5">
        <SectionLabel>Incidenty v klubu</SectionLabel>
        <p className="text-sm text-muted">
          Krádeže, rozbité vybavení a další průšvihy. Ukradené vybavení v klubu opravdu chybí
          a rozbité zařízení nefunguje, dokud ho neopravíš. Otevři incident a zjisti, kdo za tím stojí:
          stopy, obvinění, policie. Proti zlodějům zvenku pomáhá zabezpečení areálu ve vybavení.
        </p>
      </div>
      {poskozeni.length > 0 && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Rozbité zařízení</SectionLabel>
          <p className="text-sm text-muted">Dokud rozbité zařízení neopravíš, nefunguje.</p>
          {opravaZprava && (
            <p className={`text-sm mt-2 ${opravaZprava.typ === "ok" ? "text-pitch-600" : "text-card-red"}`}>
              {opravaZprava.text}
            </p>
          )}
          <div className="mt-3 space-y-3">
            {poskozeni.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-heading font-bold text-base">{p.label}</div>
                  <div className="text-sm text-muted">
                    Oprava {p.cost.toLocaleString("cs-CZ")} Kč · o {p.levels} {p.levels === 1 ? "úroveň" : "úrovně"}
                  </div>
                </div>
                <button
                  onClick={() => opravit(p)}
                  disabled={opravujeId === p.id}
                  className="shrink-0 px-3 py-2 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 disabled:opacity-50"
                >
                  Opravit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
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
  const vysledek = i.status === "uzavreny" && i.resolution ? VYSLEDEK_LABEL[i.resolution] : undefined;
  const odkaz = `/dashboard/incidenty?id=${encodeURIComponent(i.id)}`;
  return (
    <div className="border border-gray-100 rounded-soft p-3">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>{i.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={odkaz} className="font-heading font-bold text-base hover:text-pitch-500">{i.label}</Link>
            <span className={`text-sm font-heading font-bold px-2 py-0.5 rounded-full ${STAV_TRIDA[i.status]}`}>{STAV_LABEL[i.status]}</span>
          </div>
          <div className="text-sm text-muted">
            {datum(i.gameDate)}
            {i.status === "otevreny" && i.deadline && ` · rozhodni do ${datum(i.deadline)}`}
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
              <Link href={`/dashboard/player/${i.pachatel.playerId}`} className="text-base font-heading font-bold underline decoration-pitch-500/20 hover:text-pitch-500">
                {i.pachatel.jmeno}
              </Link>
            </div>
          )}
          <div className="mt-3">
            <Link href={odkaz} className="text-sm font-heading font-bold text-pitch-600 hover:text-pitch-500">
              {i.status === "otevreny" ? "Vyšetřovat a rozhodnout →" : "Otevřít →"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck a build**

Run: `cd apps/web && npx tsc --noEmit && npx next build --no-lint`
Expected: bez chyb; stránka `/dashboard/incidenty` se sestaví (bez chyby „useSearchParams should be wrapped in a suspense boundary").

- [ ] **Step 5: Kontrola textů**

Run: `grep -n "—" apps/web/src/app/dashboard/incidenty/*.ts*`
Expected: nic.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/incidenty/typy.ts apps/web/src/app/dashboard/incidenty/DetailIncidentu.tsx apps/web/src/app/dashboard/incidenty/page.tsx
git commit -F - <<'EOF'
feat(incidenty): detail incidentu s vysetrovanim, obvinenim, polici a tresty

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 10: Zapsat odchylky do specu

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-incidenty-design.md`

- [ ] **Step 1: Datový model (Část 3)**

- U `club_incident_clues` doplň sloupec `police_bonus REAL NOT NULL DEFAULT 0` s komentářem „o kolik nalezená stopa zvedne šanci policie".
- Pod `club_incidents` doplň odstavec: „`accused` (fáze 2): JSON pole `Obvineni[]` `{playerId, jmeno, den, vysledek}`, výsledek `priznal | usvedcen | zapira`."
- Pod `club_incident_knowledge` doplň: „Tabulka vzniká ve fázi 2 (migrace 0205), ve fázi 2 se zapisuje jen role `obvineny`."
- V typu `Ztrata` doplň u stadionu `cena?: number`.

- [ ] **Step 2: Pachatel a stopy (Část 5a, 5b)**

- 5a: práh 1,2 nahraď 1,7 s větou „Kalibrace z testovacích dat: při 1,2 byl kandidátem 89 % hráčů, při 1,7 zhruba polovina." Recidivu popiš jako odvozenou dotazem (pachatel incidentu uzavřeného v posledních 60 dnech téže sezóny, kromě `bez_skody`, `nestalo_se`, `konec_sezony`).
- 5b: za tabulku stop přidej odstavec **Místa incidentů** (`vloupani_sklad` sklad, `vitrina`/`oslava_v_kabine`/`kopnute_dvere`/`kradez_kamery` kabiny, dodávky parkoviště, `koleje_trakturek`/`svetlice`/`vandal` hřiště, `pozar_grilu` stánek; úroveň 2 pokrývá kabiny a sklad, úroveň 3 vše) a pravidla: nefunkční kamera jen když by místo pokrývala; hráč nepoznaný kamerou = postava bez obličeje (síla 1, policie +0,2); ukradené kamery nic nenatočí; správce: hráč síla 2 a policie +0,1, cizí policie +0,15; kamarád a rival policie +0,1; stopy nevznikají u odhaleného pachatele, u nehody a u uzavřených incidentů.

- [ ] **Step 3: Vyšetřování (Část 7)**

- 7b: stopa na obviněného zahrnuje i podezřelé; po odhalení se lhůta prodlouží aspoň na dnes + 3 dny; kádr −2 bez obviněného a jeho kamarádů.
- 7c: výsledek šetření se losuje v den výsledku (`seed "policie|" + id`); úspěch u hráče = odhalení, stav zpět `otevreny`, lhůta dnes + 7 a trest volí manažer; pachatel `nikdo` = výsledek `nehoda`; cizí pachatel u poškození = náhrada 50–100 % hodnoty škody (`incident_recovery`); neúspěch = lhůta dnes + 3; udání = `status policie` + `resolution policie`, za 3–7 dní „podmínka". Hodnota škody: vybavení cena ztracených úrovní, zařízení cena opravy, opotřebení oprava první úrovně, trávník 150 Kč za bod.
- 7d: `vyradit` až ve fázi 3; `vyhodit` bez pověsti a zprávy (fáze 10); srážka `resolution_data = {celkem, tydnuZbyva}`, poslední splátka doplatí zaokrouhlení; reference `srazka-{id}-t{n}`, `pokuta-{id}`, `nahrada-{id}`.
- 7f: doplň větu „Fáze 2: jen SMS, notifikace a transakce `incident_fine`, `incident_deduction`, `incident_recovery`. Reputace, Zpravodaj, fanoušci, obec a atributy manažera přijdou ve fázích 3, 8 a 9."
- 7e: větu „Fáze 1: po lhůtě jen `nevyreseno`…" nahraď „Od fáze 2 platí recidiva (odvozená, 5a); tresty volí manažer v lhůtě, po ní `nechat_byt`."

- [ ] **Step 4: Pořadí implementace (Část 16)**

Za bod 2 doplň „(hotovo na testingu, plán `docs/superpowers/plans/2026-09-16-incidenty-faze-2.md`)".

- [ ] **Step 5: Kontrola a commit**

Run: `grep -n "—" docs/superpowers/specs/2026-09-16-incidenty-design.md | grep -v "^[0-9]*:#" | head` (dlouhé pomlčky ve specu jsou v pořádku, jde jen o to nepřidat je do textů pro hráče.)

```bash
git add docs/superpowers/specs/2026-09-16-incidenty-design.md
git commit -F - <<'EOF'
docs(incidenty): spec podle fáze 2 vyšetřování

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 11: Nasazení na testing a ověření (controller)

Tenhle task dělá controller, ne subagent: zapisuje do testovací DB, pushuje a ověřuje v prohlížeči.

- [ ] **Step 1: Celá sada testů a build**

```bash
cd apps/api && npx vitest run && npx tsc --noEmit
cd ../web && npx tsc --noEmit && npx next build --no-lint
```

Expected: vše zelené. Selhání mimo incidenty ověřit proti `git stash`/`main`, jestli je předchozí.

- [ ] **Step 2: Migrace na testovací DB (před pushem)**

```bash
cd apps/api && npx wrangler d1 execute prales-db-test --remote --file migrations/0205_incidenty_vysetrovani.sql
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT name FROM sqlite_master WHERE name IN ("club_incident_clues", "club_incident_knowledge")'
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT accused FROM club_incidents LIMIT 1'
```

Expected: obě tabulky existují, sloupec `accused` jde přečíst.

- [ ] **Step 3: Push a CI**

```bash
git push origin testing
gh run list --branch testing --limit 1 --json status,conclusion,headSha
```

Počkat na `conclusion: success` (`gh run watch <id>` na pozadí).

- [ ] **Step 4: API bez přihlášení**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://api-test.prales.fun/api/teams/TEAMID/incidents/xxx"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://api-test.prales.fun/api/teams/TEAMID/incidents/xxx/obvinit" -H "Content-Type: application/json" -d '{"playerId":"x"}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://api-test.prales.fun/api/admin/incidents/vysetrovani" -H "Content-Type: application/json" -d '{"teamId":"x"}'
```

Expected: 403, 401, 401.

- [ ] **Step 5: Scénář v prohlížeči (testovací klub uživatele, existující session)**

Heslo nezadávat; použít přihlášenou session a `fetch` s `om_token` přes `javascript_tool` bez vypsání tokenu.

1. Admin force `vloupani_sklad` s `playerId` problémového hráče: odpověď má `nalezeneStopy` podle vybavení klubu (bez `area_security` ≥ 2 žádná kamera). DB: `SELECT source, found, points_to_player_id, holder_player_id FROM club_incident_clues WHERE incident_id = "<id>"`.
2. Stránka `/dashboard/incidenty?id=<id>`: stopy, stav vyšetřování, akce Obvinit a Zavolat policii; screenshot.
3. Obvinit nevinného hráče: zpráva „…: zapírá."; DB `club_incident_knowledge` role `obvineny`, morálka a `coach_relationship` hráče klesly, `club_incidents.accusations = 1`.
4. Zavolat policii: stav „Šetří policie", SMS od „Policie ČR, obvodní oddělení". Admin `POST /api/admin/incidents/vysetrovani {teamId, policieTed: true}`: výsledek podle losu (SMS + notifikace, stav v DB odpovídá větvi).
5. Druhý incident s odhaleným pachatelem (admin force nebo předchozí krok): tresty s částkami v info řádku, ceny ne v tlačítkách. Pokuta: transakce `incident_fine` na stránce Financí s popiskem „Pokuta hráči za incident". Srážka na dalším incidentu + admin `{teamId, srazky: true}`: transakce `incident_deduction` „(1/4)".
6. Vyhodit hráče testovacího klubu **neověřovat** bez souhlasu uživatele (pokryto unit testem).
7. Mobilní šířka (400 px): detail bez vodorovného posunu, tlačítka pod sebou.
8. Uklidit: vrátit vybavení a morálku, které scénář změnil, pokud to uživatel nechce nechat (`UPDATE` jen na `prales-db-test`).

- [ ] **Step 6: Paměť**

Do `project_prod_deploy_pending.md` doplnit: migrace **0205** musí na produkci před merge kódu (po 0202–0204), incidenty fáze 2 čekají na prod.

✋ **STOP.** Na produkci nic bez výslovného „nasaď na main".

---

## Co zůstává na další fáze

| Fáze | Navazuje na fázi 2 |
|---|---|
| 3 Absence, trénink, zápas | trest `vyradit`; absence „výslech" a „soud" po udání a po odhalení policií; `obvineny` do 14 dní v omluvenkách a zápase; atributy manažera a `posunVztah` |
| 4 Znalosti a chat | výslech najde stopy `svedek`, `kamarad`, `rival` (`found = 1`), znalosti `kadr`, `pachatel` a ostatní role v `club_incident_knowledge` |
| 5 Bazar | stopa `bazar` s `police_bonus 0,3`, nahlásit policii |
| 6 Hospoda | stopy `hospoda` (`chlubi_se` síla 3 odhalí pachatele), `nabizi_zbozi` +0,15 policii |
| 9 Tisk, fanoušci | výsledek policie a usvědčený zloděj do Zpravodaje a reakcí fanoušků, reputace |
| 10 Přestupy | pověst vyhozeného zloděje, zpráva `player_fired_thief` |
| 11 Sezóna | odznak čekajících rozhodnutí v navigaci, widget na Domů, nápověda |
