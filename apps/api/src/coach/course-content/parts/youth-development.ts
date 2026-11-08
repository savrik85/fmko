/**
 * Další díly skript „Mládež“ (vlastnost Práce s mládeží). 1. díl je v `../mladez.ts`.
 *
 * Základní kurz:
 * - 2. díl „Trénink přípravky a žáků“: stavba tréninku, rozcvička a pohybové hry, brankář, hrací doba,
 * - 3. díl „Dorost a puberta“: růstový spurt, bolesti růstu, odchody ze sportu, přechod do dospělých,
 * - 4. díl „Bezpečí a zdraví“: hlavičkování, otřes mozku, horko, ochrana dětí.
 * Pokročilý kurz:
 * - 2. díl „Talent a výběr“: výběr talentů, bio-banding, duální kariéra, akademie FAČR.
 *
 * Fakta ověřena proti zdrojům (stav k listopadu 2026):
 * Trénink: Ford, Yates a Williams 2010 (J Sports Sci 28, 25 trenérů, 70 tréninků, U9/U13/U16,
 * tréninková a herní forma), US Soccer „Five Things to Know About Play-Practice-Play“ (2018).
 * Pohyb: WHO 2020 guidelines (Bull a kol., BJSM 54, 60 min denně, 3 dny v týdnu intenzivně
 * a posilování), Rössler a kol. 2018 (Sports Med 48, 11+ Kids, CH/DE/CZ/NL, U9–U13,
 * −48 % zranění, −74 % vážných, aspoň 1× týdně).
 * Brankář: FA Boot Room „Early specialisation? Not yet“, US Youth Soccer State Directors of
 * Coaching Position Statements (brankáři ne v U6 a U8, bez specializace v U10 a U12, 50 % hrací
 * doby do 12 let, bez výsledků), J. Pfeiffer „Lifetime Development of a Goalkeeper“ (US Youth
 * Soccer, střídání po poločasech).
 * Hrací doba: Aspen Institute Project Play 2019 (1032 rodičů, 2,86 roku, konec do 11 let, 36 %
 * „přestalo bavit“), pravidla fotbalu malých forem FAČR pro mladší žáky 7+1 (2023, 3 × 30 min,
 * opakované střídání).
 * Růst: Philippaerts a kol. 2006 (J Sports Sci 24, PHV 13,8 roku, 9,7 cm/rok), Borato a kol. 2025
 * (Int J Sports Sci Coach, adolescentní neobratnost), van der Sluis a kol. 2014 (Int J Sports Med
 * 35, úrazy v roce PHV, zameškané dny 7,3 → 15,7), Bult a kol. 2018 (Orthop J Sports Med 6,
 * půl roku po PHV), AAOS OrthoInfo: Osgood-Schlatter a Sever.
 * Dospívání: Van Yperen, Jonker a Verbeek 2021 (Front Sports Act Living 3, 1762 hráčů),
 * Crane a Temple 2015 (Eur Phys Educ Rev, 43 studií), Ryan a Deci 2000 (Am Psychol 55).
 * Přechod do dospělých: Tomás a kol. 2025 (Sports 13, scoping review 35 studií, 1–4 roky),
 * Morris, Tod a Oliver 2015 (J Appl Sport Psychol 27).
 * Hlavičky: Mackay a kol. 2019 (NEJM 381, 7676 hráčů, 3,45×), US Soccer Recognize to Recover
 * (2015, U11 bez hlaviček, U12–U13 30 min a 15–20 hlaviček týdně), FA Heading Guidance
 * a FA 17. 5. 2024 (postupný zákaz úmyslné hlavičky U7–U11 do 2026/27, nepřímý volný kop).
 * Otřes mozku: Patricios a kol. 2023 (BJSM 57, 6. konsenzus CISG, Amsterdam 2022, relativní klid
 * 24–48 h, 6 kroků po 24 h, aspoň týden), CRT6 (červené vlajky, příznaky, nenechat samotného),
 * UK Grassroots Concussion Guidance 2023 („if in doubt, sit them out“, 21 dní).
 * Horko: AAP Policy Statement 2011, potvrzeno 2019 (Pediatrics 128, 100–250 ml / 20 min,
 * 1–1,5 l / h, aklimatizace 10–14 dní, 2 h mezi zápasy, úpal nad 40 °C, ponoření do studené vody).
 * Ochrana dětí: FA Guidance Note 8.4 Changing Rooms (2019), U.S. Center for SafeSport MAAPP
 * (observable and interruptible, žádná jízda autem o samotě), Northumberland FA Volunteer Dos
 * and Don'ts (rodiče v kopii, žádné soukromé sítě), Irish FA (neslibovat tajemství),
 * portal.gov.cz a Linka bezpečí (116 111 nonstop a zdarma).
 * Talent: Güllich 2014 (Eur J Sport Sci 14, obměna 24,5 % a 41 %), Hill a kol. 2020 (J Sports Sci
 * 38, U15 a U16 bez pozdě dospívajících), Sarmento a kol. 2018 (Sports Med 48, 70 studií).
 * Bio-banding: Malina a kol. 2019 (Sports Med 49), Khamis a Roche 1994 (Pediatrics 94, Fels
 * Longitudinal Study, Ohio), Cumming a kol. 2018 (J Sports Sci 36, 66 hráčů, 85–90 % výšky).
 * Duální kariéra: EU Guidelines on Dual Careers of Athletes (schváleno 28. 9. 2012, vydáno 2013).
 * Akademie: web RFA FAČR (Základní informace, Výběr hráčů; vznik 2015, U14 a U15, herní
 * inteligence, citát K. Poborského), memorandum Jihočeského kraje, Č. Budějovic a FAČR o RFA
 * (2025, do 30. 6. 2029, registr smluv). fotbal.cz je za Cloudflare, dokumenty FAČR ověřeny
 * přes zrcadla (web RFA na esports.cz, pravidla 7+1 na webu klubu, registr smluv).
 *
 * Vynecháno pro neověřitelnost: přesná pravidla FAČR k hlavičkování a střídání v dorostu,
 * česká právní oznamovací povinnost, současné počty a náklady RFA, sportovní střediska (SpS, SCM)
 * pro fotbal, poměr 65 : 35 tréninkové a herní formy z Forda (není v abstraktu).
 */
import type { CategoryContent, PartTitles } from "../types";

export const YOUTH_DEVELOPMENT_PART_TITLES: PartTitles = {
  attr_basic: { 2: "Trénink přípravky a žáků", 3: "Dorost a puberta", 4: "Bezpečí a zdraví" },
  attr_advanced: { 2: "Talent a výběr" },
};

