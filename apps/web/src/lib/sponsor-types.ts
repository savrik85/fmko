/** České popisky oborů sponzorů. Klíče drží API (apps/api/src/sponsors/types.ts). */
const SPONSOR_TYPE_LABELS: Record<string, string> = {
  pub: "Hospoda",
  restaurant: "Restaurace",
  fast_food: "Občerstvení",
  cafe: "Kavárna a cukrárna",
  bakery: "Pekárna",
  butcher: "Řeznictví",
  grocery: "Potraviny",
  shop: "Obchod",
  brewery: "Pivovar",
  farm: "Farma",
  gardening: "Zahradnictví",
  construction: "Stavebnictví",
  woodwork: "Dřevo a truhlářství",
  car_service: "Autoservis",
  car_dealer: "Autosalon",
  electro: "Elektro",
  it: "IT",
  ecommerce: "E-shop",
  company: "Firma",
  industry: "Průmysl",
  services: "Služby",
  hospitality: "Hotel a lázně",
  municipality: "Obec",
  club: "Klub",
};

/** Neznámý klíč nikdy nezobrazit syrově. */
export function sponsorTypeLabel(type: string | null | undefined): string {
  return (type && SPONSOR_TYPE_LABELS[type]) || "Ostatní";
}
