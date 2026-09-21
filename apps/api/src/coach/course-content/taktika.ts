/**
 * Skripta a otázky kurzu „Taktika“.
 *
 * Zdroje: pravidla IFAB 2026/27 (theifab.com), Pravidla fotbalu FAČR (pravidlo 11, 13, 17),
 * u historie a taktických pojmů anglická Wikipedie (Formation, Marking, Gegenpressing,
 * Catenaccio, Total Football, Forward: False 9, England v Hungary 1953).
 */
import type { CategoryContent } from "./types";

export const TAKTIKA: CategoryContent = {
  lessons: [
    {
      id: "taktika-rozestaveni",
      category: "taktika",
      difficulty: 1,
      title: "Rozestavení: co znamenají čísla",
      body: `Když trenér v kabině napíše křídou na tabuli **4-4-2**, není to telefon na hospodského. Je to **rozestavení**, tedy jak se hráči rozmístí po hřišti. Čísla se čtou **odzadu dopředu**: nejdřív obránci, pak záložníci, nakonec útočníci. **Brankář se nepočítá**, takže součet je vždycky deset.

- **4-4-2**: čtyři obránci, čtyři záložníci, dva útočníci. Klasika, která vládla hlavně v 90. letech a na začátku tisíciletí. Krajní záložníci dávají týmu šířku, středoví si dělí práci dozadu i dopředu.
- **4-3-3**: tři záložníci hrají blízko u sebe, chrání obranu a přesouvají se do stran jako jeden celek. Vpředu hraje hrotový útočník a dvě křídla.
- **3-5-2**: tři střední obránci a pět záložníků. Dva krajní, takzvaní **wingbeci**, obsluhují celou lajnu od vlastní branky až k té soupeřově a pomáhají v obraně i v útoku. Když se tým brání, wingbeci klesnou dozadu a z rozestavení je vlastně **5-3-2**.

Někdy se píšou čtyři čísla, třeba **4-2-3-1**. To je jen záloha rozdělená do dvou řad: dva defenzivnější a tři ofenzivnější hráči.

Rozestavení není svaté písmo, spíš výchozí postavení. Během hry se hráči posouvají podle toho, kde je míč a jestli ho má tvůj tým, nebo soupeř.

Pro zajímavost: jedním z prvních dlouhodobě úspěšných systémů byla **pyramida 2-3-5**, zaznamenaná už roku 1880. Tedy pět útočníků a jen dva obránci. Kdyby ji dnes někdo zkusil v okresním přeboru, strejda na tribuně by aspoň viděl hodně gólů. Na obou stranách.`,
    },
    {
      id: "taktika-ofsajd",
      category: "taktika",
      difficulty: 1,
      title: "Ofsajd podle pravidla 11",
      body: `Strejda na tribuně řve „ofsajd!“ pokaždé, když útočník soupeře stojí blíž k bráně než náš stoper. Pravidla ale rozlišují dvě věci: **ofsajdovou pozici** a **ofsajd**. Samotné postavení v ofsajdové pozici není porušení pravidel.

Hráč je v **ofsajdové pozici**, když je kteroukoli částí hlavy, těla nebo nohou zároveň:
- na polovině soupeře (samotná středová čára se nepočítá) a
- blíž k brankové čáře soupeře než míč i než **předposlední hráč soupeře**.

**Ruce a paže se nepočítají**, a to u žádného hráče včetně brankářů. Kdo je **na stejné úrovni** jako předposlední hráč soupeře (nebo jako poslední dva), v ofsajdové pozici není.

Rozhoduje **okamžik, kdy spoluhráč zahraje míč nebo se ho dotkne**. Hráč v ofsajdové pozici je potrestán, jen když se tím **aktivně zapojí do hry**:
- zahraje míč, který mu přihrál nebo tečoval spoluhráč,
- ovlivní soupeře, třeba mu zjevně brání ve výhledu nebo s ním svádí souboj o míč,
- získá výhodu, když k němu míč odskočí od tyče, břevna, rozhodčího nebo soupeře.

Ofsajd není, když hráč dostane míč **přímo z kopu od branky, z vhazování nebo z kopu z rohu**.

Trestem je **nepřímý volný kop** z místa přestupku, a to i kdyby to bylo na vlastní polovině. Asistent rozhodčího nemá mávat každou ofsajdovou pozici, ale až ofsajd, a konečné slovo má stejně hlavní rozhodčí. Takže strejdo, klid. Někdy prostě útočník stál mimo, ale do hry se nezapojil.`,
    },
    {
      id: "taktika-obrana",
      category: "taktika",
      difficulty: 2,
      title: "Zónová a osobní obrana",
      body: `Bránit se dá dvěma základními způsoby a většina týmů je nějak míchá.

**Osobní obrana** znamená, že každý obránce má přiděleného konkrétního soupeře a hlídá ho, kam se hne. Výhodou je **jasná odpovědnost**: když dá gól hráč, kterého jsi měl hlídat, nemusí se v kabině dlouho hledat viník. Nevýhoda: obránce zaměstnaný svým soupeřem se **méně zapojuje do útoku**. A šikovný útočník ho umí odtáhnout z pozice, třeba až na kraj hřiště, a uprostřed pak zůstane díra.

**Zónová obrana** znamená, že hráč hlídá **prostor**, ne člověka. Když do jeho zóny vběhne soupeř, převezme ho, když z ní odběhne, předá ho spoluhráči. Největší výhodou je **pružnost**: hráči zůstávají na svých místech, takže po zisku míče může tým **rychleji rozjet útok**. Slabinou je, že zóna stojí a padá na **komunikaci**. Když si dva obránci neřeknou, kdo bere útočníka, vznikne mezera a útočník v ní stojí sám jako kůl v plotě.

Moderní týmy obvykle **kombinují**. Třeba rozestavení 3-5-2 se v obraně mění na 5-3-2: dva stopeři hrají osobně a třetí obránce jako **zametač** hlídá prostor za nimi.

Co z toho plyne pro trenéra:
- osobní obrana potřebuje hráče, kteří vydrží běhat se soupeřem celý zápas,
- zónová obrana potřebuje hráče, kteří spolu mluví a drží rozestupy,
- aspoň u standardních situací musí být jasno, kdo koho bere. Nejhorší obrana je ta, kde všichni běží na „toho velkýho“ a na malého nezbude nikdo.`,
    },
    {
      id: "taktika-standardky",
      category: "taktika",
      difficulty: 2,
      title: "Standardní situace: roh a volný kop",
      body: `Na okrese padne ze standardek spousta gólů, protože se dají natrénovat. Nejdřív ale pravidla, ať tě sudí z vedlejší vesnice nenachytá.

**Kop z rohu**: míč se položí do rohového čtvrtkruhu na té straně, kde opustil hřiště. Soupeři musí být nejméně **9,15 m** od rohového čtvrtkruhu, dokud míč není ve hře. Míč je ve hře, jakmile je kopnut a zjevně se pohne. **Nemusí opustit rohový čtvrtkruh**, proto jde zahrát i **krátký roh** na spoluhráče pár metrů od praporku. Z rohu jde dát gól přímo, ale jen do soupeřovy branky. A kdo dostane míč přímo z rohu, nemůže být v ofsajdu.

**Přímý volný kop**: gól platí, i když míč letí do soupeřovy branky přímo. **Nepřímý volný kop** poznáš podle paže rozhodčího zdvižené nad hlavou. Když ho kopneš přímo do soupeřovy branky a nikdo další se míče nedotkne, gól neplatí a soupeř kope **od branky**. Míč musí před každým volným kopem ležet v klidu.

**Zeď**: bránící hráči musí stát nejméně **9,15 m** od míče, dokud není ve hře, s výjimkou těch, kdo stojí na vlastní brankové čáře mezi tyčemi. Když zeď tvoří **tři nebo více** bránících hráčů, musí všichni útočníci zůstat nejméně **1 m** od zdi. Když je útočník při kopu blíž, nařídí se **nepřímý volný kop** pro soupeře. Strkání útočníka uvnitř zdi je tedy minulost.

Tipy pro trenéra:
- urči jednoho, nanejvýš dva exekutory, ať se nad míčem nehádají tři,
- měj domluvené dvě tři varianty a znamení, která se hraje,
- u bránění rohů musí být jasno, kdo hlídá prostor a kdo konkrétního hráče,
- nech vzadu **pojistku** proti rychlému protiútoku.`,
    },
    {
      id: "taktika-prechod",
      category: "taktika",
      difficulty: 2,
      title: "Přechodová fáze: po zisku a po ztrátě míče",
      body: `Trenéři dělí zápas na čtyři fáze: **útok** (máme míč), **obrana** (má ho soupeř) a dva **přechody** mezi nimi. Právě přechody rozhodují spoustu zápasů, protože v té chvíli není ani jeden tým úplně připravený.

**Přechod do útoku (po zisku míče).** Soupeř byl před chvílí v útočném postavení: jeho hráči jsou vysunutí dopředu a obrana je roztažená. Tým, který míč získal, má krátkou chvíli, kdy je soupeř **neuspořádaný**. Proto se vyplatí hrát rychle dopředu, do volného prostoru, dřív než se soupeř vrátí. Tomu se říká **protiútok** neboli brejk. Když rychlý přechod nejde, je lepší míč podržet a hru zklidnit, než ho hned zase ztratit.

**Přechod do obrany (po ztrátě míče).** Teď jsi neuspořádaný ty. Hlavním úkolem je **zpomalit soupeřův útok** a dát spoluhráčům čas vrátit se do postavení. Nabízejí se dvě cesty:
- hned napadnout hráče s míčem a zkusit ho získat zpátky, dokud je rozhozený i soupeř,
- stáhnout se, zavřít střed a počkat, až se obrana srovná.

Co se nedělá: po ztrátě míče stát, rozhazovat rukama a hádat se se sudím. Každá vteřina, kdy hráč nadává místo běhu, je vteřina, kdy soupeř běží na tvou bránu.

Pro trenéra z toho plyne jednoduchá rada: hráči musí dopředu vědět, co udělají **hned po zisku a hned po ztrátě** míče. Kdo po ztrátě napadá, kdo jistí prostor za obranou, kam jde první přihrávka po zisku. Když to nevědí, přechod za ně vyřeší soupeř.`,
    },
    {
      id: "taktika-presink",
      category: "taktika",
      difficulty: 3,
      title: "Presink, protipresink a výška bloku",
      body: `**Presink** je společné napadání soupeře, který má míč, s cílem rychle ho získat zpátky. Nejde o to, že jeden útočník vyběhne na stopera a ostatní se dívají. Funguje, jen když se posune celý tým a zavře soupeři blízké přihrávky.

Podle toho, kde tým začíná bránit, se mluví o **výšce bloku**:
- **vysoký blok**: tým napadá už na polovině soupeře a obranná řada stojí vysoko. Míč můžeš získat blízko cizí branky, ale **za obranou zůstává velký prostor**, na který stačí jeden dlouhý míč a rychlý útočník. Obránci musí být rychlí a brankář musí umět vyběhnout.
- **nízký blok**: tým se stáhne hluboko na vlastní polovinu a zavře prostor před svou brankou. Soupeř má míč, ale nemá kam s ním. Tým čeká na zisk a **protiútok**. Riziko: soupeř je dlouho u tvého vápna a dřív nebo později přijde standardka nebo střela z dálky.
- **střední blok** je něco mezi tím.

**Protipresink**, německy **gegenpressing**, je napadání **hned po ztrátě míče**. Útočníci a záložníci místo couvání okamžitě napadnou soupeře, který míč získal. Logika: kdo míč právě získal, bývá **neuspořádaný**, a když ho tvůj tým dostane zpátky vysoko na hřišti, má blízko k bráně. Za autora se považuje **Ralf Rangnick**, proslavily ho týmy **Jürgena Kloppa** a Thomase Tuchela.

Háček: presink i protipresink jsou **fyzicky náročné** a obrana je při nich rozprostřená řidčeji. Když napadání selže, soupeř najde volný prostor. Na okrese, kde půlka kádru přišla rovnou z noční směny, je dobré vědět, na kolik minut presinku tým opravdu má.`,
    },
    {
      id: "taktika-catenaccio",
      category: "taktika",
      difficulty: 3,
      title: "Catenaccio a totální fotbal",
      body: `Dva styly, které se dodnes vytahují, když se v hospodě hádá, jestli se má bránit, nebo útočit.

**Catenaccio** znamená italsky **závora** na dveřích. Předobrazem byl systém **verrou** (francouzsky taky závora), který ve 30. a 40. letech hrálo Švýcarsko pod rakouským trenérem **Karlem Rappanem**. V Itálii ho rozvinul **Nereo Rocco**, poprvé roku 1947 s Triestinou, a v 60. letech ho proslavil **Helenio Herrera** s **Interem Milán**, který tehdy mimo jiné dvakrát vyhrál Pohár mistrů evropských.

Základ catenaccia:
- obránci **osobně** hlídají útočníky soupeře,
- za nimi hraje **libero** (italsky „volný“) neboli zametač, který uklízí všechno, co propadne,
- po zisku míče tým rychle vyráží do **protiútoku**.

**Totální fotbal** je skoro opak. Jeho myšlenka: **kterýkoli hráč v poli může převzít roli kteréhokoli spoluhráče**. Pozice se za hry plynule prohazují, a kdo opustí své místo, toho nahradí spoluhráč, takže tým drží strukturu. Obvykle se připisuje trenérovi **Rinusi Michelsovi**, který ho v 70. letech zavedl v **Ajaxu** a v reprezentaci **Nizozemska**. Nejslavnějším hráčem stylu byl **Johan Cruyff**. Důležitý byl presink a práce s prostorem, který hráči neustále vytvářeli.

Na **mistrovství světa 1974** Nizozemci okouzlili svět, ale **finále prohráli se Západním Německem 1:2**. Krásný fotbal tedy nemusí vždycky vyhrát, což ví každý, kdo prohrál se sousední vesnicí po jediném odkopnutém míči.

Oba styly ovlivnily dnešní fotbal: z catenaccia zůstala disciplína a organizovaná obrana, z totálního fotbalu pohyb, výměny pozic a napadání.`,
    },
    {
      id: "taktika-falesna-devitka",
      category: "taktika",
      difficulty: 3,
      title: "Falešná devítka",
      body: `Číslo **9** tradičně nosí **hrotový útočník**: drží se u obranné řady soupeře a čeká na chvíli, kdy se dostane za ni. **Falešná devítka** vypadá na soupisce stejně, ale hraje jinak: z hrotu **couvá do zálohy**.

Proč to funguje? Stopeři soupeře stojí před dilematem:
- když ji následují do zálohy, **otevřou prostor za sebou**, kam můžou naběhnout křídla nebo záložníci,
- když zůstanou na místě, dostane falešná devítka mezi řadami **čas a prostor** na otočku a přihrávku.

Falešná devítka proto potřebuje hlavně **driblink, krátkou kombinaci a přehled na přihrávku za obranu**. Hromotluk, který umí jen hlavičkovat, na to není.

Z historie:
- Už ve 30. letech takhle hrál **Matthias Sindelar** v rakouském Wunderteamu.
- Slavný je zápas **Anglie s Maďarskem** 25. listopadu 1953 ve Wembley. Maďaři vyhráli **6:3** a **Nándor Hidegkuti** jako hluboko stažený středový útočník dal tři góly. Anglický střední obránce Harry Johnston nevěděl, jestli ho má hlídat, nebo zůstat vzadu. Anglie tehdy poprvé doma prohrála s týmem z kontinentální Evropy.
- V moderní době roli proslavil **Lionel Messi** v Barceloně pod **Pepem Guardiolou**. Španělsko s **Cescem Fàbregasem** jako falešnou devítkou vyhrálo **Euro 2012**, Fàbregas tak nastoupil i ve finále.

Pro okresního trenéra: falešná devítka dává smysl, když máš technického hráče a rychlé nabíhající záložníky. Když nemáš ani jedno, zůstaň u klasického útočníka, který stojí stoperovi za zády a otravuje ho celých devadesát minut.`,
    },
  ],

  questions: [
    // ── Rozestavení ──
    {
      id: "taktika-rozestaveni-1",
      lessonId: "taktika-rozestaveni",
      text: "Co v rozestavení 4-4-2 znamená první číslo?",
      options: ["Počet obránců", "Počet útočníků", "Počet brankářů a obránců dohromady", "Počet hráčů na lavičce"],
      correct: 0,
      explain: "Čísla se čtou odzadu dopředu, takže první číslo jsou obránci. Brankář se do rozestavení nepočítá.",
    },
    {
      id: "taktika-rozestaveni-2",
      lessonId: "taktika-rozestaveni",
      text: "Kolik dává součet čísel v rozestavení a proč?",
      options: [
        "Jedenáct, počítají se všichni hráči na hřišti",
        "Devět, nepočítá se brankář ani kapitán",
        "Deset, protože se nepočítá brankář",
        "Podle toho, kolik hráčů zrovna přišlo na zápas",
      ],
      correct: 2,
      explain: "Brankář se do rozestavení nepočítá, takže čísla dávají dohromady deset hráčů v poli.",
    },
    {
      id: "taktika-rozestaveni-3",
      lessonId: "taktika-rozestaveni",
      text: "Co dělají wingbeci v rozestavení 3-5-2?",
      options: [
        "Stojí jen vzadu vedle stoperů",
        "Hrají jen v útoku a nevracejí se",
        "Střídají se s brankářem",
        "Obsluhují celou lajnu a pomáhají v obraně i v útoku",
      ],
      correct: 3,
      explain: "Wingbeci běhají celou stranu hřiště od vlastní branky k soupeřově. Když se tým brání, klesnou dozadu a vznikne 5-3-2.",
    },
    {
      id: "taktika-rozestaveni-4",
      lessonId: "taktika-rozestaveni",
      text: "Jak se jmenoval jeden z prvních dlouhodobě úspěšných systémů, který hrál s pěti útočníky?",
      options: ["Catenaccio", "Pyramida 2-3-5", "Totální fotbal", "Rozestavení 4-2-3-1"],
      correct: 1,
      explain: "Pyramida 2-3-5 je zaznamenaná už z roku 1880 a měla pět útočníků a jen dva obránce.",
    },

    // ── Ofsajd ──
    {
      id: "taktika-ofsajd-1",
      lessonId: "taktika-ofsajd",
      text: "Útočník stojí v ofsajdové pozici, ale do hry se nezapojí a přihrávku dostane jiný spoluhráč, který v ofsajdové pozici není. Co rozhodčí?",
      options: [
        "Píská ofsajd, stačí stát v ofsajdové pozici",
        "Nechá hrát, samotná ofsajdová pozice není porušení pravidel",
        "Píská ofsajd a útočníkovi ukáže žlutou",
        "Přeruší hru a nařídí míč rozhodčího",
      ],
      correct: 1,
      explain: "Ofsajdová pozice sama o sobě není přestupek. Trestá se jen hráč, který se aktivně zapojí do hry.",
    },
    {
      id: "taktika-ofsajd-2",
      lessonId: "taktika-ofsajd",
      text: "Ze kterého navázání hry nemůže být ofsajd, když hráč dostane míč přímo?",
      options: ["Z přímého volného kopu", "Z nepřímého volného kopu", "Z výhozu brankáře rukou", "Z kopu z rohu"],
      correct: 3,
      explain: "Ofsajd se netrestá, když hráč dostane míč přímo z kopu od branky, z vhazování nebo z kopu z rohu.",
    },
    {
      id: "taktika-ofsajd-3",
      lessonId: "taktika-ofsajd",
      text: "Jak se trestá ofsajd?",
      options: [
        "Nepřímým volným kopem z místa přestupku",
        "Přímým volným kopem",
        "Žlutou kartou a přímým volným kopem",
        "Vždycky kopem od branky",
      ],
      correct: 0,
      explain: "Za ofsajd rozhodčí nařídí nepřímý volný kop tam, kde k přestupku došlo, i kdyby to bylo na vlastní polovině.",
    },
    {
      id: "taktika-ofsajd-4",
      lessonId: "taktika-ofsajd",
      text: "Útočník je v okamžiku přihrávky na stejné úrovni jako předposlední hráč soupeře. Je v ofsajdové pozici?",
      options: [
        "Ano, stejná úroveň se počítá jako ofsajd",
        "Ano, pokud je na polovině soupeře",
        "Ne, na stejné úrovni v ofsajdové pozici není",
        "Záleží na tom, jestli má před obráncem natažené ruce",
      ],
      correct: 2,
      explain: "Hráč na stejné úrovni jako předposlední hráč soupeře v ofsajdové pozici není. Ruce a paže se navíc vůbec nepočítají.",
    },

    // ── Zónová a osobní obrana ──
    {
      id: "taktika-obrana-1",
      lessonId: "taktika-obrana",
      text: "Co je podstatou zónové obrany?",
      options: [
        "Každý obránce celý zápas hlídá jednoho určeného soupeře",
        "Hráč hlídá prostor a soupeře převezme, když do něj vběhne",
        "Všichni obránci stojí na brankové čáře",
        "Obránci se po deseti minutách střídají v hlídání",
      ],
      correct: 1,
      explain: "Při zónové obraně hráč hlídá prostor, ne člověka. Soupeře převezme, když vběhne do jeho zóny, a předá ho, když z ní odběhne.",
    },
    {
      id: "taktika-obrana-2",
      lessonId: "taktika-obrana",
      text: "Jakou hlavní výhodu zónové obrany uvádí lekce?",
      options: [
        "Pružnost: hráči zůstávají na místech a po zisku míče rychleji rozjedou útok",
        "Nepotřebuje žádnou komunikaci",
        "Obránci při ní nemusí vůbec běhat",
        "Soupeř nemůže hrát do stran",
      ],
      correct: 0,
      explain: "Největší výhodou zóny je pružnost. Hráči zůstávají na svých místech, takže po zisku míče může tým rychleji zaútočit.",
    },
    {
      id: "taktika-obrana-3",
      lessonId: "taktika-obrana",
      text: "Co je slabinou zónové obrany?",
      options: [
        "Obránci se nezapojují do útoku, protože hlídají svého soupeře",
        "Nedá se hrát proti dvěma útočníkům",
        "Stojí a padá na komunikaci, bez ní vznikají mezery",
        "Pravidla ji v okresních soutěžích zakazují",
      ],
      correct: 2,
      explain: "Když si obránci neřeknou, kdo bere útočníka, vznikne mezera. Menší zapojení do útoku je naopak nevýhoda osobní obrany.",
    },
    {
      id: "taktika-obrana-4",
      lessonId: "taktika-obrana",
      text: "Jakou nevýhodu osobní obrany uvádí lekce?",
      options: [
        "Nikdo neví, za koho odpovídá",
        "Pravidla ji zakazují při kopech z rohu",
        "Hráči musí spolu neustále mluvit, jinak vznikají mezery",
        "Obránce se méně zapojuje do útoku a útočník ho může odtáhnout z pozice",
      ],
      correct: 3,
      explain: "Obránce zaměstnaný svým soupeřem méně pomáhá v útoku a šikovný útočník ho může vytáhnout z pozice. Jasná odpovědnost je naopak výhoda osobní obrany.",
    },

    // ── Standardní situace ──
    {
      id: "taktika-standardky-1",
      lessonId: "taktika-standardky",
      text: "Jak daleko musí být soupeři při kopu z rohu, dokud míč není ve hře?",
      options: [
        "Nejméně 5 m od míče",
        "Nejméně 11 m od rohového praporku",
        "Kdekoli mimo pokutové území",
        "Nejméně 9,15 m od rohového čtvrtkruhu",
      ],
      correct: 3,
      explain: "Soupeři musí stát nejméně 9,15 m od rohového čtvrtkruhu, dokud míč není ve hře.",
    },
    {
      id: "taktika-standardky-2",
      lessonId: "taktika-standardky",
      text: "Zeď tvoří tři bránící hráči a útočník při kopu stojí půl metru od ní. Co následuje?",
      options: [
        "Nic, útočník smí stát kdekoli",
        "Kop se opakuje a útočník dostane červenou",
        "Nepřímý volný kop pro bránící tým",
        "Pokutový kop",
      ],
      correct: 2,
      explain: "Když zeď tvoří tři a více hráčů, musí útočníci zůstat nejméně 1 m od ní. Kdo je blíž, způsobí nepřímý volný kop pro soupeře.",
    },
    {
      id: "taktika-standardky-3",
      lessonId: "taktika-standardky",
      text: "Nepřímý volný kop letí přímo do soupeřovy branky a nikdo další se míče nedotkne. Co rozhodčí nařídí?",
      options: ["Kop od branky", "Gól platí", "Opakování kopu", "Kop z rohu pro útočící tým"],
      correct: 0,
      explain: "Z nepřímého volného kopu nejde dát gól přímo. Když míč bez doteku jiného hráče skončí v soupeřově brance, soupeř kope od branky.",
    },
    {
      id: "taktika-standardky-4",
      lessonId: "taktika-standardky",
      text: "Musí míč při kopu z rohu opustit rohový čtvrtkruh, aby byl ve hře?",
      options: [
        "Ano, jinak se kop opakuje",
        "Ano, musí urazit aspoň 9,15 m",
        "Ne, stačí, že je kopnut a zjevně se pohne",
        "Jen když se hraje krátký roh",
      ],
      correct: 2,
      explain: "Míč je ve hře, jakmile je kopnut a zjevně se pohne. Nemusí opustit rohový čtvrtkruh, proto jde hrát i krátký roh.",
    },

    // ── Přechodová fáze ──
    {
      id: "taktika-prechod-1",
      lessonId: "taktika-prechod",
      text: "Na jaké čtyři fáze dělí trenéři zápas?",
      options: [
        "První poločas, druhý poločas, nastavení a penalty",
        "Útok, obrana, přechod do útoku a přechod do obrany",
        "Rozcvička, zápas, děkovačka a hospoda",
        "Presink, blok, standardky a střídání",
      ],
      correct: 1,
      explain: "Zápas se dělí na útok, obranu a dva přechody mezi nimi: po zisku míče a po jeho ztrátě.",
    },
    {
      id: "taktika-prechod-2",
      lessonId: "taktika-prechod",
      text: "Proč se po zisku míče vyplatí hrát rychle dopředu?",
      options: [
        "Soupeř je chvíli neuspořádaný, jeho hráči jsou vysunutí a obrana roztažená",
        "Pravidla po zisku míče zakazují hrát dozadu",
        "Rozhodčí po zisku míče chvíli nepíská ofsajd",
        "Aby si hráči co nejdřív odpočinuli",
      ],
      correct: 0,
      explain: "Soupeř byl před chvílí v útočném postavení, takže je krátce neuspořádaný. Rychlý protiútok toho využije.",
    },
    {
      id: "taktika-prechod-3",
      lessonId: "taktika-prechod",
      text: "Co je hlavním úkolem týmu hned po ztrátě míče?",
      options: [
        "Protestovat u rozhodčího, dokud je čas",
        "Poslat všechny hráče do útoku",
        "Zpomalit soupeřův útok a vrátit se do postavení",
        "Počkat, co udělá soupeř",
      ],
      correct: 2,
      explain: "Po ztrátě míče je neuspořádaný vlastní tým, proto musí soupeřův útok zpomalit a dát spoluhráčům čas vrátit se.",
    },
    {
      id: "taktika-prechod-4",
      lessonId: "taktika-prechod",
      text: "Co lekce doporučuje, když po zisku míče rychlý protiútok nejde?",
      options: [
        "Nakopnout míč co nejdál",
        "Zahrát míč hned do autu",
        "Zkusit střelu z vlastní poloviny",
        "Podržet míč a zklidnit hru, místo aby ho tým hned ztratil",
      ],
      correct: 3,
      explain: "Když rychlý přechod nejde, je lepší míč podržet a hru zklidnit než ho hned znovu ztratit.",
    },

    // ── Presink ──
    {
      id: "taktika-presink-1",
      lessonId: "taktika-presink",
      text: "Co je protipresink (gegenpressing)?",
      options: [
        "Napadání soupeře hned po ztrátě míče",
        "Stažení celého týmu na vlastní vápno",
        "Ofsajdová past při standardních situacích",
        "Osobní obrana na nejlepšího hráče soupeře",
      ],
      correct: 0,
      explain: "Při protipresinku útočníci a záložníci po ztrátě míče necouvají, ale okamžitě napadnou soupeře, který míč získal.",
    },
    {
      id: "taktika-presink-2",
      lessonId: "taktika-presink",
      text: "Proč má protipresink smysl?",
      options: [
        "Pravidla zakazují soupeři přihrávat dozadu",
        "Soupeř, který míč právě získal, bývá neuspořádaný",
        "Rozhodčí po ztrátě míče nepíská fauly",
        "Obránci soupeře jsou vždycky pomalejší",
      ],
      correct: 1,
      explain: "Kdo míč právě získal, bývá neuspořádaný. Když ho tým dostane zpátky vysoko na hřišti, má blízko k bráně.",
    },
    {
      id: "taktika-presink-3",
      lessonId: "taktika-presink",
      text: "Jaké je hlavní riziko vysokého bloku?",
      options: [
        "Soupeř je dlouho u tvého vápna",
        "Tým nemá šanci na protiútok",
        "Velký prostor za obranou, na který stačí dlouhý míč a rychlý útočník",
        "Hráči se při něm nudí",
      ],
      correct: 2,
      explain: "Při vysokém bloku stojí obranná řada vysoko a za ní zůstává prostor. Dlouhé setrvání soupeře u vápna je naopak riziko nízkého bloku.",
    },
    {
      id: "taktika-presink-4",
      lessonId: "taktika-presink",
      text: "Kdo je podle lekce považován za autora gegenpressingu?",
      options: ["Rinus Michels", "Helenio Herrera", "Nereo Rocco", "Ralf Rangnick"],
      correct: 3,
      explain: "Za autora gegenpressingu se považuje Ralf Rangnick. Proslavily ho týmy Jürgena Kloppa a Thomase Tuchela.",
    },

    // ── Catenaccio a totální fotbal ──
    {
      id: "taktika-catenaccio-1",
      lessonId: "taktika-catenaccio",
      text: "Co znamená italské slovo catenaccio?",
      options: ["Řetězový útok", "Závora na dveřích", "Rychlý protiútok", "Volný hráč"],
      correct: 1,
      explain: "Catenaccio znamená italsky závora. „Volný“ znamená slovo libero, tedy hráč za obranou.",
    },
    {
      id: "taktika-catenaccio-2",
      lessonId: "taktika-catenaccio",
      text: "Jakou roli měl v catenacciu libero?",
      options: [
        "Hrál jako hrotový útočník",
        "Byl to kapitán, který jediný mluvil s rozhodčím",
        "Byl to záložník, který kopal všechny standardky",
        "Volný hráč za obránci, který uklízel, co propadlo",
      ],
      correct: 3,
      explain: "Obránci hlídali útočníky osobně a za nimi hrál libero neboli zametač, který uklízel všechno, co propadlo.",
    },
    {
      id: "taktika-catenaccio-3",
      lessonId: "taktika-catenaccio",
      text: "Co je hlavní myšlenkou totálního fotbalu?",
      options: [
        "Kterýkoli hráč v poli může převzít roli kteréhokoli spoluhráče",
        "Všichni hráči osobně hlídají soupeře",
        "Tým se stáhne na vlastní vápno a čeká",
        "Útočníci se nevracejí do obrany",
      ],
      correct: 0,
      explain: "V totálním fotbale se pozice plynule prohazují. Kdo opustí své místo, toho nahradí spoluhráč a tým drží strukturu.",
    },
    {
      id: "taktika-catenaccio-4",
      lessonId: "taktika-catenaccio",
      text: "Jak dopadlo Nizozemsko na mistrovství světa 1974?",
      options: [
        "Vyhrálo finále nad Brazílií",
        "Vypadlo ve skupině",
        "Prohrálo finále se Západním Německem 1:2",
        "Na turnaj se nekvalifikovalo",
      ],
      correct: 2,
      explain: "Nizozemci s totálním fotbalem okouzlili svět, ale finále prohráli se Západním Německem 1:2.",
    },

    // ── Falešná devítka ──
    {
      id: "taktika-falesna-devitka-1",
      lessonId: "taktika-falesna-devitka",
      text: "Čím se falešná devítka liší od klasického hrotového útočníka?",
      options: [
        "Hraje v brance",
        "Couvá z hrotu do zálohy",
        "Nesmí vstoupit do pokutového území",
        "Hraje jen hlavou",
      ],
      correct: 1,
      explain: "Klasická devítka se drží u obranné řady soupeře, falešná devítka z hrotu couvá do zálohy.",
    },
    {
      id: "taktika-falesna-devitka-2",
      lessonId: "taktika-falesna-devitka",
      text: "Jaké dilema má stoper proti falešné devítce?",
      options: [
        "Jestli má hrát rukou, nebo nohou",
        "Jestli má jít na hřiště, nebo zůstat na lavičce",
        "Když ji následuje, otevře prostor za sebou; když zůstane, dá jí čas a prostor",
        "Jestli ji smí faulovat, když je v ofsajdové pozici",
      ],
      correct: 2,
      explain: "Když stoper jde za falešnou devítkou do zálohy, otevře prostor za sebou. Když zůstane, má devítka mezi řadami čas na otočku a přihrávku.",
    },
    {
      id: "taktika-falesna-devitka-3",
      lessonId: "taktika-falesna-devitka",
      text: "Kdo dal jako hluboko stažený středový útočník tři góly při maďarské výhře 6:3 ve Wembley v roce 1953?",
      options: ["Matthias Sindelar", "Johan Cruyff", "Harry Johnston", "Nándor Hidegkuti"],
      correct: 3,
      explain: "Tři góly dal Nándor Hidegkuti. Harry Johnston byl anglický střední obránce, který nevěděl, jestli ho má hlídat.",
    },
    {
      id: "taktika-falesna-devitka-4",
      lessonId: "taktika-falesna-devitka",
      text: "Které vlastnosti lekce uvádí jako klíčové pro falešnou devítku?",
      options: [
        "Driblink, krátká kombinace a přehled na přihrávku za obranu",
        "Výška a síla v hlavičkových soubojích",
        "Hlavně rychlost, nic jiného",
        "Dlouhý výkop a silná levačka",
      ],
      correct: 0,
      explain: "Falešná devítka hraje mezi řadami, takže potřebuje driblink, krátkou kombinaci a přehled na přihrávku za obranu.",
    },
  ],
};
