/**
 * Katalog incidentů fáze 1: krádeže a poškození (spec Část 4a, 4b).
 *
 * Čisté funkce bez DB. `muze` je levná kontrola podmínek bez náhody,
 * `vytvor` vybere pachatele a škodu. Tvrdé pravidlo: každá škoda míří jen
 * na věc, kterou klub skutečně má; testy v katalog.test.ts to hlídají.
 */

import { CATEGORIES, CATEGORY_LABELS, cumulativeInvestment, efektyZabezpeceni } from "../equipment/equipment-generator";
import type { Rng } from "../generators/rng";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import {
  DODAVKA_STAV_PRAH, KASA_PODIL_MAX, KASA_PODIL_MIN, MECHANIK_STAV, OBSLUHA_SANCE, PODIL_POKUSU_ZVENKU,
  POVOLANI_HRDINY, POVOLANI_MECHANIKA, POVOLANI_REMESLNIKU, REMESLNIK_STAV, STROP_ZTRATY_KC, STROP_ZTRATY_PODIL,
  TOMBOLA_PODIL_MAX, TOMBOLA_PODIL_MIN, VAHA_HRDINY, ZPRONEVERA_MAX_KC, ZPRONEVERA_MIN_KC, ZPRONEVERA_SANCE_USUDEK_1,
  ZPRONEVERA_SANCE_USUDEK_20, ZPRONEVERA_STROP_PODIL,
} from "./nastaveni";
import { sanceUspechuZvenku, vyberHrace } from "./pachatel";
import { text } from "./texty";
import type { HracKlubu, KategorieIncidentu, NavrhIncidentu, StavKlubu, Ztrata } from "./typy";

export interface DefiniceIncidentu {
  kind: string;
  label: string;
  emoji: string;
  category: KategorieIncidentu;
  /** Váha v náhodném losu. 0 = jen spouštěný nebo vedlejší výsledek. */
  vaha: number;
  spousteny: boolean;
  muze: (stav: StavKlubu) => boolean;
  /** `null`, když se nakonec nic nestane (odradil zámek, chybí kandidát). */
  vytvor: (stav: StavKlubu, rng: Rng) => NavrhIncidentu | null;
}

/** Co jde odnést ze skladu. Dodávka, vitrína a zabezpečení mají vlastní typy. */
export const PRENOSNE: readonly string[] = [
  "balls", "jerseys", "boots_stock", "goalkeeper_gear", "bibs", "training_cones", "first_aid",
  "sports_drinks", "water_bottles", "coffee_maker", "video_setup", "pa_system", "fan_drums", "winter_gear",
];

/** Venkovní zařízení, na které dosáhne vandal. */
const VENKOVNI_ZARIZENI = ["fence", "stands", "entrance_gate"] as const;

/** Co rozbije oslava v kabině (spec 4b): šatny, sprchy, sociálky. Stánek ne. */
const KABINY = ["changing_rooms", "showers", "toilets"] as const;

const uroven = (s: StavKlubu, k: string) => s.vybaveni[k] ?? 0;
const stavVeci = (s: StavKlubu, k: string) => s.vybaveni[`${k}_condition`] ?? 50;
const zarizeni = (s: StavKlubu, k: string) => s.stadion[k] ?? 0;

function zavaznostPodleHodnoty(kategorie: string, lv: number): 1 | 2 | 3 {
  const hodnota = cumulativeInvestment(kategorie, lv);
  return hodnota < 10_000 ? 1 : hodnota < 60_000 ? 2 : 3;
}

function zabezpeceni(s: StavKlubu) {
  return efektyZabezpeceni(uroven(s, "area_security"), stavVeci(s, "area_security"));
}

function pijaciZHospody(s: StavKlubu): HracKlubu[] {
  const byli = new Set(s.hospodaVcera);
  return s.kadr
    .filter((h) => byli.has(h.id) && h.alkohol >= 60)
    .sort((a, b) => b.alkohol - a.alkohol || a.id.localeCompare(b.id));
}

/** Kategorie, které umí opravit řemeslník. Dodávka má vlastního automechanika (spec 4d). */
const KATEGORIE_REMESLNIKA: readonly string[] = CATEGORIES.filter((k) => k !== "team_van");

/** Vybavení, které klub skutečně má a je ve špatném stavu (kandidát na opravu řemeslníkem). */
function poskozeneVybaveni(s: StavKlubu): string[] {
  return KATEGORIE_REMESLNIKA.filter((k) => uroven(s, k) >= 1 && stavVeci(s, k) < 60);
}

