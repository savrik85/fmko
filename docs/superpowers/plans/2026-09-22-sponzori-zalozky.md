# Sponzoři: záložky a přehled oblíbenosti — plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stránku `/sponzori` rozdělit do čtyř záložek (Smlouvy, Firmy v okrese, Oblíbenost, Historie) a dát hráči přehled, jak ho mají rádi firmy v okrese, včetně deníku změn náklonnosti.

**Architecture:** Nová tabulka `sponsor_favor_log` (migrace 0219) a zápis do ní při každé změně náklonnosti, vždy ve stejném `db.batch` jako změna sama (jednotlivé změny přes `favorDeltaStmts`, hromadné přes `INSERT … SELECT`). Čisté agregační funkce v `apps/api/src/sponsors/overview.ts` (pásma, průměr, pořadí, nejoblíbenější/nejchladnější, sezóna podpisu) s unit testy; dva nové veřejné GET endpointy v `routes/sponsors.ts`, které vrací jen data dotazovaného klubu. Web: `page.tsx` zůstane tenký (stav, akce, záložky), obsah záložek jde do komponent v `components/sponsors/`. Záložka v URL přes existující `useTabParam`, rozšířený o zapamatování poslední záložky v `localStorage`.

**Tech Stack:** Hono + Cloudflare D1 (SQLite), vitest, Next.js 15 (client komponenty), Tailwind v4 (tokeny v `apps/web/src/app/globals.css`).

**Spec:** Schválený návrh v konverzaci 2026-09-22, shrnut v sekci Design níže.

## Design

Nahoře zůstává karta s názvem klubu (a přejmenováním) a karta setkání v hospodě (když je aktivní). Pod nimi čtyři záložky:

1. **Smlouvy** — hlavní sponzor, sponzor stadionu, bannery jako dnes (podpis, prodloužení, výpověď, nabídky, důvody blokace zůstávají beze změny chování). Karty jsou kompaktnější a u každé smlouvy je řádek „Náklonnost majitele: Neutrální (40)“. Ceny se přesouvají z tlačítek do info řádků (dnešní „Obnovit (+X/týd …)“ a „Prodloužit … (+X/týd)“ porušují pravidlo).
2. **Firmy v okrese** — dnešní seznam + filtr (Volné / Obsazené / Moje / Vše) a řazení (Náklonnost / Rozpočet / Obor), obojí na klientu nad daty z `GET /api/teams/:teamId/sponsor-owners`. „Moje“ = firma je náš hlavní sponzor nebo s ní máme jakoukoli aktivní smlouvu (stadion, banner).
3. **Oblíbenost** — průměrná náklonnost firem v okrese k nám + naše pořadí mezi kluby okresu podle průměru (jen pořadí a počet klubů, nic o ostatních); rozložení firem do pěti pásem (vodorovné pruhy, bez knihovny grafů); 3 nejoblíbenější a 3 nejchladnější firmy; posledních 20 změn náklonnosti s důvodem a herním datem. Nejoblíbenější = jen firmy nad výchozí 40, nejchladnější = jen pod 40 (firma, která klub ještě nepoznala, nepatří ani do jednoho; nový klub tak nevidí tři náhodné „nejoblíbenější“ firmy).
4. **Historie** — skončené smlouvy (vypršelé a vypovězené): sponzor (odkaz), kategorie, sezóna podpisu, délka, stav, poslední týdenní částka; nahoře „Hlavní sponzoři podle sezón“. Sezóna podpisu se odvodí ze `sponsor_contracts.signed_at` a `seasons.created_at` (poslední sezóna založená nejpozději v okamžiku podpisu; ověřeno na produkci, kde sezóna 1 vznikla 2026-03-29 a sezóna 2 2026-07-04). Konec smlouvy se neodvozuje: prodloužení (`POST /sponsors/renew`) přepisuje `seasons_total` a sloupec s datem konce neexistuje. **Celkové výdělky se nezobrazují**: `finance-processor.ts` zapisuje `sponsor_income` jako jednu týdenní částku za všechny smlouvy dohromady („Sponzorské příjmy“), takže na konkrétního sponzora ji levně rozdělit nejde.

Deník `sponsor_favor_log(id, sponsor_id, team_id, delta, reason, game_date, created_at)`: zapisuje se každá změna, kterou dělá `applySponsorFavorDelta`, `settleSponsorInvitations`, `applyRiotFavorPenalty` a `rewardSeasonPartnerships`. `delta` je skutečná změna po ořezu 0–100 (počítá se z hodnoty před změnou, proto se log zapisuje v batchi jako první); nulová změna se nezapíše. `game_date` = `teams.game_date` klubu, jinak aktuální čas v ISO. Důvody česky pro zobrazení: „přijal pozvání na zápas“, „pivo v hospodě“, „výtržnost fanoušků“, „sezóna spolupráce s hlavním sponzorem“, „viděl výhru 3:1“ / „viděl remízu 1:1“ / „viděl prohru 0:2“. Znaménko změny se píše obyčejným spojovníkem (`-2`), nikdy dlouhou pomlčkou.

## Global Constraints

- Identifikátory v kódu anglicky, texty pro hráče a komentáře česky.
- V textech pro hráče nikdy dlouhá pomlčka (—). Záporná změna = `-2` (spojovník).
- Nikdy prázdný `catch`. Server: `logger.warn/error({ module }, "popis", e)`; `logger.ts` serializuje z kontextu jen `teamId`/`matchId`/`playerId`/`reqId`, ostatní id (sponzor) patří do textu zprávy. Klient: `console.error("popis:", e)` / `console.warn`.
- UI: mobil nejdřív (375 px bez vodorovného scrollu), minimum `text-sm`, jména sponzorů a týmů `text-base` a jako odkazy (`/sponzor/:id`, `/tym/:id`), ceny nikdy v tlačítkách (jen v info řádku), tlačítka min. výška 44 px (`min-h-11`) kde nejde o `btn`.
- `localStorage` jen pro pohodlí (poslední záložka), každé čtení/zápis v `try/catch` s `console.warn`.
- GET endpointy jsou v projektu veřejné; nové endpointy vrací jen data klubu z URL (o ostatních klubech jen počet a naše pořadí).
- Výchozí náklonnost 40 (`DEFAULT_FAVOR`), rozsah 0–100, pásma ≥80 / ≥60 / ≥40 / ≥20 / zbytek (shodně s `favorLabel` ve `apps/web/src/lib/sponsor-owners.ts`).
- Migrace 0219 (0218 je rezervovaná pro VIP lóže) se aplikuje ručně na `prales-db-test`. **Musí být aplikovaná dřív, než se nasadí kód** — zápis do deníku je ve stejném batchi jako změna náklonnosti, bez tabulky by selhala i změna sama. Produkce jen po výslovném souhlasu (a po záloze).
- D1 dotazy z terminálu: vnější `'`, vnitřní `"`, wrangler spouštět holý (bez `cd` a roury).
- Branch `testing`. V implementačních taskách se **nepushuje**; push jen v Tasku 7. Nic na `main`.
- Commit message končí prázdným řádkem a `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Pozor na lokální build: v `apps/web/src` leží gitignorované vyemitované `.js` soubory (mj. `components/ui/tabs.js` z 2026-09-22 14:31). Webpack v Next.js řeší `.js` před `.tsx`, takže lokálně může `tabs.js` zastínit upravený `tabs.tsx`. CI staví z gitu, tam nevadí. Nemazat bez souhlasu uživatele; když lokální chování neodpovídá kódu, nahlásit to.

## Souborová struktura

| Soubor | Odpovědnost |
|---|---|
| `apps/api/migrations/0219_sponsor_favor_log.sql` | tabulka deníku změn náklonnosti + index |
| `apps/api/src/sponsors/favor-math.ts` | + `FAVOR_REASONS`, `postMatchFavorReason()` |
| `apps/api/src/sponsors/favor-math.test.ts` | + testy důvodu po zápase |
| `apps/api/src/sponsors/favor.ts` | `favorLogStmt`, `favorDeltaStmts` (log + změna), `favorDeltaStmt` přestane být exportovaný |
| `apps/api/src/sponsors/hooks.ts` | log u pozvánek po zápase, výtržnosti a sezóny spolupráce |
| `apps/api/src/sponsors/favor-log.test.ts` | testy pořadí a parametrů log příkazů (fake D1) |
| `apps/api/src/sponsors/overview.ts` | čisté agregace: pásma, průměr, pořadí, extrémy, sezóna podpisu |
| `apps/api/src/sponsors/overview.test.ts` | unit testy agregací |
| `apps/api/src/routes/sponsors.ts` | `GET /teams/:teamId/sponsor-overview`, `GET /teams/:teamId/sponsor-history` |
| `apps/web/src/components/ui/tabs.tsx` | `useTabParam(keys, param, storageKey?)` pamatuje poslední záložku |
| `apps/web/src/lib/sponsor-page-types.ts` | typy stránky (smlouvy, nabídky, firmy, přehled, historie) |
| `apps/web/src/lib/sponsor-format.ts` | týdenní částka, „na N sezón“, znaménko změny, herní datum |
| `apps/web/src/lib/sponsor-firms.ts` | filtr a řazení firem |
| `apps/web/src/lib/sponsor-owners.ts` | + pořadí a popisky pásem náklonnosti |
| `apps/web/src/components/sponsors/sponsor-link.tsx` | odkaz na sponzora (přesun z page.tsx) |
| `apps/web/src/components/sponsors/favor-badge.tsx` | `FavorBadge`, `FavorLine` |
| `apps/web/src/components/sponsors/contracts-tab.tsx` | záložka Smlouvy (karty smluv, obnova, nabídky) |
| `apps/web/src/components/sponsors/firms-tab.tsx` | záložka Firmy v okrese |
| `apps/web/src/components/sponsors/popularity-tab.tsx` | záložka Oblíbenost |
| `apps/web/src/components/sponsors/history-tab.tsx` | záložka Historie |
| `apps/web/src/app/(hra)/sponzori/page.tsx` | stav, akce (podpis/prodloužení/výpověď/přejmenování/hospoda), záložky |

---

### Task 1: Migrace 0219 a deník změn náklonnosti

**Files:**
- Create: `apps/api/migrations/0219_sponsor_favor_log.sql`
- Modify: `apps/api/src/sponsors/favor-math.ts`, `apps/api/src/sponsors/favor-math.test.ts`, `apps/api/src/sponsors/favor.ts`, `apps/api/src/sponsors/hooks.ts`
- Create: `apps/api/src/sponsors/favor-log.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_FAVOR`, `SEASON_PARTNERSHIP_FAVOR`, `postMatchFavorDelta`, `riotFavorDelta` (`favor-math.ts`); `logger` (`lib/logger.ts`).
- Produces:
  - tabulka `sponsor_favor_log`
  - `FAVOR_REASONS: { invitationAccepted: string; pubBeer: string; riot: string; seasonPartnership: string }`
  - `postMatchFavorReason(ourGoals: number, theirGoals: number): string`
  - `favorLogStmt(db: D1Database, sponsorId: number, teamId: string, delta: number, reason: string): D1PreparedStatement`
  - `favorDeltaStmts(db: D1Database, sponsorId: number, teamId: string, delta: number, reason: string): D1PreparedStatement[]` (pořadí [log, změna])
  - `applySponsorFavorDelta(db, sponsorId, teamId, delta, reason): Promise<void>` (signatura beze změny, nově zapisuje i log)
  - `applyRiotFavorPenalty(db, teamId): Promise<void>`, `rewardSeasonPartnerships(db): Promise<number>`, `settleSponsorInvitations(db, matchId, homeTeamId, homeScore, awayScore): Promise<void>` (signatury beze změny)

- [ ] **Step 1: Napsat migraci**

`apps/api/migrations/0219_sponsor_favor_log.sql`:

```sql
-- 0219: Deník změn náklonnosti majitelů firem ke klubům (záložka Oblíbenost na /sponzori).
-- 0218 je rezervovaná pro VIP lóže.
-- Aplikovat ručně PŘED nasazením kódu (zápis do deníku je ve stejném batchi jako změna náklonnosti):
--   npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0219_sponsor_favor_log.sql

CREATE TABLE IF NOT EXISTS sponsor_favor_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sponsor_id INTEGER NOT NULL REFERENCES district_sponsors(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  -- Skutečná změna po ořezu 0–100, ne požadovaná.
  delta INTEGER NOT NULL,
  -- Český důvod pro zobrazení hráči.
  reason TEXT NOT NULL,
  -- Herní datum klubu (teams.game_date), jinak čas zápisu v ISO.
  game_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sponsor_favor_log_team ON sponsor_favor_log(team_id, id);
```

- [ ] **Step 2: Napsat padající test důvodů**

Do `apps/api/src/sponsors/favor-math.test.ts` rozšířit import. Najít:

```ts
import {
  clampFavor, invitationAcceptance, invitationAcceptedDelta, invitationGiftCost,
  postMatchFavorDelta, pubBeerCost, riotFavorDelta,
} from "./favor-math";
```

nahradit:

```ts
import {
  clampFavor, FAVOR_REASONS, invitationAcceptance, invitationAcceptedDelta, invitationGiftCost,
  postMatchFavorDelta, postMatchFavorReason, pubBeerCost, riotFavorDelta,
} from "./favor-math";
```

a na konec souboru (za poslední `});` bloku `describe("favor-math", …)`) přidat:

```ts
describe("důvody změn náklonnosti", () => {
  it("po zápase podle výsledku a se skóre", () => {
    expect(postMatchFavorReason(3, 1)).toBe("viděl výhru 3:1");
    expect(postMatchFavorReason(1, 1)).toBe("viděl remízu 1:1");
    expect(postMatchFavorReason(0, 2)).toBe("viděl prohru 0:2");
  });

  it("žádný důvod neobsahuje dlouhou pomlčku", () => {
    for (const r of Object.values(FAVOR_REASONS)) expect(r).not.toContain("—");
  });
});
```

Run: `cd apps/api && npx vitest run src/sponsors/favor-math.test.ts`
Expected: FAIL (`postMatchFavorReason` / `FAVOR_REASONS` nejsou exportované).

- [ ] **Step 3: Důvody ve `favor-math.ts`**

Na konec `apps/api/src/sponsors/favor-math.ts` (za `pubBeerCost`) přidat:

```ts
/** Důvody změn náklonnosti, jak je hráč uvidí v záložce Oblíbenost. */
export const FAVOR_REASONS = {
  invitationAccepted: "přijal pozvání na zápas",
  pubBeer: "pivo v hospodě",
  riot: "výtržnost fanoušků",
  seasonPartnership: "sezóna spolupráce s hlavním sponzorem",
} as const;

/** Důvod změny po zápase, na kterém majitel seděl: výsledek a skóre z pohledu domácích. */
export function postMatchFavorReason(ourGoals: number, theirGoals: number): string {
  const score = `${ourGoals}:${theirGoals}`;
  if (ourGoals > theirGoals) return `viděl výhru ${score}`;
  if (ourGoals === theirGoals) return `viděl remízu ${score}`;
  return `viděl prohru ${score}`;
}
```

Run: `cd apps/api && npx vitest run src/sponsors/favor-math.test.ts`
Expected: PASS (všechny testy souboru).

- [ ] **Step 4: Napsat padající testy log příkazů**

`apps/api/src/sponsors/favor-log.test.ts`:

```ts
/**
 * Deník náklonnosti: každá změna se zapíše ve stejném batchi jako změna sama,
 * log vždy PŘED změnou (skutečnou deltu počítá z hodnoty před změnou).
 */
import { describe, it, expect } from "vitest";
import { applySponsorFavorDelta, favorDeltaStmts } from "./favor";
import { applyRiotFavorPenalty, rewardSeasonPartnerships, settleSponsorInvitations } from "./hooks";

interface FakeStmt { sql: string; args: unknown[] }

