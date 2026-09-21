# Trenér: Kabina, reálný dopad vlastností, trenérská škola a licence

Schváleno 2026-09-22. Implementace ve čtyřech fázích (0 až 4), každá samostatně na testing.

## Proč

Profil trenéra byl na okrasu: pět pruhů s mlhavými popisky, o hráčích nic. Taktika dávala
bonus až od 60, disciplína hýbala jen docházkou, reputace skoro jen fanoušky. Trenér se
zlepšoval jen náhodou po zápasech.

## Rozhodnutí uživatele

- Kurz vlastnosti stojí peníze **i čas**: trenér chybí na tréninku (vede asistent nebo výbor).
- Ke každému kurzu **skripta**; test se ptá jen z nich. Test = **fotbalové znalosti**, 4 možnosti.
- Test je **časově omezený bez pauzy** (čas běží na serveru), skripta během testu zamčená,
  hráč je před spuštěním výslovně upozorněn a musí zaškrtnout „Rozumím, jsem připravený".
- Neúspěch = **jeden opravný termín** za 20 % ceny, druhý neúspěch = kurz propadá.
- Licence C / UEFA B / A / Pro se všemi čtyřmi výhodami (strop vlastností, pokročilé kurzy,
  respekt kabiny a trhu, pravidlo soutěže).

## Fáze 0: jeden trenér na klub

Převzetí AI klubu nechávalo AI trenéra uloženého pod id klubu a lidský se k němu přistěhoval.
Oprava v `routes/teams.ts`, líné ukládání AI trenéra přes `coach/ai-manager.ts`
(`ensureAiManager`, INSERT OR IGNORE). Migrace 0211: úklid + unikátní index `managers(team_id)`.

## Fáze 1: Kabina

- `players.coach_relationship` se mění jen přes `lib/coach-relation.ts`
  (`coachRelationStmts` do cizího batche, `applyCoachRelationDelta` samostatně s referenceId).
  Každá změna nechá řádek s důvodem v `coach_relation_log` (migrace 0212).
- API `GET /teams/:id/coach/kabina`, `GET /teams/:id/coach/relation-log?playerId=` (jen vlastník).
- Profil trenéra se záložkami Přehled / Kabina (jen vlastní) / Trenéři / Vzdělání / Historie.
- Sdílená pásma vztahu `coachRelationBand` (Idol, Loajální, Neutrální, Skeptický, Nepřátelský).

## Fáze 2: dopad vlastností

Vzorce v `packages/shared/src/types/coach.ts`, neutrální bod 40 = dřívější chování.
Taktika plynule −2..+4 a rychlejší sehranost; disciplína fauly/karty (engine přes
`EquipmentMods.coachFoulMod/coachCardMod`) a průšvihy v hospodě; mládež i růst z minut;
motivace tlumí nenominaci a trucování, opakovaná nenominace bere vztah k trenérovi;
reputace (a licence) v zájmu o přestup a podpisu volného hráče. Profil ukazuje čísla
z `coachAttributeEffects`. Admin `POST /admin/coach/backfill-ai-managers`.

## Fáze 3: licence

`managers.licence_level` (0–4), odvozená z nejvyšší vlastnosti (migrace 0213). Stropy
60/70/80/90/99 v `applyManagerAttrDelta` (hodnotu nad stropem nesnižuje). Nováček začíná
se vztahem podle licence a reputace (`initNewcomerCoachRelation`), návrat z hostování vrací
původní vztah. Špičkoví zaměstnanci chtějí licenci. Pravidlo soutěže `min_coach_licence`
(od příští sezóny, AI kluby se nehlídají). AI trenér si po sezóně zvedne licenci podle reputace.

## Fáze 4: trenérská škola

- Tabulky `coach_courses`, `coach_exam_attempts` (migrace 0214), odpočty v herních dnech.
- Pravidla a ceny ve sdíleném `COURSE_RULES` / `LICENCE_COURSES`; skripta a otázky výhradně
  na serveru v `apps/api/src/coach/course-content/` (správné odpovědi nikdy do webu).
- `coach/quiz.ts` losuje (nejdřív neviděné otázky, opravný termín bez otázek z prvního pokusu),
  míchá možnosti a hodnotí. Po prvním neúspěchu se ukáže jen co bylo špatně, správné odpovědi
  až po úspěchu nebo definitivním propadnutí.
- `coach/courses.ts`: nabídka, přihláška, skripta (423 během testu), start testu s `confirm`,
  průběžné ukládání odpovědí, odevzdání, líné vyhodnocení vypršelého pokusu, opravný termín,
  denní tick v `season/team-day.ts`, trenér mimo trénink v `season/daily-tick.ts`.
- Web: záložka Vzdělání, `/trener/skripta?kurz=`, `/trener/test?kurz=`, banner na Trénincích.

| Kurz | Zisk | Podmínka | Cena | Dní | Test |
|---|---|---|---|---|---|
| Základní | +3 | – | 10 000 + hodnota × 200 | 7 | 8 otázek, ≥ 6, 10 min |
| Pokročilý | +5 | UEFA B | 30 000 + hodnota × 500 | 14 | 10, ≥ 8, 12 min |
| Licence C / B / A / Pro | stupeň + 2 reputace | reputace 0/35/50/65 | 25/60/120/250 tis. | 10/14/21/28 | 15, ≥ 12, 20 min |

Opravný termín 20 % ceny, okno na test 7 herních dní, max. 3 kurzy vlastností a 1 licenční
za sezónu.
