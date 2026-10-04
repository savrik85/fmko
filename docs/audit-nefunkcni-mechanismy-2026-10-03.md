# Audit bugů a nefunkčních mechanismů — 2026-10-03

Read-only audit celé hry: 8 paralelních průchodů po oblastech (zápasový engine, trénink a rozvoj,
přestupy, finance a sponzoři, fanoušci, obec a vztahy, soutěž a sezóna, trenér a telefon) nad
snapshotem větve `testing` (06dba119), plus průřezové kontroly a ověření v datech prod/test DB
(jen SELECT). **Žádný kód ani data nebyly změněny.**

Klíčové nálezy jsem ověřil přímo v kódu a u 15 z nich i to, že stejný kód běží na `origin/main`
(produkci). Všech 15 tam je.

Legenda: 🔴 hráč je aktivně klamán / špatný výsledek / peníze z ničeho, 🟠 nesoulad UI vs. engine,
🟡 kosmetika, mrtvý kód, okrajové případy. ✅ = ověřeno i v datech.

Kontext: `game_clock.offset_days = 0` na prod i test → všechny chyby „herní vs. reálný čas"
jsou dnes spící, škodily by až po posunu hodin. Sezóna na produkci končí 2. 11. 2026.

---

## 🚨 Priorita: ověřené nálezy s největším dopadem

### 1. 🔴✅ Bufet: čím vyšší cena, tím víc peněz — na produkci se to už zneužívá
- `apps/api/src/season/fans-processor.ts:284`: `priceFactor = max(0.1, 1 − (ratio−1)·elasticity)`.
  Poptávka nikdy neklesne pod 10 %, strop ceny je 1000 Kč (`routes/game.ts:9574`).
  Postih „Předražená" platí jen pro kvalitu L1 (`fans-processor.ts:182`), L2/L3 žádný.
- **Produkce:** FK FORPSI Čkyně prodávalo 24. 9. a 1. 10. pivo L3 za 600–1000 Kč,
  klobásu za 900, svařák za 750. Zisk z bufetu za 2 zápasy: **357 662 Kč**.
  Pivo L3 vydělá na 100 diváků 44 234 Kč při ceně ~800 proti 7 747 Kč při běžných 55 Kč (5,7×).

### 2. 🔴✅ Vstupné nemá vliv na návštěvnost
- `multiplayer/match-runner.ts:366-507`: cena do výpočtu návštěvy nevstupuje. Jediný dopad je
  −2 spokojenosti za zápas (`fans-processor.ts:139`), strop vstupného 500 Kč (`game.ts:9378`).
- UI (`fanousci/page.tsx`) přitom varuje „Cena přes 1.2× běžné úrovně rozzlobí fanoušky".
- **Produkce:** klub se vstupným 150 Kč a spokojeností 18 má průměrnou návštěvu 212, stejně
  jako kluby za 20–50 Kč. Vstupné 500 Kč = ~16× tržba za cenu −2 spokojenosti.

### 3. 🔴✅ Vystřídaný nebo vyloučený hráč vyjde ze zápasu bez únavy a se starou morálkou
- `engine/simulation.ts:739` `doSubstitution` a `:875` `sendOff` vyřadí hráče z `team.lineup`,
  výsledek vrací jen konečnou jedenáctku (`:1663`). Zápis po zápase (`match-runner.ts:1247`)
  prochází jen ji. Stejně pohár (`cup/cup.ts:693`) a přátelák (`friendly-runner.ts:288`).
- **Produkce (kolo 1. 10.):** záznam o únavě ze zápasu má 371 ze 372 hráčů, kteří odehráli 90 minut,
  a **0 ze 70** vystřídaných hráčů základní sestavy.
- Dopad: střídat v 60. minutě je zadarmo, rotace kádru kvůli kondici ztrácí smysl.
  (Hráči, kteří přišli z lavičky, se zapíšou, jen nemají záznam v `condition_log`, protože
  `preSimCondById` zná jen základní sestavu.)

