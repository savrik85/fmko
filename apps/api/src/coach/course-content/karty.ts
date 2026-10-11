/**
 * Skripta a otázky kurzu „Disciplína“ (karty, přestupky, tresty, fair play).
 *
 * Zdroje: pravidla IFAB 2026/27 (theifab.com: pravidlo 3, 5, 12, 13, 14, změny 2026/27,
 * „Only the captain“, Guidelines for temporary dismissals) a Pravidla fotbalu FAČR
 * (česká terminologie a výklad k pravidlu 3). Disciplinární řád FAČR (tresty za počet
 * žlutých, pokuty) záměrně vynechán.
 *
 * Pokročilé lekce o hře rukou a VAR (ověřeno v říjnu 2026 na theifab.com):
 * - pravidlo 12 v. 2026/27 (Handling the ball, Cautionable a Sending-off offences) a otázky
 *   a odpovědi k pravidlu 12 (rameno, náhodná ruka střelce a spoluhráče, brankář mimo vápno),
 * - Video Assistant Referee (VAR) protocol v. 2026/27 (principy, pět přezkoumatelných oblastí,
 *   kontrola a přezkoumání, OFR, konečné rozhodnutí, hráči a funkcionáři) a jeho FAQ
 *   (přehlédnutá druhá žlutá),
 * - Law changes 2026/27 (rozšíření VAR: nesprávná druhá žlutá, záměna hráče z kteréhokoli týmu,
 *   chybně nařízený roh jako možnost soutěže),
 * - článek IFAB „Historic step for greater fairness in football“ (3. 3. 2018, filozofie
 *   „minimum interference – maximum benefit“).
 * České termíny pro VAR (kontrola, přezkoumání, OFR) jsou překlad, oficiální znění FAČR nebylo
 * dostupné.
 */
import type { CategoryContent } from "./types";

