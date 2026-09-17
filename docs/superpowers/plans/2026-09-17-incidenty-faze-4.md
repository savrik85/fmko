# Incidenty v klubu, fáze 4 (Znalosti a chat) — implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hráči vědí o incidentech jen to, co drží DB: celý kádr zná veřejný popis, svědek, kamarád a rival pachatele něco tuší a pachatel ví pravdu. Trenér se hráče zeptá (tlačítkem nebo volnou zprávou), DB jednou provždy rozhodne, jestli hráč prozradí, kryje, zapírá nebo se přizná, a model dostane hotový pokyn. Den po zapřeném obvinění se hráč ozve sám.

**Architecture:** Čistý modul `incidents/znalosti.ts` staví znalosti při vzniku incidentu a z řádků DB skládá blok do promptu. `incidents/znalosti-db.ts` je zapisuje (z `zapisIncident`) a načítá pro chat. `incidents/tema.ts` pozná otázku na incident, `incidents/vyslech.ts` vyhodnotí a uloží výslech včetně nalezené stopy, přiznání a posunu vztahů, `incidents/zprava-trenera.ts` to spojí v POST zprávy ještě před generováním odpovědi. Prompt (`ai-player-chat.ts`) dostane blok znalostí přes `PlayerSnapshot.znalostiIncidentu`, který plní všechna místa chatu. Vynucený scénář `krivde_obvineny` otevírá denní krok incidentů.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, D1, Vitest, Next.js 15

**Spec:** `docs/superpowers/specs/2026-09-16-incidenty-design.md` (Části 7a, 7b, 10, 11, 17c vztahy, 17d)

## Global Constraints

- **Branch:** `testing`. Push dělá až controller v posledním tasku. Push na `main` je zakázaný bez výslovného souhlasu uživatele.
- **UI a texty pro hráče česky**, s diakritikou, minimálně `text-sm`, jména hráčů `text-base` a klikatelná, ceny nikdy v tlačítkách, mobile-first, do tabulek nepřidávat sloupce.
- **V textech pro hráče ani v promptu nikdy dlouhá pomlčka „—".** Jméno hráče jen v 1. pádě jako podmět nebo samostatně za dvojtečkou. Každá šablona v `TEXTY` končí tečkou nebo vykřičníkem (hlídá `texty.test.ts`).
- **Žádný prázdný catch.** Server `logger.warn({ module: "xyz" }, "popis", e)` nebo `logger.error`, klient `console.error("popis:", e)`.
- **Výsledek výslechu rozhoduje DB, ne model.** Spočítá se jednou na hráče a incident (`interrogation IS NULL` v hlídaném `UPDATE`), seed `vyslech|{incidentId}|{playerId}`, první číslo z generátoru je los. Model dostane jen pokyn podle uloženého výsledku.
- **Tajné údaje nikdy do API, veřejných textů ani do promptu mimo téma:** neodhalený pachatel se nejmenuje; role `svedek`, `kamarad`, `rival`, `pachatel` jdou do promptu jen v rozhovoru o daném incidentu; kabina (skupinový chat) dostává jen veřejné znalosti.
- **Žádná nová volání modelu** mimo existující toky chatu (Část 15 specu). SMS po obvinění zůstává šablona.
- **Názvy sloupců do SQL jen z konstant**, nikdy ze vstupu. Parametry jen `?`.
- **Testy:** `cd apps/api && npx vitest run <cesta>`. **Typecheck:** `cd apps/api && npx tsc --noEmit`, FE `cd apps/web && npx tsc --noEmit`.
- **Commit** po každém tasku: `git add <soubory> && git commit -F - <<'EOF'` se zprávou a posledním řádkem `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Nikdy `git add -A`.
- **Migrace:** žádná. Tabulky `club_incident_knowledge` a `club_incident_clues` existují od migrace 0205.
- **Testing sdílí `GEMINI_API_KEY` s produkcí:** přepínač `ai_provider` se na testingu přepíná jen dočasně na `workers-ai` a vždy vrací na `off`.

---

## Odchylky od specu (zapsat do specu v Tasku 11)

| Místo ve specu | Plán | Proč |
|---|---|---|
| 10a `until` | kádr +14 dní (závažnost 3: +45), pachatel +60, obviněný +60; svědek, kamarád a rival uloží den vzniku. Platnost „do uzavření + 7" a „max(until, uzavření + 7)" se počítá při čtení z `club_incidents.status` a `resolved_on`: role `kadr`, `svedek`, `kamarad`, `rival` platí, dokud incident není uzavřený, a 7 dní po uzavření | incident se uzavírá na pěti místech (lhůta, trest, tři výsledky policie); jedno pravidlo při čtení nejde zapomenout |
| 10b „max. 3 znalosti" | max. 3 **incidenty**; u incidentu v tématu jdou všechny jeho role hráče | svědek potřebuje vedle tajné role i veřejný popis toho, co se stalo |
| 10b prompt bez znalostí | načtený prázdný seznam → řádek „o žádné krádeži ani škodě nevíš, nikoho neobviňuj"; nenačtené znalosti (`undefined`, chyba DB) nepřidají nic | nováček by si pachatele vymyslel; chyba DB nesmí tvrdit, že se nic nestalo |
| 10b veřejný řádek | text incidentu + kdy + jméno odhaleného pachatele (sám pachatel „přišlo se na to, že jsi to byl ty") + jak incident dopadl | model jinak domýšlí tresty a výsledky |
| 7a téma | výslech jen u otevřených nebo policií šetřených, neodhalených krádeží a poškození; téma poznané z textu se uloží do vlákna na zbytek herního dne stejně jako z tlačítka | navazující otázka („a kde?") klíčová slova nemá |
| 7a hráč s víc rolemi | jeden los, rozhoduje role s nejnižší šancí, stejný výsledek pro všechny jeho role | hráč si nesmí protiřečit |
| 7a ochota | svědek 40–70 (kamarád 10–25 a rival 60–80 ze specu 5b) | spec ochotu svědka neurčil |
| 7b AI text SMS po obvinění | zůstává šablona | Část 15: žádná nová volání modelu mimo existující chat; AI rozhovor přinese den poté vlákno `krivde_obvineny` |
| 17c `posunVztah` | signatura `posunVztah(db, a, b, {typy, delta, smazPod?, vytvorJako?})`; kamarád, který prozradil: kamarádství −20 (pod 10 smazat) **a** `rivals` 40, když rivalita ještě není; `posunVztahKTrenerovi` nevzniká, vztah k trenérovi už posouvá `posunHrace` | kamarád má sílu ≥ 40, první zrada by rivalitu podmíněnou smazáním nikdy nezaložila |
| 17d `krivde_obvineny` | ozve se každý, kdo obvinění zapřel, vinný i nevinný; jen se zapnutým generováním textu a bez běžícího vlákna | kdyby psali jen nevinní, manažer by je poznal (stejné pravidlo jako C3 ve fázi 3) |
| 17d pravidlo životních situací | platí pro všechny hráče (situace ještě neexistují) v `buildSystemPrompt` i `evaluateResolution`; `family_problem` a `personal_milestone` bez porodu, dítěte a nemoci | podmínka „bez aktivní situace" přijde s fází 7 |
| 17d `zadost_o_zalohu`, domácnost při rozvodu, vyšší váha hráče se situací | fáze 7 | dluhy a rozvod ještě neexistují |
| 17d zmeškané hovory | fáze 8 (starosta) a 9 (bulvár, sponzor) | volající reagují na obec a tisk |
| 17d zaměstnanci (psycholog, správce, šéf fanklubu, obsluha) | fáze 10 | pořadí implementace, Část 16 bod 10 |
| 10a role `drb` | fáze 6 | vzniká v hospodě |
| 11 telefon | SMS s `metadata = {type: "incident", incidentId}` posílá Kustod (vznik, lhůta), policie (převzetí, udání, výsledek), hráč (obvinění, trest, křivda) | tlačítko „Otevřít incident" potřebuje zdroj dat |

---

## Struktura souborů

| Soubor | Odpovědnost |
|---|---|
| `apps/api/src/incidents/nastaveni.ts` | konstanty znalostí |
| `apps/api/src/incidents/texty.ts` | texty znalostí, přiznání při výslechu, SMS křivdy |
| `apps/api/src/incidents/znalosti.ts` 🆕 | čisté: typy, znalosti při vzniku, výběr a blok do promptu |
| `apps/api/src/incidents/znalosti-db.ts` 🆕 | zápis znalostí, načtení znalostí hráče pro chat |
| `apps/api/src/incidents/dopady.ts` | zápis znalostí při vzniku incidentu, SMS s odkazem |
| `apps/api/src/incidents/tema.ts` 🆕 | čisté: pozná otázku na incident, téma ve vlákně |
| `apps/api/src/incidents/vyslech.ts` 🆕 | pravidla výslechu a jeho zápis (stopa, přiznání, vztahy) |
| `apps/api/src/incidents/hraci.ts` | `posunVztah` |
| `apps/api/src/incidents/incident-db.ts` | `pozdejsi`, `smsIncidentu` |
| `apps/api/src/incidents/vysetrovani.ts` | `lzeVyslychat` |
| `apps/api/src/incidents/zprava-trenera.ts` 🆕 | téma zprávy trenéra a výslech před generováním |
| `apps/api/src/incidents/akce.ts` | `zeptejSe`, SMS s odkazem |
| `apps/api/src/incidents/krivda.ts` 🆕 | vlákno `krivde_obvineny` den po zapřeném obvinění |
| `apps/api/src/incidents/denni-krok.ts`, `vysetrovani-den.ts` | volání křivdy, SMS s odkazem |
| `apps/api/src/routes/incidents.ts` | POST `zeptat`, `akce.zeptat` v detailu, admin `krivdy` |
| `apps/api/src/routes/messaging.ts` | otázka na incident v POST zprávy |
| `apps/api/src/messaging/ai-player-scenarios.ts` | `PlayerSnapshot.znalostiIncidentu`, scénář `krivde_obvineny`, rodinné scénáře |
| `apps/api/src/messaging/ai-player-chat.ts` | blok znalostí a zákaz vymýšlet životní situace |
| `apps/api/src/messaging/ai-player-spawn.ts`, `coach-initiated.ts`, `transfers/unrest.ts` | plnění znalostí, téma ve vlákně |
| `apps/api/src/messaging/system-sms.ts` | volitelná `metadata` zprávy |
| `apps/web/src/app/dashboard/incidenty/{typy.ts,DetailIncidentu.tsx}` | akce „Zeptat se" |
| `apps/web/src/app/dashboard/phone/[id]/page.tsx` | tlačítko „Otevřít incident" |

---
## Task 1: Znalosti, čisté jádro

**Files:**
- Modify: `apps/api/src/incidents/nastaveni.ts` (na konec)
- Modify: `apps/api/src/incidents/texty.ts` (nové klíče před `} as const satisfies`)
- Create: `apps/api/src/incidents/znalosti.ts`
- Test: `apps/api/src/incidents/znalosti.test.ts`

**Interfaces:**
- Consumes: `StavKlubu`, `NavrhIncidentu`, `NavrhStopy` (`typy.ts`); `MISTO_INCIDENTU`, `MISTO_TEXT` (`stopy.ts`); `nazevIncidentu` (`katalog.ts`); `text`, `TEXTY`, `vypln` (`texty.ts`); `gameExpiry` (`lib/game-time`).
- Produces:
  - `type RoleZnalosti = "kadr" | "svedek" | "kamarad" | "rival" | "pachatel" | "obvineny" | "drb"`
  - `type RoleSvedka = "svedek" | "kamarad" | "rival"`
  - `type VysledekVyslechu = "prozradil" | "kryje" | "zapira" | "priznal"`
  - `interface TemaKonverzace { incidentId: string; den: string }` (`den` = `YYYY-MM-DD`)
  - `interface NovaZnalost { playerId; role; fact; ochota; until }`
  - `znalostiIncidentu(stav, navrh, stopy, rng): NovaZnalost[]`
  - `interface RadekZnalostiDb` (řádek dotazu), `interface RadekZnalosti`
  - `radekZnalosti(r: RadekZnalostiDb, playerId: string, dnes: string): RadekZnalosti`
  - `vyberZnalosti(radky: readonly RadekZnalosti[], temaId: string | null): RadekZnalosti[]`
  - `radekDoPromptu(r: RadekZnalosti): string`, `blokZnalosti(radky: readonly RadekZnalosti[] | undefined): string`
  - konstanty `HLAVICKA_ZNALOSTI`, `BEZ_ZNALOSTI`, `VEREJNE_ROLE`

- [ ] **Step 1: Konstanty**

Na konec `apps/api/src/incidents/nastaveni.ts`:

```ts

/** Znalosti hráčů o incidentech (spec 10a). */
export const ZNALOST_KADR_DNI = 14;
/** Závažný incident si kádr pamatuje déle (útěk s penězi přibude ve fázi 7). */
export const ZNALOST_KADR_ZAVAZNA_DNI = 45;
export const ZNALOST_PACHATEL_DNI = 60;
/** Kádr, svědci, kamarádi a rivalové si incident pamatují ještě týden po uzavření. */
export const ZNALOST_PO_UZAVRENI_DNI = 7;
/** Kolik incidentů nejvýš jde do promptu hráče. */
export const MAX_INCIDENTU_V_PROMPTU = 3;
/** Ochota říct trenérovi, co ví (0–100). Kamarád kryje, rival rád práskne (spec 5b), svědek je mezi. */
export const OCHOTA_ROLE = { svedek: [40, 70], kamarad: [10, 25], rival: [60, 80] } as const;
```

- [ ] **Step 2: Texty znalostí**

Do `TEXTY` v `apps/api/src/incidents/texty.ts` přidej za klíč `lhuta_znamy` (před `} as const satisfies`):

```ts
  znalost_svedek: [
    "Tu noc jsi šel z hospody kolem hřiště a {misto} jsi viděl hráče: {hrac}.",
    "Cestou z hospody jsi tu noc {misto} zahlédl hráče: {hrac}.",
    "Tu noc jsi {misto} potkal hráče, který tam neměl co dělat: {hrac}.",
  ],
  znalost_kamarad: [
    "Víš, že to udělal tvůj kamarád: {hrac}.",
    "Víš, kdo to udělal. Byl to tvůj kamarád: {hrac}.",
    "Je ti jasné, že za tím stojí tvůj kamarád: {hrac}.",
  ],
  znalost_rival: [
    "Tušíš, že to udělal hráč, se kterým se nemusíš: {hrac}.",
    "Jsi si skoro jistý, že za tím stojí hráč, kterého nemusíš: {hrac}.",
    "Máš podezření na hráče, se kterým se nesnášíš: {hrac}. Ten večer se divně vytrácel.",
  ],
  znalost_pachatel: [
    "Tohle jsi udělal ty: {nazev}.",
  ],
```

- [ ] **Step 3: Napiš selhávající test**

`apps/api/src/incidents/znalosti.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { nazevIncidentu } from "./katalog";
import { PROBLEMOVY, hrac, stavKlubu } from "./testovaci-stav";
import type { NavrhIncidentu, NavrhStopy } from "./typy";
import {
  BEZ_ZNALOSTI, HLAVICKA_ZNALOSTI, blokZnalosti, radekDoPromptu, radekZnalosti, vyberZnalosti, znalostiIncidentu,
  type RadekZnalostiDb,
} from "./znalosti";

const DNES = "2026-09-16T16:00:00.000Z";
const SVEDEK = hrac({ id: "s", jmeno: "Jan Svědek" });
const KAMARAD = hrac({ id: "k", jmeno: "Karel Kamarád" });

const NAVRH: NavrhIncidentu = {
  kind: "vloupani_sklad", category: "kradez", status: "otevreny", severity: 1,
  culpritType: "hrac", culpritPlayerId: "p", culpritRevealed: false,
  ztraty: [{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }],
  text: "Ze skladu zmizelo vybavení: Dresy.",
};

function stopa(over: Partial<NavrhStopy>): NavrhStopy {
  return { zdroj: "svedek", ukazujeNa: "p", podezreli: null, drzitel: "s", sila: 2, bonusPolicie: 0.1, text: "Stopa.", nalezena: false, ...over };
}

describe("kdo co ví při vzniku incidentu", () => {
  const stav = stavKlubu({ kadr: [PROBLEMOVY, SVEDEK, KAMARAD], gameDate: DNES });

  it("celý kádr zná veřejný text na 14 dní, pachatel pravdu na 60", () => {
    const z = znalostiIncidentu(stav, NAVRH, [], createRng(1));
    expect(z.filter((r) => r.role === "kadr").map((r) => r.playerId)).toEqual(["p", "s", "k"]);
    expect(z.find((r) => r.role === "kadr")).toMatchObject({ fact: NAVRH.text, until: gameExpiry(DNES, 14) });
    const pachatel = z.find((r) => r.role === "pachatel");
    expect(pachatel).toMatchObject({ playerId: "p", until: gameExpiry(DNES, 60) });
    expect(pachatel?.fact).toContain(nazevIncidentu("vloupani_sklad"));
  });

  it("závažný incident si kádr pamatuje 45 dní", () => {
    const z = znalostiIncidentu(stav, { ...NAVRH, severity: 3 }, [], createRng(1));
    expect(z.find((r) => r.role === "kadr")?.until).toBe(gameExpiry(DNES, 45));
  });

  it("svědek, kamarád a rival podle stop, s ochotou podle role", () => {
    const z = znalostiIncidentu(stav, NAVRH, [
      stopa({ zdroj: "svedek", drzitel: "s" }),
      stopa({ zdroj: "kamarad", drzitel: "k" }),
      stopa({ zdroj: "rival", drzitel: "s" }),
    ], createRng(1));
    const svedek = z.find((r) => r.role === "svedek");
    expect(svedek).toMatchObject({ playerId: "s", until: DNES });
    expect(svedek?.fact).toContain("Pepa Průšvih");
    expect(svedek?.ochota).toBeGreaterThanOrEqual(40);
    expect(svedek?.ochota).toBeLessThanOrEqual(70);
    const kamarad = z.find((r) => r.role === "kamarad");
    expect(kamarad?.ochota).toBeGreaterThanOrEqual(10);
    expect(kamarad?.ochota).toBeLessThanOrEqual(25);
    const rival = z.find((r) => r.role === "rival");
    expect(rival?.playerId).toBe("s");
    expect(rival?.ochota).toBeGreaterThanOrEqual(60);
  });

  it("dvě stopy stejného držitele a zdroje dají jednu znalost", () => {
    const z = znalostiIncidentu(stav, NAVRH, [stopa({}), stopa({})], createRng(1));
    expect(z.filter((r) => r.role === "svedek")).toHaveLength(1);
  });

  it("stopy bez držitele znalost nedávají, cizí pachatel jen kádr", () => {
    expect(znalostiIncidentu(stav, NAVRH, [stopa({ zdroj: "kamera", drzitel: null, nalezena: true })], createRng(1)).map((r) => r.role))
      .toEqual(["kadr", "kadr", "kadr", "pachatel"]);
    expect(znalostiIncidentu(stav, { ...NAVRH, culpritType: "cizi", culpritPlayerId: null }, [], createRng(1)).map((r) => r.role))
      .toEqual(["kadr", "kadr", "kadr"]);
  });
});

