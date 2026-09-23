# Sponzoři, etapa 2: jednání o smlouvě: plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pevné nabídky hlavního sponzora a názvu stadionu zmizí. Klub místo nich jedná s majitelem firmy: skládá balíček slibů (výsledky, licence, stavba, logo, exkluzivita oboru, návštěva, mladí, reputace, klid na tribunách) a požadavků (měsíčně, za výhru, za podpis, bonusy za splnění slibů, stavba nebo vybavení zaplacené sponzorem, zaplacení výpovědní pokuty u současného sponzora), volí délku smlouvy a majitel podle pevných pravidel přijme, dá protinabídku, nebo odmítne. Prodloužení hlavní smlouvy a stadionu je jednání se stávajícím sponzorem. Podpis zapíše smlouvu, vyplatí podpisový příspěvek, provede zaplacenou stavbu, zaplatí výpovědní pokutu při přechodu a založí řádky `sponsor_promises`, které vyhodnotí etapa 3.

**Architecture:** Čistá matematika jednání v `apps/api/src/sponsors/` (druhy slibů, ambice a očekávané místo, přání majitele, ochota O, cena požadavků, vyhodnocení kola, řádky slibů, validace návrhu a katalog), nad ní DB vrstva `negotiation-db.ts` (kontext klubu, otevření, stav, kola s optimistickým zámkem, líná expirace, cooldown, úklid v rolloveru) a podpis `signing.ts` (smlouva, platby, stavba, sliby, přejmenování přesunuté z `routes/game.ts`). Routy v `routes/sponsors.ts`. Klient posílá jen návrh k vyhodnocení; server ho validuje proti vlastnímu kontextu a podepisuje výhradně podmínky uložené v DB. Web: nová obrazovka `/sponzor/[id]/jednani?id=<negotiationId>` (mobil nejdřív), vstup z `/sponzor/[id]`, ze záložky Firmy a ze záložky Smlouvy (prodloužení).

**Tech Stack:** Hono + Cloudflare D1 (SQLite), vitest, Next.js 15 (client komponenty), Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-22-vyjednavani-se-sponzory-design.md`, sekce „Etapa 2" (kontext etapy 1 a 3). Etapu 3 (vyhodnocení slibů, odměny, pokuty, výpověď sponzorem) tento plán NEimplementuje, jen zakládá řádky `sponsor_promises`.

## Design (rozhodnutí nad rámec specifikace)

- **Migrace 0221** (ne 0218 ze specifikace, čísla 0217 až 0220 jsou obsazená), schéma sdílené s plánem etapy 3 doslova.
- **Tvar `sponsor_promises.params`** (etapa 3 ho čte, nesmí se měnit):

  | kind | params | season | deadline_game_date |
  |---|---|---|---|
  | `league_position` | `{"position":3}` | sezóna | null |
  | `promotion` | `{}` (1. nebo 2. místo, `PROMOTION_SPOTS = 2`) | sezóna | null |
  | `no_relegation` | `{}` (mimo poslední 2 místa, `RELEGATION_SPOTS = 2`) | sezóna | null |
  | `cup_round` | `{"round":4}` (klub se dostane aspoň do kola 4) | sezóna | null |
  | `coach_licence` | `{"level":2}` | null | podpis + 112 herních dní |
  | `stadium_upgrade` | `{"facility":"vip_box","level":2}` | null | podpis + 112 herních dní |
  | `jersey_logo` | `{}` (jen sponzor stadionu) | null | podpis + 112 herních dní |
  | `sector_exclusivity` | `{"sector":"brewery"}` | null | null (po dobu smlouvy) |
  | `attendance` | `{"attendance":250}` (průměrná domácí návštěva) | sezóna | null |
  | `youth` | `{"count":2}` (průměrně hráčů do 21 let v sestavě) | sezóna | null |
  | `reputation` | `{"reputation":55}` (reputace na konci sezóny) | sezóna | null |
  | `no_riots` | `{}` | sezóna | null |

- **Koordinace s plánem etapy 3** (ten na tomhle stojí):
  1. Postupy a sestupy ve hře zatím nejsou. Etapa 3 vyhodnocuje `promotion` = konec v top 2 tabulky ligy, `no_relegation` = konec mimo poslední 2 místa. Ambice a šance těchto slibů se tady počítají se stejnými zónami (`PROMOTION_SPOTS = 2`, `RELEGATION_SPOTS = 2`).
  2. `sponsor_promises.season` = globální `seasons.number` sezóny, pro kterou slib platí (sezónní jen pro sezóny po sezóně podpisu). `penalty` počítá a ukládá etapa 2 při podpisu (`round(value_share × B × 16/4,3)`), `reward` = vyjednaný bonus za splnění (0, když žádný).
  3. `deadline_game_date` se ukládá tak, jak je (herní datum podpisu + 112 dní). Posun při rolloveru (herní čas se vrací) dělá etapa 3.
  4. `jersey_logo` se nabízí jen při jednání o sponzora stadionu a má termín. Sloupec `teams.sleeve_sponsor_id` (migrace 0222) a tlačítko pro logo na rukávu přidává etapa 3.
- **Sezónní sliby** jen pro sezóny `N+1 … N+S−1` (smlouva podepsaná v sezóně N na S sezón; rollover odečítá `seasons_remaining`). Smlouva na 1 sezónu sezónní sliby mít nemůže, validace je odmítne.
- **Hodnota slibu** `value_share = základ × zájem × ambice` (podíl B). Počítá se jednou za druh, ne za sezónu. Pokuta za každý řádek `round(value_share × B × 16/4,3)`, odměna = vyjednaný bonus G za splnění (stejný pro každý řádek daného druhu).
- **Ambice**: umístění `clamp(1 + (očekávané − X)/počet × 2, 0,3, 2)`; postup = totéž s X = 2; nesestup = totéž s X = počet − 2; pohár `clamp(0,3 + 1,7 × (kolo − 1)/(kol − 1), 0,3, 2)`; návštěva `clamp(X / průměr minulé sezóny, 0,67, 1,33)` se základem 7,5 % (tedy 5 až 10 %); ostatní 1.
- **Šance sponzora** (pro cenu bonusu G): sezónní `clamp(0,9 − 0,4 × ambice, 0,1, 0,9)`, ostatní 0,7.
- **Očekávané výhry** (pro cenu bonusu za výhru): zápasů `2 × (počet − 1)`, podíl výher `clamp(0,55 − 0,35 × (očekávané − 1)/(počet − 1), 0,15, 0,6)`.
- **Protinabídka**: když má majitel nesplněné přání, které jde slíbit a s nímž by původní návrh prošel, nabídne ho (výchozí parametr: umístění = očekávané místo, pohár = kolo 3, licence o stupeň výš, stavba = nejlevnější odemčené zařízení o úroveň, návštěva = průměr, mladí = 2, reputace = současná). Jinak ubírá peněžní položky (měsíčně, za výhru, za podpis, bonusy G) od nejdražší po celých stovkách, až cena ≤ O. Stavba, vybavení a pokuta se neubírají.
- **Odhad**: klub vidí ochotu i přínos a pokutu každého slibu jako rozmezí `× (1 ± šířka)` podle náklonnosti (`budgetEstimateRange`). Přesné pokuty až ve shrnutí před podpisem. Náhled ceny požadavků počítá web stejným vzorcem z faktorů, které vrací server (rozhoduje vždy server).
- **Otevření jednání**: jedno otevřené/přijaté jednání na (klub, sponzor, kategorie), podmíněný INSERT. Zvlášť s více firmami jednat jde. Po podpisu ostatní otevřená jednání klubu v téže kategorii vyprší.
- **Líná expirace**: 7 herních dní (`gameExpiry(teams.game_date, 7)`), kontroluje se při každém čtení v JS (`isGameExpired`). Cooldown 14 herních dní po odchodu majitele. Rollover (herní čas se vrací) všechna otevřená/přijatá jednání uzavře jako `expired` a cooldowny smaže.
- **Prodloužení** = jednání se stejnou firmou, jaká je u aktivní (v poslední sezóně) nebo naposledy vypršelé smlouvy v kategorii. Podpis prodloužení: stará smlouva `expired`, nová řádka; bez přejmenování, bez −3 reputace, nepočítá se do limitu změny hlavního sponzora. Náklonnost +5 za sezónu spolupráce už dává rollover (`rewardSeasonPartnerships`).
- **Přechod k jiné firmě** při aktivní smlouvě: stará smlouva `terminated`, pokuta `early_termination_fee × zbývající/3` (stejně jako `/sponsors/terminate`) jako `sponsor_termination`; když ji má zaplatit nový sponzor, přijde jako `sponsor_signing` ve stejné výši. Hlavní: majitel staré firmy pošle `main_lost`.
- **Vybavení od sponzora** jen míče a dresy (`balls`, `jerseys`), o jednu úroveň. **Stavba od sponzora**: jedno zařízení o jednu úroveň, odemčené podle `getUpgradeOptions`; nesmí být zároveň slíbená stavba téhož zařízení.
- **Nový typ transakce** `sponsor_signing` (příjem: podpisový příspěvek, zaplacená pokuta). Není v `PURCHASE_TYPES`.
- `POST /sponsors/sign` a `/sponsors/renew` zůstávají jen pro bannery; hlavní a stadion vrací 400 s vysvětlením.
- Nový důvod v deníku náklonnosti: „urazil se nabídkou při jednání" (−3, přes `applySponsorFavorDelta`).

## Global Constraints

- Identifikátory v kódu anglicky, texty pro hráče a komentáře česky, přirozeně. V textech pro hráče NIKDY dlouhá pomlčka (—).
- Nikdy prázdný `catch`. Server `logger.warn/error({ module: "sponsors", teamId }, "popis", e)`; kontext loggeru jen `teamId`/`matchId`/`playerId`/`reqId`, ostatní id do textu zprávy. Klient `console.error("popis:", e)`.
- Herní čas ≠ reálný: data jednání a slibů z `teams.game_date` přes `gameExpiry`/`isGameExpired` (`apps/api/src/lib/game-time.ts`), fallback `new Date().toISOString()` jen když `game_date` chybí (stejně jako `favorLogStmt`).
- Peníze počítá server. Klient posílá jen návrh k vyhodnocení (`seasons`, `promises`, `demands`), server ho validuje (`validateProposal`) a podepisuje jen podmínky uložené v `sponsor_negotiations.rounds`.
- Každá změna náklonnosti přes `applySponsorFavorDelta` s českým důvodem.
- UI: mobil nejdřív, minimum `text-sm`, jména `text-base` a jako odkazy (`SponsorLink`, `/tym/[id]`), ceny nikdy v tlačítkách, odesílací tlačítka na konci stránky, vše česky, dotykové prvky `min-h-11`.
- Testovací DB `prales-db-test`; produkce jen po výslovném souhlasu. D1 dotazy: vnější `'`, vnitřní `"`, žádný backslash před `$`; wrangler spouštět holý (bez `cd` a rour).
- Větev `testing`. V úlohách 1 až 8 se NEPUSHUJE; push jen v úloze 9. Nic na `main`.
- Commit zprávy česky, tělo končí prázdným řádkem a `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do commitu nikdy `.serena/project.yml` ani `packages/db/tsconfig.tsbuildinfo`.
- Plán etapy 3 se píše souběžně a sahá na stejná místa: `TransactionType` (přidá `sponsor_bonus`, `sponsor_penalty`), mapy v `finance/page.tsx`, `FAVOR_REASONS`, rollover. Při konfliktu slučovat, nepřepisovat.

## Souborová struktura

| Soubor | Odpovědnost |
|---|---|
| `apps/api/migrations/0221_sponsor_negotiations.sql` (nový) | `sponsor_negotiations`, `sponsor_promises`, nové sloupce `sponsor_contracts` |
| `apps/api/src/season/finance-processor.ts` | typ transakce `sponsor_signing` |
| `apps/web/src/app/(hra)/finance/page.tsx` | ikona a popisek `sponsor_signing` |
| `apps/api/src/sponsors/promise-kinds.ts` (nový) | druhy slibů, parametry, sezónní/termínové, základy |
| `apps/api/src/sponsors/ambition.ts` + `.test.ts` (nové) | očekávané místo, ambice, šance sponzora, očekávané výhry |
| `apps/api/src/sponsors/wishes.ts` + `.test.ts` (nové) | přání majitele podle povahy a oboru, zájem o slib |
| `apps/api/src/sponsors/negotiation.ts` + `.test.ts` (nové) | B se odvozuje v `budget.ts`; tady ochota O, cena, kolo, trpělivost, řádky slibů |
| `apps/api/src/sponsors/proposal.ts` + `.test.ts` (nové) | validace návrhu (anti-podvrh), katalog slibů a darů pro klienta |
| `apps/api/src/sponsors/negotiation-texts.ts` + `.test.ts` (nové) | odpovědi majitele podle povahy, přání ve 4. pádě |
| `apps/api/src/sponsors/negotiation-db.ts` + `.test.ts` (nové) | DB vrstva jednání, kontext klubu, dostupnost, pohled pro klienta |
| `apps/api/src/sponsors/signing.ts` (nový) | podpis z jednání, platby, stavba, sliby, přejmenování |
| `apps/api/src/sponsors/favor-math.ts` | důvod `negotiationInsult` |
| `apps/api/src/routes/sponsors.ts` | routy jednání, dostupnost v `GET /sponsors/:id` |
| `apps/api/src/routes/game.ts` | pryč pevné nabídky main/stadion, sign/renew jen bannery, seznam jednání |
| `apps/api/src/season/season-rollover.ts` | úklid jednání, text SMS ředitele |
| `apps/web/src/lib/sponsor-negotiation.ts` (nový) | typy API, popisky, náhled odhadu a ceny |
| `apps/web/src/app/(hra)/sponzor/[id]/jednani/page.tsx` (nový) | obrazovka jednání |
| `apps/web/src/components/sponsors/negotiation/*.tsx` (nové) | hlavička, sliby, požadavky, historie kol, shrnutí |
| `apps/web/src/components/sponsors/negotiation-entry.tsx` (nový) | vstup z `/sponzor/[id]` |
| `apps/web/src/app/(hra)/sponzor/[id]/page.tsx`, `components/sponsors/owner-card.tsx` | vstup do jednání |
| `apps/web/src/components/sponsors/contracts-tab.tsx`, `firms-tab.tsx`, `app/(hra)/sponzori/page.tsx`, `lib/sponsor-page-types.ts` | bez pevných nabídek, prodloužení a hledání sponzora jednáním |

---

### Task 1: Migrace 0221 a typ transakce `sponsor_signing`

**Files:**
- Create: `apps/api/migrations/0221_sponsor_negotiations.sql`
- Modify: `apps/api/src/season/finance-processor.ts` (union `TransactionType`)
- Modify: `apps/web/src/app/(hra)/finance/page.tsx` (`TXN_ICONS`, `TXN_LABELS`)

**Interfaces:**
- Consumes: `teams(id)`, `district_sponsors(id)`, `sponsor_contracts(id)`.
- Produces: tabulky `sponsor_negotiations`, `sponsor_promises`; sloupce `sponsor_contracts.signing_bonus`, `paid_construction`, `breaches_season`, `negotiation_id`; `TransactionType` `"sponsor_signing"`.

- [ ] **Step 1: Ověřit, že 0221 je volné**

Run: `ls /Users/savrik/Projects/fmko/apps/api/migrations | tail -3`
Expected: poslední `0220_sponsor_owner_sms.sql`, žádná `0221_*`. (Když už `0221_*` existuje od plánu etapy 3, je to TATÁŽ migrace: porovnat obsah se Step 2 a při shodě Step 2 a 3 přeskočit.)

- [ ] **Step 2: Napsat migraci**

`apps/api/migrations/0221_sponsor_negotiations.sql`:

```sql
-- 0221: Jednání se sponzory (etapa 2) a sliby klubu (etapa 3).
-- Schéma je sdílené s plánem etapy 3, neměnit bez něj.
-- Aplikovat ručně PŘED nasazením kódu:
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0221_sponsor_negotiations.sql

CREATE TABLE IF NOT EXISTS sponsor_negotiations (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  category TEXT NOT NULL CHECK(category IN ('main','stadium')),
  wishes TEXT NOT NULL,          -- JSON array of promise kinds the owner wants
  budget_b INTEGER NOT NULL, patience INTEGER NOT NULL,
  rounds TEXT NOT NULL DEFAULT '[]',   -- JSON array of {proposal, response}
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','accepted','walked_away','expired','signed')),
  expires_game_date TEXT NOT NULL, cooldown_until TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_sponsor_negotiations_team ON sponsor_negotiations(team_id, status);
CREATE INDEX IF NOT EXISTS idx_sponsor_negotiations_sponsor ON sponsor_negotiations(sponsor_id, team_id);
CREATE TABLE IF NOT EXISTS sponsor_promises (
  id TEXT PRIMARY KEY, contract_id TEXT NOT NULL REFERENCES sponsor_contracts(id), team_id TEXT NOT NULL REFERENCES teams(id),
  sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  kind TEXT NOT NULL,            -- league_position|promotion|no_relegation|cup_round|coach_licence|stadium_upgrade|jersey_logo|sector_exclusivity|attendance|youth|reputation|no_riots
  params TEXT NOT NULL,          -- JSON, e.g. {"position":3} / {"facility":"vip_box","level":2} / {"level":2}
  season INTEGER, deadline_game_date TEXT,
  value_share REAL NOT NULL, reward INTEGER NOT NULL DEFAULT 0, penalty INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','fulfilled','partial','broken')),
  resolved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_sponsor_promises_contract ON sponsor_promises(contract_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_promises_open ON sponsor_promises(status, season);
ALTER TABLE sponsor_contracts ADD COLUMN signing_bonus INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sponsor_contracts ADD COLUMN paid_construction TEXT;
ALTER TABLE sponsor_contracts ADD COLUMN breaches_season INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sponsor_contracts ADD COLUMN negotiation_id TEXT;
```

- [ ] **Step 3: Aplikovat na testovací DB**

Run (z `/Users/savrik/Projects/fmko`): `npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0221_sponsor_negotiations.sql`
Expected: hlášení o úspěchu (`Executed 10 commands` nebo obdobné), žádná chyba. Při `duplicate column name` (etapa 3 už migraci pustila) ověřit Step 4 a pokračovat.

- [ ] **Step 4: Ověřit tabulky a sloupce**

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT group_concat(name, ",") AS c FROM pragma_table_info("sponsor_negotiations")'`
Expected: `"c": "id,team_id,sponsor_id,category,wishes,budget_b,patience,rounds,status,expires_game_date,cooldown_until,created_at"`

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT group_concat(name, ",") AS c FROM pragma_table_info("sponsor_contracts") WHERE name IN ("signing_bonus","paid_construction","breaches_season","negotiation_id")'`
Expected: `"c": "signing_bonus,paid_construction,breaches_season,negotiation_id"`

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT COUNT(*) AS n FROM sponsor_promises'`
Expected: `"n": 0`

- [ ] **Step 5: Typ transakce na API**

V `apps/api/src/season/finance-processor.ts` za řádek `  | "sponsor_termination"` vložit:

```ts
  // Sponzor při podpisu vyjednané smlouvy: podpisový příspěvek a zaplacená výpovědní
  // pokuta u předchozího sponzora. Příjem, ne nákup, proto NENÍ v PURCHASE_TYPES.
  | "sponsor_signing"
```

- [ ] **Step 6: Popisek na webu**

V `apps/web/src/app/(hra)/finance/page.tsx`:
- v `TXN_ICONS` nahradit `  sponsor_termination: "❌", season_reward: "🏆", event: "⚡",` za `  sponsor_termination: "❌", sponsor_signing: "✍", season_reward: "🏆", event: "⚡",`
- v `TXN_LABELS` nahradit `  sponsor_termination: "Ukončení smlouvy", season_reward: "Sezónní odměna", event: "Událost",` za `  sponsor_termination: "Ukončení smlouvy", sponsor_signing: "Sponzor při podpisu", season_reward: "Sezónní odměna", event: "Událost",`

- [ ] **Step 7: Typecheck**

Run: `cd /Users/savrik/Projects/fmko && npm run typecheck`
Expected: všechny balíčky bez chyb (`Tasks: … successful`).

- [ ] **Step 8: Commit**

```bash
cd /Users/savrik/Projects/fmko
git add apps/api/migrations/0221_sponsor_negotiations.sql apps/api/src/season/finance-processor.ts "apps/web/src/app/(hra)/finance/page.tsx"
git commit -m "$(cat <<'EOF'
feat(sponzori): migrace 0221 jednani a sliby, transakce sponsor_signing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Druhy slibů, očekávané místo a ambice (s testy)

**Files:**
- Create: `apps/api/src/sponsors/promise-kinds.ts`
- Create: `apps/api/src/sponsors/ambition.ts`
- Test: `apps/api/src/sponsors/ambition.test.ts`

**Interfaces:**
- Consumes: nic.
- Produces:
  - `PROMISE_KINDS`, `type PromiseKind`, `isPromiseKind(v)`, `interface PromiseParams`, `interface PromiseSpec { kind; params }`, `SEASONAL_KINDS`, `DEADLINE_KINDS`, `RESULT_KINDS`, `PROMISE_BASE_SHARE`, `BIG_FACILITIES`, `PROMISE_DEADLINE_DAYS = 112`, `EQUIPMENT_GIFTS`.
  - `clamp`, `MONTHS_PER_SEASON`, `PROMOTION_SPOTS`, `RELEGATION_SPOTS`, `DEFAULT_CUP_ROUNDS`, `TERM_PROMISE_CHANCE`, `expectedPosition(strengths, teamId)`, `leaguePositionAmbition(expected, target, teams)`, `promotionAmbition`, `noRelegationAmbition`, `cupRoundAmbition(round, totalRounds)`, `attendanceAmbition(target, lastAvg)`, `sponsorChance(ambition)`, `expectedWinsPerSeason(expected, teams)`.

- [ ] **Step 1: Napsat `promise-kinds.ts`**

```ts
/**
 * Druhy slibů, které klub dává sponzorovi při jednání. Klíče i tvar `params` čte
 * i vyhodnocení slibů (etapa 3) ze sloupce sponsor_promises.params, neměnit bez migrace dat.
 *
 * params podle druhu:
 *   league_position {position}   promotion {}            no_relegation {}
 *   cup_round {round}            coach_licence {level}   stadium_upgrade {facility, level}
 *   jersey_logo {}               sector_exclusivity {sector}
 *   attendance {attendance}      youth {count}           reputation {reputation}
 *   no_riots {}
 */
export const PROMISE_KINDS = [
  "league_position", "promotion", "no_relegation", "cup_round", "coach_licence", "stadium_upgrade",
  "jersey_logo", "sector_exclusivity", "attendance", "youth", "reputation", "no_riots",
] as const;
export type PromiseKind = (typeof PROMISE_KINDS)[number];

export function isPromiseKind(v: unknown): v is PromiseKind {
  return typeof v === "string" && (PROMISE_KINDS as readonly string[]).includes(v);
}

export interface PromiseParams {
  position?: number;
  round?: number;
  level?: number;
  facility?: string;
  sector?: string;
  attendance?: number;
  count?: number;
  reputation?: number;
}

export interface PromiseSpec {
  kind: PromiseKind;
  params: PromiseParams;
}

/** Sezónní sliby platí až od příští sezóny, jeden řádek za každou sezónu smlouvy od N+1. */
export const SEASONAL_KINDS: ReadonlySet<PromiseKind> = new Set<PromiseKind>([
  "league_position", "promotion", "no_relegation", "cup_round", "attendance", "youth", "reputation", "no_riots",
]);

/** Termínové sliby platí hned a mají termín splnění. */
export const DEADLINE_KINDS: ReadonlySet<PromiseKind> = new Set<PromiseKind>(["coach_licence", "stadium_upgrade", "jersey_logo"]);

/** „Výsledky nad nesestup": opatrnému majiteli jsou jedno. */
export const RESULT_KINDS: ReadonlySet<PromiseKind> = new Set<PromiseKind>(["league_position", "promotion", "cup_round"]);

/** Základ hodnoty slibu jako podíl rozpočtu B. Licence a stavba se násobí počtem stupňů (negotiation.ts). */
export const PROMISE_BASE_SHARE: Record<PromiseKind, number> = {
  league_position: 0.15,
  promotion: 0.20,
  no_relegation: 0.08,
  cup_round: 0.08,
  coach_licence: 0.05,
  stadium_upgrade: 0.05,
  jersey_logo: 0.10,
  sector_exclusivity: 0.05,
  // 7,5 % × ambice 0,67 až 1,33 = 5 až 10 % podle toho, jak vysoko je cíl proti minulé sezóně.
  attendance: 0.075,
  youth: 0.05,
  reputation: 0.05,
  no_riots: 0.05,
};

/** Velké stavby: slib jejich modernizace má dvojnásobný základ za úroveň. */
export const BIG_FACILITIES: ReadonlySet<string> = new Set(["stands", "lighting", "roof"]);

/** Termín termínových slibů: 16 herních týdnů od podpisu. */
export const PROMISE_DEADLINE_DAYS = 112;

/** Vybavení, které může sponzor klubu koupit o úroveň výš. */
export const EQUIPMENT_GIFTS: readonly string[] = ["balls", "jerseys"];
```

- [ ] **Step 2: Napsat test `ambition.test.ts`**

```ts
/**
 * Očekávané místo a ambice slibů (čisté funkce).
 */
import { describe, expect, it } from "vitest";
import {
  attendanceAmbition, cupRoundAmbition, expectedPosition, expectedWinsPerSeason, leaguePositionAmbition,
  MONTHS_PER_SEASON, noRelegationAmbition, promotionAmbition, sponsorChance,
} from "./ambition";

describe("expectedPosition", () => {
  const strengths = [
    { teamId: "a", strength: 50 }, { teamId: "b", strength: 60 }, { teamId: "c", strength: 40 },
  ];
  it("pořadí podle síly nejlepší jedenáctky", () => {
    expect(expectedPosition(strengths, "b")).toBe(1);
    expect(expectedPosition(strengths, "a")).toBe(2);
    expect(expectedPosition(strengths, "c")).toBe(3);
  });
  it("shodná síla: stabilně podle id", () => {
    const tie = [{ teamId: "z", strength: 50 }, { teamId: "m", strength: 50 }];
    expect(expectedPosition(tie, "m")).toBe(1);
    expect(expectedPosition(tie, "z")).toBe(2);
  });
  it("klub mimo seznam dostane střed tabulky", () => {
    expect(expectedPosition(strengths, "x")).toBe(2);
    expect(expectedPosition([], "x")).toBe(1);
  });
});

describe("ambice", () => {
  it("umístění: cíl nad očekáváním je ambicióznější", () => {
    expect(leaguePositionAmbition(8, 3, 14)).toBeCloseTo(1 + (5 / 14) * 2, 6);
    expect(leaguePositionAmbition(7, 7, 14)).toBe(1);
  });
  it("umístění: ořez 0,3 až 2", () => {
    expect(leaguePositionAmbition(1, 14, 14)).toBe(0.3);
    expect(leaguePositionAmbition(14, 1, 14)).toBe(2);
  });
  it("postup = umístění do 2. místa", () => {
    expect(promotionAmbition(2, 14)).toBe(1);
    expect(promotionAmbition(9, 14)).toBe(2);
  });
  it("nesestup: vyšší, když je klub v ohrožení", () => {
    expect(noRelegationAmbition(14, 14)).toBeCloseTo(1 + (2 / 14) * 2, 6);
    expect(noRelegationAmbition(5, 14)).toBe(0.3);
  });
  it("pohár podle kola", () => {
    expect(cupRoundAmbition(1, 7)).toBe(0.3);
    expect(cupRoundAmbition(4, 7)).toBeCloseTo(0.3 + 1.7 * 3 / 6, 6);
    expect(cupRoundAmbition(7, 7)).toBe(2);
  });
  it("návštěva podle poměru k minulé sezóně, ořez 0,67 až 1,33", () => {
    expect(attendanceAmbition(200, 200)).toBe(1);
    expect(attendanceAmbition(400, 200)).toBe(1.33);
    expect(attendanceAmbition(50, 200)).toBe(0.67);
    expect(attendanceAmbition(100, 0)).toBe(1.33);
  });
});