function remeslnici(s: StavKlubu): HracKlubu[] {
  return s.kadr.filter((h) => (POVOLANI_REMESLNIKU as readonly string[]).includes(h.povolani));
}

function mechanici(s: StavKlubu): HracKlubu[] {
  return s.kadr.filter((h) => h.povolani === POVOLANI_MECHANIKA);
}

function vzteklounSCervenou(s: StavKlubu): HracKlubu | null {
  const vylouceni = new Set(s.vcera?.cervenaKarta ?? []);
  return s.kadr
    .filter((h) => vylouceni.has(h.id) && h.temperament >= 65)
    .sort((a, b) => b.temperament - a.temperament || a.id.localeCompare(b.id))[0] ?? null;
}

type Pokus = { typ: "hrac"; hrac: HracKlubu } | { typ: "cizi" } | { typ: "alarm" };
type Kdo = { typ: "hrac"; hrac: HracKlubu } | { typ: "cizi" };

/**
 * Kdo krade: hráč s klíčem, nebo zloděj zvenku. Zloděje zvenku může odradit
 * plot, osvětlení a zámek (pak se nestane nic) nebo vyplašit alarm, když ho
 * klub má v použitelném stavu a místo pokrývá (`alarmOdUrovne`).
 */
function pokusOKradez(s: StavKlubu, rng: Rng, alarmOdUrovne: number): Pokus | null {
  const hrac = vyberHrace(s.kadr, rng);
  const zvenku = !hrac || rng.random() < PODIL_POKUSU_ZVENKU;
  if (!zvenku && hrac) return { typ: "hrac", hrac };
  const fx = zabezpeceni(s);
  if (rng.random() >= sanceUspechuZvenku(s.stadion, fx.theftRiskMul)) return null;
  if (uroven(s, "area_security") >= alarmOdUrovne && rng.random() < fx.alarmChance) return { typ: "alarm" };
  return { typ: "cizi" };
}

function alarmNavrh(rng: Rng): NavrhIncidentu {
  return {
    kind: "alarm_vyplasil", category: "pozitivni", status: "uzavreny", severity: 1,
    culpritType: "cizi", culpritPlayerId: null, culpritRevealed: false,
    ztraty: [], text: text(rng, "alarm_vyplasil"),
  };
}

function pachatel(p: Kdo) {
  return {
    culpritType: p.typ,
    culpritPlayerId: p.typ === "hrac" ? p.hrac.id : null,
    culpritRevealed: false,
  } as const;
}

/** Kolik hotovosti zmizí: podíl z tržby, ale nikdy přes strop ztráty (spec 4e). */
function castkaZTrzby(s: StavKlubu, rng: Rng, trzba: number, min: number, max: number): number {
  const hrube = Math.round((trzba * rng.int(min, max)) / 100);
  const strop = Math.min(Math.round(s.rozpocet * STROP_ZTRATY_PODIL), STROP_ZTRATY_KC);
  return Math.max(0, Math.min(hrube, strop));
}

/**
 * Šance, že si ekonom toho dne přisvojí peníze (spec 4a).
 *
 * `judgement` jede na škále `staff_members` 1 až 20, ne 0 až 10: staff-effects.ts dělí
 * dvaceti, stopy.ts počítá `spravceUsudek / 40` a staff-generator.ts losuje ekonomovi
 * úsudek jako primární atribut až do 19. Šance proto klesá lineárně z 0,9 při úsudku 1
 * na 0,15 při úsudku 20 a nikdy nespadne na nulu: pečlivý ekonom sahá na klubovou
 * hotovost vzácněji, protože pokušení odolá častěji, ale příležitost má pořád stejnou.
 * Nulová šance by znamenala, že si klub vyšší mzdou koupí jistotu, a mechanismus by
 * u lepší poloviny ekonomů přestal existovat.
 *
 * Los padá ve `vytvor`, ne přes `vaha` (spouštěné položky váhu nepoužívají). Před ním
 * ještě losovani.ts projde denní bránou `SANCE_SPOUSTENYCH.zpronevera_ekonoma` (0,02),
 * takže skutečná denní šance je 0,3 % u úsudku 20 až 1,8 % u úsudku 1.
 *
 * Nekonečný nebo `NaN` vstup (poškozená hodnota v DB) spadne na stejnou výchozí pětku
 * jako `stav-klubu.ts` u chybějícího úsudku: `Math.min`/`Math.max` by `NaN` propustily
 * beze změny a `rng.random() >= NaN` je vždy nepravda, takže by zpronevěra padla pokaždé
 * místo nikdy.
 */