function radekDb(over: Partial<RadekZnalostiDb> = {}): RadekZnalostiDb {
  return {
    incident_id: "inc-1", role: "kadr", fact: "Ze skladu zmizelo vybavení: Dresy.", interrogation: null,
    kind: "vloupani_sklad", category: "kradez", severity: 1, game_date: "2026-09-13T16:00:00.000Z", status: "otevreny",
    resolution: null, culprit_revealed: 0, culprit_player_id: "p", pachatel_jmeno: null, pachatel_prijmeni: null,
    ...over,
  };
}

const radek = (over: Partial<RadekZnalostiDb> = {}, hracId = "s") => radekZnalosti(radekDb(over), hracId, DNES);
const ODHALENY = { culprit_revealed: 1, pachatel_jmeno: "Pepa", pachatel_prijmeni: "Průšvih" };

describe("řádek znalosti z DB", () => {
  it("neodhaleného pachatele nepozná, ani když dotaz vrátí jméno", () => {
    expect(radek({ pachatel_jmeno: "Pepa", pachatel_prijmeni: "Průšvih" }).pachatel).toBeNull();
  });

  it("odhalený pachatel se jmenuje a sám o sobě ví, že je to on", () => {
    expect(radek(ODHALENY).pachatel).toBe("Pepa Průšvih");
    expect(radek(ODHALENY, "p").pachatelJeOn).toBe(true);
    expect(radek(ODHALENY, "s").pachatelJeOn).toBe(false);
  });

  it("počítá herní dny od incidentu", () => {
    expect(radek().predDny).toBe(3);
  });
});

describe("výběr znalostí do promptu", () => {
  it("tajná role mimo téma se do promptu nedostane", () => {
    const radky = [radek(), radek({ role: "svedek", fact: "Viděl jsi hráče: Pepa Průšvih." })];
    expect(vyberZnalosti(radky, null).map((r) => r.role)).toEqual(["kadr"]);
    expect(vyberZnalosti(radky, "jiny-incident").map((r) => r.role)).toEqual(["kadr"]);
    expect(vyberZnalosti(radky, "inc-1").map((r) => r.role)).toEqual(["kadr", "svedek"]);
  });

  it("neprávem obviněný si křivdu nese i mimo téma", () => {
    expect(vyberZnalosti([radek({ role: "obvineny" })], null)).toHaveLength(1);
  });

  it("nejvýš tři incidenty, téma první, pak závažnost", () => {
    const radky = ["a", "b", "c", "d"].map((id, n) => radek({ incident_id: id, severity: n + 1 }));
    expect(vyberZnalosti(radky, "a").map((r) => r.incidentId)).toEqual(["a", "d", "c"]);
  });
});

describe("blok znalostí v promptu", () => {
  it("nenačtené znalosti nepřidají nic, prázdné řeknou, že nic neví", () => {
    expect(blokZnalosti(undefined)).toBe("");
    expect(blokZnalosti([])).toBe(BEZ_ZNALOSTI);
    expect(BEZ_ZNALOSTI).toContain("nikoho neobviňuj");
  });

  it("veřejný řádek: co se stalo, kdy a že se neví kdo", () => {
    const blok = blokZnalosti([radek()]);
    expect(blok.startsWith(HLAVICKA_ZNALOSTI)).toBe(true);
    expect(blok).toContain("Ze skladu zmizelo vybavení: Dresy. Stalo se to před 3 dny. Kdo to byl, se v klubu neví.");
  });

  it("odhalený pachatel: ostatní vědí kdo, on ví, že na to přišli, a jak to dopadlo", () => {
    const uzavreny = { ...ODHALENY, status: "uzavreny", resolution: "pokuta" };
    expect(radekDoPromptu(radek(uzavreny))).toContain("Udělal to Pepa Průšvih. Trenér mu dal pokutu.");
    expect(radekDoPromptu(radek(uzavreny, "p"))).toContain("Přišlo se na to, že jsi to byl ty. Trenér ti dal pokutu.");
  });

  it("šetření policie je v řádku", () => {
    expect(radekDoPromptu(radek({ status: "policie" }))).toContain("Vyšetřuje to policie.");
  });

  it("pokyn podle uloženého výsledku výslechu", () => {
    expect(radekDoPromptu(radek({ role: "svedek", interrogation: "prozradil" }))).toContain("POKYN: Trenérovi to řekni.");
    expect(radekDoPromptu(radek({ role: "kamarad", interrogation: "kryje" }))).toContain("jméno trenérovi neřekni");
    expect(radekDoPromptu(radek({ role: "svedek", interrogation: null }))).toContain("jméno trenérovi neřekni");
    expect(radekDoPromptu(radek({ role: "pachatel", interrogation: null }, "p"))).toContain("POKYN: Zapírej");
    expect(radekDoPromptu(radek({ role: "pachatel", interrogation: "priznal" }, "p"))).toContain("POKYN: Přiznej se");
    expect(radekDoPromptu(radek({ role: "pachatel", culprit_revealed: 1 }, "p"))).toContain("nezapírej");
  });

  it("v bloku není dlouhá pomlčka", () => {
    const vse = blokZnalosti([
      radek(), radek({ role: "svedek" }), radek({ role: "pachatel" }), radek({ status: "uzavreny", resolution: "nevyreseno" }),
    ]);
    expect(vse).not.toContain("—");
  });
});
```

- [ ] **Step 4: Spusť test, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/znalosti.test.ts`
Expected: FAIL, modul `./znalosti` neexistuje.

- [ ] **Step 5: Implementace**

`apps/api/src/incidents/znalosti.ts`:

```ts
/**
 * Co hráči vědí o incidentech a co z toho smí model říct (spec Část 10).
 * Čisté funkce bez DB. Zápis a načtení: `znalosti-db.ts`.
 *
 * Tvrdé pravidlo: model mluví jen z toho, co je v DB. Tajné role (svědek, kamarád,
 * rival, pachatel) se do promptu dostanou jen v rozhovoru o incidentu a vždy s pokynem
 * podle uloženého výsledku výslechu. Jinak by model sám „prozradil" něco, co DB nemá.
 */

import type { Rng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { nazevIncidentu } from "./katalog";
import {
  MAX_INCIDENTU_V_PROMPTU, OCHOTA_ROLE, ZNALOST_KADR_DNI, ZNALOST_KADR_ZAVAZNA_DNI, ZNALOST_PACHATEL_DNI,
} from "./nastaveni";
import { MISTO_INCIDENTU, MISTO_TEXT } from "./stopy";
import { text, TEXTY, vypln } from "./texty";
import type { NavrhIncidentu, NavrhStopy, StavKlubu } from "./typy";

export type RoleZnalosti = "kadr" | "svedek" | "kamarad" | "rival" | "pachatel" | "obvineny" | "drb";
export type RoleSvedka = "svedek" | "kamarad" | "rival";
export type VysledekVyslechu = "prozradil" | "kryje" | "zapira" | "priznal";

/** Incident, na který se trenér v konverzaci ptá. `den` = `YYYY-MM-DD` herního dne, kdy se téma nastavilo. */
export interface TemaKonverzace {
  incidentId: string;
  den: string;
}

/** Role, které hráč nese i mimo rozhovor o incidentu. Ostatní jsou tajné (spec 10b). */
export const VEREJNE_ROLE: ReadonlySet<RoleZnalosti> = new Set<RoleZnalosti>(["kadr", "obvineny", "drb"]);

const KLIC_ZNALOSTI = { svedek: "znalost_svedek", kamarad: "znalost_kamarad", rival: "znalost_rival" } as const;
const PORADI_ROLI: Record<RoleZnalosti, number> = { kadr: 0, drb: 1, obvineny: 2, svedek: 3, kamarad: 4, rival: 5, pachatel: 6 };

export interface NovaZnalost {
  playerId: string;
  role: RoleZnalosti;
  fact: string;
  ochota: number;
  /**
   * Herní den ISO, do kdy si to hráč pamatuje. Svědek, kamarád a rival mají den vzniku:
   * jejich znalost platí, dokud je incident otevřený, a týden po uzavření (počítá se při čtení).
   */
  until: string;
}

/** Znalosti nového incidentu pro aktivní kádr (spec 10a). `stopy` jen ty, které se opravdu zapíšou. */
export function znalostiIncidentu(stav: StavKlubu, navrh: NavrhIncidentu, stopy: readonly NavrhStopy[], rng: Rng): NovaZnalost[] {
  const kadrDo = gameExpiry(stav.gameDate, navrh.severity >= 3 ? ZNALOST_KADR_ZAVAZNA_DNI : ZNALOST_KADR_DNI);
  const znalosti: NovaZnalost[] = stav.kadr.map((h): NovaZnalost => ({
    playerId: h.id, role: "kadr", fact: navrh.text, ochota: 50, until: kadrDo,
  }));

  const pachatel = navrh.culpritType === "hrac" ? stav.kadr.find((h) => h.id === navrh.culpritPlayerId) ?? null : null;
  if (!pachatel) return znalosti;
  znalosti.push({
    playerId: pachatel.id, role: "pachatel", ochota: 0,
    fact: vypln(TEXTY.znalost_pachatel[0], { nazev: nazevIncidentu(navrh.kind) }),
    until: gameExpiry(stav.gameDate, ZNALOST_PACHATEL_DNI),
  });

  const misto = MISTO_INCIDENTU[navrh.kind];
  const hodnoty = { hrac: pachatel.jmeno, misto: misto ? MISTO_TEXT[misto] : "u hřiště" };
  const zapsane = new Set<string>();
  for (const s of stopy) {
    if (s.zdroj !== "svedek" && s.zdroj !== "kamarad" && s.zdroj !== "rival") continue;
    if (!s.drzitel || s.ukazujeNa !== pachatel.id) continue;
    // Klíč tabulky je (incident, hráč, role): druhá stopa téhož držitele nic nového neví.
    const klic = `${s.drzitel}|${s.zdroj}`;
    if (zapsane.has(klic)) continue;
    zapsane.add(klic);
    const [min, max] = OCHOTA_ROLE[s.zdroj];
    znalosti.push({
      playerId: s.drzitel, role: s.zdroj,
      fact: text(rng, KLIC_ZNALOSTI[s.zdroj], hodnoty),
      ochota: rng.int(min, max),
      until: stav.gameDate,
    });
  }
  return znalosti;
}

/** Řádek dotazu `nactiZnalostiHrace` (znalost + incident + jméno odhaleného pachatele). */
export interface RadekZnalostiDb {
  incident_id: string;
  role: RoleZnalosti;
  fact: string;
  interrogation: VysledekVyslechu | null;
  kind: string;
  category: string;
  severity: number;
  game_date: string;
  status: string;
  resolution: string | null;
  culprit_revealed: number;
  culprit_player_id: string | null;
  pachatel_jmeno: string | null;
  pachatel_prijmeni: string | null;
}

export interface RadekZnalosti {
  incidentId: string;
  role: RoleZnalosti;
  fact: string;
  /** Uložený výsledek výslechu, `null` = hráč ještě nebyl vyslechnut. */
  vyslech: VysledekVyslechu | null;
  kategorie: string;
  zavaznost: number;
  /** `YYYY-MM-DD` herního dne incidentu. */
  den: string;
  /** Kolik herních dní uplynulo od incidentu. */
  predDny: number;
  stav: string;
  vysledek: string | null;
  odhalen: boolean;
  /** Jméno odhaleného pachatele, jinak `null`. */
  pachatel: string | null;
  /** Hráč, o jehož prompt jde, je sám odhalený pachatel. */
  pachatelJeOn: boolean;
}

function dnyMezi(od: string, do_: string): number {
  return Math.max(0, Math.round((Date.parse(do_.slice(0, 10)) - Date.parse(od.slice(0, 10))) / 86_400_000));
}

export function radekZnalosti(r: RadekZnalostiDb, playerId: string, dnes: string): RadekZnalosti {
  const odhalen = r.culprit_revealed === 1;
  const jmeno = [r.pachatel_jmeno, r.pachatel_prijmeni].filter(Boolean).join(" ");
  return {
    incidentId: r.incident_id, role: r.role, fact: r.fact, vyslech: r.interrogation,
    kategorie: r.category, zavaznost: r.severity, den: r.game_date.slice(0, 10), predDny: dnyMezi(r.game_date, dnes),
    stav: r.status, vysledek: r.resolution, odhalen,
    // Neodhaleného pachatele prompt znát nesmí, i kdyby dotaz jméno vrátil.
    pachatel: odhalen && jmeno ? jmeno : null,
    pachatelJeOn: odhalen && r.culprit_player_id === playerId,
  };
}

/** Tajné role jen k incidentu v tématu, nejvýš 3 incidenty: téma, pak závažnost, pak nejnovější. */
export function vyberZnalosti(radky: readonly RadekZnalosti[], temaId: string | null): RadekZnalosti[] {
  const skupiny = new Map<string, RadekZnalosti[]>();
  for (const r of radky) {
    if (!VEREJNE_ROLE.has(r.role) && r.incidentId !== temaId) continue;
    skupiny.set(r.incidentId, [...(skupiny.get(r.incidentId) ?? []), r]);
  }
  return [...skupiny.values()]
    .sort((a, b) =>
      Number(b[0].incidentId === temaId) - Number(a[0].incidentId === temaId)
      || b[0].zavaznost - a[0].zavaznost
      || b[0].den.localeCompare(a[0].den))
    .slice(0, MAX_INCIDENTU_V_PROMPTU)
    .flatMap((skupina) => [...skupina].sort((a, b) => PORADI_ROLI[a.role] - PORADI_ROLI[b.role]));
}

export const HLAVICKA_ZNALOSTI = "CO VÍŠ O DĚNÍ V KLUBU (jen tohle, nic dalšího si nevymýšlej, nic jiného se nestalo):";
export const BEZ_ZNALOSTI = "- O žádné krádeži, škodě ani jiném průšvihu v klubu nevíš. Když se trenér ptá, řekni, že nic nevíš, a nikoho neobviňuj.";

/** Jak incident dopadl: [o někom jiném, o tobě]. */
const VYSLEDEK_V_PROMPTU: Record<string, readonly [string, string]> = {
  odpustit: ["Trenér mu odpustil.", "Trenér ti odpustil."],
  srazka: ["Trenér mu strhává peníze ze mzdy.", "Trenér ti strhává peníze ze mzdy."],
  pokuta: ["Trenér mu dal pokutu.", "Trenér ti dal pokutu."],
  vyradit: ["Trenér ho vyřadil ze zápasů.", "Trenér tě vyřadil ze zápasů."],
  vyhodit: ["Trenér ho vyhodil z klubu.", "Trenér tě vyhodil z klubu."],
  policie: ["Trenér ho předal policii.", "Trenér tě předal policii."],
  nechat_byt: ["Trenér to nechal být.", "Trenér to nechal být."],
  nevyreseno: ["Nevyřešilo se to.", "Nevyřešilo se to."],
  konec_sezony: ["Nevyřešilo se to.", "Nevyřešilo se to."],
  vyreseno_policii: ["Policie pachatele dopadla.", "Policie pachatele dopadla."],
  nehoda: ["Nakonec se ukázalo, že to byla nehoda.", "Nakonec se ukázalo, že to byla nehoda."],
};

function kdy(dni: number): string {
  if (dni <= 0) return "dnes";
  if (dni === 1) return "včera";
  return `před ${dni} dny`;
}

function verejnyFakt(r: RadekZnalosti): string {
  const casti = [r.fact, `Stalo se to ${kdy(r.predDny)}.`];
  const vysetruje = r.kategorie === "kradez" || r.kategorie === "poskozeni";
  if (r.pachatelJeOn) casti.push("Přišlo se na to, že jsi to byl ty.");
  else if (r.pachatel) casti.push(`Udělal to ${r.pachatel}.`);
  else if (vysetruje && r.vysledek !== "vyreseno_policii" && r.vysledek !== "nehoda") casti.push("Kdo to byl, se v klubu neví.");
  const vysledek = r.vysledek ? VYSLEDEK_V_PROMPTU[r.vysledek] : undefined;
  if (vysledek) casti.push(vysledek[r.pachatelJeOn ? 1 : 0]);
  else if (r.stav === "policie") casti.push("Vyšetřuje to policie.");
  return casti.join(" ");
}

function pokynSvedka(r: RadekZnalosti): string {
  if (r.odhalen) return "Už se ví, kdo to byl, klidně o tom mluv.";
  if (r.vyslech === "prozradil") {
    return r.role === "kamarad" ? "Trenérovi to řekni, i když je ti blbé práskat kamaráda." : "Trenérovi to řekni.";
  }
  // Bez uloženého výsledku mlčí: co DB nemá jako nalezenou stopu, model prozradit nesmí.
  return r.role === "kamarad"
    ? "Kryješ kamaráda. Vykrucuj se a jméno trenérovi neřekni."
    : "Nechceš se do toho plést. Vykrucuj se a jméno trenérovi neřekni.";
}

function pokynPachatele(r: RadekZnalosti): string {
  if (r.odhalen) return "Už se na to přišlo, nezapírej.";
  return r.vyslech === "priznal" ? "Přiznej se trenérovi." : "Zapírej, nic nepřiznávej.";
}

export function radekDoPromptu(r: RadekZnalosti): string {
  switch (r.role) {
    case "kadr":
    case "drb":
      return `- ${verejnyFakt(r)}`;
    case "obvineny":
      return `- ${r.fact}`;
    case "pachatel":
      return `- ${r.fact} POKYN: ${pokynPachatele(r)}`;
    case "svedek":
    case "kamarad":
    case "rival":
      return `- ${r.fact} POKYN: ${pokynSvedka(r)}`;
  }
}

/** Blok do `buildSystemPrompt`. Nenačtené znalosti (`undefined`) nepřidají nic. */
export function blokZnalosti(radky: readonly RadekZnalosti[] | undefined): string {
  if (radky === undefined) return "";
  if (radky.length === 0) return BEZ_ZNALOSTI;
  return [HLAVICKA_ZNALOSTI, ...radky.map(radekDoPromptu)].join("\n");
}
```

- [ ] **Step 6: Spusť testy**

Run: `cd apps/api && npx vitest run src/incidents/znalosti.test.ts src/incidents/texty.test.ts && npx tsc --noEmit`
Expected: PASS, tsc bez chyb.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/incidents/nastaveni.ts apps/api/src/incidents/texty.ts apps/api/src/incidents/znalosti.ts apps/api/src/incidents/znalosti.test.ts
git commit -F - <<'EOF'
feat(incidenty): znalosti hracu a blok do promptu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Zápis a čtení znalostí

