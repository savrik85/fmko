/**
 * Katalog produktů pro vlastní provoz občerstvení (self concession mode).
 * Wholesale ceny, quality tiery, spotřební koeficienty.
 *
 * Každý produkt má 3 quality levely. Level určuje:
 * - wholesale_price (nákupní cena za ks)
 * - base_rate (kolik procent diváků si chce koupit za standardní cenu)
 * - quality_mul (kolik satisfaction dá při vhodném poměru cena/kvalita)
 */

import type { Weather } from "../engine/types";
import { monthTemperature } from "./weather";

export type ProductKey = "sausage" | "beer" | "lemonade" | "mulled_wine";

export interface ProductQualityTier {
  wholesalePrice: number;   // Kč/ks
  defaultSellPrice: number; // Kč/ks (typická doporučená cena)
  label: string;
}

export interface ProductCatalogEntry {
  key: ProductKey;
  label: string;
  /** Základní podíl diváků kteří si koupí při defaultSellPrice a průměrné spokojenosti */
  baseDemandRate: number;
  /** Cenová elasticita — čím vyšší, tím víc poptávka reaguje na cenu */
  priceElasticity: number;
  /** Násobič poptávky podle typu počasí. */
  weatherFactors: Record<Weather, number>;
  /**
   * Citlivost na teplotu. Kladná = v teple se prodává víc (nápoje),
   * záporná = v mrazu se prodává víc (teplé jídlo).
   */
  tempSensitivity: number;
  /**
   * Podíl skladu, který se za den zkazí. Bez zkázy byla optimální strategie
   * „naskladni jednou hodně od všeho" a předpověď počasí nemělo smysl sledovat.
   */
  spoilRatePerDay: number;
  tiers: ProductQualityTier[]; // index 0-3, 0 = nenabízí se
}

/**
 * Pivo — nejvyšší demand, vyšší cenová elasticita (lidé rádi šetří), mocné pro satisfaction.
 * Klobása — střední demand, lidé jsou ochotní zaplatit víc za kvalitu.
 * Limonáda — nižší demand (děti, řidiči), menší elasticita.
 * Svařák — sezónní: v létě se neprodá, v listopadu a prosinci drží bufet nad vodou.
 *
 * ⚠️ Při přidávání dalšího produktu hlídej výchozí ceny: `computeMatchSatisfactionDelta`
 * strhne −2 spokojenosti za "předraženou" položku, když je qualityLevel <= 1 a prodejní
 * cena přes dvojnásobek velkoobchodní — a sahá i na produkty s nulovým prodejem. Špatně
 * nacenený L1 by tak trvale srážel spokojenost i týmu, který produkt nikdy nenaskladní.
 * Hlídá to test v `concession-mulled-wine.test.ts`.
 */
