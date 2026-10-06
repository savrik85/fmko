# Turnaj P-Mobile — návrh

Stav: etapa 1 (přihlášky, pozvánka) je na produkci od 2026-10-06. Tento dokument popisuje
etapu 2: los, zápasy, areál, výplaty, stránka během turnaje. 1. ročník začíná ve středu 14. 10. 2026.

## Rozhodnutí uživatele

- Každoroční turnaj **jen pro přihlášené** lidské A-týmy na konci sezóny; pořadatel **P-Mobile**
  hradí všechny náklady. Klub nic neplatí ani nebere vstupné.
- Odměny: **5 000 Kč za bod** v ligové fázi (výhra 3 b., remíza 1 b.), za umístění v play-off
  (nekumulativně podle konečného umístění): vypadl ve čtvrtfinále 20 000, v semifinále 40 000,
  finalista 75 000, vítěz 150 000 Kč + trofej do vitríny.
- **Formát:** ligová fáze v jedné tabulce, každý tým odehraje K zápasů (K volí admin po uzávěrce),
  pak play-off nejlepší osmičky: čtvrtfinále, semifinále, finále. Délka 7–12 dní, hraje se denně.
  Lichý počet přihlášek = jeden den navíc, žádný AI host.
- **Jen A-tým** (žádní hráči z U21 kádru).
- **Zranění** z turnaje platí i dál. **Karty** platí jen v turnaji (vlastní stopky, ligové stopky
  v turnaji neplatí a turnajové se do ligy nepřenášejí).
- **Výkop denně v 18:00** (cron 16:00 UTC, stejný slot jako liga — liga v té době už nehraje).
- **Areál P-Mobile Tábor:** hlavní stadion P-Mobile Aréna (~4 000 míst) pro zápas dne a celé
  play-off + vedlejší hřiště pojmenovaná po táborských místech (300–1 500 míst), tolik, kolik
  je potřeba na souběžné zápasy (9 s rezervou). Každé má ve 3D jiný vzhled, všude reklamy P-Mobile.

## Data (migrace 0253)

- `tournament_venues`: `id, city, name, short_name, capacity, is_main, sort, look` (JSON pro 3D:
  úrovně tribun/střechy/světel/zázemí, barvy). Seed: Tábor, 1 hlavní + 9 vedlejších.
- `tournament_matches`: `id, tournament_id, stage ('league'|'qf'|'sf'|'final'), day (1..),
  bracket_pos, scheduled_at, venue_id, home_team_id, away_team_id (teams.id; „domácí" je jen
  pořadí, výhoda domácích se nepočítá), status ('scheduled'|'simulated'), claimed_at,
  home_score, away_score, home_pens, away_pens, winner_team_id, events, commentary, attendance,
  stadium_name, pitch_condition, weather, home_lineup_data, away_lineup_data, absences,
  player_ratings, referee_*, simulated_at, home_seen, away_seen`.
  UNIQUE `(tournament_id, stage, bracket_pos, day)` pro idempotentní vložení play-off.
- `tournament_suspensions`: `tournament_id, player_id, matches_remaining` (PK obou).
- `tournaments`: + `drawn_at`, `league_days` (počet hracích dnů ligové fáze).
- Tabulka ligové fáze se **počítá z odehraných zápasů** (body, rozdíl skóre, vstřelené góly,
  reputace) — nic se neukládá zvlášť.

## Los (admin, po uzávěrce)

`POST /api/admin/tournament/draw { leagueMatches: K }` (+ `GET` náhled možností K a délky).
- Sudé N: metoda kruhu dá N−1 kol, každé je úplné párování (každý hraje jednou za den).
  Vybere se K kol. Náhodné pořadí týmů (seed = id ročníku) se zkusí mnohokrát a vybere se
  rozpis s nejvíc zápasy mezi okresy a nejvyrovnanější silou soupeřů (reputace).
- Liché N: kruh s volným losem dá N kol; vybere se K kol (K musí být sudé), týmy s volnem
  v těchto kolech (K týmů) se dohrají v dni K+1 párováním mezi sebou bez opakování soupeře.
  Každý tak odehraje přesně K zápasů za K+1 dní.
