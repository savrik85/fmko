/** Typy a popisky stránky Incidenty. Klíče odpovídají API (apps/api/src/routes/incidents.ts). */

export type StavIncidentu = "hrozi" | "otevreny" | "policie" | "probiha" | "uzavreny";
export type AkceTrestu = "odpustit" | "srazka" | "pokuta" | "vyradit" | "vyhodit" | "policie" | "nechat_byt";
export type VysledekObvineni = "priznal" | "usvedcen" | "zapira";

export interface Incident {
  id: string;
  kind: string;
  label: string;
  emoji: string;
  category: string;
  status: StavIncidentu;
  severity: number;
  gameDate: string;
  deadline: string | null;
  text: string;
  ztraty: string[];
  pachatel: { playerId: string; jmeno: string | null } | null;
  /** Kdo čin ohlásil v hospodě (hrozící čin, nebo řeči, ze kterých nic nebylo). */
  ohlasil: { playerId: string; jmeno: string | null } | null;
  /** Koho se životní situace týká. */
  dotceny: { playerId: string; jmeno: string | null } | null;
  endsOn: string | null;
  resolution: string | null;
  resolvedOn: string | null;
}

export interface DetailIncidentuData {
  incident: Incident;
  vysetrovani: { stav: "znamy" | "podezreli" | "neznamy"; podezreli: Array<{ playerId: string; jmeno: string | null }> };
  stopy: Array<{ zdroj: string; text: string; sila: number }>;
  obvineni: Array<{ playerId: string; jmeno: string; den: string; vysledek: VysledekObvineni }>;
  policie: { vysledekOn: string | null; vysledek: number | null };
  hrozi: { promluvil: boolean } | null;
  situace: { kind: string; endsOn: string | null; zaloha: "pujceno" | "odmitnuto" | null; castka: number | null } | null;
  akce: { obvinit: boolean; policie: boolean; zeptat: boolean; promluvit: boolean; zaloha: boolean; tresty: AkceTrestu[] };
  zbyvaObvineni: number;
  kadr: Array<{ playerId: string; jmeno: string }>;
  castky: { srazka: number; pokuta: number; tydnu: number } | null;
}

export const STAV_LABEL: Record<StavIncidentu, string> = {
  hrozi: "Hrozí", otevreny: "Řeší se", policie: "Šetří policie", probiha: "Probíhá", uzavreny: "Uzavřeno",
};

export const STAV_TRIDA: Record<StavIncidentu, string> = {
  hrozi: "bg-amber-100 text-amber-700",
  otevreny: "bg-red-100 text-red-700",
  policie: "bg-blue-100 text-blue-700",
  probiha: "bg-amber-100 text-amber-700",
  uzavreny: "bg-gray-100 text-muted",
};

export const VYSLEDEK_LABEL: Record<string, string> = {
  nevyreseno: "Nevyřešeno",
  konec_sezony: "Uzavřeno koncem sezóny",
  bez_skody: "Bez škody",
  nechat_byt: "Trenér to nechal být",
  odpustit: "Trenér odpustil",
  srazka: "Srážka ze mzdy",
  pokuta: "Pokuta",
  vyradit: "Vyřazen ze zápasů",
  vyhodit: "Hráč vyhozen",
  policie: "Předáno policii",
  vyreseno_policii: "Vyřešila policie",
  nehoda: "Byla to nehoda",
  nestalo_se: "Nakonec se nic nestalo",
  skoncila: "Skončilo",
  hrac_odesel: "Hráč odešel z klubu",
};

export const TREST_LABEL: Record<AkceTrestu, string> = {
  odpustit: "Odpustit",
  srazka: "Srážka ze mzdy",
  pokuta: "Pokuta",
  vyradit: "Vyřadit ze zápasů",
  vyhodit: "Vyhodit z klubu",
  policie: "Předat policii",
  nechat_byt: "Nechat to být",
};

export const TREST_HOTOVO: Record<AkceTrestu, string> = {
  odpustit: "Odpuštěno.",
  srazka: "Srážka se bude strhávat každé pondělí.",
  pokuta: "Pokuta je zaplacená.",
  vyradit: "Vyřazení platí od příštího ligového kola.",
  vyhodit: "Hráč z klubu odešel.",
  policie: "Předáno policii, výsledek přijde do týdne.",
  nechat_byt: "Necháno být.",
};

export const ZDROJ_EMOJI: Record<string, string> = {
  kamera: "📹", spravce: "🧹", soused: "🏠", svedek: "👀", kamarad: "🤝",
  rival: "😠", hospoda: "🍺", bazar: "🛒", policie: "🚓", priznani: "✋",
};

export const OBVINENI_LABEL: Record<VysledekObvineni, string> = {
  priznal: "přiznal se",
  usvedcen: "stopy ho usvědčily",
  zapira: "zapírá",
};

export function datum(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", timeZone: "UTC" });
}

export function kc(castka: number): string {
  return `${castka.toLocaleString("cs-CZ")} Kč`;
}
