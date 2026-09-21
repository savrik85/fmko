/**
 * Licenční skripta (kategorie `obecne`): Licence C, UEFA B, UEFA A a UEFA Pro.
 *
 * Fakta ověřena (září 2026) u zdrojů:
 * - Pravidla fotbalu IFAB, aktuální vydání: theifab.com/laws/latest (pravidla 1, 2, 3, 4, 7, 8, 9, 10,
 *   11, 12, 15, 16, 17 a zásady „Only the captain“),
 * - FAČR: fotbal.cz (změny pravidel 2025/26, struktura trenérských licencí, historie svazu),
 * - UEFA: uefa.com (historie, trenérské licence), UEFA Coaching Convention 2020,
 *   UEFA Club Licensing and Financial Sustainability Regulations 2025 (čl. 47, hlavní trenér),
 * - FIFA: inside.fifa.com (založení 1904), IFAB: theifab.com/background a /organisation,
 * - první pomoc: nzip.cz (155 / 112), Resuscitation Council UK 2025 (KPR), NHS (PRICE),
 *   The FA Concussion Guidelines (otřes mozku),
 * - zatížení: Foster a kol. 2001 (sRPE), Impellizzeri (vnější a vnitřní zatížení),
 *   PMC7739655 (10–13 km za zápas), Tuckman 1965 a 1977, Yerkes a Dodson 1908.
 */
import type { CategoryContent } from "./types";