**Files:**
- Create: `apps/api/src/incidents/znalosti-db.ts`
- Modify: `apps/api/src/incidents/dopady.ts` (`zapisIncident`)
- Test: `apps/api/src/incidents/znalosti-db.test.ts`, `apps/api/src/incidents/dopady.test.ts`

**Interfaces:**
- Consumes (Task 1): `znalostiIncidentu`, `radekZnalosti`, `vyberZnalosti`, typy `NovaZnalost`, `RadekZnalosti`, `RadekZnalostiDb`, `TemaKonverzace`; `ZNALOST_PO_UZAVRENI_DNI`.
- Produces:
  - `prikazyZnalosti(db, teamId, incidentId, seasonNumber, znalosti): D1PreparedStatement[]`
  - `zapisZnalosti(db, stav: StavKlubu, navrh: NavrhIncidentu, incidentId: string, stopy: readonly NavrhStopy[]): Promise<boolean>`
  - `nactiZnalostiHrace(db, opts: { teamId: string; playerId: string; tema?: TemaKonverzace | null }): Promise<RadekZnalosti[] | undefined>` — `undefined` = nepodařilo se načíst (prompt pak nic nepřidá), `[]` = hráč nic neví.

- [ ] **Step 1: Napiš selhávající test**

`apps/api/src/incidents/znalosti-db.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gameExpiry } from "../lib/game-time";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";
import { PROBLEMOVY, stavKlubu } from "./testovaci-stav";
import type { NavrhIncidentu } from "./typy";
import type { RadekZnalostiDb } from "./znalosti";
import { nactiZnalostiHrace, zapisZnalosti } from "./znalosti-db";

const DNES = "2026-09-16T16:00:00.000Z";
const NAVRH: NavrhIncidentu = {
  kind: "vloupani_sklad", category: "kradez", status: "otevreny", severity: 1,
  culpritType: "hrac", culpritPlayerId: "p", culpritRevealed: false,
  ztraty: [{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }],
  text: "Ze skladu zmizelo vybavení: Dresy.",
};

describe("zápis znalostí", () => {
  it("jedna dávka INSERT OR IGNORE s rolí a sezónou", async () => {
    const db = new FalesnaD1();
    expect(await zapisZnalosti(jakoD1(db), stavKlubu({ kadr: [PROBLEMOVY] }), NAVRH, "inc-1", [])).toBe(true);
    expect(db.davky).toHaveLength(1);
    expect(db.davky[0].map((d) => d.params[3])).toEqual(["kadr", "pachatel"]);
    expect(db.davky[0][0].sql).toContain("INSERT OR IGNORE INTO club_incident_knowledge");
    expect(db.davky[0][0].params).toEqual(["inc-1", "p", "tym-a", "kadr", NAVRH.text, 50, gameExpiry(DNES, 14), 4]);
  });

  it("selhání dávky vrátí false a nevyhodí", async () => {
    const db = new FalesnaD1();
    db.batch = async () => { throw new Error("D1 výpadek"); };
    expect(await zapisZnalosti(jakoD1(db), stavKlubu({ kadr: [PROBLEMOVY] }), NAVRH, "inc-1", [])).toBe(false);
  });
});

function radekDb(over: Partial<RadekZnalostiDb> = {}): RadekZnalostiDb {
  return {
    incident_id: "inc-1", role: "kadr", fact: NAVRH.text, interrogation: null,
    kind: "vloupani_sklad", category: "kradez", severity: 1, game_date: "2026-09-13T16:00:00.000Z", status: "otevreny",
    resolution: null, culprit_revealed: 0, culprit_player_id: "p", pachatel_jmeno: null, pachatel_prijmeni: null,
    ...over,
  };
}

const sRadky = (radky: RadekZnalostiDb[]) => new FalesnaD1([
  { sql: /FROM teams t WHERE t\.id = \?/, first: { game_date: DNES, sezona: 4 } },
  { sql: /FROM club_incident_knowledge k/, all: radky },
]);

describe("načtení znalostí hráče", () => {
  it("platnost podle herního dne, sezóny a uzavření incidentu", async () => {
    const db = sRadky([]);
    expect(await nactiZnalostiHrace(jakoD1(db), { teamId: "tym-a", playerId: "s" })).toEqual([]);
    const dotaz = db.dotazy.find((d) => /FROM club_incident_knowledge k/.test(d.sql));
    expect(dotaz?.params).toEqual(["s", "tym-a", 4, DNES, gameExpiry(DNES, -7)]);
    expect(dotaz?.sql).toContain("i.status != 'uzavreny' OR i.resolved_on >= ?");
  });

  it("téma platí jen v herní den, kdy se nastavilo", async () => {
    const radky = [radekDb(), radekDb({ role: "svedek" })];
    const dnes = await nactiZnalostiHrace(jakoD1(sRadky(radky)), { teamId: "tym-a", playerId: "s", tema: { incidentId: "inc-1", den: "2026-09-16" } });
    expect(dnes?.map((r) => r.role)).toEqual(["kadr", "svedek"]);
    const vcera = await nactiZnalostiHrace(jakoD1(sRadky(radky)), { teamId: "tym-a", playerId: "s", tema: { incidentId: "inc-1", den: "2026-09-15" } });
    expect(vcera?.map((r) => r.role)).toEqual(["kadr"]);
  });

  it("bez herního dne nic nenačte a netvrdí, že hráč nic neví", async () => {
    const db = new FalesnaD1([{ sql: /FROM teams t WHERE t\.id = \?/, first: null }]);
    expect(await nactiZnalostiHrace(jakoD1(db), { teamId: "tym-a", playerId: "s" })).toBeUndefined();
  });
});
```

