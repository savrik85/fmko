# Nahlásit chybu, fáze 1 (zkouška focení) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kroužek nápovědy otevře menu (Nápověda ke stránce / Nahlásit chybu); Nahlásit chybu vyfotí stránku dvěma knihovnami a ukáže oba snímky vedle sebe, aby autor na iPhonu vybral tu věrnější.

**Architecture:** `Napoveda` v horní liště se vykreslí vždy a místo přímého otevření panelu ukáže `HelpMenu`. Focení je v `lib/page-capture.ts` (knihovna se načte dynamicky až po ťuknutí), výsledek ukáže `BugReportTrialDialog` v existující `Sheet`. Nic se zatím neodesílá; API, admin a odpověď jsou fáze 2 s vlastním plánem.

**Tech Stack:** Next.js 15 (App Router), React, Tailwind 4, `modern-screenshot@4.7.0`, `@zumer/snapdom@3.7.0`.

**Spec:** `docs/superpowers/specs/2026-11-17-bug-report-design.md`

## Global Constraints

- Identifikátory, názvy souborů, props a klíče anglicky; texty pro hráče česky, bez dlouhé pomlčky.
- Žádný prázdný catch: na klientu `console.error("popis:", e)` / `console.warn`.
- Práce na `testing`, push jen na testing (autor ho pro tuto zkoušku výslovně povolil), nikdy na `main`.
- Ověřit na 375 px (iframe na localhostu, pak test.prales.fun).
- Verze knihoven přesně: `modern-screenshot@4.7.0`, `@zumer/snapdom@3.7.0`.
- Web nemá testovací runner; ověření = `npm run typecheck`, build a MCP prohlížeč (protokol z `CLAUDE.md`).

## Review Focus

- **Odscrollovaná stránka:** `main` scrolluje uvnitř `.app-shell` (okno stojí). Snímek musí ukázat to místo, kam hráč odscrolloval, ne začátek stránky. Ověřuje Task 3, krok 4.
- **Stránka bez nápovědy:** kroužek je vidět a menu má jen „Nahlásit chybu“. Ověřuje Task 2, krok 3.
- **Knihovna selže** (např. obrázek z cizí domény, Safari): u dané knihovny se ukáže text chyby, druhá se zobrazí normálně, nic nespadne. Ověřuje Task 3, krok 5.
- **Dvojí ťuknutí** na Nahlásit chybu během focení: druhé se ignoruje. Ověřuje Task 3, krok 4.
- **Panel nápovědy nad lištou** i s čárkou iPhonu (34 px). Ověřeno v Task 1.

---

### Task 1: Panel nápovědy nezajíždí pod spodní lištu

Hotovo a ověřeno na localhostu (mezera 12 px se simulovanou safe area 34 px i bez ní; bez lišty 88 px jako dřív).

**Files:**
- Modify: `apps/web/src/components/ui/napoveda.tsx` (`HelpPanel`, třída `bottom-[calc(var(--bottom-nav-h,4.75rem)+0.75rem)]`)

- [ ] **Step 1: Commit**

```bash
git add apps/web/src/components/ui/napoveda.tsx
git commit -m "fix(napoveda): panel na mobilu nad skutečnou výškou spodní lišty"
```

### Task 2: Menu u kroužku nápovědy

**Files:**
- Create: `apps/web/src/components/ui/help-menu.tsx`
- Modify: `apps/web/src/components/ui/napoveda.tsx` (`Napoveda`, `HelpButton` aria popisky)

**Interfaces:**
- Produces: `HelpMenu({ hasHelp: boolean; onShowHelp: () => void; onReportBug: () => void; onClose: () => void; busy?: boolean })`
- Produces: `Napoveda` drží stav `mode: "closed" | "menu" | "help"`; `onReportBug` v Task 3 napojí focení.

- [ ] **Step 1: `HelpMenu` v `help-menu.tsx`**

Rozbalovací seznam pod kroužkem (na mobilu i počítači pod horní lištou, zarovnaný ke kroužku), průhledná vrstva za ním zavírá ťuknutím, Escape zavírá. Položky: „📖 Nápověda ke stránce“ (jen když `hasHelp`) a „🐞 Nahlásit chybu“ (`disabled` při `busy`). Kořen menu má `data-capture-ignore`. Hladina `--z-nav`, ať je nad obsahem stránky.

- [ ] **Step 2: Napojit v `Napoveda`**

`Napoveda` už nevrací `null`, když `findHelp` nic nenajde; kroužek se vykreslí vždy. Ťuknutí na kroužek: `closed → menu`, `menu/help → closed`. „Nápověda ke stránce“ → `help` (dnešní `HelpPanel`). Popisek kroužku `aria-label`: „Nápověda a nahlášení chyby“ / „Zavřít“. `NapovedaOnboarding` beze změny.

- [ ] **Step 3: Ověřit v prohlížeči**

