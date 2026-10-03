# Přestup na splátky, procenta z příštího přestupu a nové Přestupy — plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kupující může přestup zaplatit zálohou a týdenními splátkami a nabídnout procenta z příštího přestupu; všechno je součástí vyjednávání a vidět na jednom místě (záložka Závazky). Přestupy dostanou nové uspořádání záložek (Trh s podzáložkami, Sledovaní jako tabulka).

**Architecture:** Podmínky obchodu (`TransferTerms`) a jejich výpočty jsou čisté funkce ve sdíleném balíčku, takže je API i web počítají stejně. Splátkové dohody a doložky o procentech jsou dvě nové tabulky; peníze se hýbou jen přes `recordTransaction` nebo v dávce přijetí přestupu, s optimistickým zabráním řádku, aby nic neproběhlo dvakrát. Týdenní splátky běží v pondělních financích; doplacení a procenta při dalším prodeji se zpracují hned po přijetí přestupu (lidského i CPU).

**Tech Stack:** Cloudflare Workers + Hono + D1 (SQLite), Next.js 15 (App Router) na Cloudflare Pages, Vitest (API: falešná D1 i Miniflare), sdílený balíček `@okresni-masina/shared`.

**Spec:** `docs/superpowers/specs/2026-10-03-splatky-a-procenta-z-prestupu-design.md`

## Global Constraints

- Záloha 20–100 %, 100 % = jednorázově. Počet týdenních splátek 0 nebo 2–10. Procenta z příštího přestupu 0–50 % po 5 %.
- Záloha pod 100 % jen se splátkami (2–10) a naopak.
- Cena celkem 1 až `MAX_TRANSFER_AMOUNT` (10 000 000 Kč). Úroky žádné.
- Nejvýš **3 aktivní splátkové přestupy** na kupujícího.
- Kupující potřebuje peníze jen na zálohu + mezikrajský poplatek (z celé ceny).
- Splátka se strhne každé pondělí **i do minusu**; prodávající dostane peníze vždy. Nové typy transakcí NESMÍ být v `PURCHASE_TYPES`.
- Prodej hráče dál (lidskému i CPU klubu): zbytek dluhu se doplatí hned, procenta se vyplatí hned. Odchod bez peněz: splátky běží dál, procenta propadnou.
- Splátky a procenta jen u trvalého přestupu mezi lidskými kluby (vč. odkupu hostujícího hráče). Hostování, CPU kluby a AI inzeráty beze změny.
- V přehledech přestupů vždy **celková cena** (`player_contracts.fee` = celková cena) s poznámkou „na splátky" / „+ N % z dalšího prodeje".
- Identifikátory v kódu anglicky, texty pro hráče česky, **v textech pro hráče nikdy dlouhá pomlčka (—)**.
- Žádný prázdný `catch`; server `logger.warn/error`, web `console.error`.
- Písmo nejméně `text-sm`, jména `text-base`; na mobilu do tabulek nepřidávat sloupce.
- Migrace jen přidávací (ALTER ADD COLUMN, CREATE TABLE/INDEX), číslo **0235**, na test DB `prales-db-test`, na prod jen se souhlasem.
- Kód se dělá ve worktree `.claude/worktrees/dorost-nabidka` (větev `fix/dorost-nabidka`), na testing se pushuje `git push origin HEAD:testing`, na main jen cherry-pick ve vlastním worktree po „nasaď na main".

## Review Focus

1. **Opakované zpracování pondělí** (dva běhy daily ticku) — splátka se nesmí strhnout dvakrát. Test v Task B4.
2. **Prodej dál ještě před první splátkou** (zbývá celý dluh) a **prodej s procenty, když prodávající je v minusu** — doplacení i procenta proběhnou, rozpočet smí jít do minusu. Test v Task B4.
3. **Přijetí nabídky, když kupující mezitím dosáhl limitu 3 dohod** (dvě nabídky přijaté rychle po sobě) — druhá se odmítne 400 a peníze se nestrhnou. Test v Task B3.
4. **Stará nabídka bez nových sloupců / staré klienty bez podmínek v protinávrhu** — chovají se jako jednorázová platba, protinávrh bez podmínek ponechá stávající. Test v Task B2.
5. **Zaokrouhlení splátek** (cena nedělitelná počtem splátek) — součet záloha + splátky = přesně cena, poslední splátka doplatí zbytek. Test v Task B1 a B4.

---

# Část A — nové uspořádání Přestupů (nasaditelné samostatně)

### Task A1: Sdílená tabulka hráčů (`PlayerBrowseTable`)

Z `tym/[id]/ForeignSquad.tsx` udělat obecnou tabulku, kterou použije kádr cizího týmu i Sledovaní.

**Files:**
- Create: `apps/web/src/components/players/PlayerBrowseTable.tsx`
- Modify: `apps/web/src/app/(hra)/tym/[id]/ForeignSquad.tsx` (zúží se na obal nad tabulkou)

**Interfaces:**
- Produces:
  ```ts
  export interface BrowseRow {
    id: string; firstName: string; lastName: string; nickname?: string | null;
    age: number; position: "GK" | "DEF" | "MID" | "FWD"; rating: number;
    skills: Partial<Record<"speed"|"technique"|"shooting"|"passing"|"heading"|"defense"|"goalkeeping", number>>;
    avatar?: Record<string, unknown> | null;
    condition?: number | null;
    injury?: { type: string | null; daysRemaining: number } | null;
    club?: { id: string; name: string } | null;
    form?: { matches: number; goals: number; assists: number; avgRating: number } | null;
    watchedSince?: string | null;
  }
  export function PlayerBrowseTable(props: {
    rows: BrowseRow[]; color: string; onColorText: string; ratingColor: string;
    columns: { club?: boolean; condition?: boolean; form?: boolean; watchedSince?: boolean };
    onRemove?: (row: BrowseRow) => void;   // zobrazí sloupec / tlačítko „Odebrat"
    emptyText?: string;
  }): JSX.Element
  ```

- [ ] **Step 1: Vytvořit `PlayerBrowseTable.tsx`.** Obsah = dnešní `ForeignSquad` (filtr pozic, výběr řazení na mobilu, tabulka `md:` s řazením, mobilní seznam s popsanými 4 klíčovými dovednostmi, `cca` cena přes `marketValueEstimate(marketValue(rating, age, position))`), jen nad `BrowseRow` místo `Player` a s volitelnými sloupci:
  - `club`: sloupec „Klub" (odkaz `/tym/{club.id}`), na mobilu řádek pod jménem „{klub} · {věk} let · cca …".
  - `condition`: sloupec „Kon" (`{condition} %`).
  - `form`: sloupec „Forma" = `{matches} z · {goals} g · {assists} a · {avgRating.toFixed(1)}`; na mobilu jeden řádek pod dovednostmi.
  - `watchedSince`: sloupec „Sleduji od" (datum `d. m.`).
  - `onRemove`: poslední sloupec s tlačítkem „Odebrat" (`e.stopPropagation()`, aby klik neotevřel hráče); na mobilu tlačítko vpravo dole na kartě.
  - Řazení: `SortKey = "position" | "name" | "age" | "rating" | SkillKey | "condition" | "value" | "club"`, výchozí `position` vzestupně, při shodě pozice a pak hodnocení sestupně.
  - `rows.length === 0` → `<p className="text-sm text-muted">{emptyText ?? "Nikdo tu není."}</p>`.
- [ ] **Step 2: `ForeignSquad.tsx` přepsat na obal:**
  ```tsx
  export function ForeignSquad({ players, color, onColorText, ratingColor }: { players: Player[]; color: string; onColorText: string; ratingColor: string }) {
    const rows: BrowseRow[] = players.map((p) => ({
      id: p.id, firstName: p.first_name, lastName: p.last_name, nickname: p.nickname,
      age: p.age, position: p.position, rating: p.overall_rating, skills: p.skills ?? {},
      avatar: p.avatar as Record<string, unknown> | null, condition: p.lifeContext?.condition ?? null,
      injury: p.injury ? { type: p.injury.type, daysRemaining: p.injury.daysRemaining } : null,
    }));
    return (
      <div className="card p-4 sm:p-5">
        <SectionLabel>Kádr ({players.length})</SectionLabel>
        <PlayerBrowseTable rows={rows} color={color} onColorText={onColorText} ratingColor={ratingColor} columns={{ condition: true }} />
      </div>
    );
  }
  ```
