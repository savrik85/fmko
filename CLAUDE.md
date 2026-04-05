# CLAUDE.md — fmko (Prales) project guardrails

> **Tento soubor je povinný read** na začátku každé session. Obsahuje tvrdá pravidla,
> postupy a reference. Memory a hooky jsou druhá vrstva — toto je první.

---

## 🚨 TVRDÁ PRAVIDLA — PORUŠENÍ = ROZKOPANÉ KOULE

1. **NIKDY push/merge/deploy na `main` bez výslovného souhlasu.**
   - Výslovný souhlas = uživatel napsal "nasad na main", "dej na prod", "mergni", nebo podobné.
   - Všechno ostatní = testing branch.
   - Hook `block-main-push.sh` to technicky blokuje — neobcházet.

2. **NIKDY oprav bug bez investigace + schválení.**
   - Protokol: **reprodukuj → root cause → report → čekat na OK → fix**.
   - Použij subagent `bug-hunter` (read-only) pro systematickou analýzu.
   - Žádný "symptom fix". Žádný "asi by to mohlo být tohle".

3. **NIKDY prázdný catch** (`.catch(() => {})`, `.catch(() => null)`, `catch {}`).
   - Server: `logger.warn({ module: "xyz" }, "popis", e)` nebo `logger.error`
   - Client: `console.error("popis:", e)` nebo `console.warn`
   - Hook `check-empty-catch.sh` to detekuje a upozorní.

4. **NIKDY write operace na `prales-db-prod` bez souhlasu.**
   - Testovací DB: `prales-db-test`
   - Hook `block-prod-d1-write.sh` blokuje UPDATE/DELETE/INSERT/DROP/ALTER.

5. **NIKDY "zdá se že to funguje".**
   - Backend změna → curl test API endpointu + ověření výstupu
   - Frontend změna → MCP browser test (login, navigace, screenshot)
   - Hybrid → oboje
   - Použij slash command `/verify` pro checklist.

---

## 🚢 Deploy workflow

```
1. Implement on testing branch (git checkout testing)
2. Build locally: cd apps/web && npx next build --no-lint
3. Commit staged changes with descriptive message
4. git push origin testing
5. Wait ~90s: sleep 80 && gh run list --branch testing --limit 1 --json status,conclusion
6. Verify API: curl k ověření endpointu
7. Verify FE: MCP browser — login, navigace, screenshot
8. ✋ STOP — čekat na "nasad na main"
9. git checkout main && git merge testing --no-edit && git push origin main
10. Verify prod deploy (sleep + gh run)
```

Slash commands:
- `/ship-test` — kroky 1–7
- `/ship-prod` — kroky 9–10 (JEN po souhlasu)

---

## 🐛 Bug investigation protokol

```
1. Reprodukuj — curl API / MCP browser / DB query
2. Root cause — PROČ, ne jen CO
3. Related code — find_referencing_symbols, Grep
4. Impact — co dalšího se rozbije?
5. Report uživateli:
   ## Příčina
   ## Řešení (návrh)
   ## Dopad
6. ✋ STOP — čekat na schválení
7. Teprve pak implementuj + testuj
```

Pro tento workflow použij **subagent `bug-hunter`** — má read-only tools a vrací strukturovaný report.

---

## 🗄️ D1 query cheat sheet

**Escape hell řešen jednou provždy.**

### ✅ FUNKČNÍ vzor
```bash
# Single quotes wrapping --command, double quotes uvnitř
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT col FROM table WHERE x = "value"'
```

### ✅ JSON extract (`$.field`)
```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT json_extract(data, "$.field") FROM players WHERE team_id = "abc"'
```

### ✅ UPDATE s JSON
```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'UPDATE players SET life_context = json_set(life_context, "$.condition", 100) WHERE team_id = "abc"'
```

### ❌ NEPOUŽÍVAT
```bash
# Backslash escape ve double quotes — rozbité v bash
npx wrangler d1 execute prales-db-test --remote --json --command "SELECT json_extract(x, '\$.field')"

# Smíšené quotes — taky rozbité
npx wrangler d1 execute prales-db-test --remote --json --command "SELECT * FROM t WHERE x = 'value'"
```

**Pravidlo:** vnější `'`, vnitřní `"`. Nikdy backslash před `$`.

### Hromadné SQL soubory
Pokud je SQL složité, napiš do `/tmp/query.sql` a pak:
```bash
npx wrangler d1 execute prales-db-test --remote --file /tmp/query.sql
```

---

## ☁️ Cloudflare gotchas

### Cron triggers
- **Limit: 3 per account** (ne 5 jak tvrdí dokumentace)
- Produkce (`wrangler.toml` top level): 3 crony (0 3 *, 0 16 *, 5 16 *)
- Testing (`[env.testing.triggers]`): **MUSÍ BÝT** `crons = []` — jinak deploy selže
- Nikdy nepřidávat další cron bez odebrání jiného

### D1 migrace
- `wrangler d1 migrations apply` často selhává na existující tabulky
- Preferovat manuální: `npx wrangler d1 execute <db> --remote --command 'ALTER TABLE ...'`
- Prod: jen po výslovném souhlasu

