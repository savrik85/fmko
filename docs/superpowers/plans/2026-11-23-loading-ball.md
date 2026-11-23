# Načítání: skákající míč — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Místo zeleného kolečka při načítání míč: točící se v `Spinner`, skákající s hláškou v `PageLoading`/`SectionLoading`.

**Architecture:** Časování a hlášky jako čistá logika v `loading-quips.ts` (testovatelné ve vitestu bez DOM). Kresba míče a animace v `spinner.tsx` + CSS v `globals.css`. Volající se nemění, jen 4 vlastní kolečka přejdou na `<Spinner />`.

**Tech Stack:** Next.js 15, React 19, Tailwind 4 (`globals.css`), vitest (`npx vitest run --root apps/web`, prostředí node, bez JSX v testech).

**Spec:** `docs/superpowers/specs/2026-11-23-loading-ball-design.md`

## Global Constraints

- Identifikátory, soubory a id v testech anglicky; česky jen texty pro hráče a komentáře.
- Žádný prázdný catch.
- Hlášky bez dlouhé pomlčky (—, –), každá končí „…“.
- Žádná nová knihovna. Žádná minimální doba zobrazení.
- `Spinner` drží dnešní rozměry: sm 1.25rem, md 2rem, lg 2.5rem.
- Časy: míč po 300 ms, hláška po 1 500 ms, střídání po 2 600 ms.
- Na testing nic bez výslovného pokynu; nejdřív lokální ověření.

## Review Focus

- Načtení pod 300 ms: nic se neukáže (test `loadingPhase(299) === "hidden"`).
- Komponenta zmizí dřív, než časovač doběhne: časovače se uklidí, žádný `setState` po odpojení (kontrola v kódu, Task 2).
- Víc míčů na jedné stránce: každý má vlastní `clipPath` id (`useId`), jinak se vzor rozbije (kontrola v prohlížeči, Task 4).
- Hláška na 375 px se vejde na jeden řádek (test: každá ≤ 34 znaků).
- `prefers-reduced-motion`: míč stojí, hláška zůstane (kontrola v prohlížeči, Task 4).

---

### Task 1: Časování a hlášky

**Files:**
- Create: `apps/web/src/components/ui/loading-quips.ts`
- Test: `apps/web/src/components/ui/loading-quips.test.ts`

**Interfaces:**
- Produces:
  - `LOADING_QUIPS: readonly string[]` (14 hlášek ze specu, v tomtéž pořadí)
  - `BALL_DELAY_MS = 300`, `QUIP_DELAY_MS = 1500`, `QUIP_INTERVAL_MS = 2600`
  - `type LoadingPhase = "hidden" | "ball" | "quip"`
  - `loadingPhase(elapsedMs: number): LoadingPhase`
  - `quipAt(startIndex: number, elapsedMs: number): string` — hláška pro daný čas; od `QUIP_DELAY_MS` každých `QUIP_INTERVAL_MS` další, dokola.

- [ ] **Step 1: Napsat testy**
  - `loadingPhase(0)` a `(299)` → `"hidden"`; `(300)` a `(1499)` → `"ball"`; `(1500)` a `(60000)` → `"quip"`.
  - `quipAt(0, 1500) === LOADING_QUIPS[0]`; `quipAt(0, 1500 + 2600) === LOADING_QUIPS[1]`; `quipAt(13, 1500 + 2600) === LOADING_QUIPS[0]` (dokola); `quipAt(5, 1500)` = `LOADING_QUIPS[5]`.
  - Každá hláška: končí „…“, neobsahuje „—“ ani „–“, délka ≤ 34, žádná se neopakuje.
- [ ] **Step 2:** `npx vitest run --root apps/web src/components/ui/loading-quips.test.ts` → FAIL (modul neexistuje).
- [ ] **Step 3:** Implementovat `loading-quips.ts`.
- [ ] **Step 4:** Stejný příkaz → PASS.
- [ ] **Step 5:** Commit `feat(načítání): hlášky a časování pro míč`.

