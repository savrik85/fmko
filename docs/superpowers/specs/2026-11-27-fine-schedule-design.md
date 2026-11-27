# Sazebník pokut kabiny – návrh (2026-11-27)

Stav: fáze 1 postavená 2026-11-27, ověřená na localhostu (kopie dat, Workers AI). Necommitnuto, na testing jen na pokyn.

## Proč
Hra už učí, jak má kabinová pokladnička fungovat (lekce `karty-team-fines` v kurzu: sazebník předem,
stejně pro všechny, přiměřená výše, pokladník z hráčů, trestat chování, ne fotbal), ale ve hře nic
z toho nefunguje. Drobné prohřešky (zaspal, kocovina, protesty) dnes nemají jiný následek než absenci.

Co už existuje a nesmí se zdvojit:
- pokuta z SMS (`messaging/coach-commitments.ts`, kind `fine`, do klubové kasy, strop 1 000 Kč, 1 hráč / 7 dní),
- tresty u incidentů (`incidents/akce.ts`), reakce na ně píše model (`incidents/punishment-reaction.ts`),
- kolečka za omluvenku (`laps_penalty`), „kdo nechodí, nehraje“ (`training_rule`), hubnutí s propadnutím (`weight_target`),
- kapitán týmu (`teams.captain_id`).

## Data z produ (11-27)
- 153 týmů, na posledním tréninku chybělo 1 069 z 2 768 hráčů (39 %).
- Flákání (zaspal, zapomněl, „myslel že je zítra“, nebere telefon, přišel pozdě, vybitý telefon, kopačky) ≈ 0,65
  na trénink a tým; hospoda (páteční hospoda, zabijačka, narozeniny, pivo po práci, Slavie) ≈ 0,7. Dohromady ≈ 19 % absencí.
- Zápasy za 14 dní (387): žlutá 0,92 na tým a zápas, žlutá za protesty 0,05, červená 0,08, omluvenka Kocovina/Alkohol 0,065.
- Týdenní odměny hráčů lidských klubů: 2 212 pod 200 Kč, 1 241 mezi 200 a 499 Kč, jeden nad 1 000 Kč.
- Odhad pokladničky: při 50 Kč za tréninkové položky 150–250 Kč týdně, 4–6 tisíc za sezónu.

## 1. Sazebník
Dobrovolný. Bez sazebníku se hraje jako dnes (jen pokuty z SMS).

Trenér skládá sazebník z **předdefinovaných položek**, nic se nepíše volně. Předvolba „Klasika okresu“
(flákání, kocovina, protesty, červená, kopačky) jako hotový začátek k úpravě.

### Katalog
| Skupina | Položka | Podmínka (výběr) | Zdroj dat |
|---|---|---|---|
| Trénink | Vynechaný trénink | z flákání / kvůli hospodě / jakýkoli neomluvený / úplně jakýkoli | `TrainingAttendance.reason` → nová mapa důvod → skupina |
| Trénink | Slíbil, že přijde, a nepřišel | – | `attendance-pledge` |
| Trénink | Zapomenuté kopačky | – | důvod „Tréninkové boty zapomněl…“ |
| Zápas | Omluvenka na zápas | kdykoli / až v den zápasu / kvůli kocovině | `matches.absences` |
| Zápas | Na zápas s kocovinou | – | událost zápasu (hangover special) |
| Zápas | Žlutá karta | za protesty / za faul / jakákoli | událost `card` (popis „za protesty“) |
| Zápas | Červená karta | přímá / druhá žlutá / jakákoli | událost `card` detail `red` |
| Zápas | Stopka za karty | – | absence „Stopka za karty“ |
| Zápas | Neproměněná penalta | – | událost `chance` penalty_missed/saved (engine vlastní gól nezná) |
| Zápas | Pozdě na zápas | – | událost `special` „Dorazil až v X. minutě“ |
| Mimo hřiště | Hospoda večer před zápasem | – | `pub.ts` attendees |
| Mimo hřiště | Rvačka v hospodě | – | pub incidenty |
| Mimo hřiště | Nadváha | – | postava hráče (Péče) |
| Ruční | Pozdě na sraz, mobil v kabině, neuklizená kabina | – | trenér dá tlačítkem na stránce Pokladnička |

Volno od trenéra (`restByCoach`) a zranění se nepokutují nikdy.

### Nastavení položky
- Hodnota: 20 / 50 / 100 / 200 / 500 Kč, basa piva (≈ 600 Kč), runda pro kabinu, kolečka na tréninku, praní dresů.
- Opakování: pokaždé stejně / od druhého prohřešku dvojnásobek / první v sezóně se promíjí.
- Platí pro: celý kádr / jen áčko / i U21.

