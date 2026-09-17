# Incidenty v klubu, fáze 7a (Životní situace a záloha) — implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hráči začnou mít život i mimo hřiště: dluhy, ztráta práce, rozvod, zabavený řidičák, svatba spoluhráče, narození dítěte a nemocný rodič. Situace běží pár týdnů, mění morálku, docházku na trénink i zápas, výmluvy a chování v hospodě, a u dluhů hráč napíše trenérovi o zálohu, kterou trenér půjčí (se splátkami ze mzdy), nebo odmítne.

**Architecture:** Životní situace jsou řádky `club_incidents` se stavem `probiha`, `subject_player_id` a `ends_on` — žádná nová tabulka ani migrace. Čistý katalog a los v `incidents/situace.ts`, zápis, ukončení a záloha v `incidents/situace-db.ts`, obojí volané z denního kroku. Existující háčky (absence, trénink, zápas, chat, hospoda) dostanou aktivní situace přes `incidents/absence-hracu.ts: druhyHracu`, kam k `obvineny`/`pachatel` přibudou druhy situací.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, D1, Vitest, Next.js 15

**Spec:** `docs/superpowers/specs/2026-09-16-incidenty-design.md` (Části 4c životní situace, 4e četnost, 5a váha pachatele, 6b krok 4 a 7, 7c záloha, 7e lhůta, 9 hospoda, 10a znalosti, 17a absence, 17b trénink, 17c zápas, 17d chat)

## Global Constraints

- **Branch:** `testing`. Push dělá až controller v posledním tasku. Push na `main` je zakázaný bez výslovného souhlasu uživatele.
- **UI a texty pro hráče česky**, s diakritikou, minimálně `text-sm`, jména `text-base` a klikatelná, ceny nikdy v tlačítkách (jen v info řádku), mobile-first, do tabulek nepřidávat sloupce, žádné `confirm()`/`alert()` prohlížeče.
- **V textech pro hráče nikdy dlouhá pomlčka „—".** Jméno jen v 1. pádě jako podmět nebo za dvojtečkou. Každá šablona v `TEXTY` končí tečkou nebo vykřičníkem (hlídá `texty.test.ts`). Pooly vět, které hráč vidí opakovaně (výmluvy, příhody), mají aspoň 5 variant.
- **Žádný prázdný catch.** Server `logger.warn({ module: "xyz" }, "popis", e)` nebo `logger.error`, klient `console.error("popis:", e)`.
- **Životní situace nejsou průšvih:** nemají pachatele, stopy ani vyšetřování. `culprit_type` zůstává `null`, `culprit_revealed` 0, kategorie `zivotni`, stav `probiha`.
- **Determinismus a idempotence:** los situace `createRng(seedFromString("situace|" + teamId + "|" + den))`, záloha `createRng(seedFromString("zaloha|" + incidentId))`. Zápisy `INSERT OR IGNORE` s deterministickým id, přechody stavů hlídaným `UPDATE … WHERE status = …` s kontrolou `meta.changes`.
- **Los omluvenek se nesmí rozejít:** vstup do `generateAbsences` skládá jen `hracProAbsenci` a všech šest volajících ho předává stejně. Nové modifikátory smí přibýt jen uvnitř `generateAbsences`, nikdy filtrováním kádru před losem.
- **Žádné nové volání modelu mimo existující toky chatu** (spec Část 15): situace se ohlašují šablonovou SMS, vlákno `zadost_o_zalohu` je existující tok `ai-player-spawn`.
- **Názvy sloupců do SQL jen z konstant**, parametry jen `?`.
- **Testy:** `cd apps/api && npx vitest run <cesta>`. **Typecheck:** `cd apps/api && npx tsc --noEmit`, FE `cd apps/web && npx tsc --noEmit`.
- **Commit** po každém tasku: `git add <soubory> && git commit -F - <<'EOF'` se zprávou a posledním řádkem `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Nikdy `git add -A`, nikdy `git stash`.
- **Migrace:** žádná. Stav `probiha`, kategorie `zivotni`, `subject_player_id` i `ends_on` jsou v migraci 0204, `club_incident_absences.kind` je volný text (0206).

---

## Odchylky od specu (zapsat do specu v Tasku 10)

| Místo ve specu | Plán | Proč |
|---|---|---|
| 16, bod 7 | fáze 7 rozdělená na **7a** (životní situace, dluhy a záloha, háčky do absencí, tréninku, zápasu, chatu a hospody) a **7b** (peněžní krádeže: kasa, tombola, zpronevěra ekonoma, útěk s penězi, `utraci_za_rundy`) | útěk s penězi stojí na situaci `dluhy`, takže situace musí být dřív; jedna fáze by byla nad rozumnou velikost |
| 4c | situace je řádek `club_incidents` (`status = 'probiha'`, `category = 'zivotni'`, `subject_player_id`, `ends_on`), bez pachatele a stop | spec 3 s tím počítá, žádná migrace není potřeba |
| 4c `dluhy` | `deadline` = vznik + 7 dní je lhůta **na zálohu**, `ends_on` konec situace; po lhůtě se záloha počítá za odmítnutou, situace běží dál | 7e mluví o lhůtě zvlášť od trvání situace |
| 7c záloha | částka 3 000–8 000 Kč deterministicky ze seedu; splátky přes `resolution_data {celkem, tydnuZbyva}` a existující pondělní `zauctujSrazky`, které nově bere i `resolution = 'zaloha'` (popis „Splátka zálohy") | jeden mechanismus splátek místo dvou |
| 10a znalosti u situací | všichni v kádru dostanou `kadr` s veřejným textem, dotčený hráč navíc `pachatel` s vlastním textem v první osobě a vlastním pokynem do promptu | jiná role pro „ví o sobě" v CHECK není; role `pachatel` je tajná, takže text v 1. osobě nikam neuteče |
| 17a absence | `dluhy` +0,05 a vlastní pool výmluv (brigáda), `zabaveny_ridicak` +0,12 jen na venkovním zápase a jen bez klubové dodávky, `prisel_o_praci` bez profesních výmluv a vlastní pool; `rozvod` šanci na zápas nemění | spec u rozvodu mluví jen o tréninku, u řidičáku výslovně o venkovních zápasech a dodávce |
| 17a kolizní výmluvy | „Manželka rodí! Ne teď, ale prý co kdyby" a „Nemůže, řídil opilý a vzali mu řidičák" z obecných poolů pryč | spec 17a to ukládá na fázi 7; teď existují skutečné situace |
| 17b trénink | `prisel_o_praci` +0,15, `rozvod` +0,15, `dluhy` −0,15 v docházce, stejná čísla v náhledu tréninku | spec 4c i 17b |
| 17c zápas | `rozvod` morálka −5 a konzistence −5, `narozeni_ditete` morálka +5, obojí jen v paměti pro ten zápas (stejně jako obvinění) | spec říká „přibude ve fázi 7", čísla neuvádí |
| 17d chat | `PlayerSnapshot.zivotniSituace`, hráč se situací má +2 k váze výběru, zákaz vymýšlet situace platí jen pro hráče **bez** situace, `family_problem` a `personal_milestone` dostanou popis podle situace, `domacnost` při rozvodu jinou větu | spec 17d |
| 9 hospoda | `pije_na_sekeru` (dluhy, 50 %, jen text a varování), rozvod ×1,5 šance na návštěvu hospody, ohlásit čin smí i hráč s odmítnutou zálohou | spec Část 9; `utraci_za_rundy` čeká na peněžní incidenty ve fázi 7b |
| 5a váha pachatele | aktivní `dluhy` +2,0, k tomu odmítnutá záloha +1,5 | spec 5a |
| 4e | denní šance nové situace 3 %, max. 2 aktivní na tým, 1 na hráče, cooldown typu 21 dní, nový klub až po 3 odehraných zápasech | spec 4e |
| ověření | admin `POST /api/admin/incidents/force` přijme i situace (`kind` z katalogu situací) a nový `POST /api/admin/incidents/situace` `{teamId, ukoncitTed?: boolean}` ukončí běžící situace hned | jinak by se na testingu čekalo 21 až 35 dní |

---

## Struktura souborů

| Soubor | Odpovědnost |
|---|---|
| `apps/api/src/incidents/nastaveni.ts` | konstanty situací, zálohy a modifikátorů |
| `apps/api/src/incidents/texty.ts` | veřejné texty situací, SMS hráče, znalosti, výmluvy zálohy |
| `apps/api/src/incidents/typy.ts` | `NavrhIncidentu` o `subjectPlayerId` a `dniTrvani`, `HracKlubu` o věk, dluhy a odmítnutou zálohu |
| `apps/api/src/incidents/situace.ts` 🆕 | čistý katalog situací, podmínky, los, dopady na morálku |
| `apps/api/src/incidents/situace-db.ts` 🆕 | zápis situace, ukončení, žádost o zálohu, rozhodnutí o záloze, propadlá lhůta |
| `apps/api/src/incidents/stav-klubu.ts` | věk hráče, rozpočet, aktivní situace, odmítnuté zálohy |
| `apps/api/src/incidents/dopady.ts` | zápis `subject_player_id` a `ends_on` |
| `apps/api/src/incidents/pachatel.ts` | váha pachatele o dluhy a odmítnutou zálohu |
| `apps/api/src/incidents/absence-hracu.ts` | druhy vlivu o situace, důvody na trénink |
| `apps/api/src/incidents/denni-krok.ts` | ukončení situací, los situace, propadlá lhůta zálohy |
| `apps/api/src/incidents/zapas.ts` | zápasové modifikátory situací |
| `apps/api/src/incidents/znalosti.ts` | pokyn do promptu u situace |
| `apps/api/src/events/absence.ts` | modifikátory a pooly výmluv podle situací |
| `apps/api/src/season/training.ts` | docházka podle situací |
| `apps/api/src/season/daily-tick.ts` | předání situací do tréninku |
| `apps/api/src/routes/game.ts` | náhled tréninku se situacemi |
| `apps/api/src/messaging/ai-player-scenarios.ts` | `zadost_o_zalohu`, situace v snapshotu, popisy scénářů |
| `apps/api/src/messaging/ai-player-spawn.ts` | váha hráče se situací |
| `apps/api/src/messaging/ai-player-chat.ts` | zákaz vymýšlet situace jen bez situace |
| `apps/api/src/messaging/chat-kontext.ts` | domácnost při rozvodu |
| `apps/api/src/incidents/hospoda.ts`, `hospoda-db.ts` | `pije_na_sekeru`, ohlášení po odmítnuté záloze |
| `apps/api/src/season/pub.ts` | rozvod v docházce do hospody |
| `apps/api/src/routes/incidents.ts` | situace v API, `POST /zaloha`, admin `situace` |
| `apps/web/src/app/dashboard/incidenty/*` | karta a detail situace, tlačítka zálohy |
| `apps/web/src/app/dashboard/finances/page.tsx` | popisek a ikona `incident_advance` |

---
## Task 1: Konstanty, typy a texty situací

**Files:**
- Modify: `apps/api/src/incidents/nastaveni.ts` (na konec)
- Modify: `apps/api/src/incidents/typy.ts`
- Modify: `apps/api/src/incidents/texty.ts` (nové klíče na konec `TEXTY`)
- Modify: `apps/api/src/incidents/absence-hracu.ts` (`DruhAbsence`, `DUVOD_ABSENCE`, `EMOJI_ABSENCE`)
- Test: `apps/api/src/incidents/texty.test.ts` (beze změny, jen musí projít)

**Interfaces:**
- Produces: konstanty níže; `NavrhIncidentu.subjectPlayerId`, `NavrhIncidentu.dniTrvani`; `HracKlubu.vek`, `HracKlubu.dluhy`, `HracKlubu.zalohaOdmitnuta`; klíče `TEXTY` (`situace_*`, `sms_situace_*`, `znalost_situace`, `zaloha_*`, `absence_porod`, `absence_nemocna_mama`, `absence_stehovani`); `DruhAbsence` o `porod | nemocna_mama | stehovani`.

- [ ] **Step 1: Konstanty**

Na konec `nastaveni.ts`:

```ts
/** Životní situace (spec 4c, 4e). */
export const SANCE_SITUACE_ZA_DEN = 0.03;
/** Kolik situací smí klub mít naráz. Jeden hráč vždy nejvýš jednu. */
export const MAX_AKTIVNICH_SITUACI = 2;
export const COOLDOWN_SITUACE_DNI = 21;

/** Záloha při dluzích (spec 7c). */
export const ZALOHA_MIN_KC = 3000;
export const ZALOHA_MAX_KC = 8000;
export const ZALOHA_TYDNU = 4;
export const ZALOHA_MORALKA = 6;
export const ZALOHA_VZTAH = 8;
export const ODMITNUTA_ZALOHA_MORALKA = -5;
export const ODMITNUTA_ZALOHA_VZTAH = -5;

/** Váha pachatele (spec 5a): kdo má dluhy, krade spíš. Odmítnutá záloha přitopí. */
export const VAHA_DLUHU = 2.0;
export const VAHA_ODMITNUTE_ZALOHY = 1.5;

/** Docházka na trénink podle situace (spec 17b). Kdo nemá práci nebo utekl z domova, chodí radši na hřiště. */
export const TRENINK_SITUACE: Record<string, number> = { prisel_o_praci: 0.15, rozvod: 0.15, dluhy: -0.15 };

/** Zápas (spec 17c). Platí jen pro ten jeden zápas, do DB se to nepropisuje. */
export const ZAPAS_ROZVOD_MORALKA = -5;
export const ZAPAS_ROZVOD_KONZISTENCE = -5;
export const ZAPAS_NAROZENI_MORALKA = 5;

/** Absence na zápas podle situace (spec 17a). */
export const DLUHY_SANCE_NAVIC = 0.05;
/** Bez řidičáku se na venkovní zápas jede hůř. Klubová dodávka to ruší. */
export const RIDICAK_SANCE_NAVIC = 0.12;

/** Hospoda (spec 9). */
export const SEKERA_SANCE = 0.5;
export const ROZVOD_HOSPODA_NASOBEK = 1.5;
```

- [ ] **Step 2: Typy**

V `typy.ts` do `HracKlubu` za `povolani`:

```ts
  /** Věk hráče. Situace mají věkové podmínky (spec 4c). */
  vek: number;
  /** Má aktivní situaci `dluhy` (spec 5a). */
  dluhy: boolean;
  /** Trenér mu odmítl zálohu (spec 5a, 7c). */
  zalohaOdmitnuta: boolean;
```

a do `NavrhIncidentu` za `culpritRevealed`:

```ts
  /** Koho se životní situace týká (spec 4c). U krádeží a poškození `null`. */
  subjectPlayerId?: string | null;
  /** Kolik herních dní situace potrvá. Zapíše se jako `ends_on`. */
  dniTrvani?: number;