describe("sponsorChance", () => {
  it("vysoká ambice = nízká šance", () => {
    expect(sponsorChance(0.3)).toBeCloseTo(0.78, 6);
    expect(sponsorChance(1)).toBeCloseTo(0.5, 6);
    expect(sponsorChance(2)).toBeCloseTo(0.1, 6);
  });
});

describe("expectedWinsPerSeason", () => {
  it("favorit vyhraje víc, outsider míň, 26 zápasů ve 14členné lize", () => {
    expect(expectedWinsPerSeason(1, 14)).toBeCloseTo(26 * 0.55, 6);
    expect(expectedWinsPerSeason(14, 14)).toBeCloseTo(26 * 0.2, 6);
  });
  it("sezóna má 16/4,3 měsíce", () => {
    expect(MONTHS_PER_SEASON).toBeCloseTo(3.7209, 4);
  });
});
```

- [ ] **Step 3: Spustit test, musí selhat**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/ambition.test.ts`
Expected: FAIL, `Failed to resolve import "./ambition"`.

- [ ] **Step 4: Napsat `ambition.ts`**

```ts
/**
 * Očekávané místo klubu a ambice slibů při jednání se sponzorem (čisté funkce, bez DB).
 * Ambice > 1 = slib je těžší, než klubu odpovídá, sponzor za něj dá víc a čeká nižší šanci.
 */

export const SEASON_WEEKS = 16;
export const WEEKS_PER_MONTH = 4.3;
/** Sezóna v měsících (16 týdnů). Smlouvy drží měsíční částky. */
export const MONTHS_PER_SEASON = SEASON_WEEKS / WEEKS_PER_MONTH;
/** Postupová a sestupová místa (stejně jako league/promotion.ts). */
export const PROMOTION_SPOTS = 2;
export const RELEGATION_SPOTS = 2;
/** Počet kol poháru, když pohár sezóny ještě nevznikl. */
export const DEFAULT_CUP_ROUNDS = 7;
/** Šance sponzora u termínových slibů a exkluzivity oboru. */
export const TERM_PROMISE_CHANCE = 0.7;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Pořadí klubu v lize podle průměru nejlepší jedenáctky (stejná definice síly jako
 * betting/board.ts). Shodná síla: stabilně podle id. Klub bez záznamu = střed tabulky.
 */
export function expectedPosition(strengths: ReadonlyArray<{ teamId: string; strength: number }>, teamId: string): number {
  const sorted = [...strengths].sort((a, b) => b.strength - a.strength || a.teamId.localeCompare(b.teamId));
  const idx = sorted.findIndex((s) => s.teamId === teamId);
  if (idx >= 0) return idx + 1;
  return Math.max(1, Math.ceil(sorted.length / 2));
}

export function leaguePositionAmbition(expected: number, target: number, teams: number): number {
  const n = Math.max(2, teams);
  return clamp(1 + ((expected - target) / n) * 2, 0.3, 2);
}

export function promotionAmbition(expected: number, teams: number): number {
  return leaguePositionAmbition(expected, PROMOTION_SPOTS, teams);
}

/** Nesestup = skončit nejhůř na posledním nesestupovém místě. Klubu v ohrožení na tom záleží víc. */
export function noRelegationAmbition(expected: number, teams: number): number {
  return leaguePositionAmbition(expected, Math.max(1, teams - RELEGATION_SPOTS), teams);
}

export function cupRoundAmbition(round: number, totalRounds: number): number {
  return clamp(0.3 + (1.7 * (round - 1)) / Math.max(1, totalRounds - 1), 0.3, 2);
}

export function attendanceAmbition(target: number, lastAvg: number): number {
  return clamp(target / Math.max(1, lastAvg), 0.67, 1.33);
}

/** Jak moc sponzor věří, že klub sezónní slib splní (pro cenu bonusu za splnění). */
export function sponsorChance(ambition: number): number {
  return clamp(0.9 - 0.4 * ambition, 0.1, 0.9);
}

/** Očekávané výhry za sezónu (dvoukolově každý s každým) podle očekávaného místa. */
export function expectedWinsPerSeason(expected: number, teams: number): number {
  const n = Math.max(2, teams);
  const games = 2 * (n - 1);
  const rate = clamp(0.55 - (0.35 * (expected - 1)) / (n - 1), 0.15, 0.6);
  return games * rate;
}
```

- [ ] **Step 5: Spustit test, musí projít**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/ambition.test.ts`
Expected: PASS, `Tests  12 passed`.

- [ ] **Step 6: Commit**

```bash
cd /Users/savrik/Projects/fmko
git add apps/api/src/sponsors/promise-kinds.ts apps/api/src/sponsors/ambition.ts apps/api/src/sponsors/ambition.test.ts
git commit -m "$(cat <<'EOF'
feat(sponzori): druhy slibu, ocekavane misto a ambice pro jednani

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Přání majitele a zájem o slib (s testy)

**Files:**
- Create: `apps/api/src/sponsors/wishes.ts`
- Test: `apps/api/src/sponsors/wishes.test.ts`

**Interfaces:**
- Consumes: `createRng` (`apps/api/src/generators/rng.ts`), `hashSeed` (`apps/api/src/villages/officials-generator.ts`), `OwnerPersonality` (`./owners`), `SponsorType` (`./types`), `PromiseKind`, `RESULT_KINDS` (`./promise-kinds`).
- Produces: `PERSONALITY_WISHES`, `SECTOR_WISH`, `kindAllowedForCategory(kind, category)`, `ownerWishes({ sponsorId, teamId, season, personality, sponsorType, category }): PromiseKind[]` (2 až 3 přání, deterministicky), `promiseInterest(kind, personality, wishes): 1.5 | 1 | 0.5`, `WISH_INTEREST`, `NEUTRAL_INTEREST`, `INDIFFERENT_INTEREST`.

- [ ] **Step 1: Napsat test `wishes.test.ts`**

```ts
/**
 * Přání majitele podle povahy a oboru, zájem o slib (čisté funkce).
 */
import { describe, expect, it } from "vitest";
import { kindAllowedForCategory, ownerWishes, PERSONALITY_WISHES, promiseInterest } from "./wishes";

const base = { sponsorId: 11, teamId: "t1", season: 3, category: "main" as const };

describe("ownerWishes", () => {
  it("fanoušek z oboru bez přání navíc: 2 přání z výsledků", () => {
    const w = ownerWishes({ ...base, personality: "fan", sponsorType: "shop" });
    expect(w).toHaveLength(2);
    for (const k of w) expect(PERSONALITY_WISHES.fan).toContain(k);
  });

  it("deterministické: stejné vstupy, stejná přání", () => {
    const a = ownerWishes({ ...base, personality: "patriot", sponsorType: "farm" });
    const b = ownerWishes({ ...base, personality: "patriot", sponsorType: "farm" });
    expect(a).toEqual(b);
  });

  it("pivovar přidá návštěvu jako třetí přání", () => {
    const w = ownerWishes({ ...base, personality: "patriot", sponsorType: "brewery" });
    expect(w).toContain("attendance");
    expect(w).toHaveLength(3);
  });

  it("stavebnina chce modernizaci stadionu", () => {
    expect(ownerWishes({ ...base, personality: "cautious", sponsorType: "construction" })).toContain("stadium_upgrade");
  });

  it("IT chce výsledky, bez duplicit", () => {
    const w = ownerWishes({ ...base, personality: "fan", sponsorType: "it" });
    expect(w).toContain("league_position");
    expect(new Set(w).size).toBe(w.length);
    expect(w.length).toBeLessThanOrEqual(3);
  });

  it("logo na rukávu jen u sponzora stadionu", () => {
    for (let id = 1; id <= 30; id++) {
      const w = ownerWishes({ ...base, sponsorId: id, personality: "businessman", sponsorType: "company" });
      expect(w).not.toContain("jersey_logo");
    }
    expect(kindAllowedForCategory("jersey_logo", "stadium")).toBe(true);
    expect(kindAllowedForCategory("jersey_logo", "main")).toBe(false);
  });
});

describe("promiseInterest", () => {
  it("přání = 1,5", () => {
    expect(promiseInterest("youth", "patriot", ["youth", "no_riots"])).toBe(1.5);
  });
  it("opatrnému jsou výsledky nad nesestup jedno", () => {
    expect(promiseInterest("league_position", "cautious", [])).toBe(0.5);
    expect(promiseInterest("cup_round", "cautious", [])).toBe(0.5);
    expect(promiseInterest("no_relegation", "cautious", [])).toBe(1);
  });
  it("obchodníkovi jsou mladí hráči jedno", () => {
    expect(promiseInterest("youth", "businessman", [])).toBe(0.5);
  });
  it("ostatní = 1", () => {
    expect(promiseInterest("reputation", "fan", ["league_position"])).toBe(1);
  });
});
```

- [ ] **Step 2: Spustit test, musí selhat**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/wishes.test.ts`
Expected: FAIL, `Failed to resolve import "./wishes"`.

- [ ] **Step 3: Napsat `wishes.ts`**

```ts
/**
 * Co majitel firmy při jednání chce (spec, tabulka povah) a jak moc mu na slibu záleží.
 * Přání se losují deterministicky pro (sponzor, klub, sezóna, kategorie), takže se
 * při znovuotevření jednání v téže sezóně nemění.
 */
import { createRng } from "../generators/rng";
import { hashSeed } from "../villages/officials-generator";
import type { OwnerPersonality } from "./owners";
import { RESULT_KINDS, type PromiseKind } from "./promise-kinds";
import type { SponsorType } from "./types";

export const PERSONALITY_WISHES: Record<OwnerPersonality, readonly PromiseKind[]> = {
  patriot: ["youth", "no_riots", "reputation"],
  businessman: ["attendance", "jersey_logo", "sector_exclusivity"],
  fan: ["league_position", "promotion", "cup_round"],
  cautious: ["no_relegation", "reputation", "no_riots"],
};

/** Obor přidá jedno přání: hospody návštěvu, stavaři modernizaci, IT výsledky. */
export const SECTOR_WISH: Partial<Record<SponsorType, PromiseKind>> = {
  brewery: "attendance",
  pub: "attendance",
  restaurant: "attendance",
  construction: "stadium_upgrade",
  woodwork: "stadium_upgrade",
  it: "league_position",
  ecommerce: "league_position",
};

export const WISH_INTEREST = 1.5;
export const NEUTRAL_INTEREST = 1;
export const INDIFFERENT_INTEREST = 0.5;

/** Logo na rukávu dresu dává smysl jen u sponzora stadionu (hlavní sponzor je v názvu klubu). */
export function kindAllowedForCategory(kind: PromiseKind, category: "main" | "stadium"): boolean {
  return kind !== "jersey_logo" || category === "stadium";
}

export function ownerWishes(i: {
  sponsorId: number; teamId: string; season: number; personality: OwnerPersonality; sponsorType: string;
  category: "main" | "stadium";
}): PromiseKind[] {
  const rng = createRng(hashSeed(`sponsor-wishes|${i.sponsorId}|${i.teamId}|${i.season}|${i.category}`));
  const pool = PERSONALITY_WISHES[i.personality].filter((k) => kindAllowedForCategory(k, i.category));
  const shuffled = [...pool];
  for (let j = shuffled.length - 1; j > 0; j--) {
    const k = Math.floor(rng.random() * (j + 1));
    [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
  }
  const out = shuffled.slice(0, 2);
  const sector = SECTOR_WISH[i.sponsorType as SponsorType];
  if (sector && kindAllowedForCategory(sector, i.category) && !out.includes(sector)) out.push(sector);
  return out;
}

/** Zájem o slib: přání 1,5, povaze lhostejné 0,5 (opatrný a výsledky nad nesestup, obchodník a mladí), jinak 1. */
export function promiseInterest(kind: PromiseKind, personality: OwnerPersonality, wishes: readonly PromiseKind[]): number {
  if (wishes.includes(kind)) return WISH_INTEREST;
  if (personality === "cautious" && RESULT_KINDS.has(kind)) return INDIFFERENT_INTEREST;
  if (personality === "businessman" && kind === "youth") return INDIFFERENT_INTEREST;
  return NEUTRAL_INTEREST;
}
```

- [ ] **Step 4: Spustit test, musí projít**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/wishes.test.ts`
Expected: PASS, `Tests  10 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Users/savrik/Projects/fmko
git add apps/api/src/sponsors/wishes.ts apps/api/src/sponsors/wishes.test.ts
git commit -m "$(cat <<'EOF'
feat(sponzori): prani majitelu firem podle povahy a oboru

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Čistá matematika jednání, validace návrhu, katalog a odpovědi majitele (s testy)

**Files:**
- Create: `apps/api/src/sponsors/negotiation.ts`
- Create: `apps/api/src/sponsors/proposal.ts`
- Create: `apps/api/src/sponsors/negotiation-texts.ts`
- Test: `apps/api/src/sponsors/negotiation.test.ts`, `apps/api/src/sponsors/proposal.test.ts`, `apps/api/src/sponsors/negotiation-texts.test.ts`

**Interfaces:**
- Consumes: Task 2 (`promise-kinds.ts`, `ambition.ts`), Task 3 (`promiseInterest`, `kindAllowedForCategory`), `clampFavor` (`./favor-math`), `budgetEstimateRange` (`./budget`), `gameExpiry` (`../lib/game-time`), `MAX_LICENCE`, `licenceLabel` (`@okresni-masina/shared`), `FACILITY_LABELS` (`../stadium/stadium-generator`), `CATEGORY_LABELS` (`../equipment/equipment-generator`), `roundName` (`../cup/cup`).
- Produces (`negotiation.ts`):
  - `type NegotiationCategory = "main" | "stadium"`, `interface FacilityOption { facility; currentLevel; locked; costs }`, `interface EquipmentOption { category; currentLevel; nextLevel; cost; locked }`, `interface NegotiationContext`, `interface Demands`, `interface Proposal`, `type RoundOutcome`, `interface PromiseRow`, `interface SigningSummary`, `type CostKey`, `interface CostItem`.
  - konstanty `BASE_WILLINGNESS 0.7`, `WILLINGNESS_CAP 1.5`, `COUNTER_BAND 1.15`, `INSULT_BAND 1.5`, `INSULT_FAVOR -3`, `COOLDOWN_DAYS 14`, `NEGOTIATION_DAYS 7`, `MIN_SEASONS 1`, `MAX_SEASONS 3`, `CAUTIOUS_SEASON_BONUS 0.05`.
  - `initialPatience(favor)`, `afterReject(patience)`, `contractMonths(seasons)`, `promiseAmbition(p, ctx)`, `promiseBaseShare(p, ctx)`, `promiseValueShare(p, ctx)`, `seasonMultiplier(personality, seasons)`, `willingness(proposal, ctx)`, `promiseChance(p, ctx)`, `promiseRowCount(kind, seasons)`, `winBonusFactor(ctx)`, `constructionCost(ctx, facility)`, `equipmentCost(ctx, category)`, `costBreakdown(proposal, ctx)`, `requestCost(proposal, ctx)`, `reduceToWillingness(proposal, ctx, target)`, `defaultPromise(kind, ctx, proposal)`, `evaluateRound(proposal, ctx)`, `promisePenalty(valueShare, budgetB)`, `earlyTerminationFee(monthly, seasons)`, `buildPromiseRows(proposal, ctx, signGameDate)`, `signingSummary(proposal, ctx, signGameDate)`.
- Produces (`proposal.ts`): `validateProposal(raw, ctx): { ok: true; proposal } | { ok: false; error }`, `interface PromiseOption`, `interface GiftOption`, `promiseCatalog(ctx, favor)`, `constructionOptions(ctx)`, `equipmentOptions(ctx)`, `promiseLabel(spec, ctx)`, `MAX_PROMISES`.
- Produces (`negotiation-texts.ts`): `RESPONSE_KINDS`, `type ResponseKind`, `WISH_ACCUSATIVE`, `ownerResponse(personality, kind, roundIndex, wishKind?)`.

- [ ] **Step 1: Napsat test `negotiation.test.ts`**

```ts
/**
 * Matematika jednání se sponzorem: ochota, cena, kolo, trpělivost, řádky slibů.
 */
import { describe, expect, it } from "vitest";
import { expectedWinsPerSeason, MONTHS_PER_SEASON } from "./ambition";
import {
  afterReject, buildPromiseRows, earlyTerminationFee, evaluateRound, initialPatience, promiseValueShare,
  reduceToWillingness, requestCost, willingness, type Demands, type NegotiationContext, type Proposal,
} from "./negotiation";
import type { PromiseSpec } from "./promise-kinds";

const CTX: NegotiationContext = {
  category: "main", personality: "fan", wishes: [], budgetB: 10000, season: 3, leagueTeams: 14,
  expectedPosition: 7, cupTotalRounds: 7, lastAvgAttendance: 200, reputation: 50, licenceLevel: 1,
  sponsorType: "pub", sectorBannerActive: false,
  facilities: [
    { facility: "stands", currentLevel: 1, locked: false, costs: [0, 55000, 170000, 450000] },
    { facility: "toilets", currentLevel: 0, locked: false, costs: [0, 12000, 40000, 100000] },
  ],
  equipment: [{ category: "balls", currentLevel: 1, nextLevel: 2, cost: 8000, locked: false }],
  currentTerminationFee: 7442,
};

function prop(demands: Partial<Demands> = {}, seasons = 2, promises: PromiseSpec[] = []): Proposal {
  return {
    seasons, promises,
    demands: { monthly: 0, winBonus: 0, signingBonus: 0, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false, ...demands },
  };
}

describe("trpělivost", () => {
  it("2 + náklonnost / 25", () => {
    expect(initialPatience(0)).toBe(2);
    expect(initialPatience(40)).toBe(3);
    expect(initialPatience(99)).toBe(5);
    expect(initialPatience(100)).toBe(6);
  });
  it("odmítnutí ubere bod, na nule majitel odchází", () => {
    expect(afterReject(3)).toEqual({ patience: 2, walkedAway: false });
    expect(afterReject(1)).toEqual({ patience: 0, walkedAway: true });
  });
});

describe("willingness", () => {
  it("holý podpis = 0,7 × B", () => {
    expect(willingness(prop(), CTX)).toBeCloseTo(7000, 6);
  });
  it("slib z přání: základ × 1,5 × ambice", () => {
    const ctx = { ...CTX, wishes: ["league_position" as const] };
    expect(willingness(prop({}, 2, [{ kind: "league_position", params: { position: 7 } }]), ctx)).toBeCloseTo(9250, 6);
  });
  it("opatrnému jsou výsledky jedno a +5 % za sezónu nad jednu", () => {
    const ctx: NegotiationContext = { ...CTX, personality: "cautious" };
    expect(willingness(prop({}, 2, [{ kind: "league_position", params: { position: 7 } }]), ctx)).toBeCloseTo(8137.5, 6);
  });
  it("strop 1,5 × B", () => {
    const ctx: NegotiationContext = { ...CTX, expectedPosition: 14, wishes: ["promotion", "league_position"] };
    const p = prop({}, 2, [{ kind: "promotion", params: {} }, { kind: "league_position", params: { position: 1 } }]);
    expect(willingness(p, ctx)).toBe(15000);
  });
  it("licence a stavba podle počtu stupňů", () => {
    expect(promiseValueShare({ kind: "coach_licence", params: { level: 3 } }, CTX)).toBeCloseTo(0.10, 9);
    expect(promiseValueShare({ kind: "stadium_upgrade", params: { facility: "stands", level: 3 } }, CTX)).toBeCloseTo(0.20, 9);
    expect(promiseValueShare({ kind: "stadium_upgrade", params: { facility: "toilets", level: 1 } }, CTX)).toBeCloseTo(0.05, 9);
  });
});

describe("requestCost", () => {
  it("měsíční podpora se počítá celá", () => {
    expect(requestCost(prop({ monthly: 5000 }), CTX)).toBeCloseTo(5000, 6);
  });
  it("podpisový příspěvek rozpočítaný na měsíce smlouvy", () => {
    expect(requestCost(prop({ signingBonus: 7442 }), CTX)).toBeCloseTo(1000, 0);
  });
  it("bonus za výhru podle očekávaných výher", () => {
    const expected = 500 * expectedWinsPerSeason(7, 14) / MONTHS_PER_SEASON;
    expect(requestCost(prop({ winBonus: 500 }), CTX)).toBeCloseTo(expected, 6);
    expect(expected).toBeCloseTo(1357.19, 1);
  });
  it("bonus za splnění: G × šance × počet sezón se slibem / měsíce", () => {
    const p = prop({ goalBonuses: { league_position: 2000 } }, 3, [{ kind: "league_position", params: { position: 7 } }]);
    expect(requestCost(p, CTX)).toBeCloseTo(179.17, 1);
  });
  it("stavba, vybavení a pokuta podle ceníku, rozpočítané", () => {
    expect(requestCost(prop({ construction: "toilets" }, 1), CTX)).toBeCloseTo(3225, 6);
    expect(requestCost(prop({ equipment: "balls" }, 1), CTX)).toBeCloseTo(8000 / MONTHS_PER_SEASON, 6);
    expect(requestCost(prop({ payCurrentFee: true }), CTX)).toBeCloseTo(1000, 0);
  });
});

describe("evaluateRound", () => {
  it("cena ≤ O: přijme", () => {
    expect(evaluateRound(prop({ monthly: 7000 }), CTX)).toEqual({ kind: "accept" });
  });
  it("do 115 % O bez přání: sníží nejdražší peněžní položku na O", () => {
    const r = evaluateRound(prop({ monthly: 7500 }), CTX);
    expect(r.kind).toBe("counter_money");
    if (r.kind === "counter_money") expect(r.counter.demands.monthly).toBe(7000);
  });
  it("ubírá nejdřív z nejdražší položky, ostatní nechá", () => {
    const r = evaluateRound(prop({ monthly: 6000, signingBonus: 11162 }), CTX);
    expect(r.kind).toBe("counter_money");
    if (r.kind === "counter_money") {
      expect(r.counter.demands.monthly).toBe(5500);
      expect(r.counter.demands.signingBonus).toBe(11162);
      expect(requestCost(r.counter, CTX)).toBeLessThanOrEqual(willingness(r.counter, CTX) + 1e-6);
    }
  });
  it("do 115 % O s nesplněným přáním: původní návrh výměnou za slib", () => {
    const ctx = { ...CTX, wishes: ["league_position" as const] };
    const r = evaluateRound(prop({ monthly: 7500 }), ctx);
    expect(r.kind).toBe("counter_wish");
    if (r.kind === "counter_wish") {
      expect(r.wish).toBe("league_position");
      expect(r.counter.promises).toEqual([{ kind: "league_position", params: { position: 7 } }]);
      expect(r.counter.demands.monthly).toBe(7500);
    }
  });
  it("sezónní přání u smlouvy na 1 sezónu nejde, zbývá sleva", () => {
    const ctx = { ...CTX, wishes: ["league_position" as const] };
    expect(evaluateRound(prop({ monthly: 7500 }, 1), ctx).kind).toBe("counter_money");
  });
  it("nad 115 % odmítne, nad 150 % se urazí", () => {
    expect(evaluateRound(prop({ monthly: 9000 }), CTX)).toEqual({ kind: "reject", insulted: false });
    expect(evaluateRound(prop({ monthly: 11000 }), CTX)).toEqual({ kind: "reject", insulted: true });
  });
  it("stavbu ani pokutu sponzor neubírá", () => {
    expect(reduceToWillingness(prop({ construction: "toilets" }, 1), CTX, 3000)).toBeNull();
  });
});

describe("buildPromiseRows", () => {
  const signDate = "2026-09-23T10:00:00.000Z";
  const p = prop({ monthly: 5000, goalBonuses: { league_position: 2000 } }, 3, [
    { kind: "league_position", params: { position: 7 } },
    { kind: "coach_licence", params: { level: 2 } },
    { kind: "sector_exclusivity", params: { sector: "pub" } },
  ]);
  const rows = buildPromiseRows(p, CTX, signDate);

  it("sezónní slib: řádek pro každou sezónu od příští", () => {
    const lp = rows.filter((r) => r.kind === "league_position");
    expect(lp.map((r) => r.season)).toEqual([4, 5]);
    expect(lp[0]).toMatchObject({ reward: 2000, penalty: 5581, deadlineGameDate: null, valueShare: 0.15 });
  });
  it("termínový slib: jeden řádek s termínem 112 herních dní", () => {
    const lic = rows.find((r) => r.kind === "coach_licence");
    expect(lic).toMatchObject({ season: null, deadlineGameDate: "2027-01-13T10:00:00.000Z", penalty: 1860, reward: 0 });
  });
  it("exkluzivita oboru: bez sezóny i termínu", () => {
    expect(rows.find((r) => r.kind === "sector_exclusivity")).toMatchObject({ season: null, deadlineGameDate: null });
  });
  it("smlouva na 1 sezónu: sezónní slib bez řádků", () => {
    expect(buildPromiseRows(prop({}, 1, [{ kind: "no_riots", params: {} }]), CTX, signDate)).toEqual([]);
  });
});

describe("earlyTerminationFee", () => {
  it("měsíčně × sezóny × 2 jako dřív", () => {
    expect(earlyTerminationFee(5000, 2)).toBe(20000);
  });
});
```

- [ ] **Step 2: Napsat test `proposal.test.ts`**

```ts
/**
 * Validace návrhu (anti-podvrh) a katalog slibů pro klienta.
 */
import { describe, expect, it } from "vitest";
import type { NegotiationContext } from "./negotiation";
import { constructionOptions, promiseCatalog, validateProposal } from "./proposal";

const CTX: NegotiationContext = {
  category: "main", personality: "fan", wishes: ["league_position"], budgetB: 10000, season: 3, leagueTeams: 14,
  expectedPosition: 7, cupTotalRounds: 7, lastAvgAttendance: 200, reputation: 50, licenceLevel: 1,
  sponsorType: "pub", sectorBannerActive: false,
  facilities: [
    { facility: "stands", currentLevel: 1, locked: false, costs: [0, 55000, 170000, 450000] },
    { facility: "roof", currentLevel: 0, locked: true, costs: [0, 30000, 90000, 230000] },
  ],
  equipment: [{ category: "balls", currentLevel: 1, nextLevel: 2, cost: 8000, locked: false }],
  currentTerminationFee: 0,
};

const ok = (raw: unknown) => validateProposal(raw, CTX);
const demands = { monthly: 6000, winBonus: 0, signingBonus: 0, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false };

describe("validateProposal", () => {
  it("platný návrh projde a parametry se očistí", () => {
    const r = ok({ seasons: 2, promises: [{ kind: "league_position", params: { position: 3, hack: 1 } }], demands });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.proposal.promises[0].params).toEqual({ position: 3 });
  });
  it("délka 1 až 3 sezóny", () => {
    expect(ok({ seasons: 4, promises: [], demands }).ok).toBe(false);
    expect(ok({ seasons: 1.5, promises: [], demands }).ok).toBe(false);
  });
  it("sezónní slib u smlouvy na 1 sezónu neprojde", () => {
    const r = ok({ seasons: 1, promises: [{ kind: "no_riots", params: {} }], demands });
    expect(r).toEqual({ ok: false, error: "Sezónní sliby platí až od příští sezóny, smlouva musí být aspoň na 2 sezóny" });
  });
  it("stejný druh slibu dvakrát neprojde", () => {
    const r = ok({ seasons: 2, promises: [{ kind: "no_riots", params: {} }, { kind: "no_riots", params: {} }], demands });
    expect(r.ok).toBe(false);
  });
  it("podvržené částky: záporné, necelé, přes strop", () => {
    expect(ok({ seasons: 2, promises: [], demands: { ...demands, monthly: -5 } }).ok).toBe(false);
    expect(ok({ seasons: 2, promises: [], demands: { ...demands, monthly: 100.5 } }).ok).toBe(false);
    expect(ok({ seasons: 2, promises: [], demands: { ...demands, monthly: 30001 } }).ok).toBe(false);
    expect(ok({ seasons: 2, promises: [], demands: { ...demands, signingBonus: 120001 } }).ok).toBe(false);
  });
  it("bonus za splnění jen u slíbeného druhu", () => {
    const r = ok({ seasons: 2, promises: [], demands: { ...demands, goalBonuses: { promotion: 1000 } } });
    expect(r.ok).toBe(false);
  });
  it("zamčená stavba neprojde, odemčená ano", () => {
    expect(ok({ seasons: 2, promises: [], demands: { ...demands, construction: "roof" } }).ok).toBe(false);
    expect(ok({ seasons: 2, promises: [], demands: { ...demands, construction: "stands" } }).ok).toBe(true);
  });
  it("stavbu nejde zaplatit i slíbit", () => {
    const r = ok({
      seasons: 2, promises: [{ kind: "stadium_upgrade", params: { facility: "stands", level: 3 } }],
      demands: { ...demands, construction: "stands" },
    });
    expect(r.ok).toBe(false);
  });
  it("logo na rukávu jen u stadionu, výpovědní pokuta jen když je co platit", () => {
    expect(ok({ seasons: 2, promises: [{ kind: "jersey_logo", params: {} }], demands }).ok).toBe(false);
    expect(ok({ seasons: 2, promises: [], demands: { ...demands, payCurrentFee: true } }).ok).toBe(false);
  });
  it("sponzor stadionu nedává bonus za výhru", () => {
    const r = validateProposal({ seasons: 2, promises: [], demands: { ...demands, winBonus: 500 } }, { ...CTX, category: "stadium" });
    expect(r.ok).toBe(false);
  });
  it("licence nad maximum a pod současnou neprojde", () => {
    expect(ok({ seasons: 2, promises: [{ kind: "coach_licence", params: { level: 5 } }], demands }).ok).toBe(false);
    expect(ok({ seasons: 2, promises: [{ kind: "coach_licence", params: { level: 1 } }], demands }).ok).toBe(false);
  });
});

