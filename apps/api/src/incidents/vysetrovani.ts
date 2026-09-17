/**
 * Pravidla vyšetřování (spec Část 5b, 7a–7d). Čisté funkce bez DB.
 */

import type { Rng } from "../generators/rng";
import { logger } from "../lib/logger";
import { MAX_OBVINENI, POLICIE_POLICISTA, POLICIE_STROP, POLICIE_ZAKLAD } from "./nastaveni";
import type {
  AkceTrestu, HracKlubu, KategorieIncidentu, Obvineni, StavIncidentu, Stopa, TypPachatele, VysledekObvineni,
} from "./typy";

export type StavVysetrovani = "znamy" | "podezreli" | "neznamy";

export const AKCE_TRESTU: readonly AkceTrestu[] = ["odpustit", "srazka", "pokuta", "vyradit", "vyhodit", "policie", "nechat_byt"];

/** Co manažer ví (spec 5b): známý pachatel, podezřelí z nalezených stop, nebo nic. */
export function stavVysetrovani(stopy: readonly Stopa[], odhalen: boolean): { stav: StavVysetrovani; podezreli: string[] } {
  if (odhalen) return { stav: "znamy", podezreli: [] };
  const podezreli = new Set<string>();
  for (const s of stopy) {
    if (!s.nalezena) continue;
    if (s.ukazujeNa) podezreli.add(s.ukazujeNa);
    for (const id of s.podezreli ?? []) podezreli.add(id);
  }
  return podezreli.size > 0
    ? { stav: "podezreli", podezreli: [...podezreli].sort() }
    : { stav: "neznamy", podezreli: [] };
}

/** Ukazuje na hráče některá nalezená stopa, přímo nebo mezi podezřelými? */
export function stopaNaHrace(stopy: readonly Stopa[], playerId: string): boolean {
  return stopy.some((s) => s.nalezena && (s.ukazujeNa === playerId || (s.podezreli ?? []).includes(playerId)));
}

/** Šance v procentech, že se pachatel přizná (spec 7a). */
export function sancePriznani(h: HracKlubu, stopaNaNej: boolean): number {
  const sance = (h.disciplina + (100 - h.temperament) + h.vztahKTrenerovi) / 3 - 20 + (stopaNaNej ? 30 : 0);
  return Math.max(0, Math.min(100, sance));
}

/**
 * Výsledek obvinění (spec 7b). Nevinný vždy zapírá. Pachatele se stopou buď
 * přizná, nebo ho stopy usvědčí; bez stopy se přizná, nebo zapírá.
 */
export function rozhodniObvineni(opts: {
  obvineny: HracKlubu; pachatelId: string | null; stopy: readonly Stopa[]; rng: Rng;
}): { vysledek: VysledekObvineni; vinen: boolean } {
  if (opts.pachatelId !== opts.obvineny.id) return { vysledek: "zapira", vinen: false };
  const stopa = stopaNaHrace(opts.stopy, opts.obvineny.id);
  if (opts.rng.random() * 100 < sancePriznani(opts.obvineny, stopa)) return { vysledek: "priznal", vinen: true };
  return { vysledek: stopa ? "usvedcen" : "zapira", vinen: true };
}

/** Šance policie (spec 7c): základ, nalezené stopy a policista v kádru, se stropem. */
export function sancePolicie(stopy: readonly Stopa[], policistaVKadru: boolean): number {
  const zeStop = stopy.reduce((soucet, s) => soucet + (s.nalezena ? s.bonusPolicie : 0), 0);
  return Math.min(POLICIE_STROP, POLICIE_ZAKLAD + zeStop + (policistaVKadru ? POLICIE_POLICISTA : 0));
}

export type VysledekPolicie = "neuspech" | "podminka" | "odhalen_hrac" | "dopaden_cizi" | "nehoda";

/**
 * Co policie zjistila. `los` je první číslo z `createRng(seedFromString("policie|" + id))`.
 * Udání odhaleného hráče uspěje vždy. Zaměstnance jako pachatele ve fázi 2 policie nedopadne.
 * Přizná-li se hráč v chatu, zatímco šetří policie (`odhalen`), výslech uspěje bez ohledu na
 * los - jinak by mohla přijít SMS "pachatele se nepodařilo zjistit" o hráči, který se přiznal.
 */
export function vysledekPolicie(
  opts: { udani: boolean; pachatel: TypPachatele | null; sance: number; los: number; odhalen: boolean },
): VysledekPolicie {
  if (opts.udani) return "podminka";
  if (opts.pachatel === "hrac" && opts.odhalen) return "odhalen_hrac";
  if (opts.los >= opts.sance) return "neuspech";
  if (opts.pachatel === "hrac") return "odhalen_hrac";
  if (opts.pachatel === "cizi") return "dopaden_cizi";
  if (opts.pachatel === "nikdo") return "nehoda";
  return "neuspech";
}

export interface IncidentProAkce {
  status: StavIncidentu;
  category: KategorieIncidentu;
  culpritType: TypPachatele | null;
  odhalen: boolean;
  obvineni: number;
  /** `police_success`: `null` = policie ještě nešetřila. */
  policieVysledek: number | null;
  /** Odhalený pachatel je pořád v aktivním kádru klubu. */
  pachatelVKadru: boolean;
}

export interface DostupneAkce {
  obvinit: boolean;
  policie: boolean;
  tresty: AkceTrestu[];
}

export function dostupneAkce(i: IncidentProAkce): DostupneAkce {
  const resitelny = i.status === "otevreny" && (i.category === "kradez" || i.category === "poskozeni");
  const trestat = resitelny && i.odhalen && i.culpritType === "hrac" && i.pachatelVKadru;
  return {
    obvinit: resitelny && !i.odhalen && i.obvineni < MAX_OBVINENI,
    policie: resitelny && !i.odhalen && i.policieVysledek === null,
    tresty: trestat ? AKCE_TRESTU.filter((a) => a !== "policie" || i.policieVysledek === null) : [],
  };
}

/** Ptát se hráčů (výslech, spec 7a) jde, dokud je krádež nebo poškození nevyřešené, i když šetří policie. */
export function lzeVyslychat(i: Pick<IncidentProAkce, "status" | "category" | "odhalen">): boolean {
  return (i.status === "otevreny" || i.status === "policie")
    && (i.category === "kradez" || i.category === "poskozeni")
    && !i.odhalen;
}

export function nactiObvineni(raw: unknown): Obvineni[] {
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as Obvineni[]) : [];
  } catch (e) {
    logger.warn({ module: "incidents-vysetrovani" }, "nečitelný JSON obvinění", e);
    return [];
  }
}
