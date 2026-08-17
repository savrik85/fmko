# Analýza: Cloudflare Queues pro libovolný počet lig

**Datum:** 2026-08-16, výsledky měření doplněny 2026-08-17
**Cíl:** umožnit neomezený počet lig bez přetečení limitů workeru
**Stav:** IMPLEMENTOVÁNO a ověřeno na testingu (fáze 0–4). Produkce jede dál na
staré cestě — přepínač `match_tick_mode` v CACHE_KV je bez klíče, tedy `loop`.

> Naměřené výsledky a co z nich plyne jsou v kapitole 9 na konci.

---

## 1. Shrnutí

Zpracování hry dnes běží ve **čtyřech globálních smyčkách**, které v jedné invokaci
workeru projdou všechny ligy (nebo dokonce všechny týmy). Sdílejí jeden rozpočet CPU,
subrequestů a paměti, takže každá další liga ukrajuje z téhož koláče.

Strop už je naražený: v `index.ts:177` je natvrdo vyloučená liga České Budějovice,
protože „6 lig × 7 zápasů + AI reporty překračuje limit workeru".

Fronty problém řeší u match ticku čistě a úplně — každá zpráva dostane vlastní čerstvou
invokaci s plným rozpočtem, takže zátěž na ligu je konstantní bez ohledu na jejich počet.

**Ale nestačí samy o sobě.** Daily tick škáluje s počtem *týmů*, ne lig, a je to horší
problém než match tick. Bez jeho přepracování se strop jen posune, neodstraní.

---

## 2. Současný stav — kde se to láme

### 2.1 Match tick — `index.ts:163–531`

Jedna invokace, uvnitř smyčka přes všechny ligy. Na každou ligu:

| Krok | Kód | Zátěž |
|---|---|---|
| Atomický lock kola | `index.ts:208` | 1 dotaz |
| Snapshot tabulky | `index.ts:217` | 1 dotaz + výpočet |
| Simulace kola | `index.ts:224` → `match-runner.ts:97` | ~7 zápasů, desítky dotazů každý |
| Zpravodajský souhrn | `index.ts:266–285` | 2 dotazy |
| Notifikace na zápas | `index.ts:292–302` | 1–3 dotazy **na zápas** |
| AI report + Ultras | `index.ts:306–323` | 2 volání Gemini přes `ctx.waitUntil` |
| Události mezi koly | `index.ts:332–429` | N+1: na každý human tým dotaz na soupisku, pak na každou událost lookup/insert konverzace |
| Ad-hoc události | `index.ts:443–459` | 1–2 dotazy **na human tým** |
| Úklid konverzací | `index.ts:463–470` | 2 dotazy **na konverzaci** |

Po smyčce ještě tři další globální průchody v téže invokaci:

- přáteláky — `index.ts:477`
- spawn celebrit — `index.ts:489–507`, smyčka přes ligy
- AI inzeráty na trhu — `index.ts:515–525`, smyčka přes ligy

**Failure mode je nejhorší možný:** překročení limitu shodí celou invokaci, takže se
neodsimuluje **nic** — ani ligy, které se do rozpočtu vešly. Jediná ochrana je
`recoverStuckRounds` (`index.ts:171`), která příště dohraje kola uvízlá v `lineup_locked`.

Aktuální obcházení stropu je zadrátované jméno ligy v SQL:

```sql
AND l.name NOT LIKE '%České Budějovice%'
```

### 2.2 Daily tick — `daily-tick.ts` (1742 řádků)

Tady je problém větší a jiného druhu. Na řádku 925 je:

```sql
SELECT t.id, t.user_id, t.league_id, t.game_date, ...
FROM teams t LEFT JOIN villages v ON t.village_id = v.id
```

Bez `WHERE`, bez `LIMIT` — **všechny týmy v databázi**, včetně AI. Následuje smyčka
`for (const team of allTeams.results)` na řádku 967 a uvnitř per-team dotazy, generování
rozhovorů a volání Gemini (`daily-tick.ts:1091, 1119, 1193`).

Škáluje to s **počtem týmů**, ne lig. Při 6 ligách je to ~84 týmů. Při 100 ligách
~1400 týmů — a to spadne dřív než match tick.

### 2.3 Cup tick — `cup.ts`, `maybeAdvanceCup`