### 4. 🔴 Předzápasové bonusy morálky se zapisují do DB natrvalo
- `match-runner.ts:553-603` přičítá k `p.morale` šatny + kotel, domácí výhodu z fanoušků
  (až +10), motivaci trenéra (+1 až +6); hostům pod kotlem za brankou odečítá zastrašení (až −6).
- Zápis po zápase (`:1252`) odečítá jen `incidentMoraleDelta` — komentář o kus výš přitom
  říká, že dočasný handicap se má odečíst. Denní návrat k 45–55 je jen ±1 bod (`daily-tick.ts:1081`).
- Dopad: domácí tým se silným kotlem stoupá v morálce každé domácí kolo o víc, než stihne
  spadnout; hosté pod kotlem trvale ztrácejí. Našli to nezávisle dva průchody.

### 5. 🔴 Sponzorské smlouvy vyplácí 2× víc, než hra ukazuje
- `season/finance-processor.ts:290`: `(monthly / 4.3) * 2 * sponsorBonusMul` (od 25. 3., bez
  vysvětlení). Seznam smluv ukazuje `monthly/4.3` (`web/lib/sponsor-format.ts:4`), hodnota smlouvy,
  vratky a pokuty počítají také bez ×2. `/budget` (`game.ts:702`) ×2 má, takže na téže stránce
  nesedí součet řádků se souhrnem.
- Buď je ×2 chyba (ekonomika sponzorů je 2× nafouklá), nebo záměr a pak lže UI i výpočty hodnoty
  smlouvy. **Rozhodnutí je na tobě.**

### 6. 🔴 Přáteláky vyplácejí bonusy za výhru
- `finance-processor.ts:649-675` (Match result reward) nemá guard na přátelák;
  `friendly-runner.ts:264,267` volá `processMatchDayFinances(..., true)`.
- Výhra v přáteláku = sponzorský `win_bonus` + 500 Kč „od soutěže" + bonus fanoušků.
  Přátelák jde každé 3 dny, dva domluvení manažeři si můžou bonusy točit.

### 7. 🔴 Disciplinárka: důkazy „za sezónu" počítají celou historii
- `competition/discipline.ts:155`: `SELECT MIN(match_date) FROM season_calendar` — sloupec
  neexistuje (je `scheduled_at`). Dotaz spadne do `.catch`, začátek sezóny je `""` a okno
  „od počátku věků".
- Navíc `cards` (`:221`) a `referee_abuse` (`:262`) sezónu nefiltrují vůbec, `transfer` (`:246`) také ne.
- Dopad: klub se 3 červenými za 3 sezóny je žalovatelný za „hrubou nedisciplinovanost za sezónu",
  ostatní hlasují nad nepravdivým důkazem.
- Stejná chyba `ORDER BY sc.match_date` v `routes/game.ts:1805` → hosté/jádro soupeře pro příští
  domácí zápas se nikdy nespočítají. (`season/pub.ts:1656` už má opravu s komentářem.)

### 8. 🔴 Trénink: počasí nikdy neplatí a platí se podle dne v týdnu, ne podle tréninku
- **Počasí:** `season/daily-tick.ts:467` volá `resolveWeatherForDate(env.DB, team.game_date)`,
  ale dotaz na týmy (`:246`) `game_date` nevybírá → `null` → postih docházky za déšť/sníh je
  vždy 0. Komentář o 10 řádků níž stejnou díru u incidentů už obcházel.
- **Náklady:** `season/team-day.ts:544` strhává cenu jen po–pá. Víkendový trénink je zadarmo,
  zápasový den se zaplatí, i když trénink odpadl (`daily-tick.ts:333`).

### 9. 🔴 „⭐ X je volný!" sledujícím po propuštění nikdy nepřijde
- `routes/game.ts:4992` volá `removePlayer`, který smaže `player_watchlist` (`remove-player.ts:86`),
  a teprve pak `sendWebPushToPlayerWatchers` (`:5003`), který už nikoho nenajde. Hráč navíc
  sledujícímu zmizí ze Sledovaných a jako volný hráč má nové `id`.

