/**
 * Další díly skript „Legendy a kabina“ (vlastnost Motivace). 1. díl je v `../legendy.ts`.
 *
 * Základní kurz: 2. díl „Česká stopa“, 3. díl „Velcí trenéři“, 4. díl „Zázraky outsiderů“.
 * Pokročilý kurz: 2. díl „Psychologie vítězů“.
 *
 * Fakta ověřena proti Wikipedii (anglické, české, u Bernu i německé) a vždy ještě
 * dalšímu zdroji (UEFA.com, FIFA, Olympedia, renomovaná média). Kde se zdroje liší
 * (přesné minuty, počty diváků, autorství výroků), je údaj vynechaný nebo opatrně
 * parafrázovaný a neptá se na něj žádná otázka.
 *
 * MS 1934: en.wikipedia.org/wiki/1934_FIFA_World_Cup_final, cs.wikipedia.org/wiki/
 * Mistrovství_světa_ve_fotbale_1934, cs/en Wikipedie „František Plánička“ (Slavia,
 * 73 zápasů, zlomená ruka 1938, diplom fair play UNESCO 1985). Datum narození se
 * ve zdrojích liší, vynecháno.
 * MS 1962: en.wikipedia.org/wiki/1962_FIFA_World_Cup_final a …_knockout_stage,
 * cs.wikipedia.org/wiki/Mistrovství_světa_ve_fotbale_1962, cs.wikipedia.org/wiki/
 * Rudolf_Vytlačil, UEFA.com (UEFA President's Award pro J. Masopusta, vzpomínka
 * Josefa Jelínka na zraněného Pelého). Osmnáctičlenná výprava jen v jednom zdroji, vynecháno.
 * OH 1980: en/cs Wikipedie „Football at the 1980 Summer Olympics“, Olympedia
 * (výsledky, pravidla účasti, střídající Svoboda), FIFA (vyloučení Bergera
 * a Steinbacha v 58. minutě). Jak Svoboda skóroval (hlavou?), se liší, vynecháno.
 * Nedvěd: en/cs Wikipedie „Pavel Nedvěd“, en.wikipedia.org/wiki/
 * 1999_UEFA_Cup_Winners'_Cup_final, UEFA.com „Nedved's never-never land“ (2006).
 * Ferguson: en/cs Wikipedie „Alex Ferguson“, en.wikipedia.org/wiki/
 * 1983_European_Cup_Winners'_Cup_final, en.wikipedia.org/wiki/Fergie's_Fledglings;
 * fén „asi šestkrát za 27 let“: Fergusonův projev na World Business Forum v Miláně
 * (The Sun / Wexford Echo, 10. 11. 2016). Přesné znění Hansenova výroku se ve zdrojích
 * liší, jen parafráze.
 * Sacchi: en/cs Wikipedie „Arrigo Sacchi“, en.wikipedia.org/wiki/1988–89_European_Cup,
 * en.wikipedia.org/wiki/1990_European_Cup_final.
 * Del Bosque: en.wikipedia.org/wiki/Vicente_del_Bosque, …/2010_FIFA_World_Cup_final,
 * …/UEFA_Euro_2012_final, FourFourTwo a FC Barcelona (Iniestovo tričko pro D. Jarqueho),
 * football-espana.net a Soccer Laduma (telefonát Casillase Xavimu a Puyolovi, 2011),
 * AFP přes China Daily a Ahram Online (del Bosque o klubové rivalitě, 2012).
 * Ancelotti: en.wikipedia.org/wiki/Carlo_Ancelotti, …/2014_UEFA_Champions_League_final,
 * …/2007_UEFA_Champions_League_final, Penguin (anotace knihy Quiet Leadership, 2016)
 * a úryvek z knihy (autorita z respektu a důvěry, ne ze strachu),
 * bundesliga.com a Livesoccertv (obočí). Citát „zvednu obočí a hrajete líp“ neověřen, vynechán.
 * Řecko 2004: en.wikipedia.org/wiki/UEFA_Euro_2004_final, en.wikipedia.org/wiki/
 * Otto_Rehhagel, cs.wikipedia.org/wiki/Mistrovství_Evropy_ve_fotbale_2004, UEFA.com
 * („Looking back on Greece's shock EURO 2004 win“). Kurz 150:1 jen v jednom zdroji, vynechán.
 * Bern 1954: en.wikipedia.org/wiki/1954_FIFA_World_Cup_final, de.wikipedia.org/wiki/
 * Wunder_von_Bern, de.wikipedia.org/wiki/Sepp_Herberger, cs.wikipedia.org/wiki/
 * Mistrovství_světa_ve_fotbale_1954. Délka maďarské série se liší (31 / 32 zápasů),
 * proto jen „od roku 1950“. Herbergerovy výroky („míč je kulatý“) ve zdrojích nedohledány.
 * Forest: en.wikipedia.org/wiki/Brian_Clough, …/1978–79_European_Cup,
 * …/1979_European_Cup_final, …/1980_European_Cup_final.
 * Island: en.wikipedia.org/wiki/Iceland_national_football_team, …/Heimir_Hallgrímsson,
 * UEFA.com a FA (zápas s Anglií), ESPN, Irish Times a Eurosport (Ronaldo a Lagerbäck),
 * The Scotsman a KSÍ (haly, licence trenérů). Počet obyvatel se liší (320–333 tisíc),
 * proto „zhruba 330 tisíc“.
 * Maracanazo: en.wikipedia.org/wiki/Uruguay_v_Brazil_(1950_FIFA_World_Cup), en.wikipedia.org/
 * wiki/Alcides_Ghiggia, NBC Sports a AFP (Ghiggiův výrok), ESPN a Goal.com („Los de afuera
 * son de palo“; autorství sporné, proto bez jména).
 * Maroko 2022: en.wikipedia.org/wiki/Morocco_national_football_team, …/Walid_Regragui,
 * Hespress (Regragui o „nia“ a rodinách), Dawn a AP (matky, rodiny v Kataru), CBS Sports
 * a AP (rozstřel se Španělskem).
 * Real Madrid 2022: en.wikipedia.org/wiki/2021–22_Real_Madrid_CF_season, …/2022_UEFA_
 * Champions_League_final, Sky Sports a NBC Sports (minuty gólů), football-espana.net
 * a Público (Valdano a „miedo escénico“), ESPN (Juanito, „prý“).
 * Chelsea 2012: en.wikipedia.org/wiki/2012_UEFA_Champions_League_final, UEFA.com
 * (Chelsea – Neapol 4:1, Villas-Boas), Sportbible a Mediotiempo (Čechova příprava na penalty).
 */
import type { CategoryContent, PartTitles } from "../types";

export const MOTIVATION_PART_TITLES: PartTitles = {
  attr_basic: { 2: "Česká stopa", 3: "Velcí trenéři", 4: "Zázraky outsiderů" },
  attr_advanced: { 2: "Psychologie vítězů" },
};

