/**
 * Skripta „Mládež" (vlastnost Práce s mládeží): kategorie a pravidla mládeže FAČR,
 * přístup k dětem a rodičům, dlouhodobý rozvoj a specializace.
 *
 * Fakta ověřena proti zdrojům: Soutěžní řád FAČR s účinností od 1. 7. 2026, § 36 a § 37
 * (kategorie podle věku dovršeného v roce začátku ročníku, future hráči, dívky
 * v chlapeckých družstvech, start mladšího dorostu za muže), výkladové stanovisko FAČR
 * k nastupování pro 2025/2026, pravidla fotbalu malých forem FAČR (2023, platná dál;
 * 4+1, 5+1, 7+1, 8+1, míče, hřiště, pokutový kop ze 7 m, tabulky přípravek), metodická
 * příručka FAČR pro mini přípravku (2023), Visek a kol. 2015 (FUN MAPS, vítězství
 * 48. z 81), Positive Coaching Alliance (poměr 5 : 1), LTAD 2.1 Sport for Life
 * (etapy, citlivá období, pozdní specializace fotbalu, poměry trénink : soutěž),
 * Ford a kol. 2011 (kritika LTAD), Barnsley a kol. 1985 a Helsen a kol. 2005
 * (relativní věk), Cumming a kol. 2018 (bio-banding), AAP 2016 (specializace).
 */
import type { CategoryContent } from "./types";

