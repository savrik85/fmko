# Přehrání skutečné sezóny lokálně (real-game)

Srovnání dvou verzí zápasového enginu **skutečnou herní cestou**: ligová kola se hrají
přes produkční cron `0 16 * * *` → fronta `MATCH_QUEUE` → konzumer → `processLeagueRound`
→ `runScheduledMatches` (sestavy, trenér, vybavení, zaměstnanci, fanoušci, rozhodčí, počasí,
simulace, zápis výsledků, karty, zranění, finance…). Žádná ručně stavěná mužstva.

Vše běží jen lokálně nad kopií produkční zálohy. Žádná vzdálená DB, žádný deploy,
žádné odchozí HTTP (obal workeru každý `fetch` zablokuje a zapíše do logu).

## Jak to funguje

1. **Bundle**: `wrangler deploy --dry-run` sestaví `worker-entry.ts` (obal) + `apps/api/src/index.ts`
   zvolené verze kódu (`--code <worktree>`). Alias `@okresni-masina/shared` míří do stejného
   worktree. Nic se nenasazuje. Bundle se staví jednou na začátku, všechny průchody běží
   na stejném snímku kódu (hash je ve výsledku `meta.bundleHash`).
2. **Runtime**: Miniflare (workerd, totéž co `wrangler dev`) s bindingy D1, KV, R2 a frontami
   se stejným nastavením konzumera jako produkce. KV: `ai_provider=off`, `match_tick_mode=queue`
   (produkce běží ve frontovém režimu). Žádné secrets → Gemini, push, Suno jsou prázdné.
   `wrangler dev` se nepoužívá: jeho vývojářská proxy otevírá na každý D1 dotaz TCP spojení
   a jedno kolo vyčerpá lokální porty (EADDRNOTAVAIL, zamrzlé požadavky).
3. **Databáze**: čerstvá kopie `prod.sqlite` pro každý průchod. Aktuální sezóna všech lig
   (dospělí 26 kol, U21 13 kol) se vrátí do stavu před 1. kolem:
   - `season_calendar` → `scheduled`, `matches` → `scheduled` bez výsledků a událostí,
   - smažou se `match_player_stats`, `fans_match_history`, `concession_match_sales` těch zápasů,
   - smažou se auto-sestavy (`lineups.is_auto = 1`) — runner je vyrobí v okamžiku zápasu
     z tehdejšího kádru; ruční sestavy manažerů zůstávají,
   - `player_stats` aktivní sezóny od nuly (stopky za 4 žluté se počítají z nové sezóny),
   - zbývající pohárový zápas se odsune na rok 2099 (pohár se nepřehrává).
   Hráči, zranění, stopky, kondice, finance… zůstávají ze snímku produkce (9. 10. 2026).
4. **Časová osa**: kola se hrají v původních termínech (39 herních dnů, dospělí po/čt, U21 so).
   Před každým dnem harness udělá to, co by udělal noční tick, ale **jen pro dostupnost hráčů**
   (`/__harness/advance`): za každý uplynulý den smaže příznaky omluvenky a kocoviny, odečte
   den zranění (vyléčené smaže, rozehranost po zranění), regeneruje kondici stejným SQL jako
   `daily-tick.ts` a posune morálku k 45–55. Pak nastaví `teams.game_date` na den kola.
   Před 1. kolem se přidají 3 dny regenerace (`--warmup-days`). Trénink, přestupy, finance,
   hospoda atd. se **nespouštějí** — mezi koly se mění jen to, co engine sám způsobil
   (zranění, karty, kondice, morálka, sehranost, forma).
5. **Konec kola** se pozná z logu Miniflare (každá odbavená dávka fronty) a ověří se v DB
   (kola `simulated`, nic `lineup_locked`, přibyly záznamy v `queue_runs`).
   Na tomhle stroji (silný tlak na paměť) Miniflare občas přestane doručovat zprávy fronty,
   i když worker dál odpovídá. Když log `--stall-s` sekund (výchozí 45) stojí, harness worker
   restartuje nad stejnou DB a cron `0 16` pustí znovu — stejná sémantika „aspoň jednou“ jako
   na produkci: odehraná kola vrátí `no-round`, zbylá se dohrají; kolo zamčené uprostřed
   simulace dohraje recovery cron `20 16` (zámek se zestárne o hodinu). Restarty jsou ve výsledku
   (`restarts`) a ve výpisu `compare`.
