# Runbook: nasazení front na produkci

**Stav:** připraveno, NEPROVEDENO. Čeká na dokončení sledování na testingu.
**Předpoklad:** `docs/analyza-fronty-2026-08-16.md` kapitoly 9 a 10.

> Tenhle dokument existuje proto, že nasazení má nevratné kroky (prod migrace)
> a dělá se jednou. Improvizovat u toho je zbytečné riziko.

---

## 0. Vstupní podmínky — bez nich se nezačíná

Splněno musí být VŠECHNO:

- [ ] Sledování na testingu běželo **minimálně 3 dny** a pokrylo aspoň jedno **pondělí**
      (týdenní finance + kabina = nejtěžší den).
- [ ] `GET /api/admin/health` na testingu má verdikt `ok`
      (osiřelé ligy jsou známý testovací artefakt, ty nevadí).
- [ ] `queue_failures` prázdné, žádný běh s `attempts > 1`.
- [ ] Nedohraná splatná kola **neroste** den po dni.
- [ ] Herní den se posunul přesně 1× denně.
- [ ] Výslovné „nasaď na main" od uživatele.

---

## 1. Záloha produkce — PRVNÍ krok, nevynechávat

```bash
mkdir -p backups
npx wrangler d1 export prales-db-prod --remote \
  --output backups/prales-db-prod-pred-frontami-$(date +%Y-%m-%d).sql
ls -lh backups/prales-db-prod-pred-frontami-*.sql   # musí mít desítky MB
```

Bez ověřené velikosti souboru se nepokračuje.

---

## 2. Vytvořit produkční fronty

Fronty už na účtu **existují** (založené 2026-08-16), takže tenhle krok je
jen kontrola:

```bash
npx wrangler queues list | grep -E "prales-(match-rounds|reports|match-dlq|reports-dlq)$"
```

Musí být vidět čtyři: `prales-match-rounds`, `prales-reports`,
`prales-match-dlq`, `prales-reports-dlq`. Kdyby chyběly:

```bash
for q in prales-match-rounds prales-reports prales-match-dlq prales-reports-dlq; do
  npx wrangler queues create "$q"
done
```

---

## 3. Migrace na produkční DB

**Pořadí je závazné.** Aplikovat po jedné a po každé ověřit.

```bash
for m in 0146_queue_failures 0147_team_day_log 0148_queue_runs 0149_queue_runs_phases; do
  echo "── $m"
  npx wrangler d1 execute prales-db-prod --remote --file apps/api/migrations/$m.sql
done
```

Ověření:

```bash
npx wrangler d1 execute prales-db-prod --remote --json --command \
 'SELECT name FROM sqlite_master WHERE type="table" AND name IN ("queue_failures","team_day_log","queue_runs")'
npx wrangler d1 execute prales-db-prod --remote --json --command \
 'SELECT COUNT(*) AS n FROM pragma_table_info("queue_runs") WHERE name = "phases"'
```

Musí vrátit tři tabulky a `n = 1`.

**Proč to musí předcházet deployi:** denní tick uklízí `team_day_log` v OBOU
režimech. Bez migrace to spadne do `catch` a jen zaloguje varování — nic se
nerozbije, ale je to špína, kterou není důvod pouštět na produkci.

---

## 4. Merge na main

```bash
git checkout main
git merge testing --no-edit
git push origin main          # hook blokuje — viz reference_main_push_bypass
```

Po pushi počkat na CI:

```bash
sleep 80 && gh run list --branch main --limit 1 --json status,conclusion
```

---

## 5. Ověřit, že produkce jede DÁL PO STARÉM

Tohle je pointa celého postupu: po nasazení se **nesmí nic změnit**.

```bash
curl -s -H "Authorization: Bearer $TOKEN" https://api.prales.fun/api/admin/queue/mode
# očekáváno: {"mode":"loop", "matchQueueBound":true, "reportsQueueBound":true}

curl -s -H "Authorization: Bearer $TOKEN" https://api.prales.fun/api/admin/ai-provider
# očekáváno: {"provider":"gemini"}
```

Prod KV nemá klíče `match_tick_mode` ani `ai_provider`, takže defaulty drží
staré chování. Kód front je nasazený, ale **spí**.

Nechat běžet **aspoň jeden celý herní den** a ověřit, že zápasový tick i denní
tick fungují jako dřív (`GET /api/admin/health` → `ok`).

---

## 6. Teprve pak přepnout na fronty

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "https://api.prales.fun/api/admin/queue/mode?mode=queue"
```

Sledovat první zápasový tick (18:00 SELČ = 16:00 UTC):

```bash
curl -s -H "Authorization: Bearer $TOKEN" https://api.prales.fun/api/admin/health
curl -s -H "Authorization: Bearer $TOKEN" "https://api.prales.fun/api/admin/queue/runs?limit=20"
```

**Rollback = jeden příkaz, bez deploye:**

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "https://api.prales.fun/api/admin/queue/mode?mode=loop"
```

---

## 7. Co NEDĚLAT na produkci

- ❌ **Nepřepínat `ai_provider` na `workers-ai`.** Kvalita češtiny je dobrá na test,
  ne na produkci (viz kapitola 10.4 analýzy). Produkce zůstává na Gemini.
- ❌ **Nemazat vyloučení Českých Budějovic** dřív, než frontový režim na produkci
  odběhne aspoň týden. V režimu `loop` je pořád potřeba.
- ❌ **Nezvyšovat `max_concurrency`** hned. Nejdřív změřit, co produkční D1 unese
  (`GET /api/admin/queue/runs` → sledovat, jestli `duration_ms` neroste).

---

## 8. Známá omezení, se kterými se nasazuje

| Věc | Stav |
|---|---|
| Propustnost ticku | `počet_lig × ~5 min / max_concurrency` — fronta odstranila selhání, ne dobu běhu |
| ~2000 dotazů na kolo | 94 % v simulaci zápasu, ~40 ms na dotaz = latence D1. Řeší `db.batch()`, samostatný tiket |
| `matchday_preview` přes frontu | konzumer neověřen — žádná liga neměla kolo přesně na aktuální herní den |
| Zátěž na 20+ ligách | neověřeno, konzistence měřena přes 6 lig |
| Stará cesta `loop` | zůstává v kódu jako rollback; smazat až po týdnu na produkci (fáze 2) |
