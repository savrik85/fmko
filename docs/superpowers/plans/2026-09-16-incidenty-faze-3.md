# Incidenty v klubu, fáze 3 (Absence, trénink a zápas) — implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incidenty se promítnou do docházky a zápasu: hráč chybí kvůli výslechu, soudu nebo trenérovu vyřazení (stejně v SMS, náhledu sestavy i simulaci), neprávem obviněný si častěji hledá výmluvy a hraje hůř, odhalený zloděj v sestavě kazí náladu týmu, kabina na obě situace reaguje v pondělí, na trénink v den výslechu nikdo nepřijde a trenérovy volby mění jeho atributy.

**Architecture:** Nový modul `apps/api/src/incidents/absence-hracu.ts` drží tabulku `club_incident_absences`, načtení incidentního kontextu hráčů (absence a vlivy „obvineny"/„pachatel") a čistý dodatečný průchod `pridejIncidentniAbsence`, který se volá po losu omluvenek na všech šesti místech. Los omluvenek (`events/absence.ts`) dostane jen modifikátor pro neprávem obviněného. Zápasové úpravy (`incidents/zapas.ts`) a kabina (`season/kabina.ts`) čtou stejný kontext. Absence vznikají při udání, při odhalení policií a novým trestem „vyřadit".

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, D1, Vitest, Next.js 15

**Spec:** `docs/superpowers/specs/2026-09-16-incidenty-design.md` (Části 7c, 7d, 16.3, 17a, 17b, 17c)

## Global Constraints

- **Branch:** `testing`. Push dělá až controller v posledním tasku. Push na `main` je zakázaný bez výslovného souhlasu uživatele.
- **UI a texty pro hráče česky**, s diakritikou, minimálně `text-sm`, jména hráčů `text-base` a klikatelná, ceny nikdy v tlačítkách, rozhodovací tlačítka dole, mobile-first, do tabulek nepřidávat sloupce.
- **V textech pro hráče nikdy dlouhá pomlčka „—".** Jméno hráče jen v 1. pádě jako podmět nebo samostatně za dvojtečkou. Každá šablona v `TEXTY` končí tečkou nebo vykřičníkem (hlídá `texty.test.ts`).
- **Žádný prázdný catch.** Server `logger.warn({ module: "xyz" }, "popis", e)` nebo `logger.error`, klient `console.error("popis:", e)`.
- **Determinismus omluvenek (spec 17a):** los omluvenek běží beze změny nad stejným kádrem na všech šesti místech (SMS den předem, SMS v den zápasu, detail hráče, náhled sestavy, admin trigger, simulace). Incidentní absence se přidávají až dodatečným průchodem po losu a všechna místa dostávají stejný vstup pro stejný zápas.
- **Datumová incidentní absence se smí zapsat jen s `od_dne >= announced_on + 2 dny`.**
- **Bez incidentu je výstup `generateAbsences` beze změny** (stejný seed → stejné omluvenky jako před fází 3).
- **Idempotence:** zápisy absencí `INSERT OR IGNORE` s deterministickým id `{incidentId}-abs-{1|2|3}`; atributy trenéra přes `applyManagerAttrDelta` s `referenceId`; přechody stavů incidentu dál hlídaným `UPDATE`.
- **Tajné údaje nikdy do API ani do veřejných textů:** neodhalený pachatel se nikde nejmenuje.
- **Názvy sloupců do SQL jen z konstant**, nikdy ze vstupu. Parametry jen `?`.
- **Testy:** `cd apps/api && npx vitest run <cesta>`. **Typecheck:** `cd apps/api && npx tsc --noEmit`, FE `cd apps/web && npx tsc --noEmit`.
- **Commit** po každém tasku: `git add <soubory> && git commit -F - <<'EOF'` se zprávou a posledním řádkem `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Nikdy `git add -A`.
- **Migrace** se na `prales-db-test` aplikuje až v posledním tasku (controller). Na produkci nic.

---

## Odchylky od specu (zapsat do specu v Tasku 10)

| Místo ve specu | Plán | Proč |
|---|---|---|
| 3 `club_incident_absences` | sloupce `od_dne`, `do_dne` místo `od`, `do` | `DO` je v SQLite klíčové slovo (`ON CONFLICT DO`) |
| 17a `incidentniAbsence(db, teamId, datum)` | `nactiIncidentniKontext` vrací absence i vlivy hráčů (`obvineny`, `pachatel`) jedním voláním | los omluvenek i zápas potřebují obojí pro stejné datum |
| 17a vyřazení | platí ve všech zápasech (liga, pohár, přátelák), odečítá se po ligovém kole, stejně jako `suspended_matches` | shodné chování se stopkou, jedno místo odečtu |
| 17a pravděpodobnost | ve fázi 3 jen `obvineny` (+0,03, výmluvy „Po obvinění"); `dluhy`, `rozvod`, `zabaveny_ridicak`, `isAway` a přesun vět „Manželka rodí" a „vzali mu řidičák" až s životními situacemi ve fázi 7 | situace ještě neexistují |
| 17a zobrazení | důvod absence přijde z dodatečného průchodu (`reason`), rozpad docházky v `teams.ts` se nemění (incident se počítá jako omluva) | nový klíč by znamenal nový sloupec v tabulce na mobilu |
| 7c výslech a soud | udání: výslech za 2 dny, soud v den výsledku šetření; odhalení policií: výslech za 2 dny, soud za 5 dní | spec termíny neurčoval |
| 17b trénink | jen den výslechu a soudu = nepřijde; modifikátory `prisel_o_praci`, `rozvod`, `dluhy` a zrcadlo v náhledu tréninku (`game.ts`) až ve fázi 7 | náhled tréninku je týdenní průměr, jednodenní absence v něm nic neznamená |
| 17c zápas | jen neprávem obviněný do 14 dní (morálka −8, konzistence −10) a odhalený pachatel v základní sestavě do 14 dní (tým morálka −2); rozvod, narození dítěte a hrdina ve fázích 7 a 11 | situace ještě neexistují |
| 17c kabina | odhalený pachatel do 14 dní od incidentu: ostatní −1, jeho kamarádi 0, nesmí být tahoun; neprávem obviněný do 14 dní: sám −2, kamarádi −1; „spí v kabině" až ve fázi 7 | okno 14 dní stejné jako u zápasu |
| 17c vztahy `posunVztah` | až ve fázi 4 (výslech) | ve fázi 3 nemá volajícího |
| 17c atributy trenéra | důsledný trest = `srazka`, `pokuta`, `vyradit`, `vyhodit`, `policie` → disciplína +1; útěk hráče s odmítnutou zálohou až ve fázi 7 | spec „důsledný trest" nevyjmenoval |

---

## Struktura souborů

| Soubor | Odpovědnost |
|---|---|
| `apps/api/migrations/0206_incidenty_absence.sql` | tabulka `club_incident_absences` |
| `apps/api/src/incidents/nastaveni.ts` | konstanty absencí a vlivů |
| `apps/api/src/incidents/absence-hracu.ts` | čisté: platné absence, vlivy hráčů, dodatečný průchod, validace zápisu; DB: načtení kontextu, příkaz zápisu |
| `apps/api/src/incidents/texty.ts` | SMS hráčů k absencím a trestu vyřazení |
| `apps/api/src/events/absence.ts` | kategorie `incident`, modifikátor a výmluvy neprávem obviněného |
| `apps/api/src/season/season-weather.ts` | `terminZapasu` (termín podle klíče zápasu) |
| `apps/api/src/season/team-day.ts`, `events/match-absences.ts`, `routes/game.ts`, `multiplayer/match-runner.ts` | dodatečný průchod na šesti místech omluvenek |
| `apps/api/src/incidents/akce.ts`, `vysetrovani.ts`, `vysetrovani-den.ts`, `routes/incidents.ts` | vznik absencí, trest `vyradit`, atributy trenéra |
| `apps/api/src/multiplayer/match-runner.ts` | odečet vyřazení po ligovém kole, zápasové úpravy |
| `apps/api/src/incidents/zapas.ts` | zápasové úpravy sestavy z incidentů |
| `apps/api/src/cup/cup.ts` | zápasové úpravy v poháru |
| `apps/api/src/season/training.ts`, `season/daily-tick.ts` | den incidentní absence na tréninku |
| `apps/api/src/season/kabina.ts`, `season/team-day.ts` | incidenty v týdenní kabině a v notifikaci |
| `apps/api/src/lib/manager-attrs.ts` | zdroj `incident` |
| `apps/web/src/app/dashboard/incidenty/{typy.ts,DetailIncidentu.tsx}` | trest vyřadit |

---
## Task 1: Tabulka absencí a incidentní kontext hráčů

**Files:**
- Create: `apps/api/migrations/0206_incidenty_absence.sql`, `apps/api/src/incidents/absence-hracu.ts`, `apps/api/src/incidents/absence-hracu.test.ts`
- Modify: `apps/api/src/incidents/nastaveni.ts`, `apps/api/src/incidents/texty.ts`, `apps/api/src/events/absence.ts` (jen typ `AbsenceResult.category`)

**Interfaces:**
- Consumes: `nactiObvineni(raw)` (`incidents/vysetrovani.ts`), `gameExpiry(gameDate, days)` (`lib/game-time.ts`), `AbsenceResult` (`events/absence.ts`), `FalesnaD1`, `jakoD1` (`incidents/testovaci-d1.ts`).
- Produces (`incidents/absence-hracu.ts`):
  - `export type DruhAbsence = "vyslech" | "soud" | "vyrazen"`
  - `export type DruhVlivu = "obvineny" | "pachatel"`
  - `export interface IncidentniAbsence { playerId: string; druh: string; duvod: string; sms: string }`
  - `export interface IncidentniKontext { absence: Map<string, IncidentniAbsence>; druhy: Map<string, DruhVlivu[]> }`
  - `export function prazdnyKontext(): IncidentniKontext`
  - `export function denPlus(den: string, dni: number): string` (YYYY-MM-DD)
  - `export function platneAbsence(radky: readonly RadekAbsence[], den: string): Map<string, IncidentniAbsence>`
  - `export function druhyHracu(incidenty: readonly IncidentProVliv[], datum: string): Map<string, DruhVlivu[]>`
  - `export function pridejIncidentniAbsence(absence: readonly AbsenceResult[], hraciIds: readonly string[], incidentni: ReadonlyMap<string, IncidentniAbsence>, timing: "day_before" | "match_day"): AbsenceResult[]`
  - `export interface NovaAbsence { incidentId: string; teamId: string; playerId: string; druh: DruhAbsence; od: string | null; do: string | null; zapasu: number | null; ohlaseno: string; sms: string }`
  - `export function absencePlatnaKZapisu(a: NovaAbsence): boolean`, `export function prikazAbsence(db: D1Database, a: NovaAbsence): D1PreparedStatement | null`
  - `export const DUVOD_TRENINKU: Record<string, string>`, `export function duvodyNaTrenink(hraciIds: readonly string[], absence: ReadonlyMap<string, IncidentniAbsence>): Array<string | undefined>`
  - `export async function nactiIncidentniAbsence(db, teamId, datum): Promise<Map<string, IncidentniAbsence>>`, `export async function nactiDruhyHracu(db, teamId, datum): Promise<Map<string, DruhVlivu[]>>`, `export async function nactiIncidentniKontext(db, teamId, datum): Promise<IncidentniKontext>`
  - `AbsenceResult.category` rozšířený o `"incident"`.
  - Nové klíče `TEXTY`: `absence_vyslech`, `absence_soud`, `absence_vyrazen`.

- [ ] **Step 1: Migrace**

`apps/api/migrations/0206_incidenty_absence.sql`:

```sql
-- Incidenty v klubu, fáze 3: incidentní absence (výslech, soud, vyřazení).
-- Spec docs/superpowers/specs/2026-09-16-incidenty-design.md, Část 3 a 17a.
-- Sloupce od_dne/do_dne: DO je v SQLite klíčové slovo.

