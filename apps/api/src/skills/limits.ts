/**
 * Nejvyšší hodnocení, na které může hráč v Pralesu dorůst (rozhodnutí 2026-10-18).
 *
 * Nejlepší hráč ve hře měl 77. Klenot (talent 70–95, strop dovedností o 12–25 výš) by podle
 * modelu růstu s dospíváním došel až na 99, okresní fotbal by měl hvězdy první ligy. Stropy
 * dovedností nového hráče se proto stáhnou tak, aby jejich vážený průměr (= nejvyšší možné
 * hodnocení) nepřesáhl tuhle hranici, a teoretický strop ve výhledu ji nikdy neukáže vyšší.
 */
export const PRALES_MAX_RATING = 85;