### 10. 🔴 Kampaň fanoušků „trenér ven" po splnění nikdy neskončí
- `fans/fan-campaigns.ts:215` nastaví `splnena`; z toho stavu vede jen `uzavriKampaneNaHrace`
  (odchod hráče). Trenér odejít nemůže → transparent, chorál `trener_proti`
  (obnovuje se na sílu 100 a dostane placenou nahrávku), otázky v rozhovorech a zmeškané hovory
  běží napořád. Na produkci jsou kampaně živé (5 sbírá podpisy), proti trenérovi zatím žádná.

---

## 🟠 Časované bomby (dnes nic nedělají, spustí se samy)

- **Volby zastupitelů padnou na cizích klíčích** — `season/village-processor.ts:232-233` dělá
  `DELETE FROM village_officials` bez try/catch, na řádek ale odkazují `village_brigades`,
  `village_history`, `village_invitations`, `village_pub_encounters` (FK na produkci existují).
  Výjimka shodí zbytek pondělního bloku včetně `processCrisisEvents` a opakuje se každý týden;
  favor řádky se mezitím smažou. **První volby na produkci: srpen–říjen 2027** (76 mandátů).
- **Sliby sponzorům po postupu/sestupu** — `league/district-promotion.ts` (rollover krok 2b)
  přesune týmy dřív, než `rolloverSponsorPromises` (krok 4a) vyhodnotí sliby. `sponsors/promise-data.ts:51`
  hledá pozici v NOVÉ lize, kde má klub 0 bodů → mistr III. třídy „poruší" slib top 3.
  Produkce zatím III. třídu nemá, na testingu to bude platit při nejbližším rolloveru.
- **AI kluby bez trenéra** — `ensureAiManager` se volá jen líně při otevření profilu.
  Na testu 26 z 68 AI týmů bez řádku v `managers` → v zápase žádná taktika/motivace/disciplína.
  Produkce dnes 0 z 21, ale každý nový AI tým z rozšíření okresů bude bez trenéra.
- **Nabídky ve stavu `countered` nikdy nevyprší** (`transfers/transfer-pressure-tick.ts:63` jen
  `pending`) a blokují nového zájemce. Na testu teď žádná není.

---

## Podle oblastí

### Zápasový engine
- 🟠 **Formace nemá strukturální vliv.** `formation` se čte jen jako lookup synergie
  (`simulation.ts:196,1270`); útok/obrana jsou průměry všech hráčů v poli. U `balanced` je
  synergie všude 1,0. Popisy „Pět vzadu, beton" a nápověda „ovlivňuje počet obránců…" slibují víc.
- 🟠 **Kondice:** nápověda „pod 60 % hraje až na 60 % síly" — engine bere jen průměr kondice
  útočícího týmu (`simulation.ts:1160`), jednotlivec dělá 1/11 efektu, bránící tým se nepočítá.
- 🟠 **Kapitán** zvedá morálku jen po gólu z otevřené hry (`simulation.ts:1205`), ne po
  penaltě/standardce/brejku (`scoreGoal` :850). V poháru se kapitán vůbec nepředává (`cup.ts:593`).
- 🟠 **Mentorský bonus** platí, i když partner sedí na lavičce (`simulation.ts:300` nekontroluje lineup).
- 🟠 **Nápověda počasí:** zranění déšť 1.3× / sníh 1.4× vs. engine 1.45 / 1.6 (`simulation.ts:86-88`).
- 🟠 **„Nakopávaná" ve větru:** tooltip ji do větru doporučuje, engine ji tam trestá (`longBallBonus −0.1`)
  a `tactic-hints.ts` radí opak.
- 🟠 **„Držení míče" a „Presink"** nemění držení míče (`calcPossession` taktiku nečte); „nejvíc
  příležitostí" nejspíš dává ofenzivní (odhad z vzorce, neměřeno).