Do `apps/api/src/incidents/dopady.test.ts`:
1. do prvního testu („opakovaný den…") přidej na konec `expect(db.pocet(/club_incident_knowledge/)).toBe(0);`
2. změň import fixture na `import { PROBLEMOVY, hrac, stavKlubu } from "./testovaci-stav";`
3. přidej test na konec `describe`:

```ts
  it("znalosti: kádr, pachatel a kamarád ze zapsané stopy", async () => {
    const db = new FalesnaD1([
      { sql: /FROM staff_members/, first: { usudek: null } },
      { sql: /FROM relationships WHERE player_a_id = \? OR player_b_id = \?/, all: [{ player_a_id: "p", player_b_id: "k", type: "drinking_buddies", strength: 60 }] },
    ]);
    const stav = stavKlubu({ kadr: [PROBLEMOVY, hrac({ id: "k", jmeno: "Karel Kos" })], vybaveni: { jerseys: 2, jerseys_condition: 70 } });
    await zapisIncident(jakoD1(db), stav, NAVRH, "inc-test");
    const znalosti = db.davky.flat().filter((d) => /INSERT OR IGNORE INTO club_incident_knowledge/.test(d.sql));
    expect(znalosti.map((d) => `${d.params[1]}:${d.params[3]}`)).toEqual(["p:kadr", "k:kadr", "p:pachatel", "k:kamarad"]);
  });
```

- [ ] **Step 2: Spusť testy, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/znalosti-db.test.ts src/incidents/dopady.test.ts`
Expected: FAIL (modul `./znalosti-db` neexistuje, dopady nezapisují znalosti).

- [ ] **Step 3: Implementace `znalosti-db.ts`**

```ts
/** Zápis a čtení znalostí hráčů o incidentech (`club_incident_knowledge`, spec Část 10). */

import { createRng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { ZNALOST_PO_UZAVRENI_DNI } from "./nastaveni";
import type { NavrhIncidentu, NavrhStopy, StavKlubu } from "./typy";
import {
  radekZnalosti, vyberZnalosti, znalostiIncidentu,
  type NovaZnalost, type RadekZnalosti, type RadekZnalostiDb, type TemaKonverzace,
} from "./znalosti";

const M = "incidents-znalosti";

/** `INSERT OR IGNORE`: klíč (incident, hráč, role), opakovaný zápis nic nezdvojí. */
export function prikazyZnalosti(
  db: D1Database, teamId: string, incidentId: string, seasonNumber: number, znalosti: readonly NovaZnalost[],
): D1PreparedStatement[] {
  return znalosti.map((z) => db.prepare(
    `INSERT OR IGNORE INTO club_incident_knowledge (incident_id, player_id, team_id, role, fact, willingness, until, season_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(incidentId, z.playerId, teamId, z.role, z.fact, z.ochota, z.until, seasonNumber));
}

/**
 * Znalosti nového incidentu jednou dávkou (spec 10a). `stopy` jen ty, které se opravdu
 * zapsaly: svědek bez řádku stopy by výslechem neměl co najít. Selhání incident nezvrací.
 */
export async function zapisZnalosti(
  db: D1Database, stav: StavKlubu, navrh: NavrhIncidentu, incidentId: string, stopy: readonly NavrhStopy[],
): Promise<boolean> {
  const znalosti = znalostiIncidentu(stav, navrh, stopy, createRng(seedFromString(`znalosti|${incidentId}`)));
  if (znalosti.length === 0) return true;
  return db.batch(prikazyZnalosti(db, stav.teamId, incidentId, stav.seasonNumber, znalosti))
    .then(() => true)
    .catch((e) => { logger.error({ module: M }, `znalosti incidentu ${incidentId}`, e); return false; });
}

/**
 * Platná znalost = stejná sezóna a buď `until` ještě nevypršel, nebo jde o kádr, svědka,
 * kamaráda či rivala u incidentu, který není uzavřený nebo se uzavřel nejvýš před týdnem.
 * Jméno pachatele jen u odhaleného.
 */
const DOTAZ_ZNALOSTI = `
  SELECT k.incident_id, k.role, k.fact, k.interrogation,
         i.kind, i.category, i.severity, i.game_date, i.status, i.resolution, i.culprit_revealed, i.culprit_player_id,
         COALESCE(p.first_name, d.first_name) AS pachatel_jmeno, COALESCE(p.last_name, d.last_name) AS pachatel_prijmeni
    FROM club_incident_knowledge k
    JOIN club_incidents i ON i.id = k.incident_id
    LEFT JOIN players p ON p.id = i.culprit_player_id AND i.culprit_revealed = 1
    LEFT JOIN departed_players d ON d.id = i.culprit_player_id AND i.culprit_revealed = 1
   WHERE k.player_id = ? AND k.team_id = ? AND k.season_number = ?
     AND COALESCE(i.resolution, '') != 'bez_skody'
     AND (k.until >= ?
          OR (k.role IN ('kadr', 'svedek', 'kamarad', 'rival')
              AND (i.status != 'uzavreny' OR i.resolved_on >= ?)))
   ORDER BY i.severity DESC, i.game_date DESC
   LIMIT 30`;

/** Znalosti hráče pro prompt (spec 10b). Tajné role jen k incidentu v tématu, a jen v den, kdy se téma nastavilo. */
export async function nactiZnalostiHrace(
  db: D1Database, opts: { teamId: string; playerId: string; tema?: TemaKonverzace | null },
): Promise<RadekZnalosti[] | undefined> {
  const tym = await db.prepare(
    `SELECT t.game_date, (SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1) AS sezona
       FROM teams t WHERE t.id = ?`,
  ).bind(opts.teamId).first<{ game_date: string | null; sezona: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `herní den pro znalosti ${opts.teamId}`, e); return null; });
  if (!tym?.game_date || tym.sezona == null) return undefined;
  const dnes = tym.game_date;

  const rows = await db.prepare(DOTAZ_ZNALOSTI)
    .bind(opts.playerId, opts.teamId, tym.sezona, dnes, gameExpiry(dnes, -ZNALOST_PO_UZAVRENI_DNI))
    .all<RadekZnalostiDb>()
    .catch((e) => { logger.warn({ module: M }, `znalosti hráče ${opts.playerId}`, e); return null; });
  if (!rows) return undefined;

  const temaId = opts.tema && opts.tema.den === dnes.slice(0, 10) ? opts.tema.incidentId : null;
  return vyberZnalosti(rows.results.map((r) => radekZnalosti(r, opts.playerId, dnes)), temaId);
}
```

- [ ] **Step 4: Zápis znalostí v `zapisIncident`**

V `apps/api/src/incidents/dopady.ts` přidej import `import { zapisZnalosti } from "./znalosti-db";` a uprav tři místa ve funkci `zapisIncident`:

a) incident bez škody (alarm):
```ts
  if (navrh.ztraty.length === 0) {
    await zapisZnalosti(db, stav, navrh, id, []);
    return { id, nalezeneStopy: [], odhalen: navrh.culpritRevealed };
  }
```

b) ve větvi `if (!zapsanoDavkou) { ... }` před `return { id, nalezeneStopy: [], odhalen: navrh.culpritRevealed };` přidej:
```ts
    // Stopy se nezapsaly, svědci by neměli co prozradit: jen kádr a pachatel.
    await zapisZnalosti(db, stav, navrh, id, []);
```

c) před závěrečné `return { id, nalezeneStopy: stopy.filter(...)...`:
```ts
  await zapisZnalosti(db, stav, navrh, id, stopy);
```

Incident, který skončil `bez_skody` (žádná provedená škoda), ani opakovaný den (`INSERT OR IGNORE` incidentu nic nezapsal) znalosti nezapisují.

- [ ] **Step 5: Spusť testy**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/incidents/znalosti-db.ts apps/api/src/incidents/znalosti-db.test.ts apps/api/src/incidents/dopady.ts apps/api/src/incidents/dopady.test.ts
git commit -F - <<'EOF'
feat(incidenty): zapis znalosti pri vzniku incidentu a nacteni pro chat

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Pozná otázku na incident

**Files:**
- Create: `apps/api/src/incidents/tema.ts`
- Test: `apps/api/src/incidents/tema.test.ts`

**Interfaces:**
- Consumes: `CATEGORY_LABELS` (`equipment/equipment-generator`), `FACILITY_LABELS` (`stadium/stadium-generator`), `Ztrata`, `TemaKonverzace` (Task 1).
- Produces:
  - `normalizuj(s: string): string`
  - `jeOtazkaNaIncident(textZpravy: string, incident: { kind: string; ztraty: readonly Ztrata[] }): boolean`
  - `najdiIncidentVTextu(textZpravy: string, incidenty: ReadonlyArray<{ id: string; kind: string; ztraty: readonly Ztrata[] }>): string | null` — `incidenty` seřazené od nejnovějšího
  - `temaZeStavu(raw: unknown, den?: string): TemaKonverzace | null` — čte `incidentId`/`incidentDen` z `ai_thread_state`; s `den` vrací téma jen pro ten herní den

- [ ] **Step 1: Napiš selhávající test**

`apps/api/src/incidents/tema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { jeOtazkaNaIncident, najdiIncidentVTextu, normalizuj, temaZeStavu } from "./tema";
import type { Ztrata } from "./typy";

const SKLAD = { kind: "vloupani_sklad", ztraty: [{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }] as Ztrata[] };
const KOTEL = { kind: "vandal", ztraty: [{ typ: "vybaveni_stav", kategorie: "fan_drums", stavPred: 80, stavPo: 40 }] as Ztrata[] };

describe("pozná otázku na incident", () => {
  it.each([
    "Kdo ukradl ty dresy?",
    "Nevíš něco o těch ukradených věcech?",
    "Kdo vykradl sklad?",
    "Víš, kdo to byl?",
    "Co ukázala KAMERA?",
    "Byla u tebe policie?",
    "Kam zmizely dresy?",
    "Kde jsou dresy?",
    "Byl jsi večer u skladu?",
  ])("%s", (zprava) => {
    expect(jeOtazkaNaIncident(zprava, SKLAD)).toBe(true);
  });

  it.each([
    "Zdar, jak se máš?",
    "Zítra trénink v šest.",
    "Dobrý gól včera, jen tak dál.",
    "V sobotu hrajeme doma, přijď dřív.",
    "Kotel byl v sobotu skvělý.",
  ])("běžná zpráva: %s", (zprava) => {
    expect(jeOtazkaNaIncident(zprava, SKLAD)).toBe(false);
    expect(jeOtazkaNaIncident(zprava, KOTEL)).toBe(false);
  });

  it("slova věci patří jen k incidentu, kde ta věc zmizela nebo se rozbila", () => {
    expect(jeOtazkaNaIncident("Kde jsou dresy?", KOTEL)).toBe(false);
    expect(jeOtazkaNaIncident("Kdo rozmlátil bubny?", KOTEL)).toBe(true);
  });

  it("normalizace bez diakritiky a velkých písmen", () => {
    expect(normalizuj("Ukradené DRESY")).toBe("ukradene dresy");
  });
});

describe("na který incident se ptá", () => {
  const incidenty = [{ id: "novy", ...KOTEL }, { id: "stary", ...SKLAD }];

  it("obecná otázka míří na nejnovější", () => {
    expect(najdiIncidentVTextu("Kdo to byl?", incidenty)).toBe("novy");
  });

  it("otázka na věc najde ten správný", () => {
    expect(najdiIncidentVTextu("Kde jsou dresy?", incidenty)).toBe("stary");
  });

  it("běžná zpráva žádný", () => {
    expect(najdiIncidentVTextu("Zdar", incidenty)).toBeNull();
  });
});

describe("téma ve vlákně", () => {
  const stav = JSON.stringify({ awaiting: "coach", incidentId: "inc-1", incidentDen: "2026-09-16" });

  it("platí do konce herního dne", () => {
    expect(temaZeStavu(stav, "2026-09-16")).toEqual({ incidentId: "inc-1", den: "2026-09-16" });
    expect(temaZeStavu(stav, "2026-09-17")).toBeNull();
    expect(temaZeStavu(stav)).toEqual({ incidentId: "inc-1", den: "2026-09-16" });
  });

  it("vlákno bez tématu nebo rozbitý JSON", () => {
    expect(temaZeStavu(JSON.stringify({ awaiting: "coach" }))).toBeNull();
    expect(temaZeStavu("{rozbité")).toBeNull();
    expect(temaZeStavu(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Spusť test, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/tema.test.ts`
Expected: FAIL, modul `./tema` neexistuje.

- [ ] **Step 3: Implementace**

`apps/api/src/incidents/tema.ts`:

```ts
/**
 * Pozná, že se trenér hráče ptá na incident (spec 7a). Čisté funkce.
 *
 * Obecná slova (krádež, zloděj, kamera…) se hledají kdekoli v textu, protože se skloňují
 * i předponami („ukradl", „vykradli"). Slova konkrétního incidentu (místo, co zmizelo nebo
 * se rozbilo) jen jako začátek slova, aby „dres" nechytil kdejaké slovo s tou slabikou.
 */

import { CATEGORY_LABELS } from "../equipment/equipment-generator";
import { logger } from "../lib/logger";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import type { Ztrata } from "./typy";
import type { TemaKonverzace } from "./znalosti";

export function normalizuj(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Bez diakritiky, malými písmeny. */
const OBECNA_SLOVA = ["krad", "zlodej", "zmizel", "vloup", "kdo to byl", "kdo to udelal", "kamer", "polici"] as const;

/** Začátky slov podle druhu incidentu: kde se to stalo a co se tam dělo. */
const SLOVA_DRUHU: Record<string, readonly string[]> = {
  vloupani_sklad: ["sklad"],
  vitrina: ["vitrin", "pohar"],
  dodavka_pujcena: ["dodavk"],
  dodavka_ukradena: ["dodavk"],
  kradez_kamery: ["zabezpec"],
  oslava_v_kabine: ["oslav", "kabin"],
  kopnute_dvere: ["dver", "kabin"],
  koleje_trakturek: ["trakt", "kolej"],
  pozar_grilu: ["gril", "pozar", "ohen", "ohne", "stanek", "stank"],
  svetlice: ["svetlic", "pyro"],
  vandal: ["vandal"],
};

/** Slova z názvů vybavení a zařízení, která by chytala běžnou řeč. */
const NEROZLISUJICI = new Set([
  "klubova", "klubovy", "klubove", "treninkove", "treninkova", "vybaveni", "vybava", "zimni", "lavicky",
  "sektor", "kotel", "kotle", "sluzba",
]);

/** Kmeny slov z názvu toho, co incident poškodil: bez poslední hlásky, aby „dresy" poznalo i „dresů". */
function kmenyZtraty(z: Ztrata): string[] {
  const nazev = z.typ === "vybaveni" || z.typ === "vybaveni_stav" ? CATEGORY_LABELS[z.kategorie]
    : z.typ === "stadion" ? FACILITY_LABELS[z.zarizeni]
    : "trávník";
  return normalizuj(nazev ?? "")
    .split(/[^a-z]+/)
    .filter((slovo) => slovo.length >= 5 && !NEROZLISUJICI.has(slovo))
    .map((slovo) => slovo.slice(0, -1));
}

export function jeOtazkaNaIncident(textZpravy: string, incident: { kind: string; ztraty: readonly Ztrata[] }): boolean {
  const t = normalizuj(textZpravy);
  if (OBECNA_SLOVA.some((s) => t.includes(s))) return true;
  const slova = t.split(/[^a-z]+/).filter(Boolean);
  const kmeny = [...(SLOVA_DRUHU[incident.kind] ?? []), ...incident.ztraty.flatMap(kmenyZtraty)];
  return kmeny.some((k) => slova.some((s) => s.startsWith(k)));
}

/** Nejnovější incident, na který se zpráva ptá. `incidenty` seřazené od nejnovějšího (spec 7a). */
export function najdiIncidentVTextu(
  textZpravy: string, incidenty: ReadonlyArray<{ id: string; kind: string; ztraty: readonly Ztrata[] }>,
): string | null {
  return incidenty.find((i) => jeOtazkaNaIncident(textZpravy, i))?.id ?? null;
}

/** Téma z `conversations.ai_thread_state`. S `den` platí jen v herní den, kdy se nastavilo. */
export function temaZeStavu(raw: unknown, den?: string): TemaKonverzace | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const v = JSON.parse(raw) as { incidentId?: unknown; incidentDen?: unknown };
    if (typeof v.incidentId !== "string" || typeof v.incidentDen !== "string") return null;
    if (den !== undefined && v.incidentDen !== den) return null;
    return { incidentId: v.incidentId, den: v.incidentDen };
  } catch (e) {
    logger.warn({ module: "incidents-tema" }, "nečitelný stav vlákna", e);
    return null;
  }
}
```

- [ ] **Step 4: Spusť testy**

Run: `cd apps/api && npx vitest run src/incidents/tema.test.ts && npx tsc --noEmit`
Expected: PASS. Když některá běžná zpráva selže, uprav seznam slov (ne test) a zdůvodni to v reportu.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/incidents/tema.ts apps/api/src/incidents/tema.test.ts
git commit -F - <<'EOF'
feat(incidenty): detekce otazky na incident ve zprave trenera

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: Výslech

**Files:**
- Modify: `apps/api/src/incidents/incident-db.ts` (`pozdejsi` přesunutý z `akce.ts`)
- Modify: `apps/api/src/incidents/akce.ts` (smazat lokální `pozdejsi`, importovat z `incident-db`)
- Modify: `apps/api/src/incidents/hraci.ts` (`posunVztah`)
- Modify: `apps/api/src/incidents/vysetrovani.ts` (`lzeVyslychat`)
- Modify: `apps/api/src/incidents/texty.ts` (`stopa_priznani_vyslech`)
- Create: `apps/api/src/incidents/vyslech.ts`
- Test: `apps/api/src/incidents/vyslech.test.ts`, `apps/api/src/incidents/hraci.test.ts`, `apps/api/src/incidents/vysetrovani.test.ts`

**Interfaces:**
- Consumes: `nactiIncident`, `nactiHraceKadru`, `proAkce`, `IncidentRadek`, `HracKadru` (`incident-db.ts`); `nactiStopy`, `prikazyStop` (`stopy-db.ts`); `sancePriznani`, `stopaNaHrace` (`vysetrovani.ts`); `KAMARADSKE_VZTAHY`, `LHUTA_PO_ODHALENI_DNI` (`nastaveni.ts`); typy `RoleSvedka`, `RoleZnalosti`, `VysledekVyslechu` (Task 1).
- Produces:
  - `pozdejsi(a: string | null, b: string): string` v `incident-db.ts`
  - `posunVztah(db, a: string, b: string, zmena: { typy: readonly string[]; delta: number; smazPod?: number; vytvorJako?: { typ: string; sila: number } }): Promise<D1PreparedStatement[]>`
  - `lzeVyslychat(i: Pick<IncidentProAkce, "status" | "category" | "odhalen">): boolean`
  - `sanceProzrazeni(role: RoleSvedka, ochota: number, vztahKTrenerovi: number): number`
  - `rozhodniSvedka(role: ReadonlyArray<{ role: RoleSvedka; ochota: number }>, vztahKTrenerovi: number, los: number): "prozradil" | "kryje"`
  - `rozhodniPachatele(h: HracKlubu, stopaNaNej: boolean, los: number): "priznal" | "zapira"`
  - `vyslechni(db, opts: { teamId: string; incidentId: string; playerId: string; gameDate: string }): Promise<{ vysledek: VysledekVyslechu; novy: boolean } | null>` — `null`: není co vyslýchat (hráč bez tajné znalosti, incident odhalený či uzavřený, hráč mimo kádr) nebo výsledek mezitím zabral jiný požadavek

- [ ] **Step 1: `pozdejsi` do `incident-db.ts`**

V `apps/api/src/incidents/akce.ts` smaž funkci `pozdejsi` a přidej ji do importu z `./incident-db`. Do `apps/api/src/incidents/incident-db.ts` za `herniDatum`:

```ts
/** Pozdější ze dvou herních dat ISO; `null` znamená žádné. */
export function pozdejsi(a: string | null, b: string): string {
  return a && a > b ? a : b;
}
```

- [ ] **Step 2: Napiš selhávající testy**

Do `apps/api/src/incidents/vysetrovani.test.ts` přidej `lzeVyslychat` do importu a na konec souboru:

```ts
describe("výslech jde", () => {
  it("u nevyřešené krádeže nebo poškození i během šetření policie, ne po odhalení", () => {
    expect(lzeVyslychat({ status: "otevreny", category: "kradez", odhalen: false })).toBe(true);
    expect(lzeVyslychat({ status: "policie", category: "poskozeni", odhalen: false })).toBe(true);
    expect(lzeVyslychat({ status: "otevreny", category: "kradez", odhalen: true })).toBe(false);
    expect(lzeVyslychat({ status: "uzavreny", category: "kradez", odhalen: false })).toBe(false);
    expect(lzeVyslychat({ status: "otevreny", category: "zivotni", odhalen: false })).toBe(false);
  });
});
```

Do `apps/api/src/incidents/hraci.test.ts` přidej `posunVztah` do importu a na konec souboru:

```ts
describe("vztah mezi dvěma hráči", () => {
  const sVztahem = (first: unknown) => new FalesnaD1([{ sql: /SELECT id, strength FROM relationships/, first }]);

  it("hledá pár v obou pořadích a posune sílu s ořezem na 100", async () => {
    const db = sVztahem({ id: "v1", strength: 50 });
    const prikazy = (await posunVztah(jakoD1(db), "a", "b", { typy: ["rivals"], delta: 15 })).map(jakoDotaz);
    expect(db.dotazy[0].params).toEqual(["a", "b", "b", "a", "rivals"]);
    expect(prikazy.map((p) => p.params)).toEqual([[65, "v1"]]);
    const strop = (await posunVztah(jakoD1(sVztahem({ id: "v1", strength: 95 })), "a", "b", { typy: ["rivals"], delta: 15 })).map(jakoDotaz);
    expect(strop[0].params).toEqual([100, "v1"]);
  });

  it("pod hranicí vztah smaže", async () => {
    const prikazy = (await posunVztah(jakoD1(sVztahem({ id: "v1", strength: 25 })), "a", "b", { typy: ["neighbors"], delta: -20, smazPod: 10 })).map(jakoDotaz);
    expect(prikazy[0].sql).toContain("DELETE FROM relationships");
    expect(prikazy[0].params).toEqual(["v1"]);
  });

  it("chybějící vztah založí jen s vytvorJako, pár seřazený; existující s nulovou změnou nechá být", async () => {
    expect(await posunVztah(jakoD1(sVztahem(null)), "s", "p", { typy: ["rivals"], delta: 0 })).toEqual([]);
    const nove = (await posunVztah(jakoD1(sVztahem(null)), "s", "p", { typy: ["rivals"], delta: 0, vytvorJako: { typ: "rivals", sila: 40 } })).map(jakoDotaz);
    expect(nove[0].sql).toContain("INSERT INTO relationships");
    expect(nove[0].params.slice(1)).toEqual(["p", "s", "rivals", 40]);
    expect(await posunVztah(jakoD1(sVztahem({ id: "v1", strength: 50 })), "s", "p", { typy: ["rivals"], delta: 0, vytvorJako: { typ: "rivals", sila: 40 } })).toEqual([]);
  });
});
```

`apps/api/src/incidents/vyslech.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IncidentRadek } from "./incident-db";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { hrac, hracRadek, incidentRadek } from "./testovaci-stav";
import { rozhodniPachatele, rozhodniSvedka, sanceProzrazeni, vyslechni } from "./vyslech";

const DNES = "2026-09-16T16:00:00.000Z";

describe("šance a rozhodnutí výslechu", () => {
  it("rival mluví ochotněji, kamarád kryje, vztah k trenérovi pomáhá (spec 7a)", () => {
    expect(sanceProzrazeni("svedek", 50, 50)).toBe(50);
    expect(sanceProzrazeni("rival", 50, 50)).toBe(65);
    expect(sanceProzrazeni("kamarad", 50, 50)).toBe(30);
    expect(sanceProzrazeni("svedek", 50, 90)).toBe(70);
    expect(sanceProzrazeni("kamarad", 0, 0)).toBe(0);
    expect(sanceProzrazeni("rival", 100, 100)).toBe(100);
  });

  it("hráč s víc rolemi odpoví podle té nejméně ochotné", () => {
    expect(rozhodniSvedka([{ role: "svedek", ochota: 70 }, { role: "kamarad", ochota: 20 }], 50, 0.01)).toBe("kryje");
    expect(rozhodniSvedka([{ role: "svedek", ochota: 70 }], 50, 0.01)).toBe("prozradil");
  });

  it("pachatel se přizná podle disciplíny, temperamentu, vztahu a stopy", () => {
    // (90 + 90 + 80) / 3 − 20 = 66,7; se stopou 96,7
    const hodny = hrac({ disciplina: 90, temperament: 10, vztahKTrenerovi: 80 });
    expect(rozhodniPachatele(hodny, false, 0.5)).toBe("priznal");
    expect(rozhodniPachatele(hodny, false, 0.7)).toBe("zapira");
    expect(rozhodniPachatele(hodny, true, 0.7)).toBe("priznal");
  });
});

type Role = { role: string; willingness: number; interrogation: string | null };

function prostredi(opts: { incident?: IncidentRadek; role: Role[]; hracOver?: Record<string, unknown>; dalsi?: Pravidlo[] }) {
  return new FalesnaD1([
    ...(opts.dalsi ?? []),
    { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: opts.incident ?? incidentRadek() },
    { sql: /SELECT role, willingness, interrogation FROM club_incident_knowledge/, all: opts.role },
    { sql: /FROM players WHERE id = \? AND team_id = \?/, first: hracRadek("s", "Jan", "Svědek", opts.hracOver) },
    { sql: /SELECT COUNT\(\*\) AS n FROM relationships/, first: { n: 0 } },
  ]);
}

const zeptej = (db: FalesnaD1, playerId = "s") =>
  vyslechni(jakoD1(db), { teamId: "tym-a", incidentId: "inc-1", playerId, gameDate: DNES });

describe("výslech v DB", () => {
  it("rival, který práskne: uloží výsledek, najde jeho stopu a rivalita zesílí", async () => {
    const db = prostredi({
      role: [{ role: "rival", willingness: 100, interrogation: null }],
      hracOver: { coach_relationship: 100 },
      dalsi: [{ sql: /SELECT id, strength FROM relationships/, first: { id: "v1", strength: 50 } }],
    });
    expect(await zeptej(db)).toEqual({ vysledek: "prozradil", novy: true });
    const narok = db.dotazy.find((d) => /UPDATE club_incident_knowledge SET interrogation/.test(d.sql));
    expect(narok?.params).toEqual(["prozradil", DNES, "inc-1", "s", "tym-a"]);
    const davka = db.davky.flat();
    expect(davka.find((d) => /UPDATE club_incident_clues SET found = 1/.test(d.sql))?.params).toEqual([DNES, "inc-1", "s"]);
    expect(davka.find((d) => /UPDATE relationships SET strength/.test(d.sql))?.params).toEqual([65, "v1"]);
  });

  it("kamarád, který kryje: stopa zůstane skrytá a kamarádství zesílí", async () => {
    const db = prostredi({
      role: [{ role: "kamarad", willingness: 0, interrogation: null }],
      hracOver: { coach_relationship: 0 },
      dalsi: [{ sql: /SELECT id, strength FROM relationships/, first: { id: "v1", strength: 60 } }],
    });
    expect(await zeptej(db)).toEqual({ vysledek: "kryje", novy: true });
    const davka = db.davky.flat();
    expect(davka.some((d) => /club_incident_clues/.test(d.sql))).toBe(false);
    expect(davka.find((d) => /UPDATE relationships SET strength/.test(d.sql))?.params).toEqual([70, "v1"]);
  });

  it("kamarád, který práskne: kamarádství zeslábne a vznikne rivalita", async () => {
    const db = prostredi({
      role: [{ role: "kamarad", willingness: 100, interrogation: null }],
      hracOver: { coach_relationship: 100 },
      dalsi: [
        { sql: /type IN \(\?\)/, first: null },
        { sql: /SELECT id, strength FROM relationships/, first: { id: "v1", strength: 45 } },
      ],
    });
    expect((await zeptej(db))?.vysledek).toBe("prozradil");
    const davka = db.davky.flat();
    expect(davka.find((d) => /UPDATE relationships SET strength/.test(d.sql))?.params).toEqual([25, "v1"]);
    expect(davka.find((d) => /INSERT INTO relationships/.test(d.sql))?.params.slice(1)).toEqual(["p", "s", "rivals", 40]);
  });

  it("pachatel se stopou na sebe se přizná: odhalení, lhůta a stopa přiznání", async () => {
    const db = new FalesnaD1([
      { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: incidentRadek() },
      { sql: /SELECT role, willingness, interrogation FROM club_incident_knowledge/, all: [{ role: "pachatel", willingness: 0, interrogation: null }] },
      { sql: /FROM players WHERE id = \? AND team_id = \?/, first: hracRadek("p", "Pepa", "Průšvih", {
        personality: JSON.stringify({ discipline: 100, temper: 0 }), coach_relationship: 100,
      }) },
      { sql: /SELECT COUNT\(\*\) AS n FROM relationships/, first: { n: 0 } },
      { sql: /FROM club_incident_clues WHERE incident_id/, all: [{
        id: "c1", source: "soused", points_to_player_id: null, suspects: JSON.stringify(["p", "s"]), holder_player_id: null,
        strength: 1, police_bonus: 0.15, text: "Soused.", found: 1,
      }] },
    ]);
    expect(await zeptej(db, "p")).toEqual({ vysledek: "priznal", novy: true });
    const davka = db.davky.flat();
    expect(davka.find((d) => /UPDATE club_incidents SET culprit_revealed = 1/.test(d.sql))?.params)
      .toEqual(["2026-09-21T16:00:00.000Z", "inc-1", "tym-a"]);
    expect(davka.some((d) => /INSERT OR IGNORE INTO club_incident_clues/.test(d.sql) && d.params[3] === "priznani")).toBe(true);
  });

  it("uložený výsledek se jen vrátí, nic se nepočítá znovu", async () => {
    const db = prostredi({ role: [{ role: "svedek", willingness: 50, interrogation: "kryje" }] });
    expect(await zeptej(db)).toEqual({ vysledek: "kryje", novy: false });
    expect(db.pocet(/UPDATE club_incident_knowledge/)).toBe(0);
    expect(db.davky).toHaveLength(0);
  });

  it("odhalený incident ani hráč bez tajné znalosti se nevyslýchá", async () => {
    expect(await zeptej(prostredi({ incident: incidentRadek({ culprit_revealed: 1 }), role: [{ role: "svedek", willingness: 50, interrogation: null }] }))).toBeNull();
    expect(await zeptej(prostredi({ role: [] }))).toBeNull();
  });

  it("souběh: výsledek zabral jiný požadavek, následky se neprovedou", async () => {
    const db = prostredi({
      role: [{ role: "rival", willingness: 100, interrogation: null }],
      dalsi: [{ sql: /UPDATE club_incident_knowledge SET interrogation/, changes: 0 }],
    });
    expect(await zeptej(db)).toBeNull();
    expect(db.davky).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Spusť testy, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/vyslech.test.ts src/incidents/hraci.test.ts src/incidents/vysetrovani.test.ts`
Expected: FAIL (chybí `vyslech.ts`, `posunVztah`, `lzeVyslychat`).

- [ ] **Step 4: `lzeVyslychat`**

Do `apps/api/src/incidents/vysetrovani.ts` za `dostupneAkce`:

```ts
/** Ptát se hráčů (výslech, spec 7a) jde, dokud je krádež nebo poškození nevyřešené, i když šetří policie. */
export function lzeVyslychat(i: Pick<IncidentProAkce, "status" | "category" | "odhalen">): boolean {
  return (i.status === "otevreny" || i.status === "policie")
    && (i.category === "kradez" || i.category === "poskozeni")
    && !i.odhalen;
}
```

- [ ] **Step 5: `posunVztah`**

V `apps/api/src/incidents/hraci.ts` uprav úvodní komentář souboru na:

```ts
/**
 * Následky incidentu pro hráče: morálka, vztah k trenérovi a vztahy mezi hráči (spec 7b–7d, 17c).
 * Vrací připravené příkazy pro `db.batch`, sám nic nezapisuje.
 */
```

přidej `import { logger } from "../lib/logger";` a na konec souboru:

```ts
/**
 * Posun vztahu mezi dvěma hráči (spec 17c). Pár se hledá v obou pořadích, generátor,
 * přestupy a AI kluby ho ukládají různě. Z víc vztahů daných typů se bere nejsilnější.
 * Chybějící vztah vznikne jen s `vytvorJako`; pod `smazPod` se vztah smaže.
 */
export async function posunVztah(
  db: D1Database, a: string, b: string,
  zmena: { typy: readonly string[]; delta: number; smazPod?: number; vytvorJako?: { typ: string; sila: number } },
): Promise<D1PreparedStatement[]> {
  const vztah = await db.prepare(
    `SELECT id, strength FROM relationships
      WHERE ((player_a_id = ? AND player_b_id = ?) OR (player_a_id = ? AND player_b_id = ?))
        AND type IN (${zmena.typy.map(() => "?").join(", ")})
      ORDER BY strength DESC LIMIT 1`,
  ).bind(a, b, b, a, ...zmena.typy).first<{ id: string; strength: number | null }>()
    .catch((e) => { logger.warn({ module: "incidents-hraci" }, `vztah ${a} a ${b}`, e); return "chyba" as const; });
  // Když se vztah nepodařilo přečíst, nezakládat nový: mohl by vzniknout druhý.
  if (vztah === "chyba") return [];
  if (!vztah) {
    if (!zmena.vytvorJako) return [];
    const [prvni, druhy] = a < b ? [a, b] : [b, a];
    return [db.prepare("INSERT INTO relationships (id, player_a_id, player_b_id, type, strength) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), prvni, druhy, zmena.vytvorJako.typ, zmena.vytvorJako.sila)];
  }
  if (zmena.delta === 0) return [];
  const sila = Math.max(0, Math.min(100, (vztah.strength ?? 50) + zmena.delta));
  if (zmena.smazPod !== undefined && sila < zmena.smazPod) {
    return [db.prepare("DELETE FROM relationships WHERE id = ?").bind(vztah.id)];
  }
  return [db.prepare("UPDATE relationships SET strength = ? WHERE id = ?").bind(sila, vztah.id)];
}
```

- [ ] **Step 6: Text přiznání při výslechu**

Do `TEXTY` v `apps/api/src/incidents/texty.ts` (za `znalost_pachatel`):

```ts
  stopa_priznani_vyslech: [
    "{hrac} se trenérovi přiznal v rozhovoru.",
    "{hrac} to trenérovi v SMS sám přiznal.",
    "{hrac} se při rozhovoru s trenérem ke všemu přiznal.",
  ],
```

- [ ] **Step 7: `vyslech.ts`**

```ts
/**
 * Výslech přes chat (spec 7a). Výsledek rozhoduje DB, ne model: spočítá se jednou
 * na hráče a incident, uloží se a další otázky dostanou stejnou odpověď.
 */

import { createRng, type Rng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { posunVztah } from "./hraci";
import { nactiHraceKadru, nactiIncident, pozdejsi, proAkce, type HracKadru, type IncidentRadek } from "./incident-db";
import { KAMARADSKE_VZTAHY, LHUTA_PO_ODHALENI_DNI } from "./nastaveni";
import { nactiStopy, prikazyStop } from "./stopy-db";
import { text } from "./texty";
import type { HracKlubu } from "./typy";
import { lzeVyslychat, sancePriznani, stopaNaHrace } from "./vysetrovani";
import type { RoleSvedka, RoleZnalosti, VysledekVyslechu } from "./znalosti";

const M = "incidents-vyslech";

/** Role, které se vyslýchají. Konstanta, ne vstup. */
const ROLE_VYSLECHU = "('svedek', 'kamarad', 'rival', 'pachatel')";

/** Šance v procentech, že svědek, kamarád nebo rival trenérovi řekne, co ví (spec 7a). */
export function sanceProzrazeni(role: RoleSvedka, ochota: number, vztahKTrenerovi: number): number {
  const sance = ochota + (vztahKTrenerovi - 50) / 2 + (role === "rival" ? 15 : 0) - (role === "kamarad" ? 20 : 0);
  return Math.max(0, Math.min(100, sance));
}

/**
 * Hráč s víc rolemi (kamarád, který i něco viděl) odpovídá jednotně, jinak by si protiřečil.
 * Rozhoduje role, ve které mluví nejméně ochotně. `los` je první číslo ze seedu výslechu.
 */
export function rozhodniSvedka(
  role: ReadonlyArray<{ role: RoleSvedka; ochota: number }>, vztahKTrenerovi: number, los: number,
): "prozradil" | "kryje" {
  if (role.length === 0) return "kryje";
  const sance = Math.min(...role.map((r) => sanceProzrazeni(r.role, r.ochota, vztahKTrenerovi)));
  return los * 100 < sance ? "prozradil" : "kryje";
}

export function rozhodniPachatele(h: HracKlubu, stopaNaNej: boolean, los: number): "priznal" | "zapira" {
  return los * 100 < sancePriznani(h, stopaNaNej) ? "priznal" : "zapira";
}

type RadekRole = { role: RoleZnalosti; willingness: number; interrogation: VysledekVyslechu | null };

function jeSvedecka(r: RadekRole): r is RadekRole & { role: RoleSvedka } {
  return r.role === "svedek" || r.role === "kamarad" || r.role === "rival";
}

export async function vyslechni(
  db: D1Database, opts: { teamId: string; incidentId: string; playerId: string; gameDate: string },
): Promise<{ vysledek: VysledekVyslechu; novy: boolean } | null> {
  const [inc, radky] = await Promise.all([
    nactiIncident(db, opts.teamId, opts.incidentId),
    db.prepare(
      `SELECT role, willingness, interrogation FROM club_incident_knowledge
        WHERE incident_id = ? AND player_id = ? AND team_id = ? AND role IN ${ROLE_VYSLECHU}`,
    ).bind(opts.incidentId, opts.playerId, opts.teamId).all<RadekRole>()
      .catch((e) => { logger.warn({ module: M }, `znalosti k výslechu ${opts.incidentId}`, e); return null; }),
  ]);
  const role = radky?.results ?? [];
  if (!inc || role.length === 0 || !lzeVyslychat(proAkce(inc, false))) return null;

  const ulozeny = role.find((r) => r.interrogation !== null)?.interrogation;
  if (ulozeny) return { vysledek: ulozeny, novy: false };

  const hrac = await nactiHraceKadru(db, opts.teamId, opts.playerId);
  if (!hrac) return null;

  const rng = createRng(seedFromString(`vyslech|${opts.incidentId}|${opts.playerId}`));
  // První číslo z generátoru je los výslechu, na tom stojí determinismus.
  const los = rng.random();
  const jePachatel = role.some((r) => r.role === "pachatel") && inc.culprit_player_id === opts.playerId;
  const vysledek: VysledekVyslechu = jePachatel
    ? rozhodniPachatele(hrac, stopaNaHrace(await nactiStopy(db, opts.incidentId), hrac.id), los)
    : rozhodniSvedka(role.filter(jeSvedecka).map((r) => ({ role: r.role, ochota: r.willingness })), hrac.vztahKTrenerovi, los);

  const narok = await db.prepare(
    `UPDATE club_incident_knowledge SET interrogation = ?, interrogated_on = ?
      WHERE incident_id = ? AND player_id = ? AND team_id = ? AND role IN ${ROLE_VYSLECHU} AND interrogation IS NULL`,
  ).bind(vysledek, opts.gameDate, opts.incidentId, opts.playerId, opts.teamId).run()
    .catch((e) => { logger.error({ module: M }, `výsledek výslechu ${opts.incidentId}`, e); return null; });
  if ((narok?.meta?.changes ?? 0) === 0) return null;

  const davka = await nasledkyVyslechu(db, { ...opts, inc, hrac, role: role.map((r) => r.role), vysledek, rng });
  if (davka.length > 0) {
    await db.batch(davka).catch((e) => logger.error({ module: M }, `následky výslechu ${opts.incidentId}`, e));
  }
  return { vysledek, novy: true };
}

async function nasledkyVyslechu(
  db: D1Database,
  v: {
    teamId: string; incidentId: string; playerId: string; gameDate: string;
    inc: IncidentRadek; hrac: HracKadru; role: RoleZnalosti[]; vysledek: VysledekVyslechu; rng: Rng;
  },
): Promise<D1PreparedStatement[]> {
  const davka: D1PreparedStatement[] = [];
  if (v.vysledek === "prozradil") {
    davka.push(db.prepare(
      `UPDATE club_incident_clues SET found = 1, found_on = ?
        WHERE incident_id = ? AND holder_player_id = ? AND source IN ('svedek', 'kamarad', 'rival') AND found = 0`,
    ).bind(v.gameDate, v.incidentId, v.playerId));
  }
  if (v.vysledek === "priznal") {
    davka.push(
      db.prepare(
        `UPDATE club_incidents SET culprit_revealed = 1, deadline = ?
          WHERE id = ? AND team_id = ? AND culprit_revealed = 0 AND status IN ('otevreny', 'policie')`,
      ).bind(pozdejsi(v.inc.deadline, gameExpiry(v.gameDate, LHUTA_PO_ODHALENI_DNI)), v.incidentId, v.teamId),
      ...prikazyStop(db, v.teamId, v.incidentId, [{
        zdroj: "priznani", ukazujeNa: v.playerId, podezreli: null, drzitel: null, sila: 3, bonusPolicie: 0, nalezena: true,
        text: text(v.rng, "stopa_priznani_vyslech", { hrac: v.hrac.jmeno }),
      }], v.gameDate),
    );
  }

  // Jak se zachoval k pachateli, pozná i jejich vztah (spec 17c).
  const pachatelId = v.inc.culprit_player_id;
  if (!pachatelId || pachatelId === v.playerId) return davka;
  if (v.role.includes("kamarad")) {
    if (v.vysledek === "prozradil") {
      davka.push(...await posunVztah(db, v.playerId, pachatelId, { typy: KAMARADSKE_VZTAHY, delta: -20, smazPod: 10 }));
      davka.push(...await posunVztah(db, v.playerId, pachatelId, { typy: ["rivals"], delta: 0, vytvorJako: { typ: "rivals", sila: 40 } }));
    } else {
      davka.push(...await posunVztah(db, v.playerId, pachatelId, { typy: KAMARADSKE_VZTAHY, delta: 10 }));
    }
  }
  if (v.role.includes("rival") && v.vysledek === "prozradil") {
    davka.push(...await posunVztah(db, v.playerId, pachatelId, { typy: ["rivals"], delta: 15 }));
  }
  return davka;
}
```

Poznámka: `HracKadru` a `IncidentRadek` už `incident-db.ts` exportuje; když `HracKadru` export chybí, přidej `export` k rozhraní.

- [ ] **Step 8: Spusť testy**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/incidents/incident-db.ts apps/api/src/incidents/akce.ts apps/api/src/incidents/hraci.ts apps/api/src/incidents/hraci.test.ts apps/api/src/incidents/vysetrovani.ts apps/api/src/incidents/vysetrovani.test.ts apps/api/src/incidents/texty.ts apps/api/src/incidents/vyslech.ts apps/api/src/incidents/vyslech.test.ts
git commit -F - <<'EOF'
feat(incidenty): vyslech hracu, nalezene stopy, priznani a vztahy

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: Otázka v chatu a akce „Zeptat se"

**Files:**
- Create: `apps/api/src/incidents/zprava-trenera.ts`
- Modify: `apps/api/src/routes/messaging.ts` (POST `/teams/:teamId/conversations/:convId`)
- Modify: `apps/api/src/incidents/akce.ts` (`zeptejSe`)
- Modify: `apps/api/src/routes/incidents.ts` (POST `zeptat`, detail)
- Test: `apps/api/src/incidents/zprava-trenera.test.ts`, `apps/api/src/incidents/akce-zeptat.test.ts`

**Interfaces:**
- Consumes: `temaZeStavu`, `najdiIncidentVTextu` (Task 3); `vyslechni`, `lzeVyslychat` (Task 4); `nactiZtraty` (`popis.ts`); `getOrCreatePlayerConversation` (`messaging/ai-player-spawn`).
- Produces:
  - `nastavTema(db, convId: string, incidentId: string, den: string): Promise<boolean>` — `json_set` klíčů `incidentId` a `incidentDen` v `conversations.ai_thread_state`, ostatní klíče vlákna zůstanou
  - `zpracujZpravuTrenera(db, opts: { teamId; convId; playerId; text }): Promise<{ incidentId: string; vyslech: VysledekVyslechu | null } | null>`
  - `zeptejSe(env, teamId, incidentId, playerId): Promise<VysledekAkce<{ conversationId: string }>>`
  - API: `POST /api/teams/:teamId/incidents/:id/zeptat {playerId}` → `{ ok: true, conversationId }`; detail incidentu vrací `akce.zeptat: boolean` a `kadr` i tehdy, když jde jen se ptát.
  - Klíče stavu vlákna: `ai_thread_state.incidentId`, `ai_thread_state.incidentDen` (`YYYY-MM-DD`).

- [ ] **Step 1: Napiš selhávající testy**

`apps/api/src/incidents/zprava-trenera.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./vyslech", () => ({ vyslechni: vi.fn(async () => ({ vysledek: "kryje", novy: true })) }));

import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { vyslechni } from "./vyslech";
import { zpracujZpravuTrenera } from "./zprava-trenera";

const DNES = "2026-09-16T16:00:00.000Z";
const DRESY = JSON.stringify([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }]);

function db(stav: unknown, dalsi: Pravidlo[] = []) {
  return new FalesnaD1([
    ...dalsi,
    { sql: /FROM conversations c JOIN teams t/, first: { ai_thread_state: stav === null ? null : JSON.stringify(stav), game_date: DNES, sezona: 4 } },
    { sql: /FROM club_incidents\s+WHERE team_id = \?/, all: [{ id: "inc-2", kind: "vandal", loss: "[]" }, { id: "inc-1", kind: "vloupani_sklad", loss: DRESY }] },
  ]);
}

const zprava = (d: FalesnaD1, text: string) =>
  zpracujZpravuTrenera(jakoD1(d), { teamId: "tym-a", convId: "konv-1", playerId: "s", text });

beforeEach(() => vi.clearAllMocks());

describe("zpráva trenéra hráči", () => {
  it("téma z tlačítka platí celý herní den i bez klíčových slov", async () => {
    const d = db({ incidentId: "inc-1", incidentDen: "2026-09-16" });
    expect(await zprava(d, "A kde přesně?")).toEqual({ incidentId: "inc-1", vyslech: "kryje" });
    expect(d.pocet(/FROM club_incidents/)).toBe(0);
    expect(vyslechni).toHaveBeenCalledWith(expect.anything(), { teamId: "tym-a", incidentId: "inc-1", playerId: "s", gameDate: DNES });
  });

  it("včerejší téma neplatí, otázka na věc najde incident a uloží ho do vlákna", async () => {
    const d = db({ awaiting: "coach", incidentId: "inc-9", incidentDen: "2026-09-15" });
    expect(await zprava(d, "Kde jsou dresy?")).toEqual({ incidentId: "inc-1", vyslech: "kryje" });
    const tema = d.dotazy.find((q) => /UPDATE conversations SET ai_thread_state = json_set/.test(q.sql));
    expect(tema?.params).toEqual(["inc-1", "2026-09-16", "konv-1"]);
  });

  it("běžná zpráva nic nenastaví a nikoho nevyslýchá", async () => {
    const d = db(null);
    expect(await zprava(d, "Zdar, jak se máš?")).toBeNull();
    expect(d.pocet(/UPDATE conversations/)).toBe(0);
    expect(vyslechni).not.toHaveBeenCalled();
  });

  it("hledá jen otevřené neodhalené krádeže a poškození aktuální sezóny", async () => {
    const d = db(null);
    expect((await zprava(d, "Kdo to byl?"))?.incidentId).toBe("inc-2");
    const dotaz = d.dotazy.find((q) => /FROM club_incidents/.test(q.sql));
    expect(dotaz?.params).toEqual(["tym-a", 4]);
    expect(dotaz?.sql).toContain("culprit_revealed = 0");
    expect(dotaz?.sql).toContain("status IN ('otevreny', 'policie')");
  });
});
```

`apps/api/src/incidents/akce-zeptat.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/ai-player-spawn", () => ({ getOrCreatePlayerConversation: vi.fn(async () => "konv-1") }));

import type { Bindings } from "../index";
import { getOrCreatePlayerConversation } from "../messaging/ai-player-spawn";
import { zeptejSe } from "./akce";
import type { IncidentRadek } from "./incident-db";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { incidentRadek } from "./testovaci-stav";

const DNES = "2026-09-16T16:00:00.000Z";

function prostredi(incident: IncidentRadek, dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: incident },
    { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
    { sql: /SELECT id, first_name, last_name, nickname, avatar FROM players/, first: { id: "s", first_name: "Jan", last_name: "Svědek", nickname: null, avatar: "{}" } },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

beforeEach(() => vi.clearAllMocks());

describe("zeptat se hráče", () => {
  it("otevře konverzaci a nastaví téma na dnešní herní den", async () => {
    const { db, env } = prostredi(incidentRadek());
    expect(await zeptejSe(env, "tym-a", "inc-1", "s")).toEqual({ ok: true, conversationId: "konv-1" });
    expect(getOrCreatePlayerConversation).toHaveBeenCalledWith(expect.anything(), "tym-a", expect.objectContaining({ id: "s", firstName: "Jan" }));
    const tema = db.dotazy.find((d) => /UPDATE conversations SET ai_thread_state = json_set/.test(d.sql));
    expect(tema?.params).toEqual(["inc-1", "2026-09-16", "konv-1"]);
  });

  it("jde i během šetření policie", async () => {
    expect((await zeptejSe(prostredi(incidentRadek({ status: "policie" })).env, "tym-a", "inc-1", "s")).ok).toBe(true);
  });

  it("odhalený nebo uzavřený incident: 409", async () => {
    expect(await zeptejSe(prostredi(incidentRadek({ culprit_revealed: 1 })).env, "tym-a", "inc-1", "s")).toMatchObject({ ok: false, kod: 409 });
    expect(await zeptejSe(prostredi(incidentRadek({ status: "uzavreny" })).env, "tym-a", "inc-1", "s")).toMatchObject({ ok: false, kod: 409 });
  });

  it("hráč mimo kádr: 400 a žádná konverzace", async () => {
    const { env } = prostredi(incidentRadek(), [{ sql: /FROM players/, first: null }]);
    expect(await zeptejSe(env, "tym-a", "inc-1", "cizi")).toMatchObject({ ok: false, kod: 400 });
    expect(getOrCreatePlayerConversation).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Spusť testy, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/zprava-trenera.test.ts src/incidents/akce-zeptat.test.ts`
Expected: FAIL (chybí `zprava-trenera.ts` a `zeptejSe`).

- [ ] **Step 3: `zprava-trenera.ts`**

```ts
/**
 * Zpráva trenéra hráči: ptá se na incident? (spec 7a)
 *
 * Běží v POST zprávy DŘÍV, než se začne generovat odpověď: určí téma, uloží ho do
 * vlákna na zbytek herního dne a vyhodnotí výslech. Model pak dostane hotový pokyn.
 */

import { logger } from "../lib/logger";
import { nactiZtraty } from "./popis";
import { najdiIncidentVTextu, temaZeStavu } from "./tema";
import { vyslechni } from "./vyslech";
import type { VysledekVyslechu } from "./znalosti";

const M = "incidents-zprava";

/** Uloží téma do `conversations.ai_thread_state`, ostatní klíče vlákna nechá být. */
export async function nastavTema(db: D1Database, convId: string, incidentId: string, den: string): Promise<boolean> {
  const r = await db.prepare(
    `UPDATE conversations SET ai_thread_state = json_set(
        CASE WHEN json_valid(ai_thread_state) THEN ai_thread_state ELSE '{}' END,
        '$.incidentId', ?, '$.incidentDen', ?)
      WHERE id = ?`,
  ).bind(incidentId, den, convId).run()
    .catch((e) => { logger.warn({ module: M }, `téma konverzace ${convId}`, e); return null; });
  return (r?.meta?.changes ?? 0) > 0;
}

export async function zpracujZpravuTrenera(
  db: D1Database, opts: { teamId: string; convId: string; playerId: string; text: string },
): Promise<{ incidentId: string; vyslech: VysledekVyslechu | null } | null> {
  const zaklad = await db.prepare(
    `SELECT c.ai_thread_state, t.game_date,
            (SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1) AS sezona
       FROM conversations c JOIN teams t ON t.id = c.team_id
      WHERE c.id = ? AND c.team_id = ?`,
  ).bind(opts.convId, opts.teamId).first<{ ai_thread_state: string | null; game_date: string | null; sezona: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `konverzace ${opts.convId}`, e); return null; });
  if (!zaklad?.game_date || zaklad.sezona == null) return null;
  const den = zaklad.game_date.slice(0, 10);

  let incidentId = temaZeStavu(zaklad.ai_thread_state, den)?.incidentId ?? null;
  if (!incidentId) {
    const kandidati = await db.prepare(
      `SELECT id, kind, loss FROM club_incidents
        WHERE team_id = ? AND season_number = ? AND status IN ('otevreny', 'policie') AND culprit_revealed = 0
          AND category IN ('kradez', 'poskozeni')
        ORDER BY game_date DESC LIMIT 10`,
    ).bind(opts.teamId, zaklad.sezona).all<{ id: string; kind: string; loss: string }>()
      .catch((e) => { logger.warn({ module: M }, `incidenty k otázce ${opts.teamId}`, e); return null; });
    incidentId = najdiIncidentVTextu(
      opts.text,
      (kandidati?.results ?? []).map((r) => ({ id: r.id, kind: r.kind, ztraty: nactiZtraty(r.loss) })),
    );
    if (!incidentId) return null;
    // Navazující otázka („a kde?") klíčová slova mít nemusí, téma proto platí do konce dne.
    await nastavTema(db, opts.convId, incidentId, den);
  }

  const vyslech = await vyslechni(db, { teamId: opts.teamId, incidentId, playerId: opts.playerId, gameDate: zaklad.game_date });
  return { incidentId, vyslech: vyslech?.vysledek ?? null };
}
```

- [ ] **Step 4: `zeptejSe` v `akce.ts`**

Do importů `apps/api/src/incidents/akce.ts` přidej `lzeVyslychat` do importu z `./vysetrovani` a `import { nastavTema } from "./zprava-trenera";`. Za funkci `zavolejPolicii`:

```ts
/** Otevře konverzaci s hráčem a nastaví téma na zbytek herního dne (spec 7a). Otázku píše trenér sám. */
export async function zeptejSe(
  env: Bindings, teamId: string, incidentId: string, playerId: string,
): Promise<VysledekAkce<{ conversationId: string }>> {
  const db = env.DB;
  const [inc, gameDate] = await Promise.all([nactiIncident(db, teamId, incidentId), herniDatum(db, teamId)]);
  if (!inc || !gameDate) return NENALEZENO;
  if (!lzeVyslychat(proAkce(inc, false))) return { ok: false, kod: 409, chyba: "Na tenhle incident se už ptát nejde" };

  const hrac = await db.prepare(
    "SELECT id, first_name, last_name, nickname, avatar FROM players WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')",
  ).bind(playerId, teamId).first<{ id: string; first_name: string; last_name: string; nickname: string | null; avatar: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `hráč k otázce ${playerId}`, e); return null; });
  if (!hrac) return { ok: false, kod: 400, chyba: "Hráč není v kádru" };

  const { getOrCreatePlayerConversation } = await import("../messaging/ai-player-spawn");
  const conversationId = await getOrCreatePlayerConversation(db, teamId, {
    id: hrac.id, firstName: hrac.first_name, lastName: hrac.last_name, nickname: hrac.nickname, avatar: hrac.avatar,
  }).catch((e) => { logger.error({ module: M }, `konverzace k incidentu ${incidentId}`, e); return null; });
  if (!conversationId) return { ok: false, kod: 500, chyba: "Konverzaci s hráčem se nepodařilo otevřít" };

  if (!(await nastavTema(db, conversationId, incidentId, gameDate.slice(0, 10)))) {
    return { ok: false, kod: 500, chyba: "Téma rozhovoru se nepodařilo uložit" };
  }
  return { ok: true, conversationId };
}
```

- [ ] **Step 5: Route a detail**

V `apps/api/src/routes/incidents.ts`:
1. import z `../incidents/akce` rozšiř o `zeptejSe`; import z `../incidents/vysetrovani` o `lzeVyslychat`.
2. V GET detailu nahraď řádek `const akce = dostupneAkce(proAkce(row, pachatelVKadru));` za:
```ts
  const akce = dostupneAkce(proAkce(row, pachatelVKadru));
  const zeptat = lzeVyslychat(proAkce(row, pachatelVKadru));
```
3. V odpovědi detailu nahraď `akce,` za `akce: { ...akce, zeptat },` a řádek `kadr: akce.obvinit ? ...` za:
```ts
    kadr: akce.obvinit || zeptat ? kadr.results.map((h) => ({ playerId: h.id, jmeno: `${h.first_name} ${h.last_name}` })) : [],
```
4. Za route `obvinit` přidej:
```ts
// ── POST /api/teams/:teamId/incidents/:id/zeptat ────────────────────────────
// Otevře konverzaci s hráčem a nastaví téma rozhovoru (spec 7a).
incidentsRouter.post("/teams/:teamId/incidents/:id/zeptat", async (c) => {
  const body = await teloPozadavku<{ playerId?: string }>(c, "zeptat se");
  if (!body?.playerId) return c.json({ error: "Vyber hráče, kterého se chceš zeptat" }, 400);
  return odpovedAkce(c, await zeptejSe(c.env, c.req.param("teamId"), c.req.param("id"), body.playerId));
});
```

- [ ] **Step 6: POST zprávy**

V `apps/api/src/routes/messaging.ts` v POST `/teams/:teamId/conversations/:convId` hned za blok

```ts
  await c.env.DB.prepare(
    "UPDATE conversations SET last_message_text = ?, last_message_at = ? WHERE id = ?"
  ).bind(trimmedText, now, convId).run();
```

vlož:

```ts
  // Otázka na incident (spec 7a): výsledek výslechu rozhoduje DB, a to dřív, než se
  // začne generovat odpověď, aby ho model dostal v promptu jako pokyn.
  if (conv?.type === "player" && conv.participant_id) {
    const { zpracujZpravuTrenera } = await import("../incidents/zprava-trenera");
    await zpracujZpravuTrenera(c.env.DB, { teamId, convId, playerId: conv.participant_id, text: body.body.trim() })
      .catch((e) => logger.warn({ module: "messaging" }, "otázka na incident", e));
  }
```

- [ ] **Step 7: Spusť testy**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/incidents/zprava-trenera.ts apps/api/src/incidents/zprava-trenera.test.ts apps/api/src/incidents/akce.ts apps/api/src/incidents/akce-zeptat.test.ts apps/api/src/routes/incidents.ts apps/api/src/routes/messaging.ts
git commit -F - <<'EOF'
feat(incidenty): otazka na incident v chatu a akce zeptat se

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: Prompt a scénáře

**Files:**
- Modify: `apps/api/src/messaging/ai-player-scenarios.ts`
- Modify: `apps/api/src/messaging/ai-player-chat.ts`
- Test: `apps/api/src/messaging/ai-player-chat.test.ts`

**Interfaces:**
- Consumes (Task 1): `blokZnalosti`, `BEZ_ZNALOSTI`, `HLAVICKA_ZNALOSTI`, typ `RadekZnalosti`.
- Produces:
  - `PlayerSnapshot.znalostiIncidentu?: RadekZnalosti[]` (`undefined` = nenačteno)
  - `export const ZAKAZ_ZIVOTNICH_SITUACI: string` v `ai-player-chat.ts`
  - scénář `krivde_obvineny` (`weight: () => 0`, `expectedTurns: 2`, kategorie `personal`)

- [ ] **Step 1: Napiš selhávající testy**

V `apps/api/src/messaging/ai-player-chat.test.ts`:
1. první import změň na `import { describe, it, expect, vi } from "vitest";`
2. hned pod importy vitestu (před ostatní importy) přidej:
```ts
vi.mock("../lib/ai-provider", () => ({
  aiContextFromEnv: vi.fn(async () => ({ provider: "gemini" })),
  generateText: vi.fn(async () => JSON.stringify({
    morale_delta: 0, condition_delta: 0, relationship_delta: 0, absence_days: 0, absence_reason: "", summary: "Odešel v klidu.", tone: "neutral",
  })),
}));
```
3. import `buildSystemPrompt` nahraď za:
```ts
import { BEZ_ZNALOSTI, HLAVICKA_ZNALOSTI, type RadekZnalosti } from "../incidents/znalosti";
import { generateText } from "../lib/ai-provider";
import { ZAKAZ_ZIVOTNICH_SITUACI, buildSystemPrompt, evaluateResolution } from "./ai-player-chat";
import { getScenarioById } from "./ai-player-scenarios";
```
4. na konec souboru:

```ts
const znalost = (o: Partial<RadekZnalosti> = {}): RadekZnalosti => ({
  incidentId: "inc-1", role: "kadr", fact: "Ze skladu zmizelo vybavení: Dresy.", vyslech: null,
  kategorie: "kradez", zavaznost: 1, den: "2027-01-02", predDny: 3, stav: "otevreny", vysledek: null,
  odhalen: false, pachatel: null, pachatelJeOn: false, ...o,
});

describe("hráč ví o dění v klubu jen to, co je v DB", () => {
  it("blok znalostí s pokynem jde do promptu", () => {
    const p = buildSystemPrompt(hrac({
      znalostiIncidentu: [znalost(), znalost({ role: "svedek", fact: "Viděl jsi hráče: Pepa Kos.", vyslech: "prozradil" })],
    }), tym, kdy(2, 18));
    expect(p).toContain(HLAVICKA_ZNALOSTI);
    expect(p).toContain("Ze skladu zmizelo vybavení: Dresy.");
    expect(p).toContain("POKYN: Trenérovi to řekni.");
  });

  it("načtené prázdné znalosti: nic neví a nikoho neobviňuje; nenačtené nepřidají nic", () => {
    expect(buildSystemPrompt(hrac({ znalostiIncidentu: [] }), tym, kdy(2, 18))).toContain(BEZ_ZNALOSTI);
    const bez = buildSystemPrompt(hrac(), tym, kdy(2, 18));
    expect(bez).not.toContain(BEZ_ZNALOSTI);
    expect(bez).not.toContain(HLAVICKA_ZNALOSTI);
  });

  it("bez aktivní životní situace si ji model nesmí vymyslet", () => {
    expect(buildSystemPrompt(hrac(), tym, kdy(2, 18))).toContain(ZAKAZ_ZIVOTNICH_SITUACI);
  });

  it("vyhodnocení rozhovoru nesmí vymyslet životní situaci ani za ni dát volno", async () => {
    await evaluateResolution({}, hrac(), [{ sender: "player", body: "Trenére, potřebuju volno." }], getScenarioById("family_problem")!);
    const prompt = String(vi.mocked(generateText).mock.calls[0][1]);
    expect(prompt).toContain("NEVYMÝŠLEJ narození dítěte");
    expect(prompt).not.toContain("narození dítěte 2-3");
  });
});

describe("scénáře a incidenty", () => {
  it("křivé obvinění se samo nevylosuje", () => {
    expect(getScenarioById("krivde_obvineny")?.weight(hrac({ morale: 10 }))).toBe(0);
  });

  it("rodinné scénáře nenabízí porod, dítě ani nemoc", () => {
    for (const id of ["family_problem", "personal_milestone"]) {
      expect(getScenarioById(id)?.description ?? "").not.toMatch(/narozen[íá]|dítě|nemoc/);
    }
  });
});
```

- [ ] **Step 2: Spusť test, musí selhat**

Run: `cd apps/api && npx vitest run src/messaging/ai-player-chat.test.ts`
Expected: FAIL (chybí `ZAKAZ_ZIVOTNICH_SITUACI`, `znalostiIncidentu`, scénář `krivde_obvineny`).

- [ ] **Step 3: `PlayerSnapshot` a scénáře**

V `apps/api/src/messaging/ai-player-scenarios.ts`:

1. pod úvodní komentář přidej `import type { RadekZnalosti } from "../incidents/znalosti";`
2. do `PlayerSnapshot` za `injuredUntil?: string | null;`:
```ts

  /**
   * Co hráč ví o incidentech v klubu (spec 10b). Načítá volající předem přes
   * `nactiZnalostiHrace`, `loadPlayerSnapshot` je synchronní. `undefined` = nenačteno,
   * prázdné pole = nic neví.
   */
  znalostiIncidentu?: RadekZnalosti[];
```
3. `description` scénáře `family_problem` nahraď za:
```ts
      "Hráč se svěřuje se starostí doma: hádka s partnerkou, rekonstrukce baráku, starosti s hospodářstvím. Žádá o pochopení, případně pauzu nebo volno na zápas.",
```
4. `description` scénáře `personal_milestone` nahraď za:
```ts
      "Hráč má v životě milník: svatba, kulaté narozeniny, povýšení v práci, dostavěný barák. Sdílí radost, možná zve trenéra na oslavu, nebo žádá volno.",
```
5. za scénář `rejected_offer` (před `];`) přidej:
```ts
  {
    // Spouští se VÝHRADNĚ z incidents/krivda.ts den po obvinění, které hráč zapřel.
    // Píše vinný i nevinný, aby se podle vlákna nedal poznat nevinný. weight 0 → nikdy náhodně.
    id: "krivde_obvineny",
    label: "Křivé obvinění",
    category: "personal",
    expectedTurns: 2,
    description:
      "Trenér tě včera obvinil z průšvihu v klubu (co se stalo, je v tvé první zprávě) a ty tvrdíš, že jsi to nebyl. Jsi dotčený a chceš, aby to trenér uznal. Když se omluví nebo ti uvěří, uklidníš se. Když tě odbude nebo si dál stojí za svým, naštveš se. Nikoho jiného neobviňuj a nic nového o tom průšvihu si nevymýšlej.",
    weight: () => 0,
  },
```

- [ ] **Step 4: Prompt**

V `apps/api/src/messaging/ai-player-chat.ts`:

1. import: `import { blokZnalosti } from "../incidents/znalosti";`
2. za rozhraní `ResolutionResult` přidej:
```ts
/**
 * Životní situace drží DB (fáze 7). Dokud hráč žádnou nemá, model si ji nesmí vymyslet:
 * porod nebo rozvod v SMS by neseděl s ničím dalším ve hře.
 */
export const ZAKAZ_ZIVOTNICH_SITUACI = "- NEVYMÝŠLEJ si narození dítěte, rozvod, ztrátu práce ani nemoc rodiče. Nic takového se ti teď neděje.";
```
3. v `buildSystemPrompt` za řádek `"- Do emoji nepatří ⚽ ani 🥅, jsi hráč, ne fanoušek.",` přidej `ZAKAZ_ZIVOTNICH_SITUACI,`
4. v `buildSystemPrompt` za položku `team.subjectPlayerName ? ... : "",` (poslední před `].filter(Boolean)`) přidej `blokZnalosti(player.znalostiIncidentu),`
5. v `evaluateResolution` řádek
```ts
    "  a) Hráč žádal o volno (rodinné důvody, zdravotní, osobní milník) A trenér mu volno SCHVÁLIL → absence_days 1-3 podle scénáře (rodinný problém 1-2, svatba 1, narození dítěte 2-3).",
```
nahraď za
```ts
    "  a) Hráč žádal o volno (rodinné důvody, zdravotní, osobní milník) A trenér mu volno SCHVÁLIL → absence_days 1-3 podle scénáře (rodinný problém 1-2, svatba 1).",
```
a za řádek `"- Buď přísný, žádné +15 zadarmo, jen za skutečně skvělé chování.",` přidej:
```ts
    "- V shrnutí NEVYMÝŠLEJ narození dítěte, rozvod, ztrátu práce ani nemoc rodiče. Nic takového se hráči teď neděje.",
```

- [ ] **Step 5: Spusť testy**

Run: `cd apps/api && npx vitest run src/messaging && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/messaging/ai-player-scenarios.ts apps/api/src/messaging/ai-player-chat.ts apps/api/src/messaging/ai-player-chat.test.ts
git commit -F - <<'EOF'
feat(incidenty): znalosti a zakaz vymyslenych situaci v promptu hrace

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 7: Znalosti na všech místech chatu

**Files:**
- Modify: `apps/api/src/messaging/ai-player-spawn.ts` (`AiThreadStateData`, `spawnForTeam`, `handleAiPlayerReplyInner`)
- Modify: `apps/api/src/messaging/coach-initiated.ts` (`startCoachThread`, `replyInSquadGroup`)
- Modify: `apps/api/src/transfers/unrest.ts` (odpověď hráče na usmiřovací akci)
- Test: `apps/api/src/messaging/coach-initiated.test.ts`

**Interfaces:**
- Consumes: `nactiZnalostiHrace` (Task 2), `temaZeStavu` (Task 3), `PlayerSnapshot.znalostiIncidentu` (Task 6), klíče `incidentId`/`incidentDen` ve stavu vlákna (Task 5).
- Produces: žádné nové exporty. Pravidla: spawn, kabina a unrest dostávají jen veřejné znalosti (bez `tema`); odpověď ve vlákně a konverzace začatá trenérem načítají téma ze stavu vlákna; `startCoachThread` téma ve stavu zachová i po uzavřené výměně.

- [ ] **Step 1: Napiš selhávající test**

`apps/api/src/messaging/coach-initiated.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ai-player-chat", () => ({
  generateCoachInitiatedReply: vi.fn(),
  generateSquadGroupReaction: vi.fn(async () => "Jasně, trenére."),
  GeminiUnavailableError: class GeminiUnavailableError extends Error {},
}));
vi.mock("./ai-player-spawn", () => ({
  loadPlayerSnapshot: vi.fn((r: Record<string, unknown>) => ({
    id: r.id, firstName: "Jan", lastName: "Svědek", temper: 50, leadership: 50, morale: 50, coachRelationship: 50,
  })),
  loadTeamContext: vi.fn(async () => ({ teamName: "TJ Dvory" })),
  pockejNezDopise: vi.fn(async () => undefined),
}));
vi.mock("../incidents/znalosti-db", () => ({ nactiZnalostiHrace: vi.fn(async () => []) }));

