#!/bin/bash
# Warning (ne block) — curl/HTTP požadavek na produkční API

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

[ -z "$CMD" ] && exit 0

# Match curl/wget/http na api.prales.fun (ne api-test.prales.fun)
if echo "$CMD" | grep -qE '(curl|wget|http)[[:space:]].*[^-]api\.prales\.fun'; then
  echo "⚠️  WARN: Požadavek cílí na PRODUKČNÍ API (api.prales.fun)." >&2
  echo "    Testovací API je api-test.prales.fun." >&2
  echo "    Pokud je to zamýšlené (debug prod), pokračuj. Jinak uprav URL." >&2
  # Exit 0 — jen warning, neblokujeme
fi

exit 0