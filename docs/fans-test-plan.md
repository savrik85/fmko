# Test plán — fanoušci, historie, ekonomika, concession rebalance

> Stav: 2026-04-11 · target: `testing` env (api-test.prales.fun / test.prales.fun)

## Scope

- Fáze 1 — rename občerstvení, cena L1 5000 Kč
- Fáze 2 — detailní historie spokojenosti po zápasech
- Fáze 3 — concession rebalance (external vs self)
- Fáze 4 — ověření celkového ekonomického dopadu za více zápasů

## Předpoklady

- Nasazený commit `239dacd` (nebo vyšší) na testing env
- Migrace `0055_fans_match_history.sql` aplikovaná na `prales-db-test` (už je)
- Testovací tým s aktivními fanoušky, existujícím stadionem a concession

---

## T1 — Rename občerstvení (manuální FE)

### T1.1 Stadion stránka

1. `test.prales.fun/dashboard/stadium`
2. Najít upgrade card „Občerstvení"
3. **Očekávání**: L1 popisek je „Pivní stan z bazaru"
4. Po upgrade L0→L1 v dialogu se zobrazí cena **5 000 Kč** (ne 10 000)
5. Po potvrzení: `teams.budget` v DB se sníží o 5 000, `stadiums.refreshments = 1`

SQL ověření:
```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT t.name, t.budget, s.refreshments FROM teams t JOIN stadiums s ON s.team_id = t.id WHERE t.id = "TEAMID"'
```

### T1.2 L2/L3 popisky

1. Upgrade L1→L2 — dialog ukazuje „Karavan"
2. Upgrade L2→L3 — dialog ukazuje „Hospůdka"
3. Ceny beze změny (110 000, 280 000 Kč)

---

## T2 — Detailní historie spokojenosti

### T2.1 Prázdný stav

Nový tým nemá žádnou historii — sekce „Historie spokojenosti" na `/dashboard/fans` **nemá být viditelná**.

### T2.2 Po 1. zápase

1. Simulovat 1 zápas pro testovací tým (přes schedule / admin endpoint)
2. Otevřít `/dashboard/fans`
3. **Očekávání**: Sekce „Historie spokojenosti (posledních 1)" se zobrazí
4. Ukazuje:
   - 1 řádek se soupeřem, datem, result badge (V/R/P)
   - Delta číslo barevně (zelená/červená/šedá)
   - Before → after snapshot
   - Reasons jako middle-dot separated list
5. Sparkline: ukazuje „Nedostatek dat pro graf" (< 2 zápasy)

### T2.3 Po N zápasech (N ≥ 5)

1. Simulovat minimálně 5 zápasů (např. přes 5 dní daily-ticku)
2. **Očekávání**: Sparkline graf se vykreslí, osa X = chronologicky (starší vlevo, nejnovější vpravo)
3. Seznam 20 posledních (nebo méně) od nejnovějšího nahoře
4. Delta sumy = rozdíl `satisfactionAfter - satisfactionBefore` (= `delta`)
5. Satisfaction v hlavičce stránky == `satisfactionAfter` nejnovějšího záznamu

### T2.4 Data integrita — DB check

```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT COUNT(*) as c, MIN(gamedate) as first, MAX(gamedate) as last FROM fans_match_history WHERE team_id = "TEAMID"'
```

Očekávání: `c` odpovídá počtu odehraných zápasů po deployi (historie se začala plnit dnes).

### T2.5 Endpoint curl test

```bash
curl -s "https://api-test.prales.fun/api/teams/TEAMID/fans/history?limit=10" | python3 -m json.tool
```

**Očekávání**: JSON `{ items: [...] }`, každý item má fields: `id, matchId, gamedate, satisfactionBefore, satisfactionAfter, delta, reasons[], opponentName, result, attendance`.

---

## T3 — Concession rebalance (self vs external)

### T3.1 External mode — weekly income

