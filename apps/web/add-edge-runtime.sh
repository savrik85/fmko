#!/bin/bash
# Přidá `export const runtime = "edge"` všem dynamickým klientským stránkám.
#
# next-on-pages to u dynamických rout vyžaduje, ale v lokálním dev serveru to
# překáží — proto se to nepíše do zdrojáku a doplňuje se až při buildu pro Pages.
#
# Dřív tu byl ručně psaný seznam souborů. To znamenalo, že každá nová stránka
# s parametrem v cestě shodila deploy až v CI, a to hláškou, kterou musel někdo
# přeložit zpátky na „zapomněls doplnit skript". Teď se hledají samy: klientská
# komponenta pod složkou s [parametrem] je přesně ta množina, kterou to potřebuje.
set -euo pipefail

pocet=0
while IFS= read -r f; do
  # Jen klientské komponenty — server komponenty edge runtime nepotřebují.
  head -1 "$f" | grep -q '"use client"' || continue
  # Idempotence: druhý běh nesmí export přidat podruhé.
  grep -q '^export const runtime = "edge";' "$f" && continue
  # Bez `sed -i` — jeho syntaxe pro vložení řádku se na macOS a Linuxu liší
  # a skript musí jít spustit i lokálně, ne jen v CI.
  { head -1 "$f"; echo 'export const runtime = "edge";'; tail -n +2 "$f"; } > "$f.tmp"
  mv "$f.tmp" "$f"
  echo "  + $f"
  pocet=$((pocet + 1))
done < <(find src/app -path '*[[]*[]]*' -name 'page.tsx' | sort)

echo "edge runtime doplněn u $pocet stránek"