describe("promiseCatalog", () => {
  const cat = promiseCatalog(CTX, 50);
  it("umístění pro všechna místa ligy, přání má vyšší hodnotu", () => {
    const lp = cat.filter((o) => o.kind === "league_position");
    expect(lp).toHaveLength(14);
    const seventh = lp.find((o) => o.params.position === 7)!;
    expect(seventh.value).toEqual({ low: 1856, high: 2644 });
    expect(seventh.seasonal).toBe(true);
  });
  it("bez loga na rukávu u hlavního sponzora, bez zamčené stavby", () => {
    expect(cat.some((o) => o.kind === "jersey_logo")).toBe(false);
    expect(cat.some((o) => o.kind === "stadium_upgrade" && o.params.facility === "roof")).toBe(false);
    expect(cat.filter((o) => o.kind === "stadium_upgrade").map((o) => o.params.level)).toEqual([2, 3]);
  });
  it("stavba zaplacená sponzorem: jen odemčená, o úroveň", () => {
    expect(constructionOptions(CTX)).toEqual([{ key: "stands", label: "Tribuny", level: 2, cost: 170000 }]);
  });
});
```

- [ ] **Step 3: Napsat test `negotiation-texts.test.ts`**

```ts
/**
 * Odpovědi majitele při jednání: každá povaha má text pro každý výsledek kola, bez dlouhé pomlčky.
 */
import { describe, expect, it } from "vitest";
import { OWNER_PERSONALITIES } from "./owners";
import { ownerResponse, RESPONSE_KINDS, WISH_ACCUSATIVE } from "./negotiation-texts";
import { PROMISE_KINDS } from "./promise-kinds";

