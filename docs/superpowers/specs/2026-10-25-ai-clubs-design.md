# AI kluby jako normální kluby, spuštění ligy ČB a III. třída Prachatice

Datum: 2026-10-25 · stav: návrh k odsouhlasení

Tři části:

1. spuštění ligy České Budějovice,
2. nová III. třída Prachatice,
3. AI kluby, které se chovají jako normální kluby (největší část).

Část 2 jde první, aby III. třída stihla odehrát celou sezónu 3, která končí ve čtvrtek
28. 1. 2027. Liga ČB se otevře registracím s fází 2, až AI kluby nebudou mrtvé (viz Pořadí).

## Proč

AI kluby jsou dnes mrtvé. Data z produkce, 25. 10. 2026, přebor Prahy:

| | AI kluby (5) | aktivní lidské kluby (5, přihlášení do 30 dní) |
|---|---|---|
| průměr nejlepší jedenáctky | 29,2–34,5 | 45,7–66,1 |
| stav trávníku | 5 | 50–100 |
| zaměstnanci | 0 | 0–13 (čtyři z pěti mají 10 a víc) |
| aktivní sponzorské smlouvy | 0 | 2–8 |
| přístavby, vybavení, akademie | nic | běžně |

Stejně jsou na tom tři opuštěné lidské kluby v Praze (Autolakovka a Kebab od dubna, Kobylisy od srpna).

Příčiny v kódu:

- AI kluby netrénují: denní trénink načítá jen `user_id != 'ai'` (`season/daily-tick.ts:250-261`).
  Lidské kluby za sedm měsíců vyrostly, AI kluby stojí.
- Vznikají schválně slabší: kádr z o kategorii menší obce a navíc srážka 6–12 bodů (`aiTeamShift`,
  `generators/create-player.ts:134-140`, `routes/teams.ts:720-724`).
- Nemají řádek stadionu ani vybavení, dokud někdo neotevře jejich stránku (`routes/game.ts:1546-1580`,
  `equipment/equipment-service.ts:22-48`). Nenajímají zaměstnance, nemají sponzory.
- Nehrají na trhu. Nabídka na jejich hráče je zakázaná („Nabídky lze posílat jen lidským týmům“,
  `routes/game.ts:6491`), samy nekupují ani neprodávají.
- Sestava je vždy 4-4-2 vyrovnaně, bez kapitána, lavičky a plánu (`createAutoLineup`,
  `multiplayer/match-runner.ts:1955-2018`). Jediné, co AI volí, je tvrdost (`decideAiHardness`).
- Podrobný seznam všech výjimek je v příloze A.

## Rozhodnutí uživatele (2026-10-25)

- AI kluby se mají tvářit i chovat jako normální kluby. Jediný viditelný rozdíl: u jména trenéra
  je vždy štítek „(AI)“.
- Rozhodují přes Cloudflare Workers AI (startupové kredity 5 000 $, vyprší 16. 2. 2027).
  AI trenéři nic nepíšou, takže slabší čeština modelů nevadí.
- AI kluby se starají o stadion, nakupují a prodávají hráče. Skutečný hráč je nesmí jít ojebat,
  mají se chovat podobně jako skuteční hráči.
- Jednorázové narovnání podmínek: hráči, stadiony, vybavení atd. V Praze mají být
  konkurenceschopné. Pak žijí vlastním životem a různé kluby se vyvíjejí různě kvalitně.
- Opuštěné lidské kluby v Praze převezme AI trenér.
- Odstartuje liga v Českých Budějovicích.
- Nová nižší liga v okrese Prachatice z menších obcí, které nehrají přebor. Zatím bez postupu
  a sestupu mezi ligami.
- Crony ani prostředky nejsou omezení.
- Rozhovory AI trenéři nedělají (Gemini je z jiného rozpočtu).

## Cíle

1. AI klub nejde od lidského rozeznat jinak než štítkem „(AI)“ u trenéra.
2. Stejná pravidla. Každá herní mechanika platí i pro AI klub a AI trenér smí jen to, co smí člověk:
   stejné ceny, limity, podmínky odemčení, lhůty.
3. Lidské a pestré chování. Každý AI trenér má vlastní povahu, takže se kluby vyvíjejí různě.
4. Na AI klubech se nedá vydělávat podvodem (viz Přestupy).
5. Jednorázově srovnaný start, potom přirozený vývoj bez dalšího přifukování.
6. Liga ČB je otevřená novým hráčům a má živé AI kluby, III. třída Prachatice odehraje už tuto sezónu.

## Necíle

