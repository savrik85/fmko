"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { usePathname } from "next/navigation";
import { HelpMenu, type CaptureAction } from "./help-menu";
import { BugReportDialog } from "@/components/bug-report/bug-report-dialog";
import { ShareScreenshotDialog } from "@/components/share/share-screenshot-dialog";
import { useTeam } from "@/context/team-context";
import { capturePage, captureVisibleContent, type CaptureResult } from "@/lib/page-capture";
import { installDiagnostics, recordPageVisit } from "@/lib/client-diagnostics";
import { brandScreenshot } from "@/lib/share-screenshot";

/** Počká, až prohlížeč vykreslí „Fotím stránku…“, než ho focení na chvíli zablokuje. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

interface HelpSection {
  heading?: string;
  text: string;
  tip?: boolean; // rendered as a tip box
}

interface HelpEntry {
  title: string;
  icon: string;
  sections: HelpSection[];
}

// ── Help content per page ──────────────────────────────────
// Texty píšeme česky včetně diakritiky — nápověda je místo, kam hráč jde,
// když si není jistý, a psaní bez háčků tam působí nedodělaně.

const HELP: Record<string, HelpEntry> = {
  "/prehled": {
    title: "Domovská obrazovka",
    icon: "\u{1F3E0}",
    sections: [
      { text: "Domovská obrazovka klubu poskládaná z widgetů: dnešní program, další zápas, tabulka, stav kádru, trenér, rozpočet, poslední zápasy, hospoda, rozpis, Zpravodaj a další. Co na ní bude, si určuješ sám." },
      { heading: "Skládání dashboardu", text: "Tlačítkem Upravit dashboard přepneš stránku do úprav. Widget chytneš za jeho zelenou lištu a přetáhneš myší nebo prstem, kam potřebuješ. Šipky ho posunou o jedno místo, křížek ho odebere. Pod lištou nastavíš šířku (1 až 3 sloupce), výšku a barvu karty. Na mobilu je vždy jeden sloupec a výška se projeví až na velké obrazovce. Přidat widget otevře katalog s hledáním a kategoriemi, vybrat jich můžeš víc naráz. Hotovo uloží rozložení na server, takže ti drží i na jiném zařízení. Obnovit výchozí vrátí původní podobu." },
      { text: "Widgety se sesypávají nahoru, takže menší karta zaplní místo pod vyšším sousedem a nikde nezůstávají prázdná místa.", tip: true },
      { heading: "Forma", text: "Karta Další zápas ukazuje formu obou týmů: posledních pět výsledků, nejnovější vpravo. V = výhra (3 body), R = remíza (1 bod), P = prohra (0 bodů)." },
      { heading: "Stav kádru", text: "Kondice ubírá výkon postupně, žádná ostrá hranice není. Unavený tým si vytvoří méně šancí, hůř brání a jeho hráči se snáz zraní. Sestava tě upozorní, když průměrná kondice spadne pod 60 %. Zraněný hráč ani hráč se stopkou nastoupit nemůže." },
      { heading: "Trenér", text: "Koučink zrychluje růst hráčů v tréninku. Motivace přidá morálku hráčům nominovaným na zápas, jen pro ten zápas (při 60 o tři body). Taktika přidá nebo ubere celé sestavě přihrávky a obranu (při 60 o bod, pod 33 ubírá) a zrychluje sehranost formace. Disciplína ubírá fauly a karty a zvedá docházku na trénink. Práce s mládeží zrychluje růst mladých hráčů. Co přesně každá vlastnost dělá, ukazuje profil trenéra." },
      { heading: "Vývoj trenéra", text: "Po zápasech se vlastnosti mění oběma směry. Koučink a taktika občas přibudou, po výhře častěji. Prohra občas sebere motivaci nebo disciplínu, debakl častěji. Reputace trenéra roste za výhry a klesá za prohry. Výš než na strop trenérské licence vlastnosti nevyrostou, vyšší licenci získáš v trenérské škole." },
      { text: "Šipka vlevo v horní liště tě vrátí na předchozí stránku. Herní dny běží samy: každý den se zpracuje v noci a ligové kolo se hraje v 18:00. Klepnutím na peníze v liště otevřeš Finance, na pořadí Ligu a na příští zápas Sestavu.", tip: true },
    ],
  },
  "/sazky": {
    title: "Sázková kancelář",
    icon: "\u{1F3AB}",
    sections: [
      { text: "Kancelář vypisuje kurzy na nejbližší kolo tvé soutěže. Na vlastní zápas si nevsadíš, ani na áčko, ani na rezervu, a ani na kluby se stejným majitelem. Sází se z klubové kasy." },
      { heading: "Kurzy", text: "Kurz počítá hra ze síly obou kádrů, formy a domácího prostředí. Kancelář si k tomu přirazí osm procent, takže součet šancí na lístku vždycky přesahuje sto procent a dlouhodobě vydělává ona, ne ty." },
      { heading: "Typy sázek", text: "Kdo vyhraje (1 = domácí, X = remíza, 2 = hosté), kdo neprohraje (1X, X2, 12), kolik padne gólů a kdo se trefí. V dalších sázkách je handicap, počet gólů v pásmu, oba týmy dají gól, góly jednoho týmu a výsledek s počtem gólů. Tipy z různých zápasů téhož kola se dají složit na jeden tiket, kurzy se pak násobí, ale musí vyjít všechny. Z jednoho zápasu si vybíráš jen jeden tip." },
      { heading: "Limity", text: "Vklad od 100 Kč, nejvýš tři tikety na kolo a šest tipů na tiketu. Bez hlasování je strop vkladu 5 000 Kč a výhry 100 000 Kč. Soutěž si je může odhlasovat jinak, k vkladu může přidat odvod do své pokladny a sázení může i zakázat. Klub v mínusu nebo bez peněz na vklad si nevsadí." },
      { heading: "Uzávěrka", text: "Lístek se zavírá ve chvíli, kdy se kolo začne hrát. Výsledek přijde SMS do telefonu hned po odehrání." },
      { heading: "Aréna", text: "Tiket můžeš vyvěsit do Arény. Uvidí ho všechny kluby soutěže a můžou se pod ním vyjádřit. U běžícího tiketu tím prozradíš, na co sázíš." },
      { text: "Když sázený střelec vůbec nenastoupí nebo se zápas neodehraje, tip se anuluje a kurz tiketu klesne, tip neprohrává. Když se anulují všechny tipy, vklad se vrací.", tip: true },
    ],
  },
  "/telefon": {
    title: "Telefon",
    icon: "\u{1F4F1}",
    sections: [
      { text: "Telefon je komunikace s hráči, vedením a okolím klubu. Záložky nahoře přepínají Zprávy, Socky, Hovory a Oznámení." },
      { heading: "Psaní a kredit", text: "Tužkou v hlavičce otevřeš adresář. Hráčům, do Kabiny a majitelům firem jde SMS za 3 Kč, ostatním trenérům a jejich skupinám iMessage zdarma. Kredit 36 Kč se dobíjí každý herní den." },
      { heading: "Socky", text: "Záložka Všichni je společná zeď všech okresů: články Zpravodaje, příspěvky trenérů, komentáře a lajky. Přes @ označíš jiného trenéra, co tě nezajímá, skryješ. Záložka Moji fanoušci ukazuje, co o klubu píšou party, vůdci a novináři." },
      { heading: "Hovory", text: "Zmeškané hovory nezvoní náhodou. Volá naštvaný kotel, sponzor po sérii proher, starosta po pokutě za výtržnosti nebo hráč, který dlouho nehrál. Čím víc zvonění, tím větší průšvih." },
      { heading: "Předzápasová konverzace", text: "Den před ligovým zápasem se objeví skupina se soupeřem a hráči v ní píšou, jestli dorazí. Ráno v den zápasu můžou přijít další omluvenky. Omlouvá se hlavně podle disciplíny, morálky, vztahu ke klubu, práce, dojezdu a počasí. Po odehraném kole skupina zmizí." },
      { heading: "Systémové kontakty", text: "Účetní klubu hlásí peníze, Správce hřiště zranění, Kapitán týmu odchody z kabiny, Starosta obce reputaci a Vedení ostatní. Jsou to oznámení, odpovídat na ně nejde." },
      { text: "Tip na hráče ti pošle Místní kontakt (hospodský), Kapitán týmu nebo Starosta obce. Přijmeš ho v Přestupech na záložce Nabídky, než nabídka za pár dní vyprší.", tip: true },
    ],
  },
  "/kadr": {
    title: "Kádr týmu",
    icon: "\u{1F465}",
    sections: [
      { text: "Všichni hráči týmu seřazení podle hodnocení. Klepnutím na hlavičku sloupce řadíš, klepnutím na řádek otevřeš hráče. Další záložky: Rozbor (rady asistenta trenéra), Sezóna (statistiky), Postava, Docházka a TOP (žebříčky)." },
      { heading: "Hodnocení", text: "Hodnocení je vážený průměr dovedností a každý post váží jiné dovednosti. Pevná stupnice to není: jestli je hráč dobrý, poznáš ze srovnání s kádrem a se soupeři v lize. Sloupec Pot ukazuje odhad skauta, kam hráč dojde, bez skauta zůstane prázdný. Zlatě je označený klenot, kluk s velkým talentem, který může přerůst celý kádr. Urodí se jen občas a pozná se hlavně podle toho, jak rychle roste." },
      { heading: "Ikony v tabulce", text: "Mor ukazuje náladu hráče, Vzt to, jak tě bere: od ❤️ (jste kamarádi) po 💢 (nesnáší tě). 🤞 u jména znamená, že jsi mu něco slíbil." },
      { heading: "Kondice", text: "Každou noc se kondice doplní podle výdrže: od 75 o 20 bodů, od 50 o 16, od 25 o 13, jinak o 10. Hráči do 21 let mají 3 body navíc, do 25 let 1 bod, od 31 let se bod ubírá a od 36 let tři. Další body přidají sprchy, posilovna a masér. Zápas ubere hráči v poli desítky bodů, brankáři mnohem méně. Trénink ubere jen pár bodů podle typu a intenzity. Unavený hráč hraje hůř a snáz se zraní." },
      { heading: "Morálka", text: "Morálka ovlivňuje výkon v zápase, méně než kondice. Mění se hlavně během zápasu: vstřelený gól ji týmu zvedne, inkasovaný sníží. Hýbe s ní i hospoda, trénink, který hráči nesedí, a nenominace. Každý den se pomalu vrací ke středu: nad 55 o bod klesne, pod 45 o bod stoupne. Hráč s mizernou morálkou a nízkou věrností může s fotbalem úplně skončit." },
      { heading: "Pozice", text: "BRA/OBR/ZÁL/ÚTO. Hráč mimo svou pozici má až −40 % na relevantní dovednosti. Např. útočník v obraně ztrácí 30 % obrany." },
    ],
  },
  "/trenink": {
    title: "Tréninky",
    icon: "⚽",
    sections: [
      { text: "Kdo na trénink přijde, dostane několik pokusů o zlepšení. Každý pokus může zvednout o bod jednu z dovedností, které daný typ tréninku trénuje. Základní šance pokusu je 30 %, pak ji násobí intenzita, věk, koučink trenéra, vybavení a zaměstnanci. Dovednost nikdy nepřeroste strop, který hráč má." },
      { heading: "Počet pokusů", text: "Hráči do 21 let mají pokusů podle talentu. Dospělí do 27 let mají základ 6, od 28 do 31 let 4, od 32 do 35 let 3 a pak 2. Talent k tomu může přidat nebo ubrat. Tempo učení odhadne skaut, najdeš ho na kartě hráče." },
      { heading: "Koučink trenéra", text: "Vzorec: 0,8 + (koučink/100) × 0,8. Při koučinku 40 = 1,12×, při 80 = 1,44×. Přímo násobí šanci na zlepšení." },
      { heading: "Věk hráče", text: "Věk násobí šanci každého pokusu: do 17 let ×1,45, v 18 a 19 letech ×1,35, ve 20 a 21 letech ×1,25, od 22 do 24 let ×1,15, od 25 do 29 let ×1, od 30 do 33 let ×0,7, od 34 do 37 let ×0,4 a od 38 let ×0,15. Nad 50 bodů v dovednosti jde zlepšování čím dál pomaleji." },
      { heading: "Rozvoj mládeže", text: "Hráčům do 21 let přidává práce trenéra s mládeží: 0,9 + (mládež/100) × 0,6, při 60 je to ×1,26. Pomůže i trenér mládeže. Veterán od 30 let s vysokým vůdcovstvím, který na trénink přijde, táhne mladé nahoru. Mladí rostou i z odehraných minut v zápase." },
      { heading: "Typ tréninku", text: "Každý typ trénuje jiné dovednosti, vidíš je u tlačítek. Hráč se zlepší jen v těch, které se na jeho postu počítají do hodnocení. Taktický trénink navíc zvedá sehranost formace." },
      { heading: "Intenzita", text: "Lehký trénink dá zhruba 60 % růstu a sebere polovinu kondice, hodí se den před zápasem. Tvrdý dá o 45 % víc růstu, ale sebere o 60 % víc kondice. Záleží i na typu: kondice a taktika berou méně sil než technika a zápasová praxe." },
      { heading: "Tréninkové dny", text: "Trénovat můžeš 1 až 7 dní v týdnu, i o víkendu. Dny si naklikáš, v Plánu na týden dáš každému dni vlastní typ a intenzitu. V den zápasu trénink odpadá. Víc dní znamená rychlejší růst, ale vyšší náklady a víc únavy." },
      { heading: "Docházka", text: "Základ dává disciplína hráče: disciplína/100 × 0,6 + 0,33. Přičítá se disciplína trenéra (kolem 40 neutrální, jinak až o 10 % oběma směry), přístup a vybavení. Ubírá alkohol nad 70 (o 10 %), morálka pod 30 (o 15 %), věk nad 35 let (o 10 %) a dojíždění, 0,8 % za kilometr, nejvýš 22 %. Roli hraje i práce (směnaři chodí méně), životní situace a počasí." },
      { heading: "Jak to kádru sedí", text: "Každý hráč snese jiný počet tréninků. Pracovitý a mladý víc, pohodář, veterán a unavený hráč méně. Přetíženému i nevytíženému hráči občas klesne morálka, komu tempo sedí, tomu občas stoupne. Unaveným dej volno z příštího tréninku: nebudou trénovat, ale ani ztrácet kondici." },
      { heading: "Přístup", text: "Přísný: docházka o 10 % vyšší, ale hráči s nízkou disciplínou občas ztratí morálku. Pohoda: docházka o 10 % nižší, ale občas někomu stoupne nálada. Vyrovnaný: bez úprav." },
      { text: "Hráči od 37 let můžou na tréninku ztratit bod rychlosti, výdrže nebo síly, šance roste o procento s každým rokem nad 36. Od 30 let hodnocení hráče každé léto spíš klesá.", tip: true },
    ],
  },
  "/prestupy": {
    title: "Přestupy a nábor",
    icon: "\u{1F91D}",
    sections: [
      { text: "Trh s hráči. V Hledat najdeš hráče jiných klubů, inzeráty na prodej a na hostování, volné hráče a své sledované. V Nabídkách vyřizuješ jednání a tipy na nové hráče, v Můj tým prodáváš, půjčuješ a splácíš, v Poptávkách píšeš, koho sháníš." },
      { heading: "Volní hráči", text: "Hráči bez klubu. Podepíšeš je bez přestupní částky, zaplatíš registraci 500 Kč a pak jejich týdenní mzdu. Jestli kývne, rozhoduje hráč: hraje roli reputace klubu, dojíždění, velikost kádru, mzda a patriotismus. V okrese je nejvýš osm nově vytvořených volných hráčů a denně přibudou až dva, k nim se přidávají hráči, které kluby propustily. Na trhu vydrží jen pár dní." },
      { heading: "Hráči jiných klubů", text: "Dovednosti hráčů z cizích klubů vidíš jen přibližně, zaokrouhlené na pětky. Přesně je znáš jen u svých hráčů a u volných hráčů. Kam to hráč může dotáhnout, odhadne skaut, nebo to ukáže prodávající, když u inzerátu odkryje potenciál." },
      { heading: "Tipy na hráče", text: "Občas ti hráče doporučí hospodský, kapitán nebo starosta. Přijde SMS a hráč se objeví v Nabídkách. Najednou čekají nejvýš dva takové tipy a po pár dnech propadnou. Přijetí stojí registraci 500 Kč." },
      { heading: "Nabídky a jednání", text: "Na hráče jiného klubu pošleš nabídku z jeho profilu. Kromě ceny můžeš navrhnout splátky, procenta z jeho dalšího prodeje, nebo přidat až dva své hráče na výměnu. Druhá strana přijme, odmítne, nebo pošle protinávrh. Kdo je na tahu, má na odpověď tři dny, potom nabídka propadne. Po odmítnutí můžeš na stejného hráče nabídnout znovu až za deset dní. Kluby mimo hru odpovídají hned a smlouvají, a když jim dojde trpělivost, jednání ukončí." },
      { heading: "Splátky a procenta", text: "Při trvalém přestupu jde zaplatit zálohu aspoň 10 % a zbytek ve 2 až 20 týdenních splátkách, každá nejméně 500 Kč. Splátky se strhávají v pondělí, i když je klub v minusu. Splácet můžeš najednou nejvýš tři hráče a splátky dohromady nesmí přesáhnout týdenní příjmy klubu. Procenta z dalšího prodeje jdou od 5 do 50 %. Přehled je v Můj tým → Závazky." },
      { heading: "Prodej svého hráče", text: "V Můj tým → Hráči vystavíš hráče s cenou a ostatní kluby ti posílají nabídky. Inzerát visí týden a můžeš u něj odkrýt potenciál. Hráče získaného levně (volný hráč nebo tip) nejde 14 dní prodat, vyměnit ani půjčit. Propustit hráče jde kdykoli, odejde zadarmo mezi volné hráče." },
      { heading: "Hostování", text: "Hráče si půjčíš na dobu od dvou týdnů do půl roku, z inzerátu v Hledat → Hostování, nebo nabídkou z profilu hráče. Klub, který hráče půjčuje, musí žádost potvrdit. Inzerát může mít podmínku, kolik má hráč hrát. Půjčující klub může hráče stáhnout kdykoli: když podmínku plníš, vrátí ti poměrnou část poplatku, když ji porušuješ, nevrátí nic. Po skončení se hráč vrátí sám a hostujícího hráče můžeš od jeho klubu i odkoupit." },
      { heading: "Poptávky", text: "V Poptávkách napíšeš, koho sháníš: post, věk, roli a kolik nejvýš zaplatíš. Ostatní kluby ti nabídnou své hráče a na vybraného pak pošleš běžnou nabídku. Najednou můžeš mít tři poptávky, každá platí 14 dní." },
      { heading: "Jiné soutěže", text: "Hráči se štítkem okresu jsou z jiné soutěže. Za přestup odtamtud platíš navíc meziligový poplatek, jeho sazbu si odhlasuje soutěž (výchozí je 20 %). Tlačítkem Jen můj okres si necháš jen hráče ze svého okresu." },
      { text: "Nový hráč (volný nebo z tipu) chce týdně zhruba 10 Kč plus 4 Kč za každý bod hodnocení. Hráč s hodnocením 50 stojí asi 210 Kč týdně.", tip: true },
    ],
  },
  "/finance": {
    title: "Finance klubu",
    icon: "\u{1F4B0}",
    sections: [
      { text: "Peníze klubu. Přehled ukazuje rozpočet a týdenní bilanci, Pohyby každou platbu, Prognóza odhad do konce sezóny a Půjčka bankovní úvěr." },
      { heading: "Kdy se platí", text: "Pravidelné příjmy a výdaje se zúčtují každé pondělí. Vstupné, bufet, odměny a náklady na zápas přijdou v den zápasu, trénink se platí v den tréninku. Přestupy, stavby, vybavení a pokuty se strhnou hned." },
      { heading: "Pravidelné příjmy", text: "Sponzoři platí každé pondělí, přesnou částku vidíš u každé smlouvy. Dotace obce má měsíční základ 6 000 Kč pro vesnici, 10 000 pro obec, 15 000 pro městys a 25 000 pro město, přízeň obce ji posune od poloviny až po jedenapůlnásobek. Členské příspěvky jsou 100 Kč měsíčně za každého hráče. Když bufet pronajímáš, platí ti nájemce každý týden." },
      { heading: "Pravidelné výdaje", text: "Největší položka jsou týdenní mzdy hráčů, k nim mzdy zaměstnanců. Dál údržba hřiště (měsíčně 500 až 3 000 Kč podle velikosti obce), amortizace vybavení (asi 500 Kč měsíčně), provoz akademie, pokud ji máš, a splátky přestupů. Každý trénink stojí 200 až 1 000 Kč podle velikosti obce. Ekonom mezi zaměstnanci příjmy zvedá a provozní náklady snižuje." },
      { heading: "Den zápasu", text: "Doma vybíráš vstupné a tržby z bufetu, spokojení fanoušci zaplatí víc, naštvaní méně, a bez plotu zaplatí jen část diváků. Rozhodčího platí pokladna soutěže, pokud ji soutěž má, jinak domácí klub (800 až 1 500 Kč). Pořadatelé a VIP lóže se platí za každý domácí zápas. Po soutěžním zápase platíš občerstvení pro mužstvo, venku i cestovné." },
      { heading: "Zápasové odměny", text: "Za výhru dostaneš bonusy od sponzorů, prémii od soutěže (výchozí 500 Kč, výši si soutěž odhlasuje) a bonus od fanoušků 50 až 200 Kč podle velikosti obce. Za remízu 30 % sponzorských bonusů, prémii za remízu (výchozí 150 Kč) a polovinu bonusu od fanoušků. Prohra nedá nic. Za přátelák se odměny nevyplácejí, jen vstupné a bufet." },
      { heading: "Místní podpora", text: "Reputace klubu × 100 Kč/měsíc. Při reputaci 50 je to 5 000 Kč/měs., při 70 už 7 000. Detail v sekci Reputace." },
      { text: "V minusu nejde nic kupovat: přestupy, registrace, stavby, vybavení, kurzy ani sázky. Mzdy, údržba, splátky a pokuty se strhávají dál, takže dluh roste. Z minusu pomůže prodej hráče, zastavárna nebo půjčka.", tip: true },
    ],
  },
  "/sponzori": {
    title: "Sponzoři",
    icon: "\u{1F3E2}",
    sections: [
      { text: "Sponzoři platí klubu každé pondělí. Smlouvy jsou tří druhů: hlavní sponzor, sponzor názvu stadionu a reklamní bannery. Kolik firma dá, závisí na reputaci klubu, u hlavního sponzora a stadionu i na tom, jak tě má rád její majitel." },
      { heading: "Reklamní bannery", text: "Bannerů můžeš mít nejvýš šest. Nabídek je až dvanáct, od firem z okresu, které klub ještě nesponzorují. Banner nemá bonus za výhru a smlouva je na jednu až dvě sezóny. Částka roste s reputací (při reputaci 70 dostaneš o 40 % víc než při 50) a s velikostí obce: vesnice 0,8×, obec 1×, městys 1,1×, město 1,3×. Stejně se počítají i hlavní sponzor a stadion." },
      { heading: "Hlavní sponzor a stadion", text: "Tyhle smlouvy si vyjednáš s majitelem firmy. Navrhneš měsíční částku, bonus za výhru, příspěvek za podpis nebo zaplacenou stavbu a k tomu sliby. Majitel souhlasí, pošle protinávrh, nebo jednání ukončí, když mu dojde trpělivost. Hlavní sponzor přejmenuje klub, stojí to 3 body reputace. Jedna firma je hlavním sponzorem nejvýš jednoho klubu." },
      { heading: "Sliby", text: "Za slib dá sponzor víc: umístění v lize, postup nebo záchrana, kolo poháru, návštěva, mládež, reputace, licence trenéra, stavba, logo na dresu, exkluzivita oboru nebo klid na tribunách. Splněný slib přinese bonus a potěší majitele, nesplněný stojí pokutu. Po dvou porušených slibech, nebo hned po nesplněném postupu či záchraně, sponzor smlouvu vypoví a klub ztratí 5 bodů reputace." },
      { heading: "Majitelé firem", text: "Každá firma má majitele s vlastní povahou. Jeho náklonnost zvedneš pozváním na domácí zápas, pivem v hospodě a splněnými sliby. Šanci, že pozvání přijme, zvyšuje VIP lóže na stadionu. Kdo tě má rád, dá při jednání víc." },
      { heading: "Prosba o příspěvek", text: "Majiteli můžeš napsat SMS a poprosit o peníze na trenéra, přestup, vybavení, stadion nebo mládež. Firma, se kterou máš smlouvu, dá od náklonnosti 30, cizí firma až od 80. Peníze přijdou hned a do 30 dní je musíš utratit na slíbený účel, jinak se majitel naštve a do konce sezóny nedá nic. Další prosba dřív než za 14 dní ho otráví." },
      { heading: "Předčasná výpověď", text: "Smlouvu můžeš ukončit dřív, zaplatíš ale výpovědní pokutu a vrátíš nesplacenou část toho, co sponzor dal předem. U hlavního sponzora přijdeš navíc o 2 body reputace a klub se vrátí k původnímu názvu." },
      { heading: "Reputace klubu a trenéra", text: "Na sponzory působí reputace klubu (0–100, detail v sekci Reputace). Reputace trenéra je jiné číslo (15–75), roste výhrami, klesá prohrami a na sponzory nemá vliv." },
    ],
  },
  "/reputace": {
    title: "Reputace klubu",
    icon: "⭐",
    sections: [
      { text: "Jak moc se o klubu v okrese ví. Rozsah 0–100, nový klub začíná na 50. Nepleť si ji s reputací trenéra, to je jiné číslo (15–75) a roste za výhry. Samotná výhra zápasu s klubovou reputací nehne." },
      { heading: "Co odemyká", text: "Vybavení 2. úrovně: reputace 40 a 5 odehraných zápasů. Stadion 2. úrovně: 50 a 15 zápasů. Vybavení 3. úrovně: 60, 15 zápasů a aspoň 2. sezóna. Stadion 3. úrovně: 70, 35 zápasů a aspoň 3. sezóna." },
      { heading: "Co vydělává", text: "Podpora místních podnikatelů: reputace × 100 Kč měsíčně, vyplácí se po týdnech. Vyšší částky od sponzorů (nabídka se násobí reputací děleno 50). Víc diváků na domácích zápasech. Vyšší nájem od externího provozovatele bufetu. Větší ochota hráčů k tobě přestoupit." },
      { heading: "Jak ji zvednout", text: "Horní polovina tabulky na konci sezóny (ve čtrnáctičlenné lize vítěz +5). Postup do okresního přeboru +5. Pohár: výhra v osmifinále +1, ve čtvrtfinále +2, v semifinále +3, ve finále +5. Sezónní akce +1 až +10. Podpis hvězdy +4 až +15. Vyprodaný stadion +1, nejvýš 6× za sezónu. Série 5, 10 a 15 výher v řadě, pokaždé +2. Každý měsíc +1, když tvoří rodáci aspoň 40 % kádru, a +1 při přízni obce od 75. Drobně přidají i příznivé články ve Zpravodaji, zastání se rozhodčího v rozhovoru a hrdina nebo poctivý nálezce v kádru." },
      { heading: "Co ji srazí", text: "Spodní polovina tabulky (ve čtrnáctičlenné lize poslední −5). Sestup −5. Sponzor, který vypoví smlouvu za nesplněné sliby, −5. Přejmenování klubu −3. Předčasné ukončení smlouvy s hlavním sponzorem −2. Série pěti proher −2. Útěk hráče s klubovými penězi −2. Špatná volba v sezónní akci −2 až −5. Poloprázdné hlediště −1 (stadion od 200 míst, přijde nejvýš 35 % kapacity). Každý měsíc −1, když je rodáků méně než desetina kádru, a −1 při přízni obce do 25. Ostrá kritika rozhodčího nebo nepřátelský redaktor −1." },
      { heading: "Útlum", text: "Když klub 28 herních dní nezíská ani bod reputace, každé pondělí jeden ztratí. Jediný zisk útlum zastaví. Pod práh podle velikosti obce (vesnice 35, obec 38, městys 40, město 43) tě útlum nestlačí." },
      { heading: "Klesající výnosy", text: "Od reputace 55 se zisky krátí na 75 %, od 70 na polovinu, od 85 na čtvrtinu. Ztráty se nekrátí. Čím výš jsi, tím dražší je stoupat." },
      { text: "Sprchy, hřiště, parkoviště a tribuny umí spolufinancovat obec. Nabídku pošle nejvýš jednou za měsíc, když je přízeň obce dost vysoká (hřiště od 55, sprchy 60, parkoviště 70, tribuny 80). Reputace tam nerozhoduje.", tip: true },
    ],
  },
  "/fanousci": {
    title: "Fanoušci a občerstvení",
    icon: "\u{1F4E3}",
    sections: [
      { text: "Pět záložek: Základna (kolik máš fanoušků a odkud), Skupiny (party, vůdci a chorály), Spokojenost (nálada, loajalita, vstupné a vliv trenéra), Občerstvení (bufet) a Prodeje. Prodeje uvidíš jen při vlastním provozu bufetu." },
      { heading: "Základna", text: "Fanoušci se dělí na tvrdé jádro, pravidelné a občasné. Přibývají z vlastní obce, z propagace zápasu a z autobusů. Propagace stojí peníze a přivede o 25 % víc diváků. Autobus vozí lidi z obcí do 10 km. Když propaguješ tři domácí zápasy po sobě nebo vozíš lidi ze stejné obce tři zápasy po sobě, část z nich ti zůstane natrvalo." },
      { heading: "Party", text: "Fanoušci jsou rozdělení do pěti part: kotel, štamgasti, rodiny s dětmi, pamětníci a parta z okolí. Každá má vůdce, náladu a vztah k vedení a ovlivňuje návštěvnost, útratu v bufetu i domácí výhodu. S partou můžeš jednat: sejít se s vůdcem, dát sektoru slevu, přispět na choreo, zakázat vstup, odpustit trest nebo přesunout sektor." },
      { heading: "Výtržnosti a kampaně", text: "Naštvaná parta umí na stadionu udělat bordel. Klub pak platí pokutu a sektor může zůstat zavřený. Riziko sráží pořadatelská služba na stránce Stadion, kotel ale šacování nemá rád. Když je nálada dlouho na dně, fanoušci sbírají podpisy proti hráči nebo proti tobě. Projde-li kampaň, hráč ztratí morálku a tobě klesne reputace trenéra." },
      { heading: "Chorály", text: "Chorály si fanoušci vymýšlejí sami, když mají důvod: miláček kotle, rival, výhra, trenér, nebo naopak vzdor a stížnost na zázemí. Koupit se nedají. Nahrávku dostane domácí chorál a každý, který se v kotli chytne naplno." },
      { heading: "Spokojenost (0–100)", text: "Mění se po každém zápase, i venku a v přáteláku. Výhra +6, remíza 0, prohra −5. Výhra nad soupeřem s reputací o víc než 10 vyšší přidá navíc, prohra se soupeřem o víc než 10 slabším ubere. Trenér −3 až +3. Doma ještě rozhoduje vstupné (drahé −2, levné +1) a trávník (zanedbaný −2, rozbitý −4). U vlastního bufetu ubere každý došlý produkt a předražené nejlevnější zboží. Zázemí (ozvučení, sociálky, pořadatelé, trávník, obsluha a kvalitní zboží) přidá dohromady nejvýš +3. Celkem nejvýš ±15 za zápas." },
      { heading: "Loajalita", text: "Dlouhodobá důvěra ke klubu. Každý den se posune o bod k reputaci klubu, kterou vliv trenéra posouvá o −2 až +2. Přes 100 nejde. Spokojenost se mezi zápasy vrací ke klidové hodnotě 45 až 60, čím vyšší loajalita, tím výš." },
      { heading: "Vliv trenéra", text: "Vliv = 0,4 × reputace trenéra + 0,25 × motivace + 0,35 × forma, neutrál je 44. Forma je ze 60 % body z posledních pěti zápasů a ze 40 % místo v tabulce. Pásma: 57 a víc +3, 52 až 56 +2, 47 až 51 +1, 42 až 46 nula, 37 až 41 −1, 32 až 36 −2, 31 a míň −3. Tolik přidá nebo ubere spokojenosti po každém zápase." },
      { heading: "Jak zvednout reputaci trenéra", text: "Výhra +1 (o tři a víc gólů +2), prohra −1 (debakl −2), projeví se asi v třetině zápasů. Konec sezóny: ve čtrnáctičlenné lize první místo +10, poslední −10. Pohár: výhra v osmifinále +2, ve čtvrtfinále +3, v semifinále +5, ve finále +8. Nová trenérská licence +2. Odsloužený mandát ve vedení soutěže +6, odvolání z funkce −10. Proslov na závěrečné párty +1 nebo −1. Úspěšná kampaň fanoušků za tvé odvolání −3. Rozsah 15–75." },
      { heading: "Motivace trenéra", text: "Konec sezóny v horní polovině +1, ve spodní poloviční šance na −1. Zhruba každá osmá prohra (debakl každá čtvrtá) sebere bod motivace nebo disciplíny. Ze zápasů sama neroste. Zvedne ji kurz v trenérské škole (+3, pokročilý +5), výš než dovolí licence ale nejde (bez licence 60, C 70, B 80, A 90)." },
      { heading: "Občerstvení a vstupné", text: "Externí provozovatel platí týdenní nájem, který roste s úrovní občerstvení a s reputací klubu. Vlastní provoz jde až s občerstvením aspoň 1. úrovně: každé zboží má tři kvality s vlastním skladem a sklad se sám nedoplňuje, takže před domácím zápasem nakup. Vstupné do běžné ceny obce nikoho neodradí, nad ní přijde míň lidí a od trojnásobku nikdo. Levnější vstupné diváky nepřidá, jen fanoušky potěší." },
      { text: "Spokojenost násobí návštěvnost (0,75× až 1,25×), cenu vstupenky (0,7× až 1,3×) i poptávku ve vlastním bufetu. Vyplatí se ji hlídat.", tip: true },
    ],
  },
  "/vybaveni": {
    title: "Vybavení",
    icon: "\u{1F3BD}",
    sections: [
      { text: "Vybavení klubu. Každá věc má tři úrovně a dává bonus na tréninky nebo zápasy, aktivní bonusy jsou nahoře. Klub za vybavení platí i paušální amortizaci, asi 500 Kč měsíčně." },
      { heading: "Opotřebení a opravy", text: "Vybavení každý den ztratí bod stavu, nejníž klesne na 5 %. Bonus se násobí stavem, takže při stavu 50 % dává polovinu. Pod 90 % se nabízí oprava, která vrátí stav na 100 %." },
      { heading: "Prodej a bazar", text: "Nepotřebné vybavení vykoupí zastavárna hned za pevnou cenu. V bazaru si cenu určíš sám: inzerát vidí jen kluby z tvé ligy, platí 7 dní a do prodeje vybavení dál používáš. V bazaru taky nakupuješ od ostatních klubů." },
      { heading: "Zámky vylepšení", text: "2. úroveň: reputace 40+ a 5 odehraných zápasů. 3. úroveň: reputace 60+, 15 zápasů a sezóna 2+. Platí i pro nákup v bazaru." },
    ],
  },
  "/stadion": {
    title: "Stadion a hřiště",
    icon: "\u{1F3DF}️",
    sections: [
      { text: "Areál klubu: trávník, tribuny a zázemí. Stav trávníku ovlivňuje hru, riziko zranění, návštěvu i spokojenost fanoušků." },
      { heading: "Trávník", text: "Trávník má kvalitu a vlhkost. Kvalita klesá časem i každým domácím zápasem (přírodní nejvíc, hybrid méně, umělka vůbec) a opravíš ji údržbou. Po dešti je bahno, po vedrech vyprahlá tvrdá zem, obojí trochu kazí techniku a zvyšuje riziko zranění. Vyhřívání, zavlažování a odklízení sněhu nastavíš v Péči o trávník, provoz se platí za každý zápas." },
      { heading: "Počasí", text: "Počasí se řídí ročním obdobím, je stejné pro celé kolo a předpověď vidíš u zápasu dopředu. Déšť: technika 0,8×, riziko zranění 1,45×. Sníh: technika 0,7×, zranění 1,6×. Vítr: technika 0,9×, zranění 1,15×. Za slunce přijde víc lidí, v dešti a ve sněhu méně, zastřešení tribun pokles návštěvy zmírní." },
      { heading: "Návštěvnost", text: "Kolik lidí přijde, závisí na fanouškovské základně, velikosti obce a okolí, reputaci klubu, formě, spokojenosti fanoušků, počasí, stavu trávníku, osvětlení a parkovišti, ceně vstupného a kapacitě. Základní vstupné je 20 Kč ve vesnici, 30 v obci, 40 v městysi a 50 ve městě, vlastní cenu nastavíš ve Fanoušcích. Nad základní cenou přijde méně lidí, od trojnásobku nikdo." },
      { heading: "Tribuny a zázemí", text: "Kapacitu zvýšíš tribunami po stranách a přístavbami v rozích. U nabídky vidíš, kolik lidí ti chodilo na posledních deset domácích zápasů. Zázemí (šatny, sprchy, bufet, osvětlení, plot, střecha, pořadatelé, VIP lóže a další) dává bonusy, co přesně, ukazuje každá karta. Bez plotu zaplatí vstupné jen část diváků." },
      { heading: "Zámky vylepšení", text: "2. úroveň: reputace 50+ a 15 odehraných zápasů. 3. úroveň: reputace 70+, 35 zápasů a sezóna 3+. Sprchy, hřiště, parkoviště a tribuny umí spolufinancovat obec, tam reputace nerozhoduje, jen přízeň." },
    ],
  },
  "/udalosti": {
    title: "Události",
    icon: "\u{1F4C5}",
    sections: [
      { text: "Deník klubu: co čeká na tvoje rozhodnutí a co se klubu stalo." },
      { heading: "Rozhodnutí", text: "Zabijačka, ples, kontrola ze svazu… Na volbu máš dvě kola, pak propadne." },
      { heading: "Brzy", text: "Nejbližší akce, která tě čeká, s počtem kol do ní." },
      { heading: "Okresní akce", text: "Pouť, bál a podobně. Pozvánka přijde SMS do telefonu a odpovíš, jestli přijdeš s hráči, sám, nebo vůbec. Co se na akci stalo tvým lidem, najdeš tady a reportáž i ve Zpravodaji." },
      { heading: "Hospoda", text: "Jednou za dva herní dny můžeš vzít kluky na pivo. Celý tým zvedne náladu víc, ale stojí víc peněz i kondice. Pivo s klukem, který má nejhorší náladu, je levnější. Zákaz hospody sebere celé kabině trochu nálady." },
      { heading: "Deník", text: "Všechno, co se klubu stalo: tvoje rozhodnutí, události mezi koly (pokuty, dary, zranění) i to, co propadlo." },
    ],
  },
  "/liga": {
    title: "Ligová tabulka",
    icon: "\u{1F3C6}",
    sections: [
      { text: "Tabulka tvé ligy, klikni na klub pro jeho detail. V záložkách najdeš rozpis, výsledky a statistiky, přepínačem i ostatní soutěže okresu a minulé sezóny." },
      { heading: "Body", text: "Výhra 3 body, remíza 1, prohra 0. Při rovnosti bodů rozhodují nejdřív vzájemné zápasy těch týmů (body, pak rozdíl skóre), potom celkový rozdíl skóre a nakonec víc vstřelených gólů." },
      { heading: "Postup a sestup", text: "Kde má okres přebor i III. třídu, první dva z III. třídy postupují a poslední dva z přeboru sestupují. Tabulka je označí barevným proužkem. Postup přidá reputaci klubu 5 bodů, sestup 5 ubere." },
    ],
  },
  "/kalendar": {
    title: "Kalendář sezóny",
    icon: "\u{1F4C6}",
    sections: [
      { text: "Měsíční přehled áčka: ligové a pohárové zápasy, přáteláky a tréninky s intenzitou (L lehký, N normální, T tvrdý)." },
      { heading: "Sezóna", text: "Hraje se každý s každým doma a venku, takže 14 týmů odehraje 26 kol. Liga hraje dvakrát týdně v 18:00, většinou v pondělí a ve čtvrtek, některé soutěže v jiné dny. Mezi podzimem a jarem je zimní přestávka a od 22. 12. do 2. 1. se nehraje. Kolik dní sezóna má, ukazuje lišta nahoře." },
      { heading: "Další zápasy", text: "Pohár se hraje v sobotu v poledne. Přátelák se hraje v domluvený den v 18:00. Rezerva (U21) hraje den po áčku, její zápasy najdeš na stránce U21." },
      { text: "Kondice se hráčům vrací každou noc podle výdrže a věku, ne jen ve volné dny. Trénink ji bere, tvrdý víc než lehký. V den zápasu se netrénuje.", tip: true },
    ],
  },
  "/zapas": {
    title: "Sestava a zápas",
    icon: "⚽",
    sections: [
      { text: "Na Sestavě skládáš formaci, taktiku, tvrdost hry, jedenáctku, lavičku a pokyny na lavičce. Kdo zápas píská, vidíš tu dva dny předem." },
      { heading: "Jak funguje zápas", text: "Každou minutu se rozhodne, kdo má míč. Držení určuje rozehrávka celého týmu, hlavně přihrávky a přehled, domácí mají malou výhodu. Tým s míčem pak dostane šanci tím spíš, čím silnější je jeho útok proti obraně soupeře. Jestli z šance padne gól, rozhoduje zakončení střelce proti brankáři a obráncům. Góly padají i ze standardek a z brejků." },
      { heading: "Taktika", text: "Útočná vytvoří zhruba o pětinu víc šancí, ale obrana je o 15 % slabší. Defenzivní dá skoro o polovinu méně šancí, zato obraně přidá 15 % a přinese brejky. Držení míče přidá šance bez díry vzadu, presink přidá útoku i obraně, ale víc unaví. Plně taktika zabere, jen když na ni máš hráče a sedí k formaci." },
      { heading: "Pokyny na lavičce", text: "Předem si nastavíš až pět pravidel: když nastane určitý stav skóre, kondice nebo minuta, změní se taktika, tvrdost, nebo proběhne střídání. Střídat jde nejvýš pětkrát. Když sestavu neuložíš, postaví ji automat." },
      { heading: "Karty", text: "Žlutou dostane spíš hráč s vysokým temperamentem a nízkou disciplínou, přímou červenou riskuje hlavně agresivní. Hodně záleží na sudím: kdo rád sahá do kapsy, rozdá jich víc, a unavený sudí po 70. minutě přitvrdí. Tvrdá hra karty přidá, disciplinovaný trenér ubere. Druhá žlutá v zápase je červená. Vyloučený hned odchází a příští zápas stojí. Stopku na jeden zápas dostane hráč i za každou čtvrtou žlutou v sezóně." },
      { heading: "Zranění", text: "V každé minutě je asi jednoprocentní šance, že se někdo zraní. Riziko zvedá déšť (1,45×), sníh (1,6×), rozbitý trávník (až trojnásobek), rozmáčená nebo vyprahlá půda a tvrdá hra. Spíš se zraní hráč náchylný ke zraněním a unavený." },
      { heading: "Délka zranění", text: "Počítá se ve dnech, ne v kolech. Křeče vyřadí na 1 až 3 dny, naraženina na pár dní, natažený sval nebo podvrtnutý kotník na 4 až 10 dní, koleno na 1 až 2 týdny. Starší a náchylnější hráč má větší šanci na vážnější variantu, u kolena až 75 dní. Lékárnička zranění o den nebo dva zkrátí." },
      { text: "Unavený hráč dělá na hřišti míň, úplně vyčerpaný zhruba 85 % toho co odpočatý. Víc ale bolí únava celé sestavy: tým si vytvoří jen tolik procent šancí, kolik má průměrnou kondici, nejméně 45 %. Během zápasu kondice klesá, rychleji při nízké výdrži, presinku a tvrdé hře.", tip: true },
    ],
  },
  "/zpravodaj": {
    title: "Zpravodaj",
    icon: "\u{1F4F0}",
    sections: [
      { text: "Okresní noviny tvé soutěže. Nahoře přepneš na celý okres nebo na jinou soutěž." },
      { heading: "Kdy co vychází", text: "Ráno v den zápasu vyjde článek Před zápasem. Po odehraném kole přibudou zápasové zprávy, komentář kola, Hráč a trenér kola a Prales Ultras. Reportáž z okresní akce a článek o pohárovém kole drží první stranu tři dny." },
      { heading: "Rozhovory", text: "Když chce redaktor rozhovor, uvidíš nahoře pozvánku s termínem. Ptá se před zápasem, po zápase a na konci sezóny. Odpovědi vyjdou v novinách, u pozápasového rozhovoru hned uvidíš, co způsobily." },
      { heading: "Placená inzerce", text: "Inzerát stojí 500 Kč z rozpočtu, má nejvýš 200 znaků a visí 14 dní. Uvidí ho kluby tvé soutěže." },
    ],
  },
  "/nastaveni": {
    title: "Nastavení",
    icon: "⚙️",
    sections: [
      { heading: "Heslo", text: "Nové heslo musí mít aspoň 8 znaků, velké i malé písmeno a číslo. Po změně tě hra odhlásí na všech zařízeních a přihlásíš se novým heslem." },
      { heading: "Upozornění", text: "Zapni push notifikace a vyber, co tě má budit: výsledek zápasu, připomenutí sestavy den předem, přestupy, výzvy a události klubu. Na iPhonu jdou zapnout jen v Pralesu přidaném na plochu, postup najdeš na stránce Nainstaluj. Vypnutí platí jen pro toto zařízení." },
    ],
  },
  "/pozvat": {
    title: "Pozvi kamaráda",
    icon: "✉️",
    sections: [
      { text: "Tvůj odkaz na pozvánku je pořád stejný, stačí ho zkopírovat nebo sdílet. Kamarád uvidí tvůj klub, obec, pozici v lize a výzvu od tebe jako trenéra." },
      { heading: "Jak to funguje", text: "Kamarád klikne na Přijmout výzvu a registrace mu rovnou nabídne tvůj okres. Jeho klub převezme volné místo v nejvyšší soutěži okresu, kde ještě hraje počítač, takže nemusí skončit přímo ve tvé lize. Když je okres plný, zapíše se na čekací listinu." },
      { text: "Na mobilu použij tlačítko Sdílet a pošli odkaz přes WhatsApp, Messenger nebo jinou aplikaci.", tip: true },
    ],
  },
  "/akademie": {
    title: "Akademie",
    icon: "\u{1F392}",
    sections: [
      { text: "Družstvo žáků od 11 do 14 let z tvé obce a z okolních obcí, které vlastní akademii nemají. Každé léto jdou čtrnáctiletí do dorostu (U21) a přijde nový ročník jedenáctiletých." },
      { heading: "Trenér", text: "Bez trenéra žáci netrénují a víc jich skončí. Placený trenér mládeže je posune nejvíc a nejpřesněji odhadne talent, na dorost a mladé v áčku mu pak ale zbude jen polovina času. Hráč áčka od 28 let je zadarmo, sám ale chodí méně na trénink áčka. Táta jednoho ze žáků je zadarmo, příprava je s ním průměrná." },
      { heading: "Soutěž, úroveň a vybavení", text: "Od 9 žáků hraje družstvo okresní soutěž. S menším počtem jen trénuje, žáci rostou polovičním tempem a víc jich odejde. Úroveň akademie určuje týdenní cenu, rychlost růstu i počet odchodů. Klubové míče, pomůcky a zimní výbava zrychlí růst." },
      { heading: "Noví žáci", text: "Náborový den ve škole a den otevřených dveří stojí peníze a potřebují trenéra žáků. Šikovné žáky z klubů do 15 km můžeš lákat, nejvýš dva za sezónu. Přestoupí v létě a jejich klubu zaplatíš odstupné." },
      { heading: "Do dorostu dřív", text: "Žáka od 13 let můžeš dát do dorostu dřív, nejdřív po 4 týdnech v akademii. Registrace stojí 500 Kč. Nadějného žáka ti trenér žáků doporučí sám v SMS, nabídku pak najdeš v Přestupech." },
    ],
  },
  "/hospoda": {
    title: "Hospoda",
    icon: "\u{1F37A}",
    sections: [
      { text: "Kronika hospodských večerů: kdo z hráčů seděl u piva, co se stalo a co to stálo. Nový večer přibude s každým herním dnem. Vzít kluky do hospody sám můžeš v Událostech." },
      { heading: "Kdo jde na pivo", text: "Chodí hlavně hráči se sklonem k alkoholu, nejvíc v pátek, v sobotu a po výhře i po prohře. Den před zápasem a s nízkou kondicí jich jde méně, zranění a vyloučení nejdou vůbec. Kdo přebere, má ráno kocovinu a ztratí kondici. Když dorazí hráči jiných klubů, může se strhnout rvačka." },
      { heading: "Posezení s trenéry", text: "Pozvat můžeš jednoho až čtyři trenéry ze své ligy, znovu až za 14 dní. Rezervace stolu se platí hned, rundy jen za ty, kdo dorazí. Posezení zlepší vztahy, po třetím společném je z trenéra trvalý spojenec. Rivalové u jednoho stolu se můžou pohádat." },
      { heading: "Runda pro hospodu", text: "Po vyhraném zápase můžeš koupit pivo všem štamgastům, za jednu výhru jednou. Kabině stoupne morálka, fanouškům spokojenost a obci přízeň." },
      { heading: "Někdo z radnice", text: "Občas u baru sedí starosta nebo zastupitel. Pozvat ho na pivo stojí pár stovek a zvedne jeho přízeň, výjimečně se ale večer zvrtne ve skandál." },
    ],
  },
  "/pohar": {
    title: "Pohár",
    icon: "\u{1F3C5}",
    sections: [
      { text: "Pohár hraje vyřazovacím systémem každé áčko ze všech soutěží, lidské i AI kluby. Kdo prohraje, končí. Kola jsou rozložená přes sezónu, finále se hraje na konci ligy." },
      { heading: "Los a termíny", text: "Dvojice určuje los, ne síla. Když do pavouka chybí týmy, dostanou některé kluby volný postup do 2. kola. Pohár se hraje v sobotu v poledne. O losu ti přijde SMS." },
      { heading: "Zápas", text: "Sestavu nastavíš jako u ligy. Když ji nenastavíš, hraje poslední uložená. Při remíze se hned kopou penalty. Únava a zranění z poháru platí i v lize a červená karta znamená stopku." },
      { heading: "Odměny", text: "Za každé vyhrané kolo dostaneš odměnu, částky vidíš nahoře na stránce. Od osmifinále přidá postup i reputaci klubu a trenéra. Domácí bere vstupné a tržby z bufetu jako v lize." },
    ],
  },
  "/pratelaky": {
    title: "Přáteláky",
    icon: "\u{1F91C}",
    sections: [
      { text: "Přátelák domluvíš dvěma způsoby: vyzveš konkrétní klub, nebo nabídneš volný termín, který si vezme kdokoli. Hraje se v 18:00, nejvýš 14 dní dopředu. Sestavu nastavíš v den zápasu." },
      { heading: "Kdy se hrát nedá", text: "V den ligy, poháru nebo turnaje se přátelák nehraje a mezi dvěma přáteláky musí být aspoň 3 dny. Když na domluvený den padne soutěžní zápas, přátelák se zruší a sázka se vrátí. Výzva i nabídka termínu propadne, když její den projde." },
      { heading: "Místo a náklady", text: "Domácí má výhodu hřiště a bere vstupné i bufet. Hostitel platí rozhodčího a host cestovné, na neutrálním hřišti se rozhodčí i pronájem dělí napůl a vstupné se nevybírá. Můžeš nabídnout, že zaplatíš za oba." },
      { heading: "Hra o peníze", text: "Sázku složíte oba ve chvíli, kdy soupeř kývne. Vítěz bere obě, při remíze se vracejí. Kolik nejvýš, určují pravidla soutěže. Kluby se stejným majitelem spolu hrají jen bez sázky." },
      { heading: "Co přátelák dá", text: "Hráči se sehrají a naberou trochu zkušeností, méně než v soutěži. Unaví se a můžou se zranit stejně jako v lize. Na přátelák se hráči omlouvají častěji a odměny za výsledek se nevyplácejí." },
    ],
  },
  "/u21": {
    title: "Dorost (U21)",
    icon: "\u{1F9D2}",
    sections: [
      { text: "Dorost klubu hraje vlastní soutěž U21, každé kolo den po kole áčka. Sestavu dorostu skládá hra sama a trénuje se podle tréninkového plánu áčka. Mzdy dorostenců platí klub." },
      { heading: "Z áčka do U21", text: "Hráče do 21 let pošleš do U21 trvale, nebo jen na jeden zápas, po kterém se sám vrátí do áčka. Hráč se stopkou do dorostu nesmí, dokud si ji neodpyká. Hostujícího hráče jde poslat jen trvale." },
      { heading: "Z U21 do áčka", text: "Dorostence povoláš do áčka natrvalo. Za muže smí nastoupit až od 15 let." },
      { heading: "Konec sezóny", text: "Kdo dosáhne 22 let, odchází z dorostu do áčka. Když pak dorostu chybí hráči, doplní se novými šestnáctiletými. Kdo má akademii, dostane sem v létě i její čtrnáctileté." },
      { heading: "Rozvoj", text: "Záložka Rozvoj ukazuje, kdo z kluků má na áčko a za jak dlouho. Odhad stropu uvidíš, jen když máš v Zaměstnancích skauta." },
    ],
  },
  "/manazer/": {
    title: "Profil trenéra",
    icon: "\u{1F454}",
    sections: [
      { text: "Vlastnosti, licence, vztahy a historie trenéra. Na svém profilu máš navíc záložku Kabina a nabídku kurzů. Trenérovi jiného klubu můžeš odsud napsat SMS, pokud klub nevede počítač." },
      { heading: "Vlastnosti a licence", text: "Koučink, motivace, taktika, práce s mládeží a disciplína se mění zápasy, kurzy a událostmi. Růst zastaví strop licence: bez licence 60, licence C 70, UEFA B 80, UEFA A 90, UEFA Pro 99. Reputace strop licence nemá, drží se mezi 15 a 75." },
      { heading: "Trenérská škola", text: "Kurzy najdeš v záložce Vzdělání. Základní kurz přidá vlastnosti 3 body a trvá 7 dní. Pokročilý přidá 5 bodů, trvá 14 dní a otevře se od licence UEFA B. Za sezónu stihneš nejvýš 3 kurzy vlastností a 1 licenční. Licenční kurz chce reputaci (UEFA B 35, UEFA A 50, UEFA Pro 65) a nová licence přidá 2 body reputace." },
      { heading: "Průběh kurzu", text: "Během kurzu chybíš na tréninku, vede ho asistent, a když ho nemáš, někdo z výboru. Po kurzu tě čeká test ze skript a máš na něj 14 dní. Když nevyjde, zbývá jeden opravný termín za pětinu ceny, po druhém neúspěchu kurz propadá i s penězi." },
      { heading: "Kabina a trenéři", text: "Kabina ukazuje, jak tě berou vlastní hráči. Vztah hýbou zprávy v Telefonu, nominace, odmítnuté přestupy, incidenty i hospoda. Kdo tě nemá rád, snáz kývne na přestup jinam. Záložka Trenéři ukazuje respekt a napětí s ostatními trenéry. Od napětí 60 je z vašeho zápasu derby." },
    ],
  },
  "/zamestnanci": {
    title: "Zaměstnanci",
    icon: "\u{1F4BC}",
    sections: [
      { text: "Realizační tým klubu. Každý zaměstnanec dává trvalý bonus podle své role. Na každou roli máš jedno místo, skautů můžeš mít dva až pět podle licence trenéra." },
      { heading: "Efektivita", text: "Zaměstnanec má sedm atributů od 1 do 20. Efektivita v roli se počítá z klíčového atributu, který má dvojnásobnou váhu, a z důležitého atributu. Rozhodují atributy, ne profese." },
      { heading: "Nábor a propuštění", text: "Volní lidé jsou společní pro celý okres, kdo dřív najme, ten má. Při náboru platíš podpisné, pak týdenní mzdu. Kdo má některý atribut 13 a víc, chce trenéra aspoň s licencí C, od 16 s UEFA B a od 18 s UEFA A. Propuštění je zdarma, rozběhnutý kurz ale propadne." },
      { heading: "Úkoly a kurzy", text: "Zaměstnanci můžeš zadat úkol: přípravu na nejbližší ligový zápas, nebo delší práci, většinou s jedním hráčem. Najednou dělá jen jeden úkol a po zápasovém má týden oddech. Zrušený úkol vrátí peníze, jen dokud se na něm nezačalo pracovat. Kurz zvedne jeden atribut o 3 body, nejvýš na 20." },
      { text: "Úkoly pro skauta zadáváš na samostatné stránce, vede na ni tlačítko Úkol a hlášení.", tip: true },
    ],
  },
  "/zamestnanci/skaut": {
    title: "Skaut",
    icon: "\u{1F50D}",
    sections: [
      { text: "Úkoly pro skauty a jejich hlášení. Každý skaut má jeden hlavní úkol a k tomu může sledovat konkrétní hráče. Čím lepší skaut, tím přesněji hráče odhadne." },
      { heading: "Hledání hráčů", text: "Při oblastním hledání zadáš posty, věk a okruh a skaut každý týden pošle nejvýš jedno hlášení. Větší okruh znamená víc klubů, ale dražší cestovné. Cestovné se strhává v pondělí, i když skaut nikoho nenajde." },
      { heading: "Rozbor soupeře", text: "Za 500 Kč skaut během dvou dnů rozebere soupeře z ligy. Rozbor dá týmu v ligovém zápase proti němu bonus k technice a morálce a platí 14 dní. Na pohár a přáteláky neplatí." },
      { heading: "Hlášení", text: "Chodí SMS do Telefonu a najdeš je tady. Každé platí jen omezenou dobu a hráče ti mezitím může sebrat jiný klub. Opakovaná návštěva zpřesní odhad a prodlouží platnost." },
      { text: "Sledování konkrétního hráče zadáš tlačítkem Poslat skauta na jeho profilu. Cestovné 500 Kč zaplatíš, až hlášení dorazí.", tip: true },
    ],
  },
  "/obec": {
    title: "Obec",
    icon: "\u{1F3E1}",
    sections: [
      { text: "Vztah klubu s radnicí. Přízeň obce od 0 do 100 rozhoduje o dotaci: při nule dostaneš polovinu, při stovce jeden a půl násobek. Záložka Obce okresu ukazuje mapu a profily ostatních obcí." },
      { heading: "Zastupitelstvo", text: "Starosta, místostarosta a dva zastupitelé. Každý má svou povahu a svůj vztah ke klubu. Když v obci hraje víc klubů, o přízeň se přetahujete." },
      { heading: "Jak přízeň získat", text: "Brigády vyhlašuje obec v pondělí, pošleš na ně 3 až 7 hráčů a ti ztratí kondici. Zastupitele můžeš pozvat na zápas, dárek platíš, i když nepřijde. Petici občanů vyhovíš za peníze, když ji přejdeš, přízeň klesne. V hospodě tě občas čeká zastupitel, pivo vás většinou sblíží." },
      { heading: "Místní hrdost", text: "Obec fandí hráčům, kteří v ní bydlí. Hattrick nebo hráč zápasu z místních v domácím zápase přízeň zvedne." },
      { text: "Při vysoké přízni nabídne obec spolufinancování modernizace stadionu. Pod 20 se obrátí proti klubu a stojí to peníze i morálku. Na konci sezóny jsou volby, vedení se vymění a přízeň všech klubů začne znovu na 50.", tip: true },
    ],
  },
  "/rozhodci": {
    title: "Rozhodčí",
    icon: "\u{1F7E8}",
    sections: [
      { text: "Komise rozhodčích tvého okresu seřazená podle průměrné známky v sezóně, nejlepší nahoře. Klikni na sudího pro jeho profil." },
      { heading: "Známka", text: "Za každý zápas dostane sudí známku jako ve škole, 1 je nejlepší a 5 nejhorší. Zhorší ji sporná situace, karty rozdávané po kapsách nebo zápas, který nechal rozjet. Zkušeným sudím vychází líp." },
      { heading: "Delegace a povaha", text: "Kdo bude pískat, uvidíš dva dny před zápasem na stránce Sestava i s radou, na co si dát pozor. Profil ukazuje povahu sudího: přísnost, karty, zkušenost, vliv domácího kotle, pouštění výhody a kondici." },
      { heading: "Co si o vás myslí", text: "Sudí si pamatuje, co o něm řekneš v pozápasovém rozhovoru. Kritika potěší kabinu i fanoušky, ale sudí si ji zapamatuje a komise může dát pokutu. Když se ho zastaneš, má vás radši. Paměť posune hraniční verdikty jen málo." },
      { heading: "Disciplinárka", text: "Pokuty klubů okresu. Komise trestá výroky o rozhodčích a výši pokuty si může odhlasovat soutěž. Svaz trestá administrativu kolem zápasu." },
    ],
  },
  "/soutez": {
    title: "Grémium soutěže",
    icon: "\u{1F3DB}\u{FE0F}",
    sections: [
      { text: "Samospráva soutěže. Kluby s trenérem tu hlasují o odměnách, startovném, pokutách, pravidlech i rozhodčích. Seniorské soutěže jednoho okresu mají grémium společné, pokladnu má každá soutěž svou." },
      { heading: "Návrhy a kauce", text: "V každém odboru můžeš mít rozjednaný jen jeden návrh, funkcionář limit nemá. Za podání složíš kauci 500 Kč a vrátí se jen tehdy, když návrh projde. Návrh, po kterém by pokladně chyběly peníze, podat nejde. Formulář u návrhu napíše, odkdy změna platí." },
      { heading: "Zasedání a hlasování", text: "Grémium zasedá každou středu, hlas můžeš měnit až do začátku zasedání. Usnesení platí, když hlasuje aspoň polovina aktivních klubů, nejméně tři. Kdo se zdrží, počítá se do účasti, ne do většiny. Obvykle stačí víc hlasů pro než proti, při rovnosti rozhodne prezident. Pravidla, pokuty, vyškrtnutí rozhodčího, odvolání funkcionáře a sponzor potřebují dvě třetiny." },
      { heading: "Vedení a volby", text: "Funkcionáři se volí tajně do konce sezóny, při rovnosti hlasů vyhraje vyšší reputace trenéra. Od devíti klubů s trenérem má grémium pět funkcí, menší soutěž jen prezidenta a generálního sekretáře. Odsloužený mandát přidá trenérovi reputaci, odvolání ji vezme." },
      { heading: "Pokuty", text: "Pokutu jde navrhnout jen za skutek doložitelný z dat, bez důkazu jen za nesportovní chování a manipulaci se sázkami. Od grémia dostane klub nejvýš dvě pokuty za sezónu. O pokutě pro svůj klub nehlasuješ, můžeš napsat obhajobu a zdarma se odvolat." },
    ],
  },
  "/salovka": {
    title: "Vánoční sálovka",
    icon: "\u{1F945}",
    sections: [
      { text: "Halový turnaj okresu mezi svátky: malá kopaná 5+1, 2 × 10 minut, od 9:00 na dvou hřištích. Pozvánka přijde začátkem prosince do Telefonu od haly, přihlásíš se odpovědí. Startovné se strhne při losu den po uzávěrce." },
      { heading: "Soupiska", text: "Vyber šest až deset hráčů, nejlepší brankář jde do branky a pět do pole. Měnit ji můžeš do prvního výkopu. Když nevybereš nikoho, pojedou nejlepší zdraví." },
      { heading: "Bank a následky", text: "Celé startovné si rozdělí první tři: 50, 30 a 20 %. Vítěz dostane pohár do vitríny a o turnaji vyjde článek ve Zpravodaji. Zranění, karty ani únava ze sálovky se do ligy nepočítají." },
    ],
  },
  "/turnaj": {
    title: "Turnaj",
    icon: "\u{26BD}",
    sections: [
      { text: "Turnaj klubů z různých okresů. Přihlásit se může jen A-tým vedený trenérem, přihlášku jde zrušit do uzávěrky. Po losu přijde každému klubu SMS s rozpisem. Formát a odměny najdeš v propozicích." },
      { heading: "Zápasy", text: "Hraje se na neutrálních hřištích bez výhody domácích. Sestavu nastavíš na stránce Sestava, jinak nastoupí poslední uložená. Kondice klesá jako v lize, vyplatí se střídat celý kádr." },
      { heading: "Co si odvezeš do ligy", text: "Zranění z turnaje platí i v lize. Karty zůstávají v turnaji: za červenou stojí hráč jeden turnajový zápas a ligové stopky se v turnaji nepočítají. Za odehrané minuty hráči sbírají zkušenosti jako v poháru." },
    ],
  },
  "/hlasovani": {
    title: "Sněm Pralesu",
    icon: "\u{1F5F3}\u{FE0F}",
    sections: [
      { text: "Hlasování všech trenérů o celé hře. Otázky vypisuje a uzavírá správa hry, odpovídá se ANO, nebo NE." },
      { heading: "Jak se hlasuje", text: "Každý klub má jeden hlas a odevzdaný hlas už nejde změnit. Hlasování je veřejné, u otázky vidíš, kdo byl pro a kdo proti." },
      { text: "Sněm není grémium. O odměnách, pokutách a pravidlech tvé soutěže se hlasuje v Grémiu.", tip: true },
    ],
  },
  "/incidenty": {
    title: "Incidenty v klubu",
    icon: "\u{1F6A8}",
    sections: [
      { text: "Krádeže, poškození, průšvihy hráčů, životní situace v kádru i dobré zprávy. U incidentů rozhoduješ do lhůty napsané u incidentu, jinak se uzavře sám. Rozbité zařízení nefunguje, dokud ho tady neopravíš." },
      { heading: "Vyšetřování", text: "Hráčů se můžeš přes SMS zeptat, co viděli. Kamarád pachatele ho spíš bude krýt, rival spíš práskne. Obvinit můžeš nejvýš dva hráče, nevinný vždycky zapírá a obvinění ho urazí. Policii zavoláš jen jednou, výsledek přijde za tři až sedm dní a se stopami má větší šanci." },
      { heading: "Trest", text: "Když pachatele znáš, vybereš trest: odpustit, nechat to být, srážku ze mzdy na čtyři týdny, pokutu, vyřazení na jedno až tři ligová kola, předání policii, nebo vyhazov." },
      { heading: "Životní situace", text: "Dluhy, rozvod, ztráta práce, zabavený řidičák nebo narození dítěte mění docházku na trénink i na zápas. Hráči v dluzích můžeš půjčit zálohu, splácí ji čtyřmi srážkami ze mzdy. Odmítnutí mu zkazí náladu i vztah k tobě." },
      { text: "Když hráč v hospodě vyhrožoval, promluv si s ním přes SMS. Čím lepší má k tobě vztah, tím spíš poslechne.", tip: true },
    ],
  },
  "/redakce/": {
    title: "Redaktor Zpravodaje",
    icon: "\u{270D}\u{FE0F}",
    sections: [
      { text: "Profil redaktora okresního Zpravodaje: jak píše, jak se dívá na kluby a co naposledy napsal." },
      { heading: "Vztah ke klubu", text: "Vztah se hýbe podle toho, co redaktorovi řekneš v rozhovorech a co mu napíšeš v Sockách. Podle něj pak o klubu píše hezky, nebo kriticky. Silně nakloněný redaktor klubu přidá trochu reputace a fanoušků, nepřátelský je ubere." },
    ],
  },
  "/rozpis": {
    title: "Rozpis zápasů",
    icon: "\u{1F4C5}",
    sections: [
      { text: "Všechny zápasy tvého týmu v sezóně: liga, pohár, přáteláky i turnaj. Nadcházející zápas otevře Sestavu, odehraný jeho detail. Záložka Celá liga ukazuje všechna kola soutěže." },
      { heading: "Stav sestavy", text: "Sestava ✓ znamená uloženou sestavu na zápas. Výchozí sestava znamená, že nastoupí poslední uložená. U přáteláku se sestava otevře až v den zápasu." },
      { heading: "Propagace", text: "Nejbližší domácí zápas v lize nebo poháru můžeš propagovat. Vyjde o něm článek ve Zpravodaji a přijde víc diváků. Stojí 500 Kč na vesnici, 1 000 Kč v obci, 1 500 Kč v městysu a 2 500 Kč ve městě." },
    ],
  },
  "/muj-klub": {
    title: "Klubový web",
    icon: "\u{1F310}",
    sections: [
      { text: "Veřejný web klubu na adrese prales.fun/klub/… Uvidí ho fanoušci, soupeři i lidé bez účtu. Počítadlo ukazuje návštěvy cizích lidí, tvoje se nepočítají." },
      { heading: "Adresa a prohlášení", text: "Adresu webu si můžeš změnit, stará pak dál přesměruje na novou. Oficiální prohlášení vedení napíšeš jen s modulem Tiskový mluvčí." },
      { heading: "Šablony a doplňky", text: "Základní šablona je zdarma, lepší si koupíš z rozpočtu a mezi zakoupenými pak přepínáš zdarma. Sponzorská lišta ukáže partnery klubu a dokud je zapnutá, partneři z bannerů a stadionu platí o 5 % víc. Audio modul pustí návštěvníkům hymnu a chorály." },
      { heading: "Klubová data", text: "Identita, stadion, dres, hymna a maskot se propisují na web. Zkratku v názvu (FK, SK…) změníš zdarma jednou za sezónu. Název stadionu nejde měnit, když ho určuje sponzor." },
    ],
  },
  "/muj-klub/hymna": {
    title: "Klubová hymna",
    icon: "\u{1F3B5}",
    sections: [
      { text: "Napíšeš nebo si necháš navrhnout text, vybereš styl hudby a hra hymnu nazpívá. Hotová hymna chvíli trvá. Vybranou hymnu najdeš na klubovém webu." },
      { text: "Na hymnu máš jen 3 pokusy za celou dobu klubu. Neobnovují se a smazání hymny pokus nevrátí.", tip: true },
    ],
  },
  "/muj-klub/maskot": {
    title: "Klubový maskot",
    icon: "\u{1F43B}",
    sections: [
      { text: "Zadáš jméno, druh a styl a hra maskota nakreslí. Z vytvořených vybereš jednoho a můžeš mu nechat napsat krátký příběh. Vybraný maskot se ukáže na klubovém webu." },
      { text: "Na maskota máš jen 3 pokusy za celou dobu klubu. Neobnovují se a smazání maskota pokus nevrátí.", tip: true },
    ],
  },
  "/sin-slavy": {
    title: "Síň slávy",
    icon: "\u{1F3C6}",
    sections: [
      { text: "Žebříček klubů podle úspěchů. Rozhodují nejdřív zlaté, při shodě stříbrné a pak bronzové." },
    ],
  },
  "/sponzor/[id]": {
    title: "Firma a majitel",
    icon: "\u{1F3E2}",
    sections: [
      { text: "Firma z tvého okresu a její majitel. Tady s ním jednáš o smlouvě, zveš ho na zápas a přes Napsat SMS ho můžeš poprosit o peníze." },
      { heading: "Náklonnost", text: "Jak moc majitel fandí tvému klubu, od 0 do 100, na začátku 40. Zvedá ji přijaté pozvání, pivo, vlídná odpověď na jeho SMS, sezóna jako hlavní sponzor a splněné sliby. Sráží ji výtržnosti fanoušků, odbytá nebo žádná odpověď, urážlivý návrh a porušené sliby. Čím vyšší, tím víc firma dá." },
      { heading: "Pozvání na zápas", text: "Zvát jde jen na nejbližší domácí zápas. Dárek stojí nejméně 300 Kč, s lepším vztahem méně, a platíš ho, i když majitel odmítne. Když přijde, náklonnost stoupne a po zápase se pohne podle výsledku. VIP lóže zvyšuje šanci, že přijde." },
      { heading: "Hlavní sponzor a stadion", text: "Hlavním sponzorem je firma jen u jednoho klubu, název stadionu může dát víc klubům. Hlavního sponzora jde změnit jednou za sezónu, smlouvu prodloužit až v její poslední sezóně." },
      { heading: "Prosba o peníze", text: "Pod náklonností 30 firma nedá nic, bez smlouvy až od 80. Peníze musíš do 30 dní utratit na slíbený účel, jinak se naštve a do konce sezóny nedá nic. Kdo prosí znovu dřív než za 14 dní, otravuje." },
    ],
  },
  "/sponzor/[id]/jednani": {
    title: "Jednání se sponzorem",
    icon: "\u{1F4BC}",
    sections: [
      { text: "Majitel začne vlastní nabídkou. Můžeš ji podepsat, nebo upravit sliby a požadavky a navrhnout. Odpovídá hned: přijme, pošle protinabídku, nebo odmítne. Podepisuje se vždy to, na čem jste se naposledy shodli." },
      { heading: "Ochota a cena", text: "Jednorázové částky se rozpočítají na délku smlouvy. Do ochoty majitel přijme, kousek nad ní obvykle pošle protinabídku, výš odmítne. Když chceš o polovinu víc, urazí se a náklonnost klesne." },
      { heading: "Sliby", text: "Sliby zvednou ochotu, ale jen do stropu, přání majitele mají větší cenu. Sezónní sliby platí až od příští sezóny. Za nesplněný slib je pokuta. Po dvou porušeních v sezóně, nebo po nesplněném postupu či záchraně, sponzor smlouvu vypoví." },
      { heading: "Trpělivost", text: "Odmítnutí ubere jeden pokus, protinabídka ne. Pokusů máš 2 až 6 podle náklonnosti. Když dojdou, majitel odejde, náklonnost klesne a 14 dní s tebou nejedná. Jednání platí 7 dní, když ho ukončíš sám, nic se nestane." },
      { text: "Nový hlavní sponzor dá klubu svoje jméno a stojí to 3 body reputace.", tip: true },
    ],
  },
  "/prestupy/jednani/[id]": {
    title: "Jednání s cizím klubem",
    icon: "\u{1F91D}",
    sections: [
      { text: "Smlouváš o hráči z klubu, který ve hře nehraje. Předseda odpoví hned: souhlasí, pošle protinávrh, nebo jednání ukončí. Až klub souhlasí, podepíšeš a pak se rozhodne hráč." },
      { heading: "Trpělivost", text: "Moc nízká nabídka nebo stejné číslo jako minule ubírá trpělivost. Když dojde, nebo ani šestý návrh nedosáhne jeho ceny, klub jednání ukončí a 14 dní se s tebou o hráči nebaví." },
      { heading: "Splátky", text: "Záloha aspoň 10 %, 2 až 20 týdenních splátek po aspoň 500 Kč, nejvýš 3 hráči na splátky najednou. Splátky nesmí přesáhnout týdenní příjem klubu. Splátky má klub v menší ceně než hotovost." },
      { heading: "Podpis", text: "Souhlas klubu platí 48 hodin. Hráč se pak rozhoduje podle reputace klubu, trenéra, dojíždění, kádru, platu a patriotismu. Kádr může mít nejvýš 30 hráčů." },
    ],
  },
  "/prestupy/nabidka/[id]": {
    title: "Jednání o přestupu",
    icon: "\u{1F4E8}",
    sections: [
      { text: "Jednání s klubem ve hře o přestup nebo hostování. Strany se střídají a přijmout, poslat protinávrh nebo odmítnout může jen ten, kdo je na tahu. Druhá strana se o tahu dozví SMS." },
      { heading: "Lhůta", text: "Na odpověď máš 3 dny od posledního tahu, pak nabídka propadne." },
      { heading: "Zájem hráče", text: "Když prodávající odmítne hráče, který chce odejít, spadne mu nálada. Po odmítnutí jde na stejného hráče nabídnout znovu až za 10 dní." },
      { heading: "Podmínky", text: "U trvalého přestupu jde sjednat zálohu, 2 až 20 splátek a procenta z příštího prodeje (nejvýš 50 %). Kupující může přidat až 2 své hráče na výměnu. Při přestupu z jiné soutěže platí kupující meziligový poplatek podle pravidel soutěže." },
    ],
  },
  "/prestupy/hostovani/[id]": {
    title: "Hostování hráče",
    icon: "\u{1F501}",
    sections: [
      { text: "Přehled jednoho hostování: jak hráč hraje, trénuje a zlepšuje se. Vidí ho oba kluby." },
      { heading: "Podmínka hraní", text: "V základu znamená začít zhruba ve třech čtvrtinách zápasů, pravidelně nastoupit zhruba v polovině. Zápasy, kdy hráč chyběl, se nepočítají. Hodnotí se od 3. zápasu a hostující klub dostane SMS, když mu hrozí porušení." },
      { heading: "Stažení zpátky", text: "Půjčující klub může hráče stáhnout kdykoli. Když hostující klub podmínku neporušil, vrátí mu poměrnou část poplatku, když ji porušil, poplatek zůstává." },
    ],
  },
};

function findHelp(pathname: string): HelpEntry | null {
  if (HELP[pathname]) return HELP[pathname];
  if (pathname.startsWith("/onboarding")) return null;
  if (pathname.startsWith("/manazer/")) return HELP["/manazer/"];
  if (pathname.startsWith("/rozhodci/")) return HELP["/rozhodci"];
  if (pathname.startsWith("/redakce/")) return HELP["/redakce/"];
  if (pathname.startsWith("/muj-klub/")) return HELP["/muj-klub"];
  if (/^\/sponzor\/[^/]+\/jednani\/?$/.test(pathname)) return HELP["/sponzor/[id]/jednani"];
  if (/^\/sponzor\/[^/]+\/?$/.test(pathname)) return HELP["/sponzor/[id]"];
  if (/^\/prestupy\/jednani\/[^/]+\/?$/.test(pathname)) return HELP["/prestupy/jednani/[id]"];
  if (/^\/prestupy\/nabidka\/[^/]+\/?$/.test(pathname)) return HELP["/prestupy/nabidka/[id]"];
  if (/^\/prestupy\/hostovani\/[^/]+\/?$/.test(pathname)) return HELP["/prestupy/hostovani/[id]"];
  // 3D náhled stadionu cizího klubu: profil týmu by tu jen mátl.
  if (/^\/tym\/[^/]+\/stadion\/?$/.test(pathname)) return null;
  if (pathname.startsWith("/hrac/")) return {
    title: "Profil hráče",
    icon: "\u{1F464}",
    sections: [
      { text: "Karta hráče má záložky Přehled, Statistiky, Historie, Účast (jen u tvých hráčů) a Vztahy. Z hlavičky svému hráči napíšeš SMS, dáš ho na trh nebo na hostování, nebo ho propustíš. Cizímu hráči pošleš nabídku, skauta nebo si ho dáš mezi sledované." },
      { heading: "Dovednosti", text: "Deset dovedností: rychlost, technika, střelba, přihrávky, hlavičky, obrana, přehled, zkušenost, kreativita a standardky. Brankář má navíc dovednost Brankář. Fyzické jsou výdrž, síla a náchylnost ke zranění. Zvýrazněné nejvíc rozhodují o hodnocení na jeho postu. Dovednosti rostou tréninkem a odehranými minutami, nejvýš ke stropu, který hráč má. Nad 50 bodů jde růst čím dál pomaleji." },
      { heading: "Potenciál", text: "Kam až hráč může dojít, se nikdy neukáže přesně. Skaut odhadne pásmo, a čím je lepší, tím je pásmo užší. Bez skauta potenciál ani tempo učení neuvidíš." },
      { heading: "Postava", text: "Výška pomáhá hlavičkám a brankáři. Nadváha ubírá rychlost a výdrž, hmotnost přidá sílu, podváha sílu ubere. Upravené hodnoty vidíš rovnou u dovedností." },
      { heading: "Osobnost", text: "Disciplína: docházka na trénink, omluvenky ze zápasu a karty. Věrnost: s nízkou hráč snáz chybí, a když má k tomu mizernou morálku, může s fotbalem skončit. Temperament a agresivita: fauly a karty. Alkoholismus: nad 70 chodí hráč méně na trénink a častěji se omlouvá, už od 50 se v zápase rychleji unaví. Pracovitost: kolik tréninků v týdnu snese. Vůdcovství: veterán s vysokým vůdcovstvím táhne na tréninku mladé." },
      { heading: "Životní kontext", text: "Povolání určuje, jak často hráč chybí. Směnaři a lidé s častými přesčasy, třeba řidič kamionu, chodí na trénink méně a víc se omlouvají ze zápasu. Dojíždění ubere 0,8 % šance na trénink za každý kilometr, nejvýš 22 %, a přidá i omluvenky ze zápasu. Hýbou tím i životní situace, třeba ztráta práce, rozvod nebo dluhy." },
      { heading: "Vztahy", text: "Záložka Vztahy ukazuje, co jsi hráči slíbil, jak tě bere a s kým v kádru drží, třeba bratry, kamarády z hospody nebo rivaly." },
      { text: "Šipky v hlavičce hráče přepínají dokola mezi hráči týmu, ve kterém hraje. U hráče z U21 tedy mezi hráči U21.", tip: true },
      { text: "U cizího hráče vidíš dovednosti a osobnost zaokrouhlené na pětky. Přesná čísla zná jen jeho klub.", tip: true },
    ],
  };
  if (pathname.startsWith("/tym/")) return {
    title: "Profil týmu",
    icon: "\u{1F3DF}️",
    sections: [
      { text: "Detail týmu, kádr, výsledky, statistiky. Klikni na hráče pro jeho profil." },
      { heading: "Cizí hráči", text: "U hráčů cizích týmů vidíš dovednosti, postavu i povahu zaokrouhlené na pětky a kondici s morálkou na desítky. Potenciál a plat nevidíš. Přesné hodnoty uvidíš až u hráče ve svém klubu. Odhad potenciálu ti přinese skaut, nebo ho odkryje prodávající v inzerátu." },
    ],
  };
  if (pathname.match(/\/zapas\/[^/]+$/)) return {
    title: "Detail zápasu",
    icon: "⚽",
    sections: [
      { text: "Výsledek, statistiky, sestavy obou týmů, hodnocení hráčů, omluvenky a záznam průběhu." },
      ...HELP["/zapas"].sections.slice(1),
    ],
  };
  if (pathname.includes("/zaznam")) return {
    title: "Přehrání zápasu",
    icon: "▶️",
    sections: [
      { text: "Animovaný záznam zápasu: hřiště, komentář a průběžné statistiky střel, faulů a karet. Rychlost přepínáš Živě, Rychle nebo Konec, o poločase se záznam zastaví." },
      { heading: "Průběh", text: "Každá minuta se simuluje zvlášť: kdo má míč, šance, standardky, fauly, karty, zranění a střídání. O poločase si hráči na hřišti odpočinou o 5 bodů kondice." },
      { text: "Od 75. minuty, když je skóre těsné (rozdíl nejvýš jeden gól), rozhoduje u zakončení i klid: vlastnost Pod tlakem spolu se zkušeností. Chladnokrevný zkušený hráč pak trefuje až o desetinu líp, nervák o desetinu hůř. U penalt je rozdíl ještě větší.", tip: true },
    ],
  };
  // Skrýt nápovědu v detailu konverzace — překrývá input na mobilu
  if (pathname.match(/\/telefon\/.+/)) return null;
  return null;
}

// ── Shared UI components ───────────────────────────────────

function HelpPanel({ help, onClose }: { help: HelpEntry; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      {/* Na mobilu spodní plachta, na desktopu panel pod horní lištou —
          tam, kde tlačítko nově je. Dřív visel v pravém dolním rohu
          u plovoucího kolečka.
          Odstup odspodu bere skutečnou výšku spodní lišty (`--bottom-nav-h`
          publikuje BottomNav i se safe area). Pevných 5,5 rem sedělo na starou
          48px lištu; vyšší lišta s čárkou iPhonu (93 px) spodek panelu překryla.
          Bez lišty (onboarding) zůstává původních 5,5 rem. */}
      <div className="fixed bottom-[calc(var(--bottom-nav-h,4.75rem)+0.75rem)] sm:bottom-auto sm:top-16 left-3 right-3 sm:left-auto sm:right-4 z-[var(--z-nav)] sm:w-[360px] max-h-[55vh] sm:max-h-[70vh] overflow-y-auto overscroll-contain rounded-xl bg-white shadow-2xl border border-gray-100 animate-slide-up">
        <div className="sticky top-0 bg-pitch-700 text-white px-5 py-3 rounded-t-xl flex items-center gap-3">
          <span className="text-xl">{help.icon}</span>
          <span className="font-heading font-bold text-base">{help.title}</span>
        </div>
        <div className="px-5 py-4 space-y-3">
          {help.sections.map((s, i) => (
            <div key={i} className={s.tip ? "bg-pitch-50 border border-pitch-200 rounded-soft px-3 py-2" : ""}>
              {s.heading && (
                <h4 className="font-heading font-bold text-sm text-pitch-700 mb-0.5">{s.heading}</h4>
              )}
              <p className={`text-sm leading-relaxed ${s.tip ? "text-pitch-800" : "text-gray-700"}`}>
                {s.tip && "\u{1F4A1} "}
                {s.text}
              </p>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
          Klepni kamkoli mimo a nápověda se zavře
        </div>
      </div>
    </>
  );
}

/**
 * Tlačítko nápovědy.
 *
 * `bar` — sedí v horní liště. Plovoucí kolečko v pravém dolním rohu
 * překrývalo pravý okraj obsahu (ve Financích zakrývalo částku u „Dotace
 * obce") a překrývalo by ho i po ztlumení při scrollu, protože v klidu
 * je vidět. V liště nepřekáží nikdy a je stejně po ruce.
 *
 * `floating` — zůstává pro onboarding, kde horní lišta není.
 */
function HelpButton({
  open,
  onClick,
  variant = "floating",
  className,
  label,
  buttonRef,
}: {
  open: boolean;
  onClick: () => void;
  variant?: "bar" | "floating";
  className?: string;
  /** Popisek zavřeného tlačítka; v liště otevírá menu, ne rovnou nápovědu. */
  label?: string;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const spolecne = "flex items-center justify-center font-heading font-bold rounded-full transition-colors";
  const styl =
    variant === "bar"
      // V liště jen tenký kroužek u názvu stránky: plné světlé kolo se s názvem
      // tlouklo. Plocha pro prst zůstává 36 × 44 px, kroužek kreslí vnitřní span.
      ? "group w-9 h-11 -ml-1 text-xs text-white/80 hover:text-white shrink-0"
      : `fixed z-[var(--z-nav)] w-11 h-11 text-lg bg-pitch-700 text-white shadow-lg hover:bg-pitch-600 ${className ?? "bottom-24 sm:bottom-6 right-4"}`;
  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      className={`${spolecne} ${styl}`}
      title={open ? "Zavřít" : (label ?? "Nápověda")}
      aria-label={open ? "Zavřít" : (label ?? "Nápověda")}
      aria-expanded={open}
    >
      {variant === "bar" ? (
        <span className="flex items-center justify-center w-[22px] h-[22px] rounded-full border-[1.5px] border-white/55 group-hover:border-white transition-colors">
          {open ? "✕" : "?"}
        </span>
      ) : open ? "✕" : "?"}
    </button>
  );
}

// ── Exports ────────────────────────────────────────────────

/**
 * Kroužek v horní liště. Otevírá menu s nápovědou ke stránce a nahlášením chyby,
 * proto je na každé stránce, i kde nápověda není (menu pak nabídne jen nahlášení).
 */
export function Napoveda() {
  const [mode, setMode] = useState<"closed" | "menu" | "help">("closed");
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const pathname = usePathname();
  const help = findHelp(pathname);

  // Přechod na jinou stránku menu i nápovědu zavře; nápověda patří stránce.
  // Zároveň se stránka zapíše do podrobností k případnému hlášení chyby.
  useEffect(() => {
    setMode("closed");
    installDiagnostics();
    recordPageVisit(pathname);
  }, [pathname]);

  const { teamId, teamName } = useTeam();

  // Focení: ref hlídá dvojí ťuknutí ještě před překreslením, stav ukazuje „Fotím stránku…“.
  const capturingRef = useRef(false);
  const [busyAction, setBusyAction] = useState<CaptureAction | null>(null);
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [share, setShare] = useState<{ canvas: HTMLCanvasElement | null; error?: string } | null>(null);

  // Menu zůstává během focení otevřené s „Fotím stránku…“: je mimo `.app-shell`
  // (portál), na snímek se nedostane, a jeho průhledná vrstva nepustí ťuknutí
  // na stránku pod ním. Zavřít ho do konce focení nejde.
  const runCapture = async (action: CaptureAction) => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    setBusyAction(action);
    try {
      await nextPaint();
      if (action === "bug") {
        setCapture(await capturePage());
        return;
      }
      const result = await captureVisibleContent();
      if (!result.blob) { setShare({ canvas: null, error: result.error }); return; }
      try {
        setShare({ canvas: await brandScreenshot(result.blob, result.width, teamName) });
      } catch (e) {
        console.error("Pruh na fotku stránky:", e);
        setShare({ canvas: null, error: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      capturingRef.current = false;
      setBusyAction(null);
      setMode("closed");
    }
  };

  const pageSlug = pathname.split("/").filter(Boolean)[0] ?? "prehled";
  const inviteUrl = typeof window !== "undefined"
    ? (teamId ? `${window.location.origin}/pozvanka/${teamId}` : window.location.origin)
    : "";

  const closeMenu = () => {
    if (capturingRef.current) return;
    setMode("closed");
  };

  return (
    <>
      <HelpButton
        // Během focení je menu otevřené, ale na snímku má být v kroužku „?“, ne křížek.
        open={mode !== "closed" && busyAction == null}
        onClick={() => (mode === "closed" ? setMode("menu") : closeMenu())}
        variant="bar"
        label="Nápověda, fotka a hlášení"
        buttonRef={setAnchor}
      />
      {mode === "menu" && (
        <HelpMenu
          anchor={anchor}
          hasHelp={help != null}
          busyAction={busyAction}
          onShowHelp={() => setMode("help")}
          onShareScreenshot={() => runCapture("share")}
          onReportBug={() => runCapture("bug")}
          onClose={closeMenu}
        />
      )}
      {mode === "help" && help && <HelpPanel help={help} onClose={() => setMode("closed")} />}
      {capture && <BugReportDialog capture={capture} teamId={teamId} onClose={() => setCapture(null)} />}
      {share && (
        <ShareScreenshotDialog
          canvas={share.canvas}
          error={share.error}
          fileName={`prales-${pageSlug}`}
          shareText={`Hraju Prales, okresní fotbalový manažer. Přidej se: ${inviteUrl}`}
          onClose={() => setShare(null)}
        />
      )}
    </>
  );
}

export function NapovedaOnboarding({ step }: { step: string }) {
  const [open, setOpen] = useState(false);

  const stepHelp: Record<string, HelpEntry> = {
    location: {
      title: "Výběr obce",
      icon: "\u{1F4CD}",
      sections: [
        { text: "Vyber si obec, kde založíš svůj klub. Velikost obce určuje startovní podmínky." },
        { heading: "Vesnice (do 500 ob.)", text: "Základ hráčů: 37. Rozpočet: nejmenší. Tréninky: 200 Kč. Dotace: 6 000/měs. Ale nejslabší soupeři!" },
        { heading: "Obec (500–2 000)", text: "Základ: 39. Tréninky: 400 Kč. Dotace: 10 000/měs. Vyvážený start." },
        { heading: "Městys (2 000–5 000)", text: "Základ: 41. Tréninky: 600 Kč. Dotace: 15 000/měs. Silnější liga." },
        { heading: "Město (5 000+)", text: "Základ: 44. Tréninky: 1 000 Kč. Dotace: 25 000/měs. Nejsilnější soupeři." },
        { text: "Všechny týmy ve tvé lize budou ze stejného okresu.", tip: true },
      ],
    },
    manager: {
      title: "Profil trenéra",
      icon: "\u{1F9D1}‍\u{1F4BC}",
      sections: [
        { text: "Trenéra pojmenuj a vyber mu příběh. Příběh určuje startovní bonusy." },
        { heading: "Koučink", text: "Násobí šanci na zlepšení hráčů při tréninku: 0,8 + koučink/100 × 0,8. Při koučinku 40 je to 1,12×, při 80 už 1,44×." },
        { heading: "Motivace", text: "Před zápasem zvedne morálku sestavy (při 60 o tři body). Hráči, kteří nejedou na zápas, to u motivátora nesou líp." },
        { heading: "Taktika", text: "Přidá nebo ubere celé sestavě přihrávky a obranu (při 10 −2, při 60 +1, při 99 +4) a zrychlí sehrávání formace." },
        { heading: "Disciplína", text: "Hýbe docházkou na trénink, ubírá fauly a žluté karty a krotí průšvihy v hospodě." },
        { heading: "Práce s mládeží", text: "Zrychlí trénink i růst z odehraných minut u hráčů do 22 let." },
        { text: "Vlastnosti trenéra se mění po zápasech a na konci sezóny. Co přesně která dělá, ukazuje profil trenéra.", tip: true },
      ],
    },
    club: {
      title: "Název klubu",
      icon: "\u{1F3DF}️",
      sections: [
        { text: "Zvol název klubu a stadionu. Klasické české názvy: SK, FK, TJ, Sokol, Spartak…" },
        { heading: "Sponzor", text: "Dostaneš nabídku od místního sponzora. Příjem 1 000–8 000 Kč/měsíc + bonus za výhru. Lepší nabídky přijdou s vyšší reputací." },
      ],
    },
    team: {
      title: "Barvy a dres",
      icon: "\u{1F3BD}",
      sections: [
        { text: "Vyber primární a sekundární barvu dresu a vzor." },
        { text: "Barvy se zobrazí v zápasech, v tabulce a na profilu týmu. Vzor dresu je jen vizuální.", tip: true },
      ],
    },
    reveal: {
      title: "Tvůj tým",
      icon: "\u{1F31F}",
      sections: [
        { text: "Vygenerovaný kádr. Každý hráč má unikátní osobnost, zaměstnání a schopnosti." },
        { heading: "Hodnocení", text: "Vesnice: kolem 35–40. Město: 40–45. Wonderkid (2% šance, věk ≤21): +15–25 navíc!" },
        { heading: "Osobnost", text: "Disciplína určuje docházku. Patriotismus loajalitu. Alkohol únavu a absenci. Temperament riziko karet." },
        { text: "Po dokončení začni posouvat dny. Tréninky jsou út+čt (2×/týden). První zápas bude o víkendu.", tip: true },
      ],
    },
  };

  const help = stepHelp[step];
  if (!help) return null;

  return (
    <>
      <HelpButton open={open} onClick={() => setOpen(!open)} className="bottom-20 right-4" />
      {open && <HelpPanel help={help} onClose={() => setOpen(false)} />}
    </>
  );
}