- [ ] **Step 3: Ověřit:** `cd apps/web && npx tsc --noEmit -p . && npx next build --no-lint` → bez chyb.
- [ ] **Step 4: Commit** `refactor(web): sdilena tabulka hracu PlayerBrowseTable`.

### Task A2: Sledovaní jako záložka Přestupů s tabulkou

**Files:**
- Create: `apps/web/src/app/(hra)/prestupy/WatchlistTab.tsx`
- Modify: `apps/web/src/app/(hra)/prestupy/page.tsx` (záložka `sledovani`)
- Modify: `apps/web/next.config.ts` (přesměrování)
- Delete: `apps/web/src/app/(hra)/sledovani/page.tsx`
- Modify: `apps/web/src/components/dashboard/fm-sidebar.tsx:30`, `apps/web/src/app/(hra)/vice/page.tsx:47`, `apps/web/src/components/dashboard/widgets/items/club-widgets.tsx:440`, `apps/web/src/lib/page-title.ts:18`, `apps/web/src/lib/analytics.ts:51`

**Interfaces:**
- Consumes: `PlayerBrowseTable`, `BrowseRow` (Task A1); API `GET /api/teams/:teamId/watchlist` → `{ players: WatchedPlayer[] }` a `DELETE /api/teams/:teamId/watchlist/:playerId` (beze změny).

- [ ] **Step 1: `WatchlistTab.tsx`** — přesunout načtení a odebírání ze `sledovani/page.tsx` a vykreslit tabulku:
  ```tsx
  export function WatchlistTab({ teamId, color, onColorText, ratingColor }: { teamId: string; color: string; onColorText: string; ratingColor: string }) {
    const [players, setPlayers] = useState<WatchedPlayer[] | null>(null);
    useEffect(() => {
      apiFetch<{ players: WatchedPlayer[] }>(`/api/teams/${teamId}/watchlist`)
        .then((r) => setPlayers(r.players))
        .catch((e) => { console.error("load watchlist:", e); setPlayers([]); });
    }, [teamId]);
    const remove = async (row: BrowseRow) => {
      if (await apiAction(apiFetch(`/api/teams/${teamId}/watchlist/${row.id}`, { method: "DELETE" }), "Odebrání ze sledování se nezdařilo")) {
        setPlayers((list) => (list ?? []).filter((p) => p.id !== row.id));
      }
    };
    if (players === null) return <Spinner />;
    const rows: BrowseRow[] = players.map((p) => ({
      id: p.id, firstName: p.firstName, lastName: p.lastName, nickname: p.nickname, age: p.age,
      position: p.position, rating: p.overallRating, skills: p.skills, avatar: p.avatar,
      injury: p.injury ? { type: p.injury.type, daysRemaining: p.injury.daysRemaining } : null,
      club: p.teamId && p.teamName ? { id: p.teamId, name: p.teamName } : null,
      form: p.recentStats, watchedSince: p.watchedSince,
    }));
    return <PlayerBrowseTable rows={rows} color={color} onColorText={onColorText} ratingColor={ratingColor}
      columns={{ club: true, form: true, watchedSince: true }} onRemove={remove}
      emptyText="Zatím nikoho nesleduješ. Hráče přidáš hvězdičkou v jeho profilu." />;
  }
  ```
  (`WatchedPlayer` přesunout ze `sledovani/page.tsx` do `WatchlistTab.tsx` a exportovat.)
- [ ] **Step 2: Přestupy** — v `page.tsx`: `type Tab` a `TAB_KEYS` doplnit `"sledovani"` před `"squad"`; do `tabs` přidat `["sledovani", "Sledovaní", 0]`; vykreslit `{tab === "sledovani" && teamId && <WatchlistTab teamId={teamId} color={...} onColorText={...} ratingColor={...} />}` (barvy jako u zbytku stránky z `team.primary_color`, `readableOnLight`, `bestTextOn`).
- [ ] **Step 3: Přesměrování** v `next.config.ts`: řádek `["/dashboard/watchlist", "/sledovani"]` změnit na `["/dashboard/watchlist", "/prestupy?tab=sledovani"]` a přidat `["/sledovani", "/prestupy?tab=sledovani"]` (žádné řetězení, žádné `:path*`).
- [ ] **Step 4:** Smazat `sledovani/page.tsx`; v postranním panelu a na Více odebrat položku Sledovaní; widget „Celý watchlist →" `href="/prestupy?tab=sledovani"`; `page-title.ts` a `analytics.ts` řádek pro `/sledovani` smazat.
- [ ] **Step 5:** `rm -rf apps/web/.next && npx tsc --noEmit -p . && npx next build --no-lint` → bez chyb.
- [ ] **Step 6: Commit** `feat(prestupy): Sledovani jako zalozka s tabulkou`.

### Task A3: Trh s podzáložkami „Za přestupní částku" a „Volní hráči"

**Files:**
- Modify: `apps/web/src/app/(hra)/prestupy/page.tsx` (záložky `market` a `free_agents`)

- [ ] **Step 1:** Ze seznamu `tabs` vyřadit `free_agents`; `TAB_KEYS` ho ponechá (stará adresa `?tab=free_agents` dál funguje).
- [ ] **Step 2:** Podzáložky přes druhý parametr:
  ```tsx
  const MARKET_SUBTABS = ["za-castku", "volni"] as const;
  const [marketSub, setMarketSub] = useTabParam(MARKET_SUBTABS, "trh");
  // stará adresa ?tab=free_agents → Trh / Volní hráči
  useEffect(() => { if (tab === "free_agents") { setTab("market"); setMarketSub("volni"); } }, [tab, setTab, setMarketSub]);
  ```
  Nad obsahem Trhu: `<Tabs value={marketSub} onChange={setMarketSub} ariaLabel="Trh" items={[{ key: "za-castku", label: "Za přestupní částku", count: listings.length || null }, { key: "volni", label: "Volní hráči", count: null }]} />`. Dnešní blok `{tab === "free_agents" && …}` vykreslit při `tab === "market" && marketSub === "volni"`, dnešní blok trhu při `tab === "market" && marketSub === "za-castku"`. Načítání volných hráčů, které dnes reaguje na `tab === "free_agents"`, přepnout na stejnou podmínku.
- [ ] **Step 3:** `npx tsc --noEmit -p . && npx next build --no-lint`.
- [ ] **Step 4: Commit** `feat(prestupy): Trh s podzalozkami za castku a volni hraci`.
- [ ] **Step 5: Ověření části A na testu** (push na testing, po nasazení): MCP prohlížeč, počítač i 375 px přes iframe — záložka Sledovaní (řazení, odebrání a zpět přidání hvězdičkou v profilu, prázdný stav), `/sledovani` i `/dashboard/watchlist` přesměrují, Trh přepíná podzáložky, `?tab=free_agents` otevře Volné hráče, kádr cizího týmu vypadá jako předtím.

---

# Část B — splátky a procenta z příštího přestupu

### Task B1: Podmínky obchodu ve sdíleném balíčku

**Files:**
- Create: `packages/shared/src/types/transfer-terms.ts`
- Create: `packages/shared/src/types/transfer-terms.test.ts`
- Modify: `packages/shared/src/types/index.ts` (export)

**Interfaces:**
- Produces (všechno exportováno z `@okresni-masina/shared`):
  ```ts
  export const UPFRONT_PCT_MIN = 20, INSTALLMENTS_MIN = 2, INSTALLMENTS_MAX = 10, SELL_ON_PCT_MAX = 50, SELL_ON_PCT_STEP = 5, MAX_ACTIVE_INSTALLMENT_DEALS = 3;
  export interface TransferTerms { amount: number; upfrontPct: number; installments: number; sellOnPct: number }
  export interface TransferSchedule { upfront: number; installmentAmount: number; lastInstallment: number; installments: number; remainingAfterUpfront: number }
  export function transferTermsError(t: TransferTerms): string | null
  export function transferSchedule(t: TransferTerms): TransferSchedule
  export function sellOnShare(saleAmount: number, pct: number): number
  export function formatTermsSummary(t: TransferTerms): string
  export function termsFromRow(row: { upfront_pct?: number | null; installments?: number | null; sell_on_pct?: number | null }, amount: number): TransferTerms
  ```

