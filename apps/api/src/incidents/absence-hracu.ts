/**
 * Incidenty v docházce a zápase (spec 17a–17c).
 *
 * Omluvenky se pro jeden zápas losují na šesti místech a všechna musí dojít
 * ke stejnému výsledku. Incident proto do losu nezasahuje: los běží beze
 * změny a teprve potom `pridejIncidentniAbsence` označí hráče, kteří mají
 * výslech, soud nebo vyřazení. Vlivy (`obvineny`, `pachatel`) čtou los
 * omluvenek, zápas i kabina.
 */

import type { AbsenceResult } from "../events/absence";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import {
  DUVOD_ABSENCE, EMOJI_ABSENCE, MIN_OHLASENI_ABSENCE_DNI, OKNO_VLIVU_DNI, VLIV_INCIDENTU_DNI, VYRAZENI_MAX_ZAPASU,
} from "./nastaveni";
import { nactiObvineni } from "./vysetrovani";

const M = "incidents-absence";

export type DruhAbsence = "vyslech" | "soud" | "vyrazen" | "porod" | "nemocna_mama" | "stehovani";
export type DruhVlivu = "obvineny" | "pachatel" | "dluhy" | "prisel_o_praci" | "rozvod" | "zabaveny_ridicak";

export interface IncidentniAbsence {
  playerId: string;
  druh: string;
  duvod: string;
  sms: string;
}

export interface RadekAbsence {
  player_id: string;
  kind: string;
  od_dne: string | null;
  do_dne: string | null;
  zapasu_zbyva: number | null;
  duvod: string;
  sms: string;
}

/** Situace, které mění docházku, výmluvy nebo zápas. Svatba a narození dítěte jdou přes absence, ne přes vliv. */
const SITUACE_S_VLIVEM: ReadonlySet<string> = new Set(["dluhy", "prisel_o_praci", "rozvod", "zabaveny_ridicak"]);

/**
 * Id dluhové situace zřetězené ze ztráty práce (`zretezDluhy` v situace-db.ts). Zdrojová
 * ztráta práce se při zřetězení uzavře, ale `ends_on` zůstává netknuté (jinak by se rozešel
 * los omluvenek, viz `druhyHracu`), takže obě situace chvíli běží datovým oknem vedle sebe.
 */
export function dluhyZretezenaId(zdrojId: string): string {
  return `${zdrojId}-dluhy`;
}

export interface IncidentProVliv {
  culprit_player_id: string | null;
  culprit_revealed: number;
  accused: string;
  game_date: string;
  /**
   * Stav řádku. Životní situace ho schválně nečtou: vliv se počítá z data zápasu,
   * ne z toho, jestli už `ukonciSituace` řádek překlopil (viz `druhyHracu`).
   */
  status?: string;
  kind?: string;
  subject_player_id?: string | null;
  ends_on?: string | null;
  /**
   * Deterministické id řádku (`inc-<tym>-<kind>-<den>`, u dluhů zřetězených ze ztráty práce
   * `<id zdroje>-dluhy`, viz `dluhyZretezenaId`). Neměnný sloupec jako `game_date` nebo
   * `ends_on` — čte se jen kvůli zřetězení, `status` se pořád nečte (viz výš).
   */
  id?: string;
}

export interface IncidentniKontext {
  absence: Map<string, IncidentniAbsence>;
  druhy: Map<string, DruhVlivu[]>;
}

export function prazdnyKontext(): IncidentniKontext {
  return { absence: new Map(), druhy: new Map() };
}

