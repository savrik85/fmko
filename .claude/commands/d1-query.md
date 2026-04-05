---
description: Run a Cloudflare D1 query with proper escaping (defaults to testing DB)
---

**Escape hell vyřešen jednou provždy.**

## Pravidlo #1: vnější `'`, vnitřní `"`

```bash
# ✅ SPRÁVNĚ
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT col FROM table WHERE id = "abc"'
```

```bash
# ❌ ŠPATNĚ — bash rozbije string
npx wrangler d1 execute prales-db-test --remote --json --command "SELECT col FROM table WHERE id = 'abc'"
```

## JSON extract (`$.field`)

Bash interpretuje `$` uvnitř `"..."`. Vnitřní double-quotes + vnější single-quotes tento problém vyřeší:

```bash
# ✅ SPRÁVNĚ
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT json_extract(life_context, "$.condition") FROM players'

# ❌ ŠPATNĚ — backslash escape nefunguje
npx wrangler d1 execute prales-db-test --remote --json --command "SELECT json_extract(life_context, '\$.condition')"
```

## Běžné patterny

### SELECT s WHERE string
```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT * FROM players WHERE team_id = "abc-123"'
```

### UPDATE s JSON field
```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'UPDATE players SET life_context = json_set(life_context, "$.condition", 100) WHERE team_id = "abc"'
```

### JOIN s aggregací
```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT t.name, COUNT(p.id) as cnt FROM teams t JOIN players p ON p.team_id = t.id GROUP BY t.id'
```

### COUNT s JSON filter
```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT COUNT(*) FROM players WHERE json_extract(life_context, "$.condition") < 30'
```

## Složité SQL → soubor

Pokud SQL obsahuje speciální znaky nebo je na víc řádků, **napiš do souboru** a použij `--file`:

```bash
cat > /tmp/query.sql << 'EOF'
UPDATE players SET life_context = json_set(
  life_context,
  '$.condition', 100,
  '$.morale', 70
) WHERE team_id IN (
  SELECT id FROM teams WHERE district = 'Prachatice'
);
EOF

npx wrangler d1 execute prales-db-test --remote --file /tmp/query.sql
```

Heredoc `<< 'EOF'` (s quotes) zachová `$` bez interpretace.

## Výstup parse v Pythonu

Pro čitelný výstup z `--json`:

```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT * FROM x LIMIT 5' 2>&1 | python3 -c "
import sys, json
d = json.load(sys.stdin)
for r in d[0]['results']:
    print(r)
" 2>/dev/null
```

## Databáze — nezapomenout

- **Test:** `prales-db-test`
- **Prod:** `prales-db-prod` — **HOOK BLOKUJE** write operace (UPDATE/DELETE/INSERT/DROP/ALTER)
- Pokud potřebuješ prod WRITE, ptej se uživatele.

## Databáze schema lookup

```bash
# Všechny tabulky
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT name FROM sqlite_master WHERE type = "table"'

# Columns jedné tabulky
npx wrangler d1 execute prales-db-test --remote --json --command 'PRAGMA table_info(players)'
```

## User zadá: $ARGUMENTS

Proveď query s výše uvedenými pravidly.