CREATE TABLE IF NOT EXISTS club_incident_absences (
  id            TEXT PRIMARY KEY,   -- {incidentId}-abs-{1 výslech | 2 soud | 3 vyřazení}
  incident_id   TEXT NOT NULL,
  team_id       TEXT NOT NULL,
  player_id     TEXT NOT NULL,
  kind          TEXT NOT NULL,      -- vyslech | soud | vyrazen (fáze 7: porod, nemocna_mama, stehovani)
  od_dne        TEXT,               -- YYYY-MM-DD herní den, u vyřazení NULL
  do_dne        TEXT,
  zapasu_zbyva  INTEGER,            -- jen vyřazení: kolik ligových kol ještě
  announced_on  TEXT NOT NULL,      -- YYYY-MM-DD; od_dne >= announced_on + 2
  duvod         TEXT NOT NULL,      -- krátký důvod do sestavy („Soudní jednání")
  sms           TEXT NOT NULL       -- věta hráče do omluvenky
);
CREATE INDEX IF NOT EXISTS idx_incident_abs_team ON club_incident_absences(team_id, od_dne, do_dne);
```

- [ ] **Step 2: Konstanty, texty, kategorie**

Na konec `apps/api/src/incidents/nastaveni.ts`:

```ts
/** Absence, trénink a zápas (spec 17a–17c). */
/** Datumová incidentní absence musí být ohlášená aspoň tolik dní dopředu, jinak by SMS den předem nesouhlasila se zápasem. */
export const MIN_OHLASENI_ABSENCE_DNI = 2;
export const VYSLECH_ZA_DNI = 2;
/** Soud po odhalení pachatele policií. Po udání se koná v den výsledku šetření. */
export const SOUD_PO_ODHALENI_DNI = 5;
export const VYRAZENI_MAX_ZAPASU = 3;
/** Jak dlouho obvinění a odhalení působí v zápase, v kabině a na docházce. */
export const VLIV_INCIDENTU_DNI = 14;
/** Jak daleko do minulosti se hledají incidenty s obviněním nebo odhalením. */
export const OKNO_VLIVU_DNI = 30;
export const DUVOD_ABSENCE = { vyslech: "Výslech na policii", soud: "Soudní jednání", vyrazen: "Vyřazen trenérem" } as const;
export const EMOJI_ABSENCE: Record<string, string> = { vyslech: "🚓", soud: "⚖️", vyrazen: "⛔" };
```

V `apps/api/src/incidents/texty.ts` přidej do `TEXTY` (před `lhuta_kradez`):

```ts
  absence_vyslech: [
    "Trenére, mám předvolání na výslech na policii, nemůžu přijít.",
    "Musím na policii k výslechu, dneska to nestihnu.",
    "Mám výslech kvůli tomu průšvihu, nepřijdu.",
  ],
  absence_soud: [
    "Mám soud, nemůžu hrát.",
    "Dneska stojím před soudem, fotbal nepůjde.",
    "Musím k soudu, omlouvám se.",
  ],
  absence_vyrazen: [
    "Vím, že jsem vyřazenej. Nepřijdu.",
    "Jsem za trest mimo, dneska nehraju.",
    "Chápu, že mě nechcete. Tentokrát nehraju.",
  ],
```

V `apps/api/src/events/absence.ts` rozšiř union v `AbsenceResult`:

```ts
  category: "professional" | "personal" | "absurd" | "health" | "hangover" | "commute" | "incident";
```

Pokud typecheck ukáže místo, které s `category` pracuje vyčerpávajícím switchem nebo mapou `Record<AbsenceResult["category"], …>`, doplň `incident` s popiskem „Incident" a nahlas to v reportu.

- [ ] **Step 3: Failing test**

`apps/api/src/incidents/absence-hracu.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AbsenceResult } from "../events/absence";
import {
  absencePlatnaKZapisu, denPlus, druhyHracu, duvodyNaTrenink, nactiIncidentniKontext, platneAbsence,
  pridejIncidentniAbsence, prikazAbsence, type IncidentniAbsence, type NovaAbsence,
} from "./absence-hracu";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";

const radek = (over: Record<string, unknown> = {}) => ({
  player_id: "p", kind: "soud", od_dne: "2026-09-20", do_dne: "2026-09-20", zapasu_zbyva: null,
  duvod: "Soudní jednání", sms: "Mám soud, nemůžu hrát.", ...over,
});

describe("datum", () => {
  it("denPlus posouvá herní den", () => {
    expect(denPlus("2026-09-30", 2)).toBe("2026-10-02");
    expect(denPlus("2026-09-16T16:00:00.000Z", -1)).toBe("2026-09-15");
  });
});

describe("platné absence", () => {
  it("datumová platí jen ve svém okně, vyřazení jen se zbývajícími zápasy", () => {
    const radky = [
      radek(),
      radek({ player_id: "a", kind: "vyrazen", od_dne: null, do_dne: null, zapasu_zbyva: 2, duvod: "Vyřazen trenérem" }),
      radek({ player_id: "b", kind: "vyrazen", od_dne: null, do_dne: null, zapasu_zbyva: 0 }),
    ];
    expect([...platneAbsence(radky, "2026-09-20").keys()].sort()).toEqual(["a", "p"]);
    expect([...platneAbsence(radky, "2026-09-21").keys()]).toEqual(["a"]);
  });

  it("u hráče vyhrává první záznam", () => {
    const mapa = platneAbsence([radek({ kind: "vyslech", duvod: "Výslech na policii" }), radek()], "2026-09-20");
    expect(mapa.get("p")?.druh).toBe("vyslech");
  });
});

describe("vlivy hráčů", () => {
  const obvineni = (hraci: Array<[string, string]>) => JSON.stringify(hraci.map(([playerId, den]) => ({ playerId, jmeno: "X", den, vysledek: "zapira" })));

  it("neprávem obviněný do 14 dní, vinný obviněný ne", () => {
    const mapa = druhyHracu([{ culprit_player_id: "p", culprit_revealed: 0, accused: obvineni([["a", "2026-09-10"], ["p", "2026-09-10"]]), game_date: "2026-09-08T16:00:00.000Z" }], "2026-09-20T16:00:00.000Z");
    expect(mapa.get("a")).toEqual(["obvineny"]);
    expect(mapa.has("p")).toBe(false);
  });

  it("po 14 dnech a před obviněním žádný vliv", () => {
    const inc = { culprit_player_id: null, culprit_revealed: 0, accused: obvineni([["a", "2026-09-01"], ["b", "2026-09-25"]]), game_date: "2026-08-30T16:00:00.000Z" };
    expect(druhyHracu([inc], "2026-09-20").size).toBe(0);
  });

  it("odhalený pachatel do 14 dní od incidentu, neodhalený nikdy", () => {
    const mapa = druhyHracu([
      { culprit_player_id: "p", culprit_revealed: 1, accused: "[]", game_date: "2026-09-10T16:00:00.000Z" },
      { culprit_player_id: "q", culprit_revealed: 0, accused: "[]", game_date: "2026-09-10T16:00:00.000Z" },
    ], "2026-09-20");
    expect(mapa.get("p")).toEqual(["pachatel"]);
    expect(mapa.has("q")).toBe(false);
  });
});

describe("dodatečný průchod omluvenek", () => {
  const vylosovane: AbsenceResult[] = [
    { playerIndex: 0, category: "personal", timing: "day_before", reason: "Osobní", emoji: "👫", smsText: "Nemůžu." },
    { playerIndex: 2, category: "health", timing: "day_before", reason: "Zdraví", emoji: "🤒", smsText: "Jsem nemocný." },
  ];
  const soud: IncidentniAbsence = { playerId: "b", druh: "soud", duvod: "Soudní jednání", sms: "Mám soud, nemůžu hrát." };

  it("bez incidentní absence vrací tentýž los", () => {
    expect(pridejIncidentniAbsence(vylosovane, ["a", "b", "c"], new Map(), "day_before")).toEqual(vylosovane);
  });

  it("přidá incidentní absenci a ostatní omluvenky nechá být", () => {
    const vysledek = pridejIncidentniAbsence(vylosovane, ["a", "b", "c"], new Map([["b", soud]]), "day_before");
    expect(vysledek.slice(0, 2)).toEqual(vylosovane);
    expect(vysledek[2]).toEqual({ playerIndex: 1, category: "incident", timing: "day_before", reason: "Soudní jednání", emoji: "⚖️", smsText: "Mám soud, nemůžu hrát." });
  });

  it("vylosovanou omluvenku hráče nahradí incidentní", () => {
    const vysledek = pridejIncidentniAbsence(vylosovane, ["a", "b", "c"], new Map([["c", { ...soud, playerId: "c" }]]), "match_day");
    expect(vysledek.map((a) => [a.playerIndex, a.category])).toEqual([[0, "personal"], [2, "incident"]]);
  });

  it("hráče mimo losovaný kádr (zraněný, stopka) ignoruje", () => {
    expect(pridejIncidentniAbsence(vylosovane, ["a", "b", "c"], new Map([["z", { ...soud, playerId: "z" }]]), "day_before")).toEqual(vylosovane);
  });

  it("na trénink nepustí jen výslech a soud", () => {
    const mapa = new Map<string, IncidentniAbsence>([
      ["a", { playerId: "a", druh: "vyslech", duvod: "Výslech na policii", sms: "x." }],
      ["b", { playerId: "b", druh: "vyrazen", duvod: "Vyřazen trenérem", sms: "x." }],
    ]);
    expect(duvodyNaTrenink(["a", "b", "c"], mapa)).toEqual(["Byl na výslechu na policii", undefined, undefined]);
  });
});

describe("zápis absence", () => {
  const zaklad: NovaAbsence = {
    incidentId: "inc-1", teamId: "tym-a", playerId: "p", druh: "vyslech",
    od: "2026-09-18", do: "2026-09-18", zapasu: null, ohlaseno: "2026-09-16", sms: "Mám výslech.",
  };

  it("datumová absence musí být ohlášená aspoň 2 dny dopředu", () => {
    expect(absencePlatnaKZapisu(zaklad)).toBe(true);
    expect(absencePlatnaKZapisu({ ...zaklad, od: "2026-09-17", do: "2026-09-17" })).toBe(false);
    expect(absencePlatnaKZapisu({ ...zaklad, od: null })).toBe(false);
  });

  it("vyřazení jen na 1 až 3 zápasy", () => {
    const vyrazeni = { ...zaklad, druh: "vyrazen" as const, od: null, do: null };
    expect(absencePlatnaKZapisu({ ...vyrazeni, zapasu: 1 })).toBe(true);
    expect(absencePlatnaKZapisu({ ...vyrazeni, zapasu: 3 })).toBe(true);
    expect(absencePlatnaKZapisu({ ...vyrazeni, zapasu: 0 })).toBe(false);
    expect(absencePlatnaKZapisu({ ...vyrazeni, zapasu: 4 })).toBe(false);
  });

  it("příkaz má deterministické id a neplatnou absenci nezapíše", () => {
    const db = new FalesnaD1();
    const prikaz = prikazAbsence(jakoD1(db), zaklad) as unknown as { sql: string; params: unknown[] };
    expect(prikaz.sql).toMatch(/INSERT OR IGNORE INTO club_incident_absences/);
    expect(prikaz.params).toEqual(["inc-1-abs-1", "inc-1", "tym-a", "p", "vyslech", "2026-09-18", "2026-09-18", null, "2026-09-16", "Výslech na policii", "Mám výslech."]);
    expect(prikazAbsence(jakoD1(db), { ...zaklad, od: "2026-09-16" })).toBeNull();
  });
});

describe("načtení kontextu", () => {
  it("spojí absence a vlivy pro datum zápasu", async () => {
    const db = new FalesnaD1([
      { sql: /FROM club_incident_absences/, all: [radek()] },
      { sql: /FROM club_incidents/, all: [{ culprit_player_id: "p", culprit_revealed: 1, accused: "[]", game_date: "2026-09-15T16:00:00.000Z" }] },
    ]);
    const kontext = await nactiIncidentniKontext(jakoD1(db), "tym-a", "2026-09-20T15:00:00.000Z");
    expect(kontext.absence.get("p")?.duvod).toBe("Soudní jednání");
    expect(kontext.druhy.get("p")).toEqual(["pachatel"]);
    const dotaz = db.dotazy.find((d) => /FROM club_incident_absences/.test(d.sql));
    expect(dotaz?.params).toEqual(["tym-a", "2026-09-20", "2026-09-20"]);
  });
});
```

- [ ] **Step 4: Spusť, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/absence-hracu.test.ts`
Expected: FAIL (modul neexistuje).

- [ ] **Step 5: Implementace**

`apps/api/src/incidents/absence-hracu.ts`:

```ts
/**
 * Incidenty v docházce a zápase (spec 17a–17c).
 *
 * Omluvenky se pro jeden zápas losují na šesti místech a všechna musí dojít
 * ke stejnému výsledku. Incident proto do losu nezasahuje: los běží beze
 * změny a teprve potom `pridejIncidentniAbsence` označí hráče, kteří mají
 * výslech, soud nebo vyřazení. Vlivy (`obvineny`, `pachatel`) čtou los
 * omluvenek, zápas i kabina.
 */

import type { AbsenceResult } from "../events/absence";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import {
  DUVOD_ABSENCE, EMOJI_ABSENCE, MIN_OHLASENI_ABSENCE_DNI, OKNO_VLIVU_DNI, VLIV_INCIDENTU_DNI, VYRAZENI_MAX_ZAPASU,
} from "./nastaveni";
import { nactiObvineni } from "./vysetrovani";

const M = "incidents-absence";

export type DruhAbsence = "vyslech" | "soud" | "vyrazen";
export type DruhVlivu = "obvineny" | "pachatel";

export interface IncidentniAbsence {
  playerId: string;
  druh: string;
  duvod: string;
  sms: string;
}

export interface RadekAbsence {
  player_id: string;
  kind: string;
  od_dne: string | null;
  do_dne: string | null;
  zapasu_zbyva: number | null;
  duvod: string;
  sms: string;
}

export interface IncidentProVliv {
  culprit_player_id: string | null;
  culprit_revealed: number;
  accused: string;
  game_date: string;
}

export interface IncidentniKontext {
  absence: Map<string, IncidentniAbsence>;
  druhy: Map<string, DruhVlivu[]>;
}

export function prazdnyKontext(): IncidentniKontext {
  return { absence: new Map(), druhy: new Map() };
}

/** Herní den posunutý o `dni`, tvar YYYY-MM-DD. */
export function denPlus(den: string, dni: number): string {
  const d = new Date(`${den.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dni);
  return d.toISOString().slice(0, 10);
}

function dnyMezi(od: string, do_: string): number {
  return Math.round((Date.parse(`${do_.slice(0, 10)}T12:00:00.000Z`) - Date.parse(`${od.slice(0, 10)}T12:00:00.000Z`)) / 86_400_000);
}