6. Po průchodu se z DB vytáhnou zápasy aktuální sezóny a z logu chyby a varování.

## Příkazy

Spouštět z této složky (Node 22, skript si sám přidá `--experimental-sqlite`):

```bash
cd apps/api/scripts/engine-lab/real-game
S=/private/tmp/claude-501/-Users-savrik-Projects-fmko/4cefeb10-9ac8-4f37-b930-0d37308738a5/scratchpad

# starý engine (detached worktree na 3d1e351c)
node harness.mjs run --code $S/old-engine --label old --runs 3 --out $S/real-game/results-old.json

# nový engine (pracovní strom engine-roles, včetně neuložených změn)
node harness.mjs run --code /Users/savrik/Projects/fmko/.claude/worktrees/engine-roles \
  --label new --runs 3 --out $S/real-game/results-new.json

# srovnání (souhrn, ligy, tabulky po týmech, provoz)
node harness.mjs compare $S/real-game/results-old.json $S/real-game/results-new.json

# jeden tým podrobně (body po průchodech, Δ na zápas se směrodatnou chybou)
node harness.mjs compare $S/real-game/results-new.json $S/real-game/results-new-heavy.json --team "KMP Čkyně"

# sloučení víc běhů téhož kódu (hlídá shodný hash bundlu)
node harness.mjs merge $S/real-game/results-new-all.json $S/real-game/results-new.json $S/real-game/results-new-b.json

# statistika z libovolné hotové DB (např. skutečná sezóna na produkci)
node harness.mjs stats --db $S/prod.sqlite --label prod
```

Volby `run`:

| volba | význam | výchozí |
|---|---|---|
| `--code` | kořen worktree s verzí kódu | povinné |
| `--runs K` | počet průchodů sezónou (každý z čerstvé kopie) | 1 |
| `--out` | výsledný JSON | `scratchpad/real-game/results-<label>-<čas>.json` |
| `--label` | jméno běhu | název složky worktree |
| `--prod` | zdrojová SQLite (nikdy se nemění, kopíruje se) | `scratchpad/prod.sqlite` |
| `--work` | pracovní složka průchodů | `scratchpad/real-game/work` |
| `--extra-sql f.sql` | SQL nad kopií po resetu (kontrolní experimenty) | – |
| `--max-dates N` | jen prvních N herních dnů (rychlý test) | – |
| `--warmup-days` | dny regenerace před 1. kolem | 3 |
| `--tick-timeout-s` | strop na jeden herní den | 900 |
| `--stall-s` | po kolika sekundách ticha ve frontě restartovat worker | 45 |
| `--mode loop` | stará smyčka bez fronty (vynechá ČB, jen pro srovnání) | `queue` |
| `--keep-db` | ponechat DB průchodu (jinak se po vytěžení smaže) | – |

Jeden průchod (819 zápasů: 3 ligy dospělých × 182 + 3 ligy U21 × 91) trvá zhruba 4–8 minut.

## Výstup

JSON obsahuje `meta` (verze kódu, hash bundlu, neuložené soubory), `stats.totals`,
`stats.groups.{senior,u21}`, `stats.leagues[liga]`, `stats.tables[liga]` (průměrné body
na průchod, `ptsByPass`), `logs` (chyby/varování seskupené podle zprávy, zablokované fetche),
`timing` (čas na herní den, na kolo ligy z `queue_runs`, na průchod) a `matches`
(kompaktní záznam každého zápasu: skóre, góly s minutou/typem/postem střelce, karty,
zranění, držení míče) pro vlastní rozbory.

Post střelce: „na hřišti“ = slot ze sestavy (střídající hráč = jeho přirozený post),
„přirozený“ = post hráče. Typ gólu = `source` z události (`open_play`, `corner`, `cross`,
`penalty`, `freekick`, `counter`, `scramble`, …).

## Omezení

- Mezi koly se nehraje celý noční tick (trénink, přestupy, finance…), jen dostupnost hráčů.
  Kondice v den zápasu je proto spíš vyšší než na produkci (chybí únava z tréninku).
- Výsledky jsou náhodné (runner seeduje RNG i časem); srovnávat průměry přes víc průchodů.
- Body jednoho týmu za sezónu mají směrodatnou odchylku kolem 6–8 bodů; u jednotlivých
  týmů koukat na `compare --team` (Δ na zápas ± chyba), ne na jeden průchod.
