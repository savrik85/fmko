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
    "V bazaru je vybavení, které vypadá jako naše: {vec}. Dá se koupit zpátky, nebo to nahlásit policii.",
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
} as const satisfies Record<string, readonly string[]>;

export type KlicTextu = keyof typeof TEXTY;

export function vypln(sablona: string, hodnoty: Record<string, string>): string {
  return sablona.replace(/\{(\w+)\}/g, (cela, klic: string) => hodnoty[klic] ?? cela);
}

export function text(rng: Rng, klic: KlicTextu, hodnoty: Record<string, string> = {}): string {
  return vypln(rng.pick(TEXTY[klic]), hodnoty);
}
