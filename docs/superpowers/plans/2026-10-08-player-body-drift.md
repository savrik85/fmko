# Váha v čase a růst dorostu (postava, část 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Váha hráče se denně hýbe podle hospody, tréninku, zranění a tahu k přirozené váze, přes léto podle chování, dorost roste; manažer vidí trend, historii a dostane SMS od štábu.

**Architecture:** Čisté výpočty v novém modulu `apps/api/src/season/body-drift.ts` (testované bez DB), orchestrace tamtéž: `processDailyBodyDrift` volaná z denního ticku po hospodě, `summerWeightStatements` z letního souhrnu, `growYoungPlayers` za dospíváním. Historie v nové tabulce `weight_log`. API detail vrací `body.trend30d`, nový endpoint `weight-log`, web ukazuje trend a kartu Vývoj váhy.

**Tech Stack:** TypeScript, Hono/Workers, D1, Vitest + Miniflare, Next.js.

**Spec:** `docs/superpowers/specs/2026-10-08-player-body-drift-design.md` (navazuje na `2026-10-08-player-body-design.md`)

## Global Constraints

- Identifikátory anglicky, česky jen texty, komentáře a popisy testů. Žádný prázdný catch. V textech pro hráče žádná dlouhá pomlčka.
- Konstanty: tah `0.006`, hospoda `0.08 × (0.5 + alkohol/100)`, trénink `−0.03`, kondiční `−0.07`, zranění `+0.03`; váha zaokrouhlená na 0,01, rozsah 50–140 kg. Přirozená váha `idealWeight × BODY_WEIGHT_FACTOR × (1 + max(0, věk − 28) × 0.005)`.
- Léto: +1, alkohol > 60 +1, věk ≥ 30 +0,5, `fit` −2,5, `rusty`/`injury` +1, ořez ±3.
- Růst: nový věk ≤ 17 +2..4 cm, 18 +1..2 cm, 19+ 0; seed `${playerId}:growth:${newAge}`; váha × (h2/h1)².
- Trend: záznam 14–42 dní starý nejbližší 28 dnům. SMS: záznam 21–35 dní starý, nárůst ≥ 3 kg, pauza 30 herních dní.
- Jen týmy z tréninkové smyčky denního ticku (`user_id != 'ai'`). AI váhu nemění.
- Nasazení jen na testing; produkce až po „nasaď na main“, záloha před migrací 0256.

## Review Focus

- Hráč bez výšky, váhy nebo postavy: žádný tah k přirozené váze, žádné NaN, hospoda a trénink dál platí jen s platnou váhou. Test: Task 1.
- Opakovaný denní tick (ruční spuštění po smazání KV zámku): změna se aplikuje znovu, to je známá cena ručního ticku; pondělní záznam nesmí vzniknout dvakrát pro stejné herní datum. Test: Task 3 (`INSERT … WHERE NOT EXISTS`).
- Hráč odejde z klubu: jeho záznamy zmizí s ním (`remove-player`). Task 2.
- SMS se nesmí opakovat každý týden pro stejného hráče. Test: Task 1 (`weightAlertDue` s `lastSmsAt`).
- Cizí hráč: trend `null` a historie 403. Test: Task 5.

---

### Task 1: Čisté výpočty (`season/body-drift.ts`)

**Files:** Create `apps/api/src/season/body-drift.ts`, `apps/api/src/season/body-drift.test.ts`

**Produces:** `naturalWeight(heightCm, bodyType, age): number | null`, `dailyWeightChange(input: DailyBodyInput): number`, `applyDailyWeight(weight, change): number`, `summerWeightChange({ alcohol, age, event }): number`, `youthGrowthCm(rng, newAge): number`, `grownWeight(weight, oldH, newH): number`, `weightTrend(current, entries, today, minDays, maxDays): number | null`, `weightAlertDue({ gain, lastSmsAt, today }): boolean`, `weightSmsText(rng, cause, name, kg): string`, `weightSmsCause({ injured, pubVisits28d }): WeightSmsCause`.

- [ ] Step 1: test (měsíční cíle ze spec, přirozená váha, léto, růst, trend, SMS)
- [ ] Step 2: run → FAIL (modul neexistuje)
- [ ] Step 3: implementace
- [ ] Step 4: run → PASS
- [ ] Step 5: commit `feat(postava): vypocty vahy v case, leta a rustu`

### Task 2: Migrace 0256 `weight_log` a úklid při odchodu hráče

**Files:** Create `apps/api/migrations/0256_weight_log.sql`; Modify `apps/api/src/transfers/remove-player.ts`

```sql
CREATE TABLE IF NOT EXISTS weight_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  game_date TEXT NOT NULL,
  weight REAL NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_weight_log_player ON weight_log(player_id, game_date);
```

`remove-player.ts` vedle mazání `training_log`: `DELETE FROM weight_log WHERE player_id = ?` s `logger.warn` v catch.

