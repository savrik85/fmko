# Guardrails & Pravidla projektu fmko

## 🚨 ZÁKLADNÍ PRAVIDLA G障碍 (PŘÍSNĚ ZÁVAZNÁ)

1. **NIKDY neprovádět push / merge / deploy na větev `main` bez předchozího výslovného souhlasu uživatele.**
   - Výslovný souhlas = uživatel přímo napsal „nasaď na main“, „dej na main“, „mergni do main“ nebo obdobný jednoznačný příkaz.
   - Všechny úpravy a mezikroky patří výhradně do větve `testing` (případně testováno lokálně).
   - Nikdy nedělat push na `main` preventivně, automaticky ani souběžně s testem.

2. **Deploy na testing:**
   - Na větev `testing` se pushuje pouze pro testování po dokončení úpravy nebo na pokyn uživatele („hoď na test“).

3. **Deploy workflow:**
   - Krok 1: Vývoj a ověření na `testing` / lokálně (`localhost:3002`).
   - Krok 2: Push na `testing` (pokud uživatel žádá o test).
   - Krok 3: **ČEKAT na výslovný příkaz uživatele pro nasazení do produkce (`main`).**
   - Krok 4: Teprve po příkazu sloučit a pushnout do `main`.
