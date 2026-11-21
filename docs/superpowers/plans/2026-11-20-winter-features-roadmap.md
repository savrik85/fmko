# Zimní novinky 2026/27: hlavní plán

> **Pro agenty:** tohle je hlavní plán pro 17 nezávislých funkcí. Každou funkci před začátkem rozepiš do vlastního
> plánu `docs/superpowers/plans/<datum>-<feature>.md` (superpowers:writing-plans, TDD úkoly) a prováděj
> superpowers:executing-plans. Tady jsou rozhodnutí, napojení a pořadí, ne kroky.

**Cíl:** dodat 10 nových herních nápadů z 20. 11. a 7 nehotových z 24. 10.; ty, které souvisí s koncem
sezóny 28. 1. 2027, stihnout a ověřit nanečisto.

**Architektura:** každá funkce je samostatný modul v `apps/api/src/<oblast>/`, napojený na existující háčky
(kabina, Telefon, denní tick, zápasový tick, konec sezóny). Nové tabulky jen přidávacími migracemi.
Postavy mluví přes Telefon (`type='system'` + předpona `participant_id`), peníze jdou jen přes `recordTransaction`.

**Tech stack:** Hono + D1 (apps/api), Next.js 15 (apps/web), Workers AI přes `lib/ai-provider.ts`, vitest.

**Zdroj:** návrhy v konverzaci 2026-11-20, `docs/analyza-chovani-a-navrhy-2026-10-24.md` §5,
mapy kódu od průzkumníků (shrnuté níže u funkcí).

## Globální pravidla

- Identifikátory, soubory, klíče a id v testech anglicky; česky jen texty pro hráče, komentáře a `describe/it`.
- V textech pro hráče žádná dlouhá pomlčka.
- Žádný prázdný catch: server `logger.warn({ module }, "popis", e)`.
- Postavy (hráč, rodič, sudí, starosta, legenda, hospodský) komunikují přes SMS v Telefonu, ne formulářem;
  odpovídají s realistickou prodlevou (minuty, v noci ráno). Výjimka: herní mechanika bez postavy
  (tipovací lístek, dražba) smí mít ovládání na stránce.
- Nálada, vztah a zájem jen slovy; čísla jen u peněz a podmínek.
- AI kluby rozhodují přes model (Workers AI), kód hlídá jen meze a při výpadku zaskočí pravidlo podle povahy.
  Každou odchylku hned nahlásit.
- Nový typ článku v `news`: vlastní rubrika na `zpravodaj/page.tsx` + SMS od „Redakce Zpravodaje“
  (`{type:"guide", href:"/zpravodaj?article=<id>"}`), ověřit v prohlížeči.
- Peníze jen `recordTransaction(db, teamId, type, amount, desc, gameDate, referenceId)` se stabilním
  `referenceId`; nový `TransactionType` i do `PURCHASE_TYPES` a štítků (`transaction-labels.test.ts`).
- Migrace jen `CREATE TABLE/INDEX` a `ALTER TABLE ... ADD COLUMN`, další volné číslo od `0318`.
  `conversations.type` má CHECK, nové kontakty = `type='system'` + nová předpona.
- Nové crony nepřidávat, používat existující háčky: denní tick (`season/daily-tick.ts`), pondělní větev,
  hodinový `30 * * * *` (Telefon), `15 * * * *` (AI trenéři), zápasový tick (`match-runner.ts` po kole).
- D1: dávky, žádné korelované poddotazy přes `matches`/`injuries`, idempotence pro opakovaný běh fronty.
- `REFEREE_POOL_MIX` se nesmí měnit (přejmenoval by sudí).
- Nová dynamická route ve webu musí do `apps/web/add-edge-runtime.sh`.

## Postup u každé funkce

1. Podrobný plán (TDD úkoly) do vlastního souboru.
2. Implementace na větvi `testing`, lokálně: `npx vitest run <soubory>`, `npm run typecheck`.
3. UI nejdřív lokální náhled (next dev, port 3100), uživatel řekne OK.
4. Commit po funkci. **Push na testing jen na výslovné „dej na test“**, prod jen na „nasaď“.
5. Po pushi `/verify`: curl na API + prohlížeč (Chrome, ne Brave), mobil 375 px.