export function sanceZproneveryPodleUsudku(judgement: number): number {
  const vstup = Number.isFinite(judgement) ? judgement : 5;
  const usudek = Math.min(20, Math.max(1, vstup));
  return ZPRONEVERA_SANCE_USUDEK_1 - ((usudek - 1) * (ZPRONEVERA_SANCE_USUDEK_1 - ZPRONEVERA_SANCE_USUDEK_20)) / 19;
}

function skladNavrh(s: StavKlubu, rng: Rng, kdo: Kdo): NavrhIncidentu | null {
  const vlastnene = PRENOSNE.filter((k) => uroven(s, k) >= 1);
  if (vlastnene.length === 0) return null;
  // Zloděj bere to, co za něco stojí.
  const kategorie = rng.weighted(Object.fromEntries(vlastnene.map((k) => [k, cumulativeInvestment(k, uroven(s, k))])));
  const lv = uroven(s, kategorie);
  return {
    kind: "vloupani_sklad", category: "kradez", status: "otevreny",
    severity: zavaznostPodleHodnoty(kategorie, lv), ...pachatel(kdo),
    ztraty: [{ typ: "vybaveni", kategorie, uroven: lv, stav: stavVeci(s, kategorie), urovniDolu: lv }],
    text: text(rng, kdo.typ === "hrac" ? "vloupani_zevnitr" : "vloupani_zvenku", { vec: CATEGORY_LABELS[kategorie] ?? kategorie }),
  };
}

function vitrinaNavrh(s: StavKlubu, rng: Rng, kdo: Kdo): NavrhIncidentu | null {
  const lv = uroven(s, "trophy_case");
  if (lv < 2) return null;
  // Síň slávy se neukradne, poháry ano: vitrína přijde jen o jednu úroveň.
  return {
    kind: "vitrina", category: "kradez", status: "otevreny", severity: 2, ...pachatel(kdo),
    ztraty: [{ typ: "vybaveni", kategorie: "trophy_case", uroven: lv, stav: stavVeci(s, "trophy_case"), urovniDolu: 1 }],
    text: text(rng, "vitrina"),
  };
}

function dodavkaPujcenaNavrh(s: StavKlubu, rng: Rng, hrac: HracKlubu): NavrhIncidentu | null {
  if (s.zapasDnesNeboZitra || uroven(s, "team_van") < 1) return null;
  const pred = stavVeci(s, "team_van");
  const po = Math.max(5, pred - rng.int(30, 60));
  if (po >= pred) return null;
  return {
    kind: "dodavka_pujcena", category: "kradez", status: "otevreny", severity: 2,
    culpritType: "hrac", culpritPlayerId: hrac.id, culpritRevealed: false,
    ztraty: [{ typ: "vybaveni_stav", kategorie: "team_van", stavPred: pred, stavPo: po }],
    text: text(rng, "dodavka_pujcena"),
  };
}

function kolejeNavrh(s: StavKlubu, rng: Rng, hrac: HracKlubu): NavrhIncidentu | null {
  if (uroven(s, "mower") < 2) return null;
  const pred = zarizeni(s, "pitch_condition") || 50;
  const po = Math.max(5, pred - rng.int(8, 15));
  if (po >= pred) return null;
  return {
    kind: "koleje_trakturek", category: "poskozeni", status: "otevreny", severity: 1,
    culpritType: "hrac", culpritPlayerId: hrac.id, culpritRevealed: false,
    ztraty: [{ typ: "travnik", pred, po }],
    text: text(rng, "koleje_trakturek"),
  };
}

function kopnuteDvereNavrh(s: StavKlubu, rng: Rng, hrac: HracKlubu): NavrhIncidentu | null {
  if (zarizeni(s, "changing_rooms") < 1) return null;
  // Všichni viděli, kdo to byl: pachatel je známý hned.
  return {
    kind: "kopnute_dvere", category: "poskozeni", status: "otevreny", severity: 2,
    culpritType: "hrac", culpritPlayerId: hrac.id, culpritRevealed: true,
    ztraty: [{ typ: "stadion", zarizeni: "changing_rooms", urovni: 1 }],
    text: text(rng, "kopnute_dvere", { hrac: hrac.jmeno, zarizeni: FACILITY_LABELS.changing_rooms }),
  };
}

