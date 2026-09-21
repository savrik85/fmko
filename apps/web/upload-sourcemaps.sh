#!/bin/bash
# Nahraje source mapy do PostHogu a smaže je z výstupu pro Cloudflare Pages.
#
# Spouští se v CI mezi buildem (next-on-pages) a deployem. Bez map ukazuje
# Error Tracking jen minifikovaný kód typu `f4bee63f-….js:1:21782`.
#
# `sourcemap process` do každého chunku vloží chunk ID, podle kterého PostHog
# k chybě najde správnou mapu. Proto musí proběhnout PŘED deployem, na webu
# musí běžet už upravené soubory.
#
# Mapy se mažou vždy, i když se nenahrávaly: na veřejném webu by byl vidět
# celý zdrojový kód.
set -euo pipefail

vystup=.vercel/output/static/_next/static

if [ -n "${POSTHOG_CLI_API_KEY:-}" ]; then
  # Výpadek PostHogu nesmí zablokovat deploy hry, chyba ale musí být vidět v Actions.
  if ! npx -y @posthog/cli@0.18.3 --host https://eu.posthog.com sourcemap process \
    --directory "$vystup" \
    --release-name prales-web \
    --release-version "${GITHUB_SHA:-lokal}" \
    --delete-after; then
    echo "::warning::Nahrání source map do PostHogu selhalo, chyby budou bez čitelného stacku"
  fi
else
  echo "::warning::POSTHOG_CLI_API_KEY chybí, source mapy se do PostHogu nenahrály"
fi

smazano=$(find "$vystup" -name '*.map' -print -delete | wc -l | tr -d ' ')
echo "source mapy: smazáno $smazano souborů, které ve výstupu zůstaly"