describe("ownerResponse", () => {
  it("každá povaha a výsledek má neprázdný text bez dlouhé pomlčky", () => {
    for (const p of OWNER_PERSONALITIES) {
      for (const k of RESPONSE_KINDS) {
        for (let i = 0; i < 3; i++) {
          const t = ownerResponse(p, k, i, "youth");
          expect(t.length).toBeGreaterThan(5);
          expect(t).not.toContain("—");
          expect(t).not.toContain("{wish}");
        }
      }
    }
  });
  it("protinabídka za přání dosadí přání ve 4. pádě", () => {
    expect(ownerResponse("fan", "counter_wish", 0, "no_riots")).toContain(WISH_ACCUSATIVE.no_riots);
  });
  it("každý druh slibu má tvar ve 4. pádě", () => {
    for (const k of PROMISE_KINDS) expect(WISH_ACCUSATIVE[k].length).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 4: Spustit testy, musí selhat**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/negotiation.test.ts src/sponsors/proposal.test.ts src/sponsors/negotiation-texts.test.ts`
Expected: FAIL, tři soubory s `Failed to resolve import`.

- [ ] **Step 5: Napsat `negotiation.ts`**

```ts
/**
 * Jednání se sponzorem (etapa 2): ochota O, cena požadavků, vyhodnocení kola, trpělivost
 * a řádky slibů pro podpis. Čisté funkce bez DB. Rozpočet B počítá budget.ts (sponsorBudgetB).
 */
import { MAX_LICENCE } from "@okresni-masina/shared";
import { gameExpiry } from "../lib/game-time";
import {
  attendanceAmbition, cupRoundAmbition, expectedWinsPerSeason, leaguePositionAmbition, MONTHS_PER_SEASON,
  noRelegationAmbition, promotionAmbition, sponsorChance, TERM_PROMISE_CHANCE,
} from "./ambition";
import { clampFavor } from "./favor-math";
import type { OwnerPersonality } from "./owners";
import {
  BIG_FACILITIES, DEADLINE_KINDS, PROMISE_BASE_SHARE, PROMISE_DEADLINE_DAYS, SEASONAL_KINDS,
  type PromiseKind, type PromiseParams, type PromiseSpec,
} from "./promise-kinds";
import { kindAllowedForCategory, promiseInterest } from "./wishes";

export type NegotiationCategory = "main" | "stadium";

export const BASE_WILLINGNESS = 0.7;
export const WILLINGNESS_CAP = 1.5;
export const COUNTER_BAND = 1.15;
export const INSULT_BAND = 1.5;
export const INSULT_FAVOR = -3;
export const COOLDOWN_DAYS = 14;
export const NEGOTIATION_DAYS = 7;
export const MIN_SEASONS = 1;
export const MAX_SEASONS = 3;
export const CAUTIOUS_SEASON_BONUS = 0.05;
/** Tolerance porovnání cen v Kč (plovoucí čárka). */
const EPS = 1e-6;

/** Zařízení stadionu: současná úroveň, zámek dalšího stupně (getUpgradeOptions) a ceník. */
export interface FacilityOption { facility: string; currentLevel: number; locked: boolean; costs: readonly number[] }
export interface EquipmentOption { category: string; currentLevel: number; nextLevel: number; cost: number; locked: boolean }

/** Všechno, co server o klubu ví a co jednání potřebuje. Skládá ho negotiation-db.ts. */
export interface NegotiationContext {
  category: NegotiationCategory;
  personality: OwnerPersonality;
  wishes: PromiseKind[];
  budgetB: number;
  /** Aktuální sezóna (podpis). Sezónní sliby platí od season + 1. */
  season: number;
  leagueTeams: number;
  expectedPosition: number;
  cupTotalRounds: number;
  lastAvgAttendance: number;
  reputation: number;
  licenceLevel: number;
  sponsorType: string;
  /** Klub má aktivní banner stejného oboru, exkluzivitu oboru nejde slíbit. */
  sectorBannerActive: boolean;
  facilities: FacilityOption[];
  equipment: EquipmentOption[];
  /** Poměrná výpovědní pokuta u JINÉHO současného sponzora v kategorii (0 = není co platit). */
  currentTerminationFee: number;
}

export interface Demands {
  monthly: number;
  winBonus: number;
  signingBonus: number;
  goalBonuses: Partial<Record<PromiseKind, number>>;
  /** Zařízení stadionu, které sponzor zaplatí o úroveň výš. */
  construction: string | null;
  /** Kategorie vybavení (míče, dresy), kterou sponzor koupí o úroveň výš. */
  equipment: string | null;
  payCurrentFee: boolean;
}

export interface Proposal {
  seasons: number;
  promises: PromiseSpec[];
  demands: Demands;
}

export function initialPatience(favor: number): number {
  return 2 + Math.floor(clampFavor(favor) / 25);
}

export function afterReject(patience: number): { patience: number; walkedAway: boolean } {
  const next = Math.max(0, patience - 1);
  return { patience: next, walkedAway: next === 0 };
}

export function contractMonths(seasons: number): number {
  return seasons * MONTHS_PER_SEASON;
}

function facilityOf(ctx: NegotiationContext, facility: string | undefined): FacilityOption | null {
  return ctx.facilities.find((f) => f.facility === facility) ?? null;
}

export function promiseAmbition(p: PromiseSpec, ctx: NegotiationContext): number {
  switch (p.kind) {
    case "league_position": return leaguePositionAmbition(ctx.expectedPosition, p.params.position ?? ctx.expectedPosition, ctx.leagueTeams);
    case "promotion": return promotionAmbition(ctx.expectedPosition, ctx.leagueTeams);
    case "no_relegation": return noRelegationAmbition(ctx.expectedPosition, ctx.leagueTeams);
    case "cup_round": return cupRoundAmbition(p.params.round ?? 2, ctx.cupTotalRounds);
    case "attendance": return attendanceAmbition(p.params.attendance ?? ctx.lastAvgAttendance, ctx.lastAvgAttendance);
    default: return 1;
  }
}

/** Základ jako podíl B. Licence 5 % za stupeň, stavba 5 % (tribuny, osvětlení, střecha 10 %) za úroveň. */
export function promiseBaseShare(p: PromiseSpec, ctx: NegotiationContext): number {
  if (p.kind === "coach_licence") return 0.05 * Math.max(0, (p.params.level ?? 0) - ctx.licenceLevel);
  if (p.kind === "stadium_upgrade") {
    const steps = Math.max(0, (p.params.level ?? 0) - (facilityOf(ctx, p.params.facility)?.currentLevel ?? 0));
    return (BIG_FACILITIES.has(p.params.facility ?? "") ? 0.10 : 0.05) * steps;
  }
  return PROMISE_BASE_SHARE[p.kind];
}

export function promiseValueShare(p: PromiseSpec, ctx: NegotiationContext): number {
  return promiseBaseShare(p, ctx) * promiseInterest(p.kind, ctx.personality, ctx.wishes) * promiseAmbition(p, ctx);
}

/** Opatrný majitel ocení dlouhou smlouvu: +5 % za každou sezónu nad jednu. */
export function seasonMultiplier(personality: OwnerPersonality, seasons: number): number {
  return personality === "cautious" ? 1 + CAUTIOUS_SEASON_BONUS * (seasons - 1) : 1;
}

/** Ochota O (měsíčně): 0,7 × B + hodnota slibů, strop 1,5 × B. */
export function willingness(proposal: Proposal, ctx: NegotiationContext): number {
  const promised = proposal.promises.reduce((s, p) => s + promiseValueShare(p, ctx), 0);
  const raw = (BASE_WILLINGNESS + promised) * ctx.budgetB * seasonMultiplier(ctx.personality, proposal.seasons);
  return Math.min(raw, WILLINGNESS_CAP * ctx.budgetB);
}

export function promiseChance(p: PromiseSpec, ctx: NegotiationContext): number {
  return SEASONAL_KINDS.has(p.kind) ? sponsorChance(promiseAmbition(p, ctx)) : TERM_PROMISE_CHANCE;
}

/** Kolik řádků sponsor_promises slib založí: sezónní jeden za každou sezónu od příští. */
export function promiseRowCount(kind: PromiseKind, seasons: number): number {
  return SEASONAL_KINDS.has(kind) ? Math.max(0, seasons - 1) : 1;
}

/** Měsíční náklad sponzora na 1 Kč bonusu za výhru. */
export function winBonusFactor(ctx: NegotiationContext): number {
  return expectedWinsPerSeason(ctx.expectedPosition, ctx.leagueTeams) / MONTHS_PER_SEASON;
}

export function constructionCost(ctx: NegotiationContext, facility: string): number {
  const f = facilityOf(ctx, facility);
  return f ? f.costs[f.currentLevel + 1] ?? 0 : 0;
}

export function equipmentCost(ctx: NegotiationContext, category: string): number {
  return ctx.equipment.find((e) => e.category === category)?.cost ?? 0;
}

export type CostKey =
  | "monthly" | "winBonus" | "signingBonus" | "construction" | "equipment" | "currentFee" | `goal:${PromiseKind}`;

export interface CostItem {
  key: CostKey;
  /** Částka v požadavku (Kč). */
  amount: number;
  /** Měsíční náklad sponzora na 1 Kč částky. */
  perUnit: number;
  monthly: number;
  /** Peněžní položka, kterou sponzor při protinabídce smí ubrat. */
  reducible: boolean;
}

/** Cena požadavků pro sponzora jako měsíční ekvivalent za dobu smlouvy (spec, tabulka požadavků). */
export function costBreakdown(proposal: Proposal, ctx: NegotiationContext): CostItem[] {
  const m = contractMonths(proposal.seasons);
  const d = proposal.demands;
  const item = (key: CostKey, amount: number, perUnit: number, reducible: boolean): CostItem =>
    ({ key, amount, perUnit, monthly: amount * perUnit, reducible });
  const items: CostItem[] = [
    item("monthly", d.monthly, 1, true),
    item("winBonus", d.winBonus, winBonusFactor(ctx), true),
    item("signingBonus", d.signingBonus, 1 / m, true),
  ];
  for (const p of proposal.promises) {
    const g = d.goalBonuses[p.kind] ?? 0;
    if (g > 0) items.push(item(`goal:${p.kind}`, g, (promiseChance(p, ctx) * promiseRowCount(p.kind, proposal.seasons)) / m, true));
  }
  if (d.construction) items.push(item("construction", constructionCost(ctx, d.construction), 1 / m, false));
  if (d.equipment) items.push(item("equipment", equipmentCost(ctx, d.equipment), 1 / m, false));
  if (d.payCurrentFee) items.push(item("currentFee", ctx.currentTerminationFee, 1 / m, false));
  return items;
}

export function requestCost(proposal: Proposal, ctx: NegotiationContext): number {
  return costBreakdown(proposal, ctx).reduce((s, i) => s + i.monthly, 0);
}

function withAmount(d: Demands, key: CostKey, value: number): void {
  if (key === "monthly") d.monthly = value;
  else if (key === "winBonus") d.winBonus = value;
  else if (key === "signingBonus") d.signingBonus = value;
  else if (key.startsWith("goal:")) d.goalBonuses[key.slice(5) as PromiseKind] = value;
}

/**
 * Protinabídka „sleva": ubírá peněžní položky od nejdražší (po celých stovkách dolů),
 * dokud cena nesedne na O. Stavbu, vybavení a pokutu neubírá. null = nejde to.
 */
export function reduceToWillingness(proposal: Proposal, ctx: NegotiationContext, target: number): Proposal | null {
  let excess = requestCost(proposal, ctx) - target;
  const demands: Demands = { ...proposal.demands, goalBonuses: { ...proposal.demands.goalBonuses } };
  const items = costBreakdown(proposal, ctx)
    .filter((i) => i.reducible && i.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);
  for (const it of items) {
    if (excess <= EPS) break;
    // EPS: plovoucí čárka (0,7 × B = 6999,9999…) nesmí přidat stovku navíc.
    const cut = Math.min(it.amount, Math.ceil((excess / it.perUnit - EPS) / 100) * 100);
    const next = it.amount - cut;
    withAmount(demands, it.key, next);
    excess -= cut * it.perUnit;
  }
  if (excess > EPS) return null;
  return { ...proposal, demands };
}

/**
 * Slib, který majitel při protinabídce „za přání" navrhne sám. null = za této délky
 * smlouvy nebo stavu klubu slíbit nejde.
 */
export function defaultPromise(kind: PromiseKind, ctx: NegotiationContext, proposal: Proposal): PromiseSpec | null {
  if (SEASONAL_KINDS.has(kind) && proposal.seasons < 2) return null;
  if (!kindAllowedForCategory(kind, ctx.category)) return null;
  const spec = (params: PromiseParams): PromiseSpec => ({ kind, params });
  switch (kind) {
    case "league_position": return spec({ position: Math.max(1, ctx.expectedPosition) });
    case "promotion":
    case "no_relegation":
    case "no_riots":
    case "jersey_logo":
      return spec({});
    case "cup_round": return spec({ round: Math.min(ctx.cupTotalRounds, 3) });
    case "coach_licence": return ctx.licenceLevel >= MAX_LICENCE ? null : spec({ level: ctx.licenceLevel + 1 });
    case "stadium_upgrade": {
      const f = ctx.facilities
        .filter((x) => !x.locked && x.currentLevel < 3 && (x.costs[x.currentLevel + 1] ?? 0) > 0 && x.facility !== proposal.demands.construction)
        .sort((a, b) => a.costs[a.currentLevel + 1] - b.costs[b.currentLevel + 1] || a.facility.localeCompare(b.facility))[0];
      return f ? spec({ facility: f.facility, level: f.currentLevel + 1 }) : null;
    }
    case "sector_exclusivity": return ctx.sectorBannerActive ? null : spec({ sector: ctx.sponsorType });
    // Stejná hodnota jako položka „průměr" v katalogu (proposal.ts), aby ji klient našel.
    case "attendance": return spec({ attendance: Math.max(10, Math.round(Math.max(10, ctx.lastAvgAttendance) / 10) * 10) });
    case "youth": return spec({ count: 2 });
    case "reputation": return spec({ reputation: ctx.reputation });
  }
}

export type RoundOutcome =
  | { kind: "accept" }
  | { kind: "counter_money"; counter: Proposal }
  | { kind: "counter_wish"; counter: Proposal; wish: PromiseKind }
  | { kind: "reject"; insulted: boolean };

/** Kolo jednání podle specifikace: ≤ O přijme, do 1,15 O protinabídka, jinak odmítne (nad 1,5 O se urazí). */
export function evaluateRound(proposal: Proposal, ctx: NegotiationContext): RoundOutcome {
  const cost = requestCost(proposal, ctx);
  const o = willingness(proposal, ctx);
  if (cost <= o + EPS) return { kind: "accept" };
  if (cost <= COUNTER_BAND * o + EPS) {
    const promised = new Set(proposal.promises.map((p) => p.kind));
    for (const wish of ctx.wishes) {
      if (promised.has(wish)) continue;
      const extra = defaultPromise(wish, ctx, proposal);
      if (!extra) continue;
      const withWish: Proposal = { ...proposal, promises: [...proposal.promises, extra] };
      if (cost <= willingness(withWish, ctx) + EPS) return { kind: "counter_wish", counter: withWish, wish };
    }
    const reduced = reduceToWillingness(proposal, ctx, o);
    if (reduced) return { kind: "counter_money", counter: reduced };
  }
  return { kind: "reject", insulted: cost > INSULT_BAND * o };
}

/** Pokuta za nesplněný slib: value_share × B × měsíce sezóny (pevně při podpisu). */
export function promisePenalty(valueShare: number, budgetB: number): number {
  return Math.round(valueShare * budgetB * MONTHS_PER_SEASON);
}

/** Výpovědní pokuta nové smlouvy, stejný vzorec jako u dřívějších pevných nabídek. */
export function earlyTerminationFee(monthly: number, seasons: number): number {
  return Math.round(monthly * seasons * 2);
}

export interface PromiseRow {
  kind: PromiseKind;
  params: PromiseParams;
  season: number | null;
  deadlineGameDate: string | null;
  valueShare: number;
  reward: number;
  penalty: number;
}

/** Řádky sponsor_promises pro podpis: sezónní za každou sezónu od příští, termínové s termínem. */
export function buildPromiseRows(proposal: Proposal, ctx: NegotiationContext, signGameDate: string): PromiseRow[] {
  const rows: PromiseRow[] = [];
  for (const p of proposal.promises) {
    const valueShare = Math.round(promiseValueShare(p, ctx) * 10000) / 10000;
    const base = {
      kind: p.kind, params: p.params, valueShare,
      reward: proposal.demands.goalBonuses[p.kind] ?? 0,
      penalty: promisePenalty(valueShare, ctx.budgetB),
    };
    if (SEASONAL_KINDS.has(p.kind)) {
      for (let s = ctx.season + 1; s < ctx.season + proposal.seasons; s++) rows.push({ ...base, season: s, deadlineGameDate: null });
    } else if (DEADLINE_KINDS.has(p.kind)) {
      rows.push({ ...base, season: null, deadlineGameDate: gameExpiry(signGameDate, PROMISE_DEADLINE_DAYS) });
    } else {
      rows.push({ ...base, season: null, deadlineGameDate: null });
    }
  }
  return rows;
}

export interface SigningSummary {
  proposal: Proposal;
  rows: PromiseRow[];
  terminationFee: number;
  constructionCost: number;
  equipmentCost: number;
  currentFee: number;
}

/** Shrnutí před podpisem: všechny sliby s pokutou a odměnou, platby a výpovědní pokuta nové smlouvy. */
export function signingSummary(proposal: Proposal, ctx: NegotiationContext, signGameDate: string): SigningSummary {
  const d = proposal.demands;
  return {
    proposal,
    rows: buildPromiseRows(proposal, ctx, signGameDate),
    terminationFee: earlyTerminationFee(d.monthly, proposal.seasons),
    constructionCost: d.construction ? constructionCost(ctx, d.construction) : 0,
    equipmentCost: d.equipment ? equipmentCost(ctx, d.equipment) : 0,
    currentFee: d.payCurrentFee ? ctx.currentTerminationFee : 0,
  };
}
```

- [ ] **Step 6: Napsat `proposal.ts`**

```ts
/**
 * Návrh klubu při jednání: validace (klient smí poslat jen tvar, čísla ověří server)
 * a katalog slibů a darů, který klient vidí. Hodnoty slibů klient dostává jen jako
 * rozmezí podle náklonnosti, stejně jako odhad rozpočtu.
 */
import { licenceLabel, MAX_LICENCE } from "@okresni-masina/shared";
import { roundName } from "../cup/cup";
import { CATEGORY_LABELS } from "../equipment/equipment-generator";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import { budgetEstimateRange } from "./budget";
import {
  MAX_SEASONS, MIN_SEASONS, promiseChance, promisePenalty, promiseValueShare,
  type Demands, type NegotiationContext, type Proposal,
} from "./negotiation";
import {
  EQUIPMENT_GIFTS, isPromiseKind, SEASONAL_KINDS, type PromiseKind, type PromiseParams, type PromiseSpec,
} from "./promise-kinds";
import { kindAllowedForCategory } from "./wishes";

export const MAX_PROMISES = 8;

type Result = { ok: true; proposal: Proposal } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

function int(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

function money(v: unknown, max: number): number | null {
  const n = int(v ?? 0);
  return n !== null && n >= 0 && n <= max ? n : null;
}

function openFacility(ctx: NegotiationContext, key: unknown) {
  return ctx.facilities.find((f) => f.facility === key && !f.locked && f.currentLevel < 3) ?? null;
}

/** Očištěný slib (jen povolené parametry), nebo český důvod, proč neprojde. */
function sanitizePromise(raw: unknown, ctx: NegotiationContext, seasons: number): PromiseSpec | string {
  if (!raw || typeof raw !== "object") return "Neplatný slib";
  const r = raw as { kind?: unknown; params?: Record<string, unknown> };
  if (!isPromiseKind(r.kind)) return "Neznámý druh slibu";
  const kind: PromiseKind = r.kind;
  const p = r.params ?? {};
  if (!kindAllowedForCategory(kind, ctx.category)) return "Logo na rukávu jde slíbit jen sponzorovi stadionu";
  if (SEASONAL_KINDS.has(kind) && seasons < 2) return "Sezónní sliby platí až od příští sezóny, smlouva musí být aspoň na 2 sezóny";
  const spec = (params: PromiseParams): PromiseSpec => ({ kind, params });
  switch (kind) {
    case "league_position": {
      const position = int(p.position);
      return position !== null && position >= 1 && position <= ctx.leagueTeams ? spec({ position }) : "Neplatné místo v tabulce";
    }
    case "promotion":
    case "no_relegation":
    case "no_riots":
    case "jersey_logo":
      return spec({});
    case "cup_round": {
      const round = int(p.round);
      return round !== null && round >= 2 && round <= ctx.cupTotalRounds ? spec({ round }) : "Neplatné kolo poháru";
    }
    case "coach_licence": {
      const level = int(p.level);
      return level !== null && level > ctx.licenceLevel && level <= MAX_LICENCE ? spec({ level }) : "Neplatná licence";
    }
    case "stadium_upgrade": {
      const f = openFacility(ctx, p.facility);
      const level = int(p.level);
      if (!f || level === null || level <= f.currentLevel || level > 3 || (f.costs[level] ?? 0) <= 0) return "Tuhle stavbu teď slíbit nejde";
      return spec({ facility: f.facility, level });
    }
    case "sector_exclusivity":
      if (ctx.sectorBannerActive) return "Máš banner firmy ze stejného oboru, exkluzivitu slíbit nejde";
      return spec({ sector: ctx.sponsorType });
    case "attendance": {
      const attendance = int(p.attendance);
      const min = Math.max(1, Math.round(ctx.lastAvgAttendance * 0.5));
      return attendance !== null && attendance >= min && attendance <= 5000 ? spec({ attendance }) : "Neplatná návštěva";
    }
    case "youth": {
      const count = int(p.count);
      return count !== null && count >= 1 && count <= 4 ? spec({ count }) : "Neplatný počet mladých hráčů";
    }
    case "reputation": {
      const reputation = int(p.reputation);
      return reputation !== null && reputation >= 1 && reputation <= 100 ? spec({ reputation }) : "Neplatná reputace";
    }
  }
}

export function validateProposal(raw: unknown, ctx: NegotiationContext): Result {
  if (!raw || typeof raw !== "object") return fail("Neplatný návrh");
  const r = raw as { seasons?: unknown; promises?: unknown; demands?: unknown };
  const seasons = int(r.seasons);
  if (seasons === null || seasons < MIN_SEASONS || seasons > MAX_SEASONS) return fail("Délka smlouvy musí být 1 až 3 sezóny");
  if (!Array.isArray(r.promises) || r.promises.length > MAX_PROMISES) return fail("Neplatné sliby");

  const promises: PromiseSpec[] = [];
  const seen = new Set<PromiseKind>();
  for (const rp of r.promises) {
    const p = sanitizePromise(rp, ctx, seasons);
    if (typeof p === "string") return fail(p);
    if (seen.has(p.kind)) return fail("Každý druh slibu jde dát jen jednou");
    seen.add(p.kind);
    promises.push(p);
  }

  if (!r.demands || typeof r.demands !== "object") return fail("Chybí požadavky");
  const d = r.demands as Record<string, unknown>;
  const b = ctx.budgetB;
  const monthly = money(d.monthly, 3 * b);
  if (monthly === null || monthly <= 0) return fail("Měsíční podpora musí být kladná a v rozumné výši");
  const winBonus = money(d.winBonus, b);
  if (winBonus === null || (ctx.category === "stadium" && winBonus > 0)) return fail("Neplatný bonus za výhru");
  const signingBonus = money(d.signingBonus, 12 * b);
  if (signingBonus === null) return fail("Neplatný příspěvek za podpis");

  const goalBonuses: Partial<Record<PromiseKind, number>> = {};
  const rawGoals = d.goalBonuses ?? {};
  if (typeof rawGoals !== "object" || rawGoals === null) return fail("Neplatné bonusy za splnění");
  for (const [k, v] of Object.entries(rawGoals as Record<string, unknown>)) {
    if (!isPromiseKind(k) || !seen.has(k)) return fail("Bonus za splnění jde jen ke slíbenému cíli");
    const g = money(v, 3 * b);
    if (g === null) return fail("Neplatný bonus za splnění");
    if (g > 0) goalBonuses[k] = g;
  }

  let construction: string | null = null;
  if (d.construction !== null && d.construction !== undefined) {
    const f = openFacility(ctx, d.construction);
    if (!f || (f.costs[f.currentLevel + 1] ?? 0) <= 0) return fail("Tuhle stavbu teď sponzor zaplatit nemůže");
    if (promises.some((p) => p.kind === "stadium_upgrade" && p.params.facility === f.facility)) {
      return fail("Stejnou stavbu nejde slíbit a zároveň chtít zaplatit");
    }
    construction = f.facility;
  }

  let equipment: string | null = null;
  if (d.equipment !== null && d.equipment !== undefined) {
    const e = ctx.equipment.find((x) => x.category === d.equipment && !x.locked);
    if (!e || !EQUIPMENT_GIFTS.includes(e.category)) return fail("Tohle vybavení teď sponzor koupit nemůže");
    equipment = e.category;
  }

  if (typeof (d.payCurrentFee ?? false) !== "boolean") return fail("Neplatný požadavek na výpovědní pokutu");
  const payCurrentFee = d.payCurrentFee === true;
  if (payCurrentFee && ctx.currentTerminationFee <= 0) return fail("Není žádná výpovědní pokuta, kterou by šlo zaplatit");

  const demands: Demands = { monthly, winBonus, signingBonus, goalBonuses, construction, equipment, payCurrentFee };
  return { ok: true, proposal: { seasons, promises, demands } };
}

function hracu(n: number): string {
  return n === 1 ? "hráč" : n <= 4 ? "hráči" : "hráčů";
}

/** Popisek konkrétního slibu pro hráče, bez dlouhé pomlčky. */
export function promiseLabel(s: PromiseSpec, ctx: NegotiationContext): string {
  const p = s.params;
  switch (s.kind) {
    case "league_position": return `skončit do ${p.position}. místa`;
    case "promotion": return "postup, 1. nebo 2. místo";
    case "no_relegation": return "nesestoupit";
    case "cup_round": return `v poháru aspoň ${roundName(p.round ?? 2, ctx.cupTotalRounds).toLowerCase()}`;
    case "coach_licence": return `trenér s licencí ${licenceLabel(p.level ?? 1)}`;
    case "stadium_upgrade": return `${FACILITY_LABELS[p.facility ?? ""] ?? p.facility} na úroveň ${p.level}`;
    case "jersey_logo": return "logo na rukávu dresu";
    case "sector_exclusivity": return "žádný banner firmy ze stejného oboru";
    case "attendance": return `průměrně aspoň ${p.attendance} diváků doma`;
    case "youth": return `průměrně ${p.count} ${hracu(p.count ?? 0)} do 21 let v sestavě`;
    case "reputation": return `reputace aspoň ${p.reputation} na konci sezóny`;
    case "no_riots": return "žádná výtržnost fanoušků";
  }
}

export interface Range { low: number; high: number }

export interface PromiseOption {
  kind: PromiseKind;
  params: PromiseParams;
  label: string;
  seasonal: boolean;
  /** Přínos k ochotě v Kč měsíčně, jako rozmezí podle náklonnosti. */
  value: Range;
  /** Pokuta za nesplnění (za každou sezónu u sezónních), jako rozmezí. */
  penalty: Range;
  /** Šance, kterou sponzor slibu dává (pro náhled ceny bonusu za splnění). */
  chance: number;
}

export interface GiftOption { key: string; label: string; level: number; cost: number }

function candidates(ctx: NegotiationContext): PromiseSpec[] {
  const out: PromiseSpec[] = [];
  for (let position = 1; position <= ctx.leagueTeams; position++) out.push({ kind: "league_position", params: { position } });
  out.push({ kind: "promotion", params: {} }, { kind: "no_relegation", params: {} });
  for (let round = 2; round <= ctx.cupTotalRounds; round++) out.push({ kind: "cup_round", params: { round } });
  for (let level = ctx.licenceLevel + 1; level <= MAX_LICENCE; level++) out.push({ kind: "coach_licence", params: { level } });
  for (const f of ctx.facilities) {
    if (f.locked) continue;
    for (let level = f.currentLevel + 1; level <= 3; level++) {
      if ((f.costs[level] ?? 0) > 0) out.push({ kind: "stadium_upgrade", params: { facility: f.facility, level } });
    }
  }
  if (ctx.category === "stadium") out.push({ kind: "jersey_logo", params: {} });
  if (!ctx.sectorBannerActive) out.push({ kind: "sector_exclusivity", params: { sector: ctx.sponsorType } });
  const avg = Math.max(10, ctx.lastAvgAttendance);
  const seenAttendance = new Set<number>();
  for (const mult of [0.9, 1, 1.1, 1.25, 1.5]) {
    const attendance = Math.max(10, Math.round((avg * mult) / 10) * 10);
    if (seenAttendance.has(attendance)) continue;
    seenAttendance.add(attendance);
    out.push({ kind: "attendance", params: { attendance } });
  }
  for (let count = 1; count <= 4; count++) out.push({ kind: "youth", params: { count } });
  for (const plus of [0, 5, 10, 15]) {
    const reputation = Math.min(100, ctx.reputation + plus);
    if (plus === 0 || reputation > ctx.reputation) out.push({ kind: "reputation", params: { reputation } });
  }
  out.push({ kind: "no_riots", params: {} });
  return out;
}

/** Všechny sliby, které klub může dát, s rozmezím přínosu a pokuty. */
export function promiseCatalog(ctx: NegotiationContext, favor: number): PromiseOption[] {
  return candidates(ctx).map((spec) => {
    const share = promiseValueShare(spec, ctx);
    return {
      kind: spec.kind,
      params: spec.params,
      label: promiseLabel(spec, ctx),
      seasonal: SEASONAL_KINDS.has(spec.kind),
      value: budgetEstimateRange(share * ctx.budgetB, favor),
      penalty: budgetEstimateRange(promisePenalty(share, ctx.budgetB), favor),
      chance: Math.round(promiseChance(spec, ctx) * 100) / 100,
    };
  });
}

/** Stavby, které může sponzor zaplatit: odemčené zařízení o jednu úroveň. */
export function constructionOptions(ctx: NegotiationContext): GiftOption[] {
  return ctx.facilities
    .filter((f) => !f.locked && f.currentLevel < 3 && (f.costs[f.currentLevel + 1] ?? 0) > 0)
    .map((f) => ({ key: f.facility, label: FACILITY_LABELS[f.facility] ?? f.facility, level: f.currentLevel + 1, cost: f.costs[f.currentLevel + 1] }));
}

/** Vybavení (míče, dresy) o úroveň výš, když je další úroveň odemčená. */
export function equipmentOptions(ctx: NegotiationContext): GiftOption[] {
  return ctx.equipment
    .filter((e) => !e.locked && EQUIPMENT_GIFTS.includes(e.category))
    .map((e) => ({ key: e.category, label: CATEGORY_LABELS[e.category] ?? e.category, level: e.nextLevel, cost: e.cost }));
}
```

Pozn. k testu katalogu: sedmé místo s přáním (0,15 × 1,5 × 1 × 10 000 = 2 250 Kč) při náklonnosti 50 (šířka 17,5 %) = `{ low: 1856, high: 2644 }` (2 250 × 0,825 = 1 856,25; 2 250 × 1,175 = 2 643,75, daleko od zaokrouhlovací hranice).

- [ ] **Step 7: Napsat `negotiation-texts.ts`**

```ts
/**
 * Odpovědi majitele firmy v kole jednání. Fanoušek a patriot tykají, obchodník a opatrný
 * vykají (stejně jako SMS majitelů). Majitelé jsou muži (generateSponsorOwner). Žádná dlouhá pomlčka.
 */
import type { OwnerPersonality } from "./owners";
import type { PromiseKind } from "./promise-kinds";

export const RESPONSE_KINDS = ["accept", "counter_money", "counter_wish", "reject", "insulted", "walked_away"] as const;
export type ResponseKind = (typeof RESPONSE_KINDS)[number];

/** Přání ve 4. pádě pro větu „slib mi …" / „přidejte …". */
export const WISH_ACCUSATIVE: Record<PromiseKind, string> = {
  league_position: "slušné umístění v lize",
  promotion: "postup",
  no_relegation: "záchranu v soutěži",
  cup_round: "pořádnou jízdu v poháru",
  coach_licence: "vyšší trenérskou licenci",
  stadium_upgrade: "modernizaci stadionu",
  jersey_logo: "logo na rukávu dresu",
  sector_exclusivity: "exkluzivitu mého oboru",
  attendance: "plný stadion",
  youth: "víc mladých kluků v sestavě",
  reputation: "dobré jméno klubu",
  no_riots: "klid na tribunách",
};

const TEXTS: Record<OwnerPersonality, Record<ResponseKind, readonly string[]>> = {
  patriot: {
    accept: ["Plácneme si. Pro naše kluky rád.", "Beru. Ať je to vidět na hřišti i v hospodě."],
    counter_money: ["Tolik ti dát nemůžu. Takhle to jde, co ty na to?", "Trochu jsem to přitáhl, víc firma neunese."],
    counter_wish: ["Dám ti, co chceš, když mi slíbíš {wish}.", "Tvůj návrh beru, jen přidej {wish}. To je pro mě srdcovka."],
    reject: ["Tohle nepůjde, jsme malá firma.", "Takhle ne. Zkus to přepočítat."],
    insulted: ["Děláš si ze mě legraci? Takové peníze nemám.", "Tohle mě urazilo. Myslel jsem, že si rozumíme."],
    walked_away: ["Dost. Teď se mi chvíli neozývej.", "Nechme toho, za pár týdnů možná."],
  },
  businessman: {
    accept: ["Dohodnuto. Připravím smlouvu.", "Čísla sedí, jdeme do toho."],
    counter_money: ["Tohle je můj strop. Upravil jsem to, podívejte se.", "V téhle podobě to neprojde. Posílám upravenou verzi."],
    counter_wish: ["Návrh přijmu, pokud k němu přidáte {wish}.", "Za {wish} vám to podepíšu tak, jak to je."],
    reject: ["Tohle se mi nevyplatí.", "Na tyhle podmínky nemám rozpočet."],
    insulted: ["Takovou nabídku nemůžu brát vážně.", "S tímhle za mnou příště nechoďte."],
    walked_away: ["Myslím, že jsme skončili. Ozvěte se za pár týdnů.", "Tady se neshodneme. Odložíme to."],
  },
  fan: {
    accept: ["Jasně, beru! Ať to lítá.", "Plácnem si, na tohle jsem čekal."],
    counter_money: ["Tolik ne. Takhle to dám.", "Kousek jsem ubral, víc to nejde."],
    counter_wish: ["Beru, ale slib mi {wish}. Chci vidět výsledky.", "Dám ti to celé, když přidáš {wish}."],
    reject: ["To je moc i na mě.", "Tohle nedám, přepočítej to."],
    insulted: ["To snad nemyslíš vážně.", "Po tomhle mě chvíli nezvi ani na pivo."],
    walked_away: ["Mám toho dost. Ozvi se za pár týdnů.", "Končím. Za čas uvidíme."],
  },
  cautious: {
    accept: ["Dobře. S tímhle můžu v klidu spát.", "Souhlasím, podmínky jsou rozumné."],
    counter_money: ["Tolik riskovat nechci. Navrhuji tohle.", "Takhle je to pro mě přijatelné."],
    counter_wish: ["Přijmu to, když mi zaručíte {wish}.", "Potřebuji jistotu. Přidejte {wish} a podepíšu."],
    reject: ["To je pro mě moc velké riziko.", "Na tohle nemohu přistoupit."],
    insulted: ["To je nepřiměřené. Jsem zklamaný.", "Takhle se jednat nedá."],
    walked_away: ["Raději to na čas uzavřeme.", "Teď ne. Zkusíme to jindy."],
  },
};

export function ownerResponse(
  personality: OwnerPersonality, kind: ResponseKind, roundIndex: number, wish?: PromiseKind,
): string {
  const pool = TEXTS[personality][kind];
  const text = pool[Math.abs(roundIndex) % pool.length];
  return text.replace("{wish}", wish ? WISH_ACCUSATIVE[wish] : "něco navíc");
}
```

- [ ] **Step 8: Spustit testy, musí projít**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/negotiation.test.ts src/sponsors/proposal.test.ts src/sponsors/negotiation-texts.test.ts`
Expected: PASS, 3 soubory, `Tests  41 passed` (24 + 14 + 3).

- [ ] **Step 9: Typecheck**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx tsc --noEmit`
Expected: bez chyb. (`switch` v `sanitizePromise`, `defaultPromise` a `promiseLabel` je vyčerpávající přes `PromiseKind`; kdyby TS hlásil „Not all code paths return a value", doplnit na konec `return null` / `return "Neznámý druh slibu"` / `return s.kind`.)

- [ ] **Step 10: Commit**

```bash
cd /Users/savrik/Projects/fmko
git add apps/api/src/sponsors/negotiation.ts apps/api/src/sponsors/negotiation.test.ts apps/api/src/sponsors/proposal.ts apps/api/src/sponsors/proposal.test.ts apps/api/src/sponsors/negotiation-texts.ts apps/api/src/sponsors/negotiation-texts.test.ts
git commit -m "$(cat <<'EOF'
feat(sponzori): matematika jednani, validace navrhu, katalog slibu a odpovedi majitele

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: DB vrstva jednání, důvod v deníku a úklid v rolloveru (s testy)

**Files:**
- Create: `apps/api/src/sponsors/negotiation-db.ts`
- Test: `apps/api/src/sponsors/negotiation-db.test.ts`
- Modify: `apps/api/src/sponsors/favor-math.ts` (`FAVOR_REASONS`)
- Modify: `apps/api/src/season/season-rollover.ts` (krok 4b a 4b-sms)

**Interfaces:**
- Consumes: Task 4 (vše z `negotiation.ts`, `proposal.ts`, `ResponseKind`), Task 3 (`ownerWishes`), `sponsorBudgetB`, `budgetEstimateRange` (`./budget`), `mainSponsorBlock` (`./exclusivity`), `ensureSponsorOwner`, `getFavor`, `SponsorOwner` (`./favor`), `gameExpiry`, `isGameExpired`, `mustSeason`, `getUpgradeOptions`, `UPGRADE_COSTS`, `FACILITY_LABELS` (stadion), `getUpgradeOptions`, `CATEGORIES` (vybavení), `FalesnaD1`, `jakoD1` (`../incidents/testovaci-d1`).
- Produces:
  - `type NegotiationStatus`, `interface RoundResponse { kind; text; counter?; wish?; gameDate }`, `interface NegotiationRound { proposal; response }`, `interface Negotiation`, `parseNegotiation(row)`.
  - `interface NegotiationTeam`, `loadNegotiationTeam(db, teamId)`, `interface NegotiationSponsor`, `loadNegotiationSponsor(db, sponsorId)`, `teamGameDate(team)`, `activeSeason(db)`.
  - `interface ContractRow`, `categoryContracts(db, teamId, category)`, `isRenewalOf(contracts, sponsorId)`, `prorataTerminationFee(contract)`, `contractBlock(db, team, sponsor, category, season, contracts)`.
  - `findActiveNegotiation(db, teamId, sponsorId, category, gameDate)`, `cooldownUntil(db, teamId, sponsorId, gameDate)`, `interface NegotiationAvailability`, `negotiationAvailability(db, team, sponsor, category, season)`.
  - `buildNegotiationContext(db, { team, sponsor, category, season, personality, wishes, budgetB })`.
  - `openNegotiation(db, teamId, sponsorId, category): { ok: true; id } | Fail`, `type Fail = { error; status: 400 | 404 | 409 | 410 }`.
  - `interface NegotiationState`, `loadNegotiationState(db, teamId, negotiationId): NegotiationState | Fail`, `pendingTerms(neg)`, `saveRound(db, neg, round, next)`, `closeNegotiationsForRollover(db)`, `interface NegotiationListItem`, `listTeamNegotiations(db, teamId)`, `interface NegotiationView`, `negotiationView(state)`.
  - `FAVOR_REASONS.negotiationInsult = "urazil se nabídkou při jednání"`.

- [ ] **Step 1: Napsat test `negotiation-db.test.ts`**

```ts
/**
 * DB vrstva jednání nad falešnou D1: kolo se zapisuje s optimistickým zámkem, expirace
 * a cooldown jedou v herním čase, rollover jednání uzavře.
 */
import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import {
  closeNegotiationsForRollover, cooldownUntil, findActiveNegotiation, parseNegotiation, pendingTerms, saveRound,
  type NegotiationRound,
} from "./negotiation-db";
import type { Proposal } from "./negotiation";

const PROPOSAL: Proposal = {
  seasons: 2, promises: [],
  demands: { monthly: 5000, winBonus: 0, signingBonus: 0, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false },
};

const ROW = {
  id: "n1", team_id: "t1", sponsor_id: 7, category: "main" as const, wishes: '["youth","attendance"]', budget_b: 10000,
  patience: 3, rounds: "[]", status: "open" as const, expires_game_date: "2026-09-30T00:00:00.000Z",
  cooldown_until: null, created_at: "2026-09-23 10:00:00",
};

function round(kind: NegotiationRound["response"]["kind"], counter?: Proposal): NegotiationRound {
  return { proposal: PROPOSAL, response: { kind, text: "x", gameDate: "2026-09-24T00:00:00.000Z", ...(counter ? { counter } : {}) } };
}

describe("parseNegotiation", () => {
  it("převede řádek, neznámá přání zahodí", () => {
    const n = parseNegotiation({ ...ROW, wishes: '["youth","nesmysl"]' });
    expect(n.wishes).toEqual(["youth"]);
    expect(n.rounds).toEqual([]);
    expect(n.roundsRaw).toBe("[]");
  });
});

describe("pendingTerms", () => {
  it("přijatý návrh: podepisuje se poslední návrh klubu", () => {
    const n = { ...parseNegotiation(ROW), status: "accepted" as const, rounds: [round("accept")] };
    expect(pendingTerms(n)).toEqual(PROPOSAL);
  });
  it("otevřené s protinabídkou: podepisuje se protinabídka", () => {
    const counter = { ...PROPOSAL, demands: { ...PROPOSAL.demands, monthly: 4500 } };
    const n = { ...parseNegotiation(ROW), rounds: [round("counter_money", counter)] };
    expect(pendingTerms(n)).toEqual(counter);
  });
  it("po odmítnutí není co podepsat", () => {
    const n = { ...parseNegotiation(ROW), rounds: [round("reject")] };
    expect(pendingTerms(n)).toBeNull();
  });
});

describe("saveRound", () => {
  it("zapisuje s podmínkou na původní kola a stav open", async () => {
    const db = new FalesnaD1([{ sql: /UPDATE sponsor_negotiations SET rounds/, changes: 1 }]);
    const ok = await saveRound(jakoD1(db), parseNegotiation(ROW), round("reject"), { status: "open", patience: 2, cooldownUntil: null });
    expect(ok).toBe(true);
    const q = db.dotazy.find((d) => /UPDATE sponsor_negotiations SET rounds/.test(d.sql))!;
    expect(q.sql).toContain("status = 'open' AND rounds = ?");
    expect(q.params[1]).toBe("open");
    expect(q.params[2]).toBe(2);
    expect(q.params[4]).toBe("n1");
    expect(q.params[5]).toBe("[]");
  });
  it("souběžný návrh prohraje zámek", async () => {
    const db = new FalesnaD1([{ sql: /UPDATE sponsor_negotiations SET rounds/, changes: 0 }]);
    expect(await saveRound(jakoD1(db), parseNegotiation(ROW), round("reject"), { status: "open", patience: 2, cooldownUntil: null })).toBe(false);
  });
});

describe("findActiveNegotiation", () => {
  it("prošlé jednání (herní čas) se označí expired a nevrátí se", async () => {
    const db = new FalesnaD1([{ sql: /FROM sponsor_negotiations WHERE team_id = \? AND sponsor_id = \? AND category/, first: ROW }]);
    const n = await findActiveNegotiation(jakoD1(db), "t1", 7, "main", "2026-10-02T00:00:00.000Z");
    expect(n).toBeNull();
    expect(db.pocet(/SET status = 'expired' WHERE id = \?/)).toBe(1);
  });
});

describe("cooldownUntil", () => {
  it("platí do data v herním čase", async () => {
    const db = new FalesnaD1([{ sql: /MAX\(cooldown_until\)/, first: { c: "2026-10-07T00:00:00.000Z" } }]);
    expect(await cooldownUntil(jakoD1(db), "t1", 7, "2026-10-01T00:00:00.000Z")).toBe("2026-10-07T00:00:00.000Z");
    expect(await cooldownUntil(jakoD1(db), "t1", 7, "2026-10-08T00:00:00.000Z")).toBeNull();
  });
});

describe("closeNegotiationsForRollover", () => {
  it("uzavře otevřená a přijatá jednání a smaže cooldowny", async () => {
    const db = new FalesnaD1();
    await closeNegotiationsForRollover(jakoD1(db));
    expect(db.davky).toHaveLength(1);
    expect(db.davky[0][0].sql).toContain("SET status = 'expired' WHERE status IN ('open','accepted')");
    expect(db.davky[0][1].sql).toContain("SET cooldown_until = NULL");
  });
});
```

- [ ] **Step 2: Spustit test, musí selhat**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/negotiation-db.test.ts`
Expected: FAIL, `Failed to resolve import "./negotiation-db"`.

- [ ] **Step 3: Napsat `negotiation-db.ts`**

```ts
/**
 * Jednání se sponzorem: DB vrstva. Skládá kontext klubu pro čistou matematiku (negotiation.ts),
 * hlídá, jestli jde s firmou jednat (okres, exkluzivita hlavního sponzora, limit změny, okno
 * prodloužení, cooldown), expiruje v herním čase, zapisuje kola s optimistickým zámkem
 * a skládá pohled pro klienta. Podpis je v signing.ts.
 */
import { logger } from "../lib/logger";
import { gameExpiry, isGameExpired } from "../lib/game-time";
import { mustSeason } from "../lib/season";
import { CATEGORIES, getUpgradeOptions as equipmentUpgradeOptions } from "../equipment/equipment-generator";
import { FACILITY_LABELS, getUpgradeOptions as stadiumUpgradeOptions, UPGRADE_COSTS } from "../stadium/stadium-generator";
import { DEFAULT_CUP_ROUNDS, expectedPosition, MONTHS_PER_SEASON } from "./ambition";
import { budgetEstimateRange, sponsorBudgetB } from "./budget";
import { mainSponsorBlock } from "./exclusivity";
import { ensureSponsorOwner, getFavor, type SponsorOwner } from "./favor";
import {
  BASE_WILLINGNESS, CAUTIOUS_SEASON_BONUS, initialPatience, NEGOTIATION_DAYS, signingSummary, WILLINGNESS_CAP, winBonusFactor,
  type EquipmentOption, type FacilityOption, type NegotiationCategory, type NegotiationContext, type Proposal,
} from "./negotiation";
import type { ResponseKind } from "./negotiation-texts";
import type { OwnerPersonality } from "./owners";
import { EQUIPMENT_GIFTS, isPromiseKind, type PromiseKind, type PromiseParams } from "./promise-kinds";
import {
  constructionOptions, equipmentOptions, promiseCatalog, promiseLabel, type GiftOption, type PromiseOption, type Range,
} from "./proposal";
import { ownerWishes } from "./wishes";

/** Návštěva, když klub ještě žádný domácí zápas s diváky nemá. */
const DEFAULT_ATTENDANCE = 100;

export type NegotiationStatus = "open" | "accepted" | "walked_away" | "expired" | "signed";

export interface RoundResponse {
  kind: ResponseKind;
  text: string;
  counter?: Proposal;
  wish?: PromiseKind;
  gameDate: string;
}

export interface NegotiationRound {
  proposal: Proposal;
  response: RoundResponse;
}

interface NegotiationRow {
  id: string; team_id: string; sponsor_id: number; category: NegotiationCategory; wishes: string; budget_b: number;
  patience: number; rounds: string; status: NegotiationStatus; expires_game_date: string; cooldown_until: string | null;
  created_at: string;
}

export interface Negotiation {
  id: string;
  teamId: string;
  sponsorId: number;
  category: NegotiationCategory;
  wishes: PromiseKind[];
  budgetB: number;
  patience: number;
  rounds: NegotiationRound[];
  /** Přesně to, co je v DB: podmínka optimistického zámku při zápisu kola a podpisu. */
  roundsRaw: string;
  status: NegotiationStatus;
  expiresGameDate: string;
  cooldownUntil: string | null;
}

function parseJson<T>(raw: string, what: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    logger.warn({ module: "sponsors" }, `neplatný JSON: ${what}`, e);
    return fallback;
  }
}

export function parseNegotiation(r: NegotiationRow): Negotiation {
  const wishes = parseJson<unknown[]>(r.wishes, `přání jednání ${r.id}`, []).filter(isPromiseKind);
  return {
    id: r.id, teamId: r.team_id, sponsorId: r.sponsor_id, category: r.category, wishes, budgetB: r.budget_b,
    patience: r.patience, rounds: parseJson<NegotiationRound[]>(r.rounds, `kola jednání ${r.id}`, []), roundsRaw: r.rounds,
    status: r.status, expiresGameDate: r.expires_game_date, cooldownUntil: r.cooldown_until,
  };
}

export interface NegotiationTeam {
  id: string; name: string; reputation: number; budget: number; league_id: string | null; game_date: string | null;
  last_main_sponsor_change_season: number | null; district: string; size: string;
}

export async function loadNegotiationTeam(db: D1Database, teamId: string): Promise<NegotiationTeam | null> {
  return db.prepare(
    `SELECT t.id, t.name, t.reputation, t.budget, t.league_id, t.game_date, t.last_main_sponsor_change_season, v.district, v.size
     FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?`,
  ).bind(teamId).first<NegotiationTeam>();
}

export interface NegotiationSponsor { id: number; name: string; type: string; district: string; monthly_max: number }

export async function loadNegotiationSponsor(db: D1Database, sponsorId: number): Promise<NegotiationSponsor | null> {
  return db.prepare("SELECT id, name, type, district, monthly_max FROM district_sponsors WHERE id = ?")
    .bind(sponsorId).first<NegotiationSponsor>();
}

/** Herní datum klubu; bez něj aktuální čas v ISO (stejně jako favorLogStmt). */
export function teamGameDate(team: { game_date: string | null }): string {
  return team.game_date ?? new Date().toISOString();
}

export async function activeSeason(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>();
  return mustSeason(row?.number);
}

export interface ContractRow {
  id: string; sponsor_id: number | null; sponsor_name: string; monthly_amount: number; win_bonus: number;
  seasons_remaining: number; early_termination_fee: number; status: "active" | "expired";
}

export interface CategoryContracts { active: ContractRow | null; lastExpired: ContractRow | null }

export async function categoryContracts(db: D1Database, teamId: string, category: NegotiationCategory): Promise<CategoryContracts> {
  const sql = (status: "active" | "expired") =>
    `SELECT id, sponsor_id, sponsor_name, monthly_amount, win_bonus, seasons_remaining, early_termination_fee, status
     FROM sponsor_contracts WHERE team_id = ? AND status = '${status}' AND COALESCE(category, 'main') = ?
     ORDER BY signed_at DESC LIMIT 1`;
  const [active, lastExpired] = await Promise.all([
    db.prepare(sql("active")).bind(teamId, category).first<ContractRow>(),
    db.prepare(sql("expired")).bind(teamId, category).first<ContractRow>(),
  ]);
  return { active: active ?? null, lastExpired: lastExpired ?? null };
}

/** Prodloužení = jednání se stejnou firmou, jaká má aktivní (jinak naposledy vypršelou) smlouvu v kategorii. */
export function isRenewalOf(c: CategoryContracts, sponsorId: number): boolean {
  return c.active ? c.active.sponsor_id === sponsorId : c.lastExpired?.sponsor_id === sponsorId;
}

/** Poměrná výpovědní pokuta, stejný vzorec jako POST /sponsors/terminate. */
export function prorataTerminationFee(c: ContractRow): number {
  return Math.round(c.early_termination_fee * (c.seasons_remaining / 3));
}

/** Proč teď s firmou nejde uzavřít smlouvu v kategorii (null = jde). Pro otevření i podpis. */
export async function contractBlock(
  db: D1Database, team: NegotiationTeam, sponsor: NegotiationSponsor, category: NegotiationCategory, season: number,
  contracts: CategoryContracts,
): Promise<string | null> {
  if (sponsor.district !== team.district) return "Jednat jde jen s firmami z vlastního okresu";
  const renewal = isRenewalOf(contracts, sponsor.id);
  if (contracts.active && renewal && contracts.active.seasons_remaining > 1) {
    return "Smlouvu s touhle firmou prodloužíš až v její poslední sezóně";
  }
  if (category === "main") {
    if (!renewal && (team.last_main_sponsor_change_season ?? 0) >= season) return "Hlavního sponzora jde změnit jen jednou za sezónu";
    const block = await mainSponsorBlock(db, sponsor.id, team.id, season);
    if (block) return block.reason;
  }
  return null;
}

async function expireIfDue(db: D1Database, neg: Negotiation, gameDate: string): Promise<Negotiation> {
  if ((neg.status !== "open" && neg.status !== "accepted") || !isGameExpired(neg.expiresGameDate, gameDate)) return neg;
  await db.prepare("UPDATE sponsor_negotiations SET status = 'expired' WHERE id = ? AND status IN ('open','accepted')")
    .bind(neg.id).run();
  return { ...neg, status: "expired" };
}

export async function findActiveNegotiation(
  db: D1Database, teamId: string, sponsorId: number, category: NegotiationCategory, gameDate: string,
): Promise<Negotiation | null> {
  const row = await db.prepare(
    `SELECT * FROM sponsor_negotiations WHERE team_id = ? AND sponsor_id = ? AND category = ? AND status IN ('open','accepted')
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(teamId, sponsorId, category).first<NegotiationRow>();
  if (!row) return null;
  const neg = await expireIfDue(db, parseNegotiation(row), gameDate);
  return neg.status === "expired" ? null : neg;
}

/** Do kdy majitel po odchodu od jednání nejedná (herní datum), nebo null. */
export async function cooldownUntil(db: D1Database, teamId: string, sponsorId: number, gameDate: string): Promise<string | null> {
  const row = await db.prepare(
    "SELECT MAX(cooldown_until) AS c FROM sponsor_negotiations WHERE team_id = ? AND sponsor_id = ? AND cooldown_until IS NOT NULL",
  ).bind(teamId, sponsorId).first<{ c: string | null }>();
  return row?.c && !isGameExpired(row.c, gameDate) ? row.c : null;
}

function czDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

export interface NegotiationAvailability { canOpen: boolean; reason: string | null; isRenewal: boolean; openId: string | null }

export async function negotiationAvailability(
  db: D1Database, team: NegotiationTeam, sponsor: NegotiationSponsor, category: NegotiationCategory, season: number,
): Promise<NegotiationAvailability> {
  const gameDate = teamGameDate(team);
  const contracts = await categoryContracts(db, team.id, category);
  const isRenewal = isRenewalOf(contracts, sponsor.id);
  if (sponsor.district !== team.district) {
    return { canOpen: false, reason: "Jednat jde jen s firmami z vlastního okresu", isRenewal, openId: null };
  }
  const open = await findActiveNegotiation(db, team.id, sponsor.id, category, gameDate);
  if (open) return { canOpen: true, reason: null, isRenewal, openId: open.id };
  const cd = await cooldownUntil(db, team.id, sponsor.id, gameDate);
  if (cd) return { canOpen: false, reason: `Majitel s vámi do ${czDay(cd)} jednat nechce`, isRenewal, openId: null };
  const block = await contractBlock(db, team, sponsor, category, season, contracts);
  return { canOpen: block === null, reason: block, isRenewal, openId: null };
}

async function leagueStrength(db: D1Database, leagueId: string | null, teamId: string): Promise<{ teams: number; expected: number }> {
  if (!leagueId) return { teams: 2, expected: 1 };
  const [teams, strengths] = await Promise.all([
    db.prepare(
      "SELECT id FROM teams WHERE league_id = ? AND COALESCE(team_type, 'senior') != 'u21' AND name NOT LIKE 'DELETED-%'",
    ).bind(leagueId).all<{ id: string }>(),
    // Síla = průměr nejlepší jedenáctky, stejná definice jako betting/board.ts (loadStrengths).
    db.prepare(
      `SELECT team_id, AVG(overall_rating) AS strength FROM (
         SELECT p.team_id, p.overall_rating,
                ROW_NUMBER() OVER (PARTITION BY p.team_id ORDER BY p.overall_rating DESC) AS poz
         FROM players p JOIN teams t ON t.id = p.team_id
         WHERE t.league_id = ? AND COALESCE(t.team_type, 'senior') != 'u21' AND (p.status IS NULL OR p.status = 'active')
       ) WHERE poz <= 11 GROUP BY team_id`,
    ).bind(leagueId).all<{ team_id: string; strength: number }>(),
  ]);
  const byTeam = new Map(strengths.results.map((r) => [r.team_id, r.strength]));
  const list = teams.results.map((t) => ({ teamId: t.id, strength: byTeam.get(t.id) ?? 30 }));
  return { teams: Math.max(2, list.length), expected: expectedPosition(list, teamId) };
}

/** Průměrná domácí návštěva minulé sezóny, když není, tak letošní. */
async function averageHomeAttendance(db: D1Database, teamId: string, season: number): Promise<number> {
  for (const s of [season - 1, season]) {
    const row = await db.prepare(
      `SELECT AVG(m.attendance) AS avg FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
       WHERE m.home_team_id = ? AND m.status = 'simulated' AND m.attendance IS NOT NULL AND sc.season_number = ?`,
    ).bind(teamId, s).first<{ avg: number | null }>();
    if (row?.avg) return Math.round(row.avg);
  }
  return DEFAULT_ATTENDANCE;
}

function facilityOptions(stadium: Record<string, unknown> | null, reputation: number, played: number, season: number): FacilityOption[] {
  const keys = Object.keys(FACILITY_LABELS);
  const levels: Record<string, number> = {};
  for (const key of keys) levels[key] = Number(stadium?.[key] ?? 0) || 0;
  const upgrades = stadiumUpgradeOptions(levels, reputation, played, season);
  return keys.map((key) => {
    const u = upgrades.find((x) => x.facility === key);
    // Bez nabídky upgradu = zařízení je na maximu, další stupeň neexistuje.
    return { facility: key, currentLevel: levels[key], locked: u ? u.locked === true : true, costs: UPGRADE_COSTS[key] ?? [0, 0, 0, 0] };
  });
}

function equipmentGiftOptions(equip: Record<string, unknown> | null, reputation: number, played: number, season: number): EquipmentOption[] {
  const levels: Record<string, number> = {};
  for (const cat of CATEGORIES) levels[cat] = Number(equip?.[cat] ?? 0) || 0;
  return equipmentUpgradeOptions(levels, reputation, played, season)
    .filter((u) => EQUIPMENT_GIFTS.includes(u.category))
    .map((u) => ({ category: u.category, currentLevel: u.currentLevel, nextLevel: u.nextLevel, cost: u.cost, locked: u.locked === true }));
}

export async function buildNegotiationContext(db: D1Database, i: {
  team: NegotiationTeam; sponsor: NegotiationSponsor; category: NegotiationCategory; season: number;
  personality: OwnerPersonality; wishes: PromiseKind[]; budgetB: number;
}): Promise<NegotiationContext> {
  const { team, sponsor } = i;
  const [league, cup, attendance, manager, stadium, equip, played, banner, contracts] = await Promise.all([
    leagueStrength(db, team.league_id, team.id),
    db.prepare("SELECT total_rounds FROM cup_competitions WHERE season_number = ? ORDER BY rowid DESC LIMIT 1")
      .bind(i.season).first<{ total_rounds: number }>(),
    averageHomeAttendance(db, team.id, i.season),
    db.prepare("SELECT COALESCE(licence_level, 0) AS licence_level FROM managers WHERE team_id = ? LIMIT 1")
      .bind(team.id).first<{ licence_level: number }>(),
    db.prepare("SELECT * FROM stadiums WHERE team_id = ?").bind(team.id).first<Record<string, unknown>>(),
    db.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(team.id).first<Record<string, unknown>>(),
    db.prepare("SELECT COUNT(*) AS cnt FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'")
      .bind(team.id, team.id).first<{ cnt: number }>(),
    db.prepare("SELECT 1 AS x FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND category = 'banner' AND sponsor_type = ? LIMIT 1")
      .bind(team.id, sponsor.type).first<{ x: number }>(),
    categoryContracts(db, team.id, i.category),
  ]);
  const matchesPlayed = played?.cnt ?? 0;
  const other = contracts.active && contracts.active.sponsor_id !== sponsor.id ? contracts.active : null;
  return {
    category: i.category, personality: i.personality, wishes: i.wishes, budgetB: i.budgetB, season: i.season,
    leagueTeams: league.teams, expectedPosition: league.expected,
    cupTotalRounds: cup?.total_rounds ?? DEFAULT_CUP_ROUNDS,
    lastAvgAttendance: attendance,
    reputation: team.reputation,
    licenceLevel: manager?.licence_level ?? 0,
    sponsorType: sponsor.type,
    sectorBannerActive: banner !== null,
    facilities: facilityOptions(stadium, team.reputation, matchesPlayed, i.season),
    equipment: equipmentGiftOptions(equip, team.reputation, matchesPlayed, i.season),
    currentTerminationFee: other ? prorataTerminationFee(other) : 0,
  };
}

export type Fail = { error: string; status: 400 | 404 | 409 | 410 };

/** Otevře jednání, nebo vrátí id už běžícího se stejnou firmou a kategorií. */
export async function openNegotiation(
  db: D1Database, teamId: string, sponsorId: number, category: NegotiationCategory,
): Promise<{ ok: true; id: string } | ({ ok: false } & Fail)> {
  const team = await loadNegotiationTeam(db, teamId);
  if (!team) return { ok: false, error: "Tým nenalezen", status: 404 };
  const sponsor = await loadNegotiationSponsor(db, sponsorId);
  if (!sponsor) return { ok: false, error: "Sponzor nenalezen", status: 404 };
  const season = await activeSeason(db);
  const av = await negotiationAvailability(db, team, sponsor, category, season);
  if (av.openId) return { ok: true, id: av.openId };
  if (!av.canOpen) return { ok: false, error: av.reason ?? "S touhle firmou teď jednat nejde", status: 409 };

  const owner = await ensureSponsorOwner(db, sponsorId);
  if (!owner) return { ok: false, error: "Majitel nenalezen", status: 404 };
  const favor = await getFavor(db, sponsorId, teamId);
  const budgetB = sponsorBudgetB({ monthlyMax: sponsor.monthly_max, reputation: team.reputation, villageSize: team.size, category, favor });
  const wishes = ownerWishes({ sponsorId, teamId, season, personality: owner.personality, sponsorType: sponsor.type, category });
  const id = crypto.randomUUID();
  // Jedno běžící jednání na klub, firmu a kategorii: podmíněný INSERT ustojí i dvojklik.
  const ins = await db.prepare(
    `INSERT INTO sponsor_negotiations (id, team_id, sponsor_id, category, wishes, budget_b, patience, expires_game_date)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM sponsor_negotiations WHERE team_id = ? AND sponsor_id = ? AND category = ? AND status IN ('open','accepted'))`,
  ).bind(
    id, teamId, sponsorId, category, JSON.stringify(wishes), budgetB, initialPatience(favor),
    gameExpiry(teamGameDate(team), NEGOTIATION_DAYS), teamId, sponsorId, category,
  ).run();
  if ((ins.meta?.changes ?? 0) !== 1) {
    const again = await findActiveNegotiation(db, teamId, sponsorId, category, teamGameDate(team));
    if (again) return { ok: true, id: again.id };
    return { ok: false, error: "Jednání se nepodařilo otevřít, zkus to znovu", status: 409 };
  }
  logger.info({ module: "sponsors", teamId }, `jednání ${id}: sponzor ${sponsorId}, ${category}, B=${budgetB}, přání ${wishes.join(",")}`);
  return { ok: true, id };
}

export interface NegotiationState {
  neg: Negotiation;
  team: NegotiationTeam;
  sponsor: NegotiationSponsor;
  owner: SponsorOwner;
  favor: number;
  season: number;
  ctx: NegotiationContext;
  isRenewal: boolean;
  contracts: CategoryContracts;
}

export async function loadNegotiationState(db: D1Database, teamId: string, negotiationId: string): Promise<NegotiationState | Fail> {
  const row = await db.prepare("SELECT * FROM sponsor_negotiations WHERE id = ? AND team_id = ?")
    .bind(negotiationId, teamId).first<NegotiationRow>();
  if (!row) return { error: "Jednání nenalezeno", status: 404 };
  const team = await loadNegotiationTeam(db, teamId);
  if (!team) return { error: "Tým nenalezen", status: 404 };
  const sponsor = await loadNegotiationSponsor(db, row.sponsor_id);
  if (!sponsor) return { error: "Sponzor nenalezen", status: 404 };
  const owner = await ensureSponsorOwner(db, row.sponsor_id);
  if (!owner) return { error: "Majitel nenalezen", status: 404 };
  const [favor, season, contracts] = await Promise.all([
    getFavor(db, sponsor.id, teamId), activeSeason(db), categoryContracts(db, teamId, row.category),
  ]);
  const neg = await expireIfDue(db, parseNegotiation(row), teamGameDate(team));
  const ctx = await buildNegotiationContext(db, {
    team, sponsor, category: neg.category, season, personality: owner.personality, wishes: neg.wishes, budgetB: neg.budgetB,
  });
  return { neg, team, sponsor, owner, favor, season, ctx, isRenewal: isRenewalOf(contracts, sponsor.id), contracts };
}

/** Co se podepíše: přijatý návrh klubu, nebo poslední protinabídka majitele. */
export function pendingTerms(neg: Negotiation): Proposal | null {
  const last = neg.rounds[neg.rounds.length - 1];
  if (!last) return null;
  if (neg.status === "accepted" && last.response.kind === "accept") return last.proposal;
  if (neg.status === "open" && (last.response.kind === "counter_money" || last.response.kind === "counter_wish") && last.response.counter) {
    return last.response.counter;
  }
  return null;
}

/** Zapíše kolo jen tehdy, když se od načtení nic nezměnilo (dvojklik nespálí trpělivost dvakrát). */
export async function saveRound(
  db: D1Database, neg: Negotiation, round: NegotiationRound,
  next: { status: NegotiationStatus; patience: number; cooldownUntil: string | null },
): Promise<boolean> {
  const rounds = JSON.stringify([...neg.rounds, round]);
  const res = await db.prepare(
    "UPDATE sponsor_negotiations SET rounds = ?, status = ?, patience = ?, cooldown_until = ? WHERE id = ? AND status = 'open' AND rounds = ?",
  ).bind(rounds, next.status, next.patience, next.cooldownUntil, neg.id, neg.roundsRaw).run();
  return (res.meta?.changes ?? 0) === 1;
}

/**
 * Rollover vrací herní čas zpátky na reálné datum: lhůty a cooldowny ze staré osy by
 * nikdy nevypršely. Běžící jednání se proto uzavřou a cooldowny smažou.
 */
export async function closeNegotiationsForRollover(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare("UPDATE sponsor_negotiations SET status = 'expired' WHERE status IN ('open','accepted')"),
    db.prepare("UPDATE sponsor_negotiations SET cooldown_until = NULL WHERE cooldown_until IS NOT NULL"),
  ]);
}

export interface NegotiationListItem {
  id: string; sponsorId: number; sponsorName: string; category: NegotiationCategory; status: "open" | "accepted"; expiresGameDate: string;
}

export async function listTeamNegotiations(db: D1Database, teamId: string): Promise<NegotiationListItem[]> {
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>();
  const gameDate = teamGameDate({ game_date: team?.game_date ?? null });
  const rows = await db.prepare(
    `SELECT n.id, n.sponsor_id, ds.name AS sponsor_name, n.category, n.status, n.expires_game_date
     FROM sponsor_negotiations n JOIN district_sponsors ds ON ds.id = n.sponsor_id
     WHERE n.team_id = ? AND n.status IN ('open','accepted') ORDER BY n.created_at DESC`,
  ).bind(teamId).all<{ id: string; sponsor_id: number; sponsor_name: string; category: NegotiationCategory; status: "open" | "accepted"; expires_game_date: string }>();
  return rows.results
    .filter((r) => !isGameExpired(r.expires_game_date, gameDate))
    .map((r) => ({ id: r.id, sponsorId: r.sponsor_id, sponsorName: r.sponsor_name, category: r.category, status: r.status, expiresGameDate: r.expires_game_date }));
}

export interface PromiseRowView {
  kind: PromiseKind; params: PromiseParams; label: string; season: number | null; deadlineGameDate: string | null;
  reward: number; penalty: number;
}

export interface NegotiationView {
  id: string;
  sponsorId: number;
  sponsorName: string;
  sponsorType: string;
  category: NegotiationCategory;
  status: NegotiationStatus;
  isRenewal: boolean;
  owner: { firstName: string; lastName: string; personality: OwnerPersonality; faceConfig: Record<string, unknown> };
  favor: number;
  wishes: PromiseKind[];
  patience: number;
  expiresGameDate: string;
  cooldownUntil: string | null;
  /** Ochota bez slibů a strop, obojí jako rozmezí; klient k nim přičítá rozmezí vybraných slibů. */
  estimate: { base: Range; cap: Range; cautiousSeasonBonus: number };
  winBonusFactor: number;
  monthsPerSeason: number;
  catalog: PromiseOption[];
  construction: GiftOption[];
  equipment: GiftOption[];
  current: null | { sponsorName: string; monthlyAmount: number; winBonus: number; seasonsRemaining: number; terminationFee: number; sameSponsor: boolean };
  rounds: NegotiationRound[];
  pending: null | {
    proposal: Proposal; promises: PromiseRowView[]; terminationFee: number; constructionCost: number; equipmentCost: number;
    currentFee: number; renamesClub: boolean;
  };
  season: number;
}

export function negotiationView(st: NegotiationState): NegotiationView {
  const { neg, ctx, favor, owner, sponsor } = st;
  const terms = pendingTerms(neg);
  const summary = terms ? signingSummary(terms, ctx, teamGameDate(st.team)) : null;
  const current = st.contracts.active;
  return {
    id: neg.id,
    sponsorId: sponsor.id,
    sponsorName: sponsor.name,
    sponsorType: sponsor.type,
    category: neg.category,
    status: neg.status,
    isRenewal: st.isRenewal,
    owner: { firstName: owner.firstName, lastName: owner.lastName, personality: owner.personality, faceConfig: owner.faceConfig },
    favor,
    wishes: neg.wishes,
    patience: neg.patience,
    expiresGameDate: neg.expiresGameDate,
    cooldownUntil: neg.cooldownUntil,
    estimate: {
      base: budgetEstimateRange(BASE_WILLINGNESS * ctx.budgetB, favor),
      cap: budgetEstimateRange(WILLINGNESS_CAP * ctx.budgetB, favor),
      cautiousSeasonBonus: owner.personality === "cautious" ? CAUTIOUS_SEASON_BONUS : 0,
    },
    winBonusFactor: Math.round(winBonusFactor(ctx) * 1000) / 1000,
    monthsPerSeason: MONTHS_PER_SEASON,
    catalog: promiseCatalog(ctx, favor),
    construction: constructionOptions(ctx),
    equipment: equipmentOptions(ctx),
    current: current ? {
      sponsorName: current.sponsor_name, monthlyAmount: current.monthly_amount, winBonus: current.win_bonus,
      seasonsRemaining: current.seasons_remaining, terminationFee: prorataTerminationFee(current),
      sameSponsor: current.sponsor_id === sponsor.id,
    } : null,
    rounds: neg.rounds,
    pending: summary ? {
      proposal: summary.proposal,
      promises: summary.rows.map((r) => ({
        kind: r.kind, params: r.params, label: promiseLabel({ kind: r.kind, params: r.params }, ctx),
        season: r.season, deadlineGameDate: r.deadlineGameDate, reward: r.reward, penalty: r.penalty,
      })),
      terminationFee: summary.terminationFee,
      constructionCost: summary.constructionCost,
      equipmentCost: summary.equipmentCost,
      currentFee: summary.currentFee,
      renamesClub: neg.category === "main" && !st.isRenewal,
    } : null,
    season: st.season,
  };
}
```

- [ ] **Step 4: Spustit test, musí projít**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/negotiation-db.test.ts`
Expected: PASS, `Tests  9 passed`.

- [ ] **Step 5: Důvod v deníku náklonnosti**

V `apps/api/src/sponsors/favor-math.ts` v objektu `FAVOR_REASONS` za řádek `  smsIgnored: "bez odpovědi na SMS",` vložit:

```ts
  negotiationInsult: "urazil se nabídkou při jednání",
```

- [ ] **Step 6: Rollover: uklidit jednání a opravit text SMS ředitele**

V `apps/api/src/season/season-rollover.ts`:

1. Nahradit řádek
```ts
        `📋 ${kdo} s koncem sezóny.${dovetek} Mrkni na Sponzory, čekají tam nové nabídky.`,
```
za
```ts
        `📋 ${kdo} s koncem sezóny.${dovetek} Mrkni na Sponzory, s firmami z okresu teď jednáš o nové smlouvě.`,
```

2. V bloku `// 4b-sms.` nahradit
```ts
    await closeOwnerSmsForRollover(db);
```
za
```ts
    await closeOwnerSmsForRollover(db);
    // Jednání se sponzory mají lhůty ve staré herní ose, uzavřou se stejně jako vlákna SMS.
    const { closeNegotiationsForRollover } = await import("../sponsors/negotiation-db");
    await closeNegotiationsForRollover(db)
      .catch((e) => { logger.error({ module: "season-rollover" }, "uzavření jednání se sponzory", e); });
```

- [ ] **Step 7: Testy sponzorů a typecheck**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors src/season`
Expected: všechny soubory `passed`.

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx tsc --noEmit`
Expected: bez chyb.

- [ ] **Step 8: Commit**

```bash
cd /Users/savrik/Projects/fmko
git add apps/api/src/sponsors/negotiation-db.ts apps/api/src/sponsors/negotiation-db.test.ts apps/api/src/sponsors/favor-math.ts apps/api/src/season/season-rollover.ts
git commit -m "$(cat <<'EOF'
feat(sponzori): DB vrstva jednani, expirace v hernim case a uklid v rolloveru

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: API: otevřít, stav a návrh (exkluzivita, cooldown, expirace, anti-podvrh)

**Files:**
- Modify: `apps/api/src/routes/sponsors.ts`

**Interfaces:**
- Consumes: Task 4 (`evaluateRound`, `afterReject`, `COOLDOWN_DAYS`, `INSULT_FAVOR`, `validateProposal`, `ownerResponse`, `ResponseKind`), Task 5 (`openNegotiation`, `loadNegotiationState`, `negotiationView`, `saveRound`, `teamGameDate`, `negotiationAvailability`, `loadNegotiationTeam`, `loadNegotiationSponsor`, `NegotiationRound`, `NegotiationStatus`, `FAVOR_REASONS.negotiationInsult`), `requireTeamOwnership`, `getSession`, `getTokenFromRequest` (`../auth/session`), `gameExpiry`.
- Produces:
  - `POST /api/teams/:teamId/sponsors/:sponsorId/negotiations` body `{ category: "main" | "stadium" }` → `NegotiationView` (200) | `{ error }` 400/404/409.
  - `GET /api/teams/:teamId/sponsors/negotiations/:negotiationId` → `NegotiationView` | 401/403/404 (jen vlastník klubu).
  - `POST /api/teams/:teamId/sponsors/negotiations/:negotiationId/propose` body `Proposal` → `NegotiationView` | 400 (neplatný návrh) / 409 (stav, souběh) / 410 (vypršelo).
  - `GET /api/sponsors/:sponsorId?teamId=` rozšířené o `myTeam.negotiation: { main: NegotiationAvailability; stadium: NegotiationAvailability } | null`.

- [ ] **Step 1: Importy a ochrana rout**

V `apps/api/src/routes/sponsors.ts`:

1. Nahradit řádek `import { Hono } from "hono";` za `import { Hono, type Context } from "hono";`
2. Nahradit řádek `import { isGameExpired } from "../lib/game-time";` za `import { gameExpiry, isGameExpired } from "../lib/game-time";`
3. Za řádek `import type { OwnerPersonality } from "../sponsors/owners";` vložit:

```ts
import { getSession, getTokenFromRequest } from "../auth/session";
import { afterReject, COOLDOWN_DAYS, evaluateRound, INSULT_FAVOR } from "../sponsors/negotiation";
import {
  loadNegotiationSponsor, loadNegotiationState, loadNegotiationTeam, negotiationAvailability, negotiationView, openNegotiation,
  saveRound, teamGameDate, type NegotiationRound, type NegotiationStatus,
} from "../sponsors/negotiation-db";
import { ownerResponse, type ResponseKind } from "../sponsors/negotiation-texts";
import { validateProposal } from "../sponsors/proposal";
```

4. Za řádek `sponsorsRouter.use("/teams/:teamId/sponsor-owners/*", requireTeamOwnership);` vložit:

```ts
// Jednání se sponzory: zápisy jen vlastník klubu. (Stejná cesta je i v gameRouteru
// pro bannery, dvojí kontrola vlastnictví nevadí.)
sponsorsRouter.use("/teams/:teamId/sponsors/*", requireTeamOwnership);

/**
 * requireTeamOwnership propouští GET bez tokenu. Stav jednání (rozpočet, návrhy, protinabídky)
 * ale patří jen vlastníkovi klubu, proto si ho čtení ověří samo (vzor assertOwnsTeam v game.ts).
 */
async function assertTeamOwner(
  c: Context<{ Bindings: Bindings }>, teamId: string,
): Promise<{ error: string; status: 401 | 403 } | null> {
  const token = getTokenFromRequest(c);
  if (!token) return { error: "Nepřihlášen", status: 401 };
  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return { error: "Neplatná session", status: 401 };
  const own = await c.env.DB.prepare("SELECT 1 AS x FROM teams WHERE id = ? AND user_id = ?")
    .bind(teamId, session.userId).first<{ x: number }>();
  return own ? null : { error: "Přístup odepřen", status: 403 };
}

const STATUS_ERRORS: Record<Exclude<NegotiationStatus, "open">, { error: string; status: 409 | 410 }> = {
  accepted: { error: "Majitel už návrh přijal, zbývá podepsat", status: 409 },
  walked_away: { error: "Majitel od jednání odešel", status: 409 },
  expired: { error: "Jednání vypršelo", status: 410 },
  signed: { error: "Smlouva už je podepsaná", status: 409 },
};
```

- [ ] **Step 2: Dostupnost jednání v detailu sponzora**

V handleru `sponsorsRouter.get("/sponsors/:sponsorId", …)` nahradit řádek

```ts
      myTeam = { favor, budgetEstimate: budgetEstimateRange(b, favor), nextHomeMatch: next };
```

za

```ts
      // S kým a o co jde jednat (hlavní sponzor, název stadionu), nebo proč ne.
      let negotiation = null;
      const [negTeam, negSponsor] = await Promise.all([loadNegotiationTeam(db, teamId), loadNegotiationSponsor(db, sponsorId)]);
      if (negTeam && negSponsor && season?.number) {
        const [main, stadium] = await Promise.all([
          negotiationAvailability(db, negTeam, negSponsor, "main", season.number),
          negotiationAvailability(db, negTeam, negSponsor, "stadium", season.number),
        ]);
        negotiation = { main, stadium };
      }
      myTeam = { favor, budgetEstimate: budgetEstimateRange(b, favor), nextHomeMatch: next, negotiation };
```

- [ ] **Step 3: Routy otevřít, stav, návrh**

Na konec `apps/api/src/routes/sponsors.ts` přidat:

```ts
// POST /api/teams/:teamId/sponsors/:sponsorId/negotiations: otevřít jednání (nebo vrátit běžící)
sponsorsRouter.post("/teams/:teamId/sponsors/:sponsorId/negotiations", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const sponsorId = Number(c.req.param("sponsorId"));
  const body = await c.req.json<{ category?: string }>()
    .catch((e) => { logger.warn({ module: "sponsors", teamId }, "parse negotiation open body", e); return null; });
  if (!Number.isInteger(sponsorId)) return c.json({ error: "Neplatný sponzor" }, 400);
  const category = body?.category;
  if (category !== "main" && category !== "stadium") {
    return c.json({ error: "Jednat jde o hlavního sponzora nebo o název stadionu" }, 400);
  }
  const opened = await openNegotiation(db, teamId, sponsorId, category);
  if (!opened.ok) return c.json({ error: opened.error }, opened.status);
  const st = await loadNegotiationState(db, teamId, opened.id);
  if ("error" in st) return c.json({ error: st.error }, st.status);
  return c.json(negotiationView(st));
});

// GET /api/teams/:teamId/sponsors/negotiations/:negotiationId: stav jednání (jen vlastník klubu)
sponsorsRouter.get("/teams/:teamId/sponsors/negotiations/:negotiationId", async (c) => {
  const teamId = c.req.param("teamId");
  const denied = await assertTeamOwner(c, teamId);
  if (denied) return c.json({ error: denied.error }, denied.status);
  const st = await loadNegotiationState(c.env.DB, teamId, c.req.param("negotiationId"));
  if ("error" in st) return c.json({ error: st.error }, st.status);
  return c.json(negotiationView(st));
});

// POST /api/teams/:teamId/sponsors/negotiations/:negotiationId/propose: návrh klubu, odpověď majitele.
// Klient posílá jen návrh; cenu, ochotu i protinabídku počítá server z vlastního kontextu.
sponsorsRouter.post("/teams/:teamId/sponsors/negotiations/:negotiationId/propose", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const st = await loadNegotiationState(db, teamId, c.req.param("negotiationId"));
  if ("error" in st) return c.json({ error: st.error }, st.status);
  if (st.neg.status !== "open") {
    const e = STATUS_ERRORS[st.neg.status];
    return c.json({ error: e.error }, e.status);
  }
  const raw = await c.req.json<unknown>()
    .catch((e) => { logger.warn({ module: "sponsors", teamId }, "parse negotiation proposal", e); return null; });
  const valid = validateProposal(raw, st.ctx);
  if (!valid.ok) return c.json({ error: valid.error }, 400);

  const outcome = evaluateRound(valid.proposal, st.ctx);
  const gameDate = teamGameDate(st.team);
  let status: NegotiationStatus = "open";
  let patience = st.neg.patience;
  let cooldown = st.neg.cooldownUntil;
  let kind: ResponseKind;
  if (outcome.kind === "accept") {
    status = "accepted";
    kind = "accept";
  } else if (outcome.kind === "counter_money" || outcome.kind === "counter_wish") {
    kind = outcome.kind;
  } else {
    const after = afterReject(patience);
    patience = after.patience;
    kind = outcome.insulted ? "insulted" : "reject";
    if (after.walkedAway) {
      status = "walked_away";
      kind = "walked_away";
      cooldown = gameExpiry(gameDate, COOLDOWN_DAYS);
    }
  }
  const wish = outcome.kind === "counter_wish" ? outcome.wish : undefined;
  const counter = outcome.kind === "counter_money" || outcome.kind === "counter_wish" ? outcome.counter : undefined;
  const round: NegotiationRound = {
    proposal: valid.proposal,
    response: {
      kind,
      text: ownerResponse(st.owner.personality, kind, st.neg.rounds.length, wish),
      gameDate,
      ...(counter ? { counter } : {}),
      ...(wish ? { wish } : {}),
    },
  };
  const saved = await saveRound(db, st.neg, round, { status, patience, cooldownUntil: cooldown });
  if (!saved) return c.json({ error: "Návrh se právě zpracovává, načti stránku znovu" }, 409);

  // Nabídka nad 1,5 × ochoty majitele urazí (spec: náklonnost −3), zapisuje se do deníku.
  if (outcome.kind === "reject" && outcome.insulted) {
    await applySponsorFavorDelta(db, st.sponsor.id, teamId, INSULT_FAVOR, FAVOR_REASONS.negotiationInsult);
  }
  logger.info({ module: "sponsors", teamId }, `jednání ${st.neg.id}: kolo ${st.neg.rounds.length + 1}, ${kind}, trpělivost ${patience}`);

  const fresh = await loadNegotiationState(db, teamId, st.neg.id);
  if ("error" in fresh) return c.json({ error: fresh.error }, fresh.status);
  return c.json(negotiationView(fresh));
});
```

- [ ] **Step 4: Typecheck a testy sponzorů**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx tsc --noEmit`
Expected: bez chyb.

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors`
Expected: všechny soubory `passed`.

- [ ] **Step 5: Lokální smoke test rout (bez přihlášení jen chyby)**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx wrangler dev --env testing --port 8787` (na pozadí; když už na 8787 běží funkční server, nespouštět druhý).
Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:8787/api/teams/302a0ce7-428a-4da8-b4ac-40f27eb9a7d1/sponsors/1/negotiations" -H "Content-Type: application/json" -d '{"category":"main"}'`
Expected: `401` (bez tokenu propustí jen GET).
Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8787/api/teams/302a0ce7-428a-4da8-b4ac-40f27eb9a7d1/sponsors/negotiations/neexistuje"`
Expected: `401` (GET stavu jednání vyžaduje vlastníka).

- [ ] **Step 6: Commit**

```bash
cd /Users/savrik/Projects/fmko
git add apps/api/src/routes/sponsors.ts
git commit -m "$(cat <<'EOF'
feat(sponzori): API jednani (otevrit, stav, navrh) a dostupnost v detailu sponzora

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Podpis z jednání, sliby, platby a konec pevných nabídek

**Files:**
- Create: `apps/api/src/sponsors/signing.ts`
- Test: `apps/api/src/sponsors/signing.test.ts`
- Modify: `apps/api/src/routes/sponsors.ts` (route accept)
- Modify: `apps/api/src/routes/game.ts` (GET `/teams/:teamId/sponsors`, POST `/sponsors/sign`, POST `/sponsors/renew`)

**Interfaces:**
- Consumes: Task 4 (`buildPromiseRows`, `constructionCost`, `equipmentCost`, `earlyTerminationFee`, `validateProposal`), Task 5 (`loadNegotiationState`, `pendingTerms`, `contractBlock`, `prorataTerminationFee`, `teamGameDate`, `listTeamNegotiations`, `Fail`), `recordTransaction`, `MAIN_SPONSOR_FREE_SQL`, `mainSponsorBlock`, `applyReputationDelta` (`../lib/reputation`), `recordClubEvent` (`../fans/club-events`), `enqueueMainSponsorSms` (`./owner-sms-triggers`), `FACILITY_LABELS`, `CATEGORIES`.
- Produces:
  - `interface PaidConstruction { kind: "stadium" | "equipment"; key; level; cost }`, `paidConstructionItems(proposal, ctx)`, `stadiumSponsorName(name)`, `applyMainSponsorRename(db, teamId, sponsorName, season)`, `applyStadiumRename(db, teamId, stadiumName, contractId)`, `type SignResult`, `signNegotiation(db, teamId, negotiationId)`.
  - `POST /api/teams/:teamId/sponsors/negotiations/:negotiationId/accept` → `{ ok: true, contractId, newTeamName, reputationPenalty }` | `{ error }` 400/404/409/410.
  - `GET /api/teams/:teamId/sponsors`: bez `mainOffers`/`stadiumOffers`; `mainContract`/`stadiumContract`/`mainExpired`/`stadiumExpired` mají `renewal: null`, `renewable: boolean`, `blockedReason`; nové pole `negotiations: NegotiationListItem[]`.
  - `POST /sponsors/sign` a `/sponsors/renew` jen pro bannery, jinak 400.

- [ ] **Step 1: Napsat test `signing.test.ts`**

```ts
/**
 * Podpis z jednání: zaplacená stavba a vybavení z podmínek, název stadionu podle sponzora.
 */
import { describe, expect, it } from "vitest";
import type { NegotiationContext, Proposal } from "./negotiation";
import { paidConstructionItems, stadiumSponsorName } from "./signing";

const CTX = {
  facilities: [{ facility: "vip_box", currentLevel: 1, locked: false, costs: [0, 55000, 170000, 450000] }],
  equipment: [{ category: "balls", currentLevel: 0, nextLevel: 1, cost: 6000, locked: false }],
} as unknown as NegotiationContext;

const P: Proposal = {
  seasons: 2, promises: [],
  demands: { monthly: 5000, winBonus: 0, signingBonus: 0, goalBonuses: {}, construction: "vip_box", equipment: "balls", payCurrentFee: false },
};

describe("paidConstructionItems", () => {
  it("stavba o úroveň výš a vybavení s cenou z ceníku", () => {
    expect(paidConstructionItems(P, CTX)).toEqual([
      { kind: "stadium", key: "vip_box", level: 2, cost: 170000 },
      { kind: "equipment", key: "balls", level: 1, cost: 6000 },
    ]);
  });
  it("bez požadavku nic", () => {
    expect(paidConstructionItems({ ...P, demands: { ...P.demands, construction: null, equipment: null } }, CTX)).toEqual([]);
  });
});

describe("stadiumSponsorName", () => {
  it("bez s.r.o., s Arenou", () => {
    expect(stadiumSponsorName("Truhlářství Novák s.r.o.")).toBe("Truhlářství Novák Arena");
  });
});
```

- [ ] **Step 2: Spustit test, musí selhat**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors/signing.test.ts`
Expected: FAIL, `Failed to resolve import "./signing"`.

- [ ] **Step 3: Napsat `signing.ts`**

Přejmenování klubu a stadionu je PŘESUNUTÉ z `POST /teams/:teamId/sponsors/sign` v `routes/game.ts` (Step 6 ho tam smaže), chování zůstává stejné.

```ts
/**
 * Podpis smlouvy vyjednané s majitelem firmy (etapa 2). Podepisují se jen podmínky uložené
 * v jednání (přijatý návrh klubu, nebo protinabídka majitele); klient neposílá nic.
 * Před podpisem se znovu ověří, že podmínky pořád jdou splnit a firma je pořád volná.
 *
 * Pořadí: zámek jednání → smlouva (hlavní sponzor atomicky přes MAIN_SPONSOR_FREE_SQL)
 * → stará smlouva → platby → zaplacená stavba → sliby → úklid jednání → přejmenování a SMS.
 */
import { logger } from "../lib/logger";
import { CATEGORIES } from "../equipment/equipment-generator";
import { recordTransaction } from "../season/finance-processor";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import { MAIN_SPONSOR_FREE_SQL } from "./exclusivity";
import {
  buildPromiseRows, constructionCost, earlyTerminationFee, equipmentCost, type NegotiationContext, type Proposal,
} from "./negotiation";
import {
  contractBlock, loadNegotiationState, pendingTerms, prorataTerminationFee, teamGameDate, type Fail,
} from "./negotiation-db";
import { validateProposal } from "./proposal";

export interface PaidConstruction { kind: "stadium" | "equipment"; key: string; level: number; cost: number }

/** Co sponzor klubu zaplatí věcně (stavba, vybavení), s cenou podle ceníku. Ukládá se do paid_construction. */
export function paidConstructionItems(p: Proposal, ctx: NegotiationContext): PaidConstruction[] {
  const out: PaidConstruction[] = [];
  if (p.demands.construction) {
    const f = ctx.facilities.find((x) => x.facility === p.demands.construction);
    if (f) out.push({ kind: "stadium", key: f.facility, level: f.currentLevel + 1, cost: constructionCost(ctx, f.facility) });
  }
  if (p.demands.equipment) {
    const e = ctx.equipment.find((x) => x.category === p.demands.equipment);
    if (e) out.push({ kind: "equipment", key: e.category, level: e.nextLevel, cost: equipmentCost(ctx, e.category) });
  }
  return out;
}

/** Název stadionu podle sponzora, stejně jako dřívější pevné nabídky: bez „s.r.o.", s „Arena". */
export function stadiumSponsorName(name: string): string {
  return `${name.replace(/\s*s\.r\.o\.?\s*/gi, "").trim()} Arena`;
}

/** Nový hlavní sponzor: klub nese jeho jméno, −3 reputace, pohár, U21 a zpráva do ligy. */
export async function applyMainSponsorRename(
  db: D1Database, teamId: string, sponsorName: string, season: number,
): Promise<{ oldName: string; newName: string }> {
  const teamInfo = await db.prepare("SELECT name, village_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string; village_id: string }>();
  const village = teamInfo
    ? await db.prepare("SELECT name FROM villages WHERE id = ?").bind(teamInfo.village_id).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: "sponsors", teamId }, "fetch village for sponsor rename", e); return null; })
    : null;
  const oldName = teamInfo?.name ?? "";
  const newName = `FK ${sponsorName} ${village?.name ?? ""}`.trim();
  // Přejmenování podle sponzora fanoušky nepotěší (-3).
  await db.prepare("UPDATE teams SET name = ?, last_main_sponsor_change_season = ? WHERE id = ?")
    .bind(newName, season, teamId).run();
  const { applyReputationDelta } = await import("../lib/reputation");
  await applyReputationDelta(db, teamId, -3, "sponsor", "Přejmenování klubu podle sponzora",
    { referenceId: `sponsor-rename-${teamId}-s${season}` });
  // Pamětníci to nesou nejhůř, jméno klubu neslo tři generace.
  const { recordClubEvent } = await import("../fans/club-events");
  await recordClubEvent(db, {
    teamId, kind: "prejmenovani_klubu", severity: 1,
    payload: { co: `Teď jsme ${newName}` },
    referenceId: `fan-rename-${teamId}-s${season}`,
  });
  // Přejmenování promítnout i do poháru a do U21 týmu klubu (jinak drží starý název).
  await db.prepare("UPDATE cup_teams SET name = ? WHERE team_id = ?").bind(newName, teamId).run()
    .catch((e) => logger.warn({ module: "sponsors", teamId }, "rename cup_teams on sponsor change", e));
  await db.prepare("UPDATE teams SET name = ? WHERE parent_team_id = ? AND team_type = 'u21'").bind(`${newName} U21`, teamId).run()
    .catch((e) => logger.warn({ module: "sponsors", teamId }, "rename U21 on sponsor change", e));
  await db.prepare(
    "INSERT INTO news (id, league_id, type, headline, body, created_at) VALUES (?, (SELECT league_id FROM teams WHERE id = ?), 'rename', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
  ).bind(crypto.randomUUID(), teamId,
    `${oldName} mění název na ${newName}`,
    `Klub ${oldName} podepsal sponzorskou smlouvu s ${sponsorName} a mění svůj název na ${newName}. Fanoušci nejsou nadšení (-3 reputace).`,
  ).run().catch((e) => logger.warn({ module: "sponsors", teamId }, "insert sponsor rename news", e));
  return { oldName, newName };
}

/** Nový sponzor stadionu: stadion nese jeho jméno, fanoušci si toho všimnou. */
export async function applyStadiumRename(db: D1Database, teamId: string, stadiumName: string, contractId: string): Promise<void> {
  const old = await db.prepare("SELECT stadium_name FROM teams WHERE id = ?").bind(teamId).first<{ stadium_name: string | null }>()
    .catch((e) => { logger.warn({ module: "sponsors", teamId }, "starý název stadionu", e); return null; });
  await db.prepare("UPDATE teams SET stadium_name = ? WHERE id = ?").bind(stadiumName, teamId).run();
  const { recordClubEvent } = await import("../fans/club-events");
  await recordClubEvent(db, {
    teamId, kind: "prejmenovani_stadionu", severity: 1,
    payload: { co: `${old?.stadium_name ?? "Hřiště"} je teď ${stadiumName}` },
    referenceId: `fan-stadion-${contractId}`,
  });
}

/** Stavba nebo vybavení zaplacené sponzorem: úroveň o stupeň výš, bez účtování klubu. */
async function applyPaidConstruction(db: D1Database, teamId: string, item: PaidConstruction): Promise<void> {
  if (item.kind === "stadium") {
    // Sloupec jen z whitelistu FACILITY_LABELS, stejně jako POST /stadium/upgrade.
    if (!(item.key in FACILITY_LABELS)) {
      logger.error({ module: "sponsors", teamId }, `neznámé zařízení ${item.key} v podmínkách sponzora`);
      return;
    }
    const res = await db.prepare(`UPDATE stadiums SET ${item.key} = ? WHERE team_id = ? AND ${item.key} = ?`)
      .bind(item.level, teamId, item.level - 1).run();
    if ((res.meta?.changes ?? 0) !== 1) {
      logger.error({ module: "sponsors", teamId }, `stavba od sponzora ${item.key} na ${item.level} se nezapsala, úroveň se mezitím změnila`);
    }
    return;
  }
  if (!(CATEGORIES as readonly string[]).includes(item.key)) {
    logger.error({ module: "sponsors", teamId }, `neznámé vybavení ${item.key} v podmínkách sponzora`);
    return;
  }
  const res = await db.prepare(`UPDATE equipment SET ${item.key} = ?, ${item.key}_condition = 100 WHERE team_id = ? AND ${item.key} = ?`)
    .bind(item.level, teamId, item.level - 1).run();
  if ((res.meta?.changes ?? 0) !== 1) {
    logger.error({ module: "sponsors", teamId }, `vybavení od sponzora ${item.key} na ${item.level} se nezapsalo, úroveň se mezitím změnila`);
    return;
  }
  // Inzerát v bazaru se váže na konkrétní úroveň, po vylepšení už nesedí (stejně jako POST /equipment/upgrade).
  await db.prepare("UPDATE equipment_listings SET status = 'withdrawn', resolved_at = ? WHERE team_id = ? AND category = ? AND status = 'active'")
    .bind(new Date().toISOString(), teamId, item.key).run()
    .catch((e) => logger.warn({ module: "sponsors", teamId }, "stažení inzerátu po vybavení od sponzora", e));
}

export type SignResult =
  | { ok: true; contractId: string; newTeamName: string | null; reputationPenalty: number }
  | ({ ok: false } & Fail);

export async function signNegotiation(db: D1Database, teamId: string, negotiationId: string): Promise<SignResult> {
  const st = await loadNegotiationState(db, teamId, negotiationId);
  if ("error" in st) return { ok: false, ...st };
  const { neg, team, sponsor, season, ctx } = st;
  if (neg.status === "expired") return { ok: false, error: "Jednání vypršelo", status: 410 };
  if (neg.status === "signed") return { ok: false, error: "Smlouva už je podepsaná", status: 409 };
  const terms = pendingTerms(neg);
  if (!terms) return { ok: false, error: "Majitel zatím nic nepřijal", status: 409 };

  // Stav klubu se od návrhu mohl změnit (postavená tribuna, nový banner, licence): znovu ověřit.
  const valid = validateProposal(terms, ctx);
  if (!valid.ok) return { ok: false, error: `Tyhle podmínky už podepsat nejde: ${valid.error}`, status: 409 };
  const block = await contractBlock(db, team, sponsor, neg.category, season, st.contracts);
  if (block) return { ok: false, error: block, status: 409 };

  const proposal = valid.proposal;
  const d = proposal.demands;
  const gameDate = teamGameDate(team);
  // Přechod k jiné firmě: stará smlouva končí výpovědí a klub platí poměrnou pokutu.
  const old = st.contracts.active && !st.isRenewal ? st.contracts.active : null;
  const switchFee = old ? prorataTerminationFee(old) : 0;
  const feePaidBySponsor = d.payCurrentFee ? switchFee : 0;
  if (team.budget + d.signingBonus + feePaidBySponsor < switchFee) {
    return { ok: false, error: `Na výpovědní pokutu ${switchFee} Kč u ${old?.sponsor_name ?? "současného sponzora"} nemáš peníze`, status: 400 };
  }

  // Zámek: podepsat jde jen jednou a jen to, co klient viděl (rounds se nezměnila).
  const claim = await db.prepare(
    "UPDATE sponsor_negotiations SET status = 'signed' WHERE id = ? AND team_id = ? AND status = ? AND rounds = ?",
  ).bind(neg.id, teamId, neg.status, neg.roundsRaw).run();
  if ((claim.meta?.changes ?? 0) !== 1) return { ok: false, error: "Smlouva se už podepisuje, načti stránku znovu", status: 409 };

  const contractId = crypto.randomUUID();
  const contractName = neg.category === "stadium" ? stadiumSponsorName(sponsor.name) : sponsor.name;
  const construction = paidConstructionItems(proposal, ctx);
  const ins = await db.prepare(
    `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, win_bonus, seasons_total,
       seasons_remaining, early_termination_fee, is_naming_rights, category, sponsor_id, signing_bonus, paid_construction, negotiation_id)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?
     WHERE ? != 'main' OR ${MAIN_SPONSOR_FREE_SQL}`,
  ).bind(
    contractId, teamId, contractName, sponsor.type, d.monthly, d.winBonus, proposal.seasons, proposal.seasons,
    earlyTerminationFee(d.monthly, proposal.seasons), neg.category, sponsor.id, d.signingBonus,
    construction.length > 0 ? JSON.stringify(construction) : null, neg.id,
    neg.category, sponsor.id, teamId,
  ).run();
  if ((ins.meta?.changes ?? 0) !== 1) {
    await db.prepare("UPDATE sponsor_negotiations SET status = ? WHERE id = ? AND status = 'signed'").bind(neg.status, neg.id).run();
    return { ok: false, error: `${sponsor.name} právě podepsal s jiným klubem`, status: 409 };
  }

  // Stará smlouva v kategorii: při prodloužení vyprší (nahrazena), při přechodu je vypovězená.
  const replaced = st.contracts.active;
  if (replaced) {
    await db.prepare("UPDATE sponsor_contracts SET status = ? WHERE id = ? AND status = 'active'")
      .bind(st.isRenewal ? "expired" : "terminated", replaced.id).run();
  }
  if (old && switchFee > 0) {
    await recordTransaction(db, teamId, "sponsor_termination", -switchFee,
      `Výpovědní pokuta: ${old.sponsor_name}`, gameDate, `sponsor-switch-${contractId}`);
  }
  if (feePaidBySponsor > 0) {
    await recordTransaction(db, teamId, "sponsor_signing", feePaidBySponsor,
      `${sponsor.name} zaplatil výpovědní pokutu za ${old?.sponsor_name ?? "předchozího sponzora"}`, gameDate, `sponsor-fee-${contractId}`);
  }
  if (d.signingBonus > 0) {
    await recordTransaction(db, teamId, "sponsor_signing", d.signingBonus,
      `Příspěvek za podpis: ${sponsor.name}`, gameDate, `sponsor-bonus-${contractId}`);
  }
  for (const item of construction) await applyPaidConstruction(db, teamId, item);

  // Sliby pro etapu 3. Smlouva už platí; když zápis selže, musí to být v logu, ne tiše pryč.
  const rows = buildPromiseRows(proposal, ctx, gameDate);
  if (rows.length > 0) {
    try {
      await db.batch(rows.map((r) => db.prepare(
        `INSERT INTO sponsor_promises (id, contract_id, team_id, sponsor_id, kind, params, season, deadline_game_date, value_share, reward, penalty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), contractId, teamId, sponsor.id, r.kind, JSON.stringify(r.params), r.season,
        r.deadlineGameDate, r.valueShare, r.reward, r.penalty)));
    } catch (e) {
      logger.error({ module: "sponsors", teamId }, `sliby ke smlouvě ${contractId} se nezapsaly (${rows.length} řádků)`, e);
    }
  }

  // Ostatní běžící jednání v téže kategorii ztratila smysl.
  await db.prepare(
    "UPDATE sponsor_negotiations SET status = 'expired' WHERE team_id = ? AND category = ? AND status IN ('open','accepted') AND id != ?",
  ).bind(teamId, neg.category, neg.id).run();

  let newTeamName: string | null = null;
  let reputationPenalty = 0;
  if (neg.category === "main" && !st.isRenewal) {
    newTeamName = (await applyMainSponsorRename(db, teamId, sponsor.name, season)).newName;
    reputationPenalty = 3;
  }
  if (neg.category === "stadium" && !st.isRenewal) await applyStadiumRename(db, teamId, contractName, contractId);

  if (neg.category === "main") {
    // Odcházející majitel se rozloučí, nový přivítá. Doručení hlídá denní limit fronty.
    try {
      const { enqueueMainSponsorSms } = await import("./owner-sms-triggers");
      if (old?.sponsor_id != null) await enqueueMainSponsorSms(db, teamId, old.sponsor_id, "main_lost", `main-lost:${old.id}`);
      if (!st.isRenewal) await enqueueMainSponsorSms(db, teamId, sponsor.id, "main_new", `main-new:${contractId}`, { deliverNow: true });
    } catch (e) {
      logger.warn({ module: "sponsors", teamId }, "SMS majitelů při podpisu hlavního sponzora", e);
    }
  }

  logger.info({ module: "sponsors", teamId },
    `podpis z jednání ${neg.id}: smlouva ${contractId}, ${neg.category}, ${proposal.seasons} sez., ${d.monthly} Kč/měs, slibů ${rows.length}${st.isRenewal ? ", prodloužení" : ""}`);
  return { ok: true, contractId, newTeamName, reputationPenalty };
}
```

- [ ] **Step 4: Route podpisu**

V `apps/api/src/routes/sponsors.ts` za import `import { validateProposal } from "../sponsors/proposal";` přidat `import { signNegotiation } from "../sponsors/signing";` a na konec souboru:

```ts
// POST /api/teams/:teamId/sponsors/negotiations/:negotiationId/accept: podpis přijatého návrhu
// nebo protinabídky. Tělo se nečte: podepisují se podmínky uložené v jednání.
sponsorsRouter.post("/teams/:teamId/sponsors/negotiations/:negotiationId/accept", async (c) => {
  const res = await signNegotiation(c.env.DB, c.req.param("teamId"), c.req.param("negotiationId"));
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json(res);
});
```

- [ ] **Step 5: `routes/game.ts`: GET sponzorů bez pevných nabídek main/stadion**

V handleru `gameRouter.get("/teams/:teamId/sponsors", …)`:

1. Smazat celý úsek od řádku `  // Generate main sponsor offers — vždy, abys mohl porovnat se současnou smlouvou.` až po konec bloku stadionu včetně (poslední řádky úseku jsou `    stadiumOffers.sort((a, b) => b.monthlyAmount - a.monthlyAmount);` a `  }`) a nahradit ho:

