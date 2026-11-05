/**
 * Chuť na alkohol podle věku. Hráč má vrozený sklon (0–100) a do dospělosti se z něj projeví
 * jen díl: čtrnáctiletý „alkáč“ nedává smysl, osmnáctiletý pivař už ano. Při každém stárnutí se
 * hodnota posune o poměr stropů, takže pořadí mezi hráči (kdo bude jednou pít víc) zůstává.
 */
const ALCOHOL_CAP_BY_AGE: Record<number, number> = { 13: 12, 14: 15, 15: 22, 16: 35, 17: 50, 18: 70 };
/** Od tohoto věku platí celá škála. */
export const ALCOHOL_ADULT_AGE = 19;

export function alcoholCap(age: number): number {
  if (age >= ALCOHOL_ADULT_AGE) return 100;
  return ALCOHOL_CAP_BY_AGE[Math.max(13, Math.round(age))] ?? 12;
}

/** Ze vrozeného sklonu (0–100) hodnota, která se ve věku `age` projeví. */
export function alcoholForAge(innate: number, age: number): number {
  return Math.max(1, Math.round((innate * alcoholCap(age)) / 100));
}

/** Přepočet hodnoty, když hráč zestárne z `fromAge` na `toAge`. */
export function alcoholAfterAging(alcohol: number, fromAge: number, toAge: number): number {
  return Math.min(100, Math.max(1, Math.round((alcohol * alcoholCap(toAge)) / alcoholCap(fromAge))));
}

/** SQL výraz stropu pro sloupec věku (pro hromadné UPDATE při stárnutí). */
export function alcoholCapSql(ageExpr: string): string {
  const cases = Object.entries(ALCOHOL_CAP_BY_AGE).map(([a, c]) => `WHEN ${ageExpr} = ${a} THEN ${c}`).join(" ");
  return `(CASE WHEN ${ageExpr} >= ${ALCOHOL_ADULT_AGE} THEN 100 WHEN ${ageExpr} < 13 THEN 12 ${cases} END)`;
}

/**
 * UPDATE, který po zestárnutí o rok posune alkohol mladých hráčů (věk po stárnutí `age`,
 * předtím `age - 1`). `where` je podmínka na hráče, kteří právě zestárli.
 */
export function alcoholAgingSql(where: string): string {
  const alc = "json_extract(personality, '$.alcohol')";
  return `UPDATE players SET personality = json_set(personality, '$.alcohol',
            MIN(100, MAX(1, CAST(ROUND(${alc} * 1.0 * ${alcoholCapSql("age")} / ${alcoholCapSql("(age - 1)")}) AS INTEGER))))
          WHERE age <= ${ALCOHOL_ADULT_AGE} AND json_valid(personality) AND json_type(personality, '$.alcohol') IN ('integer', 'real') AND (${where})`;
}