## Na co si dát pozor (napříč funkcemi)

1. **Opakovaný běh** (retry fronty, dvojí cron, dvojklik): žádná dvojí výplata ani dvojí SMS. Test s dvojím
   voláním u každé funkce, která platí nebo posílá.
2. **AI vypnutá** (`ai_provider=off` na testingu): funkce dojede s pravidlem, hra se nezasekne. Test s `ai=null`.
3. **Neaktivní a AI kluby**: nic nesmí čekat na odpověď věčně; každá otázka má lhůtu a výchozí výsledek.
4. **Konec sezóny uprostřed** (otevřená anketa, rozjetý turnaj, otevřená dražba, slib s `due_at` po rolloveru):
   každá funkce řeší, co se stane při `end-season` a rolloveru.
5. **Dlouhé přirozené SMS a 375 px**: rozpoznání záměru testovat dlouhými větami s vulgaritami a překlepy,
   UI na mobilu.

---

## Fáze 0: hlášení chyby (čeká na schválení)

**IV. třída by při přechodu sezóny dostala rozpis.** `season/season-rollover.ts` `rollCalendarsChunk`
vybírá `SELECT id FROM leagues WHERE league_type='senior'` bez `waiting = 0`; `rolloverLeagueCalendar`
kontroluje jen existující zápasy a ≥ 2 týmy, což čekající liga s AI kluby splní. Pak by
`startWaitingLeague` skončil „Soutěž už rozpis má“. Návrh: filtr `AND COALESCE(waiting,0) = 0` + test.
Oprava až po OK, ověřit v běhu nanečisto (F7).

---

## Vlna 1: zima a Vánoce (do ~15. 12.)

### F1: Brigáda a lopaty přes kabinu

- **Ovládání:** trenér napíše do kabiny výzvu (čas, místo, odměna pivem). Síto + model jako u sázky kabiny.
- **Rozhodnutí:** nejvýš jedna brigáda týdně. **Odklad zápasu se nedělá** (zasahuje do rozpisu a fronty).
  Když je u nejbližšího domácího zápasu předpověď sněhu a přijde aspoň 6 lidí, sníh se odklidí zdarma
  s účinností jako firma. Bez sněhu přidá brigáda kondici hřiště. Málo lidí znamená polovičatý výsledek,
  kdo nepřišel s chabou výmluvou, toho to trochu stojí.
- **Kdo přijde:** vztah k trenérovi, disciplína, kocovina (`life_context.hangover`), směna (`occupationMatchAbsence`),
  vzorec ve stylu `persuadeChance` (`messaging/squad-talk.ts:181`).
- **Výsledek:** zpráva kapitána do kabiny s fotkou od Workers AI (nová scéna v `PHOTO_SCENES`) a zápis
  do `village_history` (typ `brigades` už existuje, nejdřív zjistit, co dělá obecní brigáda v `routes/villages.ts`).
- **Napojení:** `messaging/coach-initiated.ts:340` (háčky kabiny), `coach_commitments` s novým `kind='brigade'`
  a `due_at`, vyhodnocení v `settleCoachCommitments`; `stadium/pitch-wear.ts:160` (spotřeba objednávky),
  `season/season-weather.ts forecastForMatch`.
- **Nové:** `messaging/squad-brigade.ts` (`detectBrigadeCall`, `brigadeAttendanceChance`, `settleBrigade`),
  migrace `stadiums.pitch_snow_clearing_volunteer INTEGER DEFAULT 0` (bez poplatku v `applyPitchWear`).
- **AI kluby:** `ai-coach/weekly-decision.ts` už „brigád“ zmiňuje, ověřit a napojit přes model.
- **Testy:** šance podle vztahu a kocoviny; sníh + 6 lidí = úklid bez poplatku; dvojí vyhodnocení = jeden efekt;
  druhá brigáda v týdnu se nespustí.

