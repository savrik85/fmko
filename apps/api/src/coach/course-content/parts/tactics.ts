/**
 * Další díly skript „Taktika“: základní kurz díly 2–4, pokročilý kurz díl 2.
 *
 * Zdroje:
 * - Pravidla IFAB 2026/27 (theifab.com): pravidlo 1 (technická zóna, taktické pokyny dává vždy
 *   jen jedna osoba), pravidlo 3 (počty střídání, tři příležitosti v nejvyšších soutěžích, deset
 *   sekund na odchod střídaného hráče, vyloučení před výkopem a po něm, výměna s brankářem),
 *   pravidlo 7 (poločasová přestávka nejvýše 15 minut); Changes to the Laws of the Game 2026/27.
 * - Soutěžní řád FAČR s účinností od 1. 7. 2026: § 66 odst. 3 (přestávka 15 minut včetně
 *   odchodu a návratu), § 68 (počty střídání, opakované střídání, otřes mozku), zápis o utkání
 *   (nejvýše 7 náhradníků v neprofesionálních soutěžích).
 * - England Football Learning (The FA): What are the principles of football (2022), Two-player
 *   core football moves (2023), How to defend like England: overloads, crosses, space in wide
 *   areas (2022), How to deliver effective team talks on matchday (2023), Top tips for matchday
 *   (2023), Attacking session: width for deception (2025), How England youth teams use a „what if“
 *   plan on matchday (thefa.com bootroom).
 * - FIFA Training Centre: Jens Lehmann, Foundations for a back four (2022; 6–8 m mezi obránci),
 *   Michael Johnson, Defending principles, Preventing progression through central areas (postranní
 *   čára jako obránce navíc), Zonal defending: from principles to practice, 1v2 defending
 *   outnumbered, Defending cut-back crosses (MS U20 2023); FIFA.com, The piece of paper that helped
 *   Germany turn the page (Lehmannův papírek).
 * - Coaches' Voice: Glossary (šířka, hloubka, nízký blok, overlap, underlap, přenesení hry),
 *   Switch of play, Spotlight Sam Saunders (Brentford B), The mid-block, Positional play, Inverted
 *   full-backs, What is rest defence? (2024), Marcelo Bielsa: Coach Watch, Germany 1 Japan 2:
 *   World Cup 2022 tactical analysis.
 * - FourFourTwo, How to beat Bielsa (Richard Jolly, 2021); Planet Football, výpovědi hráčů
 *   o murderballu; Soccer Coach Weekly, 5 tips to stop tricky wingers; TeamStats, rozbor soupeře
 *   a standardky v amatérském fotbale; sportsessionplanner.com a elitesoccercoaching.net (zóny
 *   náběhů do vápna).
 * - Sports Illustrated, původ výrazu „park the bus“ (Mourinho, 2004); dobové zprávy o zápase
 *   Manchester United – Fulham 2:2 (9. 2. 2014, 81 centrů).
 * - Mohr, Krustrup, Nybo, Nielsen, Bangsbo: Muscle temperature and sprint performance during
 *   soccer matches, beneficial effect of re-warm-up at half-time. Scand J Med Sci Sports 2004.
 * - Anglická Wikipedie: Glossary of association football terms, Arrigo Sacchi, Don Revie,
 *   Marcelo Bielsa, Gian Piero Gasperini, 2024 UEFA Europa League final, 2006 UEFA Champions League
 *   final, 2009–10 UEFA Champions League knockout phase, Defender (association football);
 *   Inter.it a TNT Sports k vyloučení Thiaga Motty (28. minuta, Inter v 4-4-1).
 */
import type { CategoryContent, PartTitles } from "../types";

export const TACTICS_PART_TITLES: PartTitles = {
  attr_basic: { 2: "Útočná hra", 3: "Obranný blok", 4: "Zápasové koučování" },
  attr_advanced: { 2: "Moderní trendy" },
};

