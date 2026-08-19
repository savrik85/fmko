# Audit nefunkčních mechanismů — 2026-08-10

Read-only audit celého enginu (7 paralelních průchodů: zápasový engine, trénink, přestupy,
finance, vesnice/vztahy, sezóna/liga, orchestrace). Cíl: mechanismy, které UI zobrazuje,
ale engine je nepočítá, počítá jinak, nebo se nikdy nespustí. Žádné změny kódu nebyly provedeny.

Legenda: 🔴 vysoká (hráč je aktivně klamán / špatný výsledek), 🟠 střední (nesoulad UI vs. engine),
🟡 nízká (kosmetika, mrtvý kód).

---

## 🔴 VYSOKÁ ZÁVAŽNOST

### 1. Morálka nemá žádný vliv na výsledek zápasu — nápověda tvrdí opak
- **UI:** `apps/web/src/app/dashboard/napoveda/page.tsx:149` („Ovlivňuje výkon v zápase."),
  `apps/web/src/lib/attribute-info.ts:70` („Nízká morálka snižuje výkon."), sloupec „Mor" v sestavovači.
- **Engine:** `apps/api/src/engine/simulation.ts` — `p.morale` se na desítkách míst **zapisuje**
  (góly L455–468, vztahy, protiútoky, standardky), ale žádná funkce počítající pravděpodobnosti
  (`calcPossession` L66–75, `calcChanceProb` L80–133, `calcGoalProb` L138–175) morálku **nečte**.
- **Řetězová slepá ulička** — jediný efekt těchto mechanismů je zápis do morálky, která nic nedělá:
  - kapitán („C" badge) — jen morale bonus (simulation.ts:462–468)
  - vůdcovství (leadership) hráčů — jen vstup do morale výpočtu (L453–456)
  - Motivace manažera (`season/manager-match-bonus.ts` `moraleBonus()`) — nápověda ji popisuje (napoveda:175)
  - **domácí výhoda z fanoušků** — `match-runner.ts:450–463` `homeAdvantageFromFanbase()` aplikuje
    výsledek výhradně na morálku; do `homeAdvantage` proměnné (kterou engine skutečně čte) se nedostane nic
  - šatny/kotel (`facilityEffects.homeMoraleBonus`), psycholog v zápase
- **Bonus:** hodnoty v nápovědě („+3 až +7 / −2 až −5") jsou zastaralé — kód má `// 2-4 (was 3-7)`.

### 2. Potenciál hráče (`skills_max`) nikdy nefunguje jako strop růstu
- Generátor přiděluje individuální strop dle úrovně soutěže (`skills/generator.ts:11–19`,
  `SKILL_RANGES_BY_LEVEL` v `skills/types.ts:69–75`), uložený do `skills_max`.
- Reálný trénink strop ignoruje: `season/training.ts:349–354` — `if (current < 100) current + 1`.
  Každý hráč jde dotrénovat na 100 ve všem.
- Paralelní implementace respektující `maxPotential` (`skills/training.ts:53–75`) je mrtvý kód —
  exportuje ji jen `skills/index.ts`, který nikdo neimportuje.

### 3. „Skrytý talent" u nabídek dorostenců se při podpisu ztratí
- **UI:** badge „✨ Talent vysoký/střední/nízký", tooltip „odhalí se postupně tréninkem"
  (`dashboard/transfers/page.tsx:1775–1778`).
- **Realita:** `events/player-offers.ts:143` ukládá hodnotu do `personality.hiddenTalent` (JSON),
  ale INSERT při přijetí (`routes/game.ts:6150–6155`) sloupec `hidden_talent` nepřenáší → DB default 0.
- I kdyby se propsala: `hidden_talent` v tréninku (`season/training.ts:293–442`) vůbec nefiguruje —
  je to jen statický bonus do `overall_rating` (`skills/generator.ts:158–160`). Text tooltopu je fikce.
- U volných hráčů se `hidden_talent` přenáší správně — bug je izolovaný na organické nabídky.

### 4. Watchlist push notifikace nikdy nechodí — volá je jen mrtvý router
- `sendWebPushToPlayerWatchers` (`community/web-push.ts:294–315`) je funkční, ale volá ji **jen**
  `routes/transfers.ts` — a ten **není namountovaný** (`index.ts:63–76` ho neobsahuje, grep bez výsledku).
- Živé ekvivalenty v `routes/game.ts` (release:4128, bid accept:4960, offer accept:5608) watchers nevolají.
- Sledovaný hráč („☆ Sledovat", `player/[id]/page.tsx:527–533`) přestoupí a sledující se nic nedozví.
- **Vedlejší nález:** `routes/transfers.ts` = 828 řádků mrtvého kódu duplikujícího (starší a chybnější
  verzí) živou logiku v `game.ts` — riziko, že někdo bude „opravovat" mrtvý soubor.

### 5. Postup/sestup v tabulce je čistá kosmetika
- **UI:** `dashboard/liga/page.tsx:536–594` — zelená 1.–2. místo, červená poslední dvě, legenda „Postup"/„Sestup".
- **Engine:** `league/promotion.ts:48–55` označen `TODO: ZATÍM NEZAPOJENO`, `calculatePromotions` se nikde
  nevolá. `season-rewards.ts:4` explicitně: „BEZ postupů/sestupů." Liga má jedinou úroveň
  (`league-generator.ts:96–97`), pyramida neexistuje. Konec sezóny žádnou promotion fázi nemá.

### 6. Finanční přehled ukazuje fiktivní sponzory, kteří se nikdy nepřipíšou
- Bez podepsané smlouvy si `/api/teams/:id/budget` **vygeneruje falešné sponzory** jen pro zobrazení
  (`routes/game.ts:625–630`) a započítá je do `weeklySponsorIncome` i prognózy („Bankrot za…").
- Skutečný týdenní processor (`finance-processor.ts:197–207`) čte jen `sponsor_contracts WHERE status='active'`
  → reálný příjem 0. Prognóza rozpočtu je systematicky zkreslená.
- Navíc seed `createRng(teamId.charCodeAt(0))` — mnoho týmů vidí identické fiktivní sponzory.

### 7. Kapacita stadionu — tři nekonzistentní výpočty
- Přímý upgrade tribun **přičítá absolutní hodnoty místo delty**: `routes/game.ts:1682–1688`
  (L0→3 přičte 50+150+300=500 místo 300).
- Obecní spolufinancovaný upgrade (`routes/villages.ts:1240–1246`) zvedne úroveň, ale `capacity` **nezapíše**.
- Zápasový engine si navíc bonus z úrovně tribun přičítá při každém použití znovu
  (`match-runner.ts:312`, `stadium-generator.ts:266`) → zobrazená „Kapacita" prakticky nikdy
  neodpovídá limitu použitému v zápase.
- **K tomu:** `/api/teams/:id/fanbase` čte z neexistující tabulky `stadium` (správně `stadiums`),
  `.catch()` chybu spolkne → kapacita na fans stránce **vždy 200** (`routes/teams.ts:3086–3095`).

### 8. Míchání herního a reálného času
- **Nabídky hráčů + návraty z hostování:** expirace se zapisuje v herním čase
  (`events/player-offers.ts:133`, `routes/game.ts:5731–5733`), ale cleanup v daily ticku porovnává
  s reálným časem (`daily-tick.ts:1332,1371` — `executeDailyTick` se vždy volá bez `gameDate`).
  Při `game_clock.offset_days ≠ 0` expirují buď okamžitě, nebo nikdy. Vzor už byl jednou opraven
  (`gameExpiry`/`isGameExpired` pro petice/brigády) — sem se oprava nedostala.
- **Volby zastupitelstva:** UI slibuje „každé 4 sezóny" (`obec/page.tsx:502`), ale
  `processElections()` (`village-processor.ts:194–209`) porovnává `new Date()` proti mandátu
  `now + 4 reálné roky` (`officials-store.ts:30,56–58`). Hráč volby neuvidí, dokud nehraje 4 reálné roky.
- **Smart-skip tréninku:** kontrola „zápas do 24 h" používá u tréninku reálný čas (`daily-tick.ts:242–245`),
  u nákladu za trénink herní čas (`daily-tick.ts:1150–1154`) — při offsetu se rozejdou
  (trénink zdarma / náklad bez tréninku).

### 9. Vztahy hráč–hráč: mrtvá síla a fantomové efekty
- **`strength` se nikdy nezapíše:** generátor počítá diferencovanou sílu (bratři 70–95…,
  `generators/relationships.ts:70–174`), ale INSERT (`routes/teams.ts:376–377`,
  `league/insert-ai-teams.ts:777–778`) sloupec vynechává → DB default 50. Empiricky ověřeno na test DB:
  445/445 záznamů = 50. Řazení „nejsilnější první" v detailu hráče je fakticky insertion-order.
- **4 z 9 typů vztahů slibují neexistující efekt:** `EFFECT_MAP` (`routes/game.ts:254–264`) popisuje
  u coworkers/neighbors „+1 morálka", classmates „+2 chemie", in_laws tření — žádný z těchto typů
  se v enginu nikde nepoužívá.
- **Nepřesné popisy fungujících:** bratři „+5 morálka" → realita +1 jen při gólu (+ neuvedený +15 %
  na přihrávky); otec–syn „mentoring" → mentoring má jen `mentor_pupil`; rivalové „−2 v sestavě" →
  realita −3 týdně bez ohledu na sestavu (+ neuvedený +15 % na fauly); pijáci „riziko absence po výhře" →
  neimplementováno.

### 10. „Náchylnost" ke zranění nemá vliv na to, koho zranění potká
- **UI:** zobrazena dokonce dvakrát (`player/[id]/page.tsx:835` physical + `:858` personality).
- **Engine:** `simulation.ts:623–625` — `rng.pick(allPlayers)`, rovnoměrný výběr; `injuryProneness`
  v `MatchPlayer` (`engine/types.ts`) neexistuje.

### 11. Překlep `"stamina"` — pražská varianta Letního soustředění nikdy nedá vytrvalost
- `seasonal-events.ts:630–631` používá typ efektu `"stamina"`, ale `event-effects.ts:54` zná jen
  `"stamina_boost"` (mimopražská varianta ho používá správně). Efekt se tiše přeskočí —
  postihuje jen týmy z okresu Praha, UI přitom ukáže potvrzení.

### 12. Sponzoři vs. reputace — dvojí klam
- Stránka Reputace slibuje víc nabídek s reputací (3/4/5, `reputace/page.tsx:289–291`,
  `routes/game.ts:7317`), ale `generateSponsors()` (`season/economy.ts:85–87`) počet určuje
  **jen podle velikosti obce** (max 3); reputace ovlivňuje jen částky.
- Text „Reputace X+" na kartě nabídky (`sponsors/page.tsx:469`) se generuje z výše nabídky
  (`routes/game.ts:1999–2000`) a při podpisu se **nevaliduje** — jde podepsat cokoliv.

---

## 🟠 STŘEDNÍ ZÁVAŽNOST

### Zápasový engine
13. **Formace 3-5-2 a 4-5-1 nikdy nedostanou taktickou synergii** — `TACTIC_CATALOG.formationSynergy`
    (`engine/tactics.ts:37–68`) je definovaná jen pro 4-3-3, 3-4-3, 5-4-1, 5-3-2, 4-2-3-1, 4-4-2;
    neznámá formace = neutrální 1.0 (`tactics.ts:104–108`). 5-4-1 a 4-2-3-1 navíc v UI nejdou vybrat
    (mrtvé záznamy).
14. **„Nakopávaná" slibuje bonus na hlavičky** (`tactic-info.ts:18–21`), ale podíl hlavičkových šancí
    je konstanta `0.3` (`simulation.ts:148`) bez ohledu na taktiku.
15. **Noha a strana hráče** — zobrazeny (`player/[id]/page.tsx:808–809`), načtené do `MatchPlayer`,
    ale simulace je nikde nečte.
16. **Magnitudy tooltipů taktik nesedí** — „~1.3×" (`tactic-info.ts:8,16`) vs. reálných 1.15
    (`simulation.ts:41,43`).
17. **„Mimo pozici ztrácí ~30 %"** (`napoveda:156`, `lineup-strength.ts:184`) — realita je 10–40 %
    na 1–3 konkrétních statech dle kombinace (`simulation.ts:254–267`).
18. **Klientská „Chemie" v sestavovači** (`match/page.tsx:401–428`) je lokální odhad s vlastními
    vahami, nikam se neposílá; server počítá vztahové efekty nezávisle a jinak.
19. **Exekutoři penalt/standardek** — hotový backend (`roles` endpoint, `game.ts:1811–1857`,
    DB sloupce), žádné UI ho nevolá a engine by ho stejně ignoroval (vybírá dle `setPieces`,
    `simulation.ts:590–592`).

### Trénink
20. **Predikce „Co to přinese" ignoruje per-den typy** — server počítá z jediného `body.type`
    (`routes/game.ts:442–462`), reálný tick správně čte typ per den (`daily-tick.ts:232`).
21. **Widget „Jak to kádru sedí" ztrácí hráče** — `loadVerdict()` (`season/training.ts:74–80`)
    vrací i `"neutralni" as never`, volající počítá jen 3 stavy → hráči v mezeře zmizí z pruhu.
22. **Konstanta docházky v predikci** 0.08 vs. engine 0.1 (`routes/game.ts:427` vs.
    `simulateAttendance`) — komentář „aby predikce nelhala" v tomto detailu lže.

### Přestupy
23. **Mzdový faktor u podpisu volného hráče je neutralizovaný** — FE vždy pošle přesně požadovanou
    mzdu (`transfers/page.tsx:1444`), takže `wageScore` (`player-agency.ts:135–144`) nikdy nerozhoduje;
    větev „směšná nabídka" je nedosažitelná.
24. **Expirace nabídek: dopad na hráče má tichý strop 20/den** — `transfer-pressure-tick.ts:25,51–64`:
    dopad (`applyOfferRejectionImpact`) jen na LIMIT 20 bez ORDER BY, ale hromadný UPDATE expiruje vše →
    nabídky nad limit expirují bez dopadu, nenávratně.

### Finance / obec / fanoušci
25. **Dotace v `/budget` ignoruje přízeň obce** — pevná tabulka (`routes/game.ts:639–640`) vs.
    reálný multiplikátor 0.5–1.5× (`finance-processor.ts:217–237`), který UI obce správně popisuje.
26. **`fans.expected_performance` je navždy 50** — jediný zápis je INSERT s 50
    (`fans-processor.ts:238`), žádný UPDATE; mechanika „překvapivá výhra" reaguje jen na reputaci soupeře.
27. **Pub-visit endpoint nevrací `effects`** — FE čeká `effects` pro potvrzení (`events/page.tsx:392–423`),
    BE vrací jen `{ok, choice}` (`routes/game.ts:1075`); „Zakázat" aplikuje −3 morálku neviditelně.
28. **„Místní hrdost"** slibuje favor za nastupování rodáků (`obec/page.tsx:990`), engine dává favor
    jen za hattrick/MOTM (`village-processor.ts:100–186`).
29. **Krize „sponsor exit" sponzora nezruší** — jen jednorázová transakce −3000 Kč
    (`village-processor.ts:736–739`); slibovaná „charity" cesta zpět neexistuje.
30. **„Zabijačka": fiktivní statistika** — UI „50% šance na absenci při alkohol > 60"
    (`seasonal-events.ts:34`), realita: deterministicky −20 kondice při alkohol > 50, s absencí
    to nesouvisí (`event-effects.ts:66–84`).
31. **Potvrzení události ukazuje neškálovanou reputaci** — endpoint vrací surová `choice.effects`
    (`routes/game.ts:1020`), reálný zápis tlumí `gainFactor` (0.25–0.75× při vysoké reputaci,
    `lib/reputation.ts:39–44`).
32. **Achievement „Šampion kraje" je navždy nedosažitelný** — `award(..., "champion", ...)` se nikde
    nevolá (konec sezóny odemyká jen `season_champion`, `season-archive.ts:131`); „krajský přebor"
    jako soutěž neexistuje.

---

## 🟡 NÍZKÁ ZÁVAŽNOST / KOSMETIKA

33. „Pozdní příchod" (disciplína ≤ 20) je jen komentářový text — hráč nic nezmešká (`simulation.ts:401–410`).
34. Typ zranění bez diakritiky v tooltipu — „Zraněný — zebra" (`match-runner.ts:818–822` →
    `squad/page.tsx:429–434`); chybí lookup na český popisek.
35. Auto-návrat z hostování generuje zprávu „Jméno (0, ) se vrací…" — SELECT nenačítá věk/pozici
    (`daily-tick.ts:1330–1354`); ruční ukončení to dělá správně.
36. Widget tržní hodnoty kádru duplikuje vzorec `estimateMarketValue` na FE
    (`squad-widgets.tsx:26–33` vs. `season/economy.ts:278–288`) — dnes sedí, nic nehlídá rozjetí.
37. `drainMap` v daily-tick má nedosažitelné klíče (`passing`/`defense`/…, `daily-tick.ts:512–519`) —
    `tactics`/`match_practice` padají na default.
38. Zastaralý text „kondice −3 až −5" u tréninku před zápasem (`training/page.tsx:446`) —
    po zavedení intenzity je rozsah ~2–6+.
39. „Pivo se zastupitelem": slib +2 až +4 přízně, realita max +2 (`routes/villages.ts:1072–1074`).
    V UI unikl interní text „po zavedení Sprintu B" (`obec/page.tsx:961`).
40. „Skaut z vyšší ligy" v hospodě — narativní teaser bez mechaniky (přiznáno komentářem, `pub.ts:783`).
41. Mrtvé cron větve `10 16`/`15 16` v `index.ts:157` — takové crony nejsou definované.

### Mrtvý kód (riziko údržby, ne přímý klam)
42. `routes/transfers.ts` — 828 řádků, nenamountováno (viz nález 4).
43. `injuries/injury-generator.ts` — celý modul nevolaný; zranění vznikají ad-hoc na 5 místech.
44. `season/aging.ts` — nevolaný; obsahuje latentní bug `Math.min(20, value + growth)`
    (při zapojení by atributy SNIŽOVAL na 20).
45. `season/youth.ts`, `season/recruitment.ts` — nedosažitelné (barrel `season/index.ts` nikdo neimportuje).
46. `skills/training.ts` (`trainSkill` s respektem k potenciálu) — navržený, nikdy nezapojený (viz nález 2).
47. `season/naming-rights.ts` — nevolaný duplikát; živou verzi má `routes/game.ts:1990–2046` inline.
48. `cups/` (s „s") — osiřelý prototyp; reálný pohár je `cup/cup.ts`.
49. `monetization/premium.ts` + `COSMETIC_CATALOG` — scaffold bez napojení.
50. `events/match-absences.ts` `resolveMatchContext` — nahrazeno, nevolané.
51. `stadium-generator.ts` `refreshmentPerAttendee` — mrtvé pole.
52. Nedosažitelné katalogové formace 5-4-1 a 4-2-3-1 (viz nález 13).

---

## ✅ Ověřeno a funguje správně

- **Taktika a formace** (pro 4 ze 6 formací): skill-fit × synergie × sehranost reálně škáluje modifikátory;
  sehranost se ukládá po zápase a funguje pro všech 6 formací.
- **Kondice v zápase**: reálně tlumí šance (floor 0.45), drén dle staminy/alkoholu/pressing, poločasová regenerace.
- **Standardky (setPieces), Konzistence, Clutch, počasí** — reálně čteny v pravděpodobnostních funkcích.
- **Staff efekty**: gólmanský/kondiční trenér, lékař, psycholog (mimo zápas), šéf fanklubu → návštěvnost —
  vše zapojeno dle `ROLE_DEFS`.
- **Manažerské atributy** (koučink, mládež, disciplína, taktika, motivace-mimo-zápas) — plně zapojené.
- **Trénink**: per-den typ i intenzita se aplikují 1:1, smart-skip, U21 dědí plán, „Růst" sloupec sedí.
- **Domácí/hosté logika simulace** — žádný prohozený index.
- **Statistiky hráčů** — góly/asistence/karty/rating/clean sheets/MOM korektně inkrementovány.
- **Tabulka ligy** — řazení body → skóre → vstřelené, jen aktuální sezóna.
- **Pohár** (`cup/cup.ts`) — losování, pavouk, cron wiring, idempotence přes `claimed_at`.
- **Konec sezóny** — 10 fází, +1 věk, deterministická ocenění; síň slávy sedí s realitou (mimo nález 32).
- **Zranění a suspendace** — server-side blokace v sestavě, denní léčení.
- **Truc/unrest systém** — sliby s reálným vymáháním (`checkMinutesPledge`), decay, fake zranění s nápovědou.
- **Player-interest** — deterministické faktory, reálný dopad při odmítnutí; virtuální týmy s cooldowny.
- **Finance týdenní cyklus** — mzdy, údržba, amortizace, win-bonusy, vstupné, promo, autobusy, koncese;
  půjčky 15 % bez zdvojení.
- **Equipment** — všechny bonusy konzumovány (trénink, morálka, zranění, kotel, počasí, mládež…).
- **Hospoda/kabina** — centrální efekt-pipeline (text + zápis v jednom objektu), hangover reálně
  ovlivňuje absence i zápas.
- **Telefon/AI konverzace** — jednotná pipeline vždy zapíše morálku/kondici/vztah; strukturálně
  nemůže „zapomenout" zápis.
- **Idempotence cronů** — KV guard / DB row-lock / claimed_at; match tick zpracovává všechny ligy
  v jedné invokaci s `recoverStuckRounds`.

---

## Poznámky

- `game_clock.offset_days` nebylo možné ověřit z tohoto prostředí (chybí wrangler auth v subagentech) —
  určuje, jestli nálezy 8a/8c aktuálně reálně škodí, nebo jsou „spící" (po season rolloveru se offset
  resetuje na 0). Ověřit: `SELECT * FROM game_clock` na test/prod.
- Memory `reference_cron_match_processing.md` byla podle zjištění auditu zastaralá (1 liga/invokaci +
  KV tracking → dnes všechny ligy + DB zámek) a byla aktualizována.
- Nálezy pocházejí ze 7 nezávislých read-only průchodů s file:line důkazy; klíčové nálezy
  (mrtvý `strength`, fiktivní sponzoři, morálka, watchlist) byly potvrzeny křížově dvěma způsoby
  (grep volajících + čtení obou stran UI/engine), ale před opravou každého jednotlivého bodu platí
  protokol: reprodukuj → root cause → schválení → fix.
