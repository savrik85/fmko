/** Ladicí konstanty incidentů. Výchozí hodnoty ze specu, Část 4e a 5a. */

export const SANCE_PROBLEMU_ZA_DEN = 0.04;
export const COOLDOWN_TYPU_DNI = 21;
export const LHUTA_ROZHODNUTI_DNI = 7;
export const MIN_ODEHRANYCH_ZAPASU = 3;
export const MAX_OTEVRENYCH_PROBLEMU = 1;
/**
 * Pod touhle vahou (pachatel.ts) hráč nekrade ani neničí. Při 1,7 je kandidátem
 * zhruba polovina běžného kádru (ověřeno na testovacích datech, při 1,2 to bylo 89 %).
 */
export const PRAH_VAHY_PACHATELE = 1.7;
/** Kolik pokusů o krádež je zvenku. Zbytek jsou hráči s klíčem. */
export const PODIL_POKUSU_ZVENKU = 0.5;
/** Šance, že se spouštěný incident stane, když je spouštěč splněný. */
export const SANCE_SPOUSTENYCH: Record<string, number> = {
  oslava_v_kabine: 0.25,
  kopnute_dvere: 0.35,
  svetlice: 0.15,
};
/** Odesílatel SMS o incidentech. Obecná klubová role, existuje v každém klubu. */
export const SMS_ROLE_KUSTOD = "Kustod";

/** Recidivista: pachatel incidentu uzavřeného v posledních dnech (spec 5a). */
export const RECIDIVA_DNI = 60;
export const VAHA_RECIDIVY = 1.0;

/** Vyšetřování (spec 7b–7d). */
export const MAX_OBVINENI = 2;
/** Jak dlouho si neprávem obviněný pamatuje křivdu. */
export const OBVINENI_PAMET_DNI = 60;
/** Po odhalení pachatele má manažer na trest aspoň tolik dní. */
export const LHUTA_PO_ODHALENI_DNI = 3;
export const POLICIE_DNI_MIN = 3;
export const POLICIE_DNI_MAX = 7;
/** Neúspěšné šetření vrátí incident manažerovi s novou lhůtou. */
export const LHUTA_PO_POLICII_DNI = 3;
export const POLICIE_ZAKLAD = 0.15;
export const POLICIE_STROP = 0.9;
export const POLICIE_POLICISTA = 0.1;
export const POVOLANI_POLICISTA = "Policista";
/** Kolik nalezená stopa přidá k šanci policie (spec 7c). */
export const BONUS_POLICIE = {
  kameraIdentita: 0.35,
  kameraBezIdentity: 0.2,
  soused: 0.15,
  spravceCizi: 0.15,
  svedek: 0.1,
} as const;
export const SRAZKA_TYDNU = 4;
export const POKUTA_STROP_KC = 5000;
/** Hodnota jednoho procentního bodu stavu trávníku v Kč (hodnota škody). */
export const CENA_BODU_TRAVNIKU = 150;
export const SMS_ROLE_POLICIE = "Policie ČR, obvodní oddělení";
/** Vztahy, kvůli kterým hráč kamaráda kryje (spec 5b). */
export const KAMARADSKE_VZTAHY = ["brothers", "drinking_buddies", "neighbors", "coworkers", "classmates", "in_laws"] as const;
export const SILA_KAMARADSTVI = 40;
/** Oblíbený hráč (spec 7c): vůdce kabiny, nebo aspoň dva silné vztahy. */
export const OBLIBENY_VUDCOVSTVI = 65;
export const OBLIBENY_SILA_VZTAHU = 50;
export const OBLIBENY_POCET_VZTAHU = 2;
