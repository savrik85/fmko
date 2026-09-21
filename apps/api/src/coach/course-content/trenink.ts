/**
 * Skripta „Trénink" (vlastnost Koučink): jak stavět trénink, zatěžovat, regenerovat
 * a předcházet zraněním.
 *
 * Fakta ověřena proti zdrojům: Behm a kol. 2016 (APNM, statický strečink), příručka
 * FIFA 11+ (F-MARC), Issurin 2010 (Sports Med, superkompenzace a periodizace),
 * Bosquet a kol. 2007 (MSSE, taper), Helgerud a kol. 2001 (MSSE, 4× 4 min),
 * Hill-Haas a kol. 2011 (Sports Med, hry na malém prostoru), Foster a kol. 2001
 * (session RPE), ACSM 2007 (pitný režim), AASM 2015/2016 (spánek), Meeusen a kol.
 * 2013 (přetrénování), van Dyk a kol. 2019 (BJSM, severský hamstring).
 * Stavba jednotky podle české trenérské metodiky (úvodní, průpravná, hlavní, závěrečná).
 */
import type { CategoryContent } from "./types";

export const TRENINK: CategoryContent = {
  lessons: [
    {
      id: "trenink-rozcvicka",
      category: "trenink",
      difficulty: 1,
      title: "Rozcvička a protahování",
      body: `Rozcvička není povinná slohovka před výkopem, ale příprava těla i hlavy na zátěž. Zahřáté svaly a nastartovaný nervový systém reagují rychleji a hráč je připravenější na první sprint i první souboj.

Osvědčené pořadí vypadá takto:
- nejdřív **lehký klus** a pohyb mírné intenzity, třeba obraty a poskoky bez prudkých švihů,
- potom **dynamické protahování**, tedy protahování v pohybu: kroužení v kyčlích, výpady, přednožování a zanožování za chůze,
- nakonec činnost s míčem a postupné zvyšování tempa až k rychlým krátkým úsekům.

**Statické protahování** znamená podržet sval v natažené poloze bez pohybu. Souhrnný přehled studií (Behm a kol., 2016) ukázal, že statické protahování těsně před výkonem výkon mírně snižuje, a to výrazněji, když jednu svalovou skupinu držíš **60 sekund a déle**. Dynamické protahování naopak výkon mírně zlepšovalo. Proto do rozcvičky patří hlavně protahování v pohybu.

Také příručka k programu FIFA 11+ uvádí, že strečinková cvičení do rozcvičky nepatří, ale dají se zařadit **na konec tréninku**. Statické protahování tedy nezatracuj, jen ho přesuň tam, kde neubírá z výbušnosti: po tréninku nebo do samostatné jednotky na pohyblivost.

A ještě jedna šumavská moudrost: kdo se místo rozcvičky opírá o zábradlí a vykládá strejdovi na tribuně, jak se hrálo za mlada, ten se rozcvičuje leda jazykem. Hamstring mu pak v první minutě připomene, že jazyk není sval, na kterém se běhá.`,
    },
    {
      id: "trenink-jednotka",
      category: "trenink",
      difficulty: 1,
      title: "Stavba tréninkové jednotky",
      body: `**Tréninková jednotka** je jeden trénink od prvního hvizdu po odchod do kabiny. V české trenérské metodice se obvykle dělí na **čtyři části**: úvodní, průpravnou, hlavní a závěrečnou.

**Úvodní část** je krátká a organizační. Trenér zhodnotí minulý trénink nebo zápas, řekne, co se bude dnes dělat a na co se zaměřit, a hráče namotivuje. Kdo ví, proč cvičí, cvičí líp.

**Průpravná část** je rozcvičení. Začíná se pohybem mírné intenzity, po zahřátí přichází dynamické protahování a pak dynamická činnost s míčem i bez něj, při které se intenzita postupně zvyšuje.

**Hlavní část** plní cíle dne. Důležité je pořadí: na začátek hlavní části, kdy jsou hráči ještě **odpočatí**, patří cvičení na **rychlost**, výbušnost a zdokonalování **techniky**. Unavený hráč se novou dovednost učí špatně a sprint v únavě už není sprint. Vytrvalostní a silově vytrvalostní úkoly se proto dávají spíš ke konci hlavní části.

**Závěrečná část** slouží ke **zklidnění organismu** a k začátku zotavení: vyklusání, lehké protažení. Úplně na závěr trenér trénink krátce **zhodnotí** a řekne, co bude příště.

Pamatuj, že jedna jednotka nemůže obsahovat všechno. Když chceš v úterý trénovat rychlost, střelbu, taktiku i vytrvalost naráz, nestihneš pořádně nic. A kluci pak dorazí do hospody o půl hodiny později, než slíbili doma, což je taky svým způsobem zátěž.`,
    },
    {
      id: "trenink-zatezovani",
      category: "trenink",
      difficulty: 2,
      title: "Postupné zatěžování a superkompenzace",
      body: `Proč vůbec trénink funguje? Tělo reaguje na zátěž tak, že se jí přizpůsobí. Klasické vysvětlení je **superkompenzace**, kterou v polovině 50. let popsal sovětský biochemik Jakovlev.

Cyklus po jednom tréninku má čtyři fáze:
- zátěž vyvolá **únavu** a výkonnost dočasně klesne,
- při odpočinku probíhá **zotavení** a výkonnost se vrací na výchozí úroveň,
- potom na čas **přesáhne výchozí úroveň**, to je samotná superkompenzace,
- když nepřijde další podnět, výkonnost se vrátí zpátky na původní úroveň.

Z toho plyne význam načasování. Když další tvrdý trénink přijde **příliš brzy**, hráč ještě není zotavený, **únava se sčítá** a výkonnost klesá. Když přijde **příliš pozdě**, efekt vyprchá a začínáš znovu. Lev Matvejev, zakladatel klasické teorie periodizace, doplnil, že několik tréninků lze odcvičit i v únavě a superkompenzace pak přijde po celém krátkém cyklu, ne po jednom tréninku.

Druhá zásada je **postupné zvyšování zátěže**. Tělo si zvykne, a co bylo v srpnu těžké, je v říjnu rozcvička. Aby trénink dál působil, musí zátěž pozvolna růst: víc opakování, kratší pauzy, vyšší tempo. Skokem to nejde, to je cesta k natrženým svalům.

Třetí zásada je **vlnovitost**: střídat dny s vyšší a nižší zátěží, aby se únava nehromadila. Po tvrdém úterku ať je čtvrtek lehčí.

Pozor, superkompenzace je zjednodušený model a skutečné tělo tak učebnicově nefunguje. Jako vodítko pro plánování ale poslouží dobře i v okresním přeboru.`,
    },
    {
      id: "trenink-regenerace",
      category: "trenink",
      difficulty: 2,
      title: "Regenerace, spánek, pití a přetrénování",
      body: `Trénink je jen polovina práce. Výkonnost roste během **zotavení**, a když ho hráč odflákne, dřina přijde vniveč.

**Spánek** je nejlevnější regenerace. Americká akademie spánkové medicíny doporučuje dospělým spát pravidelně **7 hodin a víc**, dospívajícím mezi 13 a 18 lety **8 až 10 hodin** a dětem od 6 do 12 let 9 až 12 hodin denně. Dorostenec, který do dvou do rána hraje na mobilu, ráno sprinty nezaběhne.

**Pitný režim** řeší stanovisko Americké vysoké školy sportovní medicíny (ACSM). Cílem pití během zátěže je zabránit nadměrné dehydrataci, tedy ztrátě **víc než asi 2 % tělesné hmotnosti** kvůli úbytku vody, protože ta už zhoršuje výkon. Každý se potí jinak, proto se doporučuje individuální přístup. Kolik hráč vypotí, zjistíš jednoduše: **zvaž ho před tréninkem a po něm**. Po zátěži je cílem ztracené tekutiny a soli doplnit. Pivo v hospodě po tréninku je společenská událost, ne pitný režim.

**Přetrénování** vzniká, když je zátěže dlouhodobě moc a odpočinku málo. Společné stanovisko evropské a americké sportovní medicíny z roku 2013 rozlišuje:
- **funkční přetížení**: krátkodobý pokles výkonu, třeba po soustředění, po odpočinku přijde zlepšení,
- **nefunkční přetížení**: výkon stagnuje nebo klesá a zotavení trvá týdny až měsíce,
- **syndrom přetrénování**: výkon klesá i přes odpočinek, přidává se únava a zhoršená nálada a zotavení může trvat měsíce, možná i roky.

Jednoduchý test na přetrénování neexistuje. Diagnóza se dělá **vyloučením jiných příčin**, třeba nemoci nebo nedostatku jídla.`,
    },
    {
      id: "trenink-prihravka",
      category: "trenink",
      difficulty: 1,
      title: "Přihrávka a zpracování míče",
      body: `Fotbal je hlavně o tom, dostat míč ke spoluhráči a pak s ním něco rozumného udělat. Na okrese se proto víc než nůžky vyplatí piplat základy.

**Přihrávka vnitřní stranou nohy**, lidově placírka, je nejpřesnější přihrávka na krátkou vzdálenost, protože míč se trefuje **velkou rovnou plochou** nohy. Základní body:
- **stojná noha** stojí vedle míče a špičkou míří tam, kam přihráváš,
- kopající noha je vytočená a **kotník zpevněný**, aby noha při kopu necukla,
- trefuješ **střed míče**; když ho trefíš níž, míč se zvedne do vzduchu,
- noha po kopu pokračuje směrem k cíli.

**Zpracování míče**, tedy první dotek, rozhoduje, jestli budeš mít čas. Dobrý první dotek míč nezastaví jako kámen, ale posune ho **do volného prostoru, pryč od soupeře**, rovnou tam, kam chceš hrát dál. Noha při převzetí trochu povolí, aby míč ztlumila, místo aby se od ní odrazil.

**Než míč přijde, rozhlédni se.** Krátký pohled přes rameno ti řekne, kde je soupeř a kde volný spoluhráč. Kdo se podívá až s míčem u nohy, už je pozdě. K tomu pomáhá **otevřené postavení těla**, tedy stát bokem, abys viděl víc hřiště a mohl míč převzít směrem dopředu.

A až bude strejda z tribuny řvát „nakopni to!“, vzpomeň si, že nakopnutý míč se většinou vrátí i se soupeřem.`,
    },
    {
      id: "trenink-periodizace",
      category: "trenink",
      difficulty: 3,
      title: "Periodizace: makro, mezo, mikro",
      body: `**Periodizace** znamená rozdělit sezónu na menší období a cykly tak, aby hráči byli ve formě, když na tom záleží. Klasickou teorii sepsal v 60. letech sovětský odborník **Lev Matvejev**.

Cykly do sebe zapadají jako krabičky:
- **makrocyklus** je velký cyklus v řádu měsíců, často celý rok nebo sezóna,
- **mezocyklus** je střední cyklus v řádu týdnů, složený z několika mikrocyklů,
- **mikrocyklus** je malý cyklus v řádu dnů, nejčastěji **jeden týden**; ve fotbale typicky od zápasu k zápasu,
- nejmenší stavební kámen je samotná tréninková jednotka.

Makrocyklus se v klasickém modelu dělí na tři **období**:
- **přípravné**: velký objem, pestrá cvičení, rozvoj všeobecné kondice a techniky,
- **soutěžní**: intenzivnější a specializovanější práce s menším objemem, k tomu zápasy,
- **přechodné**: nejkratší, slouží k aktivnímu odpočinku a doléčení.

Na vesnici to znamená: v zimní přípravě se naběhá a nadře, během sezóny se ladí rychlost a hra a po posledním kole se jezdí na kole a chodí na houby.

Zvláštní kapitola je **vyladění před důležitým výkonem**, anglicky taper. Souhrnná analýza studií u závodních sportovců (Bosquet a kol., 2007) zjistila, že nejlépe funguje zhruba dvoutýdenní období, kdy se **objem tréninku sníží o 41–60 %**, ale **intenzita ani počet tréninků se nemění**. Hráči tedy necvičí méně ostře, jen méně dlouho.

Novější přístupy, třeba bloková periodizace, klasický model upravují. Pro okresní přebor s jedním zápasem týdně je ale týdenní mikrocyklus pořád nejpraktičtější jednotkou plánu.`,
    },
    {
      id: "trenink-objem-intenzita",
      category: "trenink",
      difficulty: 3,
      title: "Objem, intenzita a intervalový trénink",
      body: `Zatížení má dvě hlavní složky. **Objem** říká, kolik se toho udělá: minuty, kilometry, počet opakování. **Intenzita** říká, jak ostře: rychlost, tepová frekvence, váha činky. Obvykle platí, že **čím vyšší intenzita, tím menší objem** hráč vydrží. Hodinu v klusu zvládne, hodinu sprintů ne.

Jednoduché měřítko zátěže celé jednotky navrhl Carl Foster: hráč po tréninku ohodnotí, jak těžké to bylo, na stupnici **0 až 10**, a číslo se vynásobí **délkou tréninku v minutách**. Devadesátiminutový trénink za 5 dá 450 jednotek. Metoda je levná a umí srovnat i různé druhy tréninku.

**Intervalový trénink** střídá úseky práce s úseky odpočinku. Známý je norský protokol (Helgerud a kol., 2001): **4× 4 minuty** na **90–95 % maximální tepové frekvence**, mezi nimi **3 minuty klusu**, dvakrát týdně po dobu 8 týdnů. Juniorští hráči po něm měli vyšší aerobní kapacitu a v zápase naběhali víc, měli víc sprintů i víc kontaktů s míčem. Síla, výskok a přesnost přihrávek se nezměnily.

Místo běhání bez míče můžeš použít **hry na malém prostoru**. Přehled studií (Hill-Haas a kol., 2011) shrnuje, že intenzita roste, když **ubereš hráče** a zároveň **zvětšíš plochu připadající na jednoho hráče**. Zvýšit ji pomáhá i **soustavné povzbuzování trenérem**, kdežto většina úprav pravidel na ni tolik nepůsobí. Kondici takové hry zlepšují podobně jako klasický běh, a navíc se u toho hraje fotbal.

Pro vesnický tým, kde polovina kádru při slově „běhání“ hlásí bolavé koleno, je to dobrá zpráva.`,
    },
    {
      id: "trenink-prevence",
      category: "trenink",
      difficulty: 3,
      title: "Prevence zranění: FIFA 11+",
      body: `**FIFA 11+** je rozcvičovací program, který v roce 2006 vytvořili odborníci z lékařského centra FIFA (F-MARC), Oslo Sports Trauma Research Center a Santa Monica Orthopaedic and Sports Medicine Research Foundation. Je to **kompletní rozcvička**, která **nahrazuje** obvyklé rozcvičení před tréninkem, ne cvičení navíc.

Program má **tři části a 15 cviků**, dohromady asi **20 minut**:
- **část 1** (8 minut): běžecká cvičení v pomalém tempu s aktivním protahováním a kontrolovanými kontakty se spoluhráčem,
- **část 2** (10 minut): šest cviků na sílu středu těla a nohou, rovnováhu a dopady, každý ve **třech úrovních obtížnosti**,
- **část 3** (2 minuty): běh ve střední až vysoké rychlosti se změnami směru.

Doporučení zní: před **každým tréninkem, aspoň dvakrát týdně**, a před zápasem zkrácená verze z částí 1 a 3. Účinek se podle příručky dostaví zhruba po **10 až 12 týdnech**. Program je určen hráčům přibližně **od 14 let**; u mladších se některé cviky vynechávají nebo upravují.

Klíčem je **správná technika**: noha v jedné linii, **koleno nad špičkou**, měkké dopady. Koleno nesmí uhýbat dovnitř. Studie v British Medical Journal z roku 2008 ukázala, že mládežnické týmy s touto rozcvičkou měly méně zranění než týmy s obvyklým rozcvičením.

Jedním z cviků části 2 je **severský (nordický) hamstring**: hráč klečí, spoluhráč mu drží kotníky a on se pomalu spouští dopředu. Souhrnná analýza (van Dyk a kol., 2019) zjistila, že programy s tímto cvikem snižují počet zranění zadních stehenních svalů **zhruba na polovinu**. Dvacet minut před tréninkem je levnější než šest týdnů s obvazem.`,
    },
  ],
  questions: [
    // Rozcvička a protahování
    {
      id: "trenink-rozcvicka-1",
      lessonId: "trenink-rozcvicka",
      text: "Jaký druh protahování patří hlavně do rozcvičky před tréninkem nebo zápasem?",
      options: [
        "Dynamické protahování v pohybu, třeba výpady a kroužení v kyčlích",
        "Dlouhé statické výdrže, každý sval aspoň dvě minuty bez hnutí",
        "Žádný pohyb, hráč má šetřit síly na zápas",
        "Posilování s činkami až do úplného vyčerpání",
      ],
      correct: 0,
      explain: "Do rozcvičky patří protahování v pohybu, statické výdrže těsně před výkonem mírně snižují výbušnost. Viz lekce: Rozcvička a protahování.",
    },
    {
      id: "trenink-rozcvicka-2",
      lessonId: "trenink-rozcvicka",
      text: "Co ukázal přehled studií Behma a kolegů (2016) o statickém protahování těsně před výkonem?",
      options: [
        "Zlepšuje výkon víc než jakýkoli jiný druh rozcvičení",
        "Mírně výkon snižuje, výrazněji při výdrži 60 sekund a déle na svalovou skupinu",
        "Nemá na výkon vůbec žádný vliv, ani kladný, ani záporný",
        "Škodí jen brankářům, hráčům v poli pomáhá",
      ],
      correct: 1,
      explain: "Statické protahování před výkonem výkon mírně snižuje a delší výdrže (60 s a víc) víc než kratší.",
    },
    {
      id: "trenink-rozcvicka-3",
      lessonId: "trenink-rozcvicka",
      text: "Kam podle příručky k programu FIFA 11+ patří strečinková cvičení?",
      options: [
        "Na úplný začátek rozcvičky, ještě před klus",
        "Do poločasové přestávky místo pití",
        "Na konec tréninku",
        "Nikam, protahování je ve fotbale zakázané",
      ],
      correct: 2,
      explain: "Příručka FIFA 11+ strečink do rozcvičky nezařazuje, ale doporučuje ho na konec tréninku.",
    },
    {
      id: "trenink-rozcvicka-4",
      lessonId: "trenink-rozcvicka",
      text: "Jaké pořadí rozcvičky lekce doporučuje?",
      options: [
        "Sprinty naplno, potom klus a nakonec sezení na lavičce",
        "Statické výdrže, potom sprinty a nakonec lehký klus",
        "Činnost s míčem, potom dlouhé statické výdrže a konec",
        "Lehký klus, potom dynamické protahování, nakonec míč a zvyšování tempa",
      ],
      correct: 3,
      explain: "Začíná se pohybem mírné intenzity, pokračuje protahováním v pohybu a končí činností s míčem a vyšším tempem.",
    },

    // Stavba tréninkové jednotky
    {
      id: "trenink-jednotka-1",
      lessonId: "trenink-jednotka",
      text: "Na jaké čtyři části se podle české trenérské metodiky obvykle dělí tréninková jednotka?",
      options: [
        "Rozběhovou, střeleckou, hospodskou a domácí",
        "Úvodní, průpravnou, hlavní a závěrečnou",
        "Ranní, polední, odpolední a večerní",
        "Brankářskou, obrannou, záložní a útočnou",
      ],
      correct: 1,
      explain: "Jednotka má úvodní, průpravnou (rozcvičení), hlavní a závěrečnou část. Viz lekce: Stavba tréninkové jednotky.",
    },
    {
      id: "trenink-jednotka-2",
      lessonId: "trenink-jednotka",
      text: "Co patří na začátek hlavní části tréninku?",
      options: [
        "Dlouhý vytrvalostní běh, aby se hráči pořádně unavili",
        "Silově vytrvalostní okruh až do vyčerpání",
        "Cvičení na rychlost a techniku, dokud jsou hráči odpočatí",
        "Rozbor minulého zápasu vsedě na lavičce",
      ],
      correct: 2,
      explain: "Rychlost, výbušnost a technika se trénují v odpočatém stavu; vytrvalost přichází spíš ke konci hlavní části.",
    },
    {
      id: "trenink-jednotka-3",
      lessonId: "trenink-jednotka",
      text: "Co je hlavní náplní úvodní části tréninku?",
      options: [
        "Sprinty na maximum hned po příchodu na hřiště",
        "Vyklusání a lehké protažení",
        "Modelový zápas jedenáct na jedenáct",
        "Organizace, zhodnocení minula a seznámení s programem dne",
      ],
      correct: 3,
      explain: "Úvodní část je krátká a organizační: zhodnocení, program a motivace.",
    },
    {
      id: "trenink-jednotka-4",
      lessonId: "trenink-jednotka",
      text: "K čemu slouží závěrečná část tréninku?",
      options: [
        "Ke zklidnění organismu a ke krátkému zhodnocení tréninku",
        "K nejtěžšímu kondičnímu cvičení celého dne",
        "K nácviku nových kliček v maximální únavě",
        "K vybírání členských příspěvků",
      ],
      correct: 0,
      explain: "Závěrečná část zahajuje zotavení (vyklusání, protažení) a trenér v ní trénink zhodnotí.",
    },

    // Postupné zatěžování a superkompenzace
    {
      id: "trenink-zatezovani-1",
      lessonId: "trenink-zatezovani",
      text: "Co je superkompenzace?",
      options: [
        "Náhrada za zraněného hráče, kterou schvaluje svaz",
        "Trvalý pokles výkonnosti po příliš lehkém tréninku",
        "Přechodné zvýšení výkonnosti nad výchozí úroveň po zotavení z tréninku",
        "Příplatek hráčům za trénink v dešti",
      ],
      correct: 2,
      explain: "Po únavě a zotavení výkonnost na čas přesáhne výchozí úroveň. Viz lekce: Postupné zatěžování a superkompenzace.",
    },
    {
      id: "trenink-zatezovani-2",
      lessonId: "trenink-zatezovani",
      text: "Co se stane, když další tvrdý trénink přijde dřív, než se hráč zotaví?",
      options: [
        "Superkompenzace bude automaticky dvojnásobná",
        "Nic, na načasování tréninků nezáleží",
        "Hráč se tím zotaví rychleji",
        "Únava se sčítá a výkonnost klesá",
      ],
      correct: 3,
      explain: "Příliš brzká zátěž nedá tělu čas na zotavení, únava se hromadí a výkonnost klesá.",
    },
    {
      id: "trenink-zatezovani-3",
      lessonId: "trenink-zatezovani",
      text: "Proč je potřeba tréninkovou zátěž postupně zvyšovat?",
      options: [
        "Tělo se přizpůsobí a stejná zátěž přestane být dostatečným podnětem",
        "Aby hráči rychleji dostávali křeče",
        "Protože to přikazuje soutěžní řád",
        "Nemá se zvyšovat, naopak se má snižovat až k nule",
      ],
      correct: 0,
      explain: "Co bylo v srpnu těžké, je v říjnu rozcvička. Zátěž musí pozvolna růst, ale ne skokem.",
    },
    {
      id: "trenink-zatezovani-4",
      lessonId: "trenink-zatezovani",
      text: "Co znamená zásada vlnovitosti zatížení?",
      options: [
        "Trénovat jen na hřišti u rybníka",
        "Střídat dny s vyšší a nižší zátěží, aby se únava nehromadila",
        "Každý den trénovat na maximum bez výjimky",
        "Otáčet hřiště podle směru větru",
      ],
      correct: 1,
      explain: "Vlnovitost znamená střídat těžší a lehčí dny, třeba po tvrdém úterku lehčí čtvrtek.",
    },

    // Regenerace, spánek, pití a přetrénování
    {
      id: "trenink-regenerace-1",
      lessonId: "trenink-regenerace",
      text: "Kolik spánku doporučuje Americká akademie spánkové medicíny dospívajícím mezi 13 a 18 lety?",
      options: [
        "Nejvýš 6 hodin, víc je lenost",
        "12 až 14 hodin denně",
        "4 hodiny a šlofík v autobuse na zápas",
        "8 až 10 hodin denně",
      ],
      correct: 3,
      explain: "Pro 13 až 18 let doporučuje 8 až 10 hodin, dospělým 7 hodin a víc. Viz lekce: Regenerace, spánek, pití a přetrénování.",
    },
    {
      id: "trenink-regenerace-2",
      lessonId: "trenink-regenerace",
      text: "Jaký je podle stanoviska ACSM cíl pití během zátěže?",
      options: [
        "Zabránit ztrátě víc než asi 2 % tělesné hmotnosti kvůli úbytku vody",
        "Vypít co nejvíc tekutin bez ohledu na to, kolik se hráč potí",
        "Nepít vůbec, aby hráč nebyl těžký",
        "Ztratit aspoň 5 % hmotnosti, aby byl hráč lehčí a rychlejší",
      ],
      correct: 0,
      explain: "Dehydratace nad asi 2 % tělesné hmotnosti už zhoršuje výkon, proto se jí pitím předchází.",
    },
    {
      id: "trenink-regenerace-3",
      lessonId: "trenink-regenerace",
      text: "Jak nejjednodušeji zjistíš, kolik tekutin hráč při tréninku vypotí?",
      options: [
        "Podle barvy jeho dresu",
        "Zvážíš ho před tréninkem a po něm",
        "Zeptáš se strejdy na tribuně",
        "Změříš mu výskok",
      ],
      correct: 1,
      explain: "Rozdíl hmotnosti před zátěží a po ní ukáže, kolik tekutin hráč ztratil.",
    },
    {
      id: "trenink-regenerace-4",
      lessonId: "trenink-regenerace",
      text: "Co podle stanoviska z roku 2013 odlišuje syndrom přetrénování?",
      options: [
        "Po dvou dnech volna je hráč vždy zpátky ve formě",
        "Dá se spolehlivě zjistit jedním krevním testem",
        "Výkon klesá i přes odpočinek a zotavení může trvat měsíce",
        "Týká se jen hráčů, kteří vůbec netrénují",
      ],
      correct: 2,
      explain: "Syndrom přetrénování je dlouhodobý pokles výkonu přes odpočinek; jednoduchý test na něj neexistuje a diagnóza se dělá vyloučením jiných příčin.",
    },

    // Přihrávka a zpracování míče
    {
      id: "trenink-prihravka-1",
      lessonId: "trenink-prihravka",
      text: "Proč je přihrávka vnitřní stranou nohy nejpřesnější na krátkou vzdálenost?",
      options: [
        "Protože se při ní kope špičkou",
        "Protože se míč trefuje velkou rovnou plochou nohy",
        "Protože míč vždy letí vysoko nad hlavami soupeřů",
        "Protože ji rozhodčí nesmí odpískat",
      ],
      correct: 1,
      explain: "Vnitřní strana nohy nabízí velkou rovnou plochu, a proto je placírka nejpřesnější. Viz lekce: Přihrávka a zpracování míče.",
    },
    {
      id: "trenink-prihravka-2",
      lessonId: "trenink-prihravka",
      text: "Kam má při placírce mířit špička stojné nohy?",
      options: [
        "Vždy k postranní čáře",
        "Dozadu k vlastní brance",
        "Na tribunu ke strejdovi",
        "Směrem, kam přihráváš",
      ],
      correct: 3,
      explain: "Stojná noha stojí vedle míče a špičkou míří tam, kam má míč letět.",
    },
    {
      id: "trenink-prihravka-3",
      lessonId: "trenink-prihravka",
      text: "Co dělá dobrý první dotek při zpracování míče?",
      options: [
        "Posune míč do volného prostoru, pryč od soupeře",
        "Zastaví míč na místě jako kámen, i když je soupeř těsně u tebe",
        "Odrazí míč co nejdál od těla",
        "Vždy vrátí míč tomu, kdo přihrál",
      ],
      correct: 0,
      explain: "Dobrý první dotek dá hráči čas: posune míč od soupeře tam, kam chce hrát dál.",
    },
    {
      id: "trenink-prihravka-4",
      lessonId: "trenink-prihravka",
      text: "Kdy se má hráč rozhlédnout, kde je soupeř a volný spoluhráč?",
      options: [
        "Až když má míč u nohy",
        "Až o poločasové přestávce",
        "Ještě předtím, než k němu míč přijde",
        "Vůbec, dívat se má jen na míč",
      ],
      correct: 2,
      explain: "Krátký pohled přes rameno před převzetím řekne, kam hrát. S míčem u nohy už je pozdě.",
    },

    // Periodizace
    {
      id: "trenink-periodizace-1",
      lessonId: "trenink-periodizace",
      text: "Jak dlouhý bývá mikrocyklus a čemu ve fotbale typicky odpovídá?",
      options: [
        "Celé sezóně od léta do léta",
        "Jedné minutě nastavení",
        "Nejčastěji týdnu, typicky od zápasu k zápasu",
        "Čtyřem rokům mezi mistrovstvími světa",
      ],
      correct: 2,
      explain: "Mikrocyklus je malý cyklus v řádu dnů, nejčastěji týden. Viz lekce: Periodizace: makro, mezo, mikro.",
    },
    {
      id: "trenink-periodizace-2",
      lessonId: "trenink-periodizace",
      text: "Které období makrocyklu je nejkratší a slouží k aktivnímu odpočinku?",
      options: [
        "Přechodné",
        "Přípravné",
        "Soutěžní",
        "Přestupní",
      ],
      correct: 0,
      explain: "Přechodné období je nejkratší a je určené k aktivnímu odpočinku a doléčení.",
    },
    {
      id: "trenink-periodizace-3",
      lessonId: "trenink-periodizace",
      text: "Jak se v klasickém modelu liší přípravné období od soutěžního?",
      options: [
        "Přípravné je intenzivnější a s menším objemem, soutěžní má největší objem",
        "Nijak, obě období vypadají stejně",
        "V přípravném období se netrénuje vůbec",
        "Přípravné má větší objem a všeobecnější cvičení, soutěžní je intenzivnější s menším objemem",
      ],
      correct: 3,
      explain: "V přípravném období převažuje objem a všeobecná příprava, v soutěžním intenzita a specializace.",
    },
    {
      id: "trenink-periodizace-4",
      lessonId: "trenink-periodizace",
      text: "Co podle analýzy Bosqueta a kolegů (2007) nejlépe funguje při vyladění před důležitým výkonem?",
      options: [
        "Zvýšit objem tréninku na dvojnásobek",
        "Snížit objem zhruba o 41–60 % a intenzitu ponechat",
        "Snížit intenzitu na minimum a objem ponechat",
        "Dva týdny vůbec netrénovat",
      ],
      correct: 1,
      explain: "Nejlépe vycházelo asi dvoutýdenní vyladění se sníženým objemem při zachované intenzitě i počtu tréninků.",
    },

    // Objem, intenzita a intervalový trénink
    {
      id: "trenink-objem-intenzita-1",
      lessonId: "trenink-objem-intenzita",
      text: "Jak se podle metody Carla Fostera spočítá zátěž jednoho tréninku?",
      options: [
        "Počet gólů krát počet hráčů na tréninku",
        "Tepová frekvence vydělená věkem hráče",
        "Počet vypitých piv po tréninku",
        "Hodnocení náročnosti na stupnici 0 až 10 krát délka tréninku v minutách",
      ],
      correct: 3,
      explain: "Hráč ohodnotí náročnost 0 až 10 a číslo se násobí minutami, třeba 5 × 90 = 450. Viz lekce: Objem, intenzita a intervalový trénink.",
    },
    {
      id: "trenink-objem-intenzita-2",
      lessonId: "trenink-objem-intenzita",
      text: "Jak vypadal norský intervalový protokol Helgeruda a kolegů (2001)?",
      options: [
        "10× 100 metrů naplno úplně bez pauzy",
        "4× 4 minuty na 90–95 % maximální tepové frekvence, mezi nimi 3 minuty klusu",
        "Hodina klusu na polovinu maximální tepové frekvence",
        "4× 4 minuty chůze s míčem v rukou",
      ],
      correct: 1,
      explain: "Protokol 4× 4 minuty s tříminutovým klusem dvakrát týdně zlepšil aerobní kapacitu i výkon v zápase.",
    },
    {
      id: "trenink-objem-intenzita-3",
      lessonId: "trenink-objem-intenzita",
      text: "Jak se podle přehledu Hill-Haas a kolegů (2011) zvýší intenzita hry na malém prostoru?",
      options: [
        "Přidáním hráčů na menší plochu",
        "Tím, že trenér celou dobu mlčí",
        "Ubráním hráčů a zvětšením plochy připadající na jednoho hráče",
        "Zákazem střelby na branku",
      ],
      correct: 2,
      explain: "Méně hráčů a víc prostoru na hráče zvyšuje intenzitu, pomáhá i soustavné povzbuzování trenérem.",
    },
    {
      id: "trenink-objem-intenzita-4",
      lessonId: "trenink-objem-intenzita",
      text: "Jaký vztah mezi objemem a intenzitou obvykle platí?",
      options: [
        "Čím vyšší intenzita, tím menší objem hráč vydrží",
        "Čím vyšší intenzita, tím delší trénink hráč vydrží",
        "Objem a intenzita spolu vůbec nesouvisí",
        "Intenzita se měří jen v kilometrech",
      ],
      correct: 0,
      explain: "Hodinu v klusu hráč zvládne, hodinu sprintů ne: vyšší intenzita znamená menší objem.",
    },

    // Prevence zranění: FIFA 11+
    {
      id: "trenink-prevence-1",
      lessonId: "trenink-prevence",
      text: "Z kolika částí a kolika cviků se skládá program FIFA 11+?",
      options: [
        "Ze tří částí a 15 cviků",
        "Z jedenácti částí a 11 cviků",
        "Ze dvou částí a 30 cviků",
        "Z jediného cviku opakovaného jedenáctkrát",
      ],
      correct: 0,
      explain: "FIFA 11+ má tři části s 15 cviky a trvá asi 20 minut. Viz lekce: Prevence zranění: FIFA 11+.",
    },
    {
      id: "trenink-prevence-2",
      lessonId: "trenink-prevence",
      text: "Jak často se má FIFA 11+ podle příručky dělat?",
      options: [
        "Jednou za měsíc stačí",
        "Jen po zápase v kabině",
        "Před každým tréninkem, aspoň dvakrát týdně, a před zápasem části 1 a 3",
        "Jen v zimní přípravě",
      ],
      correct: 2,
      explain: "Program nahrazuje rozcvičku před každým tréninkem (aspoň dvakrát týdně), před zápasem se dělají běžecké části 1 a 3.",
    },
    {
      id: "trenink-prevence-3",
      lessonId: "trenink-prevence",
      text: "Na co je ve FIFA 11+ kladen hlavní důraz při provedení cviků?",
      options: [
        "Na co nejrychlejší provedení bez ohledu na techniku",
        "Na správnou techniku: koleno nad špičkou, nesmí uhýbat dovnitř, měkké dopady",
        "Na to, aby koleno při dřepu uhýbalo dovnitř",
        "Jen na počet opakování, technika nehraje roli",
      ],
      correct: 1,
      explain: "Klíčem programu je správná technika: noha v jedné linii, koleno nad špičkou a měkké dopady.",
    },
    {
      id: "trenink-prevence-4",
      lessonId: "trenink-prevence",
      text: "Co zjistila analýza van Dyka a kolegů (2019) o severském hamstringu?",
      options: [
        "Cvik počet zranění zvyšuje",
        "Cvik nemá na zranění žádný vliv",
        "Cvik pomáhá jen proti vyvrtnutému kotníku",
        "Programy s tímto cvikem snižují zranění zadních stehenních svalů zhruba na polovinu",
      ],
      correct: 3,
      explain: "Zařazení severského hamstringu do prevence zhruba půlí počet zranění zadní strany stehna.",
    },
  ],
};