function fakeDb(opts: { selectRows?: unknown[]; batchChanges?: number[] } = {}) {
  const batches: FakeStmt[][] = [];
  const runs: FakeStmt[] = [];
  const db = {
    prepare(sql: string) {
      const stmt = {
        sql,
        args: [] as unknown[],
        bind(...args: unknown[]) { stmt.args = args; return stmt; },
        async all() { return { results: opts.selectRows ?? [] }; },
        async run() { runs.push({ sql, args: stmt.args }); return { meta: { changes: 1 } }; },
      };
      return stmt;
    },
    async batch(stmts: FakeStmt[]) {
      batches.push(stmts.map((s) => ({ sql: s.sql, args: s.args })));
      return stmts.map((_, i) => ({ meta: { changes: opts.batchChanges?.[i] ?? 1 } }));
    },
  } as unknown as D1Database;
  return { db, batches, runs };
}

describe("favorDeltaStmts", () => {
  it("vrací [log, změna] se správnými parametry", () => {
    const { db } = fakeDb();
    const [log, upsert] = favorDeltaStmts(db, 7, "T1", 3, "pivo v hospodě") as unknown as FakeStmt[];
    expect(log.sql).toContain("INSERT INTO sponsor_favor_log");
    expect(log.args).toEqual([7, "T1", 3, "pivo v hospodě", 40]);
    expect(upsert.sql).toContain("INSERT INTO sponsor_team_favor");
    expect(upsert.args).toEqual([7, "T1", 40, 3, 3]);
  });
});

describe("applySponsorFavorDelta", () => {
  it("nulová změna nic nezapíše", async () => {
    const { db, batches, runs } = fakeDb();
    await applySponsorFavorDelta(db, 7, "T1", 0, "nic");
    expect(batches).toHaveLength(0);
    expect(runs).toHaveLength(0);
  });

  it("změna jde v jednom batchi s logem", async () => {
    const { db, batches } = fakeDb();
    await applySponsorFavorDelta(db, 7, "T1", 5, "přijal pozvání na zápas");
    expect(batches).toHaveLength(1);
    expect(batches[0][0].sql).toContain("INSERT INTO sponsor_favor_log");
    expect(batches[0][0].args[3]).toBe("přijal pozvání na zápas");
    expect(batches[0][1].sql).toContain("INSERT INTO sponsor_team_favor");
  });
});

describe("háčky zapisují do deníku", () => {
  it("výtržnost: log hromadně před UPDATE, opatrný -4, ostatní -2", async () => {
    const { db, batches } = fakeDb();
    await applyRiotFavorPenalty(db, "T1");
    expect(batches).toHaveLength(1);
    const [log, update] = batches[0];
    expect(log.sql).toContain("INSERT INTO sponsor_favor_log");
    expect(log.sql).toContain("FROM sponsor_team_favor f");
    expect(log.args).toEqual([-4, -2, "T1", "výtržnost fanoušků"]);
    expect(update.sql).toContain("UPDATE sponsor_team_favor");
    expect(update.args).toEqual([-4, -2, "T1"]);
  });

  it("sezóna spolupráce: log před upsertem, vrací počet změněných z upsertu", async () => {
    const { db, batches } = fakeDb({ batchChanges: [3, 7] });
    const n = await rewardSeasonPartnerships(db);
    expect(n).toBe(7);
    const [log, upsert] = batches[0];
    expect(log.sql).toContain("INSERT INTO sponsor_favor_log");
    expect(log.args).toEqual([40, 5, "sezóna spolupráce s hlavním sponzorem"]);
    expect(upsert.sql).toContain("INSERT INTO sponsor_team_favor");
  });

  it("pozvánka po zápase: důvod se skóre, fanoušek dvojnásob", async () => {
    const { db, batches } = fakeDb({ selectRows: [{ id: "inv1", sponsor_id: 9, personality: "fan" }] });
    await settleSponsorInvitations(db, "M1", "T1", 3, 1);
    expect(batches).toHaveLength(1);
    const [log, upsert] = batches[0];
    expect(log.args).toEqual([9, "T1", 8, "viděl výhru 3:1", 40]);
    expect(upsert.args).toEqual([9, "T1", 40, 8, 8]);
  });
});
```

Run: `cd apps/api && npx vitest run src/sponsors/favor-log.test.ts`
Expected: FAIL (`favorDeltaStmts` neexistuje).

- [ ] **Step 5: `favor.ts` — log + změna v jednom batchi**

V `apps/api/src/sponsors/favor.ts` najít celý blok od komentáře po konec souboru:

```ts
/** Příkaz pro cizí batch: přičte deltu k náklonnosti (založí řádek z výchozí hodnoty), ořez 0–100. */
export function favorDeltaStmt(db: D1Database, sponsorId: number, teamId: string, delta: number): D1PreparedStatement {
```

…až po:

```ts
  await favorDeltaStmt(db, sponsorId, teamId, delta).run();
  logger.info({ module: "sponsors", teamId }, `sponzor ${sponsorId}: náklonnost ${delta > 0 ? "+" : ""}${delta}: ${reason}`);
}
```

a nahradit ho:

```ts
/**
 * Přičte deltu k náklonnosti (založí řádek z výchozí hodnoty), ořez 0–100.
 * Záměrně neexportované: změna bez zápisu do deníku nesmí vzniknout. Zvenku jen `favorDeltaStmts`.
 */
function favorDeltaStmt(db: D1Database, sponsorId: number, teamId: string, delta: number): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO sponsor_team_favor (sponsor_id, team_id, favor, updated_at)
     VALUES (?, ?, MAX(0, MIN(100, ? + ?)), datetime('now'))
     ON CONFLICT(sponsor_id, team_id) DO UPDATE SET
       favor = MAX(0, MIN(100, favor + ?)), updated_at = datetime('now')`,
  ).bind(sponsorId, teamId, DEFAULT_FAVOR, delta, delta);
}

/**
 * Zápis do deníku náklonnosti. Musí v batchi běžet PŘED změnou samotnou: skutečnou změnu
 * (po ořezu 0–100) počítá z dosavadní hodnoty. Nulová skutečná změna se nezapíše.
 * Herní datum bere z klubu, bez něj aktuální čas v ISO (jako teams.game_date).
 */
export function favorLogStmt(
  db: D1Database, sponsorId: number, teamId: string, delta: number, reason: string,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO sponsor_favor_log (sponsor_id, team_id, delta, reason, game_date)
     SELECT ?1, ?2, d.actual, ?4,
            COALESCE((SELECT game_date FROM teams WHERE id = ?2), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     FROM (
       SELECT MAX(0, MIN(100, cur.v + ?3)) - cur.v AS actual
       FROM (SELECT COALESCE((SELECT favor FROM sponsor_team_favor WHERE sponsor_id = ?1 AND team_id = ?2), ?5) AS v) cur
     ) d
     WHERE d.actual != 0`,
  ).bind(sponsorId, teamId, delta, reason, DEFAULT_FAVOR);
}

/** Změna náklonnosti pro cizí batch: [zápis do deníku, změna]. Pořadí se nesmí prohodit. */
export function favorDeltaStmts(
  db: D1Database, sponsorId: number, teamId: string, delta: number, reason: string,
): D1PreparedStatement[] {
  return [favorLogStmt(db, sponsorId, teamId, delta, reason), favorDeltaStmt(db, sponsorId, teamId, delta)];
}

export async function applySponsorFavorDelta(
  db: D1Database, sponsorId: number, teamId: string, delta: number, reason: string,
): Promise<void> {
  if (delta === 0) return;
  await db.batch(favorDeltaStmts(db, sponsorId, teamId, delta, reason));
  logger.info({ module: "sponsors", teamId }, `sponzor ${sponsorId}: náklonnost ${delta > 0 ? "+" : ""}${delta}: ${reason}`);
}
```

- [ ] **Step 6: Důvody ve volání z `routes/sponsors.ts`**

V `apps/api/src/routes/sponsors.ts` rozšířit import. Najít:

```ts
import {
  DEFAULT_FAVOR, invitationAcceptance, invitationAcceptedDelta, invitationGiftCost, PUB_BEER_FAVOR, pubBeerCost,
} from "../sponsors/favor-math";
```

nahradit:

```ts
import {
  DEFAULT_FAVOR, FAVOR_REASONS, invitationAcceptance, invitationAcceptedDelta, invitationGiftCost, PUB_BEER_FAVOR, pubBeerCost,
} from "../sponsors/favor-math";
```

Najít:

```ts
    await applySponsorFavorDelta(db, sponsorId, teamId, invitationAcceptedDelta(owner.personality), "přijal pozvání na zápas");
```

nahradit:

```ts
    await applySponsorFavorDelta(db, sponsorId, teamId, invitationAcceptedDelta(owner.personality), FAVOR_REASONS.invitationAccepted);
```

Najít:

```ts
  await applySponsorFavorDelta(db, enc.sponsor_id, teamId, PUB_BEER_FAVOR, "pivo v hospodě");
```

nahradit:

```ts
  await applySponsorFavorDelta(db, enc.sponsor_id, teamId, PUB_BEER_FAVOR, FAVOR_REASONS.pubBeer);
```

- [ ] **Step 7: `hooks.ts` — log u pozvánek, výtržností a spolupráce**

V `apps/api/src/sponsors/hooks.ts` najít importy:

```ts
import { favorDeltaStmt } from "./favor";
import { DEFAULT_FAVOR, postMatchFavorDelta, riotFavorDelta, SEASON_PARTNERSHIP_FAVOR } from "./favor-math";
```

nahradit:

```ts
import { favorDeltaStmts } from "./favor";
import {
  DEFAULT_FAVOR, FAVOR_REASONS, postMatchFavorDelta, postMatchFavorReason, riotFavorDelta, SEASON_PARTNERSHIP_FAVOR,
} from "./favor-math";
```

Najít (v `settleSponsorInvitations`):

```ts
    await favorDeltaStmt(db, r.sponsor_id, homeTeamId, postMatchFavorDelta(p, homeScore, awayScore)).run();
```

nahradit:

```ts
    await db.batch(favorDeltaStmts(
      db, r.sponsor_id, homeTeamId, postMatchFavorDelta(p, homeScore, awayScore), postMatchFavorReason(homeScore, awayScore),
    ));
```

Najít celou funkci:

```ts
/** Výtržnost fanoušků: náklonnost klesne u všech majitelů, se kterými má klub vztah. */
export async function applyRiotFavorPenalty(db: D1Database, teamId: string): Promise<void> {
  await db.prepare(
```

…až po:

```ts
  ).bind(riotFavorDelta("cautious"), riotFavorDelta("fan"), teamId).run();
}
```

a nahradit:

```ts
/**
 * Výtržnost fanoušků: náklonnost klesne u všech majitelů, se kterými má klub vztah.
 * Deník se plní hromadně (INSERT … SELECT) ve stejném batchi a před UPDATE, aby viděl hodnoty před změnou.
 */
export async function applyRiotFavorPenalty(db: D1Database, teamId: string): Promise<void> {
  const cautious = riotFavorDelta("cautious");
  const other = riotFavorDelta("fan");
  const delta = `CASE WHEN (SELECT personality FROM sponsor_owners so WHERE so.sponsor_id = f.sponsor_id) = 'cautious' THEN ?1 ELSE ?2 END`;
  await db.batch([
    db.prepare(
      `INSERT INTO sponsor_favor_log (sponsor_id, team_id, delta, reason, game_date)
       SELECT f.sponsor_id, f.team_id, MAX(0, f.favor + ${delta}) - f.favor, ?4,
              COALESCE((SELECT game_date FROM teams WHERE id = ?3), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       FROM sponsor_team_favor f
       WHERE f.team_id = ?3 AND MAX(0, f.favor + ${delta}) - f.favor != 0`,
    ).bind(cautious, other, teamId, FAVOR_REASONS.riot),
    db.prepare(
      `UPDATE sponsor_team_favor SET
         favor = MAX(0, favor + CASE
           WHEN (SELECT personality FROM sponsor_owners so WHERE so.sponsor_id = sponsor_team_favor.sponsor_id) = 'cautious' THEN ?
           ELSE ? END),
         updated_at = datetime('now')
       WHERE team_id = ?`,
    ).bind(cautious, other, teamId),
  ]);
}
```

Najít celou funkci:

```ts
/** Rollover: sezóna spolupráce s hlavním sponzorem +5 náklonnosti. Vrací počet smluv. */
export async function rewardSeasonPartnerships(db: D1Database): Promise<number> {
```

…až po:

```ts
  ).bind(DEFAULT_FAVOR, SEASON_PARTNERSHIP_FAVOR, SEASON_PARTNERSHIP_FAVOR).run();
  return res.meta.changes ?? 0;
}
```

a nahradit:

```ts
/**
 * Rollover: sezóna spolupráce s hlavním sponzorem +5 náklonnosti. Vrací počet smluv.
 * Deník hromadně ve stejném batchi a před upsertem (skutečná změna z hodnoty před ní).
 */
export async function rewardSeasonPartnerships(db: D1Database): Promise<number> {
  const [, upsert] = await db.batch([
    db.prepare(
      `INSERT INTO sponsor_favor_log (sponsor_id, team_id, delta, reason, game_date)
       SELECT sc.sponsor_id, sc.team_id,
              MIN(100, COALESCE(f.favor, ?1) + ?2) - COALESCE(f.favor, ?1), ?3,
              COALESCE(t.game_date, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       FROM sponsor_contracts sc
       JOIN teams t ON t.id = sc.team_id
       LEFT JOIN sponsor_team_favor f ON f.sponsor_id = sc.sponsor_id AND f.team_id = sc.team_id
       WHERE sc.status = 'active' AND sc.category = 'main' AND sc.sponsor_id IS NOT NULL
         AND MIN(100, COALESCE(f.favor, ?1) + ?2) - COALESCE(f.favor, ?1) != 0`,
    ).bind(DEFAULT_FAVOR, SEASON_PARTNERSHIP_FAVOR, FAVOR_REASONS.seasonPartnership),
    db.prepare(
      `INSERT INTO sponsor_team_favor (sponsor_id, team_id, favor, updated_at)
       SELECT sponsor_id, team_id, MIN(100, ? + ?), datetime('now') FROM sponsor_contracts
       WHERE status = 'active' AND category = 'main' AND sponsor_id IS NOT NULL
       ON CONFLICT(sponsor_id, team_id) DO UPDATE SET favor = MIN(100, favor + ?), updated_at = datetime('now')`,
    ).bind(DEFAULT_FAVOR, SEASON_PARTNERSHIP_FAVOR, SEASON_PARTNERSHIP_FAVOR),
  ]);
  return upsert.meta.changes ?? 0;
}
```

- [ ] **Step 8: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/sponsors`
Expected: PASS všech souborů v `src/sponsors` (budget, favor-math, favor-log, owners).

Run: `npm run typecheck` (kořen repa)
Expected: `Tasks:    5 successful, 5 total`

Ověřit, že `favorDeltaStmt` už nikdo zvenku nevolá:

Run: `grep -rn "favorDeltaStmt\b" apps/api/src`
Expected: jen definice a volání uvnitř `apps/api/src/sponsors/favor.ts`.

- [ ] **Step 9: Ověřit SQL proti skutečné lokální D1**

Fake D1 neověří SQL. Vytvořit `<scratchpad>/favor-log-db/run.ts` (scratchpad = adresář session; v něm symlink `node_modules` → `/Users/savrik/Projects/fmko/node_modules`):