- Hřiště: zápasy dne seřazené podle součtu reputací; nejlepší jde na hlavní stadion
  (přednost má zápas s týmem, který na hlavním ještě nehrál), ostatní na vedlejší podle kapacity.
- Den 1 = `starts_on`, výkop 16:00 UTC. Play-off: čtvrtfinále den po ligové fázi, pak
  semifinále, finále. Méně než 8 přihlášených → play-off od semifinále (4 nejlepší).
- Po losu status `drawn`, SMS od P-Mobile každému účastníkovi s jeho rozpisem.

## Průběh (cron)

`maybeAdvanceTournament(db)` v crones 16:00, 16:05 a 16:20 UTC (stejně jako ligový tick):
- Zápasy s `scheduled_at <= now` a `status = 'scheduled'` se zabírají atomicky
  (`UPDATE … SET claimed_at WHERE status='scheduled' AND (claimed_at IS NULL OR < now−15 min)`),
  po dávkách (4 zápasy na běh), ať se nic neodsimuluje dvakrát (incident 2026-09-21).
- Simulace vychází z `simulateCupTie`: plný engine, sestava na zápas (`lineups.calendar_id =
  tournament_matches.id`, jinak poslední uložená), bonus trenéra, vybavení, standardky, pokyny
  z lavičky, sehranost, vztahy, kondice a morálka, zkušenost a růst (význam zápasu jako pohár),
  zranění, hodnocení hráčů, hráč zápasu, `match_player_stats` (team_id = teams.id).
- Rozdíly proti poháru: stopky z `tournament_suspensions` místo `players.suspended_matches`
  (do `buildMatchPlayers` jdou řádky kádru s přepsaným `suspended_matches`), červená karta
  zapisuje do `tournament_suspensions`, odpykání po odehraném zápase týmu; bez výhody domácích;
  dějiště = hřiště z losu; návštěva z fanoušků obou klubů + atraktivita (fáze, zápas dne,
  počasí), strop kapacitou; žádné finance klubů, žádný trávník klubu, žádné výtržnosti
  v klubech; neutrální rozhodčí; komentář bez okresu domácích.
- Výplata po každém zápase ligové fáze: body × 5 000 Kč (`recordTransaction`, typ
  `tournament_prize`, `reference_id` idempotentní). Remíza v play-off → penalty.
- Po dohrání ligové fáze se vytvoří čtvrtfinále (1–8, 4–5 | 2–7, 3–6), po něm semifinále, finále.
  Po finále: prémie za umístění, trofej do `teams.trophies`, `winner_team_id`, status `finished`,
  SMS a zpráva do zpravodaje.
- Konec sezóny (end-season) je blokovaný, dokud turnaj běží.

## Napojení na zbytek hry

- **Sestava:** `next-match` umí turnajový zápas (požadovaný i nejbližší; chronologicky s ligou
  a pohárem), uložení sestavy pro turnajový zápas ověřuje turnajové stopky, ne ligové.
- **Detail, záznam, zápasový den:** `GET /api/tournament-matches/:id` ve stejném tvaru jako
  pohár; frontend zkouší řetězem matches → cup-matches → tournament-matches. 3D stadion
  ze `GET /api/tournament-venues/:id` (stejný tvar jako stadion týmu, bez upgradů).
- **Nezhlédnutý zápas** po simulaci přesměruje na zápasový den jako u ligy.

## Stránka /turnaj

Fáze: přihlášky (hotovo) → po uzávěrce „Následuje los" → po losu záložky **Přehled** (můj další
zápas se Sestavou, dnešní zápasy, výsledky, vydělané peníze), **Tabulka** (čára pod 8. místem),
**Rozpis** (po dnech, hřiště), **Play-off** (pavouk), **Střelci**, **Areál** (seznam hřišť,
hlavní stadion ve 3D) → po turnaji vítěz, konečné pořadí, výplaty, síň vítězů.

## Testování

Unit testy losu (sudé/liché N, každý K zápasů, bez opakování soupeře, max 1 zápas denně,
hřiště bez kolize), scénář průběhu na testu: los → ruční posun (admin „odehrát den") → tabulka,
výplaty, play-off, trofej. FE přes prohlížeč na testu (desktop i 375 px).