export const OBECNE: CategoryContent = {
  lessons: [
    // ─── Licence C: základy pravidel ─────────────────────────────────────────
    {
      id: "obecne-c-hriste",
      category: "obecne",
      difficulty: 1,
      licence: 1,
      title: "Hrací plocha a branky",
      body: `Licenční kurz v sokolovně začíná vždycky stejně: lektor z kraje vytáhne pásmo a prohlásí, že kdo nezná hřiště, nemá co dělat na lavičce. Pravidla fotbalu vydává mezinárodní rada **IFAB** a hrací ploše se věnuje **pravidlo 1**.

Hrací plocha musí být obdélníková. Dvě delší čáry jsou **postranní**, dvě kratší **brankové**. Hřiště dělí na poloviny **střední čára**, uprostřed je středová značka a kolem ní **středový kruh** o poloměru 9,15 m. Všechny čáry mají stejnou šířku, nejvýše 12 cm, a **patří k území, které ohraničují**. Míč ležící na čáře je tedy pořád na hrací ploše.

- **Délka** (postranní čára): 90–120 m, v mezinárodních utkáních 100–110 m.
- **Šířka** (branková čára): 45–90 m, v mezinárodních utkáních 64–75 m.
- **Brankové území**: čáry 5,5 m od vnitřní strany každé tyče, vedené 5,5 m do pole.
- **Pokutové území**: čáry 16,5 m od vnitřní strany tyčí, vedené 16,5 m do pole.
- **Pokutová značka**: 11 m od středu mezi tyčemi. Za pokutovým územím je oblouk o poloměru 9,15 m od značky.
- **Rohové území**: čtvrtkruh o poloměru 1 m od rohového praporku. Praporek je vysoký nejméně 1,5 m a nesmí mít ostrou špičku.

**Branka** má vnitřní vzdálenost tyčí 7,32 m a spodní hrana břevna je 2,44 m nad zemí. Tyče a břevno musí být bílé. Pravidlo navíc výslovně říká, že branky **včetně přenosných** musí být pevně zajištěné k zemi. Převržená branka umí ošklivě zranit.

Povrch je buď celý přírodní, nebo, pokud to dovolí pravidla soutěže, celý umělý. Umělý povrch musí být zelený, takže modrý koberec z hospody neprojde.`,
    },
    {
      id: "obecne-c-hraci",
      category: "obecne",
      difficulty: 1,
      licence: 1,
      title: "Míč, hráči a výstroj",
      body: `Druhý večer přinesl lektor síťovku s míči a krabici chráničů. Na řadu přišla **pravidla 2, 3 a 4**.

**Míč** musí být kulový, s obvodem 68–70 cm, na začátku utkání vážit **410–450 g** a mít tlak 0,6–1,1 atmosféry. Když se míč během hry poškodí, hra se přeruší a naváže **míčem rozhodčího**. Praskne-li při provádění výkopu, kopu od branky, rohového, volného nebo pokutového kopu či vhazování, provedení se opakuje.

Utkání hrají dvě družstva, každé nejvýše s **jedenácti hráči**, z nichž jeden je brankář. Utkání nesmí začít ani pokračovat, má-li některé družstvo **méně než sedm hráčů**. Kolik hráčů smí družstvo vystřídat, určují pravidla soutěže, postup je ale všude stejný. Náhradník vstupuje:

- jen při přerušení hry,
- **u střední čáry**,
- až když vystřídaný hráč opustil hrací plochu,
- po signálu rozhodčího.

Vystřídaný hráč už do hry nezasáhne. Výjimkou je **opakované střídání**, které pravidla dovolují jen v mládeži, u veteránů, ve fotbale hráčů s postižením a v rekreačním fotbale, a to se souhlasem národního svazu. Místo s brankářem si může vyměnit kterýkoli hráč, pokud o tom rozhodčí ví předem a výměna proběhne při přerušení hry.

Povinná **výstroj** je dres s rukávy, trenýrky, stulpny, **chrániče holení** a obuv. Chrániče musí být zakryté stulpnami a za jejich velikost a vhodnost odpovídá sám hráč. Brankář nosí barvy, které se liší od ostatních hráčů i rozhodčích. **Šperky** jsou zakázané včetně gumiček a koženého náramku a přelepit je páskou nestačí. Snubní prsten tedy jde do tašky, i když to doma nebudou rádi.

Ztratí-li hráč nešťastnou náhodou kopačku, musí ji nahradit co nejdřív, nejpozději když míč příště opustí hru. Dá-li mezitím gól, branka platí.`,
    },
    {
      id: "obecne-c-vykop",
      category: "obecne",
      difficulty: 1,
      licence: 1,
      title: "Doba hry, výkop a míč rozhodčího",
      body: `Třetí večer se v sokolovně řešil čas a začátky. **Pravidlo 7** říká, že utkání má **dva stejně dlouhé poločasy po 45 minutách**. Zkrátit je lze jen tehdy, když se na tom rozhodčí a obě družstva dohodnou před utkáním a dovolují to pravidla soutěže. Hráči mají nárok na **přestávku** mezi poločasy, která nesmí přesáhnout **15 minut**.

Rozhodčí **nastavuje** čas ztracený mimo jiné:

- střídáním,
- ošetřováním a odnášením zraněných hráčů,
- zdržováním hry,
- udělováním osobních trestů,
- přestávkami na pití nebo ochlazení,
- oslavami branek.

Má-li se kopat nebo opakovat **pokutový kop**, poločas se prodlužuje, dokud kop není dokončen.

**Pravidlo 8** popisuje zahájení a navázání hry. Rozhodčí hodí mincí a družstvo, které los vyhraje, si vybere buď branku, na kterou bude v prvním poločase útočit, nebo výkop. Druhý poločas zahajuje výkopem družstvo, které si v prvním poločase vybíralo stranu, a strany se vymění. Po vstřelené brance provádí výkop soupeř družstva, které skórovalo.

Při **výkopu** jsou všichni hráči kromě rozehrávajícího na své polovině, soupeři nejméně **9,15 m** od míče a míč stojí na středové značce. Ve hře je, jakmile je kopnut a zřetelně se pohne. Z výkopu lze dát gól soupeři přímo. Skončí-li míč přímo ve vlastní brance rozehrávajícího, nařizuje se **rohový kop** pro soupeře.

**Míč rozhodčího** se použije například po přerušení kvůli zranění. Byl-li míč v pokutovém území, dostane ho **brankář bránícího družstva**. Mimo pokutové území ho rozhodčí spustí družstvu, které míč mělo nebo by ho zjevně získalo, a když to nejde určit, tomu, kdo se ho dotkl naposledy. Ostatní hráči musí být nejméně 4 m daleko a míč je ve hře, jakmile se dotkne země.`,
    },
    {
      id: "obecne-c-standardky",
      category: "obecne",
      difficulty: 1,
      licence: 1,
      title: "Míč mimo hru a standardní situace",
      body: `Poslední večer základní části patřil situacím, kdy míč opustí hru. Podle **pravidla 9** je míč mimo hru, když **celým objemem** přejde brankovou nebo postranní čáru po zemi či vzduchem, nebo když hru přeruší rozhodčí. Odrazí-li se od tyče, břevna nebo rohového praporku a zůstane na hrací ploše, hraje se dál.

**Branky** je dosaženo, když celý míč přejde brankovou čáru mezi tyčemi a pod břevnem a družstvo, které skórovalo, se předtím nedopustilo přestupku. Hodí-li brankář míč rukou přímo do soupeřovy branky, nařizuje se kop od branky.

**Vhazování** provádí soupeř hráče, který se míče dotkl naposledy. Vhazující stojí čelem k hrací ploše, částí každé nohy na postranní čáře nebo za ní a hází oběma rukama zpoza hlavy a přes hlavu z místa, kde míč opustil hrací plochu. Soupeři musí být nejméně **2 m** daleko. Z vhazování nelze dát gól přímo: míč v soupeřově brance znamená kop od branky, ve vlastní rohový kop.

**Kop od branky** následuje, když míč přejde brankovou čáru, naposledy se ho dotkl hráč útočícího družstva a branka nepadla. Kope se z libovolného místa v brankovém území a soupeři musí zůstat mimo pokutové území, dokud míč není ve hře.

**Rohový kop** se nařizuje, když se míče naposledy dotkl hráč bránícího družstva a branka nepadla. Míč leží v rohovém území, praporek se nesmí posouvat a soupeři musí být nejméně 9,15 m od čtvrtkruhu rohového území. Míč je ve hře, jakmile je kopnut a zřetelně se pohne, rohové území opouštět nemusí. Roh dostane soupeř i tehdy, když brankář drží míč rukama ve svém pokutovém území **déle než osm sekund**.

Z kopu od branky, z vhazování ani z rohového kopu se hráč, který míč přímo převezme, **nemůže dopustit ofsajdu**. Na to se na okrese rádo zapomíná, hlavně u lajny.`,
    },

    // ─── UEFA B: vedení týmu a tréninku ─────────────────────────────────────
    {
      id: "obecne-b-bezpecnost",
      category: "obecne",
      difficulty: 2,
      licence: 2,
      title: "Bezpečný trénink",
      body: `Lektor kurzu UEFA B rád opakuje, že nejlepší trénink je ten, ze kterého všichni odejdou po svých. Už osnova diplomu UEFA C, nejnižšího stupně UEFA, klade důraz na **ochranu dětí**, **základy první pomoci** a zdravý životní styl. Na béčku se čeká, že bezpečnost má trenér v krvi.

**Před tréninkem** trenér projde hřiště. Díry po krtcích, kameny nebo střepy po sobotní zábavě se řeší dřív, než na ně někdo šlápne. Pravidlo 1 výslovně požaduje, aby branky **včetně přenosných byly pevně zajištěné k zemi**. Na tréninku to platí dvojnásob, protože se na branky věší děti i dospělí a převržená branka dokáže vážně zranit.

**Výstroj**: chrániče holení patří i na trénink a šperky dolů, stejně jako v zápase podle pravidla 4. Páska přes prsten nestačí.

**Připravenost na nehodu**:

- lékárnička a voda jsou na hřišti, ne zamčené v kabině,
- trenér ví, kde je nejbližší **defibrilátor (AED)**,
- zná **přesnou adresu a příjezd** k hřišti, aby je dokázal popsat záchrance,
- má u sebe nabitý telefon a kontakty na rodiče mládežníků.

**Organizace**: každé cvičení má jasně vymezený prostor a dostatečné rozestupy, střílí se tak, aby míče nelétaly do jiné skupiny, a na začátku je rozcvičení. Děti nikdy nezůstávají bez dozoru, ani když trenér odběhne pro kužely.

**Počasí**: při bouřce se trénink přerušuje a všichni jdou do pevné budovy nebo do auta, nikdy pod osamělý strom. V horku trenér zařadí víc přestávek na pití a zkrátí nejnáročnější části.

Bezpečnost není papírování. Je to důvod, proč rodiče příští týden přivedou děti znovu.`,
    },
    {
      id: "obecne-b-prvni-pomoc",
      category: "obecne",
      difficulty: 2,
      licence: 2,
      title: "První pomoc na hřišti",
      body: `Na okresním hřišti málokdy sedí lékař. První, kdo k ležícímu hráči doběhne, bývá trenér. Nejdřív se přesvědčí, že nebezpečí nehrozí jemu samotnému.

**Tísňové volání**: zdravotnickou záchrannou službu přivoláte na čísle **155**, hovor jde přímo na její operační středisko. Číslo **112** je jednotné evropské číslo tísňového volání, u nás ho obsluhují hasiči, a když potřebujete jen záchranku, hovor se přepojuje a ztrácí se čas.

**Bezvědomí a nedýchá normálně**: volejte záchranku a začněte **stlačovat hrudník** uprostřed, na dolní polovině hrudní kosti, do hloubky 5–6 cm, rychlostí **100–120 stlačení za minutu**. Kdo je vyškolený, střídá 30 stlačení a 2 vdechy, ostatní stlačují bez přerušení. **Defibrilátor (AED)** použijte, jakmile je k dispozici, a řiďte se jeho pokyny. Použít ho může **kdokoli**.

**Podvrtnutý kotník nebo natažený sval**: britská zdravotní služba NHS doporučuje na první dva tři dny postup **PRICE**:

- Protection: chránit poraněné místo, třeba ortézou,
- Rest: klid, nezatěžovat,
- Ice: led zabalený v utěrce **až 20 minut** každé 2–3 hodiny,
- Compression: obvaz,
- Elevation: končetinu držet výš.

V prvních dnech se vyhněte teplu, alkoholu a masáži. Ani pivo po zápase tedy není lék.

**Podezření na otřes mozku**: hráč jde okamžitě ze hry a **ten den už nehraje ani netrénuje**. Anglický svaz to shrnuje heslem „když si nejsi jistý, stáhni ho“. Prvních 24 hodin nemá zůstat sám, pít alkohol ani řídit. Ke hře se vrací postupně a po posouzení lékařem. Bezvědomí, zhoršující se stav, opakované zvracení nebo sílící bolest hlavy znamenají okamžitě volat záchranku.`,
    },
    {
      id: "obecne-b-komunikace",
      category: "obecne",
      difficulty: 2,
      licence: 2,
      title: "Komunikace, zpětná vazba a kapitán",
      body: `Trenér může mít v hlavě nejlepší plán v kraji, ale když ho hráči nepochopí, je k ničemu.

**Pokyny** mají být krátké a jasné, s jednou hlavní myšlenkou. Nejlépe funguje ukázka spojená s pár slovy. Hráči při výkladu stojí zády ke slunci a k rušení, trenér vidí všechny a oni vidí jeho. Dlouhá přednáška na mokrém trávníku končí tím, že půlka kabiny myslí na klobásu.

**Zpětná vazba** je užitečná, když je:

- **konkrétní** („při převzetí se otoč čelem k bráně“), ne obecná („hraj líp“),
- včasná, dokud si hráč situaci pamatuje,
- zaměřená na výkon a chování, ne na osobu.

Oblíbená je **sendvičová metoda**: nejdřív co se povedlo, pak jedna věc ke zlepšení a nakonec povzbuzení. Otázka „Co jsi viděl, když jsi dostal míč?“ nutí hráče přemýšlet víc než hotová odpověď. Tvrdou kritiku jednotlivce trenér řeší **v soukromí**, ne před celou kabinou.

**Kapitán** je pro trenéra most do kabiny. Pravidlo 3 říká, že každé družstvo musí mít na hrací ploše kapitána označeného **páskou**. Kapitán nemá podle pravidel **žádné zvláštní postavení ani výsady**, ale nese určitou **odpovědnost za chování družstva**. Soutěže mohou zavést zásadu, že za rozhodčím smí přijít jen jeden hráč z družstva, obvykle kapitán, a hráče, kteří k rozhodčímu přijdou bez oprávnění, může rozhodčí napomenout žlutou kartou. Pro soutěže začínající **1. července 2027** a později má být tato zásada povinná všude.

Kapitána proto trenér nevybírá jen podle toho, kdo nejvíc střílí, ale podle toho, koho kabina poslouchá a kdo zvládne mluvit s rozhodčím v klidu.`,
    },
    {
      id: "obecne-b-tyden",
      category: "obecne",
      difficulty: 2,
      licence: 2,
      title: "Plánování týdne mezi zápasy",
      body: `Na okrese se většinou trénuje dvakrát týdně a hraje o víkendu. I tak se vyplatí mít týden promyšlený.

Týdenní tréninkový cyklus se nazývá **mikrocyklus**. Dny se často značí podle vzdálenosti od zápasu: **MD** je den zápasu (z anglického match day), **MD+1** den po něm a **MD-1** den před ním. Plán stojí na jednoduché myšlence: zatížení a zotavení musí jít ruku v ruce.

Při **superkompenzaci** se organismus po zátěži a dostatečném odpočinku dostane nad svou původní úroveň. Když další velká zátěž přijde příliš brzy, únava se sčítá a výkon klesá.

Běžná skladba týdne:

- **Po zápase** (MD+1, MD+2): regenerace, lehký pohyb, rozbor zápasu, hráčům, kteří nehráli, se zátěž doplní.
- **Uprostřed týdne**: **nejnáročnější trénink**, nejvíc objemu a intenzity, nácvik herního plánu.
- **Před zápasem** (MD-1): krátký a svižný trénink, rychlost, standardní situace, malý objem, aby hráči přišli čerství.

Při dvou trénincích týdně tak bývá úterý náročnější a čtvrtek kratší a rychlejší. Kdo trénuje v pátek a v sobotu hraje, nesmí hráče v pátek uhnat.

**Anglický týden**, tedy týden se zápasem i uprostřed týdne, znamená **méně tréninkového objemu a víc regenerace**. Nejlepší trénink je tehdy často ten nejkratší.

Plán má trenér napsaný, ale není to zákon. Když půlka týmu přijde po nočních směnách nebo po posvícení, upraví se zátěž, ne realita.`,
    },

    // ─── UEFA A: analýza a výkon ────────────────────────────────────────────
    {
      id: "obecne-a-analyza",
      category: "obecne",
      difficulty: 3,
      licence: 3,
      title: "Analýza zápasu a video",
      body: `Na kurzu UEFA A se z kamery v mobilu stává pracovní nástroj. **Analýza** má pomoci rozhodnout, co trénovat, ne vyrobit hodinový film.

Práce se točí v kruhu: **záznam** zápasu a poznámky, **rozbor**, **zpětná vazba** hráčům, **trénink** zaměřený na zjištěné problémy a další zápas, který ukáže, jestli to pomohlo. Před zápasem se rozebírá hlavně **soupeř**: rozestavení, standardky, silné a slabé stránky. Po zápase hlavně vlastní výkon.

**Kamera** patří co nejvýš a zhruba do úrovně střední čáry, třeba na lešení nebo střechu kabin. Záběr má být **široký**, aby byla vidět vzdálenost mezi řadami a pohyb celého týmu, ne jen míč. Detail na míč ukáže akci, ale neukáže, proč se stala.

Pro rozbor s hráči platí:

- málo témat, **dvě tři klíčová sdělení**, ne dvacet,
- krátké klipy, dobré i špatné momenty,
- individuální klipy promítnout hráči osobně, ne před všemi,
- vždy říct, co s tím uděláme v tréninku.

**Čísla** bez souvislostí klamou. Vysoké držení míče neznamená převahu, pokud z něj nevznikají šance. Proto si trenér volí **klíčové ukazatele** (KPI), které vycházejí z jeho **herního plánu**, třeba počet zisků míče na útočné polovině, když chce hrát vysoký presink.

Oblíbeným ukazatelem jsou **očekávané góly (xG)**. Každé střele přiřazují pravděpodobnost gólu podle toho, jak často končily gólem podobné střely v minulosti, tedy podle vzdálenosti, úhlu nebo typu zakončení. Součet xG říká, jak kvalitní šance tým měl, ne kolik jich proměnil. I na okrese se dá sledovat aspoň kvalita šancí: střela z malého vápna, nebo pokus přes půl hřiště?`,
    },
    {
      id: "obecne-a-faze",
      category: "obecne",
      difficulty: 3,
      licence: 3,
      title: "Herní fáze",
      body: `Trenérská metodika obvykle dělí fotbal na **čtyři herní fáze** a k nim přidává **standardní situace**. Každá fáze potřebuje vlastní pravidla chování, kterým se říká **herní principy**.

- **Útočná fáze**: míč máme my. Cílem je rozehrát, postoupit do útočné třetiny a zakončit. Tým potřebuje **šířku**, kdy hráči u postranních čar roztahují obranu soupeře, a **hloubku**, kdy se hráči nabízejí za obranou i pod míčem.
- **Obranná fáze**: míč má soupeř. Cílem je bránit prostor před brankou a získat míč. Klíčová je **kompaktnost**: malé vzdálenosti mezi hráči i mezi řadami, aby soupeř neměl kudy přihrát. Tým si volí, kde bránit: vysoký presink, střední blok nebo nízký blok před vlastním vápnem.
- **Přechod z obrany do útoku**: okamžik **po zisku míče**. Soupeř je rozhozený, a proto rozhodují první vteřiny. Buď rychle dopředu do protiútoku, nebo míč nejdřív zajistit, když cesta není volná.
- **Přechod z útoku do obrany**: okamžik **po ztrátě míče**. Tým buď okamžitě napadá míč v **protipresinku** (známém i jako gegenpressing), nebo se rychle vrací za míč a zavírá střed.

**Standardní situace**, tedy rohy, volné kopy, vhazování a pokutové kopy, se dají dopředu nacvičit do posledního detailu, a proto se jim vyplatí věnovat čas.

Pro trenéra je fázové myšlení praktické hlavně v rozboru. Místo „hráli jsme špatně“ řekne „po ztrátě míče jsme se nevraceli“ a hned ví, co trénovat. V tréninku pak skládá cvičení tak, aby se fáze střídaly, protože v zápase se také mění každých pár vteřin.

Na okrese to platí stejně. Jen se přechod z útoku do obrany někdy protáhne, protože stoper ještě dopíjí.`,
    },
    {
      id: "obecne-a-zatizeni",
      category: "obecne",
      difficulty: 3,
      licence: 3,
      title: "Fyziologie a měření zatížení",
      body: `Na kurzu UEFA A přichází na řadu biologie, bez výmluv, že na okrese se hraje srdcem.

Svaly čerpají energii ze tří **energetických systémů**:

- **Fosfagenový systém (ATP-CP)** kryje nejprudší krátké úsilí v řádu několika sekund: sprint, výskok, výbušný start.
- **Anaerobní glykolýza** pokrývá intenzivní úsilí trvající desítky sekund. Vzniká při ní laktát.
- **Aerobní (oxidativní) systém** využívá kyslík, sacharidy a tuky a nese dlouhodobou práci nižší intenzity.

Všechny tři běží současně, mění se jen jejich podíl podle intenzity a délky úsilí. Fotbal je **přerušovaná zátěž**: profesionální hráči naběhají za zápas **10–13 km**, průměrná intenzita se blíží **anaerobnímu prahu** a mezi tím přicházejí krátké intenzivní akce. Potřebují proto dobrý aerobní základ i schopnost opakovat sprinty.

Zatížení má dvě složky:

- **vnější zatížení**: co hráč udělal, třeba uběhnutá vzdálenost, počet sprintů nebo zrychlení z GPS,
- **vnitřní zatížení**: jak na to reagoval organismus, třeba tepová frekvence, laktát nebo subjektivně vnímaná námaha.

Nejlevnější měřidlo je metoda **sRPE** (Foster a kolektiv, 2001). Hráč po tréninku ohodnotí námahu na stupnici 0–10 a číslo se **vynásobí délkou tréninku v minutách**. Hodnocení 6 po devadesátiminutovém tréninku dává 540 jednotek (AU). Stačí na to papír na dveřích kabiny.

Užitečné je sledovat obě složky dohromady. Když hráč zvládne stejný standardní běh s nižší tepovou frekvencí, jeho kondice se zlepšuje. Když na stejnou vnější zátěž reaguje výrazně hůř než obvykle, může být **unavený nebo mu klesá forma** a trenér by měl ubrat.`,
    },
    {
      id: "obecne-a-kabina",
      category: "obecne",
      difficulty: 3,
      licence: 3,
      title: "Kabina a konflikty",
      body: `Kabina je živý organismus. Na okrese se v ní potkává student, zedník, starosta i jeho soused, se kterým se soudí o mez.

Americký psycholog **Bruce Tuckman** v roce **1965** popsal, jak se vyvíjejí malé skupiny. Jeho model se učí dodnes:

- **formování**: lidé se oťukávají, jsou opatrní a zdvořilí,
- **bouření**: střety o role, postavení a pravidla,
- **normování**: skupina si ustálí pravidla a zvyky,
- **výkon**: tým funguje a energie jde do práce.

V roce **1977** přidal Tuckman s Mary Ann Jensenovou pátou fázi, **rozpuštění**, kdy se skupina rozchází. Po zimních příchodech nebo po změně trenéra se tým klidně vrátí do bouření a trenér by se tomu neměl divit.

**Pravidla kabiny** mají být:

- nemnohá a jasná, třeba docházka, omlouvání, dochvilnost a chování k rozhodčím,
- dohodnutá s hráči, nejlépe přes kapitána a lídry,
- **stejná pro všechny**, i pro nejlepšího střelce. Jakmile má hvězda výjimku, pravidla přestávají platit pro všechny.

Kromě kapitána mají v kabině vliv i **neformální lídři**, kteří žádnou funkci nemají, ale ostatní je poslouchají. Trenér je má znát a získat na svou stranu.

**Konflikt** mezi hráči se nezametá pod koberec. Osvědčený postup:

- řešit ho **brzy**, dokud je malý,
- **v soukromí**, ne před celým týmem,
- vyslechnout **obě strany**,
- mluvit o chování, ne o povaze,
- hledat řešení, ne viníka, a po čase ověřit, že dohoda platí.

Hospoda po zápase kabinu stmeluje, ale vážný spor se u třetího piva nevyřeší. Na ten patří klidný rozhovor.`,
    },

    // ─── UEFA Pro: fotbal jako instituce ────────────────────────────────────
    {
      id: "obecne-pro-instituce",
      category: "obecne",
      difficulty: 3,
      licence: 4,
      title: "Kdo řídí fotbal: IFAB, FIFA, UEFA a FAČR",
      body: `Na kurzu UEFA Pro se nemluví jen o hřišti, ale i o tom, kdo fotbal řídí.

**IFAB** (The International Football Association Board) založily v roce **1886** čtyři britské svazy: anglický, skotský, velšský a irský. FIFA se přidala v roce 1913. IFAB je jediný orgán, který smí měnit **Pravidla fotbalu**. Každý britský svaz má jeden hlas, FIFA čtyři hlasy za všechny ostatní svazy světa a ke změně pravidel je potřeba **tříčtvrtinová většina**, tedy nejméně **šest hlasů z osmi**.

**FIFA** vznikla **21. května 1904 v Paříži**, v zadní místnosti domu v ulici Saint-Honoré. Zakladateli bylo sedm zemí: Belgie, Dánsko, Francie, Nizozemsko, Španělsko, Švédsko a Švýcarsko. Prvním předsedou byl Francouz Robert Guérin. Dnes má FIFA přes dvě stě členských svazů a sídlí v Curychu.

**UEFA** byla založena **15. června 1954 v Basileji**. Je jednou ze šesti **konfederací**, které řídí fotbal na kontinentech, vedle AFC (Asie), CAF (Afrika), Concacaf (Severní a Střední Amerika a Karibik), CONMEBOL (Jižní Amerika) a OFC (Oceánie). Brzy spustila Pohár mistrů evropských zemí (1955) a mistrovství Evropy reprezentací (od roku 1958). Od roku 1999 sídlí ve švýcarském **Nyonu**, předtím byla téměř čtyřicet let v Bernu.

Doma nás řídí **FAČR**. Jejím předchůdcem je **Český svaz footballový**, založený v sobotu **19. října 1901** v pražské restauraci U Zlaté váhy. Sešlo se tehdy sedmnáct klubů a kroužků a prvním předsedou se stal medik Karel Freja. Po rozdělení Československa vznikl Českomoravský fotbalový svaz, který se v roce **2011** přeměnil na Fotbalovou asociaci České republiky.

Až bude okresní svaz zase měnit rozpis, vzpomeňte si, že i IFAB potřebuje šest hlasů z osmi.`,
    },
    {
      id: "obecne-pro-licence",
      category: "obecne",
      difficulty: 3,
      licence: 4,
      title: "Trenérské licence v Evropě a u nás",
      body: `Licence, kterou právě dokončujete, má pevný řád. Od roku **1998** platí **Konvence UEFA o vzdělávání evropských trenérů** (UEFA Coaching Convention), naposledy aktualizovaná v roce 2020. Stanoví společná minima vzdělávání a licence svazů, které ji podepsaly, se uznávají jako licence UEFA.

Hlavní stupně a minimální rozsah výuky:

- **UEFA C**: 60 hodin, určený trenérům základního (grassroots) fotbalu,
- **UEFA B**: 120 hodin,
- **UEFA A**: 180 hodin,
- **UEFA Pro**: **360 hodin** rozložených nejméně do jedné celé sezony, nejvyšší stupeň určený hlavním trenérům v profesionálním fotbale.

Vedle nich existují specializace, například trenér mládeže, trenér brankářů nebo futsal. Licenční předpisy UEFA pro kluby v evropských pohárech chtějí po hlavním trenérovi platnou licenci **UEFA Pro**, pokud je jeho svaz signatářem konvence i na stupni Pro, jinak stačí UEFA A.

Postup má pravidla. Na B potřebujete platnou licenci C a aspoň šest měsíců praxe, na A platnou B a rok praxe po jejím získání v jedenáctkovém fotbale. Na Pro platnou A a rok praxe jako hlavní trenér elitní mládeže nebo dospělých amatérů, případně jako asistent v profesionálním fotbale.

Licence UEFA platí **tři kalendářní roky**. K prodloužení je potřeba nejméně **15 hodin dalšího vzdělávání** během tří let. Komu licence propadne, ztrácí právo trénovat.

V Česku řídí vzdělávání **Úsek trenérů a vzdělávání FAČR**. Cesta začíná online kurzem **Leader certifikát**, který není licencí, ale je minimem pro řízení utkání na okresní úrovni, když nemůže být přítomen trenér s licencí FAČR C. První skutečnou licencí je **FAČR C**, bez hlavičky UEFA. Následuje **UEFA C**, nejnižší licence uznávaná v členských zemích UEFA, pak UEFA B, UEFA A a UEFA Pro. Motto kurzu Pro zní prostě: Úspěch.

Kurzy FAČR C, UEFA C a UEFA B pořádá FAČR na úrovni krajů a okresů, takže sokolovna s lektorem z kraje není výmysl.`,
    },
    {
      id: "obecne-pro-media",
      category: "obecne",
      difficulty: 3,
      licence: 4,
      title: "Práce s médii",
      body: `Hlavní trenér nemá na starosti jen sestavu. Licenční předpisy UEFA pro kluby hrající evropské poháry řadí mezi povinnosti hlavního trenéra vedle výběru hráčů, taktiky, tréninku a vedení hráčů a realizačního týmu také **mediální povinnosti**: tiskové konference a rozhovory. Na okrese je to spíš regionální deník, obecní zpravodaj a klubový profil na sociálních sítích, ale princip je stejný.

**Příprava**: před rozhovorem si trenér ujasní **dvě tři klíčová sdělení**, která chce říct, ať zápas dopadne jakkoli. Odpovídá na otázku, ale vrací se ke svým sdělením.

**Emoce**: po prohraném derby není dobrý nápad mluvit do mikrofonu hned u postranní čáry. Pár minut v kabině a sklenice vody ušetří týdny vysvětlování.

**Zásady, které se vyplácejí**:

- hráče trenér **hájí navenek a kritizuje uvnitř kabiny**, veřejné zesměšnění hráče rozbíjí důvěru,
- o rozhodčích mluví věcně, útoky na ně se klubu i trenérovi mohou vymstít i disciplinárně,
- neříká nic, co by nechtěl vidět v titulku, protože u věty „mimo záznam“ **nikdy není jisté**, že nevyjde,
- když něco neví, **řekne, že to neví**, a nevymýšlí si,
- nesdílí zdravotní podrobnosti o hráčích bez jejich souhlasu.

**Sociální sítě** jsou veřejný prostor. Co trenér nebo hráč napíše o půlnoci po zápase, čte ráno celá vesnice i soupeřův předseda. Klub by měl mít jasno, kdo za něj mluví a co se zveřejňuje.

Dobrá práce s médii se nepozná podle toho, jak vtipný byl trenér na tiskovce, ale podle toho, že klub pak nemusí nic žehlit. A když přijede redaktor regionálního deníku, nabídněte mu klobásu a sestavu včas. Ocení obojí.`,
    },
    {
      id: "obecne-pro-psychologie",
      category: "obecne",
      difficulty: 3,
      licence: 4,
      title: "Psychologie výkonu",
      body: `Na kurzu UEFA Pro dostane psychologie stejný prostor jako taktika. Rozdíl mezi výkonem na tréninku a v derby je často v hlavě.

**Aktivace a výkon**: psychologie sportu často pracuje s modelem **obráceného U**. Odvozuje se od pokusu Roberta Yerkese a Johna Dodsona z roku **1908**, prováděného na myších. Výkon s rostoucí aktivací, tedy nabuzením, **nejdřív stoupá, po dosažení optima ale klesá**. Hráč bez nabuzení je ospalý, přehecovaný hráč se křečovitě plete a fauluje. Už původní pokus naznačil, že u **složitějších úkolů leží optimum níž**. Tvůrce hry proto potřebuje víc klidu než stoper při odkopávání. Každý hráč má optimum jinde: jednoho je třeba povzbudit, druhého uklidnit.

**Cíle** se dělí na tři druhy:

- **výsledkové**: vyhrát, postoupit, porazit souseda. Závisí i na soupeři, takže je hráč ovládá nejméně,
- **výkonové**: osobní standard, třeba úspěšnost přihrávek nebo podíl vyhraných soubojů,
- **procesní**: jak to udělat, třeba „před převzetím se rozhlédnu“. Hráč je má **nejvíc pod kontrolou**, pomáhají soustředění a snižují úzkost.

Dobrý trenér kombinuje všechny tři, ale před zápasem mluví s hráči hlavně o procesu.

**Rutiny** pomáhají zvládnout tlak: stejná příprava na pokutový kop, stejný rituál v kabině. Mozek dostane známou dráhu a nemá čas panikařit.

**Po chybě** rozhoduje reakce. Trenér učí hráče nechat chybu za sebou a soustředit se na další akci a sám jde příkladem. Kdo na lavičce kope do lahví, nemůže chtít klid od svého brankáře.

Psychologie na okrese neznamená gauč a terapeuta. Znamená vědět, koho před zápasem poplácat po rameni a na koho radši vůbec nemluvit.`,
    },
  ],

  questions: [
    // ─── obecne-c-hriste ────────────────────────────────────────────────────
    {
      id: "obecne-c-hriste-1",
      lessonId: "obecne-c-hriste",
      text: "Jak daleko od středu mezi brankovými tyčemi je pokutová značka?",
      options: ["9,15 m", "11 m", "16,5 m", "5,5 m"],
      correct: 1,
      explain: "Podle pravidla 1 je pokutová značka 11 m od středu mezi tyčemi.",
    },
    {
      id: "obecne-c-hriste-2",
      lessonId: "obecne-c-hriste",
      text: "Jaké jsou rozměry branky (vnitřní vzdálenost tyčí × výška spodní hrany břevna)?",
      options: ["7,32 × 2,44 m", "7,00 × 2,50 m", "7,50 × 2,40 m", "6,40 × 2,20 m"],
      correct: 0,
      explain: "Tyče jsou od sebe na vnitřní straně 7,32 m a spodní hrana břevna je 2,44 m nad zemí.",
    },
    {
      id: "obecne-c-hriste-3",
      lessonId: "obecne-c-hriste",
      text: "Jaká je nejmenší povolená délka hrací plochy v běžném, nemezinárodním utkání?",
      options: ["100 m", "80 m", "110 m", "90 m"],
      correct: 3,
      explain: "Postranní čára měří 90–120 m. Rozmezí 100–110 m platí jen pro mezinárodní utkání.",
    },
    {
      id: "obecne-c-hriste-4",
      lessonId: "obecne-c-hriste",
      text: "Co pravidlo 1 říká o brankách?",
      options: [
        "Přenosné branky se kotvit nemusí, pokud jsou dost těžké",
        "Branky včetně přenosných musí být pevně zajištěné k zemi",
        "Kotvit se musí jen branky na umělé trávě",
        "Zajištění branek pravidla neřeší, je věcí pořadatele",
      ],
      correct: 1,
      explain: "Pravidlo 1 výslovně požaduje, aby všechny branky, i přenosné, byly pevně zajištěné k zemi.",
    },
    {
      id: "obecne-c-hriste-5",
      lessonId: "obecne-c-hriste",
      text: "Míč leží přesně na postranní čáře. Kde je?",
      options: [
        "Mimo hrací plochu",
        "Záleží na tom, jak to vidí asistent rozhodčího",
        "Na hrací ploše, protože čára patří k území, které ohraničuje",
        "Na hrací ploše jen tehdy, když se ještě kutálí",
      ],
      correct: 2,
      explain: "Čáry patří k územím, která ohraničují, takže míč na postranní čáře je stále na hrací ploše.",
    },

    // ─── obecne-c-hraci ─────────────────────────────────────────────────────
    {
      id: "obecne-c-hraci-1",
      lessonId: "obecne-c-hraci",
      text: "Kolik hráčů musí mít družstvo nejméně, aby utkání mohlo začít nebo pokračovat?",
      options: ["Osm", "Šest", "Devět", "Sedm"],
      correct: 3,
      explain: "Utkání nesmí začít ani pokračovat, má-li některé družstvo méně než sedm hráčů.",
    },
    {
      id: "obecne-c-hraci-2",
      lessonId: "obecne-c-hraci",
      text: "Kolik smí vážit míč na začátku utkání?",
      options: ["350–400 g", "450–500 g", "380–420 g", "410–450 g"],
      correct: 3,
      explain: "Pravidlo 2 předepisuje na začátku utkání hmotnost míče 410–450 g.",
    },
    {
      id: "obecne-c-hraci-3",
      lessonId: "obecne-c-hraci",
      text: "Kde vstupuje náhradník na hrací plochu?",
      options: [
        "U střední čáry",
        "Kdekoli u postranní čáry na své polovině",
        "U rohového praporku",
        "Za brankovou čárou vedle branky",
      ],
      correct: 0,
      explain: "Náhradník vstupuje při přerušení hry u střední čáry, až vystřídaný hráč odejde a rozhodčí dá signál.",
    },
    {
      id: "obecne-c-hraci-4",
      lessonId: "obecne-c-hraci",
      text: "Hráč má snubní prsten a chce ho přelepit páskou. Co na to pravidla?",
      options: [
        "Přelepení páskou stačí",
        "Prsten je povolený, zakázané jsou jen řetízky",
        "Šperky jsou zakázané a přelepit je páskou nejde",
        "Rozhodne o tom kapitán soupeře",
      ],
      correct: 2,
      explain: "Pravidlo 4 zakazuje všechny šperky a výslovně nedovoluje zakrýt je páskou.",
    },
    {
      id: "obecne-c-hraci-5",
      lessonId: "obecne-c-hraci",
      text: "Co nepatří do povinné základní výstroje hráče?",
      options: ["Chrániče holení", "Stulpny", "Rukavice", "Dres s rukávy"],
      correct: 2,
      explain: "Povinná výstroj je dres s rukávy, trenýrky, stulpny, chrániče holení a obuv. Rukavice mezi ni nepatří.",
    },

    // ─── obecne-c-vykop ─────────────────────────────────────────────────────
    {
      id: "obecne-c-vykop-1",
      lessonId: "obecne-c-vykop",
      text: "Jak dlouhá smí být nejvýše přestávka mezi poločasy?",
      options: ["10 minut", "15 minut", "20 minut", "Jak se družstva dohodnou"],
      correct: 1,
      explain: "Pravidlo 7 dává hráčům nárok na přestávku, která nesmí přesáhnout 15 minut.",
    },
    {
      id: "obecne-c-vykop-2",
      lessonId: "obecne-c-vykop",
      text: "Míč z výkopu skončí přímo ve vlastní brance rozehrávajícího družstva. Co rozhodčí nařídí?",
      options: ["Branka platí", "Výkop se opakuje", "Rohový kop pro soupeře", "Kop od branky"],
      correct: 2,
      explain: "Z výkopu lze skórovat přímo jen soupeři. Míč přímo ve vlastní brance znamená rohový kop pro soupeře.",
    },
    {
      id: "obecne-c-vykop-3",
      lessonId: "obecne-c-vykop",
      text: "Jak daleko od míče musí být při výkopu hráči soupeře?",
      options: ["Nejméně 9,15 m", "Nejméně 5 m", "Nejméně 11 m", "Nejméně 2 m"],
      correct: 0,
      explain: "Soupeři družstva, které provádí výkop, musí být nejméně 9,15 m od míče.",
    },
    {
      id: "obecne-c-vykop-4",
      lessonId: "obecne-c-vykop",
      text: "Hra byla přerušena kvůli zranění a míč byl v pokutovém území. Komu rozhodčí spustí míč?",
      options: [
        "Útočníkovi, který byl nejblíž",
        "Kapitánovi domácích",
        "Tomu, kdo se míče dotkl naposledy, ať je kdekoli",
        "Brankáři bránícího družstva",
      ],
      correct: 3,
      explain: "Byl-li míč při přerušení v pokutovém území, míč rozhodčího dostane brankář bránícího družstva.",
    },
    {
      id: "obecne-c-vykop-5",
      lessonId: "obecne-c-vykop",
      text: "Co se stane, když má být na konci poločasu kopán pokutový kop?",
      options: [
        "Poločas se prodlouží, dokud kop není dokončen",
        "Poločas skončí a kop propadá",
        "Kop se provede na začátku dalšího poločasu",
        "Rozhodčí přidá přesně jednu minutu",
      ],
      correct: 0,
      explain: "Má-li se kopat nebo opakovat pokutový kop, poločas se prodlužuje až do jeho dokončení.",
    },

    // ─── obecne-c-standardky ────────────────────────────────────────────────
    {
      id: "obecne-c-standardky-1",
      lessonId: "obecne-c-standardky",
      text: "Kdy je míč mimo hru podle pravidla 9?",
      options: [
        "Když se polovinou objemu dostane za čáru",
        "Když celým objemem přejde brankovou nebo postranní čáru",
        "Když se dotkne rohového praporku",
        "Když se dotkne čáry a odskočí zpět",
      ],
      correct: 1,
      explain: "Míč je mimo hru, když celým objemem přejde brankovou nebo postranní čáru po zemi či vzduchem, nebo když hru přeruší rozhodčí.",
    },
    {
      id: "obecne-c-standardky-2",
      lessonId: "obecne-c-standardky",
      text: "Míč se odrazí od břevna a zůstane na hrací ploše. Co následuje?",
      options: ["Míč rozhodčího", "Kop od branky", "Hra pokračuje, míč je stále ve hře", "Rohový kop"],
      correct: 2,
      explain: "Odraz od tyče, břevna nebo rohového praporku nic nemění, pokud míč zůstane na hrací ploše.",
    },
    {
      id: "obecne-c-standardky-3",
      lessonId: "obecne-c-standardky",
      text: "Jak daleko musí stát soupeři od místa vhazování?",
      options: ["Nejméně 2 m", "Nejméně 1 m", "Nejméně 5 m", "Nejméně 9,15 m"],
      correct: 0,
      explain: "Při vhazování musí být všichni soupeři nejméně 2 m od místa na postranní čáře, odkud se vhazuje.",
    },
    {
      id: "obecne-c-standardky-4",
      lessonId: "obecne-c-standardky",
      text: "Brankář drží míč rukama ve svém pokutovém území déle než osm sekund. Co rozhodčí nařídí?",
      options: ["Rohový kop pro soupeře", "Pokutový kop", "Nepřímý volný kop z hranice vápna", "Míč rozhodčího"],
      correct: 0,
      explain: "Za držení míče rukama déle než osm sekund dostane soupeř rohový kop.",
    },
    {
      id: "obecne-c-standardky-5",
      lessonId: "obecne-c-standardky",
      text: "Ze které situace se hráč, který míč přímo převezme, nemůže dopustit ofsajdu?",
      options: ["Z přímého volného kopu", "Z nepřímého volného kopu", "Z přihrávky spoluhráče ve hře", "Z vhazování"],
      correct: 3,
      explain: "Ofsajd nelze porušit, převezme-li hráč míč přímo z kopu od branky, z vhazování nebo z rohového kopu.",
    },

    // ─── obecne-b-bezpecnost ────────────────────────────────────────────────
    {
      id: "obecne-b-bezpecnost-1",
      lessonId: "obecne-b-bezpecnost",
      text: "Co podle pravidla 1 platí pro přenosné branky?",
      options: [
        "Stačí je zatížit taškami",
        "Musí být pevně zajištěné k zemi stejně jako ostatní branky",
        "Kotví se jen při mistrovských utkáních",
        "Pravidla se jich netýkají",
      ],
      correct: 1,
      explain: "Pravidlo 1 požaduje pevné zajištění všech branek včetně přenosných, a na tréninku to platí dvojnásob.",
    },
    {
      id: "obecne-b-bezpecnost-2",
      lessonId: "obecne-b-bezpecnost",
      text: "Na co podle lekce klade důraz už osnova diplomu UEFA C?",
      options: [
        "Na ochranu dětí, základy první pomoci a zdravý životní styl",
        "Na taktiku presinku a analýzu videa",
        "Na práci s médii",
        "Na financování klubu",
      ],
      correct: 0,
      explain: "Už nejnižší diplom UEFA C má v osnově ochranu dětí, základy první pomoci a zdravý životní styl.",
    },
    {
      id: "obecne-b-bezpecnost-3",
      lessonId: "obecne-b-bezpecnost",
      text: "Hráč chce trénovat s prstenem přelepeným páskou. Co udělá trenér?",
      options: [
        "Nechá ho, páska stačí",
        "Nechá ho jen v cvičeních bez soubojů",
        "Požádá ho o podpis reverzu",
        "Pošle ho prsten sundat, páska nestačí",
      ],
      correct: 3,
      explain: "Šperky jdou dolů na tréninku stejně jako v zápase podle pravidla 4 a páska přes prsten nestačí.",
    },
    {
      id: "obecne-b-bezpecnost-4",
      lessonId: "obecne-b-bezpecnost",
      text: "Nad hřištěm začne bouřka. Co je správně?",
      options: [
        "Přesunout trénink pod velký strom u hřiště",
        "Dohrát cvičení a pak odejít",
        "Trénink přerušit a jít do pevné budovy nebo do auta",
        "Pokračovat, dokud neprší",
      ],
      correct: 2,
      explain: "Při bouřce se trénink přerušuje a všichni jdou do pevné budovy nebo do auta, nikdy pod osamělý strom.",
    },
    {
      id: "obecne-b-bezpecnost-5",
      lessonId: "obecne-b-bezpecnost",
      text: "Co má trenér znát pro případ vážné nehody na tréninku?",
      options: [
        "Výsledky soupeře z minulého kola",
        "Přesnou adresu a příjezd k hřišti a kde je nejbližší defibrilátor",
        "Telefon na delegáta svazu",
        "Termín příští valné hromady",
      ],
      correct: 1,
      explain: "Trenér má vědět, kde je nejbližší AED, a umět záchrance popsat adresu a příjezd k hřišti.",
    },

    // ─── obecne-b-prvni-pomoc ───────────────────────────────────────────────
    {
      id: "obecne-b-prvni-pomoc-1",
      lessonId: "obecne-b-prvni-pomoc",
      text: "Na jakém čísle se dovoláte přímo na zdravotnickou záchrannou službu?",
      options: ["150", "158", "155", "156"],
      correct: 2,
      explain: "Linka 155 vede přímo na operační středisko záchranky. Číslo 112 je jednotné evropské a hovor se přepojuje.",
    },
    {
      id: "obecne-b-prvni-pomoc-2",
      lessonId: "obecne-b-prvni-pomoc",
      text: "Jakou rychlostí se stlačuje hrudník při resuscitaci dospělého?",
      options: ["60–80 za minutu", "80–100 za minutu", "100–120 za minutu", "140–160 za minutu"],
      correct: 2,
      explain: "Hrudník se stlačuje rychlostí 100–120 stlačení za minutu do hloubky 5–6 cm.",
    },
    {
      id: "obecne-b-prvni-pomoc-3",
      lessonId: "obecne-b-prvni-pomoc",
      text: "Jak podle postupu PRICE přikládat led na podvrtnutý kotník?",
      options: [
        "Zabalený v utěrce, až 20 minut každé 2–3 hodiny",
        "Přímo na kůži celou noc",
        "Led se nepoužívá, patří tam teplý obklad",
        "Jen jednou, hned po zranění, na pět vteřin",
      ],
      correct: 0,
      explain: "NHS doporučuje led zabalený v utěrce až 20 minut každé 2–3 hodiny a v prvních dnech se vyhnout teplu.",
    },
    {
      id: "obecne-b-prvni-pomoc-4",
      lessonId: "obecne-b-prvni-pomoc",
      text: "Hráč po srážce hlavou působí zmateně, ale tvrdí, že je v pořádku. Co udělá trenér?",
      options: [
        "Nechá ho dohrát a bude ho sledovat",
        "Pošle ho zpět po pěti minutách odpočinku",
        "Nechá rozhodnout kapitána",
        "Stáhne ho ze hry a ten den už nehraje ani netrénuje",
      ],
      correct: 3,
      explain: "Při podezření na otřes mozku jde hráč okamžitě ze hry a ten den se k fotbalu nevrací.",
    },
    {
      id: "obecne-b-prvni-pomoc-5",
      lessonId: "obecne-b-prvni-pomoc",
      text: "Kdo smí použít automatizovaný externí defibrilátor (AED)?",
      options: ["Jen lékař", "Kdokoli, stačí se řídit pokyny přístroje", "Jen zdravotník s kurzem", "Jen hasič"],
      correct: 1,
      explain: "AED může použít kdokoli. Přístroj sám dává pokyny, které stačí sledovat.",
    },

    // ─── obecne-b-komunikace ────────────────────────────────────────────────
    {
      id: "obecne-b-komunikace-1",
      lessonId: "obecne-b-komunikace",
      text: "Jaké postavení má kapitán podle pravidla 3?",
      options: [
        "Může měnit rozhodnutí rozhodčího",
        "Jako jediný smí oznamovat střídání",
        "Nemá zvláštní postavení ani výsady, ale nese určitou odpovědnost za chování družstva",
        "Smí za trenéra podat protest během utkání",
      ],
      correct: 2,
      explain: "Kapitán nemá podle pravidel žádné zvláštní postavení ani výsady, ale odpovídá do určité míry za chování družstva.",
    },
    {
      id: "obecne-b-komunikace-2",
      lessonId: "obecne-b-komunikace",
      text: "Od kdy má být zásada, že za rozhodčím chodí jen kapitán, povinná pro všechny soutěže?",
      options: [
        "Pro soutěže začínající 1. července 2027 a později",
        "Povinně platí už od roku 2020",
        "Nikdy, zůstane jen doporučením",
        "Od roku 2030",
      ],
      correct: 0,
      explain: "Soutěže ji mohou zavést už teď a pro soutěže začínající 1. července 2027 a později má být povinná.",
    },
    {
      id: "obecne-b-komunikace-3",
      lessonId: "obecne-b-komunikace",
      text: "Co tvoří sendvičovou metodu zpětné vazby?",
      options: [
        "Tři výtky za sebou",
        "Jen pochvala, kritika demotivuje",
        "Kritika před celým týmem a pochvala v soukromí",
        "Co se povedlo, jedna věc ke zlepšení a povzbuzení",
      ],
      correct: 3,
      explain: "Sendvičová metoda začíná tím, co se povedlo, pokračuje jednou věcí ke zlepšení a končí povzbuzením.",
    },
    {
      id: "obecne-b-komunikace-4",
      lessonId: "obecne-b-komunikace",
      text: "Jak podle lekce řešit tvrdou kritiku jednotlivého hráče?",
      options: [
        "Před celou kabinou, aby se poučili všichni",
        "V soukromí",
        "Přes sociální sítě",
        "Přes kapitána, aby to trenér nemusel říkat sám",
      ],
      correct: 1,
      explain: "Tvrdou kritiku jednotlivce trenér řeší v soukromí, ne před celou kabinou.",
    },
    {
      id: "obecne-b-komunikace-5",
      lessonId: "obecne-b-komunikace",
      text: "Která zpětná vazba je podle lekce konkrétní?",
      options: ["Hraj líp", "Při převzetí se otoč čelem k bráně", "Snaž se víc", "Tohle nebylo ono"],
      correct: 1,
      explain: "Konkrétní zpětná vazba říká, co přesně má hráč udělat, ne jen že má hrát lépe.",
    },

    // ─── obecne-b-tyden ─────────────────────────────────────────────────────
    {
      id: "obecne-b-tyden-1",
      lessonId: "obecne-b-tyden",
      text: "Jak se nazývá týdenní tréninkový cyklus?",
      options: ["Makrocyklus", "Mezocyklus", "Olympijský cyklus", "Mikrocyklus"],
      correct: 3,
      explain: "Týdenní tréninkový cyklus se nazývá mikrocyklus.",
    },
    {
      id: "obecne-b-tyden-2",
      lessonId: "obecne-b-tyden",
      text: "Co znamená označení MD-1?",
      options: ["Den po zápase", "Den před zápasem", "Sestava o jednoho hráče menší", "První den letní přípravy"],
      correct: 1,
      explain: "MD je den zápasu, MD-1 den před ním a MD+1 den po něm.",
    },
    {
      id: "obecne-b-tyden-3",
      lessonId: "obecne-b-tyden",
      text: "Kdy se podle lekce obvykle zařazuje nejnáročnější trénink týdne?",
      options: ["Den před zápasem", "Den po zápase", "Uprostřed týdne", "Ráno v den zápasu"],
      correct: 2,
      explain: "Nejvíc objemu a intenzity patří doprostřed týdne, co nejdál od obou zápasů.",
    },
    {
      id: "obecne-b-tyden-4",
      lessonId: "obecne-b-tyden",
      text: "Co popisuje superkompenzace?",
      options: [
        "Po zátěži a dostatečném odpočinku se organismus dostane nad původní úroveň",
        "Náhradu mzdy za dobu zranění",
        "Doplnění tekutin v poločase",
        "Přidání tréninku navíc před derby",
      ],
      correct: 0,
      explain: "Superkompenzace je růst nad původní úroveň po zátěži a dostatečném zotavení. Bez odpočinku se únava sčítá.",
    },
    {
      id: "obecne-b-tyden-5",
      lessonId: "obecne-b-tyden",
      text: "Co podle lekce znamená anglický týden pro trénink?",
      options: [
        "Víc objemu, aby hráči vydrželi",
        "Trénink vedený v angličtině",
        "Dva tréninky denně",
        "Méně tréninkového objemu a víc regenerace",
      ],
      correct: 3,
      explain: "Při zápase i uprostřed týdne se ubírá objem a přidává regenerace.",
    },

    // ─── obecne-a-analyza ───────────────────────────────────────────────────
    {
      id: "obecne-a-analyza-1",
      lessonId: "obecne-a-analyza",
      text: "Co vyjadřují očekávané góly (xG)?",
      options: [
        "Počet gólů, které tým vstřelí v příštím zápase",
        "Počet střel na branku",
        "Pravděpodobnost, že střela skončí gólem, podle podobných střel z minulosti",
        "Rozdíl skóre na konci sezony",
      ],
      correct: 2,
      explain: "xG přiřazuje každé střele pravděpodobnost gólu podle toho, jak často končily gólem podobné střely.",
    },
    {
      id: "obecne-a-analyza-2",
      lessonId: "obecne-a-analyza",
      text: "Kam podle lekce umístit kameru při natáčení zápasu?",
      options: [
        "Za branku do úrovně trávníku",
        "K rohovému praporku a zabírat jen míč",
        "Do kabiny",
        "Co nejvýš, zhruba do úrovně střední čáry, se širokým záběrem",
      ],
      correct: 3,
      explain: "Vysoko umístěná kamera se širokým záběrem ukáže pohyb celého týmu a vzdálenosti mezi řadami.",
    },
    {
      id: "obecne-a-analyza-3",
      lessonId: "obecne-a-analyza",
      text: "Kolik témat má mít rozbor zápasu s hráči?",
      options: ["Dvě tři klíčová sdělení", "Co nejvíc, aby nic nechybělo", "Přesně deset", "Žádné, stačí pustit celý zápas"],
      correct: 0,
      explain: "Rozbor má mít málo témat, dvě tři klíčová sdělení, a vždy říct, co se s nimi udělá v tréninku.",
    },
    {
      id: "obecne-a-analyza-4",
      lessonId: "obecne-a-analyza",
      text: "Tým měl vysoké držení míče, ale žádné šance. Co z toho plyne?",
      options: [
        "Držení míče samo o sobě neznamená převahu",
        "Tým určitě dominoval",
        "Statistika je chybná",
        "Příště je třeba držet míč ještě déle",
      ],
      correct: 0,
      explain: "Čísla bez souvislostí klamou. Držení míče bez šancí převahu neznamená.",
    },
    {
      id: "obecne-a-analyza-5",
      lessonId: "obecne-a-analyza",
      text: "Podle čeho si trenér volí klíčové ukazatele (KPI)?",
      options: [
        "Podle toho, co ukazuje televize u ligy",
        "Podle svého herního plánu",
        "Podle toho, která čísla vycházejí nejlépe",
        "Náhodně, hlavně aby jich bylo hodně",
      ],
      correct: 1,
      explain: "KPI mají vycházet z herního plánu, třeba zisky míče na útočné polovině u týmu s vysokým presinkem.",
    },

    // ─── obecne-a-faze ──────────────────────────────────────────────────────
    {
      id: "obecne-a-faze-1",
      lessonId: "obecne-a-faze",
      text: "Na kolik herních fází se hra v metodice obvykle dělí, nepočítaje standardní situace?",
      options: ["Dvě", "Tři", "Čtyři", "Šest"],
      correct: 2,
      explain: "Útočná fáze, obranná fáze a dva přechody, k nimž se přidávají standardní situace.",
    },
    {
      id: "obecne-a-faze-2",
      lessonId: "obecne-a-faze",
      text: "Co je přechod z útoku do obrany?",
      options: ["Okamžik po zisku míče", "Okamžik po ztrátě míče", "Rozehrávka od brankáře", "Poločasová přestávka"],
      correct: 1,
      explain: "Přechod z útoku do obrany nastává po ztrátě míče. Tým napadá míč, nebo se vrací za něj.",
    },
    {
      id: "obecne-a-faze-3",
      lessonId: "obecne-a-faze",
      text: "Co znamená protipresink (gegenpressing)?",
      options: [
        "Okamžité napadání míče hned po jeho ztrátě",
        "Stažení celého týmu do vlastního vápna",
        "Dlouhý nákop na hrotového útočníka",
        "Střídání unavených hráčů",
      ],
      correct: 0,
      explain: "Protipresink je okamžitý tlak na míč hned po jeho ztrátě.",
    },
    {
      id: "obecne-a-faze-4",
      lessonId: "obecne-a-faze",
      text: "Co v obranné fázi znamená kompaktnost?",
      options: [
        "Hráči stojí široko u postranních čar",
        "Každý hlídá jednoho soupeře po celém hřišti",
        "Brankář hraje vysoko před vápnem",
        "Malé vzdálenosti mezi hráči i mezi řadami",
      ],
      correct: 3,
      explain: "Kompaktní tým má malé vzdálenosti mezi hráči i řadami, takže soupeř nemá kudy přihrát.",
    },
    {
      id: "obecne-a-faze-5",
      lessonId: "obecne-a-faze",
      text: "K čemu slouží v útočné fázi šířka?",
      options: [
        "Hráči se shromáždí kolem míče",
        "Hráči u postranních čar roztahují obranu soupeře",
        "Tým se stáhne za míč",
        "Brankář vykopává co nejdál",
      ],
      correct: 1,
      explain: "Šířka znamená hráče u postranních čar, kteří roztahují obranu soupeře.",
    },

    // ─── obecne-a-zatizeni ──────────────────────────────────────────────────
    {
      id: "obecne-a-zatizeni-1",
      lessonId: "obecne-a-zatizeni",
      text: "Který energetický systém kryje hlavně krátký maximální sprint trvající několik sekund?",
      options: [
        "Aerobní (oxidativní) systém",
        "Fosfagenový systém (ATP-CP)",
        "Žádný, sprint energii nepotřebuje",
        "Výhradně spalování tuků",
      ],
      correct: 1,
      explain: "Nejprudší krátké úsilí v řádu několika sekund kryje fosfagenový systém ATP-CP.",
    },
    {
      id: "obecne-a-zatizeni-2",
      lessonId: "obecne-a-zatizeni",
      text: "Hráč ohodnotí šedesátiminutový trénink námahou 7. Kolik je zatížení metodou sRPE?",
      options: ["67 AU", "600 AU", "420 AU", "13 AU"],
      correct: 2,
      explain: "sRPE je hodnocení námahy vynásobené délkou tréninku v minutách: 7 × 60 = 420 AU.",
    },
    {
      id: "obecne-a-zatizeni-3",
      lessonId: "obecne-a-zatizeni",
      text: "Co je příkladem vnějšího zatížení?",
      options: [
        "Tepová frekvence",
        "Subjektivně vnímaná námaha",
        "Koncentrace laktátu",
        "Uběhnutá vzdálenost naměřená GPS",
      ],
      correct: 3,
      explain: "Vnější zatížení popisuje, co hráč udělal, třeba vzdálenost nebo sprinty. Tep, laktát a námaha jsou vnitřní zatížení.",
    },
    {
      id: "obecne-a-zatizeni-4",
      lessonId: "obecne-a-zatizeni",
      text: "Kolik kilometrů podle lekce naběhají za zápas profesionální hráči?",
      options: ["3–5 km", "5–7 km", "10–13 km", "20–25 km"],
      correct: 2,
      explain: "Profesionálové naběhají za zápas 10–13 km s průměrnou intenzitou blízko anaerobního prahu.",
    },
    {
      id: "obecne-a-zatizeni-5",
      lessonId: "obecne-a-zatizeni",
      text: "Hráč reaguje na stejnou vnější zátěž výrazně vyšší tepovou frekvencí než obvykle. Co to může znamenat?",
      options: [
        "Že je unavený nebo mu klesá forma",
        "Že se jeho kondice zlepšuje",
        "Že měřič tepu je vždy vadný",
        "Že potřebuje přidat zátěž",
      ],
      correct: 0,
      explain: "Horší vnitřní odezva na stejnou vnější zátěž ukazuje na únavu nebo pokles formy, trenér by měl ubrat.",
    },

    // ─── obecne-a-kabina ────────────────────────────────────────────────────
    {
      id: "obecne-a-kabina-1",
      lessonId: "obecne-a-kabina",
      text: "Co podle Tuckmanova modelu charakterizuje fázi bouření?",
      options: [
        "Opatrné oťukávání a zdvořilost",
        "Střety o role, postavení a pravidla",
        "Ustálená pravidla a zvyky",
        "Rozchod skupiny",
      ],
      correct: 1,
      explain: "Bouření je fáze střetů o role, postavení a pravidla. Tým se do ní může vrátit třeba po příchodu nových hráčů.",
    },
    {
      id: "obecne-a-kabina-2",
      lessonId: "obecne-a-kabina",
      text: "Kterou fázi doplnil Tuckman s Mary Ann Jensenovou v roce 1977?",
      options: ["Formování", "Normování", "Výkon", "Rozpuštění"],
      correct: 3,
      explain: "Původní model z roku 1965 měl čtyři fáze, v roce 1977 k nim přibylo rozpuštění.",
    },
    {
      id: "obecne-a-kabina-3",
      lessonId: "obecne-a-kabina",
      text: "Nejlepší střelec porušil pravidlo kabiny. Jak podle lekce postupovat?",
      options: [
        "Prominout mu, góly jsou důležitější",
        "Zrušit to pravidlo pro celý tým",
        "Pravidlo platí pro něj stejně jako pro ostatní",
        "Nechat to na hráčích, ať si to vyřeší",
      ],
      correct: 2,
      explain: "Pravidla kabiny mají být stejná pro všechny. Jakmile má hvězda výjimku, přestávají platit pro všechny.",
    },
    {
      id: "obecne-a-kabina-4",
      lessonId: "obecne-a-kabina",
      text: "Kdo je neformální lídr?",
      options: [
        "Kapitán s páskou",
        "Předseda klubu",
        "Hráč, který nemá žádnou funkci, ale ostatní ho poslouchají",
        "Asistent trenéra",
      ],
      correct: 2,
      explain: "Neformální lídr nemá funkci, ale má v kabině vliv. Trenér ho má znát a získat na svou stranu.",
    },
    {
      id: "obecne-a-kabina-5",
      lessonId: "obecne-a-kabina",
      text: "Jak podle lekce řešit konflikt dvou hráčů?",
      options: [
        "Brzy a v soukromí, vyslechnout obě strany a hledat řešení, ne viníka",
        "Počkat, až se to vyřeší samo",
        "Před celým týmem, ať je to výchovné",
        "U třetího piva v hospodě",
      ],
      correct: 0,
      explain: "Konflikt se řeší brzy a v soukromí, s oběma stranami, o chování a s hledáním řešení.",
    },

    // ─── obecne-pro-instituce ───────────────────────────────────────────────
    {
      id: "obecne-pro-instituce-1",
      lessonId: "obecne-pro-instituce",
      text: "Ve kterém roce vznikla IFAB?",
      options: ["1863", "1886", "1904", "1954"],
      correct: 1,
      explain: "IFAB založily čtyři britské svazy v roce 1886. FIFA se přidala v roce 1913.",
    },
    {
      id: "obecne-pro-instituce-2",
      lessonId: "obecne-pro-instituce",
      text: "Kolik hlasů je v IFAB potřeba ke změně Pravidel fotbalu?",
      options: [
        "Prostá většina, tedy pět hlasů",
        "Všech osm hlasů",
        "Nejméně šest hlasů z osmi",
        "Stačí čtyři hlasy FIFA",
      ],
      correct: 2,
      explain: "Britské svazy mají po jednom hlasu, FIFA čtyři a změna pravidel potřebuje tříčtvrtinovou většinu, tedy šest z osmi.",
    },
    {
      id: "obecne-pro-instituce-3",
      lessonId: "obecne-pro-instituce",
      text: "Kdy a kde byla založena FIFA?",
      options: [
        "21. května 1904 v Paříži",
        "15. června 1954 v Basileji",
        "V roce 1886 v Londýně",
        "V roce 1913 v Curychu",
      ],
      correct: 0,
      explain: "FIFA vznikla 21. května 1904 v Paříži, zakládajícími členy bylo sedm evropských zemí.",
    },
    {
      id: "obecne-pro-instituce-4",
      lessonId: "obecne-pro-instituce",
      text: "Kde dnes sídlí UEFA?",
      options: ["V Curychu", "V Bernu", "V Paříži", "V Nyonu"],
      correct: 3,
      explain: "UEFA sídlí od roku 1999 ve švýcarském Nyonu, předtím byla téměř čtyřicet let v Bernu.",
    },
    {
      id: "obecne-pro-instituce-5",
      lessonId: "obecne-pro-instituce",
      text: "Kdy a kde byl založen Český svaz footballový, předchůdce FAČR?",
      options: [
        "1. ledna 1993 na Strahově",
        "19. října 1901 v pražské restauraci U Zlaté váhy",
        "V roce 1911 v Plzni",
        "V roce 2011 v Praze",
      ],
      correct: 1,
      explain: "ČSF vznikl v sobotu 19. října 1901 v restauraci U Zlaté váhy. V roce 2011 se ČMFS přeměnil na FAČR.",
    },

    // ─── obecne-pro-licence ─────────────────────────────────────────────────
    {
      id: "obecne-pro-licence-1",
      lessonId: "obecne-pro-licence",
      text: "Od kterého roku platí Konvence UEFA o vzdělávání evropských trenérů?",
      options: ["1954", "2011", "1886", "1998"],
      correct: 3,
      explain: "Konvence platí od roku 1998, naposledy byla aktualizována v roce 2020.",
    },
    {
      id: "obecne-pro-licence-2",
      lessonId: "obecne-pro-licence",
      text: "Jaký je minimální rozsah výuky kurzu UEFA Pro?",
      options: ["60 hodin", "120 hodin", "180 hodin", "360 hodin"],
      correct: 3,
      explain: "UEFA Pro vyžaduje nejméně 360 hodin výuky rozložených alespoň do jedné celé sezony.",
    },
    {
      id: "obecne-pro-licence-3",
      lessonId: "obecne-pro-licence",
      text: "Jak dlouho platí licence UEFA?",
      options: ["Jeden rok", "Pět let", "Tři kalendářní roky", "Doživotně"],
      correct: 2,
      explain: "Licence UEFA platí tři kalendářní roky a pak se musí prodloužit dalším vzděláváním.",
    },
    {
      id: "obecne-pro-licence-4",
      lessonId: "obecne-pro-licence",
      text: "Kolik hodin dalšího vzdělávání během tří let je potřeba k prodloužení licence UEFA?",
      options: ["Nejméně 15 hodin", "Nejméně 5 hodin", "Nejméně 60 hodin", "Žádné, stačí zaplatit poplatek"],
      correct: 0,
      explain: "K prodloužení je potřeba nejméně 15 hodin dalšího vzdělávání během tří let.",
    },
    {
      id: "obecne-pro-licence-5",
      lessonId: "obecne-pro-licence",
      text: "Co platí o Leader certifikátu FAČR?",
      options: [
        "Je to nejvyšší licence FAČR",
        "Opravňuje trénovat v první lize",
        "Není to licence, ale je minimem pro řízení utkání na okresní úrovni, když nemůže být přítomen trenér s licencí FAČR C",
        "Je to specializace pro trenéry brankářů",
      ],
      correct: 2,
      explain: "Leader certifikát je online kurz bez licence. Stačí na řízení okresního utkání, když chybí trenér s FAČR C.",
    },

    // ─── obecne-pro-media ───────────────────────────────────────────────────
    {
      id: "obecne-pro-media-1",
      lessonId: "obecne-pro-media",
      text: "Co podle licenčních předpisů UEFA pro kluby v evropských pohárech patří k povinnostem hlavního trenéra vedle výběru hráčů, taktiky a tréninku?",
      options: [
        "Prodej vstupenek",
        "Mediální povinnosti, tedy tiskové konference a rozhovory",
        "Údržba trávníku",
        "Vedení účetnictví klubu",
      ],
      correct: 1,
      explain: "Mezi povinnosti hlavního trenéra patří i mediální povinnosti: tiskové konference a rozhovory.",
    },
    {
      id: "obecne-pro-media-2",
      lessonId: "obecne-pro-media",
      text: "Co si má trenér připravit před rozhovorem?",
      options: [
        "Seznam výtek na rozhodčího",
        "Nic, nejlepší je improvizace",
        "Přesné znění všech odpovědí nazpaměť",
        "Dvě tři klíčová sdělení",
      ],
      correct: 3,
      explain: "Trenér si předem ujasní dvě tři klíčová sdělení a v odpovědích se k nim vrací.",
    },
    {
      id: "obecne-pro-media-3",
      lessonId: "obecne-pro-media",
      text: "Jak podle lekce zacházet s kritikou vlastních hráčů?",
      options: [
        "Kritizovat je veřejně, aby se polepšili",
        "Hájit je navenek a kritizovat uvnitř kabiny",
        "Nechat kritiku na novinářích",
        "Kritizovat je jen na sociálních sítích",
      ],
      correct: 1,
      explain: "Navenek trenér hráče hájí, kritika patří do kabiny. Veřejné zesměšnění rozbíjí důvěru.",
    },
    {
      id: "obecne-pro-media-4",
      lessonId: "obecne-pro-media",
      text: "Co platí o informacích řečených „mimo záznam“?",
      options: [
        "Novinář je nikdy nesmí použít",
        "Platí jako oficiální prohlášení klubu",
        "Nikdy není jisté, že nevyjdou",
        "Vycházejí jen v zahraničním tisku",
      ],
      correct: 2,
      explain: "U věty „mimo záznam“ nikdy není jisté, že nevyjde, proto trenér neříká nic, co by nechtěl vidět v titulku.",
    },
    {
      id: "obecne-pro-media-5",
      lessonId: "obecne-pro-media",
      text: "Co má trenér udělat, když odpověď na otázku novináře neví?",
      options: [
        "Říct, že to neví",
        "Vymyslet něco přesvědčivého",
        "Odejít z tiskovky",
        "Odpovědět na jinou otázku a tvářit se, že to byla ta správná",
      ],
      correct: 0,
      explain: "Když trenér něco neví, řekne to a nevymýšlí si.",
    },

    // ─── obecne-pro-psychologie ─────────────────────────────────────────────
    {
      id: "obecne-pro-psychologie-1",
      lessonId: "obecne-pro-psychologie",
      text: "Co říká model obráceného U o vztahu aktivace a výkonu?",
      options: [
        "Výkon s aktivací roste donekonečna",
        "Aktivace nemá na výkon vliv",
        "Nejlepší výkon je při nulové aktivaci",
        "Výkon s aktivací nejdřív stoupá, po dosažení optima klesá",
      ],
      correct: 3,
      explain: "Podle modelu obráceného U výkon roste jen do optimální míry nabuzení, pak klesá.",
    },
    {
      id: "obecne-pro-psychologie-2",
      lessonId: "obecne-pro-psychologie",
      text: "Ze kterého roku je pokus Yerkese a Dodsona, od kterého se model obráceného U odvozuje?",
      options: ["1954", "1908", "1886", "1998"],
      correct: 1,
      explain: "Robert Yerkes a John Dodson publikovali pokus na myších v roce 1908.",
    },
    {
      id: "obecne-pro-psychologie-3",
      lessonId: "obecne-pro-psychologie",
      text: "Které cíle má hráč podle lekce nejvíc pod kontrolou?",
      options: ["Výsledkové", "Výkonové", "Procesní", "Cíle, které mu určí předseda"],
      correct: 2,
      explain: "Procesní cíle popisují, jak věc udělat, hráč je má nejvíc pod kontrolou a pomáhají mu soustředit se.",
    },
    {
      id: "obecne-pro-psychologie-4",
      lessonId: "obecne-pro-psychologie",
      text: "Který z těchto cílů je výsledkový?",
      options: [
        "Porazit souseda v derby",
        "Před převzetím se rozhlédnout",
        "Zlepšit úspěšnost přihrávek",
        "Dodržet stejnou rutinu před penaltou",
      ],
      correct: 0,
      explain: "Výsledkový cíl se týká výsledku, jako je výhra nad sousedem, a závisí i na soupeři.",
    },
    {
      id: "obecne-pro-psychologie-5",
      lessonId: "obecne-pro-psychologie",
      text: "Co podle lekce platí o optimální aktivaci u složitějších úkolů, třeba u tvůrce hry?",
      options: [
        "Optimum leží výš, potřebuje víc hecování",
        "Optimum leží níž, potřebuje víc klidu",
        "Na složitosti úkolu nezáleží",
        "Složité úkoly zvládne jen přehecovaný hráč",
      ],
      correct: 1,
      explain: "U složitějších úkolů leží optimum aktivace níž, proto tvůrce hry potřebuje víc klidu než stoper.",
    },
  ],
};
