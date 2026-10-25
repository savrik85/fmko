# Srovnání modelů AI trenéra (ai-coach-bench)

Měření, podle kterého se vybírá `COACH_MODEL` v `apps/api/src/ai-coach/llm.ts`.
Výsledky a závěr: `docs/ai-coach-model-eval-2026-10-25.md`.

Běží jen lokálně nad **kopií** produkční zálohy (sqlite). Na vzdálenou databázi nesahá.
Modely se volají přes REST API Workers AI účtu (stejný model i vstup jako binding `env.AI`
ve workeru). Lokální proxy z `getPlatformProxy` u volání delších než minuta padala
(„fetch failed"), REST ne. Platí to startupové kredity, cena tu nehraje roli.

## Příprava

```bash
# kopie produkce (zálohy jsou v backups/, mimo git)
sqlite3 /tmp/prod.sqlite < backups/prod-pred-0275-20261025.sql
export BENCH_DB=/tmp/prod.sqlite
export CLOUDFLARE_ACCOUNT_ID=…   # npx wrangler whoami
export CLOUDFLARE_API_TOKEN=…    # token s právem Workers AI

cd apps/api/scripts/ai-coach-bench
for f in match-bench weekly-bench sim-score; do
  npx esbuild $f.ts --bundle --platform=node --format=esm --outfile=$f.mjs \
    --external:node:sqlite "--external:cloudflare:*" \
    --alias:@okresni-masina/shared=../../../../packages/shared/src/index.ts
done
```

## Běh

```bash
# 1) rozhodnutí před zápasem: liga, pohár a přátelák všech AI klubů (model#síla úvahy)
node --experimental-sqlite match-bench.mjs "@cf/openai/gpt-oss-120b#high,@cf/meta/llama-4-scout-17b-16e-instruct" 28 match.json 4 300000
# 2) kvalita rozhodnutí skutečným enginem: stejné zápasy se stejnými semínky proti stejné sestavě soupeře
node --experimental-sqlite sim-score.mjs match.json match-contexts.json 300
# 3) pondělní správa klubu (nic se neprovede, jen se rozhodne a naplánuje)
node --experimental-sqlite weekly-bench.mjs "@cf/openai/gpt-oss-120b#high" weekly.json 2 300000
# 4) tabulky do dokumentu
python3 analyze.py match match.json match-sim.json
python3 analyze.py weekly weekly.json
```

`weekly-bench` nejdřív v kopii doplní AI klubům stadion, vybavení a povahu trenéra
(`completeAiClub`), jako to bude po nasazení. Proto kopii po něm nepoužívat k ničemu jinému.