export const MOTIVATION_PARTS: CategoryContent = {
  lessons: [
    // ── Základní kurz, 2. díl: Česká stopa ──
    {
      id: "legendy-world-cup-1934",
      category: "legendy",
      difficulty: 2,
      part: 2,
      title: "Řím 1934: Plánička a první finále",
      body: `Na **mistrovství světa 1934 v Itálii** jelo Československo s trenérem **Karlem Petrů** a s kapitánem, který stál v brance. **František Plánička** chytal od roku 1923 až do konce kariéry za **Slavii Praha** a za reprezentaci odchytal **73 oficiálních zápasů**.

Turnaj se hrál vyřazovacím systémem od prvního zápasu: kdo prohrál, jel domů. Československo porazilo v Terstu **Rumunsko 2:1**, v Turíně **Švýcarsko 3:2** a v semifinále v Římě **Německo 3:1**. Všechny tři góly proti Němcům dal útočník **Oldřich Nejedlý**, který se s **pěti góly** stal nejlepším střelcem mistrovství.

Finále se hrálo **10. června 1934 v Římě** proti domácí **Itálii** trenéra Vittoria Pozza, v horku kolem čtyřiceti stupňů. Dlouho se držela nula, pak poslal Československo do vedení **Antonín Puč**. Italové ale devět minut před koncem vyrovnali zásluhou Raimunda Orsiho a v prodloužení rozhodl Angelo Schiavio. Itálie vyhrála **2:1 po prodloužení** a Československo si odvezlo **stříbro**, svou první medaili z mistrovství světa.

Plánička byl vzorem i mimo velké zápasy:
- Za Slavii odchytal téměř tisíc utkání a jinam nepřestoupil.
- Na **mistrovství světa 1938** proti Brazílii dochytal celý zápas **se zlomenou rukou**.
- V roce **1985** převzal od **UNESCO** čestný diplom **fair play**.

Poučení pro kabinu: kapitán nemusí být nejhlasitější chlap v šatně. Stačí, když to vzdá poslední a soupeři podá ruku první. A kdo tvrdí, že brankář se na kapitánskou pásku nehodí, ať si o Pláničkovi něco přečte, než to zopakuje u výčepu.`,
    },
    {
      id: "legendy-world-cup-1962",
      category: "legendy",
      difficulty: 2,
      part: 2,
      title: "Chile 1962: cesta do finále",
      body: `Na **mistrovství světa 1962 v Chile** nikdo Československo mezi favority nepočítal. Tým trenéra **Rudolfa Vytlačila** odehrál všechny zápasy skupiny ve **Viña del Mar**. Porazil **Španělsko 1:0**, remizoval s obhájcem titulu **Brazílií 0:0** a prohrál s **Mexikem 1:3**, přestože vedl od první minuty. Na postup to stačilo.

V zápase s Brazílií se zranil **Pelé**. **Střídat se tehdy nesmělo**, a tak zůstal na hřišti. Podle vzpomínek spoluhráče Josefa Jelínka ho **Josef Masopust** nenapadal a nechal ho míč v klidu rozehrát. Pelé už na mistrovství nenastoupil.

- Ve čtvrtfinále v Rancague rozhodl **Adolf Scherer** gólem na **1:0 nad Maďarskem**. Brankář **Viliam Schrojf** pak chytal jeden maďarský pokus za druhým.
- V semifinále padla **Jugoslávie 3:1**, dva góly dal opět Scherer, jeden z penalty.

Finále se hrálo **17. června 1962** na Národním stadionu v **Santiagu**. Masopust dal úvodní gól, Brazílie ale o dvě minuty později vyrovnala po **chybě dosud skvělého Schrojfa**. Ve druhém poločase přidali Zito a Vavá a i Vavovu gólu předcházela brankářova chyba. Brazílie vyhrála **3:1**, Československo bralo **stříbro**.

Poučení pro kabinu: Schrojf dovedl tým do finále a ve finále ho dvakrát zradily ruce. Parta, která v takové chvíli hledá viníka, další finále nehraje. A Masopustovo gesto vůči zraněnému Pelému ukazuje, že tvrdost a slušnost jdou dohromady i na mistrovství světa, natož v okresním derby.`,
    },
    {
      id: "legendy-olympics-1980",
      category: "legendy",
      difficulty: 2,
      part: 2,
      title: "Moskva 1980: zlato z lavičky",
      body: `Olympijské hry v **Moskvě 1980** poznamenal **bojkot**: řada západních zemí na ně kvůli sovětské invazi do Afghánistánu neodjela. Ve fotbale navíc platilo, že nesměli hrát **evropští a jihoameričtí hráči, kteří nastoupili v kvalifikaci nebo na mistrovství světa 1978**. Olympiáda tak byla šancí pro ty, kdo se do největších zápasů zatím nedostali.

Československo vedl trenér **František Havránek**. Skupinu odehrálo v Leningradě:
- **Kolumbie 3:0**,
- **Nigérie 1:1**,
- **Kuvajt 0:0**.

Ve čtvrtfinále padla **Kuba 3:0**, dva góly dal **Ladislav Vízek**, a v semifinále v Moskvě **Jugoslávie 2:0**.

Finále se hrálo **2. srpna 1980** na Leninově stadionu v Lužnikách před **70 000 diváky**. Soupeřem byla **NDR**. V **58. minutě** rozhodčí vyloučil tvůrce hry z obou týmů, za Československo **Jana Bergera**, za NDR Wolfganga Steinbacha. Zápas se pak dohrával deset na deset. Ve druhém poločase poslal Havránek na hřiště záložníka brněnské Zbrojovky **Jindřicha Svobodu** a ten jako **střídající hráč** v **77. minutě** vstřelil jediný gól zápasu.

Pro Československo to bylo **první olympijské zlato ve fotbale**. Předtím hrálo olympijské finále dvakrát, v letech 1920 a 1964, a ani jednou nevyhrálo.

Poučení pro kabinu: zlato nevyhrála jedna hvězda, ale celá parta, včetně kluka, který přišel z lavičky. A Bergerova červená připomíná, že jediná chvilka vzteku může nechat tým v deseti. Na okrese k tomu stačí jedno slovo na sudího navíc.`,
    },
    {
      id: "legendy-nedved-ballon-dor",
      category: "legendy",
      difficulty: 2,
      part: 2,
      title: "Pavel Nedvěd: Zlatý míč ze Skalné",
      body: `**Pavel Nedvěd** se narodil **30. srpna 1972 v Chebu** a vyrůstal ve **Skalné**, kde začal kopat v místním Tatranu už v pěti letech. Přes **Duklu Praha**, kde hrál během vojny, se dostal do **Sparty** a po stříbrném mistrovství Evropy 1996 odešel do Itálie.

V **Laziu Řím** se z něj stala hvězda. V roce **1999** rozhodl gólem finále **Poháru vítězů pohárů** proti Mallorce (2:1) a o rok později slavil italský titul. V létě **2001** ho koupil **Juventus** jako náhradu za **Zinédina Zidana**, který odešel do Realu Madrid. Italští fanoušci mu říkali **Furia Ceca**, česká fúrie.

Sezóna **2002/03** byla vrchol i rána zároveň:
- s Juventusem vyhrál **italskou ligu**,
- v semifinále Ligy mistrů proti **Realu Madrid** dostal po faulu na Steva McManamana **žlutou kartu**, kvůli které musel vynechat **finále**,
- Juventus finále bez něj prohrál s AC Milán na penalty.

Přesto získal **Zlatý míč za rok 2003** před Thierrym Henrym a Paolem Maldinim. Byl to druhý Zlatý míč pro českého hráče, prvním držitelem byl **Josef Masopust**.

V roce **2006** byl Juventus za trest kvůli aféře s ovlivňováním zápasů přeřazen do **Serie B**. Řada hvězd odešla. Nedvěd **zůstal**, ve druhé lize dal jedenáct gólů a pomohl klubu zpátky mezi elitu. UEFA o něm psala jako o hráči, který se k tomu, že je workoholik, sám přiznával.

Poučení pro kabinu: talent ze Skalné nepřišel z dovozu, ale z dřiny. A hráče, který zůstane s klubem i po sestupu, si kabina váží víc než deseti posil, které utečou při první krizi. Na okrese to platí dvojnásob, tam se o sestupu mluví u piva ještě deset let.`,
    },

    // ── Základní kurz, 3. díl: Velcí trenéři ──
    {
      id: "legendy-alex-ferguson",
      category: "legendy",
      difficulty: 2,
      part: 3,
      title: "Sir Alex Ferguson: 27 let na lavičce",
      body: `**Alex Ferguson** se jako trenér proslavil už ve Skotsku. S **Aberdeenem** v sezóně 1979/80 přerušil nadvládu glasgowských **Rangers a Celticu**, kteří předtím patnáct let titul nepustili. Dne **11. května 1983** pak v **Göteborgu** porazil ve finále **Poháru vítězů pohárů Real Madrid 2:1** po prodloužení.

Do **Manchesteru United** přišel **6. listopadu 1986**. Začátky byly těžké a první velkou trofej přinesl až **FA Cup v roce 1990**. Traduje se, že mu místo zachránil gól Marka Robinse ve třetím kole poháru proti Nottinghamu Forest. **Ligový titul** slavil United v sezóně **1992/93** poprvé po **26 letech**.

Ferguson stavěl na vlastní mládeži. Z kádru, který v roce 1992 vyhrál **FA Youth Cup**, vyrostla generace přezdívaná **Class of '92**: David Beckham, Ryan Giggs, Paul Scholes, Nicky Butt a bratři Gary a Phil Nevillovi. Když United na začátku sezóny 1995/96 prohráli s Aston Villou 1:3, televizní expert **Alan Hansen** prohlásil, že **s dětmi se nic vyhrát nedá**. Mladíci na konci sezóny slavili **double**, ligu i FA Cup.

- S United vyhrál **13 titulů v Premier League** a dvakrát **Ligu mistrů** (1999 a 2008).
- V roce **1999** byl povýšen do šlechtického stavu, odtud **sir Alex**.
- Skončil v roce **2013** a v poslední sezóně ještě vyhrál ligu.

Jeho výbuchům vzteku v kabině se říkalo **fén**, protože hráčům křičel zblízka do obličeje. Sám Ferguson později tvrdil, že fén za 27 let použil jen asi šestkrát.

Poučení pro kabinu: trpělivost s trenérem i s mladými se vyplácí. A fén funguje jen tehdy, když ho trenér nezapíná každou sobotu po zápase.`,
    },
    {
      id: "legendy-arrigo-sacchi",
      category: "legendy",
      difficulty: 2,
      part: 3,
      title: "Arrigo Sacchi: žokej, který nebyl koněm",
      body: `**Arrigo Sacchi**, narozený v roce **1946** ve Fusignanu, nikdy nehrál profesionální fotbal. Kopal jen za amatérské kluby a léta se živil jako **prodavač bot**. Když kritici pochybovali, jak může učit hvězdy, odpověděl slavnou větou, volně přeloženo: **„Nevěděl jsem, že aby se člověk stal žokejem, musí být nejdřív koněm.“**

S Parmou vyřadil v Italském poháru **AC Milán**. Majitele Milána **Silvia Berlusconiho** to zaujalo natolik, že Sacchiho v roce **1987** angažoval. Hned v první sezóně vyhrál Milán **italskou ligu**.

Sacchi hrál **4-4-2** se **zónovou obranou** a vysokým presinkem. Klasického libera zrušil, obrana stála vysoko a chytala soupeře do **ofsajdu**. Mezi obránci a útočníky mělo být nanejvýš **25 metrů**. Na tréninku nacvičoval i **hru bez míče**: tým se pohyboval po hřišti, jako by hrál zápas, jen bez balónu, aby každý věděl, kam se má posunout.

- V semifinále Poháru mistrů 1989 rozdrtil doma **Real Madrid 5:0**.
- Finále na Camp Nou vyhrál **4:0 nad Steauou Bukurešť**, po dvou gólech dali **Ruud Gullit** a **Marco van Basten**.
- O rok později obhájil trofej výhrou **1:0 nad Benfikou** ve Vídni, gól dal **Frank Rijkaard**.

Později vedl **Itálii** a na mistrovství světa 1994 s ní došel do finále, které prohrál s Brazílií na penalty.

Poučení pro kabinu: trenér nemusí mít za sebou slavnou kariéru. Musí mít jasnou myšlenku a umět ji naučit. Když všech jedenáct ví, kam se posunout, i obrana složená z hasičů a pekaře vypadá rychle.`,
    },
    {
      id: "legendy-del-bosque-spain",
      category: "legendy",
      difficulty: 2,
      part: 3,
      title: "Vicente del Bosque: klid mezi Realem a Barcou",
      body: `**Vicente del Bosque**, rodák ze **Salamanky**, strávil většinu hráčské kariéry v **Realu Madrid** a jako trenér s ním vyhrál **Ligu mistrů 2000 a 2002**. V roce **2003** získal s Realem titul a den nato se dozvěděl, že mu klub **smlouvu neprodlouží**.

V červenci **2008** převzal Španělsko po **Luisi Aragonésovi**, který právě vyhrál mistrovství Evropy. Měl tým plný hvězd, jenže hvězd z **Realu a Barcelony**, mezi kterými panovala rivalita.

Na **mistrovství světa 2010** Španělé **prohráli úvodní zápas se Švýcarskem 0:1**. Pak už neprohráli. Finále s **Nizozemskem 11. července 2010** v Johannesburgu bylo plné faulů, rozhodčí rozdal **14 žlutých karet**. Ve **116. minutě** rozhodl **Andrés Iniesta**. Při oslavě si svlékl dres a pod ním měl tričko s nápisem „Dani Jarque siempre con nosotros“, tedy Dani Jarque navždy s námi. Šlo o kapitána Espanyolu a Iniestova kamaráda, který necelý rok předtím zemřel na infarkt.

Nejhorší napětí přišlo v **srpnu 2011** po vyhroceném souboji Realu s Barcelonou o španělský Superpohár. Brankář a kapitán Realu **Iker Casillas** tehdy zavolal barcelonským **Xavimu a Puyolovi**. Podle svých slov ne kvůli omluvě, ale protože obraz, který hráči v těch zápasech dávali, nebyl dobrým příkladem pro děti. Del Bosque veřejně opakoval, že klubová rivalita na reprezentaci vliv nemá.

Na **EURO 2012** porazilo Španělsko ve finále v Kyjevě **Itálii 4:0** a jako první tým v historii vyhrálo **tři velké turnaje po sobě**. Del Bosque mezitím dostal od krále šlechtický titul markýze.

Poučení pro kabinu: trenér, který křičí víc než hráči, rozdělenou kabinu nespojí. Když spolu hraje kluk z horního a z dolního konce vesnice, musí si podat ruku dřív, než vyběhnou na hřiště.`,
    },
    {
      id: "legendy-carlo-ancelotti",
      category: "legendy",
      difficulty: 2,
      part: 3,
      title: "Carlo Ancelotti: klid jako zbraň",
      body: `**Carlo Ancelotti**, narozený v roce **1959** v Reggiolu, poznal velký fotbal nejdřív jako hráč. V **Sacchiho Milánu** byl u dvou Pohárů mistrů v letech **1989 a 1990**. Jako trenér pak vyhrál **Ligu mistrů pětkrát**, víc než kterýkoli jiný trenér: s Milánem v letech **2003 a 2007**, s Realem Madrid v letech **2014, 2022 a 2024**. Jako jediný trenér získal titul ve všech **pěti nejsilnějších evropských ligách**, v Itálii, Anglii, Francii, Německu i Španělsku.

Nejbolestnější noc zažil v roce 2005 v Istanbulu, kde jeho Milán ve finále ztratil vedení 3:0 a prohrál s Liverpoolem na penalty. O dva roky později se s Liverpoolem potkal ve finále v **Athénách** znovu a vyhrál **2:1**.

V roce **2014** čekal Real Madrid na desátou evropskou trofej, **La Décimu**, už dvanáct let. Ve finále v **Lisabonu** prohrával s **Atléticem** 0:1 až do nastavení. V **93. minutě** vyrovnal hlavou **Sergio Ramos** a v prodloužení Real vyhrál **4:1**.

Ancelotti na lavičce nedělá divadlo a vybuchne jen výjimečně. Svůj přístup popsal v knize **Quiet Leadership** (Tiché vedení), kterou vydal v roce 2016. Autorita podle něj má stát na **respektu a důvěře, ne na strachu**. Tímhle stylem si získal věrnost hvězd jako **David Beckham, Zlatan Ibrahimović nebo Cristiano Ronaldo**. Proslavilo ho i zvednuté obočí, o kterém sám říká, že mu občas vyletí nahoru samo.

V roce **2025** převzal **Brazílii**, svou první reprezentaci.

Poučení pro kabinu: hvězdy se neřídí řevem, ale vztahem. Hráč, který ví, že mu trenér věří, poběží za míčem i v devadesáté minutě. Na okrese to platí dvojnásob: tam hvězdu nikdo nezaplatí, jen přesvědčí.`,
    },

    // ── Základní kurz, 4. díl: Zázraky outsiderů ──
    {
      id: "legendy-greece-euro-2004",
      category: "legendy",
      difficulty: 2,
      part: 4,
      title: "Řecko 2004: Rehakles a jeho parta",
      body: `Když v roce **2001** převzal Řecko Němec **Otto Rehhagel**, měla země na velkých turnajích bilanci k pláči. Na mistrovství Evropy 1980 ani na mistrovství světa 1994 **nevyhrála jediný zápas**. Rehhagel přitom věděl, jak se dělají zázraky: s **Kaiserslauternem** v roce **1998** vyhrál bundesligu jako **nováček**, který rok předtím postoupil.

Na **EURO 2004 v Portugalsku** Řekové stavěli na pevné obraně. Hrálo se osobní bránění s volným hráčem za obránci a vepředu stačil brejk nebo standardka. Rehhagel říkal, že trenér přizpůsobuje taktiku vlastnostem hráčů, které má k dispozici.

- V zahajovacím zápase porazilo Řecko domácí **Portugalsko 2:1**.
- Po remíze se Španělskem a prohře s Ruskem postoupilo ze skupiny jen díky **víc vstřeleným gólům** než Španělé.
- Ve čtvrtfinále vyřadilo obhájce titulu **Francii 1:0**, rozhodl hlavou **Angelos Charisteas**.
- V semifinále padlo Česko po stříbrném gólu Traianose Dellase.

Finále se hrálo **4. července 2004** v Lisabonu a soupeřem bylo znovu **Portugalsko**. V **57. minutě** zahrál Angelos Basinas první řecký roh zápasu a **Charisteas** ho hlavou poslal do sítě. Řecko vyhrálo **1:0**. Poprvé v historii mistrovství Evropy začal i skončil turnaj **stejným zápasem**.

Rehhagel se stal prvním trenérem, který vyhrál EURO s cizí reprezentací. Řekové mu začali říkat **Rehakles**, podle bájného hrdiny Hérakla. Obránce Dellas později vzpomínal, že hráči dokázali **dát tým před sebe**.

Poučení pro kabinu: když nemáš hvězdy, nehraj, jako bys je měl. Udělej z jedenácti obyčejných kluků jeden tým a každému řekni, koho hlídá. Kdo se pak v sobotu flákne, ví, že nenechal ve štychu trenéra, ale kamaráda.`,
    },
    {
      id: "legendy-miracle-of-bern",
      category: "legendy",
      difficulty: 2,
      part: 4,
      title: "Zázrak v Bernu 1954",
      body: `V létě **1954** jelo na mistrovství světa do Švýcarska **Maďarsko** jako jasný favorit. Zlatá jedenáctka kolem **Ference Puskáse** neprohrála od roku **1950** a ve skupině rozstřílela **Západní Německo 8:3**. Německý trenér **Sepp Herberger** v tom zápase šetřil několik opor, protože věděl, že o postupu rozhodne další zápas s Tureckem. Ten jeho tým vyhrál a došel až do finále.

Herberger stavěl na partě. Výprava bydlela v hotelu u jezera ve **Spiezu**, trenér sám určoval, kdo bude s kým na pokoji, a hráče chránil před okolním světem. Soudržnosti týmu se začalo říkat **duch ze Spiezu**. Od hráčů chtěl nasazení, kamarádství a podřízení se týmu.

Finále se hrálo **4. července 1954** v Bernu na stadionu Wankdorf a v hustém **dešti**. Němci byli rádi, protože kapitán **Fritz Walter** špatně snášel horko a v dešti hrál nejlíp. Takovému počasí se dodnes říká **počasí Fritze Waltera**. Adi Dassler, který tým vybavoval obuví, navíc dal hráčům kopačky s **vyměnitelnými kolíky**.

- Maďaři vedli po osmi minutách **2:0**, skórovali Puskás a Czibor.
- Max Morlock snížil a **Helmut Rahn** do 18. minuty vyrovnal.
- Šest minut před koncem dal Rahn vítězný gól na **3:2**.
- Puskásův gól v závěru rozhodčí kvůli **ofsajdu** neuznal.

Rozhlasový komentátor Herbert Zimmermann po posledním hvizdu křičel „Aus! Aus! Aus! Aus! Das Spiel ist aus! Deutschland ist Weltmeister!“, tedy konec, Německo je mistrem světa.

Poučení pro kabinu: favorit, který si myslí, že je hotovo, je zranitelný. A tým, který drží pohromadě i mimo hřiště, unese i vedení soupeře 2:0 po osmi minutách.`,
    },
    {
      id: "legendy-nottingham-forest",
      category: "legendy",
      difficulty: 2,
      part: 4,
      title: "Nottingham Forest: z druhé ligy na vrchol Evropy",
      body: `**Brian Clough** byl trenér, který se nebál říct, co si myslí. S **Derby County** vyhrál v roce **1972** anglickou ligu, v roce 1974 ale v **Leedsu** vydržel jen **44 dní**. V lednu **1975** přišel do **Nottinghamu Forest**, který se tehdy plácal ve středu tabulky **druhé ligy**.

V roce 1976 se k němu vrátil starý parťák **Peter Taylor** jako asistent. Forest v roce **1977** postoupil ze třetího místa a hned v první sezóně mezi elitou, **1977/78**, vyhrál **anglickou ligu** o sedm bodů před Liverpoolem. K tomu přidal Ligový pohár. Až do prosince 1978 pak neprohrál v lize **42 zápasů po sobě**.

V Poháru mistrů 1978/79 vyřadil Forest hned v prvním kole **obhájce titulu Liverpool**. V únoru 1979 klub koupil z Birminghamu útočníka **Trevora Francise** jako vůbec **prvního hráče v Anglii za milion liber**. Podle pravidel UEFA mohl v Poháru mistrů nastoupit až ve finále.

- Finále **1979** v **Mnichově**: Forest porazil **Malmö 1:0**, Francis dal hlavou gól po centru **Johna Robertsona**.
- Finále **1980** v **Madridu**: Forest obhájil trofej výhrou **1:0 nad Hamburkem**, tentokrát rozhodl sám Robertson.

Forest tak získal **dva Poháry mistrů** a jen jeden ligový titul. Clough od hráčů vyžadoval **čistou hru** a jeho týmy byly známé pěkným fotbalem i slušností.

Poučení pro kabinu: postup není konec cesty, ale začátek. Kdo po postupu jen děkuje, že smí hrát s lepšími, ten zase spadne. Kdo jde do nové soutěže s chutí vyhrát, může dojít hodně daleko. A za milion liber se dá koupit útočník, ale ne parta, ta se musí vychovat.`,
    },
    {
      id: "legendy-iceland-euro-2016",
      category: "legendy",
      difficulty: 2,
      part: 4,
      title: "Island 2016: zubař na lavičce a vikinský pokřik",
      body: `**Island** má zhruba **330 tisíc obyvatel**, méně než Brno. Na **EURO 2016** ve Francii jel jako nejmenší země, která se kdy probojovala na mistrovství Evropy, a byl to jeho **první velký turnaj** v historii.

Za úspěchem stála dlouhá práce. Kvůli zimě a tmě začal svaz od roku **2000** stavět **vytápěné haly** s umělou trávou, kde se dá hrát celý rok. Zároveň vzdělával trenéry, až Island patřil k zemím s **nejvíc licencovanými trenéry na obyvatele** v Evropě.

Tým vedla dvojice trenérů: Švéd **Lars Lagerbäck** a **Heimir Hallgrímsson**, který dál pracoval jako **zubař**.

- Ve skupině remizoval Island s **Portugalskem 1:1** a s Maďarskem 1:1. Cristiano Ronaldo si po zápase stěžoval na islandskou **„malou mentalitu“**. Lagerbäck mu vzkázal, že kdo chce Island porazit, **musí hrát líp**.
- Postup zajistil gól Arnóra Ingviho Traustasona v nastavení zápasu s Rakouskem, výhra **2:1**.
- V osmifinále **27. června** v **Nice** prohrával Island s **Anglií** po penaltě Waynea Rooneyho. **Ragnar Sigurðsson** vyrovnal o dvě minuty později a **Kolbeinn Sigþórsson** rozhodl na **2:1**. Anglický trenér **Roy Hodgson** hned po zápase **rezignoval**.

Ve čtvrtfinále Island prohrál s domácí Francií 2:5. Po celé Evropě se ale proslavil **vikinský pokřik**: fanoušci tleskají nad hlavou a v rytmu bubnu volají „Huh!“.

Poučení pro kabinu: malá vesnice nemusí mít malé ambice. Hala, pořádní trenéři a parta, která ví, za co hraje, nahradí spoustu peněz. A kdo se vám vysmívá, že máte malou mentalitu, tomu odpovězte jako Lagerbäck: výsledkem, ne hádkou. Zubař na lavičce aspoň ví, jak se do zápasu zakousnout.`,
    },

    // ── Pokročilý kurz, 2. díl: Psychologie vítězů ──
    {
      id: "legendy-maracanazo-1950",
      category: "legendy",
      difficulty: 3,
      part: 2,
      title: "Maracanazo 1950: když svazuje domácí očekávání",
      body: `Mistrovství světa 1950 v Brazílii nemělo klasické finále. O titul se hrálo ve **finálové skupině** a poslední zápas **16. července 1950** na stadionu **Maracanã** v Riu de Janeiro rozhodoval. Brazílii stačila **remíza**, Uruguay musela vyhrát. Domácí předtím rozstříleli Švédsko i Španělsko a země už slavila. Noviny **O Mundo** v den zápasu otiskly fotku brazilského týmu s popiskem **„Tohle jsou mistři světa“**. Oficiálně přišlo **173 850 diváků**, podle odhadů ještě víc.

Uruguayský kapitán **Obdulio Varela** spoluhráčům před zápasem řekl, že když budou jen bránit, dopadnou jako Švédové a Španělé. V Uruguayi se k zápasu dodnes váže věta **„Los de afuera son de palo“**, volně přeloženo: ti venku jsou ze dřeva. Diváci na tribuně nehrají.

Hned po přestávce dal **Friaça** gól na 1:0. Varela se pak **dohadoval s rozhodčím o ofsajdu a spor protahoval**. Podle vyprávění tím chtěl zchladit rozjetý stadion a dát týmu vydechnout.
- V **66. minutě** vyrovnal **Juan Alberto Schiaffino**.
- V **79. minutě** rozhodl **Alcides Ghiggia**, **2:1 pro Uruguay**.

Maracanã zmlkla. Ghiggia později rád opakoval, že Maracanã umlčeli jen tři lidé: Frank Sinatra, papež a on. Brankáře **Moacira Barbosu** brali Brazilci za viníka ještě dlouhé roky a reprezentace kvůli porážce odložila **bílé dresy**.

Co si z toho vzít:
- **Očekávání okolí** je největší soupeř domácího týmu. Kdo slaví před zápasem, hraje pak o to, aby neprohrál, ne aby vyhrál.
- Kapitán může zápas **zpomalit**, když se soupeř a tribuna rozjedou. Pár vteřin klidu změní rytmus.
- Po prohře nehledejte jednoho **obětního beránka**. Tým, který hodí vinu na jednoho hráče, se z prohry nic nenaučí.`,
    },
    {
      id: "legendy-morocco-2022",
      category: "legendy",
      difficulty: 3,
      part: 2,
      title: "Maroko 2022: společný úmysl a rodina",
      body: `Když **Walid Regragui** převzal **31. srpna 2022** marocký národní tým, zbývaly do mistrovství světa v Kataru **necelé tři měsíce**. Na přestavbu herního stylu nebyl čas, a tak začal u hlavy. Regragui, rodák z francouzského Corbeil-Essonnes a bývalý marocký reprezentant, mluvil s hráči o **„nia“**, arabsky **úmyslu**: ať mají všichni jeden společný úmysl, aspoň po dobu turnaje. Opakoval také, že Maroko nejede na mistrovství jen proto, aby tam bylo.

Druhým pilířem byla **rodina**. Svaz pozval do Kataru rodiče, manželky i děti hráčů. Regragui říkal, že za každým reprezentantem stojí rodina, která ho podporuje, a že **úspěch týmu není možný bez spokojenosti rodičů**. Po zápasech pak svět sledoval, jak **Achraf Hakimi** běží obejmout maminku a **Sofiane Boufal** s tou svou tančí na trávníku.

- Ve skupině remíza s **Chorvatskem 0:0**, výhry nad **Belgií 2:0** a **Kanadou 2:1**, první místo.
- Osmifinále se **Španělskem**: 0:0 po prodloužení, v rozstřelu chytil **Yassine Bounou** dvě penalty a Hakimi rozhodl jemně dloubnutou **panenkou**, 3:0.
- Čtvrtfinále: **Portugalsko 1:0** po hlavičce **Youssefa En-Nesyriho**.

Maroko se stalo **prvním africkým a arabským týmem v semifinále** mistrovství světa. Tam prohrálo s Francií 0:2 a v zápase o třetí místo s Chorvatskem 1:2. Hráči pak výdělek z turnaje věnovali na charitu v Maroku.

Co si z toho vzít:
- Když není čas na taktiku, začni **společným cílem**, který každý vysloví nahlas a vezme za svůj.
- Hráč, kterému je doma dobře, hraje uvolněněji. **Rodina není rušivý prvek**, ale opora.
- Hakimiho panenka v rozstřelu ukazuje, co s hráčem udělá **sebevědomí celé party**: kdo ví, že za ním tým stojí, odváží se i v největším tlaku.`,
    },
    {
      id: "legendy-real-madrid-comebacks",
      category: "legendy",
      difficulty: 3,
      part: 2,
      title: "Real Madrid 2022: víra v obrat",
      body: `V Madridu se tomu říká **miedo escénico**, strach z jeviště. Pojem zpopularizoval v roce **1986** útočník Realu **Jorge Valdano** v eseji o tom, jak plný **Bernabéu** svazuje soupeřům nohy. Ze stejné doby pochází legenda o **Juanitovi**, který prý po prohře v Miláně vzkázal italským novinářům směsí španělštiny a italštiny, že devadesát minut na Bernabéu je „molto longo“, tedy hodně dlouhých.

Sezóna **2021/22** v Lize mistrů z té legendy udělala návod. Real trenéra Carla Ancelottiho:
- v osmifinále prohrál v Paříži s **PSG 0:1** a doma prohrával po gólu Kyliana Mbappého. Pak **Karim Benzema** dal mezi **61. a 78. minutou** tři góly a Real vyhrál **3:1**,
- ve čtvrtfinále vyhrál v Londýně s **Chelsea 3:1**, doma ale prohrával **0:3** a byl venku. V **80. minutě** snížil **Rodrygo** po přihrávce Luky Modriće a v prodloužení poslal Real dál hlavou Benzema,
- v semifinále prohrál v Manchesteru s **City 3:4** a doma prohrával **0:1** až do 90. minuty. Rodrygo dal **dva góly během dvou minut** a v prodloužení rozhodl Benzema z penalty.

Finále **28. května 2022** v Saint-Denis vyhrál Real nad **Liverpoolem 1:0** gólem **Viníciuse Júniora**, brankář Thibaut Courtois předvedl devět zákroků.

Co si z toho vzít:
- Víra v obrat se nedá vyrobit jedním projevem v kabině. Vzniká z **historie a zkušenosti, že se to už jednou povedlo**. Proto o obratech mluvte, i o těch z okresního přeboru.
- Plný stadion táhne domácí jen tehdy, když mu tým dá důvod. Jeden gól v závěru promění nervozitu v hluk a tlak se přesune na soupeře.
- Pozor ale: **obrat je výjimka, ne plán**. Kdo spoléhá, že to „nějak otočí“, prohraje prvních osmdesát minut zbytečně a většinou i celý zápas.`,
    },
    {
      id: "legendy-chelsea-munich-2012",
      category: "legendy",
      difficulty: 3,
      part: 2,
      title: "Mnichov 2012: Čech a penaltový tlak",
      body: `Sezónu **2011/12** začala Chelsea špatně. V březnu klub propustil trenéra André Villase-Boase a do konce sezóny svěřil tým jeho asistentovi **Robertu Di Matteovi**. V osmifinále Ligy mistrů prohrála Chelsea v Neapoli 1:3, doma ale vyhrála po prodloužení 4:1 a šla dál.

Finále se hrálo **19. května 2012** v **Allianz Areně**, na domácím stadionu **Bayernu Mnichov**. Bavoři mu říkali **„Finale dahoam“**, finále doma. Chelsea chyběl vyloučený kapitán John Terry a tři další hráči kvůli trestům, Bayern přišel o tři hráče také.

Bayern měl zápas pod kontrolou a kopal **20 rohů**, Chelsea jediný. V **83. minutě** dal gól Thomas Müller, ale v **88. minutě** vyrovnal hlavou po tom jediném rohu **Didier Drogba**. V prodloužení Drogba fauloval Francka Ribéryho, penaltu kopal **Arjen Robben** a **Petr Čech** ji **chytil**.

Rozhodl **penaltový rozstřel**. Chelsea začala špatně, Juan Mata neproměnil. Pak ale Čech chytil pokus Ivici Oliće a Bastian Schweinsteiger trefil po Čechově teči tyč. Poslední penaltu proměnil **Drogba**: **4:3** na penalty a první Liga mistrů pro Chelsea jako pro první londýnský klub.

Čech se na penalty připravoval. Prošel záznamy **všech penalt hráčů Bayernu od roku 2007** a ve finále skočil u **každé bavorské penalty na správnou stranu**.

Co si z toho vzít:
- **Tlak domácího prostředí** může svazovat i favorita. Kdo hraje „finále doma“, musí vyhrát, kdo přijede, může jen překvapit.
- Penalty nejsou jen loterie. **Příprava nezaručí zákrok, ale dá jistotu a plán** brankáři i střelcům.
- Chyba v rozstřelu není konec. Po Matově zahozené penaltě se tým nesesypal a Drogba, který v prodloužení zavinil penaltu, nakonec rozhodl. Hráče po chybě nepohřbívejte, příště může být hrdina.`,
    },
  ],
  questions: [
    // Řím 1934
    {
      id: "legendy-world-cup-1934-1",
      lessonId: "legendy-world-cup-1934",
      text: "Kdo vstřelil všechny tři góly Československa v semifinále MS 1934 proti Německu?",
      options: ["Antonín Puč", "Oldřich Nejedlý", "František Plánička", "Jiří Sobotka"],
      correct: 1,
      explain: "Hattrick proti Německu dal Oldřich Nejedlý. S pěti góly se stal nejlepším střelcem celého mistrovství.",
    },
    {
      id: "legendy-world-cup-1934-2",
      lessonId: "legendy-world-cup-1934",
      text: "Jak skončilo finále MS 1934 mezi Itálií a Československem?",
      options: [
        "Československo vyhrálo 2:1",
        "Itálie vyhrála 3:1 v základní hrací době",
        "O vítězi rozhodl penaltový rozstřel",
        "Itálie vyhrála 2:1 po prodloužení",
      ],
      correct: 3,
      explain: "Puč poslal Československo do vedení, Orsi vyrovnal a v prodloužení rozhodl Schiavio. Itálie vyhrála 2:1.",
    },
    {
      id: "legendy-world-cup-1934-3",
      lessonId: "legendy-world-cup-1934",
      text: "Za který klub chytal František Plánička od roku 1923 až do konce kariéry?",
      options: ["Slavia Praha", "Sparta Praha", "Viktoria Žižkov", "Bohemians Praha"],
      correct: 0,
      explain: "Plánička chytal za Slavii téměř tisíc zápasů a jinam nepřestoupil.",
    },
    {
      id: "legendy-world-cup-1934-4",
      lessonId: "legendy-world-cup-1934",
      text: "Co dokázal Plánička na mistrovství světa 1938 v zápase s Brazílií?",
      options: [
        "Chytil tři penalty po sobě",
        "Dal gól přes celé hřiště",
        "Dochytal celý zápas se zlomenou rukou",
        "Odmítl nastoupit kvůli sporu s trenérem",
      ],
      correct: 2,
      explain: "Plánička si v zápase s Brazílií zlomil ruku a přesto dochytal celé utkání.",
    },
    {
      id: "legendy-world-cup-1934-5",
      lessonId: "legendy-world-cup-1934",
      text: "Kdo byl trenérem Československa na mistrovství světa 1934?",
      options: ["Václav Ježek", "Karel Petrů", "Vittorio Pozzo", "Rudolf Vytlačil"],
      correct: 1,
      explain: "Československo vedl Karel Petrů. Vittorio Pozzo byl trenérem vítězné Itálie.",
    },

    // Chile 1962
    {
      id: "legendy-world-cup-1962-1",
      lessonId: "legendy-world-cup-1962",
      text: "Kdo byl trenérem Československa na mistrovství světa 1962 v Chile?",
      options: ["Karel Petrů", "Václav Ježek", "Rudolf Vytlačil", "Jozef Vengloš"],
      correct: 2,
      explain: "Tým, který došel až do finále, vedl Rudolf Vytlačil.",
    },
    {
      id: "legendy-world-cup-1962-2",
      lessonId: "legendy-world-cup-1962",
      text: "Kdo rozhodl gólem čtvrtfinále MS 1962 proti Maďarsku?",
      options: ["Adolf Scherer", "Josef Masopust", "Viliam Schrojf", "Josef Jelínek"],
      correct: 0,
      explain: "Adolf Scherer dal jediný gól zápasu a brankář Schrojf pak výhru 1:0 udržel.",
    },
    {
      id: "legendy-world-cup-1962-3",
      lessonId: "legendy-world-cup-1962",
      text: "Proč zraněný Pelé zůstal v zápase s Československem na hřišti?",
      options: [
        "Brazilský trenér ho odmítl stáhnout",
        "Chtěl dohrát kvůli prémii za remízu",
        "Zranění si všiml až po zápase",
        "Střídat se tehdy nesmělo",
      ],
      correct: 3,
      explain: "Na mistrovství světa 1962 se ještě nestřídalo, a tak zraněný Pelé zůstal na hřišti.",
    },
    {
      id: "legendy-world-cup-1962-4",
      lessonId: "legendy-world-cup-1962",
      text: "Co předcházelo brazilskému vyrovnání ve finále MS 1962?",
      options: [
        "Penalta za ruku Masopusta",
        "Chyba brankáře Viliama Schrojfa",
        "Vlastní gól obránce",
        "Gól z ofsajdu, který rozhodčí přehlédl",
      ],
      correct: 1,
      explain: "Brazílie vyrovnala dvě minuty po Masopustově gólu po chybě dosud skvělého Schrojfa.",
    },
    {
      id: "legendy-world-cup-1962-5",
      lessonId: "legendy-world-cup-1962",
      text: "Jak se podle vzpomínek Josefa Jelínka zachoval Josef Masopust ke zraněnému Pelému?",
      options: [
        "Požádal rozhodčího, ať zápas přeruší",
        "Pomohl ho odnést z hřiště",
        "Schválně na něj hrál tvrdě",
        "Nenapadal ho a nechal ho míč v klidu rozehrát",
      ],
      correct: 3,
      explain: "Masopust zraněného Pelého nenapadal a nechal ho míč rozehrát. Lekce to uvádí jako příklad, že tvrdost a slušnost jdou dohromady.",
    },

    // Moskva 1980
    {
      id: "legendy-olympics-1980-1",
      lessonId: "legendy-olympics-1980",
      text: "Kdo dal jediný gól finále olympijského turnaje 1980 proti NDR?",
      options: ["Jindřich Svoboda", "Ladislav Vízek", "Jan Berger", "František Havránek"],
      correct: 0,
      explain: "Rozhodl Jindřich Svoboda ze Zbrojovky Brno, který přišel na hřiště jako střídající hráč.",
    },
    {
      id: "legendy-olympics-1980-2",
      lessonId: "legendy-olympics-1980",
      text: "Co se stalo ve finále olympijského turnaje 1980 v 58. minutě?",
      options: [
        "Československo kopalo penaltu",
        "Zápas se přerušil kvůli bouřce",
        "Rozhodčí vyloučil po jednom hráči z každého týmu",
        "Trenér Havránek vystřídal brankáře",
      ],
      correct: 2,
      explain: "Vyloučeni byli Jan Berger a Wolfgang Steinbach, tvůrci hry obou týmů. Pak se hrálo deset na deset.",
    },
    {
      id: "legendy-olympics-1980-3",
      lessonId: "legendy-olympics-1980",
      text: "Kteří hráči nesměli na olympijském fotbalovém turnaji 1980 nastoupit?",
      options: [
        "Všichni hráči starší 23 let",
        "Evropští a jihoameričtí hráči, kteří hráli kvalifikaci nebo finále MS 1978",
        "Všichni hráči ligových klubů",
        "Hráči, kteří už někdy nastoupili za reprezentaci",
      ],
      correct: 1,
      explain: "Pravidla vyřadila evropské a jihoamerické hráče s účastí v kvalifikaci nebo na mistrovství světa 1978.",
    },
    {
      id: "legendy-olympics-1980-4",
      lessonId: "legendy-olympics-1980",
      text: "Jak se Jindřich Svoboda dostal ve finále na hřiště?",
      options: [
        "Nastoupil v základní sestavě jako kapitán",
        "Chytal za zraněného brankáře",
        "Nastoupil až v prodloužení",
        "Přišel z lavičky jako střídající hráč",
      ],
      correct: 3,
      explain: "Havránek ho poslal na hřiště ve druhém poločase a Svoboda jako střídající hráč v 77. minutě rozhodl.",
    },
    {
      id: "legendy-olympics-1980-5",
      lessonId: "legendy-olympics-1980",
      text: "Čím bylo zlato z Moskvy 1980 pro československý fotbal výjimečné?",
      options: [
        "Bylo to první olympijské zlato ve fotbale",
        "Bylo to druhé olympijské zlato po roce 1964",
        "Tým ho vyhrál bez jediné remízy",
        "Československo ho získalo bez obdrženého gólu",
      ],
      correct: 0,
      explain: "Šlo o první olympijské zlato. Finále v letech 1920 a 1964 Československo nevyhrálo a ve skupině remizovalo s Nigérií 1:1.",
    },

    // Pavel Nedvěd
    {
      id: "legendy-nedved-ballon-dor-1",
      lessonId: "legendy-nedved-ballon-dor",
      text: "Koho měl Pavel Nedvěd v Juventusu nahradit, když ho klub v roce 2001 koupil?",
      options: ["Alessandra Del Piera", "Roberta Baggia", "Thierryho Henryho", "Zinédina Zidana"],
      correct: 3,
      explain: "Juventus koupil Nedvěda jako náhradu za Zinédina Zidana, který odešel do Realu Madrid.",
    },
    {
      id: "legendy-nedved-ballon-dor-2",
      lessonId: "legendy-nedved-ballon-dor",
      text: "Proč Nedvěd nehrál finále Ligy mistrů 2003?",
      options: [
        "Byl zraněný",
        "Měl trest za žlutou kartu ze semifinále",
        "Trenér ho nechal na lavičce",
        "Odjel na sraz reprezentace",
      ],
      correct: 1,
      explain: "V semifinále s Realem Madrid dostal po faulu na McManamana žlutou kartu, kvůli které musel finále vynechat.",
    },
    {
      id: "legendy-nedved-ballon-dor-3",
      lessonId: "legendy-nedved-ballon-dor",
      text: "Kolikátým českým držitelem Zlatého míče se stal Nedvěd?",
      options: [
        "Prvním, Masopust ho získal až po něm",
        "Třetím, po Masopustovi a Panenkovi",
        "Druhým, po Josefu Masopustovi",
        "Jediným, Masopust dostal jinou cenu",
      ],
      correct: 2,
      explain: "Prvním českým držitelem Zlatého míče byl Josef Masopust, Nedvěd ho získal jako druhý za rok 2003.",
    },
    {
      id: "legendy-nedved-ballon-dor-4",
      lessonId: "legendy-nedved-ballon-dor",
      text: "Jak se zachoval Nedvěd, když byl Juventus v roce 2006 přeřazen do Serie B?",
      options: [
        "Zůstal a pomohl klubu zpátky do Serie A",
        "Přestoupil do Realu Madrid",
        "Ukončil kariéru",
        "Vrátil se do Sparty",
      ],
      correct: 0,
      explain: "Řada hvězd odešla, Nedvěd zůstal, ve druhé lize dal jedenáct gólů a pomohl Juventusu zpátky mezi elitu.",
    },
    {
      id: "legendy-nedved-ballon-dor-5",
      lessonId: "legendy-nedved-ballon-dor",
      text: "Jakou přezdívku dali Nedvědovi italští fanoušci?",
      options: ["Il Professore", "Kočka z Chebu", "Furia Ceca", "Generál"],
      correct: 2,
      explain: "Italové mu říkali Furia Ceca, česká fúrie.",
    },

    // Alex Ferguson
    {
      id: "legendy-alex-ferguson-1",
      lessonId: "legendy-alex-ferguson",
      text: "Koho porazil Fergusonův Aberdeen ve finále Poháru vítězů pohárů 1983?",
      options: ["Bayern Mnichov", "Celtic Glasgow", "Real Madrid", "Juventus"],
      correct: 2,
      explain: "Aberdeen porazil 11. května 1983 v Göteborgu Real Madrid 2:1 po prodloužení.",
    },
    {
      id: "legendy-alex-ferguson-2",
      lessonId: "legendy-alex-ferguson",
      text: "Jakou první velkou trofej získal Ferguson s Manchesterem United?",
      options: [
        "FA Cup v roce 1990",
        "Ligu mistrů v roce 1999",
        "Premier League v sezóně 1992/93",
        "Pohár vítězů pohárů v roce 1983",
      ],
      correct: 0,
      explain: "Prvním velkým úspěchem v United byl FA Cup 1990. Pohár vítězů pohárů 1983 vyhrál ještě s Aberdeenem.",
    },
    {
      id: "legendy-alex-ferguson-3",
      lessonId: "legendy-alex-ferguson",
      text: "Co prohlásil televizní expert Alan Hansen v roce 1995 o mladém Manchesteru United?",
      options: [
        "Že United spadnou z ligy",
        "Že s dětmi se nic vyhrát nedá",
        "Že Beckham bude nejlepší hráč světa",
        "Že by Ferguson měl skončit",
      ],
      correct: 1,
      explain: "Po úvodní prohře s Aston Villou Hansen prohlásil, že s dětmi se nic vyhrát nedá. Mladíci pak vyhráli double.",
    },
    {
      id: "legendy-alex-ferguson-4",
      lessonId: "legendy-alex-ferguson",
      text: "Jak skončila sezóna 1995/96 pro mladý tým Manchesteru United?",
      options: [
        "Sestupem do druhé ligy",
        "Prohrou ve finále FA Cupu",
        "Desátým místem v lize",
        "Ziskem ligy i FA Cupu, tedy doublem",
      ],
      correct: 3,
      explain: "Generace Class of '92 vyhrála ligu i FA Cup a vyvrátila Hansenovu předpověď.",
    },
    {
      id: "legendy-alex-ferguson-5",
      lessonId: "legendy-alex-ferguson",
      text: "Čemu se v Manchesteru United říkalo „fén“?",
      options: [
        "Fergusonovu účesu",
        "Rychlému brejku po křídle",
        "Fergusonovu výbuchu vzteku, kdy hráčům křičel zblízka do obličeje",
        "Přezdívce útočníka Marka Robinse",
      ],
      correct: 2,
      explain: "Fén byl Fergusonův výbuch vzteku v kabině. Sám tvrdil, že ho za 27 let použil jen asi šestkrát.",
    },

    // Arrigo Sacchi
    {
      id: "legendy-arrigo-sacchi-1",
      lessonId: "legendy-arrigo-sacchi",
      text: "Čím se Arrigo Sacchi léta živil, než se stal slavným trenérem?",
      options: [
        "Byl profesionálním brankářem",
        "Byl prodavačem bot",
        "Pracoval jako sportovní novinář",
        "Byl rozhodčím Serie A",
      ],
      correct: 1,
      explain: "Sacchi nikdy nehrál profesionálně, kopal jen za amatérské kluby a léta prodával boty.",
    },
    {
      id: "legendy-arrigo-sacchi-2",
      lessonId: "legendy-arrigo-sacchi",
      text: "Co chtěl Sacchi říct větou o žokeji a koni?",
      options: [
        "Že trénovat by měli jen bývalí hráči",
        "Že má rád dostihy víc než fotbal",
        "Že fotbalisté se musí cvičit jako koně",
        "Že dobrý trenér nemusel být předtím slavný hráč",
      ],
      correct: 3,
      explain: "Odpovídal tak kritikům, kterým vadilo, že nebyl profesionálním hráčem. Žokej taky nemusí být nejdřív koněm.",
    },
    {
      id: "legendy-arrigo-sacchi-3",
      lessonId: "legendy-arrigo-sacchi",
      text: "Kolik metrů mělo podle Sacchiho být nanejvýš mezi obránci a útočníky?",
      options: ["25 metrů", "40 metrů", "10 metrů", "60 metrů"],
      correct: 0,
      explain: "Sacchiho tým byl kompaktní, mezi obranou a útokem mělo být nanejvýš 25 metrů.",
    },
    {
      id: "legendy-arrigo-sacchi-4",
      lessonId: "legendy-arrigo-sacchi",
      text: "Koho porazil Sacchiho Milán ve finále Poháru mistrů 1989?",
      options: ["Benfiku Lisabon", "Real Madrid", "Steauu Bukurešť", "Ajax Amsterdam"],
      correct: 2,
      explain: "Finále na Camp Nou vyhrál Milán 4:0 nad Steauou Bukurešť. Real Madrid porazil 5:0 v semifinále, Benfiku ve finále o rok později.",
    },
    {
      id: "legendy-arrigo-sacchi-5",
      lessonId: "legendy-arrigo-sacchi",
      text: "Co nacvičoval Sacchiho tým při hře bez míče?",
      options: [
        "Pohyb a posouvání jako v zápase, jen bez balónu",
        "Jen běh kolem hřiště",
        "Rozbor videa soupeře",
        "Cvičení v posilovně",
      ],
      correct: 0,
      explain: "Tým se pohyboval po hřišti jako v zápase, jen bez balónu, aby každý věděl, kam se má posunout.",
    },

    // Vicente del Bosque
    {
      id: "legendy-del-bosque-spain-1",
      lessonId: "legendy-del-bosque-spain",
      text: "Co se stalo del Bosquemu v Realu Madrid v roce 2003?",
      options: [
        "Podepsal s Realem doživotní smlouvu",
        "Sestoupil s Realem do druhé ligy",
        "Přestoupil jako hráč do Barcelony",
        "Den po zisku titulu se dozvěděl, že mu klub smlouvu neprodlouží",
      ],
      correct: 3,
      explain: "Del Bosque získal s Realem v roce 2003 titul a den nato se dozvěděl, že s ním klub dál nepočítá.",
    },
    {
      id: "legendy-del-bosque-spain-2",
      lessonId: "legendy-del-bosque-spain",
      text: "Jak Španělsko vstoupilo do mistrovství světa 2010?",
      options: [
        "Výhrou 5:0 nad Hondurasem",
        "Remízou s Chile",
        "Prohrou 0:1 se Švýcarskem",
        "Prohrou s Nizozemskem",
      ],
      correct: 2,
      explain: "Španělé prohráli úvodní zápas se Švýcarskem 0:1, pak už neprohráli a turnaj vyhráli.",
    },
    {
      id: "legendy-del-bosque-spain-3",
      lessonId: "legendy-del-bosque-spain",
      text: "Komu věnoval Andrés Iniesta vítězný gól ve finále MS 2010?",
      options: [
        "Trenérovi del Bosquemu",
        "Zesnulému kamarádovi Danimu Jarquemu, kapitánovi Espanyolu",
        "Narozenému synovi",
        "Fanouškům Barcelony",
      ],
      correct: 1,
      explain: "Pod dresem měl tričko s nápisem „Dani Jarque siempre con nosotros“. Jarque necelý rok předtím zemřel na infarkt.",
    },
    {
      id: "legendy-del-bosque-spain-4",
      lessonId: "legendy-del-bosque-spain",
      text: "Proč Iker Casillas v srpnu 2011 volal Xavimu a Puyolovi?",
      options: [
        "Aby uklidnil napětí mezi hráči Realu a Barcelony",
        "Aby je přemluvil k přestupu do Realu",
        "Aby se jim omluvil za vlastní gól",
        "Aby zrušil sraz reprezentace",
      ],
      correct: 0,
      explain: "Casillas podle svých slov nevolal kvůli omluvě, ale proto, že obraz hráčů v zápasech Realu s Barcelonou nebyl dobrým příkladem pro děti.",
    },
    {
      id: "legendy-del-bosque-spain-5",
      lessonId: "legendy-del-bosque-spain",
      text: "Co Španělsko dokázalo výhrou 4:0 nad Itálií ve finále EURO 2012?",
      options: [
        "Poprvé v historii postoupilo ze skupiny",
        "Jako první tým vyhrálo tři velké turnaje po sobě",
        "Získalo první titul v historii",
        "Kvalifikovalo se tím na olympijské hry",
      ],
      correct: 1,
      explain: "Po EURO 2008 a mistrovství světa 2010 přidalo Španělsko EURO 2012, tři velké turnaje po sobě jako první tým v historii.",
    },

    // Carlo Ancelotti
    {
      id: "legendy-carlo-ancelotti-1",
      lessonId: "legendy-carlo-ancelotti",
      text: "Kolikrát vyhrál Carlo Ancelotti jako trenér Ligu mistrů?",
      options: [
        "Pětkrát, víc než kterýkoli jiný trenér",
        "Dvakrát, oba tituly s Milánem",
        "Třikrát, všechny s Realem Madrid",
        "Ani jednou, vždy prohrál finále",
      ],
      correct: 0,
      explain: "Ancelotti vyhrál Ligu mistrů s Milánem v letech 2003 a 2007 a s Realem v letech 2014, 2022 a 2024. Je to rekord.",
    },
    {
      id: "legendy-carlo-ancelotti-2",
      lessonId: "legendy-carlo-ancelotti",
      text: "Co znamená „La Décima“, kterou Real Madrid slavil v roce 2014?",
      options: [
        "Desátý ligový titul v řadě",
        "Desátou evropskou trofej klubu",
        "Výhru 10:0 v Lize mistrů",
        "Deset let Ancelottiho v klubu",
      ],
      correct: 1,
      explain: "La Décima byla desátá evropská trofej Realu, na kterou klub čekal dvanáct let.",
    },
    {
      id: "legendy-carlo-ancelotti-3",
      lessonId: "legendy-carlo-ancelotti",
      text: "Na čem má podle Ancelottiho knihy Quiet Leadership stát autorita trenéra?",
      options: [
        "Na strachu z pokut",
        "Na hlasitém křiku v kabině",
        "Na tom, kolik trofejí trenér vyhrál jako hráč",
        "Na respektu a důvěře",
      ],
      correct: 3,
      explain: "Podle Ancelottiho má autorita stát na respektu a důvěře, ne na strachu.",
    },
    {
      id: "legendy-carlo-ancelotti-4",
      lessonId: "legendy-carlo-ancelotti",
      text: "Kdo vyrovnal v 93. minutě finále Ligy mistrů 2014 proti Atléticu Madrid?",
      options: ["Cristiano Ronaldo", "Gareth Bale", "Sergio Ramos", "Marcelo"],
      correct: 2,
      explain: "Sergio Ramos vyrovnal hlavou v nastavení a Real pak v prodloužení vyhrál 4:1.",
    },
    {
      id: "legendy-carlo-ancelotti-5",
      lessonId: "legendy-carlo-ancelotti",
      text: "Jak skončilo finále Ligy mistrů 2007, kde se Ancelottiho Milán znovu potkal s Liverpoolem?",
      options: [
        "Liverpool vyhrál na penalty",
        "Liverpool vyhrál 3:0",
        "Liverpool vyhrál 2:1",
        "Milán vyhrál 2:1",
      ],
      correct: 3,
      explain: "Dva roky po Istanbulu vyhrál Milán finále v Athénách 2:1.",
    },

    // Řecko 2004
    {
      id: "legendy-greece-euro-2004-1",
      lessonId: "legendy-greece-euro-2004",
      text: "Jakou bilanci mělo Řecko na velkých turnajích před EURO 2004?",
      options: [
        "Jednou došlo do semifinále",
        "Nevyhrálo ani jeden zápas",
        "Vyhrálo mistrovství Evropy 1980",
        "Nikdy se na velký turnaj nekvalifikovalo",
      ],
      correct: 1,
      explain: "Řecko hrálo EURO 1980 a mistrovství světa 1994, ale nevyhrálo tam jediný zápas.",
    },
    {
      id: "legendy-greece-euro-2004-2",
      lessonId: "legendy-greece-euro-2004",
      text: "Co dokázal Otto Rehhagel s Kaiserslauternem v roce 1998?",
      options: [
        "Vyhrál bundesligu jako nováček",
        "Sestoupil do druhé ligy",
        "Vyhrál Pohár mistrů",
        "Postoupil do bundesligy ze třetí ligy",
      ],
      correct: 0,
      explain: "Kaiserslautern vyhrál bundesligu hned v sezóně po postupu.",
    },
    {
      id: "legendy-greece-euro-2004-3",
      lessonId: "legendy-greece-euro-2004",
      text: "Kdo dal vítězný gól finále EURO 2004?",
      options: ["Traianos Dellas", "Angelos Basinas", "Giorgos Karagounis", "Angelos Charisteas"],
      correct: 3,
      explain: "Charisteas v 57. minutě hlavou proměnil Basinasův roh. Dellas rozhodl semifinále s Českem.",
    },
    {
      id: "legendy-greece-euro-2004-4",
      lessonId: "legendy-greece-euro-2004",
      text: "Čím bylo finále EURO 2004 výjimečné?",
      options: [
        "Rozhodl ho zlatý gól v prodloužení",
        "Hrálo se dvakrát kvůli bouřce",
        "Hrála ho stejná dvojice jako zahajovací zápas turnaje",
        "Řecko v něm dohrávalo v deseti",
      ],
      correct: 2,
      explain: "Řecko s Portugalskem otevřelo i uzavřelo turnaj, což se na mistrovství Evropy stalo poprvé.",
    },
    {
      id: "legendy-greece-euro-2004-5",
      lessonId: "legendy-greece-euro-2004",
      text: "Jakou přezdívku dali Řekové trenérovi Ottu Rehhagelovi?",
      options: ["Generál", "Rehakles", "Tinkerman", "Kaiser"],
      correct: 1,
      explain: "Rehakles je slovní hříčka podle bájného hrdiny Hérakla.",
    },

    // Bern 1954
    {
      id: "legendy-miracle-of-bern-1",
      lessonId: "legendy-miracle-of-bern",
      text: "Proč Sepp Herberger ve skupinovém zápase s Maďarskem (3:8) šetřil několik opor?",
      options: [
        "Hráči měli otravu jídlem",
        "Opory stávkovaly kvůli prémiím",
        "Opory měly trest za karty",
        "Věděl, že o postupu rozhodne další zápas s Tureckem",
      ],
      correct: 3,
      explain: "Herberger šetřil opory na zápas s Tureckem, který o postupu rozhodoval. Ten Němci vyhráli a došli až do finále.",
    },
    {
      id: "legendy-miracle-of-bern-2",
      lessonId: "legendy-miracle-of-bern",
      text: "Čemu se v roce 1954 říkalo „duch ze Spiezu“?",
      options: [
        "Strašidlu v hotelu německé výpravy",
        "Maďarské taktice s hrotovým útočníkem",
        "Soudržnosti německého týmu ubytovaného ve Spiezu",
        "Dešti, který padal během finále",
      ],
      correct: 2,
      explain: "Němci bydleli ve Spiezu u jezera, Herberger určoval pokoje a chránil tým. Soudržnosti party se říkalo duch ze Spiezu.",
    },
    {
      id: "legendy-miracle-of-bern-3",
      lessonId: "legendy-miracle-of-bern",
      text: "Proč byli Němci rádi, že finále 1954 provázel déšť?",
      options: [
        "Kapitán Fritz Walter špatně snášel horko a v dešti hrál nejlíp",
        "Maďaři zapomněli doma kopačky do bláta",
        "Déšť zkrátil zápas na 80 minut",
        "Na mokrém trávníku se nepískal ofsajd",
      ],
      correct: 0,
      explain: "Fritz Walter v dešti hrál nejlíp, proto se takovému počasí dodnes říká počasí Fritze Waltera.",
    },
    {
      id: "legendy-miracle-of-bern-4",
      lessonId: "legendy-miracle-of-bern",
      text: "Kdo dal ve finále 1954 vítězný gól na 3:2?",
      options: ["Max Morlock", "Helmut Rahn", "Fritz Walter", "Ferenc Puskás"],
      correct: 1,
      explain: "Helmut Rahn dal šest minut před koncem svůj druhý gól a rozhodl o výhře 3:2.",
    },
    {
      id: "legendy-miracle-of-bern-5",
      lessonId: "legendy-miracle-of-bern",
      text: "Jak dopadl Puskásův gól v závěru finále 1954?",
      options: [
        "Rozhodčí ho kvůli ofsajdu neuznal",
        "Platil a vynutil prodloužení",
        "Šel do vlastní branky",
        "Maďaři ho dali z penalty",
      ],
      correct: 0,
      explain: "Puskás v závěru skóroval, rozhodčí ale gól kvůli ofsajdu neuznal a Německo vyhrálo 3:2.",
    },

    // Nottingham Forest
    {
      id: "legendy-nottingham-forest-1",
      lessonId: "legendy-nottingham-forest",
      text: "V jaké soutěži hrál Nottingham Forest, když k němu v roce 1975 přišel Brian Clough?",
      options: [
        "V první lize na čele tabulky",
        "V Poháru mistrů",
        "Ve druhé lize, ve středu tabulky",
        "V amatérské soutěži",
      ],
      correct: 2,
      explain: "Clough přišel do Forestu, který se plácal ve středu tabulky druhé ligy.",
    },
    {
      id: "legendy-nottingham-forest-2",
      lessonId: "legendy-nottingham-forest",
      text: "Co Forest dokázal v sezóně 1977/78?",
      options: [
        "Sestoupil zpátky do druhé ligy",
        "Vyhrál anglickou ligu hned po postupu",
        "Vyhrál Pohár mistrů",
        "Prohrál finále FA Cupu",
      ],
      correct: 1,
      explain: "Forest vyhrál ligu v první sezóně po postupu, o sedm bodů před Liverpoolem.",
    },
    {
      id: "legendy-nottingham-forest-3",
      lessonId: "legendy-nottingham-forest",
      text: "Čím byl výjimečný přestup Trevora Francise do Forestu?",
      options: [
        "Přišel zadarmo z amatérského klubu",
        "Byl to první skotský hráč v klubu",
        "Přestoupil výměnou za Johna Robertsona",
        "Byl to první hráč v Anglii koupený za milion liber",
      ],
      correct: 3,
      explain: "Francis přišel z Birminghamu jako první hráč v Anglii za milion liber a ve finále 1979 rozhodl.",
    },
    {
      id: "legendy-nottingham-forest-4",
      lessonId: "legendy-nottingham-forest",
      text: "Koho vyřadil Forest v prvním kole Poháru mistrů 1978/79?",
      options: ["Obhájce titulu Liverpool", "Hamburk", "Malmö", "Real Madrid"],
      correct: 0,
      explain: "Forest hned v prvním kole vyřadil obhájce titulu Liverpool. Malmö porazil až ve finále.",
    },
    {
      id: "legendy-nottingham-forest-5",
      lessonId: "legendy-nottingham-forest",
      text: "Kolik Pohárů mistrů získal Nottingham Forest pod Cloughem?",
      options: ["Jeden", "Tři", "Dva, v letech 1979 a 1980", "Žádný, obě finále prohrál"],
      correct: 2,
      explain: "Forest vyhrál v roce 1979 nad Malmö a v roce 1980 nad Hamburkem, oba zápasy 1:0.",
    },

    // Island 2016
    {
      id: "legendy-iceland-euro-2016-1",
      lessonId: "legendy-iceland-euro-2016",
      text: "Jakou civilní profesi měl islandský trenér Heimir Hallgrímsson?",
      options: ["Zubař", "Rybář", "Hasič", "Učitel tělocviku"],
      correct: 0,
      explain: "Hallgrímsson vedl reprezentaci spolu s Larsem Lagerbäckem a dál pracoval jako zubař.",
    },
    {
      id: "legendy-iceland-euro-2016-2",
      lessonId: "legendy-iceland-euro-2016",
      text: "Kdo dal Islandu vítězný gól na 2:1 proti Anglii v osmifinále EURO 2016?",
      options: ["Ragnar Sigurðsson", "Birkir Bjarnason", "Arnór Ingvi Traustason", "Kolbeinn Sigþórsson"],
      correct: 3,
      explain: "Sigurðsson vyrovnal a Kolbeinn Sigþórsson rozhodl. Traustason dal vítězný gól Rakousku ve skupině.",
    },
    {
      id: "legendy-iceland-euro-2016-3",
      lessonId: "legendy-iceland-euro-2016",
      text: "Jak Island vyzrál na zimu a tmu, které ztěžují trénink?",
      options: [
        "Přesunul ligu do Španělska",
        "Začal stavět vytápěné haly s umělou trávou",
        "Hrál jen v létě za půlnočního slunce",
        "Zakázal fotbal v zimních měsících",
      ],
      correct: 1,
      explain: "Od roku 2000 svaz stavěl vytápěné haly, kde se dá hrát celý rok.",
    },
    {
      id: "legendy-iceland-euro-2016-4",
      lessonId: "legendy-iceland-euro-2016",
      text: "Jak reagoval Lars Lagerbäck na Ronaldovu kritiku islandské „malé mentality“?",
      options: [
        "Omluvil se mu",
        "Podal stížnost k UEFA",
        "Vzkázal, že kdo chce Island porazit, musí hrát líp",
        "Slíbil, že bude hrát útočněji",
      ],
      correct: 2,
      explain: "Lagerbäck odpověděl, že kdo chce Island porazit, musí hrát líp. Lekce to dává za příklad odpovědi výsledkem, ne hádkou.",
    },
    {
      id: "legendy-iceland-euro-2016-5",
      lessonId: "legendy-iceland-euro-2016",
      text: "Co udělal anglický trenér Roy Hodgson po prohře s Islandem?",
      options: [
        "Podepsal novou smlouvu",
        "Pozval islandské hráče na večeři",
        "Odešel trénovat Island",
        "Hned po zápase rezignoval",
      ],
      correct: 3,
      explain: "Roy Hodgson po prohře 1:2 s Islandem hned rezignoval.",
    },

    // Maracanazo 1950
    {
      id: "legendy-maracanazo-1950-1",
      lessonId: "legendy-maracanazo-1950",
      text: "Jaký výsledek stačil Brazílii v rozhodujícím zápase MS 1950 k titulu?",
      options: ["Výhra o dva góly", "Jakákoli výhra", "Remíza", "Výhra po prodloužení"],
      correct: 2,
      explain: "Brazílii stačila remíza, Uruguay musela vyhrát. Proto je porážka 1:2 tak slavná.",
    },
    {
      id: "legendy-maracanazo-1950-2",
      lessonId: "legendy-maracanazo-1950",
      text: "Co otiskly brazilské noviny O Mundo v den rozhodujícího zápasu?",
      options: [
        "Rozhovor s uruguayským kapitánem",
        "Výzvu, ať fanoušci zůstanou doma",
        "Varování před podceněním soupeře",
        "Fotku brazilského týmu s popiskem „Tohle jsou mistři světa“",
      ],
      correct: 3,
      explain: "Noviny slavily titul ještě před zápasem. Lekce to uvádí jako příklad tlaku domácího očekávání.",
    },
    {
      id: "legendy-maracanazo-1950-3",
      lessonId: "legendy-maracanazo-1950",
      text: "Co udělal uruguayský kapitán Obdulio Varela po brazilském gólu na 1:0?",
      options: [
        "Dohadoval se s rozhodčím o ofsajdu a spor protahoval",
        "Požádal trenéra o střídání",
        "Okamžitě rozehrál, aby se neztrácel čas",
        "Šel uklidňovat brazilské fanoušky na tribunu",
      ],
      correct: 0,
      explain: "Varela spor s rozhodčím protahoval, aby zchladil rozjetý stadion. Lekce z toho vyvozuje, že kapitán může zápas zpomalit.",
    },
    {
      id: "legendy-maracanazo-1950-4",
      lessonId: "legendy-maracanazo-1950",
      text: "Co znamená uruguayská věta „Los de afuera son de palo“?",
      options: [
        "Kdo nehraje, ať nemluví do sestavy",
        "Ti venku jsou ze dřeva, diváci na tribuně nehrají",
        "Dřevěné tribuny brzy spadnou",
        "Venku prší, budeme kopat dlouhé míče",
      ],
      correct: 1,
      explain: "Volně přeloženo: ti venku jsou ze dřeva. Tribuna nehraje, rozhoduje se na hřišti.",
    },
    {
      id: "legendy-maracanazo-1950-5",
      lessonId: "legendy-maracanazo-1950",
      text: "Jaké poučení vyvozuje lekce z toho, jak Brazilci naložili s brankářem Barbosou?",
      options: [
        "Brankář má po chybě hned střídat",
        "Za porážku může vždy trenér",
        "Tým, který hodí vinu na jednoho hráče, se z prohry nic nenaučí",
        "Brankáře je lepší vybírat podle výšky",
      ],
      correct: 2,
      explain: "Barbosu brali za viníka dlouhé roky. Lekce varuje před hledáním obětního beránka po prohře.",
    },

    // Maroko 2022
    {
      id: "legendy-morocco-2022-1",
      lessonId: "legendy-morocco-2022",
      text: "Kolik času měl Walid Regragui na přípravu Maroka před mistrovstvím světa 2022?",
      options: ["Necelé tři měsíce", "Čtyři roky", "Jeden týden", "Dva roky"],
      correct: 0,
      explain: "Regragui převzal tým 31. srpna 2022 a do mistrovství světa zbývaly necelé tři měsíce.",
    },
    {
      id: "legendy-morocco-2022-2",
      lessonId: "legendy-morocco-2022",
      text: "Co znamená arabské slovo „nia“, o kterém Regragui mluvil s hráči?",
      options: ["Rodina", "Úmysl", "Vítězství", "Trpělivost"],
      correct: 1,
      explain: "Nia znamená úmysl. Regragui chtěl, aby měli všichni hráči jeden společný úmysl.",
    },
    {
      id: "legendy-morocco-2022-3",
      lessonId: "legendy-morocco-2022",
      text: "Jak Regragui zdůvodňoval, proč mají být rodiny marockých hráčů s týmem v Kataru?",
      options: [
        "Aby rodiny hlídaly, že hráči nechodí za zábavou",
        "Kvůli natáčení reklamy",
        "Protože to nařídila FIFA",
        "Úspěch týmu podle trenéra nebyl možný bez spokojenosti rodičů",
      ],
      correct: 3,
      explain: "Regragui říkal, že za každým reprezentantem stojí rodina a že úspěch není možný bez spokojenosti rodičů.",
    },
    {
      id: "legendy-morocco-2022-4",
      lessonId: "legendy-morocco-2022",
      text: "Jak Achraf Hakimi rozhodl penaltový rozstřel se Španělskem?",
      options: [
        "Prudkou střelou pod břevno",
        "Chytil poslední španělskou penaltu",
        "Jemně dloubnutou panenkou",
        "Nekopal, rozstřel rozhodl Bounou",
      ],
      correct: 2,
      explain: "Hakimi rozhodl panenkou. Lekce v tom vidí sebevědomí hráče, za kterým stojí celá parta.",
    },
    {
      id: "legendy-morocco-2022-5",
      lessonId: "legendy-morocco-2022",
      text: "Čím bylo marocké tažení na MS 2022 historické?",
      options: [
        "Maroko vyhrálo mistrovství světa",
        "Maroko se stalo prvním africkým a arabským týmem v semifinále",
        "Maroko prošlo celým turnajem bez obdrženého gólu",
        "Maroko vyhrálo všechny vyřazovací zápasy na penalty",
      ],
      correct: 1,
      explain: "Po výhře nad Portugalskem bylo Maroko prvním africkým a arabským semifinalistou. Pak prohrálo s Francií a s Chorvatskem.",
    },

    // Real Madrid 2022
    {
      id: "legendy-real-madrid-comebacks-1",
      lessonId: "legendy-real-madrid-comebacks",
      text: "Co v Madridu označuje pojem „miedo escénico“?",
      options: [
        "Strach trenéra z novinářů",
        "Trému hráčů Realu před vlastními fanoušky",
        "Pověru, že bílé dresy nosí smůlu",
        "Strach z jeviště, který plný Bernabéu nahání soupeřům",
      ],
      correct: 3,
      explain: "Pojem zpopularizoval Jorge Valdano: plný Bernabéu svazuje nohy soupeřům, ne domácím.",
    },
    {
      id: "legendy-real-madrid-comebacks-2",
      lessonId: "legendy-real-madrid-comebacks",
      text: "Kdo dal Realu všechny tři góly v odvetě osmifinále s PSG v roce 2022?",
      options: ["Karim Benzema", "Rodrygo", "Vinícius Júnior", "Luka Modrić"],
      correct: 0,
      explain: "Benzema dal mezi 61. a 78. minutou hattrick a Real otočil zápas na 3:1.",
    },
    {
      id: "legendy-real-madrid-comebacks-3",
      lessonId: "legendy-real-madrid-comebacks",
      text: "Jak Real otočil domácí odvetu semifinále s Manchesterem City?",
      options: [
        "Benzema dal hattrick v prvním poločase",
        "Rozhodl až penaltový rozstřel",
        "Rodrygo dal v závěru dva góly během dvou minut a v prodloužení rozhodl Benzema z penalty",
        "City si dalo dva vlastní góly",
      ],
      correct: 2,
      explain: "Real prohrával 0:1 až do 90. minuty, pak Rodrygo dvakrát skóroval a Benzema v prodloužení proměnil penaltu.",
    },
    {
      id: "legendy-real-madrid-comebacks-4",
      lessonId: "legendy-real-madrid-comebacks",
      text: "Odkud se podle lekce bere víra v obrat?",
      options: [
        "Z dlouhého projevu trenéra v kabině",
        "Z historie a zkušenosti, že se to už jednou povedlo",
        "Z vyšších prémií za výhru",
        "Z toho, že soupeř je v závěru unavený",
      ],
      correct: 1,
      explain: "Víra v obrat se nedá vyrobit jedním projevem. Vzniká z historie a zkušenosti, proto se o obratech má v kabině mluvit.",
    },
    {
      id: "legendy-real-madrid-comebacks-5",
      lessonId: "legendy-real-madrid-comebacks",
      text: "Jakou výhradu k obratům lekce na konci připomíná?",
      options: [
        "Obrat je výjimka, ne plán",
        "Obraty se dají spolehlivě nacvičit na tréninku",
        "Obrat se povede jen na velkém stadionu",
        "Na přípravě nezáleží, obraty jsou jen štěstí",
      ],
      correct: 0,
      explain: "Kdo spoléhá, že to nějak otočí, prohraje prvních osmdesát minut zbytečně. Obrat je výjimka, ne plán.",
    },

    // Mnichov 2012
    {
      id: "legendy-chelsea-munich-2012-1",
      lessonId: "legendy-chelsea-munich-2012",
      text: "Co znamenalo pro Bayern „Finale dahoam“?",
      options: [
        "Finále bez diváků",
        "Finále na vlastním stadionu, tedy doma",
        "Finále proti klubu ze stejného města",
        "Poslední zápas trenéra",
      ],
      correct: 1,
      explain: "Finále se hrálo v Allianz Areně, na domácím stadionu Bayernu. Lekce to uvádí jako příklad tlaku domácího prostředí.",
    },
    {
      id: "legendy-chelsea-munich-2012-2",
      lessonId: "legendy-chelsea-munich-2012",
      text: "Jak dopadla penalta Arjena Robbena v prodloužení finále 2012?",
      options: [
        "Trefil břevno",
        "Proměnil ji a Bayern vedl",
        "Chytil ji Petr Čech",
        "Rozhodčí ji nechal opakovat",
      ],
      correct: 2,
      explain: "Drogba fauloval Ribéryho, Robben kopal penaltu a Petr Čech ji chytil.",
    },
    {
      id: "legendy-chelsea-munich-2012-3",
      lessonId: "legendy-chelsea-munich-2012",
      text: "Jak se Petr Čech připravoval na penalty ve finále 2012?",
      options: [
        "Prošel záznamy všech penalt hráčů Bayernu od roku 2007",
        "Před zápasem si o každou stranu hodil mincí",
        "Radil se s fanoušky na sociálních sítích",
        "Nepřipravoval se a spoléhal na instinkt",
      ],
      correct: 0,
      explain: "Čech studoval penalty hráčů Bayernu od roku 2007 a ve finále skočil u každé bavorské penalty na správnou stranu.",
    },
    {
      id: "legendy-chelsea-munich-2012-4",
      lessonId: "legendy-chelsea-munich-2012",
      text: "Kdo proměnil rozhodující penaltu Chelsea ve finále 2012?",
      options: ["Frank Lampard", "Juan Mata", "Petr Čech", "Didier Drogba"],
      correct: 3,
      explain: "Poslední penaltu proměnil Didier Drogba, který v prodloužení předtím zavinil penaltu. Juan Mata v rozstřelu neproměnil.",
    },
    {
      id: "legendy-chelsea-munich-2012-5",
      lessonId: "legendy-chelsea-munich-2012",
      text: "Co lekce tvrdí o přípravě na penaltový rozstřel?",
      options: [
        "Penalty jsou čistá loterie a příprava nemá smysl",
        "Penaltu má vždy kopat brankář",
        "Penaltu má kopat nejmladší hráč na hřišti",
        "Příprava nezaručí zákrok, ale dá jistotu a plán",
      ],
      correct: 3,
      explain: "Penalty nejsou jen loterie. Příprava nezaručí zákrok, ale dá brankáři i střelcům jistotu a plán.",
    },
  ],
};