### F2: Vánoční sálovka (hotovo lokálně 2026-11-21)

- **Jak je to postavené:** samostatný modul `apps/api/src/hall-cup/` s vlastními tabulkami (migrace 0318), ne `kind`
  v `tournaments`: `loadCurrentTournament` bere poslední ročník a P-Mobile může běžet souběžně.
- **Rozhodnutí (upravená):** malá kopaná 5+1, **2 × 10 minut** (při 2 × 20 by se 16 týmů za den nestihlo), dvě hřiště,
  od 9:00 slot po 25 minutách, finále do 16:00. Neděle 27. 12. (26. 12. je sobota). Pozvánka 1. 12. v 9:00 přes SMS
  od „Sportovní hala Prachatice“ (`hc-<cupId>`), přihlášky do 20. 12., los 21. 12., startovné 1 000 Kč při losu,
  bank 50/30/20 %, max 16 týmů kdo dřív přijde, pod 4 se ruší. Zvaní jsou lidské kluby **všech okresů**,
  AI kluby jen z Prachaticka (přes model, při výpadku pravidlo). Sálovka nemá trvalé následky (zranění, karty, únava).
- **Engine:** `MatchConfig.format` (`squadSize`, `durationMinutes`, `chanceScale` 1,3); bez formátu bit po bitu stejné.
- **Web:** `/salovka` (soupiska 6 až 10, skupiny, rozpis, střelci), rubrika „Sálovka“ ve Zpravodaji, SMS od redakce.
- **Běh:** hodinový cron `30 * * * *` a v den turnaje i `15 * * * *`; admin `POST /api/admin/hall-cup/tick?now=`.

### F3: Svatba v kabině

- **Existuje:** pozvánka hráče `casual_wedding` (`messaging/casual-topics.ts:231`, `INVITES.wedding`),
  situace `svatba_spoluhrace` s kocovinou (`incidents/situace-db.ts:61`).
- **Nové:** svatba má datum, často v pátek před zápasem. Odpověď trenéra rozpozná model: přijdu (a pohlídám kluky),
  pošlu dar (částka), nedovolím pít / nejezděte. Dopady: vztah ženicha, kocovina v sestavě přes `prikazAbsence`
  u pijáků (ne los omluvenek, ten musí zůstat deterministický), dar přes `recordTransaction` typ `wedding_gift`.
  Pár dní předem rozlučka se svobodou jako spouštěný incident (`incidents/katalog.ts` vzor `oslava_v_kabine`,
  registrace v `nastaveni.ts`, `stopy.ts`, `tema.ts`, `texty.ts`, `ai-coach/incident-decision.ts`).
  Svatební fotka (nová scéna), krátký článek v klubové rubrice Zpravodaje + SMS od Redakce.
- **Testy:** zákaz = bez kocoviny a horší vztah; „přijdu“ = poloviční kocovina; dar strhne jednou.

## Vlna 2: konec sezóny (do ~20. 1.)

### F4: Anketa Fotbalista okresu

- **Obecný modul anket** (použije ho i F17): `district_polls` (id, district, season_number, kind, status
  `voting|closed`, closes_at, winner_player_id), `district_poll_candidates` (poll_id, player_id, team_id, blurb),
  `district_poll_ballots` (poll_id, voter_kind `team|fan_group`, voter_id, player_id, UNIQUE poll+kind+voter).
- **Nominace 4. 1. 2027:** redaktor (model) vybere 10 z ~25 nejlepších podle statistik sezóny, kód hlídá
  nejvýš 2 z klubu.
- **Hlasování přes SMS:** redaktor pošle trenérům SMS s kandidáty, trenér odpoví volně („dávám Horáka
  z Volar“), model jméno rozpozná, redaktor potvrdí. Pro vlastní hráče hlasovat nejde (redaktor to odmítne).
  Kotle hlasují přes vůdce (model, vlastní hráče smí, váha 0,5). AI kluby přes model.