import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { nactiZnalostiHrace } from "../incidents/znalosti-db";
import { generateCoachInitiatedReply } from "./ai-player-chat";
import { replyInSquadGroup, startCoachThread } from "./coach-initiated";

const TEMA = { incidentId: "inc-1", incidentDen: "2026-09-16" };

function db(stav: unknown) {
  return new FalesnaD1([
    { sql: /FROM players p/, first: { id: "s" }, all: [{ id: "s" }] },
    { sql: /SELECT ai_thread_state FROM conversations/, first: { ai_thread_state: stav === null ? null : JSON.stringify(stav) } },
  ]);
}

const zacni = (d: FalesnaD1) =>
  startCoachThread(jakoD1(d), {}, { convId: "konv-1", teamId: "tym-a", playerId: "s", coachMessage: "Kdo ukradl dresy?" });
const stavVlakna = (d: FalesnaD1) =>
  d.davky.flat().find((q) => /UPDATE conversations SET ai_thread_active/.test(q.sql))?.params[1];

beforeEach(() => vi.clearAllMocks());

describe("konverzace začatá trenérem a téma incidentu", () => {
  it("načte znalosti s tématem z vlákna", async () => {
    vi.mocked(generateCoachInitiatedReply).mockResolvedValue({ body: "Nic nevím.", conversationComplete: false });
    await zacni(db(TEMA));
    expect(nactiZnalostiHrace).toHaveBeenCalledWith(expect.anything(), {
      teamId: "tym-a", playerId: "s", tema: { incidentId: "inc-1", den: "2026-09-16" },
    });
  });

  it("pokračující vlákno si téma nese dál", async () => {
    vi.mocked(generateCoachInitiatedReply).mockResolvedValue({ body: "Nic nevím.", conversationComplete: false });
    const d = db(TEMA);
    await zacni(d);
    expect(JSON.parse(String(stavVlakna(d)))).toMatchObject({ awaiting: "coach", ...TEMA });
  });

  it("uzavřená výměna téma nezahodí; bez tématu zůstane stav prázdný", async () => {
    vi.mocked(generateCoachInitiatedReply).mockResolvedValue({ body: "Nic nevím.", conversationComplete: true });
    const s = db(TEMA);
    await zacni(s);
    expect(JSON.parse(String(stavVlakna(s)))).toEqual(TEMA);
    const bez = db(null);
    await zacni(bez);
    expect(stavVlakna(bez)).toBeNull();
  });
});

