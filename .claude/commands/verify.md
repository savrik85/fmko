---
description: Complete verification protocol — API test + MCP browser test
---

**Pravidlo: "zdá se že to funguje" NENÍ verifikace.**

Pro aktuálně implementovanou feature/fix proveď tento checklist:

## 1. API test (backend changes)

Pokud jsi měnil API endpoint (apps/api/src/routes/*):

```bash
# Najdi endpoint + curl ho s expected inputem
curl -s "https://api-test.prales.fun/api/teams/<teamId>/<endpoint>" | python3 -m json.tool
```

Assertions:
- HTTP status (200/201 pro success, 4xx pro error cases)
- Klíčová pole v response (id, name, expected values)
- Edge case: prázdná odpověď, 404, error response

Dokumentuj v reportu:
```
✅ GET /api/teams/:id/xyz → 200, returned {...}
❌ POST /api/teams/:id/xyz → expected 201, got 500 — FAIL
```

## 2. MCP browser test (FE changes)

Pokud jsi měnil frontend (apps/web/src/app/**):

```
1. mcp__claude-in-chrome__tabs_context_mcp (createIfEmpty: true)
2. mcp__claude-in-chrome__navigate → https://test.prales.fun/login
3. Login jako testovací uživatel (např. mobile-test@test.cz / MobileTest123)
4. Navigate na upravenou stránku
5. mcp__claude-in-chrome__read_page (filter: interactive)
6. Screenshot — ověřit visual
7. Click-through happy path (hlavní akce funguje)
8. Click-through error case (invalidní input → správná chyba)
```

Pokud UI má mobile variant, resize window na 400x800 a projít znovu.

## 3. DB verifikace (pokud jsi měnil data)

```bash
npx wrangler d1 execute prales-db-test --remote --json --command 'SELECT * FROM <table> WHERE ... LIMIT 5'
```

Ověř že data jsou v očekávaném stavu po akci.

## 4. Report

Napiš stručný report:

```
### Backend
✅ POST /api/... → 201 (created)
✅ GET /api/... → 200, správný formát

### Frontend
✅ /dashboard/xxx → render OK (screenshot)
✅ Happy path: login → click → save → success message
✅ Error path: invalid input → error shown

### DB
✅ SELECT z table → 3 řádky, všechny s očekávanými hodnotami
```

## 5. Když něco nefunguje

**NEOPRAVUJ ROVNOU.** Místo toho:
1. Reportuj bug uživateli
2. Popiš co jsi očekával vs co dostal
3. Navrhni root cause (pokud zřejmý)
4. **Čekej na povolení fixnout** nebo použij subagent `bug-hunter`