```

- [ ] **Step 3: Druhy absencí**

V `absence-hracu.ts`:

```ts
export type DruhAbsence = "vyslech" | "soud" | "vyrazen" | "porod" | "nemocna_mama" | "stehovani";
```

a do `DUVOD_ABSENCE` a `EMOJI_ABSENCE` v `nastaveni.ts`:

```ts
export const DUVOD_ABSENCE = {
  vyslech: "Výslech na policii", soud: "Soudní jednání", vyrazen: "Vyřazen trenérem",
  porod: "Narodilo se mu dítě", nemocna_mama: "Nemocný rodič", stehovani: "Stěhování po rozvodu",
} as const;
export const EMOJI_ABSENCE: Record<string, string> = {
  vyslech: "🚓", soud: "⚖️", vyrazen: "⛔", porod: "👶", nemocna_mama: "🏥", stehovani: "📦",
};
```

`PORADI` v `absence-hracu.ts` (id absence `{incidentId}-abs-{n}`) rozšířit o nové druhy, ať mají vlastní pořadí:

```ts
const PORADI: Record<string, number> = { vyslech: 1, soud: 2, vyrazen: 3, porod: 4, nemocna_mama: 5, stehovani: 6 };
```

(Pokud je dnešní `PORADI` psané jinak, zachovej jeho tvar a jen doplň nové klíče se stejnou sémantikou.)

- [ ] **Step 4: Texty**

Do `TEXTY` v `texty.ts` (před `} as const`):

```ts
  situace_dluhy: [
    "{hrac} se dostal do dluhů. V kabině se říká, že mu volají z inkasa.",
    "{hrac} má doma dluhy a shání peníze, kde se dá.",
    "{hrac} dluží a začal brát brigády, kdy se dá.",
  ],
  situace_prisel_o_praci: [
    "{hrac} přišel o práci. Zatím to bere s humorem, ale je to znát.",
    "{hrac} dostal v práci výpověď.",
    "{hrac} je od tohoto týdne bez práce.",
  ],
  situace_rozvod: [
    "{hrac} se rozvádí a spí zatím v kabině.",
    "{hrac} se rozešel se ženou a stěhuje se.",
    "{hrac} si prochází rozvodem.",
  ],
  situace_zabaveny_ridicak: [
    "{hrac} přišel o řidičák.",
    "{hrac} má zabavený řidičák a na zápasy se bude vozit s někým.",
    "{hrac} nemá řidičák, na venkovní zápasy se bude vozit.",
  ],
  situace_svatba_spoluhrace: [
    "{hrac} se ženil a půlka kabiny slavila do rána.",
    "{hrac} měl svatbu. Kluci to oslavili za něj i za sebe.",
    "{hrac} se oženil a svatba se protáhla do rána.",
  ],
  situace_narozeni_ditete: [
    "{hrac} čeká narození dítěte.",
    "{hrac} bude tátou, termín je za pár dní.",
    "{hrac} se chystá do porodnice.",
  ],
  situace_nemocny_rodic: [
    "{hrac} má nemocného rodiče a jezdí do nemocnice.",
    "{hrac} se stará o nemocného rodiče.",
    "{hrac} tráví dny v nemocnici u rodiče.",
  ],
  sms_situace_dluhy: [
    "Trenére, dostal jsem se do problémů s penězi. Šlo by zálohu na výplatu? Vrátím to.",
    "Trenére, nerad o to prosím, ale potřeboval bych zálohu. Mám dluhy až nad hlavu.",
    "Trenére, můžu poprosit o zálohu? Doma je to teď s penězi zlé.",
  ],
  sms_situace_prisel_o_praci: [
    "Trenére, přišel jsem o práci. Trénovat budu chodit, aspoň mě to nebude žrát.",
    "Trenére, vyhodili mě z práce. Zatím to nějak zvládám.",
    "Trenére, jsem bez práce. Kdyby o něčem víte, dejte vědět.",
  ],
  sms_situace_rozvod: [
    "Trenére, rozvádím se. Spím teď na kabině, snad to nevadí.",
    "Trenére, doma je konec. Fotbal je jediné, co mi zbylo.",
    "Trenére, rozcházíme se se ženou. Bude to chvíli divoké.",
  ],
  sms_situace_zabaveny_ridicak: [
    "Trenére, vzali mi řidičák. Na venkovní zápasy mě bude muset někdo vzít.",
    "Trenére, přišel jsem o papíry. Doma zvládnu všechno, venku to bude horší.",
    "Trenére, jsem bez řidičáku. Domluvím se s klukama na odvoz.",
  ],
  sms_situace_svatba_spoluhrace: [
    "Trenére, ženil jsem se. Kluci to vzali vážně, ráno bude v kabině ticho.",
    "Trenére, měl jsem svatbu. Díky všem, co dorazili.",
    "Trenére, oženil jsem se. Omlouvám se za stav mužstva.",
  ],
  sms_situace_narozeni_ditete: [
    "Trenére, jedeme do porodnice. Dám vědět, jak to dopadlo.",
    "Trenére, rodíme. Pár dní se neozvu.",
    "Trenére, bude to každou chvíli. Omlouvám se dopředu.",
  ],
  sms_situace_nemocny_rodic: [
    "Trenére, mám nemocného tátu, jezdím do nemocnice. Pár dní vynechám.",
    "Trenére, máma je v nemocnici. Musím být u ní.",
    "Trenére, rodič mi skončil v nemocnici. Ozvu se, až to půjde.",
  ],
  znalost_situace: [
    "Tohle se děje tobě: {text}",
  ],
  zaloha_pujcena: [
    "Díky, trenére. Vrátím to do koruny.",
    "Trenére, díky. Tohle mi hodně pomohlo.",
    "Díky moc. Budu to splácet ze mzdy, jak jsme se domluvili.",
  ],
  zaloha_odmitnuta: [
    "Tak nic, trenére. Nějak to zvládnu sám.",
    "Chápu, trenére. Musím si poradit jinak.",
    "Beru na vědomí. Škoda, myslel jsem, že mi klub pomůže.",
  ],
  zaloha_propadla: [
    "Trenére, už to neřešte. Sehnal jsem to jinde.",
    "Už nic, trenére. Vyřešil jsem to po svém.",
    "Nechte to být, trenére. Musel jsem si poradit sám.",
  ],
  absence_porod: [
    "Trenére, jedeme do porodnice. Tenhle zápas vynechám.",
    "Trenére, rodíme. Omlouvám se ze zápasu.",
    "Trenére, bude to dřív, než jsme čekali. Na zápas nedorazím.",
  ],
  absence_nemocna_mama: [
    "Trenére, jedu do nemocnice za rodičem. Na zápas nedorazím.",
    "Trenére, musím do nemocnice za mámou. Omlouvám se.",
    "Trenére, rodič je v nemocnici a nemá tam nikoho. Nepřijdu.",
  ],
  absence_stehovani: [
    "Trenére, stěhuju se od ženy. Tenhle zápas vynechám.",
    "Trenére, musím se vystěhovat, jinak to nestihnu. Omlouvám se.",
    "Trenére, stěhování mi vyšlo přesně na zápas. Nedorazím.",
  ],
```

- [ ] **Step 5: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: `texty.test.ts` prochází (žádná dlouhá pomlčka, každá šablona končí tečkou), typecheck hlásí chybějící `vek`, `dluhy` a `zalohaOdmitnuta` jen tam, kde se `HracKlubu` skládá — to opraví Task 3. Pokud typecheck kvůli tomu selže, doplň v `stav-klubu.ts: hracZRadku` prozatímní hodnoty (`vek: cislo(r.age, 25)`, `dluhy: false`, `zalohaOdmitnuta: false`) a v `testovaci-stav.ts: hrac` výchozí (`vek: 28, dluhy: false, zalohaOdmitnuta: false`); Task 3 je nahradí skutečnými.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/incidents/nastaveni.ts apps/api/src/incidents/typy.ts apps/api/src/incidents/texty.ts apps/api/src/incidents/absence-hracu.ts apps/api/src/incidents/stav-klubu.ts apps/api/src/incidents/testovaci-stav.ts
git commit -F - <<'EOF'
feat(incidenty): konstanty, typy a texty zivotnich situaci

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Čistý katalog životních situací

**Files:**
- Create: `apps/api/src/incidents/situace.ts`
- Test: `apps/api/src/incidents/situace.test.ts`

**Interfaces:**
- Consumes (Task 1): konstanty `SANCE_SITUACE_ZA_DEN`, `MAX_AKTIVNICH_SITUACI`, `COOLDOWN_SITUACE_DNI`, `MIN_ODEHRANYCH_ZAPASU`, klíče `TEXTY.situace_*` a `TEXTY.sms_situace_*`; `HracKlubu.vek`, `NavrhIncidentu.subjectPlayerId`, `NavrhIncidentu.dniTrvani`.
- Produces:

```ts
export interface DefiniceSituace {
  kind: string; label: string; emoji: string;
  /** Komu se to může stát. */
  muze: (h: HracKlubu) => boolean;
  /** Váha hráče v losu, 0 = nepřipadá v úvahu. */
  vaha: (h: HracKlubu) => number;
  /** Kolik herních dní situace potrvá. */
  trvani: (rng: Rng) => number;
  /** Posun morálky dotčeného hráče při vzniku. */
  moralka: number;
  /** Incidentní absence, kterou situace vyvolá (spec 17a), nebo `null`. */
  absence: null | { druh: "porod" | "nemocna_mama" | "stehovani"; dni: (rng: Rng) => number; delka: (rng: Rng) => number };
}
export const KATALOG_SITUACI: DefiniceSituace[];
export const SITUACE_PODLE_KIND: Map<string, DefiniceSituace>;
export function nazevSituace(kind: string): string;
export function vylosujSituaci(stav: StavKlubu, rng: Rng): NavrhIncidentu | null;
```

- [ ] **Step 1: Failing test**

`apps/api/src/incidents/situace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "../generators/rng";
import { MAX_AKTIVNICH_SITUACI } from "./nastaveni";
import { KATALOG_SITUACI, nazevSituace, vylosujSituaci } from "./situace";
import { hrac, stavKlubu } from "./testovaci-stav";
import type { HracKlubu } from "./typy";

const proSeedy = (fn: (rng: Rng) => void, pocet = 300) => {
  for (let s = 1; s <= pocet; s++) fn(createRng(s));
};
const MLADY = hrac({ id: "m", jmeno: "Michal Mladý", vek: 19, povolani: "Student", alkohol: 20 });
const ZRALY = hrac({ id: "z", jmeno: "Zdeněk Zralý", vek: 30, povolani: "Zedník", alkohol: 70 });
const kadr = (...h: HracKlubu[]) => stavKlubu({ kadr: h, odehranychZapasu: 10 });

describe("katalog situací", () => {
  it("každá situace má popisek, emoji a kladné trvání", () => {
    expect(KATALOG_SITUACI.length).toBeGreaterThanOrEqual(7);
    for (const d of KATALOG_SITUACI) {
      expect(d.label.length, d.kind).toBeGreaterThan(0);
      expect(d.emoji.length, d.kind).toBeGreaterThan(0);
      proSeedy((rng) => expect(d.trvani(rng), d.kind).toBeGreaterThan(0), 20);
    }
    expect(nazevSituace("rozvod")).toContain("Rozvod");
  });

  it("věkové a povoláním dané podmínky platí", () => {
    const podle = (kind: string) => KATALOG_SITUACI.find((d) => d.kind === kind)!;
    expect(podle("rozvod").muze(MLADY)).toBe(false);
    expect(podle("rozvod").muze(ZRALY)).toBe(true);
    expect(podle("narozeni_ditete").muze(MLADY)).toBe(false);
    expect(podle("nemocny_rodic").muze(MLADY)).toBe(false);
    // Kdo nemá práci, o ni nepřijde.
    expect(podle("prisel_o_praci").muze(MLADY)).toBe(false);
    expect(podle("prisel_o_praci").muze(hrac({ povolani: "Nezaměstnaný", vek: 30 }))).toBe(false);
    expect(podle("prisel_o_praci").muze(ZRALY)).toBe(true);
    // Řidičák sebrali tomu, kdo pije.
    expect(podle("zabaveny_ridicak").muze(hrac({ vek: 30, alkohol: 30 }))).toBe(false);
    expect(podle("zabaveny_ridicak").muze(ZRALY)).toBe(true);
  });

  it("dluhy tíhnou k nezaměstnaným a pijákům", () => {
    const podle = KATALOG_SITUACI.find((d) => d.kind === "dluhy")!;
    const klidny = hrac({ vek: 30, povolani: "Účetní", alkohol: 20 });
    expect(podle.vaha(hrac({ vek: 30, povolani: "Nezaměstnaný", alkohol: 20 }))).toBeGreaterThan(podle.vaha(klidny));
    expect(podle.vaha(hrac({ vek: 30, povolani: "Účetní", alkohol: 80 }))).toBeGreaterThan(podle.vaha(klidny));
  });
});

describe("los situace", () => {
  it("nový klub, plný limit ani hráč se situací situaci nedostanou", () => {
    proSeedy((rng) => {
      expect(vylosujSituaci(stavKlubu({ kadr: [ZRALY], odehranychZapasu: 1 }), rng)).toBeNull();
      expect(vylosujSituaci(stavKlubu({
        kadr: [ZRALY], odehranychZapasu: 10, situace: new Map([["x", "rozvod"], ["y", "dluhy"]]),
      }), rng)).toBeNull();
      expect(vylosujSituaci(stavKlubu({
        kadr: [ZRALY], odehranychZapasu: 10, situace: new Map([[ZRALY.id, "dluhy"]]),
      }), rng)).toBeNull();
    }, 60);
    expect(MAX_AKTIVNICH_SITUACI).toBe(2);
  });

  it("vylosovaná situace patří hráči z kádru, je probíhající a má trvání", () => {
    let vylosovanych = 0;
    proSeedy((rng) => {
      const n = vylosujSituaci(kadr(ZRALY, MLADY), rng);
      if (!n) return;
      vylosovanych++;
      expect(n.category).toBe("zivotni");
      expect(n.status).toBe("probiha");
      expect(n.culpritType).toBe("nikdo");
      expect([ZRALY.id, MLADY.id]).toContain(n.subjectPlayerId);
      expect(n.dniTrvani ?? 0).toBeGreaterThan(0);
      expect(n.ztraty).toEqual([]);
      expect(n.text).toMatch(/Zdeněk Zralý|Michal Mladý/);
    });
    expect(vylosovanych).toBeGreaterThan(0);
  });

  it("cooldown typu drží: když jsou všechny typy čerstvé, nic se nevylosuje", () => {
    // Cooldown se počítá od `stav.den`, fixtura má 2026-09-16, takže stejný den je vždy na cooldownu.
    const vsechnyNaCooldownu = Object.fromEntries(KATALOG_SITUACI.map((d) => [d.kind, "2026-09-16"]));
    proSeedy((rng) => {
      expect(vylosujSituaci(stavKlubu({ kadr: [ZRALY], odehranychZapasu: 10, posledniVyskyt: vsechnyNaCooldownu }), rng)).toBeNull();
    }, 60);
  });
});
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/situace.test.ts`
Expected: FAIL, modul `./situace` neexistuje (a `stavKlubu` zatím nemá pole `situace` — doplní Task 3; pro tenhle task přidej do `testovaci-stav.ts` fixtuře pole `situace: new Map()` a do `StavKlubu` typ `situace: ReadonlyMap<string, string>`).

- [ ] **Step 3: Implementace `apps/api/src/incidents/situace.ts`**

```ts
/**
 * Životní situace hráčů (spec Část 4c). Čisté funkce bez DB.
 *
 * Situace není průšvih: nemá pachatele ani stopy. Je to stav, který na hráči pár týdnů visí
 * a promítá se do docházky, morálky, výmluv a chování v hospodě. Zápis a ukončení: `situace-db.ts`.
 */

import type { Rng } from "../generators/rng";
import {
  COOLDOWN_SITUACE_DNI, MAX_AKTIVNICH_SITUACI, MIN_ODEHRANYCH_ZAPASU, SANCE_SITUACE_ZA_DEN,
} from "./nastaveni";
import { text } from "./texty";
import type { HracKlubu, NavrhIncidentu, StavKlubu } from "./typy";

/** Povolání, o která se přijít nedá. */
const BEZ_PRACE = ["Student", "Důchodce", "Nezaměstnaný", "Bezdomovec"];
/** Povolání bez jistoty výdělku: dluhy si najdou spíš je. */
const NEJISTY_PRIJEM = ["Nezaměstnaný", "Bezdomovec", "Sezonní dělník"];

export interface DefiniceSituace {
  kind: string;
  label: string;
  emoji: string;
  muze: (h: HracKlubu) => boolean;
  vaha: (h: HracKlubu) => number;
  trvani: (rng: Rng) => number;
  moralka: number;
  absence: null | {
    druh: "porod" | "nemocna_mama" | "stehovani";
    /** Za kolik dní od vzniku hráč chybí. Vždy aspoň `MIN_OHLASENI_ABSENCE_DNI`, řeší volající. */
    dni: (rng: Rng) => number;
    delka: (rng: Rng) => number;
  };
}