- AI trenér nepíše: žádné rozhovory, tiskovky, SMS, chaty ani texty klubového webu přes jazykový model.
  Žádné nové volání Gemini. Kde už dnes existuje šablonový text (předzápasové prohlášení podle
  povahy, časová osa nabídky), zůstává.
- AI kluby nehlasují, nekandidují a neobsazují místa v grémiu soutěže ani v obecní politice.
- Postup a sestup mezi přeborem a III. třídou zatím ne.
- Turnaj P-Mobile zůstává jen pro lidské kluby.
- Ruční sestava U21 ne (nemá ji nikdo).
- Žádný „dokonalý“ optimalizátor (například zkoušení sestav tisíci simulacemi). AI má hrát jako
  rozumný člověk, ne nadlidsky.

## Čeho se vyvarovat (selhání, i kdyby to technicky fungovalo)

- AI klub, na kterém si člověk nahrabe: levně koupí oporu, draze prodá šunt, opakovanými nabídkami
  vyzkouší, kolik AI chce, nebo přes AI klub přelévá peníze či hráče.
- AI kluby rozfoukají ekonomiku: peníze mají jen ze stejných zdrojů jako lidé (vstupné, občerstvení,
  sponzoři, prodeje).
- AI kluby všechno vyhrávají, nebo zůstanou mrtvé.
- Výpadek jazykového modelu zastaví zápas nebo tick. Zápas na model nikdy nečeká.
- „AI“ vidět všude (šedé řádky, odznaky, zakázané akce) kromě štítku u trenéra.
- Vyšší útrata za Gemini.

---

## Část 1: spuštění ligy České Budějovice

Na produkci: OP České Budějovice (13 AI klubů + lidský FK Řeznictví Černý České Budějovice) a jeho
U21 liga. Liga se hraje (fronta ji simuluje), ale okres je v registraci zavřený („v přípravě“,
`registration/district-access.ts:9`), takže nikdo nový nepřijde. AI kluby jsou mrtvé jako všude:
síla nejlepší jedenáctky 28,8–37,4, dva kluby nemají ani řádek stadionu (data z produkce).

- **Otevření**: okres ČB se otevře registracím (`district_registrations` z `preparing` na `ready`,
  zápis na produkci se souhlasem). Okamžitá registrace jako v Prachaticích a Praze, ČB na úvodní
  stránce mezi okresy, kde se hraje.
- **Kdy** (moje volba): s fází 2, až budou AI kluby živé a narovnané. Nováček z reklamy nemá přijít
  do ligy mrtvých klubů.
- **AI kluby ČB** projdou celou částí 3 a narovnáním (3.8). ČB nemá vzor z aktivních lidských klubů
  (kromě Řeznictví) a budou sem chodit nováčci, kteří začínají s čerstvým kádrem. Cíl
  (moje volba, můj odhad): síla mezi úrovní nově založeného lidského klubu (změřit generátorem)
  a nejslabším aktivním klubem přeborů Prachatice a Prahy (dnes 45,7). Stadion, vybavení
  a zaměstnanci skromněji než ve vyspělých přeborech. Nováček tak může hrát o střed tabulky.
- **Řeznictví Černý** zůstává, jak je.
- **Nová registrace** v ČB přepíše AI klub stejně jako jinde (3.9).
- **Kód**: zrušit vyloučení ČB ve smyčkovém režimu (`index.ts:376-383`,
  `season/league-round.ts:130-148`), aby se ČB zpracovala v obou režimech.
- **Kapacita**: viz část 2.

## Část 2: III. třída Prachatice

Kód III. třídu umí od 29. 9. (`league/district-leagues.ts`), na produkci ale neexistuje.
Vznikla by sama s první registrací v okrese, z náhodných obcí a s rozpisem až po konci sezóny.
Založíme ji teď ručně a rovnou s rozpisem.

- **Liga**: úroveň `okresni_soutez`, název „III. třída Prachatice“, 14 klubů, k ní U21 liga jako
  u ostatních (lidé, kteří kluby později převezmou, U21 čekají).
- **Obce** (moje volba): 14 největších obcí okresu bez klubu, kromě okresního města Prachatice
  (11 049 obyvatel, to není „menší obec“, zůstane volné pro budoucího hráče):
  Netolice 2 744, Husinec 1 791, Lhenice 1 700, Strunkovice nad Blanicí 1 200, Stachy 1 100,
  Zdíkov 1 050, Záblatí 730, Lenora 700, Malovice 680, Ktiš 520, Šumavské Hoštice 480,
  Strážný 450, Horní Vltavice 420, Lažiště 400. Zdroj: tabulka `villages` na produkci.
- **Kluby** vzniknou jako plnohodnotné AI kluby (část 3): jméno, barvy, trenér, stadion, vybavení,
  čísla dresů, bydliště a dojíždění hráčů. Síla podle narovnání v 3.8.