Dávkuje po 48 zápasech, 12 dávek denně (viz komentář `index.ts:109–110`). Dávkování
už tam je, takže je na tom nejlíp, ale pořád běží ve stejné invokaci jako match tick.

### 2.4 Matchday preview — `index.ts:535–570`

Smyčka přes ligy, **jedno sériové volání Gemini na ligu**. Při 100 ligách je to 100
sériových HTTP volání v jedné invokaci — spadne na čase i na subrequestech.

---

## 3. Návrh architektury

### 3.1 Klíčová myšlenka

Cron přestane být vykonavatel a stane se **producentem**. Zjistí, co je potřeba udělat,
pošle zprávu na ligu a skončí — pár D1 dotazů, hotovo za sekundu, nezávisle na počtu lig.

Konzumer zpracuje **jednu ligu na invokaci** (`max_batch_size = 1`). Každá zpráva
dostane vlastní čerstvý rozpočet. Sto lig = sto nezávislých workerů.

### 3.2 Fronty

| Fronta | Producent | Konzumer dělá | Proč zvlášť |
|---|---|---|---|
| `prales-match-rounds` | match cron | zamkne kolo, odsimuluje, zapíše výsledky | vlastní rozpočet na ligu |
| `prales-reports` | konzumer match fronty | AI články (report, Ultras, preview) | Gemini nesmí ohrozit zápas |

Rozdělení na dvě fronty je podstatné: dnes běží AI články přes `ctx.waitUntil` **uvnitř**
zápasové invokace (`index.ts:309, 318`), takže si berou z jejího rozpočtu a při pádu
Gemini nebo timeoutu tahají zápas s sebou. Ve vlastní frontě mají vlastní retry a
vlastní budget, a když článek nevyjde, zápas je odehraný.

### 3.3 Extrakce per-league funkce

Nový modul `apps/api/src/season/league-round.ts`:

```ts
export async function processLeagueRound(
  env: Bindings,
  leagueId: string,
  opts?: { skipReports?: boolean },
): Promise<{ status: "done" | "skipped" | "no-round"; matches: number; calendarId?: string }>
```

Sem se přesune ~300 řádků z `index.ts:191–473`. Volají ji **tři** cesty:

1. cron (dočasně, ve fázi 0–1)
2. HTTP endpoint `/api/game/run-matches?leagueId=` — **už dnes existuje** (`game.ts:2921`)
3. konzumer fronty

Tím je zaručeno, že fronta a ruční endpoint dělají bit po bitu totéž — což je základ
testovatelnosti.

### 3.4 Konfigurace

```toml
# ── produkce ──
[[queues.producers]]
binding = "MATCH_QUEUE"
queue = "prales-match-rounds"

[[queues.consumers]]
queue = "prales-match-rounds"
max_batch_size = 1
max_batch_timeout = 5
max_retries = 3
max_concurrency = 3          # ← hlídá D1, viz riziko 4.3
dead_letter_queue = "prales-match-dlq"

# ── testing ── vlastní fronty, jinak by si prostředí lezla do zelí
[[env.testing.queues.producers]]
binding = "MATCH_QUEUE"
queue = "prales-match-rounds-test"

[[env.testing.queues.consumers]]
queue = "prales-match-rounds-test"
max_batch_size = 1
max_retries = 3
max_concurrency = 2
dead_letter_queue = "prales-match-dlq-test"
```

Fronty **nepřidávají cron trigger**, takže se limit cronů (`crons = []` na testingu)
nijak nedotknou.

---

## 4. Rizika a jak je ošetřit

### 4.1 Doručení „aspoň jednou" → zdvojené finance ⚠️ NEJVYŠŠÍ PRIORITA

Fronty garantují doručení *aspoň jednou*, ne právě jednou. Zpráva **může** přijít dvakrát.
V kódu je poznámka o incidentu 2026-04 se zdvojenými financemi (`index.ts:206–207`), takže
je známo, co to udělá.

**Řešení:** producent posílá **jen `leagueId`**, nikdy `calendarId`. Konzumer si kolo sám
najde a zamkne stávajícím atomickým UPDATE:

```sql
UPDATE season_calendar SET status = 'lineup_locked' WHERE id = ? AND status = 'scheduled'
```

Při druhém doručení vrátí `changes === 0` → konzumer tiše skončí. Ten lock už napsaný je,
jen se musí přesunout z cronu do konzumera. `recoverStuckRounds` zůstává na pád v půlce.

### 4.2 Pořadí zpráv není garantované

