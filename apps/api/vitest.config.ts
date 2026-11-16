import { defineConfig } from "vitest/config";

/**
 * V CI se spadlý test zkusí ještě dvakrát.
 *
 * Testy nad D1 (Miniflare) na runneru GitHubu občas spadnou bez souvislosti
 * s kódem: synchronní dotaz dostane cizí odpověď (`AssertionError: false == true`
 * ve fetch-sync) nebo vyprší čas. Pokaždé v jiném souboru, lokálně vše prochází.
 * Jeden takový pád přitom zastaví celé nasazení (16. 11. 2026 dvakrát po sobě
 * na main). Lokálně se neopakuje nic, ať nestabilní test nezůstane schovaný.
 */
export default defineConfig({
  test: {
    retry: process.env.CI ? 2 : 0,
  },
});
