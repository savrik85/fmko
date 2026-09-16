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
    "Někdo přelezl plot a vykradl sklad. Pryč je vybavení: {vec}.",
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
    "Z parkoviště u hřiště přes noc zmizela klubová dodávka.",
    "Klubová dodávka ráno nestála na svém místě. Zůstaly jen střepy z okénka.",
    "Někdo ukradl klubovou dodávku. Na parkovišti je jen olejová skvrna.",
  ],
  kradez_kamery: [
    "Někdo v noci ukradl kameru nad vchodem do kabin.",
    "Kamerový systém je pryč, zloděj odnesl i nahrávací box.",
    "Z areálu zmizely kamery. Kdo je sebral, nenatočila ani jedna.",
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
    "V noci se u skladu rozječel alarm. Zloděj utekl a nic neodnesl.",
    "Alarm vyplašil někoho, kdo se dobýval do skladu. Nic nechybí.",
    "Kamera zachytila stín u dveří skladu, pak se spustil alarm. Nic nezmizelo.",
  ],
  lhuta_kradez: [
    "Uzavřeno bez výsledku: {nazev}. Kdo za tím stál, se nezjistilo.",
  ],
  lhuta_poskozeni: [
    "Uzavřeno bez výsledku: {nazev}. Škoda zůstává na klubu.",
  ],
} as const satisfies Record<string, readonly string[]>;

export type KlicTextu = keyof typeof TEXTY;

export function vypln(sablona: string, hodnoty: Record<string, string>): string {
  return sablona.replace(/\{(\w+)\}/g, (cela, klic: string) => hodnoty[klic] ?? cela);
}

export function text(rng: Rng, klic: KlicTextu, hodnoty: Record<string, string> = {}): string {
  return vypln(rng.pick(TEXTY[klic]), hodnoty);
}