- [ ] **Step 1: Test** `transfer-terms.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { transferTermsError, transferSchedule, sellOnShare, formatTermsSummary, termsFromRow } from "./transfer-terms";
  const nb = (s: string) => s.replace(/ /g, " ");

  describe("podmínky přestupu", () => {
    it("jednorázová platba je platná a záloha je celá cena", () => {
      const t = { amount: 45_000, upfrontPct: 100, installments: 0, sellOnPct: 0 };
      expect(transferTermsError(t)).toBeNull();
      expect(transferSchedule(t)).toMatchObject({ upfront: 45_000, installments: 0, remainingAfterUpfront: 0 });
    });
    it("záloha + splátky dávají přesně cenu, poslední splátka doplatí zbytek", () => {
      const s = transferSchedule({ amount: 45_001, upfrontPct: 30, installments: 3, sellOnPct: 0 });
      expect(s.upfront).toBe(13_500);
      expect(s.upfront + s.installmentAmount * 2 + s.lastInstallment).toBe(45_001);
      expect(s.lastInstallment).toBeGreaterThanOrEqual(s.installmentAmount);
    });
    it.each([
      [{ amount: 1000, upfrontPct: 10, installments: 3, sellOnPct: 0 }],
      [{ amount: 1000, upfrontPct: 50, installments: 0, sellOnPct: 0 }],
      [{ amount: 1000, upfrontPct: 100, installments: 3, sellOnPct: 0 }],
      [{ amount: 1000, upfrontPct: 50, installments: 11, sellOnPct: 0 }],
      [{ amount: 1000, upfrontPct: 50, installments: 1, sellOnPct: 0 }],
      [{ amount: 1000, upfrontPct: 100, installments: 0, sellOnPct: 55 }],
      [{ amount: 1000, upfrontPct: 100, installments: 0, sellOnPct: 12 }],
    ])("neplatné podmínky odmítne: %j", (t) => { expect(transferTermsError(t)).not.toBeNull(); });
    it("procenta z prodeje zaokrouhlí na koruny", () => { expect(sellOnShare(60_000, 15)).toBe(9_000); expect(sellOnShare(10_001, 15)).toBe(1_500); });
    it("souhrn podmínek", () => {
      expect(nb(formatTermsSummary({ amount: 45_000, upfrontPct: 30, installments: 3, sellOnPct: 15 }))).toBe("45 000 Kč · záloha 13 500 + 3× 10 500 · 15 % z dalšího prodeje");
      expect(nb(formatTermsSummary({ amount: 45_000, upfrontPct: 100, installments: 0, sellOnPct: 0 }))).toBe("45 000 Kč");
    });
    it("starý řádek bez sloupců je jednorázová platba", () => {
      expect(termsFromRow({}, 5000)).toEqual({ amount: 5000, upfrontPct: 100, installments: 0, sellOnPct: 0 });
    });
  });
  ```
- [ ] **Step 2:** `cd packages/shared && npx vitest run src/types/transfer-terms.test.ts` → FAIL (modul neexistuje).
- [ ] **Step 3: Implementace** `transfer-terms.ts`:
  ```ts
  /** Podmínky trvalého přestupu mezi lidskými kluby: záloha, týdenní splátky, procenta z příštího přestupu. */
  export const UPFRONT_PCT_MIN = 20;
  export const INSTALLMENTS_MIN = 2;
  export const INSTALLMENTS_MAX = 10;
  export const SELL_ON_PCT_MAX = 50;
  export const SELL_ON_PCT_STEP = 5;
  export const MAX_ACTIVE_INSTALLMENT_DEALS = 3;

  export interface TransferTerms { amount: number; upfrontPct: number; installments: number; sellOnPct: number }
  export interface TransferSchedule { upfront: number; installmentAmount: number; lastInstallment: number; installments: number; remainingAfterUpfront: number }

  export function transferTermsError(t: TransferTerms): string | null {
    if (!Number.isInteger(t.upfrontPct) || t.upfrontPct < UPFRONT_PCT_MIN || t.upfrontPct > 100) return `Záloha musí být ${UPFRONT_PCT_MIN}–100 %.`;
    if (!Number.isInteger(t.installments) || (t.installments !== 0 && (t.installments < INSTALLMENTS_MIN || t.installments > INSTALLMENTS_MAX))) {
      return `Počet splátek musí být ${INSTALLMENTS_MIN}–${INSTALLMENTS_MAX}.`;
    }
    if ((t.upfrontPct < 100) !== (t.installments > 0)) return "Na splátky jde jen záloha pod 100 % a se zálohou pod 100 % je potřeba počet splátek.";
    if (!Number.isInteger(t.sellOnPct) || t.sellOnPct < 0 || t.sellOnPct > SELL_ON_PCT_MAX || t.sellOnPct % SELL_ON_PCT_STEP !== 0) {
      return `Procenta z dalšího prodeje musí být 0–${SELL_ON_PCT_MAX} % po ${SELL_ON_PCT_STEP} %.`;
    }
    return null;
  }

  export function transferSchedule(t: TransferTerms): TransferSchedule {
    if (t.installments === 0) return { upfront: t.amount, installmentAmount: 0, lastInstallment: 0, installments: 0, remainingAfterUpfront: 0 };
    const upfront = Math.round((t.amount * t.upfrontPct) / 100);
    const rest = t.amount - upfront;
    const installmentAmount = Math.floor(rest / t.installments);
    return { upfront, installmentAmount, lastInstallment: rest - installmentAmount * (t.installments - 1), installments: t.installments, remainingAfterUpfront: rest };
  }

  export function sellOnShare(saleAmount: number, pct: number): number {
    return Math.round((saleAmount * pct) / 100);
  }

  const kc = (v: number) => v.toLocaleString("cs-CZ");

  /** Jeden řádek do seznamů: „45 000 Kč · záloha 13 500 + 3× 10 500 · 15 % z dalšího prodeje". */
  export function formatTermsSummary(t: TransferTerms): string {
    const s = transferSchedule(t);
    const parts = [`${kc(t.amount)} Kč`];
    if (t.installments > 0) parts.push(`záloha ${kc(s.upfront)} + ${s.installments}× ${kc(s.installmentAmount)}`);
    if (t.sellOnPct > 0) parts.push(`${t.sellOnPct} % z dalšího prodeje`);
    return parts.join(" · ");
  }

  /** Podmínky z řádku `transfer_offers` / `transfer_offer_events`; staré řádky = jednorázově. */
  export function termsFromRow(row: { upfront_pct?: number | null; installments?: number | null; sell_on_pct?: number | null }, amount: number): TransferTerms {
    return { amount, upfrontPct: row.upfront_pct ?? 100, installments: row.installments ?? 0, sellOnPct: row.sell_on_pct ?? 0 };
  }
  ```
  `index.ts`: `export * from "./transfer-terms";` vedle exportu `market-value`.
- [ ] **Step 4:** test → PASS.
- [ ] **Step 5: Commit** `feat(shared): podminky prestupu - zaloha, splatky, procenta`.

### Task B2: Migrace 0235 a podmínky v nabídce a protinávrhu

**Files:**
- Create: `apps/api/migrations/0235_transfer_installments.sql`
- Modify: `apps/api/src/routes/game.ts` — `POST /teams/:teamId/offers` (~6125–6271), `POST /teams/:teamId/offers/:offerId/counter` (~7286–7348)
- Create: `apps/api/src/routes/game.transfer-installments.test.ts` (Miniflare; schéma a `callRoute` zkopírovat z `game.transfer-offers-u21.test.ts` a doplnit sloupce/tabulky z migrace 0235)

**Interfaces:**
- Consumes: `transferTermsError`, `transferSchedule`, `MAX_ACTIVE_INSTALLMENT_DEALS` (B1).
- Produces: sloupce `transfer_offers.upfront_pct|installments|sell_on_pct`, tabulky `transfer_installments`, `sell_on_clauses`. Tělo nabídky i protinávrhu přijímá volitelné `upfrontPct`, `installments`, `sellOnPct`.

