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
| d | `/api/admin/ai-clubs/level?leagueId=dbd9bd42-3c72-44af-b21b-215bc3ef7ec9&mode=league-humans&seed=…&dryRun=1` | Praha, tabulka před a po; `after.headroom` AI 8–14 (lidé 5–18), `after.manager` nahoru, naostro `managersRaised` 7 z 8 (v kopii z 25. 10. byla Ladronka už na cíli) |
| e | totéž pro U21 Prahy `b483bf66-861e-4619-a600-b68d73445d22` | |
| f | `/api/admin/ai-clubs/level?leagueId=9513dc13-4a13-487e-9547-4a1ec755dd6c&mode=newcomer&seed=…&dryRun=1` | ČB |
| g | totéž pro U21 ČB `d1b45b99-6154-4334-a17f-bf853d594686` | |
| h | `/api/admin/ai-clubs/lower-league?district=Prachatice&seed=…&dryRun=1` | 14 obcí, 26 kol st/ne do 28. 1. |
| i | `/api/admin/ai-clubs/open-district?district=České Budějovice&dryRun=1` | `preparing` → `ready`. **Předtím rozhodnout** o testovacím klubu FK Řeznictví Černý (účet `tvuj@`, síla 60,8 proti AI 34–46): nechat, smazat (mazání = dvojitý souhlas), nebo předat AI |

Pozn.: III. třída se musí založit včas. Rozpis začíná nejbližší středou nebo nedělí aspoň dva dny po
založení a musí se vejít do posledního kola přeboru (28. 1. 2027); když se nevejde, doplní páteční kola.

## Náhled na localhostu (stav po nasazení)

Noční záloha z R2 (`prales-backups/denni/prod-YYYY-MM-DD.sql.gz`, ne export přes den) → SQLite →
migrace 0276 → soubor podložený lokální D1 (`backups/local-state/v3/d1/...`) → lokální KV
`ai_club_takeover = off`, `ai_coach_mode = shadow` → kroky 2a–i přes lokální admin
(`http://localhost:8790`) se stejným seedem → `ai_club_takeover = on`. Hotovo 25. 10. ze zálohy
01:20 UTC: kroky sedí na tabulku výše (33/46, 2 trenéři U21, 3 převzaté, III. třída 26 kol st/ne).

## Testing (25. 10.)

Na testingu `c618f71e` (obsah větve jedním commitem nad testingem). Migrace 0276 na `prales-db-test`,
`ai_club_takeover = off` (převzetí by tam vzalo 25 klubů včetně testovacích účtů T1–T5).
Narovnání: Kofola liga a U21, ČB a U21, Český Krumlov a U21, III. třída a U21 (`below-league`).
III. třída na testingu vznikla registrací 29. 9.: dostala st/ne a vypnutý postup, rozpis až
rolloverem (sezóna na testingu končí 30. 11. a 26 kol se nevejde).

## 3. Po nasazení

- Admin → „AI trenéři“: deník rozhodnutí, chybovost modelu, povaha trenérů. Hlídač provozu hlásí,
  když přes třetinu rozhodnutí za 24 h rozhodne náhradní pravidlo.
- Z `shadow` na `on` (`POST /api/admin/ai-coach/mode {"mode":"on"}`), až deník vypadá rozumně.
- Po prvním týdnu zkontrolovat rozpočty AI klubů (III. třída má 20–51 tis.).
- První pondělí: AI kluby bez hlavního sponzora ho podepíšou a přejmenují se (např. „Meteor Žižkov“
  → „FK O2 Žižkov“), každý za −3 reputace jako člověk. Hráči to uvidí v Novinkách.
- Po měsíci přeměřit růst: síla jedenáctky AI klubů v Praze proti lidem (v simulaci AI +2,8 až +5,1
  za 96 dní) a počet AI inzerátů na trhu (v simulaci kolem 1,5 na klub).
- V deníku rozhodnutí: pondělní správa má přestupní kurz (`decision.transfers`), denní trh ho
  vypisuje v souhrnu (`course=buy:GK`, `course=-` = bez kurzu). Kurz z režimu nanečisto trh ignoruje.
