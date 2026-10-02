#!/bin/bash
# Blokuje zápis na produkční D1. Pouští jen přidávací migrace:
#   ALTER TABLE ... ADD COLUMN, CREATE TABLE, CREATE [UNIQUE] INDEX
# Všechno ostatní (UPDATE, DELETE, INSERT, DROP, ALTER ... DROP/RENAME, TRUNCATE) dál blokuje.
# Kontroluje SQL v --command i obsah souboru z --file.
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0
echo "$CMD" | grep -qE 'wrangler[[:space:]]+d1[[:space:]]+execute[[:space:]]+prales-db-prod' || exit 0

SQL="$CMD"
FILE=$(echo "$CMD" | grep -oE -- '--file[= ]+[^ ]+' | head -1 | sed -E 's/--file[= ]+//; s/^["'\'']//; s/["'\'']$//')
if [ -n "$FILE" ]; then
  CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
  CD_DIR=$(echo "$CMD" | grep -oE '^cd[[:space:]]+[^&;]+' | sed -E 's/^cd[[:space:]]+//; s/[[:space:]]+$//')
  for base in "" "$CD_DIR/" "$CWD/" "$CWD/$CD_DIR/"; do
    if [ -f "$base$FILE" ]; then SQL=$(cat "$base$FILE"); break; fi
  done
  if [ "$SQL" = "$CMD" ]; then
    echo "🚨 BLOCKED: SQL soubor '$FILE' pro produkční D1 nejde přečíst, nelze ověřit, že je bezpečný." >&2
    exit 2
  fi
fi

# Komentáře (--) mazat jen ze souboru: v --command by uřízly příkaz od "--remote" dál.
# Kontrola v perlu, protože macOS sed nezná příznak I a při chybě by vrátil prázdno (= pustit vše).
if [ -n "$FILE" ]; then SQL=$(echo "$SQL" | perl -pe 's/--.*$//'); fi
CLEAN=$(echo "$SQL" | perl -0pe 's/ALTER\s+TABLE\s+[\w"`]+\s+ADD\s+(COLUMN\s+)?/SAFE_ADD /gi; s/CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)/SAFE_CREATE/gi') || {
  echo "🚨 BLOCKED: SQL pro produkční D1 nejde zkontrolovat." >&2
  exit 2
}

if echo "$CLEAN" | perl -ne 'BEGIN{$f=0} $f=1 if /(^|[^\w])(UPDATE|DELETE|INSERT|REPLACE|DROP|ALTER|TRUNCATE)\s/i; END{exit($f?0:1)}'; then
  echo "🚨 BLOCKED: Write operace na produkční D1 (povolené jsou jen ALTER TABLE ... ADD COLUMN a CREATE TABLE/INDEX)." >&2
  exit 2
fi
exit 0