- 🟠 **Pohár nemá domácí výhodu**: `cup.ts:629` `isHomeAdvantage: false`, šatny/kotel/fanbase se
  nepoužijí, upgrady to neříkají.
- 🟡 Noha/strana hráče se nečtou; „pozdní příchod" je jen text; zraněný bez střídačky hraje dál beze
  změny; „nemůže dál" (exhausted) je jen text; derby pro AI tvrdost je napevno `false`
  (`match-runner.ts:~681`); střídající nedostane postih mimo pozici; první zápas v nové formaci
  sehranost nezvedne (`chemistry.ts`); náhled síly (`lineup-strength.ts`) ignoruje většinu modifikátorů.

### Trénink a rozvoj
- 🔴 **Únava z tréninku se neprojeví:** trénink vezme 3–6 kondice, regenerace ve stejném ticku vrátí
  +10 až +23 (`daily-tick.ts:703` vs `:940`). Lehký vs. tvrdý trénink a kondiční trenér jsou v kondici neviditelné.
- 🔴 **Konec sezóny škáluje jen `skills`**, ne `physical` (`season-development.ts:63-77`) — engine čte
  `physical.stamina/strength`, takže roční pokles výdrže a síly veteránů se do zápasu nedostane;
  mladí můžou přeskočit potenciál.
- 🔴 **Letní soustředění „+5 vytrvalost"** zapíše `skills.stamina`, engine čte `physical.stamina`
  (`event-effects.ts:46` vs `lineup-loader.ts:44`); stojí 8 000 Kč. Pražská varianta má navíc
  pořád typ `"stamina"`, který handler nezná (`seasonal-events.ts:630`).
- 🟠 Predikce „Co to přinese" ignoruje typ tréninku po dnech (`game.ts:~446`), počítá 1 pokus místo
  6/4/3/2 podle věku, nepočítá odpadlý trénink v den zápasu; docházka 0.08 vs 0.1.
- 🟠 „+N dospíváním" ukazuje 21letým bonus, který nedostanou (věk se zvedne dřív, `season-departures.ts:286`).
- 🟠 Prognóza stropu přičítá `talent × 0.15`, který rating nikdy nezíská (`skills/vyhled-hrace.ts:~96`).
- 🟠 Badge talentu u nabídek dorostu má jiné prahy (30/18) než `skills/talent.ts` (16/36/61).
- 🟠 Nápověda: „10 % šance za trénink, 7 atributů" (engine 30 %, 12 atributů); regenerace
  „+18/+7" (engine +20/+16/+13/+10 ± věk); „po tréninku −3 až −8" (engine 3–6).
- 🟡 `loadVerdict` „neutralni" hráči mizí z pruhu; `drainMap` nedosažitelné klíče; dospívání se loguje
  jako rating, ne body; zápasový růst nepřepočítá `overall_rating`; mentor se v tréninku nezobrazuje;
  volný hráč s talentem 0 dostane při podpisu nový náhodný talent (`game.ts:5183`).

### Přestupy
- 🔴 **Podpis volného hráče přes API:** nekontroluje `rejected_by` (dá se losovat do úspěchu) a mzdu
  `offeredWage` zapíše bez validace, i zápornou (`game.ts:5110-5185`). Jen ručním voláním API.
- 🔴 **Přijetí „Noví zájemci" v mínusu:** hráč se vloží, pak `recordTransaction` hodí
  `BUDGET_BLOCKED` → hráč v kádru zdarma, FE ukáže chybu (`game.ts:7519-7578`).
  Limit kádru 30 hlídá jen podpis volného hráče.