- **Uzávěrka:** 27. 1. večer v denním ticku, nebo nejpozději ve fázi `awards` (`end-season.ts:304`), co přijde dřív.
- **Vyhlášení:** článek „Fotbalista okresu“ i s tím, kdo koho volil, + SMS od Redakce; vítěz se propíše
  do `season_awards`. Vítěz: lepší nálada, chce přidat (`life_context`), víc zájmu na trhu. Poražený kandidát
  s horkou hlavou pošle trenérovi „proč ne já“.
- **Testy:** hlas pro vlastního odmítnut; druhý hlas přepíše první; remíza rozhodne pořadí podle hodnocení;
  uzávěrka dvakrát = jeden článek.

### F5: Druhý život legend

- **Zjištění:** odchody do důchodu dnes nejsou, hráči odcházejí ze soubojů `decideSeasonDuels`
  (`season/season-duels.ts:88`, člověk i AI), `removePlayer` řádek smaže a archivuje do `departed_players`.
- **Háček:** za úspěšným `removePlayer` v `decideSeasonDuels` (jedno místo pro obě cesty).
- **Kdo je legenda:** věk ≥ 30, nebo aspoň 2 sezóny v klubu (ověřit zdroj délky působení v podrobném plánu).
- **Role** (vybere model podle věku a povahy, pravidlo jako záloha): sudí (`referees`, vlastní id),
  vůdce kotle (`fan_leaders`), hospodský (`sponsor_owners` u sponzora typu `pub`), trenér žáků (`staff_members`
  `trener_mladeze`, jen když je místo volné).
- **Telefon:** nová předpona `ex-`, persona přes model (vzor `sponsors/owner-chat.ts`), první SMS pár dní po
  odchodu, pak občas (hodinový cron Telefonu). Sudí-legenda píše „v neděli vám pískám, žádná protekce“.
- **Článek:** `news.type='legend_farewell'` je ve whitelistech, ale nic ho nevytváří: rozloučení s legendou.
- **Zápas starých pánů** na pouti až ve vlně 4 spolu s okresními akcemi.
- **Nové:** `legends` (id, departed_player_id, first_name, last_name, avatar, former_team_id, role, entity_id,
  district, season_number), `season/legends.ts`.
- **Testy:** mladý hráč legendou není; obsazená role trenéra žáků se nepřepíše; opakovaný háček = jedna legenda.

### F6: Ročenka sezóny

- **Nová wrap fáze** `yearbook` po `recap` (`end-season.ts:33`), jen lidské kluby, po jednom klubu na krok.
- **Podklady:** `league_history`, největší výhry a derby, přestupy mezi lidskými kluby v sezóně, incidenty,
  pár hlášek z hlasovek a SMS hráčů. Prompt „jen ověřená fakta“ jako `news/season-wrap.ts`, pravidlo jako záloha.
- **AI:** `runEndSeasonStep` dnes dostává jen `GEMINI_API_KEY`; předat `AiContext` (`aiContextFromEnv`).
- **Uložení:** `news.type='season_yearbook'` s `team_id`, whitelisty na 4 místech (`news/feed.ts`,
  `social/feed-model.ts`, `routes/club-website.ts`, `routes/public-landing.ts`, web `club-content.ts`),
  sekce Ročenka na klubovém webu a odkaz z obrazovky konce sezóny + SMS od Redakce.
- **Testy:** idempotence fáze; AI vypnutá = text z faktů; AI kluby přeskočeny.

### F7: Konec sezóny nanečisto (~20. 1.)

- Postup podle paměti `reference_konec_sezony_nanecisto.md` (export produ, lokální sqlite, `wrangler dev`,
  smyčka `POST /api/admin/end-season?force=1`).
- **Zkontrolovat:** IV. třída (po opravě z F0), splátky přestupů přes rollover (pondělí, `game_date`),
  hostování přesahující rollover, sliby s `due_at`, anketa F4, legendy F5, ročenka F6, sálovka doběhla,
  pevných 30 kol v `generateSeasonCalendar`.