```ts
  // Hlavní sponzor a název stadionu se vyjednávají s majitelem firmy (routes/sponsors.ts,
  // sponsors/negotiation*.ts). Pevné nabídky zůstaly jen u bannerů.
  const { mainSponsorBlock } = await import("../sponsors/exclusivity");
```

2. Smazat úsek od řádku `  // Nabídka prodloužení pro každou aktivní smlouvu — nové podmínky dle aktuální reputace` až po řádek `  const [mainContractOut, mainExpired] = await Promise.all([withMainBlock(mainActive), withMainBlock(mainExpiredBase)]);` včetně a nahradit ho:

```ts
  // Bannery se prodlužují za pevné podmínky podle aktuální reputace. Prodloužit jde jen smlouvu
  // v poslední sezóně (nebo vypršelou), jinak šlo klikáním resetovat délku a částky.
  type SpRow = { name: string; monthly_min: number; monthly_max: number; win_bonus_min: number; win_bonus_max: number };
  const renewalFor = (row: Record<string, unknown> | undefined | null) => row && isRenewable(row)
    ? computeRenewalTerms(teamId, seedSeason, row as { sponsor_name: string; category: string | null; monthly_amount: number; win_bonus: number },
        team.reputation, team.size, sponsorRows.results as unknown as SpRow[], seedFromString)
    : null;

  // Hlavní sponzor a stadion: prodloužení je jednání se stejnou firmou. `renewable` říká, jestli
  // na něj už je čas; u hlavního sponzora ho zablokuje exkluzivita (hlavní jinde, přednost jiného klubu).
  const withRenewable = async (row: Record<string, unknown> | null | undefined, cat: "main" | "stadium") => {
    if (!row) return null;
    const base = { ...mapContract(row), renewal: null, renewable: isRenewable(row), blockedReason: null as string | null };
    if (cat === "main" && base.renewable && base.sponsorId) {
      const block = await mainSponsorBlock(c.env.DB, base.sponsorId, teamId, seedSeason);
      if (block) return { ...base, renewable: false, blockedReason: block.reason };
    }
    return base;
  };

  // Nedávno vypršelá smlouva (main/stadium): obnovit jde jednáním se stejnou firmou.
  const lastExpiredFor = (cat: "main" | "stadium") => c.env.DB.prepare(
    "SELECT * FROM sponsor_contracts WHERE team_id = ? AND status = 'expired' AND COALESCE(category, 'main') = ? ORDER BY signed_at DESC LIMIT 1"
  ).bind(teamId, cat).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "game", teamId }, "fetch expired contract", e); return null; });

  const [mainContractOut, mainExpired, stadiumContractOut, stadiumExpired] = await Promise.all([
    withRenewable(mainContract, "main"),
    mainContract ? null : lastExpiredFor("main").then((r) => withRenewable(r, "main")),
    withRenewable(stadiumContract, "stadium"),
    stadiumContract ? null : lastExpiredFor("stadium").then((r) => withRenewable(r, "stadium")),
  ]);

  const { listTeamNegotiations } = await import("../sponsors/negotiation-db");
  const negotiations = await listTeamNegotiations(c.env.DB, teamId)
    .catch((e) => { logger.warn({ module: "game", teamId }, "fetch sponsor negotiations", e); return []; });
```