- 🟠 AI inzeráty existují jen ve 4 okresech (`virtual-teams.ts:106` napevno) — ČB a Krumlov mají prázdný trh.
- 🟠 „admin poplatek (20 %)" napevno v `PlayerHero.tsx:119`, sazbu přitom hlasuje grémium.
- 🟠 `search-players` vrací mzdu cizích hráčů (`game.ts:5093`), jinde se skrývá.
- 🟠 Hostování neuzavírá inzerát na trhu (`game.ts:6929`); systémové stažení nabídky dá zájemci 10denní cooldown.
- 🟠 Poplatek 500 Kč u „Noví zájemci" není nikde vidět.
- Starý stav: #23 (mzdový faktor FA neutralizován), #24 (expirace LIMIT 20), #35 („(0, ) se vrací") stále otevřené.
- 🟡 legacy `transfer_bids` endpointy a FE sekce bez dat; `GET /teams/:id/transfers` bez konzumenta;
  návrat z hostování v ticku nevolá `onPlayerTransferred`; AI inzerát lze koupit 2× souběžně.

### Finance, sponzoři, stadion
- 🟠 **Plot L2/L3 násobí vstupné** a s násobičem spokojenosti dá „Drahé vstupné −2" každý domácí
  zápas, i když manažer cenu nenastavil (`finance-processor.ts:470`). Plot stál 130 000 Kč.
- 🟠 **Sociálky L3 „+6 spokojenost"** — společný strop zázemí je +3 (`fans-processor.ts:76`), L3 nepřidá nic.
- 🟠 **Prognóza `/budget`** nepočítá pronájem bufetu, akademii mládeže ani multiplikátory ekonoma
  → „Bankrot za X týdnů" je zkreslený.
- 🟠 **Neatomické nákupy** (dvojklik = 2× platba, 1× efekt): vybavení, vizuál stadionu, údržba
  a upgrade trávníku, povrch areálu, naskladnění bufetu. Půjčka: dvojklik = 2 půjčky (`cash-loans.ts:128`).
- 🟠 Prosba o příspěvek kontroluje utracení přes `transactions.game_date`, nákupy ale ukládají reálný čas
  (spící při offsetu 0). Účel „mládež" splní klub, který akademii už platí.
- 🟠 Po vypršení smlouvy se nevrací jméno klubu/stadionu/poháru/U21 (`season-rollover.ts:177`).
- 🟠 Obecní spolufinancování jde zaplatit i pro zařízení na L3 (`villages.ts:1151-1187`).
- 🟠 Banner jde přes API podepsat za maximum místo nabídnuté částky (`game.ts:2640`).
- 🟠 Nápověda sponzorů pořád slibuje „pod 40 tři nabídky, 40–59 čtyři, 60+ pět", stránka Reputace taky.
- 🟡 „Údržba hřiště" (týdenní položka) nic neovlivňuje; `/stadium/maintain-pitch` jde zaplatit při 100 %;
  mrtvé `economy.ts` funkce, `naming-rights.ts`, `premium.ts`, `refreshmentPerAttendee`.

### Fanoušci
- 🟠 Tvrdé jádro: srážka po rvačce se přepíše při dalším přepočtu (`fan-group-state.ts:157`),
  `ZTRATA_OCHRANKA` a `zavreny_sektor` jsou nevolané konstanty.
- 🟠 Klec „hlas kotle tlumený o 10/20 %" se neaplikuje (`cageTlumeni` nikdo nečte).
- 🟠 Choreo (tifo) „bude vidět na příštím zápase" — v resolveru napevno `tifo: false`, ve 3D nic.
- 🟠 Placené nahrávky chorálů dostávají hlavně stížnosti a „trenér ven" (síla roste, když je kotel
  naštvaný); při změně textu zůstane stará nahrávka; selhání se opakuje bez konce (strop 10/běh).
- 🟠 Vůdce: charisma a sentiment jsou jen na displeji, do nálady party nezasahují.
- 🟠 Fanbase: přesun casual → regular → hardcore běží každé 4./8. domácí kolo bez podmínky,
  hardcore nikdy neubývá, ztracení se nevracejí.