```ts
import { getPlatformProxy } from "wrangler";
import { applySponsorFavorDelta, getFavor } from "/Users/savrik/Projects/fmko/apps/api/src/sponsors/favor";
import { applyRiotFavorPenalty, rewardSeasonPartnerships } from "/Users/savrik/Projects/fmko/apps/api/src/sponsors/hooks";

const proxy = await getPlatformProxy<{ DB: D1Database }>({
  configPath: "/Users/savrik/Projects/fmko/apps/api/wrangler.toml", environment: "testing",
  persist: { path: process.cwd() + "/state" },
});
const db = proxy.env.DB;
for (const t of ["teams", "district_sponsors", "sponsor_owners", "sponsor_team_favor", "sponsor_contracts", "sponsor_favor_log"]) {
  await db.exec(`DROP TABLE IF EXISTS ${t};`);
}
await db.exec("CREATE TABLE teams (id TEXT PRIMARY KEY, game_date TEXT);");
await db.exec("CREATE TABLE district_sponsors (id INTEGER PRIMARY KEY, type TEXT);");
await db.exec("CREATE TABLE sponsor_owners (sponsor_id INTEGER PRIMARY KEY, personality TEXT);");
await db.exec("CREATE TABLE sponsor_team_favor (sponsor_id INTEGER, team_id TEXT, favor INTEGER DEFAULT 40, updated_at TEXT, PRIMARY KEY (sponsor_id, team_id));");
await db.exec("CREATE TABLE sponsor_contracts (id TEXT, team_id TEXT, sponsor_id INTEGER, status TEXT, category TEXT);");
await db.exec("CREATE TABLE sponsor_favor_log (id INTEGER PRIMARY KEY AUTOINCREMENT, sponsor_id INTEGER NOT NULL, team_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, game_date TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));");
await db.exec("INSERT INTO teams VALUES ('T', '2026-09-22T16:00:00.000Z');");
await db.exec("INSERT INTO district_sponsors VALUES (1, 'pub'), (2, 'company');");
await db.exec("INSERT INTO sponsor_owners VALUES (1, 'cautious'), (2, 'fan');");
await db.exec("INSERT INTO sponsor_contracts VALUES ('c1', 'T', 2, 'active', 'main');");

await applySponsorFavorDelta(db, 1, "T", 5, "pivo v hospodě");      // 40 → 45, log +5
await applySponsorFavorDelta(db, 1, "T", 200, "test ořezu");        // 45 → 100, log +55
await applySponsorFavorDelta(db, 2, "T", -3, "test mínus");         // 40 → 37, log -3
await applySponsorFavorDelta(db, 2, "T", 0, "nula");                 // nic
await applyRiotFavorPenalty(db, "T");                                // 1: 100 → 96 (-4), 2: 37 → 35 (-2)
console.log("partnerships:", await rewardSeasonPartnerships(db));   // 2: 35 → 40 (+5), vrací 1
console.log("favor 1:", await getFavor(db, 1, "T"), "favor 2:", await getFavor(db, 2, "T"));
const log = await db.prepare("SELECT sponsor_id, delta, reason, game_date FROM sponsor_favor_log ORDER BY id").all();
console.log(JSON.stringify(log.results, null, 1));
await proxy.dispose();
```

Run: `npx esbuild run.ts --bundle --platform=node --format=esm --external:wrangler "--external:cloudflare:*" --outfile=run.mjs --log-level=warning && node run.mjs`
Expected: `partnerships: 1`, `favor 1: 96 favor 2: 40`, log má 6 řádků v pořadí `[1,+5,"pivo v hospodě"]`, `[1,+55]`, `[2,-3]`, dva řádky výtržnosti `[1,-4,"výtržnost fanoušků"]` a `[2,-2,"výtržnost fanoušků"]` (mezi sebou v libovolném pořadí), `[2,+5,"sezóna spolupráce s hlavním sponzorem"]`; všechny s `game_date` `2026-09-22T16:00:00.000Z`. Žádný řádek pro nulovou změnu.

- [ ] **Step 10: Commit**

```bash
git add apps/api/migrations/0219_sponsor_favor_log.sql apps/api/src/sponsors/favor-math.ts apps/api/src/sponsors/favor-math.test.ts apps/api/src/sponsors/favor.ts apps/api/src/sponsors/hooks.ts apps/api/src/sponsors/favor-log.test.ts apps/api/src/routes/sponsors.ts
git commit -m "$(cat <<'EOF'
feat(sponzori): denik zmen naklonnosti majitelu (migrace 0219)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: API přehledu oblíbenosti a historie smluv

**Files:**
- Create: `apps/api/src/sponsors/overview.ts`, `apps/api/src/sponsors/overview.test.ts`
- Modify: `apps/api/src/routes/sponsors.ts`

**Interfaces:**
- Consumes: `DEFAULT_FAVOR`; `ensureSponsorOwners(db, ids): Promise<Map<number, SponsorOwner>>`, `getFavorsForTeam(db, teamId): Promise<Map<number, number>>` (`favor.ts`); `loadTeam(db, teamId): Promise<TeamCtx | null>` (privátní v `routes/sponsors.ts`); tabulka `sponsor_favor_log` (Task 1).
- Produces:
  - `type FavorBand = "loves" | "friendly" | "neutral" | "cold" | "hostile"`, `FAVOR_BANDS: readonly FavorBand[]`
  - `favorBand(f: number): FavorBand`
  - `countBands(favors: number[]): Record<FavorBand, number>`
  - `averageFavor(favors: number[]): number | null` (1 desetinné místo)
  - `interface ClubAverage { teamId: string; avgFavor: number }`, `rankAmongClubs(clubs: ClubAverage[], teamId: string): { rank: number; clubsInDistrict: number } | null`
  - `interface FirmFavor { sponsorId: number; name: string; ownerName: string | null; favor: number }`, `pickExtremes(firms: FirmFavor[], n?: number): { top: FirmFavor[]; coldest: FirmFavor[] }`
  - `seasonAtDate(seasons: Array<{ number: number; createdAt: string }>, signedAt: string): number | null`
  - `GET /api/teams/:teamId/sponsor-overview` → `{ avgFavor: number | null; rank: number | null; clubsInDistrict: number; firmsCount: number; bands: Record<FavorBand, number>; top: FirmFavor[]; coldest: FirmFavor[]; recentChanges: Array<{ sponsorId: number; sponsorName: string; ownerName: string | null; delta: number; reason: string; gameDate: string }> }`
  - `GET /api/teams/:teamId/sponsor-history` → `{ contracts: Array<{ id: string; sponsorId: number | null; sponsorName: string; category: "main" | "stadium" | "banner"; status: "expired" | "terminated"; seasonsTotal: number; monthlyAmount: number; signedSeason: number | null }> }`

- [ ] **Step 1: Napsat padající testy agregací**

`apps/api/src/sponsors/overview.test.ts`:

```ts
/**
 * Přehled oblíbenosti klubu u firem v okrese (čisté funkce).
 */
import { describe, it, expect } from "vitest";
import {
  averageFavor, countBands, favorBand, pickExtremes, rankAmongClubs, seasonAtDate, type FirmFavor,
} from "./overview";

describe("pásma náklonnosti", () => {
  it("hranice shodné s webovým favorLabel", () => {
    expect(favorBand(100)).toBe("loves");
    expect(favorBand(80)).toBe("loves");
    expect(favorBand(79)).toBe("friendly");
    expect(favorBand(60)).toBe("friendly");
    expect(favorBand(59)).toBe("neutral");
    expect(favorBand(40)).toBe("neutral");
    expect(favorBand(39)).toBe("cold");
    expect(favorBand(20)).toBe("cold");
    expect(favorBand(19)).toBe("hostile");
    expect(favorBand(0)).toBe("hostile");
  });

  it("počty ve všech pěti pásmech, i nulové", () => {
    expect(countBands([85, 61, 40, 40, 10])).toEqual({ loves: 1, friendly: 1, neutral: 2, cold: 0, hostile: 1 });
    expect(countBands([])).toEqual({ loves: 0, friendly: 0, neutral: 0, cold: 0, hostile: 0 });
  });
});

describe("průměr", () => {
  it("na jedno desetinné místo, prázdný okres = null", () => {
    expect(averageFavor([])).toBeNull();
    expect(averageFavor([40, 45, 50])).toBe(45);
    expect(averageFavor([40, 41])).toBe(40.5);
    expect(averageFavor([40, 40, 41])).toBe(40.3);
  });
});

describe("pořadí mezi kluby", () => {
  const clubs = [
    { teamId: "a", avgFavor: 50 },
    { teamId: "b", avgFavor: 45 },
    { teamId: "c", avgFavor: 50 },
    { teamId: "d", avgFavor: 40 },
  ];
  it("shodný průměr = shodné pořadí", () => {
    expect(rankAmongClubs(clubs, "a")).toEqual({ rank: 1, clubsInDistrict: 4 });
    expect(rankAmongClubs(clubs, "c")).toEqual({ rank: 1, clubsInDistrict: 4 });
    expect(rankAmongClubs(clubs, "b")).toEqual({ rank: 3, clubsInDistrict: 4 });
    expect(rankAmongClubs(clubs, "d")).toEqual({ rank: 4, clubsInDistrict: 4 });
  });
  it("rozdíl pod desetinu se nepočítá", () => {
    expect(rankAmongClubs([{ teamId: "x", avgFavor: 40.01 }, { teamId: "y", avgFavor: 40.02 }], "x"))
      .toEqual({ rank: 1, clubsInDistrict: 2 });
  });
  it("klub mimo seznam = null", () => {
    expect(rankAmongClubs(clubs, "z")).toBeNull();
  });
});

describe("nejoblíbenější a nejchladnější", () => {
  const f = (sponsorId: number, name: string, favor: number): FirmFavor => ({ sponsorId, name, ownerName: null, favor });
  it("nahoře jen nad 40, dole jen pod 40, nejvýš tři", () => {
    const firms = [f(1, "A", 90), f(2, "B", 70), f(3, "C", 41), f(4, "D", 40), f(5, "E", 39), f(6, "F", 10), f(7, "G", 55)];
    const { top, coldest } = pickExtremes(firms);
    expect(top.map((x) => x.name)).toEqual(["A", "B", "G"]);
    expect(coldest.map((x) => x.name)).toEqual(["F", "E"]);
  });
  it("shodná náklonnost se řadí podle názvu", () => {
    const { top } = pickExtremes([f(1, "Žabka", 60), f(2, "Autoservis", 60)]);
    expect(top.map((x) => x.name)).toEqual(["Autoservis", "Žabka"]);
  });
  it("všichni na výchozí hodnotě = prázdné seznamy", () => {
    expect(pickExtremes([f(1, "A", 40), f(2, "B", 40)])).toEqual({ top: [], coldest: [] });
  });
});

describe("sezóna podpisu", () => {
  const seasons = [
    { number: 2, createdAt: "2026-07-04 08:53:56" },
    { number: 1, createdAt: "2026-03-29 09:17:29" },
  ];
  it("poslední sezóna založená nejpozději v okamžiku podpisu", () => {
    expect(seasonAtDate(seasons, "2026-05-01 10:00:00")).toBe(1);
    expect(seasonAtDate(seasons, "2026-07-04 08:53:56")).toBe(2);
    expect(seasonAtDate(seasons, "2026-09-07 18:43:10")).toBe(2);
  });
  it("podpis těsně před založením první sezóny patří do první", () => {
    expect(seasonAtDate(seasons, "2026-03-29 09:17:27")).toBe(1);
  });
  it("bez sezón = null", () => {
    expect(seasonAtDate([], "2026-05-01 10:00:00")).toBeNull();
  });
});
```

Run: `cd apps/api && npx vitest run src/sponsors/overview.test.ts`
Expected: FAIL (modul `./overview` neexistuje).

- [ ] **Step 2: Implementovat `overview.ts`**

`apps/api/src/sponsors/overview.ts`:

```ts
/**
 * Přehled oblíbenosti klubu u firem v okrese a odvození sezóny podpisu smlouvy (čisté funkce, bez DB).
 */
import { DEFAULT_FAVOR } from "./favor-math";

export type FavorBand = "loves" | "friendly" | "neutral" | "cold" | "hostile";
export const FAVOR_BANDS: readonly FavorBand[] = ["loves", "friendly", "neutral", "cold", "hostile"];

/** Hranice pásem shodné s favorLabel na webu (apps/web/src/lib/sponsor-owners.ts). */
export function favorBand(f: number): FavorBand {
  if (f >= 80) return "loves";
  if (f >= 60) return "friendly";
  if (f >= 40) return "neutral";
  if (f >= 20) return "cold";
  return "hostile";
}

export function countBands(favors: number[]): Record<FavorBand, number> {
  const out: Record<FavorBand, number> = { loves: 0, friendly: 0, neutral: 0, cold: 0, hostile: 0 };
  for (const f of favors) out[favorBand(f)]++;
  return out;
}

export function averageFavor(favors: number[]): number | null {
  if (favors.length === 0) return null;
  return Math.round((favors.reduce((s, f) => s + f, 0) / favors.length) * 10) / 10;
}

export interface ClubAverage { teamId: string; avgFavor: number }

/** Pořadí klubu podle průměrné náklonnosti. Průměry se porovnávají na desetiny, shodný průměr = shodné pořadí. */
export function rankAmongClubs(clubs: ClubAverage[], teamId: string): { rank: number; clubsInDistrict: number } | null {
  const me = clubs.find((c) => c.teamId === teamId);
  if (!me) return null;
  const mine = Math.round(me.avgFavor * 10);
  const better = clubs.filter((c) => Math.round(c.avgFavor * 10) > mine).length;
  return { rank: better + 1, clubsInDistrict: clubs.length };
}

export interface FirmFavor { sponsorId: number; name: string; ownerName: string | null; favor: number }

/**
 * Nejoblíbenější = jen firmy nad výchozí náklonností, nejchladnější = jen pod ní.
 * Firma, která klub ještě nepoznala (výchozí 40), nepatří ani do jednoho seznamu.
 */
export function pickExtremes(firms: FirmFavor[], n = 3): { top: FirmFavor[]; coldest: FirmFavor[] } {
  const byName = (a: FirmFavor, b: FirmFavor) => a.name.localeCompare(b.name, "cs");
  const top = firms.filter((f) => f.favor > DEFAULT_FAVOR)
    .sort((a, b) => b.favor - a.favor || byName(a, b)).slice(0, n);
  const coldest = firms.filter((f) => f.favor < DEFAULT_FAVOR)
    .sort((a, b) => a.favor - b.favor || byName(a, b)).slice(0, n);
  return { top, coldest };
}

/**
 * Sezóna, ve které byla smlouva podepsána: poslední sezóna založená nejpozději v okamžiku podpisu.
 * Obě hodnoty jsou `datetime('now')` ve formátu `YYYY-MM-DD HH:MM:SS`, porovnávají se jako řetězce.
 * Podpis těsně před založením první sezóny (seed klubu) patří do první sezóny.
 */
export function seasonAtDate(seasons: Array<{ number: number; createdAt: string }>, signedAt: string): number | null {
  if (seasons.length === 0) return null;
  const sorted = [...seasons].sort((a, b) => a.number - b.number);
  let found: number | null = null;
  for (const s of sorted) if (s.createdAt <= signedAt) found = s.number;
  return found ?? sorted[0].number;
}
```

Run: `cd apps/api && npx vitest run src/sponsors/overview.test.ts`
Expected: PASS (všechny testy).

- [ ] **Step 3: Endpointy v `routes/sponsors.ts`**

Pod blok importů `from "../sponsors/favor";` (najít):

```ts
import {
  applySponsorFavorDelta, ensureSponsorOwner, ensureSponsorOwners, getFavor, getFavorsForTeam,
} from "../sponsors/favor";
```

přidat řádek:

```ts
import { averageFavor, countBands, pickExtremes, rankAmongClubs, seasonAtDate, type FirmFavor } from "../sponsors/overview";
```

Za konec handleru `GET /teams/:teamId/sponsor-owners` (najít):

```ts
  return c.json({ firms, pub });
});
```

vložit:

```ts