export const CONCESSION_CATALOG: Record<ProductKey, ProductCatalogEntry> = {
  sausage: {
    key: "sausage",
    label: "Klobása",
    baseDemandRate: 0.4,
    priceElasticity: 0.6,
    weatherFactors: { sunny: 0.88, cloudy: 0.98, wind: 1.05, rain: 1.00, snow: 1.10 },
    // Záporná, ale mírná: v mrazu klobása taky klesá, jen mnohem pomaleji než pivo.
    // Nikdo v plískanici nesní dvě klobásy navíc — jen místo tří piv dá jedno a klobásu.
    tempSensitivity: -0.10,
    // Čerstvé maso ve vesnickém bufetu bez chladírny. Za týden do dalšího
    // zápasu zbyde půlka — klobásy se musí kupovat čerstvé, nedají se předzásobit.
    spoilRatePerDay: 0.10,
    tiers: [
      { wholesalePrice: 0, defaultSellPrice: 0, label: "—" },
      { wholesalePrice: 15, defaultSellPrice: 30, label: "Kostelecké uzeniny" },
      { wholesalePrice: 25, defaultSellPrice: 45, label: "Místní uzenářství" },
      { wholesalePrice: 40, defaultSellPrice: 65, label: "Premium farmářská" },
    ],
  },
  beer: {
    key: "beer",
    label: "Pivo",
    baseDemandRate: 4.0,
    priceElasticity: 0.8,
    weatherFactors: { sunny: 1.24, cloudy: 0.96, wind: 0.92, rain: 0.85, snow: 0.55 },
    // Nižší citlivost než u limonády: v mrazu se pije i na zahřátí, takže pivo
    // nespadne tak hluboko jako studený nápoj. Déšť pod stříškou mu vadí málo.
    tempSensitivity: 0.22,
    // Lahve a sudy vydrží, ale teplo a čas pivu nesvědčí.
    spoilRatePerDay: 0.02,
    tiers: [
      { wholesalePrice: 0, defaultSellPrice: 0, label: "—" },
      { wholesalePrice: 14, defaultSellPrice: 25, label: "Měšťan 10°" },
      { wholesalePrice: 20, defaultSellPrice: 35, label: "Kozel 11°" },
      { wholesalePrice: 30, defaultSellPrice: 50, label: "Plzeň 12°" },
    ],
  },
  lemonade: {
    key: "lemonade",
    label: "Limonáda",
    baseDemandRate: 1.0,
    priceElasticity: 0.4,
    weatherFactors: { sunny: 1.40, cloudy: 0.96, wind: 0.88, rain: 0.78, snow: 0.35 },
    tempSensitivity: 0.42,    // letní nápoj pro děti a řidiče, v zimě po něm nikdo neštěkne
    // Nejtrvanlivější položka v bufetu.
    spoilRatePerDay: 0.01,
    tiers: [
      { wholesalePrice: 0, defaultSellPrice: 0, label: "—" },
      { wholesalePrice: 8, defaultSellPrice: 15, label: "Sirup s vodou" },
      { wholesalePrice: 14, defaultSellPrice: 25, label: "Kofola/Malinovka" },
      { wholesalePrice: 22, defaultSellPrice: 40, label: "Prémiová značka" },
    ],
  },
  mulled_wine: {
    key: "mulled_wine",
    label: "Svařák a grog",
    // Nižší než pivo: i v mrazu si dá svařák menšina. Zato ho ta menšina chce.
    baseDemandRate: 0.6,
    // Kdo si v zimě jde pro svařák, cenu tolik neřeší — jde mu o to se zahřát.
    priceElasticity: 0.5,
    weatherFactors: { sunny: 0.35, cloudy: 0.75, wind: 1.00, rain: 0.95, snow: 1.60 },
    // Nejsilnější citlivost v katalogu, a záporná: mimo chladné měsíce je svařák
    // mrtvý peníz. Tím se z naskladnění stává sezónní sázka, ne trvalá položka.
    tempSensitivity: -0.70,
    // Víno vydrží dlouho, koření a citrusy ne. Za čtyři měsíce z letního
    // nákupu nezbyde nic použitelného, takže svařák zůstává sezónní sázkou.
    spoilRatePerDay: 0.015,
    tiers: [
      { wholesalePrice: 0, defaultSellPrice: 0, label: "—" },
      { wholesalePrice: 15, defaultSellPrice: 28, label: "Krabicák s hřebíčkem" },
      { wholesalePrice: 25, defaultSellPrice: 45, label: "Svařák z pořádného vína" },
      { wholesalePrice: 34, defaultSellPrice: 60, label: "Grog s tuzemákem" },
    ],
  },
};

export const CONCESSION_PRODUCT_KEYS: ProductKey[] = ["sausage", "beer", "lemonade", "mulled_wine"];

export function getProductCatalog(key: string): ProductCatalogEntry | undefined {
  return CONCESSION_CATALOG[key as ProductKey];
}

export function getWholesalePrice(key: string, qualityLevel: number): number {
  const entry = getProductCatalog(key);
  if (!entry) return 0;
  const tier = entry.tiers[Math.max(0, Math.min(3, qualityLevel))];
  return tier?.wholesalePrice ?? 0;
}