- **Rozpis** (moje volba): dvoukolově 26 kol, **středa a neděle v 18:00** (vlastní dny, přebor hraje
  pondělí a čtvrtek), U21 den po áčku. Bez vánoční přestávky. První kolo je nejbližší středa nebo
  neděle aspoň dva dny po založení. Poslední kolo nejpozději ve čtvrtek 28. 1. 2027, aby liga
  nezdržela konec sezóny. Když se kola nevejdou, doplní se páteční kola v posledních týdnech,
  nejvýš tři kola týdně. Dnešní generátor umí jen pondělí a čtvrtek a jen celou sezónu
  (`season/calendar.ts:59-121`), takže potřebuje dny podle ligy a rozpis „na zbytek sezóny“.
- **Bez postupu a sestupu**: přepínač podle okresu (nebo ligy), který respektuje
  `league/district-promotion.ts` i `leagueMovement` u slibů sponzorům
  (`sponsors/negotiation-db.ts:414,459`). Text o postupu 2 za 2 na úvodní stránce
  (`components/landing/landing-page.tsx:37,143`) upravit.
- **Registrace**: nový hráč z Prachatic převezme klub III. třídy (stávající pravidlo: nejvyšší liga,
  kde ještě jsou AI kluby). Jak převzetí funguje nově, viz 3.9.
- **Pohár**: kluby III. třídy se zapojí od poháru příští sezóny (letošní už běží).
- **Gemini**: reporty kola, Prales Ultras a předzápasové náhledy jen pro ligy s aspoň jedním lidským
  klubem. Dnes AI-only liga reporty kola a ultras do Gemini posílá (`league-round.ts:303-307,432-438`).
- **Automatické zakládání III. třídy** v jiných okresech: obce brát od největší, ne náhodně
  (`league/ai-teams.ts:66-67`).
- **Kapacita**: produkce jede ve frontovém režimu, ligy bez lidí se simulují (žádný filtr na lidské
  kluby v `findLeaguesWithDueRound`). Kolo přeboru Prachatice měří ~4 360 dotazů a ~11 minut,
  souběh fronty je 3. S ČB a III. třídou (a jejich U21) ověřit doby kol a souběh navýšit, jen pokud
  to D1 unese (víc souběhu nepomůže, když čeká databáze).

## Část 3: AI kluby jako normální kluby

### 3.1 Kdo je AI klub

- AI klub = `teams.user_id = 'ai'` (U21 dědí). Tak to zůstane.
- **Opuštěný lidský klub** (účet vlastníka 45 dní bez aktivity, `users.last_activity_at`) převezme
  AI trenér: klub i jeho U21 dostanou `user_id = 'ai'`, vznikne AI trenér, lidský trenér se odpojí,
  ale zůstane uložený. Dnes to přesně zasáhne Autolakovku (198 dní), Kebab (185) a Kobylisy (68).
  Rohlík Podolí (34) zatím ne, 45 dní mu vyprší kolem 4. 11.
- **Rozsah** (moje volba): denní kontrola ve všech okresech, ne jen jednorázově v Praze, jinak se
  mrtvé kluby budou vracet.
- **Propojené kluby**: převzatý klub zůstává ve své skupině `club_links`, takže ani pod AI nesmí
  obchodovat, hostovat ani hrát přáteláky o peníze s ostatními kluby téhož vlastníka. Bez toho by
  vlastník přes AI klub přeléval hráče a peníze a pak se ke klubu vrátil.
- **Návrat vlastníka** (moje volba): když se bývalý vlastník přihlásí a jeho klub pořád vede AI,
  nabídne se mu „Vrátit se ke klubu“. Dostane klub v tom stavu, v jakém ho AI nechala, a svého trenéra.
  Jinak běžný onboarding.
- **Ochrana před přepsáním** (moje volba): nová registrace dostane přednostně místo původního AI
  klubu. Klub, který dřív patřil člověku, smí nová registrace přepsat (3.9) až po 90 dnech
  nečinnosti vlastníka. Do té doby se nováček zařadí jinam (v Prachaticích do III. třídy) a vlastník
  se může vrátit. Hráč na sedm týdnů pryč tak klub nepřijde.
- Nově vzniklé AI kluby (nové přebory, III. třídy) vznikají stejně jako lidský klub: bez srážky
  `aiTeamShift`, bez menší kategorie obce, rovnou se stadionem, vybavením, trenérem a čísly dresů.

### 3.2 Stejná pravidla

Zrušit výjimky, které mění hru. Výjimky, které jen komunikují s člověkem, nechat.

Zapnout AI klubům (u každého bodu je místo v kódu v příloze A):