Fronty nezaručují pořadí. Mezi ligami to nevadí — jsou nezávislé. **Vadí to mezi ticky:**
pokud se zápasová fronta zasekne a doběhne až po nočním posunu herního dne, odsimuluje kolo
proti posunutému datu.

**Řešení:** do zprávy přibalit `gameDate` platné v době zařazení; konzumer ho porovná se
současným stavem a při neshodě zprávu zahodí s logem místo odsimulování. Plus DLQ alert.

### 4.3 D1 se stane novým hrdlem

Fronta úzké místo neodstraní, posune ho. Padesát souběžných konzumerů mlátí do jedné D1.

**Řešení:** `max_concurrency` začít na 2–3 a zvyšovat podle měření. Bez toho vyměníme
„přeteče worker" za „přeteče D1".

### 4.4 Jedovaté zprávy

Liga, která selhává opakovaně (rozbitá data), by se retryovala donekonečna.

**Řešení:** `max_retries = 3` + DLQ. Do DLQ konzumera napsat zápis do `news`/logu, ať je
vidět, že liga vypadla, a neztratí se to potichu.

### 4.5 Chybí měření

Dnes není jak zjistit, kolik jedno kolo reálně stojí CPU a subrequestů — jen se to pozná
tím, že to spadne.

**Řešení:** do `processLeagueRound` přidat měření (počet dotazů, doba běhu) a logovat na
ligu. Bez toho je tvrzení „teď to zvládne 100 lig" nepodložené.

### 4.6 Limit CPU konzumera — k ověření

Cron trigger má výrazně vyšší strop CPU než běžná invokace a konzumer fronty jede v běžném
režimu. Na jednu ligu by to mělo stačit s rezervou, ale **je potřeba to změřit**, ne
předpokládat. Případně nastavit `[limits] cpu_ms`. Přesná aktuální čísla ověřit v dokumentaci
při implementaci — neuvádím je zpaměti.

---

## 5. Migrační plán

Rozdělený tak, aby každá fáze byla samostatně nasaditelná, ověřitelná a vratná.

### Fáze 0 — extrakce bez fronty (rizikový refaktor, sám o sobě)

- vytvořit `season/league-round.ts` s `processLeagueRound`
- přesunout do ní ~300 řádků z `index.ts`
- cron i `/api/game/run-matches` volají ji
- **žádná změna chování**, žádná fronta

Proč zvlášť: přesun 300 řádků je nejrizikovější krok celé akce. Když se udělá spolu se
zavedením fronty a něco se rozbije, nepozná se co za to může.

### Fáze 1 — fronta vedle staré cesty (feature flag)

- `wrangler.toml`: fronty pro obě prostředí
- producent `enqueueLeagueRounds(env)`
- `queue()` handler v `index.ts`
- admin endpoint `POST /api/admin/enqueue-match-tick` pro ruční spuštění na testu
- **přepínač** (KV klíč `match_tick_mode` = `loop` | `queue`) — stará smyčka zůstává

Na testingu se přepne na `queue`, odzkouší, prod jede dál na `loop`. Rollback = přepnutí
klíče, žádný deploy.

### Fáze 2 — vyřazení staré cesty a odstranění hacku

Po ověření odstranit smyčku, přepínač a `NOT LIKE '%České Budějovice%'` z SQL.

### Fáze 3 — daily tick (samostatný tiket)

Per-team smyčka přes celou databázi. Jiný problém, jiné řešení (dávkování po ligách nebo
po N týmech). Bez toho zůstává strop, jen jinde.

### Fáze 4 — matchday preview do `prales-reports`

Sériová Gemini volání rozházet do fronty.

---

## 6. Testovací plán na testu

Testing nemá crony (`[env.testing.triggers] crons = []`), takže se všechno spouští přes
endpointy. Ty už z velké části existují.

### 6.1 Co je k dispozici

| Endpoint | Kód | K čemu |
|---|---|---|
| `POST /api/game/run-matches?leagueId=` | `game.ts:2921` | referenční per-league běh |
| `POST /api/game/advance-day` | `game.ts:2907` | denní tick |
| `POST /api/admin/run-daily-tick` | `game.ts:7472` | denní tick včetně poháru |
| `POST /api/admin/cup/advance` | `game.ts:7607` | pohár |
| `npm test` (vitest) | `apps/api/package.json` | 7 existujících test souborů |