### Účinek
- Položka snižuje pravděpodobnost svého prohřešku podle sazby a povahy hráče. Vysoká disciplína: skoro beze změny.
  Nízká disciplína a vysoký temperament: ignoruje a nadává. Strop účinku: flákání a hospoda nejvýš −30 až −40 %,
  docházka zhruba +2–3 procentní body. Sazebník schválený kapitánem působí silněji než vnucený.
- „Fotbalové“ a přísné položky mají cenu: úplně jakákoli absence štve hráče s rodinou a na směny, žlutá za faul
  = hráči přestanou zastavovat brejky, vlastní gól / penalta = ustrašená hra (malý postih v zakončení).
- Důsledné vymáhání zvedá trenérovi atribut disciplína (`atributTrenera`), plošné odpouštění ho sráží.
- Prominutí hvězdě, když náhradník za totéž platil, se šíří přes Kabina má uši, chemie klesá.

## 2. Kapitán sazebník odsouhlasí
1. Trenér sestaví sazebník a dá „Předložit kapitánovi“ (`teams.captain_id`; bez kapitána nejvlivnější hráč kabiny).
2. Kód spočítá, jak sazebník kabinu zatíží (odhad zátěže každého hráče z frekvence prohřešků × sazba proti odměně,
   tvrdost položek), a k tomu kapitánův sklon: vztah k trenérovi, věrnost, temperament; když sám často
   flaká nebo chodí do hospody, hájí právě tyhle položky („na hospodu nám nesahejte“).
3. Kapitán odpoví SMS (text píše model z faktů, verdikt určuje kód):
   - **Schváleno**: platí od příštího týdne, kabina ho bere za svůj (silnější účinek, menší odpor, „odsouhlasili jsme to“).
   - **Výhrada**: konkrétní požadavek („stovka za kocovinu jo, ale za žlutou za faul ne“). Trenér upraví → schváleno, nebo vyhlásí i tak.
   - **Odmítnuto**: trenér může vyhlásit bez souhlasu = diktát. Slabší účinek, vztah s kapitánem klesá,
     kabina startuje na 1. stupni odporu (viz bod 4), u tvrdého sazebníku rovnou ultimátum.
- Zpřísnění v sezóně jde zase přes kapitána, zmírnění souhlas nepotřebuje.
- Nový kapitán sazebník nemění, ale u příští úpravy rozhoduje on.

## 3. Pokuty z SMS a reakce hráčů
- Pokuta z SMS zůstává i mimo sazebník. Když je prohřešek v sazebníku a pokuta už je zapsaná, druhá se nezapíše
  (stejně jako dnes u incidentů). Ruční položka zadaná v SMS se zapíše podle sazebníku.
- Dnes na SMS pokutu přijde jedna ze tří pevných vět (`KEPT_SMS.fine`). Nově všechny pokuty (sazebník,
  ruční, SMS) jdou přes reakci od modelu jako u incidentů (`punishment-reaction.ts`). Fakta pro model připraví kód:
  - co se doopravdy stalo (důvod absence; byl na tréninku; měl volno od trenéra),
  - jestli pravidlo platilo předem a jestli ho kapitán schválil,
  - částka proti jeho kapse (odměna, povolání, věk),
  - férovost (jiný za totéž neplatil, kolik pokut už má),
  - povaha, vztah k trenérovi, nálada, poslední zprávy.
- Model vrátí text a postoj (přizná / ohradí se / smlouvá / odmítne zaplatit / stěžuje si v kabině). Dopady
  (morálka, vztah, dluh, „slyšel jsem…“) určuje kód podle postoje v pevných mezích. Bez modelu přijde připravená
  věta podle postoje a situace („byl jsem tam“, „to jste vyhlásil až teď“).

## 4. Přehnané pokuty tvrdě narazí
Měřítko je **zátěž hráče**: zaplaceno a dlužno za poslední 4 týdny proti týdenní odměně. Basa a runda se
přepočítají na peníze. Podnikatel unese víc než student, patriot a věrný hráč víc, vysoký temperament méně.

| Zátěž za 4 týdny | Následek |
|---|---|
| do 0,5 týdenní odměny | v pořádku |
| 0,5–1 | bručí, jízlivé SMS, morálka klesá |
| 1–2 | odmítá platit, dluh roste, přestává chodit („když mám platit, radši nejdu“) |
| nad 2 | chce odejít (nový důvod nespokojenosti „pokuty“), neprodlouží smlouvu, mladý může skončit s fotbalem |

Kabina jako celek (tvrdost při vyhlášení + součet zátěže):
1. kapitán za kabinu: „Trenére, tohle je moc.“
2. ultimátum: „Buď to stáhnete, nebo v sobotu nehrajeme.“
3. stávka: hromadné omluvenky na nejbližší zápas, chemie a vztah kabiny k trenérovi dolů,
4. navenek: kauza ve Zpravodaji („Trenér ždímá kabinu“), Socky, u dorostu volají rodiče a můžou dítě odhlásit,
   hráči z trhu nechtějí přijít.

