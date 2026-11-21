#!/bin/bash
# Hard block: ruční nasazení na produkci mimo CI (wrangler deploy / pages deploy / rollback).
# Na prod se nasazuje jen pushem na main přes CI. 2026-11-21 jsem bez souhlasu nasadil
# API i web ručně, když CI padalo na Miniflare. Testing (--env testing, prales-web-test) projde.
# Exit 2 = zablokuje Bash tool, stderr jde do Claude kontextu.

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

[ -z "$CMD" ] && exit 0
echo "$CMD" | grep -q 'wrangler' || exit 0

block() {
  cat >&2 <<EOF
🚨 BLOCKED: ruční nasazení na produkci ($1).

PRAVIDLO: na prod se nasazuje JEN přes CI (push na main po souhlasu).
Ani spadlé nebo pomalé CI ani spěch uživatele ruční nasazení nepovolují.
Když CI padá: zopakovat spadlou část (gh run rerun <id> --failed), říct stav a čekat.
Ruční nasazení jen navrhnout. Provést jen po výslovném „nasaď ručně“ od uživatele,
a to tak, že ho pustí on sám přes ! v promptu.
EOF
  exit 2
}

# Suché běhy nic nenasadí.
echo "$CMD" | grep -qE -- '--dry-run' && exit 0

testing_env='(--env[[:space:]=]+testing|-e[[:space:]]+testing)([[:space:]]|$)'

# wrangler deploy / versions deploy / rollback bez --env testing = prales-api na produkci
if echo "$CMD" | grep -qE 'wrangler[[:space:]]+(deploy|versions[[:space:]]+deploy|rollback)([[:space:]]|$)'; then
  echo "$CMD" | grep -qE "$testing_env" || block "wrangler deploy bez --env testing"
fi

# wrangler pages deploy mimo testovací projekt = prales-web na produkci
if echo "$CMD" | grep -qE 'wrangler[[:space:]]+pages[[:space:]]+deploy'; then
  echo "$CMD" | grep -qE -- '--project-name[[:space:]=]+prales-web-test([[:space:]]|$)' || block "pages deploy mimo prales-web-test"
fi

exit 0