Run: `cd apps/web && npm run typecheck` → bez chyb.
MCP, localhost:3000 v iframe 375 × 812: na `/kadr` menu ukáže obě položky, „Nápověda ke stránce“ otevře panel; na stránce bez nápovědy (např. `/obec` nebo jiná bez záznamu v `HELP`) je kroužek vidět a menu má jen „Nahlásit chybu“; ťuknutí vedle a Escape menu zavřou.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/help-menu.tsx apps/web/src/components/ui/napoveda.tsx
git commit -m "feat(napoveda): menu u kroužku s nápovědou a nahlášením chyby"
```

### Task 3: Focení stránky a zkušební okno

**Files:**
- Modify: `apps/web/package.json` (+ lockfile) — `modern-screenshot@4.7.0`, `@zumer/snapdom@3.7.0`, přesné verze
- Create: `apps/web/src/lib/page-capture.ts`
- Create: `apps/web/src/components/bug-report/bug-report-trial-dialog.tsx`
- Modify: `apps/web/src/components/ui/napoveda.tsx` (napojení `onReportBug`)

**Interfaces:**
- Consumes: `HelpMenu` z Task 2 (`busy`, `onReportBug`).
- Produces: `type CaptureEngine = "modern-screenshot" | "snapdom"`
- Produces: `interface CaptureResult { engine: CaptureEngine; blob: Blob | null; width: number; height: number; ms: number; error?: string }`
- Produces: `captureVisibleApp(engine: CaptureEngine): Promise<CaptureResult>` — fáze 2 ji použije s vítěznou knihovnou.
- Produces: `BugReportTrialDialog({ results: CaptureResult[]; onClose: () => void })`

- [ ] **Step 1: Instalace**

Run: `cd apps/web && npm install --save-exact modern-screenshot@4.7.0 @zumer/snapdom@3.7.0`
Expected: obě v `dependencies` bez `^`.

- [ ] **Step 2: `captureVisibleApp` v `lib/page-capture.ts`**

- Cíl: element `.app-shell` (má výšku viewportu), na stránkách mimo hru `document.body`.
- Odscrollování: `main` uvnitř `.app-shell` scrolluje sám. Před focením převést jeho `scrollTop` na `transform: translateY(-Npx)` všech jeho dětí a `scrollTop = 0`, po focení (i při chybě, `finally`) vrátit. Vizuálně se nic nehne.
- Vynechat prvky s `data-capture-ignore` (filtr knihovny).
- Měřítko `Math.min(window.devicePixelRatio || 1, 2)`, výstup JPEG kvalita 0,85.
- Knihovna přes `await import(...)` až při volání.
- `ms` = čas focení včetně načtení knihovny. Chyba → `blob: null`, `error: String(e)`, `console.error("Focení stránky selhalo:", engine, e)`.

- [ ] **Step 3: `BugReportTrialDialog` a napojení**

`Napoveda.onReportBug`: když už fotí, nic (`busy`). Jinak zavřít menu, počkat dva snímky (`requestAnimationFrame` ×2), postupně `captureVisibleApp("modern-screenshot")` a `captureVisibleApp("snapdom")`, pak otevřít `BugReportTrialDialog`.
Okno v `Sheet` (`closeOnBackdrop={false}`): nadpis „Zkouška focení stránky“, věta „Hlášení se zatím neodesílá. Porovnej, který snímek víc odpovídá stránce.“, dva náhledy pod sebou s popiskem „A“ / „B“, časem v ms a velikostí v kB; ťuknutí na náhled ho ukáže přes celou šířku okna; u chyby text chyby místo náhledu. Object URL uvolnit při zavření.

- [ ] **Step 4: Ověřit v prohlížeči**

Run: `cd apps/web && npm run typecheck` → bez chyb.
MCP, localhost iframe 375 × 812, `/kadr` odscrollovaný o ~600 px: Nahlásit chybu → oba náhledy ukazují odscrollované místo, horní i spodní lištu, ne menu; po zavření okna je `main` na stejném místě. Rychlé dvojí ťuknutí spustí focení jen jednou.

- [ ] **Step 5: Ověřit selhání jedné knihovny**

Dočasně (necommitnutě) vyhodit chybu ve větvi `snapdom` v `captureVisibleApp` → B ukáže text chyby, A normálně, okno se otevře. Pak změnu vrátit (`git diff` čistý kromě plánovaných změn).

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json package-lock.json apps/web/src/lib/page-capture.ts apps/web/src/components/bug-report/bug-report-trial-dialog.tsx apps/web/src/components/ui/napoveda.tsx
git commit -m "feat(hlaseni): zkouška focení stránky dvěma knihovnami"
```

### Task 4: Testing

- [ ] **Step 1: Build**

Run: `cd apps/web && npx next build --no-lint` → bez chyb.

- [ ] **Step 2: Kontrola anglických názvů**

Run: `git diff origin/testing --cached; git diff origin/testing | grep "^+" | grep -oE "\b(const|let|function|interface|type|class)\s+\w+" | sort -u` → jen anglické názvy.

- [ ] **Step 3: Push a CI**

Run: `git push origin testing`, pak `sleep 80 && gh run list --branch testing --limit 3 --json status,conclusion,name`
Expected: běhy webu `success`.

- [ ] **Step 4: Ověřit na test.prales.fun**

MCP iframe 375 px: menu u kroužku, panel nápovědy nad lištou, zkušební okno s oběma snímky.