Pojistky proti obcházení:
- stažení po vzpouře pomůže jen napůl, paměť kabiny vydrží do konce půlsezóny; časté přepínání = zmatek, další stupeň,
- sazebník bez vymáhání = smích, disciplína trenéra klesá,
- SMS pokuty navíc se do zátěže počítají stejně.

Varování předem jen slovy, bez čísel: „Pro kluky z učiliště je stovka dost peněz.“ Pak už jen SMS.

## 5. Pokladnička kabiny
- Pokuty jdou do pokladničky kabiny, ne do klubové kasy (žádné tisknutí peněz). Srážka z odměny dlužníkovi
  zůstává stávající cestou do kasy.
- Pokladník: trenér jmenuje hráče. Hlásí dlužníky SMS, trenér trvá / promine / strhne z odměny. Nespolehlivý
  pokladník (nízká disciplína, vysoký alkohol) může pokladničku propít → incident přes stávající systém.
- „Rozbít pokladničku“: sud po zápase, guláš a posezení, výlet na konci sezóny. Proběhne jako hospodská session
  celé kabiny (`pub.ts`) s jejími riziky; chemie a morálka podle částky a účasti.
- Dlouho nerozbitá pokladnička: kabina se ptá, kam peníze jdou.

## 6. UI
Karta „Pokladnička“ (Tým nebo Trénink, rozhodnout): nástěnka se sazebníkem, stav schválení kapitánem, kdo
zaplatil a kdo dluží, zůstatek, pokladník, tlačítko „Rozbít“. Sestavení sazebníku: výběr položek, podmínek,
hodnoty, opakování a rozsahu, předvolba „Klasika okresu“, tlačítko „Předložit kapitánovi“. Hráči mluví jen přes SMS.

## 7. AI kluby
Sazebník, odpovědi na výhrady kapitána, prominutí a rozbití pokladničky rozhoduje Workers AI, kód hlídá meze.
Platí pro ně stejné následky.

## 8. Data (návrh)
- `fine_schedules`: team_id, status (draft | proposed | approved | imposed), captain_verdict, proposed_at, effective_from, season_number.
- `fine_schedule_items`: id, team_id, item_key, condition_key, value_kind, amount_czk, repeat_mode, scope.
- `fines`: id, team_id, player_id, item_id (null = SMS mimo sazebník), source (auto | manual | sms), source_ref
  (UNIQUE s team_id kvůli deduplikaci), amount_czk, value_kind, status (owed | paid | forgiven | refused), fact, game_date.
- `teams`: fine_fund_balance, fine_treasurer_id.
- Napojení: daily-tick trénink (mapa důvod → skupina), zpracování zápasu (události, absence), `pub.ts`, postava hráče.

## 9. Fáze
1. Sazebník z katalogu, schválení kapitánem, automatické zápisy, pokladnička, zátěž a stupně následků, reakce
   přes model u všech pokut včetně SMS.
2. Pokladník a jeho incidenty, rozbití pokladničky přes hospodu, „fotbalové“ položky v enginu, AI kluby, Zpravodaj.

## Ověření
Localhost nad kopií produ se skutečným modelem: sestavit sazebník, kapitán schválí / výhrada / odmítne,
prosimulovat dny ticku, zkontrolovat zápisy pokut proti důvodům absencí, SMS reakce (byl na tréninku, volno od
trenéra, pokuta mimo sazebník), přehnaný sazebník až po stávku. Mobil 375 px.

## Jak je to postavené (fáze 1)
- `packages/shared/src/types/fine-schedule.ts` katalog, `apps/api/src/fines/*`, routa `routes/fines.ts`, stránka `/pokladnicka` (menu Tým), migrace `0340_fine_schedule.sql`.
- Pokuty se zapisují hned (trénink v daily-ticku, zápas v match-runneru jen ligové áčko, hospoda v denním kroku `fines`),
  SMS reakce hráčů posílá hodinový běh telefonu (`30 * * * *`), protože runner zápasu nemá `env` pro model.
- Pokuta z SMS jde dál do kasy klubu, eviduje se mezi pokutami (zátěž, reakce); za prohřešek zaplacený podle sazebníku
  v posledních 3 dnech ji tlačítko neudělí. Pevné věty `KEPT_SMS.fine` nahradila reakce od modelu.
- Tlak kabiny = průměrná zátěž + podíl přetížených + tvrdost sazebníku + vnucení/zmatek. Stávka se opakuje každý zápas,
  dokud tlak trvá; sestup o stupeň nejdřív po 7 dnech, zmírnění ruší ultimátum hned.
- Zatím není: pokladník, rozbití pokladničky, „fotbalové“ položky v enginu (ustrašená hra), AI kluby, pohár a přáteláky, Zpravodaj.