1. Přepnout tým na `mode = "external"` přes `PATCH /api/teams/TEAMID/concession/mode`
2. Trigger weekly finance cycle
3. Ověřit transaction:
   ```bash
   curl -s "https://api-test.prales.fun/api/teams/TEAMID/transactions?limit=5" | python3 -m json.tool
   ```
4. **Očekávání**: najít záznam s `type = "concession_income_external"`. Částka:
   - L0 bez bufetu: ~50 × (rep/50) Kč
   - L1: ~300 × (rep/50) Kč (bylo 600)
   - L2: ~550 × (rep/50) Kč (bylo 1000)
   - L3: ~800 × (rep/50) Kč (bylo 1400)

### T3.2 Self mode — per-match income

1. Přepnout na `mode = "self"` (vyžaduje refreshments ≥ 1)
2. Nastavit default sell prices přes `PATCH /api/teams/TEAMID/concession/products/beer` atd.
3. Doplnit sklad (např. 100 ks pivo, 100 ks klobása, 100 ks limo) přes restock
4. Simulovat 1 domácí zápas
5. Ověřit transakce:
   ```sql
   SELECT type, amount, description FROM transactions
   WHERE team_id = 'TEAMID' ORDER BY created_at DESC LIMIT 10;
   ```
6. **Očekávání**: `concession_income_self` s částkou která odpovídá vzorci  
   `attendance × baseDemandRate × satMul × priceFactor × qualityBoost × sellPrice` pro každý produkt.  
   Pro obec s ~150 diváky a default sat 50 by celkový income self concession měl být **~2 000–3 000 Kč**.

### T3.3 Porovnání na stejném týmu (kritický test)

**Cíl**: Ověřit že self > external pro obec.

1. Snapshot `budget` týmu
2. Nastavit mode = external, spustit 3 týdny simulace (3 domácí zápasy)
3. Zapsat změnu budgetu
4. Reset DB / wipe historii / nastavit mode = self s naplněným skladem
5. Stejné 3 týdny simulace
6. Porovnat rozdíl budgetu

**Očekávání**: Self mode přinese ~2–3× více čistého zisku za stejnou periodu.

### T3.4 Vesnice — self je záměrně mírně horší

Pro vesnici (200 obyvatel, attendance ~15) opakovat T3.3. Očekávání: self ≈ external (self cca 235/týden, external L1 cca 300/týden).

---

## T4 — Celkový ekonomický dopad za více zápasů

### T4.1 20-týdenní simulace

**Postup**: Nastavit střední tým (obec, rep 50, L1 občerstvení, self mode) a pustit simulaci celé poloviny sezóny.

1. Snapshot před:
   ```sql
   SELECT budget FROM teams WHERE id = 'TEAMID';
   ```
2. Trigger simulace 20 herních týdnů (10 domácích, 10 venkovních zápasů)
3. Snapshot po
4. Sečíst transakce:
   ```sql
   SELECT type, SUM(amount) FROM transactions
   WHERE team_id = 'TEAMID' AND created_at > 'SIMULATION_START'
   GROUP BY type ORDER BY SUM(amount) DESC;
   ```

**Očekávání** (z `docs/economy-balance.md`):
- Příjem z vstupného: ~50 000–80 000 Kč (závislé na výsledcích)
- Concession self: ~25 000–40 000 Kč
- Sponzoři, dotace: ~40 000 Kč
- Výdaje na platy, tréninky, zápasy: ~90 000–110 000 Kč
- **Čistý delta budget: +30 000 až +80 000 Kč** za 20 týdnů

### T4.2 Edge cases

- **Ztrátová série** (5 proher za sebou): Ověřit že tým není v bankrotu, satisfaction dramaticky klesá, attendance klesne, budget nepadne pod 0
- **Vítězná série** (5 výher): Satisfaction > 70, attendance roste, budget roste rychleji
- **Nekvalitní self concession** (L1 levná + přepálené ceny): Ověřit že satisfaction klesá (negativní delta), prodejnost se snižuje kvůli price elasticity