/**
 * Průměrná náklonnost všech firem okresu ke každému seniorskému klubu okresu.
 * Chybějící řádek náklonnosti = výchozí hodnota (?2); ?3 = počet firem v okrese (> 0).
 */
const CLUB_AVERAGES_SQL = `
  SELECT t.id AS team_id,
         (COALESCE(SUM(f.favor), 0) + ?2 * (?3 - COUNT(f.sponsor_id))) * 1.0 / ?3 AS avg_favor
  FROM teams t
  JOIN villages v ON v.id = t.village_id
  LEFT JOIN sponsor_team_favor f ON f.team_id = t.id
    AND f.sponsor_id IN (SELECT id FROM district_sponsors WHERE district = ?1)
  WHERE v.district = ?1 AND COALESCE(t.team_type, 'senior') != 'u21' AND t.name NOT LIKE 'DELETED-%'
  GROUP BY t.id`;

interface FavorLogRow { sponsor_id: number; sponsor_name: string; delta: number; reason: string; game_date: string }

// GET /api/teams/:teamId/sponsor-overview — oblíbenost klubu u firem v okrese.
// Veřejné jako ostatní GET; o ostatních klubech vrací jen počet a naše pořadí.
sponsorsRouter.get("/teams/:teamId/sponsor-overview", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const team = await loadTeam(db, teamId);
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const sponsors = await db.prepare("SELECT id, name FROM district_sponsors WHERE district = ?")
    .bind(team.district).all<{ id: number; name: string }>();
  const ids = sponsors.results.map((s) => s.id);

  const [owners, favorMap, clubs, log] = await Promise.all([
    ensureSponsorOwners(db, ids),
    getFavorsForTeam(db, teamId),
    ids.length === 0
      ? Promise.resolve({ results: [] as Array<{ team_id: string; avg_favor: number }> })
      : db.prepare(CLUB_AVERAGES_SQL).bind(team.district, DEFAULT_FAVOR, ids.length)
        .all<{ team_id: string; avg_favor: number }>(),
    db.prepare(
      `SELECT l.sponsor_id, ds.name AS sponsor_name, l.delta, l.reason, l.game_date
       FROM sponsor_favor_log l JOIN district_sponsors ds ON ds.id = l.sponsor_id
       WHERE l.team_id = ? ORDER BY l.id DESC LIMIT 20`,
    ).bind(teamId).all<FavorLogRow>(),
  ]);

  const ownerName = (sponsorId: number): string | null => {
    const o = owners.get(sponsorId);
    return o ? `${o.firstName} ${o.lastName}` : null;
  };
  const firms: FirmFavor[] = sponsors.results.map((s) => ({
    sponsorId: s.id, name: s.name, ownerName: ownerName(s.id), favor: favorMap.get(s.id) ?? DEFAULT_FAVOR,
  }));
  const favors = firms.map((f) => f.favor);
  const place = rankAmongClubs(clubs.results.map((r) => ({ teamId: r.team_id, avgFavor: r.avg_favor })), teamId);
  const { top, coldest } = pickExtremes(firms);

  return c.json({
    avgFavor: averageFavor(favors),
    rank: place?.rank ?? null,
    clubsInDistrict: place?.clubsInDistrict ?? clubs.results.length,
    firmsCount: firms.length,
    bands: countBands(favors),
    top,
    coldest,
    recentChanges: log.results.map((r) => ({
      sponsorId: r.sponsor_id, sponsorName: r.sponsor_name, ownerName: ownerName(r.sponsor_id),
      delta: r.delta, reason: r.reason, gameDate: r.game_date,
    })),
  });
});

interface HistoryRow {
  id: string; sponsor_id: number | null; sponsor_name: string; category: string | null;
  status: "expired" | "terminated"; seasons_total: number; monthly_amount: number; signed_at: string;
}

// GET /api/teams/:teamId/sponsor-history — skončené smlouvy klubu.
// Celkové výdělky se nevrací: sponsor_income se v transakcích zapisuje za všechny smlouvy dohromady.
sponsorsRouter.get("/teams/:teamId/sponsor-history", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const team = await loadTeam(db, teamId);
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const [rows, seasons] = await Promise.all([
    db.prepare(
      `SELECT id, sponsor_id, sponsor_name, category, status, seasons_total, monthly_amount, signed_at
       FROM sponsor_contracts WHERE team_id = ? AND status IN ('expired','terminated')
       ORDER BY signed_at DESC LIMIT 50`,
    ).bind(teamId).all<HistoryRow>(),
    db.prepare("SELECT number, created_at FROM seasons ORDER BY number").all<{ number: number; created_at: string }>(),
  ]);
  const seasonList = seasons.results.map((s) => ({ number: s.number, createdAt: s.created_at }));

  return c.json({
    contracts: rows.results.map((r) => ({
      id: r.id,
      sponsorId: r.sponsor_id,
      sponsorName: r.sponsor_name,
      category: r.category === "stadium" || r.category === "banner" ? r.category : "main",
      status: r.status,
      seasonsTotal: r.seasons_total,
      monthlyAmount: r.monthly_amount,
      signedSeason: seasonAtDate(seasonList, r.signed_at),
    })),
  });
});
```

- [ ] **Step 4: Testy a typecheck**

Run: `cd apps/api && npx vitest run src/sponsors`
Expected: PASS všech souborů.

Run: `npm run typecheck`
Expected: `Tasks:    5 successful, 5 total`

- [ ] **Step 5: Ověřit SQL přehledu proti lokální D1**

Do skriptu z Tasku 1 (`<scratchpad>/favor-log-db/run.ts`) nebo nového `<scratchpad>/overview-db/run.ts` se stejnou kostrou přidat tabulky `villages (id TEXT PRIMARY KEY, district TEXT)`, `teams (id TEXT PRIMARY KEY, village_id TEXT, name TEXT, team_type TEXT, game_date TEXT)`, `district_sponsors (id INTEGER PRIMARY KEY, district TEXT, type TEXT)`, `sponsor_team_favor` jako výše; data: vesnice `v1` v okrese `X`, kluby `A`, `B`, `C` v `v1` (`C` s `team_type = 'u21'`), firmy 1, 2 v okrese `X` a 3 v okrese `Y`; náklonnost `(1, 'A', 80)`, `(3, 'A', 100)`, `(2, 'B', 30)`. Spustit `CLUB_AVERAGES_SQL` (zkopírovat text dotazu) s `bind("X", 40, 2)`.

Expected: dva řádky, `A` = 60 (80 a výchozí 40; firma 3 z jiného okresu se nepočítá), `B` = 35; `C` (U21) chybí.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/sponsors/overview.ts apps/api/src/sponsors/overview.test.ts apps/api/src/routes/sponsors.ts
git commit -m "$(cat <<'EOF'
feat(sponzori): API prehledu oblibenosti a historie smluv

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Web — záložky a záložka Smlouvy

**Files:**
- Modify: `apps/web/src/components/ui/tabs.tsx`
- Create: `apps/web/src/lib/sponsor-page-types.ts`, `apps/web/src/lib/sponsor-format.ts`, `apps/web/src/components/sponsors/sponsor-link.tsx`, `apps/web/src/components/sponsors/favor-badge.tsx`, `apps/web/src/components/sponsors/contracts-tab.tsx`, `apps/web/src/components/sponsors/firms-tab.tsx`
- Modify (celý obsah): `apps/web/src/app/(hra)/sponzori/page.tsx`

**Interfaces:**
- Consumes: `Tabs`, `useTabParam`, `Card`, `CardBody`, `SectionLabel`, `Spinner`, `useConfirm` z `@/components/ui`; `apiFetch`, `Team` z `@/lib/api`; `useTeam` z `@/context/team-context`; `favorLabel`, `formatCZK`, `personalityLabel` z `@/lib/sponsor-owners`; `sponsorTypeLabel` z `@/lib/sponsor-types`; API `GET /api/teams/:teamId/sponsors`, `GET /api/teams/:teamId/sponsor-owners`, POST `sign`/`renew`/`terminate`/`rename`/`sponsor-owners/pub/:encId` (beze změny).
- Produces:
  - `useTabParam<T extends string>(keys: readonly T[], param?: string, storageKey?: string): [T, (value: T) => void]`
  - typy `ActiveContract`, `SponsorCategory`, `SponsorOffer`, `SponsorsData`, `DistrictFirm`, `PubEncounter` v `@/lib/sponsor-page-types`
  - `weeklyAmount(monthly: number): number`, `seasonsAccusative(n: number): string`, `formatFavorDelta(delta: number): string`, `formatGameDay(iso: string): string` v `@/lib/sponsor-format`
  - `SponsorLink({ id, name, className })`, `FavorBadge({ favor })`, `FavorLine({ favor })`
  - `ContractsTab(props: { data: SponsorsData; reputation: number; favors: Map<number, number>; acting: boolean; onSign: (offer: SponsorOffer, category: SponsorCategory) => void; onTerminate: (category: SponsorCategory, contractId?: string) => void; onRenew: (category: SponsorCategory, contractId?: string) => void })`
  - `FirmCard({ firm })`, `FirmsTab({ firms }: { firms: DistrictFirm[] | null })`

- [ ] **Step 1: `useTabParam` s pamětí poslední záložky**

V `apps/web/src/components/ui/tabs.tsx` najít celou funkci od:

```ts
export function useTabParam<T extends string>(
  keys: readonly T[],
  param = "tab",
): [T, (value: T) => void] {
```

až po:

```ts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [param, klice],
  );

  return [active, select];
}
```

a nahradit:

```ts
export function useTabParam<T extends string>(
  keys: readonly T[],
  param = "tab",
  /** Volitelně: klíč v localStorage, pod kterým si stránka pamatuje poslední záložku. */
  storageKey?: string,
): [T, (value: T) => void] {
  const [active, setActive] = useState<T>(keys[0]);
  const klice = keys.join(",");

  useEffect(() => {
    const readFromUrl = (): T | null => {
      const raw = new URLSearchParams(window.location.search).get(param);
      const found = keys.find((k) => k === raw) ?? null;
      setActive(found ?? keys[0]);
      return found;
    };
    const fromUrl = readFromUrl();
    // Bez záložky v adrese vrátit tu, kterou měl hráč otevřenou naposledy.
    // Jen při otevření stránky: krok zpět (popstate) se řídí adresou.
    if (!fromUrl && storageKey) {
      const saved = keys.find((k) => k === readStoredTab(storageKey));
      if (saved && saved !== keys[0]) {
        setActive(saved);
        const url = new URL(window.location.href);
        url.searchParams.set(param, saved);
        window.history.replaceState(window.history.state, "", url);
      }
    }
    window.addEventListener("popstate", readFromUrl);
    return () => window.removeEventListener("popstate", readFromUrl);
    // klice pokrývá obsah pole; `keys` bývá literál a měnil by se každý render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param, klice, storageKey]);

  const select = useCallback(
    (value: T) => {
      setActive(value);
      if (storageKey) writeStoredTab(storageKey, value);
      const url = new URL(window.location.href);
      // Výchozí záložku v adrese nedržíme — URL zůstane čistá.
      if (value === keys[0]) url.searchParams.delete(param);
      else url.searchParams.set(param, value);
      window.history.pushState({}, "", url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [param, klice, storageKey],
  );

  return [active, select];
}

/** localStorage umí v anonymním okně nebo s blokovanými daty vyhodit výjimku; záložka je jen pohodlí. */
function readStoredTab(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    console.warn("čtení uložené záložky:", e);
    return null;
  }
}

function writeStoredTab(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    console.warn("uložení záložky:", e);
  }
}
```

Ostatní volání (`useTabParam(TAB_KEYS)` ve `finance`, `kadr`, `pohar`, …) se nemění; třetí parametr je volitelný.

- [ ] **Step 2: Typy stránky**

`apps/web/src/lib/sponsor-page-types.ts`:

```ts
/** Typy stránky /sponzori. Tvar drží API: routes/game.ts (smlouvy, nabídky) a routes/sponsors.ts (firmy, přehled, historie). */

export type SponsorCategory = "main" | "stadium" | "banner";

export interface ActiveContract {
  id: string;
  category: SponsorCategory;
  sponsorId: number | null;
  sponsorName: string;
  sponsorType: string;
  monthlyAmount: number;
  winBonus: number;
  seasonsTotal: number;
  seasonsRemaining: number;
  earlyTerminationFee: number;
  isNamingRights: boolean;
  signedAt: string;
  renewal?: { monthlyAmount: number; winBonus: number; seasons: number; earlyTerminationFee: number } | null;
  /** Proč hlavního sponzora nejde prodloužit/obnovit (je hlavním jinde nebo dal přednost jinému klubu). */
  blockedReason?: string | null;
}

export interface SponsorOffer {
  sponsorId: number;
  sponsorName: string;
  sponsorType: string;
  monthlyAmount: number;
  winBonus: number;
  seasons: number;
  earlyTerminationFee: number;
  requirement?: string;
}

export interface SponsorsData {
  mainContract: ActiveContract | null;
  stadiumContract: ActiveContract | null;
  mainExpired?: ActiveContract | null;
  stadiumExpired?: ActiveContract | null;
  bannerContracts: ActiveContract[];
  stadiumName: string | null;
  teamName: string;
  mainOffers: SponsorOffer[];
  stadiumOffers: SponsorOffer[];
  bannerOffers: SponsorOffer[];
  maxBanners: number;
  canChangeMainSponsor: boolean;
  season: number;
}

export interface DistrictFirm {
  sponsorId: number;
  name: string;
  type: string;
  owner: { firstName: string; lastName: string; personality: string } | null;
  favor: number;
  budgetEstimate: { low: number; high: number };
  mainHolder: { teamId: string; teamName: string } | null;
  isMine: boolean;
}

export interface PubEncounter {
  id: string;
  sponsorId: number;
  sponsorName: string;
  ownerName: string;
  personality: string;
  beerCost: number;
}
```

- [ ] **Step 3: Formátování**

`apps/web/src/lib/sponsor-format.ts`:

```ts
/** Sponzorské částky, délky smluv a změny náklonnosti v textu pro hráče. */

/** Smlouvy drží měsíční částku, hráč vidí týdenní. */
export function weeklyAmount(monthly: number): number {
  return Math.round(monthly / 4.3);
}

/** „1 sezónu“, „3 sezóny“, „5 sezón“ (4. pád, po předložce „na“). */
export function seasonsAccusative(n: number): string {
  return `${n} ${n === 1 ? "sezónu" : n >= 2 && n <= 4 ? "sezóny" : "sezón"}`;
}

/** Změna se znaménkem; mínus je obyčejný spojovník, nikdy dlouhá pomlčka. */
export function formatFavorDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

/** Herní datum (ISO z teams.game_date) jako „22. 9. 2026“. Neplatné datum = prázdný řetězec. */
export function formatGameDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("cs", { day: "numeric", month: "numeric", year: "numeric" });
}
```

- [ ] **Step 4: Odkaz na sponzora a odznak náklonnosti**

`apps/web/src/components/sponsors/sponsor-link.tsx`:

```tsx
import Link from "next/link";

/** Jméno sponzora jako odkaz na jeho stránku (sponzor mimo okresní seznam odkaz nemá). */
export function SponsorLink({ id, name, className }: { id: number | null | undefined; name: string; className?: string }) {
  if (!id) return <span className={className}>{name}</span>;
  return <Link href={`/sponzor/${id}`} className={`${className ?? ""} hover:text-pitch-600 hover:underline`}>{name}</Link>;
}
```

`apps/web/src/components/sponsors/favor-badge.tsx`:

```tsx
import { favorLabel } from "@/lib/sponsor-owners";

/** Náklonnost majitele ke klubu vpravo na kartě: číslo a pásmo. */
export function FavorBadge({ favor }: { favor: number }) {
  return (
    <div className="text-right shrink-0">
      <div className="font-heading font-bold tabular-nums text-base">{favor}</div>
      <div className="text-sm text-muted whitespace-nowrap">{favorLabel(favor)}</div>
    </div>
  );
}

/** Náklonnost majitele jako řádek textu (karty smluv). */
export function FavorLine({ favor }: { favor: number }) {
  return (
    <div className="text-sm">
      <span className="text-muted">Náklonnost majitele: </span>
      <span className="font-heading font-bold">{favorLabel(favor)} ({favor})</span>
    </div>
  );
}
```

- [ ] **Step 5: Záložka Smlouvy**

`apps/web/src/components/sponsors/contracts-tab.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Card, CardBody, SectionLabel } from "@/components/ui";
import { formatCZK } from "@/lib/sponsor-owners";
import { seasonsAccusative, weeklyAmount } from "@/lib/sponsor-format";
import type { ActiveContract, SponsorCategory, SponsorOffer, SponsorsData } from "@/lib/sponsor-page-types";
import { sponsorTypeLabel } from "@/lib/sponsor-types";
import { FavorLine } from "./favor-badge";
import { SponsorLink } from "./sponsor-link";