/** Herní den posunutý o `dni`, tvar YYYY-MM-DD. */
export function denPlus(den: string, dni: number): string {
  const d = new Date(`${den.slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dni);
  return d.toISOString().slice(0, 10);
}

function dnyMezi(od: string, do_: string): number {
  return Math.round((Date.parse(`${do_.slice(0, 10)}T12:00:00.000Z`) - Date.parse(`${od.slice(0, 10)}T12:00:00.000Z`)) / 86_400_000);
}

/**
 * Absence platné v herní den `den`. Datumová absence (výslech, soud) vyhrává nad vyřazením —
 * je konkrétnější a časově přesně ohraničená, takže se zpracuje v prvním průchodu bez ohledu
 * na pořadí řádků. Mezi záznamy stejného typu vyhrává první.
 */
export function platneAbsence(radky: readonly RadekAbsence[], den: string): Map<string, IncidentniAbsence> {
  const d = den.slice(0, 10);
  const vysledek = new Map<string, IncidentniAbsence>();
  const zapis = (r: RadekAbsence) => {
    if (vysledek.has(r.player_id)) return;
    vysledek.set(r.player_id, { playerId: r.player_id, druh: r.kind, duvod: r.duvod, sms: r.sms });
  };
  for (const r of radky) {
    if (r.kind !== "vyrazen" && !!r.od_dne && !!r.do_dne && r.od_dne <= d && r.do_dne >= d) zapis(r);
  }
  for (const r of radky) {
    if (r.kind === "vyrazen" && (r.zapasu_zbyva ?? 0) > 0) zapis(r);
  }
  return vysledek;
}

/**
 * Obvinění, která skončila zapíráním (nevinný i vinný, který svou vinu zapřel), odhalení
 * pachatelé a běžící životní situace, které ke dni `datum` působí.
 *
 * Celá funkce je čistá funkce data zápasu, ne aktuálního stavu klubu. Los omluvenek se pro
 * jeden zápas losuje na šesti místech (SMS den předem, SMS v den zápasu, náhled sestavy,
 * simulace) a všechna musí dostat týž vstup — hráč navíc posouvá RNG proud všem za sebou,
 * takže jediný překlopený vliv přepíše celý seznam omluvenek.
 *
 * `minOdstup` omezuje, jak čerstvý vliv smí být: los ho zohlední, jen když je aspoň
 * `MIN_OHLASENI_ABSENCE_DNI` dní starý (jinak by obvinění nebo situace den před zápasem
 * měnily vstup do už rozjetého losu). Zápas a kabina čtou vliv bez odstupu (0).
 *
 * Situace se proto vybírá datovým oknem: ohlášená (`game_date`) aspoň `minOdstup` dní před
 * zápasem a `ends_on` sahající aspoň do dne zápasu. Na `status` se schválně nekouká — řádek,
 * který `ukonciSituace` v den zápasu uzavřel, musí pro tenhle zápas počítat pořád stejně,
 * jako počítal v losu den předem.
 *
 * Zřetězené dluhy (`zretezDluhy`) jsou výjimka: zdrojová ztráta práce se uzavře, ale její
 * datové okno běží dál (viz výš), takže by chvíli platila vedle nové dluhové situace a jejich
 * vlivy na trénink (`TRENINK_SITUACE`, +0,15 a -0,15) by se přesně vyrušily. Ztráta práce se
 * proto potlačí, jakmile je v okně i její dluhová situace — poznaná podle odvozeného id
 * (`dluhyZretezenaId`), ne podle statusu, takže los pořád zůstává čistou funkcí data zápasu.
 */
export function druhyHracu(incidenty: readonly IncidentProVliv[], datum: string, minOdstup = 0): Map<string, DruhVlivu[]> {
  const mapa = new Map<string, DruhVlivu[]>();
  const pridej = (id: string, druh: DruhVlivu) => {
    const druhy = mapa.get(id) ?? [];
    if (!druhy.includes(druh)) druhy.push(druh);
    mapa.set(id, druhy);
  };
  const vOkne = (den: string, minDny: number) => {
    const dny = dnyMezi(den, datum);
    return dny >= minDny && dny <= VLIV_INCIDENTU_DNI;
  };
  const situaceVOkne = (inc: IncidentProVliv) =>
    !!inc.subject_player_id && !!inc.kind && SITUACE_S_VLIVEM.has(inc.kind)
    && dnyMezi(inc.game_date, datum) >= minOdstup
    && (!inc.ends_on || inc.ends_on.slice(0, 10) >= datum.slice(0, 10));

  // Id dluhových situací aktuálně v okně, aby zřetězená ztráta práce nedala vliv navíc.
  const dluhyVOkne = new Set(incidenty.filter((i) => i.id && i.kind === "dluhy" && situaceVOkne(i)).map((i) => i.id as string));

  for (const inc of incidenty) {
    for (const o of nactiObvineni(inc.accused)) {
      if (o.vysledek === "zapira" && vOkne(o.den, minOdstup)) pridej(o.playerId, "obvineny");
    }
    if (inc.culprit_revealed === 1 && inc.culprit_player_id && vOkne(inc.game_date, 0)) pridej(inc.culprit_player_id, "pachatel");

    // Životní situace působí, dokud běží datové okno, ne podle okna od vzniku (spec 4c).
    if (inc.subject_player_id && inc.kind && situaceVOkne(inc)) {
      if (inc.kind === "prisel_o_praci" && inc.id && dluhyVOkne.has(dluhyZretezenaId(inc.id))) continue;
      pridej(inc.subject_player_id, inc.kind as DruhVlivu);
    }
  }
  return mapa;
}

/**
 * Dodatečný průchod po losu omluvenek (spec 17a). Vylosované omluvenky ostatních
 * hráčů zůstanou beze změny; hráč s incidentní absencí dostane incidentní důvod
 * místo případné vylosované omluvenky. Hráči mimo `hraciIds` (zranění, stopka)
 * se přeskočí, protože v losu vůbec nebyli.
 */
export function pridejIncidentniAbsence(
  absence: readonly AbsenceResult[],
  hraciIds: readonly string[],
  incidentni: ReadonlyMap<string, IncidentniAbsence>,
  timing: "day_before" | "match_day",
): AbsenceResult[] {
  if (incidentni.size === 0) return [...absence];
  const indexy = new Map(hraciIds.map((id, i) => [id, i]));
  const nove: AbsenceResult[] = [];
  for (const a of incidentni.values()) {
    const i = indexy.get(a.playerId);
    if (i === undefined) continue;
    nove.push({ playerIndex: i, category: "incident", timing, reason: a.duvod, emoji: EMOJI_ABSENCE[a.druh] ?? "❗", smsText: a.sms });
  }
  const zasazeni = new Set(nove.map((a) => a.playerIndex));
  return [...absence.filter((a) => !zasazeni.has(a.playerIndex)), ...nove];
}

export const DUVOD_TRENINKU: Record<string, string> = {
  vyslech: "Byl na výslechu na policii",
  soud: "Byl u soudu",
};

/** Důvody neúčasti na tréninku po indexech kádru. Vyřazení ze zápasů trénink nezakazuje. */
export function duvodyNaTrenink(hraciIds: readonly string[], absence: ReadonlyMap<string, IncidentniAbsence>): Array<string | undefined> {
  return hraciIds.map((id) => {
    const a = absence.get(id);
    return a ? DUVOD_TRENINKU[a.druh] : undefined;
  });
}

export interface NovaAbsence {
  incidentId: string;
  teamId: string;
  playerId: string;
  druh: DruhAbsence;
  /** YYYY-MM-DD, u vyřazení null. */
  od: string | null;
  do: string | null;
  /** Jen vyřazení: počet ligových kol. */
  zapasu: number | null;
  /** YYYY-MM-DD herního dne ohlášení. */
  ohlaseno: string;
  sms: string;
}

const PORADI: Record<DruhAbsence, number> = { vyslech: 1, soud: 2, vyrazen: 3, porod: 4, nemocna_mama: 5, stehovani: 6 };

export function absencePlatnaKZapisu(a: NovaAbsence): boolean {
  if (a.druh === "vyrazen") return a.zapasu !== null && a.zapasu >= 1 && a.zapasu <= VYRAZENI_MAX_ZAPASU;
  return !!a.od && !!a.do && a.od >= denPlus(a.ohlaseno, MIN_OHLASENI_ABSENCE_DNI) && a.do >= a.od;
}

/** Příkaz pro `db.batch`, nebo `null` u neplatné absence (zaloguje chybu). */
export function prikazAbsence(db: D1Database, a: NovaAbsence): D1PreparedStatement | null {
  if (!absencePlatnaKZapisu(a)) {
    logger.error({ module: M }, `neplatná incidentní absence ${a.incidentId} (${a.druh}, od ${a.od}, ohlášeno ${a.ohlaseno})`);
    return null;
  }
  return db.prepare(
    `INSERT OR IGNORE INTO club_incident_absences
       (id, incident_id, team_id, player_id, kind, od_dne, do_dne, zapasu_zbyva, announced_on, duvod, sms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `${a.incidentId}-abs-${PORADI[a.druh]}`, a.incidentId, a.teamId, a.playerId, a.druh, a.od, a.do,
    a.druh === "vyrazen" ? a.zapasu : null, a.ohlaseno.slice(0, 10), DUVOD_ABSENCE[a.druh], a.sms,
  );
}

export async function nactiIncidentniAbsence(db: D1Database, teamId: string, datum: string): Promise<Map<string, IncidentniAbsence>> {
  const den = datum.slice(0, 10);
  const rows = await db.prepare(
    `SELECT player_id, kind, od_dne, do_dne, zapasu_zbyva, duvod, sms FROM club_incident_absences
      WHERE team_id = ? AND ((od_dne <= ? AND do_dne >= ?) OR (kind = 'vyrazen' AND zapasu_zbyva > 0))
      ORDER BY announced_on, id`,
  ).bind(teamId, den, den).all<RadekAbsence>()
    .catch((e) => { logger.warn({ module: M }, `incidentní absence ${teamId}`, e); return { results: [] as RadekAbsence[] }; });
  return platneAbsence(rows.results, den);
}

/**
 * Vlivy incidentů ke dni `datum`. Situace se berou datovým oknem (`ends_on` sahá aspoň do dne
 * zápasu), ne podle `status`: kdyby se filtrovalo stavem, situace uzavřená v den zápasu by
 * zmizela z losu, který ji den předem ještě počítal, a rozešly by se celé omluvenky.
 *
 * `id` se čte navíc, aby `druhyHracu` poznal ztrátu práce zřetězenou do dluhů (`dluhyZretezenaId`) —
 * je to neměnný sloupec jako `game_date`, žádné nové čtení stavu.
 */
export async function nactiDruhyHracu(db: D1Database, teamId: string, datum: string, minOdstup = 0): Promise<Map<string, DruhVlivu[]>> {
  const rows = await db.prepare(
    `SELECT id, culprit_player_id, culprit_revealed, accused, game_date, kind, subject_player_id, ends_on
       FROM club_incidents
      WHERE team_id = ?1 AND (
        (game_date >= ?2 AND (accused != '[]' OR culprit_revealed = 1))
        OR (category = 'zivotni' AND subject_player_id IS NOT NULL AND (ends_on IS NULL OR ends_on >= ?3)))`,
  ).bind(teamId, gameExpiry(datum, -OKNO_VLIVU_DNI), datum.slice(0, 10)).all<IncidentProVliv>()
    .catch((e) => { logger.warn({ module: M }, `vlivy incidentů ${teamId}`, e); return { results: [] as IncidentProVliv[] }; });
  return druhyHracu(rows.results, datum, minOdstup);
}

export async function nactiIncidentniKontext(db: D1Database, teamId: string, datum: string): Promise<IncidentniKontext> {
  const [absence, druhy] = await Promise.all([
    nactiIncidentniAbsence(db, teamId, datum),
    nactiDruhyHracu(db, teamId, datum, MIN_OHLASENI_ABSENCE_DNI),
  ]);
  return { absence, druhy };
}
