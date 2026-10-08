# Přehled kádru a páky na váhu (postava, část 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manažer vidí postavu celého kádru a má tři páky: úkol kondičního trenéra, vybavení a domluvu přes SMS.

**Architecture:** Čisté výpočty pák v `season/body-drift.ts` (rozšíření `dailyWeightChange`), načtení pák v `processDailyBodyDrift`. Úkol `weight_plan` ve stávajícím systému úkolů zaměstnanců, vybavení `nutrition` ve stávajícím systému vybavení, SMS hook vedle `zpracujZpravuTrenera`. Přehled = nový endpoint + stránka `/postava`.

**Tech Stack:** TypeScript, Hono/Workers, D1, Vitest + Miniflare, Next.js.

**Spec:** `docs/superpowers/specs/2026-10-08-player-body-levers-design.md`

## Global Constraints

- Anglické identifikátory, žádný prázdný catch, v textech hráčům žádná dlouhá pomlčka, min `text-sm`, mobile-first.
- Plán: `−(0.10 + 0.15 × síla) × (0.75 + workRate/200)` kg v den tréninku; 400 Kč / 7 dní; 14/28 dní; jen over/obese.
- Vybavení: ceny `[0, 3000, 12000, 35000]`; hospoda −20/−35/−50 %, tah ×1/×1,25/×1,5, vše × stav/100.
- SMS: šance slibu `0.3 + disc/200 + (morale−50)/200 − (temper−50)/200` v 0,1–0,9; slib 14 dní, hospoda ×0,25; urážka morálka −5; pauza 14 dní.
- Nasazení jen testing; produkce po „nasaď na main“, migrace 0257 po záloze.

## Review Focus

- Hráč bez váhy na plánu nebo se slibem: žádné NaN, plán bez účinku. Test: Task 1.
- U21 bere vybavení áčka. Test: Task 4.
- SMS řeč o váze u hráče v normě nic nedělá a nespotřebuje pauzu. Test: Task 5.
- Opakovaná zpráva o váze do 14 dní nemění výsledek. Test: Task 5.
- Přehled cizího týmu 403. Test: Task 6.

---

### Task 1: Čisté výpočty pák — `body-drift.ts` (`weightPlanDailyLoss`, `nutritionEffects`, rozšíření `DailyBodyInput` o `pubMul`, `pullMul`, `planLoss`), testy.
### Task 2: Vybavení `nutrition` — migrace 0257, generátor, efekty, opotřebení, opravy, ikona; testy cen a efektů.
### Task 3: Úkol `weight_plan` — katalog, validace a `startWeight`, souhrn SMS, `loadWeightPlans`, hráči s váhou pro výběr, `StaffTaskBox`; DB test.
### Task 4: Denní změna čte páky — vybavení (U21 → áčko), plány, sliby; DB test.
### Task 5: SMS domluva — `detectWeightTalk`, `weightPledgeChance`, `handleWeightTalk` v route, téma do promptu; testy.
### Task 6: Přehled — `GET /teams/:id/body-overview`, stránka `/postava`, menu, titulek; DB test routy.
### Task 7: Ověření — celé testy, build, push, migrace 0257 na testu, prohlížeč desktop + 375 px, revize.
