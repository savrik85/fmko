# AI kluby: postup nasazení na produkci (připraveno 25. 10. 2026)

Nic z toho se nespouští bez výslovného souhlasu uživatele („nasaď na main“). Pořadí je důležité.

## 0. Před nasazením

1. Záloha: Time Travel bookmark (`npx wrangler d1 time-travel info prales-db-prod`), ne export přes den
   (export zamkne databázi a hráčům padají chyby 500).
2. Migrace `apps/api/migrations/0276_ai_clubs.sql` na prod (jen `ADD COLUMN` a `CREATE TABLE/INDEX`, hook ji pustí):
   `npx wrangler d1 execute prales-db-prod --remote --file apps/api/migrations/0276_ai_clubs.sql`
3. Do CACHE_KV produkce **před** nasazením kódu (ať první noční tick nic nepřevezme bez kontroly):
   - `ai_club_takeover = off` (převzetí opuštěných klubů vypnuté),
   - `ai_coach_mode = shadow` (AI trenéři jen zapisují do deníku), případně rovnou `on`.

## 1. Nasazení kódu

Cherry-pick schválených commitů z větve `worktree-ai-clubs` ve worktree na `main` (postup `/ship-prod`),
`git push origin HEAD:main`. Nové crony (`0 7`, `45 12`, `15 * * * *`) a souběh fronty 4 jdou s `wrangler.toml`.

## 2. Nastavení dat (admin, vždy nanečisto → kontrola → naostro, stejný `seed`)

| Krok | Volání (admin, `POST`) | Kontrola |
|---|---|---|
| a | `/api/admin/ai-clubs/facilities?dryRun=1`, pak bez `dryRun` | 33 stadionů a 46 vybavení (stav 25. 10.) |
| b | `/api/admin/ai-clubs/u21-ai-managers?dryRun=1`, pak bez | 2 AI trenéři u U21 (Meteor Žižkov U21, Jiskra Vinohrady U21) |
| c | `ai_club_takeover` → `on`, počkat na noční tick (nebo ručně) | převezme Autolakovku, Kebab, Kobylisy (k 25. 10.) |
| d | `/api/admin/ai-clubs/level?leagueId=dbd9bd42-3c72-44af-b21b-215bc3ef7ec9&mode=league-humans&seed=…&dryRun=1` | Praha, tabulka před a po |
| e | totéž pro U21 Prahy `b483bf66-861e-4619-a600-b68d73445d22` | |
| f | `/api/admin/ai-clubs/level?leagueId=9513dc13-4a13-487e-9547-4a1ec755dd6c&mode=newcomer&seed=…&dryRun=1` | ČB |
| g | totéž pro U21 ČB `d1b45b99-6154-4334-a17f-bf853d594686` | |
| h | `/api/admin/ai-clubs/lower-league?district=Prachatice&seed=…&dryRun=1` | 14 obcí, 26 kol st/ne do 28. 1. |
| i | `/api/admin/ai-clubs/open-district?district=České Budějovice&dryRun=1` | `preparing` → `ready` |

Pozn.: III. třída se musí založit včas. Rozpis začíná nejbližší středou nebo nedělí aspoň dva dny po
založení a musí se vejít do posledního kola přeboru (28. 1. 2027); když se nevejde, doplní páteční kola.

## 3. Po nasazení

- Admin → „AI trenéři“: deník rozhodnutí, chybovost modelu, povaha trenérů. Hlídač provozu hlásí,
  když přes třetinu rozhodnutí za 24 h rozhodne náhradní pravidlo.
- Z `shadow` na `on` (`POST /api/admin/ai-coach/mode {"mode":"on"}`), až deník vypadá rozumně.
- Po prvním týdnu zkontrolovat rozpočty AI klubů (III. třída má 20–51 tis.).