- 🟠 Text „Loajalita je hladina, ke které se spokojenost vrací" — klid je `45 + loyalty × 0.15`.
- 🟡 Rozpad návštěvy „z vesnice / z okolí" na FE je z konstanty; „Očekávaná návštěva" nepočítá
  spokojenost/derby/počasí; akce fanoušků strhne peníze i když zápis efektu selže; pohár volá
  resolver se `seasonNumber: 0`.

### Obec, vztahy, hospoda, události
- 🟠 Pražské ad-hoc události `hospoda`, `sipky`, `grilovani` nemají `choices` → INSERT spadne,
  notifikace „Turnaj v šipkách" přijde a v Událostech nic není (`league-round.ts:~687`).
- 🟠 Mezikolové události mají prahy ze staré škály 0–20 (`events/between-rounds.ts`): „Hádka v kabině"
  `temper >= 14` (skoro každý), zranění `injuryProneness/20 ≥ 1` (náchylnost nic neváží).
  Hádka dvou hráčů srazí morálku celému týmu −5. „Hráč chce odejít" rovnou nastaví `status='quit'`.
- 🟠 Historie událostí po reloadu ukazuje šablonové efekty, ne zvolenou možnost (volba se neukládá).
- 🟠 „Prodej místního hráče" (`applyLocalSale`) nikdo nevolá — UI ho slibuje.
- 🟠 „Jen jedno pivo" s klukama dá efekt jednomu hráči, ne týmu; „Zakázat" = −3 morálky všem každé 2 dny.
- 🟠 Pozvánky zastupitelů jdou přes API i na venkovní zápas (platí se, nic nedají) a odmítnutou lze opakovat.
- 🟠 Kontrola ze svazu: „risk" je jistá pokuta 2 000 Kč, „uklidit" 1 000 Kč — žádná náhoda.
- 🟠 Runda v hospodě (`manager-relations.ts:~1054`) zvedne favor všem 5 řádkům týmu včetně per-official.
- Starý stav: #11 (pražská stamina), #27 (pub-visit bez effects), #28 (místní hrdost), #30 (Zabijačka),
  #31 (neškálovaná reputace v potvrzení), #39 (pivo se zastupitelem + „Sprint B"), #40 (skaut) stále otevřené.
- 🟡 hlasování počítá i U21 týmy do „X z Y"; petice/investice se generují i U21; prázdné catch
  v `villages.ts`, `votes.ts`, `daily-tick.ts`; sezónní události jdou přijmout do mínusu.

### Soutěž, liga, sezóna, sázky
- 🔴 **Legenda tabulky „Postup / Sestup"** = vždy první 2 / poslední 2 v každé lize
  (`liga/page.tsx:591`). Na produkci (jen přebory, žádná III. třída) se nehýbe nikdo; na testingu
  přebor nepostupuje a III. třída nesestupuje. Konec sezóny výsledek postupu nikde neřekne,
  hero text je „kraluješ Přeboru!" i pro III. třídu.
- 🟠 „Zákaz transferů mezi kluby stejného majitele" nic nezakazuje (čte ho jen disciplinárka jako důkaz).
- 🟠 Výplata sázky se řídí stropem platným při vypořádání, ne slíbeným na tiketu (`betting/settle.ts:~107`).
- 🟠 Reputace: ztráta za umístění začíná od 9. místa, ne od 8.; postup/sestup ±5 nikde nepopsán.
- 🟠 Pokuty grémia jsou ve výpisu označené „rozhovor" (`routes/referees.ts:~150`).
- 🟠 Achievementy „první ligová výhra / 10 ligových zápasů" a série výher pro reputaci počítají i přáteláky.
- 🟡 Achievement „Šampion kraje" nedosažitelný (#32); `generateSeasonCalendar` vždy 30 kol → prázdná
  kola se „simulují" a kurzový lístek může nabídnout prázdné kolo; mrtvé cron větve `10 16/15 16`;
  `cups/` prototyp; Drizzle schéma `leagues` je zastaralé.