### Deploy failures
- `cron triggers exceeded limit` → zkontrolovat `[env.testing.triggers]` crons = []
- `rows_read exceeded` → D1 query čte příliš dat, zoptimalizovat nebo index
- `FK constraint failed` → orphan data, postupně mazat reference přes všechny tabulky

---

## 🧪 Testing protocol (povinné pro každou změnu)

### Backend (API)
```bash
# Ověřit endpoint přímo
curl -s "https://api-test.prales.fun/api/teams/TEAMID/something" | python3 -m json.tool
```

### Frontend (FE)
```
1. mcp__claude-in-chrome__tabs_context_mcp (createIfEmpty: true)
2. mcp__claude-in-chrome__navigate → https://test.prales.fun/login
3. Login jako testovací uživatel
4. Navigate na upravenou stránku
5. Screenshot + verify visual
6. Klikatelný flow — happy path + 1 error case
```

### Obojí (hybrid)
Backend endpoint + FE stránka co ho používá → oboje ověřit.

**Nikdy netvrdit "funguje" bez verifikace.** Slash command `/verify` má checklist.

---

## 🧠 Memory reference

Všechny feedback a reference jsou v `~/.claude/projects/-Users-savrik-Projects-fmko/memory/`. Důležité:

- `feedback_testing_only.md` — absolutní zákaz main pushů
- `feedback_no_empty_catch.md` — žádné prázdné catches
- `feedback_test_before_claiming.md` — testovat před tvrzením
- `feedback_complete_testing.md` — API + MCP browser oboje
- `feedback_bug_investigation.md` — investigate před fix
- `feedback_approval_required.md` — žádný fix bez schválení
- `reference_d1_escape.md` — D1 query escape cheat sheet
- `reference_cloudflare_limits.md` — Cloudflare nástrahy
- `reference_wipe_script.md` — wipe DB skript

Plné memory index v `MEMORY.md`.

---

## 📂 Projekt struktura

```
fmko/
├── apps/
│   ├── api/  (Hono + D1 + Cloudflare Workers, testing+prod envs)
│   └── web/  (Next.js 15 + Cloudflare Pages)
├── packages/
│   ├── db/      (Drizzle schema)
│   ├── shared/  (sdílené typy)
│   └── ui/      (Tailwind komponenty)
├── scripts/
│   └── upload-seed.mjs
├── .claude/
│   ├── settings.json      (sdílené hooks config)
│   ├── settings.local.json (lokální permissions — allow-list)
│   ├── hooks/             (shell skripty pro hooks)
│   ├── commands/          (slash commands)
│   └── agents/            (custom subagents)
└── CLAUDE.md              (tento soubor)
```

**Branches:**
- `main` — produkce, auto-deploy na `*.prales.fun`
- `testing` — testovací, auto-deploy na `*-test.prales.fun`

**Deploy trvá ~90 sekund** po push, čekat s `sleep 80 && gh run list`.

---

## 🛑 Red flags — když nastanou, STOP a ptej se

- Uživatel zmiňuje production/prod/main → zkontrolovat branch
- Úkol zahrnuje mazání dat → dvojitý souhlas
- Nejasný scope úkolu → ptát se, ne hádat
- Pre-existing test selhává → není to moje chyba, reportovat
- "Prostě to oprav" bez kontextu → nejdřív investigate
- Uživatel vyjadřuje frustraci z chyby → poslouchat, ne překrývat

---

## 🎨 Design inspirace (`.claude/design-md/`)

Kolekce DESIGN.md z 54 populárních webů ([awesome-design-md](https://github.com/VoltAgent/awesome-design-md)). Každá složka obsahuje `DESIGN.md` s kompletním design systémem dané aplikace — barvy, typografie, spacing, komponenty, interaction patterns.

**Dostupné designy:**
airbnb, airtable, apple, bmw, cal, claude, clay, clickhouse, cohere, coinbase, composio, cursor, elevenlabs, expo, figma, framer, hashicorp, ibm, intercom, kraken, linear.app, lovable, minimax, mintlify, miro, mistral.ai, mongodb, notion, nvidia, ollama, opencode.ai, pinterest, posthog, raycast, replicate, resend, revolut, runwayml, sanity, sentry, spacex, spotify, stripe, supabase, superhuman, together.ai, uber, vercel, voltagent, warp, webflow, wise, x.ai, zapier

**Jak použít:**
- Před designováním UI: `Read .claude/design-md/<name>/DESIGN.md`
- Uživatel řekne "udělej to ve stylu Linear" → přečti `linear.app/DESIGN.md`
- Pro fmko (béžový/sport) jsou relevantní: Stripe, Notion, Superhuman, Raycast (minimalismus + typografie)

## ⚡ Quick reference

| Akce | Příkaz |
|------|--------|
| Spustit dev | `npm run dev` |
| Build web | `cd apps/web && npx next build --no-lint` |
| Typecheck | `npm run typecheck` |
| D1 test query | `npx wrangler d1 execute prales-db-test --remote --json --command '...'` |
| Deploy status | `gh run list --branch testing --limit 1 --json status,conclusion` |
| Wipe test data | `bash apps/api/scripts/wipe-game-data.sh` |
| Memory index | Read `~/.claude/projects/-Users-savrik-Projects-fmko/memory/MEMORY.md` |
