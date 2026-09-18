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
  kasa_obcerstveni: 0.25,
  tombola: 0.25,
};
/** Kolik procent skutečné tržby zmizí z kasy s občerstvením (spec 4a). */
export const KASA_PODIL_MIN = 20;
export const KASA_PODIL_MAX = 50;
/** Tombola je v kase bokem, sebere se jí klidně celá (spec 4a). */
export const TOMBOLA_PODIL_MIN = 30;
export const TOMBOLA_PODIL_MAX = 100;
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
  /** Poznaný inzerát s kradeným zbožím (spec 7c, 8). */
  bazar: 0.3,
  /** Cizí chlap v hospodě nabízel poznatelné kradené zboží (spec 9). */
  hospodaNabizi: 0.15,
} as const;
export const SRAZKA_TYDNU = 4;
export const POKUTA_STROP_KC = 5000;
/** Hodnota jednoho procentního bodu stavu trávníku v Kč (hodnota škody). */
export const CENA_BODU_TRAVNIKU = 150;
/** Strop peněžní ztráty: nikdy víc než desetina rozpočtu (spec 4e). */
export const STROP_ZTRATY_PODIL = 0.1;
/** A nikdy víc než tolik korun, ať velký klub nepřijde o všechno naráz. */
export const STROP_ZTRATY_KC = 40000;
export const SMS_ROLE_POLICIE = "Policie ČR, obvodní oddělení";
/** Vztahy, kvůli kterým hráč kamaráda kryje (spec 5b). */
export const KAMARADSKE_VZTAHY = ["brothers", "drinking_buddies", "neighbors", "coworkers", "classmates", "in_laws"] as const;
export const SILA_KAMARADSTVI = 40;
/** Oblíbený hráč (spec 7c): vůdce kabiny, nebo aspoň dva silné vztahy. */
export const OBLIBENY_VUDCOVSTVI = 65;
export const OBLIBENY_SILA_VZTAHU = 50;
export const OBLIBENY_POCET_VZTAHU = 2;

/** Absence, trénink a zápas (spec 17a–17c). */
/** Datumová incidentní absence musí být ohlášená aspoň tolik dní dopředu, jinak by SMS den předem nesouhlasila se zápasem. */
export const MIN_OHLASENI_ABSENCE_DNI = 2;
export const VYSLECH_ZA_DNI = 2;
/** Soud po odhalení pachatele policií. Po udání se koná v den výsledku šetření. */
export const SOUD_PO_ODHALENI_DNI = 5;
export const VYRAZENI_MAX_ZAPASU = 3;
/** Jak dlouho obvinění a odhalení působí v zápase, v kabině a na docházce. */
export const VLIV_INCIDENTU_DNI = 14;
/** Jak daleko do minulosti se hledají incidenty s obviněním nebo odhalením. */
export const OKNO_VLIVU_DNI = 45;
export const DUVOD_ABSENCE = {
  vyslech: "Výslech na policii", soud: "Soudní jednání", vyrazen: "Vyřazen trenérem",
  porod: "Narodilo se mu dítě", nemocna_mama: "Nemocný rodič", stehovani: "Stěhování po rozvodu",
} as const;
export const EMOJI_ABSENCE: Record<string, string> = {
  vyslech: "🚓", soud: "⚖️", vyrazen: "⛔", porod: "👶", nemocna_mama: "🏥", stehovani: "📦",
};

/** Znalosti hráčů o incidentech (spec 10a). */
export const ZNALOST_KADR_DNI = 14;
/** Závažný incident si kádr pamatuje déle (útěk s penězi přibude ve fázi 7). */
export const ZNALOST_KADR_ZAVAZNA_DNI = 45;
export const ZNALOST_PACHATEL_DNI = 60;
/** Kádr, svědci, kamarádi a rivalové si incident pamatují ještě týden po uzavření. */
export const ZNALOST_PO_UZAVRENI_DNI = 7;
/** Kolik incidentů nejvýš jde do promptu hráče. */
export const MAX_INCIDENTU_V_PROMPTU = 3;
/** Ochota říct trenérovi, co ví (0–100). Kamarád kryje, rival rád práskne (spec 5b), svědek je mezi. */
export const OCHOTA_ROLE = { svedek: [40, 70], kamarad: [10, 25], rival: [60, 80] } as const;

/** Bazar (spec Část 8). */
/** Krádeže, jejichž lup se dá prodat v bazaru. */
export const PRODEJNE_KRADEZE = ["vloupani_sklad", "vitrina", "dodavka_ukradena", "kradez_kamery"] as const;
/** Šance, že zloděj věci zkusí prodat v bazaru ligy. Zbytek prodá jinde. */
export const SANCE_BAZARU = 0.6;
export const BAZAR_DNI_MIN = 1;
export const BAZAR_DNI_MAX = 5;
/** Kradené jde levněji než běžná nabídka, nikdy ale pod výkup zastavárny. */
export const SLEVA_KRADENEHO = 0.55;
/** Soukromý inzerát vydrží jako lidský inzerát, v reálných dnech. */
export const KRADENE_INZERAT_DNI = 7;