### Trenér, personál, telefon
- 🟠 **SMS se platí dřív, než je jasné, že přijde odpověď** (`routes/messaging.ts:358`). Druhá SMS během
  čekání, výpadek modelu, majitel firmy „už píše" → 3 Kč pryč, odpověď nepřijde. Hlavička
  `phone-credit.ts` přitom říká „účtuje se JEN to, co spotřebuje model".
- 🟡 U21 nemá taktiku ani motivaci trenéra (`manager-match-bonus.ts:52` hledá `managers` podle id U21).
- 🟡 Rozhovory na HTTP cestě obcházejí přepínač `ai_provider` (`game.ts:7897,8003,8008`) — test ujídá
  produkční kvótu Gemini.
- 🟡 Slib hráči „2 ze 3 zápasů / 30 dní" v reálném čase (`transfers/unrest.ts:199`); staff tick
  zapíše KV příznak před zpracováním; propuštění zaměstnance zruší kurz bez vrácení ceny.

---

## Stav nálezů z auditu 2026-08-10

| Opraveno | Stále otevřené |
|---|---|
| #1 morálka v zápase (±6 %), #2 potenciál jako strop, #3 talent při podpisu, #4 watchlist (zapojen, ale viz nález 9), #6 fiktivní sponzoři, #7 kapacita stadionu, #8a/8b herní čas expirací a voleb, #9 vztahy (síla i efekty, ověřeno v prod datech), #10 náchylnost ke zranění, #17 mimo pozici, #18 chemie, #19 exekutoři, #25 dotace, #26 očekávání fanoušků (ověřeno v datech), #42 mrtvý `transfers.ts` | #5 postup/sestup (jen částečně, viz Soutěž), #11 pražská stamina, #12 počet sponzorů dle reputace (texty), #13 formace 5-4-1/4-2-3-1, #14 hlavičky, #15 noha/strana, #20–22 predikce tréninku, #23, #24, #27, #28, #29, #30, #31, #32, #33, #35, #37, #39, #40, #41, mrtvý kód #44, #45 (`recruitment.ts`), #47, #48, #49, #51 |

## ✅ Ověřeno a funguje

- FE→API: všech 380 volání z frontendu má existující endpoint (žádné mrtvé tlačítko kvůli chybějící adrese).
- Morálka, injuryProneness, počasí, stav hřiště, exekutoři, pokyny na lavičce, tvrdost hry, rozhodčí,
  oslabení po červené — engine je reálně čte.
- Potenciál platí v tréninku, zápasovém růstu i dospívání; produkce: 0 z 1 678 hráčů nad stropem.
- Hodnocení hráče počítá jediný vzorec `overallRatingFromFlat`; brankáři mají sjednocené názvy dovedností.
- Sázky: atomické vypořádání, žádná dvojí výplata, refund při rolloveru. Recovery zaseklých kol (15 min).
- Postup/sestup přebor ↔ III. třída je idempotentní a v jednom batchi.
- Podpis sponzora, splátky půjčky, bazar, sklad bufetu po kvalitách, kapacita stadionu (prod: všech 48 = 150).
- Pořadatelská služba, oplocení, klec (kromě tlumení hlasu), pokuty za výtržnosti, zavřený sektor.
- Trenérská škola, licence, staff efekty dle `ROLE_DEFS`, AI chat zapisuje morálku a vztah.
- Incidenty v klubu: whitelist sloupců, idempotentní zápis, žádný nesoulad UI vs. engine.

## Poznámky k metodě

- Všechny file:line odkazují na snapshot `testing` (06dba119); na `main` se čísla řádků můžou lišit.
- Ověřeno mnou přímo v kódu: nálezy 1–10, volby (FK), mezikolové události, podpis volného hráče,
  SMS kredit. Ověřeno v prod datech: 1, 2, 3, 10, kapacita stadionu, vztahy, očekávání fanoušků, potenciál.
- Ostatní nálezy jsou z čtení kódu průchody; před opravou každého bodu platí protokol
  reprodukuj → root cause → schválení → fix.
