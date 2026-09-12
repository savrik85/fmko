/**
 * Koho má která parta ráda a koho nemůže vystát.
 *
 * Každá parta soudí podle sebe. Kotel chce dříče, co nechá na hřišti kůži —
 * rating ho zajímá až potom. Pamětníci ctí toho, kdo je v klubu nejdéle.
 * Rodiny chtějí slušňáka, kterého můžou dětem ukázat. Štamgasti mají nejradši
 * chlapa, co si po zápase sedne k pípě. A parta z okolí drží svého.
 *
 * Proto tu není jeden žebříček „nejlepší hráč" se čtyřmi popisky, ale čtyři
 * různé váhy nad týmiž vlastnostmi. Kdyby všechny party milovaly toho samého,
 * nemělo by cenu je rozlišovat.
 *
 * Bez DB, aby to šlo testovat.
 */

import type { FanGroupKind } from "./fan-groups";

/** Co o hráči parta ví — všechno už v `players` je, nic se nedopočítává jinde. */
export interface HodnocenyHrac {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string | null;
  position: string;
  age: number;
  overallRating: number;
  /** 0–100 z `personality`. */
  workRate: number;
  aggression: number;
  discipline: number;
  patriotism: number;
  leadership: number;
  alcohol: number;
  /** Odehrané zápasy za klub — z `experience`. */
  experience: number;
  /** Bydlí v obci klubu? Parta z okolí a pamětníci to řeší. */
  domaci: boolean;
  /** Góly a asistence v sezóně — výkon, který je vidět. */
  goly: number;
  asistence: number;
  /** Kolik zápasů po sobě neodehrál ani minutu. Miláček na lavičce parta neřeší dlouho. */
  zapasuBezMinuty: number;
}

/**
 * Váhy jednotlivých vlastností podle druhu party. Kladná váha = čím víc, tím
 * oblíbenější; záporná = odpuzuje.
 */
type Vahy = Partial<Record<keyof HodnocenyHrac | "mladik" | "veteran", number>>;

const VAHY_OBLIBY: Record<FanGroupKind, Vahy> = {
  // Kotel: kdo se rve o každý míč. Hvězda, co si šetří dres, je jim ukradená.
  kotel: { workRate: 1.0, aggression: 0.7, patriotism: 0.6, goly: 2.2, domaci: 12, overallRating: 0.25, discipline: -0.2 },
  // Štamgasti: chlap od vedle, co dá gól a pak si s nimi dá pivo.
  stamgasti: { goly: 2.5, asistence: 1.2, alcohol: 0.35, leadership: 0.5, domaci: 8, overallRating: 0.3 },
  // Rodiny: slušný kluk, kterého můžou dětem ukázat.
  rodiny: { discipline: 1.1, mladik: 14, goly: 1.4, aggression: -0.8, alcohol: -0.7, overallRating: 0.3 },
  // Pamětníci: kdo tu je nejdéle a je odsud. Výkon až potom.
  pametnici: { experience: 0.5, veteran: 16, patriotism: 1.1, domaci: 14, leadership: 0.6, discipline: 0.4 },
  // Parta z okolí: drží svého, jinak koukají na góly.
  parta_z_okoli: { domaci: 18, goly: 1.8, workRate: 0.6, patriotism: 0.5, overallRating: 0.2 },
};

/** Skóre obliby. Vyšší = oblíbenější; záporné = spíš otloukánek. */
export function skoreObliby(kind: FanGroupKind, h: HodnocenyHrac): number {
  const v = VAHY_OBLIBY[kind] ?? {};
  let s = 0;
  s += (v.workRate ?? 0) * h.workRate / 10;
  s += (v.aggression ?? 0) * h.aggression / 10;
  s += (v.discipline ?? 0) * h.discipline / 10;
  s += (v.patriotism ?? 0) * h.patriotism / 10;
  s += (v.leadership ?? 0) * h.leadership / 10;
  s += (v.alcohol ?? 0) * h.alcohol / 10;
  s += (v.overallRating ?? 0) * h.overallRating / 10;
  s += (v.experience ?? 0) * Math.min(120, h.experience) / 10;
  s += (v.goly ?? 0) * h.goly;
  s += (v.asistence ?? 0) * h.asistence;
  if (h.domaci) s += v.domaci ?? 0;
  if (h.age <= 20) s += v.mladik ?? 0;
  if (h.age >= 32) s += v.veteran ?? 0;

  // Kdo nehraje, na toho se zapomíná — ať je jakkoli šikovný.
  s -= Math.min(6, h.zapasuBezMinuty) * 3;
  return Math.round(s * 10) / 10;
}