### T4.3 Satisfaction propojení s attendance

Ověřit že po sérii výher s positivní satisfaction delta se skutečně zvýší attendance u dalších zápasů (`satisfactionAttendanceMul = 0.75 + sat/100 × 0.5`).

```sql
SELECT h.gamedate, h.satisfaction_after, h.attendance
FROM fans_match_history h
WHERE team_id = 'TEAMID'
ORDER BY h.gamedate;
```

**Očekávání**: Rostoucí trend satisfaction → rostoucí attendance (s šumem).

---

## T5 — MCP browser regression

### T5.1 Fans page happy path

1. Login jako testovací user
2. Navigate na `/dashboard/fans`
3. Screenshot — ověřit vizuál (Satisfaction card, Historie, Vstupné, Občerstvení panely)
4. Spustit GIF recording pro demonstraci:
   - Změna ticket price
   - Přepnutí external → self
   - Restock produktu
   - Změna quality tier

### T5.2 Stadium page

1. Navigate na `/dashboard/stadium`
2. Ověřit card „Občerstvení" s L0→L1 = **5 000 Kč** a popis „Pivní stan z bazaru"
3. Click na upgrade, potvrdit dialog, ověřit snížení budgetu

---

## T6 — Regression (pre-existing funkcionality)

Ověřit že se nerozbily existující funkce:

- ✅ `/dashboard/squad` — kádr se načítá
- ✅ `/dashboard/transfers` — nabídky fungují
- ✅ `/dashboard/watchlist` — watchlist funguje
- ✅ `/dashboard/finances` — transakce se zobrazují
- ✅ `/dashboard/stadium` — všechny facility upgrades (kromě rename)
- ✅ Zápas simulace — match-runner běží bez chyb

Spustit:
```bash
cd apps/web && npx next build --no-lint
cd apps/api && npx tsc --noEmit
```

Obojí musí projít bez chyb.

---

## Automation — curl smoke script

Sprint test všechno najednou:

```bash
#!/bin/bash
TEAM=TEAMID
API=https://api-test.prales.fun

echo "== Fans state =="
curl -s "$API/api/teams/$TEAM/fans" | python3 -m json.tool

echo "== History =="
curl -s "$API/api/teams/$TEAM/fans/history?limit=5" | python3 -m json.tool

echo "== Concession =="
curl -s "$API/api/teams/$TEAM/concession" | python3 -m json.tool

echo "== Recent transactions =="
curl -s "$API/api/teams/$TEAM/transactions?limit=10" | python3 -m json.tool

echo "== Budget =="
npx wrangler d1 execute prales-db-test --remote --json --command "SELECT name, budget FROM teams WHERE id = '$TEAM'"
```

---

## Acceptance criteria

Fáze 1 (rename) je hotová, pokud:
- [ ] Stadium card „Občerstvení" L1 ukazuje „Pivní stan z bazaru" a cenu 5 000 Kč
- [ ] L2 = „Karavan", L3 = „Hospůdka"

Fáze 2 (historie) je hotová, pokud:
- [ ] Po zápase se vloží nový řádek do `fans_match_history`
- [ ] GET `/fans/history?limit=20` vrací posledních 20 záznamů
- [ ] FE vykreslí sparkline + seznam s correct daty
- [ ] `satisfactionAfter` z nejnovějšího záznamu == hlavní satisfaction hodnota

Fáze 3 (rebalance) je hotová, pokud:
- [ ] External L1 dává ~300 Kč/týden (rep 50), ne 600
- [ ] Self mode pro obec (~150 diváků) přinese 2 000+ Kč/zápas
- [ ] Poměr self/external ~5–8× pro střední klub

Fáze 4 (ekonomika) je hotová, pokud:
- [ ] 20-týdenní simulace střední tým → budget delta v rozsahu +30–80k Kč
- [ ] Žádný tým nebankrotuje za normálních podmínek
- [ ] Self mode je konzistentně lepší než external pro obec+
