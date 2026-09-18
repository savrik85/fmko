/**
 * Stopy k incidentu (spec Část 5b). Čisté funkce bez DB.
 *
 * Tvrdé pravidlo: stopa vznikne jen ze zdroje, který klub skutečně má. Bez
 * kamery nic nenatočí kamera, bez správce nic neviděl správce. A stopy nelžou:
 * když na někoho ukazují, je to skutečný pachatel.
 */

import { efektyZabezpeceni, ZABEZPECENI_MIN_STAV } from "../equipment/equipment-generator";
import type { Rng } from "../generators/rng";
import { BONUS_POLICIE, KAMARADSKE_VZTAHY, SILA_KAMARADSTVI } from "./nastaveni";
import { text } from "./texty";
import type { NavrhIncidentu, NavrhStopy, StavKlubu, ZdrojStopy } from "./typy";

export type MistoIncidentu = "sklad" | "kabiny" | "parkoviste" | "hriste" | "stanek";

/** Kde se incident stal. Podle místa se pozná, jestli na něj kamera vidí. */
export const MISTO_INCIDENTU: Record<string, MistoIncidentu> = {
  vloupani_sklad: "sklad",
  // Vitrína s poháry stojí v klubovně u kabin.
  vitrina: "kabiny",
  dodavka_pujcena: "parkoviste",
  dodavka_ukradena: "parkoviste",
  kradez_kamery: "kabiny",
  oslava_v_kabine: "kabiny",
  kopnute_dvere: "kabiny",
  koleje_trakturek: "hriste",
  pozar_grilu: "stanek",
  svetlice: "hriste",
  vandal: "hriste",
  // Občerstvení i tombola se prodávají u stánku.
  kasa_obcerstveni: "stanek",
  tombola: "stanek",
};

/** Kolik pokrytí kamer (`cameraCoverage`) místo potřebuje: 1 = kabiny a sklad, 2 = celý areál. */
const POTREBNE_POKRYTI: Record<MistoIncidentu, number> = {
  sklad: 1, kabiny: 1, parkoviste: 2, hriste: 2, stanek: 2,
};

export const MISTO_TEXT: Record<MistoIncidentu, string> = {
  sklad: "u skladu", kabiny: "u kabin", parkoviste: "na parkovišti", hriste: "na hřišti", stanek: "u stánku",
};

export interface ZdrojeStop {
  /** Úsudek najatého správce hřiště (`staff_members.judgement`), `null` bez správce. */
  spravceUsudek: number | null;
  /** Vztahy pachatele s ostatními hráči. Prázdné u cizího pachatele. */
  vztahyPachatele: Array<{ hracId: string; typ: string; sila: number }>;
}

/** „Franta Novák, Pepa Kos nebo Jan Vrba". */
export function seznamJmen(jmena: string[]): string {
  if (jmena.length <= 1) return jmena[0] ?? "";
  return `${jmena.slice(0, -1).join(", ")} nebo ${jmena[jmena.length - 1]}`;
}

function stopa(zdroj: ZdrojStopy, sila: 1 | 2 | 3, bonusPolicie: number, textStopy: string, dalsi: Partial<NavrhStopy> = {}): NavrhStopy {
  return { zdroj, ukazujeNa: null, podezreli: null, drzitel: null, sila, bonusPolicie, text: textStopy, nalezena: true, ...dalsi };
}