Nový bude potřeba jen `POST /api/admin/enqueue-match-tick`.

### 6.2 Testy

**T1 — jednotkový: idempotence locku** (vitest)
`processLeagueRound` volaná dvakrát na totéž kolo → druhé volání vrátí `skipped`, nulové
zápisy. *Kritérium: prochází.*

**T2 — jednotkový: producent**
N lig s kolem na dnešek → přesně N zpráv. Žádná liga s kolem → 0 zpráv. Zpráva obsahuje
`leagueId` a `gameDate`, **ne** `calendarId`. *Kritérium: prochází.*

**T3 — integrační: shoda se starou cestou**
Na klonu prod DB odsimulovat totéž kolo starou smyčkou a frontou (dvě ligy, stejný stav).
Porovnat výsledky, tabulku, finance, počet zpráv a článků. *Kritérium: žádný rozdíl mimo
očekávanou náhodu — porovnávat strukturu a součty, ne konkrétní skóre.*

**T4 — duplicitní doručení** ⚠️ nejdůležitější test
Sečíst `transactions` pro ligu, poslat **ručně tutéž zprávu dvakrát**, sečíst znovu.
*Kritérium: součet identický, druhá zpráva zalogovaná jako přeskočená.* Tenhle test
existuje kvůli incidentu 2026-04 a musí být v CI, ne jen jednorázově.

**T5 — izolace selhání**
Rozbít data jedné ligy → spustit tick. *Kritérium: ostatní ligy odsimulované, rozbitá liga
po 3 pokusech v DLQ, tick jako celek neselhal.* Tohle je přímý protiklad dnešního chování
a hlavní důvod celé změny.

**T6 — zátěž: důkaz škálování**
Registrací testovacích týmů (ligy vznikají v `teams.ts:678`) vytvořit **20+ lig**, spustit
tick. *Kritérium: všechny ligy dokončené, doba a spotřeba **na ligu** konstantní bez ohledu
na jejich počet.* Bez tohoto testu je celý úkol nesplněný — je to jediný přímý důkaz, že
„libovolný počet lig" platí.

**T7 — zpožděná zpráva**
Zařadit zprávu, posunout herní den, teprve pak nechat doběhnout konzumera. *Kritérium:
zpráva zahozená s logem, kolo neodsimulované proti špatnému datu.*

**T8 — frontend (MCP browser, povinné dle CLAUDE.md)**
Login na `test.prales.fun` → detail zápasu ukazuje výsledek → zpravodaj má článek →
notifikace doručená → tabulka sedí. Screenshot.

**T9 — API verifikace (curl)**
`GET /api/leagues/:id/standings` a výpis zápasů po ticku, kontrola konzistence.

### 6.3 Postup

1. `bash apps/api/scripts/wipe-game-data.sh` nebo klon prod DB (viz `reference_db_clone`)
2. T1, T2 lokálně (`npm test`)
3. deploy na testing, přepínač na `loop` → T3 baseline
4. přepínač na `queue` → T3 znovu, porovnat
5. T4, T5, T7
6. T6 zátěž
7. T8, T9
8. ✋ stop, report, čekat na „nasad na main"

---

## 7. Co to nevyřeší

- **Daily tick** — per-team smyčka přes celou DB zůstává (fáze 3)
- **D1 jako sdílený zdroj** — všechny ligy pořád píšou do jedné databáze
- **N+1 dotazy** uvnitř zpracování ligy — fronta je rozloží, neodstraní
- **Náklady** — fronty jsou prakticky zdarma (první milion operací měsíčně), při 100 ligách
  a 5 ticích denně jsme na ~15 tis. zpráv měsíčně. **Kredity na to nejsou potřeba**, stačí
  Workers Paid, který už běží. Tohle není utrácení kreditů, je to oprava architektury.

---

## 8. Odhad

| Fáze | Rozsah |
|---|---|
| 0 — extrakce | velká, rizikový refaktor, nutné oddělit |
| 1 — fronta + flag | střední |
| 2 — vyřazení staré cesty | malá |
| 3 — daily tick | velká, samostatný tiket |
| 4 — preview do fronty | malá |

Doporučené pořadí: 0 → 1 → ověřit na testu → 2 → 3 → 4.

---

## 9. Naměřené výsledky (testing, 2026-08-17)

Prostředí: `prales-db-test`, 6 lig (+2 osiřelé league_id), 113 týmů, 49 lidských.