- [ ] Step 1: ověř na lokálním SQLite (`sqlite3 … < migrace` dvakrát bez chyby)
- [ ] Step 2: spusť na `prales-db-test`
- [ ] Step 3: commit `feat(postava): tabulka historie vahy`

### Task 3: Denní změna v denním ticku

**Files:** Modify `apps/api/src/season/body-drift.ts` (orchestrace), `apps/api/src/season/daily-tick.ts`; Test `apps/api/src/season/body-drift.db.test.ts` (Miniflare)

**Produces:** `processDailyBodyDrift(db, { teamIds, trainedToday: Map<string, "conditioning" | "other">, gameDate, isMonday }): Promise<{ updated: number; logged: number; sms: number }>`

V `daily-tick.ts`: před tréninkovou smyčkou `const bodyDriftTeams: string[] = []; const trainedToday = new Map<string, "conditioning" | "other">();`, v ní `bodyDriftTeams.push(teamId)` a po `simulateTraining` smyčka přes `result.attendance` (bez náhody) plnící `trainedToday`. Po bloku „Hospoda U Pralesa“ volání `processDailyBodyDrift` v try/catch s `logger.error`.

Orchestrace: načte hráče týmů (`id, team_id, first_name, last_name, age, physical, personality, life_context`), dnešní `pub_sessions.attendees`, aktivní zranění (bez `osobni_volno`), spočítá novou váhu, zapíše dávkou `UPDATE players SET physical = json_set(physical, '$.weight', ?)`. V pondělí: `INSERT INTO weight_log … SELECT … WHERE NOT EXISTS (stejný hráč a game_date a source 'weekly')`, smaže záznamy starší 365 dní, vyhodnotí SMS (záznam 21–35 dní, `weightAlertDue`, odesílatel podle `staff_members.role`, `sendSystemSMS`, zápis `life_context.weightSmsAt`).

- [ ] Step 1: DB test (hospoda + trénink + zranění mění váhu, pondělní záznam jednou, SMS při +3 kg a ne podruhé)
- [ ] Step 2: run → FAIL
- [ ] Step 3: implementace + napojení v ticku
- [ ] Step 4: run → PASS, `npx vitest run src/season`
- [ ] Step 5: commit `feat(postava): vaha se denne hybe podle hospody, treninku a zraneni`

### Task 4: Léto a růst dorostu

**Files:** Modify `apps/api/src/season/season-recap.ts` (větev `applyEffects`), `apps/api/src/season/dospivani.ts` (`growYoungPlayers`), `apps/api/src/season/season-departures.ts` (`bumpAges`), `apps/api/src/season/season-rollover.ts` (U21); Test v `body-drift.db.test.ts`

**Produces:** `summerWeightStatements(db, squad, events, gameDate): D1PreparedStatement[]`, `growYoungPlayers(db, teamId, gameDate): Promise<number>`

- [ ] Step 1: DB test (léto: piják s rusty +3, fit −1,5; růst 17letého +2..4 cm a BMI stejné; 20letý beze změny)
- [ ] Step 2: run → FAIL
- [ ] Step 3: implementace + napojení
- [ ] Step 4: run → PASS
- [ ] Step 5: commit `feat(postava): leto meni vahu, dorost roste`

### Task 5: API trend a historie

**Files:** Modify `apps/api/src/routes/teams.ts` (detail: `body.trend30d`; nový `GET /:id/players/:playerId/weight-log`); Test `apps/api/src/routes/teams.player-body.test.ts` (rozšířit o `weight_log`)

- [ ] Step 1: test (vlastní hráč: trend z 28denního záznamu, weight-log 200 s položkami; cizí: trend null, weight-log 403)
- [ ] Step 2: FAIL → Step 3: implementace → Step 4: PASS
- [ ] Step 5: commit `feat(postava): trend vahy v detailu a historie vahy v API`

### Task 6: Web

**Files:** Modify `apps/web/src/lib/api.ts` (`body.trend30d`), `apps/web/src/lib/player-attrs.ts` (`formatKg`), `apps/web/src/app/(hra)/hrac/[id]/page.tsx` (Váha s desetinami, řádek „Za měsíc“, karta `WeightLog` v záložce Historie)

- [ ] Step 1: `npx tsc --noEmit` a `next build`
- [ ] Step 2: commit `feat(postava): profil ukazuje trend a vyvoj vahy`

### Task 7: Ověření na testu

- [ ] Celé testy API, build webu, push na testing, CI zelené
- [ ] Ruční denní tick na testu (smazat KV zámek): váhy v desetinách se změnily u hráčů z hospody
- [ ] Vynutit pondělní záznam a SMS na připraveném hráči (vložit 28 dní starý záznam o 4 kg nižší, spustit `processDailyBodyDrift` s `isMonday` přes ruční tick v pondělí nebo přímým voláním na testu)
- [ ] Profil: řádek Za měsíc a karta Vývoj váhy, desktop + 375 px
