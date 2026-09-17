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
export type DruhVlivu = "obvineny" | "pachatel";

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

export interface IncidentProVliv {
  culprit_player_id: string | null;
  culprit_revealed: number;
  accused: string;
  game_date: string;
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
 * Obvinění, která skončila zapíráním (nevinný i vinný, který svou vinu zapřel), a odhalení
 * pachatelé, na které incident ke dni `datum` ještě působí.
 *
 * `minOdstupObvineni` omezuje, jak čerstvé musí být obvinění, aby se počítalo — los omluvenek
 * ho smí zohlednit jen tehdy, když je aspoň `MIN_OHLASENI_ABSENCE_DNI` dní staré (jinak by pozdní
 * obvinění den před zápasem měnilo vstup do už rozjetého losu). Zápas a kabina čtou vliv bez
 * odstupu (0).
 */
export function druhyHracu(incidenty: readonly IncidentProVliv[], datum: string, minOdstupObvineni = 0): Map<string, DruhVlivu[]> {
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
  for (const inc of incidenty) {
    for (const o of nactiObvineni(inc.accused)) {
      if (o.vysledek === "zapira" && vOkne(o.den, minOdstupObvineni)) pridej(o.playerId, "obvineny");
    }
    if (inc.culprit_revealed === 1 && inc.culprit_player_id && vOkne(inc.game_date, 0)) pridej(inc.culprit_player_id, "pachatel");
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

export async function nactiDruhyHracu(db: D1Database, teamId: string, datum: string, minOdstupObvineni = 0): Promise<Map<string, DruhVlivu[]>> {
  const rows = await db.prepare(
    `SELECT culprit_player_id, culprit_revealed, accused, game_date FROM club_incidents
      WHERE team_id = ? AND game_date >= ? AND (accused != '[]' OR culprit_revealed = 1)`,
  ).bind(teamId, gameExpiry(datum, -OKNO_VLIVU_DNI)).all<IncidentProVliv>()
    .catch((e) => { logger.warn({ module: M }, `vlivy incidentů ${teamId}`, e); return { results: [] as IncidentProVliv[] }; });
  return druhyHracu(rows.results, datum, minOdstupObvineni);
}

export async function nactiIncidentniKontext(db: D1Database, teamId: string, datum: string): Promise<IncidentniKontext> {
  const [absence, druhy] = await Promise.all([
    nactiIncidentniAbsence(db, teamId, datum),
    nactiDruhyHracu(db, teamId, datum, MIN_OHLASENI_ABSENCE_DNI),
  ]);
  return { absence, druhy };
}