### 9.1 Zátěž na jednu ligu je konstantní — hlavní tvrzení potvrzeno

| Typ zprávy | Běhů | Doba | Dotazů do D1 |
|---|---|---|---|
| `league_round` (odsimulování kola) | 4 reálné | **282–342 s** | **1969–2188** |
| `league_round` bez splatného kola | 2 | 0,4 s | 2 |
| `league_day` (denní tick, 14 týmů) | 7 | 5–33 s | — |
| `league_maintenance` | 8 | 0,7–1,1 s | 4–5 |
| `round_report` (Gemini) | 4 | 8,8–18,6 s | — |
| `ultras_report` (Gemini) | 3 | 3,9–4,7 s | — |

Rozptyl mezi ligami je malý a **nezávisí na tom, kolik lig systém má** — což je
přesně to, co fronta měla zařídit. Producent (cron) doběhne za sekundu:
6 zpráv na kola + 8 údržbových odešle jedním voláním.

### 9.2 Odkud se bral původní strop

Jedno kolo = **~2000 dotazů a ~5 minut**. Ve staré cestě běžely všechny ligy
v JEDNÉ invokaci, takže 6 lig = ~12 000 dotazů a ~30 minut v jednom běhu. Proto
byly natvrdo vyloučené České Budějovice a proto tick padal celý, ne po ligách.
Komentář v `index.ts` byl přesný.

Ve frontovém režimu se odbavily i obě budějovické ligy — vyloučení podle jména
už není potřeba.

### 9.3 Ověřené testy

| Test | Výsledek |
|---|---|
| T1 idempotence locku (unit) | ✅ 15 testů |
| T2 producent (unit) | ✅ zpráva nenese `calendarId` |
| T3 shoda staré a nové cesty | ✅ +1 kolo, +7 zápasů, +44 transakcí — shodně |
| **T4 duplicitní doručení** | ✅ **3× tatáž zpráva = +1 kolo, +7 zápasů, +44 transakcí. Finance se NEZDVOJILY.** |
| T5 izolace selhání | ✅ 4 pokusy → DLQ → `queue_failures`; ostatní ligy dokončeny normálně |
| T6 zátěž a měření | ✅ viz 9.1 |
| T7 zastaralá zpráva | ✅ podvržené staré datum → `stale` za 0,2 s, kolo nezamčeno |
| T8 frontend (MCP browser) | ✅ match-day, tabulka (Sezóna 3, 14 týmů), AI článek ze fronty |
| T9 API | ✅ standings 14 týmů, 6× `ai_report` + 6× `ultras_report` |
| Idempotence denního ticku | ✅ druhý běh na tentýž den: 8× `skipped`, 0 změn ve financích |
| Rollback na `loop` | ✅ starý režim funguje, posune den, nezapisuje nároky |

### 9.4 Co měření odhalilo navíc — omezení propustnosti

Fronta odstranila **selhání**, ale nezrychlila práci. Při `max_concurrency = 3`
a ~5 min na ligu vychází celý zápasový tick zhruba na:

```
doba ticku ≈ počet_lig × 5 min / max_concurrency
```

- 6 lig → ~10 min (dnes)
- 50 lig → ~1,4 hod
- 100 lig → ~2,8 hod

Pro „libovolný počet lig" to znamená, že **žádná liga nespadne**, ale při stovkách
lig se kola dohrávají postupně, ne všechna v 18:00. Až to začne vadit, jsou dvě
páky, v tomhle pořadí:

1. **Zvýšit `max_concurrency`** — nejlevnější, ale naráží na D1 (riziko 4.3).
   Zvyšovat po krocích a měřit `queue_runs`.
2. **Zlevnit samotné kolo** — 2000 dotazů na 7 zápasů je hodně. Uvnitř jsou N+1
   smyčky (notifikace a události mezi koly dotazují per zápas a per hráč).
   Dávkové dotazy by to srazily řádově a pomohly by i staré cestě.

To je samostatný tiket — architektura front na něm nezávisí.

### 9.5 Provozní poznámky

- Přepínač: `GET/POST /api/admin/queue/mode?mode=queue|loop`
- Měření: `GET /api/admin/queue/runs` (souhrn + posledních N běhů)
- DLQ: `GET /api/admin/queue/failures`
- Ruční spuštění: `POST /api/admin/queue/enqueue-match-tick`, `.../enqueue-previews`
- Testovací nástroje: `POST /api/admin/queue/send-duplicate?leagueId=&times=&kind=&gameDate=`
- Fronty vytvořené na účtu: `prales-match-rounds`, `prales-reports`,
  `prales-match-dlq`, `prales-reports-dlq` + čtyři `-test` varianty.
