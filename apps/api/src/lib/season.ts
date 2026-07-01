/**
 * Žádné tiché fallbacky na sezónu 1. Když dotaz na aktivní sezónu selže,
 * mustSeason() spadne s chybou (endpoint vrátí 500) místo defaultu na sezónu 1.
 */
export function mustSeason<T>(v: T | null | undefined, what = "aktivní sezóna"): T {
  if (v == null) throw new Error(`Chybí ${what} — dotaz na seasons(status='active') selhal`);
  return v;
}
