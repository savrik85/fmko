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

export type ProductKey = "sausage" | "beer" | "lemonade";

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
  tiers: ProductQualityTier[]; // index 0-3, 0 = nenabízí se
}

/**
 * Pivo — nejvyšší demand, vyšší cenová elasticita (lidé rádi šetří), mocné pro satisfaction.
 * Klobása — střední demand, lidé jsou ochotní zaplatit víc za kvalitu.
 * Limonáda — nižší demand (děti, řidiči), menší elasticita.
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
    tiers: [
      { wholesalePrice: 0, defaultSellPrice: 0, label: "—" },
      { wholesalePrice: 8, defaultSellPrice: 15, label: "Sirup s vodou" },
      { wholesalePrice: 14, defaultSellPrice: 25, label: "Kofola/Malinovka" },
      { wholesalePrice: 22, defaultSellPrice: 40, label: "Prémiová značka" },
    ],
  },
};

export const CONCESSION_PRODUCT_KEYS: ProductKey[] = ["sausage", "beer", "lemonade"];

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
