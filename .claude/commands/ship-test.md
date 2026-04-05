---
description: Deploy current changes to testing environment with full verification
---

Provedeš tento workflow pro nasazení na testing environment:

1. **Ověř branch** — musí být `testing`:
   ```bash
   git branch --show-current
   ```
   Pokud ne, `git checkout testing`.

2. **Build lokálně** — chytne TypeScript chyby před pushem:
   ```bash
   cd apps/web && npx next build --no-lint
   ```
   Pokud fail → **STOP**, oprav chyby, neposílej na testing.

3. **Commit staged změn** s popisným messagem (co + proč). Použij heredoc pro formátování:
   ```bash
   git add <files> && git commit -m "$(cat <<'EOF'
   feat/fix: stručný popis

   Detail:
   - ...

   Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

4. **Push na testing**:
   ```bash
   git push origin testing
   ```

5. **Čekat na deploy** (~90 sekund):
   ```bash
   sleep 80 && gh run list --branch testing --limit 1 --json status,conclusion
   ```
   Pokud `status: in_progress`, počkat dalších 30s a znovu.

6. **Ověřit deploy success** — `conclusion: success`. Pokud `failure`, `gh run view <id> --log-failed` a report uživateli.

7. **Verifikace — API + FE** (použij `/verify`):
   - Backend změna → curl `https://api-test.prales.fun/...`
   - FE změna → MCP browser: login, navigate, screenshot

8. **STOP — čekat na souhlas** pro main deploy.
   - **NIKDY automaticky** `git checkout main` nebo `git merge`.
   - Uživatel musí výslovně říct "nasad na main" / "dej na prod" / "mergni".

**Red flag:** Pokud `git branch --show-current` vrátí `main`, okamžitě `git checkout testing` a pokračuj.