### Task 2: Míč v komponentách a stylech

**Files:**
- Modify: `apps/web/src/components/ui/spinner.tsx`
- Modify: `apps/web/src/app/globals.css:875-883` (blok `.spinner`)

**Interfaces:**
- Consumes: vše z Task 1.
- Produces (beze změny signatur): `Spinner({ size }: { size?: "sm" | "md" | "lg" })`, `PageLoading()`, `SectionLoading()`.

- [ ] **Step 1:** `spinner.tsx`: `"use client"`; vnitřní `BallIcon` (SVG 100×100 jako v ukázce `.superpowers/brainstorm/29853-1795443174/content/nacitani-varianty.html`, `clipPath` id z `useId()` očištěné na `[A-Za-z0-9_-]`).
- [ ] **Step 2:** `Spinner`: `<span className="spinner spinner-{size}" aria-hidden>` s `BallIcon`, točí se. Třídy velikostí zůstávají.
- [ ] **Step 3:** Vnitřní hook `useLoadingPhase(): { phase: LoadingPhase; quip: string }` — `startIndex` náhodně v `useEffect` (ne při renderu, kvůli hydrataci), jeden `setInterval` po 250 ms počítá z `performance.now()`, úklid v návratu efektu.
- [ ] **Step 4:** `PageLoading` / `SectionLoading`: obal s `role="status"` a `aria-label="Načítám"` je tam hned a drží výšku (dnešní `min-h-[50vh]` / `py-8`); míč (`.loading-ball` + stín) od fáze `ball`, hláška (`.loading-quip`, `text-muted`) od fáze `quip`, prolínání opacity.
- [ ] **Step 5:** `globals.css`: `.spinner` = rotace 1.8 s; `.loading-ball` skok 0.9 s se zplácnutím a stínem (křivky z ukázky); `@media (prefers-reduced-motion: reduce)` vypne animace míče i stínu.
- [ ] **Step 6:** `npm run typecheck` (v `apps/web`) → bez chyb.
- [ ] **Step 7:** Commit `feat(načítání): skákající míč místo kolečka`.

### Task 3: Vlastní kolečka na `<Spinner />`

**Files:**
- Modify: `apps/web/src/app/klub/[teamId]/StadiumPhotoCard.tsx:228` → `<Spinner size="lg" />`
- Modify: `apps/web/src/components/stadium/stadium-3d/Stadium3D.tsx:476` → `<Spinner size="lg" />`
- Modify: `apps/web/src/components/players/reveal-card.tsx:116` → `<Spinner />` (zachovat `mx-auto mb-2` obalem)
- Modify: `apps/web/src/components/onboarding/step-reveal.tsx:80` → `<Spinner />`

- [ ] **Step 1:** Nahradit, doplnit import z `@/components/ui/spinner` (nebo relativně podle souboru).
- [ ] **Step 2:** `grep -rn "animate-spin" apps/web/src --include='*.tsx'` → nic.
- [ ] **Step 3:** `npm run typecheck` → bez chyb. Commit `refactor(načítání): vlastní kolečka na Spinner`.

### Task 4: Ověření

- [ ] **Step 1:** `cd apps/web && npx next build --no-lint` → úspěch.
- [ ] **Step 2:** Lokálně (web + API) v Chromu na 375 px: stránka s `PageLoading` při throttlingu „Slow 4G“ → míč po 0,3 s, hláška po 1,5 s; bez throttlingu nic neproblikne; tlačítko se `Spinner size="sm"` nezmění velikost; přehrávač zápasu (tmavý) má viditelný míč; dva míče na jedné stránce mají oba vzor.
- [ ] **Step 3:** Emulace `prefers-reduced-motion: reduce` → míč stojí.
- [ ] **Step 4:** Report uživateli se screenshoty. Push na testing jen na jeho pokyn.