/** Hospoda (spec Část 9). Šance jsou na jednu hospodskou session. */
export const DRBY_ALKOHOL = 60;
export const DRBY_SANCE = 0.25;
/** Trenér, který vzal kluky do hospody, poslouchá: šance na drby se násobí (spec 9, návaznosti). */
export const TRENER_V_HOSPODE_NASOBEK = 2;
export const NABIZI_SANCE = 0.2;
export const STEZUJE_SANCE = 0.2;
export const STEZUJE_VZTAH = -3;
export const STEZUJE_MORALKA = -1;
export const RVACKA_SANCE = 0.3;
export const CELA_HOSPODA_SANCE = 0.4;
export const CELA_HOSPODA_DNI = 3;
export const CELA_HOSPODA_ZAVAZNOST = 2;
export const CHLUBI_ALKOHOL = 60;
export const CHLUBI_SANCE = 0.2;
export const CHLUBI_DNI = 10;
export const CHLUBI_TEMPERAMENT = 65;
export const CHLUBI_TEMPERAMENT_NASOBEK = 1.5;
export const OHLASUJE_ALKOHOL = 70;
export const OHLASUJE_SANCE = 0.1;
/** Odhalený zloděj dráždí (rvačka, vůdce fanoušků) jen chvíli po odhalení nebo uzavření. */
export const CERSTVY_ZLODEJ_DNI = 14;
/** Hráč, který manažerovi napíše o ohlášeném činu, musí mít k trenérovi aspoň takový vztah (spec 9a). */
export const OCHOTA_POSLA = 50;
export const ZNALOST_DRB_DNI = 14;
export const SMS_ROLE_HOSPODSKY = "Hospodský";

/** Hrozící čin z opileckých řečí (spec 9a). Šance v procentech. */
export const HROZI_LHUTA_MIN = 1;
export const HROZI_LHUTA_MAX = 3;
export const HROZI_ZAKLAD = 50;
/** Rozhovor sníží šanci o `HROZI_PROMLUVA + vztah k trenérovi / HROZI_PROMLUVA_VZTAH_DELITEL`. */
export const HROZI_PROMLUVA = 30;
export const HROZI_PROMLUVA_VZTAH_DELITEL = 5;
/** Zabezpečení areálu aspoň 1 u krádeže ze skladu. */
export const HROZI_ZABEZPECENI = 15;
/** Jak dlouho kádr ví, že to byly jen řeči. */
export const HROZI_NESTALO_SE_DNI = 7;

/** Životní situace (spec 4c, 4e). */
export const SANCE_SITUACE_ZA_DEN = 0.03;
/** Kolik situací smí klub mít naráz. Jeden hráč vždy nejvýš jednu. */
export const MAX_AKTIVNICH_SITUACI = 2;
export const COOLDOWN_SITUACE_DNI = 21;
/** Ztráta práce občas skončí dluhy (spec 4c): šance a nejzazší odstup ve dnech. */
export const SANCE_DLUHU_PO_ZTRATE_PRACE = 0.3;
export const DLUHY_PO_ZTRATE_PRACE_DNI = 7;

/** Záloha při dluzích (spec 7c). */
export const ZALOHA_MIN_KC = 3000;
export const ZALOHA_MAX_KC = 8000;
export const ZALOHA_TYDNU = 4;
export const ZALOHA_MORALKA = 6;
export const ZALOHA_VZTAH = 8;
export const ODMITNUTA_ZALOHA_MORALKA = -5;
export const ODMITNUTA_ZALOHA_VZTAH = -5;

/** Váha pachatele (spec 5a): kdo má dluhy, krade spíš. Odmítnutá záloha přitopí. */
export const VAHA_DLUHU = 2.0;
export const VAHA_ODMITNUTE_ZALOHY = 1.5;

/** Docházka na trénink podle situace (spec 17b). Kdo nemá práci nebo utekl z domova, chodí radši na hřiště. */
export const TRENINK_SITUACE: Record<string, number> = { prisel_o_praci: 0.15, rozvod: 0.15, dluhy: -0.15 };

/** Zápas (spec 17c). Platí jen pro ten jeden zápas, do DB se to nepropisuje. */
export const ZAPAS_ROZVOD_MORALKA = -5;
export const ZAPAS_ROZVOD_KONZISTENCE = -5;
export const ZAPAS_NAROZENI_MORALKA = 5;

/** Absence na zápas podle situace (spec 17a). */
export const DLUHY_SANCE_NAVIC = 0.05;
/** Bez řidičáku se na venkovní zápas jede hůř. Klubová dodávka to ruší. */
export const RIDICAK_SANCE_NAVIC = 0.12;

/** Hospoda (spec 9). */
export const SEKERA_SANCE = 0.5;
export const ROZVOD_HOSPODA_NASOBEK = 1.5;