export function ContractsTab({ data, reputation, favors, acting, onSign, onTerminate, onRenew }: {
  data: SponsorsData;
  reputation: number;
  /** sponsorId → náklonnost majitele k nám (firmy z okresu). */
  favors: Map<number, number>;
  acting: boolean;
  onSign: (offer: SponsorOffer, category: SponsorCategory) => void;
  onTerminate: (category: SponsorCategory, contractId?: string) => void;
  onRenew: (category: SponsorCategory, contractId?: string) => void;
}) {
  const favorOf = (c: ActiveContract): number | null => (c.sponsorId != null ? favors.get(c.sponsorId) ?? null : null);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Nabídky závisí na reputaci tvého klubu ({reputation}), ta určuje jejich počet i částku.{" "}
        <Link href="/reputace" className="text-pitch-600 underline">Jak ji zvednout →</Link>
      </p>

      {/* ── Hlavní sponzor ── */}
      <section>
        <SectionLabel>{"\u{1F4DD}"} Hlavní sponzor</SectionLabel>
        {data.mainContract ? (
          <div className="space-y-3">
            <ContractCard contract={data.mainContract} favor={favorOf(data.mainContract)} acting={acting}
              onTerminate={() => onTerminate("main")} onRenew={() => onRenew("main")} />
            {data.mainOffers.length > 0 && (
              <div>
                <div className="text-sm text-muted font-heading font-bold mb-2">Konkurenční nabídky: porovnej, jestli se vyplatí ukončit</div>
                {!data.canChangeMainSponsor && (
                  <div className="mb-2 text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">
                    Limit změny hlavního sponzora 1× za sezónu už je vyčerpaný. Smlouvu můžeš ukončit, novou ale podepíšeš až příští sezónu.
                  </div>
                )}
                <OffersList offers={data.mainOffers} category="main" onSign={onSign} acting={acting}
                  current={data.mainContract} signDisabled={!data.canChangeMainSponsor} />
              </div>
            )}
          </div>
        ) : !data.canChangeMainSponsor ? (
          <Card>
            <CardBody>
              <p className="text-center text-sm text-muted py-3">
                Tuto sezónu už nového hlavního sponzora podepsat nejde (limit 1× za sezónu).
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.mainExpired?.renewal && (
              <ExpiredRenewCard contract={data.mainExpired} favor={favorOf(data.mainExpired)} onRenew={() => onRenew("main")} acting={acting} />
            )}
            {data.mainExpired?.blockedReason && (
              <Card>
                <CardBody>
                  <SponsorLink id={data.mainExpired.sponsorId} name={data.mainExpired.sponsorName} className="font-heading font-bold text-base" />
                  <div className="text-sm text-muted">Smlouva vypršela a obnovit ji nejde: {data.mainExpired.blockedReason}.</div>
                </CardBody>
              </Card>
            )}
            <OffersList offers={data.mainOffers} category="main" onSign={onSign} acting={acting} />
          </div>
        )}
      </section>

      {/* ── Sponzor stadionu ── */}
      <section>
        <SectionLabel>{"\u{1F3DF}"} Sponzor stadionu {data.stadiumName ? `(${data.stadiumName})` : ""}</SectionLabel>
        {data.stadiumContract ? (
          <div className="space-y-3">
            <ContractCard contract={data.stadiumContract} favor={favorOf(data.stadiumContract)} acting={acting}
              onTerminate={() => onTerminate("stadium")} onRenew={() => onRenew("stadium")} />
            {data.stadiumOffers.length > 0 && (
              <div>
                <div className="text-sm text-muted font-heading font-bold mb-2">Konkurenční nabídky: porovnej, jestli se vyplatí ukončit</div>
                <OffersList offers={data.stadiumOffers} category="stadium" onSign={onSign} acting={acting} current={data.stadiumContract} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {data.stadiumExpired?.renewal && (
              <ExpiredRenewCard contract={data.stadiumExpired} favor={favorOf(data.stadiumExpired)} onRenew={() => onRenew("stadium")} acting={acting} />
            )}
            <OffersList offers={data.stadiumOffers} category="stadium" onSign={onSign} acting={acting} />
          </div>
        )}
      </section>

      {/* ── Reklamní bannery ── */}
      <section>
        <SectionLabel>{"\u{1F3AF}"} Reklamní bannery ({data.bannerContracts.length}/{data.maxBanners})</SectionLabel>
        {data.bannerContracts.length > 0 && (
          <div className="space-y-2 mb-3">
            {data.bannerContracts.map((c) => (
              <ContractCard key={c.id} contract={c} favor={favorOf(c)} acting={acting}
                onTerminate={() => onTerminate("banner", c.id)} onRenew={() => onRenew("banner", c.id)} />
            ))}
          </div>
        )}
        {data.bannerContracts.length >= data.maxBanners ? (
          <Card><CardBody><p className="text-center text-sm text-muted py-3">Maximální počet bannerů ({data.maxBanners}) je dosažen.</p></CardBody></Card>
        ) : data.bannerOffers.length > 0 ? (
          <>
            <p className="text-sm text-muted mb-2">Můžeš podepsat až {data.maxBanners - data.bannerContracts.length} dalších bannerů.</p>
            <OffersList offers={data.bannerOffers} category="banner" onSign={onSign} acting={acting} />
          </>
        ) : (
          <Card><CardBody><p className="text-center text-sm text-muted py-3">Žádné nabídky bannerů.</p></CardBody></Card>
        )}
      </section>
    </div>
  );
}

/** Aktivní smlouva: částky v jednom řádku, náklonnost majitele, prodloužení a výpověď. */
function ContractCard({ contract, favor, onTerminate, onRenew, acting }: {
  contract: ActiveContract; favor: number | null; onTerminate: () => void; onRenew: () => void; acting: boolean;
}) {
  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="min-w-0">
          <SponsorLink id={contract.sponsorId} name={contract.sponsorName} className="font-heading font-bold text-base" />
          <div className="text-sm text-muted">{sponsorTypeLabel(contract.sponsorType)}</div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
          <span className="text-pitch-500 font-heading font-bold">+{formatCZK(weeklyAmount(contract.monthlyAmount))}/týd</span>
          {contract.winBonus > 0 && <span className="text-pitch-400">+{formatCZK(contract.winBonus)} za výhru</span>}
          <span className="text-muted">zbývá {contract.seasonsRemaining} z {contract.seasonsTotal} sezón</span>
          <span className="text-card-red">sankce {formatCZK(contract.earlyTerminationFee)}</span>
        </div>
        {favor != null && <FavorLine favor={favor} />}
        {contract.renewal ? (
          <div className="text-sm text-muted">
            Prodloužení: <span className="text-pitch-500 font-heading font-bold">+{formatCZK(weeklyAmount(contract.renewal.monthlyAmount))}/týd</span>{" "}
            na {seasonsAccusative(contract.renewal.seasons)}
          </div>
        ) : (
          <div className="text-sm text-muted">
            {contract.blockedReason
              ? `Smlouva skončí s koncem sezóny: ${contract.blockedReason}.`
              : "Prodloužit půjde v poslední sezóně smlouvy."}
          </div>
        )}
        <div className="pt-2 border-t border-line-soft flex items-center gap-5 flex-wrap">
          {contract.renewal && (
            <button onClick={onRenew} disabled={acting}
              className="min-h-11 text-sm text-pitch-600 hover:text-pitch-500 font-heading font-bold transition-colors disabled:opacity-50">
              🤝 Prodloužit smlouvu
            </button>
          )}
          <button onClick={onTerminate} disabled={acting}
            className="min-h-11 text-sm text-card-red hover:text-red-700 font-heading font-bold transition-colors disabled:opacity-50">
            Ukončit předčasně
          </button>
        </div>
      </CardBody>
    </Card>
  );
}

/** Nedávno vypršelá smlouva: obnova se stejným sponzorem za aktuální podmínky. Cena je v info řádku, ne v tlačítku. */
function ExpiredRenewCard({ contract, favor, onRenew, acting }: {
  contract: ActiveContract; favor: number | null; onRenew: () => void; acting: boolean;
}) {
  const r = contract.renewal;
  if (!r) return null;
  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="min-w-0">
          <SponsorLink id={contract.sponsorId} name={contract.sponsorName} className="font-heading font-bold text-base" />
          <div className="text-sm text-muted">Smlouva vypršela s koncem sezóny, sponzor je připraven jednat o nové.</div>
        </div>
        {favor != null && <FavorLine favor={favor} />}
        <div className="text-sm">
          Nové podmínky: <span className="text-pitch-500 font-heading font-bold">+{formatCZK(weeklyAmount(r.monthlyAmount))}/týd</span>{" "}
          na {seasonsAccusative(r.seasons)}
        </div>
        <button onClick={onRenew} disabled={acting} className="btn btn-primary btn-sm">🤝 Obnovit smlouvu</button>
      </CardBody>
    </Card>
  );
}

