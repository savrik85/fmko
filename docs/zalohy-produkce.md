# Zálohy produkční databáze

**Zavedeno:** 2026-08-17

## Dvě vrstvy, každá řeší něco jiného

### 1. D1 Time Travel — už běží, nic se nenastavuje

Cloudflare D1 drží historii databáze a umí ji obnovit **k libovolné minutě za
posledních 30 dní** (Workers Paid; na Free 7 dní). Je to automatické a zdarma.

```bash
# Kam až lze jít zpět
npx wrangler d1 time-travel info prales-db-prod

# Obnova k času (POZOR: přepisuje databázi NA MÍSTĚ)
npx wrangler d1 time-travel restore prales-db-prod --timestamp <ISO8601>
```

**Tohle je první volba při „něco jsme rozbili".** Rychlé, přesné na minutu.

### 2. Export do R2 — pro to, co Time Travel neumí

Time Travel nepokrývá tři věci:

1. **Retenci nad 30 dní**
2. **Obnovu do JINÉ databáze** — restore přepisuje na místě a neumí klonovat,
   takže klon prod → test se bez exportu neobejde
3. **Smazání databáze jako takové**

Proto denní export do R2 bucketu `prales-backups`:

| Cesta | Obsah | Retence |
|---|---|---|
| `denni/prod-YYYY-MM-DD.sql.gz` | každý den 01:20 UTC | 35 dní (lifecycle pravidlo) |
| `mesicni/prod-YYYY-MM-DD.sql.gz` | první v měsíci | neomezeně |

Velikost: ~88 MB syrově, ~13 MB po gzipu. Náklad na R2 je v řádu haléřů měsíčně.

Čas 01:20 UTC je zvolený schválně — leží mimo všechny herní crony
(3, 5, 6, 10, 14, 16 UTC), takže export nečte databázi uprostřed ticku.

## ⚠️ Workflow musí být na `main`

`.github/workflows/backup-prod-db.yml` je zatím jen na větvi `testing`.
**Naplánovaná workflow v GitHub Actions běží výhradně z výchozí větve**, takže
dokud soubor nedorazí na `main`, zálohy se automaticky nespouštějí.

Do té doby zálohovat ručně (viz níž).

## Ruční záloha

```bash
cd apps/api
STAMP=$(date -u +%Y-%m-%d)
npx wrangler d1 export prales-db-prod --remote --output "/tmp/prod-$STAMP.sql"
gzip -9 -f "/tmp/prod-$STAMP.sql"
npx wrangler r2 object put "prales-backups/denni/prod-$STAMP.sql.gz" \
  --file "/tmp/prod-$STAMP.sql.gz" --remote
```

**Vždy ověřit, že to není pahýl** — prázdná záloha je horší než žádná, protože
se tváří jako pojistka:

```bash
npx wrangler r2 object get "prales-backups/denni/prod-$STAMP.sql.gz" \
  --file /tmp/overeni.gz --remote
gzip -t /tmp/overeni.gz && gunzip -c /tmp/overeni.gz | head -3
```

## Obnova ze zálohy

```bash
gunzip -c prod-YYYY-MM-DD.sql.gz > obnova.sql
npx wrangler d1 execute <cilova-db> --remote --file obnova.sql
```

Pro klon prod → test viz paměť `reference_db_clone`.

## Co je zálohované a co ne

| | Zálohováno |
|---|---|
| `prales-db-prod` | ✅ Time Travel 30 dní + denní export do R2 |
| `prales-db-test` | ❌ jen Time Travel — na testovacích datech nezáleží |
| KV (session, cache) | ❌ session jsou pomíjivé, cache se dopočítá |
| R2 `prales-seed` | ❌ hymny a maskoti; seed jde vygenerovat znovu |

## Historie

- **2026-08-17** — zavedeno. První ruční záloha produkce (88 MB / 13 MB gz)
  uložena a ověřena. Bucket `prales-backups` + lifecycle pravidlo `denni-35-dni`.