3. V `return c.json({ … })` téhož handleru nahradit řádky

```ts
    mainContract: mainContractOut,
    stadiumContract: stadiumContract ? { ...mapContract(stadiumContract), renewal: renewalFor(stadiumContract) } : null,
```
za
```ts
    mainContract: mainContractOut,
    stadiumContract: stadiumContractOut,
```
a smazat řádky `    mainOffers,` a `    stadiumOffers,`; za řádek `    season: seasonNum,` přidat `    negotiations,`.

- [ ] **Step 6: `routes/game.ts`: sign a renew jen pro bannery**

1. V `gameRouter.post("/teams/:teamId/sponsors/sign", …)` hned za řádek `  const category = body.category || "main";` vložit:

```ts
  // Hlavní sponzor a název stadionu se podepisují po jednání s majitelem firmy
  // (POST /teams/:teamId/sponsors/negotiations/:id/accept). Tady už jen bannery.
  // Přetypování záměrně: zúžení `category` na "banner" by rozbilo zbylá porovnání níž (TS2367).
  if ((category as string) !== "banner") {
    return c.json({ error: "Hlavního sponzora a název stadionu teď vyjednáváš s majitelem firmy na stránce sponzora" }, 400);
  }
```

2. Ve stejném handleru smazat (kód se přesunul do `sponsors/signing.ts`):
   - blok od `  // Season limit for main sponsor` po jeho zavírací `  }` (končí řádky `    if (block) return c.json({ error: block.reason }, 409);` a `  }`),
   - blok od `  if (category === "main") {` s komentářem `    // Update team name to sponsor name + village` až po `    return c.json({ ok: true, contractId: id, newTeamName: newName, reputationPenalty: 3 });` a jeho zavírací `  }`,
   - blok od `  // Stadium sponsor` až po jeho zavírací `  }` (před `  return c.json({ ok: true, contractId: id });`).

