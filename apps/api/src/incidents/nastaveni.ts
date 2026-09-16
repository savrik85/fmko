/** Ladicí konstanty incidentů. Výchozí hodnoty ze specu, Část 4e a 5a. */

export const SANCE_PROBLEMU_ZA_DEN = 0.04;
export const COOLDOWN_TYPU_DNI = 21;
export const LHUTA_ROZHODNUTI_DNI = 7;
export const MIN_ODEHRANYCH_ZAPASU = 3;
export const MAX_OTEVRENYCH_PROBLEMU = 1;
/** Pod touhle vahou (pachatel.ts) hráč nekrade ani neničí. */
export const PRAH_VAHY_PACHATELE = 1.2;
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
