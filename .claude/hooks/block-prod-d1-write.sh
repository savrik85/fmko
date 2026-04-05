#!/bin/bash
# Hard block — write operace (UPDATE/DELETE/INSERT/DROP/ALTER/TRUNCATE)
# cílící na produkční D1 databázi (prales-db-prod)

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

[ -z "$CMD" ] && exit 0

# Match wrangler d1 execute na prod DB s write SQL
if echo "$CMD" | grep -qE 'wrangler[[:space:]]+d1[[:space:]]+execute[[:space:]]+prales-db-prod'; then
  # Případ 1: přímo v commandu je destructive SQL
  if echo "$CMD" | grep -qiE '(UPDATE|DELETE|INSERT|DROP|ALTER|TRUNCATE|REPLACE)[[:space:]]'; then
    cat >&2 <<'EOF'
🚨 BLOCKED: Write operace (UPDATE/DELETE/INSERT/DROP/ALTER/TRUNCATE) na produkční D1 databázi.

Produkční DB: prales-db-prod
Testovací DB: prales-db-test

Pokud operace je nezbytná:
  1. Nejprve otestuj na prales-db-test
  2. Požádej uživatele o výslovný souhlas pro prod
  3. Zdůvodni proč se to nedá udělat jinak (migrace, auto-fix...)

Pokud je to SELECT query (read-only), hook by neměl být trigger — zkontroluj grep pattern.
EOF
    exit 2
  fi
fi

exit 0