export const YOUTH_DEVELOPMENT_PARTS: CategoryContent = {
  lessons: [
    // ── Základní kurz, 2. díl: Trénink přípravky a žáků ──
    {
      id: "mladez-session-structure",
      category: "mladez",
      difficulty: 2,
      part: 2,
      title: "Stavba tréninku pro děti",
      body: `Představ si trénink žáků: deset dětí stojí ve frontě na střelbu, střílí jedno a trenér k tomu vykládá. Za hodinu kopne každé do míče dvacetkrát a nejlépe se naučí čekat. **Kontakt s míčem** a **rozhodování ve hře** se ve frontě nenatrénují.

Angličtí vědci **Ford, Yates a Williams (2010)** sledovali 25 trenérů mládeže při 70 trénincích kategorií do 9, do 13 a do 16 let. Trenéři nechávali hráče víc času v takzvané **tréninkové formě** (kondice, technická cvičení, nácvik dovedností) než v **herní formě**, tedy v malých a upravených hrách, které se zápasu podobají víc. Navíc **hodně mluvili**, opravovali a organizovali, ať se dělalo cokoli. A mezi věkovými kategoriemi skoro nebyl rozdíl: devítiletí trénovali podobně jako šestnáctiletí.

Americký svaz **US Soccer** pro mládež doporučuje stavbu **Play–Practice–Play**, tedy hra, nácvik, hra:
- **první hra**: děti hned hrají malé hry, hlavně pro radost; trenér připraví prostředí a spíš pozoruje,
- **nácvik**: cvičení zaměřená na téma tréninku, s opakováním, ale pořád zábavná,
- **závěrečná hra**: hraje se bez přerušování a trenér **skoro nemluví**; sleduje, jestli děti použijí, co nacvičily.

US Soccer tím vědomě jde proti tréninku, kde děti **stojí ve frontách, běhají kolečka** a dělají cvičení, která se fotbalu vůbec nepodobají.

Pár pravidel pro přípravu:
- pokud to jde, **každé dítě svůj míč**,
- malé skupiny po dvou až čtyřech místo jedné dlouhé řady,
- vysvětlení krátce, pak hrát.

Táta u lajny se možná bude divit, že se „jenom hraje“. Řekni mu, že právě tak se fotbal učí.`,
    },
    {
      id: "mladez-warmup-games",
      category: "mladez",
      difficulty: 2,
      part: 2,
      title: "Rozcvička a pohybové hry",
      body: `Kolik se má dítě hýbat? **Světová zdravotnická organizace** (WHO) v doporučeních z roku 2020 uvádí, že děti a dospívající od 5 do 17 let mají mít **v průměru aspoň 60 minut denně** středně až vysoce intenzivního pohybu, hlavně vytrvalostního. Aspoň **tři dny v týdnu** k tomu má patřit i intenzivní zátěž a cvičení, které posiluje **svaly a kosti**. Sezení, hlavně u obrazovky pro zábavu, se má omezit. Dva tréninky týdně na to samy nestačí, ale můžou být nejveselejší částí týdne.

Rozcvička nemusí být kolečko kolem hřiště a protahování v kruhu. Pro dětský fotbal vznikla rozcvička **11+ Kids**. Studie **Rösslera a kolegů (2018)** ji vyzkoušela na týmech do 9, do 11 a do 13 let ve Švýcarsku, Německu, Nizozemsku a v **Česku**. Týmy, které nahradily obvyklou rozcvičku programem 11+ Kids, měly o **48 % méně zranění** a o **74 % méně vážných zranění** než ostatní. Autoři doporučují dělat ji **aspoň jednou týdně**, ještě lépe dvakrát.

Pohybové hry a honičky se hodí do rozcvičky i do hlavní části: děti běhají, kličkují, brzdí, mění směr a vůbec si nevšimnou, že trénují. Pozor jen na hry **s vyřazováním**. Kdo vypadne první, bývá nejpomalejší, tedy ten, kdo pohyb potřebuje nejvíc, a pak stojí u kraje. Lepší úpravy:
- chycený se **hned vrací** do hry, třeba po splnění úkolu,
- chycený se stává **dalším honičem**,
- hraj **na čas**, ne do posledního přeživšího,
- přidej míče: kdo má míč u nohy, toho nelze chytit.

Strejda Franta tvrdí, že za jeho časů se rozcvičovalo dvěma koly a jednou cigaretou. Proto taky skončil s fotbalem v osmadvaceti s kolenem na šrot.`,
    },
    {
      id: "mladez-youth-goalkeeper",
      category: "mladez",
      difficulty: 2,
      part: 2,
      title: "Brankář v přípravce a žácích",
      body: `V každé přípravce se to stane: na trénink přijde kluk, který chce chytat, a druhý, kterého do branky postavili, protože „je největší“. Jenže kdo bude jednou dobrý brankář, v osmi letech nikdo neví.

Anglická **FA** v článku pro trenéry „Brzká specializace? Ještě ne“ upozorňuje, že u dětí v základní fázi rozvoje **nikdo neví, kdo bude jednou hrát na jakém postu**. Mnoho týmů proto nemá stálého brankáře a hráči se v bráně **střídají**. FA radí:
- zkoušet děti na různých postech, klidně nejdřív v tréninku,
- nechat i brankáře, který chytá rád, **hrát v poli**, aby se zlepšil s míčem u nohy,
- brát každé dítě zvlášť: koho by branka rozhodila a vzala mu sebevědomí, toho tam **nenuť**.

Podobně to vidí americká mládežnická asociace **US Youth Soccer**. Podle stanoviska šéftrenérů jejích svazů by v kategoriích **U6 a U8 brankáři vůbec neměli být**, děti mají běhat a honit míč. Od U10 už brankář patří ke hře, ale hráči v kategoriích **U10 a U12 by se zatím neměli specializovat na žádný post**. Prezentace pro trenéry na webu US Youth Soccer radí, ať si chytání vyzkouší **celý tým** a brankáři se střídají třeba **po poločasech**.

U nás se v přípravce hraje s brankářem, takže ho na zápas mít musíš. Nikdo ti ale nebrání posílat do branky různé děti a stálého gólmana nechat zahrát i v poli.

Výhoda navíc: kdo jednou podrží celý zápas v bráně, i když normálně hraje útok, bude navždy chápat, jak se cítí ten, kdo dostal gól z dvaceti metrů. A přestane na něj po zápase v kabině křičet.`,
    },
    {
      id: "mladez-playing-time",
      category: "mladez",
      difficulty: 2,
      part: 2,
      title: "Hrací doba pro všechny",
      body: `Lavička je pro dítě nejdelší místo na světě. Kdo celý zápas jen sedí, nic se nenaučí a doma řekne, že na fotbal už nechce.

Americký **Aspen Institute** se v roce 2019 v průzkumu zeptal 1032 rodičů sportujících dětí, jak dlouho jejich děti u sportu vydrží. Dítě podle průzkumu začíná se sportem kolem osmi let, zůstane u něj v průměru **necelé tři roky** a končí **zhruba do jedenácti let**. Nejčastější důvod podle rodičů: sport ho **přestal bavit** (36 %).

Asociace **US Youth Soccer** ve stanoviscích šéftrenérů svých svazů pro děti **do 12 let** doporučuje:
- každý hráč odehraje aspoň **50 % hrací doby**,
- **nezapisovat výsledky** a nevést tabulky.

Pravidla FAČR hrací době pro všechny nahrávají. U mladších žáků, kteří hrají **7+1**, doporučují pravidla malých forem hrací dobu **3 × 30 minut** a střídání je **opakované**: střídá se při přerušení, hráč smí opustit hřiště kdekoli a střídání se nemusí hlásit rozhodčímu.

Spočítej si to: na hřišti je osm hráčů a zápas má 90 minut, to je dohromady 720 hráčských minut. Když jich máš na soupisce dvanáct, vychází na každého **60 minut**, tedy dvě třetiny zápasu.

Jak na to v praxi:
- napiš si **plán střídání předem**, ne podle nálady v sedmdesáté minutě,
- zapisuj si minuty; za sezónu uvidíš, kdo je pořád zkrácený,
- střídej i **základní sestavu**, ať nezačínají pořád stejní,
- lavičku nepoužívej jako **trest** za chybu.

Rodič, jehož syn hraje celou dobu, si možná postěžuje, že „takhle se nevyhraje“. Odpověz mu, že v žácích se vyhrávají hlavně děti, které budou za pět let pořád chodit na trénink.`,
    },

    // ── Základní kurz, 3. díl: Dorost a puberta ──
    {
      id: "mladez-growth-spurt",
      category: "mladez",
      difficulty: 2,
      part: 3,
      title: "Růstový spurt a neobratnost",
      body: `Loni to byl nejšikovnější kluk v žácích, letos zakopává o vlastní nohy a míč mu odskakuje jako od plotu. Než ho pošleš na lavičku, podívej se, o kolik vyrostl.

Vrchol růstového spurtu se odborně jmenuje **PHV** (peak height velocity), tedy chvíle, kdy dítě roste nejrychleji. Belgická studie **Philippaertse a kolegů (2006)** sledovala pět let 33 mladých fotbalistů z Gentu. Vrchol růstu u nich přišel v průměru ve **13,8 letech** a kluci tehdy rostli zhruba o **9,7 cm za rok**. Kolem PHV se nejrychleji zlepšovala rovnováha, rychlost, výbušnost i vytrvalost a u některých schopností se pak zlepšování zpomalilo. Autoři proto radí, aby trenéři v tomto období **zátěž přizpůsobili každému hráči zvlášť**.

Dočasnému zhoršení koordinace a rovnováhy během spurtu se říká **adolescentní neobratnost**. Přehled **Borata a kolegů (2025)** ale upozorňuje, že pro ni **neexistuje jednotná definice ani test**. Některé studie zhoršení našly, jiné plynulé zlepšování a mezi dětmi byly velké rozdíly. Neobratnost tedy nepostihne každého a nedá se předem odhadnout.

Jisté je, že se kolem spurtu mění riziko zranění. Nizozemští vědci **van der Sluis a kolegové (2014)** zjistili, že talentovaní fotbalisté měli v roce PHV víc úrazů než rok předtím a **zameškaných dnů** kvůli zraněním zhruba **dvakrát tolik**. Po spurtu přibývalo **zranění z přetížení**. Jiná nizozemská studie (**Bult a kolegové, 2018**) našla nejvíc zranění v **půlroce po PHV**.

Co s tím:
- **pravidelně měř výšku** a počítej, kolik hráč přidal za rok,
- kdo zrovna roste rychle, tomu uber skoky a sprinty, ne radost ze hry,
- neobratnost nehodnoť jako lenost ani ztrátu talentu.

Pepík z dorostu se za rok zase srovná. Jen mu mezitím kup kopačky o dvě čísla větší.`,
    },
    {
      id: "mladez-growth-pains",
      category: "mladez",
      difficulty: 2,
      part: 3,
      title: "Bolesti růstu: koleno a pata",
      body: `Dvanáctiletý obránce si po tréninku sahá pod koleno, jeho mladší brácha kulhá na patu. Táta říká, že je to „z růstu“. A má docela pravdu.

U dospívajících se šlachy upínají do míst, kde kost ještě roste, na **růstové ploténky**. Opakovaný tah šlachy při běhu a skocích je dokáže podráždit. Dvě nejčastější potíže u fotbalistů popisuje americká akademie ortopedů (**AAOS**).

**Osgood-Schlatterova choroba** bolí **těsně pod čéškou**, na kostním hrbolku holenní kosti, kam se upíná šlacha čéšky. Objevuje se během růstového spurtu, častěji u dětí ve sportech s během a skoky. Bývá tam otok, citlivost a ztuhlé stehenní svaly. Potíže obvykle **odezní po skončení spurtu**, u dívek zhruba ve 14, u chlapců zhruba v 16 letech. Hrbolek pod kolenem ale většinou **zůstane**. Podle AAOS pokračování ve sportu **kolenu dlouhodobě neublíží**. Pomáhá led, protahování přední i zadní strany stehen, úprava zátěže a při silných bolestech klid.

**Severova choroba** je podráždění růstové ploténky **na patní kosti**, kam se upíná **Achillova šlacha**. Podle AAOS je to jedna z nejčastějších příčin bolesti paty u rostoucích dětí. Bolí hlavně při běhu a skákání, někdy obě paty. Pomáhá omezit zátěž, **podpatěnky** do kopaček, obuv s mírně zvýšenou patou a protahování lýtek. Když dítě znovu přidá, potíže se můžou vrátit. Jakmile ale ploténka **zkostnatí**, Severova choroba se už nevrátí.

Co dělá trenér:
- bolest nebagatelizuj ani nedramatizuj; pošli hráče k lékaři, ať potvrdí, o co jde,
- uprav zátěž: méně skoků a sprintů, víc techniky,
- dítě, které kulhá, do zápasu nestav.

A až ti strejda poradí, ať to kluk „rozběhá“, kývni a dělej, co řekl doktor.`,
    },
    {
      id: "mladez-teen-dropout",
      category: "mladez",
      difficulty: 2,
      part: 3,
      title: "Dospívání a odchody ze sportu",
      body: `V žácích jich bylo osmnáct, v dorostu jich na trénink chodí devět. Kde jsou ostatní? Brigáda, škola, holky, hry na počítači. A hlavně: přestalo je to bavit.

Nizozemská studie **Van Yperena, Jonkera a Verbeeka (2021)** sledovala **1762 fotbalistů a fotbalistek**, v průměru kolem 18 let, a zjišťovala, kdo do půl roku a kdo do čtyř let z organizovaného fotbalu odejde. Hlavním ukazatelem odchodu byla **radost z fotbalu**, krátkodobě i dlouhodobě. Kdo odešel, navíc častěji viděl **jiné možnosti** (třeba jiný sport), měl v klubu **méně členů rodiny** a s fotbalem v klubu **začínal později**.

Souhrnná studie **Craneové a Templeové (2015)** prošla 43 prací o odchodech dětí a mladých ze sportu. Častěji než vnější okolnosti, jako je čas, peníze nebo dojíždění, za odchodem stály **věci uvnitř hráče** (třeba že ho to nebaví nebo si připadá slabý) a **vztahy s lidmi** kolem (tlak, trenér, spoluhráči).

Co dospívající potřebuje, popisuje **teorie sebeurčení** psychologů **Ryana a Deciho**. Člověk je motivovaný, když má naplněné tři základní potřeby:
- **autonomii**: může sám rozhodovat a ví proč,
- **kompetenci**: cítí, že něco umí a zlepšuje se,
- **vztahy**: patří do party.

V dorostu to znamená: nech kapitána vést rozcvičku, vysvětluj, proč se co trénuje, ptej se hráčů na názor. Ukaž každému, v čem se zlepšil. A starej se o partu, protože pro šestnáctiletého je kabina často důležitější než tabulka.

Nejhorší, co můžeš udělat, je dorostence ponižovat před ostatními. Druhý den nepřijde a za pár let ho najdeš na tribuně s pivem, jak radí rozhodčímu.`,
    },
    {
      id: "mladez-junior-to-senior",
      category: "mladez",
      difficulty: 2,
      part: 3,
      title: "Přechod z dorostu do dospělých",
      body: `Z dorostu do áčka vede na okrese krátká cesta, často jen přes chodbu do vedlejší kabiny. Výzkumy ale přechod z juniorské do dospělé kategorie řadí k **nejnáročnějším obdobím** sportovní kariéry.

Přehled **Tomáse a kolegů (2025)** shrnul 35 studií o tomto přechodu v mužském fotbale. Podle něj přechod obvykle trvá **jeden až čtyři roky**, ne jednu sezónu. Co pomáhá a co brzdí:
- **opora** od spoluhráčů a trenérů zvyšuje šanci, že se hráč prosadí,
- **nedostatek příležitostí** v prvním týmu patří k hlavním překážkám,
- **hostování** pomáhá zvyknout si na fyzické, taktické i rozhodovací nároky dospělého fotbalu,
- trenéři jsou klíčoví prostředníci, kteří pomáhají prakticky i lidsky,
- pomáhá, když mládež a první tým **trénují na stejném místě**; brzdí, když spolu trenéři mládeže a dospělých **nemluví**,
- hráč potřebuje **psychickou odolnost** vůči tlaku, chybám a boji o místo.

Studie **Morrise, Toda a Olivera (2015)** porovnala dva profesionální kluby. Klub, který měl promyšlený **program pro přechod** mladých hráčů do dospělých, měl lepší výsledky přechodu, a přitom za pomoc hráčům utratil **méně** než klub bez programu. Plán se tedy vyplatí i pokladníkovi.

Na vesnici to znamená:
- ať dorost občas **trénuje s áčkem**,
- trenér dorostu a trenér áčka spolu **mluví o konkrétních klucích**, ne jen o tom, kdo přinese míče,
- když v áčku na hráče nezbude místo, domluv mu **hostování** o třídu níž, ať hraje, a nesedí,
- počítej s tím, že se to nepovede za jedno léto.

Jinak se z nejlepšího dorostence okresu stane nejlepší hráč kabiny v prší. Taky talent, ale jiný.`,
    },

    // ── Základní kurz, 4. díl: Bezpečí a zdraví ──
    {
      id: "mladez-heading",
      category: "mladez",
      difficulty: 2,
      part: 4,
      title: "Hlavičkování u dětí",
      body: `V roce 2019 vyšla v časopise New England Journal of Medicine skotská studie **Mackaye a kolegů**. Porovnala **7676 bývalých profesionálních fotbalistů** se zhruba 23 tisíci muži z běžné populace. Bývalí fotbalisté umírali méně často na nemoci srdce a rakovinu plic, ale riziko úmrtí na **neurodegenerativní onemocnění** (třeba demenci) měli asi **3,5krát vyšší**. Studie sama neprokázala, že za to můžou hlavičky. Svazy přesto hlavičkování u dětí omezují.

Americký **US Soccer** od roku 2015 (program Recognize to Recover) doporučuje:
- děti v kategoriích **U11 a mladší** nehlavičkují vůbec, ani v tréninku, ani v zápase,
- **U12 a U13**: nácvik hlavičky nejvýš **30 minut týdně** a nejvýš **15–20 hlaviček** na hráče za týden; zápasy omezené nejsou.

Anglická **FA** to má takto:
- v tréninku dětí **U7 až U11** se hlavička vůbec nezařazuje,
- v zápasech zakazuje **úmyslnou hlavičku** postupně: od sezóny 2024/25 v U7 až U9, od 2025/26 v U10 a od 2026/27 v U11; trestá se **nepřímým volným kopem**,
- **U12 a U13** smějí hlavičku trénovat nejvýš v jednom tréninku týdně, s **lehkými míči**, nejvýš **pět opakování** a **bez soupeře**,
- **U14 až U16** nejvýš jeden trénink týdně a 10 hlaviček na hráče.

Pro okresní přípravku z toho plyne jednoduché pravidlo: hlavičku netrénuj. Když s ní v žácích začneš, tak s lehkým míčem, málo opakováními a důrazem na techniku. Cvičení „dvacet centrů a každý hlavou“ patří do muzea vedle šněrovacích kopaček a mazání nohou kafrem.`,
    },
    {
      id: "mladez-concussion",
      category: "mladez",
      difficulty: 2,
      part: 4,
      title: "Otřes mozku: poznat a stáhnout",
      body: `Otřes mozku nemusí vypadat dramaticky. Stačí srážka hlavami, pád nebo tvrdá rána, a dítě přitom nemusí ztratit vědomí. Mezinárodní skupina odborníků **Concussion in Sport Group** vydala v roce 2023 po konferenci v Amsterdamu nový konsenzus a s ním nástroj **CRT6** pro laiky. Podle konsenzu ho má používat **každý dospělý, který dohlíží na sport dětí**, tedy i trenér přípravky.

**Červené vlajky, volej záchranku:**
- bolest nebo citlivost krku, dvojité vidění,
- slabost nebo brnění rukou či nohou,
- silná nebo sílící bolest hlavy, zvracení,
- křeče, ztráta vědomí, zhoršující se vědomí, rostoucí neklid nebo agresivita.

**Další známky** otřesu: hráč nehybně leží, pomalu vstává, je zmatený, má **prázdný pohled**, vrávorá. Sám si může stěžovat na bolest hlavy, závrať, nevolnost, rozmazané vidění nebo že „není ve své kůži“.

Hráč s podezřením na otřes **jde ze hry a ten den už nehraje**, i když se mu uleví. Britská pravidla pro amatérský sport to shrnují heslem **„když váháš, stáhni“** (if in doubt, sit them out). Dítě první hodiny nenechávej samotné a nepouštěj ho domů bez dospělého.

Úplná tma a izolace nepomáhají. Konsenzus doporučuje **24–48 hodin relativního klidu** a pak postupný návrat. Návrat ke sportu má **šest kroků**, od běžných denních činností přes lehký pohyb a trénink bez kontaktu až po zápas. Každý krok trvá **aspoň 24 hodin**, celé to zabere nejméně týden, a do kontaktu jen se **svolením lékaře**. Britská pravidla pro amatéry navíc říkají: do zápasu s rizikem kontaktu **nejdřív po 21 dnech**.

Trenér, který řekne „to nic, běž, potřebujeme tě“, nehraje o tři body. Hraje o dětský mozek.`,
    },
    {
      id: "mladez-heat-hydration",
      category: "mladez",
      difficulty: 2,
      part: 4,
      title: "Horko a pitný režim",
      body: `Červencový turnaj, umělá tráva, tři zápasy za dopoledne a jedna láhev vody na tři kluky. Takhle se dělá úpal, ne fotbal.

Dlouho se tvrdilo, že děti snášejí horko hůř než dospělí. Americká akademie pediatrů (**AAP**) ve stanovisku z roku 2011, potvrzeném v roce 2019, píše, že novější výzkumy to nepotvrdily: děti a dospívající **zvládají horko podobně jako dospělí**, pokud dobře pijí. Hlavní rizika jsou jinde: málo pití, **přehnaná zátěž**, krátký odpočinek mezi zápasy a tréninky jednoho dne a nevhodné oblečení. To všechno jde ovlivnit, takže nemocem z horka se dá většinou **předejít**.

Co AAP doporučuje:
- pít **před, během i po** sportu; dětem 9–12 let obvykle stačí **100–250 ml každých 20 minut**, dospívajícím až **1–1,5 litru za hodinu**, ale nepřepíjet se,
- při zátěži delší než hodinu nebo při více zápasech za den zvážit nápoje **se solí** (sodíkem),
- na horko si zvykat postupně, obvykle **10–14 dní**,
- v horku snížit intenzitu, zkrátit trénink a dávat **víc přestávek ve stínu**,
- mezi zápasy jednoho dne nechat aspoň **2 hodiny** na odpočinek,
- nemocné dítě (zvracení, průjem, horečka) do horka nepouštět.

Varovné signály: dítě je bledé nebo naopak rudé, má závrať, bolí ho hlava, zvrací, je neobvykle unavené nebo říká, že je mu zima či obrovské horko. Pak **hned končí** a ten den už nehraje.

**Úpal** ohrožuje život: tělesná teplota nad **40 °C** a k tomu zmatenost, křeče nebo bezvědomí. Volej záchranku a **hned chlaď**, nejlépe ponořením do **studené vody**, jinak ledem na krk, podpaží a třísla a mokrými ručníky. Chlazení nečeká na sanitku.

Pořadateli, který naplánoval tři zápasy na poledne, připomeň, že hrát se dá i v osm ráno.`,
    },
    {
      id: "mladez-safeguarding",
      category: "mladez",
      difficulty: 2,
      part: 4,
      title: "Ochrana dětí v klubu",
      body: `Ochrana dětí (anglicky **safeguarding**) neznamená podezírat každého trenéra. Znamená nastavit pravidla tak, aby dítě bylo v bezpečí a dospělý se nikdy nedostal do situace, kterou by šlo zneužít nebo špatně vyložit.

Anglická **FA** v doporučení pro **šatny a sprchy** uvádí:
- dospělí trenéři a dobrovolníci se **nepřevlékají ani nesprchují ve stejnou dobu** jako děti ve stejných prostorách,
- když se děti převlékají, mají na ně dohlížet **dva dospělí** z klubu,
- v šatnách a sprchách se **nepoužívají mobily ani fotoaparáty**, a to nikým, ani rodiči,
- dítě, kterému je sprchování před ostatními nepříjemné, se nenutí; může se umýt doma.

Americké centrum **SafeSport** má pravidlo, že každý kontakt dospělého s dítětem o samotě musí být **„vidět a dát se přerušit“**: jiný dospělý na situaci vidí a může vstoupit. Proto na klubových akcích dospělý **neveze dítě autem sám**.

Komunikace:
- zprávy dětem posílej tak, aby je viděli i **rodiče**, třeba do skupiny, kde jsou s nimi,
- s dětmi si nepiš soukromě přes **osobní sociální sítě**,
- fotky dětí jen se **souhlasem** dítěte a rodičů.

Když ti dítě svěří, že mu někdo ubližuje, poslouchej a ber ho vážně. **Neslibuj, že to zůstane tajemstvím**, a hned to řeš s vedením klubu nebo s odborníky. Je-li dítě v bezprostředním ohrožení, volej **policii**. Děti a studenti se mohou samy obrátit na **Linku bezpečí**, číslo **116 111**, nonstop a zdarma.

Na okrese se všichni znají, a právě proto se pravidla hodí. Chrání děti a chrání i tebe před řečmi u výčepu.`,
    },

    // ── Pokročilý kurz, 2. díl: Talent a výběr ──
    {
      id: "mladez-talent-identification",
      category: "mladez",
      difficulty: 3,
      part: 2,
      title: "Výběr talentů a jeho omyly",
      body: `Skaut přijede na turnaj U12, vidí kluka o hlavu většího, který všechny přeběhne, a zapíše si ho. Za tři roky už o něm nikdo neví. Výběr talentů v dětském věku je spíš sázka než jistota.

**Arne Güllich (2014)** rozebral německý systém výchovy talentů. V mládežnických akademiích se každý rok vyměnila zhruba **čtvrtina hráčů** (24,5 %), v mládežnických reprezentacích dokonce **41 %**. V jakémkoli věku byla šance, že hráč v programu vydrží ještě tři roky, **menší než 50 %**. A pozdější hráči bundesligy se do talentových programů dostávali **v různém věku**, rovnoměrně během dětství i dospívání. Profesionálové tedy nevzešli z jednoho brzkého výběru, ale z **opakovaného vybírání a vyřazování**.

Druhý omyl je zaměnit vyspělost za talent. **Hill a kolegové (2020)** sledovali osm let 202 hráčů anglické profesionální akademie v kategoriích U9 až U16. Zvýhodnění **biologicky vyspělejších** hráčů se objevilo od U12 a s věkem rostlo. V kategoriích U15 a U16 už akademie neměla **žádného pozdě dospívajícího** hráče. Autoři zdůrazňují, že **relativní věk a biologická zralost** jsou dvě různé věci a každá potřebuje vlastní opatření.

Systematický přehled **Sarmenta a kolegů (2018)** ze 70 studií shrnuje, že výhody nejlepších hráčů v technice, taktice, postavě, kondici i psychice se s věkem, zralostí a postem **mění nelineárně**. Doporučuje proto sledovat hlavně **technické a taktické dovednosti** a tělesné údaje vždy **vztahovat k věku a vývoji**.

Pro praxi:
- výběr ber jako průběžný a dveře nech otevřené i pro „pozdní kvítka“,
- k hodnocení si zapisuj, jak je hráč vyspělý, nejen jak hraje,
- dívej se na rozhodování a práci s míčem, ne na to, kdo komu sahá po ramena.

Nejlepší hráč okresu v U12 nemusí být nejlepší v U19. A ten nejlepší z U19 se v dvanácti možná nevešel ani do okresního výběru.`,
    },
    {
      id: "mladez-bio-banding",
      category: "mladez",
      difficulty: 3,
      part: 2,
      title: "Bio-banding v praxi",
      body: `Bio-banding znamená sestavit skupiny nebo zápasy podle **biologické zralosti** místo data narození. Jak se ale zralost pozná, když nemáš rentgen ruky?

Přehled **Maliny a kolegů (2019)** uvádí, že nejčastějším ukazatelem zralosti je **procento předpokládané dospělé výšky**. Dospělá výška se obvykle odhaduje **metodou Khamise a Rocheho** z věku, pohlaví, současné výšky a váhy dítěte a z **průměrné výšky rodičů**. Kluk, který má dnes 90 % své budoucí výšky, je ve vývoji dál než vrstevník s 80 %, i když se narodili ve stejný den.

Má to háčky:
- metodu Khamise a Rocheho vyvinuli na **bílých amerických dětech** z dlouhodobé studie v Ohiu, jinde může být méně přesná,
- výšky rodičů je potřeba změřit, ne odhadnout od oka,
- podle Maliny a kolegů bio-banding rozdíly ve zralosti **zmenšuje, ale neodstraní** a rovnice pro odhad výšky potřebuje další ověřování.

Jak to dopadlo v praxi, ukázala studie **Cumminga a kolegů (2018)**. Na turnaj se sešlo 66 hráčů ze čtyř akademií Premier League ve věku od 11 do 14 let, kteří měli **85–90 % dospělé výšky**, a hráli 11 na 11 na velkém hřišti. Všichni hráči hodnotili zkušenost **pozitivně**. Dříve vyspělí řekli, že zápasy byly **fyzicky náročnější** a museli víc spoléhat na **techniku a taktiku**. Pozdě vyspělí naopak dostali **víc prostoru** ukázat, co umějí technicky, fyzicky i psychicky. Hráči doporučili, aby Premier League bio-banding zařadila **do stávajících soutěží**.

Bio-banding tedy není náhrada věkových soutěží, ale **doplněk**: občas zápas nebo trénink, kde se silák musí naučit kličkovat a drobeček se konečně dostane k míči. Na okrese stačí změřit kluky i rodiče a domluvit se se sousedním klubem na přátelák podle zralosti. Zápis do kroniky bude zajímavější než obvykle.`,
    },
    {
      id: "mladez-dual-career",
      category: "mladez",
      difficulty: 3,
      part: 2,
      title: "Duální kariéra: škola a fotbal",
      body: `Patnáctiletý talent jezdí čtyřikrát týdně na trénink do krajského města, o víkendu hraje a ve škole se mu trojky mění na čtyřky. Rodiče se ptají, jestli má smysl to tlačit. Odpověď zní: obojí, a pořádně.

**Duální kariéra** podle evropských směrnic (EU Guidelines on Dual Careers of Athletes, schválené expertní skupinou EU v roce 2012) znamená zahájit, rozvinout a dokončit sportovní kariéru jako součást celoživotní dráhy, **spolu se vzděláním nebo prací**. Taková dvojí dráha podle směrnic obvykle trvá **15 až 20 let**. Strategie vrcholového sportu mají začínat zhruba od **10–12 let** a na prvním místě má být vždy osobní, tělesný a duševní rozvoj dítěte.

Směrnice uvádějí, že podle mezinárodních výzkumů každý rok odejde ze sportu zhruba **třetina** mladých ve věku 10–17 let, protože jim sport **bere příliš času** a brání v jiných věcech, třeba ve studiu. Výhody sladěné školy a sportu podle nich jsou:
- **zdraví**: vyváženější život a méně stresu,
- **rozvoj osobnosti**: dovednosti použitelné i mimo hřiště a vlastní identita,
- **vztahy**: širší okruh přátel a podpory,
- **konec kariéry**: lepší plánování a **kratší přizpůsobení** životu po sportu,
- **práce**: lepší uplatnění.

Směrnice také připomínají, že při přechodu na jinou školu se často **rozpadne parta kamarádů**, se kterou dítě sportovat začalo. I přehled studií o přechodu z juniorů do dospělých (Tomás a kolegové, 2025) uvádí, že cesty, které **vyvažují sport a vzdělání**, podporují dlouhodobé setrvání ve sportu i spokojenost.

Co může trenér:
- ptát se na školu stejně samozřejmě jako na zranění,
- v týdnu přijímaček nebo velkých písemek ubrat zátěž,
- domluvit se s rodiči a školou včas, ne až když hrozí propadnutí.

Profesionálů z okresu bude za deset let pár. Elektrikářů, učitelek a účetních, kteří při práci trénují žáky, budou desítky. Všichni potřebují školu dodělat.`,
    },
    {
      id: "mladez-regional-academies",
      category: "mladez",
      difficulty: 3,
      part: 2,
      title: "Akademie a cesta talentu",
      body: `Kluk z vesnického klubu je v žácích nejlepší široko daleko. Kam dál? V Česku vede jedna z cest přes **regionální fotbalové akademie FAČR** (RFA).

Podle FAČR vznikl projekt RFA v roce **2015** a je určen pro talentované hráče ve věku **14 a 15 let**, tedy pro kategorie U14 a U15. Akademie spolupracují s vybranými **základními školami**, kde hráči plní povinnou školní docházku, a kluci z dálky můžou bydlet na **domově mládeže**. FAČR akademie podporuje spolu s ministerstvem školství, nadačními fondy a kraji. Například **Jihočeský kraj**, město České Budějovice a FAČR podepsali v roce 2025 memorandum o podpoře jihočeské RFA do poloviny roku **2029**.

Jak se do RFA dostat? Výběr do U14 podle FAČR probíhá **průběžně dva roky předem**. Trenéři akademie objíždějí i **menší kluby** v regionu a můžou pořádat výběrové festivaly pro hráče ve věku 12 a 13 let. Nejčastěji hráče **opakovaně pozorují přímo ve hře**. Základním kritériem je **herní inteligence**, tedy rychlost a správnost taktického rozhodnutí spojená s pohybovým provedením. Konečný výběr přichází v kategorii U13.

FAČR v akademiích klade velký důraz na **školu**. Karel Poborský, který akademie FAČR vedl, to zdůvodnil tím, že dětí, které se fotbalem budou živit, je **jen pár** a reprezentantů ještě méně.

Co z toho plyne pro trenéra na okrese:
- talent neschovávej; dej o něm vědět krajskému svazu nebo akademii, i když ti pak z týmu odejde,
- připrav ho na to, co se hodnotí: rozhodování, technika a chuť hrát jsou víc než kila a centimetry,
- když se do akademie nedostane, není to konec; cesta k dobrému fotbalu vede i přes dorost a dospělé v okrese,
- s rodiči mluv i o škole, protože tu bude dítě potřebovat tak jako tak.

Kdo se naučí dobře rozhodovat s míčem, toho si skauti najdou, i kdyby hrál na hřišti za kravínem.`,
    },
  ],
  questions: [
    // Stavba tréninku pro děti
    {
      id: "mladez-session-structure-1",
      lessonId: "mladez-session-structure",
      text: "Co zjistili Ford, Yates a Williams (2010), když sledovali tréninky trenérů mládeže?",
      options: [
        "Trenéři skoro nemluvili a nechávali děti volně hrát",
        "Hráči trávili víc času v tréninkové formě než v herní formě",
        "Devítiletí trénovali úplně jinak než šestnáctiletí",
        "Většinu tréninku tvořily malé hry podobné zápasu",
      ],
      correct: 1,
      explain: "Trenéři dávali přednost tréninkové formě (kondice, technická cvičení) před herní formou a hodně mluvili, ať se dělalo cokoli.",
    },
    {
      id: "mladez-session-structure-2",
      lessonId: "mladez-session-structure",
      text: "Co patří podle studie Forda a kolegů do herní formy tréninku?",
      options: [
        "Kondiční běhání kolem hřiště",
        "Technická cvičení bez soupeře",
        "Teoretická přednáška u tabule v kabině",
        "Malé a upravené hry, které se podobají zápasu",
      ],
      correct: 3,
      explain: "Herní forma jsou malé a upravené hry blízké zápasu; kondice a technická cvičení patří do tréninkové formy.",
    },
    {
      id: "mladez-session-structure-3",
      lessonId: "mladez-session-structure",
      text: "Jak vypadá stavba tréninku Play–Practice–Play, kterou doporučuje US Soccer?",
      options: [
        "Hra, nácvik, hra",
        "Rozcvička, kondice, protahování",
        "Přednáška, nácvik, přednáška",
        "Běh, střelba, běh",
      ],
      correct: 0,
      explain: "Trénink začíná hrou, pokračuje nácvikem na téma tréninku a končí opět hrou.",
    },
    {
      id: "mladez-session-structure-4",
      lessonId: "mladez-session-structure",
      text: "Co dělá trenér podle US Soccer v závěrečné hře?",
      options: [
        "Zastavuje hru po každé chybě a vysvětluje",
        "Hraje s dětmi, aby jich bylo na hřišti víc",
        "Skoro nemluví a sleduje, jestli děti použijí, co nacvičily",
        "Rozdává tresty za ztracené míče",
      ],
      correct: 2,
      explain: "V závěrečné hře se hraje bez přerušování a trenér s minimem slov ověřuje, co si děti z nácviku odnesly.",
    },
    {
      id: "mladez-session-structure-5",
      lessonId: "mladez-session-structure",
      text: "Proti jakému tréninku podle lekce US Soccer svým modelem vědomě jde?",
      options: [
        "Proti tréninku, kde má každé dítě svůj míč",
        "Proti frontám, kolečkům kolem hřiště a cvičením, která se fotbalu nepodobají",
        "Proti malým hrám ve skupinách po dvou až čtyřech",
        "Proti tréninku, po kterém se jde na limonádu",
      ],
      correct: 1,
      explain: "US Soccer staví Play–Practice–Play proti tréninkům, kde děti stojí ve frontách, běhají kolečka a dělají cvičení nepodobná hře.",
    },

    // Rozcvička a pohybové hry
    {
      id: "mladez-warmup-games-1",
      lessonId: "mladez-warmup-games",
      text: "Kolik pohybu doporučuje WHO (2020) dětem a dospívajícím od 5 do 17 let?",
      options: [
        "Dva tréninky týdně po hodině, víc dětem škodí",
        "Aspoň 20 minut denně lehké chůze, intenzivní pohyb až od dorostu",
        "V průměru 30 minut denně, z toho polovinu protahování",
        "V průměru aspoň 60 minut denně středně až vysoce intenzivního pohybu",
      ],
      correct: 3,
      explain: "WHO doporučuje v průměru aspoň 60 minut denně středně až vysoce intenzivního, hlavně vytrvalostního pohybu.",
    },
    {
      id: "mladez-warmup-games-2",
      lessonId: "mladez-warmup-games",
      text: "Jak často má podle WHO do týdne dětí patřit intenzivní zátěž a posilování svalů a kostí?",
      options: [
        "Aspoň tři dny v týdnu",
        "Jednou za měsíc",
        "Jen v letní přípravě",
        "Vůbec, děti posilovat nemají",
      ],
      correct: 0,
      explain: "Intenzivní zátěž a cvičení posilující svaly a kosti mají být součástí aspoň tří dnů v týdnu.",
    },
    {
      id: "mladez-warmup-games-3",
      lessonId: "mladez-warmup-games",
      text: "O kolik méně zranění měly ve studii Rösslera a kolegů (2018) týmy, které dělaly rozcvičku 11+ Kids?",
      options: [
        "O 5 %",
        "O 15 %",
        "O 48 %",
        "Zranění měly stejně, jen méně bolavá",
      ],
      correct: 2,
      explain: "Týmy s 11+ Kids měly o 48 % méně zranění a o 74 % méně vážných zranění než týmy s obvyklou rozcvičkou.",
    },
    {
      id: "mladez-warmup-games-4",
      lessonId: "mladez-warmup-games",
      text: "Jak často doporučují autoři studie dělat rozcvičku 11+ Kids?",
      options: [
        "Jen před důležitými zápasy",
        "Aspoň jednou týdně, ještě lépe dvakrát",
        "Jednou za sezónu jako test",
        "Každý den dvakrát",
      ],
      correct: 1,
      explain: "Pro ochranný účinek stačí aspoň jednou týdně, dvakrát týdně je ještě lepší.",
    },
    {
      id: "mladez-warmup-games-5",
      lessonId: "mladez-warmup-games",
      text: "Proč nejsou ideální honičky s vyřazováním?",
      options: [
        "Protože jsou moc zábavné a děti pak nechtějí jiná cvičení",
        "Protože se při nich nedá měnit směr ani brzdit",
        "Protože je pravidla FAČR v tréninku přípravek zakazují",
        "Protože vypadnou hlavně ti, kdo pohyb potřebují nejvíc, a pak stojí",
      ],
      correct: 3,
      explain: "První bývá chycen nejpomalejší a pak se nehýbe; lepší je nechat chyceného hned se vrátit nebo se stát honičem.",
    },

    // Brankář v přípravce a žácích
    {
      id: "mladez-youth-goalkeeper-1",
      lessonId: "mladez-youth-goalkeeper",
      text: "Co podle FA platí o dětech v základní fázi rozvoje a jejich budoucích postech?",
      options: [
        "Nejvyšší dítě by mělo chytat napořád",
        "Post se musí určit do osmi let",
        "Nikdo neví, kdo bude jednou hrát na jakém postu",
        "Brankáře pozná trenér podle velikosti rukavic",
      ],
      correct: 2,
      explain: "FA upozorňuje, že u dětí v základní fázi nelze odhadnout budoucí post, proto doporučuje zkoušet různé posty.",
    },
    {
      id: "mladez-youth-goalkeeper-2",
      lessonId: "mladez-youth-goalkeeper",
      text: "Co radí FA u brankáře, který chytá rád?",
      options: [
        "Nechat ho hrát i v poli, aby se zlepšil s míčem u nohy",
        "Nepouštět ho nikdy z branky, ať neztratí cit",
        "Zakázat mu hrát nohama",
        "Trénovat s ním jen výkopy z ruky",
      ],
      correct: 0,
      explain: "I stálý brankář má hrát občas v poli, protože práce s míčem u nohy se mu bude hodit.",
    },
    {
      id: "mladez-youth-goalkeeper-3",
      lessonId: "mladez-youth-goalkeeper",
      text: "Co říká stanovisko US Youth Soccer o brankářích v kategoriích U6 a U8?",
      options: [
        "Každý tým musí mít stálého brankáře",
        "Brankáři by tam vůbec neměli být",
        "Brankář smí chytat i mimo pokutové území",
        "V brance má stát vždy trenér",
      ],
      correct: 1,
      explain: "Podle stanoviska mají děti U6 a U8 hrát bez brankářů, běhat a honit míč; brankář přichází až od U10.",
    },
    {
      id: "mladez-youth-goalkeeper-4",
      lessonId: "mladez-youth-goalkeeper",
      text: "Co podle US Youth Soccer platí o specializaci na post v kategoriích U10 a U12?",
      options: [
        "Každý hráč už má mít jediný post",
        "Specializovat se mají jen brankáři",
        "O postu rozhodují rodiče",
        "Hráči by se zatím neměli specializovat na žádný post",
      ],
      correct: 3,
      explain: "Od U10 brankář ke hře patří, ale v U10 a U12 se hráči podle stanoviska ještě nemají specializovat.",
    },
    {
      id: "mladez-youth-goalkeeper-5",
      lessonId: "mladez-youth-goalkeeper",
      text: "Co dělat podle FA s dítětem, kterému by branka vzala sebevědomí?",
      options: [
        "Postavit ho tam, ať se otrká",
        "Nechat ho chytat, ale jen penalty",
        "Do branky ho nenutit",
        "Poslat ho na zápas jen jako náhradníka",
      ],
      correct: 2,
      explain: "FA radí brát každé dítě zvlášť a toho, koho by branka rozhodila, do ní nenutit.",
    },

    // Hrací doba pro všechny
    {
      id: "mladez-playing-time-1",
      lessonId: "mladez-playing-time",
      text: "Jaký důvod konce se sportem uváděli rodiče v průzkumu Aspen Institute (2019) nejčastěji?",
      options: [
        "Sport dítě přestal bavit",
        "Příliš drahé kopačky",
        "Zákaz od lékaře",
        "Přestěhování do jiného města",
      ],
      correct: 0,
      explain: "Nejčastěji (36 %) rodiče uvedli, že sport dítě přestal bavit nebo o něj ztratilo zájem.",
    },
    {
      id: "mladez-playing-time-2",
      lessonId: "mladez-playing-time",
      text: "Kolik hrací doby by měl podle US Youth Soccer odehrát každý hráč do 12 let?",
      options: [
        "Aspoň 10 minut",
        "Jen tolik, kolik si zaslouží výkonem",
        "Aspoň 50 % hrací doby",
        "Celý zápas bez střídání",
      ],
      correct: 2,
      explain: "Stanovisko šéftrenérů US Youth Soccer doporučuje pro děti do 12 let aspoň 50 % hrací doby pro každého.",
    },
    {
      id: "mladez-playing-time-3",
      lessonId: "mladez-playing-time",
      text: "Jak se podle pravidel FAČR střídá u mladších žáků, kteří hrají 7+1?",
      options: [
        "Nejvýš třikrát za zápas a se svolením rozhodčího",
        "Opakovaně, při přerušení, a střídání se nemusí hlásit rozhodčímu",
        "Jen o přestávce mezi třetinami",
        "Střídat se nesmí vůbec",
      ],
      correct: 1,
      explain: "U mladších žáků 7+1 je střídání opakované, hráč smí odejít kdekoli a rozhodčímu se střídání nehlásí.",
    },
    {
      id: "mladez-playing-time-4",
      lessonId: "mladez-playing-time",
      text: "Kolik minut vychází na každého hráče, když hraješ 7+1 na 3 × 30 minut a máš na soupisce dvanáct hráčů?",
      options: [
        "30 minut",
        "45 minut",
        "90 minut",
        "60 minut",
      ],
      correct: 3,
      explain: "Osm hráčů na hřišti krát 90 minut je 720 hráčských minut; děleno dvanácti vychází 60 minut na každého.",
    },
    {
      id: "mladez-playing-time-5",
      lessonId: "mladez-playing-time",
      text: "K čemu podle lekce nemá sloužit lavička?",
      options: [
        "K odpočinku mezi střídáními",
        "K plánovanému rozdělení minut",
        "K trestu za chybu",
        "K tomu, aby se vystřídala i základní sestava",
      ],
      correct: 2,
      explain: "Lekce radí lavičku nepoužívat jako trest za chybu a minuty plánovat předem.",
    },

    // Růstový spurt a neobratnost
    {
      id: "mladez-growth-spurt-1",
      lessonId: "mladez-growth-spurt",
      text: "V jakém průměrném věku přišel vrchol růstu (PHV) u fotbalistů ve studii Philippaertse a kolegů (2006)?",
      options: [
        "V 10 letech",
        "Ve 13,8 letech",
        "V 16,5 letech",
        "V 18 letech",
      ],
      correct: 1,
      explain: "Vrchol růstu přišel v průměru ve 13,8 letech a kluci tehdy rostli asi o 9,7 cm za rok.",
    },
    {
      id: "mladez-growth-spurt-2",
      lessonId: "mladez-growth-spurt",
      text: "Co doporučili Philippaerts a kolegové trenérům pro období růstového spurtu?",
      options: [
        "Přizpůsobit zátěž každému hráči zvlášť",
        "Přidat všem stejně, ať to doženou",
        "Na rok přerušit všechny tréninky",
        "Trénovat jen sílu v posilovně",
      ],
      correct: 0,
      explain: "Protože každý prochází spurtem jinak, má se tréninková zátěž v tomto období individualizovat.",
    },
    {
      id: "mladez-growth-spurt-3",
      lessonId: "mladez-growth-spurt",
      text: "Co podle přehledu Borata a kolegů (2025) platí o adolescentní neobratnosti?",
      options: [
        "Postihne každého hráče přesně ve 14 letech",
        "Dá se spolehlivě změřit jedním testem",
        "Je to jen výmluva líných hráčů",
        "Nemá jednotnou definici ani test a výsledky studií se liší",
      ],
      correct: 3,
      explain: "Přehled zjistil, že chybí jednotná definice i test; některé studie zhoršení našly, jiné ne a mezi dětmi jsou velké rozdíly.",
    },
    {
      id: "mladez-growth-spurt-4",
      lessonId: "mladez-growth-spurt",
      text: "Co zjistili van der Sluis a kolegové (2014) o zameškaných dnech kvůli zraněním?",
      options: [
        "V roce PHV jich bylo méně než předtím",
        "Zameškané dny se s růstem neměnily",
        "V roce PHV jich bylo zhruba dvakrát tolik než rok předtím",
        "Hráči v roce PHV nezameškali ani den",
      ],
      correct: 2,
      explain: "V roce vrcholu růstu měli hráči víc úrazů a zhruba dvakrát tolik zameškaných dnů než rok předtím.",
    },
    {
      id: "mladez-growth-spurt-5",
      lessonId: "mladez-growth-spurt",
      text: "Kdy našli Bult a kolegové (2018) nejvíc zranění?",
      options: [
        "V půlroce po vrcholu růstu",
        "Dva roky před vrcholem růstu",
        "Až po dvacítce",
        "V přípravce",
      ],
      correct: 0,
      explain: "Nizozemská studie Bulta a kolegů našla nejvíc zranění v půlroce po PHV.",
    },

    // Bolesti růstu: koleno a pata
    {
      id: "mladez-growth-pains-1",
      lessonId: "mladez-growth-pains",
      text: "Kde bolí Osgood-Schlatterova choroba?",
      options: [
        "Na patě, kde se upíná Achillova šlacha",
        "V kyčli při otáčení",
        "Těsně pod čéškou, na hrbolku holenní kosti",
        "V zádech po dlouhém sezení",
      ],
      correct: 2,
      explain: "Bolí na kostním hrbolku holenní kosti pod čéškou, kam se upíná šlacha čéšky.",
    },
    {
      id: "mladez-growth-pains-2",
      lessonId: "mladez-growth-pains",
      text: "Kdy potíže Osgood-Schlatterovy choroby obvykle odezní?",
      options: [
        "Hned po prvním týdnu klidu, v jakémkoli věku",
        "Nikdy, bolest zůstane i po skončení růstu",
        "Až po čtyřicítce, kdy se šlachy zklidní",
        "Po skončení spurtu, u dívek zhruba ve 14, u chlapců zhruba v 16 letech",
      ],
      correct: 3,
      explain: "Potíže obvykle mizí s koncem spurtu; hrbolek pod kolenem ale většinou zůstane.",
    },
    {
      id: "mladez-growth-pains-3",
      lessonId: "mladez-growth-pains",
      text: "Co podle AAOS platí o pokračování ve sportu při Osgood-Schlatterově chorobě?",
      options: [
        "Kolenu dlouhodobě neublíží",
        "Vždy vede k operaci",
        "Je zakázáno až do dospělosti",
        "Koleno trvale zničí",
      ],
      correct: 0,
      explain: "AAOS uvádí, že pokračování ve sportu kolenu dlouhodobě neublíží; zátěž se upravuje podle bolesti.",
    },
    {
      id: "mladez-growth-pains-4",
      lessonId: "mladez-growth-pains",
      text: "Kde se projevuje Severova choroba?",
      options: [
        "Na kotníku po podvrtnutí",
        "Na patní kosti, kam se upíná Achillova šlacha",
        "Pod čéškou na holenní kosti",
        "Na palci u nohy z těsných kopaček",
      ],
      correct: 1,
      explain: "Severova choroba je podráždění růstové ploténky na patní kosti v místě úponu Achillovy šlachy.",
    },
    {
      id: "mladez-growth-pains-5",
      lessonId: "mladez-growth-pains",
      text: "Kdy se Severova choroba už nevrátí?",
      options: [
        "Když dítě přestane nosit kopačky",
        "Po první zimní přestávce",
        "Když ji dítě „rozběhá“",
        "Jakmile růstová ploténka na patě zkostnatí",
      ],
      correct: 3,
      explain: "Při větší zátěži se potíže můžou vracet, ale po zkostnatění ploténky se Severova choroba už neobjeví.",
    },

    // Dospívání a odchody ze sportu
    {
      id: "mladez-teen-dropout-1",
      lessonId: "mladez-teen-dropout",
      text: "Co bylo podle studie Van Yperena, Jonkera a Verbeeka (2021) hlavním ukazatelem odchodu z fotbalu?",
      options: [
        "Výška hráče",
        "Radost z fotbalu",
        "Počet vstřelených gólů",
        "Barva klubových dresů",
      ],
      correct: 1,
      explain: "Hlavním ukazatelem krátkodobého i dlouhodobého odchodu byla radost z fotbalu.",
    },
    {
      id: "mladez-teen-dropout-2",
      lessonId: "mladez-teen-dropout",
      text: "Co ještě podle stejné studie platilo o hráčích, kteří z fotbalu odešli?",
      options: [
        "Hráli v nejlepších klubech a měli nejvíc tréninků",
        "Měli v klubu nejvíc příbuzných a začínali nejdřív",
        "Častěji viděli jiné možnosti, měli v klubu méně rodiny a začínali později",
        "Byli vyšší než ostatní a dávali víc gólů",
      ],
      correct: 2,
      explain: "Odcházející hráči viděli víc jiných možností, měli v klubu méně členů rodiny a s klubovým fotbalem začínali později.",
    },
    {
      id: "mladez-teen-dropout-3",
      lessonId: "mladez-teen-dropout",
      text: "Co zjistila souhrnná studie Craneové a Templeové (2015) o odchodech ze sportu?",
      options: [
        "Častěji než vnější okolnosti za nimi stály věci uvnitř hráče a vztahy s lidmi",
        "Hlavní příčinou byly téměř vždy peníze a drahé vybavení",
        "Za odchody mohly hlavně čas, dojíždění a špatná hřiště",
        "Ze sportu odcházeli jen nejslabší hráči, ostatní zůstali",
      ],
      correct: 0,
      explain: "Věci uvnitř hráče (třeba že ho to nebaví) a vztahy s lidmi kolem souvisely s odchodem častěji než čas, peníze nebo dojíždění.",
    },
    {
      id: "mladez-teen-dropout-4",
      lessonId: "mladez-teen-dropout",
      text: "Jaké tři základní potřeby popisuje teorie sebeurčení Ryana a Deciho?",
      options: [
        "Jídlo, spánek a pohyb",
        "Disciplínu, poslušnost a strach",
        "Peníze, slávu a výhry",
        "Autonomii, kompetenci a vztahy",
      ],
      correct: 3,
      explain: "Motivaci podporuje naplnění tří potřeb: autonomie, kompetence a vztahů (sounáležitosti).",
    },
    {
      id: "mladez-teen-dropout-5",
      lessonId: "mladez-teen-dropout",
      text: "Jak podle lekce podpořit autonomii dorostenců?",
      options: [
        "Vést každé cvičení přesně podle plánu a nic nevysvětlovat",
        "Nechat kapitána vést rozcvičku a vysvětlovat, proč se co trénuje",
        "Zakázat hráčům na tréninku mluvit, ať se soustředí",
        "Rozhodovat za ně o všem, i o tom, kdy se smějí napít",
      ],
      correct: 1,
      explain: "Autonomie znamená, že hráč může sám rozhodovat a ví proč; pomáhá vedení rozcvičky kapitánem i ptaní se na názor.",
    },

    // Přechod z dorostu do dospělých
    {
      id: "mladez-junior-to-senior-1",
      lessonId: "mladez-junior-to-senior",
      text: "Jak dlouho podle přehledu Tomáse a kolegů (2025) obvykle trvá přechod z juniorů do dospělých?",
      options: [
        "Jeden zápas",
        "Jednu přípravu",
        "Jeden až čtyři roky",
        "Deset let",
      ],
      correct: 2,
      explain: "Přehled 35 studií uvádí, že přechod obvykle trvá jeden až čtyři roky.",
    },
    {
      id: "mladez-junior-to-senior-2",
      lessonId: "mladez-junior-to-senior",
      text: "Co patří podle přehledu k hlavním překážkám přechodu?",
      options: [
        "Nedostatek příležitostí v prvním týmu",
        "Příliš mnoho tréninků s áčkem",
        "Hostování o třídu níž",
        "Dobrá komunikace mezi trenéry",
      ],
      correct: 0,
      explain: "Nedostatek příležitostí hrát v prvním týmu je podle přehledu jednou z hlavních překážek.",
    },
    {
      id: "mladez-junior-to-senior-3",
      lessonId: "mladez-junior-to-senior",
      text: "K čemu podle přehledu pomáhá hostování?",
      options: [
        "K tomu, aby si klub ušetřil na dresech",
        "Zvyknout si na fyzické, taktické i rozhodovací nároky dospělého fotbalu",
        "Hlavně k odpočinku od fotbalu",
        "K tomu, aby hráč mohl vynechávat tréninky",
      ],
      correct: 1,
      explain: "Hostování je podle přehledu klíčová cesta, jak si zvyknout na nároky dospělého fotbalu.",
    },
    {
      id: "mladez-junior-to-senior-4",
      lessonId: "mladez-junior-to-senior",
      text: "Co zjistila studie Morrise, Toda a Olivera (2015) o klubu s programem pro přechod mladých?",
      options: [
        "Utratil za pomoc hráčům mnohem víc a výsledky měl horší",
        "Neudržel žádného hráče",
        "Výsledky byly stejné jako bez programu",
        "Měl lepší výsledky přechodu a za pomoc hráčům utratil méně",
      ],
      correct: 3,
      explain: "Klub s promyšleným programem měl lepší výsledky přechodu a přitom vynaložil na podporu hráčů méně.",
    },
    {
      id: "mladez-junior-to-senior-5",
      lessonId: "mladez-junior-to-senior",
      text: "Co z hlediska organizace klubu přechod usnadňuje?",
      options: [
        "Když mládež a první tým trénují na stejném místě",
        "Když trenéři mládeže a áčka spolu nemluví",
        "Když dorost trénuje v jiném městě než áčko",
        "Když se o přechodu rozhoduje až v létě po sezóně",
      ],
      correct: 0,
      explain: "Společné tréninkové místo přechod usnadňuje, chybějící komunikace mezi trenéry ho naopak brzdí.",
    },

    // Hlavičkování u dětí
    {
      id: "mladez-heading-1",
      lessonId: "mladez-heading",
      text: "Co zjistila studie Mackaye a kolegů (2019) u bývalých skotských profesionálů?",
      options: [
        "Častěji umírali na nemoci srdce",
        "Riziko úmrtí na neurodegenerativní onemocnění měli asi 3,5krát vyšší",
        "Prokázala, že demenci způsobuje každá hlavička",
        "Žádné rozdíly proti běžné populaci",
      ],
      correct: 1,
      explain: "Bývalí profesionálové měli asi 3,5krát vyšší riziko úmrtí na neurodegenerativní onemocnění; na nemoci srdce umírali méně.",
    },
    {
      id: "mladez-heading-2",
      lessonId: "mladez-heading",
      text: "Co doporučuje US Soccer pro děti v kategoriích U11 a mladší?",
      options: [
        "Hlavičkovat jen v zápasech",
        "Hlavičkovat jen s lehkým míčem",
        "Nejvýš deset hlaviček týdně",
        "Nehlavičkovat vůbec, ani v tréninku, ani v zápase",
      ],
      correct: 3,
      explain: "US Soccer doporučuje, aby děti U11 a mladší nehlavičkovaly v tréninku ani v zápase.",
    },
    {
      id: "mladez-heading-3",
      lessonId: "mladez-heading",
      text: "Jaké omezení nácviku hlavičky doporučuje US Soccer pro kategorie U12 a U13?",
      options: [
        "Nejvýš 30 minut týdně a nejvýš 15–20 hlaviček na hráče za týden",
        "Nejvýš 100 hlaviček za trénink",
        "Žádné, ve dvanácti už se smí všechno",
        "Hlavičkovat jen v zápasech, v tréninku nikdy",
      ],
      correct: 0,
      explain: "Pro U12 a U13 je nácvik omezen na 30 minut týdně a 15–20 hlaviček na hráče týdně; zápasy omezené nejsou.",
    },
    {
      id: "mladez-heading-4",
      lessonId: "mladez-heading",
      text: "Jak se podle FA trestá úmyslná hlavička v zápasech nejmladších kategorií?",
      options: [
        "Pokutovým kopem",
        "Žlutou kartou pro hráče",
        "Nepřímým volným kopem",
        "Vyloučením trenéra",
      ],
      correct: 2,
      explain: "Úmyslná hlavička se v kategoriích, kde je zakázaná, trestá nepřímým volným kopem.",
    },
    {
      id: "mladez-heading-5",
      lessonId: "mladez-heading",
      text: "Jak smějí podle FA trénovat hlavičku hráči U12 a U13?",
      options: [
        "Neomezeně, ale vždy v souboji se soupeřem",
        "Jednou týdně, lehkým míčem, nejvýš pět opakování, bez soupeře",
        "Každý den deset minut po tréninku s plným míčem",
        "Dvakrát týdně, nejvýš dvacet hlaviček na hráče",
      ],
      correct: 1,
      explain: "FA pro U12 a U13 připouští hlavičku jen v jednom tréninku týdně, s lehkými míči, do pěti opakování a bez soupeře.",
    },

    // Otřes mozku: poznat a stáhnout
    {
      id: "mladez-concussion-1",
      lessonId: "mladez-concussion",
      text: "Kdo má podle konsenzu Concussion in Sport Group používat nástroj CRT6?",
      options: [
        "Jen lékař nebo fyzioterapeut na stadionu",
        "Jen rozhodčí s licencí od svazu",
        "Jen trenéři profesionálních akademií",
        "Každý dospělý, který dohlíží na sport dětí",
      ],
      correct: 3,
      explain: "Konsenzus doporučuje CRT6 všem dospělým, kteří dohlížejí na sport dětí a dospívajících, tedy i trenérům.",
    },
    {
      id: "mladez-concussion-2",
      lessonId: "mladez-concussion",
      text: "Která z těchto potíží je podle CRT6 červená vlajka, kvůli které voláš záchranku?",
      options: [
        "Slabost nebo brnění rukou či nohou",
        "Odřený loket",
        "Křeč v lýtku po sprintu",
        "Žízeň po zápase",
      ],
      correct: 0,
      explain: "Slabost nebo brnění končetin patří mezi červené vlajky spolu s bolestí krku, dvojitým viděním, zvracením a dalšími.",
    },
    {
      id: "mladez-concussion-3",
      lessonId: "mladez-concussion",
      text: "Kdy se smí hráč s podezřením na otřes mozku vrátit do hry?",
      options: [
        "Po pěti minutách, když se mu uleví",
        "Ve druhém poločase, pokud se napije",
        "Ten den už nehraje, i když se mu uleví",
        "Hned, pokud nekrvácí",
      ],
      correct: 2,
      explain: "Hráč s podezřením na otřes jde ze hry a ten den už nehraje, platí heslo „když váháš, stáhni“.",
    },
    {
      id: "mladez-concussion-4",
      lessonId: "mladez-concussion",
      text: "Co doporučuje konsenzus v prvních dnech po otřesu mozku?",
      options: [
        "Týden úplného klidu ve tmě, bez telefonu a lidí",
        "24–48 hodin relativního klidu a pak postupný návrat",
        "Hned druhý den plný trénink, ať se hlava rozhýbe",
        "Úplný klid bez pohybu až do konce sezóny",
      ],
      correct: 1,
      explain: "Úplný klid se nedoporučuje; po 24–48 hodinách relativního klidu přichází postupný návrat po krocích.",
    },
    {
      id: "mladez-concussion-5",
      lessonId: "mladez-concussion",
      text: "Kdy nejdřív smí hráč po otřesu mozku do zápasu s rizikem kontaktu podle britských pravidel pro amatérský sport?",
      options: [
        "Druhý den",
        "Po týdnu",
        "Po třech měsících",
        "Nejdřív po 21 dnech",
      ],
      correct: 3,
      explain: "Britská pravidla pro amatérský sport stanoví pro návrat do zápasu s rizikem kontaktu nejméně 21 dní.",
    },

    // Horko a pitný režim
    {
      id: "mladez-heat-hydration-1",
      lessonId: "mladez-heat-hydration",
      text: "Co podle stanoviska AAP (2011) platí o dětech ve sportu v horku?",
      options: [
        "Děti horko nesnášejí nikdy, sportovat v létě nesmějí",
        "Děti horko snášejí lépe než dospělí, pít nemusejí",
        "Pokud dobře pijí, zvládají horko podobně jako dospělí",
        "Horko dětem vadí jen na umělé trávě",
      ],
      correct: 2,
      explain: "Novější výzkumy ukázaly, že dobře napité děti zvládají horko podobně jako dospělí; rizika jsou hlavně ve zátěži a pití.",
    },
    {
      id: "mladez-heat-hydration-2",
      lessonId: "mladez-heat-hydration",
      text: "Kolik pití podle AAP obvykle stačí dětem ve věku 9–12 let při sportu?",
      options: [
        "100–250 ml každých 20 minut",
        "Jedna sklenice za celý turnaj",
        "Dva litry naráz před zápasem",
        "Jen když mají žízeň, a to po zápase",
      ],
      correct: 0,
      explain: "AAP uvádí pro děti 9–12 let obvykle 100–250 ml každých 20 minut, pro dospívající až 1–1,5 litru za hodinu.",
    },
    {
      id: "mladez-heat-hydration-3",
      lessonId: "mladez-heat-hydration",
      text: "Jak dlouho si podle AAP děti obvykle zvykají na horko?",
      options: [
        "Jedno odpoledne",
        "10–14 dní",
        "Tři měsíce",
        "Na horko si zvyknout nelze",
      ],
      correct: 1,
      explain: "Postupné přivykání na horko trvá podle AAP obvykle 10–14 dní.",
    },
    {
      id: "mladez-heat-hydration-4",
      lessonId: "mladez-heat-hydration",
      text: "Kolik času má podle AAP v horku zůstat mezi zápasy jednoho dne?",
      options: [
        "Deset minut",
        "Půl hodiny",
        "Žádný, ať se nevychladnou",
        "Aspoň 2 hodiny",
      ],
      correct: 3,
      explain: "AAP doporučuje pořadatelům v horku nechat mezi zápasy jednoho dne aspoň 2 hodiny na odpočinek.",
    },
    {
      id: "mladez-heat-hydration-5",
      lessonId: "mladez-heat-hydration",
      text: "Jak postupovat u dítěte s podezřením na úpal?",
      options: [
        "Zabalit ho do deky, ať nedostane šok, a čekat na rodiče",
        "Dát mu najíst, posadit ho do auta a poslat domů",
        "Volat záchranku a hned chladit, nejlépe ve studené vodě",
        "Nechat ho dohrát a pak mu dát studenou limonádu",
      ],
      correct: 2,
      explain: "Úpal ohrožuje život: volá se záchranka a chladí se hned, nejlépe studenou vodou; chlazení nečeká na sanitku.",
    },

    // Ochrana dětí v klubu
    {
      id: "mladez-safeguarding-1",
      lessonId: "mladez-safeguarding",
      text: "Co uvádí FA o dospělých v šatnách, kde se převlékají děti?",
      options: [
        "Dospělí se nepřevlékají ani nesprchují ve stejnou dobu jako děti ve stejných prostorách",
        "Dospělí se mají sprchovat s dětmi, aby na ně dohlédli",
        "Do šatny smí jen trenér, sám",
        "V šatně má být kamera pro bezpečnost",
      ],
      correct: 0,
      explain: "Podle FA se dospělí nepřevlékají ani nesprchují zároveň s dětmi ve stejných prostorách.",
    },
    {
      id: "mladez-safeguarding-2",
      lessonId: "mladez-safeguarding",
      text: "Kolik dospělých má podle FA dohlížet na děti, když se převlékají?",
      options: [
        "Žádný, děti si poradí samy",
        "Jeden trenér",
        "Celý výbor klubu",
        "Dva dospělí z klubu",
      ],
      correct: 3,
      explain: "FA doporučuje, aby na převlékající se děti dohlíželi dva dospělí z klubu.",
    },
    {
      id: "mladez-safeguarding-3",
      lessonId: "mladez-safeguarding",
      text: "Co znamená pravidlo centra SafeSport „vidět a dát se přerušit“?",
      options: [
        "Trenér musí každou chvíli přerušit trénink",
        "Jiný dospělý na kontakt dospělého s dítětem vidí a může vstoupit",
        "Děti se smí dívat jen na zápasy dospělých",
        "Rozhodčí může zápas kdykoli přerušit",
      ],
      correct: 1,
      explain: "Každý kontakt dospělého s dítětem o samotě má probíhat tak, aby ho jiný dospělý viděl a mohl ho přerušit.",
    },
    {
      id: "mladez-safeguarding-4",
      lessonId: "mladez-safeguarding",
      text: "Jak má trenér podle lekce posílat zprávy dětem?",
      options: [
        "Soukromě přes svůj osobní profil na sociální síti",
        "Jen v noci, aby nerušil školu",
        "Tak, aby je viděli i rodiče, třeba do skupiny, kde jsou s nimi",
        "Vůbec, s dětmi se komunikovat nesmí",
      ],
      correct: 2,
      explain: "Zprávy dětem mají vidět i rodiče a soukromé psaní přes osobní sociální sítě se nedoporučuje.",
    },
    {
      id: "mladez-safeguarding-5",
      lessonId: "mladez-safeguarding",
      text: "Co nemáš dělat, když ti dítě svěří, že mu někdo ubližuje?",
      options: [
        "Slíbit mu, že to zůstane tajemstvím",
        "Poslouchat ho a brát ho vážně",
        "Řešit to hned s vedením klubu nebo s odborníky",
        "Při bezprostředním ohrožení volat policii",
      ],
      correct: 0,
      explain: "Mlčení slibovat nelze, protože věc je potřeba hned předat vedení klubu nebo odborníkům.",
    },

    // Výběr talentů a jeho omyly
    {
      id: "mladez-talent-identification-1",
      lessonId: "mladez-talent-identification",
      text: "Jak velká byla podle Güllicha (2014) roční obměna hráčů v německých mládežnických reprezentacích?",
      options: [
        "Asi 5 %",
        "Žádná, hráči zůstávali stejní",
        "Asi 41 %",
        "Asi 90 %",
      ],
      correct: 2,
      explain: "V mládežnických reprezentacích se ročně vyměnilo 41 % hráčů, v akademiích 24,5 %.",
    },
    {
      id: "mladez-talent-identification-2",
      lessonId: "mladez-talent-identification",
      text: "K jakému závěru o původu profesionálů došel Güllich?",
      options: [
        "Všichni byli vybráni už v přípravce a pak nepřetržitě rozvíjeni",
        "Profesionálové nikdy nebyli v žádném talentovém programu",
        "Rozhodoval jen měsíc narození",
        "Vzešli z opakovaného vybírání a vyřazování, ne z jednoho brzkého výběru",
      ],
      correct: 3,
      explain: "Hráči bundesligy přicházeli do programů v různém věku; profesionálové tedy vznikli opakovaným výběrem a vyřazováním.",
    },
    {
      id: "mladez-talent-identification-3",
      lessonId: "mladez-talent-identification",
      text: "Co zjistili Hill a kolegové (2020) v kategoriích U15 a U16 anglické akademie?",
      options: [
        "Akademie neměla žádného pozdě dospívajícího hráče",
        "Většina hráčů dospívala pozdě",
        "Zralost hráčů nehrála žádnou roli",
        "Všichni hráči se narodili v prosinci",
      ],
      correct: 0,
      explain: "Zvýhodnění vyspělejších hráčů rostlo od U12 a v U15 a U16 už nebyl v akademii žádný pozdě dospívající hráč.",
    },
    {
      id: "mladez-talent-identification-4",
      lessonId: "mladez-talent-identification",
      text: "Co zdůrazňují Hill a kolegové o relativním věku a biologické zralosti?",
      options: [
        "Jsou to dvě různé věci a každá potřebuje vlastní opatření",
        "Jsou to dva názvy pro totéž",
        "Stačí řešit relativní věk, zralost se srovná sama",
        "Obojí se dá vyřešit jen rentgenem",
      ],
      correct: 0,
      explain: "Relativní věk a zralost působí nezávisle, proto na každé zvýhodnění potřebuje akademie jiný přístup.",
    },
    {
      id: "mladez-talent-identification-5",
      lessonId: "mladez-talent-identification",
      text: "Co doporučuje přehled Sarmenta a kolegů (2018) při hodnocení talentů?",
      options: [
        "Vybírat hlavně podle výšky a váhy v dvanácti letech",
        "Hlavně techniku a taktiku, tělesné údaje brát s ohledem na věk a vývoj",
        "Hodnotit jen výsledky kondičních testů a sprintu",
        "Spoléhat na první dojem zkušeného skauta z jednoho zápasu",
      ],
      correct: 1,
      explain: "Výhody nejlepších hráčů se mění nelineárně, proto se má hodnotit technika a taktika a tělesné údaje brát s ohledem na věk a zralost.",
    },

    // Bio-banding v praxi
    {
      id: "mladez-bio-banding-1",
      lessonId: "mladez-bio-banding",
      text: "Jaký ukazatel zralosti se pro bio-banding podle Maliny a kolegů (2019) používá nejčastěji?",
      options: [
        "Datum narození",
        "Velikost bot",
        "Procento předpokládané dospělé výšky",
        "Počet odehraných zápasů",
      ],
      correct: 2,
      explain: "Nejčastěji se zralost odhaduje jako procento předpokládané dospělé výšky v době měření.",
    },
    {
      id: "mladez-bio-banding-2",
      lessonId: "mladez-bio-banding",
      text: "Z čeho odhaduje metoda Khamise a Rocheho dospělou výšku dítěte?",
      options: [
        "Jen z data narození a školního ročníku",
        "Z rentgenu ruky a kostního věku",
        "Z rychlosti běhu na 30 metrů a z výskoku",
        "Z věku, pohlaví, výšky a váhy dítěte a z výšky rodičů",
      ],
      correct: 3,
      explain: "Metoda Khamise a Rocheho nepotřebuje rentgen; stačí věk, pohlaví, výška a váha dítěte a výška rodičů.",
    },
    {
      id: "mladez-bio-banding-3",
      lessonId: "mladez-bio-banding",
      text: "Jaké omezení má metoda Khamise a Rocheho?",
      options: [
        "Vznikla na bílých amerických dětech z Ohia, jinde může být méně přesná",
        "Funguje jen u brankářů a obránců",
        "Dá se použít až u dospělých po skončení růstu",
        "Vyžaduje vyšetření magnetickou rezonancí v nemocnici",
      ],
      correct: 0,
      explain: "Metoda vznikla na datech bílých amerických dětí z dlouhodobé studie v Ohiu, proto jinde nemusí být tak přesná.",
    },
    {
      id: "mladez-bio-banding-4",
      lessonId: "mladez-bio-banding",
      text: "Co řekli dříve vyspělí hráči o turnaji podle zralosti ve studii Cumminga a kolegů (2018)?",
      options: [
        "Že to byla snadná procházka a nic se nenaučili",
        "Že zápasy byly fyzicky náročnější a museli víc hrát technikou a taktikou",
        "Že je turnaj odradil a fotbal už hrát nechtějí",
        "Že soupeři byli menší a pomalejší než obvykle",
      ],
      correct: 1,
      explain: "Proti stejně vyspělým soupeřům nestačila síla, takže museli víc hrát technikou a taktikou.",
    },
    {
      id: "mladez-bio-banding-5",
      lessonId: "mladez-bio-banding",
      text: "Co podle Maliny a kolegů platí o účinku bio-bandingu?",
      options: [
        "Rozdíly ve zralosti úplně odstraní",
        "Rozdíly ve zralosti ještě zvětší",
        "Na rozdíly ve zralosti nemá vliv",
        "Rozdíly ve zralosti zmenšuje, ale neodstraní",
      ],
      correct: 3,
      explain: "Bio-banding rozdíly ve zralosti zmenšuje, ale úplně je neodstraní; rovnice pro odhad výšky navíc potřebuje další ověřování.",
    },

    // Duální kariéra: škola a fotbal
    {
      id: "mladez-dual-career-1",
      lessonId: "mladez-dual-career",
      text: "Co znamená duální kariéra podle evropských směrnic EU Guidelines on Dual Careers of Athletes?",
      options: [
        "Hrát v jedné sezóně současně za dva kluby",
        "Sportovní kariéru jako součást celoživotní dráhy spolu se školou nebo prací",
        "Být zároveň hráčem a rozhodčím v okresní soutěži",
        "Střídat během roku fotbal na trávě a futsal v hale",
      ],
      correct: 1,
      explain: "Duální kariéra znamená zahájit, rozvinout a dokončit sportovní kariéru spolu se vzděláním nebo prací.",
    },
    {
      id: "mladez-dual-career-2",
      lessonId: "mladez-dual-career",
      text: "Jak dlouho podle směrnic EU obvykle trvá duální kariéra?",
      options: [
        "Jeden školní rok",
        "Dva až tři roky",
        "15 až 20 let",
        "Celý život bez konce",
      ],
      correct: 2,
      explain: "Směrnice uvádějí, že duální kariéra obvykle trvá 15 až 20 let.",
    },
    {
      id: "mladez-dual-career-3",
      lessonId: "mladez-dual-career",
      text: "Proč podle směrnic EU každý rok odchází ze sportu zhruba třetina mladých ve věku 10–17 let?",
      options: [
        "Sport jim bere příliš času a brání v jiném, třeba ve studiu",
        "Mají příliš málo tréninků a začnou se nudit",
        "Nemají kde hrát, protože hřiště chátrají",
        "Chtějí se místo hraní stát rozhodčími",
      ],
      correct: 0,
      explain: "Podle mezinárodních výzkumů citovaných ve směrnicích mladí odcházejí, protože jim sport bere příliš času.",
    },
    {
      id: "mladez-dual-career-4",
      lessonId: "mladez-dual-career",
      text: "Od kolika let mají podle směrnic EU začínat strategie vrcholového sportu?",
      options: [
        "Od narození",
        "Od 18 let",
        "Až po maturitě",
        "Zhruba od 10–12 let",
      ],
      correct: 3,
      explain: "Směrnice považují věk zhruba 10–12 let za začátek strategií vrcholového sportu, vždy s důrazem na rozvoj dítěte.",
    },
    {
      id: "mladez-dual-career-5",
      lessonId: "mladez-dual-career",
      text: "Co se podle směrnic EU často stane, když dítě přejde na jinou školu?",
      options: [
        "Automaticky se zlepší ve sportu",
        "Musí přestoupit do jiného klubu",
        "Rozpadne se parta kamarádů, se kterou začalo sportovat",
        "Dostane od svazu stipendium",
      ],
      correct: 2,
      explain: "Při přechodu na jinou školu se děti rozptýlí a rozpadne se parta, která je ke sportu často přivedla.",
    },

    // Akademie a cesta talentu
    {
      id: "mladez-regional-academies-1",
      lessonId: "mladez-regional-academies",
      text: "Pro jaký věk jsou podle FAČR určené regionální fotbalové akademie (RFA)?",
      options: [
        "Pro hráče ve věku 14 a 15 let",
        "Pro přípravkáře od 6 let",
        "Pro dospělé hráče do 23 let",
        "Pro veterány nad 35 let",
      ],
      correct: 0,
      explain: "RFA jsou určené pro talentované hráče ve věku 14 a 15 let, tedy pro kategorie U14 a U15.",
    },
    {
      id: "mladez-regional-academies-2",
      lessonId: "mladez-regional-academies",
      text: "Co je podle FAČR základním kritériem výběru do RFA?",
      options: [
        "Výška, váha a síla odrazu hráče",
        "Výsledek vytrvalostního běhu na tři kilometry",
        "Počet vstřelených gólů v okresní soutěži",
        "Herní inteligence, tedy rychlé a správné rozhodování ve hře",
      ],
      correct: 3,
      explain: "Základním kritériem je herní inteligence, tedy jak rychle a správně hráč ve hře rozhoduje a jak to provede.",
    },
    {
      id: "mladez-regional-academies-3",
      lessonId: "mladez-regional-academies",
      text: "Jak trenéři RFA hráče nejčastěji vybírají?",
      options: [
        "Podle doporučení rodičů",
        "Opakovaným pozorováním přímo ve hře",
        "Jednorázovým testem v posilovně",
        "Losováním ze seznamu přihlášených",
      ],
      correct: 1,
      explain: "Výběr probíhá průběžně dva roky a nejčastější formou je opakované pozorování herního výkonu ve hře.",
    },
    {
      id: "mladez-regional-academies-4",
      lessonId: "mladez-regional-academies",
      text: "Jak Karel Poborský zdůvodnil, proč FAČR klade v akademiích velký důraz na školu?",
      options: [
        "Protože škola nahradí trénink",
        "Protože to vyžadují pravidla fotbalu",
        "Protože dětí, které se fotbalem budou živit, je jen pár",
        "Protože akademie sídlí ve škole a jinde není místo",
      ],
      correct: 2,
      explain: "Většina hráčů se fotbalem živit nebude, proto akademie dbají, aby hráči dobře zvládli i školu.",
    },
    {
      id: "mladez-regional-academies-5",
      lessonId: "mladez-regional-academies",
      text: "S kým akademie RFA spolupracují kvůli povinné školní docházce hráčů?",
      options: [
        "S vysokými školami",
        "S vybranými základními školami",
        "S autoškolami",
        "Se školami v zahraničí",
      ],
      correct: 1,
      explain: "Hráči RFA plní povinnou školní docházku na vybraných základních školách, se kterými akademie spolupracují.",
    },
  ],
};
