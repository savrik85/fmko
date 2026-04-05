#!/bin/bash
# UserPromptSubmit hook — injektuje git kontext do Claude promptu
# Hlavní účel: varovat Claude když je na main branch

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

BRANCH=$(git branch --show-current 2>/dev/null)
[ -z "$BRANCH" ] && exit 0

if [ "$BRANCH" = "main" ]; then
  DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

  MESSAGE="🚨 POZOR: Aktuální git branch je MAIN ($DIRTY unstaged změn).

Pokud budeš provádět jakékoli změny kódu:
  1. NEJDŘÍV přepni: git checkout testing
  2. Pak teprve edituj/commituj/pushuj
  3. Main je JEN pro finální deploy po souhlasu uživatele

Pokud uživatel explicitně žádá něco na main (např. 'nasad na main'), pokračuj."

  jq -n --arg msg "$MESSAGE" '{
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: $msg
    }
  }'
fi

exit 0