export const KATALOG_SITUACI: DefiniceSituace[] = [
  {
    kind: "dluhy", label: "Dluhy", emoji: "💸",
    muze: () => true,
    vaha: (h) => 1 * (NEJISTY_PRIJEM.includes(h.povolani) ? 2 : 1) * (h.alkohol >= 60 ? 1.5 : 1),
    trvani: (rng) => rng.int(21, 35),
    moralka: 0,
    absence: null,
  },
  {
    kind: "prisel_o_praci", label: "Ztráta práce", emoji: "🧰",
    muze: (h) => h.povolani !== "" && !BEZ_PRACE.includes(h.povolani),
    vaha: () => 1,
    trvani: () => 21,
    moralka: -6,
    absence: null,
  },
  {
    kind: "rozvod", label: "Rozvod", emoji: "💔",
    muze: (h) => h.vek >= 24,
    vaha: () => 1,
    trvani: () => 28,
    moralka: -10,
    // První týden se stěhuje: jeden den mimo, ohlášený dopředu.
    absence: { druh: "stehovani", dni: (rng) => rng.int(2, 6), delka: () => 1 },
  },
  {
    kind: "zabaveny_ridicak", label: "Zabavený řidičák", emoji: "🚫",
    muze: (h) => h.alkohol >= 60,
    vaha: (h) => 1 + (h.alkohol >= 80 ? 1 : 0),
    trvani: () => 30,
    moralka: -2,
    absence: null,
  },
  {
    kind: "svatba_spoluhrace", label: "Svatba", emoji: "💍",
    // Ženit se chodí ten, kdo už nebydlí u rodičů a ještě není z toho venku (`domacnost`, chat-kontext).
    muze: (h) => h.vek >= 24 && h.vek <= 40,
    vaha: () => 1,
    trvani: () => 1,
    moralka: 3,
    absence: null,
  },
  {
    kind: "narozeni_ditete", label: "Narození dítěte", emoji: "👶",
    muze: (h) => h.vek >= 22 && h.vek <= 40,
    vaha: () => 1,
    trvani: (rng) => rng.int(3, 5),
    moralka: 8,
    absence: { druh: "porod", dni: (rng) => rng.int(2, 3), delka: (rng) => rng.int(1, 3) },
  },
  {
    kind: "nemocny_rodic", label: "Nemocný rodič", emoji: "🏥",
    muze: (h) => h.vek >= 25,
    vaha: () => 1,
    trvani: (rng) => rng.int(4, 7),
    moralka: -4,
    absence: { druh: "nemocna_mama", dni: (rng) => rng.int(2, 3), delka: (rng) => rng.int(2, 4) },
  },
];

export const SITUACE_PODLE_KIND = new Map(KATALOG_SITUACI.map((d) => [d.kind, d]));

export function nazevSituace(kind: string): string {
  return SITUACE_PODLE_KIND.get(kind)?.label ?? "Životní situace";
}

const DEN_MS = 86_400_000;

function naCooldownu(stav: StavKlubu, kind: string): boolean {
  const posledni = stav.posledniVyskyt[kind];
  if (!posledni) return false;
  const rozdil = (Date.parse(stav.den) - Date.parse(posledni)) / DEN_MS;
  return rozdil >= 0 && rozdil < COOLDOWN_SITUACE_DNI;
}

/**
 * Nová situace pro jeden klub a den (spec 4c, 4e). `null`, když se nic neděje:
 * nový klub, plný limit, nikdo volný nebo prostě vyšel los.
 */
export function vylosujSituaci(stav: StavKlubu, rng: Rng): NavrhIncidentu | null {
  if (stav.odehranychZapasu < MIN_ODEHRANYCH_ZAPASU) return null;
  if (stav.situace.size >= MAX_AKTIVNICH_SITUACI) return null;
  if (rng.random() >= SANCE_SITUACE_ZA_DEN) return null;

  const volni = stav.kadr.filter((h) => !stav.situace.has(h.id));
  const moznosti: Array<{ klic: string; d: DefiniceSituace; h: HracKlubu; vaha: number }> = [];
  for (const d of KATALOG_SITUACI) {
    if (naCooldownu(stav, d.kind)) continue;
    for (const h of volni) {
      if (!d.muze(h)) continue;
      const vaha = d.vaha(h);
      if (vaha > 0) moznosti.push({ klic: `${d.kind}|${h.id}`, d, h, vaha });
    }
  }
  if (moznosti.length === 0) return null;

  const klic = rng.weighted(Object.fromEntries(moznosti.map((m) => [m.klic, m.vaha])));
  const vybrana = moznosti.find((m) => m.klic === klic);
  if (!vybrana) return null;
  return {
    kind: vybrana.d.kind, category: "zivotni", status: "probiha", severity: 1,
    culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
    subjectPlayerId: vybrana.h.id, dniTrvani: vybrana.d.trvani(rng), ztraty: [],
    text: text(rng, `situace_${vybrana.d.kind}` as never, { hrac: vybrana.h.jmeno }),
  };
}
```

`text(rng, \`situace_${kind}\` as never, …)`: klíče `TEXTY` jsou union literálů, dynamický klíč se jinak neuhlídá. Pokud chceš typovou jistotu, nahraď to mapou `const KLIC_TEXTU: Record<string, KlicTextu>` se sedmi klíči a čti z ní.

- [ ] **Step 4: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents/situace.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/incidents/situace.ts apps/api/src/incidents/situace.test.ts apps/api/src/incidents/typy.ts apps/api/src/incidents/testovaci-stav.ts
git commit -F - <<'EOF'
feat(incidenty): katalog a los zivotnich situaci

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Stav klubu, zápis situace a váha pachatele

**Files:**
- Modify: `apps/api/src/incidents/stav-klubu.ts`
- Modify: `apps/api/src/incidents/dopady.ts`
- Modify: `apps/api/src/incidents/znalosti.ts`
- Modify: `apps/api/src/incidents/pachatel.ts`
- Modify: `apps/api/src/incidents/testovaci-stav.ts`
- Test: `apps/api/src/incidents/stav-klubu.test.ts`, `apps/api/src/incidents/dopady.test.ts`, `apps/api/src/incidents/znalosti.test.ts`, `apps/api/src/incidents/pachatel.test.ts`

**Interfaces:**
- Consumes (Task 1, 2): typy a konstanty, `NavrhIncidentu.subjectPlayerId`/`dniTrvani`, `TEXTY.znalost_situace`.
- Produces:
  - `StavKlubu.rozpocet: number`, `StavKlubu.situace: ReadonlyMap<string, string>` (hráč → kind běžící situace)
  - `hracZRadku(r, recidiviste?, kontext?: { situace?: ReadonlyMap<string, string>; odmitnuteZalohy?: ReadonlySet<string> })`
  - `zapisIncident` ukládá `subject_player_id` a `ends_on`
  - `znalostiIncidentu` u situací: `kadr` všem, dotčenému navíc `pachatel` s textem v 1. osobě
  - `vahaPachatele` počítá dluhy a odmítnutou zálohu

- [ ] **Step 1: Failing testy**

Do `stav-klubu.test.ts`:

```ts
  it("věk, dluhy a odmítnutou zálohu bere z kontextu", () => {
    const h = hracZRadku({ ...radek, age: 31 }, new Set(), {
      situace: new Map([["h1", "dluhy"]]), odmitnuteZalohy: new Set(["h1"]),
    });
    expect(h).toMatchObject({ vek: 31, dluhy: true, zalohaOdmitnuta: true });
    const bez = hracZRadku({ ...radek, age: 31 }, new Set(), { situace: new Map([["h1", "rozvod"]]) });
    expect(bez).toMatchObject({ vek: 31, dluhy: false, zalohaOdmitnuta: false });
    expect(hracZRadku(radek).vek).toBe(25);
  });
```

Do `pachatel.test.ts`:

```ts
  it("dluhy a odmítnutá záloha zvednou váhu pachatele", () => {
    const klidny = hrac();
    expect(vahaPachatele(hrac({ dluhy: true })) - vahaPachatele(klidny)).toBeCloseTo(VAHA_DLUHU);
    expect(vahaPachatele(hrac({ dluhy: true, zalohaOdmitnuta: true })) - vahaPachatele(klidny))
      .toBeCloseTo(VAHA_DLUHU + VAHA_ODMITNUTE_ZALOHY);
  });
```

(import `VAHA_DLUHU`, `VAHA_ODMITNUTE_ZALOHY` z `./nastaveni`.)

Do `znalosti.test.ts` do `describe("kdo co ví při vzniku incidentu")`:

```ts
  it("u životní situace ví kádr veřejný text a dotčený hráč o sobě", () => {
    const situace: NavrhIncidentu = {
      kind: "rozvod", category: "zivotni", status: "probiha", severity: 1,
      culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
      subjectPlayerId: "s", dniTrvani: 28, ztraty: [], text: "Jan Svědek se rozvádí a spí zatím v kabině.",
    };
    const z = znalostiIncidentu(stav, situace, [], createRng(1));
    expect(z.filter((r) => r.role === "kadr")).toHaveLength(3);
    const vlastni = z.find((r) => r.role === "pachatel");
    expect(vlastni).toMatchObject({ playerId: "s", until: gameExpiry(DNES, 28) });
    expect(vlastni?.fact).toContain("Jan Svědek se rozvádí");
    expect(vlastni?.fact).not.toBe(situace.text);
  });
```

Do `dopady.test.ts`:

```ts
describe("zápis životní situace", () => {
  it("uloží dotčeného hráče a konec situace, škodu ani stopy neřeší", async () => {
    const db = new FalesnaD1();
    const stav = stavKlubu({ kadr: [PROBLEMOVY], gameDate: "2026-09-16T16:00:00.000Z" });
    const navrh: NavrhIncidentu = {
      kind: "dluhy", category: "zivotni", status: "probiha", severity: 1,
      culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
      subjectPlayerId: "p", dniTrvani: 30, ztraty: [], text: "Pepa Průšvih se dostal do dluhů.",
    };
    expect(await zapisIncident(jakoD1(db), stav, navrh, "inc-s")).toMatchObject({ id: "inc-s", odhalen: false });
    const vlozeni = db.dotazy.find((d) => /INSERT OR IGNORE INTO club_incidents/.test(d.sql));
    expect(vlozeni?.sql).toContain("subject_player_id");
    expect(vlozeni?.sql).toContain("ends_on");
    expect(vlozeni?.params).toContain("p");
    expect(vlozeni?.params).toContain(gameExpiry("2026-09-16T16:00:00.000Z", 30));
    expect(db.pocet(/club_incident_clues/)).toBe(0);
    expect(db.pocet(/UPDATE equipment/)).toBe(0);
    expect(db.davky.flat().some((d) => /club_incident_knowledge/.test(d.sql))).toBe(true);
  });
});
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/stav-klubu.test.ts src/incidents/pachatel.test.ts src/incidents/znalosti.test.ts src/incidents/dopady.test.ts`
Expected: FAIL (chybí `vek`/`dluhy` v převodu, váhy, znalost situace, sloupce v INSERTu).

- [ ] **Step 3: `stav-klubu.ts`**

`SLOUPCE_HRACE` rozšířit o věk:

```ts
export const SLOUPCE_HRACE = "id, first_name, last_name, age, personality, life_context, coach_relationship";
```

`hracZRadku` dostane kontext situací:

```ts
export interface KontextHrace {
  /** Hráč → kind běžící životní situace. */
  situace?: ReadonlyMap<string, string>;
  /** Hráči, kterým trenér odmítl zálohu (spec 5a). */
  odmitnuteZalohy?: ReadonlySet<string>;
}

export function hracZRadku(r: Record<string, unknown>, recidiviste: ReadonlySet<string> = new Set(), kontext: KontextHrace = {}): HracKlubu {
  …
  return {
    …,
    vek: cislo(r.age, 25),
    dluhy: kontext.situace?.get(id) === "dluhy",
    zalohaOdmitnuta: kontext.odmitnuteZalohy?.has(id) ?? false,
    recidivista: recidiviste.has(id),
  };
}
```

Do dávky v `nactiStavKlubu` přidat tři dotazy (za dotaz na recidivisty):

```ts
    db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId),
    db.prepare(
      `SELECT subject_player_id AS id, kind FROM club_incidents
        WHERE team_id = ? AND status = 'probiha' AND category = 'zivotni' AND subject_player_id IS NOT NULL`,
    ).bind(teamId),
    db.prepare(
      `SELECT subject_player_id AS id FROM club_incidents
        WHERE team_id = ? AND status = 'probiha' AND kind = 'dluhy'
          AND json_extract(resolution_data, '$.zaloha') = 'odmitnuto' AND subject_player_id IS NOT NULL`,
    ).bind(teamId),
```

a rozbalit je (`rozpocetRes`, `situaceRes`, `zalohyRes`), postavit mapy a předat je do `hracZRadku`:

```ts
  const situace = new Map((situaceRes.results as Array<{ id: string; kind: string }>).map((r) => [String(r.id), String(r.kind)]));
  const odmitnuteZalohy = new Set((zalohyRes.results as Array<{ id: string }>).map((r) => String(r.id)));
  const kadr: HracKlubu[] = (kadrRes.results as Array<Record<string, unknown>>).map((r) => hracZRadku(r, recidiviste, { situace, odmitnuteZalohy }));
```

a do vráceného objektu `rozpocet: cislo((rozpocetRes.results[0] as { budget?: number } | undefined)?.budget, 0)` a `situace`.

- [ ] **Step 4: `dopady.ts`**

V `zapisIncident` doplnit sloupce do INSERTu (a jen tam; větev `zHroziciho` zůstává beze změny):

```ts
  const endsOn = navrh.dniTrvani ? gameExpiry(stav.gameDate, navrh.dniTrvani) : null;
  …
    : await db.prepare(
      `INSERT OR IGNORE INTO club_incidents
         (id, team_id, league_id, season_number, kind, category, status, severity, game_date, deadline,
          culprit_type, culprit_player_id, culprit_revealed, subject_player_id, ends_on, loss, text, resolved_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, stav.teamId, stav.leagueId, stav.seasonNumber, navrh.kind, navrh.category, navrh.status,
      navrh.severity, stav.gameDate, deadline, navrh.culpritType, navrh.culpritPlayerId,
      navrh.culpritRevealed ? 1 : 0, navrh.subjectPlayerId ?? null, endsOn,
      JSON.stringify(navrh.ztraty), navrh.text, resolvedOn,
    ).run()…
```

Životní situace nemá ztráty, takže projde větví `navrh.ztraty.length === 0` (zapíšou se znalosti a vrátí se `{ id, nalezeneStopy: [], odhalen: false }`) — ta zůstává beze změny.

- [ ] **Step 5: `znalosti.ts`**

Ve `znalostiIncidentu` za blok `kadrDo`:

```ts
  // Životní situace: kádr zná veřejný text, dotčený hráč to prožívá sám (spec 10a).
  if (navrh.category === "zivotni") {
    if (!navrh.subjectPlayerId) return znalosti;
    znalosti.push({
      playerId: navrh.subjectPlayerId, role: "pachatel", ochota: 0,
      fact: vypln(TEXTY.znalost_situace[0], { text: navrh.text }),
      until: gameExpiry(stav.gameDate, navrh.dniTrvani ?? ZNALOST_KADR_DNI),
    });
    return znalosti;
  }
```

a v `pokynPachatele` (prompt) nová první větev:

```ts
function pokynPachatele(r: RadekZnalosti): string {
  // Životní situace není průšvih: není co zapírat ani přiznávat (spec 4c).
  if (r.kategorie === "zivotni") return "Je to tvoje starost. Když se trenér zeptá, mluv o tom normálně.";
  if (r.stav === "hrozi") return "Byl jsi v hospodě opilý a vykládal jsi to. Zlehčuj to, a když ti trenér domluví, slib, že nic neuděláš.";
  if (r.odhalen) return "Už se na to přišlo, nezapírej.";
  return r.vyslech === "priznal" ? "Přiznej se trenérovi." : "Zapírej, nic nepřiznávej.";
}
```

- [ ] **Step 6: `pachatel.ts`**

```ts
export function vahaPachatele(h: HracKlubu): number {
  return (h.alkohol / 100) * 1.0
    + ((100 - h.disciplina) / 100) * 1.2
    + ((100 - h.vernost) / 100) * 0.8
    + ((100 - h.vztahKTrenerovi) / 100) * 0.6
    + (h.transferUnrest / 100) * 0.5
    + (h.dluhy ? VAHA_DLUHU : 0)
    + (h.dluhy && h.zalohaOdmitnuta ? VAHA_ODMITNUTE_ZALOHY : 0)
    + (h.recidivista ? VAHA_RECIDIVY : 0);
}
```

(Odmítnutá záloha se počítá jen spolu s dluhy: bez situace by ten příznak stejně nikdy nebyl nastavený.)

- [ ] **Step 7: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS. Fixtura `testovaci-stav.ts` má `hrac` s `vek: 28, dluhy: false, zalohaOdmitnuta: false` a `stavKlubu` s `rozpocet: 100000, situace: new Map()`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/incidents/stav-klubu.ts apps/api/src/incidents/stav-klubu.test.ts apps/api/src/incidents/dopady.ts apps/api/src/incidents/dopady.test.ts apps/api/src/incidents/znalosti.ts apps/api/src/incidents/znalosti.test.ts apps/api/src/incidents/pachatel.ts apps/api/src/incidents/pachatel.test.ts apps/api/src/incidents/testovaci-stav.ts
git commit -F - <<'EOF'
feat(incidenty): stav klubu se situacemi, zapis situace a vaha pachatele

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: Založení a ukončení situace, žádost o zálohu a rozhodnutí o ní

**Files:**
- Create: `apps/api/src/incidents/situace-db.ts`
- Modify: `apps/api/src/incidents/denni-krok.ts`
- Modify: `apps/api/src/incidents/vysetrovani-den.ts` (`zauctujSrazky` bere i splátky zálohy)
- Modify: `apps/api/src/season/finance-processor.ts` (`incident_advance`)
- Test: `apps/api/src/incidents/situace-db.test.ts` (nový), `apps/api/src/incidents/vysetrovani-den.test.ts`

**Interfaces:**
- Consumes: `vylosujSituaci`, `SITUACE_PODLE_KIND` (Task 2), `zapisIncident` (Task 3), `posunHrace` (`hraci.ts`), `prikazAbsence`/`denPlus` (`absence-hracu.ts`), `sendPlayerSMS`, `getOrCreatePlayerConversation`, `isAiEnabled`, `recordTransaction`, `logConditionStmt` (`lib/condition-log`).
- Produces:

```ts
export async function zalozSituaci(env: Bindings, stav: StavKlubu, navrh: NavrhIncidentu, id?: string): Promise<string | null>;
export async function ukonciSituace(env: Bindings, t: { teamId: string; gameDate: string }): Promise<number>;
export async function propadleZalohy(env: Bindings, t: { teamId: string; gameDate: string }): Promise<number>;
export async function rozhodniZalohu(env: Bindings, teamId: string, incidentId: string, akce: "pujcit" | "odmitnout"): Promise<VysledekAkce<{ castka: number | null }>>;
```

- [ ] **Step 1: Failing test**

`apps/api/src/incidents/situace-db.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({ sendPlayerSMS: vi.fn(async () => "konv-1"), sendSystemSMS: vi.fn(async () => undefined) }));
vi.mock("../messaging/ai-player-spawn", () => ({ getOrCreatePlayerConversation: vi.fn(async () => "konv-1") }));
vi.mock("../lib/ai-provider", () => ({ isAiEnabled: vi.fn(async () => true) }));
vi.mock("../season/finance-processor", () => ({ recordTransaction: vi.fn(async () => 1000) }));

