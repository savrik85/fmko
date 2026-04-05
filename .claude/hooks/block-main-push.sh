#!/bin/bash
# Hard block — push/merge/reset operace cílící na main branch
# Exit 2 = zablokuje Bash tool, stderr jde do Claude kontextu

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

[ -z "$CMD" ] && exit 0

# Match nebezpečných operací na main
# - git push origin main / git push main
# - git push --force s main
# - git checkout main && git merge ... (implicit deploy)
# - git push -u origin main
# - git reset --hard origin/main (může ztratit práci, ale ne přímo push; necháváme)
if echo "$CMD" | grep -qE '(^|[[:space:];&|])git[[:space:]]+push[[:space:]]+(-[a-zA-Z]+[[:space:]]+)*(origin[[:space:]]+)?main([[:space:]]|$)'; then
  cat >&2 <<'EOF'
🚨 BLOCKED: Pokus o push do main bez výslovného souhlasu.

PRAVIDLO: Všechno jde nejdřív na testing branch.
Na main POUZE když uživatel výslovně napsal "nasad na main", "dej na prod", "mergni" apod.

Správný postup:
  1. git checkout testing
  2. git push origin testing
  3. Ověřit deploy + testovat
  4. Čekat na souhlas uživatele
  5. Pak git checkout main && git merge testing

Pokud je push oprávněný, POŽÁDEJ UŽIVATELE O POTVRZENÍ a dočasně obejdi hook.
EOF
  exit 2
fi

# Block force push to main
if echo "$CMD" | grep -qE 'git[[:space:]]+push[[:space:]]+(--force|-f)[[:space:]].*main'; then
  echo "🚨 BLOCKED: Force push na main je zakázán za všech okolností." >&2
  exit 2
fi

exit 0