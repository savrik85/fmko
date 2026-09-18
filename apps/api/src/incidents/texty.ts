import type { Rng } from "../generators/rng";

/**
 * Šablony textů incidentů.
 *
 * Pravidla (feedback uživatele a reference_generovane_ceske_texty):
 * - nikdy dlouhá pomlčka;
 * - jméno hráče jen v 1. pádě jako podmět ({hrac});
 * - název věci nebo zařízení stojí samostatně za dvojtečkou ({vec}, {zarizeni}),
 *   protože názvy mají různý rod i číslo a nedá se s nimi shodovat sloveso.
 */
export const TEXTY = {
  vloupani_zvenku: [
    "V noci někdo vypáčil dveře skladu. Zmizelo vybavení: {vec}.",
    "Rozbité okýnko u skladu a prázdné regály. Chybí vybavení: {vec}.",
    "Někdo se v noci vloupal do skladu. Pryč je vybavení: {vec}.",
  ],
  vloupani_zevnitr: [
    "Ze skladu zmizelo vybavení: {vec}. Zámek je celý, někdo odemkl klíčem.",
    "Ráno chybělo ve skladu vybavení: {vec}. Po vloupání nejsou žádné stopy.",
    "Sklad byl zamčený, a přesto je pryč vybavení: {vec}.",
  ],
  vitrina: [
    "Z vitríny v klubovně zmizely poháry.",
    "Někdo vybral vitrínu s poháry, zůstaly jen prázdné poličky.",
    "Poháry z vitríny jsou pryč, v kronice zbyly jen fotky.",
  ],
  dodavka_pujcena: [
    "Klubová dodávka stála ráno jinde, s prázdnou nádrží a novou ťukou na blatníku.",
    "Někdo si přes noc půjčil klubovou dodávku. Vrátila se s rozbitým zrcátkem a blátem až po střechu.",
    "Dodávka se vrátila z nočního výletu a je na ní každý kilometr znát.",
  ],
  dodavka_ukradena: [
    "Od hřiště přes noc zmizela klubová dodávka.",
    "Klubová dodávka ráno nestála na svém místě. Zůstaly jen střepy z okénka.",
    "Někdo ukradl klubovou dodávku. Tam, kde stávala, je jen olejová skvrna.",
  ],
  kradez_kamery: [
    "Někdo v noci odmontoval a odnesl kamerové zabezpečení.",
    "Zabezpečení areálu je pryč, zloděj ho odnesl i s kabely.",
    "Kamerové zabezpečení zmizelo. Kdo ho sebral, už nikdo nenatočil.",
  ],
  oslava_v_kabine: [
    "Oslava výhry se z hospody přesunula do kabiny a skončila špatně. Rozbité: {zarizeni}.",
    "Po včerejší výhře to kluci v kabině přehnali. Rozbité: {zarizeni}.",
    "Noční pokračování oslavy v kabině klub něco stálo. Rozbité: {zarizeni}.",
  ],
  kopnute_dvere: [
    "{hrac} po vyloučení vykopl dveře kabiny. Rozbité: {zarizeni}.",
    "{hrac} si vztek z červené karty vybil na kabině. Rozbité: {zarizeni}.",
    "{hrac} po červené kartě mlátil do všeho, co bylo v kabině. Rozbité: {zarizeni}.",
  ],
  koleje_trakturek: [
    "Někdo se v noci projel na zahradním traktůrku po hřišti. Trávník má koleje.",
    "Přes hřiště vedou koleje od traktůrku. Kdo se vozil, se neví.",
    "Traktůrek stál ráno uprostřed hřiště a za ním rozrytý trávník.",
  ],
  pozar_grilu: [
    "Při grilování se to vymklo kontrole a oheň poničil vybavení: {vec}.",
    "Od grilu chytil přístřešek. Poškozené vybavení: {vec}.",
    "Oheň od grilu musel hasit až soused. Poškozené vybavení: {vec}.",
  ],
  pozar_grilu_stanek: [
    "Oheň přeskočil i na stánek. Rozbité: {zarizeni}.",
    "Plameny olízly i stánek. Rozbité: {zarizeni}.",
    "Shořela i část stánku. Rozbité: {zarizeni}.",
  ],
  svetlice: [
    "Po výhře někdo odpálil světlice přímo na hřišti. Trávník má spálené fleky.",
    "Oslava výhry skončila světlicemi na trávníku. Na hřišti jsou černé kruhy.",
    "Kdosi po zápase zapálil světlice na hřišti. Trávník to odnesl.",
  ],
  vandal_zarizeni: [
    "Vandalové v noci řádili v areálu. Rozbité: {zarizeni}.",
    "Někdo přes noc ničil areál. Rozbité: {zarizeni}.",
    "Ráno bylo v areálu co uklízet. Rozbité: {zarizeni}.",
  ],
  vandal_travnik: [
    "Někdo v noci dělal na hřišti hodiny autem. Trávník je rozrytý.",
    "Přes hřiště vedou stopy od auta, někdo si tu v noci zajezdil.",
    "Vandalové rozryli trávník, na hřišti jsou hluboké koleje.",
  ],
  kasa_obcerstveni: [
    "Po zápase někdo vybral kasu u občerstvení. Chybí {castka} Kč.",
    "Kasa od stánku je prázdná. Z včerejší tržby chybí {castka} Kč.",
    "Ráno se ukázalo, že kasa u stánku nesedí. Schází {castka} Kč.",
    "Z tržby za občerstvení zmizelo {castka} Kč. Kasa byla přes noc bez dozoru.",
  ],
  tombola: [
    "Výtěžek z tomboly je pryč. Chybí {castka} Kč.",
    "Krabice s penězi z tomboly zůstala přes noc v kase a ráno v ní chybí {castka} Kč.",
    "Z tomboly zmizelo {castka} Kč. Kasička byla otevřená a prázdná.",
    "Peníze z tomboly se ztratily. Nesedí {castka} Kč.",
  ],
  zpronevera_ekonoma: [
    "{jmeno} si z klubové kasy odnesl {castka} Kč a beze slova skončil.",
    "{jmeno} zmizel z klubu i s {castka} Kč, které měl na starosti.",
    "{jmeno} nechal účetnictví v nepořádku a odešel s {castka} Kč navíc.",
    "{jmeno} si přisvojil {castka} Kč z klubových peněz a dal výpověď.",
  ],
  utek_s_penezi: [
    "{hrac} zmizel z klubu i s penězi. Chybí {castka} Kč.",
    "{hrac} nedorazil na trénink a z kasy zmizelo {castka} Kč.",
    "{hrac} je pryč, telefon nebere. Spolu s ním zmizelo i {castka} Kč z klubu.",
    "{hrac} sebral z kasy {castka} Kč a beze stopy zmizel.",
  ],
  sms_utek: [
    "Trenére, {hrac} je pryč a s ním i {castka} Kč z klubové kasy. Signály tu byly, jenom jsme je nechtěli vidět.",
    "Trenére, {hrac} zmizel i s penězi. Dluhy ho dohnaly, klub na to doplatil {castka} Kč.",
    "Trenére, {hrac} nezvedá telefon a chybí {castka} Kč. Tohle jsme měli čekat.",
    "Trenére, {hrac} utekl s {castka} Kč z klubu. Věděli jsme o dluzích i o hospodě, a stejně nás to zaskočilo.",
  ],
  alarm_vyplasil: [
    "V noci se v areálu rozječel alarm. Zloděj utekl a nic neodnesl.",
    "Alarm vyplašil někoho, kdo se v noci dobýval do areálu. Nic nechybí.",
    "Kamera zachytila stín, pak se spustil alarm. Nic nezmizelo.",
  ],
  stopa_kamera_hrac: [
    "Kustod prošel záznam z kamery. {hrac} je na něm {misto} jasně vidět.",
    "Kamera to natočila {misto}. Na záznamu je jasně poznat hráč: {hrac}.",
    "Záznam z kamery nenechává pochybnosti. {hrac} se {misto} ani neschovával.",
  ],
  stopa_kamera_postava: [
    "Kamera zachytila {misto} postavu v kapuci. Obličej vidět není.",
    "Na záznamu z kamery je {misto} jen shrbená postava. Kdo to je, se poznat nedá.",
    "Kamera nahrála {misto} pohyb, ale obličej zůstal ve stínu.",
  ],
  stopa_kamera_cizi: [
    "Kamera zachytila {misto} neznámého muže v kapuci. Z kádru ho nikdo nepoznal.",
    "Na záznamu z kamery je {misto} cizí chlap s kuklou na hlavě.",
    "Kamera nahrála {misto} dva cizí muže. Obličeje měli zakryté.",
  ],
  stopa_kamera_nefunkcni: [
    "Kamera ten den nenahrávala, zabezpečení je sešlé (stav {stav} %).",
    "Záznam z kamery je prázdný. Zabezpečení je v bídném stavu ({stav} %).",
    "Kamera se v noci vypnula. Při stavu {stav} % se není čemu divit.",
  ],
  stopa_spravce_hrac: [
    "Správce hřiště viděl večer {misto} hráče, který tam neměl co dělat: {hrac}.",
    "Správce hřiště říká, že se {misto} pozdě večer motal hráč: {hrac}.",
    "Správce hřiště zamykal a {misto} potkal hráče, který spěchal pryč: {hrac}.",
  ],
  stopa_spravce_cizi: [
    "Správce hřiště viděl večer {misto} cizí auto s okresní značkou.",
    "Správce hřiště si všiml cizího auta, které stálo {misto} se zhasnutými světly.",
    "Správce hřiště zahlédl večer {misto} dva cizí chlapy. U nás je nikdy neviděl.",
  ],
  stopa_soused_hraci: [
    "Soused viděl v noci u hřiště někoho z klubu. Byl to jeden z nich: {jmena}.",
    "Sousedka v noci zahlédla u hřiště někoho z kádru. Tipuje jednoho z nich: {jmena}.",
    "Soused venčil psa a u hřiště potkal někoho z klubu. Mohl to být jeden z nich: {jmena}.",
  ],
  stopa_soused_cizi: [
    "Soused slyšel v noci u hřiště cizí auto bez rozsvícených světel.",
    "Sousedka viděla v noci u areálu dva cizí chlapy s baterkou.",
    "Sousedův pes v noci štěkal na cizího člověka u plotu.",
  ],
  stopa_svedek: [
    "{svedek} šel z hospody kolem hřiště a {misto} viděl hráče: {hrac}.",
    "{svedek} cestou z hospody zahlédl {misto} hráče: {hrac}.",
    "{svedek} viděl v noci {misto} známou postavu. Byl to {hrac}.",
  ],
  stopa_kamarad: [
    "{svedek} ví, kdo to udělal: {hrac}. Jsou kamarádi, tak to dlouho tajil.",
    "{svedek} přiznal, že mu to kamarád sám řekl. Udělal to {hrac}.",
    "{svedek} to ví z první ruky. Udělal to jeho kamarád {hrac}.",
  ],
  stopa_rival: [
    "{svedek} rád prozradil, kdo to byl: {hrac}.",
    "{svedek} viděl, kdo to udělal, a krýt ho nebude: {hrac}.",
    "{svedek} ukázal prstem na hráče, se kterým se nemusí: {hrac}.",
  ],
  znalost_obvineny: [
    "Trenér tě obvinil: {nazev}. Tvrdíš, že jsi to nebyl.",
  ],
  obvineni_priznani: [
    "Trenére, máte pravdu. Byl jsem to já a stydím se za to.",
    "No jo, byl jsem to já. Nevím, co mě to popadlo.",
    "Omlouvám se, trenére. Udělal jsem to já.",
  ],
  obvineni_usvedcen: [
    "Myslete si, co chcete, trenére. Nic vám k tomu neřeknu.",
    "Na tohle vám nemám co říct.",
    "Dělejte si, co uznáte za vhodné.",
  ],
  obvineni_zapira: [
    "Já? S tím nemám nic společného, trenére.",
    "To myslíte vážně? Já nic neudělal.",
    "Tohle jsem nebyl já. Hledejte jinde.",
  ],
  stopa_priznani: [
    "{hrac} se trenérovi přiznal.",
    "{hrac} po obvinění všechno přiznal.",
    "{hrac} přiznal, že to byl on.",
  ],
  stopa_usvedcen: [
    "{hrac} zapíral, ale proti stopám neměl šanci.",
    "{hrac} se vykrucoval, jenže stopy mluví jasně.",
    "{hrac} nechtěl nic přiznat, stopy ho ale usvědčily.",
  ],
  policie_prijato: [
    "Přijali jsme oznámení: {nazev}. O výsledku šetření vám dáme vědět do týdne.",
    "Oznámení je zapsané: {nazev}. Do týdne se ozveme s výsledkem.",
    "Případ jsme převzali: {nazev}. Výsledek šetření oznámíme do týdne.",
  ],
  policie_udani: [
    "Převzali jsme oznámení na hráče: {hrac}. Věc předáme soudu.",
    "Oznámení na hráče je zapsané: {hrac}. Rozhodne soud.",
    "Případ jsme převzali, podezřelý je hráč: {hrac}. Věc půjde k soudu.",
  ],
  trest_odpustit: [
    "Díky, trenére. Už se to nestane.",
    "Tohle jsem nečekal. Nezklamu vás.",
    "Díky za šanci, trenére. Beru to vážně.",
  ],
  trest_srazka: [
    "Chápu, trenére. Odpracuju to.",
    "Je to fér. Srážku beru.",
    "Zasloužil jsem si to, strhněte mi to ze mzdy.",
  ],
  trest_pokuta: [
    "Zaplatím to. Zasloužil jsem si to.",
    "Dobře, pokutu beru.",
    "Je to moje chyba, zaplatím.",
  ],
  policie_neuspech: [
    "Šetření jsme odložili: {nazev}. Pachatele se zjistit nepodařilo.",
    "Bohužel nic: {nazev}. Pachatele jsme nenašli, případ vracíme.",
    "Šetření skončilo bez výsledku: {nazev}. Kdyby se něco objevilo, dejte vědět.",
  ],
  policie_podminka: [
    "Soud rozhodl, podmínku dostal hráč: {hrac}.",
    "Rozsudek padl. Podmínku dostal hráč: {hrac}.",
    "Soud to uzavřel podmínkou pro hráče: {hrac}.",
  ],
  policie_hrac: [
    "Šetření je uzavřené. Pachatel je z vašeho kádru: {hrac}.",
    "Máme pachatele a je z vašeho týmu: {hrac}.",
    "Stopy vedly do vaší kabiny. Udělal to hráč: {hrac}.",
  ],
  policie_nehoda: [
    "Šetření je uzavřené: {nazev}. Byla to nehoda, nikdo to neudělal schválně.",
    "Případ uzavíráme jako nehodu: {nazev}. Pachatele nehledáme.",
    "Nešlo o trestný čin: {nazev}. Byla to nešťastná náhoda.",
  ],
  policie_vraceno: [
    "Pachatele jsme dopadli. Věci jsou zpátky v klubu: {vec}.",
    "Zloděje máme. Vrácené vybavení: {vec}.",
    "Dopadli jsme ho a věci jsou zpátky: {vec}.",
  ],
  policie_lepsi: [
    "Pachatele jsme dopadli. Věci jsou na služebně, ale klub už má lepší: {vec}.",
    "Zloděje máme, jenže klub už má stejné nebo lepší vybavení: {vec}.",
    "Věci se našly, klub je ale mezitím nahradil: {vec}.",
  ],
  policie_nahrada: [
    "Pachatele jsme dopadli. Soud mu nařídil uhradit škodu, klub dostane {castka} Kč.",
    "Dopadený pachatel zaplatí klubu náhradu škody: {castka} Kč.",
    "Viník uhradí část škody, na účet klubu přijde {castka} Kč.",
  ],
  policie_hotovost: [
    "Pachatele jsme dopadli. Z ukradené hotovosti se klubu vrátí {castka} Kč.",
    "Zloděje máme. Zbylo mu u sebe {castka} Kč, ty se klubu vrátí.",
    "Dopadli jsme ho, z peněz se podařilo zajistit {castka} Kč.",
  ],
  policie_dopaden: [
    "Pachatele jsme dopadli: {nazev}.",
    "Případ je vyřešený, pachatele máme: {nazev}.",
    "Šetření skončilo úspěšně: {nazev}.",
  ],
  stopa_policie_hrac: [
    "Policie zjistila, kdo za tím stojí: {hrac}.",
    "Policejní šetření ukázalo na hráče z kádru: {hrac}.",
    "Policie má jasno. Udělal to hráč: {hrac}.",
  ],
  absence_vyslech: [
    "Trenére, mám předvolání na výslech na policii, nemůžu přijít.",
    "Musím na policii k výslechu, dneska to nestihnu.",
    "Mám výslech kvůli tomu průšvihu, nepřijdu.",
  ],
  absence_soud: [
    "Mám soud, nemůžu hrát.",
    "Dneska stojím před soudem, fotbal nepůjde.",
    "Musím k soudu, omlouvám se.",
  ],
  absence_vyrazen: [
    "Vím, že jsem vyřazenej. Nepřijdu.",
    "Jsem za trest mimo, dneska nehraju.",
    "Chápu, že mě nechcete. Tentokrát nehraju.",
  ],
  trest_vyradit: [
    "Chápu, trenére. Pár zápasů si odsedím.",
    "Dobře, zasloužil jsem si to. Budu makat na tréninku.",
    "Beru to. Vrátím se lepší.",
  ],
  lhuta_kradez: [
    "Uzavřeno bez výsledku: {nazev}. Kdo za tím stál, se nezjistilo.",
  ],
  lhuta_poskozeni: [
    "Uzavřeno bez výsledku: {nazev}. Škoda zůstává na klubu.",
  ],
  lhuta_znamy: [
    "Uzavřeno: {nazev}. Trenér to nechal být.",
  ],
  znalost_svedek: [
    "Tu noc jsi šel z hospody kolem hřiště a {misto} jsi viděl hráče: {hrac}.",
    "Cestou z hospody jsi tu noc {misto} zahlédl hráče: {hrac}.",
    "Tu noc jsi {misto} potkal hráče, který tam neměl co dělat: {hrac}.",
  ],
  znalost_kamarad: [
    "Víš, že to udělal tvůj kamarád: {hrac}.",
    "Víš, kdo to udělal. Byl to tvůj kamarád: {hrac}.",
    "Je ti jasné, že za tím stojí tvůj kamarád: {hrac}.",
  ],
  znalost_rival: [
    "Tušíš, že to udělal hráč, se kterým se nemusíš: {hrac}.",
    "Jsi si skoro jistý, že za tím stojí hráč, kterého nemusíš: {hrac}.",
    "Máš podezření na hráče, se kterým se nesnášíš: {hrac}. Ten večer se divně vytrácel.",
  ],
  znalost_pachatel: [
    "Tohle jsi udělal ty: {nazev}.",
  ],
  stopa_priznani_vyslech: [
    "{hrac} se trenérovi přiznal v rozhovoru.",
    "{hrac} to trenérovi v SMS sám přiznal.",
    "{hrac} se při rozhovoru s trenérem ke všemu přiznal.",
  ],
  krivda_obvineny: [
    "Trenére, pořád mi leží v hlavě to obvinění: {nazev}. Já to nebyl.",
    "Ještě k tomu obvinění, trenére: {nazev}. Mrzí mě, že si to o mně myslíte.",
    "Trenére, kvůli tomu obvinění jsem v noci nespal: {nazev}. Fakt jsem to nebyl já.",
  ],
  bazar_poznano: [
    "V bazaru je vybavení, které vypadá jako naše: {vec}. Dá se koupit zpátky.",
    "Na inzerátu v bazaru jsou věci, které vypadají jako ty naše ukradené: {vec}.",
    "Někdo v bazaru prodává vybavení, které se podobá našemu: {vec}. Stojí za to se podívat.",
  ],
  stopa_bazar: [
    "V bazaru se objevilo vybavení, které vypadá jako naše: {vec}.",
    "Na soukromém inzerátu v bazaru jsou věci, které vypadají jako naše: {vec}.",
    "Kradené věci se nejspíš objevily v bazaru: {vec}.",
  ],
  bazar_vraceno: [
    "Věci jsou zpátky v klubu: {vec}.",
    "Koupili jsme zpátky, co nám ukradli: {vec}.",
    "Vybavení z bazaru je zase naše: {vec}.",
  ],
  bazar_koupil_jiny: [
    "Vybavení z bazaru, které vypadalo jako naše, koupil klub: {klub}.",
    "Věci, které vypadaly jako naše, si z bazaru odvezl klub: {klub}.",
    "Inzerát s věcmi podobnými našim už je pryč, koupil je klub: {klub}.",
  ],
  policie_bazar: [
    "Inzerát jsme zajistili a přidali k šetření: {vec}.",
    "Zboží z bazaru je zajištěné a patří k probíhajícímu šetření: {vec}.",
    "Inzerát je stažený, věci prověříme v rámci šetření: {vec}.",
  ],
  hospoda_drby: [
    "{svedek} po třetím pivu vykládal, co ví o průšvihu v klubu. Pak si objednal ještě jedno.",
    "{svedek} se u výčepu rozpovídal o tom, co se v klubu stalo. Hospodský poslouchal pozorně.",
    "{svedek} po pár pivech pustil pusu na špacír a řekl víc, než chtěl.",
    "{svedek} u stolu vykládal, že ví, kdo za tím průšvihem v klubu stojí.",
    "{svedek} to v hospodě nevydržel a řekl nahlas, co ví.",
  ],
  stopa_hospoda_videl: [
    "{svedek} v hospodě po třetím pivu vykládal, že ten večer viděl {misto} hráče: {hrac}.",
    "{svedek} u výčepu povídal, že tu noc {misto} zahlédl hráče: {hrac}.",
    "{svedek} se v hospodě prořekl, že ten večer {misto} potkal hráče: {hrac}.",
  ],
  stopa_hospoda_tusi: [
    "{svedek} v hospodě po pár pivech prořekl, že za tím podle něj stojí hráč: {hrac}.",
    "{svedek} u výčepu vykládal, že ví, kdo to udělal. Jmenoval hráče: {hrac}.",
    "{svedek} se v hospodě nechal slyšet, že to má na svědomí hráč: {hrac}.",
  ],
  hospoda_nabizi: [
    "Nějaký chlap nabízel u výčepu levně vybavení: {vec}. Nikdo ho neznal.",
    "Cizí chlap obcházel stoly a nabízel vybavení za pár stovek: {vec}.",
    "U pultu se objevil neznámý chlap s taškou a nabízel vybavení: {vec}.",
    "Někdo cizí zkoušel v hospodě prodat vybavení: {vec}. Hospodský ho vyprovodil.",
    "Neznámý chlap nabízel po hospodě vybavení, prý levně a bez otázek: {vec}.",
  ],
  stopa_hospoda_nabizi_poznane: [
    "V hospodě nabízel cizí chlap vybavení, které vypadá jako naše: {vec}.",
    "Hospodský viděl cizího chlapa, jak nabízí vybavení podobné našemu: {vec}.",
    "Po hospodě chodil neznámý chlap s vybavením, které hodně připomíná naše: {vec}.",
  ],
  stopa_hospoda_nabizi: [
    "V hospodě nabízel cizí chlap levně vybavení: {vec}. Jestli je naše, se poznat nedá.",
    "Hospodský viděl cizího chlapa, jak nabízí vybavení: {vec}. Poznat se nedá, jestli je naše.",
    "Po hospodě chodil neznámý chlap a prodával vybavení: {vec}. Žádné poznávací znamení.",
  ],
  hospoda_stezuje: [
    "{hrac} si u piva stěžoval, že ho trenér obvinil. Kamarádi u stolu přikyvovali.",
    "{hrac} celý večer vykládal, jak ho trenér podezíral. Kamarádi mu dali za pravdu.",
    "{hrac} se u stolu rozčiloval kvůli obvinění od trenéra. Kamarádi to vzali za své.",
    "{hrac} si postěžoval kamarádům, že ho trenér obvinil, a oni se ho zastali.",
    "{hrac} nemohl přenést přes srdce, že ho trenér obvinil. Kamarádi u stolu se přidali.",
  ],
  hospoda_rvacka: [
    "{rival} vyčetl u stolu krádež a {zlodej} se neudržel. Hospodský je rozdělil koštětem.",
    "{rival} řekl nahlas, že se zloději nepije. {zlodej} po něm skočil a letěly židle.",
    "{zlodej} nesnesl poznámky o krádeži a {rival} dostal ránu. Skončilo to rvačkou před hospodou.",
    "{rival} a {zlodej} se chytli kvůli krádeži v klubu. Hospodský je musel roztrhnout.",
    "{rival} si neodpustil narážku na krádež. {zlodej} vstal od stolu a bylo zle.",
  ],
  hospoda_cela: [
    "Celá hospoda probírala průšvih v klubu: {nazev}.",
    "U každého stolu se mluvilo o jediném: {nazev}.",
    "V hospodě se nemluvilo o ničem jiném než o průšvihu v klubu: {nazev}.",
    "Hospodský celý večer poslouchal jen jednu historku: {nazev}.",
    "Štamgasti rozebírali, co se stalo v klubu: {nazev}.",
  ],
  hospoda_chlubi_zbozi: [
    "Po šestém pivu se {hrac} pochlubil, že za to vybavení dostal pěkné peníze: {vec}.",
    "{hrac} se u výčepu vytahoval, jak snadno přišel k penězům. Mluvil o vybavení: {vec}.",
    "{hrac} v opilosti vykládal, že si ze skladu vzal, co chtěl, a prodal to: {vec}.",
    "Po pár pivech {hrac} vyprávěl, komu prodal vybavení z klubu: {vec}.",
    "{hrac} platil rundu z peněz, o kterých tvrdil, že je dostal za vybavení: {vec}.",
  ],
  hospoda_sekera: [
    "{hrac} má u hospodského dluh a na sekeru už nedostane.",
    "{hrac} chtěl psát na sekeru, hospodský zavrtěl hlavou.",
    "{hrac} platil až po domluvě, sekeru už mu hospodský nedá.",
    "U výčepu bylo dusno, {hrac} má u hospodského dluh.",
    "{hrac} si objednal a hospodský mu připomněl, co dluží.",
  ],
  hospoda_chlubi: [
    "Po šestém pivu se {hrac} pochlubil, že to byl on: {nazev}.",
    "{hrac} u výčepu vykládal, že ten průšvih v klubu má na svědomí on: {nazev}.",
    "{hrac} se v opilosti vytahoval, jak to celé provedl: {nazev}.",
    "Po pár pivech {hrac} vyprávěl celé hospodě, jak to bylo: {nazev}.",
    "{hrac} se u stolu smál, že na něj nikdo nepřišel: {nazev}.",
  ],
  stopa_hospoda_chlubi: [
    "{hrac} se v hospodě opilý pochlubil, že to byl on.",
    "{hrac} to v hospodě sám vykecal před celým lokálem.",
    "{hrac} se u výčepu vytahoval, že to udělal on.",
  ],
  ohlaseni_vloupani_sklad: [
    "{hrac} u výčepu vykládal, že si ze skladu něco odnese, stejně to tam jen leží.",
    "{hrac} po pár pivech tvrdil, že klíč od skladu má a klub si ani nevšimne, když něco zmizí.",
    "{hrac} u stolu prohlásil, že si ze skladu vezme, co mu klub dluží.",
    "{hrac} se chlubil, že sklad otevře kdykoli a vezme si, co bude chtít.",
    "{hrac} vykládal, že ve skladu se válí věci, které by doma využil líp.",
  ],
  ohlaseni_vitrina: [
    "{hrac} po pár pivech tvrdil, že poháry z vitríny by doma vypadaly líp.",
    "{hrac} u výčepu vykládal, že si z vitríny jeden pohár odnese na památku.",
    "{hrac} prohlásil, že ty poháry ve vitríně stejně nikdo nečistí, tak si je vezme.",
    "{hrac} se u stolu smál, že vitrínu v klubovně otevře i vidličkou.",
    "{hrac} vykládal, že za poháry z vitríny by v bazaru dostal pěkné peníze.",
  ],
  ohlaseni_dodavka_pujcena: [
    "{hrac} se u pultu chlubil, že si klubovou dodávku půjčí na víkend, klíče ví kde jsou.",
    "{hrac} vykládal, že klubovou dodávkou pojede stěhovat švagra, nikdo se ptát nebude.",
    "{hrac} u stolu prohlásil, že si v noci vezme dodávku a projede se.",
    "{hrac} tvrdil, že dodávka stejně celý týden stojí, tak si ji půjčí.",
    "{hrac} po pár pivech sliboval kamarádům odvoz klubovou dodávkou.",
  ],
  ohlaseni_koleje_trakturek: [
    "{hrac} vykládal, že si v noci projede hřiště traktůrkem, ať je aspoň sranda.",
    "{hrac} u výčepu tvrdil, že s traktůrkem udělá na hřišti kolečka.",
    "{hrac} po pár pivech sázel, že traktůrkem objede hřiště rychleji než brankář.",
    "{hrac} prohlásil, že traktůrek nastartuje i bez klíče a hřiště projede.",
    "{hrac} se u stolu smál, že hřiště by chtělo pár pořádných kolejí.",
  ],
  ohlaseni_kopnute_dvere: [
    "{hrac} u stolu hulákal, že trenérovi rozmlátí kabinu, když ho má za zloděje.",
    "{hrac} po pár pivech křičel, že dveře od kabiny zítra vykopne.",
    "{hrac} vykládal, že za to obvinění si trenér kabinu spraví sám.",
    "{hrac} u výčepu bouchal pěstí do stolu, že kabinu rozmlátí na třísky.",
    "{hrac} prohlásil, že kvůli obvinění nechá v kabině pořádnou spoušť.",
  ],
  sms_ohlaseni_kamarad: [
    "Trenére, radši ať to víte. Včera to v hospodě padlo nahlas.",
    "Trenére, nechci práskat, ale tohle byste měl vědět.",
    "Trenére, v hospodě jsem slyšel řeči, které se mi nelíbí.",
  ],
  sms_ohlaseni_hospodsky: [
    "Pane trenére, u výčepu jsem slyšel řeči, které byste měl znát.",
    "Pane trenére, tohle se u mě v hospodě říkalo nahlas.",
    "Pane trenére, jeden z vašich u pultu vykládal nepěkné věci.",
  ],
  znalost_hrozi: [
    "V hospodě jsi opilý vykládal, že provedeš tohle: {nazev}.",
  ],
  hrozi_splnil: [
    "{hrac} v hospodě nekecal, co vykládal, to udělal.",
    "{hrac} to v hospodě ohlásil a slovo dodržel.",
    "Řeči z hospody se naplnily, {hrac} to opravdu udělal.",
  ],
  hrozi_nestalo_se: [
    "{hrac} v hospodě vykládal, že provede průšvih, ale nic z toho nebylo.",
    "{hrac} to v hospodě přehnal s řečmi, ale nakonec nic neudělal.",
    "{hrac} v hospodě kecal, ale vystřízlivěl a nic se nestalo.",
  ],
  stopa_hospoda_ohlasil: [
    "{hrac} to předem ohlásil v hospodě.",
    "{hrac} to den předem vykládal v hospodě.",
    "{hrac} se tím v hospodě chlubil ještě předtím, než to udělal.",
  ],
  znalost_drb: [
    "V hospodě jsi slyšel drb, klub {klub} má průšvih: {nazev}.",
  ],
  situace_dluhy: [
    "{hrac} se dostal do dluhů. V kabině se říká, že mu volají z inkasa.",
    "{hrac} má doma dluhy a shání peníze, kde se dá.",
    "{hrac} dluží a začal brát brigády, kdy se dá.",
  ],
  situace_prisel_o_praci: [
    "{hrac} přišel o práci. Zatím to bere s humorem, ale je to znát.",
    "{hrac} dostal v práci výpověď.",
    "{hrac} je od tohoto týdne bez práce.",
  ],
  situace_rozvod: [
    "{hrac} se rozvádí a spí zatím v kabině.",
    "{hrac} se rozešel se ženou a stěhuje se.",
    "{hrac} si prochází rozvodem.",
  ],
  situace_zabaveny_ridicak: [
    "{hrac} přišel o řidičák.",
    "{hrac} má zabavený řidičák a na zápasy se bude vozit s někým.",
    "{hrac} nemá řidičák, na venkovní zápasy se bude vozit.",
  ],
  situace_svatba_spoluhrace: [
    "{hrac} se ženil a půlka kabiny slavila do rána.",
    "{hrac} měl svatbu. Kluci to oslavili za něj i za sebe.",
    "{hrac} se oženil a svatba se protáhla do rána.",
  ],
  situace_narozeni_ditete: [
    "{hrac} čeká narození dítěte.",
    "{hrac} bude tátou, termín je za pár dní.",
    "{hrac} se chystá do porodnice.",
  ],
  situace_nemocny_rodic: [
    "{hrac} má nemocného rodiče a jezdí do nemocnice.",
    "{hrac} se stará o nemocného rodiče.",
    "{hrac} tráví dny v nemocnici u rodiče.",
  ],
  sms_situace_dluhy: [
    "Trenére, dostal jsem se do problémů s penězi. Šlo by zálohu na výplatu? Vrátím to.",
    "Trenére, nerad o to prosím, ale potřeboval bych zálohu. Mám dluhy až nad hlavu.",
    "Trenére, můžu poprosit o zálohu? Doma je to teď s penězi zlé.",
  ],
  sms_situace_prisel_o_praci: [
    "Trenére, přišel jsem o práci. Trénovat budu chodit, aspoň mě to nebude žrát.",
    "Trenére, vyhodili mě z práce. Zatím to nějak zvládám.",
    "Trenére, jsem bez práce. Kdybyste o něčem věděli, dejte vědět.",
  ],
  sms_situace_rozvod: [
    "Trenére, rozvádím se. Spím teď na kabině, snad to nevadí.",
    "Trenére, doma je konec. Fotbal je jediné, co mi zbylo.",
    "Trenére, rozcházíme se se ženou. Bude to chvíli divoké.",
  ],
  sms_situace_zabaveny_ridicak: [
    "Trenére, vzali mi řidičák. Na venkovní zápasy mě bude muset někdo vzít.",
    "Trenére, přišel jsem o papíry. Doma zvládnu všechno, venku to bude horší.",
    "Trenére, jsem bez řidičáku. Domluvím se s klukama na odvoz.",
  ],
  sms_situace_svatba_spoluhrace: [
    "Trenére, ženil jsem se. Kluci to vzali vážně, ráno bude v kabině ticho.",
    "Trenére, měl jsem svatbu. Díky všem, co dorazili.",
    "Trenére, oženil jsem se. Omlouvám se za stav mužstva.",
  ],
  sms_situace_narozeni_ditete: [
    "Trenére, jedeme do porodnice. Dám vědět, jak to dopadlo.",
    "Trenére, rodíme. Pár dní se neozvu.",
    "Trenére, bude to každou chvíli. Omlouvám se dopředu.",
  ],
  sms_situace_nemocny_rodic: [
    "Trenére, mám nemocného tátu, jezdím do nemocnice. Pár dní vynechám.",
    "Trenére, máma je v nemocnici. Musím být u ní.",
    "Trenére, rodič mi skončil v nemocnici. Ozvu se, až to půjde.",
  ],
  znalost_situace: [
    "Tohle se teď děje tobě: {nazev}.",
  ],
  zaloha_pujcena: [
    "Díky, trenére. Vrátím to do koruny.",
    "Trenére, díky. Tohle mi hodně pomohlo.",
    "Díky moc. Budu to splácet ze mzdy, jak jsme se domluvili.",
  ],
  zaloha_odmitnuta: [
    "Tak nic, trenére. Nějak to zvládnu sám.",
    "Chápu, trenére. Musím si poradit jinak.",
    "Beru na vědomí. Škoda, myslel jsem, že mi klub pomůže.",
  ],
  zaloha_propadla: [
    "Trenére, už to neřešte. Sehnal jsem to jinde.",
    "Už nic, trenére. Vyřešil jsem to po svém.",
    "Nechte to být, trenére. Musel jsem si poradit sám.",
  ],
  absence_porod: [
    "Trenére, jedeme do porodnice. Tenhle zápas vynechám.",
    "Trenére, rodíme. Omlouvám se ze zápasu.",
    "Trenére, bude to dřív, než jsme čekali. Na zápas nedorazím.",
  ],
  absence_nemocna_mama: [
    "Trenére, jedu do nemocnice za rodičem. Na zápas nedorazím.",
    "Trenére, musím do nemocnice za mámou. Omlouvám se.",
    "Trenére, rodič je v nemocnici a nemá tam nikoho. Nepřijdu.",
  ],
  absence_stehovani: [
    "Trenére, stěhuju se od ženy. Tenhle zápas vynechám.",
    "Trenére, musím se vystěhovat, jinak to nestihnu. Omlouvám se.",
    "Trenére, stěhování mi vyšlo přesně na zápas. Nedorazím.",
  ],
} as const satisfies Record<string, readonly string[]>;

export type KlicTextu = keyof typeof TEXTY;

export function vypln(sablona: string, hodnoty: Record<string, string>): string {
  return sablona.replace(/\{(\w+)\}/g, (cela, klic: string) => hodnoty[klic] ?? cela);
}

export function text(rng: Rng, klic: KlicTextu, hodnoty: Record<string, string> = {}): string {
  return vypln(rng.pick(TEXTY[klic]), hodnoty);
}