- Výstup: krátký verdikt uživateli. Opravy podle protokolu chyb, na localhostu, push až na „dej na test“.

## Vlna 3: přestupy a Telefon (únor)

### F8: Sežeň mu práci

- **Trenér → sponzor:** „máte u vás místo pro Nováka?“ Rozšířit `sponsors/requests-db.ts:314 handleOwnerText`
  o záměr `job_for_player`. Rozhodne oblíbenost a obor firmy (`district_sponsors.type`), odpověď píše model.
  Úspěch: `life_context.occupation` na práci ve firmě (menší riziko směn), uzavře situaci `prisel_o_praci`,
  sponzor si později řekne o protislužbu (vzor slibu pořadatelské služby).
- **Hráč se ptá sám:** `casual_job_tip` (`casual-topics.ts:271`) dnes nemá dopad, napojit na totéž.
- **Soupeř láká prací:** AI nabídka občas nese „práci na pile“, nový důvod nespokojenosti `job`
  (`transfers/unrest-reasons.ts`: `REASON_LABELS`, `REASON_SMS`, `DEAL_TEXTS`, `UNREST_ACTIONS`).
- **Testy:** práce u firmy sníží šanci na absenci; bez oblíbenosti sponzor odmítne; důvod `job` má dohodu.

### F9: Zavolat zpátky

- `missed_calls` ADD COLUMN `player_id`, plní `tikHovoru` u volajícího `hrac`.
- V `telefon/Hovory.tsx` tlačítko Zavolat zpátky → endpoint, cena 6 Kč z kreditu, jeden zpětný hovor denně na klub.
- Hráč odpoví hlasovkou (`recordVoiceMessage` s `force`, vlastní limit), proč volal: podle skutečného stavu
  (nespokojenost, zranění, chce hrát, hospoda). Pak běžné SMS, případně druhá hlasovka.
  Sponzor a vůdce kotle: zpětný hovor otevře jejich vlákno zprávou.
- **Testy:** druhý hovor týž den odmítnut a kredit vrácen; důvod odpovídá stavu hráče; hovor bez `player_id` nespadne.

### F10: Drby o přestupech

- V hospodě (`season/pub.ts` u ř. 1397 a 1609) nový drb `transfer_rumour` ze signálů, které manažer jinak nevidí:
  cizí skauti na jeho hráče (`scout_assignments`), zájem AI klubů (`ai-coach/transfer-market.ts`), k tomu
  zhruba čtvrtina drbů nepravdivá.
- SMS hospodského s volbou: pustit to do novin (krátká zpráva, hráč znejistí, cena roste) nebo hráče včas uklidnit
  (sníží budoucí nespokojenost). Drby i o cizích hráčích jako tip na trh.
- **Testy:** drb nikdy neprozradí jméno, které neexistuje; nepravdivý podíl drží; žádný drb bez signálu ani klamu.

### F11: Tipovačka v hospodě

- `pub_tip_rounds` (id, district, calendar_key, stake, status) a `pub_tips` (round_id, team_id, match_id,
  home, away, points); jen lidské kluby okresu; vklad pevně 200 Kč, vlastní zápasy tipovat jde (malý bank, malá motivace).
- Tipovací lístek na `/hospoda`, uzávěrka při zamčení kola; body 3 za přesný výsledek, 1 za tendenci; bank dostane
  nejlepší (dělí se), tabulka tipařů sezóny. Hospodský pošle výsledky SMS.
- Vyhodnocení vedle `settleRound` (`match-runner.ts:1546`) a záchrana v `daily-tick.ts:1509`.
- **Testy:** bank rozdělen beze zbytku; tip po uzávěrce odmítnut; dvojí vyhodnocení = jedna výplata.

### F12: Fotbaloví rodiče v U21

- `youth_parents` (id, player_id, team_id, first_name, last_name, avatar, archetype
  `ambitious_father|worried_mother|sponsor_dad|quiet`), vznikají líně u 2–3 hráčů U21 v klubu.