export function getDefaultSellPrice(key: string, qualityLevel: number): number {
  const entry = getProductCatalog(key);
  if (!entry) return 0;
  const tier = entry.tiers[Math.max(0, Math.min(3, qualityLevel))];
  return tier?.defaultSellPrice ?? 0;
}

/** Referenční teplota, při které je teplotní složka neutrální (jarní/podzimní zápas). */
const REFERENCE_TEMP = 15;

/** Ani extrémní kombinace nesmí poptávku vynulovat ani zdvojnásobit. */
function clampFactor(v: number): number {
  return Math.max(0.3, Math.min(1.8, v));
}

/**
 * Násobič poptávky po produktu podle počasí a měsíce.
 *
 * Nahrazuje dřívější `weatherBeerFactor`, který platil plošně pro pivo i limonádu
 * a klobásu ignoroval úplně — takže ve sněhu klesalo pití o 45 %, ale prodej
 * teplého jídla se nehnul, i když teplá klobása je v mrazu to jediné, co se prodá.
 *
 * Bez měsíce se použije jen složka počasí. Volající, který měsíc nezná, tak
 * dostane rozumný odhad místo výjimky.
 */
export function concessionWeatherFactor(key: ProductKey, weather: Weather, month?: number): number {
  const entry = CONCESSION_CATALOG[key];
  if (!entry) return 1;
  const weatherMul = entry.weatherFactors[weather] ?? 1;
  if (month === undefined) return clampFactor(weatherMul);
  const temp = monthTemperature(month);
  const tempMul = 1 + ((temp - REFERENCE_TEMP) / REFERENCE_TEMP) * entry.tempSensitivity;
  return clampFactor(weatherMul * tempMul);
}

/**
 * Kolik ze skladu zbyde po N dnech zkázy.
 *
 * Zaokrouhluje dolů po každém dni, aby výsledek přesně odpovídal tomu, co dělá
 * `CAST(stock_quantity * ? AS INTEGER)` v denním ticku. Kdyby se počítalo
 * spojitě, model by se s databází pomalu rozcházel a zbytky by v DB přežívaly
 * déle, než by kdokoli čekal.
 */
export function stockAfterDays(stock: number, spoilRatePerDay: number, days: number): number {
  let s = Math.max(0, Math.floor(stock));
  const keep = 1 - spoilRatePerDay;
  for (let i = 0; i < days && s > 0; i++) s = Math.floor(s * keep);
  return s;
}

export interface ConcessionDemandHint {
  key: ProductKey;
  label: string;
  /** Násobič poptávky za daných podmínek. 1,0 = běžně. */
  factor: number;
  /** Slovní shrnutí pro manažera — co s tím udělat při naskladnění. */
  hint: string;
}

function hintText(factor: number): string {
  if (factor >= 1.35) return "půjde na dračku";
  if (factor >= 1.10) return "poptávka nahoře";
  if (factor > 0.90) return "běžná poptávka";
  if (factor > 0.60) return "poptávka dolů";
  return "skoro se neprodá";
}

/**
 * Co naskladnit na zápas za daných podmínek, seřazené od nejžádanějšího.
 *
 * Sama předpověď manažerovi nestačí: musel by v hlavě přepočítávat počasí
 * a měsíc na poměry mezi produkty. Tohle mu rovnou řekne, na co se vrhnout.
 */
export function concessionDemandHints(weather: Weather, month?: number): ConcessionDemandHint[] {
  return CONCESSION_PRODUCT_KEYS
    .map((key) => {
      const raw = concessionWeatherFactor(key, weather, month);
      // Zaokrouhleno na dvě místa: přes API by jinak chodilo 1.6743999999999999
      // a hodnota se stejně používá jen na prahy a zobrazení.
      const factor = Math.round(raw * 100) / 100;
      return { key, label: CONCESSION_CATALOG[key].label, factor, hint: hintText(raw) };
    })
    .sort((a, b) => b.factor - a.factor);
}