import type { Bindings } from "../index";
import { recordTransaction } from "../season/finance-processor";
import { sendPlayerSMS } from "../messaging/system-sms";
import { propadleZalohy, rozhodniZalohu, ukonciSituace, zalozSituaci } from "./situace-db";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { hrac, incidentRadek, stavKlubu } from "./testovaci-stav";
import type { NavrhIncidentu } from "./typy";

const DNES = "2026-09-17T16:00:00.000Z";
const SUBJEKT = hrac({ id: "s", jmeno: "Jan Svědek", vek: 30, alkohol: 70 });
const PARTA = hrac({ id: "k", jmeno: "Karel Vrba", vek: 28, alkohol: 80 });

const navrh = (over: Partial<NavrhIncidentu> = {}): NavrhIncidentu => ({
  kind: "dluhy", category: "zivotni", status: "probiha", severity: 1,
  culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
  subjectPlayerId: "s", dniTrvani: 30, ztraty: [], text: "Jan Svědek se dostal do dluhů.", ...over,
});

function prostredi(dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /SELECT id, first_name, last_name, nickname, avatar FROM players/, first: { id: "s", first_name: "Jan", last_name: "Svědek", nickname: null, avatar: null } },
    { sql: /FROM staff_members/, first: { usudek: null } },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

beforeEach(() => vi.clearAllMocks());

