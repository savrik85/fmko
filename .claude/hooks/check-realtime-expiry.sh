#!/bin/bash
# PostToolUse hook — detekuje expiraci počítanou z REÁLNÉHO času.
#
# Herní datum není reálné datum: game_clock.offset_days ho posouvá dopředu
# (v testu to bylo 49 dní). Když se expires_at spočítá z new Date(), ale
# porovnává se s herním datem, nabídka vyprší dřív, než ji hráč uvidí.
# Přesně to potkalo petice obce — 47 jich skončilo "bez odezvy" a ani jedna
# nebyla splnitelná.
#
# Správně: gameExpiry(gameDate, N) a isGameExpired(expiresAt, gameDate)
# z apps/api/src/lib/game-time.ts

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE" ] && exit 0
[ ! -f "$FILE" ] && exit 0

# Jen serverový TypeScript — herní čas je záležitost API.
case "$FILE" in
  */apps/api/src/*.ts) ;;
  *) exit 0 ;;
esac

# Samotný helper má new Date() legitimně.
case "$FILE" in
  */lib/game-time.ts) exit 0 ;;
esac

# Hledáme new Date() v okolí (±3 řádky) zmínky o expiraci.
MATCHES=$(grep -nE -B3 -A3 'expires_at|expiresAt' "$FILE" 2>/dev/null \
  | grep -E 'new Date\(\s*\)|\.setDate\(' \
  | head -10)

if [ -n "$MATCHES" ]; then
  MESSAGE="⏰ MOŽNÁ EXPIRACE V REÁLNÉM ČASE v $FILE:

$MATCHES

Herní čas != reálný čas (game_clock.offset_days). Pokud jde o expiraci nabídky,
petice, brigády nebo investice, použij helpery z apps/api/src/lib/game-time.ts:

  • gameExpiry(gameDate, dny)            — místo new Date() + setDate()
  • isGameExpired(expiresAt, gameDate)   — místo new Date(x) < new Date()

Pokud jde jen o created_at nebo jiný audit timestamp, reálný čas je správně
a tohle varování ignoruj."

  jq -n --arg msg "$MESSAGE" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: $msg
    }
  }'
fi

exit 0
