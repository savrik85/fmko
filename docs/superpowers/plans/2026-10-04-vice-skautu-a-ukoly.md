# Více skautů a aktivní úkoly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Umožnit týmu mít více skautů současně (základ 2 skauti, více podle licence trenéra v rozmezí 2–5) a rozšířit systém úkolů skautingu ze stávajícího plošného hledání o sledování konkrétního hráče a taktický skauting příštího soupeře.

**Architecture:** 
- `staff_members`: role `skaut` už není omezena na 1 slot, ale na dynamický limit `maxScoutsForLicence(licenceLevel)`.
- `scout_assignments`: unikátní index na aktivní úkol se mění z `team_id` na `staff_id` (každý skaut má 1 svůj aktivní úkol). Přibývají typy misí `player` (konkrétní hráč) a `match` (soupeř/zápas).
- Zápasový bonus ze skautingu soupeře se promítá do `match-runner.ts` / taktiky.
- UI `/zamestnanci/skaut` dostává přepínač mezi najatými skauty a formuláře pro zadání hráče či soupeře. Na detail hráče přibývá tlačítko „Poslat skauta“.

**Tech Stack:** Cloudflare D1 (SQLite), Hono, TypeScript, vitest, Next.js 15.

**Spec:** `docs/superpowers/specs/2026-10-04-vice-skautu-a-ukoly-design.md` (navazuje na `2026-10-04-skauting-vyjednavani-design.md`).

---

## Global Constraints

- Identifikátory v kódu anglicky, texty pro hráče česky.
- V textech pro hráče žádná dlouhá pomlčka (—) a žádná angličtina v UI.
- Žádný prázdný catch; server loguje `logger.warn({ module: "xyz" }, "popis", e)`.
- Na prod žádný zápis bez výslovného souhlasu; migrace na prod jen po záloze. Práce na větvi `testing`, ne na `main`.
- Wrangler se spouští holý (bez `cd`/roury). D1 příkazy: vnější `'`, vnitřní `"`.

---

## File Structure

- Create: `apps/api/migrations/0241_vice_skautu_a_ukoly.sql`
- Modify: `packages/shared/src/types/staff.ts`: `maxScoutsForLicence(licence: number): number`, rozšíření typů pro mise.
- Modify: `apps/api/src/routes/staff.ts`: uvolnění limitu pro roli `skaut` při hire/reassign.
- Modify: `apps/api/src/routes/scouting.ts`: podpora pro více skautů, zadání mise na hráče a soupeře, čtení reportů per skaut.
- Modify: `apps/api/src/scouting/scout-work.ts`: odpočet a vyhodnocení misí na hráče a zápas.
- Modify: `apps/api/src/multiplayer/match-runner.ts`: zohlednění zápasového skautingu v simulaci.
- Modify: `apps/web/src/app/(hra)/zamestnanci/page.tsx`: zobrazení více slotů pro skauty a celkového limitu.
- Modify: `apps/web/src/app/(hra)/zamestnanci/skaut/page.tsx`: přepínání mezi skauty a zadávání misí.
- Modify: `apps/web/src/app/(hra)/hrac/[id]/page.tsx`: tlačítko pro rychlé vyslání skauta na hráče.

---

### Task 1: Datový model a sdílená pravidla (kapacita skautů)

**Files:**
- Modify: `packages/shared/src/types/staff.ts`
- Create test: `packages/shared/src/types/staff-scouts.test.ts`
- Create migration: `apps/api/migrations/0241_vice_skautu_a_ukoly.sql`

- [ ] **Step 1: Napsat test pravidel pro počet skautů podle licence**
  Otestovat `maxScoutsForLicence`:
  - Licence 0 (bez licence) -> 2
  - Licence 1 (Licence C) -> 2
  - Licence 2 (UEFA B) -> 3
  - Licence 3 (UEFA A) -> 4
  - Licence 4 (UEFA Pro) -> 5

- [ ] **Step 2: Implementovat `maxScoutsForLicence` a typy misí v shared**
  V `packages/shared/src/types/staff.ts`:
  ```ts
  export function maxScoutsForLicence(licenceLevel: number): number {
    if (licenceLevel >= 4) return 5;
    if (licenceLevel >= 3) return 4;
    if (licenceLevel >= 2) return 3;
    return 2;
  }
  ```

- [ ] **Step 3: Vytvořit D1 migraci pro úkoly více skautů**
  `apps/api/migrations/0241_vice_skautu_a_ukoly.sql`:
  - Drop stávajícího indexu `idx_scout_assignments_active ON scout_assignments(team_id) WHERE status = 'active'`.
  - Vytvoření nového indexu: `CREATE UNIQUE INDEX IF NOT EXISTS idx_scout_assignments_staff_active ON scout_assignments(staff_id) WHERE status = 'active';`.
  - Přidání sloupců pro nové typy úkolů:
    ```sql
    ALTER TABLE scout_assignments ADD COLUMN assignment_type TEXT NOT NULL DEFAULT 'area';
    ALTER TABLE scout_assignments ADD COLUMN target_player_id TEXT;
    ALTER TABLE scout_assignments ADD COLUMN target_team_id TEXT;
    ALTER TABLE scout_assignments ADD COLUMN target_match_id TEXT;
    ALTER TABLE scout_assignments ADD COLUMN result_data TEXT;
    ```

