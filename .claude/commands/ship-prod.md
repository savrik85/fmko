---
description: Deploy testing branch to production (requires explicit user approval)
---

**⚠️ Tento workflow smíš spustit POUZE pokud uživatel výslovně řekl "nasad na main" / "dej na prod" / "mergni" apod. v aktuální konverzaci.**

## Prerekvizity — ověř všechny před pokračováním

1. **Explicitní souhlas** — uživatel v této session napsal:
   - "nasad na main" / "nasaďme na prod" / "dej to na main" / "mergni" / "produkce"
   - Pokud NE → **STOP** a zeptej se.

2. **Testing deploy je zelený:**
   ```bash
   gh run list --branch testing --limit 1 --json status,conclusion
   ```
   Musí být `status: completed, conclusion: success`.

3. **Verifikace proběhla** — uživatel musí mít potvrzeno že:
   - API je otestovaná (curl)
   - FE je otestovaná (MCP browser)
   Pokud nevíš, **ptej se**: "Testoval jsi na testu API i FE přes browser?"

4. **Žádné uncommitted změny:**
   ```bash
   git status --porcelain
   ```
   Musí být prázdné. Pokud ne, commit nejdřív do testing.

## Execute

```bash
git checkout main
git merge testing --no-edit
git push origin main
```

**Hook `block-main-push.sh` tohle zablokuje.** Pokud je to oprávněné (explicitní souhlas + všechny prerekvizity), dočasně povolit:
- Buď obejít hook (user action)
- Nebo říct uživateli: "Hook blokuje push. Je oprávněné obejít ho?"

## Po pushi

1. Čekat na deploy (~90s):
   ```bash
   sleep 80 && gh run list --branch main --limit 1 --json status,conclusion
   ```

2. Pokud fail → **PANIC MODE**:
   - `gh run view <id> --log-failed`
   - Report uživateli IHNED
   - Nenechávat rozbitou produkci

3. Pokud success → krátký report: "Deploy na produkci úspěšný. [popis změny] je live."

## Red flags — STOP a zeptej se

- Uživatel řekl jen "nasaď" bez upřesnění → ptej se "main nebo testing?"
- Testing nebyl testován → ptej se "ověřil jsi to na testu?"
- Jsi na main ale nemáš explicit souhlas → `git checkout testing`, ptej se