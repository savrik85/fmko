# Sponzoři, etapa 3: plnění slibů a sankce, plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sliby, které klub dal sponzorovi při jednání (etapa 2, tabulka `sponsor_promises`), se skutečně vyhodnocují a mají následky. Termínové sliby (licence trenéra, modernizace stadionu, logo na rukávu) denní tick uzná, jakmile platí, a poruší, když uplyne termín. Sezónní sliby (umístění, postup, nesestup, pohár, návštěva, mladí v sestavě, reputace, žádné výtržnosti) vyhodnotí rollover nad daty skončené sezóny. Splněný slib = bonus, +5 náklonnosti a SMS od majitele. Těsně vedle = polovina pokuty, −3. Porušený = pokuta, −8, porušení se počítá. Druhé porušení v sezóně nebo porušený postup/nesestup = sponzor smlouvu vypoví (návrat názvu, reputace −5, zpráva do ligy, SMS). Exkluzivita oboru blokuje podpis banneru stejného oboru. Na `/sponzori` jsou u smluv vidět sliby se stavem, ve Financích bonusy a pokuty s popisem slibu.

**Architecture:** Čtyři nové moduly v `apps/api/src/sponsors/`: `promise-eval.ts` (čisté funkce: vyhodnocení podle druhu, důsledky, pravidlo výpovědi, české popisky), `promise-resolve.ts` (nárok na slib podmíněným `UPDATE … RETURNING` přes `.all()`, peníze přes `recordTransaction`, náklonnost přes `favorDeltaStmts`, počítadlo porušení, výpověď sponzorem, SMS majitele), `promise-data.ts` (sezónní statistiky klubu a stav pro termínové sliby, jen čtení) a `promise-runs.ts` (běhy pro denní tick, rollover a admin, posun termínů na novou časovou osu, exkluzivita oboru, výpis slibů, logo na rukávu). Háčky: denní tick (vlastní `try`, před SMS majitelů), rollover (nový krok 4a PŘED krokem 4b, tedy před expirací smluv, každá část ve vlastním `try`), podpis/prodloužení banneru a nabídky bannerů v `routes/game.ts`, nové routy v `routes/sponsors.ts`. SMS majitele: tři nové příležitosti `promise_kept`, `promise_broken`, `sponsor_terminates` ve stávající frontě `sponsor_owner_sms` (limity a cooldown beze změny). Migrace 0222 přidá `sponsor_promises.actual_value` a `teams.sleeve_sponsor_id`.

**Tech Stack:** Hono + Cloudflare D1 (SQLite), vitest s falešnou D1 (`incidents/testovaci-d1.ts`), Next.js 15 (client komponenty), Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-22-vyjednavani-se-sponzory-design.md`, sekce „Etapa 3: Plnění slibů a sankce" (kontext v sekci „Etapa 2").

## Předpoklad

Etapa 2 (jednání, podpis, migrace **0221**) je hotová a sloučená do `testing`. Z ní se bere doslova:

```sql
sponsor_promises(id TEXT PK, contract_id TEXT → sponsor_contracts(id), team_id TEXT, sponsor_id INTEGER,
  kind TEXT,        -- league_position|promotion|no_relegation|cup_round|coach_licence|stadium_upgrade|jersey_logo|sector_exclusivity|attendance|youth|reputation|no_riots
  params TEXT JSON, -- {"position":3} / {"round":4} / {"facility":"vip_box","level":2} / {"level":2} / {"attendance":400} / {"count":2} / {"reputation":70}
  season INTEGER NULL, deadline_game_date TEXT NULL, value_share REAL, reward INTEGER, penalty INTEGER,
  status TEXT pending|fulfilled|partial|broken, resolved_at TEXT, created_at TEXT)
sponsor_contracts + signing_bonus INTEGER, paid_construction TEXT, breaches_season INTEGER DEFAULT 0, negotiation_id TEXT
```

`season` = číslo globální sezóny (`seasons.number`, stejné jako `season_calendar.season_number` a `cup_competitions.season_number`). `penalty` je už spočítaná pokuta za porušení (`value_share × B × měsíce sezóny`), `reward` vyjednaný bonus (0 = bez bonusu). Tento plán tabulku nezakládá.

## Rozhodnutí, která plán dělá (spec je nechává otevřená)

| Věc | Rozhodnutí |
|---|---|
| Postup a sestup | Hra je zatím nemá (`league/promotion.ts`, `calculatePromotions` nezapojené). Slib se měří stejnými zónami: postup = 1. nebo 2. místo, nesestup = mimo poslední dvě místa. |
| Konečná tabulka v rolloveru | `calculateStandings` bere nejvyšší `season_number`, v rolloveru už existuje kalendář nové sezóny. Proto `league_history.final_standings` (fáze `archive` běží před rolloverem), záloha = tabulka ze zápasů dané sezóny (stejné řazení jako `calculateStandings`). |
| Pohár „do X. kola" | Splněno, když klub v poháru dané sezóny odehrál kolo X (`eliminated_round` = kolo, ve kterém vypadl; vítěz = poslední kolo). Klub v poháru nebyl = 0. Pohár se v sezóně nehrál = slib nejde vyhodnotit. |
| Mladí v sestavě | Průměr hráčů ve věku do 21 let (včetně) v základní sestavě ligových zápasů (`match_player_stats.started = 1`). Rollover běží po stárnutí (`bumpAges` ve fázi `departures`), proto věk − 1. |
| Výtržnosti | Řádky `fan_incidents` klubu u ligových zápasů klubu a pohárových zápasů dané sezóny. |
| Exkluzivita oboru | Po dobu smlouvy stav „platí". Při rolloveru, ve kterém smlouva končí (`seasons_remaining <= 1`), se uzná jako splněná (bonus, +5). Porušit nejde, podpis a prodloužení banneru stejného oboru se zablokuje a nabídky bannerů toho oboru se nezobrazí. |
| Logo na rukávu | Hra ho dosud nemá. Nový sloupec `teams.sleeve_sponsor_id` a tlačítko „Dát logo na rukáv" u slibu. Po konci smlouvy logo z rukávu zmizí. |
| Termíny po rolloveru | Rollover vrací herní čas na reálné datum (desítky dní zpět). Čekající termíny se posunou o stejný skok (zbytek lhůty od posledního dne staré sezóny se přičte k prvnímu dni nové), jednou za rollover přes značku v `season_end_progress`. |
| Chybějící data | Slib, který nejde vyhodnotit (chybí tabulka, pohár se nehrál, nečitelné parametry), zůstane `pending` a zaloguje se varování. Nic se nevymýšlí. |
| Víc výsledků u jedné smlouvy | Důsledky se připíšou po jednom, výpověď se rozhodne jednou za smlouvu, SMS jde jedna za smlouvu (výpověď > porušení/těsně vedle > splnění). |
| Těsně vedle | Není porušení (nezvedá `breaches_season`). SMS jako u porušení (`promise_broken`). |
| Pořadí v rolloveru | Krok 4a: sezónní sliby → posun termínů → vynulování `breaches_season`. Výpověď sponzorem proběhne dřív než obyčejné vypršení, takže vypovězená smlouva nedostane SMS `main_lost` ani +5 za sezónu spolupráce. |

## Global Constraints

- Větev `testing`. V úlohách 1 až 7 se nepushuje. Na `main` a na `prales-db-prod` nic bez výslovného souhlasu uživatele.
- Identifikátory v kódu anglicky, texty pro hráče a komentáře česky. V textech pro hráče nikdy dlouhá pomlčka (—).
- Nikdy prázdný `catch`. Server `logger.warn/error({ module }, "popis", e)`; `logger` serializuje z kontextu jen `teamId`, `matchId`, `playerId`, `reqId`, ostatní id patří do textu zprávy. Klient `console.error("popis:", e)`.
- Nárok na řádek (`UPDATE … WHERE status = 'pending' RETURNING …`) vždy přes `.all()`, nikdy `.run()`: workerd D1 u `run()` řádky z `RETURNING` v produkci nevrací.
- Nejdřív nárok, pak peníze, náklonnost a SMS. Každý důsledek po nároku ve vlastním `try`, aby pád jednoho nezastavil ostatní.
- Každá změna náklonnosti přes `favorDeltaStmts` (deník v tomtéž batchi, log PŘED změnou). Každá změna rozpočtu přes `recordTransaction`. Každá změna reputace přes `applyReputationDelta`.
- Háčky nesmí shodit zpracování zápasu, rollover ani denní tick: vlastní `try/catch` s `logger.error`.
- Herní čas ≠ reálný: termíny a `resolved_at` jsou herní data (`teams.game_date`, `effectiveDate` ticku), ne `new Date()`.
- UI: mobil nejdřív, minimum `text-sm`, jména firem `text-base` a jako odkazy (`SponsorLink`), ceny nikdy v tlačítkách, jen tokeny, které v `globals.css` existují (`pitch-50/500/600`, `gold-50/700`, `card-red`, `red-50`, `gray-100`, `line-soft`, `muted`).
- Testovací DB `prales-db-test`. D1 dotazy: vnější `'`, vnitřní `"`, žádný backslash před `$`.
- Commity: předmět česky, tělo končí prázdným řádkem a `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Přidávat jen soubory úlohy (ve stromu leží cizí `.serena/project.yml` a `packages/db/tsconfig.tsbuildinfo`, ty ne).

## Souborová struktura

| Soubor | Stav | Odpovědnost |
|---|---|---|
| `apps/api/migrations/0222_sponsor_promise_results.sql` | nový | `sponsor_promises.actual_value`, `teams.sleeve_sponsor_id`, index čekajících slibů |
| `apps/api/src/sponsors/promise-eval.ts` | nový | čisté funkce: druhy, parametry, vyhodnocení sezónní i termínové, důsledky, výpověď, popisky, texty, plán SMS, tabulka, pohár |
| `apps/api/src/sponsors/promise-eval.test.ts` | nový | unit testy čistých funkcí |
| `apps/api/src/sponsors/owner-sms-texts.ts` | úprava | příležitosti `promise_kept`, `promise_broken`, `sponsor_terminates`, proměnná `{slib}` |
| `apps/api/src/sponsors/owner-sms-rules.ts` | úprava | pravidla (priorita, lhůta, čeká odpověď) nových příležitostí |
| `apps/api/src/sponsors/owner-sms.ts` | úprava | `closeOwnerSmsForRollover` nechá `promise:` a `sponsor-quit:` ve frontě |
| `apps/api/src/sponsors/owner-sms-texts.test.ts`, `owner-sms-rules.test.ts`, `owner-sms.test.ts` | úprava | testy nových příležitostí |
| `apps/api/src/sponsors/promise-resolve.ts` | nový | nárok, peníze, náklonnost, porušení, výpověď sponzorem, SMS |
| `apps/api/src/sponsors/promise-resolve.test.ts` | nový | testy nad falešnou D1 |
| `apps/api/src/season/finance-processor.ts` | úprava | typy transakcí `sponsor_bonus`, `sponsor_penalty` |
| `apps/web/src/app/(hra)/finance/page.tsx` | úprava | popisky a ikony nových typů (hlídá `season/transaction-labels.test.ts`) |
| `apps/api/src/sponsors/promise-data.ts` | nový | sezónní statistiky klubu, stav pro termínové sliby |
| `apps/api/src/sponsors/promise-runs.ts` | nový | běhy (tick, rollover), posun termínů, vynulování porušení, exkluzivita oboru, výpis slibů, logo na rukávu |
| `apps/api/src/sponsors/promise-runs.test.ts` | nový | testy dat a běhů nad falešnou D1 |
| `apps/api/src/season/daily-tick.ts` | úprava | termínové sliby před SMS majitelů |
| `apps/api/src/season/season-rollover.ts` | úprava | krok 4a před krokem 4b |
| `apps/api/src/routes/game.ts` | úprava | admin vyhodnocení, blok exkluzivity u podpisu a prodloužení banneru, filtr nabídek bannerů |
| `apps/api/src/routes/sponsors.ts` | úprava | `GET /teams/:teamId/sponsor-promises`, `POST …/sponsor-promises/:promiseId/sleeve-logo` |
| `apps/web/src/lib/sponsor-page-types.ts` | úprava | typ `SponsorPromiseView` |
| `apps/web/src/lib/sponsor-promises.ts` | nový | stav slibu česky, barvy, termín, seskupení podle smlouvy |
| `apps/web/src/components/sponsors/contract-promises.tsx` | nový | sliby u smlouvy |
| `apps/web/src/components/sponsors/contracts-tab.tsx` | úprava | sliby v kartě aktivní smlouvy |
| `apps/web/src/app/(hra)/sponzori/page.tsx` | úprava | načtení slibů, akce „Dát logo na rukáv" |

---

### Task 1: Migrace 0222

**Files:**
- Create: `apps/api/migrations/0222_sponsor_promise_results.sql`

**Interfaces:**
- Consumes: tabulka `sponsor_promises` z migrace 0221 (etapa 2).
- Produces: `sponsor_promises.actual_value REAL NULL` (naměřená hodnota: místo, kolo, návštěva, průměr mladých, reputace, počet výtržností, licence, úroveň zařízení, 0/1 u loga), `teams.sleeve_sponsor_id INTEGER NULL` (`district_sponsors.id` firmy s logem na rukávu), index `idx_sponsor_promises_pending(status, kind)`.

- [ ] **Step 1: Ověřit, že etapa 2 je ve větvi a 0221 na testovací DB**

Run: `cd /Users/savrik/Projects/fmko && git branch --show-current && ls apps/api/migrations/ | grep -E "^022[12]_"`
Expected: `testing` a jeden soubor `0221_…sql`, žádný `0222_…`.

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'PRAGMA table_info(sponsor_promises)'`
Expected: sloupce `id, contract_id, team_id, sponsor_id, kind, params, season, deadline_game_date, value_share, reward, penalty, status, resolved_at, created_at`, žádný `actual_value`. Když tabulka chybí nebo se sloupce liší, STOP a nahlásit (etapa 2 není nasazená podle dohody).

- [ ] **Step 2: Napsat migraci**

```sql
-- 0222: Sliby sponzorům, etapa 3 (docs/superpowers/plans/2026-09-23-sponzori-etapa-3-sliby.md).
-- actual_value: naměřená hodnota při vyhodnocení (místo v tabulce, kolo poháru, návštěva,
--   průměr mladých v sestavě, reputace, počet výtržností, licence, úroveň zařízení, logo 0/1),
--   aby hráč viděl, o kolik to bylo „těsně vedle".
-- sleeve_sponsor_id: firma, jejíž logo nosí klub na rukávu dresu (slib jersey_logo).
-- Předpoklad: migrace 0221 (sponsor_promises, etapa 2) už je aplikovaná.
-- Aplikovat ručně PŘED nasazením kódu:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0222_sponsor_promise_results.sql
-- POZOR: ALTER TABLE ADD COLUMN není idempotentní, spouštět jen jednou.

ALTER TABLE sponsor_promises ADD COLUMN actual_value REAL;
ALTER TABLE teams ADD COLUMN sleeve_sponsor_id INTEGER REFERENCES district_sponsors(id);
CREATE INDEX IF NOT EXISTS idx_sponsor_promises_pending ON sponsor_promises(status, kind);
```

- [ ] **Step 3: Aplikovat na testovací DB**

Run: `cd /Users/savrik/Projects/fmko && npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0222_sponsor_promise_results.sql`
Expected: `🚣 Executed 3 queries` (nebo ekvivalent bez chyby).

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT (SELECT COUNT(*) FROM pragma_table_info("sponsor_promises") WHERE name = "actual_value") AS a, (SELECT COUNT(*) FROM pragma_table_info("teams") WHERE name = "sleeve_sponsor_id") AS b'`
Expected: `"a": 1, "b": 1`.

- [ ] **Step 4: Commit**

```bash
cd /Users/savrik/Projects/fmko && git add apps/api/migrations/0222_sponsor_promise_results.sql && git commit -m "$(cat <<'EOF'
feat(sponzori): migrace 0222 pro vyhodnocení slibů sponzorům

Naměřená hodnota u slibu (actual_value) a logo sponzora na rukávu
dresu (teams.sleeve_sponsor_id). Na testovací DB aplikováno ručně.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Čisté funkce vyhodnocení (`promise-eval.ts`) s testy

**Files:**
- Create: `apps/api/src/sponsors/promise-eval.ts`
- Test: `apps/api/src/sponsors/promise-eval.test.ts`

**Interfaces:**
- Consumes: `FACILITY_LABELS` (`stadium/stadium-generator.ts`), `licenceLabel` (`@okresni-masina/shared`), `logger`.
- Produces (vše exportované z `promise-eval.ts`):
  - `PROMISE_KINDS`, `type PromiseKind`, `isPromiseKind(v)`, `SEASONAL_KINDS`, `DEADLINE_KINDS`, `FATAL_KINDS`
  - `type PromiseStatus = "pending"|"fulfilled"|"partial"|"broken"`, `type PromiseOutcome`, `isPromiseStatus(v)`
  - konstanty `PROMOTION_PLACES=2`, `RELEGATION_PLACES=2`, `FAVOR_FULFILLED=5`, `FAVOR_PARTIAL=-3`, `FAVOR_BROKEN=-8`, `BREACHES_TO_TERMINATE=2`, `TERMINATION_REPUTATION=-5`
  - `type PromiseParams`, `parsePromiseParams(raw): PromiseParams | null`
  - `interface SeasonStats`, `EMPTY_SEASON_STATS`, `interface DeadlineState`, `interface Evaluation { outcome: PromiseOutcome; actual: number | null }`
  - `evaluateSeasonalPromise(kind, params, stats): Evaluation | null`
  - `evaluateDeadlinePromise(kind, params, state, sponsorId, today, deadline): Evaluation | "pending" | null`
  - `interface Consequence`, `promiseConsequence(outcome, reward, penalty): Consequence`
  - `sponsorTerminates(breachesThisSeason, brokenKinds): boolean`
  - `promiseLabel(kind, params)`, `promiseActualText(kind, actual)`, `promiseTransactionText(outcome, sponsorName, label)`, `promiseFavorReason(outcome, label)`, `sectorBlockMessage(sponsorName)`
  - `type PromiseSmsOccasion`, `promiseSmsPlan(items, terminated)`
  - `interface MatchResultRow`, `rankTable(teamIds, matches): Map<string, number>`, `positionFromStandings(json, teamId)`, `interface CupEntryRow`, `cupRoundReached(row)`, `averagePerMatch(total, matches)`

- [ ] **Step 1: Napsat testy**

```ts
/**
 * Sliby sponzorům: vyhodnocení podle druhu, „těsně vedle", důsledky, pravidlo výpovědi,
 * české popisky a pomocné výpočty tabulky a poháru. Bez DB.
 */
import { describe, expect, it } from "vitest";
import {
  averagePerMatch, cupRoundReached, evaluateDeadlinePromise, evaluateSeasonalPromise, parsePromiseParams,
  positionFromStandings, PROMISE_KINDS, promiseActualText, promiseConsequence, promiseFavorReason, promiseLabel,
  promiseSmsPlan, promiseTransactionText, rankTable, sectorBlockMessage, sponsorTerminates,
  type DeadlineState, type PromiseParams, type SeasonStats,
} from "./promise-eval";

const STATS: SeasonStats = {
  position: 4, teamsInLeague: 14, cupReached: 3, avgHomeAttendance: 380, avgYouthStarters: 1.6, reputation: 68, riots: 0,
};