- Spouštěče: syn dvakrát po sobě neodehrál (`match_player_stats.minutes_played`), zranění, výhra.
  Rodič píše (`yp-` předpona, persona přes model); táta-podnikatel nabídne příspěvek, když syn bude hrát
  (`coach_commitments` nový `kind='parent_deal'` + peníze až po splnění), máma vyhrožuje přestupem do Vimperka
  (nový důvod nespokojenosti `parent`).
- **Testy:** příspěvek až po splnění podmínky; rodiče jen u U21; ticho trenéra = rodič se po lhůtě urazí.

### F13: Dražba hráčů z opuštěných klubů

- `player_auctions` (id, player_id, source_team_id, district, start_price, current_bid, current_team_id,
  ends_at, status `open|sold|unsold`) a `auction_bids`.
- Háček: `wipeAiClubForNewcomer` (`ai-clubs/overwrite.ts:237`) a ruční uvolnění klubu dnes hráče mažou;
  nejlepších 5 půjde do dražby (48 h, start 50 % tržní ceny, příhoz +10 %, příhoz v posledních 10 min prodlouží).
- Uzavření v hodinovém ticku, platba `recordTransaction`, když vítěz nemá na zaplacení, bere další.
  AI kluby přihazují přes model s rozpočtovou mezí. Záložka Dražba na `/prestupy`, push sledujícím.
- **Testy:** příhoz pod minimum odmítnut; prodloužení; bez peněz bere druhý; neprodaný hráč do volných.

## Vlna 4: rozhodčí a okres

### F14: Kritika sudího na Sockách + zákaz lavičky

- **Už existuje:** pozápasové rozhovory o sudím s pokutou a pamětí sudího (`news/post-match-interview.ts`,
  `effectsFor`, `referee_team_relations`, skutek `referee_abuse`).
- **Nové:** `social/relation-effects.ts:168` kritiku sudího dnes ignoruje. Přidat třídu „sudí“
  do `ToneClassifier` a volat stejné efekty jako rozhovor. `competition_sanctions` ADD COLUMN
  `bench_ban_until_gw`: trenér s distancem nemá pokyny na lavičce, střídá automat.
- **Testy:** kritika na Sockách = stejný dopad jako v rozhovoru; distanc vyprší po kole.

### F15: Domácí pomezní s praporkem

- `lineups.linesman` a `lineup_presets.linesman` (JSON `{kind: player|fan_leader, id, style: fair|homer}`),
  vzor `hardness` (migrace 0144, `services/lineup.ts`).
- Engine: `planRefereeError` (`engine/referee.ts:416`) dostane `homeLinesmanTilt`, posune `favourHome`
  u ofsajdu a neuznaného gólu. **Musí dál spotřebovat 4 hodnoty RNG.** Sudí může „domácího“ pomezního vyměnit
  (šance podle přísnosti) a tilt jde na 0. Opakovaně (3× za sezónu) = skutek `linesman_bias` přes `issueSanction`.
- AI kluby volí přes model (schéma `ai-coach/match-decision.ts`). UI na stránce sestavy.
- **Testy:** bez pomezního beze změny výsledků (seed); výměna nuluje tilt; třetí případ = sankce.

### F16: Obálka pro sudího

- Bez nového archetypu (pool se nesmí měnit). `referees` ADD COLUMN `corruptibility`, výchozí odvozené
  z archetypu a id (bafunář, ambiciózní výš).
- Spouštěč: delegace na derby (`fans/fan-rivalries.ts`) se sudím s vysokou úplatností; SMS od sudího (`rf-`),
  nejasná. Volby: zaplatit / ignorovat / nahlásit komisaři.
- `referee_envelopes` (referee_id, team_id, match_id, amount, status, reference_id); zaplacení nakloní spornou
  situaci jen v tom zápase (jako `withRefereeMemory`); nahlášení: lidský komisař dostane SMS s důkazem,
  bez komisaře automatická stopka (`applyRefereePause`). Revize účetnictví (`competition/club-audit.ts auditFlags`)
  může platbu najít → skutek `bribery` přes `issueSanction`.