- trénink, jeho náklady, vývoj postavy, U21 hráči rostou a dospívají při rolloveru,
- rozvoj trenéra na konci sezóny, příjem akademie na konci sezóny,
- týdenní reputace (komunita, útlum),
- životní události hráčů a odchod hráče z klubu (bez zpráv),
- stadion a vybavení: řádky vznikají se založením klubu, ne při prvním zobrazení,
- zaměstnanci (pool kandidátů počítá i s AI kluby), sponzoři (stejné jednání, bez SMS a hospody),
- přestupy celé (3.7): hledání hráčů, trh, nabídky na hráče AI klubů, volní hráči ve všech okresech
  s kluby, nabídky klubů mimo hru i na hráče AI klubů, poptávky,
- přáteláky (výzvy od AI klubů i na ně),
- pohár: neutrální nasazení místo „lidé první“ (`cup/cup.ts:169-174`), od příští sezóny,
- nespokojení hráči (výměna za odchod, sliby, rozhovor): AI trenér řeší přes stejnou službu
  `performUnrestAction`, bez textů,
- incidenty v klubu (krádeže, škody): AI trenér rozhodne podle povahy, bez zpráv. Až v poslední fázi.

Nechat jen pro lidi (komunikace, ne mechanika): SMS a chaty hráčů, docházkové SMS, notifikace,
rozhovory, sezónní rekapitulace a uvítání, fanouškovské miláčky, kampaně, chorály a plachty,
SMS majitelů firem a schůzky v hospodě, obecní politika, grémium, trenérské kurzy (AI má licenci
automaticky jako dnes), turnaj P-Mobile.

### 3.3 Povaha AI trenéra

- Každý AI trenér dostane jednou vygenerovanou povahu, uloženou u trenéra (např. JSON sloupec
  `managers.ai_profile`). Část se odvodí z jeho stávajících vlastností (taktika, práce s mládeží,
  disciplína), zbytek náhodně.
- Vlastnosti (0–100): ambice, šetrnost, sázka na mládež, riziko, obchodní aktivita, chuť stavět
  (stadion, vybavení), trpělivost. K tomu oblíbená taktika a formace.
- Povaha se hráčům neukazuje. Je vidět jen na chování.
- Povaha je hlavní zdroj rozdílů: šetrný trenér nestaví, ambiciózní utrácí za hráče, mládežník dává
  šanci mladým a víc trénuje techniku. Kluby se proto rozejdou různými směry.

### 3.4 Kdy AI trenér rozhoduje

- **Před každým zápasem áčka** (liga, pohár, přátelák): v den zápasu po ranní fázi, kdy jsou známé
  omluvenky, nejpozději pár hodin před výkopem. Výsledek se uloží jako normální sestava (`lineups`).
- **Týdně v pondělí** po týdenních financích: tréninkový plán, vstupné a občerstvení, stadion
  a vybavení, zaměstnanci, akademie, sponzoři, péče o trávník, přesuny mezi áčkem a U21
  a plán kádru (koho prodat, jaké posty a za kolik shánět).
- **Průběžně** (např. každou hodinu): odpovědi na nabídky, příhozy a výzvy k přátelákům s lidskou
  prodlevou (hodiny, ne okamžitě, vždy do lhůty 3 dnů), další kroky v jednání, podpisy volných hráčů.
- **Na konci sezóny**: kdo odchází a kdo jde z U21 nahoru.
- Práce jde přes frontu, jeden klub je jedna zpráva, spouštějí ji vlastní crony. Počet cronů
  neomezujeme.

### 3.5 Jak AI trenér rozhoduje: model navrhuje, kód hlídá

- Kód připraví stručný popis situace v angličtině (modely jsou v angličtině výrazně lepší, výstup
  je stejně jen JSON) a nabídku přípustných možností s cenami a podmínkami.
- Model (Workers AI) vrátí rozhodnutí jako JSON. Kód každé rozhodnutí zkontroluje stejnými
  pravidly jako lidský požadavek a provede ho stejnou službou (3.6). Neplatné rozhodnutí se zahodí
  a místo něj platí náhradní pravidlo.
- Co je počítání, dělá kód. Co je styl a priorita, volí model. Příklad zápasu: model vybere formaci,
  taktiku, tvrdost, plán střídání a priority (koho šetřit, komu dát šanci, kapitán). Kód podle toho
  poskládá jedenáctku a lavičku podle obsazení postů a zkontroluje je
  (`validateMatchPlan`, `validateBench`).
- **Náhradní pravidla bez modelu** existují pro každé rozhodnutí a řídí se povahou. Použijí se při
  výpadku, překročení času, vypnutém přepínači a v první fázi nasazení. Zápas ani tick na model nečekají.
