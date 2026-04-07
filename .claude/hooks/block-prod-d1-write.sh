#!/bin/bash
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0
if echo "$CMD" | grep -qE 'wrangler[[:space:]]+d1[[:space:]]+execute[[:space:]]+prales-db-prod'; then
  if echo "$CMD" | grep -qiE '(UPDATE|DELETE|INSERT|DROP|ALTER|TRUNCATE)[[:space:]]'; then
    echo "🚨 BLOCKED: Write operace na produkční D1." >&2
    exit 2
  fi
fi
exit 0