3. V `gameRouter.post("/teams/:teamId/sponsors/renew", …)` za řádek `  if (!contract) return c.json({ error: "Smlouva nenalezena" }, 404);` vložit:

```ts
  // Hlavního sponzora a stadion prodlužuje jednání s majitelem firmy, pevné podmínky mají jen bannery.
  if (((contract.category as string) || "main") !== "banner") {
    return c.json({ error: "Hlavního sponzora a název stadionu prodloužíš jednáním s majitelem firmy" }, 400);
  }
```

- [ ] **Step 7: Testy, typecheck, žádné zbytky**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run src/sponsors`
Expected: všechny soubory `passed` (včetně `signing.test.ts`, 3 testy).

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx tsc --noEmit`
Expected: bez chyb.

Run: `grep -n "mainOffers\|stadiumOffers\|blockedMainSponsorIds\|withMainBlock" /Users/savrik/Projects/fmko/apps/api/src/routes/game.ts`
Expected: žádný výstup.

- [ ] **Step 8: Commit**

```bash
cd /Users/savrik/Projects/fmko
git add apps/api/src/sponsors/signing.ts apps/api/src/sponsors/signing.test.ts apps/api/src/routes/sponsors.ts apps/api/src/routes/game.ts
git commit -m "$(cat <<'EOF'
feat(sponzori): podpis z jednani se sliby a platbami, konec pevnych nabidek hlavniho sponzora a stadionu

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Web: obrazovka jednání a vstupy do ní

**Files:**
- Create: `apps/web/src/lib/sponsor-negotiation.ts`
- Create: `apps/web/src/components/sponsors/negotiation/negotiation-header.tsx`
- Create: `apps/web/src/components/sponsors/negotiation/promise-picker.tsx`
- Create: `apps/web/src/components/sponsors/negotiation/demands-form.tsx`
- Create: `apps/web/src/components/sponsors/negotiation/rounds-history.tsx`
- Create: `apps/web/src/components/sponsors/negotiation/signing-summary.tsx`
- Create: `apps/web/src/components/sponsors/negotiation-entry.tsx`
- Create: `apps/web/src/app/(hra)/sponzor/[id]/jednani/page.tsx`
- Modify: `apps/web/src/components/sponsors/owner-card.tsx` (typ `MyTeamInfo`)
- Modify: `apps/web/src/app/(hra)/sponzor/[id]/page.tsx`
- Modify: `apps/web/src/lib/sponsor-page-types.ts`
- Modify: `apps/web/src/components/sponsors/contracts-tab.tsx`
- Modify: `apps/web/src/components/sponsors/firms-tab.tsx`
- Modify: `apps/web/src/app/(hra)/sponzori/page.tsx`

**Interfaces:**
- Consumes: API z Task 6 a 7 (`NegotiationView`, `NegotiationAvailability`, `NegotiationListItem`, accept → `{ ok, contractId, newTeamName }`), `apiFetch`, `useTeam().setTeam`, `useConfirm`, `FaceAvatar`, `SponsorLink`, `formatCZK`, `personalityLabel`, `favorLabel`, `formatGameDay`, `seasonsAccusative`.
- Produces: stránka `/sponzor/[id]/jednani?id=<negotiationId>`; `NegotiationEntry` na `/sponzor/[id]`; odkaz „Jednat o smlouvě" u firem; prodloužení a hledání hlavního sponzora/stadionu jednáním v záložce Smlouvy; typy `NegotiationView`, `Proposal` a náhledové funkce `estimateRange`, `previewCost`, `emptyProposal` ve web knihovně.

- [ ] **Step 1: `lib/sponsor-negotiation.ts`**

```ts
/**
 * Jednání se sponzorem na webu: tvar API (apps/api/src/sponsors/negotiation-db.ts, NegotiationView)
 * a náhled odhadu ochoty a ceny požadavků pro formulář. Náhled jen radí, rozhoduje server.
 */

export type PromiseKind =
  | "league_position" | "promotion" | "no_relegation" | "cup_round" | "coach_licence" | "stadium_upgrade"
  | "jersey_logo" | "sector_exclusivity" | "attendance" | "youth" | "reputation" | "no_riots";

export interface PromiseParams {
  position?: number; round?: number; level?: number; facility?: string; sector?: string;
  attendance?: number; count?: number; reputation?: number;
}
export interface PromiseSpec { kind: PromiseKind; params: PromiseParams }

export interface Demands {
  monthly: number;
  winBonus: number;
  signingBonus: number;
  goalBonuses: Partial<Record<PromiseKind, number>>;
  construction: string | null;
  equipment: string | null;
  payCurrentFee: boolean;
}
export interface Proposal { seasons: number; promises: PromiseSpec[]; demands: Demands }

export interface Range { low: number; high: number }
export interface PromiseOption {
  kind: PromiseKind; params: PromiseParams; label: string; seasonal: boolean; value: Range; penalty: Range; chance: number;
}
export interface GiftOption { key: string; label: string; level: number; cost: number }

export type ResponseKind = "accept" | "counter_money" | "counter_wish" | "reject" | "insulted" | "walked_away";
export interface NegotiationRound {
  proposal: Proposal;
  response: { kind: ResponseKind; text: string; counter?: Proposal; wish?: PromiseKind; gameDate: string };
}
export interface PromiseRowView {
  kind: PromiseKind; params: PromiseParams; label: string; season: number | null; deadlineGameDate: string | null;
  reward: number; penalty: number;
}
export type NegotiationStatus = "open" | "accepted" | "walked_away" | "expired" | "signed";

export interface NegotiationView {
  id: string;
  sponsorId: number;
  sponsorName: string;
  sponsorType: string;
  category: "main" | "stadium";
  status: NegotiationStatus;
  isRenewal: boolean;
  owner: { firstName: string; lastName: string; personality: string; faceConfig: Record<string, unknown> };
  favor: number;
  wishes: PromiseKind[];
  patience: number;
  expiresGameDate: string;
  cooldownUntil: string | null;
  estimate: { base: Range; cap: Range; cautiousSeasonBonus: number };
  winBonusFactor: number;
  monthsPerSeason: number;
  catalog: PromiseOption[];
  construction: GiftOption[];
  equipment: GiftOption[];
  current: null | { sponsorName: string; monthlyAmount: number; winBonus: number; seasonsRemaining: number; terminationFee: number; sameSponsor: boolean };
  rounds: NegotiationRound[];
  pending: null | {
    proposal: Proposal; promises: PromiseRowView[]; terminationFee: number; constructionCost: number;
    equipmentCost: number; currentFee: number; renamesClub: boolean;
  };
  season: number;
}

/** Dostupnost jednání z GET /api/sponsors/:id (myTeam.negotiation). */
export interface NegotiationAvailability { canOpen: boolean; reason: string | null; isRenewal: boolean; openId: string | null }

export const PROMISE_ORDER: readonly PromiseKind[] = [
  "league_position", "promotion", "no_relegation", "cup_round", "coach_licence", "stadium_upgrade",
  "jersey_logo", "sector_exclusivity", "attendance", "youth", "reputation", "no_riots",
];

export const PROMISE_LABELS: Record<PromiseKind, string> = {
  league_position: "Umístění v lize",
  promotion: "Postup",
  no_relegation: "Nesestup",
  cup_round: "Pohár",
  coach_licence: "Trenérská licence",
  stadium_upgrade: "Modernizace stadionu",
  jersey_logo: "Logo na rukávu",
  sector_exclusivity: "Exkluzivita oboru",
  attendance: "Návštěva",
  youth: "Mladí hráči",
  reputation: "Reputace",
  no_riots: "Klid na tribunách",
};

/** Kdy slib platí (shodně s promise-kinds.ts na API). */
export const PROMISE_TIMING: Record<PromiseKind, string> = {
  league_position: "každou sezónu od příští",
  promotion: "každou sezónu od příští",
  no_relegation: "každou sezónu od příští",
  cup_round: "každou sezónu od příští",
  coach_licence: "do 16 týdnů",
  stadium_upgrade: "do 16 týdnů",
  jersey_logo: "do 16 týdnů",
  sector_exclusivity: "po celou smlouvu",
  attendance: "každou sezónu od příští",
  youth: "každou sezónu od příští",
  reputation: "každou sezónu od příští",
  no_riots: "každou sezónu od příští",
};

export const RESPONSE_LABELS: Record<ResponseKind, string> = {
  accept: "Přijal",
  counter_money: "Protinabídka",
  counter_wish: "Protinabídka za slib",
  reject: "Odmítl",
  insulted: "Odmítl a urazil se",
  walked_away: "Odešel od jednání",
};

/** Klíč parametrů slibu. Parametry vždy kopírujeme z katalogu serveru, pořadí klíčů tedy sedí. */
export function optionKey(params: PromiseParams): string {
  return JSON.stringify(params);
}

export function findOption(view: NegotiationView, spec: PromiseSpec): PromiseOption | undefined {
  const key = optionKey(spec.params);
  return view.catalog.find((o) => o.kind === spec.kind && optionKey(o.params) === key);
}

/** Odhad ochoty s vybranými sliby: rozmezí se sčítá lineárně (každá položka má stejnou šířku). */
export function estimateRange(view: NegotiationView, promises: PromiseSpec[], seasons: number): Range {
  let low = view.estimate.base.low;
  let high = view.estimate.base.high;
  for (const p of promises) {
    const o = findOption(view, p);
    if (o) { low += o.value.low; high += o.value.high; }
  }
  const mult = 1 + view.estimate.cautiousSeasonBonus * (seasons - 1);
  return {
    low: Math.min(view.estimate.cap.low, Math.round(low * mult)),
    high: Math.min(view.estimate.cap.high, Math.round(high * mult)),
  };
}

/** Kolik návrh sponzora stojí měsíčně, stejný vzorec jako costBreakdown na API. */
export function previewCost(view: NegotiationView, p: Proposal): number {
  const m = p.seasons * view.monthsPerSeason;
  const d = p.demands;
  let cost = d.monthly + d.winBonus * view.winBonusFactor + d.signingBonus / m;
  for (const spec of p.promises) {
    const g = d.goalBonuses[spec.kind] ?? 0;
    const o = findOption(view, spec);
    if (g > 0 && o) cost += (g * o.chance * (o.seasonal ? Math.max(0, p.seasons - 1) : 1)) / m;
  }
  if (d.construction) cost += (view.construction.find((x) => x.key === d.construction)?.cost ?? 0) / m;
  if (d.equipment) cost += (view.equipment.find((x) => x.key === d.equipment)?.cost ?? 0) / m;
  if (d.payCurrentFee && view.current && !view.current.sameSponsor) cost += view.current.terminationFee / m;
  return Math.round(cost);
}

export function emptyProposal(view: NegotiationView): Proposal {
  return {
    seasons: 2,
    promises: [],
    demands: {
      monthly: Math.max(100, Math.round(view.estimate.base.low / 100) * 100),
      winBonus: 0, signingBonus: 0, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false,
    },
  };
}

/** Sezónní sliby u smlouvy na 1 sezónu nejdou: při zkrácení je z návrhu vyhodíme i s bonusy. */
export function withSeasons(view: NegotiationView, p: Proposal, seasons: number): Proposal {
  if (seasons >= 2) return { ...p, seasons };
  const keep = p.promises.filter((s) => !findOption(view, s)?.seasonal);
  const kinds = new Set(keep.map((s) => s.kind));
  const goalBonuses = Object.fromEntries(Object.entries(p.demands.goalBonuses).filter(([k]) => kinds.has(k as PromiseKind)));
  return { ...p, seasons, promises: keep, demands: { ...p.demands, goalBonuses } };
}

export function categoryLabel(c: "main" | "stadium"): string {
  return c === "main" ? "Hlavní sponzor" : "Název stadionu";
}
```

- [ ] **Step 2: Hlavička (majitel, přání, trpělivost, odhad, srovnání)**

`apps/web/src/components/sponsors/negotiation/negotiation-header.tsx`:

```tsx
"use client";

import { Card, CardBody } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { SponsorLink } from "@/components/sponsors/sponsor-link";
import { formatGameDay, remainingSeasonsText } from "@/lib/sponsor-format";
import { categoryLabel, PROMISE_LABELS, type NegotiationView, type Range } from "@/lib/sponsor-negotiation";
import { favorLabel, formatCZK, personalityLabel } from "@/lib/sponsor-owners";

function pokusy(n: number): string {
  return n === 1 ? "1 pokus" : n >= 2 && n <= 4 ? `${n} pokusy` : `${n} pokusů`;
}