function OffersList({ offers, category, onSign, acting, current, signDisabled }: {
  offers: SponsorOffer[];
  category: SponsorCategory;
  onSign: (offer: SponsorOffer, category: SponsorCategory) => void;
  acting: boolean;
  current?: ActiveContract | null;
  signDisabled?: boolean;
}) {
  if (offers.length === 0) {
    return <Card><CardBody><p className="text-center text-sm text-muted py-3">Žádné nabídky. Zvyš reputaci pro lepší sponzory.</p></CardBody></Card>;
  }
  // Sankce za ukončení aktuální smlouvy (poměrná podle zbývajících sezón), stejný vzorec jako handleTerminate na stránce.
  const currentTerminationFee = current ? Math.round(current.earlyTerminationFee * (current.seasonsRemaining / 3)) : 0;
  const currentWeekly = current ? weeklyAmount(current.monthlyAmount) : 0;
  return (
    <div className="space-y-2">
      {offers.map((offer, i) => {
        const offerWeekly = weeklyAmount(offer.monthlyAmount);
        const weeklyDelta = offerWeekly - currentWeekly;
        // Po kolika týdnech se odpočítá sankce za ukončení smlouvy?
        const payback = current && weeklyDelta > 0 ? Math.ceil(currentTerminationFee / weeklyDelta) : null;
        return (
          <Card key={`${offer.sponsorId}-${i}`}>
            <CardBody className="space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SponsorLink id={offer.sponsorId} name={offer.sponsorName} className="font-heading font-bold text-base" />
                  <div className="text-sm text-muted">{sponsorTypeLabel(offer.sponsorType)}</div>
                </div>
                <button onClick={() => onSign(offer, category)} disabled={acting || signDisabled}
                  title={signDisabled ? "Limit změny pro tuto sezónu vyčerpán" : undefined}
                  className="shrink-0 btn btn-primary btn-sm">
                  Podepsat
                </button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
                <span className="text-pitch-500 font-heading font-bold">+{formatCZK(offerWeekly)}/týd</span>
                {offer.winBonus > 0 && <span className="text-pitch-400">+{formatCZK(offer.winBonus)} za výhru</span>}
                <span className="text-muted">na {seasonsAccusative(offer.seasons)}</span>
                <span className="text-card-red">sankce {formatCZK(offer.earlyTerminationFee)}</span>
              </div>
              {(category === "main" || offer.requirement) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gold-600">
                  {category === "main" && <span>Změní název klubu, -3 reputace</span>}
                  {offer.requirement && <span>{offer.requirement}</span>}
                </div>
              )}
              {current && (
                <div className="pt-1.5 border-t border-line-soft text-sm">
                  <span className="text-muted">Oproti {current.sponsorName}: </span>
                  <span className={weeklyDelta > 0 ? "text-pitch-500 font-heading font-bold" : weeklyDelta < 0 ? "text-card-red font-heading font-bold" : "text-muted"}>
                    {weeklyDelta > 0 ? "+" : ""}{formatCZK(weeklyDelta)}/týd
                  </span>
                  <span className="text-muted">. Sankce za ukončení: <span className="text-card-red font-bold">{formatCZK(currentTerminationFee)}</span>.</span>
                  {payback && (
                    <span className="text-muted"> Návratnost změny: <span className="font-bold">{payback} {payback === 1 ? "týden" : payback < 5 ? "týdny" : "týdnů"}</span>.</span>
                  )}
                  {weeklyDelta <= 0 && <span className="text-card-red"> Nevyplatí se.</span>}
                </div>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Záložka Firmy (zatím bez filtru)**

`apps/web/src/components/sponsors/firms-tab.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Card, CardBody } from "@/components/ui";
import { formatCZK, personalityLabel } from "@/lib/sponsor-owners";
import type { DistrictFirm } from "@/lib/sponsor-page-types";
import { sponsorTypeLabel } from "@/lib/sponsor-types";
import { FavorBadge } from "./favor-badge";
import { SponsorLink } from "./sponsor-link";

/** Firma z okresu: obor, majitel, čí je hlavním sponzorem (nebo odhad rozpočtu), náklonnost k nám. */
export function FirmCard({ firm: f }: { firm: DistrictFirm }) {
  return (
    <Card>
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
                  ? <>Hlavní sponzor klubu <Link href={`/tym/${f.mainHolder.teamId}`} className="underline text-base">{f.mainHolder.teamName}</Link></>
                  : `Volný, rozpočet zhruba ${formatCZK(f.budgetEstimate.low)} až ${formatCZK(f.budgetEstimate.high)} měsíčně`}
            </div>
          </div>
          <FavorBadge favor={f.favor} />
        </div>
      </CardBody>
    </Card>
  );
}

export function FirmsTab({ firms }: { firms: DistrictFirm[] | null }) {
  if (!firms) {
    return <Card><CardBody><p className="text-center text-sm text-muted py-3">Firmy v okrese se nepodařilo načíst.</p></CardBody></Card>;
  }
  if (firms.length === 0) {
    return <Card><CardBody><p className="text-center text-sm text-muted py-3">V okrese zatím nejsou žádné firmy.</p></CardBody></Card>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        Vztah k majitelům si budujte dopředu: pozvěte je na zápas, potkejte je v hospodě. Kdo vás má rád, dá víc.
      </p>
      {firms.map((f) => <FirmCard key={f.sponsorId} firm={f} />)}
    </div>
  );
}
```

- [ ] **Step 7: Stránka se záložkami**

Celý obsah `apps/web/src/app/(hra)/sponzori/page.tsx` nahradit (akce `handleSign`, `handleTerminate`, `handleRenew`, `handleRename`, `handlePub` jsou převzaté beze změny chování; změny: typy z `sponsor-page-types`, `SponsorLink` z komponenty, `text-xs` → `text-sm`, logovaná chyba v prvním načtení, obsah pod záložkami):

```tsx
"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team } from "@/lib/api";
import { formatCZK } from "@/lib/sponsor-owners";
import type { DistrictFirm, PubEncounter, SponsorCategory, SponsorOffer, SponsorsData } from "@/lib/sponsor-page-types";
import { Card, CardBody, Spinner, Tabs, useConfirm, useTabParam } from "@/components/ui";
import { ContractsTab } from "@/components/sponsors/contracts-tab";
import { FirmsTab } from "@/components/sponsors/firms-tab";
import { SponsorLink } from "@/components/sponsors/sponsor-link";

const SPONSOR_TABS = ["contracts", "firms"] as const;
type SponsorTab = (typeof SPONSOR_TABS)[number];
const TAB_LABELS: Record<SponsorTab, string> = {
  contracts: "Smlouvy",
  firms: "Firmy v okrese",
};
/** Klíč v localStorage: poslední otevřená záložka (jen pohodlí v tomhle prohlížeči). */
const TAB_STORAGE_KEY = "sponzori-tab";

export default function SponsorsPage() {
  const { teamId, setTeam: setTeamCtx } = useTeam();
  const [tab, setTab] = useTabParam(SPONSOR_TABS, "tab", TAB_STORAGE_KEY);
  const [data, setData] = useState<SponsorsData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [firms, setFirms] = useState<{ firms: DistrictFirm[]; pub: PubEncounter | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [showRename, setShowRename] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const refresh = async () => {
    if (!teamId) return;
    const [s, t] = await Promise.all([
      apiFetch<SponsorsData>(`/api/teams/${teamId}/sponsors`),
      apiFetch<Team>(`/api/teams/${teamId}`),
    ]);
    setData(s); setTeam(t);
    const f = await apiFetch<{ firms: DistrictFirm[]; pub: PubEncounter | null }>(`/api/teams/${teamId}/sponsor-owners`)
      .catch((e) => { console.error("sponsor-owners:", e); return null; });
    setFirms(f);
  };

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

  useEffect(() => {
    refresh()
      .catch((e) => { console.error("sponzori refresh:", e); })
      .finally(() => setLoading(false));
  }, [teamId]);

  const handleSign = async (offer: SponsorOffer, category: SponsorCategory) => {
    if (!teamId || acting) return;
    const isMain = category === "main";
    const isBanner = category === "banner";
    const details = [
      { label: "Týdenní příjem", value: `+${formatCZK(Math.round(offer.monthlyAmount / 4.3))}`, color: "text-pitch-500" },
      ...(offer.winBonus > 0 ? [{ label: "Bonus za výhru", value: `+${formatCZK(offer.winBonus)}`, color: "text-pitch-400" }] : []),
      { label: "Sankce za zrušení", value: `-${formatCZK(offer.earlyTerminationFee)}`, color: "text-card-red" },
    ];
    if (isMain) {
      details.push({ label: "Změna názvu", value: "Ano (název se změní)", color: "text-gold-600" });
      details.push({ label: "Dopad na reputaci", value: "-3 reputace", color: "text-card-red" });
    }
    const description = isMain
      ? `Název týmu se změní na sponzorský. Změna hlavního sponzora je možná max 1x za sezónu.`
      : isBanner
      ? `Reklamní banner kolem hřiště na ${offer.seasons} ${offer.seasons === 1 ? "sezónu" : "sezóny"}`
      : `Smlouva na sponzora stadionu na ${offer.seasons} ${offer.seasons === 1 ? "sezónu" : "sezóny"}`;
    const ok = await confirm({
      title: `Podepsat smlouvu ${offer.sponsorName}?`,
      description,
      details,
      confirmLabel: "Podepsat",
    });
    if (!ok) return;
    setActionError(null);
    setActing(true);
    const res = await apiFetch<{ ok: boolean; newTeamName?: string }>(`/api/teams/${teamId}/sponsors/sign`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...offer, category }),
    }).catch((e) => { console.error("sponsors/sign:", e); setActionError((e as Error).message); return null; });
    if (res?.newTeamName && teamId) {
      setTeamCtx(teamId, res.newTeamName);
    }
    await refresh();
    setActing(false);
  };

  const handleTerminate = async (category: SponsorCategory, contractId?: string) => {
    if (!teamId || acting) return;
    const contract = category === "main"
      ? data?.mainContract
      : category === "stadium"
      ? data?.stadiumContract
      : data?.bannerContracts.find((c) => c.id === contractId);
    if (!contract) return;
    const fee = Math.round(contract.earlyTerminationFee * (contract.seasonsRemaining / 3));
    const isMain = category === "main";

    const details = [
      { label: "Sankce", value: `-${formatCZK(fee)}`, color: "text-card-red" },
    ];
    let description = `Zbývá ${contract.seasonsRemaining} sezón ze smlouvy s ${contract.sponsorName}.`;
    if (isMain) {
      details.push({ label: "Dopad na reputaci", value: "-2 reputace", color: "text-card-red" });
      if (!data?.canChangeMainSponsor) {
        description += " Tuto sezónu už jsi změnil název, novou sponzorskou smlouvu uzavřeš až příští sezónu.";
      }
    }

    const ok = await confirm({
      title: "Ukončit smlouvu předčasně?",
      description,
      details,
      confirmLabel: "Ukončit smlouvu",
      variant: "danger",
    });
    if (!ok) return;
    setActionError(null);
    setActing(true);
    const res = await apiFetch<{ ok: boolean; newTeamName?: string }>(`/api/teams/${teamId}/sponsors/terminate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, contractId }),
    }).catch((e) => { console.error("sponsors/terminate:", e); setActionError((e as Error).message); return null; });
    if (res?.newTeamName && teamId) {
      setTeamCtx(teamId, res.newTeamName);
    }
    await refresh();
    setActing(false);
  };

  const handleRenew = async (category: SponsorCategory, contractId?: string) => {
    if (!teamId || acting) return;
    const contract = category === "main"
      ? (data?.mainContract ?? data?.mainExpired)
      : category === "stadium"
      ? (data?.stadiumContract ?? data?.stadiumExpired)
      : data?.bannerContracts.find((c) => c.id === contractId);
    if (!contract?.renewal) return;
    const r = contract.renewal;
    const ok = await confirm({
      title: `Prodloužit smlouvu s ${contract.sponsorName}?`,
      description: `Nová smlouva na ${r.seasons} sezóny za podmínek podle aktuální reputace. Beze změny názvu klubu a bez sankce.`,
      details: [
        { label: "Nově týdně", value: `+${formatCZK(Math.round(r.monthlyAmount / 4.3))}`, color: "text-pitch-500" },
        ...(r.winBonus > 0 ? [{ label: "Za výhru", value: `+${formatCZK(r.winBonus)}`, color: "text-pitch-400" }] : []),
        { label: "Délka", value: `${r.seasons} sezóny` },
      ],
      confirmLabel: "Prodloužit smlouvu",
    });
    if (!ok) return;
    setActionError(null);
    setActing(true);
    await apiFetch(`/api/teams/${teamId}/sponsors/renew`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractId: contract.id }),
    }).catch((e) => { console.error("sponsors/renew:", e); setActionError((e as Error).message); return null; });
    await refresh();
    setActing(false);
  };

  const handleRename = async () => {
    if (!teamId || acting || !renameInput.trim()) return;
    const ok = await confirm({
      title: `Přejmenovat na "${renameInput.trim()}"?`,
      description: "Název lze změnit max 1x za sezónu. Fanoušci budou nespokojení.",
      details: [
        { label: "Dopad na reputaci", value: "-3 reputace", color: "text-card-red" },
      ],
      confirmLabel: "Přejmenovat",
    });
    if (!ok) return;
    setActionError(null);
    setActing(true);
    const res = await apiFetch<{ ok: boolean; newName?: string }>(`/api/teams/${teamId}/rename`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameInput.trim() }),
    }).catch((e) => { console.error("team/rename:", e); return null; });
    if (res?.newName && teamId) {
      setTeamCtx(teamId, res.newName);
    }
    setShowRename(false);
    setRenameInput("");
    await refresh();
    setActing(false);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!data || !team) return <div className="page-container">Data nenalezena.</div>;

  const hasMainSponsor = !!data.mainContract;
  const favors = new Map<number, number>((firms?.firms ?? []).map((f) => [f.sponsorId, f.favor]));

  return (
    <div className="page-container space-y-5">
      {confirmDialog}

      {/* Název klubu + přejmenování */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-muted font-heading uppercase mb-1">Název klubu</div>
              <div className="font-heading font-bold text-xl">{data.teamName}</div>
            </div>
            {!hasMainSponsor && data.canChangeMainSponsor && !showRename && (
              <button onClick={() => setShowRename(true)} className="min-h-11 text-sm text-pitch-500 font-heading font-bold hover:text-pitch-600 transition-colors">
                Přejmenovat
              </button>
            )}
            {!data.canChangeMainSponsor && (
              <span className="text-sm text-muted bg-surface px-2 py-1 rounded-full shrink-0">Změna 1× za sezónu vyčerpána</span>
            )}
          </div>
          {showRename && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
              <input
                type="text" value={renameInput} onChange={(e) => setRenameInput(e.target.value)}
                placeholder="Nový název klubu..." maxLength={50}
                className="input flex-1 min-w-0"
              />
              <button onClick={handleRename} disabled={acting || !renameInput.trim()}
                className="btn btn-primary btn-sm">Uložit</button>
              <button onClick={() => { setShowRename(false); setRenameInput(""); }}
                className="btn btn-ghost btn-sm">Zrušit</button>
            </div>
          )}
          {showRename && (
            <p className="text-sm text-card-red mt-2">Přejmenování stojí -3 reputace a je možné max 1× za sezónu.</p>
          )}
        </CardBody>
      </Card>

      {actionError && (
        <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">{actionError}</div>
      )}

      {firms?.pub && (
        <Card>
          <CardBody>
            <div className="text-sm">
              🍺 V hospodě sedí <span className="font-heading font-bold text-base">{firms.pub.ownerName}</span>, majitel{" "}
              <SponsorLink id={firms.pub.sponsorId} name={firms.pub.sponsorName} className="font-heading font-bold text-base" />.
              Pozvat ho na pivo stojí {formatCZK(firms.pub.beerCost)}.
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => handlePub("beer")} disabled={acting} className="btn btn-primary btn-sm">Pozvat na pivo</button>
              <button onClick={() => handlePub("ignore")} disabled={acting} className="btn btn-ghost btn-sm">Nechat ho být</button>
            </div>
          </CardBody>
        </Card>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="Sponzoři"
        items={SPONSOR_TABS.map((key) => ({ key, label: TAB_LABELS[key] }))}
      />

      {tab === "contracts" && (
        <ContractsTab
          data={data}
          reputation={team.reputation}
          favors={favors}
          acting={acting}
          onSign={handleSign}
          onTerminate={handleTerminate}
          onRenew={handleRenew}
        />
      )}
      {tab === "firms" && <FirmsTab firms={firms?.firms ?? null} />}
    </div>
  );
}
```

- [ ] **Step 8: Kontrola textů, typecheck, build**

Run: `grep -n "—\|text-xs" "apps/web/src/app/(hra)/sponzori/page.tsx" apps/web/src/components/sponsors/contracts-tab.tsx apps/web/src/components/sponsors/firms-tab.tsx apps/web/src/components/sponsors/favor-badge.tsx`
Expected: žádný výstup (v textech pro hráče ani ve třídách).

Run: `npm run typecheck`
Expected: `Tasks:    5 successful, 5 total`

Run: `cd apps/web && npx next build --no-lint`
Expected: build projde, v přehledu rout je `/sponzori`.

- [ ] **Step 9: Lokální kontrola v prohlížeči (localhost)**

Dev server (`npm run dev`, web volá `localhost:8787` podle `.env.local`); na `http://localhost:3000/sponzori`: dvě záložky, Smlouvy ukazují hlavního sponzora s řádkem „Náklonnost majitele“, tlačítka bez cen; přepnutí na Firmy → adresa `?tab=firms`; obnovení stránky bez `?tab` (otevřít `/sponzori`) vrátí Firmy. Pokud se záložky nechovají podle nového kódu, zkontrolovat, jestli lokálně nestíní `apps/web/src/components/ui/tabs.js` (viz Global Constraints) a nahlásit to.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/ui/tabs.tsx apps/web/src/lib/sponsor-page-types.ts apps/web/src/lib/sponsor-format.ts apps/web/src/components/sponsors/sponsor-link.tsx apps/web/src/components/sponsors/favor-badge.tsx apps/web/src/components/sponsors/contracts-tab.tsx apps/web/src/components/sponsors/firms-tab.tsx "apps/web/src/app/(hra)/sponzori/page.tsx"
git commit -m "$(cat <<'EOF'
feat(web): zalozky na /sponzori, kompaktni smlouvy s naklonnosti majitele

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Web — Firmy v okrese: filtr a řazení

**Files:**
- Create: `apps/web/src/lib/sponsor-firms.ts`
- Modify (celý obsah): `apps/web/src/components/sponsors/firms-tab.tsx`
- Modify: `apps/web/src/app/(hra)/sponzori/page.tsx`

**Interfaces:**
- Consumes: `DistrictFirm`, `SponsorsData` (`sponsor-page-types`), `sponsorTypeLabel`.
- Produces:
  - `type FirmFilter = "free" | "taken" | "mine" | "all"`, `type FirmSort = "favor" | "budget" | "type"`
  - `FIRM_FILTERS: ReadonlyArray<{ key: FirmFilter; label: string }>`, `FIRM_SORTS: ReadonlyArray<{ key: FirmSort; label: string }>`
  - `filterFirms(firms: DistrictFirm[], filter: FirmFilter, mySponsorIds: ReadonlySet<number>): DistrictFirm[]`
  - `sortFirms(firms: DistrictFirm[], sort: FirmSort): DistrictFirm[]`
  - `mySponsorIdsOf(data: SponsorsData): Set<number>`
  - `FirmsTab({ firms, mySponsorIds }: { firms: DistrictFirm[] | null; mySponsorIds: ReadonlySet<number> })`

- [ ] **Step 1: Filtr a řazení**

`apps/web/src/lib/sponsor-firms.ts`:

```ts
/** Firmy v okrese: filtr a řazení na klientu nad daty z GET /api/teams/:teamId/sponsor-owners. */
import type { DistrictFirm, SponsorsData } from "./sponsor-page-types";
import { sponsorTypeLabel } from "./sponsor-types";

export type FirmFilter = "free" | "taken" | "mine" | "all";
export type FirmSort = "favor" | "budget" | "type";

export const FIRM_FILTERS: ReadonlyArray<{ key: FirmFilter; label: string }> = [
  { key: "free", label: "Volné" },
  { key: "taken", label: "Obsazené" },
  { key: "mine", label: "Moje" },
  { key: "all", label: "Vše" },
];

export const FIRM_SORTS: ReadonlyArray<{ key: FirmSort; label: string }> = [
  { key: "favor", label: "Náklonnost" },
  { key: "budget", label: "Rozpočet" },
  { key: "type", label: "Obor" },
];

/** Firmy, se kterými máme aktivní smlouvu jakékoli kategorie (hlavní, stadion, banner). */
export function mySponsorIdsOf(data: SponsorsData): Set<number> {
  const ids = [data.mainContract?.sponsorId, data.stadiumContract?.sponsorId, ...data.bannerContracts.map((c) => c.sponsorId)];
  return new Set(ids.filter((id): id is number => id != null));
}

/**
 * Volné = nikdo je nemá jako hlavního sponzora. Obsazené = hlavní sponzor jiného klubu.
 * Moje = náš hlavní sponzor nebo jakákoli naše aktivní smlouva.
 */
export function filterFirms(firms: DistrictFirm[], filter: FirmFilter, mySponsorIds: ReadonlySet<number>): DistrictFirm[] {
  switch (filter) {
    case "free": return firms.filter((f) => f.mainHolder === null);
    case "taken": return firms.filter((f) => f.mainHolder !== null && !f.isMine);
    case "mine": return firms.filter((f) => f.isMine || mySponsorIds.has(f.sponsorId));
    case "all": return firms;
  }
}

/** Náklonnost a rozpočet sestupně, obor abecedně; při shodě podle názvu. Nemění vstupní pole. */
export function sortFirms(firms: DistrictFirm[], sort: FirmSort): DistrictFirm[] {
  const byName = (a: DistrictFirm, b: DistrictFirm) => a.name.localeCompare(b.name, "cs");
  const copy = [...firms];
  if (sort === "favor") return copy.sort((a, b) => b.favor - a.favor || byName(a, b));
  if (sort === "budget") return copy.sort((a, b) => b.budgetEstimate.high - a.budgetEstimate.high || byName(a, b));
  return copy.sort((a, b) => sponsorTypeLabel(a.type).localeCompare(sponsorTypeLabel(b.type), "cs") || byName(a, b));
}
```

