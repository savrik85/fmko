#!/bin/bash
# PostToolUse hook — detekuje prázdné catch bloky v nově edited/written souborech
# Injektuje warning do Claude kontextu (PostToolUse nemůže blokovat)

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE" ] && exit 0
[ ! -f "$FILE" ] && exit 0

# Jen TS/JS soubory
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac

# Tři varianty prázdných catch bloků:
# 1) .catch(() => {})
# 2) .catch(() => null) — stále prázdný z hlediska loggingu
# 3) catch (e) {} / catch {} — sync catch bez těla
MATCHES=$(grep -nE '\.catch\(\s*\(\s*[a-zA-Z_]*\s*\)\s*=>\s*\{\s*\}\s*\)|\.catch\(\s*\(\s*\)\s*=>\s*null\s*\)|catch\s*(\(\s*[a-zA-Z_]*\s*\))?\s*\{\s*\}' "$FILE" 2>/dev/null)

if [ -n "$MATCHES" ]; then
  MESSAGE="🚨 DETEKOVÁNY PRÁZDNÉ CATCH BLOKY v $FILE:

$MATCHES

PRAVIDLO (z memory feedback_no_empty_catch):
  • Server (apps/api): logger.warn({ module: \"xyz\" }, \"popis akce\", e)
  • Client (apps/web): console.error(\"popis akce:\", e)
  • Nikdy .catch(() => {}), .catch(() => null), catch {}

MUSÍŠ opravit tyto bloky před dokončením úkolu."

  jq -n --arg msg "$MESSAGE" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: $msg
    }
  }'
fi

exit 0