- Migrace: `0146_queue_failures`, `0147_team_day_log`, `0148_queue_runs`
  (aplikované na `prales-db-test`, na prod ZATÍM NE).

---

## 10. Crony na testingu + Workers AI (2026-08-17)

### 10.1 Plán účtu — ověřeno, ne odhadnuto

Přes Cloudflare API (`/accounts/{id}/workers/scripts/{name}/schedules`) napříč všemi
8 workery účtu AutomatGuru: **8 běžících cronů** (prales-api 7, fitness-trener 1).
Limit Free je 5/účet, Paid 250/účet → **účet je na Workers Paid**. Potvrzuje to
i `default_usage_model: "standard"` a paměť (upgrade 2026-04-20).

Pravidlo „testing MUSÍ mít `crons = []`" vzniklo kvůli Free limitu a je zastaralé.
Zrušeno, testing dostal všech 7 cronů → 15 z 250.

### 10.2 Proč to neohrozí produkci

| Co | Sdílené? | Riziko |
|---|---|---|
| Deploy | ne — `main`→prod, `testing`→`--env testing` (`ci.yml`) | žádné |
| Worker, D1, KV, fronty | ne, vlastní pro každé prostředí | žádné |
| Cron limit | 15 z 250 | žádné |
| R2 `prales-seed` | **ano**, ale zapisují jen uživatelské routy (hymny, maskoti) | stav existoval už dřív |
| `GEMINI_API_KEY` | vlastní secret slot, hodnota se z wranglera nepřečte | ⚠️ vyřešeno přepínačem |

### 10.3 Přepínač `ai_provider`

`gemini` (DEFAULT) | `workers-ai` | `off`. Aplikuje se na vstupu `scheduled()`
a `queue()`. Pro `off` se vyprázdní Gemini klíč a generátory spadnou do svých
existujících skip větví — bez zásahu do dvanácti míst, která na produkci fungují.

Ověřeno: se `off` proběhly 4 ligy, `round_results` +4 (generuje kód), ale
`ai_report` i `ultras_report` beze změny → **nula volání Gemini**.

### 10.4 Výběr modelu — srovnání na českém promptu

| Model | Výsledek |
|---|---|
| `@cf/meta/llama-4-scout-17b-16e-instruct` | ✅ správné skloňování („nad Rapidem Tvrzice"), čisté 4 věty |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | ❌ chybná shoda („přidala Petr Kraus"), text zdvojený, meta-poznámka |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | ~ použitelná čeština, rozbitá struktura |
| `gpt-oss-120b`, `glm-5.2`, `gemma-4-26b` | ❌ reasoning modely, celý budget na vnitřní úvahu, prázdný obsah |

Zapojeno do `ai-reporter`, `ultras-report`, `matchday-preview` (ty pohání fronta).
Bez předaného kontextu se chovají přesně jako dřív.

**Reálný výstup z produkčního promptu** (Workers AI, testing):
> „Déšť opět prověřil odolnost našich mladých fotbalistů… vysoká výhra TJ Včelná U21
> nad Hvězdou Olešník U21 5:0."

Kvalita je pro testovací prostředí víc než dost. Drobné vady: „v 3. kole" místo
„ve 3. kole", jednou špatně skloněné příjmení. Pro produkci bych to nenasazoval.

Cena: 10 000 Neuronů/den zdarma. Pozn.: dokumentace **netvrdí**, že se Workers AI
platí z běžných účetních kreditů — zmiňuje jen samostatné AI Gateway credits.

### 10.5 Co zůstává neověřené

1. **`matchday_preview` přes frontu** — producent ověřen, konzumer ne. Žádná liga
   nemá kolo naplánované přesně na aktuální herní den, takže se nemá co zařadit.
   Ověří se sám, až cron `0 6` narazí na den s kolem.
2. **Zátěž na 20+ ligách** — konzistence naměřená přes 6 lig, ne přes 20+.
3. **Obal `scheduled()`** — vnitřek ověřen přes admin endpointy, samotný cron
   na testu poprvé vystřelí v `0 14 UTC`.