export function NegotiationHeader({ view, estimate, cost }: { view: NegotiationView; estimate: Range; cost: number }) {
  const name = `${view.owner.firstName} ${view.owner.lastName}`;
  const over = cost > estimate.high;
  const under = cost <= estimate.low;
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start gap-4">
          <FaceAvatar faceConfig={view.owner.faceConfig} size={64} className="shrink-0" />
          <div className="min-w-0">
            <div className="text-sm text-muted font-heading uppercase tracking-wide">
              {categoryLabel(view.category)}{view.isRenewal ? " · prodloužení" : ""}
            </div>
            <SponsorLink id={view.sponsorId} name={view.sponsorName} className="font-heading font-bold text-base" />
            <div className="text-sm text-muted">
              {name}, {personalityLabel(view.owner.personality)} · {favorLabel(view.favor)} ({view.favor})
            </div>
          </div>
        </div>

        {view.wishes.length > 0 && (
          <div>
            <div className="text-sm text-muted mb-1">Majitel by rád slyšel:</div>
            <div className="flex flex-wrap gap-1.5">
              {view.wishes.map((w) => (
                <span key={w} className="px-2.5 py-1 rounded-full bg-gold-50 text-gold-700 text-sm font-heading font-bold">{PROMISE_LABELS[w]}</span>
              ))}
            </div>
          </div>
        )}

        <div className="text-sm space-y-1">
          <div>Trpělivost: <span className="font-heading font-bold">{pokusy(view.patience)}</span> na odmítnutí</div>
          <div className="text-muted">Jednání platí do {formatGameDay(view.expiresGameDate)}.</div>
          <div>
            Ochota zhruba <span className="font-heading font-bold">{formatCZK(estimate.low)} až {formatCZK(estimate.high)}</span> měsíčně.
            Tvůj návrh ho stojí <span className={`font-heading font-bold ${over ? "text-card-red" : under ? "text-pitch-600" : "text-gold-600"}`}>{formatCZK(cost)}</span> měsíčně.
          </div>
          <p className="text-sm text-muted">Čím lepší vztah s majitelem, tím přesnější odhad.</p>
        </div>

        {view.current && (
          <div className="pt-3 border-t border-line-soft text-sm">
            <div className="text-muted">
              {view.current.sameSponsor ? "Současná smlouva" : `Současný sponzor ${view.current.sponsorName}`}:{" "}
              <span className="font-heading font-bold text-ink">{formatCZK(view.current.monthlyAmount)}</span> měsíčně
              {view.current.winBonus > 0 ? `, ${formatCZK(view.current.winBonus)} za výhru` : ""}, {remainingSeasonsText(view.current.seasonsRemaining).toLowerCase()}.
            </div>
            {!view.current.sameSponsor && (
              <div className="text-card-red">Přechod znamená výpovědní pokutu {formatCZK(view.current.terminationFee)}.</div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
```

Pozn.: všechny použité barevné třídy (`bg-gold-50`, `text-gold-700`, `text-gold-600`, `bg-surface-2`, `border-line-soft`, `rounded-control`, `bg-pitch-50`) se v projektu už používají, nevzniknou mrtvé třídy (paměť `reference_mrtve_tailwind_tridy.md`).

- [ ] **Step 3: Výběr slibů**

`apps/web/src/components/sponsors/negotiation/promise-picker.tsx`:

```tsx
"use client";

import { formatCZK } from "@/lib/sponsor-owners";
import {
  findOption, optionKey, PROMISE_LABELS, PROMISE_ORDER, PROMISE_TIMING,
  type NegotiationView, type PromiseKind, type PromiseSpec,
} from "@/lib/sponsor-negotiation";

/** Sliby jako karty: klepnutím přidat nebo odebrat, u vybraného zvolit parametr. */
export function PromisePicker({ view, seasons, promises, onChange }: {
  view: NegotiationView; seasons: number; promises: PromiseSpec[]; onChange: (next: PromiseSpec[]) => void;
}) {
  const kinds = PROMISE_ORDER.filter((k) => view.catalog.some((o) => o.kind === k));
  const selected = new Map(promises.map((p) => [p.kind, p] as const));

  const toggle = (kind: PromiseKind) => {
    if (selected.has(kind)) {
      onChange(promises.filter((p) => p.kind !== kind));
      return;
    }
    const options = view.catalog.filter((o) => o.kind === kind);
    // Výchozí parametr: prostřední možnost (umístění v půlce tabulky, ne hned 1. místo).
    const first = options[Math.floor((options.length - 1) / 2)];
    if (first) onChange([...promises, { kind, params: first.params }]);
  };

  const pick = (kind: PromiseKind, key: string) => {
    const o = view.catalog.find((x) => x.kind === kind && optionKey(x.params) === key);
    if (o) onChange(promises.map((p) => (p.kind === kind ? { kind, params: o.params } : p)));
  };

  return (
    <div className="space-y-2">
      {seasons < 2 && (
        <p className="text-sm text-muted">Sezónní sliby platí až od příští sezóny. U smlouvy na 1 sezónu je dát nejde.</p>
      )}
      {kinds.map((kind) => {
        const options = view.catalog.filter((o) => o.kind === kind);
        const disabled = options[0].seasonal && seasons < 2;
        const chosen = selected.get(kind);
        const opt = chosen ? findOption(view, chosen) : undefined;
        const isWish = view.wishes.includes(kind);
        return (
          <div key={kind} className={`rounded-soft border p-3 ${chosen ? "border-pitch-500 bg-pitch-50" : "border-line-soft bg-white"} ${disabled ? "opacity-50" : ""}`}>
            <button
              type="button" onClick={() => toggle(kind)} disabled={disabled} aria-pressed={!!chosen}
              className="w-full min-h-11 flex items-center justify-between gap-3 text-left"
            >
              <span className="min-w-0">
                <span className="block font-heading font-bold text-base">{PROMISE_LABELS[kind]}</span>
                <span className="block text-sm text-muted">{PROMISE_TIMING[kind]}{isWish ? " · přání majitele" : ""}</span>
              </span>
              <span className="text-sm font-heading font-bold shrink-0 text-pitch-600">{chosen ? "Slíbeno" : "Přidat"}</span>
            </button>
            {chosen && (
              <div className="mt-2 space-y-2">
                {options.length > 1 ? (
                  <select
                    value={optionKey(chosen.params)} onChange={(e) => pick(kind, e.target.value)}
                    className="input w-full min-h-11 text-base" aria-label={`Parametr slibu ${PROMISE_LABELS[kind]}`}
                  >
                    {options.map((o) => <option key={optionKey(o.params)} value={optionKey(o.params)}>{o.label}</option>)}
                  </select>
                ) : (
                  <div className="text-sm">{options[0].label}</div>
                )}
                {opt && (
                  <div className="text-sm text-muted">
                    Ochota stoupne zhruba o {formatCZK(opt.value.low)} až {formatCZK(opt.value.high)} měsíčně.
                    Za nesplnění pokuta {formatCZK(opt.penalty.low)} až {formatCZK(opt.penalty.high)}{opt.seasonal ? " za každou sezónu" : ""}.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Požadavky a délka smlouvy**

`apps/web/src/components/sponsors/negotiation/demands-form.tsx`:

```tsx
"use client";

import { formatCZK } from "@/lib/sponsor-owners";
import { seasonsAccusative } from "@/lib/sponsor-format";
import { PROMISE_LABELS, type Demands, type NegotiationView, type Proposal } from "@/lib/sponsor-negotiation";

function MoneyInput({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="block text-sm font-heading font-bold">{label}</span>
      {hint && <span className="block text-sm text-muted">{hint}</span>}
      <input
        type="number" inputMode="numeric" min={0} step={100} value={value}
        onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))}
        className="input w-full min-h-11 text-base mt-1 tabular-nums"
      />
    </label>
  );
}

export function DemandsForm({ view, proposal, onChange }: {
  view: NegotiationView; proposal: Proposal; onChange: (next: Proposal) => void;
}) {
  const d = proposal.demands;
  const set = (patch: Partial<Demands>) => onChange({ ...proposal, demands: { ...d, ...patch } });
  const switching = view.current && !view.current.sameSponsor && view.current.terminationFee > 0;
  return (
    <div className="space-y-4">
      <MoneyInput label="Měsíčně" value={d.monthly} onChange={(v) => set({ monthly: v })} />
      {view.category === "main" && (
        <MoneyInput label="Za každou výhru" value={d.winBonus} onChange={(v) => set({ winBonus: v })} />
      )}
      <MoneyInput label="Za podpis" hint="Jednorázově hned při podpisu." value={d.signingBonus} onChange={(v) => set({ signingBonus: v })} />

      {proposal.promises.map((p) => (
        <MoneyInput
          key={p.kind} label={`Bonus za splnění: ${PROMISE_LABELS[p.kind]}`}
          hint="Vyplatí se za každý splněný slib."
          value={d.goalBonuses[p.kind] ?? 0}
          onChange={(v) => set({ goalBonuses: { ...d.goalBonuses, [p.kind]: v } })}
        />
      ))}

      {view.construction.length > 0 && (
        <label className="block">
          <span className="block text-sm font-heading font-bold">Stavba, kterou sponzor zaplatí</span>
          <select
            value={d.construction ?? ""} onChange={(e) => set({ construction: e.target.value || null })}
            className="input w-full min-h-11 text-base mt-1"
          >
            <option value="">Nic</option>
            {view.construction.map((o) => (
              <option key={o.key} value={o.key}>{o.label} na úroveň {o.level} ({formatCZK(o.cost)})</option>
            ))}
          </select>
        </label>
      )}

      {view.equipment.length > 0 && (
        <label className="block">
          <span className="block text-sm font-heading font-bold">Vybavení od sponzora</span>
          <select
            value={d.equipment ?? ""} onChange={(e) => set({ equipment: e.target.value || null })}
            className="input w-full min-h-11 text-base mt-1"
          >
            <option value="">Nic</option>
            {view.equipment.map((o) => (
              <option key={o.key} value={o.key}>{o.label} na úroveň {o.level} ({formatCZK(o.cost)})</option>
            ))}
          </select>
        </label>
      )}

      {switching && view.current && (
        <label className="flex items-start gap-3 min-h-11">
          <input
            type="checkbox" checked={d.payCurrentFee} onChange={(e) => set({ payCurrentFee: e.target.checked })}
            className="mt-1 h-5 w-5 shrink-0"
          />
          <span className="text-sm">
            Ať sponzor zaplatí výpovědní pokutu u {view.current.sponsorName} ({formatCZK(view.current.terminationFee)}).
          </span>
        </label>
      )}

      <div>
        <div className="text-sm font-heading font-bold mb-1">Délka smlouvy</div>
        <div className="flex gap-1.5" role="group" aria-label="Délka smlouvy">
          {[1, 2, 3].map((n) => (
            <button
              key={n} type="button" aria-pressed={proposal.seasons === n}
              onClick={() => onChange({ ...proposal, seasons: n })}
              className={`flex-1 min-h-11 rounded-control text-sm font-heading font-bold ${proposal.seasons === n ? "bg-pitch-500 text-white" : "bg-surface-2 text-muted"}`}
            >
              {seasonsAccusative(n)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

Pozn.: změnu délky na 1 sezónu musí stránka prohnat `withSeasons` (Step 7 to dělá v `onChange`).

- [ ] **Step 5: Historie kol**

`apps/web/src/components/sponsors/negotiation/rounds-history.tsx`:

```tsx
"use client";

import { Card, CardBody } from "@/components/ui";
import { formatCZK } from "@/lib/sponsor-owners";
import { seasonsAccusative } from "@/lib/sponsor-format";
import { PROMISE_LABELS, RESPONSE_LABELS, type NegotiationRound, type Proposal } from "@/lib/sponsor-negotiation";

function summary(p: Proposal): string {
  const parts = [`${formatCZK(p.demands.monthly)} měsíčně`, `na ${seasonsAccusative(p.seasons)}`];
  if (p.demands.winBonus > 0) parts.push(`${formatCZK(p.demands.winBonus)} za výhru`);
  if (p.demands.signingBonus > 0) parts.push(`${formatCZK(p.demands.signingBonus)} za podpis`);
  if (p.promises.length > 0) parts.push(`sliby: ${p.promises.map((s) => PROMISE_LABELS[s.kind].toLowerCase()).join(", ")}`);
  return parts.join(", ");
}

/** Kola jednání od nejnovějšího: co klub navrhl a co majitel odpověděl. */
export function RoundsHistory({ rounds, ownerName, onUseCounter }: {
  rounds: NegotiationRound[]; ownerName: string; onUseCounter?: (p: Proposal) => void;
}) {
  if (rounds.length === 0) return null;
  const ordered = [...rounds].reverse();
  return (
    <Card>
      <CardBody className="space-y-3">
        {ordered.map((r, i) => (
          <div key={rounds.length - i} className={i > 0 ? "pt-3 border-t border-line-soft" : ""}>
            <div className="text-sm text-muted">Kolo {rounds.length - i}: {summary(r.proposal)}</div>
            <div className="text-base mt-1">
              <span className="font-heading font-bold">{ownerName}:</span> „{r.response.text}“
            </div>
            <div className="text-sm font-heading font-bold text-gold-600">{RESPONSE_LABELS[r.response.kind]}</div>
            {r.response.counter && (
              <div className="text-sm mt-1">
                Protinabídka: {summary(r.response.counter)}
                {i === 0 && onUseCounter && (
                  <button type="button" onClick={() => onUseCounter(r.response.counter!)} className="block min-h-11 text-sm text-pitch-600 font-heading font-bold">
                    Upravit protinabídku a navrhnout znovu
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 6: Shrnutí před podpisem**

`apps/web/src/components/sponsors/negotiation/signing-summary.tsx`:

```tsx
"use client";

import { Card, CardBody, SectionLabel } from "@/components/ui";
import { formatCZK } from "@/lib/sponsor-owners";
import { formatGameDay, seasonsAccusative } from "@/lib/sponsor-format";
import type { NegotiationView } from "@/lib/sponsor-negotiation";

/** Co se podepíše: platby, stavba, všechny sliby s odměnou a pokutou. Bez tlačítka, to je na konci stránky. */
export function SigningSummary({ view }: { view: NegotiationView }) {
  const p = view.pending;
  if (!p) return null;
  const d = p.proposal.demands;
  return (
    <section>
      <SectionLabel>{view.status === "accepted" ? "Majitel souhlasí" : "Protinabídka k podpisu"}</SectionLabel>
      <Card>
        <CardBody className="space-y-2 text-sm">
          <div>Měsíčně <span className="font-heading font-bold text-pitch-600">{formatCZK(d.monthly)}</span> na {seasonsAccusative(p.proposal.seasons)}</div>
          {d.winBonus > 0 && <div>Za výhru {formatCZK(d.winBonus)}</div>}
          {d.signingBonus > 0 && <div>Za podpis hned {formatCZK(d.signingBonus)}</div>}
          {d.construction && <div>Sponzor zaplatí stavbu za {formatCZK(p.constructionCost)}</div>}
          {d.equipment && <div>Sponzor koupí vybavení za {formatCZK(p.equipmentCost)}</div>}
          {p.currentFee > 0 && <div>Sponzor zaplatí výpovědní pokutu {formatCZK(p.currentFee)}</div>}
          {view.current && !view.current.sameSponsor && p.currentFee === 0 && (
            <div className="text-card-red">Výpovědní pokutu {formatCZK(view.current.terminationFee)} u {view.current.sponsorName} platí klub.</div>
          )}
          <div className="text-muted">Výpovědní pokuta nové smlouvy {formatCZK(p.terminationFee)}.</div>
          {p.renamesClub && <div className="text-gold-600">Klub ponese jméno sponzora, -3 reputace.</div>}
          {p.promises.length > 0 && (
            <ul className="pt-2 border-t border-line-soft space-y-1.5">
              {p.promises.map((r, i) => (
                <li key={i}>
                  <span className="font-heading font-bold">{r.label}</span>
                  <span className="text-muted">
                    {r.season ? `, sezóna ${r.season}` : r.deadlineGameDate ? `, do ${formatGameDay(r.deadlineGameDate)}` : ", po celou smlouvu"}
                  </span>
                  <div>
                    {r.reward > 0 && <span className="text-pitch-600">odměna {formatCZK(r.reward)}, </span>}
                    <span className="text-card-red">pokuta {formatCZK(r.penalty)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </section>
  );
}
```

- [ ] **Step 7: Stránka `/sponzor/[id]/jednani`**

`apps/web/src/app/(hra)/sponzor/[id]/jednani/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { ErrorBox, SectionLabel, Spinner, useConfirm } from "@/components/ui";
import { formatCZK } from "@/lib/sponsor-owners";
import { seasonsAccusative } from "@/lib/sponsor-format";
import {
  emptyProposal, estimateRange, previewCost, withSeasons, type NegotiationView, type PromiseKind, type Proposal,
} from "@/lib/sponsor-negotiation";
import { NegotiationHeader } from "@/components/sponsors/negotiation/negotiation-header";
import { PromisePicker } from "@/components/sponsors/negotiation/promise-picker";
import { DemandsForm } from "@/components/sponsors/negotiation/demands-form";
import { RoundsHistory } from "@/components/sponsors/negotiation/rounds-history";
import { SigningSummary } from "@/components/sponsors/negotiation/signing-summary";

const CLOSED_TEXT: Record<string, string> = {
  walked_away: "Majitel od jednání odešel. Chvíli s vámi jednat nebude.",
  expired: "Jednání vypršelo. Nové otevřeš na stránce sponzora.",
  signed: "Smlouva je podepsaná.",
};

export default function NegotiationPage() {
  const { id: sponsorId } = useParams<{ id: string }>();
  const router = useRouter();
  const { teamId, setTeam } = useTeam();
  // undefined = ještě nečteno z adresy, null = adresa id nemá.
  const [negId, setNegId] = useState<string | null | undefined>(undefined);
  const [view, setView] = useState<NegotiationView | null>(null);
  const [draft, setDraft] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    setNegId(new URLSearchParams(window.location.search).get("id"));
  }, []);

  useEffect(() => {
    if (!teamId || !negId) return;
    apiFetch<NegotiationView>(`/api/teams/${teamId}/sponsors/negotiations/${negId}`)
      .then((v) => { setView(v); setDraft((d) => d ?? emptyProposal(v)); })
      .catch((e) => { console.error("jednání se sponzorem:", e); setError((e as Error).message); });
  }, [teamId, negId]);

  const propose = async () => {
    if (!teamId || !view || !draft || acting) return;
    setActing(true);
    setError(null);
    const v = await apiFetch<NegotiationView>(`/api/teams/${teamId}/sponsors/negotiations/${view.id}/propose`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
    }).catch((e) => { console.error("návrh sponzorovi:", e); setError((e as Error).message); return null; });
    if (v) setView(v);
    setActing(false);
  };

  const sign = async () => {
    if (!teamId || !view?.pending || acting) return;
    const p = view.pending;
    const d = p.proposal.demands;
    const ok = await confirm({
      title: `Podepsat smlouvu s ${view.sponsorName}?`,
      description: `Smlouva na ${seasonsAccusative(p.proposal.seasons)}. Slibů: ${p.promises.length}. Nesplněné sliby stojí pokutu, dvě porušení v sezóně a sponzor smlouvu vypoví.`,
      details: [
        { label: "Měsíčně", value: `+${formatCZK(d.monthly)}`, color: "text-pitch-500" },
        ...(d.signingBonus > 0 ? [{ label: "Za podpis", value: `+${formatCZK(d.signingBonus)}`, color: "text-pitch-500" }] : []),
        ...(view.current && !view.current.sameSponsor && p.currentFee === 0
          ? [{ label: "Výpovědní pokuta", value: `-${formatCZK(view.current.terminationFee)}`, color: "text-card-red" }] : []),
        ...(p.renamesClub ? [{ label: "Dopad na reputaci", value: "-3 reputace", color: "text-card-red" }] : []),
      ],
      confirmLabel: "Podepsat",
    });
    if (!ok) return;
    setActing(true);
    setError(null);
    const res = await apiFetch<{ ok: boolean; newTeamName: string | null }>(
      `/api/teams/${teamId}/sponsors/negotiations/${view.id}/accept`, { method: "POST" },
    ).catch((e) => { console.error("podpis smlouvy se sponzorem:", e); setError((e as Error).message); return null; });
    if (res?.newTeamName) setTeam(teamId, res.newTeamName);
    setActing(false);
    if (res?.ok) router.push("/sponzori");
  };

  if (negId === null) {
    return (
      <div className="page-container space-y-3">
        <ErrorBox message="Jednání nenalezeno." />
        <Link href={`/sponzor/${sponsorId}`} className="text-pitch-600 underline text-base">Zpět na sponzora</Link>
      </div>
    );
  }
  if (error && !view) return <div className="page-container"><ErrorBox message={error} /></div>;
  if (!view || !draft) return <div className="flex justify-center py-12"><Spinner /></div>;

  const estimate = estimateRange(view, draft.promises, draft.seasons);
  const cost = previewCost(view, draft);
  const open = view.status === "open";
  const ownerName = `${view.owner.firstName} ${view.owner.lastName}`;

  return (
    <div className="page-container space-y-5">
      {dialog}
      <NegotiationHeader view={view} estimate={estimate} cost={cost} />
      <RoundsHistory
        rounds={view.rounds} ownerName={ownerName}
        onUseCounter={open ? (p) => setDraft(p) : undefined}
      />

      {CLOSED_TEXT[view.status] && (
        <div className="text-sm bg-surface-2 rounded-soft px-3 py-2">{CLOSED_TEXT[view.status]}</div>
      )}

      {open && (
        <>
          <section>
            <SectionLabel>Sliby klubu</SectionLabel>
            <PromisePicker
              view={view} seasons={draft.seasons} promises={draft.promises}
              onChange={(promises) => {
                const kinds = new Set(promises.map((p) => p.kind));
                const goalBonuses = Object.fromEntries(Object.entries(draft.demands.goalBonuses).filter(([k]) => kinds.has(k as PromiseKind)));
                setDraft({ ...draft, promises, demands: { ...draft.demands, goalBonuses } });
              }}
            />
          </section>
          <section>
            <SectionLabel>Co chceš od sponzora</SectionLabel>
            <DemandsForm view={view} proposal={draft} onChange={(p) => setDraft(withSeasons(view, p, p.seasons))} />
          </section>
        </>
      )}

      <SigningSummary view={view} />

      {error && <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">{error}</div>}

      {/* Odesílací tlačítka vždy na konci stránky, bez částek. */}
      <div className="flex flex-col gap-2">
        {view.pending && (
          <button type="button" onClick={sign} disabled={acting} className="btn btn-primary w-full min-h-11">Podepsat smlouvu</button>
        )}
        {open && (
          <button type="button" onClick={propose} disabled={acting} className={`btn ${view.pending ? "btn-ghost" : "btn-primary"} w-full min-h-11`}>
            Navrhnout
          </button>
        )}
        <Link href={`/sponzor/${view.sponsorId}`} className="text-center text-sm text-muted min-h-11 leading-[2.75rem]">Zpět na sponzora</Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Vstup z `/sponzor/[id]`**

1. V `apps/web/src/components/sponsors/owner-card.tsx` do `export interface MyTeamInfo` za řádek `  budgetEstimate: { low: number; high: number };` vložit:

```ts
  /** Jestli jde s firmou jednat o hlavního sponzora a o název stadionu (null = neznámo). */
  negotiation?: null | {
    main: import("@/lib/sponsor-negotiation").NegotiationAvailability;
    stadium: import("@/lib/sponsor-negotiation").NegotiationAvailability;
  };
```

2. Vytvořit `apps/web/src/components/sponsors/negotiation-entry.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Card, CardBody, SectionLabel } from "@/components/ui";
import { categoryLabel, type NegotiationAvailability } from "@/lib/sponsor-negotiation";

/** Tlačítka „Jednat o …" na stránce sponzora. Otevře (nebo obnoví) jednání a přejde na jeho obrazovku. */
export function NegotiationEntry({ sponsorId, teamId, availability }: {
  sponsorId: number;
  teamId: string;
  availability: { main: NegotiationAvailability; stadium: NegotiationAvailability };
}) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (category: "main" | "stadium") => {
    const a = availability[category];
    if (acting) return;
    if (a.openId) {
      router.push(`/sponzor/${sponsorId}/jednani?id=${a.openId}`);
      return;
    }
    setActing(true);
    setError(null);
    const v = await apiFetch<{ id: string }>(`/api/teams/${teamId}/sponsors/${sponsorId}/negotiations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category }),
    }).catch((e) => { console.error("otevření jednání:", e); setError((e as Error).message); return null; });
    setActing(false);
    if (v) router.push(`/sponzor/${sponsorId}/jednani?id=${v.id}`);
  };

  return (
    <section>
      <SectionLabel>{"\u{1F91D}"} Jednání o smlouvě</SectionLabel>
      <Card>
        <CardBody className="space-y-3">
          {(["main", "stadium"] as const).map((cat) => {
            const a = availability[cat];
            const label = a.openId
              ? `Pokračovat v jednání: ${categoryLabel(cat).toLowerCase()}`
              : a.isRenewal ? `Jednat o prodloužení: ${categoryLabel(cat).toLowerCase()}` : `Jednat: ${categoryLabel(cat).toLowerCase()}`;
            return (
              <div key={cat}>
                <button type="button" onClick={() => go(cat)} disabled={acting || !a.canOpen} className="btn btn-primary w-full min-h-11">
                  {label}
                </button>
                {!a.canOpen && a.reason && <div className="text-sm text-muted mt-1">{a.reason}.</div>}
              </div>
            );
          })}
          {error && <div className="text-sm text-card-red">{error}</div>}
        </CardBody>
      </Card>
    </section>
  );
}
```

3. V `apps/web/src/app/(hra)/sponzor/[id]/page.tsx`:
   - za import `import { OwnerCard, type OwnerInfo, type MyTeamInfo } from "@/components/sponsors/owner-card";` přidat `import { NegotiationEntry } from "@/components/sponsors/negotiation-entry";`
   - za blok `{data.owner && ( <OwnerCard … /> )}` (končí řádkem `      )}` po `<OwnerCard sponsorId={data.id} teamId={teamId} owner={data.owner} myTeam={data.myTeam} onChanged={load} />`) vložit:

```tsx
      {teamId && data.myTeam?.negotiation && (
        <NegotiationEntry sponsorId={data.id} teamId={teamId} availability={data.myTeam.negotiation} />
      )}
```

- [ ] **Step 9: Záložky Smlouvy a Firmy bez pevných nabídek**

1. `apps/web/src/lib/sponsor-page-types.ts`:
   - v `ActiveContract` za řádek `  blockedReason?: string | null;` přidat:
```ts
  /** Hlavní sponzor a stadion: dá se už jednat o prodloužení (poslední sezóna nebo vypršelá smlouva). */
  renewable?: boolean;
```
   - v `SponsorsData` smazat řádky `  mainOffers: SponsorOffer[];` a `  stadiumOffers: SponsorOffer[];` a za `  season: number;` přidat:
```ts
  /** Běžící jednání s firmami (otevřená nebo přijatá, čekající na podpis). */
  negotiations: Array<{ id: string; sponsorId: number; sponsorName: string; category: "main" | "stadium"; status: "open" | "accepted"; expiresGameDate: string }>;
```

2. `apps/web/src/components/sponsors/contracts-tab.tsx`: nahradit celé sekce „Hlavní sponzor" a „Sponzor stadionu" (od `      {/* ── Hlavní sponzor ── */}` po řádek před `      {/* ── Reklamní bannery ── */}`) tímto:

```tsx
      {/* ── Hlavní sponzor a stadion: jen jednáním s majitelem firmy ── */}
      {(["main", "stadium"] as const).map((cat) => {
        const active = cat === "main" ? data.mainContract : data.stadiumContract;
        const expired = cat === "main" ? data.mainExpired : data.stadiumExpired;
        const running = data.negotiations.filter((n) => n.category === cat);
        return (
          <section key={cat}>
            <SectionLabel>
              {cat === "main" ? "\u{1F4DD} Hlavní sponzor" : `\u{1F3DF} Sponzor stadionu ${data.stadiumName ? `(${data.stadiumName})` : ""}`}
            </SectionLabel>
            <div className="space-y-3">
              {active && (
                <ContractCard contract={active} favor={favorOf(active)} acting={acting}
                  onTerminate={() => onTerminate(cat)} onRenew={() => onRenew(cat)} />
              )}
              {!active && expired && (
                <Card>
                  <CardBody className="space-y-1">
                    <SponsorLink id={expired.sponsorId} name={expired.sponsorName} className="font-heading font-bold text-base" />
                    <div className="text-sm text-muted">
                      {expired.renewable
                        ? "Smlouva vypršela. O nové se domluvíš s majitelem firmy."
                        : `Smlouva vypršela a obnovit ji nejde: ${expired.blockedReason ?? "firma teď nejedná"}.`}
                    </div>
                    {expired.renewable && expired.sponsorId && (
                      <Link href={`/sponzor/${expired.sponsorId}`} className="inline-block min-h-11 leading-[2.75rem] text-sm text-pitch-600 font-heading font-bold">
                        🤝 Jednat o obnovení
                      </Link>
                    )}
                  </CardBody>
                </Card>
              )}
              {running.map((n) => (
                <Card key={n.id}>
                  <CardBody className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <SponsorLink id={n.sponsorId} name={n.sponsorName} className="font-heading font-bold text-base" />
                      <div className="text-sm text-muted">{n.status === "accepted" ? "Souhlasí, čeká na podpis" : "Jednání běží"}</div>
                    </div>
                    <Link href={`/sponzor/${n.sponsorId}/jednani?id=${n.id}`} className="shrink-0 btn btn-primary btn-sm">Pokračovat</Link>
                  </CardBody>
                </Card>
              ))}
              {cat === "main" && !data.canChangeMainSponsor && (
                <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">
                  Hlavního sponzora jde změnit jen jednou za sezónu, tahle sezóna je vyčerpaná. Prodloužit současnou smlouvu jde dál.
                </div>
              )}
              <p className="text-sm text-muted">
                {cat === "main" ? "Nového hlavního sponzora" : "Sponzora názvu stadionu"} si vyjednáš s majitelem firmy z okresu.{" "}
                <Link href="/sponzori?tab=firms" className="text-pitch-600 underline">Firmy v okrese →</Link>
              </p>
            </div>
          </section>
        );
      })}
```

   - v `ContractCard` nahradit blok

```tsx
        {contract.renewal ? (
          <div className="text-sm text-muted">
            Prodloužení: <span className="text-pitch-500 font-heading font-bold">+{formatCZK(weeklyAmount(contract.renewal.monthlyAmount))}/týd</span>{" "}
            na {seasonsAccusative(contract.renewal.seasons)}
          </div>
        ) : (
```
za
```tsx
        {contract.renewal ? (
          <div className="text-sm text-muted">
            Prodloužení: <span className="text-pitch-500 font-heading font-bold">+{formatCZK(weeklyAmount(contract.renewal.monthlyAmount))}/týd</span>{" "}
            na {seasonsAccusative(contract.renewal.seasons)}
          </div>
        ) : contract.renewable ? (
          <div className="text-sm text-muted">Smlouva je v poslední sezóně, o prodloužení se domluvíš s majitelem firmy.</div>
        ) : (
```
     a tlačítko prodloužení: nahradit `          {contract.renewal && (` za `          {(contract.renewal || contract.renewable) && (`.
   - smazat komponenty `ExpiredRenewCard` a `OffersList` jen pokud už je nic nepoužívá: `OffersList` dál slouží bannerům, `ExpiredRenewCard` se smaže celá (funkce od komentáře `/** Nedávno vypršelá smlouva: obnova…` po její konec).
   - v props `ContractsTab` beze změny (`onSign` dál pro bannery).

3. `apps/web/src/app/(hra)/sponzori/page.tsx`:
   - na začátek souboru k importům přidat `import { useRouter } from "next/navigation";` a v `SponsorsPage` za `const { teamId, setTeam: setTeamCtx } = useTeam();` přidat `const router = useRouter();`
   - v `handleRenew` nahradit řádek `    if (!contract?.renewal) return;` za:

```tsx
    // Hlavní sponzor a stadion: prodloužení je jednání s majitelem firmy.
    if (category !== "banner") {
      if (contract?.sponsorId) router.push(`/sponzor/${contract.sponsorId}`);
      return;
    }
    if (!contract?.renewal) return;
```

4. `apps/web/src/components/sponsors/firms-tab.tsx`: ve `FirmCard` uvnitř `<div className="min-w-0">` hned za zavírací `</div>` bloku `<div className="text-sm mt-1">` (stav firmy: „Váš hlavní sponzor" / „Hlavní sponzor klubu …" / „Volný, rozpočet zhruba …") vložit:

```tsx
            {!f.isMine && !f.mainHolder && (
              <Link href={`/sponzor/${f.sponsorId}`} className="inline-block min-h-11 leading-[2.75rem] text-sm text-pitch-600 font-heading font-bold">
                🤝 Jednat o smlouvě
              </Link>
            )}
```
   (Obsazené firmy dál jde otevřít přes jméno; o název stadionu s nimi jednat jde na jejich stránce.)

- [ ] **Step 10: Build a kontrola tříd**

Run: `cd /Users/savrik/Projects/fmko && npm run typecheck`
Expected: bez chyb.

Run: `cd /Users/savrik/Projects/fmko/apps/web && npx next build --no-lint`
Expected: `✓ Compiled successfully`, v seznamu rout `/sponzor/[id]/jednani`.

Run: `grep -rn "—" "/Users/savrik/Projects/fmko/apps/web/src/app/(hra)/sponzor" /Users/savrik/Projects/fmko/apps/web/src/components/sponsors/negotiation /Users/savrik/Projects/fmko/apps/web/src/components/sponsors/negotiation-entry.tsx /Users/savrik/Projects/fmko/apps/web/src/lib/sponsor-negotiation.ts`
Expected: žádný výstup (v textech pro hráče žádná dlouhá pomlčka).

- [ ] **Step 11: Lokální prohlídka**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/sponzor/1/jednani`
Expected: `200` (když dev server neběží nebo vrací 500, restartovat ho a smazat `.next`, paměť `feedback_clear_next_cache.md`).

- [ ] **Step 12: Commit**

```bash
cd /Users/savrik/Projects/fmko
git add apps/web/src/lib/sponsor-negotiation.ts apps/web/src/components/sponsors/negotiation apps/web/src/components/sponsors/negotiation-entry.tsx "apps/web/src/app/(hra)/sponzor/[id]/jednani/page.tsx" "apps/web/src/app/(hra)/sponzor/[id]/page.tsx" apps/web/src/components/sponsors/owner-card.tsx apps/web/src/lib/sponsor-page-types.ts apps/web/src/components/sponsors/contracts-tab.tsx apps/web/src/components/sponsors/firms-tab.tsx "apps/web/src/app/(hra)/sponzori/page.tsx"
git commit -m "$(cat <<'EOF'
feat(sponzori): obrazovka jednani se sponzorem a vstupy ze stranky sponzora a zalozek

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Nasazení na testing a ověření

**Files:** žádné změny kódu.

**Interfaces:**
- Consumes: úlohy 1 až 8, migrace 0221 na `prales-db-test` (Task 1).
- Produces: ověřené chování na `api-test.prales.fun` a `test.prales.fun`. Na `main` nic.

- [ ] **Step 1: Větev a strom**

Run: `cd /Users/savrik/Projects/fmko && git branch --show-current && git status --short`
Expected: `testing`; ve stromu nanejvýš `.serena/project.yml` a `packages/db/tsconfig.tsbuildinfo` (nepřidávat).

- [ ] **Step 2: Všechny testy API**

Run: `cd /Users/savrik/Projects/fmko/apps/api && npx vitest run`
Expected: všechny soubory `passed`. Padající test nesouvisející se změnou nahlásit, neopravovat.

- [ ] **Step 3: Push a deploy**

Run: `cd /Users/savrik/Projects/fmko && git push origin testing`
Run: `sleep 80 && gh run list --branch testing --limit 2 --json status,conclusion,name`
Expected: API i web `"conclusion": "success"`. Červené API kvůli CF 10013 ověřit `npx wrangler deployments list --env testing` (paměť `reference_cf_queue_consumer_10013.md`).

- [ ] **Step 4: API bez přihlášení (veřejné a chybové cesty)**

Testovací tým FK Duplex Břevnov `302a0ce7-428a-4da8-b4ac-40f27eb9a7d1`. Id volné firmy z okresu:

Run: `curl -s "https://api-test.prales.fun/api/teams/302a0ce7-428a-4da8-b4ac-40f27eb9a7d1/sponsor-owners" | python3 -c 'import json,sys; d=json.load(sys.stdin); print([ (f["sponsorId"], f["name"]) for f in d["firms"] if not f["mainHolder"]][:3])'`
Expected: seznam (id, název). První id dál jako `SID`.

Run: `curl -s "https://api-test.prales.fun/api/sponsors/SID?teamId=302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" | python3 -c 'import json,sys; print(json.load(sys.stdin)["myTeam"]["negotiation"])'`
Expected: `{'main': {'canOpen': …, 'reason': …, 'isRenewal': False, 'openId': None}, 'stadium': {…}}`.

Run: `curl -s "https://api-test.prales.fun/api/teams/302a0ce7-428a-4da8-b4ac-40f27eb9a7d1/sponsors" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("mainOffers" in d, "stadiumOffers" in d, d.get("negotiations"))'`
Expected: `False False []`.

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://api-test.prales.fun/api/teams/302a0ce7-428a-4da8-b4ac-40f27eb9a7d1/sponsors/SID/negotiations" -H "Content-Type: application/json" -d '{"category":"main"}'`
Expected: `401`.

Když `canOpen` u hlavního sponzora blokuje limit „jednou za sezónu", na TESTOVACÍ DB ho uvolnit:
`npx wrangler d1 execute prales-db-test --remote --json --command 'UPDATE teams SET last_main_sponsor_change_season = 0 WHERE id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1"'`

- [ ] **Step 5: MCP browser: jednání, protinabídka, podpis (happy path)**

1. `mcp__claude-in-chrome__tabs_context_mcp` (createIfEmpty), navigate `https://test.prales.fun/login`, přihlásit testovací účet `claude-test@t.cz` (heslo zadá uživatel).
2. `/sponzori?tab=firms`: u volné firmy odkaz „Jednat o smlouvě". Screenshot.
3. `/sponzor/SID`: blok „Jednání o smlouvě" se dvěma tlačítky. Klepnout „Jednat: hlavní sponzor" → přesměrování na `/sponzor/SID/jednani?id=…`. Screenshot (mobilní šířka: `mcp__claude-in-chrome__resize_window` 390×844).
4. Přidat jedno přání majitele jako slib (sezónní, délka 2 sezóny), měsíčně nastavit těsně nad horní hranici odhadu, „Navrhnout". Očekávání: protinabídka (za slib nebo sleva), v historii text majitele bez dlouhé pomlčky, tlačítko „Podepsat smlouvu" na konci. Screenshot.
5. „Podepsat smlouvu" → potvrzovací dialog s měsíční částkou a −3 reputace → Podepsat → `/sponzori`, nový název klubu v hlavičce. Screenshot.

- [ ] **Step 6: MCP browser: chybové případy**

1. Podvržená částka přes API (vlastní token ze stránky), očekávání `400`:
   `mcp__claude-in-chrome__javascript_tool`: `fetch("https://api-test.prales.fun/api/teams/302a0ce7-428a-4da8-b4ac-40f27eb9a7d1/sponsors/negotiations/NID/propose", {method:"POST", headers:{"Content-Type":"application/json", Authorization:"Bearer "+localStorage.getItem("om_token")}, body: JSON.stringify({seasons:2, promises:[], demands:{monthly:-5, winBonus:0, signingBonus:0, goalBonuses:{}, construction:null, equipment:null, payCurrentFee:false}})}).then(r => r.status)` (NID = id nového jednání s jinou firmou, otevřeného přes tlačítko o název stadionu).
   Výsledek async fetch ověřit čtením, neopakovat naslepo (paměť `reference_browser_async_fetch.md`).
2. Odmítnutí a odchod: v jednání o stadion navrhnout měsíčně dvojnásobek horní hranice odhadu, opakovat do vyčerpání trpělivosti. Očekávání: „Odmítl a urazil se", pak „Odešel od jednání", formulář zmizí, text „Majitel od jednání odešel". Na `/sponzor/<id>` tlačítko stadionu zakázané s důvodem „Majitel s vámi do … jednat nechce". Screenshot.
3. Záložka Oblíbenost: řádek „urazil se nabídkou při jednání" s −3.

- [ ] **Step 7: Data v testovací DB**

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT status, patience, cooldown_until, json_array_length(rounds) AS kol FROM sponsor_negotiations WHERE team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" ORDER BY created_at DESC LIMIT 3'`
Expected: jedno `signed`, jedno `walked_away` s `cooldown_until` = herní datum + 14 dní.

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT sponsor_name, category, monthly_amount, seasons_total, signing_bonus, paid_construction, negotiation_id FROM sponsor_contracts WHERE team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" AND status = "active" AND category = "main"'`
Expected: nová smlouva s `negotiation_id` podepsaného jednání.

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT kind, params, season, deadline_game_date, value_share, reward, penalty, status FROM sponsor_promises WHERE team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" ORDER BY created_at DESC LIMIT 5'`
Expected: řádek slibu se `season` = aktuální sezóna + 1, `penalty` > 0, `status = "pending"`.

Run: `npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT type, amount, description FROM transactions WHERE team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" AND type IN ("sponsor_signing","sponsor_termination") ORDER BY created_at DESC LIMIT 5'`
Expected: když se měnil sponzor, `sponsor_termination` s pokutou; při příspěvku za podpis `sponsor_signing`.

- [ ] **Step 8: STOP**

Nahlásit uživateli výsledky (screenshoty, dotazy) a čekat. Na `main` a na `prales-db-prod` (migrace 0221 až po záloze `wrangler d1 export`) jen po výslovném „nasaď na main"; podle specifikace jdou etapy 2 a 3 na produkci najednou.
