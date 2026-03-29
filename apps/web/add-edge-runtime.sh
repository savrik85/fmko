#!/bin/bash
# Add edge runtime to all dynamic client component pages for Cloudflare Pages build
# This is needed because next-on-pages requires edge runtime on dynamic routes
# but it breaks local dev server

for f in \
  "src/app/dashboard/match/[id]/replay/page.tsx" \
  "src/app/dashboard/match/[id]/page.tsx" \
  "src/app/dashboard/manager/[id]/page.tsx" \
  "src/app/dashboard/team/[id]/page.tsx" \
  "src/app/dashboard/phone/[id]/page.tsx" \
  "src/app/dashboard/player/[id]/page.tsx" \
  "src/app/match-day/[id]/page.tsx"; do
  if [ -f "$f" ] && head -1 "$f" | grep -q '"use client"'; then
    sed -i '1 a\export const runtime = "edge";' "$f"
  fi
done
