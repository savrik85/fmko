/**
 * Co hráči vědí o incidentech a co z toho smí model říct (spec Část 10).
 * Čisté funkce bez DB. Zápis a načtení: `znalosti-db.ts`.
 *
 * Tvrdé pravidlo: model mluví jen z toho, co je v DB. Tajné role (svědek, kamarád,
 * rival, pachatel) se do promptu dostanou jen v rozhovoru o incidentu a vždy s pokynem
 * podle uloženého výsledku výslechu. Jinak by model sám „prozradil" něco, co DB nemá.
 */

import type { Rng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { nazevIncidentu } from "./katalog";
import {
  MAX_INCIDENTU_V_PROMPTU, OCHOTA_ROLE, ZNALOST_KADR_DNI, ZNALOST_KADR_ZAVAZNA_DNI, ZNALOST_PACHATEL_DNI,
} from "./nastaveni";
import { MISTO_INCIDENTU, MISTO_TEXT } from "./stopy";
import { text, TEXTY, vypln } from "./texty";
import type { NavrhIncidentu, NavrhStopy, StavKlubu } from "./typy";

export type RoleZnalosti = "kadr" | "svedek" | "kamarad" | "rival" | "pachatel" | "obvineny" | "drb";
export type RoleSvedka = "svedek" | "kamarad" | "rival";
export type VysledekVyslechu = "prozradil" | "kryje" | "zapira" | "priznal";

/** Incident, na který se trenér v konverzaci ptá. `den` = `YYYY-MM-DD` herního dne, kdy se téma nastavilo. */
export interface TemaKonverzace {
  incidentId: string;
  den: string;
}

/** Role, které hráč nese i mimo rozhovor o incidentu. Ostatní jsou tajné (spec 10b). */
export const VEREJNE_ROLE: ReadonlySet<RoleZnalosti> = new Set<RoleZnalosti>(["kadr", "obvineny", "drb"]);

const KLIC_ZNALOSTI = { svedek: "znalost_svedek", kamarad: "znalost_kamarad", rival: "znalost_rival" } as const;
const PORADI_ROLI: Record<RoleZnalosti, number> = { kadr: 0, drb: 1, obvineny: 2, svedek: 3, kamarad: 4, rival: 5, pachatel: 6 };

export interface NovaZnalost {
  playerId: string;
  role: RoleZnalosti;
  fact: string;
  ochota: number;
  /**
   * Herní den ISO, do kdy si to hráč pamatuje. Svědek, kamarád a rival mají den vzniku:
   * jejich znalost platí, dokud je incident otevřený, a týden po uzavření (počítá se při čtení).
   */
  until: string;
}

/** Znalosti nového incidentu pro aktivní kádr (spec 10a). `stopy` jen ty, které se opravdu zapíšou. */
export function znalostiIncidentu(stav: StavKlubu, navrh: NavrhIncidentu, stopy: readonly NavrhStopy[], rng: Rng): NovaZnalost[] {
  const kadrDo = gameExpiry(stav.gameDate, navrh.severity >= 3 ? ZNALOST_KADR_ZAVAZNA_DNI : ZNALOST_KADR_DNI);
  const znalosti: NovaZnalost[] = stav.kadr.map((h): NovaZnalost => ({
    playerId: h.id, role: "kadr", fact: navrh.text, ochota: 50, until: kadrDo,
  }));

  const pachatel = navrh.culpritType === "hrac" ? stav.kadr.find((h) => h.id === navrh.culpritPlayerId) ?? null : null;
  if (!pachatel) return znalosti;
  znalosti.push({
    playerId: pachatel.id, role: "pachatel", ochota: 0,
    fact: vypln(TEXTY.znalost_pachatel[0], { nazev: nazevIncidentu(navrh.kind) }),
    until: gameExpiry(stav.gameDate, ZNALOST_PACHATEL_DNI),
  });

  const misto = MISTO_INCIDENTU[navrh.kind];
  const hodnoty = { hrac: pachatel.jmeno, misto: misto ? MISTO_TEXT[misto] : "u hřiště" };
  const zapsane = new Set<string>();
  for (const s of stopy) {
    if (s.zdroj !== "svedek" && s.zdroj !== "kamarad" && s.zdroj !== "rival") continue;
    if (!s.drzitel || s.ukazujeNa !== pachatel.id) continue;
    // Klíč tabulky je (incident, hráč, role): druhá stopa téhož držitele nic nového neví.
    const klic = `${s.drzitel}|${s.zdroj}`;
    if (zapsane.has(klic)) continue;
    zapsane.add(klic);
    const [min, max] = OCHOTA_ROLE[s.zdroj];
    znalosti.push({
      playerId: s.drzitel, role: s.zdroj,
      fact: text(rng, KLIC_ZNALOSTI[s.zdroj], hodnoty),
      ochota: rng.int(min, max),
      until: stav.gameDate,
    });
  }
  return znalosti;
}

/** Řádek dotazu `nactiZnalostiHrace` (znalost + incident + jméno odhaleného pachatele). */
export interface RadekZnalostiDb {
  incident_id: string;
  role: RoleZnalosti;
  fact: string;
  interrogation: VysledekVyslechu | null;
  kind: string;
  category: string;
  severity: number;
  game_date: string;
  status: string;
  resolution: string | null;
  culprit_revealed: number;
  culprit_player_id: string | null;
  pachatel_jmeno: string | null;
  pachatel_prijmeni: string | null;
}

export interface RadekZnalosti {
  incidentId: string;
  role: RoleZnalosti;
  fact: string;
  /** Uložený výsledek výslechu, `null` = hráč ještě nebyl vyslechnut. */
  vyslech: VysledekVyslechu | null;
  kategorie: string;
  zavaznost: number;
  /** `YYYY-MM-DD` herního dne incidentu. */
  den: string;
  /** Kolik herních dní uplynulo od incidentu. */
  predDny: number;
  stav: string;
  vysledek: string | null;
  odhalen: boolean;
  /** Jméno odhaleného pachatele, jinak `null`. */
  pachatel: string | null;
  /** Hráč, o jehož prompt jde, je sám odhalený pachatel. */
  pachatelJeOn: boolean;
}

function dnyMezi(od: string, do_: string): number {
  return Math.max(0, Math.round((Date.parse(do_.slice(0, 10)) - Date.parse(od.slice(0, 10))) / 86_400_000));
}

export function radekZnalosti(r: RadekZnalostiDb, playerId: string, dnes: string): RadekZnalosti {
  const odhalen = r.culprit_revealed === 1;
  const jmeno = [r.pachatel_jmeno, r.pachatel_prijmeni].filter(Boolean).join(" ");
  return {
    incidentId: r.incident_id, role: r.role, fact: r.fact, vyslech: r.interrogation,
    kategorie: r.category, zavaznost: r.severity, den: r.game_date.slice(0, 10), predDny: dnyMezi(r.game_date, dnes),
    stav: r.status, vysledek: r.resolution, odhalen,
    // Neodhaleného pachatele prompt znát nesmí, i kdyby dotaz jméno vrátil.
    pachatel: odhalen && jmeno ? jmeno : null,
    pachatelJeOn: odhalen && r.culprit_player_id === playerId,
  };
}

/** Tajné role jen k incidentu v tématu, nejvýš 3 incidenty: téma, pak závažnost, pak nejnovější. */
export function vyberZnalosti(radky: readonly RadekZnalosti[], temaId: string | null): RadekZnalosti[] {
  const skupiny = new Map<string, RadekZnalosti[]>();
  for (const r of radky) {
    if (!VEREJNE_ROLE.has(r.role) && r.incidentId !== temaId) continue;
    skupiny.set(r.incidentId, [...(skupiny.get(r.incidentId) ?? []), r]);
  }
  return [...skupiny.values()]
    .sort((a, b) =>
      Number(b[0].incidentId === temaId) - Number(a[0].incidentId === temaId)
      || b[0].zavaznost - a[0].zavaznost
      || b[0].den.localeCompare(a[0].den))
    .slice(0, MAX_INCIDENTU_V_PROMPTU)
    .flatMap((skupina) => [...skupina].sort((a, b) => PORADI_ROLI[a.role] - PORADI_ROLI[b.role]));
}

export const HLAVICKA_ZNALOSTI =
  "CO VÍŠ O DĚNÍ V KLUBU (jen tohle, nic dalšího si nevymýšlej, nic jiného se nestalo; jména z tohoto bloku smíš zmínit):";
export const BEZ_ZNALOSTI = "- O žádné krádeži, škodě ani jiném průšvihu v klubu nevíš. Když se trenér ptá, řekni, že nic nevíš, a nikoho neobviňuj.";

/** Jak incident dopadl: [o někom jiném, o tobě]. */
const VYSLEDEK_V_PROMPTU: Record<string, readonly [string, string]> = {
  odpustit: ["Trenér mu odpustil.", "Trenér ti odpustil."],
  srazka: ["Trenér mu strhává peníze ze mzdy.", "Trenér ti strhává peníze ze mzdy."],
  pokuta: ["Trenér mu dal pokutu.", "Trenér ti dal pokutu."],
  vyradit: ["Trenér ho vyřadil ze zápasů.", "Trenér tě vyřadil ze zápasů."],
  vyhodit: ["Trenér ho vyhodil z klubu.", "Trenér tě vyhodil z klubu."],
  policie: ["Trenér ho předal policii.", "Trenér tě předal policii."],
  nechat_byt: ["Trenér to nechal být.", "Trenér to nechal být."],
  nevyreseno: ["Nevyřešilo se to.", "Nevyřešilo se to."],
  konec_sezony: ["Nevyřešilo se to.", "Nevyřešilo se to."],
  vyreseno_policii: ["Policie pachatele dopadla.", "Policie pachatele dopadla."],
  nehoda: ["Nakonec se ukázalo, že to byla nehoda.", "Nakonec se ukázalo, že to byla nehoda."],
};

function kdy(dni: number): string {
  if (dni <= 0) return "dnes";
  if (dni === 1) return "včera";
  return `před ${dni} dny`;
}

function verejnyFakt(r: RadekZnalosti): string {
  const casti = [r.fact, `Stalo se to ${kdy(r.predDny)}.`];
  const vysetruje = r.kategorie === "kradez" || r.kategorie === "poskozeni";
  if (r.pachatelJeOn) casti.push("Přišlo se na to, že jsi to byl ty.");
  else if (r.pachatel) casti.push(`Udělal to ${r.pachatel}.`);
  else if (vysetruje && r.vysledek !== "vyreseno_policii" && r.vysledek !== "nehoda") casti.push("Kdo to byl, se v klubu neví.");
  const vysledek = r.vysledek ? VYSLEDEK_V_PROMPTU[r.vysledek] : undefined;
  if (vysledek) casti.push(vysledek[r.pachatelJeOn ? 1 : 0]);
  else if (r.stav === "policie") casti.push("Vyšetřuje to policie.");
  return casti.join(" ");
}

function pokynSvedka(r: RadekZnalosti): string {
  if (r.odhalen) return "Už se ví, kdo to byl, klidně o tom mluv.";
  if (r.vyslech === "prozradil") {
    return r.role === "kamarad" ? "Trenérovi to řekni, i když je ti blbé práskat kamaráda." : "Trenérovi to řekni.";
  }
  // Bez uloženého výsledku mlčí: co DB nemá jako nalezenou stopu, model prozradit nesmí.
  return r.role === "kamarad"
    ? "Kryješ kamaráda. Vykrucuj se a jméno trenérovi neřekni."
    : "Nechceš se do toho plést. Vykrucuj se a jméno trenérovi neřekni.";
}

function pokynPachatele(r: RadekZnalosti): string {
  if (r.odhalen) return "Už se na to přišlo, nezapírej.";
  return r.vyslech === "priznal" ? "Přiznej se trenérovi." : "Zapírej, nic nepřiznávej.";
}

export function radekDoPromptu(r: RadekZnalosti): string {
  switch (r.role) {
    case "kadr":
    case "drb":
      return `- ${verejnyFakt(r)}`;
    case "obvineny":
      return `- ${r.fact}`;
    case "pachatel":
      return `- ${r.fact} POKYN: ${pokynPachatele(r)}`;
    case "svedek":
    case "kamarad":
    case "rival":
      return `- ${r.fact} POKYN: ${pokynSvedka(r)}`;
  }
}

/** Blok do `buildSystemPrompt`. Nenačtené znalosti (`undefined`) nepřidají nic. */
export function blokZnalosti(radky: readonly RadekZnalosti[] | undefined): string {
  if (radky === undefined) return "";
  if (radky.length === 0) return BEZ_ZNALOSTI;
  return [HLAVICKA_ZNALOSTI, ...radky.map(radekDoPromptu)].join("\n");
}