- **Přepínač** v CACHE_KV `ai_coach_mode` = `off | shadow | on`, celkově i po oblastech (zápas,
  týdenní správa, trh). `shadow` rozhoduje a zapisuje do deníku, ale nic neprovede.
- **Model** vybere stavitel z modelů hostovaných Cloudflare, které kredity kryjí, malým srovnáním
  na skutečných rozhodnutích (platnost JSON, rozumnost). Kandidáti: `@cf/openai/gpt-oss-120b`,
  `@cf/moonshotai/kimi-k2.5`, `@cf/nvidia/nemotron-3-120b-a12b`, dnešní
  `@cf/meta/llama-4-scout-17b-16e-instruct`. Pozor: podle poznámky v `lib/ai-provider.ts:51-61`
  vracejí „uvažující“ modely obsah jinde, než kód čeká.
- **Cena** (můj odhad, ne měření): asi 22 AI áček × ~55 tis. vstupních a ~10 tis. výstupních tokenů
  týdně ≈ 1,2 mil. a 0,2 mil. tokenů týdně ≈ 0,6–1,5 $ týdně podle modelu (ceník Workers AI
  k 25. 10.). Do února desítky dolarů. Kredity tím nevyčerpáme. Na ceně proto nešetřit, můžeme
  vzít silnější model nebo nechat trenéra přemýšlet víc, pokud to zlepší rozhodnutí.

### 3.6 Jedny služby pro člověka i AI

Pravidla dnes žijí přímo v handlerech rout a každá zápisová routa vyžaduje přihlášeného vlastníka
(`requireTeamOwnership`, `auth/middleware.ts:34`). Pro AI trenéra se proto pravidla každého
rozhodnutí, které AI používá, vytáhnou do služby. Routa i AI trenér volají tutéž funkci:

- uložení sestavy a rolí, tréninkový plán,
- stavba stadionu, přístavby, trávník, vstupné, občerstvení,
- nákup a oprava vybavení, zaměstnanci, akademie, sponzoři,
- přestupy: inzerát, příhoz, přímá nabídka, přijetí, odmítnutí, protinávrh, stažení, volní hráči,
  hostování, poptávky,
- přáteláky, nespokojení hráči (`performUnrestAction` už služba je).

Druhá, paralelní implementace pravidel pro AI nesmí vzniknout. Jen tak AI nemůže podvádět.

### 3.7 Přestupy, na kterých nejde vydělat podvodem

- Hráči AI klubů jsou v hledání a na trhu, dostávají nabídky (přestup, hostování, výměna) stejně
  jako hráči lidí. AI kluby dávají inzeráty, přihazují, posílají nabídky, podepisují volné hráče,
  zakládají poptávky a kupují i od klubů mimo hru (skauting, stejné jednání jako lidé).
- **Cena, za kterou AI prodá** (počítá kód, model ji nepřebije): tržní hodnota (sdílený vzorec
  `marketValue`) × význam hráče v kádru (opora výrazně víc, přebytečný hráč méně) × povaha
  × šum. Šum je pevný pro hráče na 14 dní, takže opakované nabídky nic neprozradí.
  Nabídka nad cenou: AI přijme. Mírně pod: protinávrh a postupné ustupování podle trpělivosti.
  Hluboko pod: odmítnutí a ztráta trpělivosti. Stávající pauza 10 dní po odmítnutí platí.
- **Pevné pojistky**: AI neprodá pod 60 % tržní hodnoty (moje volba). Neprodá posledního brankáře,
  neklesne pod minimum kádru a oporu pustí jen s plánem náhrady.
- **Kupování**: AI zaplatí nejvýš tržní hodnotu × potřebu postu × ambici a vždy si nechá rezervu
  na několik týdnů provozu podle šetrnosti.
- **Splátky, procenta z dalšího přestupu a výměny** přepočítá na dnešní hodnotu. Splátky AI bere
  jen s přirážkou, malá záloha není cesta, jak AI obejít.
- **Objem** jako u člověka: počet přestupů za měsíc omezuje povaha (obchodní aktivita).
- **Obchody mezi AI kluby** povolené, ale vzácné.
- AI nikoho nezvýhodňuje. Komisař pro integritu sleduje i obchody s AI kluby
  (`competition/integrity.ts`). AI kluby nejsou „propojené“ s lidmi, výjimkou je převzatý klub, který
  si ponechá svou skupinu `club_links` (3.1).

### 3.8 Narovnání (jednorázově)

- **Komu**: kluby, které v Praze ve chvíli narovnání vede AI (dnes 5 původních a 3 převzaté,
  možná i Podolí), 13 AI klubů ČB (cíl v části 1), jejich U21 týmy a nové kluby III. třídy včetně
  U21 při založení.