describe("založení situace", () => {
  it("dluhy: lhůta na zálohu, SMS hráče a vlákno v chatu", async () => {
    const { db, env } = prostredi();
    const stav = stavKlubu({ gameDate: DNES, den: "2026-09-17", kadr: [SUBJEKT, PARTA] });
    expect(await zalozSituaci(env, stav, navrh())).toMatch(/^inc-/);
    const lhuta = db.dotazy.find((d) => /UPDATE club_incidents SET deadline/.test(d.sql));
    expect(lhuta?.sql).toContain("deadline IS NULL");
    expect(sendPlayerSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", expect.objectContaining({ id: "s" }), expect.stringContaining("zálohu"), expect.objectContaining({ type: "incident" }));
    expect(db.pocet(/UPDATE conversations SET ai_thread_active/)).toBe(1);
  });

  it("narození dítěte založí incidentní absenci ohlášenou dopředu, rozvod stěhování", async () => {
    const { db, env } = prostredi();
    const stav = stavKlubu({ gameDate: DNES, den: "2026-09-17", kadr: [SUBJEKT] });
    await zalozSituaci(env, stav, navrh({ kind: "narozeni_ditete", dniTrvani: 4, text: "Jan Svědek čeká narození dítěte." }));
    const abs = db.davky.flat().find((d) => /INSERT OR IGNORE INTO club_incident_absences/.test(d.sql));
    expect(abs?.params).toContain("porod");
    // od_dne je aspoň dva dny po ohlášení (spec 17a)
    const od = String(abs?.params[5]);
    expect(od >= "2026-09-19").toBe(true);
  });

  it("svatba dá kocovinu jen pijákům z kádru, ženich nepije za trest", async () => {
    const { db, env } = prostredi();
    const stav = stavKlubu({ gameDate: DNES, den: "2026-09-17", kadr: [SUBJEKT, PARTA, hrac({ id: "a", jmeno: "Abstinent Nový", alkohol: 20 })] });
    await zalozSituaci(env, stav, navrh({ kind: "svatba_spoluhrace", dniTrvani: 1, text: "Jan Svědek se ženil." }));
    const kondice = db.davky.flat().filter((d) => /json_set\(life_context, '\$\.condition'/.test(d.sql));
    expect(kondice.map((d) => d.params[d.params.length - 1])).toEqual(["k"]);
  });
});

describe("konec situace a propadlá lhůta zálohy", () => {
  it("situace s ends_on do dneška se uzavře jako skončila", async () => {
    const { db, env } = prostredi([{ sql: /status = 'uzavreny', resolution = 'skoncila'/, all: [{ id: "inc-1", kind: "rozvod", subject_player_id: "s" }] }]);
    expect(await ukonciSituace(env, { teamId: "tym-a", gameDate: DNES })).toBe(1);
    const dotaz = db.dotazy.find((d) => /resolution = 'skoncila'/.test(d.sql));
    expect(dotaz?.sql).toContain("status = 'probiha'");
    expect(dotaz?.sql).toContain("ends_on <= ?");
  });

  it("nerozhodnutá záloha po lhůtě propadne jako odmítnutí", async () => {
    const { db, env } = prostredi([{ sql: /FROM club_incidents\s+WHERE team_id = \? AND status = 'probiha' AND kind = 'dluhy'/, all: [{ id: "inc-1", subject_player_id: "s" }] }]);
    expect(await propadleZalohy(env, { teamId: "tym-a", gameDate: DNES })).toBe(1);
    const zapis = db.dotazy.find((d) => /\$\.zaloha/.test(d.sql) && /UPDATE club_incidents/.test(d.sql));
    expect(zapis?.sql).toContain("json_extract(resolution_data, '$.zaloha') IS NULL");
    expect(sendPlayerSMS).toHaveBeenCalled();
  });
});

describe("rozhodnutí o záloze", () => {
  const dluhy = incidentRadek({ id: "inc-1", kind: "dluhy", category: "zivotni", status: "probiha", culprit_type: null, culprit_player_id: null, loss: "[]" });

  it("půjčka strhne peníze, nastaví splátky a pošle SMS", async () => {
    const { db, env } = prostredi([
      { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: { ...dluhy, subject_player_id: "s" } },
      { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
    ]);
    const r = await rozhodniZalohu(env, "tym-a", "inc-1", "pujcit");
    expect(r).toMatchObject({ ok: true });
    const castka = r.ok ? r.castka ?? 0 : 0;
    expect(castka).toBeGreaterThanOrEqual(3000);
    expect(castka).toBeLessThanOrEqual(8000);
    expect(recordTransaction).toHaveBeenCalledWith(expect.anything(), "tym-a", "incident_advance", -castka, expect.stringContaining("Záloha"), DNES, "zaloha-inc-1");
    const zapis = db.dotazy.find((d) => /UPDATE club_incidents SET resolution_data/.test(d.sql));
    expect(zapis?.sql).toContain("json_extract(resolution_data, '$.zaloha') IS NULL");
    expect(zapis?.sql).toContain("status = 'probiha'");
  });

  it("odmítnutí nesahá na peníze a druhé rozhodnutí je 409", async () => {
    const { db, env } = prostredi([
      { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: { ...dluhy, subject_player_id: "s" } },
      { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
      { sql: /UPDATE club_incidents SET resolution_data/, changes: 0 },
    ]);
    expect(await rozhodniZalohu(env, "tym-a", "inc-1", "odmitnout")).toMatchObject({ ok: false, kod: 409 });
    expect(recordTransaction).not.toHaveBeenCalled();
    expect(db.pocet(/UPDATE club_incidents SET resolution_data/)).toBe(1);
  });

  it("u jiného než dluhového incidentu 409", async () => {
    const { env } = prostredi([
      { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: incidentRadek() },
      { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
    ]);
    expect(await rozhodniZalohu(env, "tym-a", "inc-1", "pujcit")).toMatchObject({ ok: false, kod: 409 });
  });
});
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/situace-db.test.ts`
Expected: FAIL, modul `./situace-db` neexistuje.

- [ ] **Step 3: `apps/api/src/incidents/situace-db.ts`**

```ts
/**
 * Životní situace v DB (spec 4c, 7c): založení, ukončení a záloha na mzdu.
 *
 * Situace je řádek `club_incidents` se stavem `probiha`, `subject_player_id` a `ends_on`.
 * Nemá pachatele ani stopy: není co vyšetřovat, jen to na hráči pár týdnů visí.
 */

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { isAiEnabled } from "../lib/ai-provider";
import { logConditionStmt } from "../lib/condition-log";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { getOrCreatePlayerConversation } from "../messaging/ai-player-spawn";
import { sendPlayerSMS } from "../messaging/system-sms";
import { recordTransaction } from "../season/finance-processor";
import type { VysledekAkce } from "./akce";
import { denPlus, prikazAbsence } from "./absence-hracu";
import { zapisIncident } from "./dopady";
import { posunHrace } from "./hraci";
import { herniDatum, idIncidentu, nactiIncident, smsIncidentu } from "./incident-db";
import {
  LHUTA_ROZHODNUTI_DNI, MIN_OHLASENI_ABSENCE_DNI, ODMITNUTA_ZALOHA_MORALKA, ODMITNUTA_ZALOHA_VZTAH,
  ZALOHA_MAX_KC, ZALOHA_MIN_KC, ZALOHA_MORALKA, ZALOHA_TYDNU, ZALOHA_VZTAH,
} from "./nastaveni";
import { nazevSituace, SITUACE_PODLE_KIND } from "./situace";
import { text, type KlicTextu } from "./texty";
import type { NavrhIncidentu, StavKlubu } from "./typy";

const M = "incidents-situace";

type RadekHrace = { id: string; first_name: string; last_name: string; nickname: string | null; avatar: string | null };

async function nactiHrace(db: D1Database, teamId: string, playerId: string): Promise<RadekHrace | null> {
  return db.prepare(
    "SELECT id, first_name, last_name, nickname, avatar FROM players WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')",
  ).bind(playerId, teamId).first<RadekHrace>()
    .catch((e) => { logger.warn({ module: M }, `hráč situace ${playerId}`, e); return null; });
}

const ref = (h: RadekHrace) => ({ id: h.id, firstName: h.first_name, lastName: h.last_name, nickname: h.nickname, avatar: h.avatar });

/** Kocovina po svatbě: kdo pije, ten to ráno pozná (spec 4c). */
function prikazyKocoviny(db: D1Database, stav: StavKlubu, subjectId: string, rng: ReturnType<typeof createRng>): D1PreparedStatement[] {
  const prikazy: D1PreparedStatement[] = [];
  for (const h of stav.kadr) {
    if (h.id === subjectId || h.alkohol < 50) continue;
    const dolu = rng.int(10, 20);
    prikazy.push(db.prepare(
      `UPDATE players SET life_context = json_set(life_context, '$.condition',
         MAX(15, COALESCE(json_extract(life_context, '$.condition'), 100) - ?)) WHERE id = ?`,
    ).bind(dolu, h.id));
    prikazy.push(logConditionStmt(db, h.id, stav.teamId, 100, 100 - dolu, "pub", "Svatba spoluhráče"));
  }
  return prikazy;
}

/**
 * Založí životní situaci: incident, morálka, incidentní absence, SMS hráče a u dluhů
 * i lhůta na zálohu a vlákno v chatu. Vrací id incidentu, nebo `null`, když se nezapsal.
 */
export async function zalozSituaci(env: Bindings, stav: StavKlubu, navrh: NavrhIncidentu, id: string = idIncidentu(stav.teamId, navrh.kind, stav.den)): Promise<string | null> {
  const db = env.DB;
  const def = SITUACE_PODLE_KIND.get(navrh.kind);
  const subjectId = navrh.subjectPlayerId;
  if (!def || !subjectId) return null;

  const zapsany = await zapisIncident(db, stav, navrh, id);
  if (!zapsany) return null;

  const rng = createRng(seedFromString(`situace|${id}`));
  const hrac = await nactiHrace(db, stav.teamId, subjectId);

  const davka: D1PreparedStatement[] = [];
  if (def.moralka !== 0) davka.push(posunHrace(db, stav.teamId, subjectId, { morale: def.moralka }));
  if (def.absence) {
    // Ohlášeno aspoň dva dny dopředu, ať SMS den předem i simulace vidí totéž (spec 17a).
    const za = Math.max(MIN_OHLASENI_ABSENCE_DNI, def.absence.dni(rng));
    const od = denPlus(stav.den, za);
    const doDne = denPlus(od, Math.max(1, def.absence.delka(rng)) - 1);
    const p = prikazAbsence(db, {
      incidentId: id, teamId: stav.teamId, playerId: subjectId, druh: def.absence.druh,
      od, do: doDne, zapasu: null, ohlaseno: stav.den, sms: text(rng, `absence_${def.absence.druh}` as KlicTextu),
    });
    if (p) davka.push(p);
  }
  if (navrh.kind === "svatba_spoluhrace") davka.push(...prikazyKocoviny(db, stav, subjectId, rng));
  if (davka.length > 0) {
    await db.batch(davka).catch((e) => logger.error({ module: M }, `dopady situace ${id}`, e));
  }

  if (navrh.kind === "dluhy") {
    // Lhůta na rozhodnutí o záloze (spec 7c). Situace sama běží dál podle `ends_on`.
    await db.prepare("UPDATE club_incidents SET deadline = ? WHERE id = ? AND deadline IS NULL")
      .bind(gameExpiry(stav.gameDate, LHUTA_ROZHODNUTI_DNI), id).run()
      .catch((e) => logger.warn({ module: M }, `lhůta zálohy ${id}`, e));
  }

  if (hrac) {
    await sendPlayerSMS(db, stav.teamId, ref(hrac), text(rng, `sms_situace_${navrh.kind}` as KlicTextu), smsIncidentu(id))
      .catch((e) => logger.warn({ module: M }, `SMS situace ${id}`, e));
    if (navrh.kind === "dluhy") await otevriVlaknoZalohy(env, stav.teamId, subjectId, hrac);
  }
  return id;
}

/** Vlákno `zadost_o_zalohu` (spec 17d). Bez zapnutého modelu se hráč jen ozve SMS. */
async function otevriVlaknoZalohy(env: Bindings, teamId: string, playerId: string, hrac: RadekHrace): Promise<void> {
  if (!(await isAiEnabled(env))) return;
  const convId = await getOrCreatePlayerConversation(env.DB, teamId, ref(hrac))
    .catch((e) => { logger.warn({ module: M }, `konverzace o záloze ${playerId}`, e); return null; });
  if (!convId) return;
  const ted = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE conversations SET ai_thread_active = 1, ai_thread_last_at = ?, ai_thread_state = ?
      WHERE id = ? AND ai_thread_active != 1`,
  ).bind(ted, JSON.stringify({
    trigger: "zadost_o_zalohu", scenario_id: "zadost_o_zalohu", max_replies: 2, current_replies: 0,
    awaiting: "coach", initiated_at: ted, player_id: playerId, resolution: null,
  }), convId).run()
    .catch((e) => logger.warn({ module: M }, `vlákno o záloze ${convId}`, e));
}

/** Situace, kterým vypršel `ends_on` (spec 6b krok 4). Vrací počet ukončených. */
export async function ukonciSituace(env: Bindings, t: { teamId: string; gameDate: string }): Promise<number> {
  const rows = await env.DB.prepare(
    `UPDATE club_incidents SET status = 'uzavreny', resolution = 'skoncila', resolved_on = ?
      WHERE team_id = ? AND status = 'probiha' AND ends_on IS NOT NULL AND ends_on <= ?
      RETURNING id, kind, subject_player_id`,
  ).bind(t.gameDate, t.teamId, t.gameDate).all<{ id: string; kind: string; subject_player_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `ukončení situací ${t.teamId}`, e); return null; });
  return rows?.results.length ?? 0;
}

/** Záloha, o které trenér do lhůty nerozhodl, se počítá za odmítnutou (spec 7e). */
export async function propadleZalohy(env: Bindings, t: { teamId: string; gameDate: string }): Promise<number> {
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT id, subject_player_id FROM club_incidents
      WHERE team_id = ? AND status = 'probiha' AND kind = 'dluhy'
        AND deadline IS NOT NULL AND deadline <= ? AND json_extract(resolution_data, '$.zaloha') IS NULL`,
  ).bind(t.teamId, t.gameDate).all<{ id: string; subject_player_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `propadlé zálohy ${t.teamId}`, e); return null; });

  let propadlo = 0;
  for (const r of rows?.results ?? []) {
    const zapsano = await db.prepare(
      `UPDATE club_incidents SET resolution_data = json_object('zaloha', 'odmitnuto', 'propadla', 1)
        WHERE id = ? AND team_id = ? AND status = 'probiha' AND json_extract(resolution_data, '$.zaloha') IS NULL`,
    ).bind(r.id, t.teamId).run()
      .catch((e) => { logger.error({ module: M }, `propadnutí zálohy ${r.id}`, e); return null; });
    if ((zapsano?.meta?.changes ?? 0) === 0) continue;
    propadlo++;
    if (!r.subject_player_id) continue;
    await db.batch([posunHrace(db, t.teamId, r.subject_player_id, { morale: ODMITNUTA_ZALOHA_MORALKA, vztah: ODMITNUTA_ZALOHA_VZTAH })])
      .catch((e) => logger.warn({ module: M }, `dopad propadlé zálohy ${r.id}`, e));
    const hrac = await nactiHrace(db, t.teamId, r.subject_player_id);
    if (hrac) {
      await sendPlayerSMS(db, t.teamId, ref(hrac), text(createRng(seedFromString(`zaloha|${r.id}`)), "zaloha_propadla"), smsIncidentu(r.id))
        .catch((e) => logger.warn({ module: M }, `SMS propadlé zálohy ${r.id}`, e));
    }
  }
  return propadlo;
}

/** Rozhodnutí trenéra o záloze (spec 7c). Půjčka se splácí čtyři pondělky ze mzdy. */
export async function rozhodniZalohu(
  env: Bindings, teamId: string, incidentId: string, akce: "pujcit" | "odmitnout",
): Promise<VysledekAkce<{ castka: number | null }>> {
  const db = env.DB;
  const [inc, gameDate] = await Promise.all([nactiIncident(db, teamId, incidentId), herniDatum(db, teamId)]);
  if (!inc || !gameDate) return { ok: false, kod: 404, chyba: "Incident nenalezen" };
  if (inc.kind !== "dluhy" || inc.status !== "probiha" || !inc.subject_player_id) {
    return { ok: false, kod: 409, chyba: "O záloze teď rozhodnout nejde" };
  }

  const rng = createRng(seedFromString(`zaloha|${incidentId}`));
  const castka = akce === "pujcit" ? rng.int(ZALOHA_MIN_KC / 100, ZALOHA_MAX_KC / 100) * 100 : null;
  const data = akce === "pujcit"
    ? JSON.stringify({ zaloha: "pujceno", celkem: castka, tydnuZbyva: ZALOHA_TYDNU })
    : JSON.stringify({ zaloha: "odmitnuto" });

  const narok = await db.prepare(
    `UPDATE club_incidents SET resolution_data = ?
      WHERE id = ? AND team_id = ? AND status = 'probiha' AND json_extract(resolution_data, '$.zaloha') IS NULL`,
  ).bind(data, incidentId, teamId).run()
    .catch((e) => { logger.error({ module: M }, `rozhodnutí o záloze ${incidentId}`, e); return null; });
  if ((narok?.meta?.changes ?? 0) === 0) return { ok: false, kod: 409, chyba: "O záloze už bylo rozhodnuto" };

  const hrac = await nactiHrace(db, teamId, inc.subject_player_id);
  const jmeno = hrac ? `${hrac.first_name} ${hrac.last_name}` : nazevSituace(inc.kind);
  if (akce === "pujcit" && castka) {
    await recordTransaction(db, teamId, "incident_advance", -castka, `Záloha na mzdu: ${jmeno}`, gameDate, `zaloha-${incidentId}`)
      .catch((e) => logger.error({ module: M }, `výplata zálohy ${incidentId}`, e));
  }
  await db.batch([posunHrace(db, teamId, inc.subject_player_id, akce === "pujcit"
    ? { morale: ZALOHA_MORALKA, vztah: ZALOHA_VZTAH }
    : { morale: ODMITNUTA_ZALOHA_MORALKA, vztah: ODMITNUTA_ZALOHA_VZTAH })])
    .catch((e) => logger.warn({ module: M }, `dopad zálohy ${incidentId}`, e));
  if (hrac) {
    await sendPlayerSMS(db, teamId, ref(hrac), text(rng, akce === "pujcit" ? "zaloha_pujcena" : "zaloha_odmitnuta"), smsIncidentu(incidentId))
      .catch((e) => logger.warn({ module: M }, `SMS o záloze ${incidentId}`, e));
  }
  return { ok: true, castka };
}
```

- [ ] **Step 4: Splátky zálohy v pondělním kroku**

V `vysetrovani-den.ts: zauctujSrazky` rozšířit dotaz i popis (jediná změna, zbytek funkce beze změny):

```ts
  const rows = await db.prepare(
    `SELECT i.id, i.resolution, i.resolution_data, p.first_name, p.last_name
       FROM club_incidents i
       LEFT JOIN players p ON p.id = COALESCE(i.culprit_player_id, i.subject_player_id) AND p.team_id = i.team_id
        AND (p.status IS NULL OR p.status = 'active')
      WHERE i.team_id = ? AND (i.resolution = 'srazka' OR json_extract(i.resolution_data, '$.zaloha') = 'pujceno')
        AND COALESCE(json_extract(i.resolution_data, '$.tydnuZbyva'), 0) > 0`,
  ).bind(t.teamId).all<RadekSrazky>()
```

`RadekSrazky` dostane `resolution: string | null` a popis transakce se vybere podle něj:

```ts
    const popis = r.resolution === "srazka"
      ? `Srážka ze mzdy (${tyden}/${SRAZKA_TYDNU}): ${jmeno}`
      : `Splátka zálohy (${tyden}/${SRAZKA_TYDNU}): ${jmeno}`;
```

Do `vysetrovani-den.test.ts` přidat test „splátka zálohy se strhne stejně jako srážka": pravidlo `{ sql: /FROM club_incidents i/, all: [{ id: "inc-z", resolution: "skoncila", resolution_data: JSON.stringify({ zaloha: "pujceno", celkem: 4000, tydnuZbyva: 4 }), first_name: "Jan", last_name: "Svědek" }] }` → očekávej `recordTransaction` s typem `incident_deduction` a popisem obsahujícím „Splátka zálohy".

- [ ] **Step 5: Typ transakce**

V `season/finance-processor.ts` do `TransactionType` za `incident_recovery`:

```ts
  // Záloha na mzdu hráči v dluzích (spec 7c). Klub ji vyplatí a čtyři pondělky si ji strhává zpátky.
  // ZÁMĚRNĚ není v PURCHASE_TYPES: je to rozhodnutí o hráči, ne nákup, a při záporném rozpočtu
  // se trenér stejně rozhoduje sám.
  | "incident_advance"
```

- [ ] **Step 6: Denní krok**

V `denni-krok.ts` za vyhodnocení hrozících činů (`if (splneno > 0) return;`):

```ts
  // Konec životních situací a propadlé lhůty na zálohu (spec 6b krok 4).
  await ukonciSituace(env, { teamId, gameDate }).catch((e) => logger.warn({ module: M, teamId }, "konec situací", e));
  await propadleZalohy(env, { teamId, gameDate }).catch((e) => logger.warn({ module: M, teamId }, "propadlé zálohy", e));
```

a na konec funkce, za zápis náhodného problému:

```ts
  const zapsany = await zapisIncident(env.DB, stav, navrh);
  if (!zapsany) return;
  await oznamIncident(env, teamId, navrh, zapsany);
  logger.info({ module: M, teamId }, `incident ${navrh.kind}, pachatel ${navrh.culpritType}, stop nalezeno ${zapsany.nalezeneStopy.length}`);
```

se změní na: když se problém nevylosoval, zkusí se životní situace (spec 6b krok 7 — jeden incident na den):

```ts
  const navrh = vylosujIncident(stav, rng);
  if (!navrh) {
    // Žádný problém: může přijít životní situace (spec 4c).
    const situace = vylosujSituaci(stav, createRng(seedFromString(`situace|${teamId}|${stav.den}`)));
    if (situace) {
      const id = await zalozSituaci(env, stav, situace)
        .catch((e) => { logger.warn({ module: M, teamId }, "založení situace", e); return null; });
      if (id) logger.info({ module: M, teamId }, `situace ${situace.kind} pro hráče ${situace.subjectPlayerId}`);
    }
    return;
  }
  const zapsany = await zapisIncident(env.DB, stav, navrh);
  …
```

- [ ] **Step 7: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/incidents/situace-db.ts apps/api/src/incidents/situace-db.test.ts apps/api/src/incidents/denni-krok.ts apps/api/src/incidents/vysetrovani-den.ts apps/api/src/incidents/vysetrovani-den.test.ts apps/api/src/season/finance-processor.ts
git commit -F - <<'EOF'
feat(incidenty): zivotni situace v dennim kroku a zaloha na mzdu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: Situace v omluvenkách na zápas

**Files:**
- Modify: `apps/api/src/incidents/absence-hracu.ts`
- Modify: `apps/api/src/events/absence.ts`
- Test: `apps/api/src/incidents/absence-hracu.test.ts`, `apps/api/src/events/absence-determinism.test.ts`

**Interfaces:**
- Consumes: konstanty `DLUHY_SANCE_NAVIC`, `RIDICAK_SANCE_NAVIC` (Task 1); situace v `club_incidents` (Task 4).
- Produces:
  - `DruhVlivu = "obvineny" | "pachatel" | "dluhy" | "prisel_o_praci" | "rozvod" | "zabaveny_ridicak"`
  - `IncidentProVliv` o `status`, `kind`, `subject_player_id`, `ends_on`
  - `AbsenceOpts.isAway?: boolean` a `AbsenceOpts.maDodavku?: boolean`

- [ ] **Step 1: Failing testy**

Do `apps/api/src/incidents/absence-hracu.test.ts`:

```ts
describe("vlivy životních situací", () => {
  const dnes = "2026-09-17";
  const situace = (kind: string, over: Partial<IncidentProVliv> = {}): IncidentProVliv => ({
    culprit_player_id: null, culprit_revealed: 0, accused: "[]", game_date: "2026-09-10",
    status: "probiha", kind, subject_player_id: "s", ends_on: "2026-10-05", ...over,
  });

  it("běžící situace dá hráči svůj druh vlivu", () => {
    expect(druhyHracu([situace("dluhy")], dnes).get("s")).toEqual(["dluhy"]);
    expect(druhyHracu([situace("rozvod")], dnes).get("s")).toEqual(["rozvod"]);
  });

  it("skončená ani uzavřená situace už nepůsobí", () => {
    expect(druhyHracu([situace("dluhy", { ends_on: "2026-09-16" })], dnes).has("s")).toBe(false);
    expect(druhyHracu([situace("dluhy", { status: "uzavreny" })], dnes).has("s")).toBe(false);
  });

  it("situace, které na nic nenapojujeme, druh nedávají", () => {
    expect(druhyHracu([situace("svatba_spoluhrace")], dnes).has("s")).toBe(false);
  });
});
```

(import `IncidentProVliv` a `druhyHracu` z `./absence-hracu`.)

Do `apps/api/src/events/absence-determinism.test.ts`:

```ts
describe("životní situace v omluvenkách (spec 17a)", () => {
  const hraci = (druhy?: string[]) => [{
    ...hracProAbsenci({
      first_name: "Jan", last_name: "Dlužník", age: 30,
      personality: JSON.stringify({ discipline: 60, patriotism: 60, alcohol: 40, temper: 40 }),
      life_context: JSON.stringify({ morale: 60, occupation: "Zedník" }),
      physical: JSON.stringify({ stamina: 60 }), commute_km: 0, is_celebrity: 0,
    }, druhy),
  }];

  const kolikChybi = (druhy: string[] | undefined, opts: Parameters<typeof generateAbsences>[2] = {}) => {
    let n = 0;
    for (let s = 1; s <= 400; s++) n += generateAbsences(createRng(s), hraci(druhy), { timing: "any", ...opts }).length;
    return n;
  };

  it("dluhy přidají brigády a vlastní výmluvu", () => {
    expect(kolikChybi(["dluhy"])).toBeGreaterThan(kolikChybi(undefined));
    const texty = new Set<string>();
    for (let s = 1; s <= 400; s++) {
      for (const a of generateAbsences(createRng(s), hraci(["dluhy"]), { timing: "any" })) {
        if (a.reason === "Dluhy") texty.add(a.smsText);
      }
    }
    expect(texty.size).toBeGreaterThanOrEqual(3);
  });

  it("zabavený řidičák chybí jen venku a jen bez klubové dodávky", () => {
    const doma = kolikChybi(["zabaveny_ridicak"], { isAway: false });
    const venku = kolikChybi(["zabaveny_ridicak"], { isAway: true });
    const venkuSDodavkou = kolikChybi(["zabaveny_ridicak"], { isAway: true, maDodavku: true });
    expect(venku).toBeGreaterThan(doma);
    expect(venkuSDodavkou).toBeLessThan(venku);
  });

  it("kdo přišel o práci, nevymlouvá se na práci", () => {
    for (let s = 1; s <= 400; s++) {
      for (const a of generateAbsences(createRng(s), hraci(["prisel_o_praci"]), { timing: "any" })) {
        expect(a.category).not.toBe("professional");
      }
    }
  });

  it("bez situace se los nemění", () => {
    const bez = generateAbsences(createRng(42), hraci(undefined), { timing: "any" });
    const sVlivem = generateAbsences(createRng(42), hraci(["pachatel"]), { timing: "any" });
    expect(sVlivem).toEqual(bez);
  });
});
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/absence-hracu.test.ts src/events/absence-determinism.test.ts`
Expected: FAIL (situace nedávají druhy, modifikátory a pooly chybí).

- [ ] **Step 3: `absence-hracu.ts`**

```ts
export type DruhVlivu = "obvineny" | "pachatel" | "dluhy" | "prisel_o_praci" | "rozvod" | "zabaveny_ridicak";

/** Situace, které mění docházku, výmluvy nebo zápas. Svatba a narození dítěte jdou přes absence, ne přes vliv. */
const SITUACE_S_VLIVEM: ReadonlySet<string> = new Set(["dluhy", "prisel_o_praci", "rozvod", "zabaveny_ridicak"]);

export interface IncidentProVliv {
  culprit_player_id: string | null;
  culprit_revealed: number;
  accused: string;
  game_date: string;
  /** Životní situace (spec 4c): působí, dokud běží. */
  status?: string;
  kind?: string;
  subject_player_id?: string | null;
  ends_on?: string | null;
}
```

Ve `druhyHracu` na konec smyčky přes incidenty:

```ts
    // Životní situace působí, dokud běží, ne podle okna od vzniku (spec 4c).
    if (inc.status === "probiha" && inc.subject_player_id && inc.kind && SITUACE_S_VLIVEM.has(inc.kind)
      && (!inc.ends_on || inc.ends_on.slice(0, 10) >= datum.slice(0, 10))) {
      pridej(inc.subject_player_id, inc.kind as DruhVlivu);
    }
```

a dotaz v `nactiDruhyHracu`:

```ts
    `SELECT culprit_player_id, culprit_revealed, accused, game_date, status, kind, subject_player_id, ends_on
       FROM club_incidents
      WHERE team_id = ? AND (
        (game_date >= ? AND (accused != '[]' OR culprit_revealed = 1))
        OR (status = 'probiha' AND subject_player_id IS NOT NULL))`,
```

- [ ] **Step 4: `events/absence.ts`**

Do `AbsenceOpts`:

```ts
  /** Hraje se venku? Bez řidičáku je cesta na venkovní zápas problém (spec 17a). */
  isAway?: boolean;
  /** Má klub dodávku (`team_van` ≥ 1)? Pak se hráč bez řidičáku sveze. */
  maDodavku?: boolean;
```

Za konstanty obvinění:

```ts
/** Brigády kvůli dluhům (spec 4c). */
const DLUHY_SANCE_NAVIC = 0.05;
const DLUHY_VAHA_VYMLUVY = 0.5;
const DLUHY_EXCUSES = [
  { text: "Vzal jsem si brigádu, potřebuju peníze. Omlouvám se.", emoji: "\u{1F4B8}" },
  { text: "Musím do práce navíc, doma to jinak nedám.", emoji: "\u{1F4B8}" },
  { text: "Dneska vydělávám jinde, trenére. Potřebuju to.", emoji: "\u{1F4B0}" },
  { text: "Beru melouch, nemám na výběr.", emoji: "\u{1F6E0}" },
  { text: "Musím řešit peníze, na fotbal teď nemám hlavu.", emoji: "\u{1F614}" },
];

/** Bez řidičáku se venkovní zápas veze hůř (spec 4c). */
const RIDICAK_SANCE_NAVIC = 0.12;
const RIDICAK_VAHA_VYMLUVY = 0.6;
const RIDICAK_EXCUSES = [
  { text: "Nemám řidičák a nikdo mě tam nevezme. Omlouvám se.", emoji: "\u{1F6AB}" },
  { text: "Bez papírů se tam nedostanu, trenére.", emoji: "\u{1F68C}" },
  { text: "Odvoz mi padl a autem jet nemůžu.", emoji: "\u{1F697}" },
  { text: "Na vlak to nestíhám a řídit nesmím.", emoji: "\u{1F686}" },
  { text: "Venku hrát nemůžu, nemám se jak dopravit.", emoji: "\u{1F6AB}" },
];

/** Kdo přišel o práci, má jiné starosti (spec 4c). */
const BEZ_PRACE_VAHA_VYMLUVY = 0.4;
const BEZ_PRACE_EXCUSES = [
  { text: "Sháním práci, mám dneska pohovor. Omlouvám se.", emoji: "\u{1F4BC}" },
  { text: "Musím na úřad práce, jinak přijdu o podporu.", emoji: "\u{1F4C4}" },
  { text: "Řeším, z čeho budu žít. Fotbal teď nestíhám.", emoji: "\u{1F614}" },
  { text: "Jdu se ptát po práci do sousední vesnice.", emoji: "\u{1F6B6}" },
  { text: "Bez práce mi není do fotbalu, trenére.", emoji: "\u{1F61E}" },
];
```

V `generateAbsences` za blok obviněného:

```ts
    const situace = (kind: string) => p.incident?.druhy.includes(kind) ?? false;
    if (situace("dluhy")) baseChance += DLUHY_SANCE_NAVIC;
    // Bez řidičáku doma problém není, a s klubovou dodávkou se sveze i ven.
    const ridicakVadi = situace("zabaveny_ridicak") && !!opts.isAway && !opts.maDodavku;
    if (ridicakVadi) baseChance += RIDICAK_SANCE_NAVIC;
```

ve váhách kategorií za `if (obvineny) weights.incident = OBVINENY_VAHA_VYMLUVY;`:

```ts
    // Kdo nemá práci, se na práci nevymluví (spec 4c).
    if (situace("prisel_o_praci")) weights.professional = 0;
    const situacniVaha = situace("dluhy") ? DLUHY_VAHA_VYMLUVY
      : ridicakVadi ? RIDICAK_VAHA_VYMLUVY
      : situace("prisel_o_praci") ? BEZ_PRACE_VAHA_VYMLUVY : 0;
    if (situacniVaha > 0) weights.situace = situacniVaha;
```

`AbsenceResult["category"]` rozšířit o `"situace"`, přidat větev do `switch` a popisky:

```ts
      case "situace": {
        const pool = situace("dluhy") ? DLUHY_EXCUSES : ridicakVadi ? RIDICAK_EXCUSES : BEZ_PRACE_EXCUSES;
        const pick = rng.pick(pool);
        smsText = pick.text;
        emoji = pick.emoji;
        excuseTiming = "day_before";
        break;
      }
```

```ts
    const CATEGORY_LABELS: Record<string, string> = {
      professional: "Práce", personal: "Osobní", absurd: "Jiné",
      health: "Zdraví", hangover: "Kocovina", commute: "Doprava", incident: "Po obvinění",
      situace: situace("dluhy") ? "Dluhy" : ridicakVadi ? "Bez řidičáku" : "Bez práce",
    };
```

a do `categoryTiming` `situace: "day_before"`.

- [ ] **Step 5: Kolizní výmluvy pryč**

Z `PERSONAL_EXCUSES` smazat řádek „Manželka rodí! Ne teď, ale prý co kdyby" (narození dítěte je teď skutečná situace) a z poolu celebrit „Nemůže, řídil opilý a vzali mu řidičák" (řidičák je teď situace). Komentář nad oběma pooly doplnit jednou větou proč.

- [ ] **Step 6: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/events src/incidents && npx tsc --noEmit`
Expected: PASS. Pokud některý existující test počítá s přesným zněním smazaných výmluv, oprav ten test, ne pool.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/incidents/absence-hracu.ts apps/api/src/incidents/absence-hracu.test.ts apps/api/src/events/absence.ts apps/api/src/events/absence-determinism.test.ts
git commit -F - <<'EOF'
feat(incidenty): zivotni situace v omluvenkach na zapas

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: Situace v tréninku a v zápase

**Files:**
- Modify: `apps/api/src/season/training.ts`
- Modify: `apps/api/src/season/daily-tick.ts`
- Modify: `apps/api/src/routes/game.ts` (náhled tréninku)
- Modify: `apps/api/src/incidents/zapas.ts`
- Test: `apps/api/src/season/training-incident.test.ts`, `apps/api/src/incidents/zapas.test.ts`

**Interfaces:**
- Consumes: `TRENINK_SITUACE`, `ZAPAS_ROZVOD_MORALKA`, `ZAPAS_ROZVOD_KONZISTENCE`, `ZAPAS_NAROZENI_MORALKA` (Task 1); `nactiDruhyHracu` se situacemi (Task 5).
- Produces:
  - `simulateAttendance(rng, squad, approach, commuteKms, attendanceBonus, managerDiscipline, incidentniDuvody, situaceHracu?)` a stejný nový parametr na konci `simulateTraining`
  - `upravSestavuZIncidentu` počítá i situace

- [ ] **Step 1: Failing testy**

Do `apps/api/src/season/training-incident.test.ts` (nebo nový popis, pokud soubor testuje něco jiného):

```ts
describe("docházka podle životní situace (spec 17b)", () => {
  const squad = (n: number) => Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, firstName: "Hráč", lastName: String(i), age: 27, position: "MID",
    discipline: 50, skills: {}, personality: { discipline: 50, workRate: 50 },
  })) as never[];

  const kolikPrislo = (situace?: Array<readonly string[] | undefined>) => {
    let prislo = 0;
    for (let s = 1; s <= 200; s++) {
      const r = simulateTrainingProSituace(createRng(s), squad(1), situace);
      prislo += r.filter((a) => a.attended).length;
    }
    return prislo;
  };

  it("kdo přišel o práci nebo se rozvádí, chodí víc; kdo má dluhy, míň", () => {
    const bez = kolikPrislo(undefined);
    expect(kolikPrislo([["prisel_o_praci"]])).toBeGreaterThan(bez);
    expect(kolikPrislo([["rozvod"]])).toBeGreaterThan(bez);
    expect(kolikPrislo([["dluhy"]])).toBeLessThan(bez);
  });
});
```

`simulateTrainingProSituace` je tenký pomocník v testu, který zavolá exportovanou `simulateAttendance`; pokud je funkce dnes privátní, exportuj ji (`export function simulateAttendance`) a v testu ji volej přímo se stejnými parametry jako `simulateTraining`.

Do `apps/api/src/incidents/zapas.test.ts`:

```ts
describe("životní situace v zápase (spec 17c)", () => {
  it("rozvod bere morálku i konzistenci, narození dítěte morálku přidá", () => {
    const sestava = [[{ id: 1, morale: 60, consistency: 60 }, { id: 2, morale: 60, consistency: 60 }]];
    const idMap = new Map([[1, "r"], [2, "n"]]);
    const r = upravSestavuZIncidentu(sestava, idMap, new Map([["r", ["rozvod"]], ["n", ["narozeni_ditete"]]]));
    expect(sestava[0][0]).toMatchObject({ morale: 55, consistency: 55 });
    expect(sestava[0][1].morale).toBe(65);
    // Dočasné je jen zhoršení: kladná změna se po zápase neodečítá.
    expect(r.moraleDelta.get(1)).toBe(-5);
    expect(r.moraleDelta.get(2)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/season/training-incident.test.ts src/incidents/zapas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Trénink**

`simulateAttendance` dostane nový poslední parametr a modifikátor:

```ts
  /** Běžící životní situace po indexech kádru (spec 17b). */
  situaceHracu?: ReadonlyArray<readonly string[] | undefined>,
```

za výpočet `attendProb` (před ořezem na 0,05–0,95):

```ts
    // Životní situace: kdo je doma bez práce nebo se rozvádí, chodí radši na hřiště; dluhy berou čas brigádami.
    for (const kind of situaceHracu?.[i] ?? []) attendProb += TRENINK_SITUACE[kind] ?? 0;
```

`simulateTraining` parametr jen propouští dál (`situaceHracu` za `incidentniDuvody`).

V `daily-tick.ts` u volání `simulateTraining` doplnit situace ze stejného zdroje jako důvody:

```ts
        const { nactiIncidentniAbsence, duvodyNaTrenink } = await import("../incidents/absence-hracu");
        const { nactiDruhyHracu } = await import("../incidents/absence-hracu");
        const hraciIds = playersResult.results.map((row) => row.id as string);
        const incidentniDuvody = duvodyNaTrenink(hraciIds, await nactiIncidentniAbsence(env.DB, teamId, effectiveDate.toISOString()));
        const druhy = await nactiDruhyHracu(env.DB, teamId, effectiveDate.toISOString());
        const situaceHracu = hraciIds.map((id) => druhy.get(id));
```

a předat `situaceHracu` jako poslední argument `simulateTraining`.

V náhledu tréninku (`routes/game.ts`, výpočet `attendProb` kolem řádku 505) doplnit stejné modifikátory. Situace se načtou jedním dotazem před smyčkou:

```ts
  const { nactiDruhyHracu } = await import("../incidents/absence-hracu");
  const druhySituaci = await nactiDruhyHracu(c.env.DB, teamId, team.game_date ?? new Date().toISOString());
```

a uvnitř smyčky:

```ts
    const situacniMod = (druhySituaci.get(row.id as string) ?? [])
      .reduce((s, kind) => s + (TRENINK_SITUACE[kind] ?? 0), 0);
    const attendProb = Math.max(0.05, Math.min(0.98,
      (personality.discipline ?? 50) / 100 * 0.6 + 0.3 + approachAttend + ((discipline - 40) / 100) * 0.2
      + equipAttend + staffFx.trainingAttendanceBonus + situacniMod));
```

(`TRENINK_SITUACE` importovat z `../incidents/nastaveni`.)

- [ ] **Step 4: Zápas**

V `incidents/zapas.ts` za konstanty obvinění:

```ts
const SITUACE_MORALKA: Record<string, number> = { rozvod: ZAPAS_ROZVOD_MORALKA, narozeni_ditete: ZAPAS_NAROZENI_MORALKA };
const SITUACE_KONZISTENCE: Record<string, number> = { rozvod: ZAPAS_ROZVOD_KONZISTENCE };
```

a v `upravSestavuZIncidentu` do smyčky přes skupiny (vedle obviněných):

```ts
    for (const h of skupina) {
      for (const kind of druhyHrace(h)) {
        const moralka = SITUACE_MORALKA[kind];
        if (moralka) {
          const puvodni = h.morale;
          h.morale = Math.max(0, Math.min(100, h.morale + moralka));
          // Po zápase se odečítá jen postih; radost z narození dítěte si hráč nechá.
          if (moralka < 0) pridejDeltu(h, puvodni);
        }
        const konzistence = SITUACE_KONZISTENCE[kind];
        if (konzistence) h.consistency = Math.max(0, h.consistency + konzistence);
      }
    }
```

`narozeni_ditete` se do `druhyHracu` nedostane (Task 5 ho mezi vlivy nemá), takže v zápase se projeví jen přes `club_incident_absences` — a to je správně: v den porodu hráč nehraje. Konstanta `ZAPAS_NAROZENI_MORALKA` zůstává pro testy a pro fázi, kdy se narození přidá mezi vlivy; test výše ji volá napřímo přes `upravSestavuZIncidentu`.

- [ ] **Step 5: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/season src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/season/training.ts apps/api/src/season/daily-tick.ts apps/api/src/season/training-incident.test.ts apps/api/src/routes/game.ts apps/api/src/incidents/zapas.ts apps/api/src/incidents/zapas.test.ts
git commit -F - <<'EOF'
feat(incidenty): zivotni situace v treninku a v zapase

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 7: Situace v chatu s hráčem

**Files:**
- Modify: `apps/api/src/messaging/ai-player-scenarios.ts`
- Modify: `apps/api/src/messaging/ai-player-spawn.ts`
- Modify: `apps/api/src/messaging/ai-player-chat.ts`
- Modify: `apps/api/src/messaging/chat-kontext.ts`
- Test: `apps/api/src/messaging/ai-player-chat.test.ts`

**Interfaces:**
- Consumes: situace v `club_incidents` (Task 4), `nactiDruhyHracu` (Task 5).
- Produces:
  - `PlayerSnapshot.zivotniSituace?: { kind: string; label: string }`
  - scénář `zadost_o_zalohu` (weight 0)
  - `domacnostSeSituaci(vek: number, situace?: string): string` v `chat-kontext.ts`

- [ ] **Step 1: Failing testy**

Do `apps/api/src/messaging/ai-player-chat.test.ts`:

```ts
describe("životní situace v chatu (spec 17d)", () => {
  it("scénář žádosti o zálohu existuje, sám se nevylosuje a nesmí si vymýšlet částku", () => {
    const s = getScenarioById("zadost_o_zalohu");
    expect(s).not.toBeNull();
    expect(s?.expectedTurns).toBe(2);
    expect(s?.weight(hrac({ morale: 10 }))).toBe(0);
    expect(s?.description).toContain("NEVYMÝŠLEJ");
  });

  it("hráč se situací ji má v promptu a smí o ní mluvit", () => {
    const p = buildSystemPrompt(hrac({ zivotniSituace: { kind: "rozvod", label: "Rozvod" } }), tym, kdy(2, 18));
    expect(p).toContain("Rozvod");
    expect(p).not.toContain(ZAKAZ_ZIVOTNICH_SITUACI);
  });

  it("bez situace zákaz vymýšlet dál platí", () => {
    expect(buildSystemPrompt(hrac(), tym, kdy(2, 18))).toContain(ZAKAZ_ZIVOTNICH_SITUACI);
  });

  it("při rozvodu bydlí jinde", () => {
    const p = buildSystemPrompt(hrac({ age: 32, zivotniSituace: { kind: "rozvod", label: "Rozvod" } }), tym, kdy(2, 18));
    expect(p).toContain("kabin");
    expect(p).not.toContain("Doma máš ženu");
  });
});
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/messaging/ai-player-chat.test.ts`
Expected: FAIL.

- [ ] **Step 3: Scénář a snapshot**

Do `PlayerSnapshot` (`ai-player-scenarios.ts`) za `znalostiIncidentu`:

```ts
  /**
   * Běžící životní situace hráče (spec 4c). Načítá ji volající z `club_incidents`
   * (`status = 'probiha'`, `subject_player_id`), `undefined` = žádná.
   */
  zivotniSituace?: { kind: string; label: string };
```

Do `AI_PLAYER_SCENARIOS` za `krivde_obvineny`:

```ts
  {
    // Spouští se VÝHRADNĚ z incidents/situace-db.ts při vzniku situace `dluhy`.
    // weight 0 → nikdy náhodně. O penězích rozhoduje trenér tlačítkem, ne model.
    id: "zadost_o_zalohu",
    label: "Prosba o zálohu",
    category: "personal",
    expectedTurns: 2,
    description:
      "Dostal ses do dluhů a požádal jsi trenéra o zálohu na mzdu (první zprávu už jsi poslal). Vysvětli, proč to potřebuješ, a drž se u peněz zkrátka. NEVYMÝŠLEJ si částku, termín ani sliby o splácení, o tom rozhoduje trenér v klubu. Když odmítne, přijmi to a nehádej se dlouho.",
    weight: () => 0,
  },
```

Popisy `family_problem` a `personal_milestone` doplnit o větu, která je naváže na situaci:

```ts
    description:
      "Hráč se svěřuje se starostí doma: hádka s partnerkou, rekonstrukce baráku, starosti s hospodářstvím. Žádá o pochopení, případně pauzu nebo volno na zápas. Když máš v bloku svých starostí uvedenou životní situaci, mluv o ní a nic jiného si nevymýšlej.",
```

```ts
    description:
      "Hráč má v životě milník: svatba, kulaté narozeniny, povýšení v práci, dostavěný barák. Sdílí radost, možná zve trenéra na oslavu, nebo žádá volno. Když máš v bloku svých starostí uvedenou životní situaci, mluv o ní a nic jiného si nevymýšlej.",
```

- [ ] **Step 4: Prompt a domácnost**

V `chat-kontext.ts`:

```ts
/**
 * Kde hráč bydlí. Při rozvodu neplatí věkové pravidlo: spí v kabině nebo u kamaráda (spec 4c).
 */
export function domacnostSeSituaci(vek: number, situace?: string): string {
  if (situace === "rozvod") return "Rozvádíš se, doma to skončilo. Spíš na kabině nebo u kamaráda.";
  if (situace === "prisel_o_praci") return `${domacnost(vek)} Práci teď nemáš, dny jsou dlouhé.`;
  return domacnost(vek);
}
```

V `ai-player-chat.ts: buildSystemPrompt` nahradit volání `domacnost(p.age)` za `domacnostSeSituaci(p.age, p.zivotniSituace?.kind)`, blok o situaci přidat nad blok znalostí:

```ts
  const situace = p.zivotniSituace
    ? `TVOJE ŽIVOTNÍ SITUACE (mluv o ní, když se hodí, nic dalšího si nevymýšlej): ${p.zivotniSituace.label}.`
    : "";
```

a zákaz vymýšlet situace dát jen hráčům bez situace (v `buildSystemPrompt` i v `evaluateResolution`):

```ts
  const zakaz = p.zivotniSituace ? "" : ZAKAZ_ZIVOTNICH_SITUACI;
```

- [ ] **Step 5: Výběr hráče a načtení situace**

V `ai-player-spawn.ts`:
- tam, kde se staví `PlayerSnapshot` (spawn i odpověď), doplnit situaci z jednoho dotazu na tým:

```ts
  const situaceRows = await db.prepare(
    `SELECT subject_player_id AS id, kind FROM club_incidents
      WHERE team_id = ? AND status = 'probiha' AND category = 'zivotni' AND subject_player_id IS NOT NULL`,
  ).bind(teamId).all<{ id: string; kind: string }>()
    .catch((e) => { logger.warn({ module: "ai-player-spawn" }, "životní situace hráčů", e); return { results: [] as Array<{ id: string; kind: string }> }; });
  const situace = new Map(situaceRows.results.map((r) => [r.id, r.kind]));
```

a u každého snapshotu `zivotniSituace: situace.has(p.id) ? { kind: situace.get(p.id)!, label: nazevSituace(situace.get(p.id)!) } : undefined` (`nazevSituace` z `../incidents/situace`).

- v `pickPlayerWeighted` přidat váhu:

```ts
    if (p.zivotniSituace) w += 2; // kdo něco řeší, spíš se ozve (spec 17d)
```

- [ ] **Step 6: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/messaging src/incidents && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/messaging/ai-player-scenarios.ts apps/api/src/messaging/ai-player-spawn.ts apps/api/src/messaging/ai-player-chat.ts apps/api/src/messaging/ai-player-chat.test.ts apps/api/src/messaging/chat-kontext.ts
git commit -F - <<'EOF'
feat(incidenty): zivotni situace v chatu a zadost o zalohu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 8: Situace v hospodě

**Files:**
- Modify: `apps/api/src/incidents/hospoda.ts`
- Modify: `apps/api/src/incidents/hospoda-db.ts`
- Modify: `apps/api/src/incidents/texty.ts`
- Modify: `apps/api/src/season/pub.ts`
- Test: `apps/api/src/incidents/hospoda.test.ts`, `apps/api/src/incidents/hospoda-db.test.ts`

**Interfaces:**
- Consumes: `SEKERA_SANCE`, `ROZVOD_HOSPODA_NASOBEK` (Task 1), situace v `club_incidents` (Task 4).
- Produces:
  - `TypPribehu` o `"pije_na_sekeru"`, `TYPY_PRIBEHU` o stejnou hodnotu
  - `KontextHospody.situace: ReadonlyMap<string, string>` (hráč → kind) a `KontextHospody.odmitnuteZalohy: ReadonlySet<string>`
  - `TEXTY.hospoda_sekera` (5 vět)

- [ ] **Step 1: Failing testy**

Do `hospoda.test.ts`:

```ts
describe("dluhy v hospodě", () => {
  it("hospodský už nechce nalévat na sekeru a je to varování", () => {
    const k = kontext({ situace: new Map([[SVEDEK.id, "dluhy"]]) });
    const r = pribehyHospody([host(SVEDEK)], k, JISTE);
    const p = r.pribehy.find((x) => x.type === "pije_na_sekeru");
    expect(p?.text).toContain("Pepa Kos");
    expect(p?.effects).toEqual([]);
    expect(r.zapisy).toEqual([]);
  });

  it("bez dluhů se na sekeru nepije", () => {
    expect(pribehyHospody([host(SVEDEK)], kontext(), JISTE).pribehy.filter((p) => p.type === "pije_na_sekeru")).toEqual([]);
  });

  it("hráč s odmítnutou zálohou smí ohlásit čin i bez povahy pachatele", () => {
    const svaty = hrac({ id: "x", jmeno: "Jan Svatý", alkohol: 90, disciplina: 95, vernost: 95, vztahKTrenerovi: 90 });
    const k = kontext({ kadr: new Map([[svaty.id, svaty]]), situace: new Map([[svaty.id, "dluhy"]]), odmitnuteZalohy: new Set([svaty.id]) });
    expect(pribehyHospody([host(svaty)], k, JISTE).ohlaseni).toEqual({ playerId: "x", obvineny: true });
  });
});
```

(`kontext` ve fixtuře dostane `situace: new Map()` a `odmitnuteZalohy: new Set()`; `pije_na_sekeru` nemá žádný zápis do DB, je to jen varování v deníku.)

Do `hospoda-db.test.ts` do pravidel kontextu přidat dotaz na situace a ověřit mapování:

```ts
    { sql: /status = 'probiha' AND category = 'zivotni'/, all: [{ id: "s", kind: "dluhy", zaloha: "odmitnuto" }] },
```

```ts
    expect(k?.situace.get("s")).toBe("dluhy");
    expect(k?.odmitnuteZalohy.has("s")).toBe(true);
```

- [ ] **Step 2: Spustit, musí selhat**

Run: `cd apps/api && npx vitest run src/incidents/hospoda.test.ts src/incidents/hospoda-db.test.ts`
Expected: FAIL.

- [ ] **Step 3: Texty**

Do `TEXTY`:

```ts
  hospoda_sekera: [
    "Hospodský už {hrac} nechce nalévat na sekeru.",
    "{hrac} chtěl psát na sekeru, hospodský zavrtěl hlavou.",
    "{hrac} platil až po domluvě, sekeru už mu hospodský nedá.",
    "U výčepu bylo dusno, {hrac} má u hospodského dluh.",
    "{hrac} si objednal a hospodský mu připomněl, co dluží.",
  ],
```

- [ ] **Step 4: `hospoda.ts`**

Typ příhody a kontext:

```ts
export type TypPribehu =
  | "drby_o_incidentu" | "nabizi_zbozi" | "stezuje_si_na_trenera" | "rvacka_kvuli_kradezi"
  | "cela_hospoda_resi" | "chlubi_se" | "ohlasuje_cin" | "pije_na_sekeru";
```

(a stejná hodnota do `TYPY_PRIBEHU`.)

```ts
  /** Hráč → kind běžící životní situace (spec 4c). */
  situace: ReadonlyMap<string, string>;
  /** Hráči, kterým trenér odmítl zálohu (spec 7c). */
  odmitnuteZalohy: ReadonlySet<string>;
```

Nová příhoda (volá se z `pribehyHospody` za `celaHospoda`):

```ts
/** Kdo má dluhy, na toho už hospodský nepíše. Varování manažerovi, že se to někam řítí (spec 9). */
function sekera(k: KontextHospody, v: VolbyHospody, mistni: readonly HostHospody[], out: VysledekHospody): void {
  for (const h of mistni) {
    if (k.situace.get(h.playerId) !== "dluhy") continue;
    const incidentId = k.incidenty.find((i) => i.id.includes("dluhy"))?.id ?? "";
    if (zaznelo(v, "pije_na_sekeru", h.playerId)) continue;
    const rng = los(k, "sekera", h.playerId);
    if (!vyjde(rng, SEKERA_SANCE, v)) continue;
    out.pribehy.push({
      type: "pije_na_sekeru", playerIds: [h.playerId], effects: [], incidentId,
      text: text(rng, "hospoda_sekera", { hrac: jmeno(h) }),
    });
    return;
  }
}
```

`incidentId` u téhle příhody odkazuje na incident dluhů, aby šel z deníku otevřít; když ho kontext nemá, zůstane prázdný a FE odkaz neukáže. Klíč pro `uzZaznelo` je tady id hráče, ne incidentu (na rozdíl od ostatních příhod jde o stav hráče) — v `zaznelo` se předává jako druhý argument.

V `kdoOhlasi` rozšířit podmínku obviněného:

```ts
    const obvineny = zapreneObvineni(k, h.playerId) !== null || k.odmitnuteZalohy.has(h.playerId);
```

(komentář: „Kdo zapřel obvinění nebo dostal košem u zálohy, má důvod mluvit hloupě.")

- [ ] **Step 5: `hospoda-db.ts`**

Do dávky v `nactiKontextHospody` přidat dotaz:

```ts
    db.prepare(
      `SELECT subject_player_id AS id, kind, json_extract(resolution_data, '$.zaloha') AS zaloha
         FROM club_incidents
        WHERE team_id = ? AND status = 'probiha' AND category = 'zivotni' AND subject_player_id IS NOT NULL`,
    ).bind(t.teamId),
```

a do vráceného kontextu:

```ts
    situace: new Map((situaceRes.results as Array<{ id: string; kind: string }>).map((r) => [String(r.id), String(r.kind)])),
    odmitnuteZalohy: new Set((situaceRes.results as Array<{ id: string; zaloha: string | null }>)
      .filter((r) => r.zaloha === "odmitnuto").map((r) => String(r.id))),
```

- [ ] **Step 6: Rozvod v docházce do hospody**

V `season/pub.ts` v `generatePubSessionsForAllTeams` před losem účasti načíst rozvody týmu:

```ts
    // Kdo se rozvádí, chodí do hospody častěji (spec incidentů 9).
    const rozvody = await db.prepare(
      `SELECT subject_player_id AS id FROM club_incidents
        WHERE team_id = ? AND status = 'probiha' AND kind = 'rozvod' AND subject_player_id IS NOT NULL`,
    ).bind(team.id).all<{ id: string }>()
      .catch((e) => { logger.warn({ module: "pub" }, "rozvody pro hospodu", e); return { results: [] as Array<{ id: string }> }; });
    const poRozvodu = new Set(rozvody.results.map((r) => r.id));
```

a v `attendanceProb` nový kontextový příznak:

```ts
function attendanceProb(p: DbPlayer, ctx: {
  …
  /** Hráč se rozvádí (spec incidentů 4c): doma ho nic nedrží. */
  poRozvodu?: boolean;
}): number {
  …
  if (ctx.poRozvodu) prob *= ROZVOD_HOSPODA_NASOBEK;
```

volané jako `attendanceProb(p, { ...ctx, buddiesAlreadyIn: buddiesIn, rivalsAlreadyIn: rivalsIn, poRozvodu: poRozvodu.has(p.id) })`. `ROZVOD_HOSPODA_NASOBEK` importovat z `../incidents/nastaveni`.

- [ ] **Step 7: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/incidents src/season && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/incidents/hospoda.ts apps/api/src/incidents/hospoda.test.ts apps/api/src/incidents/hospoda-db.ts apps/api/src/incidents/hospoda-db.test.ts apps/api/src/incidents/texty.ts apps/api/src/season/pub.ts
git commit -F - <<'EOF'
feat(incidenty): dluhy a rozvod v hospode

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 9: API a frontend situací

**Files:**
- Modify: `apps/api/src/routes/incidents.ts`
- Modify: `apps/web/src/app/dashboard/incidenty/typy.ts`
- Modify: `apps/web/src/app/dashboard/incidenty/DetailIncidentu.tsx`
- Modify: `apps/web/src/app/dashboard/incidenty/page.tsx`
- Modify: `apps/web/src/app/dashboard/finances/page.tsx`

**Interfaces:**
- Consumes: `rozhodniZalohu`, `ukonciSituace` (Task 4), `vylosujSituaci`/`SITUACE_PODLE_KIND` (Task 2), `zalozSituaci` (Task 4).
- Produces:
  - detail incidentu: `situace: { kind: string; hrac: { playerId: string; jmeno: string | null } | null; endsOn: string | null; zaloha: "pujceno" | "odmitnuto" | null; castka: number | null } | null`, `akce.zaloha: boolean`
  - `POST /api/teams/:teamId/incidents/:id/zaloha` `{ akce: "pujcit" | "odmitnout" }`
  - admin: `POST /api/admin/incidents/force` umí i situace, `POST /api/admin/incidents/situace` `{ teamId, ukoncitTed?: boolean }`

- [ ] **Step 1: API detail a seznam**

Ve `verejnyIncident` přidat dotčeného hráče (jméno je veřejné, situace není tajemství):

```ts
  // Koho se životní situace týká (spec 4c).
  const dotceny = r.category === "zivotni" && r.subject_player_id
    ? { playerId: r.subject_player_id, jmeno: [r.subject_jmeno, r.subject_prijmeni].filter(Boolean).join(" ") || null }
    : null;
```

do vraceného objektu `dotceny,` a `endsOn: r.ends_on ?? null`. Dotazy v seznamu i detailu doplnit o `i.subject_player_id`, `i.ends_on` a LEFT JOIN na hráče situace:

```sql
       LEFT JOIN players sp ON sp.id = i.subject_player_id
```
se sloupci `sp.first_name AS subject_jmeno, sp.last_name AS subject_prijmeni`.

V detailu:

```ts
  const zalohaStav = nactiZalohu(row.resolution_data);
  const situace = row.category === "zivotni"
    ? { kind: row.kind, endsOn: row.ends_on ?? null, zaloha: zalohaStav.zaloha, castka: zalohaStav.celkem }
    : null;
```

kde `nactiZalohu` je malá lokální funkce (JSON parse s catch a `logger.warn`), a do odpovědi `situace` plus `akce: { ...akce, zeptat, promluvit, zaloha: row.kind === "dluhy" && row.status === "probiha" && zalohaStav.zaloha === null }`.

- [ ] **Step 2: Routa zálohy**

```ts
// ── POST /api/teams/:teamId/incidents/:id/zaloha ────────────────────────────
// Půjčit zálohu na mzdu, nebo odmítnout (spec 7c).
incidentsRouter.post("/teams/:teamId/incidents/:id/zaloha", async (c) => {
  const body = await teloPozadavku<{ akce?: string }>(c, "záloha");
  const akce = body?.akce === "pujcit" || body?.akce === "odmitnout" ? body.akce : null;
  if (!akce) return c.json({ error: "Neznámé rozhodnutí" }, 400);
  return odpovedAkce(c, await rozhodniZalohu(c.env, c.req.param("teamId"), c.req.param("id"), akce));
});
```

- [ ] **Step 3: Admin**

V `POST /admin/incidents/force` před hledáním v `KATALOG_PODLE_KIND`:

```ts
  // Životní situace mají vlastní katalog (spec 4c).
  const situace = SITUACE_PODLE_KIND.get(body.kind);
  if (situace) {
    const stav = await nactiStavKlubu(c.env.DB, team, team.game_date, sezona.number);
    if (!stav) return c.json({ error: "Stav klubu se nepodařilo načíst" }, 500);
    const hrac = body.playerId ? stav.kadr.find((h) => h.id === body.playerId) : stav.kadr.find((h) => situace.muze(h));
    if (!hrac) return c.json({ error: "Pro tuhle situaci se v kádru nikdo nehodí" }, 409);
    const rng = createRng(cryptoSeed());
    const navrh: NavrhIncidentu = {
      kind: situace.kind, category: "zivotni", status: "probiha", severity: 1,
      culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
      subjectPlayerId: hrac.id, dniTrvani: situace.trvani(rng), ztraty: [],
      text: text(rng, `situace_${situace.kind}` as never, { hrac: hrac.jmeno }),
    };
    const id = await zalozSituaci(c.env, stav, navrh, `inc-${team.id}-${situace.kind}-${stav.den}-admin-${Date.now()}`);
    return id ? c.json({ ok: true, id, incident: navrh }) : c.json({ error: "Situaci se nepodařilo založit" }, 409);
  }
```

Nová admin routa:

```ts
// ── POST /api/admin/incidents/situace ───────────────────────────────────────
// Jen pro ověření na testingu: `ukoncitTed` posune konec běžících situací na dnešek a ukončí je.
incidentsRouter.post("/admin/incidents/situace", async (c) => {
  const body = await teloPozadavku<{ teamId?: string; ukoncitTed?: boolean }>(c, "admin situace");
  if (!body?.teamId) return c.json({ error: "Chybí teamId" }, 400);
  const db = c.env.DB;
  const team = await db.prepare("SELECT id, game_date FROM teams WHERE id = ?").bind(body.teamId)
    .first<{ id: string; game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "admin situace: tým", e); return null; });
  if (!team?.game_date) return c.json({ error: "Tým nenalezen nebo nemá herní datum" }, 404);
  if (body.ukoncitTed) {
    await db.prepare("UPDATE club_incidents SET ends_on = ? WHERE team_id = ? AND status = 'probiha'")
      .bind(team.game_date, team.id).run()
      .catch((e) => logger.warn({ module: M }, "admin situace: konec situací", e));
  }
  const ukonceno = await ukonciSituace(c.env, { teamId: team.id, gameDate: team.game_date });
  return c.json({ ok: true, ukonceno });
});
```

- [ ] **Step 4: Frontend typy**

`typy.ts`: do `Incident` přidat

```ts
  /** Koho se životní situace týká. */
  dotceny: { playerId: string; jmeno: string | null } | null;
  endsOn: string | null;
```

do `DetailIncidentuData`

```ts
  situace: { kind: string; endsOn: string | null; zaloha: "pujceno" | "odmitnuto" | null; castka: number | null } | null;
```

a `akce` o `zaloha: boolean`. Do `VYSLEDEK_LABEL` `skoncila: "Skončilo"`.

- [ ] **Step 5: Frontend detail a karta**

V `DetailIncidentu.tsx` nad `return`:

```tsx
  const jeSituace = i.category === "zivotni";
  const vysetruje = (i.category === "kradez" || i.category === "poskozeni") && !hrozi && i.resolution !== "nestalo_se";
  const maAkce = akce.obvinit || akce.policie || akce.zeptat || akce.promluvit || akce.zaloha || akce.tresty.length > 0;
```

Blok o situaci za text incidentu:

```tsx
      {jeSituace && i.dotceny?.jmeno && (
        <div>
          <SectionLabel>Koho se to týká</SectionLabel>
          <p className="text-sm"><Hrac playerId={i.dotceny.playerId} jmeno={i.dotceny.jmeno} /></p>
          {i.endsOn && <p className="text-sm text-muted mt-1">Potrvá do {datum(i.endsOn)}.</p>}
          {detail.situace?.zaloha === "pujceno" && detail.situace.castka != null && (
            <p className="text-sm text-muted mt-1">Zálohu jsi půjčil: {kc(detail.situace.castka)}, splácí se čtyři pondělky ze mzdy.</p>
          )}
          {detail.situace?.zaloha === "odmitnuto" && <p className="text-sm text-muted mt-1">Zálohu jsi odmítl.</p>}
        </div>
      )}
```

Akce zálohy (v bloku `maAkce`, před tresty):

```tsx
          {akce.zaloha && (
            <div className="space-y-2">
              <SectionLabel>Záloha na mzdu</SectionLabel>
              <p className="text-sm text-muted">
                Půjčka 3 000 až 8 000 Kč podle toho, jak zle na tom je. Vrací se čtyřmi splátkami ze mzdy. Když nerozhodneš do lhůty, bere se to jako odmítnutí.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => void proved("zaloha", { akce: "pujcit" }, () => "Záloha vyplacena.")}
                  disabled={pracuje}
                  className="px-3 py-2 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white disabled:opacity-50"
                >
                  Půjčit zálohu
                </button>
                <button
                  onClick={() => void proved("zaloha", { akce: "odmitnout" }, () => "Zálohu jsi odmítl.")}
                  disabled={pracuje}
                  className="px-3 py-2 rounded-soft text-sm font-heading font-bold border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                >
                  Odmítnout
                </button>
              </div>
            </div>
          )}