/** Absence platné v herní den `den`. U jednoho hráče vyhrává první záznam. */
export function platneAbsence(radky: readonly RadekAbsence[], den: string): Map<string, IncidentniAbsence> {
  const d = den.slice(0, 10);
  const vysledek = new Map<string, IncidentniAbsence>();
  for (const r of radky) {
    const plati = r.kind === "vyrazen"
      ? (r.zapasu_zbyva ?? 0) > 0
      : !!r.od_dne && !!r.do_dne && r.od_dne <= d && r.do_dne >= d;
    if (!plati || vysledek.has(r.player_id)) continue;
    vysledek.set(r.player_id, { playerId: r.player_id, druh: r.kind, duvod: r.duvod, sms: r.sms });
  }
  return vysledek;
}

/** Neprávem obvinění a odhalení pachatelé, na které incident ke dni `datum` ještě působí. */
export function druhyHracu(incidenty: readonly IncidentProVliv[], datum: string): Map<string, DruhVlivu[]> {
  const mapa = new Map<string, DruhVlivu[]>();
  const pridej = (id: string, druh: DruhVlivu) => {
    const druhy = mapa.get(id) ?? [];
    if (!druhy.includes(druh)) druhy.push(druh);
    mapa.set(id, druhy);
  };
  const vOkne = (den: string) => {
    const dny = dnyMezi(den, datum);
    return dny >= 0 && dny <= VLIV_INCIDENTU_DNI;
  };
  for (const inc of incidenty) {
    for (const o of nactiObvineni(inc.accused)) {
      if (o.playerId !== inc.culprit_player_id && vOkne(o.den)) pridej(o.playerId, "obvineny");
    }
    if (inc.culprit_revealed === 1 && inc.culprit_player_id && vOkne(inc.game_date)) pridej(inc.culprit_player_id, "pachatel");
  }
  return mapa;
}

/**
 * Dodatečný průchod po losu omluvenek (spec 17a). Vylosované omluvenky ostatních
 * hráčů zůstanou beze změny; hráč s incidentní absencí dostane incidentní důvod
 * místo případné vylosované omluvenky. Hráči mimo `hraciIds` (zranění, stopka)
 * se přeskočí, protože v losu vůbec nebyli.
 */
export function pridejIncidentniAbsence(
  absence: readonly AbsenceResult[],
  hraciIds: readonly string[],
  incidentni: ReadonlyMap<string, IncidentniAbsence>,
  timing: "day_before" | "match_day",
): AbsenceResult[] {
  if (incidentni.size === 0) return [...absence];
  const indexy = new Map(hraciIds.map((id, i) => [id, i]));
  const nove: AbsenceResult[] = [];
  for (const a of incidentni.values()) {
    const i = indexy.get(a.playerId);
    if (i === undefined) continue;
    nove.push({ playerIndex: i, category: "incident", timing, reason: a.duvod, emoji: EMOJI_ABSENCE[a.druh] ?? "❗", smsText: a.sms });
  }
  const zasazeni = new Set(nove.map((a) => a.playerIndex));
  return [...absence.filter((a) => !zasazeni.has(a.playerIndex)), ...nove];
}

export const DUVOD_TRENINKU: Record<string, string> = {
  vyslech: "Byl na výslechu na policii",
  soud: "Byl u soudu",
};

/** Důvody neúčasti na tréninku po indexech kádru. Vyřazení ze zápasů trénink nezakazuje. */
export function duvodyNaTrenink(hraciIds: readonly string[], absence: ReadonlyMap<string, IncidentniAbsence>): Array<string | undefined> {
  return hraciIds.map((id) => {
    const a = absence.get(id);
    return a ? DUVOD_TRENINKU[a.druh] : undefined;
  });
}

export interface NovaAbsence {
  incidentId: string;
  teamId: string;
  playerId: string;
  druh: DruhAbsence;
  /** YYYY-MM-DD, u vyřazení null. */
  od: string | null;
  do: string | null;
  /** Jen vyřazení: počet ligových kol. */
  zapasu: number | null;
  /** YYYY-MM-DD herního dne ohlášení. */
  ohlaseno: string;
  sms: string;
}

const PORADI: Record<DruhAbsence, number> = { vyslech: 1, soud: 2, vyrazen: 3 };

export function absencePlatnaKZapisu(a: NovaAbsence): boolean {
  if (a.druh === "vyrazen") return a.zapasu !== null && a.zapasu >= 1 && a.zapasu <= VYRAZENI_MAX_ZAPASU;
  return !!a.od && !!a.do && a.od >= denPlus(a.ohlaseno, MIN_OHLASENI_ABSENCE_DNI) && a.do >= a.od;
}