- **Jen nahoru, nebo na cíl** (moje volba): hráči, stadion, vybavení a zaměstnanci se jen zvedají,
  nikdy nesnižují. Rozpočet a reputace se původním AI klubům nastaví na cíl i směrem dolů (dnes mají
  116–204 tis., víc než medián vzoru 86 tis.). Převzatým klubům se nikdy nic nebere, mohou se
  vrátit vlastníkům.
- **U21**: vzorem jsou lidské U21 týmy téže U21 ligy (dnes AI U21 kádry 17,6–23,4 proti 26–44
  u lidí, data z produkce), postup stejný jako u áčka.
- **Vzor**: aktivní lidské kluby téže ligy (přihlášení do 30 dní). V Praze jich je teď pět (Dvorce,
  Klamovka, Břevnov, Vršovice, Alza).
- **Praha** (moje volba): každý narovnávaný klub si vylosuje percentil p mezi 15 a 85 %. Cílem
  každé veličiny je hodnota vzoru na tomto percentilu. Kluby se tak rozprostřou středem tabulky,
  některé lepší, některé horší.
- **III. třída** (můj odhad, ne fotbalová data): síla nejlepší jedenáctky rovnoměrně mezi nejslabším
  klubem přeboru Prachatice minus 12 a nejslabším klubem přeboru (dnes zhruba 39–51). Stadion,
  vybavení a zaměstnanci o stupeň skromnější než medián přeboru.
- **Rozpočet III. třídy a ČB** (oprava 25. 10. po zkoušce nanečisto): startovní rozpočet nového
  lidského klubu podle obce (nad 5 000 obyvatel 80 000, nad 1 000 40 000, jinak 20 000, pravidlo
  z `routes/teams.ts`) × (1 + p). Původní odhad „polovina dolního kvartilu přeboru“ dal všem
  klubům 10 000 Kč: lidské kluby mají na účtu málo, protože peníze utrácejí, a AI klub by
  nezaplatil mzdy.
- **Veličiny**: průměr nejlepší jedenáctky a osmnáctky, velikost a věková skladba kádru, úrovně
  jednotlivých částí stadionu, stav a typ trávníku, úrovně vybavení, počet a složení zaměstnanců,
  rozpočet, reputace, sehranost formací a taktik.
- **Hráči**: stávající hráči zůstanou, vlastnosti se jim zvednou tak, aby kádr trefil cíl (poměrně,
  s respektem k postům, celkové hodnocení přepočítat jediným vzorcem `overallRatingFromFlat`).
  Chybějící hráči do cílové velikosti kádru se vytvoří jediným generátorem hráčů.
- **Stadion, vybavení, zaměstnanci, rozpočet, reputace**: jednorázový zápis bez plateb. Sponzory
  narovnání nevkládá, AI trenér je podepíše běžnou cestou.
- **Provedení**: admin endpoint nanečisto (tabulka před a po pro každý klub) → souhlas uživatele →
  naostro. Na produkci se záložkou Time Travel.

### 3.9 Nová registrace přepíše AI klub (rozhodnutí uživatele)

- Nová registrace = úplně nový tým. Dostane místo AI klubu v nejvyšší lize okresu, kde ještě AI
  kluby jsou, a AI klub kompletně přepíše, aby si hráč všechno rozjel podle sebe. Tak to funguje
  už dnes (`routes/teams.ts:401-494`) a tak to zůstane.
- Zůstává jen místo v lize: id týmu, odehrané zápasy, tabulka a místo v poháru.
- Všechno ostatní je nové nebo zmizí: hráči AI (i jejich statistiky, vztahy, zranění), AI trenér,
  zaměstnanci, vybavení, stadion, sponzoři, transakce. Hráč si volí jméno a obec, dostane vlastní
  vygenerovaný kádr, trenéra a rozpočet jako dnes.
- Mazání musí po nových věcech z této části uklidit i to, co AI klub nově mít bude (zaměstnanci,
  sponzorské smlouvy, rozjednané přestupy a nabídky, inzeráty, poptávky, výzvy k přátelákům,
  deník AI rozhodnutí). Rozjednaný přestup s lidským klubem se zruší, peníze se nikomu
  nestrhnou. Hráč AI, kterého si mezitím koupil člověk, už AI klubu nepatří, takže se nesmaže.
- Důsledek: nový tým začíná na úrovni nově založeného klubu (u nováčků z jara a léta zhruba
  37–44 nejlepší jedenáctka, data z produkce), tedy slabší než narovnaná Praha. Stejně jako dnes.