export const KATALOG: DefiniceIncidentu[] = [
  {
    kind: "vloupani_sklad", label: "Vloupání do skladu", emoji: "🥷", category: "kradez", vaha: 5, spousteny: false,
    muze: (s) => PRENOSNE.some((k) => uroven(s, k) >= 1),
    vytvor: (s, rng) => {
      if (!PRENOSNE.some((k) => uroven(s, k) >= 1)) return null;
      const kdo = pokusOKradez(s, rng, 2);
      if (!kdo) return null;
      if (kdo.typ === "alarm") return alarmNavrh(rng);
      return skladNavrh(s, rng, kdo);
    },
  },
  {
    kind: "vitrina", label: "Poháry z vitríny", emoji: "🏆", category: "kradez", vaha: 1, spousteny: false,
    muze: (s) => uroven(s, "trophy_case") >= 2,
    vytvor: (s, rng) => {
      if (uroven(s, "trophy_case") < 2) return null;
      const kdo = pokusOKradez(s, rng, 2);
      if (!kdo) return null;
      if (kdo.typ === "alarm") return alarmNavrh(rng);
      return vitrinaNavrh(s, rng, kdo);
    },
  },
  {
    kind: "dodavka_pujcena", label: "Půjčená dodávka", emoji: "🚐", category: "kradez", vaha: 2, spousteny: false,
    muze: (s) => uroven(s, "team_van") >= 1 && !s.zapasDnesNeboZitra,
    vytvor: (s, rng) => {
      if (s.zapasDnesNeboZitra || uroven(s, "team_van") < 1) return null;
      const hrac = vyberHrace(s.kadr, rng);
      return hrac ? dodavkaPujcenaNavrh(s, rng, hrac) : null;
    },
  },
  {
    kind: "dodavka_ukradena", label: "Ukradená dodávka", emoji: "🚐", category: "kradez", vaha: 0.3, spousteny: false,
    muze: (s) => uroven(s, "team_van") >= 1 && !s.zapasDnesNeboZitra,
    vytvor: (s, rng) => {
      if (s.zapasDnesNeboZitra) return null;
      const lv = uroven(s, "team_van");
      if (lv < 1) return null;
      const fx = zabezpeceni(s);
      if (rng.random() >= sanceUspechuZvenku(s.stadion, fx.theftRiskMul)) return null;
      // Parkoviště pokrývá jen kamerový systém celého areálu.
      if (uroven(s, "area_security") >= 3 && rng.random() < fx.alarmChance) return alarmNavrh(rng);
      return {
        kind: "dodavka_ukradena", category: "kradez", status: "otevreny", severity: 3,
        culpritType: "cizi", culpritPlayerId: null, culpritRevealed: false,
        ztraty: [{ typ: "vybaveni", kategorie: "team_van", uroven: lv, stav: stavVeci(s, "team_van"), urovniDolu: lv }],
        text: text(rng, "dodavka_ukradena"),
      };
    },
  },
  {
    kind: "kradez_kamery", label: "Ukradené kamery", emoji: "📹", category: "kradez", vaha: 0.5, spousteny: false,
    muze: (s) => uroven(s, "area_security") >= 2,
    vytvor: (s, rng) => {
      const lv = uroven(s, "area_security");
      if (lv < 2) return null;
      // Zabezpečení nechrání samo sebe, zloděj ho vyřadí jako první.
      if (rng.random() >= sanceUspechuZvenku(s.stadion, 1)) return null;
      return {
        kind: "kradez_kamery", category: "kradez", status: "otevreny",
        severity: zavaznostPodleHodnoty("area_security", lv),
        culpritType: "cizi", culpritPlayerId: null, culpritRevealed: false,
        ztraty: [{ typ: "vybaveni", kategorie: "area_security", uroven: lv, stav: stavVeci(s, "area_security"), urovniDolu: lv }],
        text: text(rng, "kradez_kamery"),
      };
    },
  },
  {
    kind: "oslava_v_kabine", label: "Oslava v kabině", emoji: "🍻", category: "poskozeni", vaha: 0, spousteny: true,
    muze: (s) => !!s.vcera?.vyhra && pijaciZHospody(s).length >= 2 && KABINY.some((k) => zarizeni(s, k) >= 1),
    vytvor: (s, rng) => {
      const pijaci = pijaciZHospody(s);
      const mozne = KABINY.filter((k) => zarizeni(s, k) >= 1);
      if (!s.vcera?.vyhra || pijaci.length < 2 || mozne.length === 0) return null;
      const kde = rng.pick(mozne);
      return {
        kind: "oslava_v_kabine", category: "poskozeni", status: "otevreny", severity: 2,
        culpritType: "hrac", culpritPlayerId: pijaci[0].id, culpritRevealed: false,
        ztraty: [{ typ: "stadion", zarizeni: kde, urovni: 1 }],
        text: text(rng, "oslava_v_kabine", { zarizeni: FACILITY_LABELS[kde] ?? kde }),
      };
    },
  },
  {
    kind: "kopnute_dvere", label: "Kopnuté dveře", emoji: "🚪", category: "poskozeni", vaha: 0, spousteny: true,
    muze: (s) => zarizeni(s, "changing_rooms") >= 1 && !!s.vcera?.doma && vzteklounSCervenou(s) !== null,
    vytvor: (s, rng) => {
      const h = vzteklounSCervenou(s);
      if (!h || !s.vcera?.doma) return null;
      return kopnuteDvereNavrh(s, rng, h);
    },
  },
  {
    kind: "koleje_trakturek", label: "Koleje od traktůrku", emoji: "🚜", category: "poskozeni", vaha: 1.5, spousteny: false,
    muze: (s) => uroven(s, "mower") >= 2,
    vytvor: (s, rng) => {
      if (uroven(s, "mower") < 2) return null;
      const hrac = vyberHrace(s.kadr, rng);
      return hrac ? kolejeNavrh(s, rng, hrac) : null;
    },
  },
  {
    kind: "pozar_grilu", label: "Požár od grilu", emoji: "🔥", category: "poskozeni", vaha: 1, spousteny: false,
    muze: (s) => uroven(s, "club_grill") >= 1,
    vytvor: (s, rng) => {
      const lv = uroven(s, "club_grill");
      if (lv < 1) return null;
      const hrac = rng.random() < 0.5 ? vyberHrace(s.kadr, rng) : null;
      // Klubovna s krbem neshoří celá, přijde o úroveň. Menší gril je na odpis.
      const ztraty: Ztrata[] = [{ typ: "vybaveni", kategorie: "club_grill", uroven: lv, stav: stavVeci(s, "club_grill"), urovniDolu: lv === 3 ? 1 : lv }];
      let t = text(rng, "pozar_grilu", { vec: CATEGORY_LABELS.club_grill });
      if (zarizeni(s, "refreshments") >= 1 && rng.random() < 0.3) {
        ztraty.push({ typ: "stadion", zarizeni: "refreshments", urovni: 1 });
        t += ` ${text(rng, "pozar_grilu_stanek", { zarizeni: FACILITY_LABELS.refreshments })}`;
      }
      return {
        kind: "pozar_grilu", category: "poskozeni", status: "otevreny", severity: 2,
        culpritType: hrac ? "hrac" : "nikdo", culpritPlayerId: hrac?.id ?? null, culpritRevealed: false,
        ztraty, text: t,
      };
    },
  },
  {
    kind: "svetlice", label: "Světlice na hřišti", emoji: "🎆", category: "poskozeni", vaha: 0, spousteny: true,
    muze: (s) => !!s.vcera?.vyhra && !!s.vcera.doma,
    vytvor: (s, rng) => {
      if (!s.vcera?.vyhra || !s.vcera.doma) return null;
      const hrac = rng.random() < 0.5 ? vyberHrace(s.kadr, rng) : null;
      const pred = zarizeni(s, "pitch_condition") || 50;
      const po = Math.max(5, pred - rng.int(5, 10));
      if (po >= pred) return null;
      return {
        kind: "svetlice", category: "poskozeni", status: "otevreny", severity: 1,
        culpritType: hrac ? "hrac" : "cizi", culpritPlayerId: hrac?.id ?? null, culpritRevealed: false,
        ztraty: [{ typ: "travnik", pred, po }],
        text: text(rng, "svetlice"),
      };
    },
  },
  {
    kind: "kasa_obcerstveni", label: "Vybraná kasa", emoji: "🧾", category: "kradez", vaha: 0, spousteny: true,
    muze: (s) => (s.vcera?.trzby.kasa ?? 0) > 0,
    vytvor: (s, rng) => {
      const trzba = s.vcera?.trzby.kasa ?? 0;
      if (trzba <= 0) return null;
      // Najatá obsluha stojí u kasy celý zápas: los na ni padne dřív, než se zkusí kdokoli
      // jiný (spec 5a). Bez obsluhy se rng vůbec netáhne, pořadí losů se tím nemění.
      if (s.obsluha && rng.random() < OBSLUHA_SANCE) {
        const castka = castkaZTrzby(s, rng, trzba, KASA_PODIL_MIN, KASA_PODIL_MAX);
        if (castka <= 0) return null;
        return {
          kind: "kasa_obcerstveni", category: "kradez", status: "uzavreny", severity: 2,
          culpritType: "zamestnanec", culpritPlayerId: null, culpritStaffId: s.obsluha.id, culpritRevealed: true,
          ztraty: [{ typ: "penize", castka, zdrojZapasId: s.vcera?.zapasId ?? undefined }],
          text: text(rng, "kasa_obsluha", { jmeno: s.obsluha.jmeno, castka: castka.toLocaleString("cs-CZ") }),
        };
      }
      const kdo = pokusOKradez(s, rng, 2);
      if (!kdo) return null;
      if (kdo.typ === "alarm") return alarmNavrh(rng);
      const castka = castkaZTrzby(s, rng, trzba, KASA_PODIL_MIN, KASA_PODIL_MAX);
      if (castka <= 0) return null;
      return {
        kind: "kasa_obcerstveni", category: "kradez", status: "otevreny", severity: 2, ...pachatel(kdo),
        ztraty: [{ typ: "penize", castka, zdrojZapasId: s.vcera?.zapasId ?? undefined }],
        text: text(rng, "kasa_obcerstveni", { castka: castka.toLocaleString("cs-CZ") }),
      };
    },
  },
  {
    kind: "tombola", label: "Okradená tombola", emoji: "🎟️", category: "kradez", vaha: 0, spousteny: true,
    muze: (s) => (s.vcera?.trzby.tombola ?? 0) > 0,
    vytvor: (s, rng) => {
      const trzba = s.vcera?.trzby.tombola ?? 0;
      if (trzba <= 0) return null;
      const kdo = pokusOKradez(s, rng, 2);
      if (!kdo) return null;
      if (kdo.typ === "alarm") return alarmNavrh(rng);
      const castka = castkaZTrzby(s, rng, trzba, TOMBOLA_PODIL_MIN, TOMBOLA_PODIL_MAX);
      if (castka <= 0) return null;
      return {
        kind: "tombola", category: "kradez", status: "otevreny", severity: 2, ...pachatel(kdo),
        ztraty: [{ typ: "penize", castka, zdrojZapasId: s.vcera?.zapasId ?? undefined }],
        text: text(rng, "tombola", { castka: castka.toLocaleString("cs-CZ") }),
      };
    },
  },
  {
    kind: "zpronevera_ekonoma", label: "Zpronevěra ekonoma", emoji: "💸", category: "kradez", vaha: 0, spousteny: true,
    muze: (s) => !!s.ekonom,
    vytvor: (s, rng) => {
      if (!s.ekonom) return null;
      if (rng.random() >= sanceZproneveryPodleUsudku(s.ekonom.judgement)) return null;
      const castka = Math.min(rng.int(ZPRONEVERA_MIN_KC, ZPRONEVERA_MAX_KC), Math.round(s.rozpocet * ZPRONEVERA_STROP_PODIL));
      if (castka < ZPRONEVERA_MIN_KC) return null;
      return {
        kind: "zpronevera_ekonoma", category: "kradez", status: "uzavreny", severity: 2,
        culpritType: "zamestnanec", culpritPlayerId: null, culpritStaffId: s.ekonom.id, culpritRevealed: true,
        ztraty: [{ typ: "penize", castka }],
        text: text(rng, "zpronevera_ekonoma", { jmeno: s.ekonom.jmeno, castka: castka.toLocaleString("cs-CZ") }),
      };
    },
  },
  {
    // Nelosuje se odsud: vzniká jen z `zpracujUtek` (utek-db.ts, spec 4a) mimo tenhle
    // los, protože má vlastní varovné signály a vlastní denní šanci. Záznam tu je jen
    // kvůli českému popisku a emoji pro `nazevIncidentu` a UI (routes/incidents.ts,
    // hospoda.ts) — `muze: () => false` zkratuje losovani.ts dřív, než padne rng.random().
    kind: "utek_s_penezi", label: "Útěk s penězi", emoji: "🏃", category: "kradez", vaha: 0, spousteny: true,
    muze: () => false,
    vytvor: () => null,
  },
  {
    kind: "vandal", label: "Vandalové", emoji: "💥", category: "poskozeni", vaha: 2, spousteny: false,
    muze: () => true,
    vytvor: (s, rng) => {
      if (rng.random() >= sanceUspechuZvenku(s.stadion, 1)) return null;
      const mozne = VENKOVNI_ZARIZENI.filter((k) => zarizeni(s, k) >= 1);
      if (mozne.length > 0 && rng.random() < 0.6) {
        const kde = rng.pick(mozne);
        return {
          kind: "vandal", category: "poskozeni", status: "otevreny", severity: 2,
          culpritType: "cizi", culpritPlayerId: null, culpritRevealed: false,
          ztraty: [{ typ: "stadion", zarizeni: kde, urovni: 1 }],
          text: text(rng, "vandal_zarizeni", { zarizeni: FACILITY_LABELS[kde] ?? kde }),
        };
      }
      const pred = zarizeni(s, "pitch_condition") || 50;
      const po = Math.max(5, pred - 5);
      if (po >= pred) return null;
      return {
        kind: "vandal", category: "poskozeni", status: "otevreny", severity: 1,
        culpritType: "cizi", culpritPlayerId: null, culpritRevealed: false,
        ztraty: [{ typ: "travnik", pred, po }],
        text: text(rng, "vandal_travnik"),
      };
    },
  },
  {
    // Nelosuje se: vzniká jen jako výsledek pokusu o krádež (pokusOKradez).
    kind: "alarm_vyplasil", label: "Alarm vyplašil zloděje", emoji: "🚨", category: "pozitivni", vaha: 0, spousteny: false,
    muze: () => false,
    vytvor: () => null,
  },
  {
    // Pozitivní incidenty (spec 4d): vaha 0, nelosují se v poolu problémů výš (vylosujIncident
    // bere jen `vaha > 0`), vlastní denní los na ně přijde v pozdější fázi (spec 4e, Task 5).
    kind: "remeslnik_opravil", label: "Řemeslník opravil škodu", emoji: "🛠️", category: "pozitivni", vaha: 0, spousteny: false,
    muze: (s) => (s.poskozeni.length > 0 || poskozeneVybaveni(s).length > 0) && remeslnici(s).length > 0,
    vytvor: (s, rng) => {
      const kandidati = remeslnici(s);
      if (kandidati.length === 0) return null;
      const spatnyStav = poskozeneVybaveni(s);
      if (s.poskozeni.length === 0 && spatnyStav.length === 0) return null;
      const hrac = rng.pick(kandidati);
      // Když je na výběr obojí, padne los. Jinak vezme to jediné, co jde.
      const opravitSkodu = s.poskozeni.length > 0 && (spatnyStav.length === 0 || rng.random() < 0.5);
      if (opravitSkodu) {
        const d = rng.pick(s.poskozeni);
        return {
          kind: "remeslnik_opravil", category: "pozitivni", status: "uzavreny", severity: 1,
          culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
          ztraty: [{ typ: "oprava", damageId: d.id, zarizeni: d.zarizeni }],
          text: text(rng, "remeslnik_opravil", { hrac: hrac.jmeno, vec: FACILITY_LABELS[d.zarizeni] ?? d.zarizeni }),
        };
      }
      const kategorie = rng.pick(spatnyStav);
      return {
        kind: "remeslnik_opravil", category: "pozitivni", status: "uzavreny", severity: 1,
        culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
        ztraty: [{ typ: "vybaveni_nahoru", kategorie, stavNahoru: REMESLNIK_STAV }],
        text: text(rng, "remeslnik_opravil", { hrac: hrac.jmeno, vec: CATEGORY_LABELS[kategorie] ?? kategorie }),
      };
    },
  },
  {
    kind: "mechanik_dodavka", label: "Automechanik spravil dodávku", emoji: "🔧", category: "pozitivni", vaha: 0, spousteny: false,
    muze: (s) => uroven(s, "team_van") >= 1 && stavVeci(s, "team_van") < DODAVKA_STAV_PRAH && mechanici(s).length > 0,
    vytvor: (s, rng) => {
      if (uroven(s, "team_van") < 1 || stavVeci(s, "team_van") >= DODAVKA_STAV_PRAH) return null;
      const kandidati = mechanici(s);
      if (kandidati.length === 0) return null;
      const hrac = rng.pick(kandidati);
      return {
        kind: "mechanik_dodavka", category: "pozitivni", status: "uzavreny", severity: 1,
        culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
        ztraty: [{ typ: "vybaveni_nahoru", kategorie: "team_van", stavNahoru: MECHANIK_STAV }],
        text: text(rng, "mechanik_dodavka", { hrac: hrac.jmeno }),
      };
    },
  },
  {
    // Bez pachatele i bez konkrétního hráče (spec 4d): zesnulý fanoušek, ne člen kádru.
    kind: "dedictvi", label: "Dědictví po fanouškovi", emoji: "👕", category: "pozitivni", vaha: 0, spousteny: false,
    muze: (s) => uroven(s, "jerseys") < 3,
    vytvor: (s, rng) => {
      if (uroven(s, "jerseys") >= 3) return null;
      return {
        kind: "dedictvi", category: "pozitivni", status: "uzavreny", severity: 1,
        culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
        ztraty: [{ typ: "vybaveni_nahoru", kategorie: "jerseys", urovniNahoru: 1, stavNahoru: 100 }],
        text: text(rng, "dedictvi", { vec: CATEGORY_LABELS.jerseys }),
      };
    },
  },
  {
    // Hrdina je subjekt, ne pachatel (spec 4d): jde do subjectPlayerId, culpritPlayerId
    // zůstává null, jinak by spadl do vyšetřovací a trestní logiky jako podezřelý.
    kind: "hrdina", label: "Hrdina v kádru", emoji: "🦸", category: "pozitivni", vaha: 0, spousteny: false,
    muze: (s) => s.kadr.length > 0,
    vytvor: (s, rng) => {
      if (s.kadr.length === 0) return null;
      // Hasič, záchranář a policista mají k hrdinství blíž, ale kdokoli z kádru je kandidát.
      const vahy = Object.fromEntries(
        s.kadr.map((h) => [h.id, (POVOLANI_HRDINY as readonly string[]).includes(h.povolani) ? VAHA_HRDINY : 1]),
      );
      const vybranyId = rng.weighted(vahy);
      const hrac = s.kadr.find((h) => h.id === vybranyId);
      if (!hrac) return null;
      return {
        kind: "hrdina", category: "pozitivni", status: "uzavreny", severity: 1,
        culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
        subjectPlayerId: hrac.id, ztraty: [],
        text: text(rng, "hrdina", { hrac: hrac.jmeno }),
      };
    },
  },
  {
    // Stejné pravidlo: nálezce je subjekt životní epizody, ne pachatel.
    kind: "poctivy_nalezce", label: "Poctivý nálezce", emoji: "👛", category: "pozitivni", vaha: 0, spousteny: false,
    muze: (s) => s.kadr.length > 0,
    vytvor: (s, rng) => {
      if (s.kadr.length === 0) return null;
      const hrac = rng.pick(s.kadr);
      return {
        kind: "poctivy_nalezce", category: "pozitivni", status: "uzavreny", severity: 1,
        culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
        subjectPlayerId: hrac.id, ztraty: [],
        text: text(rng, "poctivy_nalezce", { hrac: hrac.jmeno }),
      };
    },
  },
];