export type Stance = "oblibenec" | "otloukanek";

export interface VolbaParty {
  hrac: HodnocenyHrac;
  stance: Stance;
  score: number;
  duvod: string;
}

/**
 * O kolik musí vyzyvatel překonat stávajícího miláčka, aby se vyměnil.
 *
 * Bez tohohle by se oblíbenec měnil po každém zápase podle toho, kdo zrovna dal
 * gól, a „kotel ho miluje" by neznamenalo nic.
 */
export const NASKOK_NA_VYMENU = 8;

/**
 * Kdo je miláček a kdo otloukánek. Vrací `null` pro stranu, na kterou není
 * dost kandidátů — kádr o pěti lidech otloukánka nepotřebuje.
 */
export function vyberOblibence(
  kind: FanGroupKind,
  kadr: readonly HodnocenyHrac[],
  stavajici: { oblibenec?: { playerId: string; score: number }; otloukanek?: { playerId: string; score: number } } = {},
): { oblibenec: VolbaParty | null; otloukanek: VolbaParty | null } {
  if (kadr.length < 6) return { oblibenec: null, otloukanek: null };

  const ohodnocene = kadr
    .map((h) => ({ hrac: h, score: skoreObliby(kind, h) }))
    .sort((a, b) => b.score - a.score);

  const nejlepsi = ohodnocene[0];
  const nejhorsi = ohodnocene[ohodnocene.length - 1];

  // Otloukánek dává smysl jen tam, kde je co vyčítat — když je nejhorší skóre
  // pořád slušné, parta nikoho nebuká.
  const rozptyl = nejlepsi.score - nejhorsi.score;

  const drz = (
    s: Stance,
    vyzyvatel: { hrac: HodnocenyHrac; score: number },
  ): VolbaParty | null => {
    const stary = s === "oblibenec" ? stavajici.oblibenec : stavajici.otloukanek;
    if (stary && stary.playerId !== vyzyvatel.hrac.id) {
      const staryVKadru = ohodnocene.find((o) => o.hrac.id === stary.playerId);
      if (staryVKadru) {
        const naskok = s === "oblibenec"
          ? vyzyvatel.score - staryVKadru.score
          : staryVKadru.score - vyzyvatel.score;
        if (naskok < NASKOK_NA_VYMENU) {
          return { hrac: staryVKadru.hrac, stance: s, score: staryVKadru.score, duvod: duvodVolby(kind, staryVKadru.hrac, s) };
        }
      }
    }
    return { hrac: vyzyvatel.hrac, stance: s, score: vyzyvatel.score, duvod: duvodVolby(kind, vyzyvatel.hrac, s) };
  };

  return {
    oblibenec: drz("oblibenec", nejlepsi),
    otloukanek: rozptyl >= 12 ? drz("otloukanek", nejhorsi) : null,
  };
}

/** Proč zrovna on — jedna věta hlasem té party. */
export function duvodVolby(kind: FanGroupKind, h: HodnocenyHrac, stance: Stance): string {
  if (stance === "oblibenec") {
    if (h.domaci && (kind === "parta_z_okoli" || kind === "pametnici")) return "Je odsud. To u nich váží nejvíc.";
    if (kind === "kotel") return h.workRate >= 65 ? "Nechá tam kůži pokaždé. Za to ho berou." : "Rve se o každý míč.";
    if (kind === "stamgasti") return h.goly >= 3 ? "Dává góly a po zápase se s nimi baví." : "Chlap od vedle, ne hvězda.";
    if (kind === "rodiny") return h.age <= 20 ? "Slušný kluk, děti po něm chtějí podpis." : "Nikdy se nepere, děti ho mají rády.";
    if (kind === "pametnici") return h.experience >= 60 ? "Je tu nejdýl ze všech. To se cení." : "Dělá to poctivě, po staru.";
    return "Berou ho za svého.";
  }
  if (kind === "kotel") return h.workRate < 45 ? "Chodí po hřišti. To u kotle neprojde." : "Nedává do toho nic.";
  if (kind === "rodiny") return h.aggression >= 60 ? "Pořád se s někým hádá, děti to vidí." : "Nejde jim pod nos.";
  if (kind === "pametnici") return "Přišel odjinud a chová se jako hvězda.";
  if (kind === "stamgasti") return "Za celou sezónu nedal nic a ještě se na ně vykašle.";
  return "Tenhle jim sedne nejmíň.";
}