describe("evaluateSeasonalPromise", () => {
  it("umístění: cíl splněný, o místo hůř těsně vedle, jinak porušeno", () => {
    expect(evaluateSeasonalPromise("league_position", { position: 4 }, STATS)).toEqual({ outcome: "fulfilled", actual: 4 });
    expect(evaluateSeasonalPromise("league_position", { position: 6 }, STATS)?.outcome).toBe("fulfilled");
    expect(evaluateSeasonalPromise("league_position", { position: 3 }, STATS)).toEqual({ outcome: "partial", actual: 4 });
    expect(evaluateSeasonalPromise("league_position", { position: 2 }, STATS)).toEqual({ outcome: "broken", actual: 4 });
  });

  it("postup = první dvě místa, těsně vedle neexistuje", () => {
    expect(evaluateSeasonalPromise("promotion", {}, { ...STATS, position: 2 })?.outcome).toBe("fulfilled");
    expect(evaluateSeasonalPromise("promotion", {}, { ...STATS, position: 3 })).toEqual({ outcome: "broken", actual: 3 });
  });

  it("nesestup = mimo poslední dvě místa", () => {
    expect(evaluateSeasonalPromise("no_relegation", {}, { ...STATS, position: 12 })?.outcome).toBe("fulfilled");
    expect(evaluateSeasonalPromise("no_relegation", {}, { ...STATS, position: 13 })?.outcome).toBe("broken");
  });

  it("pohár: odehrané kolo aspoň cílové", () => {
    expect(evaluateSeasonalPromise("cup_round", { round: 3 }, STATS)?.outcome).toBe("fulfilled");
    expect(evaluateSeasonalPromise("cup_round", { round: 4 }, STATS)).toEqual({ outcome: "broken", actual: 3 });
    expect(evaluateSeasonalPromise("cup_round", { round: 1 }, { ...STATS, cupReached: 0 })?.outcome).toBe("broken");
  });

  it("návštěva: do 10 % pod cílem je těsně vedle", () => {
    expect(evaluateSeasonalPromise("attendance", { attendance: 380 }, STATS)?.outcome).toBe("fulfilled");
    expect(evaluateSeasonalPromise("attendance", { attendance: 420 }, STATS)).toEqual({ outcome: "partial", actual: 380 });
    expect(evaluateSeasonalPromise("attendance", { attendance: 425 }, STATS)?.outcome).toBe("broken");
  });

  it("mladí: průměr na zápas aspoň cíl, zaokrouhlený na desetiny", () => {
    expect(evaluateSeasonalPromise("youth", { count: 1.5 }, STATS)).toEqual({ outcome: "fulfilled", actual: 1.6 });
    expect(evaluateSeasonalPromise("youth", { count: 2 }, STATS)).toEqual({ outcome: "broken", actual: 1.6 });
  });

  it("reputace: do 3 bodů pod cílem je těsně vedle", () => {
    expect(evaluateSeasonalPromise("reputation", { reputation: 68 }, STATS)?.outcome).toBe("fulfilled");
    expect(evaluateSeasonalPromise("reputation", { reputation: 71 }, STATS)).toEqual({ outcome: "partial", actual: 68 });
    expect(evaluateSeasonalPromise("reputation", { reputation: 72 }, STATS)?.outcome).toBe("broken");
  });

  it("výtržnosti: jediná stačí k porušení", () => {
    expect(evaluateSeasonalPromise("no_riots", {}, STATS)).toEqual({ outcome: "fulfilled", actual: 0 });
    expect(evaluateSeasonalPromise("no_riots", {}, { ...STATS, riots: 2 })).toEqual({ outcome: "broken", actual: 2 });
  });

  it("exkluzivita oboru se na konci smlouvy uzná", () => {
    expect(evaluateSeasonalPromise("sector_exclusivity", {}, STATS)).toEqual({ outcome: "fulfilled", actual: null });
  });

  it("chybějící data nebo parametr = nejde vyhodnotit", () => {
    expect(evaluateSeasonalPromise("league_position", { position: 3 }, { ...STATS, position: null })).toBeNull();
    expect(evaluateSeasonalPromise("league_position", {}, STATS)).toBeNull();
    expect(evaluateSeasonalPromise("cup_round", { round: 2 }, { ...STATS, cupReached: null })).toBeNull();
    expect(evaluateSeasonalPromise("attendance", { attendance: 300 }, { ...STATS, avgHomeAttendance: null })).toBeNull();
    expect(evaluateSeasonalPromise("coach_licence", { level: 2 }, STATS)).toBeNull();
  });
});

describe("evaluateDeadlinePromise", () => {
  const STATE: DeadlineState = { licenceLevel: 2, facilities: { vip_box: 1, stands: 2 }, sleeveSponsorId: 7 };

  it("splněno hned, jakmile platí, i po termínu", () => {
    expect(evaluateDeadlinePromise("coach_licence", { level: 2 }, STATE, 7, "2026-12-01", "2026-10-05"))
      .toEqual({ outcome: "fulfilled", actual: 2 });
    expect(evaluateDeadlinePromise("stadium_upgrade", { facility: "stands", level: 2 }, STATE, 7, "2026-10-01", "2026-10-05"))
      .toEqual({ outcome: "fulfilled", actual: 2 });
    expect(evaluateDeadlinePromise("jersey_logo", {}, STATE, 7, "2026-10-01", "2026-10-05"))
      .toEqual({ outcome: "fulfilled", actual: 1 });
  });

  it("před termínem i v den termínu čeká, den po termínu porušeno", () => {
    expect(evaluateDeadlinePromise("coach_licence", { level: 3 }, STATE, 7, "2026-10-01", "2026-10-05")).toBe("pending");
    expect(evaluateDeadlinePromise("coach_licence", { level: 3 }, STATE, 7, "2026-10-05", "2026-10-05T00:00:00.000Z")).toBe("pending");
    expect(evaluateDeadlinePromise("coach_licence", { level: 3 }, STATE, 7, "2026-10-06", "2026-10-05"))
      .toEqual({ outcome: "broken", actual: 2 });
    expect(evaluateDeadlinePromise("jersey_logo", {}, STATE, 8, "2026-10-06", "2026-10-05"))
      .toEqual({ outcome: "broken", actual: 0 });
  });

  it("bez termínu se porušit nedá", () => {
    expect(evaluateDeadlinePromise("stadium_upgrade", { facility: "vip_box", level: 2 }, STATE, 7, "2030-01-01", null)).toBe("pending");
  });

  it("neznámé zařízení nebo chybějící licence = nejde vyhodnotit", () => {
    expect(evaluateDeadlinePromise("stadium_upgrade", { facility: "bazen", level: 1 }, STATE, 7, "2026-10-01", null)).toBeNull();
    expect(evaluateDeadlinePromise("coach_licence", { level: 1 }, { ...STATE, licenceLevel: null }, 7, "2026-10-01", null)).toBeNull();
    expect(evaluateDeadlinePromise("league_position", { position: 1 }, STATE, 7, "2026-10-01", null)).toBeNull();
  });
});

describe("promiseConsequence", () => {
  it("splněno: bonus, +5, žádné porušení", () => {
    expect(promiseConsequence("fulfilled", 12000, 8000)).toEqual({ money: 12000, txType: "sponsor_bonus", favorDelta: 5, breach: false });
    expect(promiseConsequence("fulfilled", 0, 8000)).toEqual({ money: 0, txType: null, favorDelta: 5, breach: false });
  });

  it("těsně vedle: polovina pokuty, −3, nepočítá se jako porušení", () => {
    expect(promiseConsequence("partial", 0, 9001)).toEqual({ money: -4501, txType: "sponsor_penalty", favorDelta: -3, breach: false });
  });

  it("porušeno: celá pokuta, −8, porušení", () => {
    expect(promiseConsequence("broken", 5000, 8000)).toEqual({ money: -8000, txType: "sponsor_penalty", favorDelta: -8, breach: true });
    expect(promiseConsequence("broken", 0, 0)).toEqual({ money: 0, txType: null, favorDelta: -8, breach: true });
  });
});

describe("sponsorTerminates", () => {
  it("druhé porušení v sezóně nebo porušený postup či nesestup", () => {
    expect(sponsorTerminates(1, ["league_position"])).toBe(false);
    expect(sponsorTerminates(2, ["league_position"])).toBe(true);
    expect(sponsorTerminates(1, ["no_relegation"])).toBe(true);
    expect(sponsorTerminates(0, ["promotion"])).toBe(true);
    expect(sponsorTerminates(3, [])).toBe(false);
  });
});

describe("promiseSmsPlan", () => {
  const items = [
    { id: "a", outcome: "fulfilled" as const, label: "reputace klubu aspoň 60" },
    { id: "b", outcome: "partial" as const, label: "umístění do 3. místa" },
  ];

  it("jedna SMS za smlouvu, nejhorší výsledek vyhrává", () => {
    expect(promiseSmsPlan(items, false)).toEqual({ occasion: "promise_broken", promiseId: "b", label: "umístění do 3. místa" });
    expect(promiseSmsPlan([items[0]], false)).toEqual({ occasion: "promise_kept", promiseId: "a", label: "reputace klubu aspoň 60" });
    expect(promiseSmsPlan([...items, { id: "c", outcome: "broken" as const, label: "postupové místo" }], true))
      .toEqual({ occasion: "sponsor_terminates", promiseId: "c", label: "postupové místo" });
    expect(promiseSmsPlan([], false)).toBeNull();
  });
});

describe("popisky", () => {
  const SAMPLE: Record<string, PromiseParams> = {
    league_position: { position: 3 }, cup_round: { round: 4 }, coach_licence: { level: 2 },
    stadium_upgrade: { facility: "vip_box", level: 2 }, attendance: { attendance: 400 }, youth: { youth: 2 },
    reputation: { reputation: 70 },
  };

  it("každý druh má český popisek bez dlouhé pomlčky", () => {
    for (const k of PROMISE_KINDS) {
      const label = promiseLabel(k, SAMPLE[k] ?? {});
      expect(label.length, k).toBeGreaterThan(3);
      expect(label).not.toContain("—");
      expect(label).not.toMatch(/[{}]/);
    }
  });

  it("konkrétní tvary", () => {
    expect(promiseLabel("league_position", { position: 3 })).toBe("umístění do 3. místa");
    expect(promiseLabel("coach_licence", { level: 2 })).toBe("UEFA B pro trenéra");
    expect(promiseLabel("stadium_upgrade", { facility: "vip_box", level: 2 })).toBe("VIP lóže na úrovni 2");
    expect(promiseLabel("youth", { count: 1 })).toBe("aspoň 1 hráč do 21 let v základní sestavě");
    expect(promiseLabel("youth", { count: 2 })).toBe("aspoň 2 hráči do 21 let v základní sestavě");
    expect(promiseLabel("youth", { count: 5 })).toBe("aspoň 5 hráčů do 21 let v základní sestavě");
    expect(promiseLabel("youth", { count: 1.5 })).toBe("aspoň 1,5 hráče do 21 let v základní sestavě");
    expect(promiseLabel("attendance", { attendance: 400 })).toBe("průměrná domácí návštěva aspoň 400 diváků");
  });

  it("skutečnost česky", () => {
    expect(promiseActualText("league_position", 4)).toBe("4. místo");
    expect(promiseActualText("cup_round", 0)).toBe("klub v poháru nehrál");
    expect(promiseActualText("cup_round", 3)).toBe("3. kolo");
    expect(promiseActualText("no_riots", 0)).toBe("bez výtržností");
    expect(promiseActualText("no_riots", 1)).toBe("1 výtržnost");
    expect(promiseActualText("no_riots", 3)).toBe("3 výtržnosti");
    expect(promiseActualText("no_riots", 5)).toBe("5 výtržností");
    expect(promiseActualText("attendance", 380)).toBe("380 diváků v průměru");
    expect(promiseActualText("youth", 1.6)).toBe("1,6 hráče do 21 let v průměru");
    expect(promiseActualText("reputation", 68)).toBe("reputace 68");
    expect(promiseActualText("coach_licence", 2)).toBe("UEFA B");
    expect(promiseActualText("stadium_upgrade", 1)).toBe("úroveň 1");
    expect(promiseActualText("jersey_logo", 1)).toBeNull();
    expect(promiseActualText("reputation", null)).toBeNull();
  });

  it("transakce, deník náklonnosti a blok oboru bez dlouhé pomlčky", () => {
    expect(promiseTransactionText("fulfilled", "Pivovar Lhota", "postupové místo")).toBe("Pivovar Lhota: bonus za splněný slib (postupové místo)");
    expect(promiseTransactionText("partial", "Pivovar Lhota", "x")).toContain("polovina pokuty");
    expect(promiseTransactionText("broken", "Pivovar Lhota", "x")).toContain("pokuta za porušený slib");
    expect(promiseFavorReason("broken", "postupové místo")).toBe("porušený slib: postupové místo");
    for (const t of [promiseTransactionText("partial", "A", "b"), promiseFavorReason("partial", "b"), sectorBlockMessage("Pivovar Lhota")]) {
      expect(t).not.toContain("—");
    }
  });
});