- **Testy:** zaplacení ovlivní jen jeden zápas; nahlášení stopne sudího; revize platbu najde v okně 60 dní.

### F17: Výběr okresu

- Výběr jako řádek `teams` s `team_type='selection'` za okres (skrytý v přehledech), sestava z hráčů různých klubů
  přes `buildMatchPlayers(..., sourceRows)` (`match-runner.ts:1573`).
- Nominace modulem anket z F4 (`kind='selection'`, 16 hráčů, hlasují trenéři okresu přes SMS od OFS).
- První zápas Prachaticko proti Strakonicku na neutrální půdě, odehrát přes turnajový tick (vzor `tournament/match.ts`).
- Dopady: nominovaní lepší nálada a zájem trhu, opomenutý silný hráč si stěžuje SMS, zranění ve výběru ohlásí SMS
  trenérovi klubu. Článek + SMS od Redakce.
- **Testy:** výběr se neobjeví v tabulkách ani na trhu; statistiky hráčů se připíší správným klubům.

### F18: Zasedání zastupitelstva

- `village_council_sessions` (id, village_id, session_date, pot, status, result JSON) a `village_grants`.
- Jednou měsíčně v pondělní větvi denního ticku: obec má bank, spolky hasiči, myslivci a fotbal.
  Starosta (`village_officials`) jako kontakt `vo-` pozve trenéra SMS, trenér odpoví proslovem, model ho posoudí
  (vzor `judgeSpeech`) spolu s přízní (`village_team_favor`) a preferencemi zastupitelů.
  Dotace `recordTransaction` typ `village_grant`, článek v obecní rubrice + SMS od Redakce.
- **Testy:** bank se rozdělí beze zbytku; bez proslovu dostane fotbal minimum; dva kluby v obci soutěží o jeden bank.

### Zápas starých pánů (k F5, po F18)

Na okresní akci (pouť) zápas legend klubu proti bývalému klubu přes přátelákový engine.

---

## Pořadí a termíny

| Vlna | Funkce | Termín |
|---|---|---|
| 0 | hlášení IV. třídy | hned, oprava po OK |
| 1 | F2 sálovka (první, nejbližší termín), F1 brigáda, F3 svatba | sálovka přihlášky 1. 12., hraje se 27. 12. |
| 2 | F4 anketa, F5 legendy, F6 ročenka, F7 nanečisto | nominace 4. 1., nanečisto ~20. 1., konec 28. 1. |
| 3 | F8–F13 | únor |
| 4 | F14–F18 + staří páni | březen |

## Stav 2026-11-21 (lokálně na `testing`, nepushnuto)

| Funkce | Commit | Migrace |
|---|---|---|
| F1 brigáda | cd71070d | 0319 |
| F2 sálovka | 8b002db5, 414ec168 | 0318 |
| F3 svatba | 76257d5b | 0320 |
| F4 Fotbalista okresu | 8d55ecdd | 0321 |
| F5 legendy | 1101b823 | 0322 |
| F6 ročenka | 17410f54, a642d995 | – |
| F7 nanečisto | čeká na ~20. 1. | – |
| F8 práce u sponzora | 8b4a1406 | 0323 |
| F9 zavolat zpátky | 7214b0f3 | 0324 |
| F10 drby | 92efbc4d | 0325 |
| F11 tipovačka | cdedb9e1 | 0326 |
| F12 rodiče U21 | 7fdebb48 | 0327 |
| F13 dražba | d67258e0 | 0328 |
| F14 kritika sudího na Sockách | 4c6f9023, 1b32d786, 4111323b | 0330 |
| F15 domácí pomezní | 487be769 | 0329 |
| F16 obálka pro sudího | 993dcb7a | 0331 |
| F17 výběr okresu | 732c12b3 | 0333 |
| F18 zastupitelstvo | 954f4c38, 85a60fd4 | 0332 |
| staří páni | 0005076d | – |

Při nasazení pustit všechny migrace 0318–0333 (na `prales-db-test` jsou zatím jen 0318, 0326, 0328).