export const KARTY: CategoryContent = {
  lessons: [
    {
      id: "karty-volne-kopy",
      category: "karty",
      difficulty: 1,
      title: "Přímý a nepřímý volný kop",
      body: `Když sudí odpíská faul, první otázka zní: **přímý**, nebo **nepřímý**? Rozdíl je zásadní. Z **přímého volného kopu** můžeš dát gól rovnou. Z **nepřímého** platí gól, jen když se míče předtím dotkne ještě jiný hráč.

**Přímý volný kop** se nařizuje, když hráč proti soupeři nedbale, bezohledně nebo nepřiměřenou silou:
- vrazí do něj, skočí na něj nebo do něj strčí,
- kopne ho nebo udeří (i hlavou), případně se o to pokusí,
- podrazí ho nebo ho nedovoleně zastaví.

Přímý kop je i za **hru rukou** (kromě brankáře ve vlastním pokutovém území), za **držení** soupeře, **bránění v pohybu s kontaktem**, plivnutí nebo kousnutí a za hození předmětu po míči, soupeři nebo rozhodčím. Když takový přestupek udělá hráč ve **vlastním pokutovém území**, je z toho **pokutový kop**.

**Nepřímý volný kop** se nařizuje mimo jiné za **nebezpečnou hru**, **bránění v pohybu bez kontaktu**, **nesouhlas a jiné slovní přestupky**, bránění brankáři v rozehrání míče a za **ofsajd**. Soupeř ho dostane i tehdy, když brankář ve vlastním pokutovém území vezme do rukou míč, který mu **úmyslně nohou přihrál spoluhráč** nebo který dostal **přímo z vhazování spoluhráče**. Stejně tak když se brankář míče dotkne rukou podruhé poté, co ho pustil, a nikdo jiný se ho mezitím nedotkl.

Nepřímý kop poznáš podle **paže rozhodčího zdvižené nad hlavou**. Sudí ji drží nahoře, dokud se míče nedotkne jiný hráč, míč neopustí hru, nebo je jasné, že gól přímo padnout nemůže. Když nepřímý kop pošleš přímo do soupeřovy branky, gól neplatí a soupeř kope **od branky**.

A jedna novější věc: když brankář drží míč v rukou **déle než osm sekund**, soupeř dostane **kop z rohu**.`,
    },
    {
      id: "karty-zluta",
      category: "karty",
      difficulty: 1,
      title: "Žlutá karta: napomenutí",
      body: `Žlutou kartou rozhodčí **napomíná**. Dostat ji může jen **hráč, náhradník, vystřídaný hráč nebo funkcionář družstva**. Divák na tribuně žlutou nedostane, ať řve sebevíc. Trestat může rozhodčí **od chvíle, kdy vstoupí na hrací plochu k předzápasové kontrole**, až do doby, kdy ji po zápase opustí.

Hráč je napomenut, když:
- **zdržuje navázání hry**,
- projevuje **nesouhlas slovy, gesty nebo chováním**,
- vstoupí na hrací plochu, vrátí se na ni nebo ji úmyslně opustí **bez souhlasu rozhodčího**,
- **nedodrží předepsanou vzdálenost** při volném kopu, kopu z rohu, vhazování nebo míči rozhodčího,
- **soustavně porušuje pravidla**, přičemž přesný počet ani druh přestupků pravidla nestanoví,
- chová se **nesportovně**.

Nesportovní chování má mnoho podob. Patří sem třeba **simulování**, tedy předstírání zranění nebo faulu, **bezohledný** zákrok, většinou i zastavení slibně se rozvíjejícího útoku, pokus dát gól rukou, slovní rozptylování soupeře nebo **nedostatek respektu ke hře**.

Pozor na oslavy gólu. Žlutou dostane hráč, který si **svlékne dres nebo si jím zakryje hlavu**, vyleze na plot, zakryje si hlavu nebo obličej maskou, nebo gestikuluje provokativně či posměšně. A to **i tehdy, když gól nakonec neplatí**. Kdo tedy po gólu z ofsajdu běží k plotu s dresem v ruce, odnese si jen žlutou a posměch celé vesnice.

**Druhá žlutá v tomtéž zápase znamená červenou.** Pozor i na dva přestupky těsně po sobě: když hráč bez svolení vběhne na hřiště a hned bezohledně podrazí soupeře, dostane dvě napomenutí, tedy ve výsledku červenou.`,
    },
    {
      id: "karty-cervena",
      category: "karty",
      difficulty: 2,
      title: "Červená karta: vyloučení",
      body: `Červenou kartou rozhodčí **vylučuje**. Vyloučený musí opustit hrací plochu i **technickou zónu** a tým dohrává v oslabení. Když tým klesne pod **sedm hráčů**, zápas nemůže pokračovat.

Hráč, náhradník nebo vystřídaný hráč je vyloučen, když:
- se dopustí **surové hry**,
- se dopustí **hrubého nesportovního chování**,
- **kousne nebo plivne** na jinou osobu,
- použije **pohoršující, urážlivé nebo ponižující** výroky, gesta nebo chování,
- dostane **druhou žlutou** v tomtéž zápase,
- zmaří soupeři gól nebo **zjevnou brankovou možnost** úmyslnou rukou nebo faulem (výjimky ve vlastním pokutovém území probírá pokročilý kurz).

Dva pojmy se často pletou.

**Surová hra** je zákrok **v souboji o míč**, který ohrozí bezpečnost soupeře nebo při kterém hráč použije nepřiměřenou sílu či brutalitu. Třeba když hráč jednou nebo oběma nohama napadne soupeře zepředu, zboku nebo zezadu s nepřiměřenou silou.

**Hrubé nesportovní chování** je použití nebo pokus o použití nepřiměřené síly či brutality **mimo souboj o míč**, a to vůči komukoli: soupeři, spoluhráči, rozhodčímu, divákovi. Nezáleží na tom, jestli ke kontaktu dojde. Úmyslná rána rukou do hlavy nebo obličeje mimo souboj o míč je hrubé nesportovní chování, pokud použitá síla nebyla zanedbatelná.

Pro fauly platí jednoduchý žebříček:
- **nedbale** (nepozornost, ale pořád ve sportovním duchu): volný kop, karta není nutná,
- **bezohledně** (bez ohledu na možné následky pro soupeře): žlutá,
- **nepřiměřenou silou** (ohrožení zdraví a bezpečnosti soupeře): červená.

Takže když stoper pošle útočníka skluzem až za reklamní tabuli, vysvětlování „vždyť jsem šel po míči“ mu moc nepomůže.`,
    },
    {
      id: "karty-vyhoda",
      category: "karty",
      difficulty: 2,
      title: "Výhoda ve hře",
      body: `Ne každý faul musí skončit hvizdem. Když by přerušení hry pomohlo spíš týmu, který přestupek spáchal, nechá rozhodčí hrát. Tomu se říká **výhoda ve hře**.

Jak to funguje:
- rozhodčí nechá hru pokračovat a výhodu ukáže **oběma pažemi nataženými dopředu**, povolený je i podobný signál jednou paží,
- když se očekávaná výhoda nedostaví **hned nebo během několika sekund**, rozhodčí se vrátí k původnímu přestupku a potrestá ho,
- podle aktuálních pravidel jde výhoda nechat i tehdy, když soupeř nesprávně rozehraje, třeba volný kop, a míč je už ve hře.

Výhoda **neruší kartu**. Když by za přestupek jinak byla žlutá nebo červená, rozhodčí ji ukáže **při nejbližším přerušení hry**. Výjimky:
- šlo-li o **zastavení slibně se rozvíjejícího útoku**, hráč po výhodě žlutou **nedostane**,
- šlo-li o **zmaření zjevné brankové možnosti**, hráč po výhodě dostane **jen žlutou**. Když z té výhody padne gól, podle pravidel 2026/27 nedostane nic.

U **surové hry, hrubého nesportovního chování nebo druhé žluté** by rozhodčí výhodu nechávat neměl. Výjimkou je **zjevná možnost dosáhnout branky**; pak hráče vyloučí při nejbližším přerušení. Když ale provinilec mezitím zahraje míč nebo zasáhne proti soupeři, rozhodčí hru zastaví, vyloučí ho a naváže nepřímým volným kopem, pokud hráč neudělal něco horšího.

Takže když sudí nechá běžet výhodu, nekřič na něj z lavičky „faul, pískej!“. On to viděl. Jen čeká, jestli z toho tvůj tým nevytěží víc než volný kop.`,
    },
    {
      id: "karty-penalta",
      category: "karty",
      difficulty: 2,
      title: "Pokutový kop",
      body: `**Pokutový kop** se nařizuje, když se hráč ve **vlastním pokutovém území** dopustí přestupku, za který se jinak dává přímý volný kop. Když obránce začne soupeře držet před vápnem a drží ho i uvnitř, je z toho taky penalta.

Jak se kope:
- míč leží **v klidu na pokutové značce** a kopající musí být **jasně určen**,
- **brankář** stojí čelem ke kopajícímu na **brankové čáře mezi tyčemi**, dokud míč není kopnut. Nesmí kopajícího nefér rozptylovat, třeba zdržováním nebo dotýkáním tyčí, břevna či sítě,
- v okamžiku kopu musí mít brankář aspoň **část jedné nohy na brankové čáře**, v její úrovni nebo za ní,
- ostatní hráči stojí na hrací ploše, **mimo pokutové území**, nejméně **9,15 m** od pokutové značky a **za pokutovou značkou**,
- míč se kope **dopředu**, patičkou jen tehdy, když jde míč dopředu. Kopající se ho nesmí dotknout podruhé, dokud se ho nedotkne jiný hráč.

Když někdo poruší pravidla:
- **brankář** vyběhne z čáry dřív a míč skončí v síti: **gól platí**,
- brankář vyběhne dřív a míč **chytí nebo vyrazí**: kop se **opakuje**. Za první takový přestupek v zápase dostane brankář varování, za každý další žlutou,
- brankář vyběhne dřív a kopající mine nebo trefí tyč: opakuje se jen tehdy, když brankář kopajícího **zjevně ovlivnil**,
- **finta v rozběhu** je povolená. Když ale kopající rozběh **dokončí** a teprve pak fintuje, dostane žlutou a hraje se **nepřímý volný kop** pro bránící tým, i kdyby míč skončil v síti.

Nepřímým volným kopem skončí i kop dozadu nebo kop jiným hráčem, než byl určen. Kdo takhle kopal místo určeného hráče, dostane navíc žlutou.

Když rozhodčí nařídí penaltu na konci poločasu, **prodlouží hrací dobu**, aby se kop dal provést. Takže žádné „už je konec, jdeme na pivo“.`,
    },
    {
      id: "karty-dogso",
      category: "karty",
      difficulty: 3,
      title: "Zmařená šance a zastavený útok",
      body: `Dva pojmy, o kterých se v hospodě hádá nejvíc: **zmaření zjevné brankové možnosti** (anglicky DOGSO) a **zastavení slibně se rozvíjejícího útoku** (SPA).

Jestli šlo o zjevnou brankovou možnost, posuzuje rozhodčí podle toho:
- jak daleko od branky se přestupek stal,
- kam celkově směřovala hra,
- jak pravděpodobné bylo, že útočník míč udrží nebo získá,
- kde a kolik bylo bránících hráčů (od pravidel 2026/27 výslovně i útočníků).

**Tresty za zmaření zjevné brankové možnosti:**
- **úmyslná ruka** (kromě brankáře ve vlastním pokutovém území): **červená**, ať se to stane kdekoli,
- **neúmyslná ruka** ve vlastním pokutovém území a nařízená penalta: **žlutá**; mimo vlastní pokutové území **červená**,
- **faul mimo pokutové území**: **červená**,
- **faul ve vlastním pokutovém území** a nařízená penalta: **žlutá**, pokud se obránce **snažil hrát míč** nebo o něj svedl souboj. Když soupeře **držel, táhl, strčil** nebo neměl možnost hrát míč, dostane **červenou**.

Proč ta výjimka? Dřív se mluvilo o **trojitém trestu**: penalta, červená a k tomu zákaz startu na další zápasy, a to všechno za jeden souboj o míč. Od roku 2016 proto pravidla trestají poctivý pokus o míč ve vápně jen žlutou, protože penalta soupeři šanci vrací.

**Zastavení slibně se rozvíjejícího útoku** se trestá **žlutou**. Výjimka: když rozhodčí nařídí penaltu za přestupek, při kterém se obránce snažil hrát míč, nebo za neúmyslnou ruku, karta není. Když rozhodčí po zastavení slibného útoku nechá výhodu, žlutá taky není.

Když rozhodčí nechá výhodu po zmaření zjevné brankové možnosti, hráč dostane jen žlutou. A když z té výhody padne gól, podle pravidel 2026/27 nedostane nic.`,
    },
    {
      id: "karty-lavicka",
      category: "karty",
      difficulty: 3,
      title: "Lavička a technická zóna",
      body: `Karty nejsou jen pro hráče. Žlutou i červenou může dostat i **funkcionář družstva**, tedy trenér, vedoucí, masér a další lidé z lavičky zapsaní v zápise o utkání. Během zápasu patří do **technické zóny**.

Pravidla pro lavičku mají tři stupně.

**Varování** přichází obvykle za méně závažné věci, třeba když funkcionář:
- vstoupí na hrací plochu s respektem, nekonfrontačně,
- nespolupracuje s rozhodčími, třeba ignoruje pokyny asistenta nebo čtvrtého rozhodčího,
- projeví méně závažný nesouhlas,
- občas vykročí z technické zóny, aniž by udělal něco dalšího.

Opakované nebo zjevné případy už vedou ke kartě.

**Žlutou** dostane funkcionář třeba za:
- zjevné nebo opakované nerespektování hranic technické zóny,
- zdržování navázání hry vlastním týmem,
- nesouhlas slovy, gesty nebo chováním, včetně hození či kopnutí láhve s pitím nebo **sarkastického tleskání** rozhodčímu,
- přehnanou gestikulaci, kterou se domáhá karty,
- provokativní chování nebo nedostatek respektu ke hře.

**Červenou** třeba za:
- zdržování navázání hry **soupeřem**, například zadržením nebo odkopnutím míče,
- úmyslné opuštění technické zóny, aby protestoval proti rozhodnutí,
- úmyslné hození nebo kopnutí předmětu **na hrací plochu**,
- vstup na hrací plochu, aby **konfrontoval rozhodčího**, a to i o přestávce nebo po zápase,
- agresivní chování, urážky nebo druhou žlutou.

Důležité: když někdo z technické zóny spáchá přestupek a rozhodčí nepozná kdo, trest dostane **hlavní trenér přítomný v technické zóně**. Takže když ti masér z lavičky sprostě nadává sudímu a zapře to, červenou si můžeš odnést ty.

Vyloučený funkcionář musí opustit technickou zónu i okolí hřiště. Klobásu si pak musí dát jinde než na lavičce.`,
    },
    {
      id: "karty-respekt",
      category: "karty",
      difficulty: 3,
      title: "Kapitán, respekt a dočasné vyloučení",
      body: `Podle pravidel **kapitán nemá žádné zvláštní postavení ani výsady**, ale nese **určitou míru odpovědnosti za chování svého týmu**. Český výklad pravidel k tomu dodává, že během hry se na rozhodčího smí obracet jen kapitán, a to slušně, stručně a jen ve věcech hry. Kdo z toho udělá hádku, riskuje žlutou.

IFAB, rada, která pravidla schvaluje, vydala zásady **„Jen kapitán“**. Po sporném momentu smí za rozhodčím jen jeden hráč z týmu, obvykle kapitán. Kdo sudího obstoupí, i když nesmí, riskuje žlutou. Když je kapitánem brankář, tým rozhodčímu předem oznámí hráče, který chodí místo něj. V mládeži, u veteránů, hráčů s postižením a na nejnižších amatérských úrovních může rozhodčí navíc gestem vyhlásit **zónu jen pro kapitána**: ostatní hráči musí zůstat nejméně **4 m** od něj a kdo do zóny vtrhne, měl by dostat **žlutou za nesouhlas**. Povinné budou zásady pro všechny soutěže, které začnou **1. července 2027** nebo později.

**Dočasné vyloučení** je trest, kdy hráč za napomínaný přestupek odejde na nějakou dobu z hřiště. Pravidla ho dovolují jen v soutěžích **mládeže, veteránů, hráčů s postižením a na nejnižších amatérských úrovních**, se souhlasem svazu a jen tam, kde to **řád soutěže** umožňuje. Platí pro něj:
- rozhodčí ukáže **žlutou** a pak **oběma pažemi** ukáže do místa pro dočasně vyloučené, obvykle do technické zóny,
- trest je stejně dlouhý za všechny přestupky, **10–15 % hrací doby**, tedy 10 minut v zápase na 90 minut,
- začíná běžet, když se po odchodu hráče znovu rozehraje,
- hráč čeká v technické zóně a vrací se od postranní čáry se souhlasem rozhodčího, když je míč mimo hru,
- soutěž může takto trestat všechny napomínané přestupky (**systém A**), nebo jen vybrané (**systém B**), třeba nesouhlas nebo simulování.

Respekt k sudímu se vyplácí. Kdo si deset minut odsedí kvůli protestům, má čas přemýšlet, jestli to stálo za to.`,
    },
    {
      id: "karty-handball",
      category: "karty",
      difficulty: 3,
      title: "Hra rukou podle pravidla 12",
      body: `Na okrese se z tribuny ozve „ruka!“ pokaždé, když míč trefí cokoli pod bradou. **Pravidlo 12** je ale střízlivější: **ne každý dotek míče rukou nebo paží je přestupek**.

Kde paže začíná? Pro posouzení hry rukou je její horní hranice v úrovni **spodního okraje podpaží**. **Rameno k paži nepatří**, takže gól ramenem platí, i když ho střelec dal schválně.

Hry rukou se hráč dopustí, když:
- se míče dotkne rukou nebo paží **úmyslně**, třeba když paží pohne směrem k míči,
- se míče dotkne rukou nebo paží, která **nepřirozeně zvětšila jeho tělo**, tedy když poloha paže není důsledkem pohybu těla v dané situaci a nedá se jím ospravedlnit,
- dá soupeři gól **přímo rukou nebo paží**, i nechtěně, a to platí i pro brankáře,
- dá gól **hned poté**, co se mu míč dotkl ruky nebo paže, i když náhodou.

Poslední dvě pravidla se týkají jen **střelce**. Když se míč náhodou dotkne paže spoluhráče, která tělo nezvětšila, a ten gól jen připraví, branka platí. Přestupek není ani to, když si hráč míč sám nakopne do paže nebo ho dostane do paže přitažené k tělu. A obránce, kterému se míč od hlavy odrazí do vlastní paže a pak do vlastní sítě, si vlastní gól nevymluví.

**Brankář** má mimo své pokutové území pro hru rukou stejná omezení jako ostatní hráči.

Ruka sama o sobě kartu neznamená, trestá se přímým volným kopem nebo penaltou. **Žlutou** dostane hráč, který rukou přeruší nebo zastaví **slibně se rozvíjející útok** (ne však, když rozhodčí nařídí penaltu za neúmyslnou ruku), a hráč, který se i neúspěšně **pokusí dát gól rukou**. Za zmaření gólu nebo zjevné brankové možnosti rukou hrozí **červená**, podrobnosti jsou v lekci o zmařené šanci.

Až zase někdo z lavičky zařve „ruka!“ na míč, který se odrazil od ramene, ukaž mu podpaží.`,
    },
    {
      id: "karty-var",
      category: "karty",
      difficulty: 3,
      title: "VAR: kdy zasahuje videorozhodčí",
      body: `Na okrese je videorozhodčím strejda s mobilem za zábradlím a jeho záznam nikoho nezajímá. Ve vyšších soutěžích ale sedí **videorozhodčí (VAR)** v místnosti plné obrazovek a je to člen týmu rozhodčích. Soutěž ho smí použít, jen když splní požadavky a dostane **písemné povolení FIFA**.

Filozofie zní **„minimální zásah, maximální přínos“**. VAR nemá posuzovat každý souboj, ale opravit **jasnou a zřejmou chybu** nebo **vážný přehlédnutý incident**. Podle protokolu 2026/27 smí pomoct v pěti oblastech:
- **gól, nebo ne**, včetně přestupku útočícího týmu v akci před gólem,
- **penalta, nebo ne**,
- **červená karta**, nově i ta po zjevně nesprávné druhé žluté,
- **záměna hráče**, když rozhodčí potrestá kartou jiného hráče, nově z kteréhokoli týmu,
- **chybně nařízený roh**, pokud to soutěž zavedla a oprava jde hned, bez zdržení navázání hry.

Pozor: když sudí přehlédne přestupek na druhou žlutou, VAR ji nedoplní. Zasáhne jen tam, kde druhou žlutou ukázal zjevně neprávem.

VAR automaticky **kontroluje** každý gól, penaltu, přímou červenou i záměnu hráče, většinou potichu. Rozhodčí přitom musí vždy nejdřív rozhodnout sám. Když VAR najde pravděpodobnou chybu, může jen **doporučit přezkoumání**. Zahájit ho smí jen rozhodčí a **konečné rozhodnutí je vždy jeho**. U faktů, jako je ofsajdová pozice, místo přestupku nebo míč za čarou, obvykle stačí informace od VAR. U subjektivních věcí, třeba intenzity faulu nebo hry rukou, se rozhodčí zpravidla podívá na záznam sám u hrací plochy, tomu se říká **přezkoumání na hrací ploše (OFR)**. Časový limit není, přesnost má přednost před rychlostí. Soutěž navíc může zavést, že rozhodčí po přezkoumání rozhodnutí veřejně vysvětlí a oznámí.

Hráči ani trenéři si o přezkoumání říct nemůžou. Kdo přehnaně kreslí rukama obrazovku nebo vstoupí do prostoru pro přezkoumání, dostane **žlutou**. Kdo vejde do místnosti videorozhodčích, **červenou**.

Na okrese tak zůstává jediný záznam: paměť štamgastů. A ta se mění s každým pivem.`,
    },
  ],

  questions: [
    // ── Přímý a nepřímý volný kop ──
    {
      id: "karty-volne-kopy-1",
      lessonId: "karty-volne-kopy",
      text: "Jak rozhodčí ukazuje nepřímý volný kop?",
      options: [
        "Oběma pažemi nataženými dopředu",
        "Paží zdviženou nad hlavou",
        "Ukáže na pokutovou značku",
        "Dvakrát krátce zapíská",
      ],
      correct: 1,
      explain: "Nepřímý volný kop rozhodčí ukazuje paží zdviženou nad hlavou a drží ji nahoře, dokud se míče nedotkne jiný hráč nebo míč neopustí hru.",
    },
    {
      id: "karty-volne-kopy-2",
      lessonId: "karty-volne-kopy",
      text: "Za který z těchto přestupků se nařizuje nepřímý volný kop?",
      options: ["Podražení soupeře", "Držení soupeře za dres", "Úmyslná hra rukou", "Nebezpečná hra"],
      correct: 3,
      explain: "Nebezpečná hra se trestá nepřímým volným kopem. Podražení, držení i hra rukou jsou přestupky na přímý volný kop.",
    },
    {
      id: "karty-volne-kopy-3",
      lessonId: "karty-volne-kopy",
      text: "Brankář ve vlastním pokutovém území chytí do rukou míč, který mu úmyslně nohou přihrál spoluhráč. Co následuje?",
      options: [
        "Nepřímý volný kop pro soupeře",
        "Přímý volný kop pro soupeře",
        "Pokutový kop",
        "Nic, ve vlastním pokutovém území smí brankář chytat vždycky",
      ],
      correct: 0,
      explain: "Když brankář vezme do rukou úmyslnou přihrávku nohou od spoluhráče, soupeř dostane nepřímý volný kop.",
    },
    {
      id: "karty-volne-kopy-4",
      lessonId: "karty-volne-kopy",
      text: "Co dostane soupeř, když brankář drží míč v rukou déle než osm sekund?",
      options: ["Nepřímý volný kop", "Pokutový kop", "Kop z rohu", "Vhazování"],
      correct: 2,
      explain: "Podle novějších pravidel se za držení míče v rukou déle než osm sekund nařizuje soupeři kop z rohu.",
    },

    // ── Žlutá karta ──
    {
      id: "karty-zluta-1",
      lessonId: "karty-zluta",
      text: "Kdo z těchto osob nemůže dostat žlutou kartu?",
      options: ["Náhradník na lavičce", "Vystřídaný hráč", "Divák na tribuně", "Trenér v technické zóně"],
      correct: 2,
      explain: "Kartu může dostat jen hráč, náhradník, vystřídaný hráč nebo funkcionář družstva. Divák mezi ně nepatří.",
    },
    {
      id: "karty-zluta-2",
      lessonId: "karty-zluta",
      text: "Kolik přestupků musí hráč spáchat, aby šlo o soustavné porušování pravidel?",
      options: [
        "Pravidla žádný přesný počet nestanoví",
        "Přesně tři za zápas",
        "Pět za poločas",
        "Dva stejného druhu",
      ],
      correct: 0,
      explain: "Pro soustavné porušování pravidel není stanoven žádný přesný počet ani druh přestupků, posoudí to rozhodčí.",
    },
    {
      id: "karty-zluta-3",
      lessonId: "karty-zluta",
      text: "Útočník po gólu svlékne dres, ale gól kvůli ofsajdu neplatí. Co s ním?",
      options: [
        "Nic, když gól neplatí, nepočítá se ani oslava",
        "Jen ústní domluva",
        "Červená karta",
        "Žlutá karta, i když gól neplatí",
      ],
      correct: 3,
      explain: "Za svlečení dresu při oslavě se napomíná i tehdy, když gól nakonec neplatí.",
    },
    {
      id: "karty-zluta-4",
      lessonId: "karty-zluta",
      text: "Hráč předstírá, že ho soupeř fauloval. Jak to pravidla hodnotí?",
      options: [
        "Jako nedbalost, která se netrestá",
        "Jako nesportovní chování, za které se napomíná",
        "Jako hrubé nesportovní chování, za které je červená",
        "Jako přestupek soupeře, pokud to rozhodčí neviděl",
      ],
      correct: 1,
      explain: "Simulování, tedy předstírání zranění nebo faulu, je nesportovní chování a trestá se žlutou kartou.",
    },

    // ── Červená karta ──
    {
      id: "karty-cervena-1",
      lessonId: "karty-cervena",
      text: "Jaký je rozdíl mezi surovou hrou a hrubým nesportovním chováním?",
      options: [
        "Surová hra je v souboji o míč, hrubé nesportovní chování mimo něj",
        "Surová hra se týká jen zákroků na brankáře",
        "Hrubé nesportovní chování musí skončit zraněním",
        "Není mezi nimi rozdíl, jde o dva názvy téhož",
      ],
      correct: 0,
      explain: "Surová hra je zákrok v souboji o míč, hrubé nesportovní chování je nepřiměřená síla mimo souboj o míč, i bez kontaktu.",
    },
    {
      id: "karty-cervena-2",
      lessonId: "karty-cervena",
      text: "Hráč fauluje soupeře bezohledně, ale bez nepřiměřené síly. Jaký osobní trest dostane?",
      options: ["Žádný, stačí volný kop", "Červenou kartu", "Jen ústní napomenutí", "Žlutou kartu"],
      correct: 3,
      explain: "Nedbalost se trestá jen kopem, bezohlednost žlutou a nepřiměřená síla červenou.",
    },
    {
      id: "karty-cervena-3",
      lessonId: "karty-cervena",
      text: "Hráč dostane v zápase druhou žlutou kartu. Co následuje?",
      options: [
        "Nic, žluté se sčítají až do dalšího zápasu",
        "Je vyloučen",
        "Hraje dál, jen zaplatí pokutu do klubové pokladny",
        "Žlutou místo něj dostane kapitán",
      ],
      correct: 1,
      explain: "Druhé napomenutí v tomtéž zápase znamená vyloučení, tedy červenou kartu.",
    },
    {
      id: "karty-cervena-4",
      lessonId: "karty-cervena",
      text: "Kolik hráčů musí tým mít na hřišti, aby zápas mohl pokračovat?",
      options: ["Aspoň šest", "Aspoň osm", "Aspoň sedm", "Aspoň devět"],
      correct: 2,
      explain: "Když tým klesne pod sedm hráčů, zápas nemůže pokračovat.",
    },

    // ── Výhoda ve hře ──
    {
      id: "karty-vyhoda-1",
      lessonId: "karty-vyhoda",
      text: "Jak dlouho má rozhodčí na to, aby se vrátil k původnímu přestupku, když se výhoda nedostaví?",
      options: [
        "Do konce poločasu",
        "Hned nebo během několika sekund",
        "Do dalšího přerušení hry, ať trvá jakkoli dlouho",
        "Vrátit se nemůže nikdy",
      ],
      correct: 1,
      explain: "Když se očekávaná výhoda nedostaví hned nebo během několika sekund, rozhodčí potrestá původní přestupek.",
    },
    {
      id: "karty-vyhoda-2",
      lessonId: "karty-vyhoda",
      text: "Kdy hráč dostane žlutou kartu za přestupek, po kterém rozhodčí nechal výhodu?",
      options: [
        "Při nejbližším přerušení hry",
        "Nikdy, výhoda kartu ruší",
        "Hned, hra se kvůli tomu zastaví",
        "Až po zápase v kabině",
      ],
      correct: 0,
      explain: "Výhoda kartu neruší. Rozhodčí ji ukáže při nejbližším přerušení hry.",
    },
    {
      id: "karty-vyhoda-3",
      lessonId: "karty-vyhoda",
      text: "Obránce zastaví slibně se rozvíjející útok držením za dres a rozhodčí nechá výhodu. Dostane obránce žlutou?",
      options: [
        "Ano, vždycky",
        "Ano, a k tomu červenou",
        "Jen když útok skončí gólem",
        "Ne, v tomto případě se po výhodě nenapomíná",
      ],
      correct: 3,
      explain: "Po výhodě za zastavení slibně se rozvíjejícího útoku hráč žlutou nedostane.",
    },
    {
      id: "karty-vyhoda-4",
      lessonId: "karty-vyhoda",
      text: "Jakým signálem rozhodčí ukazuje výhodu?",
      options: [
        "Paží zdviženou nad hlavou",
        "Ukáže na pokutovou značku",
        "Pažemi nataženými dopředu",
        "Dvakrát krátce zapíská",
      ],
      correct: 2,
      explain: "Výhodu rozhodčí ukazuje oběma pažemi nataženými dopředu, povolený je i podobný signál jednou paží.",
    },

    // ── Pokutový kop ──
    {
      id: "karty-penalta-1",
      lessonId: "karty-penalta",
      text: "Brankář při penaltě vyběhne z čáry dřív a míč chytí. Co následuje, když jde o jeho první takový přestupek v zápase?",
      options: [
        "Hraje se dál, chytil to",
        "Kop se opakuje a brankář dostane varování",
        "Rozhodčí uzná gól",
        "Brankář dostane rovnou červenou",
      ],
      correct: 1,
      explain: "Když brankář po přestupku míč chytí nebo vyrazí, kop se opakuje. Za první přestupek dostane varování, za každý další žlutou.",
    },
    {
      id: "karty-penalta-2",
      lessonId: "karty-penalta",
      text: "Brankář vyběhne z čáry dřív, ale míč přesto skončí v brance. Co rozhodčí?",
      options: [
        "Kop se opakuje",
        "Nepřímý volný kop pro bránící tým",
        "Gól platí",
        "Gól platí a brankář dostane červenou",
      ],
      correct: 2,
      explain: "Když míč skončí v brance, gól platí. Brankářův přestupek tu nic nemění.",
    },
    {
      id: "karty-penalta-3",
      lessonId: "karty-penalta",
      text: "Kde musí stát ostatní hráči při pokutovém kopu?",
      options: [
        "Kdekoli mimo brankové území",
        "Na hranici pokutového území před pokutovou značkou",
        "Nejméně 5 m od brankáře",
        "Mimo pokutové území, nejméně 9,15 m od pokutové značky a za ní",
      ],
      correct: 3,
      explain: "Ostatní hráči musí být na hrací ploše, mimo pokutové území, nejméně 9,15 m od pokutové značky a za ní.",
    },
    {
      id: "karty-penalta-4",
      lessonId: "karty-penalta",
      text: "Kopající dokončí rozběh, zastaví se, fintuje a pak dá gól. Co rozhodčí?",
      options: [
        "Gól neplatí, kopající dostane žlutou a hraje se nepřímý volný kop",
        "Gól platí, finta je povolená",
        "Kop se opakuje bez trestu",
        "Kopající dostane červenou a kop se opakuje",
      ],
      correct: 0,
      explain: "Finta v rozběhu je povolená, ale finta po dokončeném rozběhu znamená žlutou a nepřímý volný kop, i když míč skončil v síti.",
    },

    // ── Zmařená šance a zastavený útok ──
    {
      id: "karty-dogso-1",
      lessonId: "karty-dogso",
      text: "Obránce ve vlastním pokutovém území zmaří zjevnou šanci skluzem, při kterém se snažil hrát míč. Rozhodčí nařídí penaltu. Jaký osobní trest obránce dostane?",
      options: ["Červenou kartu", "Žádný", "Žlutou kartu", "Dvě žluté karty"],
      correct: 2,
      explain: "Když obránce ve vlastním pokutovém území zmaří šanci při pokusu hrát míč a je nařízena penalta, dostane jen žlutou.",
    },
    {
      id: "karty-dogso-2",
      lessonId: "karty-dogso",
      text: "Obránce ve vlastním pokutovém území strhne útočníka za dres, bez snahy hrát míč, a zmaří mu zjevnou šanci. Co následuje?",
      options: [
        "Penalta a žlutá karta",
        "Penalta a červená karta",
        "Jen penalta",
        "Nepřímý volný kop a žlutá karta",
      ],
      correct: 1,
      explain: "Držení, tahání nebo strkání bez možnosti hrát míč se i ve vápně trestá penaltou a červenou kartou.",
    },
    {
      id: "karty-dogso-3",
      lessonId: "karty-dogso",
      text: "Obránce ve vlastním pokutovém území zastaví slibně se rozvíjející útok (ne zjevnou šanci) nedbalým faulem, při kterém se snažil hrát míč. Rozhodčí nařídí penaltu. Dostane obránce kartu?",
      options: [
        "Ne, karta v tomto případě není",
        "Ano, žlutou",
        "Ano, červenou",
        "Ano, žlutou a k tomu dočasné vyloučení",
      ],
      correct: 0,
      explain: "Zastavení slibného útoku se jinak trestá žlutou, ale když je za přestupek při pokusu hrát míč nařízena penalta, karta není.",
    },
    {
      id: "karty-dogso-4",
      lessonId: "karty-dogso",
      text: "Co se myslí takzvaným trojitým trestem?",
      options: [
        "Tři žluté karty v jednom zápase",
        "Penalta, která se třikrát opakuje",
        "Pokuta pro hráče, trenéra i klub",
        "Penalta, červená karta a zákaz startu za jeden zákrok",
      ],
      correct: 3,
      explain: "Trojitý trest byla penalta, červená a zákaz startu za jeden souboj. Proto se od roku 2016 poctivý pokus o míč ve vápně trestá jen žlutou.",
    },

    // ── Lavička a technická zóna ──
    {
      id: "karty-lavicka-1",
      lessonId: "karty-lavicka",
      text: "Někdo z lavičky sprostě nadává rozhodčímu a ten nepozná kdo. Kdo dostane trest?",
      options: [
        "Kapitán týmu na hřišti",
        "Hlavní trenér přítomný v technické zóně",
        "Nikdo, když viník není poznat",
        "Všichni na lavičce dostanou žlutou",
      ],
      correct: 1,
      explain: "Když rozhodčí nepozná, kdo z technické zóny se provinil, trest dostane hlavní trenér přítomný v technické zóně.",
    },
    {
      id: "karty-lavicka-2",
      lessonId: "karty-lavicka",
      text: "Trenér sarkasticky tleská rozhodčímu. Co mu podle pravidel hrozí?",
      options: [
        "Nic, tleskání je projev fair play",
        "Rovnou červená karta",
        "Jen varování, karty trenér dostat nemůže",
        "Žlutá karta",
      ],
      correct: 3,
      explain: "Sarkastické tleskání je projev nesouhlasu a funkcionář za něj dostane žlutou kartu.",
    },
    {
      id: "karty-lavicka-3",
      lessonId: "karty-lavicka",
      text: "Trenér vběhne o přestávce na hřiště, aby se hádal s rozhodčím. Co následuje?",
      options: ["Červená karta", "Žlutá karta", "Jen varování", "Nic, o přestávce karty neplatí"],
      correct: 0,
      explain: "Vstup na hrací plochu kvůli konfrontaci s rozhodčím se trestá červenou, a to i o přestávce nebo po zápase.",
    },
    {
      id: "karty-lavicka-4",
      lessonId: "karty-lavicka",
      text: "Trenér jednou krátce vykročí z technické zóny a nic dalšího neudělá. Jak rozhodčí obvykle zareaguje?",
      options: ["Žlutou kartou", "Červenou kartou", "Varováním", "Přerušením zápasu"],
      correct: 2,
      explain: "Občasné opuštění technické zóny bez dalšího přestupku vede obvykle jen k varování. Karta přichází za opakované nebo zjevné případy.",
    },

    // ── Kapitán, respekt a dočasné vyloučení ──
    {
      id: "karty-respekt-1",
      lessonId: "karty-respekt",
      text: "Jaké postavení má podle pravidel kapitán?",
      options: [
        "Smí rozhodčímu nařídit, aby situaci posoudil znovu",
        "Nemá zvláštní postavení ani výsady, ale nese určitou odpovědnost za chování týmu",
        "Nemůže dostat žlutou kartu, dokud mluví slušně",
        "Rozhoduje o délce nastavení",
      ],
      correct: 1,
      explain: "Kapitán podle pravidel nemá žádné zvláštní postavení ani výsady, ale má určitou míru odpovědnosti za chování svého týmu.",
    },
    {
      id: "karty-respekt-2",
      lessonId: "karty-respekt",
      text: "Rozhodčí na nejnižší amatérské úrovni vyhlásí zónu jen pro kapitána. Jak daleko od něj musí zůstat ostatní hráči?",
      options: ["Nejméně 1 m", "Nejméně 9,15 m", "Nejméně 4 m", "Nejméně 11 m"],
      correct: 2,
      explain: "Zóna jen pro kapitána sahá 4 m kolem rozhodčího, ostatní hráči musí zůstat venku. Kdo do ní vtrhne, měl by dostat žlutou za nesouhlas.",
    },
    {
      id: "karty-respekt-3",
      lessonId: "karty-respekt",
      text: "Ve kterých soutěžích pravidla dovolují dočasné vyloučení?",
      options: [
        "V mládeži, u veteránů, hráčů s postižením a na nejnižších amatérských úrovních, pokud to umožňuje řád soutěže",
        "Jen v profesionálních ligách s videorozhodčím",
        "Ve všech soutěžích, rozhodčí se rozhodne sám",
        "Jen v přátelských zápasech reprezentací",
      ],
      correct: 0,
      explain: "Dočasné vyloučení je možnost pro mládež, veterány, hráče s postižením a nejnižší amatérské soutěže, se souhlasem svazu a podle řádu soutěže.",
    },
    {
      id: "karty-respekt-4",
      lessonId: "karty-respekt",
      text: "Jak dlouhé má být dočasné vyloučení v zápase na 90 minut?",
      options: ["2 minuty", "5 minut", "Do konce poločasu", "10 minut"],
      correct: 3,
      explain: "Dočasné vyloučení má trvat 10–15 % hrací doby, v zápase na 90 minut tedy 10 minut.",
    },

    // ── Hra rukou podle pravidla 12 ──
    {
      id: "karty-handball-1",
      lessonId: "karty-handball",
      text: "Útočník schválně usměrní míč do branky ramenem. Co rozhodčí?",
      options: [
        "Gól neuzná, úmyslný dotek ramenem je hra rukou",
        "Gól neuzná a útočníkovi ukáže žlutou",
        "Gól uzná, rameno k paži nepatří",
        "Gól uzná, jen když se míč ramene dotkl náhodou",
      ],
      correct: 2,
      explain: "Pro posouzení hry rukou končí paže u spodního okraje podpaží. Rameno k ní nepatří, takže gól ramenem platí, i když byl úmyslný.",
    },
    {
      id: "karty-handball-2",
      lessonId: "karty-handball",
      text: "Míč se útočníkovi náhodou odrazí od paže, která jeho tělo nezvětšila, a útočník ho hned pošle do sítě. Platí gól?",
      options: [
        "Ne, střelec nesmí skórovat hned po doteku paže",
        "Ano, dotek byl náhodný a paže tělo nezvětšila",
        "Ano, pokud se míč paže dotkl mimo pokutové území",
        "Ne, a útočník navíc dostane žlutou kartu",
      ],
      correct: 0,
      explain: "Střelec nesmí dát gól hned poté, co se mu míč dotkl ruky nebo paže, a to ani při náhodném doteku. Samotná ruka kartu neznamená.",
    },
    {
      id: "karty-handball-3",
      lessonId: "karty-handball",
      text: "Míč se náhodou dotkne paže útočníka, která tělo nezvětšila. Útočník pak přihraje spoluhráči a ten skóruje. Co rozhodčí?",
      options: [
        "Gól neuzná, ruka v přípravě gólu je přestupek",
        "Gól neuzná a nařídí nepřímý volný kop",
        "Gól uzná, ale útočníkovi ukáže žlutou",
        "Gól uzná, přestupek to není",
      ],
      correct: 3,
      explain: "Zákaz skórovat po náhodném doteku paže platí jen pro střelce. Náhodná ruka spoluhráče, která tělo nezvětšila, přestupkem není.",
    },
    {
      id: "karty-handball-4",
      lessonId: "karty-handball",
      text: "Co platí o hře rukou pro brankáře mimo jeho pokutové území?",
      options: [
        "Smí hrát rukou na celé vlastní polovině",
        "Má stejná omezení jako ostatní hráči",
        "Za každou ruku mimo vápno dostane červenou",
        "Za ruku se mu nařizuje jen nepřímý volný kop",
      ],
      correct: 1,
      explain: "Mimo své pokutové území má brankář pro hru rukou stejná omezení jako kterýkoli jiný hráč.",
    },
    {
      id: "karty-handball-5",
      lessonId: "karty-handball",
      text: "Hráč se pokusí dát gól rukou, ale míč branku mine. Jaký osobní trest dostane?",
      options: ["Žádný, gól přece nepadl", "Červenou kartu", "Žlutou kartu", "Jen ústní napomenutí"],
      correct: 2,
      explain: "Za pokus dát gól rukou se napomíná žlutou kartou, ať se pokus povede, nebo ne.",
    },

    // ── VAR: kdy zasahuje videorozhodčí ──
    {
      id: "karty-var-1",
      lessonId: "karty-var",
      text: "Kdy smí videorozhodčí rozhodčímu pomoct?",
      options: [
        "U každého sporného souboje, který záznam z některé kamery zachytí",
        "Kdykoli o to kapitán nebo hlavní trenér požádá znakem obrazovky",
        "Jen o přestávce, aby přezkoumáním nezdržoval hru na hřišti",
        "Jen při jasné a zřejmé chybě nebo vážném přehlédnutém incidentu",
      ],
      correct: 3,
      explain: "Podle filozofie „minimální zásah, maximální přínos“ opravuje VAR jen jasnou a zřejmou chybu nebo vážný přehlédnutý incident.",
    },
    {
      id: "karty-var-2",
      lessonId: "karty-var",
      text: "Sudí přehlédne bezohledný faul hráče, který už má žlutou kartu. Může VAR doporučit přezkoumání kvůli druhé žluté?",
      options: [
        "Ano, druhá žlutá je od sezóny 2026/27 přezkoumatelná vždy",
        "Ne, VAR zasáhne jen u druhé žluté ukázané zjevně neprávem",
        "Ano, ale jen když o to požádá kapitán poškozeného týmu",
        "Ne, karty VAR nepřezkoumává vůbec",
      ],
      correct: 1,
      explain: "Přehlédnutou druhou žlutou VAR nedoplní. Pomoct může jen tehdy, když rozhodčí druhou žlutou ukázal zjevně neprávem.",
    },
    {
      id: "karty-var-3",
      lessonId: "karty-var",
      text: "Kdo zahajuje přezkoumání a kdo dělá konečné rozhodnutí?",
      options: [
        "Přezkoumání zahajuje VAR, konečné slovo má rozhodčí",
        "Obojí dělá VAR, rozhodčí rozhodnutí jen oznámí",
        "Obojí dělá rozhodčí, VAR přezkoumání jen doporučuje",
        "Přezkoumání si vyžádá trenér, rozhoduje VAR",
      ],
      correct: 2,
      explain: "Zahájit přezkoumání smí jen rozhodčí, VAR ho může jen doporučit. Konečné rozhodnutí je vždy na rozhodčím.",
    },
    {
      id: "karty-var-4",
      lessonId: "karty-var",
      text: "Sudí nařídí penaltu, ale VAR zjistí, že faul byl před pokutovým územím. Jak se u takové faktické věci obvykle postupuje?",
      options: [
        "Obvykle stačí informace od VAR, k monitoru jít nemusí",
        "Rozhodčí se musí vždy podívat na záznam u hrací plochy",
        "Penalta platí, místo přestupku VAR neřeší",
        "O místě přestupku má poslední slovo asistent u čáry",
      ],
      correct: 0,
      explain: "U faktů, jako je místo přestupku, ofsajdová pozice nebo míč za čarou, obvykle stačí informace od VAR. Přezkoumání u hrací plochy je hlavně pro subjektivní věci.",
    },
    {
      id: "karty-var-5",
      lessonId: "karty-var",
      text: "Za jakých podmínek smí VAR pomoct s chybně nařízeným rohem?",
      options: [
        "Kdykoli do konce poločasu, i když už se rozehrálo",
        "Jen když z rohu padne gól a bránící tým protestuje",
        "Nikdy, rohový kop VAR podle protokolu přezkoumat nesmí",
        "Když to soutěž zavedla a oprava jde hned, bez zdržení",
      ],
      correct: 3,
      explain: "Chybně nařízený roh je oblast, kterou si soutěž může zvolit. Oprava navíc musí jít udělat hned, bez zdržení navázání hry.",
    },
  ],
};