describe("pomocné výpočty", () => {
  it("parametry slibu", () => {
    expect(parsePromiseParams(null)).toEqual({});
    expect(parsePromiseParams('{"position":3}')).toEqual({ position: 3 });
    expect(parsePromiseParams("[1]")).toBeNull();
    expect(parsePromiseParams("nesmysl")).toBeNull();
  });

  it("pořadí z archivované tabulky", () => {
    const json = JSON.stringify([{ pos: 1, teamId: "a" }, { pos: 2, teamId: "b" }, { pos: 3, teamId: "c" }]);
    expect(positionFromStandings(json, "b")).toEqual({ position: 2, teams: 3 });
    expect(positionFromStandings(json, "x")).toBeNull();
    expect(positionFromStandings("{", "a")).toBeNull();
  });

  it("tabulka ze zápasů: body, rozdíl skóre, vstřelené góly", () => {
    const ranks = rankTable(["a", "b", "c"], [
      { home_team_id: "a", away_team_id: "b", home_score: 1, away_score: 0 },
      { home_team_id: "c", away_team_id: "b", home_score: 3, away_score: 0 },
      { home_team_id: "a", away_team_id: "c", home_score: 0, away_score: 0 },
    ]);
    // a i c mají 4 body, c má lepší rozdíl skóre (+3 proti +1) → c první
    expect([...ranks.entries()]).toEqual([["c", 1], ["a", 2], ["b", 3]]);
  });

  it("dosažené kolo poháru", () => {
    const base = { status: "finished", total_rounds: 6, current_round: 6, eliminated_round: null, cup_team_id: "ct1", is_winner: 0 };
    expect(cupRoundReached(null)).toBeNull();
    expect(cupRoundReached({ ...base, cup_team_id: null })).toBe(0);
    expect(cupRoundReached({ ...base, eliminated_round: 2 })).toBe(2);
    expect(cupRoundReached({ ...base, is_winner: 1 })).toBe(6);
    expect(cupRoundReached({ ...base, status: "active", current_round: 4 })).toBe(4);
  });

  it("průměr na zápas", () => {
    expect(averagePerMatch(17, 10)).toBe(1.7);
    expect(averagePerMatch(0, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Spustit testy, musí spadnout**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/promise-eval.test.ts`
Expected: FAIL, `Failed to resolve import "./promise-eval"`.

- [ ] **Step 3: Napsat `promise-eval.ts`**

```ts
/**
 * Sliby sponzorům (etapa 3): vyhodnocení, důsledky a texty. Čisté funkce bez DB.
 * Spec: docs/superpowers/specs/2026-09-22-vyjednavani-se-sponzory-design.md, sekce „Etapa 3".
 *
 * Sezónní sliby vyhodnotí rollover nad daty skončené sezóny, termínové denní tick.
 * „Těsně vedle" (partial) = o jedno místo hůř, návštěva do 10 % pod cílem, reputace
 * do 3 bodů pod cílem. Stojí polovinu pokuty a nepočítá se jako porušení.
 */
import { licenceLabel } from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { FACILITY_LABELS } from "../stadium/stadium-generator";

export const PROMISE_KINDS = [
  "league_position", "promotion", "no_relegation", "cup_round", "coach_licence", "stadium_upgrade",
  "jersey_logo", "sector_exclusivity", "attendance", "youth", "reputation", "no_riots",
] as const;
export type PromiseKind = (typeof PROMISE_KINDS)[number];

export function isPromiseKind(v: unknown): v is PromiseKind {
  return typeof v === "string" && (PROMISE_KINDS as readonly string[]).includes(v);
}

/** Sliby na jednu sezónu (`sponsor_promises.season`), vyhodnocuje rollover. */
export const SEASONAL_KINDS: readonly PromiseKind[] = [
  "league_position", "promotion", "no_relegation", "cup_round", "attendance", "youth", "reputation", "no_riots",
];
/** Sliby s termínem (`deadline_game_date`), vyhodnocuje denní tick. */
export const DEADLINE_KINDS: readonly PromiseKind[] = ["coach_licence", "stadium_upgrade", "jersey_logo"];
/** Porušení, po kterém sponzor vypoví smlouvu hned, bez ohledu na počet porušení. */
export const FATAL_KINDS: readonly PromiseKind[] = ["promotion", "no_relegation"];

export type PromiseStatus = "pending" | "fulfilled" | "partial" | "broken";
export type PromiseOutcome = Exclude<PromiseStatus, "pending">;

export function isPromiseStatus(v: unknown): v is PromiseStatus {
  return v === "pending" || v === "fulfilled" || v === "partial" || v === "broken";
}

/**
 * Postupová a sestupová místa. Hra postupy zatím nemá (league/promotion.ts,
 * calculatePromotions je nezapojené), slib se ale měří stejnými zónami: dva nahoře, dva dole.
 */
export const PROMOTION_PLACES = 2;
export const RELEGATION_PLACES = 2;
export const FAVOR_FULFILLED = 5;
export const FAVOR_PARTIAL = -3;
export const FAVOR_BROKEN = -8;
export const BREACHES_TO_TERMINATE = 2;
export const TERMINATION_REPUTATION = -5;
const ATTENDANCE_PARTIAL_SHARE = 0.9;
const REPUTATION_PARTIAL_POINTS = 3;

export type PromiseParams = Record<string, unknown>;

/** Parametry slibu z JSON. `null` = nečitelné (volající slib přeskočí a zaloguje). */
export function parsePromiseParams(raw: string | null): PromiseParams | null {
  if (raw === null || raw === "") return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as PromiseParams) : null;
  } catch (e) {
    logger.warn({ module: "sponsor-promises" }, "nečitelné parametry slibu", e);
    return null;
  }
}

function num(p: PromiseParams, key: string): number | null {
  const v = p[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Co klub za sezónu dokázal. `null` = údaj chybí, slib závislý na něm nejde vyhodnotit. */
export interface SeasonStats {
  position: number | null;
  teamsInLeague: number | null;
  /** Nejvyšší odehrané kolo poháru. 0 = klub v poháru nebyl, null = pohár se nehrál. */
  cupReached: number | null;
  avgHomeAttendance: number | null;
  avgYouthStarters: number | null;
  reputation: number | null;
  riots: number | null;
}

export const EMPTY_SEASON_STATS: SeasonStats = {
  position: null, teamsInLeague: null, cupReached: null, avgHomeAttendance: null, avgYouthStarters: null,
  reputation: null, riots: null,
};

/** Stav klubu pro termínové sliby. */
export interface DeadlineState {
  licenceLevel: number | null;
  /** Úrovně zařízení podle klíčů FACILITY_LABELS. */
  facilities: Record<string, number>;
  sleeveSponsorId: number | null;
}

export interface Evaluation {
  outcome: PromiseOutcome;
  actual: number | null;
}

/** Sezónní slib nad statistikou sezóny. `null` = nejde vyhodnotit (chybí údaj nebo parametr). */
export function evaluateSeasonalPromise(kind: PromiseKind, params: PromiseParams, s: SeasonStats): Evaluation | null {
  switch (kind) {
    case "league_position": {
      const target = num(params, "position");
      if (target === null || s.position === null) return null;
      if (s.position <= target) return { outcome: "fulfilled", actual: s.position };
      if (s.position === target + 1) return { outcome: "partial", actual: s.position };
      return { outcome: "broken", actual: s.position };
    }
    case "promotion": {
      if (s.position === null) return null;
      return { outcome: s.position <= PROMOTION_PLACES ? "fulfilled" : "broken", actual: s.position };
    }
    case "no_relegation": {
      if (s.position === null || s.teamsInLeague === null) return null;
      return { outcome: s.position <= s.teamsInLeague - RELEGATION_PLACES ? "fulfilled" : "broken", actual: s.position };
    }
    case "cup_round": {
      const target = num(params, "round");
      if (target === null || s.cupReached === null) return null;
      return { outcome: s.cupReached >= target ? "fulfilled" : "broken", actual: s.cupReached };
    }
    case "attendance": {
      const target = num(params, "attendance");
      if (target === null || s.avgHomeAttendance === null) return null;
      const avg = Math.round(s.avgHomeAttendance);
      if (avg >= target) return { outcome: "fulfilled", actual: avg };
      if (avg >= target * ATTENDANCE_PARTIAL_SHARE) return { outcome: "partial", actual: avg };
      return { outcome: "broken", actual: avg };
    }
    case "youth": {
      const target = num(params, "count");
      if (target === null || s.avgYouthStarters === null) return null;
      const avg = Math.round(s.avgYouthStarters * 10) / 10;
      return { outcome: avg >= target ? "fulfilled" : "broken", actual: avg };
    }
    case "reputation": {
      const target = num(params, "reputation");
      if (target === null || s.reputation === null) return null;
      if (s.reputation >= target) return { outcome: "fulfilled", actual: s.reputation };
      if (s.reputation >= target - REPUTATION_PARTIAL_POINTS) return { outcome: "partial", actual: s.reputation };
      return { outcome: "broken", actual: s.reputation };
    }
    case "no_riots": {
      if (s.riots === null) return null;
      return { outcome: s.riots === 0 ? "fulfilled" : "broken", actual: s.riots };
    }
    case "sector_exclusivity":
      // Porušit nejde (podpis banneru stejného oboru je zablokovaný), na konci smlouvy se uzná.
      return { outcome: "fulfilled", actual: null };
    default:
      return null;
  }
}

/**
 * Termínový slib. Splněno, jakmile platí (i po termínu, když to tick stihne dřív);
 * porušeno až den po termínu. `"pending"` = zatím nic, `null` = nejde vyhodnotit.
 */
export function evaluateDeadlinePromise(
  kind: PromiseKind, params: PromiseParams, state: DeadlineState, sponsorId: number, today: string, deadline: string | null,
): Evaluation | "pending" | null {
  let met: boolean;
  let actual: number;
  switch (kind) {
    case "coach_licence": {
      const level = num(params, "level");
      if (level === null || state.licenceLevel === null) return null;
      met = state.licenceLevel >= level;
      actual = state.licenceLevel;
      break;
    }
    case "stadium_upgrade": {
      const facility = params.facility;
      const level = num(params, "level");
      if (typeof facility !== "string" || !(facility in FACILITY_LABELS) || level === null) return null;
      const current = state.facilities[facility] ?? 0;
      met = current >= level;
      actual = current;
      break;
    }
    case "jersey_logo":
      met = state.sleeveSponsorId === sponsorId;
      actual = met ? 1 : 0;
      break;
    default:
      return null;
  }
  if (met) return { outcome: "fulfilled", actual };
  if (deadline && today.slice(0, 10) > deadline.slice(0, 10)) return { outcome: "broken", actual };
  return "pending";
}

export interface Consequence {
  /** Kladně bonus, záporně pokuta. 0 = žádná transakce. */
  money: number;
  txType: "sponsor_bonus" | "sponsor_penalty" | null;
  favorDelta: number;
  /** Počítá se do `sponsor_contracts.breaches_season`. */
  breach: boolean;
}

export function promiseConsequence(outcome: PromiseOutcome, reward: number, penalty: number): Consequence {
  const bonus = Math.max(0, Math.round(reward || 0));
  const fine = Math.max(0, Math.round(penalty || 0));
  if (outcome === "fulfilled") {
    return { money: bonus, txType: bonus > 0 ? "sponsor_bonus" : null, favorDelta: FAVOR_FULFILLED, breach: false };
  }
  if (outcome === "partial") {
    const half = Math.round(fine / 2);
    return { money: half > 0 ? -half : 0, txType: half > 0 ? "sponsor_penalty" : null, favorDelta: FAVOR_PARTIAL, breach: false };
  }
  return { money: fine > 0 ? -fine : 0, txType: fine > 0 ? "sponsor_penalty" : null, favorDelta: FAVOR_BROKEN, breach: true };
}

/** Druhé porušení v sezóně, nebo porušený postup či nesestup: sponzor smlouvu vypoví. */
export function sponsorTerminates(breachesThisSeason: number, brokenKinds: readonly PromiseKind[]): boolean {
  if (brokenKinds.length === 0) return false;
  return breachesThisSeason >= BREACHES_TO_TERMINATE || brokenKinds.some((k) => FATAL_KINDS.includes(k));
}

function decimal(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

/** „1 hráč", „2 hráči", „5 hráčů", „1,5 hráče". */
function playersForm(n: number): string {
  if (!Number.isInteger(n)) return "hráče";
  if (n === 1) return "hráč";
  if (n >= 2 && n <= 4) return "hráči";
  return "hráčů";
}

function spectatorsForm(n: number): string {
  if (n === 1) return "divák";
  if (n >= 2 && n <= 4) return "diváci";
  return "diváků";
}

function riotsForm(n: number): string {
  if (n === 1) return "výtržnost";
  if (n >= 2 && n <= 4) return "výtržnosti";
  return "výtržností";
}

/** Popisek slibu v 1. pádě. Stojí za dvojtečkou nebo v závorce, nikdy uprostřed věty. */
export function promiseLabel(kind: PromiseKind, params: PromiseParams): string {
  switch (kind) {
    case "league_position": {
      const x = num(params, "position");
      return x !== null ? `umístění do ${x}. místa` : "umístění v tabulce";
    }
    case "promotion":
      return "postupové místo";
    case "no_relegation":
      return "záchrana v soutěži";
    case "cup_round": {
      const x = num(params, "round");
      return x !== null ? `pohár aspoň do ${x}. kola` : "pohár";
    }
    case "coach_licence": {
      const x = num(params, "level");
      return x !== null ? `${licenceLabel(x)} pro trenéra` : "licence pro trenéra";
    }
    case "stadium_upgrade": {
      const f = params.facility;
      const x = num(params, "level");
      const name = typeof f === "string" ? FACILITY_LABELS[f] : undefined;
      return name && x !== null ? `${name} na úrovni ${x}` : "modernizace stadionu";
    }
    case "jersey_logo":
      return "logo sponzora na rukávu dresu";
    case "sector_exclusivity":
      return "žádný banner ze stejného oboru";
    case "attendance": {
      const x = num(params, "attendance");
      return x !== null ? `průměrná domácí návštěva aspoň ${x} ${spectatorsForm(x)}` : "průměrná domácí návštěva";
    }
    case "youth": {
      const x = num(params, "count");
      return x !== null ? `aspoň ${decimal(x)} ${playersForm(x)} do 21 let v základní sestavě` : "mladí hráči v sestavě";
    }
    case "reputation": {
      const x = num(params, "reputation");
      return x !== null ? `reputace klubu aspoň ${x}` : "reputace klubu";
    }
    case "no_riots":
      return "sezóna bez výtržností fanoušků";
  }
}

/** Naměřená skutečnost česky pro obrazovku. `null` = nic k ukázání. */
export function promiseActualText(kind: PromiseKind, actual: number | null): string | null {
  if (actual === null) return null;
  switch (kind) {
    case "league_position":
    case "promotion":
    case "no_relegation":
      return `${actual}. místo`;
    case "cup_round":
      return actual === 0 ? "klub v poháru nehrál" : `${actual}. kolo`;
    case "attendance":
      return `${actual} ${spectatorsForm(actual)} v průměru`;
    case "youth":
      return `${decimal(actual)} ${playersForm(actual)} do 21 let v průměru`;
    case "reputation":
      return `reputace ${actual}`;
    case "no_riots":
      return actual === 0 ? "bez výtržností" : `${actual} ${riotsForm(actual)}`;
    case "coach_licence":
      return licenceLabel(actual);
    case "stadium_upgrade":
      return `úroveň ${actual}`;
    default:
      return null;
  }
}

/** Popis transakce ve Financích. Název firmy se neskloňuje, proto stojí před dvojtečkou. */
export function promiseTransactionText(outcome: PromiseOutcome, sponsorName: string, label: string): string {
  if (outcome === "fulfilled") return `${sponsorName}: bonus za splněný slib (${label})`;
  if (outcome === "partial") return `${sponsorName}: polovina pokuty za těsně nesplněný slib (${label})`;
  return `${sponsorName}: pokuta za porušený slib (${label})`;
}

/** Důvod v deníku náklonnosti (záložka Oblíbenost). */
export function promiseFavorReason(outcome: PromiseOutcome, label: string): string {
  if (outcome === "fulfilled") return `splněný slib: ${label}`;
  if (outcome === "partial") return `těsně nesplněný slib: ${label}`;
  return `porušený slib: ${label}`;
}

/** Proč nejde podepsat nebo prodloužit banner stejného oboru. */
export function sectorBlockMessage(sponsorName: string): string {
  return `Smlouva s ${sponsorName} slibuje, že u hřiště nebude reklama jiné firmy ze stejného oboru. Tenhle banner teď podepsat nejde.`;
}

export type PromiseSmsOccasion = "promise_kept" | "promise_broken" | "sponsor_terminates";

const OUTCOME_SEVERITY: Record<PromiseOutcome, number> = { broken: 0, partial: 1, fulfilled: 2 };

/**
 * Jedna SMS majitele za smlouvu a běh: výpověď, jinak nejhorší výsledek.
 * Víc SMS od téhož majitele by stejně spolkl pětidenní cooldown fronty.
 */
export function promiseSmsPlan(
  items: readonly { id: string; outcome: PromiseOutcome; label: string }[], terminated: boolean,
): { occasion: PromiseSmsOccasion; promiseId: string; label: string } | null {
  if (items.length === 0) return null;
  const worst = [...items].sort((a, b) =>
    OUTCOME_SEVERITY[a.outcome] - OUTCOME_SEVERITY[b.outcome] || a.id.localeCompare(b.id))[0];
  const occasion: PromiseSmsOccasion = terminated
    ? "sponsor_terminates"
    : worst.outcome === "fulfilled" ? "promise_kept" : "promise_broken";
  return { occasion, promiseId: worst.id, label: worst.label };
}

export interface MatchResultRow {
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
}

/** Pořadí v tabulce stejně jako `calculateStandings`: body, rozdíl skóre, vstřelené góly. */
export function rankTable(teamIds: readonly string[], matches: readonly MatchResultRow[]): Map<string, number> {
  const s = new Map(teamIds.map((id) => [id, { pts: 0, gf: 0, ga: 0 }]));
  for (const m of matches) {
    const h = s.get(m.home_team_id);
    const a = s.get(m.away_team_id);
    if (!h || !a) continue;
    h.gf += m.home_score; h.ga += m.away_score;
    a.gf += m.away_score; a.ga += m.home_score;
    if (m.home_score > m.away_score) h.pts += 3;
    else if (m.home_score < m.away_score) a.pts += 3;
    else { h.pts += 1; a.pts += 1; }
  }
  const order = [...s.entries()].sort(([, x], [, y]) =>
    (y.pts - x.pts) || ((y.gf - y.ga) - (x.gf - x.ga)) || (y.gf - x.gf));
  return new Map(order.map(([id], i) => [id, i + 1]));
}

/** Místo klubu v archivované konečné tabulce (`league_history.final_standings`). */
export function positionFromStandings(json: string, teamId: string): { position: number; teams: number } | null {
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch (e) {
    logger.warn({ module: "sponsor-promises", teamId }, "nečitelná konečná tabulka", e);
    return null;
  }
  if (!Array.isArray(rows)) return null;
  const entry = rows.find((r) => r !== null && typeof r === "object" && (r as { teamId?: unknown }).teamId === teamId) as
    { pos?: unknown } | undefined;
  if (!entry || typeof entry.pos !== "number") return null;
  return { position: entry.pos, teams: rows.length };
}

export interface CupEntryRow {
  status: string;
  total_rounds: number;
  current_round: number;
  eliminated_round: number | null;
  cup_team_id: string | null;
  is_winner: number;
}

/** Nejvyšší odehrané kolo poháru. `null` = pohár se nehrál, 0 = klub v něm nebyl. */
export function cupRoundReached(r: CupEntryRow | null): number | null {
  if (!r) return null;
  if (!r.cup_team_id) return 0;
  if (r.eliminated_round !== null) return r.eliminated_round;
  if (r.is_winner === 1 || r.status === "finished") return r.total_rounds;
  return r.current_round;
}

export function averagePerMatch(total: number, matches: number): number | null {
  return matches > 0 ? total / matches : null;
}
```

- [ ] **Step 4: Spustit testy a typecheck**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/promise-eval.test.ts`
Expected: PASS, všechny testy zelené.

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx tsc --noEmit`
Expected: bez chyb.

- [ ] **Step 5: Commit**

```bash
cd /Users/savrik/Projects/fmko && git add apps/api/src/sponsors/promise-eval.ts apps/api/src/sponsors/promise-eval.test.ts && git commit -m "$(cat <<'EOF'
feat(sponzori): vyhodnocení slibů sponzorům, čisté funkce

Sezónní a termínové sliby, „těsně vedle", bonus a pokuta, pravidlo
výpovědi sponzorem, české popisky a skutečnost. S testy.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: SMS majitele: splněný slib, porušený slib, výpověď

**Files:**
- Modify: `apps/api/src/sponsors/owner-sms-texts.ts`
- Modify: `apps/api/src/sponsors/owner-sms-rules.ts`
- Modify: `apps/api/src/sponsors/owner-sms.ts` (`closeOwnerSmsForRollover`)
- Test: `apps/api/src/sponsors/owner-sms-texts.test.ts`, `owner-sms-rules.test.ts`, `owner-sms.test.ts`

**Interfaces:**
- Consumes: stávající fronta (`enqueueOwnerSms`, `deliverOwnerSmsForTeam`, `pickDeliverable`).
- Produces: `OwnerSmsOccasion` rozšířený o `"promise_kept" | "promise_broken" | "sponsor_terminates"`, `OwnerSmsVars.slib?: string` (popisek slibu, `promiseLabel`), pravidla v `OCCASION_RULES`, reference `promise:{promiseId}` a `sponsor-quit:{contractId}` přežijí `closeOwnerSmsForRollover`.

| Klíč | Kdy | Čeká odpověď | Priorita | Lhůta |
|---|---|---|---|---|
| `sponsor_terminates` | sponzor vypověděl smlouvu | ne | 2 | 3 dny |
| `promise_broken` | slib porušený nebo těsně vedle | ano | 4 | 3 dny |
| `promise_kept` | slib splněný | ne | 10 | 3 dny |

Stávající příležitosti se jen přečíslují, jejich vzájemné pořadí zůstává: riot 1, sponsor_terminates 2, scandal 3, promise_broken 4, main_lost 5, after_loss 6, after_win 7, losing_streak 8, match_eve 9, promise_kept 10, main_new 11, season_complaint 12, season_thanks 13.

- [ ] **Step 1: Testy**

V `owner-sms-texts.test.ts` nahradit řádek `const VARS = { skore: "2:1", serie: 4 };` za:

```ts
const VARS = { skore: "2:1", serie: 4, slib: "umístění do 3. místa" };
```

a v testu „vyrenderovaný text nemá zbylé značky ani dlouhou pomlčku" nahradit
`.map((x) => x.replace("{skore}", "2:1").replace("{serie}", "4 prohry")));`
za
`.map((x) => x.replace("{skore}", "2:1").replace("{serie}", "4 prohry").replace("{slib}", "umístění do 3. místa")));`

Na konec `describe("OWNER_SMS_TEXTS", …)` (před jeho uzavírací `});`, za test „série proher se vyrenderuje pro 3 i 5 proher u každé povahy") přidat:

```ts
  it("SMS o slibu bez popisku slibu nevznikne", () => {
    for (const o of ["promise_kept", "promise_broken", "sponsor_terminates"] as const) {
      expect(renderOwnerSms(o, "fan", {}, "k", [])).toBeNull();
    }
  });

  it("SMS o slibu obsahuje popisek u každé povahy a nikde nezůstane značka", () => {
    for (const o of ["promise_kept", "promise_broken", "sponsor_terminates"] as const) {
      for (const p of OWNER_PERSONALITIES) {
        const out = renderOwnerSms(o, p, { slib: "postupové místo" }, `slib|${o}|${p}`, []);
        expect(out, `${o}/${p}`).toContain("postupové místo");
        expect(out).not.toMatch(/[{}]/);
        expect(out).not.toContain("—");
      }
    }
  });
```

V `owner-sms-rules.test.ts` přidat na konec souboru:

```ts
describe("priority slibů sponzorům", () => {
  it("porušený slib předběhne splněný", () => {
    expect(pickDeliverable([p("a", 1, "promise_kept"), p("b", 1, "promise_broken")], [], TODAY)?.id).toBe("b");
  });

  it("výpověď předběhne porušený slib i skandál, výtržnost má pořád přednost", () => {
    expect(pickDeliverable([p("a", 1, "promise_broken"), p("b", 2, "sponsor_terminates"), p("c", 3, "scandal")], [], TODAY)?.id).toBe("b");
    expect(pickDeliverable([p("a", 1, "sponsor_terminates"), p("b", 2, "riot")], [], TODAY)?.id).toBe("b");
  });
});
```

V `owner-sms.test.ts` do `describe("closeOwnerSmsForRollover", …)` přidat:

```ts
  it("nechá ve frontě i SMS o slibech a výpovědi, které rollover zařadil před úklidem", async () => {
    const db = new FalesnaD1();
    await closeOwnerSmsForRollover(jakoD1(db));
    const dropSql = db.davky[0].find((d) => /status = 'pending'/.test(d.sql) && /'dropped'/.test(d.sql));
    expect(dropSql?.sql).toContain("reference_id NOT LIKE 'promise:%'");
    expect(dropSql?.sql).toContain("reference_id NOT LIKE 'sponsor-quit:%'");
  });
```

- [ ] **Step 2: Spustit, musí spadnout**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/owner-sms-texts.test.ts src/sponsors/owner-sms-rules.test.ts src/sponsors/owner-sms.test.ts`
Expected: FAIL (neznámé příležitosti, typová chyba `slib`, chybějící `promise:%`).

- [ ] **Step 3: `owner-sms-texts.ts`**

Nahradit seznam příležitostí:

```ts
export const OWNER_SMS_OCCASIONS = [
  "match_eve", "after_win", "after_loss", "losing_streak", "riot",
  "main_lost", "main_new", "season_thanks", "season_complaint", "scandal",
  "promise_kept", "promise_broken", "sponsor_terminates",
] as const;
```

Rozšířit `OwnerSmsVars`:

```ts
/**
 * Proměnné šablon: `{skore}` z pohledu domácích („2:1"), `{serie}` = počet proher v řadě,
 * `{slib}` = popisek slibu v 1. pádě (`promiseLabel`), v šablonách vždy za dvojtečkou.
 */
export interface OwnerSmsVars {
  skore?: string;
  serie?: number;
  slib?: string;
}
```

V `OWNER_SMS_TEXTS` za blok `scandal` (za řádek `      "Tohle je přesně to, čeho se bojím. Vysvětlíte mi to?",` a jeho `    ],\n  },`) před uzavírací `};` přidat:

```ts
  promise_kept: {
    fan: [
      "Slib platí: {slib}. Takhle se dělá fotbal, klobouk dolů!",
      "Dohoda dodržená: {slib}. Kvůli tomuhle to celé dělám, díky!",
      "Splněno: {slib}. Na příští zápas nesu na tribunu ještě větší vlajku.",
    ],
    patriot: [
      "Slovo platí: {slib}. Takhle se chová poctivej klub.",
      "Dohoda dodržená: {slib}. Celá vesnice to ocení.",
      "Splněno: {slib}. Na tohle jsem hrdej, díky.",
    ],
    businessman: [
      "Slib splněn: {slib}. Spolupráce se vyplácí, děkuji.",
      "Potvrzuji splnění: {slib}. Přesně tak má partnerství fungovat.",
      "Dohoda dodržena: {slib}. S takovým partnerem se dobře obchoduje.",
    ],
    cautious: [
      "Splněno: {slib}. Ulevilo se mi, děkuji za spolehlivost.",
      "Dohoda dodržena: {slib}. Jsem rád, že se na vás dá spolehnout.",
      "Slib platí: {slib}. Přesně takovou jistotu jsem potřeboval.",
    ],
  },
  promise_broken: {
    fan: [
      "Slib neplatí: {slib}. Fandím dál, ale tohle mě mrzí. Co se stalo?",
      "Dohoda nevyšla: {slib}. Čekal jsem víc, řekni mi, co bude dál.",
      "Tohle bolí. Slib zněl jasně: {slib}. Podle smlouvy přijde pokuta.",
    ],
    patriot: [
      "Slib zněl jasně: {slib}. Nevyšlo to a vesnice se ptá proč.",
      "Dohoda nevyšla: {slib}. Slovo se má držet, to přece víš.",
      "Na tomhle jsme si plácli: {slib}. A nevyšlo to. Jak to napravíš?",
    ],
    businessman: [
      "Slib nesplněn: {slib}. Smlouva počítá s pokutou, ta půjde z vašeho účtu.",
      "Dohoda nebyla dodržena: {slib}. Očekávám vysvětlení.",
      "Nesplněno: {slib}. Takhle si partnerství nepředstavuji.",
    ],
    cautious: [
      "Slib nevyšel: {slib}. Dělá mi to starosti. Co bude dál?",
      "Dohoda nebyla dodržena: {slib}. Potřebuji vědět, že se to nebude opakovat.",
      "Nesplněno: {slib}. Nejsem si teď jistý, jestli jsem udělal dobře.",
    ],
  },
  sponsor_terminates: {
    fan: [
      "Mrzí mě to, ale končím. Slib zněl jasně: {slib}. Fandit budu dál, platit už ne.",
      "Dost. Dohoda nevyšla: {slib}. Smlouvu vypovídám, srdce mi to trhá.",
      "Končím se sponzorstvím. Zase to nevyšlo: {slib}. Na tribunu chodit budu.",
    ],
    patriot: [
      "Slovo se nedrží, tak končím. Slib zněl: {slib}. Obci přeju jen dobré.",
      "Smlouvu vypovídám. Dohoda nevyšla: {slib}. Takhle se se sponzorem nejedná.",
      "Končíme. Na tomhle jsme si plácli: {slib}. Víc k tomu nemám.",
    ],
    businessman: [
      "Smlouvu tímto vypovídám. Nesplněno: {slib}. Výpovědní pokutu po vás nechci, pokuty za sliby platí.",
      "Spolupráce končí. Dohoda nebyla dodržena: {slib}. Obchod je obchod.",
      "Vypovídám smlouvu. Nesplněno: {slib}. Za těchto podmínek pokračovat nemohu.",
    ],
    cautious: [
      "Musím smlouvu vypovědět. Nesplněno: {slib}. Nerad to dělám, ale riziko je moc velké.",
      "Končím. Dohoda nebyla dodržena: {slib}. Potřebuji partnera, na kterého je spoleh.",
      "Smlouvu vypovídám. Slib nevyšel: {slib}. Přeji klubu klid a pořádek.",
    ],
  },
```

Ve funkci `fill` nahradit návratový řádek:

```ts
  return t.replace(/\{skore\}/g, vars.skore ?? "").replace(/\{serie\}/g, serie).replace(/\{slib\}/g, vars.slib ?? "");
```

V `renderOwnerSms` za řádek `if (pool.some((t) => t.includes("{serie}")) && vars.serie === undefined) return null;` přidat:

```ts
  if (pool.some((t) => t.includes("{slib}")) && vars.slib === undefined) return null;
```

a v doc komentáři `renderOwnerSms` doplnit do závorky „chybějící `{skore}`, `{serie}` i `{slib}`".

V `OCCASION_REPLY_KIND` za `main_lost: "farewell",` přidat:

```ts
  promise_kept: "positive",
  promise_broken: "concern",
  sponsor_terminates: "farewell",
```

- [ ] **Step 4: `owner-sms-rules.ts`**

Celé `OCCASION_RULES` nahradit:

```ts
export const OCCASION_RULES: Record<OwnerSmsOccasion, OccasionRule> = {
  riot: { expectsReply: true, priority: 1, deliverDays: 2 },
  sponsor_terminates: { expectsReply: false, priority: 2, deliverDays: 3 },
  scandal: { expectsReply: true, priority: 3, deliverDays: 3 },
  promise_broken: { expectsReply: true, priority: 4, deliverDays: 3 },
  main_lost: { expectsReply: true, priority: 5, deliverDays: 3 },
  after_loss: { expectsReply: true, priority: 6, deliverDays: 1 },
  after_win: { expectsReply: false, priority: 7, deliverDays: 1 },
  losing_streak: { expectsReply: true, priority: 8, deliverDays: 2 },
  match_eve: { expectsReply: false, priority: 9, deliverDays: 0 },
  promise_kept: { expectsReply: false, priority: 10, deliverDays: 3 },
  main_new: { expectsReply: false, priority: 11, deliverDays: 3 },
  season_complaint: { expectsReply: true, priority: 12, deliverDays: 3 },
  season_thanks: { expectsReply: false, priority: 13, deliverDays: 3 },
};
```

- [ ] **Step 5: `owner-sms.ts`, `closeOwnerSmsForRollover`**

Nahradit příkaz:

```ts
    db.prepare(
      `UPDATE sponsor_owner_sms SET status = 'dropped' WHERE status = 'pending'
         AND reference_id NOT LIKE 'season:%' AND reference_id NOT LIKE 'main-expired:%'`,
    ),
```

za:

```ts
    db.prepare(
      `UPDATE sponsor_owner_sms SET status = 'dropped' WHERE status = 'pending'
         AND reference_id NOT LIKE 'season:%' AND reference_id NOT LIKE 'main-expired:%'
         AND reference_id NOT LIKE 'promise:%' AND reference_id NOT LIKE 'sponsor-quit:%'`,
    ),
```

a v doc komentáři funkce odstavec „Výjimka je fronta samotného rolloveru (`season:` a `main-expired:` reference)" rozšířit na „(`season:`, `main-expired:`, a sliby sponzorům `promise:` a `sponsor-quit:`, které rollover vyhodnotí v kroku 4a)".

- [ ] **Step 6: Testy a typecheck**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/`
Expected: PASS všech souborů v `src/sponsors/`.

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx tsc --noEmit`
Expected: bez chyb.

- [ ] **Step 7: Commit**

```bash
cd /Users/savrik/Projects/fmko && git add apps/api/src/sponsors/owner-sms-texts.ts apps/api/src/sponsors/owner-sms-rules.ts apps/api/src/sponsors/owner-sms.ts apps/api/src/sponsors/owner-sms-texts.test.ts apps/api/src/sponsors/owner-sms-rules.test.ts apps/api/src/sponsors/owner-sms.test.ts && git commit -m "$(cat <<'EOF'
feat(sponzori): SMS majitele o splněném a porušeném slibu a o výpovědi

Tři nové příležitosti ve frontě SMS od majitelů s texty podle povahy,
proměnná {slib} a pravidla priority. Rollover nechá SMS o slibech
ve frontě.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Důsledky slibů a výpověď sponzorem (`promise-resolve.ts`), typy transakcí

**Files:**
- Create: `apps/api/src/sponsors/promise-resolve.ts`
- Test: `apps/api/src/sponsors/promise-resolve.test.ts`
- Modify: `apps/api/src/season/finance-processor.ts` (`TransactionType`)
- Modify: `apps/web/src/app/(hra)/finance/page.tsx` (`TXN_ICONS`, `TXN_LABELS`)

**Interfaces:**
- Consumes: Task 2 (`promise-eval.ts`), Task 3 (příležitosti SMS), `recordTransaction`, `favorDeltaStmts`, `applyReputationDelta`, `sendSystemSMS`, `enqueueOwnerSms`.
- Produces:
  - `interface PromiseRow`, `interface ContractRow`, `interface PromiseEvaluation`, `interface ResolveContext { gameDate: string; day: string }`
  - `claimPromise(db, id, outcome, actual, resolvedAt): Promise<boolean>`
  - `applyContractOutcomes(db, contract, evaluations, ctx): Promise<{ applied: PromiseEvaluation[]; terminated: boolean }>`
  - `terminateContractBySponsor(db, contract, ctx): Promise<boolean>`
  - typy transakcí `sponsor_bonus`, `sponsor_penalty` (ani jeden není v `PURCHASE_TYPES`: pokuta se strhne i při záporném rozpočtu).

- [ ] **Step 1: Ověřit, že etapa 2 typy nepřidala**

Run: `cd /Users/savrik/Projects/fmko && grep -n '"sponsor_bonus"\|"sponsor_penalty"' apps/api/src/season/finance-processor.ts "apps/web/src/app/(hra)/finance/page.tsx"`
Expected: žádný výstup. Když některý typ už existuje, jeho řádek v krocích 4 a 5 vynechat.

- [ ] **Step 2: Testy**

```ts
/**
 * Důsledky slibů nad falešnou D1: nárok před penězi, bonus a pokuta jako transakce,
 * náklonnost přes deník, počítadlo porušení, výpověď sponzorem a jedna SMS za smlouvu.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1, type Pravidlo } from "../incidents/testovaci-d1";
import { applyContractOutcomes, type ContractRow, type PromiseEvaluation, type PromiseRow } from "./promise-resolve";

const CONTRACT: ContractRow = {
  id: "c1", team_id: "t1", sponsor_id: 7, sponsor_name: "Pivovar Lhota", category: "main", seasons_remaining: 2,
};
const CTX = { gameDate: "2026-09-23T16:00:00.000Z", day: "2026-09-23" };

function row(id: string, kind: string, over: Partial<PromiseRow> = {}): PromiseRow {
  return {
    id, contract_id: "c1", team_id: "t1", sponsor_id: 7, kind, params: "{}", season: 5, deadline_game_date: null,
    reward: 0, penalty: 8000, status: "pending", ...over,
  };
}

function ev(r: PromiseRow, outcome: PromiseEvaluation["outcome"], actual: number | null = null): PromiseEvaluation {
  return { row: r, kind: r.kind as PromiseEvaluation["kind"], outcome, actual };
}

function rules(over: Pravidlo[] = []): Pravidlo[] {
  return [
    ...over,
    { sql: /UPDATE sponsor_promises SET status/, all: [{ id: "x" }] },
    { sql: /breaches_season = breaches_season \+ 1/, all: [{ breaches_season: 1 }] },
    { sql: /UPDATE teams SET budget/, first: { budget: 10000 } },
    { sql: /SELECT reputation FROM teams/, first: { reputation: 50 } },
    { sql: /FROM teams t JOIN villages v/, first: { name: "FK Pivovar Lhota Lhota", village_name: "Lhota" } },
    { sql: /SET status = 'terminated'/, all: [{ id: "c1" }] },
  ];
}

const transakce = (db: FalesnaD1) => db.dotazy.filter((d) => /INSERT INTO transactions/.test(d.sql));
const sms = (db: FalesnaD1) => db.dotazy.filter((d) => /INSERT OR IGNORE INTO sponsor_owner_sms/.test(d.sql));
const denik = (db: FalesnaD1) => db.davky.flat().filter((d) => /INSERT INTO sponsor_favor_log/.test(d.sql));

describe("applyContractOutcomes", () => {
  it("splněný slib s bonusem: transakce, +5 do deníku, SMS promise_kept", async () => {
    const db = new FalesnaD1(rules());
    const r = row("p1", "reputation", { params: '{"reputation":60}', reward: 12000 });
    const out = await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(r, "fulfilled", 64)], CTX);
    expect(out).toEqual({ applied: [ev(r, "fulfilled", 64)], terminated: false });
    const claim = db.dotazy.find((d) => /UPDATE sponsor_promises SET status/.test(d.sql));
    expect(claim?.params).toEqual(["fulfilled", 64, CTX.gameDate, "p1"]);
    const tx = transakce(db);
    expect(tx).toHaveLength(1);
    expect(tx[0].params[2]).toBe("sponsor_bonus");
    expect(tx[0].params[3]).toBe(12000);
    expect(tx[0].params[5]).toBe("Pivovar Lhota: bonus za splněný slib (reputace klubu aspoň 60)");
    expect(tx[0].params[6]).toBe("promise:p1");
    expect(denik(db)[0].params.slice(2, 4)).toEqual([5, "splněný slib: reputace klubu aspoň 60"]);
    expect(db.pocet(/breaches_season = breaches_season \+ 1/)).toBe(0);
    expect(sms(db)[0].params[3]).toBe("promise_kept");
    expect(sms(db)[0].params[4]).toBe("promise:p1");
    expect(JSON.parse(sms(db)[0].params[6] as string)).toEqual({ slib: "reputace klubu aspoň 60" });
  });

  it("slib už vyřízený jiným během: žádné peníze, náklonnost ani SMS", async () => {
    const db = new FalesnaD1(rules([{ sql: /UPDATE sponsor_promises SET status/, all: [] }]));
    const out = await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(row("p1", "no_riots"), "broken", 1)], CTX);
    expect(out).toEqual({ applied: [], terminated: false });
    expect(transakce(db)).toHaveLength(0);
    expect(db.davky).toHaveLength(0);
    expect(sms(db)).toHaveLength(0);
  });

  it("těsně vedle: polovina pokuty, −3, porušení se nepočítá", async () => {
    const db = new FalesnaD1(rules());
    await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(row("p1", "league_position", { params: '{"position":3}', penalty: 9000 }), "partial", 4)], CTX);
    expect(transakce(db)[0].params.slice(2, 4)).toEqual(["sponsor_penalty", -4500]);
    expect(denik(db)[0].params[2]).toBe(-3);
    expect(db.pocet(/breaches_season = breaches_season \+ 1/)).toBe(0);
    expect(sms(db)[0].params[3]).toBe("promise_broken");
  });

  it("první porušení: pokuta, −8, počítadlo, smlouva trvá", async () => {
    const db = new FalesnaD1(rules());
    const out = await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(row("p1", "league_position", { params: '{"position":3}' }), "broken", 7)], CTX);
    expect(out.terminated).toBe(false);
    expect(transakce(db)[0].params.slice(2, 4)).toEqual(["sponsor_penalty", -8000]);
    expect(denik(db)[0].params[2]).toBe(-8);
    expect(db.pocet(/breaches_season = breaches_season \+ 1/)).toBe(1);
    expect(db.pocet(/SET status = 'terminated'/)).toBe(0);
    expect(sms(db)[0].params[3]).toBe("promise_broken");
  });

  it("druhé porušení v sezóně: výpověď, návrat názvu, reputace −5, zpráva do ligy, jediná SMS o výpovědi", async () => {
    const db = new FalesnaD1(rules([{ sql: /breaches_season = breaches_season \+ 1/, all: [{ breaches_season: 2 }] }]));
    const out = await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(row("p1", "no_riots"), "broken", 2)], CTX);
    expect(out.terminated).toBe(true);
    const rename = db.davky.flat().find((d) => /UPDATE teams SET name = \? WHERE id = \?/.test(d.sql));
    expect(rename?.params).toEqual(["SK Lhota", "t1"]);
    const rep = db.davky.flat().find((d) => /INSERT INTO reputation_log/.test(d.sql));
    expect(rep?.params[3]).toBe(-5);
    expect(rep?.params[7]).toBe("sponsor-quit-c1");
    expect(db.pocet(/INSERT INTO news/)).toBe(1);
    expect(sms(db)).toHaveLength(1);
    expect(sms(db)[0].params[3]).toBe("sponsor_terminates");
    expect(sms(db)[0].params[4]).toBe("sponsor-quit:c1");
    // Klub neplatí výpovědní pokutu, jen pokutu za slib.
    expect(transakce(db).map((t) => t.params[2])).toEqual(["sponsor_penalty"]);
  });

  it("porušený nesestup vypoví smlouvu hned, i jako první porušení", async () => {
    const db = new FalesnaD1(rules());
    const out = await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(row("p1", "no_relegation"), "broken", 13)], CTX);
    expect(out.terminated).toBe(true);
  });

  it("výpověď sponzora stadionu vrátí název stadionu, klub se nepřejmenuje", async () => {
    const db = new FalesnaD1(rules());
    await applyContractOutcomes(jakoD1(db), { ...CONTRACT, category: "stadium" }, [ev(row("p1", "promotion"), "broken", 5)], CTX);
    expect(db.dotazy.find((d) => /UPDATE teams SET stadium_name/.test(d.sql))?.params).toEqual(["Sportovní areál Lhota", "t1"]);
    expect(db.pocet(/UPDATE teams SET name = \? WHERE id = \?/)).toBe(0);
  });

  it("smlouvu už vypověděl jiný běh: žádné přejmenování ani reputace, SMS o porušení", async () => {
    const db = new FalesnaD1(rules([{ sql: /SET status = 'terminated'/, all: [] }]));
    const out = await applyContractOutcomes(jakoD1(db), CONTRACT, [ev(row("p1", "promotion"), "broken", 5)], CTX);
    expect(out.terminated).toBe(false);
    expect(db.pocet(/UPDATE teams SET name/)).toBe(0);
    expect(db.pocet(/INSERT INTO reputation_log/)).toBe(0);
    expect(sms(db)[0].params[3]).toBe("promise_broken");
  });
});
```

- [ ] **Step 3: Spustit, musí spadnout**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/promise-resolve.test.ts`
Expected: FAIL, `Failed to resolve import "./promise-resolve"`.

- [ ] **Step 4: Typy transakcí**

V `apps/api/src/season/finance-processor.ts` v unionu `TransactionType` nahradit řádek `  | "bet_confiscated"` za:

```ts
  | "bet_confiscated"
  // Sliby sponzorům (etapa 3): bonus za splněný slib a pokuta za nesplněný.
  // Pokuta ZÁMĚRNĚ není v PURCHASE_TYPES, strhne se i při záporném rozpočtu jako disciplinary_fine.
  | "sponsor_bonus"
  | "sponsor_penalty"
```

Pozor: komentáře uvnitř unionu nesmí obsahovat středník. `season/transaction-labels.test.ts` blok typů dělí na prvním `;`.

- [ ] **Step 5: Popisky na webu**

V `apps/web/src/app/(hra)/finance/page.tsx` v `TXN_ICONS` nahradit `  competition_grant: "🏛", bet_confiscated: "🚫",` za:

```ts
  competition_grant: "🏛", bet_confiscated: "🚫",
  sponsor_bonus: "🎯", sponsor_penalty: "⚠️",
```

a v `TXN_LABELS` nahradit `  bet_confiscated: "Zabavená výhra ze sázky",` za:

```ts
  bet_confiscated: "Zabavená výhra ze sázky",
  sponsor_bonus: "Bonus od sponzora", sponsor_penalty: "Pokuta od sponzora",
```

- [ ] **Step 6: Napsat `promise-resolve.ts`**

```ts
/**
 * Sliby sponzorům (etapa 3): důsledky vyhodnocení. Nárok na slib, bonus nebo pokuta,
 * náklonnost majitele, počítadlo porušení, výpověď sponzorem a SMS majitele.
 *
 * Idempotence: každý slib se nejdřív nárokuje podmíněným UPDATE … WHERE status = 'pending'
 * RETURNING přes `.all()` (`.run()` řádky z RETURNING v produkční D1 nevrací). Teprve
 * potom peníze, náklonnost a SMS. Rollover i ruční běh se proto smí opakovat.
 */
import { logger } from "../lib/logger";
import { applyReputationDelta } from "../lib/reputation";
import { sendSystemSMS } from "../lib/sms";
import { recordTransaction } from "../season/finance-processor";
import { favorDeltaStmts } from "./favor";
import { enqueueOwnerSms } from "./owner-sms";
import {
  parsePromiseParams, promiseConsequence, promiseFavorReason, promiseLabel, promiseSmsPlan, promiseTransactionText,
  sponsorTerminates, TERMINATION_REPUTATION, type PromiseKind, type PromiseOutcome,
} from "./promise-eval";

const M = "sponsor-promises";

/** Řádek `sponsor_promises` (migrace 0221). */
export interface PromiseRow {
  id: string;
  contract_id: string;
  team_id: string;
  sponsor_id: number;
  kind: string;
  params: string | null;
  season: number | null;
  deadline_game_date: string | null;
  reward: number;
  penalty: number;
  status: string;
}

/** Smlouva, ke které sliby patří. */
export interface ContractRow {
  id: string;
  team_id: string;
  sponsor_id: number;
  sponsor_name: string;
  category: string | null;
  seasons_remaining: number;
}

export interface PromiseEvaluation {
  row: PromiseRow;
  kind: PromiseKind;
  outcome: PromiseOutcome;
  actual: number | null;
}

/** `gameDate` = herní ISO pro transakce a resolved_at, `day` = herní den YYYY-MM-DD pro frontu SMS. */
export interface ResolveContext {
  gameDate: string;
  day: string;
}

/** Nárok na slib. `true` = tenhle běh ho vyřídil a smí připsat důsledky. */
export async function claimPromise(
  db: D1Database, id: string, outcome: PromiseOutcome, actual: number | null, resolvedAt: string,
): Promise<boolean> {
  const res = await db.prepare(
    `UPDATE sponsor_promises SET status = ?, actual_value = ?, resolved_at = ?
     WHERE id = ? AND status = 'pending'
     RETURNING id`,
  ).bind(outcome, actual, resolvedAt, id).all<{ id: string }>();
  return res.results.length === 1;
}

function labelOf(e: PromiseEvaluation): string {
  return promiseLabel(e.kind, parsePromiseParams(e.row.params) ?? {});
}

/**
 * Připíše výsledky slibů jedné smlouvy. Důsledky po jednom, výpověď se rozhodne
 * jednou za smlouvu, SMS majitele jde jedna (výpověď > porušení > splnění).
 */
export async function applyContractOutcomes(
  db: D1Database, contract: ContractRow, evaluations: readonly PromiseEvaluation[], ctx: ResolveContext,
): Promise<{ applied: PromiseEvaluation[]; terminated: boolean }> {
  const applied: PromiseEvaluation[] = [];
  let breaches = 0;
  const teamId = contract.team_id;

  for (const ev of evaluations) {
    if (!(await claimPromise(db, ev.row.id, ev.outcome, ev.actual, ctx.gameDate))) continue;
    applied.push(ev);
    const label = labelOf(ev);
    const cons = promiseConsequence(ev.outcome, ev.row.reward, ev.row.penalty);

    // Od nároku je slib vyřízený. Každý důsledek ve vlastním try: pád jednoho
    // nesmí zastavit ostatní důsledky ani další sliby téže smlouvy.
    if (cons.txType) {
      try {
        await recordTransaction(db, teamId, cons.txType, cons.money,
          promiseTransactionText(ev.outcome, contract.sponsor_name, label), ctx.gameDate, `promise:${ev.row.id}`);
      } catch (e) {
        logger.error({ module: M, teamId }, `peníze za slib ${ev.row.id}`, e);
      }
    }
    try {
      await db.batch(favorDeltaStmts(db, ev.row.sponsor_id, teamId, cons.favorDelta, promiseFavorReason(ev.outcome, label)));
    } catch (e) {
      logger.error({ module: M, teamId }, `náklonnost za slib ${ev.row.id}`, e);
    }
    if (cons.breach) {
      try {
        const r = await db.prepare(
          "UPDATE sponsor_contracts SET breaches_season = breaches_season + 1 WHERE id = ? RETURNING breaches_season",
        ).bind(contract.id).all<{ breaches_season: number }>();
        breaches = Math.max(breaches, r.results[0]?.breaches_season ?? 0);
      } catch (e) {
        logger.error({ module: M, teamId }, `počítadlo porušení smlouvy ${contract.id}`, e);
      }
    }
  }
  if (applied.length === 0) return { applied, terminated: false };

  const brokenKinds = applied.filter((a) => a.outcome === "broken").map((a) => a.kind);
  let terminated = false;
  if (sponsorTerminates(breaches, brokenKinds)) {
    try {
      terminated = await terminateContractBySponsor(db, contract, ctx);
    } catch (e) {
      logger.error({ module: M, teamId }, `výpověď smlouvy ${contract.id} sponzorem`, e);
    }
  }

  try {
    const plan = promiseSmsPlan(applied.map((a) => ({ id: a.row.id, outcome: a.outcome, label: labelOf(a) })), terminated);
    if (plan) {
      await enqueueOwnerSms(db, {
        sponsorId: contract.sponsor_id, teamId, occasion: plan.occasion,
        referenceId: terminated ? `sponsor-quit:${contract.id}` : `promise:${plan.promiseId}`,
        day: ctx.day, vars: { slib: plan.label },
      });
    }
  } catch (e) {
    logger.warn({ module: M, teamId }, `SMS majitele ke slibům smlouvy ${contract.id}`, e);
  }
  return { applied, terminated };
}

/**
 * Sponzor vypoví smlouvu za nesplněné sliby. Nárok přes status = 'active'. Návrat názvu
 * jako při ukončení klubem (SK <obec> / Sportovní areál <obec>), reputace −5, zpráva do
 * ligy, zpráva sportovního ředitele. Výpovědní pokutu klub neplatí; zaplacenou stavbu
 * ani podpisový příspěvek sponzor zpět nechce. `false` = smlouvu už ukončil někdo jiný.
 */
export async function terminateContractBySponsor(db: D1Database, contract: ContractRow, ctx: ResolveContext): Promise<boolean> {
  const claim = await db.prepare(
    "UPDATE sponsor_contracts SET status = 'terminated' WHERE id = ? AND status = 'active' RETURNING id",
  ).bind(contract.id).all<{ id: string }>();
  if (claim.results.length !== 1) return false;

  const teamId = contract.team_id;
  const category = contract.category === "stadium" || contract.category === "banner" ? contract.category : "main";
  const team = await db.prepare(
    "SELECT t.name, v.name AS village_name FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?",
  ).bind(teamId).first<{ name: string; village_name: string }>();
  const oldName = team?.name ?? "";
  const village = team?.village_name ?? "";
  const newName = `SK ${village}`.trim();

  try {
    if (category === "main") {
      await db.batch([
        db.prepare("UPDATE teams SET name = ? WHERE id = ?").bind(newName, teamId),
        db.prepare("UPDATE cup_teams SET name = ? WHERE team_id = ?").bind(newName, teamId),
        db.prepare("UPDATE teams SET name = ? WHERE parent_team_id = ? AND team_type = 'u21'").bind(`${newName} U21`, teamId),
      ]);
    } else if (category === "stadium") {
      await db.prepare("UPDATE teams SET stadium_name = ? WHERE id = ?").bind(`Sportovní areál ${village}`.trim(), teamId).run();
    }
    await db.prepare("UPDATE teams SET sleeve_sponsor_id = NULL WHERE id = ? AND sleeve_sponsor_id = ?")
      .bind(teamId, contract.sponsor_id).run();
  } catch (e) {
    logger.error({ module: M, teamId }, `návrat názvu po výpovědi smlouvy ${contract.id}`, e);
  }

  try {
    await applyReputationDelta(db, teamId, TERMINATION_REPUTATION, "sponsor",
      `${contract.sponsor_name} vypověděl smlouvu za nesplněné sliby`,
      { referenceId: `sponsor-quit-${contract.id}`, gameDate: ctx.gameDate });

    const headline = category === "main"
      ? `${oldName} se přejmenovává na ${newName}`
      : `${contract.sponsor_name} končí u klubu ${oldName}`;
    const body = category === "main"
      ? `Firma ${contract.sponsor_name} vypověděla klubu ${oldName} smlouvu hlavního sponzora kvůli nesplněným slibům. Klub se vrací k názvu ${newName}.`
      : `Firma ${contract.sponsor_name} vypověděla klubu ${oldName} smlouvu kvůli nesplněným slibům.`;
    await db.prepare(
      `INSERT INTO news (id, league_id, team_id, type, headline, body, created_at)
       VALUES (?, (SELECT league_id FROM teams WHERE id = ?), ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    ).bind(crypto.randomUUID(), teamId, teamId, category === "main" ? "rename" : "sponsor", headline, body).run();

    await sendSystemSMS(db, teamId, "Sportovní ředitel", "Sportovní ředitel",
      `📋 Firma ${contract.sponsor_name} vypověděla smlouvu, protože klub nedodržel sliby.`
      + (category === "main" ? ` Klub se vrací k názvu ${newName}.` : "")
      + " Výpovědní pokutu neplatíme, pokuty za porušené sliby ano. Reputace klesla o 5.");
  } catch (e) {
    logger.error({ module: M, teamId }, `zpráva o výpovědi smlouvy ${contract.id}`, e);
  }
  logger.info({ module: M, teamId }, `sponzor ${contract.sponsor_id} vypověděl smlouvu ${contract.id}`);
  return true;
}
```

- [ ] **Step 7: Testy a typecheck**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/promise-resolve.test.ts src/season/transaction-labels.test.ts`
Expected: PASS.

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx tsc --noEmit`
Expected: bez chyb.

- [ ] **Step 8: Commit**

```bash
cd /Users/savrik/Projects/fmko && git add apps/api/src/sponsors/promise-resolve.ts apps/api/src/sponsors/promise-resolve.test.ts apps/api/src/season/finance-processor.ts "apps/web/src/app/(hra)/finance/page.tsx" && git commit -m "$(cat <<'EOF'
feat(sponzori): bonusy, pokuty a výpověď sponzorem za sliby

Nárok na slib před penězi, transakce sponsor_bonus a sponsor_penalty,
náklonnost přes deník, počítadlo porušení a výpověď sponzorem s návratem
názvu, reputací -5, zprávou do ligy a SMS. Popisky ve Financích.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Data a běhy vyhodnocení (`promise-data.ts`, `promise-runs.ts`)

**Files:**
- Create: `apps/api/src/sponsors/promise-data.ts`
- Create: `apps/api/src/sponsors/promise-runs.ts`
- Test: `apps/api/src/sponsors/promise-runs.test.ts`

**Interfaces:**
- Consumes: Task 2, Task 4 (`applyContractOutcomes`, `ContractRow`, `PromiseRow`, `PromiseEvaluation`), `FACILITY_LABELS`.
- Produces:
  - `promise-data.ts`: `loadSeasonStats(db, teamId, season, { agedSinceSeason }): Promise<SeasonStats>`, `loadDeadlineState(db, teamId): Promise<DeadlineState>`
  - `promise-runs.ts`: `interface RunResult { resolved: number; skipped: number; terminated: number }`, `evaluateDeadlinePromises(db, todayIso, { teamId? })`, `evaluateSeasonPromises(db, season, { gameDate, day, agedSinceSeason })`, `shiftPromiseDeadlinesForRollover(db, oldSeason, newDay): Promise<boolean>`, `resetSeasonBreaches(db): Promise<void>`, `exclusiveSectors(db, teamId): Promise<Map<string, string>>` (obor → firma), `interface PromiseView`, `listTeamPromises(db, teamId): Promise<PromiseView[]>`, `placeSleeveLogo(db, teamId, promiseId, todayIso)`

- [ ] **Step 1: Testy**

```ts
/**
 * Data a běhy vyhodnocení slibů nad falešnou D1: sezónní statistika z archivu i ze
 * zápasů, termínové sliby v ticku, sezónní v rolloveru, posun termínů, exkluzivita
 * oboru, výpis slibů a logo na rukávu.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1, type Pravidlo } from "../incidents/testovaci-d1";
import { loadDeadlineState, loadSeasonStats } from "./promise-data";
import {
  evaluateDeadlinePromises, evaluateSeasonPromises, exclusiveSectors, listTeamPromises, placeSleeveLogo,
  shiftPromiseDeadlinesForRollover,
} from "./promise-runs";

const STANDINGS = JSON.stringify([{ pos: 1, teamId: "a" }, { pos: 2, teamId: "t1" }, { pos: 3, teamId: "c" }]);

const STATS_RULES: Pravidlo[] = [
  { sql: /FROM league_history/, first: { final_standings: STANDINGS } },
  { sql: /FROM cup_competitions/, first: { status: "finished", total_rounds: 6, current_round: 6, eliminated_round: 3, cup_team_id: "ct1", is_winner: 0 } },
  { sql: /AVG\(m\.attendance\)/, first: { avg: 412.4 } },
  { sql: /match_player_stats/, first: { matches: 10, young: 17 } },
  { sql: /SELECT reputation FROM teams/, first: { reputation: 61 } },
  { sql: /FROM fan_incidents/, first: { n: 1 } },
];

function pending(over: Record<string, unknown>) {
  return {
    id: "p1", contract_id: "c1", team_id: "t1", sponsor_id: 7, kind: "reputation", params: '{"reputation":60}',
    season: 5, deadline_game_date: null, reward: 0, penalty: 4000, status: "pending",
    sponsor_name: "Pivovar Lhota", category: "main", seasons_remaining: 2, ...over,
  };
}

describe("loadSeasonStats", () => {
  it("skládá sezónu z archivu tabulky, poháru, návštěvy, mladých, reputace a výtržností", async () => {
    const db = new FalesnaD1(STATS_RULES);
    const s = await loadSeasonStats(jakoD1(db), "t1", 5, { agedSinceSeason: true });
    expect(s).toEqual({
      position: 2, teamsInLeague: 3, cupReached: 3, avgHomeAttendance: 412.4, avgYouthStarters: 1.7, reputation: 61, riots: 1,
    });
    expect(db.dotazy.find((d) => /match_player_stats/.test(d.sql))?.params).toEqual(["t1", 5, 1]);
  });

  it("bez archivu spočítá tabulku ze zápasů té sezóny", async () => {
    const db = new FalesnaD1([
      { sql: /FROM league_history/, first: null },
      { sql: /SELECT id FROM teams WHERE league_id/, all: [{ id: "a" }, { id: "t1" }] },
      { sql: /SELECT m\.home_team_id/, all: [{ home_team_id: "t1", away_team_id: "a", home_score: 2, away_score: 0 }] },
      ...STATS_RULES.slice(1),
    ]);
    const s = await loadSeasonStats(jakoD1(db), "t1", 5, { agedSinceSeason: false });
    expect(s.position).toBe(1);
    expect(s.teamsInLeague).toBe(2);
  });
});

describe("loadDeadlineState", () => {
  it("licence trenéra, úrovně zařízení a logo na rukávu", async () => {
    const db = new FalesnaD1([
      { sql: /FROM managers m/, first: { licence_level: 2 } },
      { sql: /FROM stadiums/, first: { vip_box: 1, stands: 2, capacity: 300 } },
      { sql: /SELECT sleeve_sponsor_id FROM teams/, first: { sleeve_sponsor_id: 7 } },
    ]);
    const s = await loadDeadlineState(jakoD1(db), "t1");
    expect(s.licenceLevel).toBe(2);
    expect(s.facilities.vip_box).toBe(1);
    expect(s.facilities.stands).toBe(2);
    expect(s.facilities.roof).toBe(0);
    expect(s.facilities).not.toHaveProperty("capacity");
    expect(s.sleeveSponsorId).toBe(7);
  });
});

describe("evaluateSeasonPromises", () => {
  it("vyhodnotí sliby smlouvy, statistiku načte jednou za klub", async () => {
    const db = new FalesnaD1([
      { sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [
        pending({ id: "p1" }),
        pending({ id: "p2", kind: "no_riots", params: "{}" }),
      ] },
      { sql: /UPDATE sponsor_promises SET status/, all: [{ id: "x" }] },
      ...STATS_RULES,
    ]);
    const r = await evaluateSeasonPromises(jakoD1(db), 5, { gameDate: "2026-09-23T16:00:00.000Z", day: "2026-09-23", agedSinceSeason: true });
    expect(r).toEqual({ resolved: 2, skipped: 0, terminated: 0 });
    expect(db.pocet(/FROM league_history/)).toBe(1);
    const claims = db.dotazy.filter((d) => /UPDATE sponsor_promises SET status/.test(d.sql)).map((d) => d.params.slice(0, 2));
    expect(claims).toEqual([["fulfilled", 61], ["broken", 1]]);
    const sel = db.dotazy.find((d) => /FROM sponsor_promises p JOIN sponsor_contracts sc/.test(d.sql));
    expect(sel?.sql).toContain("p.kind = 'sector_exclusivity' AND sc.seasons_remaining <= 1");
    expect(sel?.params).toEqual([5]);
  });

  it("slib bez dat zůstane čekat a započítá se jako přeskočený", async () => {
    const db = new FalesnaD1([
      { sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [pending({ kind: "cup_round", params: '{"round":2}' })] },
      { sql: /FROM cup_competitions/, first: null },
      ...STATS_RULES,
    ]);
    const r = await evaluateSeasonPromises(jakoD1(db), 5, { gameDate: "2026-09-23T16:00:00.000Z", day: "2026-09-23", agedSinceSeason: true });
    expect(r).toEqual({ resolved: 0, skipped: 1, terminated: 0 });
    expect(db.pocet(/UPDATE sponsor_promises SET status/)).toBe(0);
  });
});

describe("evaluateDeadlinePromises", () => {
  it("prošlý termín licence = porušeno, logo bez termínu čeká", async () => {
    const db = new FalesnaD1([
      { sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [
        pending({ id: "p1", kind: "coach_licence", params: '{"level":3}', season: null, deadline_game_date: "2026-09-01" }),
        pending({ id: "p2", kind: "jersey_logo", params: "{}", season: null, deadline_game_date: null }),
      ] },
      { sql: /UPDATE sponsor_promises SET status/, all: [{ id: "x" }] },
      { sql: /FROM managers m/, first: { licence_level: 2 } },
      { sql: /FROM stadiums/, first: { vip_box: 0 } },
      { sql: /SELECT sleeve_sponsor_id FROM teams/, first: { sleeve_sponsor_id: null } },
    ]);
    const r = await evaluateDeadlinePromises(jakoD1(db), "2026-09-23T16:00:00.000Z");
    expect(r.resolved).toBe(1);
    const claims = db.dotazy.filter((d) => /UPDATE sponsor_promises SET status/.test(d.sql));
    expect(claims.map((c) => c.params[3])).toEqual(["p1"]);
    expect(claims[0].params[0]).toBe("broken");
    // Logo na rukávu patří jen aktivnímu sponzorovi.
    expect(db.pocet(/UPDATE teams SET sleeve_sponsor_id = NULL/)).toBe(1);
  });
});

describe("shiftPromiseDeadlinesForRollover", () => {
  it("posune čekající termíny o skok herního času, jednou za rollover", async () => {
    const db = new FalesnaD1([{ sql: /MAX\(substr\(sc\.scheduled_at/, first: { d: "2026-11-20" } }]);
    await shiftPromiseDeadlinesForRollover(jakoD1(db), 5, "2026-09-23T16:00:00.000Z");
    const [upd, mark] = db.davky[0];
    expect(upd.sql).toContain("UPDATE sponsor_promises");
    expect(upd.sql).toContain("NOT EXISTS (SELECT 1 FROM season_end_progress");
    expect(upd.params).toEqual(["2026-09-23", "2026-11-20", "__sponsor_promises__", 5]);
    expect(mark.sql).toContain("INSERT OR IGNORE INTO season_end_progress");
    expect(mark.params).toEqual(["__sponsor_promises__", 5]);
  });

  it("bez kalendáře staré sezóny nic neposouvá", async () => {
    const db = new FalesnaD1([{ sql: /MAX\(substr\(sc\.scheduled_at/, first: { d: null } }]);
    expect(await shiftPromiseDeadlinesForRollover(jakoD1(db), 5, "2026-09-23")).toBe(false);
    expect(db.davky).toHaveLength(0);
  });
});

describe("exclusiveSectors", () => {
  it("obor → firma, která exkluzivitu drží", async () => {
    const db = new FalesnaD1([{ sql: /p\.kind = 'sector_exclusivity'/, all: [{ type: "brewery", sponsor_name: "Pivovar Lhota" }] }]);
    expect(await exclusiveSectors(jakoD1(db), "t1")).toEqual(new Map([["brewery", "Pivovar Lhota"]]));
  });
});

describe("listTeamPromises", () => {
  it("popisek, skutečnost a možnost dát logo na rukáv", async () => {
    const db = new FalesnaD1([{ sql: /FROM sponsor_promises p JOIN sponsor_contracts sc/, all: [
      { id: "p1", contract_id: "c1", sponsor_id: 7, kind: "league_position", params: '{"position":3}', season: 5,
        deadline_game_date: null, status: "partial", reward: 0, penalty: 8000, actual_value: 4 },
      { id: "p2", contract_id: "c2", sponsor_id: 9, kind: "jersey_logo", params: "{}", season: null,
        deadline_game_date: "2026-10-05", status: "pending", reward: 2000, penalty: 3000, actual_value: null },
      { id: "p3", contract_id: "c2", sponsor_id: 9, kind: "neznamy", params: "{}", season: null,
        deadline_game_date: null, status: "pending", reward: 0, penalty: 0, actual_value: null },
    ] }]);
    const list = await listTeamPromises(jakoD1(db), "t1");
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: "p1", label: "umístění do 3. místa", status: "partial", actualText: "4. místo", canPlaceSleeveLogo: false });
    expect(list[1]).toMatchObject({ id: "p2", contractId: "c2", deadline: "2026-10-05", canPlaceSleeveLogo: true });
  });
});

describe("placeSleeveLogo", () => {
  it("jiný druh slibu odmítne", async () => {
    const db = new FalesnaD1([{ sql: /SELECT p\.id, p\.kind, p\.status/, first: { id: "p1", kind: "reputation", status: "pending", sponsor_id: 7, contract_status: "active" } }]);
    expect(await placeSleeveLogo(jakoD1(db), "t1", "p1", "2026-09-23T16:00:00.000Z"))
      .toEqual({ ok: false, error: "Tenhle slib se logem na rukávu neplní", code: 400 });
  });

  it("čekající slib loga: logo na rukáv a hned vyhodnotit", async () => {
    const db = new FalesnaD1([
      { sql: /SELECT p\.id, p\.kind, p\.status/, first: { id: "p1", kind: "jersey_logo", status: "pending", sponsor_id: 7, contract_status: "active" } },
      { sql: /SELECT status FROM sponsor_promises/, first: { status: "fulfilled" } },
    ]);
    const res = await placeSleeveLogo(jakoD1(db), "t1", "p1", "2026-09-23T16:00:00.000Z");
    expect(res).toEqual({ ok: true, status: "fulfilled" });
    expect(db.dotazy.find((d) => /UPDATE teams SET sleeve_sponsor_id = \? WHERE id = \?/.test(d.sql))?.params).toEqual([7, "t1"]);
    // Vyhodnocení termínových slibů jen pro tenhle klub (ne kontrolní SELECT slibu výše).
    const sel = db.dotazy.find((d) => /WHERE p\.status = 'pending' AND sc\.status = 'active'/.test(d.sql));
    expect(sel?.params).toEqual(["t1"]);
  });
});
```

- [ ] **Step 2: Spustit, musí spadnout**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/promise-runs.test.ts`
Expected: FAIL, chybí `./promise-data` a `./promise-runs`.

- [ ] **Step 3: Napsat `promise-data.ts`**

```ts
/**
 * Sliby sponzorům: data pro vyhodnocení, jen čtení. Co klub za sezónu dokázal (tabulka,
 * pohár, návštěva, mladí v sestavě, reputace, výtržnosti) a v jakém stavu je teď
 * (licence trenéra, stadion, logo na rukávu).
 */
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import {
  averagePerMatch, cupRoundReached, positionFromStandings, rankTable,
  type CupEntryRow, type DeadlineState, type MatchResultRow, type SeasonStats,
} from "./promise-eval";

const CUP_SQL = `
  SELECT cc.status, cc.total_rounds, cc.current_round, ct.eliminated_round, ct.id AS cup_team_id,
         CASE WHEN cc.winner_team_id IS NOT NULL AND cc.winner_team_id = ct.id THEN 1 ELSE 0 END AS is_winner
  FROM cup_competitions cc
  LEFT JOIN cup_teams ct ON ct.cup_id = cc.id AND ct.team_id = ?2
  WHERE cc.season_number = ?1
  LIMIT 1`;

const ATTENDANCE_SQL = `
  SELECT AVG(m.attendance) AS avg
  FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
  WHERE m.home_team_id = ?1 AND sc.season_number = ?2 AND m.status = 'simulated' AND m.attendance IS NOT NULL`;

// ?3 = o kolik let hráči od sezóny zestárli (rollover běží po bumpAges ve fázi departures).
const YOUTH_SQL = `
  SELECT COUNT(DISTINCT m.id) AS matches,
         SUM(CASE WHEN p.age - ?3 <= 21 THEN 1 ELSE 0 END) AS young
  FROM matches m
  JOIN season_calendar sc ON sc.id = m.calendar_id
  JOIN match_player_stats mps ON mps.match_id = m.id AND mps.team_id = ?1 AND mps.started = 1
  LEFT JOIN players p ON p.id = mps.player_id
  WHERE sc.season_number = ?2 AND m.status = 'simulated' AND (m.home_team_id = ?1 OR m.away_team_id = ?1)`;

const RIOTS_SQL = `
  SELECT COUNT(*) AS n FROM fan_incidents fi
  WHERE fi.team_id = ?1 AND (
    fi.match_id IN (SELECT m.id FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
                    WHERE sc.season_number = ?2 AND (m.home_team_id = ?1 OR m.away_team_id = ?1))
    OR fi.match_id IN (SELECT cm.id FROM cup_matches cm JOIN cup_competitions cc ON cc.id = cm.cup_id
                       WHERE cc.season_number = ?2))`;

/**
 * Konečné místo v lize. Přednost má archiv (`league_history`, fáze archive běží před
 * rolloverem); `calculateStandings` tu nejde, v rolloveru už existuje kalendář nové sezóny.
 * Bez archivu (ruční vyhodnocení během sezóny) se tabulka spočítá ze zápasů té sezóny.
 */
async function loadFinalPosition(db: D1Database, teamId: string, season: number): Promise<{ position: number; teams: number } | null> {
  const hist = await db.prepare(
    `SELECT lh.final_standings FROM league_history lh
     WHERE lh.season_number = ?1 AND lh.league_id = (SELECT league_id FROM teams WHERE id = ?2)
     LIMIT 1`,
  ).bind(season, teamId).first<{ final_standings: string }>();
  if (hist) {
    const p = positionFromStandings(hist.final_standings, teamId);
    if (p) return p;
  }
  const [teams, matches] = await Promise.all([
    db.prepare("SELECT id FROM teams WHERE league_id = (SELECT league_id FROM teams WHERE id = ?)")
      .bind(teamId).all<{ id: string }>(),
    db.prepare(
      `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score
       FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
       WHERE m.league_id = (SELECT league_id FROM teams WHERE id = ?1) AND sc.season_number = ?2 AND m.status = 'simulated'`,
    ).bind(teamId, season).all<MatchResultRow>(),
  ]);
  if (matches.results.length === 0) return null;
  const ranks = rankTable(teams.results.map((t) => t.id), matches.results);
  const position = ranks.get(teamId);
  return position === undefined ? null : { position, teams: ranks.size };
}

/** Sezóna klubu pro sezónní sliby. `agedSinceSeason` = hráči už zestárli (rollover). */
export async function loadSeasonStats(
  db: D1Database, teamId: string, season: number, opts: { agedSinceSeason: boolean },
): Promise<SeasonStats> {
  const [position, cup, attendance, youth, team, riots] = await Promise.all([
    loadFinalPosition(db, teamId, season),
    db.prepare(CUP_SQL).bind(season, teamId).first<CupEntryRow>(),
    db.prepare(ATTENDANCE_SQL).bind(teamId, season).first<{ avg: number | null }>(),
    db.prepare(YOUTH_SQL).bind(teamId, season, opts.agedSinceSeason ? 1 : 0).first<{ matches: number; young: number | null }>(),
    db.prepare("SELECT reputation FROM teams WHERE id = ?").bind(teamId).first<{ reputation: number }>(),
    db.prepare(RIOTS_SQL).bind(teamId, season).first<{ n: number }>(),
  ]);
  return {
    position: position?.position ?? null,
    teamsInLeague: position?.teams ?? null,
    cupReached: cupRoundReached(cup),
    avgHomeAttendance: attendance?.avg ?? null,
    avgYouthStarters: averagePerMatch(youth?.young ?? 0, youth?.matches ?? 0),
    reputation: team?.reputation ?? null,
    riots: riots?.n ?? null,
  };
}

/** Stav klubu pro termínové sliby: licence trenéra, zařízení stadionu, logo na rukávu. */
export async function loadDeadlineState(db: D1Database, teamId: string): Promise<DeadlineState> {
  const [manager, stadium, team] = await Promise.all([
    db.prepare(
      `SELECT m.licence_level FROM managers m JOIN teams t ON t.id = m.team_id AND m.user_id = t.user_id
       WHERE t.id = ? LIMIT 1`,
    ).bind(teamId).first<{ licence_level: number | null }>(),
    db.prepare("SELECT * FROM stadiums WHERE team_id = ? LIMIT 1").bind(teamId).first<Record<string, unknown>>(),
    db.prepare("SELECT sleeve_sponsor_id FROM teams WHERE id = ?").bind(teamId).first<{ sleeve_sponsor_id: number | null }>(),
  ]);
  const facilities: Record<string, number> = {};
  for (const key of Object.keys(FACILITY_LABELS)) {
    const v = stadium?.[key];
    facilities[key] = typeof v === "number" ? v : 0;
  }
  return {
    licenceLevel: manager?.licence_level ?? null,
    facilities,
    sleeveSponsorId: team?.sleeve_sponsor_id ?? null,
  };
}
```

- [ ] **Step 4: Napsat `promise-runs.ts`**

```ts
/**
 * Sliby sponzorům: běhy vyhodnocení a drobné dotazy pro routy.
 * - denní tick: termínové sliby (`evaluateDeadlinePromises`),
 * - rollover: sezónní sliby a exkluzivita končících smluv (`evaluateSeasonPromises`),
 *   posun termínů na novou časovou osu a vynulování počítadla porušení,
 * - routy: exkluzivita oboru, výpis slibů klubu, logo na rukávu.
 */
import { logger } from "../lib/logger";
import { loadDeadlineState, loadSeasonStats } from "./promise-data";
import {
  DEADLINE_KINDS, EMPTY_SEASON_STATS, evaluateDeadlinePromise, evaluateSeasonalPromise, isPromiseKind, isPromiseStatus,
  parsePromiseParams, promiseActualText, promiseLabel, SEASONAL_KINDS,
  type PromiseKind, type PromiseStatus,
} from "./promise-eval";
import { applyContractOutcomes, type ContractRow, type PromiseEvaluation, type PromiseRow } from "./promise-resolve";

const M = "sponsor-promises";
/** Značka v season_end_progress: termíny staré sezóny už jsou posunuté. */
const SHIFT_MARKER = "__sponsor_promises__";

export interface RunResult {
  resolved: number;
  skipped: number;
  terminated: number;
}

interface PendingJoinRow extends PromiseRow {
  sponsor_name: string;
  category: string | null;
  seasons_remaining: number;
}

const PENDING_SELECT = `
  SELECT p.id, p.contract_id, p.team_id, p.sponsor_id, p.kind, p.params, p.season, p.deadline_game_date,
         p.reward, p.penalty, p.status, sc.sponsor_name, sc.category, sc.seasons_remaining
  FROM sponsor_promises p JOIN sponsor_contracts sc ON sc.id = p.contract_id
  WHERE p.status = 'pending' AND sc.status = 'active'`;

/** Klíče druhů do SQL `IN (…)`. Jen konstanty z promise-eval, žádný vstup od hráče. */
function sqlList(kinds: readonly PromiseKind[]): string {
  return kinds.map((k) => `'${k}'`).join(", ");
}

function groupBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k) ?? [];
    list.push(r);
    out.set(k, list);
  }
  return out;
}

function contractOf(r: PendingJoinRow): ContractRow {
  return {
    id: r.contract_id, team_id: r.team_id, sponsor_id: r.sponsor_id, sponsor_name: r.sponsor_name,
    category: r.category, seasons_remaining: r.seasons_remaining,
  };
}

async function applyPerContract(
  db: D1Database, teamId: string, evaluations: PromiseEvaluation[], rows: PendingJoinRow[],
  ctx: { gameDate: string; day: string }, result: RunResult,
): Promise<void> {
  for (const [contractId, list] of groupBy(evaluations, (e) => e.row.contract_id)) {
    const first = rows.find((r) => r.contract_id === contractId);
    if (!first) continue;
    try {
      const out = await applyContractOutcomes(db, contractOf(first), list, ctx);
      result.resolved += out.applied.length;
      if (out.terminated) result.terminated++;
    } catch (e) {
      logger.error({ module: M, teamId }, `důsledky slibů smlouvy ${contractId}`, e);
    }
  }
}

/**
 * Denní tick: licence, stavba a logo. Splněno, jakmile platí; porušeno den po termínu.
 * `teamId` zúží běh na jeden klub (route po logu na rukávu).
 */
export async function evaluateDeadlinePromises(
  db: D1Database, todayIso: string, opts: { teamId?: string } = {},
): Promise<RunResult> {
  const today = todayIso.slice(0, 10);
  const teamFilter = opts.teamId ?? null;
  const result: RunResult = { resolved: 0, skipped: 0, terminated: 0 };

  // Logo na rukávu patří jen aktivnímu sponzorovi: po konci smlouvy z dresu zmizí.
  await db.prepare(
    `UPDATE teams SET sleeve_sponsor_id = NULL
     WHERE sleeve_sponsor_id IS NOT NULL AND (?1 IS NULL OR id = ?1)
       AND NOT EXISTS (SELECT 1 FROM sponsor_contracts sc WHERE sc.team_id = teams.id
                         AND sc.sponsor_id = teams.sleeve_sponsor_id AND sc.status = 'active')`,
  ).bind(teamFilter).run();

  const rows = await db.prepare(
    `${PENDING_SELECT} AND p.kind IN (${sqlList(DEADLINE_KINDS)}) AND (?1 IS NULL OR p.team_id = ?1)
     ORDER BY p.team_id, p.contract_id, p.id`,
  ).bind(teamFilter).all<PendingJoinRow>();

  for (const [teamId, teamRows] of groupBy(rows.results, (r) => r.team_id)) {
    try {
      const state = await loadDeadlineState(db, teamId);
      const evaluations: PromiseEvaluation[] = [];
      for (const r of teamRows) {
        if (!isPromiseKind(r.kind)) continue;
        const params = parsePromiseParams(r.params);
        const ev = params ? evaluateDeadlinePromise(r.kind, params, state, r.sponsor_id, today, r.deadline_game_date) : null;
        if (ev === null) {
          result.skipped++;
          logger.warn({ module: M, teamId }, `slib ${r.id} (${r.kind}) nejde vyhodnotit, zůstává čekat`);
          continue;
        }
        if (ev === "pending") continue;
        evaluations.push({ row: r, kind: r.kind, outcome: ev.outcome, actual: ev.actual });
      }
      await applyPerContract(db, teamId, evaluations, teamRows, { gameDate: todayIso, day: today }, result);
    } catch (e) {
      logger.error({ module: M, teamId }, "vyhodnocení slibů s termínem", e);
    }
  }
  return result;
}

/**
 * Rollover (a ruční admin běh): sezónní sliby sezóny `season` a exkluzivita oboru u
 * smluv, které tímhle rolloverem končí. Musí běžet PŘED expirací smluv.
 */
export async function evaluateSeasonPromises(
  db: D1Database, season: number, ctx: { gameDate: string; day: string; agedSinceSeason: boolean },
): Promise<RunResult> {
  const result: RunResult = { resolved: 0, skipped: 0, terminated: 0 };
  const rows = await db.prepare(
    `${PENDING_SELECT}
       AND ((p.season = ?1 AND p.kind IN (${sqlList(SEASONAL_KINDS)}))
            OR (p.kind = 'sector_exclusivity' AND sc.seasons_remaining <= 1))
     ORDER BY p.team_id, p.contract_id, p.id`,
  ).bind(season).all<PendingJoinRow>();

  for (const [teamId, teamRows] of groupBy(rows.results, (r) => r.team_id)) {
    try {
      const needsStats = teamRows.some((r) => r.kind !== "sector_exclusivity");
      const stats = needsStats
        ? await loadSeasonStats(db, teamId, season, { agedSinceSeason: ctx.agedSinceSeason })
        : EMPTY_SEASON_STATS;
      const evaluations: PromiseEvaluation[] = [];
      for (const r of teamRows) {
        if (!isPromiseKind(r.kind)) continue;
        const params = parsePromiseParams(r.params);
        const ev = params ? evaluateSeasonalPromise(r.kind, params, stats) : null;
        if (ev === null) {
          result.skipped++;
          logger.warn({ module: M, teamId }, `slib ${r.id} (${r.kind}) za sezónu ${season} nejde vyhodnotit, zůstává čekat`);
          continue;
        }
        evaluations.push({ row: r, kind: r.kind, outcome: ev.outcome, actual: ev.actual });
      }
      await applyPerContract(db, teamId, evaluations, teamRows, { gameDate: ctx.gameDate, day: ctx.day }, result);
    } catch (e) {
      logger.error({ module: M, teamId }, `vyhodnocení sezónních slibů za sezónu ${season}`, e);
    }
  }
  return result;
}

/**
 * Rollover vrací herní čas na reálné datum. Čekající termíny ze staré osy by jinak
 * dostaly desítky dní navíc. Zbytek lhůty od posledního dne staré sezóny se přičte
 * k prvnímu dni nové. Posun a značka jdou v jednom batchi (transakce), takže opakovaný
 * rollover termíny neposune podruhé. `true` = něco se posunulo.
 */
export async function shiftPromiseDeadlinesForRollover(db: D1Database, oldSeason: number, newDay: string): Promise<boolean> {
  const last = await db.prepare(
    `SELECT MAX(substr(sc.scheduled_at, 1, 10)) AS d FROM season_calendar sc
     JOIN leagues l ON l.id = sc.league_id
     WHERE l.league_type = 'senior' AND sc.season_number = ?`,
  ).bind(oldSeason).first<{ d: string | null }>();
  if (!last?.d) return false;
  const res = await db.batch([
    db.prepare(
      `UPDATE sponsor_promises
          SET deadline_game_date = date(?1, '+' || CAST(MAX(0, ROUND(julianday(substr(deadline_game_date, 1, 10)) - julianday(?2))) AS INTEGER) || ' days')
        WHERE status = 'pending' AND deadline_game_date IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM season_end_progress
                          WHERE league_id = ?3 AND season_number = ?4 AND phase = 'deadline_shift')`,
    ).bind(newDay.slice(0, 10), last.d, SHIFT_MARKER, oldSeason),
    db.prepare(
      `INSERT OR IGNORE INTO season_end_progress (league_id, season_number, phase, status, updated_at)
       VALUES (?, ?, 'deadline_shift', 'done', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    ).bind(SHIFT_MARKER, oldSeason),
  ]);
  return (res[0]?.meta?.changes ?? 0) > 0;
}

/** Nová sezóna = nové počítání porušení. Běží v rolloveru AŽ po vyhodnocení sezónních slibů. */
export async function resetSeasonBreaches(db: D1Database): Promise<void> {
  await db.prepare("UPDATE sponsor_contracts SET breaches_season = 0 WHERE breaches_season != 0").run();
}

/** Obory chráněné slibem exkluzivity u aktivních smluv klubu: obor → firma. */
export async function exclusiveSectors(db: D1Database, teamId: string): Promise<Map<string, string>> {
  const rows = await db.prepare(
    `SELECT ds.type, sc.sponsor_name
     FROM sponsor_promises p
     JOIN sponsor_contracts sc ON sc.id = p.contract_id
     JOIN district_sponsors ds ON ds.id = p.sponsor_id
     WHERE p.team_id = ? AND p.kind = 'sector_exclusivity' AND p.status = 'pending' AND sc.status = 'active'`,
  ).bind(teamId).all<{ type: string; sponsor_name: string }>();
  return new Map(rows.results.map((r) => [r.type, r.sponsor_name]));
}

export interface PromiseView {
  id: string;
  contractId: string;
  sponsorId: number;
  kind: PromiseKind;
  label: string;
  season: number | null;
  deadline: string | null;
  status: PromiseStatus;
  reward: number;
  penalty: number;
  actualText: string | null;
  canPlaceSleeveLogo: boolean;
}

interface PromiseListRow {
  id: string; contract_id: string; sponsor_id: number; kind: string; params: string | null; season: number | null;
  deadline_game_date: string | null; status: string; reward: number; penalty: number; actual_value: number | null;
}

/** Sliby u aktivních smluv klubu pro stránku Sponzoři. */
export async function listTeamPromises(db: D1Database, teamId: string): Promise<PromiseView[]> {
  const rows = await db.prepare(
    `SELECT p.id, p.contract_id, p.sponsor_id, p.kind, p.params, p.season, p.deadline_game_date, p.status,
            p.reward, p.penalty, p.actual_value
     FROM sponsor_promises p JOIN sponsor_contracts sc ON sc.id = p.contract_id
     WHERE p.team_id = ? AND sc.status = 'active'
     ORDER BY p.contract_id, CASE WHEN p.season IS NULL THEN 0 ELSE 1 END, p.season, p.deadline_game_date, p.id`,
  ).bind(teamId).all<PromiseListRow>();
  const out: PromiseView[] = [];
  for (const r of rows.results) {
    if (!isPromiseKind(r.kind)) continue;
    const status: PromiseStatus = isPromiseStatus(r.status) ? r.status : "pending";
    out.push({
      id: r.id,
      contractId: r.contract_id,
      sponsorId: r.sponsor_id,
      kind: r.kind,
      label: promiseLabel(r.kind, parsePromiseParams(r.params) ?? {}),
      season: r.season,
      deadline: r.deadline_game_date,
      status,
      reward: r.reward ?? 0,
      penalty: r.penalty ?? 0,
      actualText: promiseActualText(r.kind, r.actual_value),
      canPlaceSleeveLogo: r.kind === "jersey_logo" && status === "pending",
    });
  }
  return out;
}

export type SleeveLogoResult =
  | { ok: true; status: PromiseStatus }
  | { ok: false; error: string; code: 400 | 404 | 409 };

/** Logo sponzora stadionu na rukáv dresu. Slib se hned vyhodnotí, splní se ještě v tomtéž požadavku. */
export async function placeSleeveLogo(db: D1Database, teamId: string, promiseId: string, todayIso: string): Promise<SleeveLogoResult> {
  const row = await db.prepare(
    `SELECT p.id, p.kind, p.status, p.sponsor_id, sc.status AS contract_status
     FROM sponsor_promises p JOIN sponsor_contracts sc ON sc.id = p.contract_id
     WHERE p.id = ? AND p.team_id = ?`,
  ).bind(promiseId, teamId).first<{ id: string; kind: string; status: string; sponsor_id: number; contract_status: string }>();
  if (!row) return { ok: false, error: "Slib nenalezen", code: 404 };
  if (row.kind !== "jersey_logo") return { ok: false, error: "Tenhle slib se logem na rukávu neplní", code: 400 };
  if (row.status !== "pending" || row.contract_status !== "active") return { ok: false, error: "Slib už je vyřízený", code: 409 };

  await db.prepare("UPDATE teams SET sleeve_sponsor_id = ? WHERE id = ?").bind(row.sponsor_id, teamId).run();
  await evaluateDeadlinePromises(db, todayIso, { teamId });
  const after = await db.prepare("SELECT status FROM sponsor_promises WHERE id = ?").bind(promiseId).first<{ status: string }>();
  return { ok: true, status: isPromiseStatus(after?.status) ? after.status : "pending" };
}
```

- [ ] **Step 5: Testy a typecheck**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/`
Expected: PASS všech souborů v `src/sponsors/`.

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx tsc --noEmit`
Expected: bez chyb.

- [ ] **Step 6: Commit**

```bash
cd /Users/savrik/Projects/fmko && git add apps/api/src/sponsors/promise-data.ts apps/api/src/sponsors/promise-runs.ts apps/api/src/sponsors/promise-runs.test.ts && git commit -m "$(cat <<'EOF'
feat(sponzori): data a běhy vyhodnocení slibů

Sezónní statistika klubu (archiv tabulky, pohár, návštěva, mladí,
reputace, výtržnosti), stav pro termínové sliby, běh pro denní tick
a rollover, posun termínů po rolloveru, exkluzivita oboru, výpis
slibů a logo na rukávu.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Háčky: denní tick, rollover, admin vyhodnocení

**Files:**
- Modify: `apps/api/src/season/daily-tick.ts`
- Modify: `apps/api/src/season/season-rollover.ts`
- Modify: `apps/api/src/routes/game.ts` (admin endpoint)

**Interfaces:**
- Consumes: Task 5 (`evaluateDeadlinePromises`, `evaluateSeasonPromises`, `shiftPromiseDeadlinesForRollover`, `resetSeasonBreaches`).
- Produces: termínové sliby každý herní den; sezónní sliby v rolloveru (krok 4a, před expirací smluv); `POST /api/admin/sponsor-promises/evaluate?scope=deadline|season&season=N` (admin, pro testování).

- [ ] **Step 1: Denní tick**

V `apps/api/src/season/daily-tick.ts` těsně PŘED řádek `  // ── SMS od majitelů firem (vlastní try: chyba nesmí shodit zbytek ticku) ──` vložit:

```ts
  // ── Sliby sponzorům s termínem: licence, stavba, logo (vlastní try: chyba nesmí shodit tick) ──
  // Před SMS majitelů, aby zpráva o splněném nebo porušeném slibu mohla odejít ještě dnes.
  try {
    const { evaluateDeadlinePromises } = await import("../sponsors/promise-runs");
    const r = await evaluateDeadlinePromises(env.DB, effectiveDate.toISOString());
    if (r.resolved + r.skipped > 0) {
      logger.info({ module: "daily-tick" }, `sliby sponzorům: ${r.resolved} vyhodnoceno, ${r.skipped} nejde vyhodnotit, ${r.terminated} výpovědí`);
    }
  } catch (e) {
    logger.error({ module: "daily-tick" }, "sliby sponzorům s termínem selhaly", e);
  }

```

- [ ] **Step 2: Rollover, krok 4a**

V `apps/api/src/season/season-rollover.ts` těsně PŘED řádky

```ts
  // Hlavní smlouvy, které teď vyprší: jejich majitelé se v kroku 4b-sms rozloučí.
  let expiringMain: Array<{ team_id: string; sponsor_id: number }> = [];
```

vložit:

```ts
  // 4a. Sliby sponzorům (etapa 3). MUSÍ běžet před 4b: smlouvy, které teď vyprší, jsou
  //     ještě aktivní (sezónní sliby i exkluzivita oboru se jim vyhodnotí) a výpověď
  //     sponzorem má přednost před obyčejným vypršením (vypovězená smlouva pak nedostane
  //     main_lost ani +5 za sezónu spolupráce). SMS jdou do fronty s referencí promise:
  //     a sponsor-quit:, kterou úklid v kroku 4b-sms nechá být. Každá část ve vlastním try.
  const promiseDay = startIso.slice(0, 10);
  try {
    const { evaluateSeasonPromises } = await import("../sponsors/promise-runs");
    const r = await evaluateSeasonPromises(db, oldSeasonNumber, { gameDate: startIso, day: promiseDay, agedSinceSeason: true });
    logger.info({ module: "season-rollover" }, `sliby sponzorům: ${r.resolved} vyhodnoceno, ${r.skipped} nejde vyhodnotit, ${r.terminated} výpovědí`);
  } catch (e) {
    logger.error({ module: "season-rollover" }, "vyhodnocení sezónních slibů sponzorům", e);
  }
  try {
    const { shiftPromiseDeadlinesForRollover } = await import("../sponsors/promise-runs");
    await shiftPromiseDeadlinesForRollover(db, oldSeasonNumber, promiseDay);
  } catch (e) {
    logger.error({ module: "season-rollover" }, "posun termínů slibů sponzorům", e);
  }
  try {
    const { resetSeasonBreaches } = await import("../sponsors/promise-runs");
    await resetSeasonBreaches(db);
  } catch (e) {
    logger.error({ module: "season-rollover" }, "vynulování porušení slibů za sezónu", e);
  }

```

- [ ] **Step 3: Admin endpoint**

V `apps/api/src/routes/game.ts` těsně PŘED řádek `// POST /api/admin/run-transfer-tick — ruční spuštění transfer pressure ticku` vložit (routa je pod `gameRouter.use("/admin/*", requireAdmin)`):

```ts
// POST /api/admin/sponsor-promises/evaluate — ruční vyhodnocení slibů sponzorům (testování).
// ?scope=deadline → termínové sliby k hernímu dni (jako denní tick, bez KV zámku ticku),
// ?scope=season&season=N → sezónní sliby sezóny N nad dosavadními daty (jako rollover).
// Obojí je idempotentní: vyřízený slib se podruhé nenárokuje.
gameRouter.post("/admin/sponsor-promises/evaluate", async (c) => {
  const scope = c.req.query("scope");
  const row = await c.env.DB.prepare(
    "SELECT game_date FROM teams WHERE user_id != 'ai' AND game_date IS NOT NULL ORDER BY game_date DESC LIMIT 1",
  ).first<{ game_date: string }>()
    .catch((e) => { logger.warn({ module: "game.ts" }, "herní datum pro vyhodnocení slibů", e); return null; });
  const gameDate = row?.game_date ?? new Date().toISOString();
  const { evaluateDeadlinePromises, evaluateSeasonPromises } = await import("../sponsors/promise-runs");
  try {
    if (scope === "deadline") {
      return c.json({ ok: true, gameDate, ...(await evaluateDeadlinePromises(c.env.DB, gameDate)) });
    }
    if (scope === "season") {
      const season = Number(c.req.query("season"));
      if (!Number.isInteger(season) || season < 1) return c.json({ error: "Chybí číslo sezóny" }, 400);
      const r = await evaluateSeasonPromises(c.env.DB, season, { gameDate, day: gameDate.slice(0, 10), agedSinceSeason: false });
      return c.json({ ok: true, gameDate, ...r });
    }
    return c.json({ error: "Parametr scope musí být deadline nebo season" }, 400);
  } catch (e) {
    logger.error({ module: "game.ts" }, "ruční vyhodnocení slibů sponzorům", e);
    return c.json({ error: "Vyhodnocení selhalo" }, 500);
  }
});

```

- [ ] **Step 4: Typecheck a testy dotčených oblastí**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx tsc --noEmit`
Expected: bez chyb.

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/season/ src/sponsors/`
Expected: PASS. Padá-li test, který s touhle změnou nesouvisí, nahlásit uživateli, neopravovat.

- [ ] **Step 5: Commit**

```bash
cd /Users/savrik/Projects/fmko && git add apps/api/src/season/daily-tick.ts apps/api/src/season/season-rollover.ts apps/api/src/routes/game.ts && git commit -m "$(cat <<'EOF'
feat(sponzori): vyhodnocení slibů v denním ticku a v rolloveru

Termínové sliby každý herní den před SMS majitelů, sezónní sliby
v rolloveru před expirací smluv, posun termínů a nové počítání
porušení. Admin endpoint pro ruční vyhodnocení na testu.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Routy a web: exkluzivita oboru, sliby u smluv, logo na rukáv

**Files:**
- Modify: `apps/api/src/routes/game.ts` (podpis banneru, prodloužení banneru, nabídky bannerů)
- Modify: `apps/api/src/routes/sponsors.ts`
- Modify: `apps/web/src/lib/sponsor-page-types.ts`
- Create: `apps/web/src/lib/sponsor-promises.ts`
- Create: `apps/web/src/components/sponsors/contract-promises.tsx`
- Modify: `apps/web/src/components/sponsors/contracts-tab.tsx`
- Modify: `apps/web/src/app/(hra)/sponzori/page.tsx`

**Interfaces:**
- Consumes: Task 2 (`sectorBlockMessage`), Task 5 (`exclusiveSectors`, `listTeamPromises`, `placeSleeveLogo`, `PromiseView`), `requireTeamOwnership`, `deliverOwnerSmsForTeam`.
- Produces:
  - `GET /api/teams/:teamId/sponsor-promises` → `{ promises: PromiseView[] }` (veřejné jako `sponsor-history`)
  - `POST /api/teams/:teamId/sponsor-promises/:promiseId/sleeve-logo` (vlastník týmu) → `{ ok: true, status }` / `{ error }` 400/404/409
  - podpis a prodloužení banneru chráněného oboru → 409 s vysvětlením; nabídky bannerů chráněného oboru se nevrací
  - web: `SponsorPromiseView`, `promiseStatusLabel`, `promiseStatusClass`, `promiseTermText`, `groupPromisesByContract`, `<ContractPromises>`

- [ ] **Step 1: Podpis banneru (routes/game.ts)**

V routě `POST /teams/:teamId/sponsors/sign` za řádek

```ts
  if (!spRow) return c.json({ error: "Neplatný sponzor pro tento okres" }, 400);
```

vložit:

```ts
  // Slib „exkluzivita oboru" u hlavního sponzora nebo stadionu: banner stejného oboru nejde.
  // Není to porušení slibu, podpis se prostě zakáže s vysvětlením.
  if (category === "banner") {
    const { exclusiveSectors } = await import("../sponsors/promise-runs");
    const { sectorBlockMessage } = await import("../sponsors/promise-eval");
    const holder = (await exclusiveSectors(c.env.DB, teamId)).get(spRow.type);
    if (holder) return c.json({ error: sectorBlockMessage(holder) }, 409);
  }
```

- [ ] **Step 2: Prodloužení banneru**

V routě `POST /teams/:teamId/sponsors/renew` za blok

```ts
  if (isMain) {
    const block = await mainSponsorBlock(c.env.DB, sponsorId!, teamId, mustSeason(season?.number));
    if (block) return c.json({ error: block.reason }, 409);
  }
```

vložit:

```ts
  if (((contract.category as string) || "main") === "banner") {
    const { exclusiveSectors } = await import("../sponsors/promise-runs");
    const { sectorBlockMessage } = await import("../sponsors/promise-eval");
    const holder = (await exclusiveSectors(c.env.DB, teamId)).get(contract.sponsor_type as string);
    if (holder) return c.json({ error: sectorBlockMessage(holder) }, 409);
  }
```

- [ ] **Step 3: Nabídky bannerů**

V routě `GET /teams/:teamId/sponsors` za řádek `  bannerOffers.sort((a, b) => b.monthlyAmount - a.monthlyAmount);` vložit:

```ts
  // Obor chráněný slibem exkluzivity se v nabídkách bannerů neukazuje.
  const { exclusiveSectors } = await import("../sponsors/promise-runs");
  const exclusive = await exclusiveSectors(c.env.DB, teamId)
    .catch((e) => { logger.warn({ module: "game", teamId }, "exkluzivita oboru pro nabídky bannerů", e); return new Map<string, string>(); });
  const allowedBannerOffers = bannerOffers.filter((o) => !exclusive.has(o.sponsorType));
```

a řádek `    bannerOffers: bannerContracts.length >= MAX_BANNERS ? [] : bannerOffers,` nahradit:

```ts
    bannerOffers: bannerContracts.length >= MAX_BANNERS ? [] : allowedBannerOffers,
```

- [ ] **Step 4: Routy slibů (routes/sponsors.ts)**

Na konec souboru `apps/api/src/routes/sponsors.ts` přidat:

```ts
// GET /api/teams/:teamId/sponsor-promises — sliby u aktivních smluv klubu (etapa 3).
// Veřejné jako sponsor-history: nic citlivějšího než smlouvy samotné.
sponsorsRouter.get("/teams/:teamId/sponsor-promises", async (c) => {
  const { listTeamPromises } = await import("../sponsors/promise-runs");
  const promises = await listTeamPromises(c.env.DB, c.req.param("teamId"));
  return c.json({ promises });
});

// POST /api/teams/:teamId/sponsor-promises/:promiseId/sleeve-logo — logo sponzora stadionu na rukáv
// dresu (slib jersey_logo). Slib se vyhodnotí hned, SMS majitele se zkusí doručit ještě teď.
sponsorsRouter.post("/teams/:teamId/sponsor-promises/:promiseId/sleeve-logo", requireTeamOwnership, async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);
  const { placeSleeveLogo } = await import("../sponsors/promise-runs");
  const res = await placeSleeveLogo(db, teamId, c.req.param("promiseId"), team.game_date ?? new Date().toISOString());
  if (!res.ok) return c.json({ error: res.error }, res.code);
  try {
    const { deliverOwnerSmsForTeam } = await import("../sponsors/owner-sms");
    await deliverOwnerSmsForTeam(db, teamId);
  } catch (e) {
    logger.warn({ module: "sponsors", teamId }, "SMS majitele po logu na rukávu", e);
  }
  return c.json({ ok: true, status: res.status });
});
```

- [ ] **Step 5: Typecheck API**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx tsc --noEmit`
Expected: bez chyb.

- [ ] **Step 6: Web, typy a pomocné funkce**

Na konec `apps/web/src/lib/sponsor-page-types.ts` přidat:

```ts
/** Stav slibu sponzorovi (etapa 3). Tvar drží API: apps/api/src/sponsors/promise-runs.ts (PromiseView). */
export type SponsorPromiseStatus = "pending" | "fulfilled" | "partial" | "broken";

export interface SponsorPromiseView {
  id: string;
  contractId: string;
  sponsorId: number;
  kind: string;
  /** Česky, v 1. pádě (např. „umístění do 3. místa"). */
  label: string;
  season: number | null;
  deadline: string | null;
  status: SponsorPromiseStatus;
  reward: number;
  penalty: number;
  /** Naměřená skutečnost česky („4. místo"), jen u vyhodnocených. */
  actualText: string | null;
  canPlaceSleeveLogo: boolean;
}
```

Vytvořit `apps/web/src/lib/sponsor-promises.ts`:

```ts
/** Sliby sponzorům na stránce Sponzoři: stav česky, barva štítku, termín, seskupení. */
import { formatGameDay } from "@/lib/sponsor-format";
import type { SponsorPromiseView } from "@/lib/sponsor-page-types";

const STATUS_LABELS = { fulfilled: "splněno", partial: "těsně vedle", broken: "porušeno" } as const;

export function promiseStatusLabel(p: SponsorPromiseView): string {
  if (p.status === "pending") return p.kind === "sector_exclusivity" ? "platí" : "čeká";
  return STATUS_LABELS[p.status];
}

export function promiseStatusClass(p: SponsorPromiseView): string {
  switch (p.status) {
    case "fulfilled": return "bg-pitch-50 text-pitch-600";
    case "partial": return "bg-gold-50 text-gold-700";
    case "broken": return "bg-red-50 text-card-red";
    default: return "bg-gray-100 text-muted";
  }
}

/** „sezóna 5", „termín do 12. 10. 2026", „po celou dobu smlouvy". */
export function promiseTermText(p: SponsorPromiseView): string {
  if (p.season != null) return `sezóna ${p.season}`;
  if (p.deadline) {
    const d = formatGameDay(p.deadline);
    return d ? `termín do ${d}` : "s termínem";
  }
  return "po celou dobu smlouvy";
}

export function groupPromisesByContract(list: readonly SponsorPromiseView[]): Map<string, SponsorPromiseView[]> {
  const out = new Map<string, SponsorPromiseView[]>();
  for (const p of list) {
    const arr = out.get(p.contractId) ?? [];
    arr.push(p);
    out.set(p.contractId, arr);
  }
  return out;
}
```

- [ ] **Step 7: Komponenta slibů**

Vytvořit `apps/web/src/components/sponsors/contract-promises.tsx`:

```tsx
"use client";

import { formatCZK } from "@/lib/sponsor-owners";
import { promiseStatusClass, promiseStatusLabel, promiseTermText } from "@/lib/sponsor-promises";
import type { SponsorPromiseView } from "@/lib/sponsor-page-types";

/** Sliby u aktivní smlouvy: co klub slíbil, do kdy, jak to dopadlo a o kolik jde. Jeden slib na řádek. */
export function ContractPromises({ promises, acting, onSleeveLogo }: {
  promises: SponsorPromiseView[];
  acting: boolean;
  onSleeveLogo: (promiseId: string) => void;
}) {
  if (promises.length === 0) return null;
  return (
    <div className="pt-2 border-t border-line-soft space-y-2">
      <div className="text-sm text-muted font-heading font-bold">Sliby sponzorovi</div>
      <ul className="space-y-3">
        {promises.map((p) => (
          <li key={p.id} className="text-sm space-y-0.5">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 first-letter:uppercase">{p.label}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-heading font-bold ${promiseStatusClass(p)}`}>
                {promiseStatusLabel(p)}
              </span>
            </div>
            <div className="text-muted">
              {promiseTermText(p)}
              {p.actualText ? `, skutečnost: ${p.actualText}` : ""}
            </div>
            {(p.reward > 0 || p.penalty > 0) && (
              <div className="flex flex-wrap gap-x-3 tabular-nums">
                {p.reward > 0 && <span className="text-pitch-500">bonus {formatCZK(p.reward)}</span>}
                {p.penalty > 0 && <span className="text-card-red">pokuta {formatCZK(p.penalty)}</span>}
              </div>
            )}
            {p.canPlaceSleeveLogo && (
              <button onClick={() => onSleeveLogo(p.id)} disabled={acting}
                className="min-h-11 text-sm text-pitch-600 hover:text-pitch-500 font-heading font-bold transition-colors disabled:opacity-50">
                👕 Dát logo na rukáv
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 8: Karta smlouvy (`contracts-tab.tsx`)**

Etapa 2 mohla `contracts-tab.tsx` upravit (nabídky hlavního sponzora a stadionu zmizely). Kotvy níže platí pro `ContractCard` aktivní smlouvy; když se liší, vložit sliby do karty aktivní smlouvy hned za řádek s `FavorLine`.

1. Import typů nahradit:
```tsx
import type { ActiveContract, SponsorCategory, SponsorOffer, SponsorPromiseView, SponsorsData } from "@/lib/sponsor-page-types";
```
a pod `import { SponsorLink } from "./sponsor-link";` přidat:
```tsx
import { ContractPromises } from "./contract-promises";
```

2. Signaturu `ContractsTab` rozšířit o dvě props (v destrukturalizaci i v typu):
```tsx
export function ContractsTab({ data, reputation, favors, acting, onSign, onTerminate, onRenew, promisesByContract, onSleeveLogo }: {
```
a do typu za `onRenew: (category: SponsorCategory, contractId?: string) => void;` přidat:
```tsx
  /** contractId → sliby u té smlouvy (GET /sponsor-promises). */
  promisesByContract: Map<string, SponsorPromiseView[]>;
  onSleeveLogo: (promiseId: string) => void;
```

3. Za řádek `  const favorOf = (c: ActiveContract): number | null => (c.sponsorId != null ? favors.get(c.sponsorId) ?? null : null);` přidat:
```tsx
  const promisesOf = (c: ActiveContract): SponsorPromiseView[] => promisesByContract.get(c.id) ?? [];
```

4. Všechna tři použití `ContractCard` doplnit o `promises` a `onSleeveLogo`:
```tsx
            <ContractCard contract={data.mainContract} favor={favorOf(data.mainContract)} acting={acting}
              promises={promisesOf(data.mainContract)} onSleeveLogo={onSleeveLogo}
              onTerminate={() => onTerminate("main")} onRenew={() => onRenew("main")} />
```
```tsx
            <ContractCard contract={data.stadiumContract} favor={favorOf(data.stadiumContract)} acting={acting}
              promises={promisesOf(data.stadiumContract)} onSleeveLogo={onSleeveLogo}
              onTerminate={() => onTerminate("stadium")} onRenew={() => onRenew("stadium")} />
```
```tsx
              <ContractCard key={c.id} contract={c} favor={favorOf(c)} acting={acting}
                promises={promisesOf(c)} onSleeveLogo={onSleeveLogo}
                onTerminate={() => onTerminate("banner", c.id)} onRenew={() => onRenew("banner", c.id)} />
```

5. Definici `ContractCard` nahradit hlavičku:
```tsx
function ContractCard({ contract, favor, onTerminate, onRenew, acting, promises, onSleeveLogo }: {
  contract: ActiveContract; favor: number | null; onTerminate: () => void; onRenew: () => void; acting: boolean;
  promises: SponsorPromiseView[]; onSleeveLogo: (promiseId: string) => void;
}) {
```
a v jejím těle nahradit dvojici řádků
```tsx
        {favor != null && <FavorLine favor={favor} />}
        {contract.renewal ? (
```
za
```tsx
        {favor != null && <FavorLine favor={favor} />}
        <ContractPromises promises={promises} acting={acting} onSleeveLogo={onSleeveLogo} />
        {contract.renewal ? (
```

- [ ] **Step 9: Stránka `/sponzori`**

V `apps/web/src/app/(hra)/sponzori/page.tsx`:

1. Import typů rozšířit o `SponsorPromiseView`:
```tsx
import type {
  DistrictFirm, PubEncounter, SponsorCategory, SponsorHistoryItem, SponsorOffer, SponsorOverview, SponsorPromiseView, SponsorsData,
} from "@/lib/sponsor-page-types";
```
a pod `import { mySponsorIdsOf } from "@/lib/sponsor-firms";` přidat:
```tsx
import { groupPromisesByContract } from "@/lib/sponsor-promises";
```

2. Za `const [historyError, setHistoryError] = useState<string | null>(null);` přidat:
```tsx
  const [promises, setPromises] = useState<SponsorPromiseView[]>([]);
```

3. V `refresh` za řádek `    setFirms(f);` přidat:
```tsx
    const pr = await apiFetch<{ promises: SponsorPromiseView[] }>(`/api/teams/${teamId}/sponsor-promises`)
      .catch((e) => { console.error("sponsor-promises:", e); return null; });
    setPromises(pr?.promises ?? []);
```

4. Za funkci `handleRenew` (před `const handleRename = async () => {`) přidat:
```tsx
  const handleSleeveLogo = async (promiseId: string) => {
    if (!teamId || acting) return;
    const ok = await confirm({
      title: "Dát logo sponzora na rukáv?",
      description: "Logo sponzora stadionu bude na rukávu dresu po celou dobu smlouvy. Slib se tím splní.",
      confirmLabel: "Dát logo na rukáv",
    });
    if (!ok) return;
    setActionError(null);
    setActing(true);
    await apiFetch(`/api/teams/${teamId}/sponsor-promises/${promiseId}/sleeve-logo`, { method: "POST" })
      .catch((e) => { console.error("sponsor-promises/sleeve-logo:", e); setActionError((e as Error).message); return null; });
    await refresh();
    setActing(false);
  };
```

5. Za řádek `  const favors = new Map<number, number>((firms?.firms ?? []).map((f) => [f.sponsorId, f.favor]));` přidat:
```tsx
  const promisesByContract = groupPromisesByContract(promises);
```

6. V `<ContractsTab …/>` za `onRenew={handleRenew}` přidat:
```tsx
          promisesByContract={promisesByContract}
          onSleeveLogo={handleSleeveLogo}
```

- [ ] **Step 10: Typecheck a build webu**

Run: `cd /Users/savrik/Projects/fmko/apps/web && npx tsc --noEmit`
Expected: bez chyb.

Run: `cd /Users/savrik/Projects/fmko/apps/web && npx next build --no-lint`
Expected: `✓ Compiled successfully`, build doběhne.

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run`
Expected: všechny soubory `passed` (včetně `season/transaction-labels.test.ts`). Nesouvisející pád nahlásit, neopravovat.

- [ ] **Step 11: Commit**

```bash
cd /Users/savrik/Projects/fmko && git add apps/api/src/routes/game.ts apps/api/src/routes/sponsors.ts apps/web/src/lib/sponsor-page-types.ts apps/web/src/lib/sponsor-promises.ts apps/web/src/components/sponsors/contract-promises.tsx apps/web/src/components/sponsors/contracts-tab.tsx "apps/web/src/app/(hra)/sponzori/page.tsx" && git commit -m "$(cat <<'EOF'
feat(sponzori): sliby u smluv, logo na rukáv a exkluzivita oboru

Na /sponzori u aktivní smlouvy sliby se stavem (čeká, splněno, těsně
vedle, porušeno), termínem a skutečností, tlačítko Dát logo na rukáv.
Banner stejného oboru jako slíbená exkluzivita nejde podepsat ani
prodloužit a v nabídkách se neukazuje.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Nasazení na testing a ověření

**Files:** žádné změny kódu. Pomocný SQL soubor jen v `/tmp`.

**Interfaces:**
- Consumes: úlohy 1 až 7, migrace 0222 na `prales-db-test` (Task 1), etapa 2 nasazená na testu.
- Produces: ověřené chování na `test.prales.fun` / `api-test.prales.fun`. Na `main` nic.

Testovací účet `claude-test@t.cz`, tým FK Duplex Břevnov `302a0ce7-428a-4da8-b4ac-40f27eb9a7d1` (heslo do formuláře zadává uživatel). Skutečný rollover se na testu NEspouští (ukončil by testovací sezónu); sezónní vyhodnocení se ověří admin endpointem `scope=season` nad rozehranou sezónou, rollover krok 4a pokrývají unit testy.

- [ ] **Step 1: Větev, strom, celé testy**

Run: `cd /Users/savrik/Projects/fmko && git branch --show-current && git status --short`
Expected: `testing`; ve stromu nanejvýš cizí `.serena/project.yml` a `packages/db/tsconfig.tsbuildinfo`.

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run`
Expected: všechny soubory `passed`.

- [ ] **Step 2: Push a deploy**

Run: `cd /Users/savrik/Projects/fmko && git push origin testing`
Run: `sleep 80 && gh run list --branch testing --limit 2 --json status,conclusion,name`
Expected: API i web `"conclusion": "success"`. Při červeném API kvůli CF 10013 ověřit `npx wrangler deployments list --env testing` (paměť `reference_cf_queue_consumer_10013.md`).

- [ ] **Step 3: API bez slibů**

Run: `curl -s "https://api-test.prales.fun/api/teams/302a0ce7-428a-4da8-b4ac-40f27eb9a7d1/sponsor-promises" | python3 -m json.tool`
Expected: `{"promises": [...]}` (prázdné pole, nebo sliby z jednání etapy 2).

- [ ] **Step 4: Připravit data na testovací DB**

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT id, category, sponsor_id, sponsor_name, sponsor_type, seasons_remaining FROM sponsor_contracts WHERE team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" AND status = "active"'`
Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT MAX(number) AS season FROM seasons WHERE status = "active"'`
Expected: seznam aktivních smluv a číslo sezóny.

Zapsat `/tmp/sliby-fixture.sql` (smlouva stadionu se založí jen tehdy, když klub žádnou nemá; sliby visí na aktivní smlouvě stadionu):

```sql
INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, win_bonus, seasons_total,
  seasons_remaining, early_termination_fee, is_naming_rights, category, sponsor_id)
SELECT 'c-e3-fixture', t.id, ds.name, ds.type, 3000, 0, 2, 2, 12000, 0, 'stadium', ds.id
FROM teams t JOIN villages v ON v.id = t.village_id JOIN district_sponsors ds ON ds.district = v.district
WHERE t.id = '302a0ce7-428a-4da8-b4ac-40f27eb9a7d1'
  AND NOT EXISTS (SELECT 1 FROM sponsor_contracts x WHERE x.team_id = t.id AND x.status = 'active' AND x.category = 'stadium')
  AND NOT EXISTS (SELECT 1 FROM sponsor_contracts y WHERE y.sponsor_id = ds.id AND y.status = 'active')
LIMIT 1;

INSERT INTO sponsor_promises (id, contract_id, team_id, sponsor_id, kind, params, season, deadline_game_date,
  value_share, reward, penalty, status, created_at)
SELECT p.id, sc.id, sc.team_id, sc.sponsor_id, p.kind, p.params, p.season, p.deadline, 0.05, p.reward, p.penalty, 'pending', datetime('now')
FROM sponsor_contracts sc
JOIN (
  SELECT 'e3-licence' AS id, 'coach_licence' AS kind, '{"level":4}' AS params, NULL AS season, '2020-01-01' AS deadline, 0 AS reward, 5000 AS penalty
  UNION ALL SELECT 'e3-changing', 'stadium_upgrade', '{"facility":"changing_rooms","level":1}', NULL, '2099-12-31', 4000, 3000
  UNION ALL SELECT 'e3-logo', 'jersey_logo', '{}', NULL, '2099-12-31', 2000, 3000
  UNION ALL SELECT 'e3-sector', 'sector_exclusivity', '{}', NULL, NULL, 0, 0
  UNION ALL SELECT 'e3-rep', 'reputation',
    json_object('reputation', (SELECT reputation FROM teams WHERE id = '302a0ce7-428a-4da8-b4ac-40f27eb9a7d1') + 2),
    (SELECT MAX(number) FROM seasons WHERE status = 'active'), NULL, 0, 6000
  UNION ALL SELECT 'e3-promo', 'promotion', '{}', (SELECT MAX(number) FROM seasons WHERE status = 'active'), NULL, 10000, 9000
) p
WHERE sc.team_id = '302a0ce7-428a-4da8-b4ac-40f27eb9a7d1' AND sc.status = 'active' AND sc.category = 'stadium'
LIMIT 6;
```

Run: `cd /Users/savrik/Projects/fmko && npx wrangler d1 execute prales-db-test --remote --file /tmp/sliby-fixture.sql`
Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT id, kind, status, season, deadline_game_date FROM sponsor_promises WHERE id LIKE "e3-%"'`
Expected: 6 řádků `pending`. Když se sloupce `sponsor_promises` od 0221 liší (INSERT spadne), upravit seznam sloupců podle `PRAGMA table_info(sponsor_promises)` a zkusit znovu.

- [ ] **Step 5: Termínové sliby (admin endpoint)**

Admin endpoint chce přihlášeného admina. Ověřit:
Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT u.email, u.is_admin FROM users u JOIN teams t ON t.user_id = u.id WHERE t.id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1"'`
Když `is_admin = 0`, požádat uživatele o přihlášení admin účtem na `test.prales.fun` v tomtéž prohlížeči (práva účtu neměnit bez jeho souhlasu).

MCP browser: `mcp__claude-in-chrome__tabs_context_mcp` (createIfEmpty), navigate `https://test.prales.fun`, pak `javascript_tool`:
```js
fetch('https://api-test.prales.fun/api/admin/sponsor-promises/evaluate?scope=deadline', {
  method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('om_token') },
}).then(r => r.json()).then(j => { window.__e3deadline = j; });
```
Druhým `javascript_tool` přečíst `JSON.stringify(window.__e3deadline)`. Prázdný výsledek prvního volání NEznamená, že se nic nestalo; neopakovat, nejdřív přečíst (paměť `reference_browser_async_fetch.md`).
Expected: `{"ok":true,…,"resolved":2,…}` (licence porušena, šatny splněny; když má klub šatny na úrovni 0, `resolved` je 1).

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT id, status, actual_value, resolved_at FROM sponsor_promises WHERE id LIKE "e3-%"'`
Expected: `e3-licence` `broken`, `e3-changing` `fulfilled` s `actual_value >= 1`, ostatní `pending`.

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT type, amount, description FROM transactions WHERE reference_id LIKE "promise:e3-%"'`
Expected: `sponsor_penalty` −5000 s popisem „…: pokuta za porušený slib (UEFA Pro pro trenéra)" a `sponsor_bonus` 4000.

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT breaches_season, status FROM sponsor_contracts WHERE team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" AND category = "stadium" ORDER BY signed_at DESC LIMIT 1'`
Expected: `breaches_season = 1`, `status = "active"`.

Idempotence: spustit fetch znovu (nový klíč `window.__e3deadline2`) a přečíst.
Expected: `"resolved": 0`.

- [ ] **Step 6: Prohlížeč: sliby, logo, exkluzivita, finance**

1. Přihlásit testovací účet (heslo zadá uživatel), `/sponzori`, záložka Smlouvy. U smlouvy stadionu blok „Sliby sponzorovi": `e3-licence` „porušeno" (červený štítek), šatny „splněno" (zelený) se skutečností, logo „čeká" s tlačítkem „👕 Dát logo na rukáv", exkluzivita „platí", reputace a postup „čeká" se „sezóna N". Screenshot.
2. Kliknout „Dát logo na rukáv", potvrdit. Očekávání: logo „splněno", tlačítko zmizí. Screenshot.
3. V nabídkách bannerů není žádná firma oboru smlouvy stadionu (`sponsor_type` z kroku 4).
4. Chybový případ, podpis banneru chráněného oboru přímo přes API (název firmy = `sponsor_name` smlouvy stadionu, obor = její `sponsor_type`):
```js
fetch('https://api-test.prales.fun/api/teams/302a0ce7-428a-4da8-b4ac-40f27eb9a7d1/sponsors/sign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('om_token') },
  body: JSON.stringify({ category: 'banner', sponsorName: '<sponsor_name z kroku 4>', sponsorType: '<sponsor_type z kroku 4>', monthlyAmount: 1, winBonus: 0, seasons: 1, earlyTerminationFee: 0 }),
}).then(async r => { window.__e3sign = { status: r.status, body: await r.json() }; });
```
   Přečíst `window.__e3sign`. Expected: `status 409`, `error` „Smlouva s … slibuje, že u hřiště nebude reklama jiné firmy ze stejného oboru. Tenhle banner teď podepsat nejde." (Při 6 bannerech přijde dřív 400 „Maximální počet bannerů"; pak tento krok přeskočit a nahlásit.)
5. `/finance`: v historii transakcí „Pokuta od sponzora" a „Bonus od sponzora" s popisem slibu, česky, s ikonou. Screenshot.
6. `/telefon`: SMS od majitele firmy stadionu o porušeném slibu (v textu popisek slibu, bez dlouhé pomlčky). Pokud ji denní limit posunul, ověřit frontu:
Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT occasion, reference_id, status FROM sponsor_owner_sms WHERE reference_id LIKE "promise:e3-%" OR reference_id LIKE "sponsor-quit:%" ORDER BY created_at DESC LIMIT 5'`
Expected: řádky `promise_broken` / `promise_kept` (`pending` nebo `awaiting`).

- [ ] **Step 7: Sezónní sliby a výpověď sponzorem**

`javascript_tool`:
```js
fetch('https://api-test.prales.fun/api/admin/sponsor-promises/evaluate?scope=season&season=<číslo sezóny z kroku 4>', {
  method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('om_token') },
}).then(r => r.json()).then(j => { window.__e3season = j; });
```
Přečíst `window.__e3season`. Expected: `resolved: 2`. Reputace +2 nad dnešní hodnotou = `partial`. Postup: když klub není v tabulce 1. nebo 2., `broken` a `terminated: 1` (porušený postup = výpověď hned).

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT id, status, actual_value FROM sponsor_promises WHERE id IN ("e3-rep", "e3-promo")'`
Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT t.stadium_name, t.sleeve_sponsor_id, (SELECT status FROM sponsor_contracts WHERE id = (SELECT contract_id FROM sponsor_promises WHERE id = "e3-promo")) AS contract_status FROM teams t WHERE t.id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1"'`
Expected při výpovědi: `contract_status = "terminated"`, `stadium_name = "Sportovní areál …"`, `sleeve_sponsor_id = null`.

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT delta, source, description FROM reputation_log WHERE reference_id LIKE "sponsor-quit-%" ORDER BY rowid DESC LIMIT 1'`
Expected: `delta = -5`, `source = "sponsor"`.

Prohlížeč: `/sponzori` Smlouvy, smlouva stadionu zmizela (je ve Historii jako ukončená), `/zpravy` nebo zpravodaj ligy obsahuje zprávu o konci sponzora, v telefonu zpráva od Sportovního ředitele „Firma … vypověděla smlouvu…". Screenshot.

Idempotence: spustit sezónní fetch znovu. Expected: `resolved: 0`.

- [ ] **Step 8: Úklid testovacích slibů**

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'DELETE FROM sponsor_promises WHERE id LIKE "e3-%"'`
Transakce, reputace a zprávy zůstávají (testovací historie). Když vznikla smlouva `c-e3-fixture` a nebyla vypovězena, ukončit ji:
Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'UPDATE sponsor_contracts SET status = "terminated" WHERE id = "c-e3-fixture" AND status = "active"'`

- [ ] **Step 9: STOP**

Nahlásit uživateli výsledky (screenshoty, výstupy dotazů, případné nesouvisející pády testů) a čekat. Etapy 2 a 3 jdou na produkci najednou (spec). Na `main` a na `prales-db-prod` (migrace 0221 a 0222, obě se zálohou `wrangler d1 export` před migrací) jen po výslovném „nasaď na main".