- [ ] **Step 1: Migrace** `0235_transfer_installments.sql`:
  ```sql
  -- Přestup na splátky a procenta z příštího přestupu (spec 2026-10-03).
  -- Podmínky aktuálního návrhu v nabídce a v každém kroku vyjednávání; staré řádky = jednorázově.
  ALTER TABLE transfer_offers ADD COLUMN upfront_pct INTEGER NOT NULL DEFAULT 100;
  ALTER TABLE transfer_offers ADD COLUMN installments INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE transfer_offers ADD COLUMN sell_on_pct INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE transfer_offer_events ADD COLUMN upfront_pct INTEGER;
  ALTER TABLE transfer_offer_events ADD COLUMN installments INTEGER;
  ALTER TABLE transfer_offer_events ADD COLUMN sell_on_pct INTEGER;
  -- Splátková dohoda. Bez FK na players: odchod hráče řádek hráče maže (removePlayer).
  CREATE TABLE transfer_installments (
    id TEXT PRIMARY KEY,
    offer_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    buyer_team_id TEXT NOT NULL,
    seller_team_id TEXT NOT NULL,
    total_amount INTEGER NOT NULL,
    upfront_amount INTEGER NOT NULL,
    installment_amount INTEGER NOT NULL,
    installments_total INTEGER NOT NULL,
    installments_paid INTEGER NOT NULL DEFAULT 0,
    remaining INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','settled')),
    created_game_date TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    closed_at TEXT
  );
  CREATE INDEX idx_transfer_installments_buyer ON transfer_installments(buyer_team_id, status);
  CREATE INDEX idx_transfer_installments_seller ON transfer_installments(seller_team_id, status);
  CREATE INDEX idx_transfer_installments_player ON transfer_installments(player_id, status);
  -- Procenta z příštího přestupu: platí pro nejbližší prodej hráče jeho dnešním majitelem.
  CREATE TABLE sell_on_clauses (
    id TEXT PRIMARY KEY,
    offer_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    beneficiary_team_id TEXT NOT NULL,
    owner_team_id TEXT NOT NULL,
    pct INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','lapsed')),
    paid_amount INTEGER,
    paid_offer_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    resolved_at TEXT
  );
  CREATE INDEX idx_sell_on_owner ON sell_on_clauses(owner_team_id, status);
  CREATE INDEX idx_sell_on_beneficiary ON sell_on_clauses(beneficiary_team_id, status);
  CREATE INDEX idx_sell_on_player ON sell_on_clauses(player_id, status);
  ```
  Aplikovat na test: `npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0235_transfer_installments.sql`.
- [ ] **Step 2: Testy** (`game.transfer-installments.test.ts`, Miniflare; kupující `buyer-a` rozpočet 30 000, prodávající `seller-a`, hráč `star` v `seller-a`):
  ```ts
  it("nabídka na splátky potřebuje peníze jen na zálohu", async () => {
    const r = await callRoute("/teams/buyer-a/offers", { method: "POST", token: "buyer-token",
      body: { playerId: "star", amount: 60_000, upfrontPct: 30, installments: 4, sellOnPct: 10 } });
    expect(r.status).toBe(200);
    const row = await db.prepare("SELECT upfront_pct, installments, sell_on_pct FROM transfer_offers WHERE player_id = 'star'").first();
    expect(row).toEqual({ upfront_pct: 30, installments: 4, sell_on_pct: 10 });
    const ev = await db.prepare("SELECT upfront_pct, installments, sell_on_pct FROM transfer_offer_events WHERE event_type = 'offer'").first();
    expect(ev).toEqual({ upfront_pct: 30, installments: 4, sell_on_pct: 10 });
  });
  it("odmítne neplatné podmínky", async () => {
    const r = await callRoute("/teams/buyer-a/offers", { method: "POST", token: "buyer-token",
      body: { playerId: "star", amount: 60_000, upfrontPct: 10, installments: 4 } });
    expect(r.status).toBe(400);
  });
  it("bez podmínek je to jednorázová platba (staří klienti)", async () => {
    const r = await callRoute("/teams/buyer-a/offers", { method: "POST", token: "buyer-token", body: { playerId: "star", amount: 20_000 } });
    expect(r.status).toBe(200);
    expect(await db.prepare("SELECT upfront_pct, installments FROM transfer_offers").first()).toEqual({ upfront_pct: 100, installments: 0 });
  });
  it("protinávrh může změnit podmínky, bez nich je ponechá", async () => {
    // nabídka 60 000 / 30 % / 4 / 10 %; prodávající je na tahu
    await callRoute("/teams/buyer-a/offers", { method: "POST", token: "buyer-token", body: { playerId: "star", amount: 60_000, upfrontPct: 30, installments: 4, sellOnPct: 10 } });
    const id = (await db.prepare("SELECT id FROM transfer_offers").first<{ id: string }>())!.id;
    const c1 = await callRoute(`/teams/seller-a/offers/${id}/counter`, { method: "POST", token: "seller-token", body: { amount: 70_000, upfrontPct: 50, installments: 2, sellOnPct: 20 } });
    expect(c1.status).toBe(200);
    expect(await db.prepare("SELECT counter_amount, upfront_pct, installments, sell_on_pct FROM transfer_offers").first()).toEqual({ counter_amount: 70_000, upfront_pct: 50, installments: 2, sell_on_pct: 20 });
    const c2 = await callRoute(`/teams/buyer-a/offers/${id}/counter`, { method: "POST", token: "buyer-token", body: { amount: 65_000 } });
    expect(c2.status).toBe(200);
    expect(await db.prepare("SELECT counter_amount, upfront_pct, installments, sell_on_pct FROM transfer_offers").first()).toEqual({ counter_amount: 65_000, upfront_pct: 50, installments: 2, sell_on_pct: 20 });
  });
  it("hostování podmínky splátek nebere", async () => {
    const r = await callRoute("/teams/buyer-a/offers", { method: "POST", token: "buyer-token", body: { playerId: "star", amount: 1000, offerType: "loan", loanDuration: 30, installments: 3, upfrontPct: 30 } });
    expect(r.status).toBe(400);
  });
  it("limit 3 aktivních splátkových přestupů", async () => {
    for (const i of [1, 2, 3]) await db.prepare("INSERT INTO transfer_installments (id, offer_id, player_id, player_name, buyer_team_id, seller_team_id, total_amount, upfront_amount, installment_amount, installments_total, remaining) VALUES (?, 'o', 'p', 'X', 'buyer-a', 'seller-a', 1000, 300, 350, 2, 700)").bind(`d${i}`).run();
    const r = await callRoute("/teams/buyer-a/offers", { method: "POST", token: "buyer-token", body: { playerId: "star", amount: 60_000, upfrontPct: 30, installments: 4 } });
    expect(r.status).toBe(400);
  });
  ```
- [ ] **Step 3:** `cd apps/api && npx vitest run src/routes/game.transfer-installments.test.ts` → FAIL.
- [ ] **Step 4: Implementace** v `POST /offers` (za validací částky):
  ```ts
  const terms: TransferTerms = { amount: body.amount, upfrontPct: body.upfrontPct ?? 100, installments: body.installments ?? 0, sellOnPct: body.sellOnPct ?? 0 };
  const isPlainTerms = terms.upfrontPct === 100 && terms.installments === 0 && terms.sellOnPct === 0;
  if (offerType === "loan" && !isPlainTerms) return c.json({ error: "Splátky a procenta jdou jen u trvalého přestupu" }, 400);
  const termsError = transferTermsError(terms);
  if (termsError) return c.json({ error: termsError }, 400);
  if (terms.installments > 0) {
    const active = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM transfer_installments WHERE buyer_team_id = ? AND status = 'active'")
      .bind(buyerClubTeamId).first<{ n: number }>();
    if ((active?.n ?? 0) >= MAX_ACTIVE_INSTALLMENT_DEALS) return c.json({ error: `Na splátky můžeš mít najednou nejvýš ${MAX_ACTIVE_INSTALLMENT_DEALS} hráče.` }, 400);
  }
  const payNow = transferSchedule(terms).upfront;
  ```
  Kontrolu rozpočtu `team.budget < body.amount` nahradit `team.budget < payNow` (text: `Nedostatek peněz na zálohu. Máte …, záloha je …`). INSERT nabídky doplnit `upfront_pct, installments, sell_on_pct` (`terms.*`) a INSERT události `offer` taky. SMS a notifikace: místo `za ${body.amount…} Kč` použít `formatTermsSummary(terms)`.
- [ ] **Step 5:** V `/counter`: tělo `{ amount; message?; upfrontPct?; installments?; sellOnPct? }`; načíst i `upfront_pct, installments, sell_on_pct, offer_type` z nabídky; `terms` = hodnoty z těla, chybějící z nabídky; `transferTermsError`; u hostování jen výchozí podmínky; limit 3 jen když `terms.installments > 0` a role je buyer nebo seller (dohoda by vznikla kupujícímu → počítat pro `scope.buyerClubTeamId`); kontrola rozpočtu kupujícího `buyer.budget < transferSchedule(terms).upfront`. UPDATE: `SET status='countered', counter_amount=?, upfront_pct=?, installments=?, sell_on_pct=?, last_action_by=?`. Událost `counter` s podmínkami. SMS/notifikace s `formatTermsSummary`.
- [ ] **Step 6:** testy → PASS; `npx vitest run` celé API → PASS.
- [ ] **Step 7: Commit** `feat(prestupy): podminky splatek a procent v nabidce a protinavrhu`.

