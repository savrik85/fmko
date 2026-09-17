/**
 * Životní situace hráčů (spec Část 4c). Čisté funkce bez DB.
 *
 * Situace není průšvih: nemá pachatele ani stopy. Je to stav, který na hráči pár týdnů visí
 * a promítá se do docházky, morálky, výmluv a chování v hospodě. Zápis a ukončení: `situace-db.ts`.
 */

import type { Rng } from "../generators/rng";
import {
  COOLDOWN_SITUACE_DNI, MAX_AKTIVNICH_SITUACI, MIN_ODEHRANYCH_ZAPASU, SANCE_SITUACE_ZA_DEN,
} from "./nastaveni";
import { text } from "./texty";
import type { HracKlubu, NavrhIncidentu, StavKlubu } from "./typy";

/** Povolání, o která se přijít nedá. */
const BEZ_PRACE = ["Student", "Důchodce", "Nezaměstnaný", "Bezdomovec"];
/** Povolání bez jistoty výdělku: dluhy si najdou spíš je. */
const NEJISTY_PRIJEM = ["Nezaměstnaný", "Bezdomovec", "Sezonní dělník"];

export interface DefiniceSituace {
  kind: string;
  label: string;
  emoji: string;
  muze: (h: HracKlubu) => boolean;
  vaha: (h: HracKlubu) => number;
  trvani: (rng: Rng) => number;
  moralka: number;
  absence: null | {
    druh: "porod" | "nemocna_mama" | "stehovani";
    /** Za kolik dní od vzniku hráč chybí. Vždy aspoň `MIN_OHLASENI_ABSENCE_DNI`, řeší volající. */
    dni: (rng: Rng) => number;
    delka: (rng: Rng) => number;
  };
}

export const KATALOG_SITUACI: DefiniceSituace[] = [
  {
    kind: "dluhy", label: "Dluhy", emoji: "💸",
    muze: () => true,
    vaha: (h) => 1 * (NEJISTY_PRIJEM.includes(h.povolani) ? 2 : 1) * (h.alkohol >= 60 ? 1.5 : 1),
    trvani: (rng) => rng.int(21, 35),
    moralka: 0,
    absence: null,
  },
  {
    kind: "prisel_o_praci", label: "Ztráta práce", emoji: "🧰",
    muze: (h) => h.povolani !== "" && !BEZ_PRACE.includes(h.povolani),
    vaha: () => 1,
    trvani: () => 21,
    moralka: -6,
    absence: null,
  },
  {
    kind: "rozvod", label: "Rozvod", emoji: "💔",
    muze: (h) => h.vek >= 24,
    vaha: () => 1,
    trvani: () => 28,
    moralka: -10,
    // První týden se stěhuje: jeden den mimo, ohlášený dopředu.
    absence: { druh: "stehovani", dni: (rng) => rng.int(2, 6), delka: () => 1 },
  },
  {
    kind: "zabaveny_ridicak", label: "Zabavený řidičák", emoji: "🚫",
    muze: (h) => h.alkohol >= 60,
    vaha: (h) => 1 + (h.alkohol >= 80 ? 1 : 0),
    trvani: () => 30,
    moralka: -2,
    absence: null,
  },
  {
    kind: "svatba_spoluhrace", label: "Svatba", emoji: "💍",
    // Ženit se chodí ten, kdo už nebydlí u rodičů a ještě není z toho venku (`domacnost`, chat-kontext).
    muze: (h) => h.vek >= 24 && h.vek <= 40,
    vaha: () => 1,
    trvani: () => 1,
    moralka: 3,
    absence: null,
  },
  {
    kind: "narozeni_ditete", label: "Narození dítěte", emoji: "👶",
    muze: (h) => h.vek >= 22 && h.vek <= 40,
    vaha: () => 1,
    trvani: (rng) => rng.int(3, 5),
    moralka: 8,
    absence: { druh: "porod", dni: (rng) => rng.int(2, 3), delka: (rng) => rng.int(1, 3) },
  },
  {
    kind: "nemocny_rodic", label: "Nemocný rodič", emoji: "🏥",
    muze: (h) => h.vek >= 25,
    vaha: () => 1,
    trvani: (rng) => rng.int(4, 7),
    moralka: -4,
    absence: { druh: "nemocna_mama", dni: (rng) => rng.int(2, 3), delka: (rng) => rng.int(2, 4) },
  },
];

export const SITUACE_PODLE_KIND = new Map(KATALOG_SITUACI.map((d) => [d.kind, d]));

export function nazevSituace(kind: string): string {
  return SITUACE_PODLE_KIND.get(kind)?.label ?? "Životní situace";
}

const DEN_MS = 86_400_000;

function naCooldownu(stav: StavKlubu, kind: string): boolean {
  const posledni = stav.posledniVyskyt[kind];
  if (!posledni) return false;
  const rozdil = (Date.parse(stav.den) - Date.parse(posledni)) / DEN_MS;
  return rozdil >= 0 && rozdil < COOLDOWN_SITUACE_DNI;
}

/**
 * Nová situace pro jeden klub a den (spec 4c, 4e). `null`, když se nic neděje:
 * nový klub, plný limit, nikdo volný nebo prostě vyšel los.
 */
export function vylosujSituaci(stav: StavKlubu, rng: Rng): NavrhIncidentu | null {
  if (stav.odehranychZapasu < MIN_ODEHRANYCH_ZAPASU) return null;
  if (stav.situace.size >= MAX_AKTIVNICH_SITUACI) return null;
  if (rng.random() >= SANCE_SITUACE_ZA_DEN) return null;

  const volni = stav.kadr.filter((h) => !stav.situace.has(h.id));
  const moznosti: Array<{ klic: string; d: DefiniceSituace; h: HracKlubu; vaha: number }> = [];
  for (const d of KATALOG_SITUACI) {
    if (naCooldownu(stav, d.kind)) continue;
    for (const h of volni) {
      if (!d.muze(h)) continue;
      const vaha = d.vaha(h);
      if (vaha > 0) moznosti.push({ klic: `${d.kind}|${h.id}`, d, h, vaha });
    }
  }
  if (moznosti.length === 0) return null;

  const klic = rng.weighted(Object.fromEntries(moznosti.map((m) => [m.klic, m.vaha])));
  const vybrana = moznosti.find((m) => m.klic === klic);
  if (!vybrana) return null;
  return {
    kind: vybrana.d.kind, category: "zivotni", status: "probiha", severity: 1,
    culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
    subjectPlayerId: vybrana.h.id, dniTrvani: vybrana.d.trvani(rng), ztraty: [],
    text: text(rng, `situace_${vybrana.d.kind}` as never, { hrac: vybrana.h.jmeno }),
  };
}