- Jiný případ je bývalý vlastník opuštěného klubu: ten se vrací ke **svému** klubu (3.1), nepřepisuje
  ho.

### 3.10 Co uvidí hráči

- AI kluby jako každý jiný klub: v tabulkách prolinkované a ne šedé (liga, U21), v navigaci
  předchozí a další klub, v síni slávy, v hledání hráčů, na trhu, s tlačítkem nabídky
  na hráče a s výzvou k přáteláku.
- U jména trenéra **všude** štítek „(AI)“: profil klubu, profil trenéra, klubový web, zpravodaj,
  widgety, soutěž, seznamy. Štítek se přidává při zobrazení podle příznaku, ne do jména v databázi.
- „Napsat“ AI trenérovi dál ne (AI trenér nepíše).
- Opravit chybu klubového webu, který AI klubu ukáže náhodného AI trenéra (hledá trenéra přes
  `t.user_id = m.user_id`, `routes/club-website.ts:826,2055,2255`).
- Zmizí texty, že AI týmy jsou slabší (`components/ui/napoveda.tsx:92,178,365`, „počítačové kluby“
  na úvodní stránce).

### 3.11 Admin a hlídání

- Deník rozhodnutí (tabulka, např. `ai_coach_decisions`): klub, druh rozhodnutí, stručný vstup,
  model, surová odpověď, co prošlo kontrolou, co se provedlo, zda se použilo náhradní pravidlo,
  tokeny, doba.
- Admin stránka „AI trenéři“: přepínače, povaha každého trenéra, poslední rozhodnutí s odůvodněním
  (anglicky, jen pro admina), chybovost modelu.
- Hlídač: když selže víc než stanovený podíl rozhodnutí, upozornit stávajícím hlídáním provozu.

---

## Testování na kopii produkce (přání uživatele 2026-10-25)

Každá fáze se nejdřív kompletně vyzkouší na localhostu nad kopií produkční databáze, teprve po OK
uživatele jde na testing.

- **Kopie**: z noční zálohy v R2 (`prales-backups/denni/prod-YYYY-MM-DD.sql.gz`, 01:20 UTC),
  ne exportem přes den. Export produkci zamkne a hráčům padají chyby 500.
- **Lokální prostředí**: osvědčený postup z konce sezóny nanečisto (19. 10.): vlastní složka
  stavu pro `wrangler dev --env testing --persist-to …`, web `next dev` na portu 3000, přihlášení
  přes session v lokálním KV. Herní čas se lokálně smí posouvat libovolně.
- **Scénáře**, každý projít jako hráč v prohlížeči i kontrolou dat:
  1. Otevření ČB: registrace v ČB projde, ČB je na úvodní stránce, kolo ČB se odehraje v obou
     režimech zpracování.
  2. Založení III. třídy: 14 klubů, rozpis středa a neděle končí nejpozději 28. 1., U21 den po áčku,
     kolo se odehraje přes frontu.
  3. **Nová registrace přepíše AI klub**: nový hráč v Prachaticích dostane místo klubu III. třídy,
     v Praze místo narovnaného AI klubu. Jeho tým je úplně nový (vlastní jméno, obec, kádr, trenér,
     stadion od nuly) a po AI klubu nezůstane nic kromě místa v lize, odehraných zápasů a poháru.
     Zkusit i AI klub, který měl rozjednaný přestup s lidským klubem. Bývalý vlastník opuštěného
     klubu se přihlásí a vrátí se ke svému klubu.
  4. Převzetí opuštěných klubů: denní kontrola převede přesně Autolakovku, Kebab a Kobylisy.
  5. Narovnání nanečisto a naostro: tabulka před a po, rozptyl sil v Praze.
  6. AI trenér: posunout několik herních týdnů (denní ticky, kola, pondělní správa, trh). Kontrola
     deníku rozhodnutí, různého vývoje klubů a toho, že AI kluby nejsou mrtvé ani přehnaně silné.
  7. Pokusy AI klub ojebat: nízké nabídky, opakované nabídky, splátky s malou zálohou, výměna
     za šunt, hostování. Nic z toho nesmí projít výhodněji než u rozumného člověka.
  8. Konec sezóny nanečisto: III. třída bez postupu a sestupu, rollover proběhne.
  9. Změněné obrazovky i v šířce 375 px.

## Pořadí a nasazení

Každá fáze: localhost nad kopií produkce → OK uživatele → testing → kontrola uživatelem → produkce
až na výslovné „nasaď na main“. Zápisy na produkci (otevření ČB, narovnání, převzetí) až po souhlasu
a se zálohou.

1. **III. třída Prachatice**: založení s koly ve středu a v neděli, bez postupu, ověření kapacity
   fronty. Rychle, kvůli termínu sezóny.