### Task B3: Přijetí přestupu na splátky

**Files:**
- Modify: `apps/api/src/routes/game.ts` — accept (~6674–7206), větev trvalého přestupu
- Test: `apps/api/src/routes/game.transfer-installments.test.ts`

**Interfaces:**
- Consumes: `termsFromRow`, `transferSchedule`, `MAX_ACTIVE_INSTALLMENT_DEALS` (B1); tabulky z B2.
- Produces: řádky `transfer_installments` (status `active`, `remaining = total - upfront`) a `sell_on_clauses` (status `active`, `beneficiary = prodávající`, `owner = kupující`); smlouva `player_contracts.fee` = celková cena.

- [ ] **Step 1: Testy:**
  ```ts
  it("přijetí strhne zálohu + poplatek, vytvoří dohodu a doložku", async () => {
    // nabídka buyer-a → star, 60 000, 30 %, 4 splátky, 10 %; přijímá seller-a
    const id = await createOffer({ amount: 60_000, upfrontPct: 30, installments: 4, sellOnPct: 10 });
    const r = await callRoute(`/teams/seller-a/offers/${id}/accept`, { method: "POST", token: "seller-token", body: {} });
    expect(r.status).toBe(200);
    const budgets = await budgetsById();
    expect(budgets["buyer-a"]).toBe(30_000 - 18_000);          // stejná liga → bez poplatku
    expect(budgets["seller-a"]).toBe(10_000 + 18_000);
    expect(await db.prepare("SELECT total_amount, upfront_amount, installment_amount, installments_total, remaining, status FROM transfer_installments").first())
      .toEqual({ total_amount: 60_000, upfront_amount: 18_000, installment_amount: 10_500, installments_total: 4, remaining: 42_000, status: "active" });
    expect(await db.prepare("SELECT beneficiary_team_id, owner_team_id, pct, status FROM sell_on_clauses").first())
      .toEqual({ beneficiary_team_id: "seller-a", owner_team_id: "buyer-a", pct: 10, status: "active" });
    expect((await db.prepare("SELECT fee FROM player_contracts WHERE is_active = 1 AND player_id = 'star'").first<{ fee: number }>())!.fee).toBe(60_000);
  });
  it("přijetí při plném limitu dohod se odmítne a nic se nestrhne", async () => {
    const id = await createOffer({ amount: 60_000, upfrontPct: 30, installments: 4 });
    for (const i of [1, 2, 3]) await insertActiveDeal(`d${i}`, "buyer-a");
    const r = await callRoute(`/teams/seller-a/offers/${id}/accept`, { method: "POST", token: "seller-token", body: {} });
    expect(r.status).toBe(400);
    expect((await budgetsById())["buyer-a"]).toBe(30_000);
    expect((await db.prepare("SELECT status FROM transfer_offers WHERE id = ?").bind(id).first<{ status: string }>())!.status).toBe("pending");
  });
  ```
  (`createOffer`, `budgetsById`, `insertActiveDeal` jsou malé pomocné funkce v test souboru.)
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementace** — hned po výpočtu `amount`:
  ```ts
  const terms = termsFromRow(offer as { upfront_pct?: number; installments?: number; sell_on_pct?: number }, amount);
  const schedule = transferSchedule(terms);
  const payNow = offerType === "loan" ? amount : schedule.upfront;
  ```
  Před `claimOffer()` u trvalého přestupu s `terms.installments > 0` zkontrolovat limit (stejný dotaz jako v B2, `buyerTeamId`) → 400 `Na splátky můžeš mít najednou nejvýš 3 hráče.`. `requiredBudget = offerType === "loan" ? amount : payNow + adminFee`; texty chyb s „zálohou". Ve větvi trvalého přestupu:
  - `const totalCost = payNow + adminFee;`
  - kredit prodávajícímu `budget + payNow` (místo `amount`), transakce `transfer_fee` = `-payNow`, `transfer_income` = `+payNow`; popisek při splátkách `Přestup: ${name} (záloha ${terms.upfrontPct} %, zbytek ${terms.installments}× týdně)` / `Prodej: ${name} (záloha, zbytek ve splátkách)`; `balance_after` přepočítat z `payNow`.
  - odvod prodávajícího a poplatek kupujícího dál z celé `amount` (beze změny).
  - smlouva `fee` zůstává `amount`.
  - do `transferCore` přidat při `terms.installments > 0`:
    ```ts
    c.env.DB.prepare(`INSERT INTO transfer_installments (id, offer_id, player_id, player_name, buyer_team_id, seller_team_id, total_amount, upfront_amount, installment_amount, installments_total, remaining, created_game_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), offerId, playerId, offerPlayerName, buyerTeamId, sellerTeamId,
      amount, schedule.upfront, schedule.installmentAmount, schedule.installments, schedule.remainingAfterUpfront, gameDate),
    ```
    a při `terms.sellOnPct > 0`:
    ```ts
    c.env.DB.prepare(`INSERT INTO sell_on_clauses (id, offer_id, player_id, player_name, beneficiary_team_id, owner_team_id, pct) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), offerId, playerId, offerPlayerName, sellerTeamId, buyerTeamId, terms.sellOnPct),
    ```
  - rollback beze změny (refunduje `totalCost`; dávka je atomická, řádky dohody v ní).
  - událost `accept` doplnit podmínkami.
- [ ] **Step 4:** PASS + celé API.
- [ ] **Step 5: Commit** `feat(prestupy): prijeti prestupu na splatky a s procenty`.

### Task B4: Pondělní splátky, doplacení a procenta při dalším prodeji

**Files:**
- Create: `apps/api/src/transfers/installments.ts`
- Create: `apps/api/src/transfers/installments.test.ts` (falešná D1 `incidents/testovaci-d1.ts`)
- Modify: `apps/api/src/season/finance-processor.ts` (typy transakcí, volání v `processWeeklyFinances`)
- Modify: `apps/api/src/routes/game.ts` (accept lidský — po commitu; accept CPU — po commitu)
- Modify: `apps/api/src/transfers/remove-player.ts` (propadnutí doložky)
- Modify: `apps/web/src/app/(hra)/finance/page.tsx` (`TXN_ICONS`, `TXN_LABELS`)

**Interfaces:**
- Produces:
  ```ts
  export async function processTransferInstallments(db: D1Database, buyerClubTeamId: string, gameDate: string): Promise<number> // počet zaplacených splátek
  export async function settleOnResale(db: D1Database, args: { playerId: string; ownerClubTeamId: string; saleAmount: number; saleOfferId: string; gameDate: string }): Promise<{ settled: number; sellOn: number }>
  export async function lapseSellOnClauses(db: D1Database, playerId: string): Promise<void>
  ```
  Nové `TransactionType`: `"transfer_installment" | "transfer_installment_income" | "transfer_installment_settlement" | "transfer_installment_settlement_income" | "sell_on_fee" | "sell_on_income"` (žádný z nich do `PURCHASE_TYPES`).

- [ ] **Step 1: Testy** (`installments.test.ts`):
  ```ts
  it("pondělí strhne jednu splátku kupujícímu a připíše prodávajícímu, i do minusu", async () => {
    const db = new FalesnaD1([
      { sql: /FROM transfer_installments WHERE buyer_team_id = \? AND status = 'active'/, all: [{ id: "d1", seller_team_id: "S", player_name: "Jan Novák", installment_amount: 10_500, installments_total: 4, installments_paid: 1, remaining: 31_500 }] },
      { sql: /UPDATE transfer_installments SET installments_paid/, changes: 1 },
      { sql: /UPDATE teams SET budget = budget \+ \?/, first: { budget: -5_000 } },
    ]);
    expect(await processTransferInstallments(jakoD1(db), "B", "2026-10-12")).toBe(1);
    const tx = db.dotazy.filter((d) => /INSERT INTO transactions/.test(d.sql)).map((d) => d.params);
    expect(tx.map((p) => [p[1], p[2], p[3]])).toEqual([["B", "transfer_installment", -10_500], ["S", "transfer_installment_income", 10_500]]);
    expect(tx[0][6]).toBe("inst-d1-2");
  });
  it("souběžný běh, který splátku už zabral, nic nestrhne", async () => {
    const db = new FalesnaD1([
      { sql: /FROM transfer_installments WHERE buyer_team_id/, all: [{ id: "d1", seller_team_id: "S", player_name: "X", installment_amount: 10_500, installments_total: 4, installments_paid: 1, remaining: 31_500 }] },
      { sql: /UPDATE transfer_installments SET installments_paid/, changes: 0 },
    ]);
    expect(await processTransferInstallments(jakoD1(db), "B", "2026-10-12")).toBe(0);
    expect(db.pocet(/INSERT INTO transactions/)).toBe(0);
  });
  it("poslední splátka doplatí přesný zbytek a dohodu uzavře", async () => {
    const db = new FalesnaD1([
      { sql: /FROM transfer_installments WHERE buyer_team_id/, all: [{ id: "d1", seller_team_id: "S", player_name: "X", installment_amount: 10_500, installments_total: 4, installments_paid: 3, remaining: 10_501 }] },
      { sql: /UPDATE transfer_installments SET installments_paid/, changes: 1 },
      { sql: /UPDATE teams SET budget = budget \+ \?/, first: { budget: 1 } },
    ]);
    await processTransferInstallments(jakoD1(db), "B", "2026-10-12");
    const upd = db.dotazy.find((d) => /UPDATE transfer_installments SET installments_paid/.test(d.sql))!;
    expect(upd.params.slice(0, 3)).toEqual([4, 0, "paid"]);
    expect(db.dotazy.filter((d) => /INSERT INTO transactions/.test(d.sql))[0].params[3]).toBe(-10_501);
  });
  it("prodej dál doplatí zbytek dluhu a vyplatí procenta", async () => {
    const db = new FalesnaD1([
      { sql: /FROM transfer_installments WHERE player_id = \? AND buyer_team_id = \? AND status = 'active'/, first: { id: "d1", seller_team_id: "S", player_name: "X", remaining: 42_000 } },
      { sql: /FROM sell_on_clauses WHERE player_id = \? AND owner_team_id = \? AND status = 'active'/, first: { id: "c1", beneficiary_team_id: "S", player_name: "X", pct: 15 } },
      { sql: /UPDATE transfer_installments SET status = 'settled'/, changes: 1 },
      { sql: /UPDATE sell_on_clauses SET status = 'paid'/, changes: 1 },
      { sql: /UPDATE teams SET budget = budget \+ \?/, first: { budget: -1 } },
    ]);
    expect(await settleOnResale(jakoD1(db), { playerId: "p", ownerClubTeamId: "B", saleAmount: 60_000, saleOfferId: "o2", gameDate: "2026-10-12" }))
      .toEqual({ settled: 42_000, sellOn: 9_000 });
  });
  it("bez dohody a doložky nedělá nic", async () => {
    const db = new FalesnaD1([]);
    expect(await settleOnResale(jakoD1(db), { playerId: "p", ownerClubTeamId: "B", saleAmount: 60_000, saleOfferId: "o2", gameDate: "d" })).toEqual({ settled: 0, sellOn: 0 });
    expect(db.pocet(/INSERT INTO transactions/)).toBe(0);
  });
  ```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementace** `installments.ts`:
  ```ts
  /**
   * Přestup na splátky a procenta z příštího přestupu (spec 2026-10-03).
   * Peníze přes recordTransaction (typy NEJSOU v PURCHASE_TYPES → strhnou se i do minusu).
   * Každý pohyb nejdřív optimisticky zabere řádek, takže dva běhy nikdy nezaplatí dvakrát.
   */
  import { recordTransaction } from "../season/finance-processor";
  import { sellOnShare } from "@okresni-masina/shared";
  import { logger } from "../lib/logger";

  interface ActiveDeal { id: string; seller_team_id: string; player_name: string; installment_amount: number; installments_total: number; installments_paid: number; remaining: number }

  export async function processTransferInstallments(db: D1Database, buyerClubTeamId: string, gameDate: string): Promise<number> {
    const deals = await db.prepare(
      "SELECT id, seller_team_id, player_name, installment_amount, installments_total, installments_paid, remaining FROM transfer_installments WHERE buyer_team_id = ? AND status = 'active'",
    ).bind(buyerClubTeamId).all<ActiveDeal>()
      .catch((e) => { logger.warn({ module: "installments" }, "load active deals", e); return { results: [] as ActiveDeal[] }; });
    let paid = 0;
    for (const d of deals.results) {
      const n = d.installments_paid + 1;
      const isLast = n >= d.installments_total;
      const pay = isLast ? d.remaining : Math.min(d.remaining, d.installment_amount);
      if (pay <= 0) continue;
      const left = d.remaining - pay;
      const claim = await db.prepare(
        "UPDATE transfer_installments SET installments_paid = ?, remaining = ?, status = ?, closed_at = ? WHERE id = ? AND installments_paid = ? AND status = 'active'",
      ).bind(n, left, left <= 0 ? "paid" : "active", left <= 0 ? new Date().toISOString() : null, d.id, d.installments_paid).run()
        .catch((e) => { logger.error({ module: "installments" }, `claim installment ${d.id}`, e); return null; });
      if (!claim || (claim.meta?.changes ?? 0) === 0) continue;
      const desc = `Splátka za ${d.player_name} ${n}/${d.installments_total}`;
      const ref = `inst-${d.id}-${n}`;
      await recordTransaction(db, buyerClubTeamId, "transfer_installment", -pay, desc, gameDate, ref);
      await recordTransaction(db, d.seller_team_id, "transfer_installment_income", pay, desc, gameDate, ref);
      paid++;
    }
    return paid;
  }

  export async function settleOnResale(
    db: D1Database,
    args: { playerId: string; ownerClubTeamId: string; saleAmount: number; saleOfferId: string; gameDate: string },
  ): Promise<{ settled: number; sellOn: number }> {
    const out = { settled: 0, sellOn: 0 };
    const deal = await db.prepare(
      "SELECT id, seller_team_id, player_name, remaining FROM transfer_installments WHERE player_id = ? AND buyer_team_id = ? AND status = 'active' LIMIT 1",
    ).bind(args.playerId, args.ownerClubTeamId).first<{ id: string; seller_team_id: string; player_name: string; remaining: number }>()
      .catch((e) => { logger.warn({ module: "installments" }, "load deal for resale", e); return null; });
    if (deal && deal.remaining > 0) {
      const claim = await db.prepare(
        "UPDATE transfer_installments SET status = 'settled', remaining = 0, closed_at = ? WHERE id = ? AND status = 'active'",
      ).bind(new Date().toISOString(), deal.id).run()
        .catch((e) => { logger.error({ module: "installments" }, `settle deal ${deal.id}`, e); return null; });
      if (claim && (claim.meta?.changes ?? 0) > 0) {
        const desc = `Doplacení splátek za ${deal.player_name} při dalším prodeji`;
        await recordTransaction(db, args.ownerClubTeamId, "transfer_installment_settlement", -deal.remaining, desc, args.gameDate, `inst-settle-${deal.id}`);
        await recordTransaction(db, deal.seller_team_id, "transfer_installment_settlement_income", deal.remaining, desc, args.gameDate, `inst-settle-${deal.id}`);
        out.settled = deal.remaining;
      }
    }
    const clause = await db.prepare(
      "SELECT id, beneficiary_team_id, player_name, pct FROM sell_on_clauses WHERE player_id = ? AND owner_team_id = ? AND status = 'active' LIMIT 1",
    ).bind(args.playerId, args.ownerClubTeamId).first<{ id: string; beneficiary_team_id: string; player_name: string; pct: number }>()
      .catch((e) => { logger.warn({ module: "installments" }, "load sell-on clause", e); return null; });
    if (clause && args.saleAmount > 0) {
      const share = sellOnShare(args.saleAmount, clause.pct);
      const claim = await db.prepare(
        "UPDATE sell_on_clauses SET status = 'paid', paid_amount = ?, paid_offer_id = ?, resolved_at = ? WHERE id = ? AND status = 'active'",
      ).bind(share, args.saleOfferId, new Date().toISOString(), clause.id).run()
        .catch((e) => { logger.error({ module: "installments" }, `pay sell-on ${clause.id}`, e); return null; });
      if (claim && (claim.meta?.changes ?? 0) > 0 && share > 0) {
        const desc = `${clause.pct} % z prodeje: ${clause.player_name}`;
        await recordTransaction(db, args.ownerClubTeamId, "sell_on_fee", -share, desc, args.gameDate, `sellon-${clause.id}`);
        await recordTransaction(db, clause.beneficiary_team_id, "sell_on_income", share, desc, args.gameDate, `sellon-${clause.id}`);
        out.sellOn = share;
      }
    }
    return out;
  }

  /** Hráč odešel bez peněz (propuštění, konec kariéry, zmizení) → procenta propadnou. Splátky běží dál. */
  export async function lapseSellOnClauses(db: D1Database, playerId: string): Promise<void> {
    await db.prepare("UPDATE sell_on_clauses SET status = 'lapsed', resolved_at = ? WHERE player_id = ? AND status = 'active'")
      .bind(new Date().toISOString(), playerId).run()
      .catch((e) => logger.warn({ module: "installments" }, "lapse sell-on clauses", e));
  }
  ```
- [ ] **Step 4: Napojení:**
  - `finance-processor.ts`: šest nových typů do `TransactionType` (s komentářem „NENÍ v PURCHASE_TYPES, strhne se i do minusu"); na konci `processWeeklyFinances` zavolat `await processTransferInstallments(db, teamId, gameDate).catch((e) => logger.error({ module: "finance" }, "transfer installments", e));`.
  - `game.ts` accept lidský, trvalý přestup: po `recordTransferLevies` → `await settleOnResale(c.env.DB, { playerId, ownerClubTeamId: sellerTeamId, saleAmount: amount, saleOfferId: offerId, gameDate }).catch((e) => logger.error({ module: "game" }, "settle installments on resale", e));` (u výměny se `saleAmount` = doplatek, procenta tedy z doplatku).
  - `game.ts` accept CPU: po zápisu `transfer_income` → stejné volání s `ownerClubTeamId: sellerTeamId, saleAmount: amount, gameDate: vGameDate`.
  - `remove-player.ts`: po načtení řádku, když `leaveType !== "transfer"` → `await lapseSellOnClauses(db, playerId)`.
  - Web `finance/page.tsx`: `TXN_ICONS`/`TXN_LABELS` pro šest typů („Splátka přestupu", „Příjem ze splátky", „Doplacení splátek", „Doplacení splátek (příjem)", „Procenta z prodeje", „Procenta z prodeje (příjem)").
- [ ] **Step 5:** Miniflare test v `game.transfer-installments.test.ts`: kupující koupí na splátky, pak hráče prodá třetímu klubu (`buyer-b`) za 80 000 → původní prodávající dostane zbytek dluhu + 10 % z 80 000; `transfer_installments.status = 'settled'`, `sell_on_clauses.status = 'paid'`. A test propuštění: `POST /teams/buyer-a/players/star/release` → doložka `lapsed`, dohoda zůstane `active`.
- [ ] **Step 6:** `npx vitest run` (API vč. `transaction-labels.test.ts`) → PASS.
- [ ] **Step 7: Commit** `feat(prestupy): tydenni splatky, doplaceni a procenta pri dalsim prodeji`.

### Task B5: Data pro zobrazení (nabídky, závazky, výhled, přehled přestupů)

**Files:**
- Modify: `apps/api/src/auth/middleware.ts` (přesun `requireOwnedTeamRead` z `game.ts`, export)
- Create: `apps/api/src/routes/obligations.ts` + mount v `apps/api/src/index.ts` (`app.route("/api", obligationsRouter)`)
- Modify: `apps/api/src/routes/game.ts` (GET `/teams/:teamId/offers`, GET `/offers/:offerId`, `/budget` forecast)
- Modify: `apps/api/src/routes/league.ts` (~625 přehled přestupů)
- Modify: `apps/api/src/competition/integrity.ts` (seznam přestupů pro vedení)
- Test: `apps/api/src/routes/obligations.test.ts` (Miniflare)

**Interfaces:**
- Produces:
  - Každá nabídka v `GET /teams/:teamId/offers` a `GET /offers/:offerId` má `terms: TransferTerms` (z aktuálního návrhu) a detail navíc `events[].terms: TransferTerms | null` a `payNow` (záloha + poplatek kupujícího).
  - `GET /api/teams/:teamId/obligations` → `{ paying: Deal[]; receiving: Deal[]; sellOnOwed: Clause[]; sellOnClaims: Clause[]; loansOut: Loan[]; loansIn: Loan[]; totals: { payThisWeek: number; receiveThisWeek: number; owedTotal: number; receivableTotal: number } }`
    - `Deal = { id; playerId; playerName; otherTeamId; otherTeamName; totalAmount; upfrontAmount; installmentAmount; installmentsTotal; installmentsPaid; remaining; nextDue: string | null }` (`nextDue` = nejbližší pondělí podle `teams.game_date` kupujícího, ISO datum)
    - `Clause = { id; playerId; playerName; otherTeamId; otherTeamName; pct }`
    - `Loan = { playerId; playerName; otherTeamId; otherTeamName; until: string | null; fee: number }`
  - `GET /api/teams/:teamId/players/:playerId/obligations` → `{ paying: Deal | null; sellOnOwed: Clause | null; receiving: Deal | null; sellOnClaim: Clause | null }` — jen pro strany obchodu (vlastník nebo příjemce), jinak prázdné.
  - Přehled přestupů (`league.ts`) u každého přestupu `installments` a `sellOnPct` (subdotaz na přijatou nabídku stejně jako `je_vymena`).
  - Výhled rozpočtu: týdenní položka „Splátky přestupů" (výdaj kupujícího) a „Příjem ze splátek" (příjem prodávajícího) do konce dohod.

- [ ] **Step 1:** Testy v `obligations.test.ts` (Miniflare, schéma jako B2): po vložení dohody a doložky vrací `/obligations` pro kupujícího `paying[0].remaining`, `nextDue` (pondělí), pro prodávajícího `receiving[0]`; cizí klub dostane `403`; `/players/:id/obligations` pro třetí klub vrací všechno `null`.
- [ ] **Step 2:** FAIL → implementace (dotazy přes `transfer_installments`/`sell_on_clauses` s `JOIN teams` na názvy; hostování z `players` kde `loan_from_team_id = klub` (moji jinde) a `team_id IN (klub a jeho U21) AND loan_from_team_id IS NOT NULL` (cizí u mě) + poplatek z `player_contracts` `join_type = 'loan' AND is_active = 1`).
- [ ] **Step 3:** Nabídky: do SELECTů přidat `upfront_pct, installments, sell_on_pct`, v mapování `terms: termsFromRow(row, currentAmount)`; detail `events` mapovat s `terms` (NULL sloupce → `null`), `payNow = transferSchedule(terms).upfront + adminFee`.
- [ ] **Step 4:** `league.ts` subdotaz:
  ```sql
  (SELECT o.installments FROM transfer_offers o WHERE o.status = 'accepted' AND o.player_id = pc.player_id AND o.from_team_id = pc.team_id ORDER BY o.resolved_at DESC LIMIT 1) as installments,
  (SELECT o.sell_on_pct FROM transfer_offers o WHERE o.status = 'accepted' AND o.player_id = pc.player_id AND o.from_team_id = pc.team_id ORDER BY o.resolved_at DESC LIMIT 1) as sell_on_pct
  ```
  a v mapování `installments: r.installments ?? 0, sellOnPct: r.sell_on_pct ?? 0`. `integrity.ts`: totéž do seznamu přestupů pro vedení.
- [ ] **Step 5:** Výhled: v `/budget` endpointu (`game.ts` ~658–849) projít aktivní dohody klubu jako kupující i prodávající a do týdenních řad přidat splátky (stejný vzor jako projekce `cash_loans`).
- [ ] **Step 6:** PASS + celé API; **Commit** `feat(prestupy): data zavazku, podminky v nabidkach a prehledu`.

### Task B6: Web — podmínky ve formuláři nabídky, protinávrhu a detailu

**Files:**
- Create: `apps/web/src/components/transfers/TransferTermsFields.tsx`
- Create: `apps/web/src/components/transfers/TermsBreakdown.tsx`
- Modify: `apps/web/src/app/(hra)/hrac/[id]/page.tsx` (formulář nabídky ~680–805, `sendOffer` ~321)
- Modify: `apps/web/src/app/(hra)/prestupy/nabidka/[id]/page.tsx`, `components/ActionBar.tsx` (CounterDialog), `components/PlayerHero.tsx` (rozpis místo jedné částky, pryč natvrdo „(20 %)"), `components/OfferTimeline.tsx` (změny podmínek)
- Modify: `apps/web/src/app/(hra)/prestupy/page.tsx` (seznam nabídek: souhrn `formatTermsSummary`, rychlý protinávrh → odkaz na detail)
- Modify: `apps/web/src/lib/api.ts` (typy `terms`)

**Interfaces:**
- Consumes: `TransferTerms`, `transferSchedule`, `formatTermsSummary`, konstanty (B1); API z B5.
- Produces:
  ```tsx
  export function TransferTermsFields(props: { value: Omit<TransferTerms, "amount">; onChange: (v: Omit<TransferTerms, "amount">) => void; disabled?: boolean }): JSX.Element
  export function TermsBreakdown(props: { terms: TransferTerms; adminFee?: number; progress?: { installmentsPaid: number; remaining: number; nextDue: string | null } }): JSX.Element
  ```

- [ ] **Step 1: `TransferTermsFields`** — přepínač „Zaplatit najednou / Na splátky"; při splátkách dva `select`y: záloha (20, 30, … 90 %) a počet splátek (2–10); vždy `select` procenta z dalšího prodeje (0, 5, … 50 %). Přepnutí na „najednou" nastaví `{ upfrontPct: 100, installments: 0 }`, na „splátky" `{ upfrontPct: 30, installments: 4 }`. `text-sm`, popisky česky, bez dlouhých pomlček.
- [ ] **Step 2: `TermsBreakdown`** — tabulka dvou sloupců přesně podle bloku „Rozpis obchodu" ze specifikace (Cena celkem / Záloha (N %) … zaplaceno při podpisu / Splátky N× … každé pondělí (poslední splátka zvlášť, když se liší) / Procenta z dalšího prodeje / Mezikrajský poplatek) a s `progress` navíc Zaplaceno / Zbývá / Další splátka.
- [ ] **Step 3:** Formulář nabídky na detailu hráče: stav `terms` (`useState({ upfrontPct: 100, installments: 0, sellOnPct: 0 })`), pod částkou `<TransferTermsFields>` (jen u trvalého přestupu), pod tím živě `<TermsBreakdown terms={{ amount: offerAmount ?? 0, ...terms }} />`; `sendOffer` posílá `upfrontPct`, `installments`, `sellOnPct`. Hláška chyby ze serveru se zobrazí jako dnes.
- [ ] **Step 4:** Detail nabídky: `canAfford = budget >= detail.payNow`; `PlayerHero` místo částky `<TermsBreakdown terms={detail.terms} adminFee={detail.adminFee} />`; `CounterDialog` dostane `initialTerms` a pod `MoneyInput` `<TransferTermsFields>` + `<TermsBreakdown>`; `onConfirm(amount, message, terms)` posílá podmínky; `OfferTimeline` u každého kroku `formatTermsSummary(event.terms)` a řádek změn proti předchozímu kroku („cena 40 000 → 45 000 · splátky 5 → 3 · procenta 10 % → 15 %"), jen když se něco změnilo.
- [ ] **Step 5:** Seznam nabídek (Přestupy → Nabídky): místo samotné částky `formatTermsSummary(offer.terms)`; rychlé tlačítko „Protinávrh" otevře `/prestupy/nabidka/{id}` (protinávrh s podmínkami je jen tam).
- [ ] **Step 6:** `npx tsc --noEmit -p . && npx next build --no-lint`; **Commit** `feat(prestupy): splatky a procenta ve formulari, protinavrhu a detailu nabidky`.

### Task B7: Web — záložka Závazky, profil hráče, čistý výnos, Finance, přehledy

**Files:**
- Create: `apps/web/src/app/(hra)/prestupy/ObligationsTab.tsx`
- Create: `apps/web/src/components/players/PlayerObligationsCard.tsx`
- Create: `apps/web/src/components/transfers/NetProceeds.tsx`
- Modify: `apps/web/src/app/(hra)/prestupy/page.tsx` (záložka `zavazky`, přesun sekcí hostování z Nabídek)
- Modify: `apps/web/src/app/(hra)/hrac/[id]/page.tsx` (karta v Přehledu, `NetProceeds` v `PlayerPriceDialog`)
- Modify: `apps/web/src/app/(hra)/prestupy/page.tsx` (`PriceDialog` při vystavení vlastního hráče → `NetProceeds`)
- Modify: `apps/web/src/app/(hra)/prestupy/nabidka/[id]/page.tsx` (u prodávajícího `NetProceeds`)
- Modify: `apps/web/src/app/(hra)/finance/page.tsx` (součet splátek v přehledu + odkaz na Závazky)
- Modify: přehled přestupů v `prestupy/page.tsx` (záložka Přehled) a historie klubů v profilu hráče: k ceně poznámka „na splátky" / „+ N % z dalšího prodeje"

**Interfaces:**
- Consumes: `GET /teams/:teamId/obligations`, `GET /teams/:teamId/players/:playerId/obligations` (B5); `TermsBreakdown` (B6); `sellOnShare` (B1).
- Produces: `NetProceeds({ price: number; obligations: PlayerObligations | null })` → řádek „Cena 60 000 · doplacení splátek −21 000 · 15 % pro klub Y −9 000 · **zůstane ti 30 000**" (jen když je co odečíst).

- [ ] **Step 1: `ObligationsTab`** — čtyři části podle specifikace (Splácím, Dluží mi, Procenta z dalšího prodeje, Hostování), nahoře u Splácím/Dluží mi součty `totals`; každá dohoda jako karta s `TermsBreakdown` (s `progress`) a odkazy na hráče a klub; prázdný stav jednou větou („Žádné smluvní závazky nemáš.").
- [ ] **Step 2:** Přestupy: `type Tab`/`TAB_KEYS`/`tabs` doplnit `"zavazky"` („Závazky") na konec; vykreslit `ObligationsTab`; sekce „Moji hráči na hostování" a „Hráči u mě na hostování" z Nabídek smazat (jsou v Závazcích).
- [ ] **Step 3: `PlayerObligationsCard`** v Přehledu profilu vlastního hráče (jen když `paying || sellOnOwed`) a u hráče, kde jsem příjemce (`receiving || sellOnClaim`: „Dluží vám za něj …", „Máte N % z jeho dalšího prodeje"), s větou „Při prodeji se z ceny hned doplatí … klubu X a N % z ceny dostane klub Y."
- [ ] **Step 4: `NetProceeds`** v `PlayerPriceDialog`, v `PriceDialog` při vystavení (Můj tým) a v detailu nabídky u prodávajícího (cena = aktuální návrh).
- [ ] **Step 5:** Finance: v přehledu dlaždice „Splátky přestupů: tento týden −X / +Y" s odkazem „Podrobně v Přestupy → Závazky" (`/prestupy?tab=zavazky`).
- [ ] **Step 6:** Přehled přestupů a historie klubů: k ceně `installments > 0 ? " · na splátky" : ""` a `sellOnPct > 0 ? \` · + ${sellOnPct} % z dalšího prodeje\` : ""` (data z B5; historie klubů z `player_contracts` přes nový subdotaz v `teams.ts` ~3045 stejně jako v B5 Step 4).
- [ ] **Step 7:** `npx tsc --noEmit -p . && npx next build --no-lint`; **Commit** `feat(prestupy): zalozka Zavazky, zavazky v profilu hrace a cisty vynos prodeje`.

### Task B8: Novinka a ověření na testu

**Files:**
- Modify: `apps/web/src/data/release-notes.ts` (jen na výslovné přání uživatele; obsah jen nové věci, bez oprav)

- [ ] **Step 1:** Push na testing (`git fetch && git rebase origin/testing && git push origin HEAD:testing`), počkat na CI.
- [ ] **Step 2: API na testu** (testovací účet, admin): nabídka na splátky → protinávrh se změnou podmínek → přijetí → zkontrolovat `transfer_installments`, `sell_on_clauses`, transakce zálohy v `prales-db-test`; posunout den na pondělí (admin daily tick pro tým) → splátka u obou klubů; prodat hráče dál → doplacení a procenta; propustit jiného hráče s doložkou → `lapsed`.
- [ ] **Step 3: Web na testu** (MCP prohlížeč, počítač + 375 px přes iframe): formulář nabídky (přepínač, živý rozpis), detail nabídky (rozpis, historie se změnami, protinávrh s podmínkami), seznam nabídek (souhrn), záložka Závazky (všechny čtyři části), profil hráče (karta Smluvní závazky), vystavení na trh (čistý výnos), Finance (dlaždice), Přehled přestupů (celková cena + poznámka).
- [ ] **Step 4:** Report uživateli; na produkci až po „nasaď na main" (migrace 0235 na prod: záloha `wrangler d1 export`, pak `--file` přes `!`).