---

### Task 2: Backend — hiring více skautů a API úkolů

**Files:**
- Modify: `apps/api/src/routes/staff.ts`
- Modify: `apps/api/src/routes/scouting.ts`
- Test: `apps/api/src/routes/staff-scout.test.ts`

- [ ] **Step 1: Úprava kontroly slotů v `apps/api/src/routes/staff.ts`**
  Při najímání (`POST /teams/:teamId/staff/:staffId/hire`) a změně role (`POST /teams/:teamId/staff/:staffId/reassign`):
  - Pokud `role === 'skaut'`:
    - Načíst licenci manažera (`loadCoachLicence`).
    - Spočítat aktuální počet skautů: `SELECT COUNT(*) as cnt FROM staff_members WHERE team_id = ? AND role = 'skaut'`.
    - Pokud `cnt >= maxScoutsForLicence(licence)`, vrátit chybu 409 s vysvětlením, že pro dalšího skauta je potřeba vyšší licence.
  - Pro všechny ostatní role ponechat původní `occupied` kontrolu (max 1 člověk na roli).

- [ ] **Step 2: Rozšíření endpointů skautingu v `apps/api/src/routes/scouting.ts`**
  - Upravit `GET /teams/:teamId/scouting`: vrátit seznam všech najatých skautů týmu, jejich aktuální přiřazený úkol a max povolený počet skautů dle licence.
  - Upravit `POST /teams/:teamId/scouting/assign`: přijímat `staffId` konkrétního skauta a `assignmentType`:
    - `'area'` (stávající výběr postu, věku a okruhu km).
    - `'player'` (`targetPlayerId` — skautování konkrétního hráče).
    - `'match'` (`targetTeamId` / `targetMatchId` — taktický rozbor soupeře).

---

### Task 3: Engine vyhodnocení misí (Hráč & Zápas)

**Files:**
- Modify: `apps/api/src/scouting/scout-work.ts`
- Modify: `apps/api/src/multiplayer/match-runner.ts`
- Test: `apps/api/src/scouting/scout-missions.test.ts`

- [ ] **Step 1: Vyhodnocení hráčské mise (`assignment_type = 'player'`)**
  - Skaut stráví na misi 2 herní dny.
  - Po dokončení:
    - Vygeneruje report s přesnými čísly hráče (rozptyl 0 až 1 bod podle `judgement`).
    - Odhalí skryté parametry (`alcohol`, `temper`, `hidden_talent`).
    - Vytvoří `scout_reports` záznam a odešle zprávu do schránky týmu.

- [ ] **Step 2: Vyhodnocení zápasové mise (`assignment_type = 'match'`)**
  - Skaut sleduje příštího soupeře.
  - Vytvoří taktický rozbor: preferované rozestavení, klíčový hráč, slabina v sestavě.
  - Uloží do `result_data` taktický bonus (např. bonus k obraně proti stylu soupeře).
  - V `match-runner.ts` započítat bonus, pokud má tým platný dokončený report na soupeře z posledních 10 dní.

---

### Task 4: Frontend — Realizační tým a správa skautů

**Files:**
- Modify: `apps/web/src/app/(hra)/zamestnanci/page.tsx`
- Modify: `apps/web/src/app/(hra)/zamestnanci/skaut/page.tsx`
- Modify: `apps/web/src/app/(hra)/hrac/[id]/page.tsx`

- [ ] **Step 1: Zobrazení více skautů na stránce Realizační tým (`/zamestnanci`)**
  - V sekci *Scouting* zobrazit kartičky všech najatých skautů.
  - Zobrazit volný slot pro dalšího skauta, pokud `pocetSkautu < maxScouts`.
  - Pokud je dosažen limit licence, zobrazit nápovědu: *„Dalšího skauta odemkneš s licencí [Název licence]“*.

- [ ] **Step 2: Přepínání skautů na stránce `/zamestnanci/skaut`**
  - Záložky / výběr konkrétního skauta (např. *Karel Novák — na cestě (1 d)*, *Jan Svoboda — volný*).
  - Formulář pro zadání úkolu pro vybraného skauta:
    - Karta 1: Plošné hledání v okruhu (stávající formulář).
    - Karta 2: Sledování soupeře (výběr ze seznamu nadcházejících zápasů v lize/poháru).

- [ ] **Step 3: Tlačítko na profilu cizího hráče (`/hrac/[id]`)**
  - U hráčů jiných klubů a volných hráčů přidat akční tlačítko **„Poslat skauta“**.
  - Modal s výběrem volného skauta a zobrazením odhadované doby (např. 2 dny) a nákladů.

---

### Task 5: Ověření a testování

- [ ] **Step 1: Lokální testy na backendu**
  Spustit vitest pro staff, scouting a match-runner:
  `cd apps/api && npx vitest run src/scouting/`
  `cd apps/api && npx vitest run src/routes/staff-scout.test.ts`

- [ ] **Step 2: Ověření v UI a curl testy na localhost:3002**
  - Ověřit najmutí druhého skauta bez licence.
  - Ověřit zablokování třetího skauta bez licence UEFA B.
  - Zadat úkol na hráče, odsimulovat posun herního dne a ověřit doručení reportu.