2. **Stejná pravidla + narovnání (Praha, ČB, III. třída) + převzetí opuštěných klubů + štítek (AI)
   + trenér bez modelu + otevření ligy ČB**: povaha, sestava podle formace a taktiky z povahy,
   trénink, údržba stadionu, sponzoři, akademie, zaměstnanci. Od tohoto okamžiku AI kluby nejsou
   mrtvé.
3. **Mozek přes Workers AI**: zápas a týdenní správa, deník, admin stránka, přepínač. Nejdřív
   na testu v režimu `shadow`, pak `on`.
4. **Přestupy**: prodej, nákup, nabídky, volní hráči, hostování, poptávky, s pojistkami ze 3.7.
   Potom incidenty v AI klubech.

## Co je na staviteli

- Texty promptů, schémata JSON, výběr modelu a jeho srovnání.
- Jak přesně vytáhnout služby z rout a v jakém pořadí.
- Přesné časy cronů a podoba zpráv ve frontě.
- Jak přesně zvedat vlastnosti hráčů při narovnání.
- Konkrétní váhy povahy a náhradních pravidel, pokud splní cíle a pojistky výše.
- Kterou podobou přepínače vypnout postup a sestup (okres nebo liga).

---

## Příloha A: kde se dnes AI kluby liší (z průzkumu kódu 25. 10.)

Cesty jsou relativní k `apps/api/src` (API) a `apps/web/src` (web).

- Trénink: `season/daily-tick.ts:250-261`, `season/team-day.ts:549-583`; váha jen u trénujících
  `daily-tick.ts:291-304,1133`; životní události `season/random-events.ts:83`; odchod hráče
  `daily-tick.ts:1471`; U21 při rolloveru `season/season-rollover.ts:663`.
- Finance: týdenní běží všem (`team-day.ts:370-384`); sponzoři jen z lidského jednání
  (`sponsors/signing.ts:393`); finance přáteláků jen lidem (`multiplayer/friendly-runner.ts:394-397`).
- Stadion a vybavení vznikají líně: `routes/game.ts:1546-1580`, `equipment/equipment-service.ts:22-48`;
  bez řádku stadionu je kapacita 200 (`multiplayer/match-runner.ts:358`).
- Zaměstnanci: jen přes routu (`routes/staff.ts:232`), pool podle lidských klubů
  (`staff/staff-generator.ts:260`).
- Mládež: akademie jen lidem (`season/end-season.ts:336-346`, `routes/development.ts:473`).
- Sponzoři: `sponsors/hooks.ts:128`, `sponsors/owner-sms.ts:52`, `sponsors/owner-sms-triggers.ts:17,52,138`,
  `routes/sponsors.ts:283`, `season/season-rollover.ts:432,452`, `competition/sponsors.ts:38`.
- Reputace: `team-day.ts:399-406`, `season/league-round.ts:494-503,696-697`.
- Přestupy: zákaz nabídky `routes/game.ts:6491-6492`; hledání `transfers/player-search.ts:61`;
  trh `routes/game.ts:5971`; volní hráči `routes/game.ts:5319`, `transfers/free-agent-pool.ts:115`;
  CPU nabídky `transfers/virtual-teams.ts:255-257`, `transfers/transfer-pressure-tick.ts:62-64,78`;
  poptávky `transfers/demands.ts:550,581`; nespokojenost `transfers/offer-rejection-impact.ts:356`;
  nabídky hráčům `events/player-offers.ts:68`.
- Sestava: `multiplayer/match-runner.ts:171-180,1872-2018`; tvrdost `engine/hardness.ts:241`;
  taktický profil AI se generuje a neukládá (`league/ai-teams.ts:17,101`).
- Přáteláky: `routes/friendlies.ts:41-43,277`. Pohár: nasazení `cup/cup.ts:169-174`.
- Trenér: rozvoj na konci sezóny jen lidem (`season/season-development.ts:180`), licence AI
  automaticky (`season-development.ts:246-260`), AI trenér vzniká líně (`coach/ai-manager.ts`).
- Incidenty: `incidents/denni-krok.ts:24`. Vynechaní hráči: `multiplayer/left-out.ts:259`.
- Web: šedé neodkazované řádky `app/(hra)/liga/page.tsx:552-557`, `app/(hra)/u21/page.tsx:420-424`;
  navigace klubů `app/(hra)/tym/[id]/page.tsx:107,126-128`; síň slávy `app/(hra)/sin-slavy/page.tsx:42`;
  nabídka na hráče `app/(hra)/hrac/[id]/page.tsx:412-413`; trenér na profilu klubu
  `app/(hra)/tym/[id]/page.tsx:390-417`.