export const TACTICS_PARTS: CategoryContent = {
  lessons: [
    // ══ Základní kurz, 2. díl: Útočná hra ══
    {
      id: "taktika-width-depth",
      category: "taktika",
      difficulty: 2,
      part: 2,
      title: "Šířka a hloubka v útoku",
      body: `Když má tvůj tým míč, potřebuje hřiště co **největší**. Soupeř chce opak: stáhnout se k sobě a zavřít mezery. Útočná hra proto začíná u dvou pojmů.

**Šířka** je vzdálenost mezi pravou a levou stranou rozestavení týmu. Když hráči drží pozice až u postranních čar, musí se obrana soupeře **roztáhnout** a mezi obránci vzniknou mezery, kudy jde přihrát nebo naběhnout. Když se všichni stáhnou ke středu, obrana stojí pohromadě a zápas připomíná tlačenici u výčepu.

**Hloubka** je svislá vzdálenost, tedy jak daleko od sebe jsou hráči směrem k brankám. Anglický svaz radí zaujímat **vysoké, široké i hluboké** pozice, aby se obrana soupeře natáhla. Hráč s míčem má mít možnost přihrávky:
- **před sebe**, třeba na útočníka, který nabíhá za obranu,
- **vedle sebe**, na spoluhráče ve stejné výšce,
- **za sebe**, kam může míč vrátit, když vpředu nic není.

Když stojí deset hráčů v jedné linii, chybí hloubka a každá ztráta míče je nebezpečná, protože za nimi nikdo není.

Šířka se nejlépe využije **přenesením hry**, tedy rychlým přesunem míče z jedné strany hřiště na druhou. Bránící tým se posouvá ke straně, kde je míč, a čím víc hráčů se tam nahrne, tím víc místa nechá jinde. Když necháš na druhé straně jednoho hráče, může po přenesení dostat míč v souboji **jeden na jednoho**.

Pro trenéra: křídlo, které drží šířku, se často dlouho nedostane k míči. To není flákání, to je práce. Jen ať u té lajny nestojí s rukama v kapsách.`,
    },
    {
      id: "taktika-combinations",
      category: "taktika",
      difficulty: 2,
      part: 2,
      title: "Kombinace: narážečka, přeběhnutí, převzetí",
      body: `Proti dobře postavenému obránci se samotným driblinkem daleko nedojde. Pomůže **kombinace dvou hráčů**, natrénovaná tak, že ji tým hraje bez přemýšlení.

**Narážečka**, říká se jí i **zeď**: hráč A přihraje hráči B, oběhne bránícího hráče a dostane míč zpátky do volného prostoru. Hráč A má přihrát, až když se k němu obránce přiblíží, a pak hned vyrazit. Hráč B musí stát tak, aby mohl míč vrátit **prvním dotykem**. Když si ho nejdřív zpracuje, obránce se stihne otočit a je po všem.

**Přeběhnutí** (anglicky overlap) obvykle hraje **krajní obránce**: přihraje křídlu do nohy a oběhne ho **po vnější straně**. Křídlo si míč podrží a přitáhne obránce, aby měl spoluhráč čas doběhnout. Vznikne **dva na jednoho** a obránce si musí vybrat. Když jde na hráče s míčem, je volný ten, kdo obíhá. Když jde za obíhajícím, má křídlo volnou cestu.

Náběh **po vnitřní straně** spoluhráče se anglicky jmenuje **underlap**. Hráč nabíhá do prostoru mezi krajního a středního obránce, tedy blíž k bráně.

**Převzetí míče** vypadá jako maličkost: hráč B běží proti hráči A a míč si od něj vezme. Hráč A kryje míč nohou, která je dál od obránce. Když obránce jde za hráčem B, může A převzetí jen **předstírat** a pokračovat s míčem sám.

Pro všechny kombinace platí:
- **načasování** je důležitější než rychlost,
- přihrávka musí jít snadno zpracovat,
- domluva hlasem nebo pohledem je nutnost.

Na okrese má každý tým jednoho hráče, který narážečku hraje pořád. Potíž je, že míč vrací tam, kde zrovna nikdo není.`,
    },
    {
      id: "taktika-low-block-attack",
      category: "taktika",
      difficulty: 2,
      part: 2,
      title: "Útok proti zatažené obraně",
      body: `Hrát proti soupeři, který se zatáhne, vypadá jednoduše: máš míč, máš území. Jenže tým v **nízkém bloku** postaví obrannou řadu těsně před vlastní branku a zavře prostor, kam bys chtěl hrát.

Takové obraně se přezdívá **zaparkovaný autobus**. Výraz zpopularizoval **José Mourinho** roku 2004 po bezbrankové remíze své Chelsea s Tottenhamem: „Jak se u nás v Portugalsku říká, přivezli autobus a nechali ho stát před brankou.“

Co proti autobusu funguje:
- **trpělivost**: nehnat finální přihrávku za každou cenu, ale počkat na správnou chvíli,
- **rychlé přenesení hry**: blok se přesouvá ke straně míče, a když míč rychle přejde na druhou stranu, může tam soupeřův krajní obránce zůstat osamocený proti přesile,
- **hra kolem, ne skrz**: většina týmů je nejhustší uprostřed, proto bývá nejsnazší obejít je po stranách,
- **vylákat obránce**: hráč, který podrží míč, vytáhne obránce z pozice a uvolní místo spoluhráči,
- **napadat hned po ztrátě**, jinak se soupeř z tlaku vymaní.

Samotné centry nestačí. Zatažená obrana má ve vápně dost hráčů, aby je odhlavičkovala. Ukázkou je zápas **Manchesteru United s Fulhamem** z 9. února 2014. United poslali do vápna **81 centrů**, spoluhráče z nich našlo jen asi 18 a zápas skončil **2:2**. Trenér Fulhamu po zápase klidně řekl, že soupeř centroval z velkých úhlů a jeho tým to dobře ubránil.

Pro okres: proti autobusu nepomůže nervozita na lavičce ani řev strejdy „střílej!“. Pomůže míč v pohybu a hráči, kteří drží šířku i ve chvíli, kdy se jim zdá, že se nic neděje.`,
    },
    {
      id: "taktika-crossing",
      category: "taktika",
      difficulty: 2,
      part: 2,
      title: "Centry a náběhy do vápna",
      body: `**Centr** je přihrávka do pokutového území soupeře, obvykle z prostoru mezi vápnem a postranní čárou. Aby z něj byl gól, musí sedět tři věci: kam centr letí, kdo kam nabíhá a kdy.

Druhy centrů:
- **Zpětná přihrávka** (anglicky cut-back) přichází z místa blízko brankové čáry a jde nízko **dozadu** do prostoru kolem pokutové značky. Obránci couvají ke své brance a útočník přibíhá čelem k bráně.
- **Centr z hloubky** jde dřív, ještě než se obrana srovná, často dlouze na **zadní tyč**.
- Klasický centr od lajny, vysoký nebo prudký po zemi.

Náběhy do vápna se dělí do zón, aby nestáli dva hráči na jednom místě:
- **přední tyč**, kde se dá míč tečovat nebo prodloužit,
- **střed** zhruba u pokutové značky,
- **zadní tyč**, kam propadají míče přes všechny,
- a jeden hráč čeká **na hraně vápna** na odražené míče.

Rozhoduje **načasování**. Útočník, který do vápna přijde moc brzy, stojí na místě, obránce ho má přečteného a útočník nemá z čeho vyskočit. Lepší je přiběhnout v pohybu tak, aby dorazil zároveň s míčem. Klamavý pohyb, třeba naznačit přední tyč a odbočit na zadní, získá krok náskoku.

Obrana se brání tím, že nejbližší hráč **zavře centrujícího**. Tím zablokuje nebezpečné zpětné přihrávky a donutí soupeře centrovat hlouběji do vápna, kde se míč snáz odhlavičkuje.

Na okrese platí ještě jedno pravidlo: centr do prázdného vápna je jen hodně složitý způsob, jak vrátit míč soupeřovu brankáři.`,
    },

    // ══ Základní kurz, 3. díl: Obranný blok ══
    {
      id: "taktika-compact-block",
      category: "taktika",
      difficulty: 2,
      part: 3,
      title: "Kompaktní blok a posouvání",
      body: `Zónová obrana hlídá prostor. Aby fungovala, musí se celý tým pohybovat jako jeden **blok**, ne jako deset samostatných hlídačů.

**Kompaktnost** znamená malé vzdálenosti mezi hráči vedle sebe i mezi řadami za sebou. Na šířku jde o to, aby mezi obránci neprošla přihrávka. Při nácviku obranné čtyřky se jako vodítko uvádí **6–8 metrů** mezi sousedními obránci. Na hloubku jde o to, aby mezi obranou a zálohou nezbylo místo, kde si soupeř v klidu převezme míč a otočí se.

Podle čeho se hráč v zóně staví? Hlavně podle **míče**, **spoluhráčů** a **prostoru**, který má chránit. Soupeř je až další v pořadí.

Jak se blok pohybuje:
- **posouvá se ke straně míče**, celá řada najednou, jako když se sune skříň,
- vzdálený krajní obránce se může **stáhnout dovnitř**, pokud pořád vidí na hráče na své straně,
- při **přihrávce dozadu** se obranná řada posune vpřed a zmenší prostor,
- obránci drží **jednu linii**, nikdo nevyčnívá.

Cílem je donutit soupeře hrát **kolem bloku**, ne skrz něj. Míč na kraji je menší nebezpečí než míč mezi řadami.

Mistrem kompaktnosti byl **Arrigo Sacchi**. Jeho AC Milán s rozestavením 4-4-2 a zónovou obranou vyhrál Pohár mistrů evropských **1989 a 1990**. Mezi obranou a útokem nechával nejvýš **25 metrů** a na tréninku nechal hráče hrát zápas **bez míče**, aby se naučili posouvat. Sacchi nikdy nehrál profesionálně a dlouho prodával boty. Kritikům odpověděl, že žokej taky nemusel být dřív koněm.

Takže až ti v kabině někdo řekne, že trénink bez míče je blbost, máš argument z Milána.`,
    },
    {
      id: "taktika-wide-defending",
      category: "taktika",
      difficulty: 2,
      part: 3,
      title: "Obrana na křídle a zdvojování",
      body: `Rychlé křídlo, které jde jeden na jednoho, je noční můra každého krajního obránce. Pár zásad ale pomůže.

Krajní obránce má křídlo **přilepit** tak blízko, aby se nemohlo otočit, ale **nevyskakovat** do zákroku, jinak útočník proběhne kolem. Hlavně mu nesmí nechat prostor **zasekávat dovnitř** k bráně. Křídlo u lajny je menší nebezpečí než křídlo uprostřed.

Odtud pravidlo z tréninku presinku: **postranní čára je obránce navíc**. Když tým natlačí soupeře k lajně, má hráč s míčem z jedné strany aut a možností na přihrávku mu ubude.

**Zdvojování** znamená, že na hráče s míčem jdou **dva**. Typicky křídlo nebo krajní záložník pomůže vlastnímu krajnímu obránci proti nejnebezpečnějšímu hráči soupeře. Zdvojení ale něco stojí: když jdou dva na jednoho, někde jinde zůstal soupeř volný. Proto:
- volného nech toho **nejméně nebezpečného** soupeře,
- zbytek obrany se musí **posunout** a zavřít prostor,
- zdvojuj, když to dává smysl, ne pokaždé ze zvyku.

Když je krajní obránce přesto přehrán, **nejbližší spoluhráč** musí přeběhnout a zavřít prostor. Krajní obránce na **druhé straně** se může stáhnout dovnitř k obráncům, ale pořád musí vidět na svého hráče.

A když křídlo vnikne do vápna, krajní obránce ho sleduje a blokuje mu náběh. Nedívá se jen na míč jako divák v první řadě.

Pro okresního trenéra: v prvních minutách zápasu sleduj, jak rychlé je soupeřovo křídlo. Podle toho řekni krajnímu obránci, jak blízko k němu má stát. Když běhá jako zajíc, dva metry náskoku navíc se hodí.`,
    },
    {
      id: "taktika-outnumbered",
      category: "taktika",
      difficulty: 2,
      part: 3,
      title: "Obrana v přečíslení",
      body: `Brejk soupeře, dva útočníci proti jednomu obránci a za ním jen brankář. Každý okresní stoper to zažil a většina si pamatuje i výsledek. Co dělat?

První zásada: **zdržovat**. Úkolem obránce není hned získat míč, ale **zpomalit útok** a usměrnit ho, než se vrátí spoluhráči. Kdo skočí do skluzu a mine, otevře útočníkům cestu k bráně.

Jak se bránit dva na jednoho:
- **couvat šikmo**, tak aby obránce zavíral přihrávku mezi oběma útočníky a zároveň kryl branku,
- napadat pod takovým úhlem, aby z dvou na jednoho udělal **souboj jeden na jednoho**: hráč s míčem pak nemá komu přihrát a musí jít sám,
- stát **bokem a nízko**, aby se dalo rychle otočit,
- mít **oba útočníky v zorném poli**, ne jen míč.

Kdy vyrazit na míč? Když se útočníkovi **nepovede první dotyk** nebo když je přihrávka **slabá**. Pak má obránce šanci doskočit, zatímco míč ještě jede.

Pomoct může i směr. Anglická reprezentace to cvičí takhle: krajní obránce proti dvěma soupeřům u lajny **pošle hráče s míčem dovnitř**, kde stoper zavře hrotového útočníka. Obránce tak nezůstane dva na jednoho po vnější straně.

Ostatní hráči mezitím dělají **návratový běh**. Kdo se po ztrátě míče loudá zpátky, nechává spoluhráče v přečíslení samotného.

Pro okres to shrneme do jedné věty: nejlepší obránce v přečíslení není ten, kdo předvede nejhezčí skluz, ale ten, kdo vydrží couvat, dokud nedoběhne pomoc. A brankář mezitím mluví, ne mlčí.`,
    },
    {
      id: "taktika-ten-men",
      category: "taktika",
      difficulty: 2,
      part: 3,
      title: "Hra v deseti po vyloučení",
      body: `Červená karta v prvním poločase a najednou máš na hřišti deset. Nejdřív pravidla: hráče vyloučeného **po výkopu** nikdo nenahradí. Jinak je to s hráčem ze zápisu vyloučeným **ještě před výkopem**: toho může nahradit náhradník a tým o žádné střídání nepřijde.

Co dál? Často trenér obětuje útočníka a nechá dvě řady po čtyřech, tedy **4-4-1**. Obrana a záloha zůstanou kompaktní a vpředu zůstane jeden hráč, který podrží míč a dá spoluhráčům vydechnout.

Ukázka z Ligy mistrů: v semifinále 2010 na Camp Nou byl záložník Interu **Thiago Motta** vyloučen ve **28. minutě**. Inter **José Mourinha** pak bránil v 4-4-1, prohrál jen **0:1** a díky výhře 3:1 z prvního zápasu postoupil do finále.

Zvláštní případ je vyloučený **brankář**. Někdo musí do branky. Obvykle trenér stáhne hráče z pole a pošle na hřiště náhradního brankáře, i když ho to stojí jedno střídání. Ve finále Ligy mistrů 2006 byl **Jens Lehmann** z Arsenalu vyloučen v **18. minutě** a stal se vůbec prvním hráčem vyloučeným ve finále Poháru mistrů. Náhradní brankář Manuel Almunia přišel na hřiště za **Roberta Pirèse**. Arsenal přesto vedl, nakonec ale s Barcelonou prohrál 1:2.

Když už střídání nezbývá, může si místo s brankářem vyměnit hráč z pole. Rozhodčí to ale musí vědět předem a výměna proběhne při přerušení hry.

Rady pro hru v deseti:
- dopředu urči, kdo jde při vyloučení ze sestavy,
- šetři síly, ať běhá míč, ne hráči,
- hlídej si žluté karty, další vyloučení bývá konec nadějí.

Na okrese se v deseti někdy hraje i bez karty, když středopolař nedorazí z vinobraní. Princip je stejný.`,
    },

    // ══ Základní kurz, 4. díl: Zápasové koučování ══
    {
      id: "taktika-substitutions",
      category: "taktika",
      difficulty: 2,
      part: 4,
      title: "Střídání: kolik a kdy",
      body: `Jak náhradník přichází na hřiště, se probírá na licenčním kurzu. Tady jde o počty a o to, kdy střídat.

Pravidla fotbalu (IFAB) dovolují v oficiálních soutěžích **nejvýše pět** střídajících hráčů, konkrétní počet určuje soutěž. V nejvyšších ligách a v reprezentaci má tým během hry nejvýš **tři příležitosti** ke střídání a navíc může střídat **o poločase**. Soutěž smí povolit i **dodatečné střídání při otřesu mozku**.

U nás rozhoduje **Soutěžní řád FAČR**. V neprofesionálních soutěžích mužů smí tým vystřídat **nejvýše pět hráčů**. Když rozpis soutěže povolí **opakované střídání**, smí vystřídat nejvýše **sedm**. Opakované střídání znamená, že hráč, který už byl vystřídán, se smí vrátit do hry. V posledních **deseti minutách** se ale střídá jen obyčejně, a to nejvýše dva hráči. Při prodloužení přibude jedno střídání a rozpis může povolit jedno navíc při zranění hlavy s otřesem nebo podezřením na otřes mozku. Náhradníků smí být v zápise nejvýše sedm.

Od sezóny **2026/27** platí nové pravidlo proti zdržování: střídaný hráč musí opustit hřiště do **deseti sekund** od zvednutí tabule, případně od pokynu rozhodčího. Když to nestihne, musí hřiště opustit stejně, ale náhradník smí nastoupit až při prvním přerušení **po uplynutí minuty** od navázání hry. Tým tak chvíli hraje o hráče méně.

Kdy střídat:
- když hráč nestačí nebo je zraněný, čekání nikomu nepomůže,
- když chceš změnit hru, střídej dřív, ať má náhradník čas zápas ovlivnit,
- střídání v poslední minutě kvůli zdržení se s desetisekundovým pravidlem může vymstít.

Na okrese platí ještě jedna věc: náhradník, který celou sezónu prosedí, příště nemusí přijet. I o tom je trenérská práce.`,
    },
    {
      id: "taktika-in-game-changes",
      category: "taktika",
      difficulty: 2,
      part: 4,
      title: "Změna rozestavení během zápasu",
      body: `Plán, se kterým tým jde na hřiště, často vydrží jen do prvního gólu. Pak musí trenér rozhodnout, jestli ho upraví.

Typické důvody ke změně:
- **skóre**: když prohráváš, přidáš hráče dopředu, když vedeš, můžeš přidat obránce a hrát v pětiobraně,
- **soupeř** změnil rozestavení nebo tě přečísluje v záloze,
- **únava** nebo zranění klíčového hráče,
- **vyloučení**, tvoje nebo soupeřovo.

Změna nemusí znamenat střídání. Stačí posunout krajního záložníka do útoku nebo stáhnout defenzivního záložníka mezi stopery. Střídání ale přinese čerstvé nohy a hráči změnu líp postřehnou.

Ukázka z **mistrovství světa 2022**: Japonsko prohrávalo po prvním poločase s Německem **0:1** po Gündoğanově penaltě. Trenér **Hajime Moriyasu** o přestávce poslal na hřiště obránce Takehira Tomiyasua a přešel na **tři stopery** v rozestavení 3-4-3. Japonsko pak víc drželo míč, napadalo výš a oba góly dali **střídající hráči** Ritsu Doan a Takuma Asano. Japonsko vyhrálo **2:1**.

Jak změnu hráčům předat:
- z technické zóny smí taktické pokyny dávat **vždy jen jedna osoba** a lidé z lavičky mají zůstat uvnitř zóny,
- změnu je dobré říct **kapitánovi** nebo hráči, který ji rozšíří dál,
- náhradní plán musí být **natrénovaný**. Anglické mládežnické reprezentace mají před zápasem nacvičené odpovědi na různé situace typu „co když“. Když tým o rozestavení 3-5-2 slyší poprvé v 70. minutě, výsledkem bývá zmatek, ne zlom.

Okresní realita: křičet na hráče na druhé straně hřiště proti větru nemá smysl. Lepší jsou domluvená jednoduchá hesla, třeba „hrajeme na pět“.`,
    },
    {
      id: "taktika-half-time",
      category: "taktika",
      difficulty: 2,
      part: 4,
      title: "Poločasová přestávka",
      body: `Patnáct minut v kabině umí zápas otočit i pohřbít. Nejdřív pravidla. Podle IFAB má hráč na přestávku nárok a ta nesmí být delší než **15 minut**. Délku určuje soutěž a změnit ji jde jen se **svolením rozhodčího**. Soutěžní řád FAČR ukládá rozhodčímu dodržet přestávku **15 minut** a počítá se do ní i **odchod do kabin a návrat** na hřiště. V soutěžích mužů může být kratší, když se na tom dohodnou oba vedoucí družstev a rozhodčí.

Anglický svaz radí:
- první **pár minut** nech hráče vydýchat, napít se a promluvit si mezi sebou. Emoce jsou vysoko a hned začít řvát nemá smysl,
- pak řekni **dvě, nanejvýš tři** hlavní věci. Připrav si je už během poločasu a klidně si je napiš na tabuli,
- mluv **klidně a pozitivně**,
- zeptej se hráčů, co vidí oni. Kdo hraje vzadu, vidí soupeřovy náběhy líp než ty z lavičky.

Pomoct můžou i náhradníci. Dej jim v prvním poločase úkol, třeba sledovat, jak soupeř rozehrává, a o přestávce ať řeknou, co viděli.

Nezapomeň na tělo. Magni Mohr a kolegové v roce 2004 měřili hráčům během zápasu teplotu svalů. O přestávce klesla, a kdo celou přestávku proseděl, byl na začátku druhého poločasu ve sprintu **o 2,4 % pomalejší**. Hráči, kteří o přestávce absolvovali lehké **rozehřátí**, si rychlost udrželi. Pár minut klusu před výkopem druhého poločasu tedy není parádička.

A co nedělat: kopat do dveří, hledat viníka a vyjmenovat dvanáct chyb. Hráči si stejně zapamatují jen tu, kterou jsi řekl nejhlasitěji. A čaj s rumem počká až na večer.`,
    },
    {
      id: "taktika-opponent-scouting",
      category: "taktika",
      difficulty: 2,
      part: 4,
      title: "Rozbor soupeře",
      body: `Proti komu hrajeme v neděli? Na okrese to často víš jen z tabulky a z vyprávění v hospodě. I to je ale začátek rozboru soupeře.

Kde brát informace:
- **vidět soupeře naživo**, třeba v jeho předchozím zápase,
- **video**, pokud nějaké existuje,
- výsledky a střelci z posledních kol,
- spoluhráči, kteří proti nim hráli, a známí z vesnice.

Na co se dívat:
- **rozestavení** a jak se mění s míčem a bez míče,
- **rozehrávka**: kope brankář dlouze, nebo rozehrává krátce na stopery?
- **napadání**: jak vysoko a kdo ho spouští,
- **klíčový hráč**: přes koho jde všechno a kterou nohou kope,
- **standardky**: kdo je kope a kam. Amatérské týmy často opakují stejné varianty rohů a volných kopů, takže se na ně dá dobře připravit.

Pak přijde nejtěžší část: **vybrat**. Hráči nepotřebují dvacet stran, ale pár srozumitelných sdělení, co z toho plyne pro náš plán.

Rozbor soupeře není novinka. **Don Revie** v Leedsu (1961–1974) dával hráčům rozsáhlé složky o soupeřích, aby znali každý detail. A nejslavnější tahák fotbalu se objevil 30. června 2006 ve čtvrtfinále mistrovství světa. Německý brankář **Jens Lehmann** měl při penaltovém rozstřelu s Argentinou papírek se jmény argentinských exekutorů a jejich zvyky. Podklady připravil trenér brankářů **Andreas Köpke**. Lehmann chytil dvě penalty a Německo vyhrálo rozstřel **4:2**. Papírek se pak vydražil za **milion eur** a dnes je k vidění v muzeu Haus der Geschichte v Bonnu.

Jen pozor: rozbor soupeře nesmí přebít vlastní hru. Kdo myslí jen na soupeře, zapomene, co umí sám.`,
    },

    // ══ Pokročilý kurz, 2. díl: Moderní trendy ══
    {
      id: "taktika-positional-play",
      category: "taktika",
      difficulty: 3,
      part: 2,
      title: "Poziční hra (juego de posición)",
      body: `**Poziční hra**, španělsky **juego de posición**, je způsob, jak organizovat tým s míčem. Hráči obsazují určené prostory tak, aby kolem míče vznikaly **trojúhelníky a kosočtverce** a míč se mohl posouvat přes třetiny hřiště dopředu.

Kořeny sahají k **Rinusi Michelsovi** a jeho Ajaxu. Myšlenky dál rozvinul **Johan Cruyff** v Barceloně a na vrchol moderního fotbalu je dovedl jeho žák **Pep Guardiola**.

V Guardiolově pojetí je hřiště rozdělené svislými a vodorovnými čarami do zón a každý hráč má svou. Pomocné pravidlo zní: na jedné vodorovné linii nikdy víc než **tři** hráči, na jedné svislé nikdy víc než **dva**. Hráč s míčem tak má vždycky komu přihrát. Hráči si pozice prohazují, ale prostory zůstávají obsazené.

Cílem je získat **převahu**. Poziční hra rozlišuje tři druhy:
- **početní**: v některém prostoru je víc našich hráčů než soupeřových,
- **kvalitativní**: lepší hráč dostane míč v izolaci proti slabšímu protivníkovi jeden na jednoho,
- **poziční**: hráč stojí mezi řadami soupeře nebo za nimi, kde má víc času a místa.

Tým s míčem musí využít **celou šířku** hřiště, aby uprostřed vzniklo místo. Kdo šířku drží, záleží na systému: v Manchesteru City to bývala křídla, ve Španělsku Luise Enriqueho krajní obránci.

Slabina? Tým s míčem je roztažený, a když míč ztratí, má hráče daleko od sebe. Proto se poziční hra obvykle pojí s **protipresinkem**: míč se má získat zpátky co nejvýš, dřív než soupeř využije volný prostor.

Na okrese se poziční hra dá trénovat po kouscích. Začni pravidlem, že dva hráči nestojí na jednom místě. Výsledek uvidíš hned, i když strejda na tribuně bude chvíli tvrdit, že se kluci nějak moc přihrávají.`,
    },
    {
      id: "taktika-inverted-full-backs",
      category: "taktika",
      difficulty: 3,
      part: 2,
      title: "Invertovaní krajní obránci",
      body: `Krajní obránce kdysi stál vzadu, pak začal chodit po lajně dopředu. Moderní varianta jde jinam: **dovnitř**. **Invertovaný krajní obránce** se ve chvíli, kdy jeho tým má míč, přesune ze strany do **středu hřiště** a hraje jako další středový záložník. Když tým míč ztratí, vrací se obvykle zpátky do obranné řady.

Myšlenka není nová. Už **Johan Cruyff** v Barceloně měnil rozestavení 4-3-3 na 3-4-3 s kosočtvercem v záloze a jeden krajní obránce přitom šel do středu. Zpopularizoval ji **Pep Guardiola**: v Bayernu Mnichov se dovnitř stahovali **Philipp Lahm** a **David Alaba**, častěji Lahm. V Manchesteru City takovou roli hrál třeba **João Cancelo**, a to vlevo, přestože je pravák.

Co to přináší:
- **přesilu ve středu zálohy**, takže se tým snáz dostane s míčem přes střed,
- ofenzivní záložníci můžou jít **výš**, mezi řady soupeře,
- když soupeřovo křídlo jde za krajním obráncem dovnitř, **uvolní se prostor na kraji** pro souboj jeden na jednoho,
- krajní obránce ve středu **zavírá cestu protiútokům** středem a může hned po ztrátě napadat.

Co to stojí:
- potřebuješ hráče, který umí bránit na kraji a zároveň hrát jako středový záložník, a takových je málo,
- v poslední řadě je při přechodu do obrany o hráče **méně**, takže když soupeř prolomí druhou řadu, moc pomoci za ní není,
- role se může plést s defenzivními záložníky, kteří už ve středu stojí.

Na okrese to zní jako sci-fi, ale princip je jednoduchý: hráč nemusí stát tam, kde ho trenér napsal na tabuli, když tým má míč. Musí ale vědět, kam se vrátit, až ho nemá. Jinak se z invertovaného krajního obránce stane jen ztracený krajní obránce.`,
    },
    {
      id: "taktika-rest-defence",
      category: "taktika",
      difficulty: 3,
      part: 2,
      title: "Rest defence: zajištění při útoku",
      body: `Každý útok jednou skončí ztrátou míče. Otázka je, kdo v tu chvíli stojí za míčem. Hráčům, kteří při útoku zůstávají vzadu nebo kolem míče a jsou připravení na ztrátu, se říká **rest defence**. Výraz je překladem německého **Restverteidigung**. „Rest“ tu znamená **zbytek**, ne odpočinek, takže nejde o hráče, kteří si při útoku dají pauzu.

Obvykle útočí **pět hráčů** a pět jich jistí. Tým, který naléhavě potřebuje gól, jde dopředu se šesti a vzadu nechá čtyři.

Zajištění tvoří většinou **dvě řady**, nejčastěji ve tvaru **3+2** nebo **2+3**:
- **vyšší řada**, obvykle defenzivní záložníci, má zavřít prostor kolem míče a protipresinkem zastavit protiútok hned v zárodku,
- **nižší řada**, většinou obránci, bere dlouhé míče a hlídá velký prostor za sebou, často s brankářem, který vybíhá jako zametač.

Nejčastěji se hraje na **„plus jedna“**: v zajištění je o hráče víc, než kolik má soupeř útočníků, kteří čekají na brejk.

Guardiolův **Manchester City** jistil ve tvaru **3+2**. Nejdřív ho tvořili invertovaní krajní obránci, později se k Rodrimu posouval stoper John Stones nebo Manuel Akanji. **Kloppův Liverpool** hrál spíš **2+3**: dva stopeři vzadu a před nimi trojice záložníků, zatímco krajní obránci táhli útok.

K čemu to je:
- zastaví **protiútoky** soupeře,
- tým může hned napadat a **zamknout soupeře** na jeho polovině, což ho fyzicky i psychicky vyčerpává.

Háček je ve vzdálenostech. Když stojí zajištění moc daleko od sebe, nezavře přihrávky. Když moc blízko, chybí lidi v útoku.

Na okrese se tomu říká „někdo musí zůstat doma“. Jen je dobré předem vědět kdo, a ne to řešit hádkou po inkasovaném brejku.`,
    },
    {
      id: "taktika-man-marking-press",
      category: "taktika",
      difficulty: 3,
      part: 2,
      title: "Osobní presink po celém hřišti",
      body: `Většina týmů napadá **zónově**: hráč zavírá prostor a přihrávkové cesty. Pár trenérů na to jde obráceně. Každý hráč má svého soupeře a jde za ním **po celém hřišti**, klidně až k jeho vápnu.

Nejznámějším zastáncem je Argentinec **Marcelo Bielsa**, přezdívaný El Loco, tedy Blázen. S **Leeds United** (2018–2022) vyhrál v sezóně **2019/20** druhou anglickou ligu a postoupil do Premier League. Bielsa si nechává jednu pojistku: **volného hráče vzadu**. Proti jednomu útočníkovi hrají dva stopeři, proti dvěma tři. Ostatní hlídají „své“ hráče, ať jdou kamkoli.

Na tréninku k tomu Leeds hrál takzvaný **murderball**: zápas bez přerušení, bez faulů a ofsajdů, a když míč opustil hřiště, trenéři hned vhodili nový. Hráči říkali, že to bylo těžší než zápasy.

Druhým jménem je Ital **Gian Piero Gasperini**. Jeho **Atalanta** (2016–2025) bránila s prvky pružného osobního hlídání po celém hřišti a s míčem hrála se třemi obránci a útočícími wingbeky. V roce 2024 vyhrála **Evropskou ligu**, když ve finále porazila Leverkusen **3:0**. Ademola Lookman dal hattrick a Leverkusen prohrál poprvé po **51 zápasech**. Pro Atalantu to byla první evropská trofej.

Proč to funguje: soupeř nemá volného hráče na krátkou přihrávku, každé zpracování míče je pod tlakem a tým získává míč vysoko.

Proč je to riskantní:
- když jeden prohraje souboj vysoko na hřišti, nejbližší pomoc je až **volný stoper** vzadu,
- soupeřova stopera, který vyrazí s míčem dopředu, často nemá kdo vzít, protože záložníci hlídají své hráče,
- hráči potřebují výbornou **kondici** a Bielsovým týmům se ji přes celou sezónu často nedařilo udržet,
- každý souboj je jeden na jednoho, takže proti lepším hráčům se snadno prohrává.

Okresní poučení: osobní presink není pro tým, kde půlka kádru v 70. minutě hledá stín.`,
    },
  ],

  questions: [
    // ── Šířka a hloubka v útoku ──
    {
      id: "taktika-width-depth-1",
      lessonId: "taktika-width-depth",
      text: "Co v trenérské řeči znamená šířka týmu?",
      options: [
        "Rozměr hřiště podle pravidel",
        "Počet útočníků v sestavě",
        "Vzdálenost mezi pravou a levou stranou rozestavení týmu",
        "Vzdálenost mezi brankářem a hrotovým útočníkem",
      ],
      correct: 2,
      explain: "Šířka je vzdálenost mezi pravou a levou stranou rozestavení. Vzdálenost směrem k brankám je naopak hloubka.",
    },
    {
      id: "taktika-width-depth-2",
      lessonId: "taktika-width-depth",
      text: "Proč má tým v útoku držet hráče až u postranních čar?",
      options: [
        "Aby se obrana soupeře roztáhla a mezi obránci vznikly mezery",
        "Aby krajní hráči nemuseli tolik běhat",
        "Protože pravidla zakazují, aby všichni stáli uprostřed",
        "Aby měl rozhodčí lepší výhled",
      ],
      correct: 0,
      explain: "Hráči u lajn donutí obranu soupeře roztáhnout se a mezi obránci vzniknou mezery na přihrávku nebo náběh.",
    },
    {
      id: "taktika-width-depth-3",
      lessonId: "taktika-width-depth",
      text: "Kam všude má podle lekce hráč s míčem mít možnost přihrávky?",
      options: [
        "Jen dopředu, dozadu se nehraje",
        "Před sebe, vedle sebe i za sebe",
        "Jen do stran k postranním čarám",
        "Nikam, má hlavně kličkovat",
      ],
      correct: 1,
      explain: "Hloubka znamená, že hráč s míčem má možnost přihrávky před sebe, vedle sebe i za sebe, kam může míč vrátit.",
    },
    {
      id: "taktika-width-depth-4",
      lessonId: "taktika-width-depth",
      text: "Co je přenesení hry?",
      options: [
        "Odložení zápasu kvůli počasí",
        "Přihrávka zpátky brankáři",
        "Výměna stran o poločase",
        "Rychlý přesun míče z jedné strany hřiště na druhou",
      ],
      correct: 3,
      explain: "Přenesení hry je rychlý přesun míče z jedné strany na druhou, kde soupeř nechal méně hráčů.",
    },
    {
      id: "taktika-width-depth-5",
      lessonId: "taktika-width-depth",
      text: "Proč může po přenesení hry vzniknout souboj jeden na jednoho?",
      options: [
        "Protože po dlouhé přihrávce smí bránit jen jeden hráč",
        "Bránící tým se posouvá ke straně míče a na druhé straně nechá méně hráčů",
        "Protože pravidla po přenesení zakazují zdvojovat",
        "Protože soupeř musí po přenesení vystřídat",
      ],
      correct: 1,
      explain: "Bránící tým se nahrne ke straně míče. Hráč, který zůstal na druhé straně, pak po přenesení často dostane míč proti jedinému obránci.",
    },

    // ── Kombinace ──
    {
      id: "taktika-combinations-1",
      lessonId: "taktika-combinations",
      text: "Jak probíhá narážečka, které se říká i zeď?",
      options: [
        "Hráč přihraje spoluhráči, oběhne obránce a dostane míč zpátky",
        "Hráč kopne volný kop do zdi soupeřů",
        "Dva hráči si bez míče vymění pozice",
        "Hráč přihraje brankáři a ten nakopne míč dopředu",
      ],
      correct: 0,
      explain: "Při narážečce hráč A přihraje hráči B, oběhne bránícího hráče a dostane míč zpátky do volného prostoru.",
    },
    {
      id: "taktika-combinations-2",
      lessonId: "taktika-combinations",
      text: "Proč má hráč B při narážečce vracet míč prvním dotykem?",
      options: [
        "Pravidla dovolují v kombinaci jen jeden dotyk",
        "Aby ušetřil síly na druhý poločas",
        "Aby rozhodčí nepískal zdržování",
        "Když si míč nejdřív zpracuje, obránce se stihne otočit",
      ],
      correct: 3,
      explain: "Narážečka stojí na rychlosti. Když si hráč B míč nejdřív zpracuje, obránce se otočí a výhoda je pryč.",
    },
    {
      id: "taktika-combinations-3",
      lessonId: "taktika-combinations",
      text: "Krajní obránce oběhne křídlo s míčem po vnější straně. Jaké dilema má teď bránící hráč?",
      options: [
        "Žádné, stačí dál hlídat hráče s míčem",
        "Musí se rozhodnout, jestli fauluje, nebo dostane žlutou",
        "Musí volit mezi hráčem s míčem a obíhajícím a jednoho nechá volného",
        "Musí zavolat brankáře, aby vyběhl",
      ],
      correct: 2,
      explain: "Přeběhnutí vytvoří dva na jednoho. Když obránce jde na hráče s míčem, je volný obíhající, a naopak.",
    },
    {
      id: "taktika-combinations-4",
      lessonId: "taktika-combinations",
      text: "Čím se underlap liší od přeběhnutí?",
      options: [
        "Hraje se jen při kopu z rohu",
        "Hráč nabíhá po vnitřní straně spoluhráče, blíž k bráně",
        "Hraje ho jen brankář při rozehrávce",
        "Hráč nabíhá pozpátku, aby zmátl obránce",
      ],
      correct: 1,
      explain: "Přeběhnutí jde po vnější straně spoluhráče, underlap po vnitřní, do prostoru mezi krajního a středního obránce.",
    },
    {
      id: "taktika-combinations-5",
      lessonId: "taktika-combinations",
      text: "Při převzetí míče jde obránce za hráčem B, který si má míč vzít. Co může udělat hráč A?",
      options: [
        "Převzetí jen předstírat a pokračovat s míčem sám",
        "Musí míč pustit, jinak je to faul",
        "Zastavit hru a požádat o míč rozhodčího",
        "Přihrát zpátky brankáři",
      ],
      correct: 0,
      explain: "Hráč A kryje míč a když obránce jde za hráčem B, může převzetí jen naznačit a pokračovat sám.",
    },

    // ── Útok proti zatažené obraně ──
    {
      id: "taktika-low-block-attack-1",
      lessonId: "taktika-low-block-attack",
      text: "Co znamená, že tým brání v nízkém bloku?",
      options: [
        "Hráči napadají už u soupeřova vápna",
        "Obranná řada stojí těsně před vlastní brankou",
        "Tým hraje bez brankáře",
        "Obránci smí hrát jen hlavou",
      ],
      correct: 1,
      explain: "V nízkém bloku stojí obranná řada blízko vlastní branky a tým zavírá prostor před ní.",
    },
    {
      id: "taktika-low-block-attack-2",
      lessonId: "taktika-low-block-attack",
      text: "Kdo zpopularizoval výraz „zaparkovaný autobus“?",
      options: ["Alex Ferguson", "Arrigo Sacchi", "José Mourinho", "Johan Cruyff"],
      correct: 2,
      explain: "José Mourinho roku 2004 po bezbrankové remíze Chelsea s Tottenhamem řekl, že soupeř přivezl autobus a nechal ho stát před brankou.",
    },
    {
      id: "taktika-low-block-attack-3",
      lessonId: "taktika-low-block-attack",
      text: "Proč proti zatažené obraně pomáhá rychlé přenesení hry?",
      options: [
        "Blok se přesouvá ke straně míče a na druhé straně může zůstat obránce osamocený",
        "Po přenesení hry soupeř nesmí bránit",
        "Dlouhá přihrávka se počítá jako střela",
        "Soupeř musí po přenesení hry vystřídat",
      ],
      correct: 0,
      explain: "Blok se posouvá za míčem. Když míč rychle přejde na druhou stranu, může tam krajní obránce soupeře zůstat sám proti přesile.",
    },
    {
      id: "taktika-low-block-attack-4",
      lessonId: "taktika-low-block-attack",
      text: "Kolik centrů poslal Manchester United do vápna Fulhamu v únoru 2014 a jak zápas skončil?",
      options: ["18 centrů a výhra 5:0", "81 centrů a výhra 3:0", "40 centrů a prohra 0:1", "81 centrů a remíza 2:2"],
      correct: 3,
      explain: "United poslali do vápna 81 centrů, spoluhráče jich našlo jen asi 18 a zápas skončil 2:2. Samotné centry proti zatažené obraně nestačí.",
    },
    {
      id: "taktika-low-block-attack-5",
      lessonId: "taktika-low-block-attack",
      text: "Kudy bývá podle lekce nejsnazší obejít organizovanou obranu?",
      options: [
        "Středem, kde je nejvíc hráčů",
        "Přes brankáře soupeře",
        "Po stranách, protože většina týmů je nejhustší uprostřed",
        "Jen ze standardních situací",
      ],
      correct: 2,
      explain: "Většina týmů je nejkompaktnější uprostřed, proto se organizovaná obrana často nejsnáz obchází kolem, po stranách.",
    },

    // ── Centry a náběhy do vápna ──
    {
      id: "taktika-crossing-1",
      lessonId: "taktika-crossing",
      text: "Odkud a kam typicky jde zpětná přihrávka (cut-back)?",
      options: [
        "Od středové čáry dlouze za obranu",
        "Z rohového čtvrtkruhu přímo na branku",
        "Od vlastního brankáře na křídlo",
        "Z místa blízko brankové čáry nízko dozadu k pokutové značce",
      ],
      correct: 3,
      explain: "Zpětná přihrávka jde z místa u brankové čáry nízko dozadu do prostoru kolem pokutové značky.",
    },
    {
      id: "taktika-crossing-2",
      lessonId: "taktika-crossing",
      text: "Proč je zpětná přihrávka pro obranu nebezpečná?",
      options: [
        "Hraje se vždycky z rohového čtvrtkruhu",
        "Obránci couvají ke své brance a útočník přibíhá čelem k bráně",
        "Brankář ji nesmí chytit rukama",
        "Letí vždycky vysoko nad hlavami",
      ],
      correct: 1,
      explain: "Obránci se vracejí směrem ke své brance, kdežto útočník přibíhá k míči čelem k bráně a může hned střílet.",
    },
    {
      id: "taktika-crossing-3",
      lessonId: "taktika-crossing",
      text: "Proč se náběhy do vápna dělí do zón (přední tyč, střed, zadní tyč, hrana vápna)?",
      options: [
        "Aby nestáli dva hráči na jednom místě",
        "Protože pravidla určují, kde kdo smí ve vápně stát",
        "Aby měl brankář lepší přehled",
        "Aby se útočníci nesrazili s rozhodčím",
      ],
      correct: 0,
      explain: "Každý náběh míří jinam, takže útočníci pokryjí víc míst, kam centr může dopadnout, a nepřekážejí si.",
    },
    {
      id: "taktika-crossing-4",
      lessonId: "taktika-crossing",
      text: "Proč není dobré přijít do vápna moc brzy?",
      options: [
        "Rozhodčí za to automaticky píská ofsajd",
        "Útočník smí ve vápně stát jen tři sekundy",
        "Útočník stojí, obránce ho má přečteného a nemá z čeho vyskočit",
        "Brankář ho smí z vápna vystrčit",
      ],
      correct: 2,
      explain: "Kdo přijde brzy, čeká na místě. Obránce ho snadno uhlídá a útočník nemá rozběh. Lepší je dorazit v pohybu zároveň s míčem.",
    },
    {
      id: "taktika-crossing-5",
      lessonId: "taktika-crossing",
      text: "Co získá obrana, když nejbližší hráč zavře centrujícího?",
      options: [
        "Soupeř musí hrát dozadu brankáři",
        "Rozhodčí nařídí nepřímý volný kop",
        "Nic, centr přijde stejně",
        "Zablokuje zpětné přihrávky a donutí soupeře centrovat hlouběji do vápna",
      ],
      correct: 3,
      explain: "Zavřený centrující nemůže snadno hrát zpětnou přihrávku a musí centrovat hlouběji, kde se míč snáz odhlavičkuje.",
    },

    // ── Kompaktní blok a posouvání ──
    {
      id: "taktika-compact-block-1",
      lessonId: "taktika-compact-block",
      text: "Co znamená kompaktnost bloku?",
      options: [
        "Malé vzdálenosti mezi hráči vedle sebe i mezi řadami za sebou",
        "Všichni hráči stojí v jedné řadě na brankové čáře",
        "Hráči mají podobnou výšku a váhu",
        "Tým hraje jen dlouhé míče",
      ],
      correct: 0,
      explain: "Kompaktní blok má malé mezery na šířku i mezi řadami, aby soupeř neměl kudy přihrát.",
    },
    {
      id: "taktika-compact-block-2",
      lessonId: "taktika-compact-block",
      text: "Podle čeho se hráč v zónové obraně staví hlavně?",
      options: [
        "Jen podle soupeře, kterého si vybral",
        "Podle pokynů strejdy z tribuny",
        "Podle míče, spoluhráčů a prostoru, který chrání",
        "Podle toho, kde stál na začátku zápasu",
      ],
      correct: 2,
      explain: "V zóně jsou hlavním vodítkem míč, spoluhráči a chráněný prostor. Soupeř je až další v pořadí.",
    },
    {
      id: "taktika-compact-block-3",
      lessonId: "taktika-compact-block",
      text: "Co udělá obranná řada, když soupeř přihraje dozadu?",
      options: [
        "Couvne k vlastní brance",
        "Posune se vpřed a zmenší prostor",
        "Zůstane stát a čeká",
        "Celá se rozběhne na hráče s míčem",
      ],
      correct: 1,
      explain: "Přihrávka dozadu je signál posunout obrannou řadu vpřed a zmenšit soupeři prostor.",
    },
    {
      id: "taktika-compact-block-4",
      lessonId: "taktika-compact-block",
      text: "Kam se kompaktní blok snaží soupeře dostat?",
      options: [
        "Hrát co nejvíc středem",
        "Střílet z dálky za každou cenu",
        "Hrát jen dozadu na brankáře",
        "Hrát kolem bloku, ne skrz něj",
      ],
      correct: 3,
      explain: "Blok chce soupeře vytlačit ven. Míč na kraji je menší nebezpečí než míč mezi řadami.",
    },
    {
      id: "taktika-compact-block-5",
      lessonId: "taktika-compact-block",
      text: "Jakou největší vzdálenost nechával Arrigo Sacchi v Miláně mezi obranou a útokem?",
      options: ["10 metrů", "25 metrů", "40 metrů", "Celou polovinu hřiště"],
      correct: 1,
      explain: "Sacchiho Milán hrál s vysokou obranou a mezi obranou a útokem nebylo víc než 25 metrů.",
    },

    // ── Obrana na křídle a zdvojování ──
    {
      id: "taktika-wide-defending-1",
      lessonId: "taktika-wide-defending",
      text: "Co by krajní obránce neměl křídlu hlavně dovolit?",
      options: [
        "Jít podél postranní čáry",
        "Přihrát dozadu ke stoperovi",
        "Zaseknout si to dovnitř k bráně",
        "Zpracovat si míč u lajny",
      ],
      correct: 2,
      explain: "Křídlo u lajny je menší nebezpečí. Krajní obránce mu nesmí nechat prostor zaseknout si to dovnitř k bráně.",
    },
    {
      id: "taktika-wide-defending-2",
      lessonId: "taktika-wide-defending",
      text: "Co znamená, že postranní čára je „obránce navíc“?",
      options: [
        "Hráč s míčem u lajny má z jedné strany aut a méně možností přihrávky",
        "Asistent rozhodčího smí míč zastavit",
        "Za čárou smí stát náhradník a bránit",
        "Míč za čárou patří vždy bránícímu týmu",
      ],
      correct: 0,
      explain: "Když tým natlačí soupeře k lajně, aut mu z jedné strany zavře cestu a možností na přihrávku ubude.",
    },
    {
      id: "taktika-wide-defending-3",
      lessonId: "taktika-wide-defending",
      text: "Co je zdvojování?",
      options: [
        "Dva útočníci si vymění dresy",
        "Obránce dostane dvě žluté karty",
        "Tým nastoupí se dvěma brankáři",
        "Na hráče s míčem jdou dva bránící hráči",
      ],
      correct: 3,
      explain: "Při zdvojení napadají hráče s míčem dva, typicky krajní obránce s křídlem nebo krajním záložníkem.",
    },
    {
      id: "taktika-wide-defending-4",
      lessonId: "taktika-wide-defending",
      text: "Kterého soupeře máš nechat volného, když zdvojuješ?",
      options: [
        "Hráče, který má míč",
        "Toho nejméně nebezpečného",
        "Nejlepšího střelce soupeře",
        "Nikoho, zdvojení nikoho volného nenechá",
      ],
      correct: 1,
      explain: "Když jdou dva na jednoho, někdo jiný zůstane volný. Má to být ten nejméně nebezpečný.",
    },
    {
      id: "taktika-wide-defending-5",
      lessonId: "taktika-wide-defending",
      text: "Co může udělat krajní obránce na straně hřiště, kde zrovna není míč?",
      options: [
        "Stáhnout se dovnitř k obráncům, ale pořád vidět na svého hráče",
        "Zůstat přilepený u postranní čáry",
        "Vyrazit do útoku",
        "Přeběhnout pomoct se zdvojením na druhou stranu",
      ],
      correct: 0,
      explain: "Vzdálený krajní obránce se smí stáhnout dovnitř a zúžit obranu, ale musí dál vidět na hráče na své straně.",
    },

    // ── Obrana v přečíslení ──
    {
      id: "taktika-outnumbered-1",
      lessonId: "taktika-outnumbered",
      text: "Co je hlavním úkolem jediného obránce proti dvěma útočníkům?",
      options: [
        "Hned skočit do skluzu",
        "Zdržovat a zpomalit útok, než se vrátí spoluhráči",
        "Faulovat hráče s míčem",
        "Utéct k brankáři do vápna",
      ],
      correct: 1,
      explain: "V přečíslení jde hlavně o čas. Obránce zpomaluje útok, dokud nedoběhne pomoc.",
    },
    {
      id: "taktika-outnumbered-2",
      lessonId: "taktika-outnumbered",
      text: "Proč má obránce v přečíslení couvat šikmo?",
      options: [
        "Aby si útočníci mysleli, že je zraněný",
        "Protože couvat rovně pravidla nedovolují",
        "Aby se útočníci dostali do ofsajdu",
        "Aby zavíral přihrávku mezi útočníky a zároveň kryl branku",
      ],
      correct: 3,
      explain: "Šikmým couváním obránce zavírá přihrávkovou cestu mezi oběma útočníky a přitom zůstává mezi míčem a brankou.",
    },
    {
      id: "taktika-outnumbered-3",
      lessonId: "taktika-outnumbered",
      text: "Kdy má obránce v přečíslení vyrazit na míč?",
      options: [
        "Hned, jak útočníci překročí půlku",
        "Až když zakřičí strejda z tribuny",
        "Když se útočníkovi nepovede první dotyk nebo je přihrávka slabá",
        "Nikdy, má jen couvat až k brance",
      ],
      correct: 2,
      explain: "Špatný první dotyk nebo slabá přihrávka dávají obránci šanci doskočit k míči, zatímco ještě jede.",
    },
    {
      id: "taktika-outnumbered-4",
      lessonId: "taktika-outnumbered",
      text: "Proč obránce v přečíslení napadá pod úhlem, který zavírá přihrávku?",
      options: [
        "Aby z dvou na jednoho udělal souboj jeden na jednoho",
        "Aby rozhodčí odpískal faul",
        "Aby útočníka rychleji unavil",
        "Aby útočníky zahnal zpátky na jejich polovinu",
      ],
      correct: 0,
      explain: "Když hráč s míčem nemá komu přihrát, musí jít sám a z přečíslení se stane souboj jeden na jednoho.",
    },
    {
      id: "taktika-outnumbered-5",
      lessonId: "taktika-outnumbered",
      text: "Jak podle lekce řeší anglická reprezentace krajního obránce proti dvěma soupeřům u lajny?",
      options: [
        "Nechá je projít a spoléhá na brankáře",
        "Krajní obránce vždy fauluje",
        "Pošle hráče s míčem dovnitř, kde stoper zavře hrotového útočníka",
        "Celý tým se stáhne do vápna",
      ],
      correct: 2,
      explain: "Krajní obránce pošle míč dovnitř ke stoperovi, který hlídá hrotového útočníka, a nezůstane tak dva na jednoho po vnější straně.",
    },

    // ── Hra v deseti po vyloučení ──
    {
      id: "taktika-ten-men-1",
      lessonId: "taktika-ten-men",
      text: "Hráč je vyloučen ve 30. minutě. Může ho nahradit náhradník?",
      options: [
        "Ano, pokud tým má ještě volné střídání",
        "Ano, ale až o poločase",
        "Ano, pokud soupeř souhlasí",
        "Ne, hráče vyloučeného po výkopu nikdo nenahradí",
      ],
      correct: 3,
      explain: "Hráče vyloučeného po výkopu nahradit nejde a tým dohrává v oslabení.",
    },
    {
      id: "taktika-ten-men-2",
      lessonId: "taktika-ten-men",
      text: "Hráč uvedený v zápise je vyloučen ještě před výkopem. Co platí?",
      options: [
        "Tým musí odehrát celý zápas v deseti",
        "Může ho nahradit náhradník a tým o žádné střídání nepřijde",
        "Zápas se musí odložit",
        "Může ho nahradit kdokoli z diváků",
      ],
      correct: 1,
      explain: "Hráče vyloučeného před výkopem smí nahradit náhradník ze zápisu a počet střídání se tím nesnižuje.",
    },
    {
      id: "taktika-ten-men-3",
      lessonId: "taktika-ten-men",
      text: "V jakém rozestavení bránil Inter v roce 2010 na Camp Nou po vyloučení Thiaga Motty?",
      options: ["4-4-1", "3-4-2", "2-3-4", "4-2-3"],
      correct: 0,
      explain: "Inter obětoval jednoho útočníka a bránil ve dvou řadách po čtyřech, tedy 4-4-1. Prohrál jen 0:1 a postoupil do finále.",
    },
    {
      id: "taktika-ten-men-4",
      lessonId: "taktika-ten-men",
      text: "Proč po vyloučení brankáře obvykle odchází ze hřiště hráč z pole?",
      options: [
        "Protože to rozhodčí nařizuje jako trest",
        "Aby byl na hřišti sudý počet hráčů",
        "Aby mohl nastoupit náhradní brankář, vyloučeného nikdo nenahradí",
        "Protože hráč z pole nikdy nesmí chytat",
      ],
      correct: 2,
      explain: "Vyloučeného brankáře nahradit nejde. Náhradní brankář proto přijde za hráče z pole a tým to stojí jedno střídání.",
    },
    {
      id: "taktika-ten-men-5",
      lessonId: "taktika-ten-men",
      text: "Za kterého hráče přišel ve finále Ligy mistrů 2006 náhradní brankář Arsenalu Manuel Almunia?",
      options: ["Za Thierryho Henryho", "Za Sola Campbella", "Za Cesca Fàbregase", "Za Roberta Pirèse"],
      correct: 3,
      explain: "Lehmann byl vyloučen a nahradit ho nešlo, takže Almunia přišel na hřiště za záložníka Roberta Pirèse.",
    },

    // ── Střídání ──
    {
      id: "taktika-substitutions-1",
      lessonId: "taktika-substitutions",
      text: "Kolik hráčů smí podle Soutěžního řádu FAČR vystřídat tým v neprofesionální soutěži mužů, když rozpis nepovoluje opakované střídání?",
      options: ["Tři", "Pět", "Sedm", "Neomezeně"],
      correct: 1,
      explain: "V neprofesionálních soutěžích mužů smí tým vystřídat nejvýše pět hráčů. Sedm platí, jen když rozpis povolí opakované střídání.",
    },
    {
      id: "taktika-substitutions-2",
      lessonId: "taktika-substitutions",
      text: "Co je opakované střídání?",
      options: [
        "Vystřídaný hráč se smí do zápasu vrátit",
        "Střídání, při kterém jdou ze hřiště dva hráči najednou",
        "Střídání, které se opakuje kvůli chybě rozhodčího",
        "Střídání brankářů před penaltovým rozstřelem",
      ],
      correct: 0,
      explain: "Při opakovaném střídání se hráč, který už byl vystřídán, smí znovu vrátit do hry.",
    },
    {
      id: "taktika-substitutions-3",
      lessonId: "taktika-substitutions",
      text: "Co platí při opakovaném střídání v posledních deseti minutách zápasu?",
      options: [
        "Střídat se už vůbec nesmí",
        "Střídat se smí neomezeně",
        "Střídat smí jen brankář",
        "Střídá se jen obyčejně, a to nejvýše dva hráči",
      ],
      correct: 3,
      explain: "Soutěžní řád dovoluje v posledních deseti minutách jen obyčejné střídání, nejvýše dvou hráčů.",
    },
    {
      id: "taktika-substitutions-4",
      lessonId: "taktika-substitutions",
      text: "Střídaný hráč neopustí hřiště do deseti sekund. Co následuje podle pravidel 2026/27?",
      options: [
        "Nic, rozhodčí jen napomene lavičku",
        "Střídání se ruší a hráč hraje dál",
        "Hráč musí odejít a náhradník smí nastoupit až při prvním přerušení po uplynutí minuty",
        "Soupeř kope pokutový kop",
      ],
      correct: 2,
      explain: "Pomalý hráč musí hřiště opustit stejně, ale náhradník přijde až při prvním přerušení po minutě od navázání hry. Tým zatím hraje o hráče méně.",
    },
    {
      id: "taktika-substitutions-5",
      lessonId: "taktika-substitutions",
      text: "Kolik příležitostí ke střídání během hry mají týmy v nejvyšších soutěžích podle pravidel IFAB (bez poločasu)?",
      options: ["Tři", "Jednu", "Pět", "Kolik chtějí"],
      correct: 0,
      explain: "V nejvyšších soutěžích a v reprezentaci má tým během hry nejvýš tři příležitosti ke střídání a navíc smí střídat o poločase.",
    },

    // ── Změna rozestavení během zápasu ──
    {
      id: "taktika-in-game-changes-1",
      lessonId: "taktika-in-game-changes",
      text: "Kolik osob smí zároveň dávat taktické pokyny z technické zóny?",
      options: ["Vždy jen jedna", "Dvě, trenér a asistent", "Kdokoli z lavičky", "Nikdo, pokyny se dávají jen o přestávce"],
      correct: 0,
      explain: "Podle pravidel smí taktické pokyny z technické zóny dávat vždy jen jedna osoba.",
    },
    {
      id: "taktika-in-game-changes-2",
      lessonId: "taktika-in-game-changes",
      text: "Jak změnil Hajime Moriyasu hru Japonska o přestávce zápasu s Německem na MS 2022?",
      options: [
        "Stáhl celý tým do nízkého bloku a jen bránil",
        "Vystřídal brankáře",
        "Přešel na tři stopery a rozestavení 3-4-3",
        "Nezměnil nic, jen hráčům vynadal",
      ],
      correct: 2,
      explain: "Moriyasu poslal na hřiště obránce Tomiyasua a přešel na tři stopery v 3-4-3. Japonsko pak napadalo výš a vyhrálo 2:1.",
    },
    {
      id: "taktika-in-game-changes-3",
      lessonId: "taktika-in-game-changes",
      text: "Kdo dal za Japonsko oba góly v zápase s Německem na MS 2022?",
      options: [
        "Takehiro Tomiyasu, dvakrát hlavou",
        "Střídající hráči Ritsu Doan a Takuma Asano",
        "Brankář po rohu v nastavení",
        "Nikdo, Japonsko prohrálo 0:1",
      ],
      correct: 1,
      explain: "Oba góly dali hráči, kteří přišli na hřiště jako střídající: Ritsu Doan a Takuma Asano.",
    },
    {
      id: "taktika-in-game-changes-4",
      lessonId: "taktika-in-game-changes",
      text: "Proč má být náhradní rozestavení natrénované předem?",
      options: [
        "Protože pravidla vyžadují nahlásit rozestavení rozhodčímu",
        "Aby ho soupeř viděl na tréninku a bál se",
        "Protože bez toho se nesmí střídat",
        "Když o něm tým slyší poprvé během zápasu, výsledkem bývá zmatek",
      ],
      correct: 3,
      explain: "Změnu, kterou hráči nikdy nezkusili, v zápase spíš nezvládnou. Proto se náhradní plány nacvičují dopředu.",
    },
    {
      id: "taktika-in-game-changes-5",
      lessonId: "taktika-in-game-changes",
      text: "Musí změna rozestavení vždy znamenat střídání?",
      options: [
        "Ano, jinak ji rozhodčí nepovolí",
        "Ne, stačí posunout hráče na hřišti, střídání jen přinese čerstvé nohy",
        "Ano, ale jen o poločase",
        "Ne, rozestavení se během zápasu měnit nesmí",
      ],
      correct: 1,
      explain: "Rozestavení jde změnit i posunem hráčů, třeba krajního záložníka do útoku. Střídání přidá čerstvé nohy a změnu zviditelní.",
    },

    // ── Poločasová přestávka ──
    {
      id: "taktika-half-time-1",
      lessonId: "taktika-half-time",
      text: "Jak dlouhá smí být podle pravidel IFAB poločasová přestávka?",
      options: ["Přesně 10 minut", "Nejvýše 20 minut", "Nejvýše 15 minut", "Dokud se nedopije pivo"],
      correct: 2,
      explain: "Přestávka nesmí přesáhnout 15 minut. Délku určuje soutěž a změnit ji lze jen se svolením rozhodčího.",
    },
    {
      id: "taktika-half-time-2",
      lessonId: "taktika-half-time",
      text: "Co se podle Soutěžního řádu FAČR počítá do patnáctiminutové přestávky?",
      options: [
        "Jen čas strávený v kabině",
        "Nic, přestávka začíná až zavřením dveří kabiny",
        "Jen čas na střídání",
        "I odchod do kabin a návrat na hřiště",
      ],
      correct: 3,
      explain: "Rozhodčí musí dodržet přestávku 15 minut a započítává se do ní i odchod hráčů z hrací plochy a návrat na ni.",
    },
    {
      id: "taktika-half-time-3",
      lessonId: "taktika-half-time",
      text: "Kolik hlavních věcí doporučuje anglický svaz říct hráčům o přestávce?",
      options: ["Dvě, nanejvýš tři", "Aspoň deset, ať se na nic nezapomene", "Jen jednu, zato nahlas", "Žádnou, o přestávce se mlčí"],
      correct: 0,
      explain: "Čas je krátký a emoce vysoko, proto stačí dvě, nanejvýš tři hlavní sdělení, připravená dopředu.",
    },
    {
      id: "taktika-half-time-4",
      lessonId: "taktika-half-time",
      text: "Co doporučuje lekce udělat v prvních minutách přestávky?",
      options: [
        "Hned rozebrat každou chybu z prvního poločasu",
        "Nechat hráče vydýchat, napít se a promluvit si mezi sebou",
        "Poslat všechny do sprch",
        "Vyhlásit viníka inkasovaného gólu",
      ],
      correct: 1,
      explain: "Hráči potřebují pár minut, aby se uklidnili a napili. Pak teprve přijde slovo trenéra.",
    },
    {
      id: "taktika-half-time-5",
      lessonId: "taktika-half-time",
      text: "Co ukázal výzkum Magniho Mohra a kolegů o rozehřátí v poločase?",
      options: [
        "Rozehřátí o přestávce hráče unaví a zpomalí",
        "Teplota svalů během přestávky stoupá",
        "Kdo proseděl přestávku, byl na začátku druhého poločasu ve sprintu pomalejší, rozehřátí rychlost udrželo",
        "Na rychlosti po přestávce nic nezáleží",
      ],
      correct: 2,
      explain: "Teplota svalů o přestávce klesla. Hráči bez rozehřátí byli ve sprintu o 2,4 % pomalejší, s lehkým rozehřátím ne.",
    },

    // ── Rozbor soupeře ──
    {
      id: "taktika-opponent-scouting-1",
      lessonId: "taktika-opponent-scouting",
      text: "Proč se v amatérském fotbale vyplatí sledovat standardky soupeře?",
      options: [
        "Protože pravidla zakazují měnit varianty během sezóny",
        "Protože se standardky na okrese nekopou",
        "Aby šlo nacvičené varianty nahlásit rozhodčímu",
        "Amatérské týmy často opakují stejné varianty rohů a volných kopů",
      ],
      correct: 3,
      explain: "Amatérské týmy své rohy a volné kopy obvykle příliš nemění, takže se na ně dá dopředu připravit.",
    },
    {
      id: "taktika-opponent-scouting-2",
      lessonId: "taktika-opponent-scouting",
      text: "Co je podle lekce na rozboru soupeře nejtěžší?",
      options: [
        "Sehnat tabulku soutěže",
        "Vybrat pár srozumitelných sdělení pro hráče",
        "Napsat aspoň dvacet stran",
        "Zjistit barvu soupeřových dresů",
      ],
      correct: 1,
      explain: "Informací bývá hodně. Hráči ale potřebují jen pár jasných sdělení, co z nich plyne pro náš plán.",
    },
    {
      id: "taktika-opponent-scouting-3",
      lessonId: "taktika-opponent-scouting",
      text: "Co zjišťuješ, když sleduješ rozehrávku soupeře?",
      options: [
        "Kolik diváků chodí na jeho zápasy",
        "Kdo mu v kabině vaří čaj",
        "Jestli brankář kope dlouze, nebo rozehrává krátce na stopery",
        "Jak dlouho trvá jeho rozcvička",
      ],
      correct: 2,
      explain: "U rozehrávky tě zajímá, jak se soupeř dostává s míčem dopředu, třeba jestli brankář kope dlouze, nebo hraje krátce.",
    },
    {
      id: "taktika-opponent-scouting-4",
      lessonId: "taktika-opponent-scouting",
      text: "Co dával Don Revie v Leedsu svým hráčům?",
      options: [
        "Rozsáhlé složky o soupeřích",
        "Prémie za každý skluz",
        "Volno den před každým zápasem",
        "Kazety s nahrávkami fanouškovských chorálů",
      ],
      correct: 0,
      explain: "Revie připravoval rozsáhlé složky o soupeřích, aby hráči znali každý detail.",
    },
    {
      id: "taktika-opponent-scouting-5",
      lessonId: "taktika-opponent-scouting",
      text: "Kdo připravil podklady pro papírek, se kterým Jens Lehmann chytal penalty proti Argentině v roce 2006?",
      options: [
        "Kapitán Michael Ballack",
        "Argentinský trenér brankářů",
        "Rozhodčí zápasu",
        "Trenér brankářů Andreas Köpke",
      ],
      correct: 3,
      explain: "Podklady o argentinských exekutorech připravil trenér brankářů Andreas Köpke. Lehmann chytil dvě penalty a Německo vyhrálo rozstřel 4:2.",
    },

    // ── Poziční hra ──
    {
      id: "taktika-positional-play-1",
      lessonId: "taktika-positional-play",
      text: "Jak se španělsky říká poziční hře?",
      options: ["Juego de posición", "Catenaccio", "Gegenpressing", "Salida lavolpiana"],
      correct: 0,
      explain: "Poziční hra se španělsky jmenuje juego de posición.",
    },
    {
      id: "taktika-positional-play-2",
      lessonId: "taktika-positional-play",
      text: "Jaké pomocné pravidlo rozestavení platí v Guardiolově poziční hře?",
      options: [
        "Na každé linii přesně pět hráčů",
        "Všichni hráči stojí co nejblíž míči",
        "Na vodorovné linii nanejvýš tři hráči, na svislé nanejvýš dva",
        "Na svislé linii nanejvýš čtyři hráči, na vodorovné libovolně",
      ],
      correct: 2,
      explain: "Na jedné vodorovné linii nemají stát víc než tři hráči a na svislé víc než dva, aby hráč s míčem měl vždy komu přihrát.",
    },
    {
      id: "taktika-positional-play-3",
      lessonId: "taktika-positional-play",
      text: "Co je kvalitativní převaha?",
      options: [
        "Tým má v jednom prostoru víc hráčů než soupeř",
        "Hráč stojí mezi řadami soupeře",
        "Tým má dražší kopačky",
        "Lepší hráč dostane míč v izolaci proti slabšímu protivníkovi",
      ],
      correct: 3,
      explain: "Kvalitativní převaha znamená izolovat lepšího hráče proti slabšímu soupeři v souboji jeden na jednoho.",
    },
    {
      id: "taktika-positional-play-4",
      lessonId: "taktika-positional-play",
      text: "Co je poziční převaha?",
      options: [
        "Tým má na hřišti víc hráčů než soupeř",
        "Hráč stojí mezi řadami soupeře nebo za nimi, kde má víc času a místa",
        "Brankář stojí na hranici vápna",
        "Hráči si mezi sebou prohodí pozice",
      ],
      correct: 1,
      explain: "Poziční převaha je postavení mezi řadami soupeře nebo za nimi, kde hráč získá čas a prostor.",
    },
    {
      id: "taktika-positional-play-5",
      lessonId: "taktika-positional-play",
      text: "Proč se poziční hra obvykle pojí s protipresinkem?",
      options: [
        "Protože to vyžadují pravidla",
        "Roztažený tým má po ztrátě míče hráče daleko od sebe, a tak chce míč získat zpátky co nejvýš",
        "Protože poziční hra zakazuje dlouhé míče",
        "Aby hráči nemuseli vůbec bránit",
      ],
      correct: 1,
      explain: "Tým s míčem je roztažený přes celé hřiště. Protipresink má míč získat zpátky dřív, než soupeř využije volný prostor.",
    },

    // ── Invertovaní krajní obránci ──
    {
      id: "taktika-inverted-full-backs-1",
      lessonId: "taktika-inverted-full-backs",
      text: "Co dělá invertovaný krajní obránce, když jeho tým má míč?",
      options: [
        "Běží po lajně až k rohovému praporku",
        "Zůstane stát vedle stoperů",
        "Přesune se do středu hřiště a hraje jako další středový záložník",
        "Jde do branky místo brankáře",
      ],
      correct: 2,
      explain: "Invertovaný krajní obránce se s míčem stahuje ze strany do středu a přidá týmu hráče do zálohy.",
    },
    {
      id: "taktika-inverted-full-backs-2",
      lessonId: "taktika-inverted-full-backs",
      text: "Který trenér podle lekce posílal krajního obránce do středu už před Guardiolou?",
      options: [
        "Johan Cruyff v Barceloně",
        "Helenio Herrera v Interu",
        "Nereo Rocco v Triestině",
        "Alex Ferguson v Manchesteru United",
      ],
      correct: 0,
      explain: "Cruyff v Barceloně měnil 4-3-3 na 3-4-3 s kosočtvercem a jeden krajní obránce při tom šel do středu.",
    },
    {
      id: "taktika-inverted-full-backs-3",
      lessonId: "taktika-inverted-full-backs",
      text: "Který hráč se v Bayernu pod Guardiolou stahoval dovnitř nejčastěji?",
      options: ["Manuel Neuer", "Philipp Lahm", "Thomas Müller", "Arjen Robben"],
      correct: 1,
      explain: "Dovnitř chodili Lahm i Alaba, ale častěji to byl Philipp Lahm.",
    },
    {
      id: "taktika-inverted-full-backs-4",
      lessonId: "taktika-inverted-full-backs",
      text: "Jak může invertovaný krajní obránce pomoct vlastnímu křídlu?",
      options: [
        "Hraje mu výhradně dlouhé míče",
        "Hlídá místo něj soupeřova krajního obránce",
        "Nijak, křídlo pak musí hrát uvnitř",
        "Když soupeřovo křídlo jde za ním dovnitř, uvolní se na kraji prostor pro souboj jeden na jednoho",
      ],
      correct: 3,
      explain: "Pokud soupeřovo křídlo následuje krajního obránce do středu, zůstane na kraji místo a naše křídlo jde jeden na jednoho.",
    },
    {
      id: "taktika-inverted-full-backs-5",
      lessonId: "taktika-inverted-full-backs",
      text: "Jaká je slabina invertovaných krajních obránců při přechodu do obrany?",
      options: [
        "V poslední řadě je o hráče méně",
        "Rozhodčí je častěji trestá žlutou",
        "Musí střídat po hodině hry",
        "Nesmí hrát hlavou",
      ],
      correct: 0,
      explain: "Krajní obránce je ve středu, takže při rychlém přechodu soupeře chybí v poslední řadě jeden hráč.",
    },

    // ── Rest defence ──
    {
      id: "taktika-rest-defence-1",
      lessonId: "taktika-rest-defence",
      text: "Co znamená „rest“ v pojmu rest defence?",
      options: [
        "Odpočinek pro unavené obránce",
        "Zbytek, tedy hráči, kteří při útoku zůstávají vzadu",
        "Restart hry po gólu",
        "Rezervní tým",
      ],
      correct: 1,
      explain: "Výraz pochází z německého Restverteidigung a „rest“ znamená zbytek, ne odpočinek.",
    },
    {
      id: "taktika-rest-defence-2",
      lessonId: "taktika-rest-defence",
      text: "Jak se obvykle dělí hráči v poli, když tým útočí?",
      options: [
        "Devět útočí a jeden jistí",
        "Všichni útočí a jistí jen brankář",
        "Tři útočí a sedm jistí",
        "Pět útočí a pět jistí",
      ],
      correct: 3,
      explain: "Obvykle útočí pět hráčů a pět jistí. Když tým nutně potřebuje gól, jde dopředu šest a vzadu zůstanou čtyři.",
    },
    {
      id: "taktika-rest-defence-3",
      lessonId: "taktika-rest-defence",
      text: "Co je úkolem vyšší řady zajištění?",
      options: [
        "Hlídat dlouhé míče za obranou",
        "Kopat standardní situace",
        "Zavřít prostor kolem míče a zastavit protiútok hned v zárodku",
        "Nabíhat do vápna k centrům",
      ],
      correct: 2,
      explain: "Vyšší řada, obvykle defenzivní záložníci, protipresinkem zastavuje protiútok hned u míče. Dlouhé míče jsou práce nižší řady.",
    },
    {
      id: "taktika-rest-defence-4",
      lessonId: "taktika-rest-defence",
      text: "Co znamená zajištění na „plus jedna“?",
      options: [
        "V zajištění je o hráče víc, než kolik má soupeř útočníků čekajících na brejk",
        "Tým má vždycky jednoho náhradníka navíc",
        "Brankář hraje jako jedenáctý hráč v poli",
        "Za každý zisk míče je bod navíc",
      ],
      correct: 0,
      explain: "Plus jedna znamená, že proti soupeřovým útočníkům má zajištění vždy o hráče víc.",
    },
    {
      id: "taktika-rest-defence-5",
      lessonId: "taktika-rest-defence",
      text: "V jakém tvaru jistil při útoku Kloppův Liverpool?",
      options: ["3+2", "4+1", "1+4", "2+3"],
      correct: 3,
      explain: "Liverpool Jürgena Kloppa jistil ve tvaru 2+3: dva stopeři a před nimi trojice záložníků. Guardiolův City hrál 3+2.",
    },

    // ── Osobní presink po celém hřišti ──
    {
      id: "taktika-man-marking-press-1",
      lessonId: "taktika-man-marking-press",
      text: "Jakou pojistku si Marcelo Bielsa nechává při osobním hlídání?",
      options: [
        "Brankáře, který hraje jako stoper",
        "Dva útočníky, kteří vůbec nebrání",
        "Žádnou, hlídá se jeden na jednoho úplně všude",
        "Volného hráče vzadu: proti jednomu útočníkovi dva stopeři, proti dvěma tři",
      ],
      correct: 3,
      explain: "Bielsa nechává vzadu jednoho volného stopera navíc. Ostatní hráči hlídají své soupeře po celém hřišti.",
    },
    {
      id: "taktika-man-marking-press-2",
      lessonId: "taktika-man-marking-press",
      text: "Co byl murderball v Leedsu?",
      options: [
        "Trest za pozdní příchod na trénink",
        "Tréninkový zápas bez přerušení, kde se při autu hned vhodil nový míč",
        "Penaltový rozstřel na konci tréninku",
        "Posilování s medicinbaly",
      ],
      correct: 1,
      explain: "Murderball byl zápas bez faulů, ofsajdů a přerušení. Když míč opustil hřiště, trenéři hned vhodili nový.",
    },
    {
      id: "taktika-man-marking-press-3",
      lessonId: "taktika-man-marking-press",
      text: "Koho porazila Gasperiniho Atalanta ve finále Evropské ligy 2024?",
      options: ["Bayer Leverkusen 3:0", "AS Řím 1:0", "Benficu Lisabon 2:1", "Real Madrid 2:0"],
      correct: 0,
      explain: "Atalanta porazila Leverkusen 3:0, Lookman dal hattrick a Leverkusen prohrál poprvé po 51 zápasech.",
    },
    {
      id: "taktika-man-marking-press-4",
      lessonId: "taktika-man-marking-press",
      text: "Co je slabinou osobního presinku po celém hřišti?",
      options: [
        "Soupeř má vždycky volného hráče na krátkou přihrávku",
        "Tým nemůže získat míč vysoko",
        "Když jeden prohraje souboj vysoko, nejbližší pomoc je až volný stoper vzadu",
        "Pravidla ho v evropských pohárech zakazují",
      ],
      correct: 2,
      explain: "Každý má svého hráče, takže prohraný souboj vysoko na hřišti nemá kdo pojistit. Pomoc je až u volného stopera.",
    },
    {
      id: "taktika-man-marking-press-5",
      lessonId: "taktika-man-marking-press",
      text: "Proč může soupeřův stoper proti osobnímu presinku vyrazit s míčem daleko dopředu?",
      options: [
        "Stopera pravidla zakazují napadat",
        "Presink vždycky končí na půlce",
        "Záložníci hlídají své hráče a nemá ho kdo vzít",
        "Hlídá ho jen brankář",
      ],
      correct: 2,
      explain: "Záložníci jsou přidělení ke svým soupeřům, takže stopera s míčem nemá kdo převzít, dokud nedorazí k volnému stoperovi.",
    },
  ],
};
