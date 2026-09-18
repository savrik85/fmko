/**
 * Incidenty v hospodě (spec Část 9). Čisté funkce bez DB: co se v hospodě o incidentech
 * řekne a co z toho plyne. Načtení kontextu a zápis: `hospoda-db.ts`.
 *
 * Tvrdá pravidla:
 * - Hospoda nevytváří škody. Odhaluje, varuje a dohrává následky; jediný nový záznam je
 *   hrozící čin, který si hráč sám ohlásil (9a).
 * - Hospodský deník vrací API komukoli (`GET /teams/:id/pub-sessions`), takže text příhody
 *   neodhaleného pachatele nejmenuje. Jméno nese stopa na stránce incidentu a SMS manažerovi.
 * - Každá příhoda má vlastní seed. Trenér, který vezme kluky do hospody týž den, dostane
 *   stejné losy (jen drby s vyšší šancí) a příhody z `uzZaznelo` se nezopakují.
 */

import { CATEGORY_LABELS } from "../equipment/equipment-generator";
import { createRng, type Rng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { seedFromString } from "../lib/seed";
import { jePoznatelne, jeProdejnaKradez, kradeneZbozi } from "./bazar";
import { pozdejsi } from "./incident-db";
import { CINY_HRACE, muzeOhlasit, nazevIncidentu, type CinHrace } from "./katalog";
import {
  BONUS_POLICIE, CELA_HOSPODA_DNI, CELA_HOSPODA_SANCE, CELA_HOSPODA_ZAVAZNOST, CERSTVY_ZLODEJ_DNI, CHLUBI_ALKOHOL,
  CHLUBI_DNI, CHLUBI_SANCE, CHLUBI_TEMPERAMENT, CHLUBI_TEMPERAMENT_NASOBEK, DRBY_ALKOHOL, DRBY_SANCE, HROZI_LHUTA_MAX,
  HROZI_LHUTA_MIN, LHUTA_PO_ODHALENI_DNI, NABIZI_SANCE, OBVINENI_PAMET_DNI, OCHOTA_POSLA, OHLASUJE_ALKOHOL,
  OHLASUJE_SANCE, PENEZNI_KINDY, POVOLANI_HOSPODSKY, PRAH_VAHY_PACHATELE, RUNDY_DNI, RUNDY_NASOBEK_SVEDKA, RUNDY_SANCE,
  RVACKA_SANCE, SEKERA_SANCE, STEZUJE_MORALKA, STEZUJE_SANCE, STEZUJE_VZTAH, TRENER_V_HOSPODE_NASOBEK,
  ZNALOST_DRB_DNI,
} from "./nastaveni";
import { vahaPachatele } from "./pachatel";
import { MISTO_INCIDENTU, MISTO_TEXT } from "./stopy";
import { normalizuj } from "./tema";
import { text, TEXTY, vypln, type KlicTextu } from "./texty";
import type {
  HracKlubu, KategorieIncidentu, NavrhStopy, Obvineni, StavIncidentu, StavKlubu, TypPachatele, Ztrata,
} from "./typy";
import type { NovaZnalost, RoleSvedka, VysledekVyslechu } from "./znalosti";

export type TypPribehu =
  | "drby_o_incidentu" | "nabizi_zbozi" | "stezuje_si_na_trenera" | "rvacka_kvuli_kradezi"
  | "cela_hospoda_resi" | "chlubi_se" | "ohlasuje_cin" | "pije_na_sekeru" | "utraci_za_rundy";

/** Příhody o incidentech. Návštěva s trenérem je z dnešní session převezme (`season/pub.ts`). */
export const TYPY_PRIBEHU: readonly TypPribehu[] = [
  "drby_o_incidentu", "nabizi_zbozi", "stezuje_si_na_trenera", "rvacka_kvuli_kradezi",
  "cela_hospoda_resi", "chlubi_se", "ohlasuje_cin", "pije_na_sekeru", "utraci_za_rundy",
];

export interface HostHospody {
  playerId: string;
  krestni: string;
  prijmeni: string;
  /** Alkohol z povahy 0–100. */
  alkohol: number;
  teamId: string;
  /** Hráč jiného klubu (`isVisitor`). */
  host: boolean;
}

export interface IncidentVHospode {
  id: string;
  kind: string;
  category: KategorieIncidentu;
  status: StavIncidentu;
  severity: number;
  /** `YYYY-MM-DD` herního dne incidentu. */
  den: string;
  culpritType: TypPachatele | null;
  culpritPlayerId: string | null;
  odhalen: boolean;
  deadline: string | null;
  ztraty: Ztrata[];
  recovered: boolean;
  /** Kradené zboží už má inzerát v bazaru. */
  inzerat: boolean;
  /** `YYYY-MM-DD` uzavření, `null` u neuzavřeného. */
  uzavrenoDne: string | null;
  obvineni: Obvineni[];
  /** Klíče stop z hospody, které incident už má (`nabizi`, `chlubi`, `drb-{hráč}`). */
  stopyHospody: string[];
}

export interface SvedekVHospode {
  incidentId: string;
  playerId: string;
  role: RoleSvedka;
  vyslech: VysledekVyslechu | null;
}

export interface KontextHospody {
  teamId: string;
  leagueId: string | null;
  seasonNumber: number;
  nazevKlubu: string;
  /** `YYYY-MM-DD` dne hospody. */
  den: string;
  /** Herní datum dne hospody, od něj se počítají lhůty. */
  gameDate: string;
  /** Incidenty klubu za posledních 60 dní, bez hrozících a bez těch, které se nestaly. */
  incidenty: IncidentVHospode[];
  /** Tajné role (svědek, kamarád, rival) hráčů klubu, kteří v hospodě sedí. */
  svedci: SvedekVHospode[];
  kadr: ReadonlyMap<string, HracKlubu>;
  /** Kamarádské vztahy (5b) a rivalové, oběma směry. */
  kamaradi: ReadonlyMap<string, ReadonlySet<string>>;
  rivalove: ReadonlyMap<string, ReadonlySet<string>>;
  /** Hráči, kteří už jeden hrozící čin ohlásili (9a: nejvýš jeden na hráče). */
  hrozi: ReadonlySet<string>;
  /** Hráč → kind běžící životní situace (spec 4c). */
  situace: ReadonlyMap<string, string>;
  /** Hráč → id jeho situačního incidentu (spec 4c). */
  idSituaci: ReadonlyMap<string, string>;
  /** Hráči, kterým trenér odmítl zálohu (spec 7c). */
  odmitnuteZalohy: ReadonlySet<string>;
}

export interface VolbyHospody {
  /** Trenér vzal kluky do hospody sám a poslouchá (spec 9, návaznosti). */
  trener: boolean;
  /** Jen admin na testingu: každý los vyjde. */
  jiste: boolean;
  /** Jen admin na testingu: tenhle hráč ohlásí čin bez ohledu na alkohol, povahu a los. */
  ohlasi?: string;
  /** Klíče `typ|incidentId` příhod, které už dnes v hospodě zazněly. */
  uzZaznelo?: ReadonlySet<string>;
}

export interface EfektHospody {
  playerId: string;
  type: "condition" | "injury" | "morale" | "vztah";
  delta?: number;
  injuryDays?: number;
  injuryDescription?: string;
  label: string;
}

export interface PribehHospody {
  type: TypPribehu;
  playerIds: string[];
  text: string;
  effects: EfektHospody[];
  /** Incident, o kterém se mluví. Deník podle něj ukáže odkaz. */
  incidentId: string;
}

export interface HroziciCin {
  id: string;
  kind: CinHrace;
  playerId: string;
  /** Ohlášení: věta do deníku, text incidentu a SMS. */
  text: string;
  deadline: string;
  znalost: NovaZnalost;
  /** Kdo manažerovi napíše: hráč klubu od stolu, jinak hospodský (`null`). */
  posel: { id: string; firstName: string; lastName: string } | null;
}

export type ZapisHospody =
  /** Svědek se prořekl: jeho nenalezené stopy nahradí stopa z hospody a výslech je rozhodnutý (17d). */
  | { typ: "prozradil"; incidentId: string; svedekId: string; stopa: NavrhStopy }
  | { typ: "stopa"; incidentId: string; klic: string; stopa: NavrhStopy }
  | { typ: "odhaleni"; incidentId: string; deadline: string }
  | { typ: "drb"; incidentId: string; teamId: string; znalost: NovaZnalost }
  | { typ: "hrozi"; cin: HroziciCin }
  | { typ: "sms"; incidentId: string; text: string };

export interface VysledekHospody {
  pribehy: PribehHospody[];
  zapisy: ZapisHospody[];
  /** Kdo ohlásí čin. Jaký, se rozhodne až nad stavem klubu (`vyberCin`). */
  ohlaseni: { playerId: string; obvineny: boolean } | null;
  /** Odhalení zloději u stolu, pro vůdce fanoušků (17h). */
  zlodeji: Array<{ playerId: string; jmeno: string }>;
}

const DEN_MS = 86_400_000;

function dnyMezi(od: string, do_: string): number {
  return Math.round((Date.parse(do_.slice(0, 10)) - Date.parse(od.slice(0, 10))) / DEN_MS);
}

const jmeno = (h: HostHospody) => `${h.krestni} ${h.prijmeni}`;
const resiSe = (i: IncidentVHospode) => i.status === "otevreny" || i.status === "policie";
const vysetrovany = (i: IncidentVHospode) => i.category === "kradez" || i.category === "poskozeni";
const nazvyZbozi = (zbozi: ReadonlyArray<{ kategorie: string }>) => zbozi.map((z) => CATEGORY_LABELS[z.kategorie] ?? z.kategorie).join(", ");

function los(k: KontextHospody, ...casti: string[]): Rng {
  return createRng(seedFromString(["hospoda", k.teamId, k.den, ...casti].join("|")));
}

/** Hod se táhne vždy, ať `jiste` nemění další čísla z generátoru (výběr věty). */
function vyjde(rng: Rng, sance: number, v: VolbyHospody): boolean {
  const hod = rng.random();
  return v.jiste || hod < sance;
}

function zaznelo(v: VolbyHospody, typ: TypPribehu, incidentId: string): boolean {
  return v.uzZaznelo?.has(`${typ}|${incidentId}`) ?? false;
}

/** Obvinění, které hráč zapřel a ještě ho bolí. Ne u pachatele, kterého už všichni znají (17d). */
function zapreneObvineni(k: KontextHospody, playerId: string): IncidentVHospode | null {
  return k.incidenty.find((i) => !(i.odhalen && i.culpritPlayerId === playerId) && i.obvineni.some((o) =>
    o.playerId === playerId && o.vysledek === "zapira" && o.den < k.den && dnyMezi(o.den, k.den) <= OBVINENI_PAMET_DNI)) ?? null;
}

/** Odhalený zloděj z kádru, o kterém se ještě mluví: neuzavřená krádež, nebo uzavřená nedávno. */
function cerstvyZlodej(k: KontextHospody, i: IncidentVHospode): boolean {
  if (i.category !== "kradez" || !i.odhalen || i.culpritType !== "hrac" || !i.culpritPlayerId) return false;
  return i.status !== "uzavreny" || (i.uzavrenoDne !== null && dnyMezi(i.uzavrenoDne, k.den) <= CERSTVY_ZLODEJ_DNI);
}

export function pribehyHospody(hoste: readonly HostHospody[], k: KontextHospody, v: VolbyHospody): VysledekHospody {
  const out: VysledekHospody = { pribehy: [], zapisy: [], ohlaseni: null, zlodeji: [] };
  const mistni = hoste.filter((h) => !h.host && h.teamId === k.teamId && k.kadr.has(h.playerId));
  if (mistni.length === 0) return out;
  const tady = new Map(mistni.map((h) => [h.playerId, h]));
  // Hospoda běží před krokem incidentů: mluví se o včerejšku a starším (spec 9).
  const incidenty = k.incidenty.filter((i) => i.den < k.den);

  drby(k, v, tady, incidenty, out);
  nabizi(k, v, incidenty, out);
  chlubi(k, v, tady, incidenty, out);
  stezuje(k, v, mistni, out);
  rvacka(k, v, mistni, tady, incidenty, out);
  celaHospoda(k, v, incidenty, out);
  sekera(k, v, mistni, out);
  rundy(k, v, mistni, incidenty, out);
  out.zlodeji = zlodejiUStolu(k, tady, incidenty);
  out.ohlaseni = kdoOhlasi(k, v, mistni);
  out.zapisy.push(...drbyDoCizichKlubu(k, hoste, out.pribehy));
  return out;
}

function drby(k: KontextHospody, v: VolbyHospody, tady: ReadonlyMap<string, HostHospody>, incidenty: readonly IncidentVHospode[], out: VysledekHospody): void {
  // Hráč s víc rolemi u jednoho incidentu (kamarád, který i něco viděl) mluví jednou.
  const probrano = new Set<string>();
  for (const s of k.svedci) {
    const klic = `${s.incidentId}|${s.playerId}`;
    if (s.vyslech !== null || probrano.has(klic)) continue;
    const inc = incidenty.find((i) => i.id === s.incidentId);
    if (!inc || !resiSe(inc) || !vysetrovany(inc) || inc.odhalen || inc.culpritType !== "hrac" || !inc.culpritPlayerId) continue;
    if (zaznelo(v, "drby_o_incidentu", inc.id)) continue;
    const svedek = tady.get(s.playerId);
    const pachatel = k.kadr.get(inc.culpritPlayerId);
    if (!svedek || !pachatel || svedek.alkohol < DRBY_ALKOHOL) continue;
    probrano.add(klic);
    const rng = los(k, "drby", inc.id, s.playerId);
    if (!vyjde(rng, DRBY_SANCE * (v.trener ? TRENER_V_HOSPODE_NASOBEK : 1), v)) continue;

    const misto = MISTO_INCIDENTU[inc.kind];
    const stopaText = s.role === "svedek"
      ? text(rng, "stopa_hospoda_videl", { svedek: jmeno(svedek), hrac: pachatel.jmeno, misto: misto ? MISTO_TEXT[misto] : "u hřiště" })
      : text(rng, "stopa_hospoda_tusi", { svedek: jmeno(svedek), hrac: pachatel.jmeno });
    out.zapisy.push(
      {
        typ: "prozradil", incidentId: inc.id, svedekId: svedek.playerId,
        stopa: {
          zdroj: "hospoda", ukazujeNa: pachatel.id, podezreli: null, drzitel: svedek.playerId,
          sila: 2, bonusPolicie: BONUS_POLICIE.svedek, text: stopaText, nalezena: true,
        },
      },
      { typ: "sms", incidentId: inc.id, text: `🍺 ${stopaText}` },
    );
    // Deník jmenuje jen toho, kdo mluvil.
    out.pribehy.push({
      type: "drby_o_incidentu", playerIds: [svedek.playerId], effects: [], incidentId: inc.id,
      text: text(rng, "hospoda_drby", { svedek: jmeno(svedek) }),
    });
  }
}

function nabizi(k: KontextHospody, v: VolbyHospody, incidenty: readonly IncidentVHospode[], out: VysledekHospody): void {
  for (const inc of incidenty) {
    if (inc.culpritType !== "cizi" || !resiSe(inc) || inc.recovered || inc.inzerat || !jeProdejnaKradez(inc.kind)) continue;
    if (inc.stopyHospody.includes("nabizi") || zaznelo(v, "nabizi_zbozi", inc.id)) continue;
    const zbozi = kradeneZbozi(inc.ztraty);
    if (zbozi.length === 0) continue;
    const rng = los(k, "nabizi", inc.id);
    if (!vyjde(rng, NABIZI_SANCE, v)) continue;

    const vec = nazvyZbozi(zbozi);
    const poznane = zbozi.some((z) => jePoznatelne(z.kategorie, z.uroven));
    const stopaText = text(rng, poznane ? "stopa_hospoda_nabizi_poznane" : "stopa_hospoda_nabizi", { vec });
    out.zapisy.push(
      {
        typ: "stopa", incidentId: inc.id, klic: "nabizi",
        stopa: {
          zdroj: "hospoda", ukazujeNa: null, podezreli: null, drzitel: null, sila: 1,
          bonusPolicie: poznane ? BONUS_POLICIE.hospodaNabizi : 0, text: stopaText, nalezena: true,
        },
      },
      { typ: "sms", incidentId: inc.id, text: `🍺 ${stopaText}` },
    );
    out.pribehy.push({ type: "nabizi_zbozi", playerIds: [], effects: [], incidentId: inc.id, text: text(rng, "hospoda_nabizi", { vec }) });
    // Jeden podomní prodejce za večer.
    return;
  }
}

function chlubi(k: KontextHospody, v: VolbyHospody, tady: ReadonlyMap<string, HostHospody>, incidenty: readonly IncidentVHospode[], out: VysledekHospody): void {
  for (const inc of incidenty) {
    if (!vysetrovany(inc) || !resiSe(inc) || inc.culpritType !== "hrac" || !inc.culpritPlayerId) continue;
    if (dnyMezi(inc.den, k.den) > CHLUBI_DNI || zaznelo(v, "chlubi_se", inc.id)) continue;
    const host = tady.get(inc.culpritPlayerId);
    const hrac = k.kadr.get(inc.culpritPlayerId);
    if (!host || !hrac || host.alkohol < CHLUBI_ALKOHOL) continue;
    const rng = los(k, "chlubi", inc.id);
    const sance = CHLUBI_SANCE * (hrac.temperament >= CHLUBI_TEMPERAMENT ? CHLUBI_TEMPERAMENT_NASOBEK : 1);
    if (!vyjde(rng, sance, v)) continue;

    const zbozi = inc.category === "kradez" ? kradeneZbozi(inc.ztraty) : [];
    const veta = zbozi.length > 0
      ? text(rng, "hospoda_chlubi_zbozi", { hrac: hrac.jmeno, vec: nazvyZbozi(zbozi) })
      : text(rng, "hospoda_chlubi", { hrac: hrac.jmeno, nazev: nazevIncidentu(inc.kind) });
    out.pribehy.push({ type: "chlubi_se", playerIds: [hrac.id], effects: [], incidentId: inc.id, text: veta });
    // Známého pachatele chlubení jen potvrdí, stopy u odhaleného nevznikají (5b).
    if (inc.odhalen || inc.stopyHospody.includes("chlubi")) continue;
    out.zapisy.push(
      {
        typ: "stopa", incidentId: inc.id, klic: "chlubi",
        stopa: {
          zdroj: "hospoda", ukazujeNa: hrac.id, podezreli: null, drzitel: null, sila: 3, bonusPolicie: 0,
          text: text(rng, "stopa_hospoda_chlubi", { hrac: hrac.jmeno }), nalezena: true,
        },
      },
      { typ: "odhaleni", incidentId: inc.id, deadline: pozdejsi(inc.deadline, gameExpiry(k.gameDate, LHUTA_PO_ODHALENI_DNI)) },
      { typ: "sms", incidentId: inc.id, text: `🍺 ${veta}` },
    );
  }
}

function stezuje(k: KontextHospody, v: VolbyHospody, mistni: readonly HostHospody[], out: VysledekHospody): void {
  for (const h of mistni) {
    const inc = zapreneObvineni(k, h.playerId);
    if (!inc || zaznelo(v, "stezuje_si_na_trenera", inc.id)) continue;
    const kamaradi = mistni.filter((m) => m.playerId !== h.playerId && (k.kamaradi.get(h.playerId)?.has(m.playerId) ?? false));
    if (kamaradi.length === 0) continue;
    const rng = los(k, "stezuje", inc.id, h.playerId);
    if (!vyjde(rng, STEZUJE_SANCE, v)) continue;
    out.pribehy.push({
      type: "stezuje_si_na_trenera",
      playerIds: [h.playerId, ...kamaradi.map((m) => m.playerId)],
      text: text(rng, "hospoda_stezuje", { hrac: jmeno(h) }),
      effects: kamaradi.flatMap((m): EfektHospody[] => [
        { playerId: m.playerId, type: "vztah", delta: STEZUJE_VZTAH, label: `−${Math.abs(STEZUJE_VZTAH)} vztah k trenérovi` },
        { playerId: m.playerId, type: "morale", delta: STEZUJE_MORALKA, label: `−${Math.abs(STEZUJE_MORALKA)} morálka` },
      ]),
      incidentId: inc.id,
    });
    // Jedna stížnost za večer, jinak by kamarádi pykali za každého zvlášť.
    return;
  }
}

function rvacka(
  k: KontextHospody, v: VolbyHospody, mistni: readonly HostHospody[], tady: ReadonlyMap<string, HostHospody>,
  incidenty: readonly IncidentVHospode[], out: VysledekHospody,
): void {
  for (const inc of incidenty) {
    if (!cerstvyZlodej(k, inc) || zaznelo(v, "rvacka_kvuli_kradezi", inc.id)) continue;
    const zlodej = tady.get(inc.culpritPlayerId as string);
    if (!zlodej) continue;
    const rival = mistni.find((m) => k.rivalove.get(zlodej.playerId)?.has(m.playerId) ?? false);
    if (!rival) continue;
    const rng = los(k, "rvacka", inc.id);
    if (!vyjde(rng, RVACKA_SANCE, v)) continue;
    // Stejné dopady jako rvačka s hostem (`cross_team_fight` v season/pub.ts).
    const effects = [rival, zlodej].map((h): EfektHospody => {
      if (rng.random() < 0.5) {
        const dni = rng.int(1, 3);
        return {
          playerId: h.playerId, type: "injury", injuryDays: dni, injuryDescription: "Rvačka v hospodě kvůli krádeži",
          label: `Lehké zranění (${dni} ${dni === 1 ? "den" : "dny"})`,
        };
      }
      return { playerId: h.playerId, type: "condition", delta: -12, label: "−12 kondice (modřiny)" };
    });
    out.pribehy.push({
      type: "rvacka_kvuli_kradezi", playerIds: [rival.playerId, zlodej.playerId], effects, incidentId: inc.id,
      text: text(rng, "hospoda_rvacka", { rival: jmeno(rival), zlodej: jmeno(zlodej) }),
    });
    return;
  }
}

function celaHospoda(k: KontextHospody, v: VolbyHospody, incidenty: readonly IncidentVHospode[], out: VysledekHospody): void {
  const cerstvy = incidenty
    .filter((i) => i.severity >= CELA_HOSPODA_ZAVAZNOST && dnyMezi(i.den, k.den) <= CELA_HOSPODA_DNI)
    .filter((i) => !out.pribehy.some((p) => p.incidentId === i.id) && !zaznelo(v, "cela_hospoda_resi", i.id))
    .sort((a, b) => b.severity - a.severity || b.den.localeCompare(a.den) || a.id.localeCompare(b.id))[0];
  if (!cerstvy) return;
  const rng = los(k, "cela", cerstvy.id);
  if (!vyjde(rng, CELA_HOSPODA_SANCE, v)) return;
  out.pribehy.push({
    type: "cela_hospoda_resi", playerIds: [], effects: [], incidentId: cerstvy.id,
    text: text(rng, "hospoda_cela", { nazev: nazevIncidentu(cerstvy.kind) }),
  });
}

/** Kdo má dluhy, na toho už hospodský nepíše. Varování manažerovi, že se to někam řítí (spec 9). */
function sekera(k: KontextHospody, v: VolbyHospody, mistni: readonly HostHospody[], out: VysledekHospody): void {
  for (const h of mistni) {
    if (k.situace.get(h.playerId) !== "dluhy") continue;
    const incidentId = k.idSituaci.get(h.playerId) ?? "";
    if (zaznelo(v, "pije_na_sekeru", h.playerId)) continue;
    const rng = los(k, "sekera", h.playerId);
    if (!vyjde(rng, SEKERA_SANCE, v)) continue;
    out.pribehy.push({
      type: "pije_na_sekeru", playerIds: [h.playerId], effects: [], incidentId,
      text: text(rng, "hospoda_sekera", { hrac: jmeno(h) }),
    });
    return;
  }
}

/** Hospodský sedí v kádru za pípou, ne nutně u stolu dnes večer: stačí, že ho klub má (spec 9). */
function hospodskyVKadru(k: KontextHospody): boolean {
  const cil = normalizuj(POVOLANI_HOSPODSKY);
  for (const h of k.kadr.values()) if (normalizuj(h.povolani) === cil) return true;
  return false;
}

/**
 * Pachatel odhalené peněžní krádeže má najednou hotovost a neudrží se: platí rundy,
 * štamgasti si to spojí (spec 9). Neodhalený pachatel se v deníku, který čte kdokoli
 * včetně soupeřů, jménem objevit nesmí, proto se kontroluje `odhalen`.
 *
 * Hospodský v kádru a trenér u stolu si rundy všimnou spíš (spec 9): šance se násobí
 * `RUNDY_NASOBEK_SVEDKA`, ale ne dvakrát, když platí obojí najednou — jde o dva svědky
 * téhož druhu, ne o kombinaci. Násobek mění jen práh před losem, ne pořadí losů.
 *
 * Bere `incidenty` (už profiltrované na `i.den < k.den`, stejně jako u ostatních funkcí
 * v `pribehyHospody`), ne `k.incidenty` přímo — hospoda mluví jen o tom, co se stalo, ne
 * o dnešku. Spec počítá okno `RUNDY_DNI` od odhalení pachatele, ne od data incidentu:
 * `IncidentVHospode` ale datum odhalení nenese (`club_incidents` ho neukládá, jen bit
 * `culprit_revealed`), takže se tu porovnává proti `i.den` (den vzniku incidentu). U kasy
 * a tomboly je pachatel `zamestnanec` odhalený hned při vzniku, takže se to prakticky kryje;
 * jen pokud by v budoucnu šlo o pachatele odhaleného až po čase (např. hráč `p` z kádru),
 * začalo by okno běžet moc brzy. Přidání `revealed_on` sloupce je migrace, která v týhle fázi
 * nejde - bez ní se to poctivě spravit nedá, jen zaznamenat.
 */
function rundy(k: KontextHospody, v: VolbyHospody, mistni: readonly HostHospody[], incidenty: readonly IncidentVHospode[], out: VysledekHospody): void {
  const nasobek = hospodskyVKadru(k) || v.trener ? RUNDY_NASOBEK_SVEDKA : 1;
  for (const h of mistni) {
    const inc = incidenty.find((i) =>
      i.odhalen && i.culpritPlayerId === h.playerId
      && (PENEZNI_KINDY as readonly string[]).includes(i.kind) && dnyMezi(i.den, k.den) <= RUNDY_DNI);
    if (!inc || zaznelo(v, "utraci_za_rundy", inc.id)) continue;
    const rng = los(k, "rundy", h.playerId);
    if (!vyjde(rng, Math.min(1, RUNDY_SANCE * nasobek), v)) continue;
    out.pribehy.push({
      type: "utraci_za_rundy", playerIds: [h.playerId], effects: [], incidentId: inc.id,
      text: text(rng, "hospoda_rundy", { hrac: jmeno(h) }),
    });
    return;
  }
}

function zlodejiUStolu(k: KontextHospody, tady: ReadonlyMap<string, HostHospody>, incidenty: readonly IncidentVHospode[]): Array<{ playerId: string; jmeno: string }> {
  const zlodeji = new Map<string, string>();
  for (const inc of incidenty) {
    if (!cerstvyZlodej(k, inc)) continue;
    const h = tady.get(inc.culpritPlayerId as string);
    if (h) zlodeji.set(h.playerId, jmeno(h));
  }
  return [...zlodeji].map(([playerId, j]) => ({ playerId, jmeno: j }));
}

function kdoOhlasi(k: KontextHospody, v: VolbyHospody, mistni: readonly HostHospody[]): { playerId: string; obvineny: boolean } | null {
  for (const h of mistni) {
    const hrac = k.kadr.get(h.playerId);
    if (!hrac || k.hrozi.has(h.playerId)) continue;
    // Jen skutečně zapřené obvinění dělá z hráče „obviněného": to jediné odemyká kopnuté
    // dveře a jejich text o obvinění (spec 9a). Odmítnutá záloha ho jen rozmrzí bez obvinění.
    const obvineny = zapreneObvineni(k, h.playerId) !== null;
    const maDuvodBezVahy = obvineny || k.odmitnuteZalohy.has(h.playerId);
    if (v.ohlasi !== undefined) {
      if (v.ohlasi === h.playerId) return { playerId: h.playerId, obvineny };
      continue;
    }
    if (h.alkohol < OHLASUJE_ALKOHOL) continue;
    if (!maDuvodBezVahy && vahaPachatele(hrac) < PRAH_VAHY_PACHATELE) continue;
    if (vyjde(los(k, "ohlasuje", h.playerId), OHLASUJE_SANCE, v)) return { playerId: h.playerId, obvineny };
  }
  return null;
}

function drbyDoCizichKlubu(k: KontextHospody, hoste: readonly HostHospody[], pribehy: readonly PribehHospody[]): ZapisHospody[] {
  const zvenku = hoste.filter((h) => h.host && h.teamId !== k.teamId);
  const zapisy: ZapisHospody[] = [];
  for (const id of new Set(pribehy.map((p) => p.incidentId))) {
    const inc = k.incidenty.find((i) => i.id === id);
    // Životní situace nejsou průšvih (spec): nemá se roznášet jako drb do cizích klubů.
    if (!inc || inc.category === "zivotni") continue;
    // Jen veřejný fakt: název klubu a co se stalo, nikdy jméno neodhaleného pachatele.
    const fact = vypln(TEXTY.znalost_drb[0], { klub: k.nazevKlubu, nazev: nazevIncidentu(inc.kind) });
    for (const h of zvenku) {
      zapisy.push({
        typ: "drb", incidentId: id, teamId: h.teamId,
        znalost: { playerId: h.playerId, role: "drb", fact, ochota: 50, until: gameExpiry(k.gameDate, ZNALOST_DRB_DNI) },
      });
    }
  }
  return zapisy;
}

/** Jaký čin hráč ohlásí: jen takový, na který klub má (spec 9a). Obviněný spíš kopne do dveří. */
export function vyberCin(stav: StavKlubu, obvineny: boolean, rng: Rng): CinHrace | null {
  const mozne = CINY_HRACE.filter((kind) => muzeOhlasit(kind, stav, obvineny));
  if (mozne.length === 0) return null;
  const kind = rng.weighted(Object.fromEntries(mozne.map((x) => [x, x === "kopnute_dvere" ? 3 : 1])));
  return mozne.find((x) => x === kind) ?? null;
}

const KLIC_OHLASENI: Record<CinHrace, KlicTextu> = {
  vloupani_sklad: "ohlaseni_vloupani_sklad",
  vitrina: "ohlaseni_vitrina",
  dodavka_pujcena: "ohlaseni_dodavka_pujcena",
  koleje_trakturek: "ohlaseni_koleje_trakturek",
  kopnute_dvere: "ohlaseni_kopnute_dvere",
};

export function idHroziciho(teamId: string, kind: string, den: string, playerId: string): string {
  return `inc-${teamId}-${kind}-${den}-hrozi-${playerId}`;
}

/**
 * Hrozící čin (spec 9a). Posel je hráč klubu, který u toho seděl a má k trenérovi aspoň
 * `OCHOTA_POSLA`; když takový není, napíše hospodský.
 */
export function hroziciCin(
  k: KontextHospody, hoste: readonly HostHospody[], playerId: string, kind: CinHrace, rng: Rng,
): HroziciCin | null {
  const hrac = k.kadr.get(playerId);
  if (!hrac) return null;
  const deadline = gameExpiry(k.gameDate, rng.int(HROZI_LHUTA_MIN, HROZI_LHUTA_MAX));
  const posel = hoste
    .filter((h) => !h.host && h.teamId === k.teamId && h.playerId !== playerId)
    .map((h) => ({ h, vztah: k.kadr.get(h.playerId)?.vztahKTrenerovi ?? -1 }))
    .filter((x) => x.vztah >= OCHOTA_POSLA)
    .sort((a, b) => b.vztah - a.vztah || a.h.playerId.localeCompare(b.h.playerId))[0]?.h ?? null;
  return {
    id: idHroziciho(k.teamId, kind, k.den, playerId),
    kind, playerId, deadline,
    text: text(rng, KLIC_OHLASENI[kind], { hrac: hrac.jmeno }),
    znalost: {
      playerId, role: "pachatel", ochota: 0, until: deadline,
      fact: vypln(TEXTY.znalost_hrozi[0], { nazev: nazevIncidentu(kind) }),
    },
    posel: posel ? { id: posel.playerId, firstName: posel.krestni, lastName: posel.prijmeni } : null,
  };
}