describe("kabina", () => {
  it("mluvčí dostane jen veřejné znalosti", async () => {
    await replyInSquadGroup(jakoD1(db(null)), {}, { teamId: "tym-a", convId: "kabina", coachMessage: "Kdo ukradl dresy?" });
    expect(nactiZnalostiHrace).toHaveBeenCalledWith(expect.anything(), { teamId: "tym-a", playerId: "s" });
  });
});
```

- [ ] **Step 2: Spusť test, musí selhat**

Run: `cd apps/api && npx vitest run src/messaging/coach-initiated.test.ts`
Expected: FAIL (znalosti se nenačítají, téma se nezachová).

- [ ] **Step 3: `coach-initiated.ts`**

1. importy:
```ts
import { temaZeStavu } from "../incidents/tema";
import { nactiZnalostiHrace } from "../incidents/znalosti-db";
```
2. ve `startCoachThread` hned za `const player = loadPlayerSnapshot(row);`:
```ts
    // Téma incidentu z tlačítka „Zeptat se" nebo z dřívější otázky (spec 7a).
    const vlakno = await db.prepare("SELECT ai_thread_state FROM conversations WHERE id = ?")
      .bind(opts.convId).first<{ ai_thread_state: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "stav vlákna", e); return null; });
    const tema = temaZeStavu(vlakno?.ai_thread_state ?? null);
    player.znalostiIncidentu = await nactiZnalostiHrace(db, { teamId: opts.teamId, playerId: opts.playerId, tema });