```

V `page.tsx` v `Karta` za blok `ohlasil`:

```tsx
          {i.dotceny?.jmeno && (
            <div className="text-sm mt-2">
              Týká se:{" "}
              <Link href={`/dashboard/player/${i.dotceny.playerId}`} className="text-base font-heading font-bold underline decoration-pitch-500/20 hover:text-pitch-500">
                {i.dotceny.jmeno}
              </Link>
            </div>
          )}
```

a v řádku s datem `{i.status === "probiha" && i.endsOn && \` · potrvá do ${datum(i.endsOn)}\`}`. Text odkazu doplnit o situaci: `i.status === "probiha" ? "Otevřít →" : …` (stávající větev „Otevřít" stačí).

- [ ] **Step 6: Finance**

V `apps/web/src/app/dashboard/finances/page.tsx` do popisků a ikon transakcí přidat `incident_advance: "Záloha hráči"` s ikonou 💸 (klíč a tvar přesně podle toho, jak to soubor dělá u `incident_fine`).

- [ ] **Step 7: Typecheck a build**

Run: `cd apps/api && npx tsc --noEmit && npx vitest run src/incidents` a `cd apps/web && npx tsc --noEmit && npx next build --no-lint`
Expected: bez chyb.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/incidents.ts apps/web/src/app/dashboard/incidenty/typy.ts apps/web/src/app/dashboard/incidenty/DetailIncidentu.tsx apps/web/src/app/dashboard/incidenty/page.tsx apps/web/src/app/dashboard/finances/page.tsx
git commit -F - <<'EOF'
feat(incidenty): API a stranka zivotnich situaci se zalohou

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 10: Spec podle fáze 7a

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-incidenty-design.md`

- [ ] **Step 1: Odchylky**

Každou odchylku z tabulky „Odchylky od specu" tohoto plánu zapiš na své místo: Část 4c (situace jako `club_incidents`, trvání, dopady, absence), 4e (šance a limity), 5a (váha dluhů a odmítnuté zálohy), 6b (kroky 4 a 7), 7c (záloha: částka, splátky přes `resolution_data`, propadlá lhůta), 7e (propadlá záloha), 9 (`pije_na_sekeru`, rozvod v docházce, ohlášení po odmítnuté záloze), 10a (znalost dotčeného hráče), 17a (modifikátory a pooly, přesunuté výmluvy), 17b (docházka), 17c (zápas), 17d (`zadost_o_zalohu`, snapshot, domácnost, váha výběru). Do Části 13 doplň `incidents/situace.ts` a `incidents/situace-db.ts`, do Části 14 admin `POST /api/admin/incidents/situace` a `force` se situacemi, do Části 7f typ transakce `incident_advance`.

- [ ] **Step 2: Pořadí implementace (Část 16)**

Bod 7 rozděl na `7a` (hotovo na testingu, plán `docs/superpowers/plans/2026-09-17-incidenty-faze-7a-zivotni-situace.md`) a `7b` (peněžní krádeže: kasa, tombola, zpronevěra ekonoma, útěk s penězi, `utraci_za_rundy`), s poznámkou, že útěk stojí na situaci `dluhy`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-16-incidenty-design.md
git commit -F - <<'EOF'
docs(incidenty): spec podle faze 7a zivotni situace

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 11: Nasazení na testing a ověření (controller)

Tenhle task dělá controller. Migrace žádná.

- [ ] **Step 1: Celá sada testů a build**

```bash
cd apps/api && npx vitest run && npx tsc --noEmit
cd ../web && npx tsc --noEmit && npx next build --no-lint
```

- [ ] **Step 2: Push a CI**

`git push origin testing`, počkat na `conclusion: success` běhu pro pushnutý commit.

- [ ] **Step 3: Scénář (testovací klub FK Duplex Břevnov, existující session, heslo nezadávat)**

1. **Dluhy a záloha:** `POST /api/admin/incidents/force {teamId, kind: "dluhy", playerId}` → incident `probiha`, `subject_player_id`, `ends_on`, `deadline` za 7 dní, SMS hráče s prosbou o zálohu, vlákno v chatu. MCP: karta „Probíhá", „Týká se", tlačítka Půjčit zálohu / Odmítnout (částka jen v textu, ne v tlačítku).
2. „Půjčit zálohu" → transakce `incident_advance` v mínusu, `resolution_data` se splátkami, SMS hráče s poděkováním, druhý klik vrátí 409.
3. **Odmítnutí a hospoda:** druhý hráč s `dluhy`, „Odmítnout" → morálka a vztah dolů; `POST /api/admin/incidents/hospoda {teamId, hraci:[ten hráč], jiste:true}` → příhoda `pije_na_sekeru` v deníku a možnost ohlásit čin (`ohlasuje_cin`).
4. **Absence a trénink:** `kind: "zabaveny_ridicak"` a `kind: "prisel_o_praci"` na dvou hráčích; zkontrolovat v DB `club_incidents` a v náhledu tréninku (`POST /api/teams/:id/training-preview`, nebo stránka Trénink) změněnou očekávanou docházku.
5. **Absence z porodu:** `kind: "narozeni_ditete"` → řádek v `club_incident_absences` s `kind = 'porod'`, `od_dne >= announced_on + 2`; v sestavě u nejbližšího zápasu se objeví omluvenka s ikonou 👶 (pokud zápas do té doby není, ověřit jen DB).
6. **Konec situace:** `POST /api/admin/incidents/situace {teamId, ukoncitTed: true}` → `ukonceno ≥ 1`, incidenty ve stavu `uzavreny` s výsledkem `skoncila`, splátky zálohy běží dál.
7. **Mobil 400 px:** detail situace a tlačítka zálohy bez přetečení.
8. **Úklid:** ukončit zbylé testovací situace (`ukoncitTed`), vrátit případné ruční úpravy povah.

- [ ] **Step 4: Paměť**

Do `project_prod_deploy_pending.md` doplnit sekci fáze 7a: co přibylo, že migrace není potřeba, co zůstalo neověřené.

✋ **STOP.** Na produkci nic bez výslovného „nasaď na main".

---

## Co zůstává na fázi 7b

| Téma | Co chybí |
|---|---|
| Peněžní krádeže | `kasa_obcerstveni`, `tombola`, `zpronevera_ekonoma` a typ ztráty `penize` + transakce `incident_loss` |
| Útěk s penězi | `utek_s_penezi` nad situací `dluhy` (věrnost < 50, rozpočet > 20 000 Kč, 1× za sezónu), `removePlayer(..., "zmizel")`, varovné signály z hospody |
| Hospoda | `utraci_za_rundy` (pachatel peněžního incidentu platí rundy) |
| Policie | vrácení 50 až 100 % ukradené hotovosti u cizího pachatele |