- [ ] **Step 2: Záložka Firmy s filtrem a řazením**

Celý obsah `apps/web/src/components/sponsors/firms-tab.tsx` nahradit (komponenta `FirmCard` zůstává stejná jako v Tasku 3):

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui";
import { FIRM_FILTERS, FIRM_SORTS, filterFirms, sortFirms, type FirmFilter, type FirmSort } from "@/lib/sponsor-firms";
import { formatCZK, personalityLabel } from "@/lib/sponsor-owners";
import type { DistrictFirm } from "@/lib/sponsor-page-types";
import { sponsorTypeLabel } from "@/lib/sponsor-types";
import { FavorBadge } from "./favor-badge";
import { SponsorLink } from "./sponsor-link";

/** Firma z okresu: obor, majitel, čí je hlavním sponzorem (nebo odhad rozpočtu), náklonnost k nám. */
export function FirmCard({ firm: f }: { firm: DistrictFirm }) {
  return (
    <Card>
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
                  ? <>Hlavní sponzor klubu <Link href={`/tym/${f.mainHolder.teamId}`} className="underline text-base">{f.mainHolder.teamName}</Link></>
                  : `Volný, rozpočet zhruba ${formatCZK(f.budgetEstimate.low)} až ${formatCZK(f.budgetEstimate.high)} měsíčně`}
            </div>
          </div>
          <FavorBadge favor={f.favor} />
        </div>
      </CardBody>
    </Card>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 px-3 min-h-11 rounded-control text-sm font-heading font-bold transition-colors ${
        active ? "bg-pitch-500 text-white" : "bg-surface-2 text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function FirmsTab({ firms, mySponsorIds }: { firms: DistrictFirm[] | null; mySponsorIds: ReadonlySet<number> }) {
  const [filter, setFilter] = useState<FirmFilter>("all");
  const [sort, setSort] = useState<FirmSort>("favor");

  if (!firms) {
    return <Card><CardBody><p className="text-center text-sm text-muted py-3">Firmy v okrese se nepodařilo načíst.</p></CardBody></Card>;
  }
  if (firms.length === 0) {
    return <Card><CardBody><p className="text-center text-sm text-muted py-3">V okrese zatím nejsou žádné firmy.</p></CardBody></Card>;
  }

  const shown = sortFirms(filterFirms(firms, filter, mySponsorIds), sort);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Vztah k majitelům si budujte dopředu: pozvěte je na zápas, potkejte je v hospodě. Kdo vás má rád, dá víc.
      </p>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Filtr firem">
        {FIRM_FILTERS.map(({ key, label }) => (
          <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
            {label} ({filterFirms(firms, key, mySponsorIds).length})
          </Chip>
        ))}
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Řazení firem">
        <span className="shrink-0 text-sm text-muted mr-1">Řadit:</span>
        {FIRM_SORTS.map(({ key, label }) => (
          <Chip key={key} active={sort === key} onClick={() => setSort(key)}>{label}</Chip>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card><CardBody><p className="text-center text-sm text-muted py-3">V tomhle výběru žádná firma není.</p></CardBody></Card>
      ) : (
        <div className="space-y-2">
          {shown.map((f) => <FirmCard key={f.sponsorId} firm={f} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Napojit na stránku**

V `apps/web/src/app/(hra)/sponzori/page.tsx` přidat import pod řádek:

```tsx
import { FirmsTab } from "@/components/sponsors/firms-tab";
```

řádek:

```tsx
import { mySponsorIdsOf } from "@/lib/sponsor-firms";
```

Najít:

```tsx
      {tab === "firms" && <FirmsTab firms={firms?.firms ?? null} />}
```

nahradit:

```tsx
      {tab === "firms" && <FirmsTab firms={firms?.firms ?? null} mySponsorIds={mySponsorIdsOf(data)} />}
```

- [ ] **Step 4: Typecheck a build**

Run: `npm run typecheck`
Expected: `Tasks:    5 successful, 5 total`

Run: `cd apps/web && npx next build --no-lint`
Expected: build projde.

- [ ] **Step 5: Lokální kontrola**

Na `http://localhost:3000/sponzori?tab=firms`: čipy Volné / Obsazené / Moje / Vše s počty, součet Volné + Obsazené + (náš hlavní sponzor) = Vše; „Moje“ obsahuje hlavního sponzora, sponzora stadionu a bannery, pokud jsou z okresu; řazení Náklonnost/Rozpočet/Obor mění pořadí; na šířce 375 px čipy nepřetékají (lišta se scrolluje uvnitř, stránka ne).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/sponsor-firms.ts apps/web/src/components/sponsors/firms-tab.tsx "apps/web/src/app/(hra)/sponzori/page.tsx"
git commit -m "$(cat <<'EOF'
feat(web): filtr a razeni firem v okrese na /sponzori

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Web — záložka Oblíbenost

**Files:**
- Modify: `apps/web/src/lib/sponsor-page-types.ts`, `apps/web/src/lib/sponsor-owners.ts`, `apps/web/src/app/(hra)/sponzori/page.tsx`
- Create: `apps/web/src/components/sponsors/popularity-tab.tsx`

**Interfaces:**
- Consumes: `GET /api/teams/:teamId/sponsor-overview` (Task 2); `formatFavorDelta`, `formatGameDay` (`sponsor-format`); `FavorBadge`, `SponsorLink`.
- Produces:
  - typy `FavorBand`, `FirmFavorItem`, `FavorChange`, `SponsorOverview` v `sponsor-page-types`
  - `FAVOR_BAND_ORDER: readonly FavorBand[]`, `FAVOR_BAND_LABELS: Record<FavorBand, string>` v `sponsor-owners`
  - `PopularityTab({ overview, error }: { overview: SponsorOverview | null; error: string | null })`

- [ ] **Step 1: Typy přehledu**

Na konec `apps/web/src/lib/sponsor-page-types.ts` přidat:

```ts
/** Pásma náklonnosti; hranice drží API (apps/api/src/sponsors/overview.ts) i favorLabel. */
export type FavorBand = "loves" | "friendly" | "neutral" | "cold" | "hostile";

export interface FirmFavorItem { sponsorId: number; name: string; ownerName: string | null; favor: number }

export interface FavorChange {
  sponsorId: number;
  sponsorName: string;
  ownerName: string | null;
  delta: number;
  reason: string;
  gameDate: string;
}

export interface SponsorOverview {
  avgFavor: number | null;
  rank: number | null;
  clubsInDistrict: number;
  firmsCount: number;
  bands: Record<FavorBand, number>;
  top: FirmFavorItem[];
  coldest: FirmFavorItem[];
  recentChanges: FavorChange[];
}
```

- [ ] **Step 2: Popisky pásem**

V `apps/web/src/lib/sponsor-owners.ts` přidat na začátek souboru (nad `const PERSONALITY_LABELS`) import:

```ts
import type { FavorBand } from "./sponsor-page-types";
```

a za funkci `favorLabel` (najít):

```ts
  if (f >= 20) return "Chladný";
  return "Nemá vás rád";
}
```

vložit:

```ts

/** Pásma od nejlepšího; popisky shodné s favorLabel. */
export const FAVOR_BAND_ORDER: readonly FavorBand[] = ["loves", "friendly", "neutral", "cold", "hostile"];

export const FAVOR_BAND_LABELS: Record<FavorBand, string> = {
  loves: "Fandí vám",
  friendly: "Příznivý",
  neutral: "Neutrální",
  cold: "Chladný",
  hostile: "Nemá vás rád",
};
```

- [ ] **Step 3: Komponenta záložky**

`apps/web/src/components/sponsors/popularity-tab.tsx`:

```tsx
"use client";

import { Card, CardBody, SectionLabel, Spinner } from "@/components/ui";
import { formatFavorDelta, formatGameDay } from "@/lib/sponsor-format";
import { FAVOR_BAND_LABELS, FAVOR_BAND_ORDER, favorLabel } from "@/lib/sponsor-owners";
import type { FavorBand, FirmFavorItem, SponsorOverview } from "@/lib/sponsor-page-types";
import { FavorBadge } from "./favor-badge";
import { SponsorLink } from "./sponsor-link";

const BAND_COLORS: Record<FavorBand, string> = {
  loves: "bg-pitch-500",
  friendly: "bg-pitch-300",
  neutral: "bg-muted-light",
  cold: "bg-gold-400",
  hostile: "bg-card-red",
};

function FirmList({ firms, empty }: { firms: FirmFavorItem[]; empty: string }) {
  if (firms.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="divide-y divide-line-soft">
      {firms.map((f) => (
        <div key={f.sponsorId} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <SponsorLink id={f.sponsorId} name={f.name} className="font-heading font-bold text-base" />
            {f.ownerName && <div className="text-sm text-muted">{f.ownerName}</div>}
          </div>
          <FavorBadge favor={f.favor} />
        </div>
      ))}
    </div>
  );
}

export function PopularityTab({ overview, error }: { overview: SponsorOverview | null; error: string | null }) {
  if (error) {
    return <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">Přehled se nepodařilo načíst: {error}</div>;
  }
  if (!overview) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (overview.firmsCount === 0 || overview.avgFavor == null) {
    return <Card><CardBody><p className="text-center text-sm text-muted py-3">V okrese zatím nejsou žádné firmy.</p></CardBody></Card>;
  }

  return (
    <div className="space-y-5">
      {/* ── Průměr a pořadí ── */}
      <Card>
        <CardBody>
          <div className="text-sm text-muted">Průměrná náklonnost firem v okrese</div>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="font-heading font-bold text-3xl tabular-nums">{overview.avgFavor.toLocaleString("cs")}</span>
            <span className="text-base font-heading font-bold">{favorLabel(overview.avgFavor)}</span>
          </div>
          {overview.rank != null && (
            <div className="text-sm mt-2">
              <span className="font-heading font-bold">{overview.rank}. místo</span>{" "}
              z {overview.clubsInDistrict} {overview.clubsInDistrict === 1 ? "klubu" : "klubů"} v okrese
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Rozložení do pásem ── */}
      <section>
        <SectionLabel>Jak vás firmy vidí</SectionLabel>
        <Card>
          <CardBody className="space-y-3">
            {FAVOR_BAND_ORDER.map((band) => {
              const n = overview.bands[band];
              const pct = Math.round((n / overview.firmsCount) * 100);
              return (
                <div key={band}>
                  <div className="flex justify-between text-sm">
                    <span>{FAVOR_BAND_LABELS[band]}</span>
                    <span className="font-heading font-bold tabular-nums">{n}</span>
                  </div>
                  <div className="h-2.5 mt-1 rounded-full bg-surface-3 overflow-hidden"
                    role="img" aria-label={`${FAVOR_BAND_LABELS[band]}: ${n} z ${overview.firmsCount} firem`}>
                    <div className={`h-full rounded-full ${BAND_COLORS[band]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </section>

      {/* ── Nejoblíbenější a nejchladnější ── */}
      <section>
        <SectionLabel>Nejvíc vás mají rádi</SectionLabel>
        <Card>
          <CardBody>
            <FirmList firms={overview.top} empty="Zatím vás žádná firma nemá raději než ostatní. Zvěte majitele na zápasy a choďte s nimi na pivo." />
          </CardBody>
        </Card>
      </section>
      <section>
        <SectionLabel>Nejchladnější</SectionLabel>
        <Card>
          <CardBody>
            <FirmList firms={overview.coldest} empty="Žádná firma vás nemá v nelásce." />
          </CardBody>
        </Card>
      </section>

      {/* ── Poslední změny ── */}
      <section>
        <SectionLabel>Poslední změny</SectionLabel>
        <Card>
          <CardBody>
            {overview.recentChanges.length === 0 ? (
              <p className="text-sm text-muted">Zatím se nic nezměnilo.</p>
            ) : (
              <div className="divide-y divide-line-soft">
                {overview.recentChanges.map((ch, i) => (
                  <div key={`${ch.sponsorId}-${ch.gameDate}-${i}`} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <SponsorLink id={ch.sponsorId} name={ch.sponsorName} className="font-heading font-bold text-base" />
                      <div className="text-sm text-muted">
                        {formatGameDay(ch.gameDate)}
                        {ch.ownerName ? ` · ${ch.ownerName}: ` : " · "}
                        {ch.reason}
                      </div>
                    </div>
                    <span className={`shrink-0 font-heading font-bold tabular-nums text-base ${ch.delta > 0 ? "text-pitch-500" : "text-card-red"}`}>
                      {formatFavorDelta(ch.delta)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Napojit na stránku**

V `apps/web/src/app/(hra)/sponzori/page.tsx`:

a) Import typů — najít:

```tsx
import type { DistrictFirm, PubEncounter, SponsorCategory, SponsorOffer, SponsorsData } from "@/lib/sponsor-page-types";
```

nahradit:

```tsx
import type { DistrictFirm, PubEncounter, SponsorCategory, SponsorOffer, SponsorOverview, SponsorsData } from "@/lib/sponsor-page-types";
```

a pod řádek `import { FirmsTab } from "@/components/sponsors/firms-tab";` přidat:

```tsx
import { PopularityTab } from "@/components/sponsors/popularity-tab";
```

b) Záložky — najít:

```tsx
const SPONSOR_TABS = ["contracts", "firms"] as const;
type SponsorTab = (typeof SPONSOR_TABS)[number];
const TAB_LABELS: Record<SponsorTab, string> = {
  contracts: "Smlouvy",
  firms: "Firmy v okrese",
};
```

nahradit:

```tsx
const SPONSOR_TABS = ["contracts", "firms", "popularity"] as const;
type SponsorTab = (typeof SPONSOR_TABS)[number];
const TAB_LABELS: Record<SponsorTab, string> = {
  contracts: "Smlouvy",
  firms: "Firmy v okrese",
  popularity: "Oblíbenost",
};
```

c) Stav a načítání — najít:

```tsx
  const { confirm, dialog: confirmDialog } = useConfirm();
```

nahradit:

```tsx
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [overview, setOverview] = useState<SponsorOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Přehled se načítá až při otevření záložky a po každé akci, která hýbe náklonností (hospoda).
  const loadOverview = async () => {
    if (!teamId) return;
    setOverviewError(null);
    const o = await apiFetch<SponsorOverview>(`/api/teams/${teamId}/sponsor-overview`)
      .catch((e) => { console.error("sponsor-overview:", e); setOverviewError((e as Error).message); return null; });
    setOverview(o);
  };

  useEffect(() => {
    if (tab === "popularity") void loadOverview();
  }, [tab, teamId]);
```

d) Po pivu obnovit i přehled — v `handlePub` najít:

```tsx
    }).catch((e) => { console.error("sponsor pub:", e); setActionError((e as Error).message); return null; });
    await refresh();
    setActing(false);
  };
```

nahradit:

```tsx
    }).catch((e) => { console.error("sponsor pub:", e); setActionError((e as Error).message); return null; });
    await refresh();
    if (tab === "popularity") await loadOverview();
    setActing(false);
  };
```

e) Obsah záložky — najít:

```tsx
      {tab === "firms" && <FirmsTab firms={firms?.firms ?? null} mySponsorIds={mySponsorIdsOf(data)} />}
```

nahradit:

```tsx
      {tab === "firms" && <FirmsTab firms={firms?.firms ?? null} mySponsorIds={mySponsorIdsOf(data)} />}
      {tab === "popularity" && <PopularityTab overview={overview} error={overviewError} />}
```

- [ ] **Step 5: Kontrola textů, typecheck, build**

Run: `grep -n "—\|text-xs" apps/web/src/components/sponsors/popularity-tab.tsx`
Expected: žádný výstup.

Run: `npm run typecheck`
Expected: `Tasks:    5 successful, 5 total`

Run: `cd apps/web && npx next build --no-lint`
Expected: build projde.

- [ ] **Step 6: Lokální kontrola**

Lokální API (`localhost:8787`) potřebuje tabulku `sponsor_favor_log` v lokální D1: `npx wrangler d1 execute prales-db-test --local --file apps/api/migrations/0219_sponsor_favor_log.sql` (z `apps/api`, lokální sqlite, na vzdálenou DB nesahá). Na `http://localhost:3000/sponzori?tab=popularity`: průměr, pořadí, pět pruhů (součet počtů = počet firem), prázdné stavy u nejoblíbenějších/nejchladnějších, pokud nikdo nemá náklonnost mimo 40.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/sponsor-page-types.ts apps/web/src/lib/sponsor-owners.ts apps/web/src/components/sponsors/popularity-tab.tsx "apps/web/src/app/(hra)/sponzori/page.tsx"
git commit -m "$(cat <<'EOF'
feat(web): zalozka Oblibenost na /sponzori

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Web — záložka Historie

**Files:**
- Modify: `apps/web/src/lib/sponsor-page-types.ts`, `apps/web/src/app/(hra)/sponzori/page.tsx`
- Create: `apps/web/src/components/sponsors/history-tab.tsx`

**Interfaces:**
- Consumes: `GET /api/teams/:teamId/sponsor-history` (Task 2); `weeklyAmount`, `seasonsAccusative`; `SponsorLink`.
- Produces: typ `SponsorHistoryItem`; `HistoryTab({ items, error }: { items: SponsorHistoryItem[] | null; error: string | null })`.

- [ ] **Step 1: Typ**

Na konec `apps/web/src/lib/sponsor-page-types.ts` přidat:

```ts
/** Skončená smlouva. Celkový výdělek API nevrací (sponzorské příjmy se v transakcích neevidují po sponzorech). */
export interface SponsorHistoryItem {
  id: string;
  sponsorId: number | null;
  sponsorName: string;
  category: SponsorCategory;
  status: "expired" | "terminated";
  seasonsTotal: number;
  monthlyAmount: number;
  /** Sezóna podpisu odvozená z data podpisu; null, když sezóny chybí. */
  signedSeason: number | null;
}
```

- [ ] **Step 2: Komponenta**

`apps/web/src/components/sponsors/history-tab.tsx`:

```tsx
"use client";

import { Card, CardBody, SectionLabel, Spinner } from "@/components/ui";
import { seasonsAccusative, weeklyAmount } from "@/lib/sponsor-format";
import { formatCZK } from "@/lib/sponsor-owners";
import type { SponsorCategory, SponsorHistoryItem } from "@/lib/sponsor-page-types";
import { SponsorLink } from "./sponsor-link";

const CATEGORY_LABELS: Record<SponsorCategory, string> = {
  main: "Hlavní sponzor",
  stadium: "Sponzor stadionu",
  banner: "Reklamní banner",
};

const STATUS_LABELS: Record<SponsorHistoryItem["status"], string> = {
  expired: "Vypršela",
  terminated: "Vypovězena",
};

export function HistoryTab({ items, error }: { items: SponsorHistoryItem[] | null; error: string | null }) {
  if (error) {
    return <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">Historii se nepodařilo načíst: {error}</div>;
  }
  if (!items) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (items.length === 0) {
    return <Card><CardBody><p className="text-center text-sm text-muted py-3">Zatím žádná skončená smlouva.</p></CardBody></Card>;
  }

  // Kdo byl hlavním sponzorem od které sezóny (jen smlouvy se známou sezónou podpisu), od nejstarší.
  const mains = items
    .filter((i): i is SponsorHistoryItem & { signedSeason: number } => i.category === "main" && i.signedSeason != null)
    .sort((a, b) => a.signedSeason - b.signedSeason);

  return (
    <div className="space-y-5">
      {mains.length > 0 && (
        <section>
          <SectionLabel>Hlavní sponzoři podle sezón</SectionLabel>
          <Card>
            <CardBody className="space-y-2">
              {mains.map((m) => (
                <div key={m.id} className="flex items-baseline gap-3">
                  <span className="w-28 shrink-0 text-sm text-muted tabular-nums">od sezóny {m.signedSeason}</span>
                  <SponsorLink id={m.sponsorId} name={m.sponsorName} className="font-heading font-bold text-base min-w-0" />
                </div>
              ))}
            </CardBody>
          </Card>
        </section>
      )}

      <section>
        <SectionLabel>Skončené smlouvy</SectionLabel>
        <div className="space-y-2">
          {items.map((i) => (
            <Card key={i.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <SponsorLink id={i.sponsorId} name={i.sponsorName} className="font-heading font-bold text-base" />
                    <div className="text-sm text-muted">
                      {CATEGORY_LABELS[i.category]}
                      {i.signedSeason != null ? ` · podepsána v sezóně ${i.signedSeason}` : ""}
                      {` · na ${seasonsAccusative(i.seasonsTotal)}`}
                    </div>
                    <div className="text-sm">Naposledy {formatCZK(weeklyAmount(i.monthlyAmount))} týdně</div>
                  </div>
                  <span className={`shrink-0 text-sm font-heading font-bold ${i.status === "terminated" ? "text-card-red" : "text-muted"}`}>
                    {STATUS_LABELS[i.status]}
                  </span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Napojit na stránku**

V `apps/web/src/app/(hra)/sponzori/page.tsx`:

a) Import typů — najít:

```tsx
import type { DistrictFirm, PubEncounter, SponsorCategory, SponsorOffer, SponsorOverview, SponsorsData } from "@/lib/sponsor-page-types";
```

nahradit:

```tsx
import type {
  DistrictFirm, PubEncounter, SponsorCategory, SponsorHistoryItem, SponsorOffer, SponsorOverview, SponsorsData,
} from "@/lib/sponsor-page-types";
```

a pod řádek `import { PopularityTab } from "@/components/sponsors/popularity-tab";` přidat:

```tsx
import { HistoryTab } from "@/components/sponsors/history-tab";
```

b) Záložky — najít:

```tsx
const SPONSOR_TABS = ["contracts", "firms", "popularity"] as const;
type SponsorTab = (typeof SPONSOR_TABS)[number];
const TAB_LABELS: Record<SponsorTab, string> = {
  contracts: "Smlouvy",
  firms: "Firmy v okrese",
  popularity: "Oblíbenost",
};
```

nahradit:

```tsx
const SPONSOR_TABS = ["contracts", "firms", "popularity", "history"] as const;
type SponsorTab = (typeof SPONSOR_TABS)[number];
const TAB_LABELS: Record<SponsorTab, string> = {
  contracts: "Smlouvy",
  firms: "Firmy v okrese",
  popularity: "Oblíbenost",
  history: "Historie",
};
```

c) Stav a načítání — najít:

```tsx
  useEffect(() => {
    if (tab === "popularity") void loadOverview();
  }, [tab, teamId]);
```

nahradit:

```tsx
  useEffect(() => {
    if (tab === "popularity") void loadOverview();
    if (tab === "history") void loadHistory();
  }, [tab, teamId]);

  const [history, setHistory] = useState<SponsorHistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Historie se načítá až při otevření záložky; výpověď smlouvy se v ní projeví při dalším otevření.
  async function loadHistory() {
    if (!teamId) return;
    setHistoryError(null);
    const h = await apiFetch<{ contracts: SponsorHistoryItem[] }>(`/api/teams/${teamId}/sponsor-history`)
      .catch((e) => { console.error("sponsor-history:", e); setHistoryError((e as Error).message); return null; });
    setHistory(h?.contracts ?? null);
  }
```

(`loadHistory` je deklarace funkce, aby ji šlo volat z efektu nad ní; `useState` volání zůstávají v každém renderu ve stejném pořadí.)

d) Obsah záložky — najít:

```tsx
      {tab === "popularity" && <PopularityTab overview={overview} error={overviewError} />}
```

nahradit:

```tsx
      {tab === "popularity" && <PopularityTab overview={overview} error={overviewError} />}
      {tab === "history" && <HistoryTab items={history} error={historyError} />}
```

- [ ] **Step 4: Kontrola textů, typecheck, build**

Run: `grep -n "—\|text-xs" apps/web/src/components/sponsors/history-tab.tsx "apps/web/src/app/(hra)/sponzori/page.tsx"`
Expected: žádný výstup.

Run: `npm run typecheck`
Expected: `Tasks:    5 successful, 5 total`

Run: `cd apps/web && npx next build --no-lint`
Expected: build projde.

- [ ] **Step 5: Lokální kontrola**

Na `http://localhost:3000/sponzori?tab=history`: skončené smlouvy s odkazem na sponzora, kategorií, sezónou podpisu, délkou a stavem (vypovězené červeně); nahoře „Hlavní sponzoři podle sezón“, pokud nějaký skončený hlavní sponzor je. Na 375 px bez vodorovného scrollu (4 záložky se vejdou nebo se lišta scrolluje uvnitř).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/sponsor-page-types.ts apps/web/src/components/sponsors/history-tab.tsx "apps/web/src/app/(hra)/sponzori/page.tsx"
git commit -m "$(cat <<'EOF'
feat(web): zalozka Historie sponzorskych smluv na /sponzori

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Nasazení na testing a ověření

**Files:** žádné nové (migrace test DB, ověření; testovací data se po ověření uklidí)

- [ ] **Step 1: Migrace 0219 na test DB (PŘED pushem)**

Bez tabulky by po nasazení selhala každá změna náklonnosti (log je ve stejném batchi).

```bash
npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0219_sponsor_favor_log.sql
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT name FROM sqlite_master WHERE name IN ("sponsor_favor_log", "idx_sponsor_favor_log_team")'
```
Expected: dva řádky (`sponsor_favor_log`, `idx_sponsor_favor_log_team`).

- [ ] **Step 2: Push na testing a počkat na deploy**

Uživatel musí push na testing odsouhlasit (pravidlo „testujeme na localhostu“ = push až po výslovném OK). Pak:

```bash
git push origin testing
sleep 80 && gh run list --branch testing --limit 1 --json headSha,status,conclusion
```
Expected: `headSha` = `git rev-parse HEAD`, `status: completed`, `conclusion: success`. Když ještě běží, zopakovat `gh run list` po chvíli. Při pádu `deploy-api-test` na síťové chybě Cloudflare `gh run rerun <id> --failed`.

- [ ] **Step 3: API přes curl**

```bash
B=https://api-test.prales.fun/api; T=302a0ce7-428a-4da8-b4ac-40f27eb9a7d1
curl -s "$B/teams/$T/sponsor-overview" | python3 -m json.tool
curl -s "$B/teams/$T/sponsor-history" | python3 -m json.tool | head -40
curl -s -o /dev/null -w "%{http_code}\n" "$B/teams/neexistuje/sponsor-overview"
curl -s "$B/teams/$T/sponsor-overview" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(d['bands'].values()) == d['firmsCount'], d['rank'], d['clubsInDistrict'])"
```
Expected: overview má klíče `avgFavor`, `rank`, `clubsInDistrict`, `firmsCount`, `bands` (5 pásem), `top`, `coldest`, `recentChanges`; součet pásem = počet firem (`True`), `rank` mezi 1 a `clubsInDistrict`; odpověď neobsahuje id ani názvy jiných klubů. History vrací `contracts` (může být prázdné), každá položka se `signedSeason`. Neexistující tým → `404`.

- [ ] **Step 4: Zápis do deníku na testingu**

Vložit testovací setkání v hospodě (test DB):

```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'INSERT INTO sponsor_pub_encounters (id, sponsor_id, team_id, status, expires_at, created_at) SELECT "test-pub-favorlog", id, "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1", "active", "2099-01-01", datetime("now") FROM district_sponsors WHERE district = "Praha" ORDER BY id LIMIT 1'
```

V prohlížeči (Step 5) kliknout „Pozvat na pivo“ a pak:

```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT sponsor_id, delta, reason, game_date FROM sponsor_favor_log WHERE team_id = "302a0ce7-428a-4da8-b4ac-40f27eb9a7d1" ORDER BY id DESC LIMIT 3'
```
Expected: nejnovější řádek `delta: 2`, `reason: "pivo v hospodě"`, `game_date` = herní datum týmu (ISO). Stejná změna je v `recentChanges` z `/sponsor-overview` jako `+2`.

- [ ] **Step 5: Prohlížeč (MCP), desktop i mobil**

1. `tabs_context_mcp` (createIfEmpty) → `https://test.prales.fun/login`; přihlášení účtem `claude-test@t.cz` zadá uživatel (heslo nevyplňovat), případně už existující session.
2. `https://test.prales.fun/sponzori`: nahoře karta názvu klubu a karta hospody (z Step 4); záložky Smlouvy / Firmy v okrese / Oblíbenost / Historie. Screenshot.
3. Smlouvy: u hlavního sponzora řádek „Náklonnost majitele: …“, v tlačítkách žádné ceny, prodloužení/výpověď otevírá potvrzovací dialog (dialog jen zavřít, nepotvrzovat).
4. Hospoda: „Pozvat na pivo“ → karta zmizí, na záložce Oblíbenost se objeví změna `+2` s důvodem „pivo v hospodě“ a datem.
5. Firmy: čipy s počty, přepnout Volné/Obsazené/Moje/Vše a řazení; odkazy na sponzora a klub vedou na `/sponzor/:id` a `/tym/:id`.
6. Historie: seznam nebo prázdný stav.
7. Zapamatování: otevřít Oblíbenost, pak navigovat na `https://test.prales.fun/sponzori` (bez `?tab`) → otevře se Oblíbenost a adresa dostane `?tab=popularity`. Systémové zpět vrací předchozí záložku.
8. Chybový stav: v `javascript_tool` ověřit, že `fetch("https://api-test.prales.fun/api/teams/neexistuje/sponsor-overview").then(r => r.status)` vrací 404 (UI s neexistujícím týmem nejde otevřít; chybová hláška záložky je pokrytá kódem).
9. Mobil: `resize_window` na 375×812, projít všechny čtyři záložky, screenshot každé; v `javascript_tool` `document.documentElement.scrollWidth <= window.innerWidth` → `true` na každé záložce. Písmo nikde menší než `text-sm`.
10. `read_console_messages`: žádné nové chyby kromě očekávaných.

- [ ] **Step 6: Úklid a zpráva uživateli**

```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'DELETE FROM sponsor_pub_encounters WHERE id = "test-pub-favorlog"'
```

(Řádek v deníku a +2 náklonnosti z testu zůstávají, jsou to běžná herní data na testu.)

Shrnout uživateli: co je na testingu, výsledky curl a prohlížeče se screenshoty. **STOP: na `main` nic.** Pro produkci připomenout pořadí: záloha prod DB (`wrangler d1 export`), migrace 0219 na `prales-db-prod` **před** merge (jinak po nasazení selže každá změna náklonnosti), teprve pak merge; vše jen po výslovném souhlasu. Doplnit položku do `project_prod_deploy_pending.md` v paměti.