export const KATALOG_PODLE_KIND = new Map(KATALOG.map((d) => [d.kind, d]));

/** Název typu incidentu pro texty a SMS. */
export function nazevIncidentu(kind: string): string {
  return KATALOG_PODLE_KIND.get(kind)?.label ?? "Incident v klubu";
}

/** Co může hráč z kádru v opilosti ohlásit, že udělá (spec 9a). Krádeže zvenku a spouštěné incidenty ne. */
export const CINY_HRACE = ["vloupani_sklad", "vitrina", "dodavka_pujcena", "koleje_trakturek", "kopnute_dvere"] as const;
export type CinHrace = (typeof CINY_HRACE)[number];

/**
 * Klub má na čin podmínky. Zápas dnes nebo zítra se v den ohlášení neřeší, platí až v den činu
 * (`cinHrace`). Kopnuté dveře ohlásí jen obviněný a bez červené karty (spec 9a).
 */
export function muzeOhlasit(kind: CinHrace, s: StavKlubu, obvineny: boolean): boolean {
  switch (kind) {
    case "vloupani_sklad": return PRENOSNE.some((k) => uroven(s, k) >= 1);
    case "vitrina": return uroven(s, "trophy_case") >= 2;
    case "dodavka_pujcena": return uroven(s, "team_van") >= 1;
    case "koleje_trakturek": return uroven(s, "mower") >= 2;
    case "kopnute_dvere": return obvineny && zarizeni(s, "changing_rooms") >= 1;
  }
}

/** Škoda činu, který hráč ohlásil. `null`, když klub v den činu podmínky nesplňuje. Ohlásil to sám, je známý hned. */
export function cinHrace(kind: CinHrace, s: StavKlubu, hrac: HracKlubu, rng: Rng): NavrhIncidentu | null {
  const navrh = kind === "vloupani_sklad" ? skladNavrh(s, rng, { typ: "hrac", hrac })
    : kind === "vitrina" ? vitrinaNavrh(s, rng, { typ: "hrac", hrac })
    : kind === "dodavka_pujcena" ? dodavkaPujcenaNavrh(s, rng, hrac)
    : kind === "koleje_trakturek" ? kolejeNavrh(s, rng, hrac)
    : kopnuteDvereNavrh(s, rng, hrac);
  return navrh ? { ...navrh, culpritRevealed: true } : null;
}
