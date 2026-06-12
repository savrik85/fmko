# Vztahy mezi manažery — design (v1)

Datum: 2026-06-12 · Stav: schváleno uživatelem, implementuje se v1

## Koncept

Každá dvojice týmů v lize má vztah manažerů o dvou osách:

- **respekt** (−100..+100) — úcta, přátelství
- **heat** (0..100) — napětí, rivalita

Nejsou protiklady (vážený rival = vysoké obojí). Vztah roste pasivně z dění v lize
a aktivně z interakcí manažera. Funguje i s AI manažery (reagují pravidlově podle
archetypu odvozeného deterministicky z team id: provokatér / věčně uražený /
férový chlap / pohodář).

## Data

`manager_relations` — (team_a_id, team_b_id) PK, uspořádaná dvojice (a < b),
respect, heat, history (JSON, posledních 20 momentů: {date, icon, text, rd, hd}),
updated_at. Lazy init: vesnice < 8 km od sebe (haversine z villages.lat/lng)
→ baseline heat 20 („odvěcí sousedi").

`manager_interactions` — id, type (gesture|beer|bet|ad|gift), actor_team_id,
target_team_id, match_id, payload JSON, status (pending|resolved), created_at.
Slouží i jako idempotence (1 gesto na zápas, cooldowny).

## Pasivní zdroje (hook v match-runner po simulaci)

| Událost | Efekt |
|---|---|
| Těsný zápas (rozdíl ≤ 1, ne remíza 0:0) | heat +5 oběma |
| Debakl (rozdíl ≥ 4) | poražený: heat +10, respekt −5 |
| Remíza | heat +2 |
| Derby zápas (heat ≥ 60 před zápasem) | vítězova kabina +8 morálka, poražený −8 |

Derby (heat ≥ 60) navíc: návštěva ×1.35 (v místě výpočtu attendance v match-runneru).

## Aktivní interakce

1. **Pozápasové gesto** (karta v detailu odehraného vzájemného zápasu, 1× na zápas):
   podat ruku (respekt +5 oběma) / mlčky odejít (nic) / rýpnout si do novin
   (heat +10 cíli, vlastní kabina +2 morálka, řádek do zpravodaje).
   AI protějšek odpoví okamžitě dle archetypu a výsledku.
2. **Pivo po zápase** (respekt ≥ 30, cooldown 7 dní na dvojici): −50 Kč,
   respekt +8 oběma; 50% šance na šipky — vítěz respekt +3, poražený platí rundu
   (−50 Kč, jeho hráči +1 morálka).
3. **Sázka o bečku** (před nadcházejícím vzájemným zápasem, 500 Kč): AI přijímá
   dle archetypu. Vyhodnocení v match-runneru: poražený platí, vítězova kabina
   +3 morálka, zpravodaj. Remíza = sázka propadá bez efektu.
4. **Anonymní inzerát** (−100 Kč, cooldown 14 dní): jedovatý inzerát do novin,
   kabina cíle −2 morálka. 30% prozrazení → heat +15, respekt −5, zpravodaj
   odhalí autora.
5. **Dárek po debaklu** (po vlastní výhře ≥ 4 góly nad cílem, 1× na zápas, −80 Kč):
   tón upřímný (respekt +8) / jedovatý (heat +15 cíli, vlastní kabina +3 morálka).
6. **Předzápasový výrok do novin** (1× na vzájemný zápas, karta „Před zápasem"
   na profilu cizího týmu + profil trenéra): uznání (respekt +5, kabina +1) /
   provokace (heat +10, vlastní kabina +2, ALE soupeřova kabina +2 — nabudí je) /
   falešná skromnost (bez okamžitého efektu; výhra o 3+ → heat +15 + článek
   „Skromnost, která bolela"). AI protějšek odpovídá protivyrokem dle archetypu
   (tisková přestřelka ve zpravodaji), lidský soupeř dostane notifikaci.

Princip: každá podlost má cenu (riziko prozrazení, heat), každé smíření něco
stojí (peníze, hrdost).

## Statusy vztahu

- heat ≥ 60 → **rival/derby** (label v UI, derby efekty)
- respekt ≥ 60 → **spojenec**
- respekt ≤ −40 → **nepřítel**

## API

- `GET /api/teams/:teamId/relations` — všechny vztahy týmu (+ jména, statusy)
- `GET /api/teams/:teamId/relations/:otherId` — detail: osy, historie, dostupné
  interakce (cooldowny, vázané zápasy)
- `POST /api/teams/:teamId/relations/:otherId/interact` — {type, matchId?, choice?/tone?}

Modul `apps/api/src/community/manager-relations.ts` (engine + AI archetypy),
route `apps/api/src/routes/relations.ts`, hook v `multiplayer/match-runner.ts`.
Peníze přes `recordTransaction` (finance-processor), zprávy přes `INSERT INTO news`,
notifikace přes `createNotification`. Morálka kabiny přes `json_set(life_context)`.

## FE

- **Profil manažera** (`/dashboard/manager/[id]`): nová sekce „Vztahy".
  Cizí manažer → karta vztahu (bary respekt/heat, status badge, historie momentů,
  tlačítka interakcí dle dostupnosti). Vlastní profil → přehled všech vztahů.
- **Detail zápasu** (`/dashboard/match/[id]`): pozápasová karta gesta.

## Mimo rozsah v1 (v2)

Ukradený maskot, babka s kočárkem (špionáž tréninku), rezervovaná hospoda,
pozvánka na zabijačku/ples, drby v hospodě, gentlemanské dohody (sdílení
skautských reportů — váže na feature Scouting), lahev „na uklidněnou",
oběd s trenérem (prozradí formaci), zpětný zápis rýpnutí z AI rozhovorů do heat.