export function vygenerujStopy(stav: StavKlubu, navrh: NavrhIncidentu, zdroje: ZdrojeStop, rng: Rng): NavrhStopy[] {
  // Vyšetřuje se jen otevřená krádež nebo poškození s neznámým pachatelem.
  if (navrh.status !== "otevreny" || navrh.culpritRevealed) return [];
  if (navrh.category !== "kradez" && navrh.category !== "poskozeni") return [];
  if (navrh.culpritType !== "hrac" && navrh.culpritType !== "cizi") return [];
  const misto = MISTO_INCIDENTU[navrh.kind];
  if (!misto) return [];
  const pachatel = navrh.culpritType === "hrac" ? stav.kadr.find((h) => h.id === navrh.culpritPlayerId) ?? null : null;
  if (navrh.culpritType === "hrac" && !pachatel) return [];

  const kde = MISTO_TEXT[misto];
  const stopy: NavrhStopy[] = [];

  // Kamera. Ukradené kamery nenatočí nic, zloděj je vzal jako první.
  const uroven = stav.vybaveni.area_security ?? 0;
  const stavKamer = stav.vybaveni.area_security_condition ?? 50;
  const miriNaMisto = efektyZabezpeceni(uroven, 100).cameraCoverage >= POTREBNE_POKRYTI[misto];
  if (navrh.kind !== "kradez_kamery" && miriNaMisto) {
    if (stavKamer < ZABEZPECENI_MIN_STAV) {
      stopy.push(stopa("kamera", 1, 0, text(rng, "stopa_kamera_nefunkcni", { stav: String(stavKamer) })));
    } else if (pachatel) {
      const sance = uroven >= 3 ? 0.7 + stavKamer / 333 : 0.5 + stavKamer / 200;
      stopy.push(rng.random() < sance
        ? stopa("kamera", 3, BONUS_POLICIE.kameraIdentita, text(rng, "stopa_kamera_hrac", { hrac: pachatel.jmeno, misto: kde }), { ukazujeNa: pachatel.id })
        : stopa("kamera", 1, BONUS_POLICIE.kameraBezIdentity, text(rng, "stopa_kamera_postava", { misto: kde })));
    } else {
      stopy.push(stopa("kamera", 1, BONUS_POLICIE.kameraBezIdentity, text(rng, "stopa_kamera_cizi", { misto: kde })));
    }
  }

  // Správce hřiště, jen když ho klub má.
  if (zdroje.spravceUsudek !== null && rng.random() < 0.1 + zdroje.spravceUsudek / 40) {
    stopy.push(pachatel
      ? stopa("spravce", 2, BONUS_POLICIE.svedek, text(rng, "stopa_spravce_hrac", { hrac: pachatel.jmeno, misto: kde }), { ukazujeNa: pachatel.id })
      : stopa("spravce", 2, BONUS_POLICIE.spravceCizi, text(rng, "stopa_spravce_cizi", { misto: kde })));
  }

  // Soused něco viděl jen tam, kde se v noci svítí.
  if ((stav.stadion.lighting ?? 0) >= 1 && rng.random() < 0.25) {
    if (pachatel) {
      const ostatni = rng.shuffle(stav.kadr.filter((h) => h.id !== pachatel.id)).slice(0, rng.int(1, 2));
      if (ostatni.length > 0) {
        const podezreli = rng.shuffle([pachatel, ...ostatni]);
        stopy.push(stopa("soused", 1, BONUS_POLICIE.soused,
          text(rng, "stopa_soused_hraci", { jmena: seznamJmen(podezreli.map((h) => h.jmeno)) }),
          { podezreli: podezreli.map((h) => h.id) }));
      }
    } else {
      stopy.push(stopa("soused", 1, BONUS_POLICIE.soused, text(rng, "stopa_soused_cizi")));
    }
  }

  if (!pachatel) return stopy;

  // Svědci, kamarádi a rivalové: stopu mají u sebe, manažer ji získá až výslechem (fáze 4).
  const podleId = new Map(stav.kadr.map((h) => [h.id, h]));
  for (const id of stav.hospodaVcera) {
    const svedek = podleId.get(id);
    if (!svedek || svedek.id === pachatel.id) continue;
    if (rng.random() >= 0.3) continue;
    stopy.push(stopa("svedek", 2, BONUS_POLICIE.svedek,
      text(rng, "stopa_svedek", { svedek: svedek.jmeno, hrac: pachatel.jmeno, misto: kde }),
      { ukazujeNa: pachatel.id, drzitel: svedek.id, nalezena: false }));
  }
  for (const v of zdroje.vztahyPachatele) {
    const hrac = podleId.get(v.hracId);
    if (!hrac || hrac.id === pachatel.id) continue;
    if ((KAMARADSKE_VZTAHY as readonly string[]).includes(v.typ) && v.sila >= SILA_KAMARADSTVI) {
      stopy.push(stopa("kamarad", 2, BONUS_POLICIE.svedek,
        text(rng, "stopa_kamarad", { svedek: hrac.jmeno, hrac: pachatel.jmeno }),
        { ukazujeNa: pachatel.id, drzitel: hrac.id, nalezena: false }));
    } else if (v.typ === "rivals" && rng.random() < 0.4) {
      stopy.push(stopa("rival", 2, BONUS_POLICIE.svedek,
        text(rng, "stopa_rival", { svedek: hrac.jmeno, hrac: pachatel.jmeno }),
        { ukazujeNa: pachatel.id, drzitel: hrac.id, nalezena: false }));
    }
  }
  return stopy;
}

/** Nalezená usvědčující stopa odhalí pachatele hned (spec 5b). */
export function odhalujePachatele(stopy: readonly NavrhStopy[]): boolean {
  return stopy.some((s) => s.nalezena && s.sila === 3 && s.ukazujeNa !== null);
}