```
3. sestavení `state` nahraď za:
```ts
    // Uzavřenou konverzaci NEnecháváme ve stavu „done" — frontend podle něj
    // zamyká psaní a trenér by už tomu hráči nikdy nenapsal. Stav bez `awaiting`
    // znamená „nic neběží", takže další zpráva zase založí nové vlákno.
    // Téma incidentu v něm zůstává: platí do konce herního dne (spec 7a).
    const temaVeStavu = tema ? { incidentId: tema.incidentId, incidentDen: tema.den } : null;
    const state = pokracuje
      ? {
        trigger: "coach_initiated",
        scenario_id: "coach_initiated",
        max_replies: MAX_VYMEN,
        current_replies: 1,
        awaiting: "coach",
        initiated_at: now,
        player_id: opts.playerId,
        ...(temaVeStavu ?? {}),
      }
      : temaVeStavu;
```
(původní komentář „Uzavřenou konverzaci NEnecháváme…" tím nahraď, ať nejsou dva.)
4. v `replyInSquadGroup` hned za `if (!mluvci) return false;`:
```ts
    // Před celou kabinou nikdo nic neprozradí: jen veřejné znalosti (spec 10b).
    mluvci.znalostiIncidentu = await nactiZnalostiHrace(db, { teamId: opts.teamId, playerId: mluvci.id });
```

- [ ] **Step 4: `ai-player-spawn.ts`**

1. import: `import { nactiZnalostiHrace } from "../incidents/znalosti-db";`
2. do `AiThreadStateData` za `subject_player_name?: string;`:
```ts
  /** Incident, na který se trenér ptá (spec 7a). Platí jen v herní den `incidentDen`. */
  incidentId?: string;
  incidentDen?: string;
```
3. ve `spawnForTeam` hned za blok `if (!scenario) { ... }`:
```ts
  // Hráč začíná sám, nejde o výslech: jen veřejné znalosti (spec 10b).
  player.znalostiIncidentu = await nactiZnalostiHrace(db, { teamId, playerId: player.id });
```
4. v `handleAiPlayerReplyInner` hned za `const player = loadPlayerSnapshot(playerRow);`:
```ts
  player.znalostiIncidentu = await nactiZnalostiHrace(db, {
    teamId: conv.team_id, playerId: player.id,
    tema: state.incidentId && state.incidentDen ? { incidentId: state.incidentId, den: state.incidentDen } : null,
  });
```
(Stav vlákna se dál ukládá přes `...state`, takže téma přežije další výměny beze změny.)

- [ ] **Step 5: `transfers/unrest.ts`**

Za řádek `const snapshot = loadPlayerSnapshot({ ...player, life_context: JSON.stringify(lc) });`:

```ts
    const { nactiZnalostiHrace } = await import("../incidents/znalosti-db");
    snapshot.znalostiIncidentu = await nactiZnalostiHrace(db, { teamId, playerId });
```

- [ ] **Step 6: Spusť testy**

Run: `cd apps/api && npx vitest run src/messaging src/transfers && npx tsc --noEmit`
Expected: PASS. Zapojení ve `spawnForTeam`, `handleAiPlayerReplyInner` a `unrest.ts` se ověřuje na testingu (Task 12).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/messaging/coach-initiated.ts apps/api/src/messaging/coach-initiated.test.ts apps/api/src/messaging/ai-player-spawn.ts apps/api/src/transfers/unrest.ts
git commit -F - <<'EOF'
feat(incidenty): znalosti hracu ve vsech tocich chatu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 8: SMS s odkazem na incident

**Files:**
- Modify: `apps/api/src/messaging/system-sms.ts` (`sendSystemSMS`, `sendPlayerSMS`)
- Modify: `apps/api/src/incidents/incident-db.ts` (`smsIncidentu`)
- Modify: `apps/api/src/incidents/dopady.ts`, `apps/api/src/incidents/akce.ts`, `apps/api/src/incidents/vysetrovani-den.ts`
- Test: `apps/api/src/messaging/system-sms.test.ts`, úpravy `akce-obvineni.test.ts`, `vysetrovani-den.test.ts`

**Interfaces:**
- Produces:
  - `sendSystemSMS(db, teamId, roleTitle, body, metadata?: Record<string, unknown>): Promise<void>`
  - `sendPlayerSMS(db, teamId, player, body, metadata?: Record<string, unknown>): Promise<string>`
  - `smsIncidentu(incidentId: string): { type: "incident"; incidentId: string }` v `incident-db.ts`
  - Frontend (Task 10) pozná zprávu podle `metadata.type === "incident"` a `metadata.incidentId`.

- [ ] **Step 1: Napiš selhávající testy**

`apps/api/src/messaging/system-sms.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("./ai-player-spawn", () => ({ getOrCreatePlayerConversation: vi.fn(async () => "konv-1") }));

import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { sendPlayerSMS, sendSystemSMS } from "./system-sms";

const ODKAZ = { type: "incident", incidentId: "inc-1" };

describe("SMS s daty pro telefon", () => {
  it("systémová zpráva uloží metadata jako JSON, bez nich NULL", async () => {
    const db = new FalesnaD1([{ sql: /SELECT id FROM conversations/, first: { id: "konv-k" } }]);
    await sendSystemSMS(jakoD1(db), "tym-a", "Kustod", "Zmizely dresy.", ODKAZ);
    await sendSystemSMS(jakoD1(db), "tym-a", "Kustod", "Nic.");
    const vlozene = db.dotazy.filter((d) => /INSERT INTO messages/.test(d.sql));
    expect(vlozene[0].params[4]).toBe(JSON.stringify(ODKAZ));
    expect(vlozene[1].params[4]).toBeNull();
  });

  it("zpráva od hráče taky", async () => {
    const db = new FalesnaD1();
    await sendPlayerSMS(jakoD1(db), "tym-a", { id: "a", firstName: "Adam", lastName: "Kos" }, "Já to nebyl.", ODKAZ);
    const vlozena = db.dotazy.find((d) => /INSERT INTO messages/.test(d.sql));
    expect(vlozena?.params[5]).toBe(JSON.stringify(ODKAZ));
  });
});
```

V `apps/api/src/incidents/akce-obvineni.test.ts`:
- řádek `expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", SMS_ROLE_POLICIE, expect.any(String));` změň na `expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", SMS_ROLE_POLICIE, expect.any(String), { type: "incident", incidentId: "inc-1" });`
- v prvním testu („nevinný hráč…") za `expect(sendPlayerSMS).toHaveBeenCalledTimes(1);` přidej `expect(vi.mocked(sendPlayerSMS).mock.calls[0][4]).toEqual({ type: "incident", incidentId: "inc-1" });`

V `apps/api/src/incidents/vysetrovani-den.test.ts` v testu „udání: soud dá podmínku a incident se uzavře" přidej za `expect(vi.mocked(sendSystemSMS).mock.calls[0][3]).toContain("Pepa Průšvih");` řádek `expect(vi.mocked(sendSystemSMS).mock.calls[0][4]).toEqual({ type: "incident", incidentId: "inc-1" });`

- [ ] **Step 2: Spusť testy, musí selhat**

Run: `cd apps/api && npx vitest run src/messaging/system-sms.test.ts src/incidents/akce-obvineni.test.ts src/incidents/vysetrovani-den.test.ts`
Expected: FAIL.

- [ ] **Step 3: `system-sms.ts`**

`sendSystemSMS`: přidej parametr za `body: string,`:
```ts
  /** Data zprávy pro telefon, např. `{ type: "incident", incidentId }` pro tlačítko „Otevřít incident". */
  metadata?: Record<string, unknown>,
```
a INSERT zprávy změň na:
```ts
  await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at) VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    .bind(crypto.randomUUID(), convId, roleTitle, body, metadata ? JSON.stringify(metadata) : null).run().catch((e) => logger.warn({ module: "system-sms" }, "insert system msg", e));