/** Příkaz pro `db.batch`, nebo `null` u neplatné absence (zaloguje chybu). */
export function prikazAbsence(db: D1Database, a: NovaAbsence): D1PreparedStatement | null {
  if (!absencePlatnaKZapisu(a)) {
    logger.error({ module: M }, `neplatná incidentní absence ${a.incidentId} (${a.druh}, od ${a.od}, ohlášeno ${a.ohlaseno})`);
    return null;
  }
  return db.prepare(
    `INSERT OR IGNORE INTO club_incident_absences
       (id, incident_id, team_id, player_id, kind, od_dne, do_dne, zapasu_zbyva, announced_on, duvod, sms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `${a.incidentId}-abs-${PORADI[a.druh]}`, a.incidentId, a.teamId, a.playerId, a.druh, a.od, a.do,
    a.druh === "vyrazen" ? a.zapasu : null, a.ohlaseno.slice(0, 10), DUVOD_ABSENCE[a.druh], a.sms,
  );
}

export async function nactiIncidentniAbsence(db: D1Database, teamId: string, datum: string): Promise<Map<string, IncidentniAbsence>> {
  const den = datum.slice(0, 10);
  const rows = await db.prepare(
    `SELECT player_id, kind, od_dne, do_dne, zapasu_zbyva, duvod, sms FROM club_incident_absences
      WHERE team_id = ? AND ((od_dne <= ? AND do_dne >= ?) OR (kind = 'vyrazen' AND zapasu_zbyva > 0))
      ORDER BY announced_on, id`,
  ).bind(teamId, den, den).all<RadekAbsence>()
    .catch((e) => { logger.warn({ module: M }, `incidentní absence ${teamId}`, e); return { results: [] as RadekAbsence[] }; });
  return platneAbsence(rows.results, den);
}

export async function nactiDruhyHracu(db: D1Database, teamId: string, datum: string): Promise<Map<string, DruhVlivu[]>> {
  const rows = await db.prepare(
    `SELECT culprit_player_id, culprit_revealed, accused, game_date FROM club_incidents
      WHERE team_id = ? AND game_date >= ? AND (accused != '[]' OR culprit_revealed = 1)`,
  ).bind(teamId, gameExpiry(datum, -OKNO_VLIVU_DNI)).all<IncidentProVliv>()
    .catch((e) => { logger.warn({ module: M }, `vlivy incidentů ${teamId}`, e); return { results: [] as IncidentProVliv[] }; });
  return druhyHracu(rows.results, datum);
}

export async function nactiIncidentniKontext(db: D1Database, teamId: string, datum: string): Promise<IncidentniKontext> {
  const [absence, druhy] = await Promise.all([
    nactiIncidentniAbsence(db, teamId, datum),
    nactiDruhyHracu(db, teamId, datum),
  ]);
  return { absence, druhy };
}
```

- [ ] **Step 6: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents src/events && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/migrations/0206_incidenty_absence.sql apps/api/src/incidents/absence-hracu.ts apps/api/src/incidents/absence-hracu.test.ts apps/api/src/incidents/nastaveni.ts apps/api/src/incidents/texty.ts apps/api/src/events/absence.ts
git commit -F - <<'EOF'
feat(incidenty): tabulka incidentnich absenci a vlivy incidentu na hrace

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Neprávem obviněný v losu omluvenek

**Files:**
- Modify: `apps/api/src/events/absence.ts`, `apps/api/src/events/absence-determinism.test.ts`

**Interfaces:**
- Consumes: kategorie `"incident"` v `AbsenceResult` (Task 1).
- Produces:
  - `PlayerForAbsence.incident?: { druhy: string[] }`
  - `hracProAbsenci(row: Record<string, unknown>, druhy?: readonly string[]): PlayerForAbsence` — bez `druhy` (nebo s prázdným polem) vrací přesně totéž co dnes, bez klíče `incident`.
  - `generateAbsences`: hráč s druhem `obvineny` má šanci chybět vyšší o `0.03` a mezi kategoriemi výmluv navíc `incident` s váhou `0.5` (výmluvy „Po obvinění"). Hráči bez druhu `obvineny` se nemění ani o jediné volání generátoru.

- [ ] **Step 1: Failing test**

Do `apps/api/src/events/absence-determinism.test.ts` přidej (import `hracProAbsenci` už v souboru je):

```ts
describe("incident v losu omluvenek", () => {
  const OBVINENY = 5;
  const sObvinenym = SQUAD.map((p, i) => (i === OBVINENY ? { ...p, incident: { druhy: ["obvineny"] } } : p));

  it("bez incidentu je výstup beze změny", () => {
    const sPrazdnym = SQUAD.map((p) => ({ ...p, incident: undefined }));
    for (let seed = 1; seed <= 50; seed++) {
      expect(generateAbsences(createRng(seed), sPrazdnym, { timing: "match_day" }))
        .toEqual(generateAbsences(createRng(seed), SQUAD, { timing: "match_day" }));
    }
  });

  it("jiný druh vlivu než obviněný los nemění", () => {
    const sPachatelem = SQUAD.map((p, i) => (i === OBVINENY ? { ...p, incident: { druhy: ["pachatel"] } } : p));
    for (let seed = 1; seed <= 50; seed++) {
      expect(generateAbsences(createRng(seed), sPachatelem, { timing: "day_before" }))
        .toEqual(generateAbsences(createRng(seed), SQUAD, { timing: "day_before" }));
    }
  });

  it("neprávem obviněný chybí častěji a vymlouvá se na obvinění", () => {
    let predtim = 0;
    let potom = 0;
    const vymluvy: AbsenceResult[] = [];
    for (let seed = 1; seed <= 600; seed++) {
      predtim += generateAbsences(createRng(seed), SQUAD, { timing: "day_before" }).filter((a) => a.playerIndex === OBVINENY).length;
      const jeho = generateAbsences(createRng(seed), sObvinenym, { timing: "day_before" }).filter((a) => a.playerIndex === OBVINENY);
      potom += jeho.length;
      vymluvy.push(...jeho.filter((a) => a.category === "incident"));
    }
    expect(potom).toBeGreaterThan(predtim);
    expect(vymluvy.length).toBeGreaterThan(0);
    for (const v of vymluvy) {
      expect(v.reason).toBe("Po obvinění");
      expect(v.smsText).not.toContain("—");
      expect(v.smsText.trim()).toMatch(/[.!]$/);
    }
  });

  it("převod řádku: prázdné druhy nepřidají klíč incident", () => {
    const row = {
      first_name: "Jan", last_name: "Kos", age: 25, commute_km: 0, is_celebrity: 0,
      personality: JSON.stringify({ discipline: 40 }), life_context: "{}", physical: "{}",
    };
    expect(hracProAbsenci(row, [])).toEqual(hracProAbsenci(row));
    expect("incident" in hracProAbsenci(row)).toBe(false);
    expect(hracProAbsenci(row, ["obvineny"]).incident).toEqual({ druhy: ["obvineny"] });
  });
});
```

a do importu z `./absence` přidej `type AbsenceResult`.

- [ ] **Step 2: Spusť, musí selhat**

Run: `cd apps/api && npx vitest run src/events/absence-determinism.test.ts`
Expected: FAIL (`hracProAbsenci` nemá druhý parametr, obviněný nechybí častěji).

- [ ] **Step 3: Implementace**

V `apps/api/src/events/absence.ts`:

1. Do `PlayerForAbsence` za `transferUnrest?: number;` přidej:

```ts
  /** Vliv incidentu v klubu (spec 17a). Ve fázi 3 jen `obvineny`. */
  incident?: { druhy: string[] };
```

2. `hracProAbsenci` dostane druhý parametr a na konec vraceného objektu podmíněný klíč; JSDoc doplň větou „Druhý parametr jsou vlivy incidentů z `incidents/absence-hracu.ts`; všechna místa losu je musí předat stejně.":

```ts
export function hracProAbsenci(row: Record<string, unknown>, druhy?: readonly string[]): PlayerForAbsence {
```

```ts
    celebrityTier: pers.celebrityTier,
    ...(druhy && druhy.length > 0 ? { incident: { druhy: [...druhy] } } : {}),
  };
```

3. Pod `PERSONAL_EXCUSES` (za konec pole) přidej:

```ts
// ═══════════════════════════════════════════════
// INCIDENT V KLUBU (spec 17a)
// ═══════════════════════════════════════════════

/** Neprávem obviněný si hledá výmluvy častěji. */
const OBVINENY_SANCE_NAVIC = 0.03;
/** Váha výmluvy „Po obvinění" mezi ostatními kategoriemi (ty mají dohromady kolem 1). */
const OBVINENY_VAHA_VYMLUVY = 0.5;

const OBVINENY_EXCUSES = [
  { text: "Po tom, co jste mě obvinil, nemám na fotbal náladu.", emoji: "\u{1F624}" },
  { text: "Nepřijdu. Pořád mě štve, že mě máte za zloděje.", emoji: "\u{1F624}" },
  { text: "Dneska ne, trenére. Nejdřív si to musím v hlavě srovnat.", emoji: "\u{1F614}" },
  { text: "Nechce se mi mezi kluky, co si o mně myslí, že kradu.", emoji: "\u{1F614}" },
  { text: "Mám toho plný zuby, tentokrát vynechám.", emoji: "\u{1F624}" },
];
```

4. V `generateAbsences` hned za řádek `if ((p.transferUnrest ?? 0) >= 40) baseChance += 0.05;` přidej:

```ts
    // Neprávem obviněný (spec 17a). Jiné vlivy incidentu los nemění.
    const obvineny = p.incident?.druhy.includes("obvineny") ?? false;
    if (obvineny) baseChance += OBVINENY_SANCE_NAVIC;
```

5. Za objekt `weights` (před `const category = rng.weighted(weights)`) přidej. Klíč se přidává jen obviněnému, aby se ostatním hráčům nezměnilo pořadí ani součet vah:

```ts
    if (obvineny) weights.incident = OBVINENY_VAHA_VYMLUVY;
```

6. Do `switch (category)` přidej větev:

```ts
      case "incident": {
        const pick = rng.pick(OBVINENY_EXCUSES);
        smsText = pick.text;
        emoji = pick.emoji;
        excuseTiming = "day_before";
        break;
      }
```

7. Do `CATEGORY_LABELS` přidej `incident: "Po obvinění",`.

- [ ] **Step 4: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/events src/incidents && npx tsc --noEmit`
Expected: PASS (včetně `absence-weather.test.ts` a původních testů determinismu).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/events/absence.ts apps/api/src/events/absence-determinism.test.ts
git commit -F - <<'EOF'
feat(incidenty): nepravem obvineny v losu omluvenek

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Incidentní absence na všech šesti místech losu omluvenek

**Files:**
- Modify: `apps/api/src/season/season-weather.ts`, `apps/api/src/season/team-day.ts`, `apps/api/src/events/match-absences.ts`, `apps/api/src/routes/game.ts`, `apps/api/src/multiplayer/match-runner.ts`
- Create: `apps/api/src/season/termin-zapasu.test.ts`

**Interfaces:**
- Consumes: `nactiIncidentniKontext(db, teamId, datum)`, `pridejIncidentniAbsence(absence, hraciIds, incidentni, timing)`, `prazdnyKontext()` (Task 1); `hracProAbsenci(row, druhy?)` (Task 2).
- Produces: `export async function terminZapasu(db: D1Database, matchKey: string): Promise<string | null>` v `season/season-weather.ts` (ligové kolo → pohárový zápas → přátelák). `resolveWeatherForMatchKey` ho používá.

Pravidlo pro všechna místa: **hráč dostane vlivy (`kontext.druhy.get(id)`) už v `hracProAbsenci` a `pridejIncidentniAbsence` se volá na výsledek losu nad přesně tím polem hráčů, do kterého ukazuje `playerIndex`.** Datum pro kontext je termín zápasu (ne dnešní herní den).

- [ ] **Step 1: Failing test pro termín zápasu**

`apps/api/src/season/termin-zapasu.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { terminZapasu } from "./season-weather";

describe("termín zápasu podle klíče", () => {
  it("najde ligové kolo, pohár i přátelák, jinak null", async () => {
    const liga = new FalesnaD1([{ sql: /FROM season_calendar/, first: { scheduled_at: "2026-09-20T15:00:00.000Z" } }]);
    expect(await terminZapasu(jakoD1(liga), "cal-1")).toBe("2026-09-20T15:00:00.000Z");

    const pohar = new FalesnaD1([{ sql: /FROM cup_matches/, first: { scheduled_at: "2026-09-21T15:00:00.000Z" } }]);
    expect(await terminZapasu(jakoD1(pohar), "cup-1")).toBe("2026-09-21T15:00:00.000Z");

    const pratelak = new FalesnaD1([{ sql: /FROM matches WHERE id/, first: { created_at: "2026-09-22T10:00:00.000Z" } }]);
    expect(await terminZapasu(jakoD1(pratelak), "m-1")).toBe("2026-09-22T10:00:00.000Z");

    expect(await terminZapasu(jakoD1(new FalesnaD1()), "nic")).toBeNull();
    expect(await terminZapasu(jakoD1(new FalesnaD1()), "")).toBeNull();
  });
});
```

Run: `cd apps/api && npx vitest run src/season/termin-zapasu.test.ts` → FAIL (`terminZapasu` neexistuje).

- [ ] **Step 2: `terminZapasu`**

V `apps/api/src/season/season-weather.ts` nahraď funkci `resolveWeatherForMatchKey` těmito dvěma:

```ts
/**
 * Termín zápasu podle klíče: ligové kolo (`season_calendar`), pohárový zápas
 * (`cup_matches`), nebo přátelák (`matches.created_at`). `null`, když klíč nic nezná.
 */
export async function terminZapasu(db: D1Database, matchKey: string): Promise<string | null> {
  if (!matchKey) return null;
  const hledej = async (sql: string, sloupec: "scheduled_at" | "created_at"): Promise<string | null> => {
    const row = await db.prepare(sql).bind(matchKey).first<Record<string, string>>()
      .catch((e) => { logger.warn({ module: "season-weather" }, `termín zápasu ${matchKey} se nenačetl`, e); return null; });
    return row?.[sloupec] ?? null;
  };
  return await hledej("SELECT scheduled_at FROM season_calendar WHERE id = ?", "scheduled_at")
    ?? await hledej("SELECT scheduled_at FROM cup_matches WHERE id = ?", "scheduled_at")
    ?? await hledej("SELECT created_at FROM matches WHERE id = ?", "created_at");
}

export async function resolveWeatherForMatchKey(
  db: D1Database,
  matchKey: string,
): Promise<RoundWeather | null> {
  const termin = await terminZapasu(db, matchKey);
  if (!termin) return null;
  return resolveWeatherForDate(db, termin);
}
```

(Zachovej JSDoc, který nad `resolveWeatherForMatchKey` dnes je.)

- [ ] **Step 3: SMS den předem (`season/team-day.ts`, blok „Day-before attendance messages")**

1. Dotaz na zítřejší zápas typuj s termínem: `.first<{ id: string; scheduled_at: string }>()` (SQL už `scheduled_at` vybírá).
2. Hned za načtení `squadRows` (`...ORDER BY p.overall_rating DESC\`).bind(teamId).all();`) vlož:

```ts
              // Incidenty (spec 17a): vlivy do losu, výslech, soud a vyřazení až po losu.
              const { nactiIncidentniKontext, pridejIncidentniAbsence } = await import("../incidents/absence-hracu");
              const incKontext = await nactiIncidentniKontext(env.DB, teamId, tomorrowMatch.scheduled_at);
```

3. `const absSquad = squadRows.results.map((r) => hracProAbsenci(r));` nahraď:

```ts
              const absSquad = squadRows.results.map((r) => hracProAbsenci(r, incKontext.druhy.get(r.id as string)));
```

4. Volání `const dayBeforeAbsences = generateAbsences(absRng as any, absSquad, { ... });` obal:

```ts
              const dayBeforeAbsences = pridejIncidentniAbsence(
                generateAbsences(absRng as any, absSquad, {
                  timing: "day_before", district: teamDistrict,
                  commuteMod: await fetchTeamCommuteMod(env.DB, teamId),
                  weather: (await resolveRoundWeather(env.DB, tomorrowMatch.id as string))?.weather,
                }),
                squadRows.results.map((r) => r.id as string), incKontext.absence, "day_before",
              );
```

- [ ] **Step 4: SMS v den zápasu (`season/team-day.ts`, blok „match_day")**

1. Dotaz na dnešní zápas typuj `.first<{ id: string; scheduled_at: string }>()`.
2. Za načtení `squadRows` vlož stejné načtení kontextu s `todayMatch.scheduled_at`:

```ts
            const { nactiIncidentniKontext, pridejIncidentniAbsence } = await import("../incidents/absence-hracu");
            const incKontext = await nactiIncidentniKontext(env.DB, teamId, todayMatch.scheduled_at);
```

3. `absSquad` s vlivy jako v kroku 3.
4. `const matchDayAbsences = generateAbsences(mdRng as any, absSquad, {...}).filter(...)` změň na:

```ts
              const matchDayAbsences = pridejIncidentniAbsence(
                generateAbsences(mdRng as any, absSquad, {
                  timing: "match_day", district: teamDistrictMd,
                  commuteMod: await fetchVanModMd(env.DB, teamId),
                  weather: (await resolveMdWeather(env.DB, todayMatch.id as string))?.weather,
                }),
                squadRows.results.map((r) => r.id as string), incKontext.absence, "match_day",
              )
                .filter((a) => {
                  const pid = squadRows.results[a.playerIndex]?.id as string;
                  return pid && !alreadyIds.has(pid);
                });
```

- [ ] **Step 5: Detail hráče a sestava (`events/match-absences.ts`, `getAbsentPlayersMap`)**

1. Import nahoře: `import { nactiIncidentniKontext, pridejIncidentniAbsence } from "../incidents/absence-hracu";`
2. Za `const healthyPlayers = ...` vlož `const incKontext = await nactiIncidentniKontext(db, teamId, ctx.scheduledAt);`
3. `const absenceSquad = healthyPlayers.map((row) => hracProAbsenci(row, incKontext.druhy.get(row.id as string)));`
4. Deduplikaci nahraď:

```ts
  const seen = new Set<number>();
  const absences = pridejIncidentniAbsence(
    [...dayBeforeAbs, ...matchDayAbs].filter((a) => {
      if (seen.has(a.playerIndex)) return false;
      seen.add(a.playerIndex);
      return true;
    }),
    healthyPlayers.map((r) => r.id as string), incKontext.absence, "day_before",
  );
```

- [ ] **Step 6: Náhled zápasu (`routes/game.ts`, blok s komentářem „Preview spouští obě fáze")**

1. Za `const { hracProAbsenci } = await import("../events/absence");` vlož:

```ts
  const { nactiIncidentniKontext, pridejIncidentniAbsence } = await import("../incidents/absence-hracu");
  const incKontext = await nactiIncidentniKontext(c.env.DB, teamId, scheduledAt!);
```

2. `const absenceSquad = healthyPlayers.map((row) => hracProAbsenci(row, incKontext.druhy.get(row.id as string)));`
3. Uvnitř `if (daysUntilMatch <= 1)` nahraď přiřazení `absences = [...dayBeforeAbs, ...matchDayAbs].filter(...)`:

```ts
    absences = pridejIncidentniAbsence(
      [...dayBeforeAbs, ...matchDayAbs].filter((a) => {
        if (seen.has(a.playerIndex)) return false;
        seen.add(a.playerIndex);
        return true;
      }),
      healthyPlayers.map((r) => r.id as string), incKontext.absence, "day_before",
    );
```

- [ ] **Step 7: Admin trigger SMS (`routes/game.ts`, route s logem „trigger-day-before")**

`tomorrowMatch` už je typovaný s `scheduled_at`. Za načtení `squadRows` vlož:

```ts
    const { nactiIncidentniKontext, pridejIncidentniAbsence } = await import("../incidents/absence-hracu");
    const incKontext = await nactiIncidentniKontext(c.env.DB, teamId, tomorrowMatch.scheduled_at);
```

`absSquad` s vlivy a `dayBeforeAbsences` obal `pridejIncidentniAbsence(generateAbsences(...), squadRows.results.map((r) => r.id as string), incKontext.absence, "day_before")` stejně jako v kroku 3.

- [ ] **Step 8: Simulace (`multiplayer/match-runner.ts`, `buildMatchPlayers`, blok `if (options?.matchKey)`)**

1. Na začátek bloku `try` vlož:

```ts
            const {nactiIncidentniKontext, pridejIncidentniAbsence, prazdnyKontext} = await import("../incidents/absence-hracu");
            const {terminZapasu} = await import("../season/season-weather");
            const terminAbsenci = await terminZapasu(db, options.matchKey);
            const incKontext = terminAbsenci ? await nactiIncidentniKontext(db, teamId, terminAbsenci) : prazdnyKontext();
```

2. `const squadForAbsence = healthyRows.map((row) => hracProAbsenci(row, incKontext.druhy.get(row.id as string)));`
3. `const allAbsences = [...dayBeforeAbs, ...matchDayAbs].filter(...)` nahraď:

```ts
            const allAbsences = pridejIncidentniAbsence(
                [...dayBeforeAbs, ...matchDayAbs].filter((a) => {
                    if (seen.has(a.playerIndex)) return false;
                    seen.add(a.playerIndex);
                    return true;
                }),
                healthyRows.map((r) => r.id as string), incKontext.absence, "day_before",
            );
```

- [ ] **Step 9: Kontrola úplnosti**

Run: `cd apps/api && grep -rn "hracProAbsenci(r\(ow\)\?)" src --include='*.ts' | grep -v test`
Expected: nic (každé volání dostává vlivy).

Run: `cd apps/api && grep -rn "generateAbsences(" src --include='*.ts' | grep -v "test\|events/absence.ts"`
Expected: 9 řádků (team-day 2, match-absences 2, game.ts 3, match-runner 2) a u každého je výsledek (nebo deduplikovaný součet) obalený `pridejIncidentniAbsence`.

- [ ] **Step 10: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/events src/incidents src/season/termin-zapasu.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/season/season-weather.ts apps/api/src/season/termin-zapasu.test.ts apps/api/src/season/team-day.ts apps/api/src/events/match-absences.ts apps/api/src/routes/game.ts apps/api/src/multiplayer/match-runner.ts
git commit -F - <<'EOF'
feat(incidenty): incidentni absence ve vsech mistech losu omluvenek

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: Výslech, soud a trest vyřazení

**Files:**
- Modify: `apps/api/src/incidents/vysetrovani.ts`, `vysetrovani.test.ts`, `akce.ts`, `akce-tresty.test.ts`, `vysetrovani-den.ts`, `vysetrovani-den.test.ts`, `texty.ts`, `apps/api/src/routes/incidents.ts`, `apps/api/src/multiplayer/match-runner.ts`

**Interfaces:**
- Consumes: `prikazAbsence(db, a)`, `denPlus(den, dni)` (Task 1); konstanty `VYSLECH_ZA_DNI`, `SOUD_PO_ODHALENI_DNI`, `VYRAZENI_MAX_ZAPASU`; texty `absence_vyslech`, `absence_soud`, `absence_vyrazen`.
- Produces:
  - `AkceTrestu` a `AKCE_TRESTU` obsahují `"vyradit"` v pořadí `["odpustit", "srazka", "pokuta", "vyradit", "vyhodit", "policie", "nechat_byt"]`.
  - `rozhodni(env, teamId, incidentId, akce, volby: { zapasu?: number } = {})`; `vyradit` bez platného `zapasu` (celé číslo 1–3) → `{ ok: false, kod: 400, chyba: "Vyber 1 až 3 zápasy" }`.
  - Vyřazení: `resolution = 'vyradit'`, `resolution_data = {"zapasu": n}`, pachatel morálka −10, neoblíbený pachatel → kádr +1, absence `vyrazen` se `zapasu_zbyva = n`, SMS hráče `trest_vyradit`.
  - Udání (`policie`): absence `vyslech` (dnes + 2) a `soud` (den výsledku šetření).
  - Odhalení policií (`odhalen_hrac`): absence `vyslech` (dnes + 2) a `soud` (dnes + 5).
  - Match-runner po ligovém kole odečte `zapasu_zbyva` o 1 u vyřazení obou týmů.
  - `POST /api/teams/:teamId/incidents/:id/rozhodnuti` přijme `{ akce, zapasu? }`.

- [ ] **Step 1: Texty**

V `apps/api/src/incidents/texty.ts` přidej do `TEXTY` (před `lhuta_kradez`):

```ts
  trest_vyradit: [
    "Chápu, trenére. Pár zápasů si odsedím.",
    "Dobře, zasloužil jsem si to. Budu makat na tréninku.",
    "Beru to. Vrátím se lepší.",
  ],
```

- [ ] **Step 2: Failing testy**

V `apps/api/src/incidents/vysetrovani.test.ts` v testu „odhalený pachatel v kádru: tresty…" změň očekávaný seznam na:

```ts
      obvinit: false, policie: false, tresty: ["odpustit", "srazka", "pokuta", "vyradit", "vyhodit", "policie", "nechat_byt"],
```

Do `apps/api/src/incidents/akce-tresty.test.ts` přidej do `describe("tresty")`:

```ts
  it("vyřadit: bez platného počtu zápasů 400 a nic se nestane", async () => {
    for (const zapasu of [undefined, 0, 4, 1.5]) {
      const { db, env } = prostredi(ODHALENY);
      expect(await rozhodni(env, "tym-a", "inc-1", "vyradit", { zapasu })).toMatchObject({ ok: false, kod: 400 });
      expect(db.pocet(/UPDATE club_incidents/)).toBe(0);
    }
  });

  it("vyřadit: incident se uzavře a hráč dostane vyřazení na zvolený počet kol", async () => {
    const { db, env } = prostredi(ODHALENY);
    expect(await rozhodni(env, "tym-a", "inc-1", "vyradit", { zapasu: 2 })).toEqual({ ok: true, castka: null });
    const narok = db.dotazy.find((d) => /UPDATE club_incidents SET status = 'uzavreny'/.test(d.sql));
    expect(narok?.params.slice(0, 2)).toEqual(["vyradit", JSON.stringify({ zapasu: 2 })]);
    const absence = db.davky.flat().find((d) => /INSERT OR IGNORE INTO club_incident_absences/.test(d.sql));
    expect(absence?.params.slice(0, 8)).toEqual(["inc-1-abs-3", "inc-1", "tym-a", "p", "vyrazen", null, null, 2]);
    expect(sendPlayerSMS).toHaveBeenCalledTimes(1);
  });

  it("předat policii: výslech za 2 dny a soud v den výsledku", async () => {
    const { db, env } = prostredi(ODHALENY);
    await rozhodni(env, "tym-a", "inc-1", "policie");
    const vysledekOn = String(db.dotazy.find((d) => /SET status = 'policie', resolution = 'policie'/.test(d.sql))?.params[0]).slice(0, 10);
    const absence = db.davky.flat().filter((d) => /club_incident_absences/.test(d.sql));
    expect(absence.map((d) => [d.params[4], d.params[5]])).toEqual([["vyslech", "2026-09-18"], ["soud", vysledekOn]]);
  });
```

V `apps/api/src/incidents/vysetrovani-den.test.ts` v testu pro odhalení hráče policií (hledá přechod `SET status = 'otevreny', police_success = 1, culprit_revealed = 1`) přidej na konec:

```ts
    const absence = db.davky.flat().filter((d) => /club_incident_absences/.test(d.sql));
    expect(absence.map((d) => [d.params[0], d.params[4], d.params[5]])).toEqual([
      [`${id}-abs-1`, "vyslech", "2026-09-18"],
      [`${id}-abs-2`, "soud", "2026-09-21"],
    ]);
```

(Když v testu proměnná `db` z `prostredi(...)` není pojmenovaná, rozlož výsledek na `{ db, env }`.)

- [ ] **Step 3: Spusť, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/vysetrovani.test.ts src/incidents/akce-tresty.test.ts src/incidents/vysetrovani-den.test.ts`
Expected: FAIL.

- [ ] **Step 4: `vysetrovani.ts` a typ**

V `apps/api/src/incidents/typy.ts` rozšiř `AkceTrestu`:

```ts
export type AkceTrestu = "odpustit" | "srazka" | "pokuta" | "vyradit" | "vyhodit" | "policie" | "nechat_byt";
```

V `apps/api/src/incidents/vysetrovani.ts`:

```ts
export const AKCE_TRESTU: readonly AkceTrestu[] = ["odpustit", "srazka", "pokuta", "vyradit", "vyhodit", "policie", "nechat_byt"];
```

- [ ] **Step 5: `akce.ts`**

1. Importy doplň:

```ts
import { denPlus, prikazAbsence } from "./absence-hracu";
```

a do importu z `./nastaveni` přidej `VYRAZENI_MAX_ZAPASU, VYSLECH_ZA_DNI`.

2. `SMS_TRESTU` rozšiř o `vyradit: "trest_vyradit"`.

3. Signatura:

```ts
export async function rozhodni(
  env: Bindings, teamId: string, incidentId: string, akce: AkceTrestu, volby: { zapasu?: number } = {},
): Promise<VysledekAkce<{ castka: number | null }>> {
```

4. Hned za kontrolu `if (!pachatel || !dostupneAkce(...).tresty.includes(akce)) { ... }` vlož:

```ts
  const zapasu = volby.zapasu;
  if (akce === "vyradit" && !(zapasu !== undefined && Number.isInteger(zapasu) && zapasu >= 1 && zapasu <= VYRAZENI_MAX_ZAPASU)) {
    return { ok: false, kod: 400, chyba: "Vyber 1 až 3 zápasy" };
  }
```

5. Ve větvi `if (akce === "policie")` za blok s oblíbeným hráčem (před SMS) vlož:

```ts
    // Výslech a soud jako incidentní absence (spec 7c, 17a), ohlášené dopředu.
    const den = gameDate.slice(0, 10);
    const absence = [
      prikazAbsence(db, {
        incidentId, teamId, playerId: pachatel.id, druh: "vyslech",
        od: denPlus(den, VYSLECH_ZA_DNI), do: denPlus(den, VYSLECH_ZA_DNI), zapasu: null, ohlaseno: den,
        sms: text(rng, "absence_vyslech"),
      }),
      prikazAbsence(db, {
        incidentId, teamId, playerId: pachatel.id, druh: "soud",
        od: vysledekOn.slice(0, 10), do: vysledekOn.slice(0, 10), zapasu: null, ohlaseno: den,
        sms: text(rng, "absence_soud"),
      }),
    ].filter((p): p is D1PreparedStatement => p !== null);
    if (absence.length > 0) {
      await db.batch(absence).catch((e) => logger.error({ module: M }, `absence po udání ${incidentId}`, e));
    }
```

6. `data` rozšiř o vyřazení:

```ts
  const data = akce === "srazka" ? JSON.stringify({ celkem: castka, tydnuZbyva: castka ? SRAZKA_TYDNU : 0 })
    : akce === "pokuta" ? JSON.stringify({ castka })
    : akce === "vyradit" ? JSON.stringify({ zapasu })
    : null;
```

7. V sestavování `davka` za větev `pokuta` přidej:

```ts
  } else if (akce === "vyradit" && zapasu !== undefined) {
    davka.push(posunHrace(db, teamId, pachatel.id, { morale: -10 }));
    // Neoblíbeného zloděje kabina ráda nevidí (spec 7d).
    if (!oblibeny) davka.push(posunKadru(db, teamId, 1, [pachatel.id]));
    const vyrazeni = prikazAbsence(db, {
      incidentId, teamId, playerId: pachatel.id, druh: "vyrazen",
      od: null, do: null, zapasu, ohlaseno: gameDate.slice(0, 10), sms: text(rng, "absence_vyrazen"),
    });
    if (vyrazeni) davka.push(vyrazeni);
```

8. Podmínku SMS rozšiř: `if (akce === "odpustit" || akce === "srazka" || akce === "pokuta" || akce === "vyradit") {`.

- [ ] **Step 6: `vysetrovani-den.ts`**

1. Importy: `import { denPlus, prikazAbsence } from "./absence-hracu";`, do importu z `./nastaveni` přidej `SOUD_PO_ODHALENI_DNI, VYSLECH_ZA_DNI`.

2. Větev `case "odhalen_hrac":` — blok `if (prosel) { await db.batch(prikazyStop(...)) }` nahraď:

```ts
        if (prosel) {
          const den = t.gameDate.slice(0, 10);
          const prikazy = prikazyStop(db, t.teamId, inc.id, [{
            zdroj: "policie", ukazujeNa: inc.culprit_player_id, podezreli: null, drzitel: null,
            sila: 3, bonusPolicie: 0, nalezena: true, text: text(rng, "stopa_policie_hrac", { hrac }),
          }], t.gameDate);
          // Výslech a soud jako incidentní absence (spec 7c, 17a).
          if (inc.culprit_player_id) {
            for (const a of [
              { druh: "vyslech" as const, dni: VYSLECH_ZA_DNI, klic: "absence_vyslech" as const },
              { druh: "soud" as const, dni: SOUD_PO_ODHALENI_DNI, klic: "absence_soud" as const },
            ]) {
              const p = prikazAbsence(db, {
                incidentId: inc.id, teamId: t.teamId, playerId: inc.culprit_player_id, druh: a.druh,
                od: denPlus(den, a.dni), do: denPlus(den, a.dni), zapasu: null, ohlaseno: den, sms: text(rng, a.klic),
              });
              if (p) prikazy.push(p);
            }
          }
          await db.batch(prikazy).catch((e) => logger.warn({ module: M }, `stopa a absence po odhalení ${inc.id}`, e));
        }
```

- [ ] **Step 7: Route**

V `apps/api/src/routes/incidents.ts` nahraď handler `POST /teams/:teamId/incidents/:id/rozhodnuti`:

```ts
incidentsRouter.post("/teams/:teamId/incidents/:id/rozhodnuti", async (c) => {
  const body = await teloPozadavku<{ akce?: string; zapasu?: number | string }>(c, "rozhodnutí");
  const akce = AKCE_TRESTU.find((a) => a === body?.akce);
  if (!akce) return c.json({ error: "Neznámé rozhodnutí" }, 400);
  const zapasu = body?.zapasu === undefined || body.zapasu === "" ? undefined : Number(body.zapasu);
  return odpovedAkce(c, await rozhodni(c.env, c.req.param("teamId"), c.req.param("id"), akce, { zapasu }));
});
```

- [ ] **Step 8: Odečet vyřazení po ligovém kole**

V `apps/api/src/multiplayer/match-runner.ts` hned za příkaz s komentářem „Decrement suspensions for players who SAT OUT this match" přidej:

```ts
                // Klubové vyřazení za incident (spec 17a): odehrané ligové kolo se odečte stejně jako stopka.
                await db.prepare("UPDATE club_incident_absences SET zapasu_zbyva = zapasu_zbyva - 1 WHERE team_id IN (?, ?) AND kind = 'vyrazen' AND zapasu_zbyva > 0")
                    .bind(homeTeamId, awayTeamId).run().catch((e) => logger.warn({module: "match-runner"}, "decrement incident bans", e));
```

- [ ] **Step 9: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents src/routes/incidents.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/incidents/typy.ts apps/api/src/incidents/vysetrovani.ts apps/api/src/incidents/vysetrovani.test.ts apps/api/src/incidents/akce.ts apps/api/src/incidents/akce-tresty.test.ts apps/api/src/incidents/vysetrovani-den.ts apps/api/src/incidents/vysetrovani-den.test.ts apps/api/src/incidents/texty.ts apps/api/src/routes/incidents.ts apps/api/src/multiplayer/match-runner.ts
git commit -F - <<'EOF'
feat(incidenty): vyslech, soud a trest vyrazeni ze zapasu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: Trest vyřadit na stránce incidentu

**Files:**
- Modify: `apps/web/src/app/dashboard/incidenty/typy.ts`, `apps/web/src/app/dashboard/incidenty/DetailIncidentu.tsx`

**Interfaces:**
- Consumes: `POST /api/teams/:teamId/incidents/:id/rozhodnuti` `{ akce: "vyradit", zapasu: "1" | "2" | "3" }` (Task 4); detail vrací `akce.tresty` včetně `"vyradit"`.
- Produces: tlačítko „Vyřadit ze zápasů" s výběrem 1 až 3 kol, info řádek v seznamu trestů, popisky výsledku.

- [ ] **Step 1: `typy.ts`**

1. `export type AkceTrestu = "odpustit" | "srazka" | "pokuta" | "vyradit" | "vyhodit" | "policie" | "nechat_byt";`
2. `VYSLEDEK_LABEL` doplň `vyradit: "Vyřazen ze zápasů",`
3. `TREST_LABEL` doplň `vyradit: "Vyřadit ze zápasů",`
4. `TREST_HOTOVO` doplň `vyradit: "Hráč vynechá příští ligová kola.",`

- [ ] **Step 2: `DetailIncidentu.tsx`**

1. Stav pod `const [potvrditVyhazov, setPotvrditVyhazov] = useState(false);`:

```tsx
  const [kolVyrazeni, setKolVyrazeni] = useState("1");
```

2. Funkci `rozhodnout` nahraď:

```tsx
  function rozhodnout(a: AkceTrestu, navic: Record<string, string> = {}) {
    void proved("rozhodnuti", { akce: a, ...navic }, () => TREST_HOTOVO[a]);
  }
```

3. V seznamu info řádků trestů (`<ul className="text-sm text-muted space-y-1">`) za řádek pokuty přidej:

```tsx
                {akce.tresty.includes("vyradit") && <li>Vyřadit: hráč vynechá příští 1 až 3 ligová kola, do té doby nenastoupí ani v poháru.</li>}
```

4. Mřížku tlačítek trestů filtruj i bez vyřazení: `akce.tresty.filter((a) => a !== "vyhodit" && a !== "vyradit")`.

5. Hned za mřížku (před blok vyhazovu) přidej:

```tsx
              {akce.tresty.includes("vyradit") && (
                <div className="flex gap-2">
                  <select
                    value={kolVyrazeni}
                    onChange={(e) => setKolVyrazeni(e.target.value)}
                    aria-label="Počet ligových kol"
                    className="rounded-soft border border-gray-200 bg-white px-3 py-2 text-base"
                  >
                    <option value="1">1 kolo</option>
                    <option value="2">2 kola</option>
                    <option value="3">3 kola</option>
                  </select>
                  <button
                    onClick={() => rozhodnout("vyradit", { zapasu: kolVyrazeni })}
                    disabled={pracuje}
                    className="flex-1 px-3 py-2 rounded-soft text-sm font-heading font-bold border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {TREST_LABEL.vyradit}
                  </button>
                </div>
              )}
```

- [ ] **Step 3: Typecheck, build, kontrola textů**

Run: `cd apps/web && npx tsc --noEmit && npx next build --no-lint`
Expected: bez chyb.

Run: `grep -n "—" apps/web/src/app/dashboard/incidenty/*.ts*`
Expected: nic.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/incidenty/typy.ts apps/web/src/app/dashboard/incidenty/DetailIncidentu.tsx
git commit -F - <<'EOF'
feat(incidenty): trest vyradit ze zapasu na strance incidentu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: Den výslechu a soudu na tréninku

**Files:**
- Modify: `apps/api/src/season/training.ts`, `apps/api/src/season/daily-tick.ts`
- Create: `apps/api/src/season/training-incident.test.ts`

**Interfaces:**
- Consumes: `nactiIncidentniAbsence(db, teamId, datum)`, `duvodyNaTrenink(hraciIds, absence)` (Task 1).
- Produces: `simulateTraining(rng, squad, plan, commuteKms?, equipmentMultiplier?, managerBonus?, equipExtras?, weather?, incidentniDuvody?: ReadonlyArray<string | undefined>)` — hráč s důvodem na svém indexu na trénink nepřijde a v docházce má ten důvod.

- [ ] **Step 1: Failing test**

`apps/api/src/season/training-incident.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { simulateTraining, type TrainingPlayer } from "./training";

function hrac(over: Partial<TrainingPlayer> = {}): TrainingPlayer {
  return {
    firstName: "Jan", lastName: "Novák", position: "MID", age: 25,
    speed: 30, technique: 30, shooting: 30, passing: 30, heading: 30, defense: 30,
    goalkeeping: 1, vision: 30, creativity: 30, setPieces: 30, stamina: 30, strength: 30,
    injuryProneness: 50, discipline: 100, patriotism: 50, alcohol: 10, temper: 30,
    occupation: "zedník", bodyType: "normal", avatarConfig: {} as never,
    condition: 100, morale: 50, preferredFoot: "right", preferredSide: "center",
    leadership: 30, workRate: 50, aggression: 40, consistency: 50, clutch: 50,
    ...over,
  } as TrainingPlayer;
}

const PLAN = { sessionsPerWeek: 3, type: "tactics" as const, approach: "strict" as const };

describe("incident na tréninku", () => {
  it("hráč s výslechem nepřijde a důvod je výslech, bez incidentu přijde", () => {
    const squad = [hrac(), hrac({ firstName: "Petr" })];
    for (let seed = 1; seed <= 30; seed++) {
      const s = simulateTraining(createRng(seed), squad, PLAN, undefined, 1, undefined, {}, undefined, ["Byl na výslechu na policii", undefined]);
      expect(s.attendance[0]).toEqual({ playerIndex: 0, attended: false, reason: "Byl na výslechu na policii" });
    }
  });

  it("bez incidentních důvodů je trénink stejný jako dřív", () => {
    const squad = [hrac(), hrac({ discipline: 20 }), hrac({ alcohol: 90 })];
    for (let seed = 1; seed <= 30; seed++) {
      expect(simulateTraining(createRng(seed), squad, PLAN, undefined, 1, undefined, {}, undefined, [undefined, undefined, undefined]))
        .toEqual(simulateTraining(createRng(seed), squad, PLAN));
    }
  });
});
```

Run: `cd apps/api && npx vitest run src/season/training-incident.test.ts` → FAIL (hráč s výslechem na trénink přijde).

Pokud `simulateTraining` vrací nedeterministická data (např. náhodné id), porovnávej ve druhém testu jen `attendance` a `improvements`.

- [ ] **Step 2: `training.ts`**

1. `simulateAttendance` dostane poslední parametr:

```ts
  managerDiscipline: number = 40,
  /** Důvod incidentní absence po indexech kádru (výslech, soud). Hráč s důvodem nepřijde. */
  incidentniDuvody?: ReadonlyArray<string | undefined>,
): TrainingAttendance[] {
```

2. Řádek `if (rng.random() < attendProb) {` nahraď. Hod se bere vždy, aby se ostatním hráčům neposunula náhoda:

```ts
    const hod = rng.random();
    // Den incidentní absence (spec 17b): na tréninku chybí, ať je docházka jakákoli.
    const incidentniDuvod = incidentniDuvody?.[i];
    if (incidentniDuvod) {
      return { playerIndex: i, attended: false, reason: incidentniDuvod };
    }
    if (hod < attendProb) {
```

3. `simulateTraining` dostane poslední parametr a předá ho:

```ts
  /** Počasí tréninkového dne z `resolveWeatherForDate`. */
  weather?: Weather,
  /** Důvody incidentní absence po indexech kádru (`duvodyNaTrenink`). */
  incidentniDuvody?: ReadonlyArray<string | undefined>,
): TrainingResult {
```

```ts
  const session = simulateAttendance(
    rng, squad, plan.approach, commuteKms,
    (equipExtras.attendanceBonus ?? 0) + trainingWeatherMod(weather),
    managerBonus.discipline,
    incidentniDuvody,
  );
```

- [ ] **Step 3: `daily-tick.ts`**

Před `const result = simulateTraining(rng, squad, {` vlož:

```ts
        // Den výslechu nebo soudu (spec 17b): hráč na trénink nepřijde. Vyřazení ze zápasů trénink nezakazuje.
        const { nactiIncidentniAbsence, duvodyNaTrenink } = await import("../incidents/absence-hracu");
        const incidentniDuvody = duvodyNaTrenink(
          playersResult.results.map((row) => row.id as string),
          await nactiIncidentniAbsence(env.DB, clubId, team.game_date as string),
        );
```

a do volání `simulateTraining` přidej za `trainingWeather?.weather` argument `incidentniDuvody`:

```ts
          // Počasí tréninkového dne — týž zdroj jako předpověď a zápas.
          trainingWeather?.weather,
          incidentniDuvody);
```

- [ ] **Step 4: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/season/training-incident.test.ts src/season/mentoring.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/season/training.ts apps/api/src/season/training-incident.test.ts apps/api/src/season/daily-tick.ts
git commit -F - <<'EOF'
feat(incidenty): vyslech a soud na treninku

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 7: Incidenty v zápase

**Files:**
- Create: `apps/api/src/incidents/zapas.ts`, `apps/api/src/incidents/zapas.test.ts`
- Modify: `apps/api/src/multiplayer/match-runner.ts`, `apps/api/src/cup/cup.ts`

**Interfaces:**
- Consumes: `nactiDruhyHracu(db, teamId, datum)`, `DruhVlivu` (Task 1).
- Produces (`incidents/zapas.ts`):
  - `export interface HracVZapase { id: number; morale: number; consistency: number }`
  - `export interface IncidentVZapase { obvinenych: number; pachatelVSestave: boolean }`
  - `export function upravSestavuZIncidentu(skupiny: HracVZapase[][], idMap: ReadonlyMap<number, string>, druhy: ReadonlyMap<string, readonly string[]>): IncidentVZapase` — mění hráče na místě: neprávem obviněný morálka −8 a konzistence −10 (min. 0); když je v první skupině (základní sestava) odhalený pachatel, všem hráčům ve všech skupinách morálka −2.
  - `export async function applyIncidentMatchMods(db: D1Database, teamId: string, skupiny: HracVZapase[][], idMap: ReadonlyMap<number, string>): Promise<IncidentVZapase | null>` — datum = `teams.game_date`; `null` bez týmu nebo bez vlivů.

- [ ] **Step 1: Failing test**

`apps/api/src/incidents/zapas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyIncidentMatchMods, upravSestavuZIncidentu, type HracVZapase } from "./zapas";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";

const hrac = (id: number, morale = 60, consistency = 50): HracVZapase => ({ id, morale, consistency });
const ID_MAP = new Map([[1, "a"], [2, "p"], [3, "c"], [4, "o"]]);

describe("incidenty v zápase", () => {
  it("neprávem obviněný hraje s nižší morálkou a konzistencí, ostatní beze změny", () => {
    const zaklad = [hrac(1), hrac(4, 5, 5)];
    const lavka = [hrac(3)];
    const info = upravSestavuZIncidentu([zaklad, lavka], ID_MAP, new Map([["o", ["obvineny"]]]));
    expect(info).toEqual({ obvinenych: 1, pachatelVSestave: false });
    expect(zaklad[1]).toEqual({ id: 4, morale: 0, consistency: 0 });
    expect(zaklad[0]).toEqual(hrac(1));
    expect(lavka[0]).toEqual(hrac(3));
  });

  it("odhalený pachatel v základní sestavě sníží morálku celému týmu", () => {
    const zaklad = [hrac(1), hrac(2)];
    const lavka = [hrac(3)];
    const info = upravSestavuZIncidentu([zaklad, lavka], ID_MAP, new Map([["p", ["pachatel"]]]));
    expect(info.pachatelVSestave).toBe(true);
    expect([...zaklad, ...lavka].map((h) => h.morale)).toEqual([58, 58, 58]);
  });

  it("pachatel jen na lavičce týmu nevadí", () => {
    const zaklad = [hrac(1)];
    const lavka = [hrac(2)];
    expect(upravSestavuZIncidentu([zaklad, lavka], ID_MAP, new Map([["p", ["pachatel"]]])).pachatelVSestave).toBe(false);
    expect(zaklad[0].morale).toBe(60);
  });

  it("načte vlivy k hernímu datu týmu a bez vlivů nic nemění", async () => {
    const db = new FalesnaD1([{ sql: /SELECT game_date FROM teams/, first: { game_date: "2026-09-20T16:00:00.000Z" } }]);
    const zaklad = [hrac(1)];
    expect(await applyIncidentMatchMods(jakoD1(db), "tym-a", [zaklad], ID_MAP)).toBeNull();
    expect(zaklad[0]).toEqual(hrac(1));
    expect(db.pocet(/FROM club_incidents/)).toBe(1);
  });
});
```

Run: `cd apps/api && npx vitest run src/incidents/zapas.test.ts` → FAIL (modul neexistuje).

- [ ] **Step 2: `incidents/zapas.ts`**

```ts
/**
 * Incidenty v zápase (spec 17c). Úpravy sestavy v paměti před simulací,
 * vedle bonusu trenéra (`season/manager-match-bonus.ts`).
 */

import { logger } from "../lib/logger";
import { nactiDruhyHracu } from "./absence-hracu";

const M = "incidents-zapas";

export interface HracVZapase {
  id: number;
  morale: number;
  consistency: number;
}

export interface IncidentVZapase {
  obvinenych: number;
  pachatelVSestave: boolean;
}

const OBVINENY_MORALKA = -8;
const OBVINENY_KONZISTENCE = -10;
const PACHATEL_TYM_MORALKA = -2;

/** `skupiny[0]` je základní sestava, další skupiny lavička. Mění hráče na místě. */
export function upravSestavuZIncidentu(
  skupiny: HracVZapase[][],
  idMap: ReadonlyMap<number, string>,
  druhy: ReadonlyMap<string, readonly string[]>,
): IncidentVZapase {
  const druhyHrace = (h: HracVZapase) => druhy.get(idMap.get(h.id) ?? "") ?? [];
  let obvinenych = 0;
  for (const skupina of skupiny) {
    for (const h of skupina) {
      if (!druhyHrace(h).includes("obvineny")) continue;
      h.morale = Math.max(0, h.morale + OBVINENY_MORALKA);
      h.consistency = Math.max(0, h.consistency + OBVINENY_KONZISTENCE);
      obvinenych++;
    }
  }
  const pachatelVSestave = (skupiny[0] ?? []).some((h) => druhyHrace(h).includes("pachatel"));
  if (pachatelVSestave) {
    for (const skupina of skupiny) {
      for (const h of skupina) h.morale = Math.max(0, h.morale + PACHATEL_TYM_MORALKA);
    }
  }
  return { obvinenych, pachatelVSestave };
}

export async function applyIncidentMatchMods(
  db: D1Database,
  teamId: string,
  skupiny: HracVZapase[][],
  idMap: ReadonlyMap<number, string>,
): Promise<IncidentVZapase | null> {
  const tym = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `herní datum pro zápas ${teamId}`, e); return null; });
  if (!tym?.game_date) return null;
  const druhy = await nactiDruhyHracu(db, teamId, tym.game_date);
  if (druhy.size === 0) return null;
  return upravSestavuZIncidentu(skupiny, idMap, druhy);
}
```

- [ ] **Step 3: Zapojení**

V `apps/api/src/multiplayer/match-runner.ts` hned za dvě volání `applyManagerMatchBonus` přidej:

```ts
            // Incidenty v klubu (spec 17c): neprávem obviněný a odhalený zloděj v sestavě.
            const {applyIncidentMatchMods} = await import("../incidents/zapas");
            await applyIncidentMatchMods(db, homeTeamId, [homeLineup, homeSubs], homeBuild.idMap);
            await applyIncidentMatchMods(db, awayTeamId, [awayLineup, awaySubs], awayBuild.idMap);
```

V `apps/api/src/cup/cup.ts` hned za dvě volání `applyManagerMatchBonus` přidej:

```ts
  const { applyIncidentMatchMods } = await import("../incidents/zapas");
  if (homeReal) await applyIncidentMatchMods(db, homeReal, [homeLineup, homeSubs], homeBuild.idMap);
  if (awayReal) await applyIncidentMatchMods(db, awayReal, [awayLineup, awaySubs], awayBuild.idMap);
```

Když typecheck odmítne předat sestavu jako `HracVZapase[][]` (hráči mají víc polí, to je v pořádku), ověř, že `MatchPlayer` má `id: number`, `morale: number`, `consistency: number`; jinak uprav jen typ `HracVZapase`, ne engine.

- [ ] **Step 4: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/incidents/zapas.ts apps/api/src/incidents/zapas.test.ts apps/api/src/multiplayer/match-runner.ts apps/api/src/cup/cup.ts
git commit -F - <<'EOF'
feat(incidenty): nepravem obvineny a odhaleny zlodej v zapase

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 8: Incidenty v kabině

**Files:**
- Modify: `apps/api/src/season/kabina.ts`, `apps/api/src/season/team-day.ts`
- Create: `apps/api/src/season/kabina-incident.test.ts`

**Interfaces:**
- Consumes: `nactiDruhyHracu(db, teamId, datum)` (Task 1); `KAMARADSKE_VZTAHY`, `SILA_KAMARADSTVI` (`incidents/nastaveni.ts`).
- Produces:
  - `export function incidentyVKabine(hraci: readonly string[], druhy: ReadonlyMap<string, readonly string[]>, kamaradi: ReadonlyMap<string, ReadonlySet<string>>): { delta: Map<string, number>; nesmiBytTahoun: Set<string> }` — odhalený pachatel: každý jiný hráč −1 kromě jeho kamarádů; pachatel nesmí být tahoun. Neprávem obviněný: sám −2, jeho kamarádi −1.
  - `processKabina(db, teamId, gameDate?: string)`; `KabinaResult.incident: string | null` (věta do notifikace, bez dlouhé pomlčky).
  - `team-day.ts` volá `processKabina(env.DB, teamId, newGameDate)` a notifikaci pošle i tehdy, když je `kab.incident`.

- [ ] **Step 1: Failing test**

`apps/api/src/season/kabina-incident.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { incidentyVKabine } from "./kabina";

const HRACI = ["p", "k", "a", "b", "o", "ko"];

describe("incidenty v kabině", () => {
  it("odhalený pachatel: ostatní −1, jeho kamarádi nic, tahounem být nesmí", () => {
    const { delta, nesmiBytTahoun } = incidentyVKabine(HRACI, new Map([["p", ["pachatel"]]]), new Map([["p", new Set(["k"])]]));
    expect(Object.fromEntries(delta)).toEqual({ a: -1, b: -1, o: -1, ko: -1 });
    expect([...nesmiBytTahoun]).toEqual(["p"]);
  });

  it("neprávem obviněný: sám −2, kamarádi −1", () => {
    const { delta, nesmiBytTahoun } = incidentyVKabine(HRACI, new Map([["o", ["obvineny"]]]), new Map([["o", new Set(["ko", "mimo-kadr"])]]));
    expect(Object.fromEntries(delta)).toEqual({ o: -2, ko: -1 });
    expect(nesmiBytTahoun.size).toBe(0);
  });

  it("bez vlivů nic", () => {
    expect(incidentyVKabine(HRACI, new Map(), new Map()).delta.size).toBe(0);
  });
});
```

Run: `cd apps/api && npx vitest run src/season/kabina-incident.test.ts` → FAIL.

- [ ] **Step 2: `kabina.ts`**

1. Importy:

```ts
import { nactiDruhyHracu } from "../incidents/absence-hracu";
import { KAMARADSKE_VZTAHY, SILA_KAMARADSTVI } from "../incidents/nastaveni";
```

2. `KabinaResult` doplň:

```ts
  /** Věta o incidentu do notifikace (odhalený zloděj nebo křivě obviněný), jinak null. */
  incident: string | null;
```

3. Nad `processKabina` přidej čistou funkci:

```ts
/**
 * Incidenty v kabině (spec 17c). Odhalenému zlodějovi kabina nevěří: ostatní −1,
 * jeho kamarádi drží s ním (0) a tahounem být nemůže. Křivě obviněný nese křivdu:
 * sám −2, kamarádi −1. Počítá jen hráče z `hraci`.
 */
export function incidentyVKabine(
  hraci: readonly string[],
  druhy: ReadonlyMap<string, readonly string[]>,
  kamaradi: ReadonlyMap<string, ReadonlySet<string>>,
): { delta: Map<string, number>; nesmiBytTahoun: Set<string> } {
  const vKadru = new Set(hraci);
  const delta = new Map<string, number>();
  const nesmiBytTahoun = new Set<string>();
  const pridej = (id: string, d: number) => { if (vKadru.has(id)) delta.set(id, (delta.get(id) ?? 0) + d); };
  for (const id of hraci) {
    const d = druhy.get(id) ?? [];
    const jehoKamaradi = kamaradi.get(id) ?? new Set<string>();
    if (d.includes("pachatel")) {
      nesmiBytTahoun.add(id);
      for (const jiny of hraci) if (jiny !== id && !jehoKamaradi.has(jiny)) pridej(jiny, -1);
    }
    if (d.includes("obvineny")) {
      pridej(id, -2);
      for (const kamarad of jehoKamaradi) pridej(kamarad, -1);
    }
  }
  return { delta, nesmiBytTahoun };
}
```

4. Signatura: `export async function processKabina(db: D1Database, teamId: string, gameDate?: string): Promise<KabinaResult> {` a v obou `return` doplň `incident` (u předčasného návratu `incident: null`).

5. Za výběr hráčů (`const players = ...`) a před výběr tahouna načti incidenty:

```ts
  // Incidenty v kabině (spec 17c). Bez herního data se nepočítají.
  const druhy = gameDate ? await nactiDruhyHracu(db, teamId, gameDate) : new Map<string, string[]>();
  let incidentniUpravy = { delta: new Map<string, number>(), nesmiBytTahoun: new Set<string>() };
  let incident: string | null = null;
  if (druhy.size > 0) {
    const idsKadru = players.map((p) => p.id);
    const phKadru = idsKadru.map(() => "?").join(",");
    const typy = KAMARADSKE_VZTAHY.map(() => "?").join(",");
    const vztahy = await db.prepare(
      `SELECT player_a_id, player_b_id FROM relationships
        WHERE type IN (${typy}) AND strength >= ? AND player_a_id IN (${phKadru}) AND player_b_id IN (${phKadru})`,
    ).bind(...KAMARADSKE_VZTAHY, SILA_KAMARADSTVI, ...idsKadru, ...idsKadru)
      .all<{ player_a_id: string; player_b_id: string }>()
      .catch((e) => { logger.warn({ module: M }, "kamarádi pro incidenty v kabině", e); return { results: [] as Array<{ player_a_id: string; player_b_id: string }> }; });
    const kamaradi = new Map<string, Set<string>>();
    for (const r of vztahy.results) {
      kamaradi.set(r.player_a_id, (kamaradi.get(r.player_a_id) ?? new Set()).add(r.player_b_id));
      kamaradi.set(r.player_b_id, (kamaradi.get(r.player_b_id) ?? new Set()).add(r.player_a_id));
    }
    incidentniUpravy = incidentyVKabine(idsKadru, druhy, kamaradi);
    const jmeno = (id: string) => players.find((p) => p.id === id)?.name;
    const pachatel = idsKadru.find((id) => druhy.get(id)?.includes("pachatel"));
    const obvineny = idsKadru.find((id) => druhy.get(id)?.includes("obvineny"));
    incident = pachatel && jmeno(pachatel) ? `kabina nevěří hráči, který kradl: ${jmeno(pachatel)}`
      : obvineny && jmeno(obvineny) ? `křivé obvinění pořád dusí hráče: ${jmeno(obvineny)}`
      : null;
  }
```

6. Výběr tahouna uprav tak, aby vynechal odhaleného zloděje:

```ts
  const byLead = players.filter((p) => !incidentniUpravy.nesmiBytTahoun.has(p.id)).sort((a, b) => b.leadership - a.leadership);
  const tahoun = byLead[0] && byLead[0].leadership >= 65 ? byLead[0] : null;
```

7. Za smyčku vztahů (`for (const r of rels.results) { ... }`) a před „Aplikuj" přidej:

```ts
  for (const [id, d] of incidentniUpravy.delta) add(id, d);
```

8. Do vráceného objektu doplň `incident`.

- [ ] **Step 3: `team-day.ts`**

V bloku „Kabina & frakce (pondělí)":

```ts
        const kab = await processKabina(env.DB, teamId, newGameDate);
        // Lidský tým: čas od času zpráva do kabiny, ať je dynamika vidět (ne každý týden — nespamovat).
        // Incident se hlásí vždy: manažer má vědět, že jeho rozhodnutí kabina nese.
        if (kab.applied && team.user_id !== "ai" && (kab.incident || ((kab.tahoun || kab.potizista) && Math.random() < 0.4))) {
          const parts: string[] = [];
          if (kab.tahoun) parts.push(`${kab.tahoun.name} drží partu`);
          if (kab.potizista) parts.push(`${kab.potizista.name} dělá v kabině dusno`);
          if (kab.incident) parts.push(kab.incident);
```

(zbytek bloku beze změny).

- [ ] **Step 4: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/season/kabina-incident.test.ts src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/season/kabina.ts apps/api/src/season/kabina-incident.test.ts apps/api/src/season/team-day.ts
git commit -F - <<'EOF'
feat(incidenty): odhaleny zlodej a krive obvineny v kabine

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 9: Atributy trenéra podle rozhodnutí o incidentu

**Files:**
- Modify: `apps/api/src/lib/manager-attrs.ts`, `apps/api/src/incidents/incident-db.ts`, `apps/api/src/incidents/akce.ts`, `apps/api/src/incidents/akce-tresty.test.ts`, `apps/api/src/incidents/akce-obvineni.test.ts`

**Interfaces:**
- Consumes: `applyManagerAttrDelta(db, teamId, attr, rawDelta, source, description, { referenceId, gameDate })` (`lib/manager-attrs.ts`); `RECIDIVA_DNI` (`incidents/nastaveni.ts`).
- Produces:
  - `ManagerAttrSource` obsahuje `"incident"`.
  - `export async function jeRecidivista(db: D1Database, teamId: string, playerId: string, kromeIncidentu: string, seasonNumber: number, gameDate: string): Promise<boolean>` v `incident-db.ts` (stejná definice recidivy jako `stav-klubu.ts`).
  - `rozhodni`: `srazka`, `pokuta`, `vyradit`, `vyhodit`, `policie` → disciplína +1 (`inc-{id}-mgr-discipline`); `odpustit` recidivistovi → disciplína −1 (`inc-{id}-mgr-discipline`); `policie` u oblíbeného hráče navíc reputace −1 (`inc-{id}-mgr-reputation`).
  - `obvinHrace`: neprávem obviněný → motivace −1 (`inc-{id}-mgr-motivation-{poradi obvinění}`).
  - Změna atributu se volá až po úspěšném přechodu stavu; selhání se zaloguje a akci nezvrátí.

- [ ] **Step 1: Failing testy**

Do obou testových souborů přidej mock (před importy modulů, které ho používají):

```ts
vi.mock("../lib/manager-attrs", () => ({ applyManagerAttrDelta: vi.fn(async () => ({ applied: 1, oldValue: 40, newValue: 41, skipped: null })) }));
```

a import `import { applyManagerAttrDelta } from "../lib/manager-attrs";`.

Do `akce-tresty.test.ts`:

```ts
describe("atributy trenéra", () => {
  it("důsledný trest zvedne disciplínu", async () => {
    const { env } = prostredi(ODHALENY);
    await rozhodni(env, "tym-a", "inc-1", "pokuta");
    expect(applyManagerAttrDelta).toHaveBeenCalledWith(
      expect.anything(), "tym-a", "discipline", 1, "incident", expect.any(String),
      { referenceId: "inc-inc-1-mgr-discipline", gameDate: DNES },
    );
  });

  it("odpuštění recidivistovi disciplínu sníží, prvnímu odpuštění nic", async () => {
    const recidiva = prostredi(ODHALENY, [{ sql: /culprit_player_id = \? AND id != \?/, first: { ano: 1 } }]);
    await rozhodni(recidiva.env, "tym-a", "inc-1", "odpustit");
    expect(applyManagerAttrDelta).toHaveBeenCalledWith(expect.anything(), "tym-a", "discipline", -1, "incident", expect.any(String), expect.anything());

    vi.mocked(applyManagerAttrDelta).mockClear();
    await rozhodni(prostredi(ODHALENY).env, "tym-a", "inc-1", "odpustit");
    expect(applyManagerAttrDelta).not.toHaveBeenCalled();
  });

  it("udání oblíbeného hráče stojí reputaci", async () => {
    const { env } = prostredi(ODHALENY, [
      { sql: /FROM players WHERE id = \? AND team_id = \?/, first: hracRadek("p", "Pepa", "Průšvih", { personality: JSON.stringify({ leadership: 80 }) }) },
    ]);
    await rozhodni(env, "tym-a", "inc-1", "policie");
    expect(applyManagerAttrDelta).toHaveBeenCalledWith(expect.anything(), "tym-a", "reputation", -1, "incident", expect.any(String), expect.objectContaining({ referenceId: "inc-inc-1-mgr-reputation" }));
  });

  it("nechat být atributy nemění a souběh taky ne", async () => {
    await rozhodni(prostredi(ODHALENY).env, "tym-a", "inc-1", "nechat_byt");
    await rozhodni(prostredi(ODHALENY, [{ sql: /UPDATE club_incidents SET status = 'uzavreny'/, changes: 0 }]).env, "tym-a", "inc-1", "pokuta");
    expect(applyManagerAttrDelta).not.toHaveBeenCalled();
  });
});
```

Do `akce-obvineni.test.ts` do `describe("obvinění")`:

```ts
  it("křivé obvinění sníží motivaci trenéra, obvinění pachatele ne", async () => {
    await obvinHrace(prostredi(incidentRadek()).env, "tym-a", "inc-1", "a");
    expect(applyManagerAttrDelta).toHaveBeenCalledWith(
      expect.anything(), "tym-a", "motivation", -1, "incident", expect.any(String),
      { referenceId: "inc-inc-1-mgr-motivation-1", gameDate: DNES },
    );
    vi.mocked(applyManagerAttrDelta).mockClear();
    await obvinHrace(prostredi(incidentRadek(), [{ sql: /FROM players WHERE id = \? AND team_id = \?/, first: hracRadek("p", "Pepa", "Průšvih") }]).env, "tym-a", "inc-1", "p");
    expect(applyManagerAttrDelta).not.toHaveBeenCalled();
  });
```

(`beforeEach(() => vi.clearAllMocks())` už v souborech je.)

Run: `cd apps/api && npx vitest run src/incidents/akce-tresty.test.ts src/incidents/akce-obvineni.test.ts` → FAIL.

- [ ] **Step 2: Zdroj a recidiva**

V `apps/api/src/lib/manager-attrs.ts` do `ManagerAttrSource` přidej před `| "admin"`:

```ts
  // Rozhodnutí o incidentu v klubu (trest, odpuštění, křivé obvinění, udání).
  | "incident"
```

Do `apps/api/src/incidents/incident-db.ts` přidej (import `gameExpiry` z `../lib/game-time` a `RECIDIVA_DNI` z `./nastaveni`):

```ts
/** Recidivista (spec 5a): pachatel jiného incidentu uzavřeného v posledních 60 dnech téže sezóny. */
export async function jeRecidivista(
  db: D1Database, teamId: string, playerId: string, kromeIncidentu: string, seasonNumber: number, gameDate: string,
): Promise<boolean> {
  const r = await db.prepare(
    `SELECT 1 AS ano FROM club_incidents
      WHERE team_id = ? AND culprit_player_id = ? AND id != ? AND season_number = ? AND culprit_type = 'hrac'
        AND status = 'uzavreny' AND COALESCE(resolution, '') NOT IN ('bez_skody', 'nestalo_se', 'konec_sezony')
        AND resolved_on >= ?
      LIMIT 1`,
  ).bind(teamId, playerId, kromeIncidentu, seasonNumber, gameExpiry(gameDate, -RECIDIVA_DNI)).first()
    .catch((e) => { logger.warn({ module: M }, `recidiva ${playerId}`, e); return null; });
  return r !== null;
}
```

Poznámka: SQL výše musí obsahovat přesně `culprit_player_id = ? AND id != ?` (hledá to test).

- [ ] **Step 3: `akce.ts`**

1. Importy: `import { applyManagerAttrDelta, type ManagerAttr } from "../lib/manager-attrs";` a do importu z `./incident-db` přidej `jeRecidivista`.

2. Pomocná funkce pod `pozdejsi`:

```ts
/** Atribut trenéra za rozhodnutí o incidentu. Selhání se zaloguje, akci nezvrací. */
async function atributTrenera(
  db: D1Database, teamId: string, incidentId: string, attr: ManagerAttr, delta: number,
  popis: string, gameDate: string, klic: string = attr,
): Promise<void> {
  await applyManagerAttrDelta(db, teamId, attr, delta, "incident", popis, { referenceId: `inc-${incidentId}-mgr-${klic}`, gameDate })
    .catch((e) => logger.warn({ module: M }, `atribut trenéra ${attr} za incident ${incidentId}`, e));
}
```

3. V `obvinHrace` ve větvi nevinného (`} else {` s křivým obviněním), hned za `await db.batch(davka)...` — tedy po dávce, jen když `!vinen`:

```ts
  if (!vinen) {
    await atributTrenera(db, teamId, incidentId, "motivation", -1, `Křivé obvinění hráče: ${obvineny.jmeno}`, gameDate, `motivation-${poradi}`);
  }
```

4. V `rozhodni` ve větvi `policie` po zápisu absencí a před SMS:

```ts
    await atributTrenera(db, teamId, incidentId, "discipline", 1, `Pachatel předán policii: ${pachatel.jmeno}`, gameDate);
    if (oblibeny) {
      await atributTrenera(db, teamId, incidentId, "reputation", -1, `Udání oblíbeného hráče: ${pachatel.jmeno}`, gameDate);
    }
```

5. Ve větvi `vyhodit` po úspěšném `removePlayer` (před posunem kádru):

```ts
    await atributTrenera(db, teamId, incidentId, "discipline", 1, `Vyhozen zloděj: ${pachatel.jmeno}`, gameDate);
```

6. Před závěrečné `return { ok: true, castka };` přidej:

```ts
  if (akce === "srazka" || akce === "pokuta" || akce === "vyradit") {
    await atributTrenera(db, teamId, incidentId, "discipline", 1, `Důsledný trest za incident: ${pachatel.jmeno}`, gameDate);
  } else if (akce === "odpustit" && await jeRecidivista(db, teamId, pachatel.id, incidentId, inc.season_number, gameDate)) {
    await atributTrenera(db, teamId, incidentId, "discipline", -1, `Odpuštění recidivistovi: ${pachatel.jmeno}`, gameDate);
  }
```

- [ ] **Step 4: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents src/lib && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/manager-attrs.ts apps/api/src/incidents/incident-db.ts apps/api/src/incidents/akce.ts apps/api/src/incidents/akce-tresty.test.ts apps/api/src/incidents/akce-obvineni.test.ts
git commit -F - <<'EOF'
feat(incidenty): atributy trenera podle rozhodnuti o incidentu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 10: Zapsat odchylky do specu

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-incidenty-design.md`

- [ ] **Step 1: Datový model (Část 3)**

V bloku `club_incident_absences` přejmenuj sloupce `od`, `do` na `od_dne`, `do_dne` s poznámkou „`DO` je v SQLite klíčové slovo" a doplň, že tabulka vzniká migrací 0206 ve fázi 3 a id je `{incidentId}-abs-{1 výslech | 2 soud | 3 vyřazení}`.

- [ ] **Step 2: Vyšetřování (Část 7c, 7d)**

- 7c: termíny absencí: udání výslech za 2 dny a soud v den výsledku šetření; odhalení policií výslech za 2 dny a soud za 5 dní. Odstraň poznámky „až ve fázi 3".
- 7d `vyradit`: vyřazení `{zapasu: 1–3}` platí ve všech zápasech (liga, pohár, přátelák) a odečítá se po ligovém kole stejně jako `suspended_matches`; morálka −10, neoblíbený pachatel kádr +1. Odstraň poznámku „až ve fázi 3".

- [ ] **Step 3: Napojení (Část 17a, 17b, 17c)**

Každou odchylku z tabulky „Odchylky od specu" tohoto plánu (`docs/superpowers/plans/2026-09-16-incidenty-faze-3.md`) zapiš na své místo v 17a, 17b a 17c: `nactiIncidentniKontext` místo `incidentniAbsence`, vliv jen `obvineny` a `pachatel` ve fázi 3 (s odkazem na fázi 7 a 11 pro ostatní), rozpad docházky beze změny, trénink bez zrcadla v náhledu, kabina s oknem 14 dní, `posunVztah` ve fázi 4, výčet důsledných trestů. Ověř hodnoty proti kódu (`incidents/nastaveni.ts`, `incidents/absence-hracu.ts`, `incidents/zapas.ts`, `season/kabina.ts`, `events/absence.ts`).

- [ ] **Step 4: Pořadí implementace (Část 16)**

Za bod 3 doplň „(hotovo na testingu, plán `docs/superpowers/plans/2026-09-16-incidenty-faze-3.md`)".

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-16-incidenty-design.md
git commit -F - <<'EOF'
docs(incidenty): spec podle faze 3 absence, trenink a zapas

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

- [ ] **Step 2: Migrace na testovací DB (před pushem)**

```bash
cd apps/api && npx wrangler d1 execute prales-db-test --remote --file migrations/0206_incidenty_absence.sql
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT COUNT(*) AS n FROM club_incident_absences'
```

- [ ] **Step 3: Push a CI**

```bash
git push origin testing
```

Počkat na `conclusion: success` běhu pro pushnutý commit (`gh run watch <id>`).

- [ ] **Step 4: Scénář (testovací klub, existující session, heslo nezadávat)**

1. Odhalený incident (admin force s dočasným zabezpečením 3, jako ve fázi 2) → trest „Vyřadit ze zápasů" 2 kola v UI. DB: `club_incident_absences` řádek `vyrazen`, `zapasu_zbyva = 2`; manažer `discipline` +1 v `manager_attr_log` se `source = 'incident'`.
2. Náhled sestavy (`/dashboard/match` nebo API náhledu zápasu, když je zápas do 1 dne): vyřazený hráč je nepřítomný s důvodem „Vyřazen trenérem" a ostatní omluvenky se nezměnily (porovnat seznam před trestem a po něm).
3. Druhý odhalený incident → „Předat policii": dva řádky absencí (výslech za 2 dny, soud v den výsledku).
4. Obvinit nevinného hráče na jiném incidentu: `manager_attr_log` motivace −1; `nactiDruhyHracu` přes náhled sestavy (hráč s vyšší šancí omluvenky se v jednom zápase nemusí projevit, stačí ověřit, že API nepadá).
5. Po ligovém kole na testingu (cron) `zapasu_zbyva` klesne o 1. Když kolo v den ověření není, zapsat do paměti jako neověřené.
6. Mobil 400 px (vložený rámec jako ve fázi 2): výběr kol a tlačítko vedle sebe bez přetečení.
7. Uklidit: vrátit dočasné zabezpečení a ukradené vybavení.

- [ ] **Step 5: Paměť**

Do `project_prod_deploy_pending.md` doplnit: migrace **0206** na produkci před merge kódu (po 0205), incidenty fáze 3 čekají na prod; co zůstalo neověřené.

✋ **STOP.** Na produkci nic bez výslovného „nasaď na main".

---

## Co zůstává na další fáze

| Fáze | Navazuje na fázi 3 |
|---|---|
| 4 Znalosti a chat | `posunVztah` (kamarád prozradil / kryl, rival práskl), výslech najde stopy svědků |
| 7 Peníze a životní situace | `dluhy`, `rozvod`, `prisel_o_praci`, `zabaveny_ridicak`, `porod` a další druhy vlivů v losu omluvenek, tréninku, zápase a kabině; přesun vět „Manželka rodí" a „vzali mu řidičák"; zrcadlo v náhledu tréninku; absence `porod`, `nemocna_mama`, `stehovani` |
| 11 Sezóna | hrdina v zápasových úpravách |