export const MLADEZ: CategoryContent = {
  lessons: [
    {
      id: "mladez-kategorie",
      category: "mladez",
      difficulty: 1,
      title: "Věkové kategorie mládeže",
      body: `Mládežnický fotbal se podle soutěžního řádu FAČR dělí na tři velké kategorie a každá má mladší a starší část. Označení **U** pochází z anglického under, tedy „do“: U11 znamená zhruba do 11 let.
- **přípravka**: mladší přípravka (U8 a U9, hrát smějí i mladší děti od pěti let), starší přípravka (U10 a U11),
- **žáci**: mladší žáci (U12 a U13), starší žáci (U14 a U15),
- **dorost**: mladší dorost (U16 a U17), starší dorost (U18 a U19).

Do kategorie patří hráč vždy na **celý soutěžní ročník**. Rozhoduje, **kolik let dovrší v kalendářním roce, ve kterém ročník začíná**. Kdo během ročníku oslaví narozeniny, které by ho posunuly výš, ročník ve své kategorii **dohraje** a výš přejde až od dalšího. Proto třeba nejstarší dorostenci hrají dorost celý ročník, i když někteří na jaře oslaví devatenáctiny.

Zvláštní výjimkou jsou takzvaní **future hráči**. Jde o hráče o **ročník starší**, kteří ještě nejsou tak biologicky vyspělí, aby mohli hrát ve vyšší kategorii. Nastoupit mohou jen za těchto podmínek:
- povolí to rozpis soutěže řídícího orgánu, tedy okresního, krajského nebo pražského svazu, a to nejvýš do kategorie starších žáků,
- v jednom utkání nastoupí **nejvýš dva**,
- klub předloží jejich seznam ke schválení před prvním utkáním ročníku.

Dívky smějí nastupovat i za chlapecká družstva mládeže. Až do mladšího dorostu mohou být o rok starší než kluci, v přípravkách a žácích v soutěžích řízených okresním, krajským nebo pražským svazem dokonce o dva roky.

Na vesnici, kde se na jeden dorost skládají tři obce, se vyplatí znát tahle pravidla nazpaměť. Za neoprávněný start hráče hrozí kontumace a vyhraný zápas je rázem prohraný u zeleného stolu.`,
    },
    {
      id: "mladez-male-formy",
      category: "mladez",
      difficulty: 1,
      title: "Malé formy fotbalu v přípravkách",
      body: `Děti v přípravce nehrají na velkém hřišti jedenáct na jedenáct. FAČR pro ně vydává **pravidla fotbalu malých forem**: méně hráčů, menší hřiště, menší branky i míč. Každé dítě je tak častěji u míče, víc kličkuje, střílí a rozhoduje se, místo aby půl zápasu stálo v rohu a trhalo sedmikrásky.

Podle současných pravidel:
- **mladší přípravka** hraje **4+1**, tedy čtyři hráči v poli a brankář, s míčem **velikosti 3** na hřišti zhruba **35–37 × 24–26 m**,
- **starší přípravka** hraje **5+1** na hřišti zhruba **43–45 × 28–30 m**, s míčem **velikosti 4** a na branky 5 × 2 m.

Pro mladší žáky existují pravidla malých forem pro hru **7+1** a **8+1**. Na velké hřiště a plný počet hráčů se přechází až později.

Ve starší přípravce se například **pokutový kop kope ze 7 metrů** a volné kopy z vlastní poloviny jsou nepřímé a musí se rozehrát přihrávkou. Brankář při kopu od branky rozehrává míč nohou ze země. **Střídá se opakovaně** a bez přerušení hry, takže nikdo nemusí vysedávat celý zápas na lavičce a každé dítě si zahraje.

Jedno důležité pravidlo nemá s míčem nic společného: **tabulky dlouhodobých soutěží přípravek se nezveřejňují**. V přípravce jde o rozvoj a radost dětí, ne o honbu za body.

Tatínkům na plotě to ovšem nebrání vést si vlastní tabulku v hlavě. Ty jako trenér ji vést nemusíš. Tvoje tabulka se jmenuje „kolik dětí za rok přibylo a kolik jich chodí dál“.`,
    },
    {
      id: "mladez-radost",
      category: "mladez",
      difficulty: 1,
      title: "Hra a radost jako základ",
      body: `Proč děti chodí na fotbal? Protože je to baví. Americká výzkumnice **Amanda Visek** se s kolegy ptala mladých fotbalistů, jejich rodičů a trenérů, co dělá sport zábavným. Studie z roku 2015 sestavila **81 faktorů zábavy** a seskupila je do 11 oblastí. Nejvýš hodnocené oblasti byly **fér hra**, **snaha a nasazení** a **pozitivní trenér**. **Vítězství** skončilo mezi 81 faktory až na **48. místě**.

Podobně to vidí FAČR. Jeho metodická příručka pro nejmenší říká, že cílem není naučit děti hned hrát fotbal. Cílem je naučit je **všestranný pohyb**, **cit pro míč**, chování v kolektivu, **samostatné rozhodování** a motivovat je ke sportu. Příručka to shrnuje přáním, aby děti měly fotbal rády ne měsíc nebo rok, ale **celý život**.

Co to znamená v praxi:
- **hraj, nedriluj**: víc her s míčem, méně stání ve frontě na jednu střelu,
- do hry vstupuj **minimálně** a nech děti řešení objevovat samy; poradit nebo ukázat můžeš hlavně v přestávkách, když nehrají,
- netlač na výsledek; úspěch je i odebraný míč, povedená klička nebo snaha,
- ke každému dítěti přistupuj **individuálně**, protože každé dozrává jinak. Kdo dnes nestačí, může být za pár let nejlepší.

Americká akademie pediatrů navíc upozorňuje na význam **volné hry**, tedy neorganizovaných her pro radost, které si děti řídí samy, jako je kopaná na návsi nebo nohejbal za stodolou. Podle ní děti, které takhle hrají, od organizovaného sportu méně často odcházejí.

Trenér přípravky tedy není vrchní velitel lavičky. Je to průvodce, který hlídá hlavně jedno: aby se děti těšily na další trénink.`,
    },
    {
      id: "mladez-komunikace",
      category: "mladez",
      difficulty: 2,
      title: "Jak mluvit s dětmi a s rodiči",
      body: `Děti si z tréninku nepamatují taktickou přednášku. Pamatují si, jak se u toho cítily.

Americká organizace **Positive Coaching Alliance** doporučuje trenérům takzvaný **magický poměr 5 : 1**: na každou výtku připadá **pět pochval**. Pochvala ale musí být **konkrétní a pravdivá**. Samotné „dobrý“ nic neříká, kdežto „výborně, že ses před převzetím rozhlédl“ dítěti řekne, co má zopakovat. Plané chválení děti poznají.

Pár zásad pro mluvení s dětmi:
- mluv **krátce**, jedna myšlenka na jednu instrukci,
- **chval snahu** a to, co dítě ovlivní, ne jen góly,
- chybu oprav věcně a řekni, jak to udělat příště, místo abys jen vyjmenoval, co bylo špatně,
- u malých dětí si klidně dřepni, ať nemluvíš shora jako hromovládce.

**Rodiče** jsou součást týmu, ne nepřítel za plotem. Metodická příručka FAČR pro nejmenší upozorňuje, že **děti nedokážou rozlišit, jestli má pravdu rodič, nebo trenér**. Když táta z plotu křičí „střílej!“ a trenér „přihraj!“, dítě je zmatené a neudělá nic. Příručka proto radí rodiče z tréninku a zápasů nevyhánět, ale **komunikovat, vysvětlovat své záměry a spolupracovat**.

V praxi pomáhá:
- **schůzka s rodiči na začátku sezóny**: co chceš děti naučit, proč se nehraje o tabulku a jak se střídá,
- domluva, že během zápasu **pokyny dává trenér** a rodiče povzbuzují,
- jasný kontakt, kam se obrátit s výhradami, aby se neřešily před dětmi u hřiště.

Strejdu, který na každém zápase hlásí, že za jeho časů se hrálo tvrdě, už nepředěláš. U rodičů přípravkářů ještě šance je.`,
    },
    {
      id: "mladez-senzitivni",
      category: "mladez",
      difficulty: 2,
      title: "Koordinace a technika podle věku",
      body: `Děti nejsou zmenšení dospělí. V každém věku se něco učí snáz a trénink by tomu měl odpovídat.

Kanadský model dlouhodobého rozvoje sportovce (**LTAD**) uvádí, že **celé dětství** je citlivým obdobím pro zvládnutí **základních pohybových dovedností**: běhu, skoků, hodů, obratů a práce s míčem. U nejmenších proto trénuj takzvanou **ABC pohybu**: **obratnost, rovnováhu, koordinaci a rychlost**.

Nejlepší čas na učení sportovních dovedností a techniky model nazývá roky **hladové po dovednostech**. U chlapců je to zhruba **mezi 9 a 12 lety**, u dívek mezi 8 a 11 lety, přesněji **před začátkem růstového spurtu**. Kdo v tomhle věku jen běhá kolečka kolem hřiště, promarní nejlepší roky pro techniku.

Pak přichází **růstový spurt**. Vrchol rychlosti růstu nastává u dívek asi ve 12 letech, u chlapců v průměru asi **o dva roky později**. Kosti rostou rychle a namáhají svaly a šlachy, proto model radí věnovat v tomto období zvláštní pozornost **pohyblivosti**. Zároveň platí, že děti stejného kalendářního věku mohou být mezi 10. a 16. rokem vývojově od sebe **tři až pět let**.

Dvě důležitá upozornění:
- podle modelu jsou **všechny schopnosti trénovatelné vždy**; mimo citlivá období jsou „okna“ jen částečně otevřená, ne zavřená,
- vědci modelu vyčítají, že pro přesné hranice oken **chybí dostatek důkazů**. Ber je jako orientaci, ne jako jízdní řád.

Takže žádná panika, když jedenáctiletý Pepík z Vimperka ještě nezvládne nůžky. Nech ho hlavně hodně hrát s míčem, dokud je na to nejlepší věk.`,
    },
    {
      id: "mladez-relativni-vek",
      category: "mladez",
      difficulty: 3,
      title: "Relativní věkový efekt",
      body: `Vezmi dva kluky ze stejného ročníku. Jeden se narodil 2. ledna, druhý 30. prosince. Kategorie je stejná, ale lednový je o skoro rok starší, a u desetiletých je rok obrovský rozdíl ve výšce, síle i zkušenosti. Tomu, že hráči narození brzy po rozhodném datu bývají vybíráni častěji, se říká **relativní věkový efekt**.

Známou studii o něm publikovali v roce 1985 kanadští vědci Barnsleyovi s Thompsonem. Týkala se **ledního hokeje**: čím dřív v roce se hráč narodil, tím větší měl šanci prosadit se v nejlepších soutěžích. Ve fotbale ho potvrdila řada studií. **Helsen a kolegové (2005)** našli efekt ve všech zkoumaných kategoriích evropských mládežnických výběrů: hráčů narozených v prvním čtvrtletí roku tam bylo výrazně víc než narozených v posledním.

V českém fotbale se kategorie počítají podle věku k **1. lednu**, takže zvýhodnění jsou hráči narození **na začátku roku**. Relativní věk se ale plete s **biologickou zralostí**. Dítě se může narodit v lednu, a přitom dospívat pozdě. Model LTAD upozorňuje, že **dříve dospívající** mají výhodu v období kolem růstového spurtu, ale po něm mají často větší potenciál **pozdě dospívající**, pokud mezitím dostávají kvalitní trénink.

Co s tím:
- hodnoť výkon s ohledem na datum narození a vývoj, ne jen podle toho, kdo je dnes nejsilnější,
- s výběrem talentů **nespěchej**,
- zkus **bio-banding**, tedy rozdělení hráčů podle **biologické zralosti** místo data narození; zkoušely ho akademie anglické Premier League,
- v soutěžích okresních, krajských a pražského svazu lze v mládeži do starších žáků se souhlasem svazu nasadit až dva **future hráče** o ročník starší, kteří jsou biologicky pozadu.

Prosincový drobeček z přípravky může být za deset let nejlepší hráč okresu. Pokud ho ovšem mezitím neodradíš lavičkou.`,
    },
    {
      id: "mladez-ltad",
      category: "mladez",
      difficulty: 3,
      title: "Dlouhodobý rozvoj sportovce (LTAD)",
      body: `**LTAD** (Long-Term Athlete Development) je model dlouhodobého rozvoje sportovce, na kterém stojí kanadský program Sport for Life. Jedním z jeho hlavních autorů je **Istvan Balyi**. Model popisuje, jak má sportovní příprava vypadat od batolete až po veterána.

Má **sedm etap**:
- **Aktivní start** (Active Start): hra a základní pohyb,
- **Základy** (FUNdamentals): všestranný pohyb, obratnost, rovnováha, koordinace a rychlost, pořád s důrazem na zábavu,
- **Učíme se trénovat** (Learn to Train): hlavní etapa učení sportovních dovedností,
- **Trénujeme, abychom trénovali** (Train to Train): budování kondice a specifických dovedností v období růstového spurtu,
- **Trénujeme, abychom soutěžili** (Train to Compete),
- **Trénujeme, abychom vyhrávali** (Train to Win),
- **Aktivní po celý život** (Active for Life): do této etapy lze vstoupit v jakémkoli věku.

První tři etapy tvoří základ **pohybové gramotnosti**, tedy motivace, sebedůvěry, pohybových dovedností a znalostí, díky kterým člověk sportuje celý život.

Model doporučuje i poměr tréninku a soutěžení: v etapě Učíme se trénovat **70 : 30**, v etapě Trénujeme, abychom trénovali 60 : 40. Děti mají víc trénovat a hrát, než jezdit po turnajích o poháry.

Verze modelu z roku 2016 (LTAD 2.1) řadí fotbal mezi sporty s **pozdní specializací**, ke kterým je ale dobré se dostat brzy. Příliš brzká specializace podle něj vede k jednostranné přípravě, chybějícím pohybovým základům, **zraněním z přetížení**, **vyhoření** a brzkému konci kariéry.

Model má i kritiky. **Ford a kolegové (2011)** mu vytkli, že je **obecný, ne individuální**, a že pro řadu jeho tvrzení **chybí dostatek důkazů**. Doporučují brát ho jako rozpracované dílo, které se má dál ověřovat. Pro trenéra je LTAD dobrá mapa, jen s ní nechoď po šumavském lese se zavřenýma očima.`,
    },
    {
      id: "mladez-specializace",
      category: "mladez",
      difficulty: 3,
      title: "Specializace a cesta do áčka",
      body: `Má se desetiletý kluk věnovat jen fotbalu, nebo ať v zimě běžkuje a v létě hraje nohejbal? **Americká akademie pediatrů** (AAP) se k tomu vyjádřila v roce 2016.

Podle AAP současné důkazy ukazují, že **odložit specializaci** u většiny sportů **až na dobu po pubertě**, tedy zhruba do **15 až 16 let**, snižuje rizika a zvyšuje šanci na sportovní úspěch. Většina elitních sportovců se na svůj hlavní sport specializovala později. Děti, které sportují **všestranně**, si osvojí pohybové základy a ty pak přenesou do sportu, který si nakonec vyberou.

Rizika příliš brzké specializace podle AAP:
- **zranění z přetížení** jednostrannou zátěží,
- **vyhoření**, úzkost a odchod ze sportu,
- izolace od vrstevníků mimo vlastní sport.

Praktická doporučení AAP:
- aspoň **1 až 2 dny v týdnu volna** od svého hlavního sportu,
- za rok dohromady aspoň **3 měsíce pauzy** od svého sportu, po měsíčních blocích; aktivní může dítě být dál v jiných sportech,
- jedna z citovaných studií zjistila vyšší riziko přetížení u dětí, které měly **víc hodin organizovaného sportu týdně, než kolik jim je let**.

Pak přijde chvíle, kdy se z dorostence stává chlap. Podle soutěžního řádu FAČR smí hráč nastoupit za **muže** od soutěžního ročníku, ve kterém věkově patří do **mladšího dorostu**, tedy od ročníku začínajícího v roce, kdy dovrší **15 let**. Že smí, ale neznamená, že musí. Přechod k dospělým je skok: soupeři jsou silnější, tempo jiné a v kabině platí jiné zvyky.

Pomáhá:
- dávat mladým minuty **postupně**, třeba závěrečné čtvrthodinky,
- přidělit jim **zkušeného parťáka** v kabině,
- mluvit s nimi o jejich roli, ne je jen hodit do vody.

Jinak se ti stane, že talent po dvou výpraskách od Horní Plané skončí a jde radši na brigádu.`,
    },
  ],
  questions: [
    // Věkové kategorie mládeže
    {
      id: "mladez-kategorie-1",
      lessonId: "mladez-kategorie",
      text: "Do které kategorie patří hráči U12 a U13?",
      options: [
        "Starší přípravka",
        "Starší žáci",
        "Mladší žáci",
        "Mladší dorost",
      ],
      correct: 2,
      explain: "U12 a U13 jsou mladší žáci, U14 a U15 starší žáci. Viz lekce: Věkové kategorie mládeže.",
    },
    {
      id: "mladez-kategorie-2",
      lessonId: "mladez-kategorie",
      text: "Co je rozhodující pro zařazení hráče do věkové kategorie mládeže?",
      options: [
        "Kolik let dovrší v kalendářním roce, ve kterém soutěžní ročník začíná",
        "Jeho výška a váha při vstupní prohlídce",
        "Jeho věk v den prvního zápasu sezóny",
        "Rozhodnutí předsedy oddílu",
      ],
      correct: 0,
      explain: "Podle soutěžního řádu rozhoduje, kolik let hráč dovrší v kalendářním roce, ve kterém ročník začíná; v kategorii pak zůstává celý ročník.",
    },
    {
      id: "mladez-kategorie-3",
      lessonId: "mladez-kategorie",
      text: "Co platí pro takzvané future hráče?",
      options: [
        "Mohou nastoupit v libovolném počtu v jakékoli soutěži",
        "Jsou to o tři roky mladší hráči, kteří hrají za dospělé",
        "Jsou to zahraniční hráči na hostování",
        "Jsou o ročník starší, v utkání smějí nastoupit nejvýš dva a jen když to povolí rozpis soutěže",
      ],
      correct: 3,
      explain: "Future hráči jsou o ročník starší, biologicky méně vyspělí; nastoupit smějí nejvýš dva a jen se svolením řídícího orgánu.",
    },
    {
      id: "mladez-kategorie-4",
      lessonId: "mladez-kategorie",
      text: "Hráč začal ročník ve starších žácích a během jara dovrší věk mladšího dorostu. Co smí?",
      options: [
        "Musí okamžitě přejít do dorostu",
        "Smí ročník dohrát ve starších žácích",
        "Do konce ročníku nesmí hrát vůbec",
        "Musí hrát výhradně za muže",
      ],
      correct: 1,
      explain: "Do kategorie patří hráč na celý ročník; kdo během něj dovrší věk vyšší kategorie, dohraje ho ve své a výš přejde až od dalšího.",
    },

    // Malé formy fotbalu v přípravkách
    {
      id: "mladez-male-formy-1",
      lessonId: "mladez-male-formy",
      text: "Kolik hráčů hraje v mladší přípravce podle pravidel malých forem?",
      options: [
        "Čtyři v poli a brankář (4+1)",
        "Deset v poli a brankář (10+1)",
        "Sedm v poli a brankář (7+1)",
        "Dva v poli a žádný brankář",
      ],
      correct: 0,
      explain: "Mladší přípravka hraje 4+1, tedy čtyři hráči v poli a brankář. Viz lekce: Malé formy fotbalu v přípravkách.",
    },
    {
      id: "mladez-male-formy-2",
      lessonId: "mladez-male-formy",
      text: "Jakou velikost míče používá starší přípravka?",
      options: [
        "Velikost 5 jako dospělí",
        "Velikost 2",
        "Jakoukoli, co zrovna leží v kabině",
        "Velikost 4",
      ],
      correct: 3,
      explain: "Starší přípravka hraje s míčem velikosti 4, mladší přípravka s míčem velikosti 3.",
    },
    {
      id: "mladez-male-formy-3",
      lessonId: "mladez-male-formy",
      text: "Z jaké vzdálenosti se ve starší přípravce kope pokutový kop?",
      options: [
        "Z 11 metrů",
        "Ze 7 metrů",
        "Ze 3 metrů",
        "Z poloviny hřiště",
      ],
      correct: 1,
      explain: "Pravidla starší přípravky stanoví pokutový kop ze 7 metrů od branky.",
    },
    {
      id: "mladez-male-formy-4",
      lessonId: "mladez-male-formy",
      text: "Co platí pro tabulky dlouhodobých soutěží přípravek?",
      options: [
        "Zveřejňují se každý týden v okresních novinách",
        "Poslední tým sestupuje do nižší třídy",
        "Nezveřejňují se",
        "Vítěz postupuje rovnou do dorostu",
      ],
      correct: 2,
      explain: "Tabulky přípravek se nezveřejňují, v přípravce jde o rozvoj a radost dětí.",
    },

    // Hra a radost jako základ
    {
      id: "mladez-radost-1",
      lessonId: "mladez-radost",
      text: "Kde skončilo vítězství mezi 81 faktory zábavy ve výzkumu Amandy Visek?",
      options: [
        "Na prvním místě",
        "Až na 48. místě",
        "Na posledním, 81. místě",
        "V seznamu se vůbec neobjevilo",
      ],
      correct: 1,
      explain: "Vítězství skončilo až na 48. místě z 81. Viz lekce: Hra a radost jako základ.",
    },
    {
      id: "mladez-radost-2",
      lessonId: "mladez-radost",
      text: "Které oblasti zábavy byly podle výzkumu Amandy Visek nejvýš hodnocené?",
      options: [
        "Vítězství, pohár a medaile",
        "Nové kopačky a drahý dres",
        "Fér hra, snaha a pozitivní trenér",
        "Dlouhé běhání kolem hřiště",
      ],
      correct: 2,
      explain: "Nejvýš hodnocené oblasti zábavy byly fér hra, snaha a nasazení a pozitivní trenér.",
    },
    {
      id: "mladez-radost-3",
      lessonId: "mladez-radost",
      text: "Co je podle metodické příručky FAČR cílem u nejmenších dětí?",
      options: [
        "Všestranný pohyb, cit pro míč, samostatné rozhodování a chuť sportovat",
        "Co nejdřív naučit rozestavení 4-4-2",
        "Vyhrát okresní soutěž přípravek",
        "Vybrat talenty a ostatní poslat domů",
      ],
      correct: 0,
      explain: "Cílem není naučit děti hned fotbal, ale všestranný pohyb, cit pro míč, rozhodování a lásku ke sportu.",
    },
    {
      id: "mladez-radost-4",
      lessonId: "mladez-radost",
      text: "Jak má trenér podle lekce zasahovat do hry dětí?",
      options: [
        "Neustále je řídit z lavičky při každém doteku",
        "Zastavit hru po každé chybě a vynadat",
        "Vůbec s nimi nemluvit, ani v přestávkách",
        "Minimálně; děti mají řešení objevovat samy a rady dostávají hlavně v přestávkách",
      ],
      correct: 3,
      explain: "Trenér vstupuje do hry minimálně a radí hlavně ve chvílích, kdy děti nehrají.",
    },

    // Jak mluvit s dětmi a s rodiči
    {
      id: "mladez-komunikace-1",
      lessonId: "mladez-komunikace",
      text: "Jaký poměr pochval a výtek doporučuje Positive Coaching Alliance?",
      options: [
        "Jedna pochvala na pět výtek",
        "Žádné pochvaly, aby děti nezpychly",
        "Deset výtek za každou zahozenou šanci",
        "Pět pochval na jednu výtku",
      ],
      correct: 3,
      explain: "Magický poměr je 5 : 1, pět konkrétních a pravdivých pochval na jednu výtku. Viz lekce: Jak mluvit s dětmi a s rodiči.",
    },
    {
      id: "mladez-komunikace-2",
      lessonId: "mladez-komunikace",
      text: "Jaká má být pochvala podle lekce?",
      options: [
        "Co nejobecnější, třeba jen „dobrý“",
        "Konkrétní a pravdivá",
        "Jen za vstřelený gól",
        "Přehnaná, i když to není pravda",
      ],
      correct: 1,
      explain: "Konkrétní pochvala dítěti řekne, co má zopakovat; plané chválení děti poznají.",
    },
    {
      id: "mladez-komunikace-3",
      lessonId: "mladez-komunikace",
      text: "Proč se podle metodické příručky FAČR mají trenér a rodiče domlouvat?",
      options: [
        "Protože to soutěžní řád nařizuje pod pokutou",
        "Protože rodiče platí příspěvky",
        "Protože děti nedokážou rozlišit, jestli má pravdu rodič, nebo trenér",
        "Aby rodiče mohli sestavovat základní sestavu",
      ],
      correct: 2,
      explain: "Když rodič a trenér říkají opak, dítě je zmatené; proto příručka radí komunikovat a spolupracovat.",
    },
    {
      id: "mladez-komunikace-4",
      lessonId: "mladez-komunikace",
      text: "Co lekce doporučuje udělat s rodiči na začátku sezóny?",
      options: [
        "Uspořádat schůzku a vysvětlit cíle, pravidla a střídání",
        "Zakázat jim vstup do areálu",
        "Zvolit kapitána podle toho, čí táta nejvíc křičí",
        "Nic, rodiče si všechno zjistí sami",
      ],
      correct: 0,
      explain: "Schůzka na začátku sezóny vysvětlí, co trenér chce děti naučit a proč se nehraje o tabulku.",
    },

    // Koordinace a technika podle věku
    {
      id: "mladez-senzitivni-1",
      lessonId: "mladez-senzitivni",
      text: "Kdy jsou podle modelu LTAD u chlapců nejlepší roky pro učení sportovních dovedností?",
      options: [
        "Zhruba mezi 9 a 12 lety, před začátkem růstového spurtu",
        "Až po 18. roce, kdy tělo doroste",
        "Jen mezi 3. a 4. rokem",
        "Kdykoli po skončení růstu",
      ],
      correct: 0,
      explain: "Roky hladové po dovednostech jsou u chlapců asi 9 až 12 let, u dívek 8 až 11. Viz lekce: Koordinace a technika podle věku.",
    },
    {
      id: "mladez-senzitivni-2",
      lessonId: "mladez-senzitivni",
      text: "Co patří do takzvané ABC pohybu?",
      options: [
        "Autobus, bufet a cestování na zápasy",
        "Taktika, standardní situace a ofsajd",
        "Obratnost, rovnováha, koordinace a rychlost",
        "Maximální síla a posilování s činkou",
      ],
      correct: 2,
      explain: "ABC pohybu tvoří obratnost, rovnováha, koordinace a rychlost.",
    },
    {
      id: "mladez-senzitivni-3",
      lessonId: "mladez-senzitivni",
      text: "Co podle modelu LTAD platí mimo citlivá období?",
      options: [
        "Okna se navždy zavřou a nic se už naučit nedá",
        "Trénink je mimo ně zakázaný",
        "Rozvíjet jde už jen vytrvalost",
        "Schopnosti jsou trénovatelné dál, okna jsou jen částečně otevřená",
      ],
      correct: 3,
      explain: "Podle modelu jsou všechny schopnosti trénovatelné vždy, citlivá období jen usnadňují rozvoj.",
    },
    {
      id: "mladez-senzitivni-4",
      lessonId: "mladez-senzitivni",
      text: "Na co je podle modelu potřeba dávat pozor během růstového spurtu?",
      options: [
        "Na to, aby dítě se sportem raději přestalo",
        "Na pohyblivost, protože rychle rostoucí kosti namáhají svaly a šlachy",
        "Na co nejtěžší posilování s maximální vahou",
        "Na nic, růstový spurt se sportu netýká",
      ],
      correct: 1,
      explain: "Během spurtu rostou kosti rychle, proto model radí zvláštní pozornost pohyblivosti.",
    },

    // Relativní věkový efekt
    {
      id: "mladez-relativni-vek-1",
      lessonId: "mladez-relativni-vek",
      text: "Koho relativní věkový efekt v českém mládežnickém fotbale zvýhodňuje?",
      options: [
        "Hráče narozené v prosinci",
        "Hráče s narozeninami o letních prázdninách",
        "Hráče narozené na začátku kalendářního roku",
        "Nikoho, v Česku se efekt projevit nemůže",
      ],
      correct: 2,
      explain: "Kategorie se počítají podle věku k 1. lednu, takže narození na začátku roku jsou nejstarší v ročníku. Viz lekce: Relativní věkový efekt.",
    },
    {
      id: "mladez-relativni-vek-2",
      lessonId: "mladez-relativni-vek",
      text: "V jakém sportu popsali relativní věkový efekt v roce 1985 Barnsleyovi s Thompsonem?",
      options: [
        "V anglickém kriketu",
        "V kanadském ledním hokeji",
        "V české házené",
        "Ve formuli 1",
      ],
      correct: 1,
      explain: "Studie z roku 1985 ukázala souvislost měsíce narození a úspěchu v kanadském hokeji.",
    },
    {
      id: "mladez-relativni-vek-3",
      lessonId: "mladez-relativni-vek",
      text: "Co je bio-banding?",
      options: [
        "Rozdělení hráčů podle biologické zralosti místo data narození",
        "Rozdělení hráčů podle krevní skupiny",
        "Ekologický trávník bez hnojiva",
        "Kapela, která hraje o poločase",
      ],
      correct: 0,
      explain: "Bio-banding skupinuje hráče podle zralosti, ne podle ročníku; zkoušely ho akademie Premier League.",
    },
    {
      id: "mladez-relativni-vek-4",
      lessonId: "mladez-relativni-vek",
      text: "Co podle modelu LTAD platí o pozdě dospívajících hráčích?",
      options: [
        "Dříve dospívající už nikdy nedoženou",
        "Mají výhodu hlavně v období kolem růstového spurtu",
        "Mají fotbal nechat a zkusit šachy",
        "Po růstovém spurtu mají často větší potenciál, pokud dostávají kvalitní trénink",
      ],
      correct: 3,
      explain: "Kolem spurtu mají výhodu dříve dospívající, ale po něm mívají větší potenciál pozdě dospívající.",
    },

    // Dlouhodobý rozvoj sportovce (LTAD)
    {
      id: "mladez-ltad-1",
      lessonId: "mladez-ltad",
      text: "Která etapa je v modelu LTAD první?",
      options: [
        "Trénujeme, abychom vyhrávali (Train to Win)",
        "Aktivní po celý život (Active for Life)",
        "Trénujeme, abychom soutěžili (Train to Compete)",
        "Aktivní start (Active Start)",
      ],
      correct: 3,
      explain: "Model začíná etapou Aktivní start, pokračuje Základy a Učíme se trénovat. Viz lekce: Dlouhodobý rozvoj sportovce (LTAD).",
    },
    {
      id: "mladez-ltad-2",
      lessonId: "mladez-ltad",
      text: "Jak model LTAD ve verzi 2.1 řadí fotbal?",
      options: [
        "Mezi sporty s pozdní specializací",
        "Mezi sporty s ranou specializací, podobně jako gymnastiku",
        "Mezi sporty, u kterých na specializaci nezáleží",
        "Mezi individuální sporty",
      ],
      correct: 0,
      explain: "Fotbal patří mezi sporty s pozdní specializací; brzká specializace v nich podle modelu škodí.",
    },
    {
      id: "mladez-ltad-3",
      lessonId: "mladez-ltad",
      text: "Jaký poměr tréninku a soutěžení doporučuje LTAD v etapě Učíme se trénovat (Learn to Train)?",
      options: [
        "10 : 90",
        "70 : 30",
        "50 : 50",
        "25 : 75",
      ],
      correct: 1,
      explain: "V etapě Učíme se trénovat je doporučený poměr 70 : 30 ve prospěch tréninku.",
    },
    {
      id: "mladez-ltad-4",
      lessonId: "mladez-ltad",
      text: "Co modelu LTAD vytkli Ford a kolegové (2011)?",
      options: [
        "Že je příliš individuální a hodí se jen pro jednoho hráče",
        "Že nepočítá s dětmi mladšími 18 let",
        "Že je obecný, ne individuální, a pro řadu tvrzení chybí dostatek důkazů",
        "Že vznikl v hokeji, a proto je ve fotbale zakázaný",
      ],
      correct: 2,
      explain: "Kritici upozornili na obecnost modelu a slabou důkazní základnu; doporučují ho dál ověřovat.",
    },

    // Specializace a cesta do áčka
    {
      id: "mladez-specializace-1",
      lessonId: "mladez-specializace",
      text: "Do kdy doporučuje Americká akademie pediatrů u většiny sportů odložit specializaci?",
      options: [
        "Do 6 let, potom už je pozdě",
        "Až na dobu po pubertě, zhruba do 15 až 16 let",
        "Do 25 let",
        "Vůbec neodkládat, specializovat hned, jak dítě umí chodit",
      ],
      correct: 1,
      explain: "AAP doporučuje u většiny sportů specializaci odložit až na dobu po pubertě, zhruba do 15 až 16 let. Viz lekce: Specializace a cesta do áčka.",
    },
    {
      id: "mladez-specializace-2",
      lessonId: "mladez-specializace",
      text: "Kolik dní v týdnu volna od svého hlavního sportu AAP doporučuje?",
      options: [
        "Žádný, volno jen oslabuje",
        "Jeden den za měsíc",
        "Pět dní, trénovat se má jen o víkendu",
        "Aspoň 1 až 2 dny",
      ],
      correct: 3,
      explain: "AAP doporučuje aspoň 1 až 2 dny v týdnu volna od hlavního sportu a za rok aspoň 3 měsíce pauzy.",
    },
    {
      id: "mladez-specializace-3",
      lessonId: "mladez-specializace",
      text: "Jaké zjištění o hodinách organizovaného sportu lekce uvádí?",
      options: [
        "Dítě má trénovat aspoň tolik hodin denně, kolik mu je let",
        "Na počtu hodin vůbec nezáleží",
        "Víc hodin organizovaného sportu týdně, než je dítěti let, souvisí s vyšším rizikem přetížení",
        "Čím víc hodin, tím menší riziko zranění",
      ],
      correct: 2,
      explain: "Studie citovaná AAP spojila víc hodin týdně, než je dítěti let, s vyšším rizikem zranění z přetížení.",
    },
    {
      id: "mladez-specializace-4",
      lessonId: "mladez-specializace",
      text: "Od kdy smí hráč podle soutěžního řádu FAČR nastoupit za muže?",
      options: [
        "Od ročníku, ve kterém věkově patří do mladšího dorostu, tedy od ročníku začínajícího v roce, kdy dovrší 15 let",
        "Až od 21 let",
        "Od 12 let, pokud souhlasí trenér",
        "Nikdy dřív, než dohraje starší dorost",
      ],
      correct: 0,
      explain: "Za muže smějí nastupovat hráči kategorie mladšího dorostu, tedy od ročníku začínajícího v roce, kdy dovrší 15 let.",
    },
  ],
};