```

`sendPlayerSMS`: stejný parametr `metadata?: Record<string, unknown>` za `body: string,` a INSERT:
```ts
  await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES (?, ?, 'player', ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    .bind(crypto.randomUUID(), convId, player.id, `${player.firstName} ${player.lastName}`, body, metadata ? JSON.stringify(metadata) : null).run()
    .catch((e) => logger.warn({ module: "system-sms" }, "insert player msg", e));
```

- [ ] **Step 4: `smsIncidentu` a volání**

Do `apps/api/src/incidents/incident-db.ts` za `pozdejsi`:
```ts
/** Data SMS o incidentu: telefon podle nich ukáže tlačítko „Otevřít incident" (spec 11). */
export function smsIncidentu(incidentId: string): { type: "incident"; incidentId: string } {
  return { type: "incident", incidentId };
}
```

Pátý argument `smsIncidentu(<id>)` přidej ke všem SMS incidentů:
- `dopady.ts` `oznamIncident`: `sendSystemSMS(env.DB, teamId, SMS_ROLE_KUSTOD, ..., smsIncidentu(zapsany.id))`
- `dopady.ts` `uzavriProsleIncidenty`: `RETURNING kind, category, culprit_revealed` → `RETURNING id, kind, category, culprit_revealed`, typ řádku a prázdný výsledek v `.catch` rozšiř o `id: string`, a `sendSystemSMS(db, t.teamId, SMS_ROLE_KUSTOD, vypln(sablona, { nazev }), smsIncidentu(r.id))`
- `akce.ts` `obvinHrace`: `sendPlayerSMS(db, teamId, {...}, text(rng, klic), smsIncidentu(incidentId))`
- `akce.ts` `zavolejPolicii`: `sendSystemSMS(db, teamId, SMS_ROLE_POLICIE, ..., smsIncidentu(incidentId))`
- `akce.ts` `rozhodni` (udání): `sendSystemSMS(db, teamId, SMS_ROLE_POLICIE, ..., smsIncidentu(incidentId))`
- `akce.ts` `rozhodni` (SMS po trestu): `sendPlayerSMS(db, teamId, sms, text(rng, SMS_TRESTU[akce]), smsIncidentu(incidentId))`
- `vysetrovani-den.ts` `oznamVysledek`: `sendSystemSMS(env.DB, teamId, SMS_ROLE_POLICIE, `🚓 ${zprava}`, smsIncidentu(incidentId))`

Import `smsIncidentu` z `./incident-db` do každého z těch souborů (`dopady.ts` ho zatím z `incident-db` nic neimportuje, přidej nový import).

- [ ] **Step 5: Spusť testy**

Run: `cd apps/api && npx vitest run src/incidents src/messaging && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/messaging/system-sms.ts apps/api/src/messaging/system-sms.test.ts apps/api/src/incidents/incident-db.ts apps/api/src/incidents/dopady.ts apps/api/src/incidents/akce.ts apps/api/src/incidents/vysetrovani-den.ts apps/api/src/incidents/akce-obvineni.test.ts apps/api/src/incidents/vysetrovani-den.test.ts
git commit -F - <<'EOF'
feat(incidenty): SMS o incidentu nesou odkaz na incident

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 9: Křivda den po obvinění

**Files:**
- Modify: `apps/api/src/incidents/texty.ts` (`krivda_obvineny`)
- Create: `apps/api/src/incidents/krivda.ts`
- Modify: `apps/api/src/incidents/denni-krok.ts`
- Modify: `apps/api/src/routes/incidents.ts` (admin `vysetrovani`, volba `krivdy`)
- Test: `apps/api/src/incidents/krivda.test.ts`

**Interfaces:**
- Consumes: `nactiObvineni` (`vysetrovani.ts`), `denPlus` (`absence-hracu.ts`), `OKNO_VLIVU_DNI`, `nazevIncidentu`, `smsIncidentu` (Task 8), `sendPlayerSMS` s metadata (Task 8), `getOrCreatePlayerConversation`, `isAiEnabled` (`lib/ai-provider`), scénář `krivde_obvineny` (Task 6).
- Produces:
  - `ozviSeObvineni(env: Bindings, t: { teamId: string; gameDate: string; seasonNumber: number }, opts?: { denObvineni?: string }): Promise<number>` — počet otevřených vláken; `denObvineni` (`YYYY-MM-DD`) výchozí včerejšek
  - admin `POST /api/admin/incidents/vysetrovani` přijme `krivdy: true` (ozvání pro dnešní obvinění) a vrátí `krivdy: number`

- [ ] **Step 1: Text**

Do `TEXTY` v `apps/api/src/incidents/texty.ts` (za `stopa_priznani_vyslech`):

```ts
  krivda_obvineny: [
    "Trenére, pořád mi leží v hlavě to obvinění: {nazev}. Já to nebyl.",
    "Ještě k tomu obvinění, trenére: {nazev}. Mrzí mě, že si to o mně myslíte.",
    "Trenére, kvůli tomu obvinění jsem v noci nespal: {nazev}. Fakt jsem to nebyl já.",
  ],
```

- [ ] **Step 2: Napiš selhávající test**

`apps/api/src/incidents/krivda.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/ai-provider", () => ({ isAiEnabled: vi.fn(async () => true) }));
vi.mock("../messaging/ai-player-spawn", () => ({ getOrCreatePlayerConversation: vi.fn(async () => "konv-1") }));
vi.mock("../messaging/system-sms", () => ({ sendPlayerSMS: vi.fn(async () => "konv-1"), sendSystemSMS: vi.fn() }));

import type { Bindings } from "../index";
import { isAiEnabled } from "../lib/ai-provider";
import { sendPlayerSMS } from "../messaging/system-sms";
import { nazevIncidentu } from "./katalog";
import { ozviSeObvineni } from "./krivda";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";

const DNES = "2026-09-16T16:00:00.000Z";
const T = { teamId: "tym-a", gameDate: DNES, seasonNumber: 4 };

function prostredi(obvineni: unknown[], dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /FROM club_incidents/, all: [{ id: "inc-1", kind: "vloupani_sklad", accused: JSON.stringify(obvineni) }] },
    { sql: /FROM players/, first: { id: "a", first_name: "Adam", last_name: "Kos", nickname: null, avatar: "{}" } },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

const obvineni = (den: string, vysledek = "zapira") => ({ playerId: "a", jmeno: "Adam Kos", den, vysledek });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAiEnabled).mockResolvedValue(true);
});

describe("den po obvinění", () => {
  it("kdo včera zapíral, napíše trenérovi a otevře se vlákno křivdy", async () => {
    const { db, env } = prostredi([obvineni("2026-09-15")]);
    expect(await ozviSeObvineni(env, T)).toBe(1);
    const vlakno = db.dotazy.find((d) => /UPDATE conversations SET ai_thread_active = 1/.test(d.sql));
    expect(JSON.parse(String(vlakno?.params[1]))).toMatchObject({ scenario_id: "krivde_obvineny", awaiting: "coach", player_id: "a", max_replies: 2 });
    expect(sendPlayerSMS).toHaveBeenCalledWith(
      expect.anything(), "tym-a", expect.objectContaining({ id: "a" }),
      expect.stringContaining(nazevIncidentu("vloupani_sklad")), { type: "incident", incidentId: "inc-1" },
    );
  });

  it("hledá obvinění jen v aktuální sezóně a oknu 45 dní", async () => {
    const { db, env } = prostredi([]);
    await ozviSeObvineni(env, T);
    expect(db.dotazy.find((d) => /FROM club_incidents/.test(d.sql))?.params).toEqual(["tym-a", 4, "2026-08-02T16:00:00.000Z"]);
  });

  it("dnešní obvinění, přiznání a usvědčení se neozvou", async () => {
    const { env } = prostredi([obvineni("2026-09-16"), obvineni("2026-09-15", "priznal"), obvineni("2026-09-15", "usvedcen")]);
    expect(await ozviSeObvineni(env, T)).toBe(0);
    expect(sendPlayerSMS).not.toHaveBeenCalled();
  });

  it("běžící rozhovor se nepřebíjí", async () => {
    const { env } = prostredi([obvineni("2026-09-15")], [{ sql: /UPDATE conversations SET ai_thread_active = 1/, changes: 0 }]);
    expect(await ozviSeObvineni(env, T)).toBe(0);
    expect(sendPlayerSMS).not.toHaveBeenCalled();
  });

  it("hráč, který už v kádru není, se neozve", async () => {
    const { env } = prostredi([obvineni("2026-09-15")], [{ sql: /FROM players/, first: null }]);
    expect(await ozviSeObvineni(env, T)).toBe(0);
  });

  it("bez generování textu se nic neotevře ani nečte", async () => {
    vi.mocked(isAiEnabled).mockResolvedValue(false);
    const { db, env } = prostredi([obvineni("2026-09-15")]);
    expect(await ozviSeObvineni(env, T)).toBe(0);
    expect(db.dotazy).toHaveLength(0);
  });

  it("admin může ozvání spustit pro dnešní obvinění", async () => {
    const { env } = prostredi([obvineni("2026-09-16")]);
    expect(await ozviSeObvineni(env, T, { denObvineni: "2026-09-16" })).toBe(1);
  });
});
```

- [ ] **Step 3: Spusť test, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/krivda.test.ts`
Expected: FAIL, modul `./krivda` neexistuje.

- [ ] **Step 4: `krivda.ts`**

```ts
/**
 * Den po obvinění, které hráč zapřel, se hráč ozve trenérovi sám (spec 17d,
 * vynucený scénář `krivde_obvineny`).
 *
 * Ozve se každý, kdo zapíral, vinný i nevinný. Kdyby psali jen nevinní, manažer
 * by podle toho poznal, koho obvinil neprávem, a zúžil by si podezřelé.
 */

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { isAiEnabled } from "../lib/ai-provider";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { getOrCreatePlayerConversation } from "../messaging/ai-player-spawn";
import { sendPlayerSMS } from "../messaging/system-sms";
import { denPlus } from "./absence-hracu";
import { smsIncidentu } from "./incident-db";
import { nazevIncidentu } from "./katalog";
import { OKNO_VLIVU_DNI } from "./nastaveni";
import { text } from "./texty";
import { nactiObvineni } from "./vysetrovani";

const M = "incidents-krivda";

type RadekIncidentu = { id: string; kind: string; accused: string };
type RadekHrace = { id: string; first_name: string; last_name: string; nickname: string | null; avatar: string | null };

export async function ozviSeObvineni(
  env: Bindings, t: { teamId: string; gameDate: string; seasonNumber: number }, opts: { denObvineni?: string } = {},
): Promise<number> {
  // Bez modelu by hráč napsal a na odpověď trenéra už by nikdo nereagoval.
  if (!(await isAiEnabled(env))) return 0;
  const db = env.DB;
  const den = opts.denObvineni ?? denPlus(t.gameDate, -1);

  const rows = await db.prepare(
    `SELECT id, kind, accused FROM club_incidents
      WHERE team_id = ? AND season_number = ? AND accusations > 0 AND game_date >= ?`,
  ).bind(t.teamId, t.seasonNumber, gameExpiry(t.gameDate, -OKNO_VLIVU_DNI)).all<RadekIncidentu>()
    .catch((e) => { logger.warn({ module: M }, `obvinění ${t.teamId}`, e); return null; });

  let ozvalo = 0;
  for (const inc of rows?.results ?? []) {
    for (const o of nactiObvineni(inc.accused)) {
      if (o.den !== den || o.vysledek !== "zapira") continue;
      if (await otevriKrivdu(db, t.teamId, inc, o.playerId)) ozvalo++;
    }
  }
  return ozvalo;
}

async function otevriKrivdu(db: D1Database, teamId: string, inc: RadekIncidentu, playerId: string): Promise<boolean> {
  const hrac = await db.prepare(
    `SELECT id, first_name, last_name, nickname, avatar FROM players
      WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')`,
  ).bind(playerId, teamId).first<RadekHrace>()
    .catch((e) => { logger.warn({ module: M }, `obviněný hráč ${playerId}`, e); return null; });
  if (!hrac) return false;

  const ref = { id: hrac.id, firstName: hrac.first_name, lastName: hrac.last_name, nickname: hrac.nickname, avatar: hrac.avatar };
  const convId = await getOrCreatePlayerConversation(db, teamId, ref)
    .catch((e) => { logger.warn({ module: M }, `konverzace s obviněným ${playerId}`, e); return null; });
  if (!convId) return false;

  // Běžící rozhovor se nepřebíjí. Vlákno se zabírá dřív, než hráč napíše.
  const ted = new Date().toISOString();
  const narok = await db.prepare(
    `UPDATE conversations SET ai_thread_active = 1, ai_thread_last_at = ?, ai_thread_state = ?
      WHERE id = ? AND ai_thread_active != 1`,
  ).bind(ted, JSON.stringify({
    trigger: "krivde_obvineny", scenario_id: "krivde_obvineny", max_replies: 2, current_replies: 0,
    awaiting: "coach", initiated_at: ted, player_id: playerId, resolution: null,
  }), convId).run()
    .catch((e) => { logger.warn({ module: M }, `vlákno křivdy ${convId}`, e); return null; });
  if ((narok?.meta?.changes ?? 0) === 0) return false;

  const rng = createRng(seedFromString(`krivda|${inc.id}|${playerId}`));
  await sendPlayerSMS(db, teamId, ref, text(rng, "krivda_obvineny", { nazev: nazevIncidentu(inc.kind) }), smsIncidentu(inc.id))
    .catch((e) => logger.warn({ module: M }, `SMS křivdy ${inc.id}`, e));
  return true;
}
```

- [ ] **Step 5: Denní krok a admin**

V `apps/api/src/incidents/denni-krok.ts` přidej `import { ozviSeObvineni } from "./krivda";` a za volání `await zpracujVysetrovani(...)`:

```ts
  // Den po zapřeném obvinění se hráč ozve sám (spec 17d).
  await ozviSeObvineni(env, { teamId, gameDate, seasonNumber: sezona.number })
    .catch((e) => logger.warn({ module: M, teamId }, "ozvání obviněných", e));
```

V `apps/api/src/routes/incidents.ts`, route `POST /admin/incidents/vysetrovani`:
1. import `import { ozviSeObvineni } from "../incidents/krivda";`
2. typ těla `{ teamId?: string; policieTed?: boolean; srazky?: boolean; krivdy?: boolean }`
3. komentář nad route doplň o větu „`krivdy` otevře vlákna křivdy pro dnešní obvinění (jinak až další den)."
4. závěr route nahraď za:
```ts
  const t = { teamId: team.id, gameDate: team.game_date, seasonNumber: sezona.number };
  const vysledek = await zpracujVysetrovani(c.env, t, { pondeli: !!body.srazky });
  const krivdy = body.krivdy ? await ozviSeObvineni(c.env, t, { denObvineni: team.game_date.slice(0, 10) }) : 0;
  return c.json({ ok: true, ...vysledek, krivdy });
```

- [ ] **Step 6: Spusť testy**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/incidents/texty.ts apps/api/src/incidents/krivda.ts apps/api/src/incidents/krivda.test.ts apps/api/src/incidents/denni-krok.ts apps/api/src/routes/incidents.ts
git commit -F - <<'EOF'
feat(incidenty): obvineny se den po obvineni ozve trenerovi

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 10: Frontend

**Files:**
- Modify: `apps/web/src/app/dashboard/incidenty/typy.ts`
- Modify: `apps/web/src/app/dashboard/incidenty/DetailIncidentu.tsx`
- Modify: `apps/web/src/app/dashboard/phone/[id]/page.tsx`

**Interfaces:**
- Consumes (Task 5, 8): `akce.zeptat`, `POST /api/teams/:teamId/incidents/:id/zeptat {playerId}` → `{ conversationId }`; `message.metadata = { type: "incident", incidentId }`.

- [ ] **Step 1: Typ**

V `typy.ts` v `DetailIncidentuData` změň `akce` na:
```ts
  akce: { obvinit: boolean; policie: boolean; zeptat: boolean; tresty: AkceTrestu[] };
```

- [ ] **Step 2: Akce „Zeptat se" v detailu**

V `DetailIncidentu.tsx`:
1. import `import { useRouter } from "next/navigation";`
2. mezi ostatní `useState` přidej `const [tazanyId, setTazanyId] = useState("");` a `const router = useRouter();` (hooky musí zůstat před prvním `return`).
3. `const maAkce = ...` změň na `const maAkce = akce.obvinit || akce.policie || akce.zeptat || akce.tresty.length > 0;`
4. za funkci `obvinit()` přidej:
```tsx
  async function zeptatSe() {
    setPracuje(true);
    setZprava(null);
    try {
      const o = await apiFetch<{ conversationId: string }>(`${cesta}/zeptat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: tazanyId }),
      });
      router.push(`/dashboard/phone/${o.conversationId}`);
    } catch (e) {
      console.error("incident zeptat:", e);
      setZprava({ typ: "chyba", text: e instanceof Error ? e.message : "Konverzaci se nepodařilo otevřít." });
      setPracuje(false);
    }
  }
```
5. v bloku `{maAkce && (<div className="border-t ...">` vlož jako první dítě (před `{akce.obvinit && (`):
```tsx
          {akce.zeptat && (
            <div className="space-y-2">
              <SectionLabel>Zeptat se hráče</SectionLabel>
              <p className="text-sm text-muted">
                Napiš hráči, jestli něco neviděl. Co ví, řekne, jen když bude chtít, a kamarád pachatele ho spíš bude krýt. Odpověď stojí kredit jako každá SMS.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={tazanyId}
                  onChange={(e) => setTazanyId(e.target.value)}
                  aria-label="Koho se zeptat"
                  className="flex-1 min-w-0 rounded-soft border border-gray-200 bg-white px-3 py-2 text-base"
                >
                  <option value="">Vyber hráče</option>
                  {detail.kadr.map((h) => <option key={h.playerId} value={h.playerId}>{h.jmeno}</option>)}
                </select>
                <button
                  onClick={() => void zeptatSe()}
                  disabled={pracuje || !tazanyId}
                  className="px-4 py-2 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white disabled:opacity-50"
                >
                  Zeptat se
                </button>
              </div>
            </div>
          )}
```

- [ ] **Step 3: Tlačítko v telefonu**

V `apps/web/src/app/dashboard/phone/[id]/page.tsx` hned za blok odkazu „Otevřít rozhovor" (`msg.metadata?.type === "interview_request" && ...`) přidej:
```tsx
                          {/* SMS o incidentu (Kustod, policie, hráč) vede na detail incidentu. */}
                          {msg.metadata?.type === "incident" && typeof msg.metadata.incidentId === "string" && (
                            <Link
                              href={`/dashboard/incidenty?id=${encodeURIComponent(msg.metadata.incidentId)}`}
                              className="block mt-1.5 text-center rounded-xl bg-ink text-surface px-3 py-1.5 text-sm font-heading font-bold"
                            >
                              Otevřít incident
                            </Link>
                          )}
```

- [ ] **Step 4: Typecheck a build**

Run: `cd apps/web && npx tsc --noEmit && npx next build --no-lint`
Expected: bez chyb.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/incidenty/typy.ts apps/web/src/app/dashboard/incidenty/DetailIncidentu.tsx "apps/web/src/app/dashboard/phone/[id]/page.tsx"
git commit -F - <<'EOF'
feat(incidenty): zeptat se hrace a odkaz na incident v telefonu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 11: Spec podle fáze 4

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-incidenty-design.md`

- [ ] **Step 1: Odchylky**

Každou odchylku z tabulky „Odchylky od specu" tohoto plánu (`docs/superpowers/plans/2026-09-17-incidenty-faze-4.md`) zapiš na své místo: 7a (téma z textu uložené do vlákna, jen nevyřešené incidenty, hráč s víc rolemi, ochota svědka), 7b (SMS po obvinění zůstává šablona, s odkazem na Část 15), 10a (`until` a platnost při čtení), 10b (3 incidenty, prázdné vs. nenačtené znalosti, podoba veřejného řádku a pokyny), 11 (telefon a metadata SMS), 17c (`posunVztah` a jeho signatura, rivalita po zradě), 17d (křivda pro každého, kdo zapřel; pravidlo životních situací pro všechny do fáze 7; co přechází do fází 6, 7, 8, 9 a 10). Ověř hodnoty proti kódu (`incidents/nastaveni.ts`, `incidents/znalosti.ts`, `incidents/vyslech.ts`, `incidents/tema.ts`, `incidents/krivda.ts`).

- [ ] **Step 2: Pořadí implementace (Část 16)**

Za bod 4 doplň „(hotovo na testingu, plán `docs/superpowers/plans/2026-09-17-incidenty-faze-4.md`)".

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-16-incidenty-design.md
git commit -F - <<'EOF'
docs(incidenty): spec podle faze 4 znalosti a chat

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 12: Nasazení na testing a ověření (controller)

Tenhle task dělá controller, ne subagent: pushuje, zapisuje do testovací DB, přepíná `ai_provider` a ověřuje v prohlížeči.

- [ ] **Step 1: Celá sada testů a build**

```bash
cd apps/api && npx vitest run && npx tsc --noEmit
cd ../web && npx tsc --noEmit && npx next build --no-lint
```

- [ ] **Step 2: Push a CI**

Migrace se nedělá. `git push origin testing`, počkat na `conclusion: success` běhu pro pushnutý commit.

- [ ] **Step 3: Scénář (testovací klub FK Duplex Břevnov, existující session, heslo nezadávat)**

1. Najít v kádru hráče se silným kamarádským vztahem (`relationships`, typ z `KAMARADSKE_VZTAHY`, síla ≥ 40) a vynutit krádež s ním jako pachatelem (`POST /api/admin/incidents/force` s `playerId`, zabezpečení 0, ať ho kamera neodhalí). DB: `club_incident_knowledge` má `kadr` pro celý aktivní kádr, `pachatel` pro něj a `kamarad` pro kamaráda; `club_incident_clues` má nenalezenou stopu `kamarad`.
2. Dočasně `ai_provider = workers-ai` (`POST /api/admin/ai-provider?provider=workers-ai`).
3. MCP: detail incidentu → „Zeptat se" → kamarád → telefon se otevře. DB: `conversations.ai_thread_state` má `incidentId` a `incidentDen`. Napsat „Nevíš, kdo vykradl sklad?" → odpověď přijde; DB: `interrogation` uložený, podle výsledku stopa `found = 1` a změna vztahu. Druhá otázka nezmění `interrogation` ani `interrogated_on`.
4. Jinému hráči (bez tajné role) napsat volně „Kdo ukradl dresy?" bez tlačítka: téma se uloží do vlákna, žádný řádek `interrogation` nevznikne, odpověď hráče nikoho nejmenuje.
5. Pachateli napsat otázku: `interrogation` = `zapira` nebo `priznal`; při přiznání `culprit_revealed = 1`, stopa `priznani`, detail ukáže pachatele a tresty.
6. Zpráva do kabiny s otázkou na krádež: odpověď bez tajných informací, žádný nový `interrogation`.
7. Obvinit nevinného hráče na jiném incidentu → `POST /api/admin/incidents/vysetrovani {teamId, krivdy: true}` → `krivdy: 1`, v telefonu SMS od hráče s tlačítkem „Otevřít incident" a aktivní vlákno `krivde_obvineny`; odpovědět a ověřit uzavření vlákna.
8. SMS Kustoda o novém incidentu má tlačítko „Otevřít incident" a vede na detail.
9. Mobil 400 px (vložený rámec jako ve fázi 2): výběr hráče a tlačítko „Zeptat se" bez přetečení.
10. Vrátit `ai_provider = off` a ověřit (`GET` přepínače). Uklidit testovací incidenty jako ve fázi 3 (vrátit ukradené vybavení).

- [ ] **Step 4: Paměť**

Do `project_prod_deploy_pending.md` doplnit: incidenty fáze 4 na testingu (bez migrace, závisí na 0204–0206); co zůstalo neověřené.

✋ **STOP.** Na produkci nic bez výslovného „nasaď na main".

---

## Co zůstává na další fáze

| Fáze | Navazuje na fázi 4 |
|---|---|
| 6 Hospoda | role `drb`, `drby_o_incidentu` nastaví `interrogation = prozradil` a najde stopu `hospoda` |
| 7 Peníze a životní situace | `zadost_o_zalohu`, domácnost při rozvodu, vyšší váha hráče se situací v `pickPlayerWeighted`, zákaz vymýšlet situace jen pro hráče bez situace |
| 8 Obec | starosta v zmeškaných hovorech |
| 9 Tisk, fanoušci, sponzoři | `novinar_skandal` a sponzor v zmeškaných hovorech |
| 10 Zaměstnanci | psycholog (role `obvineny`), správce, šéf fanklubu, obsluha |
