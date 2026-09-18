/**
 * Načtení stavu klubu pro incidenty (spec Část 4, `StavKlubu`).
 * Jen čtení, kromě založení chybějícího řádku vybavení (`ensureEquipmentRow`).
 * Všechno, co katalog potřebuje k podmínkám, v jednom průchodu.
 */

import { ensureEquipmentRow } from "../equipment/equipment-service";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { RECIDIVA_DNI } from "./nastaveni";
import type { HracKlubu, StavKlubu } from "./typy";

const M = "incidents-stav";

function cislo(v: unknown, vychozi: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : vychozi;
}

function objekt(raw: unknown, co: string): Record<string, any> {
  if (typeof raw !== "string" || raw === "") return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, any>) : {};
  } catch (e) {
    logger.warn({ module: M }, `nečitelný JSON (${co})`, e);
    return {};
  }
}

function pole(raw: unknown, co: string): Array<Record<string, unknown>> {
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
  } catch (e) {
    logger.warn({ module: M }, `nečitelný JSON (${co})`, e);
    return [];
  }
}

/** Sloupce hráče, ze kterých `hracZRadku` skládá `HracKlubu`. */
export const SLOUPCE_HRACE = "id, first_name, last_name, age, personality, life_context, coach_relationship";

export interface KontextHrace {
  /** Hráč → kind běžící životní situace. */
  situace?: ReadonlyMap<string, string>;
  /** Hráči, kterým trenér odmítl zálohu (spec 5a). */
  odmitnuteZalohy?: ReadonlySet<string>;
}

export function hracZRadku(r: Record<string, unknown>, recidiviste: ReadonlySet<string> = new Set(), kontext: KontextHrace = {}): HracKlubu {
  const p = objekt(r.personality, "personality");
  const lc = objekt(r.life_context, "life_context");
  const id = String(r.id);
  return {
    id,
    jmeno: `${r.first_name} ${r.last_name}`,
    alkohol: cislo(p.alcohol, 30),
    disciplina: cislo(p.discipline, 50),
    vernost: cislo(p.patriotism, 50),
    temperament: cislo(p.temper, 40),
    vztahKTrenerovi: cislo(r.coach_relationship, 50),
    transferUnrest: cislo(lc.transferUnrest?.level, 0),
    vudcovstvi: cislo(p.leadership, 30),
    povolani: typeof lc.occupation === "string" ? lc.occupation : "",
    recidivista: recidiviste.has(id),
    vek: cislo(r.age, 25),
    dluhy: kontext.situace?.get(id) === "dluhy",
    zalohaOdmitnuta: kontext.odmitnuteZalohy?.has(id) ?? false,
  };
}

function predchoziDen(den: string): string {
  const d = new Date(`${den}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function nasledujiciDen(den: string): string {
  const d = new Date(`${den}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function nactiStavKlubu(
  db: D1Database,
  team: { id: string; league_id: string | null },
  gameDate: string,
  seasonNumber: number,
): Promise<StavKlubu | null> {
  const teamId = team.id;
  const den = gameDate.slice(0, 10);
  const vcera = predchoziDen(den);
  const zitra = nasledujiciDen(den);

  const vybaveniRow = await ensureEquipmentRow(db, teamId);
  if (!vybaveniRow) return null;
  const vybaveni: Record<string, number> = {};
  for (const [k, v] of Object.entries(vybaveniRow)) if (typeof v === "number") vybaveni[k] = v;

  const vysledky = await db.batch([
    db.prepare("SELECT changing_rooms, showers, toilets, refreshments, fence, stands, entrance_gate, lighting, pitch_condition FROM stadiums WHERE team_id = ?").bind(teamId),
    db.prepare(`SELECT ${SLOUPCE_HRACE} FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')`).bind(teamId),
    db.prepare(
      `SELECT m.id, m.home_team_id, m.home_score, m.away_score
         FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
        WHERE (m.home_team_id = ?1 OR m.away_team_id = ?1) AND m.status = 'simulated'
          AND substr(sc.scheduled_at, 1, 10) = ?2
        LIMIT 1`,
    ).bind(teamId, vcera),
    db.prepare("SELECT attendees FROM pub_sessions WHERE team_id = ? AND game_date = ?").bind(teamId, vcera),
    db.prepare("SELECT COUNT(*) AS n FROM matches WHERE (home_team_id = ?1 OR away_team_id = ?1) AND status = 'simulated'").bind(teamId),
    db.prepare(
      `SELECT kind, MAX(game_date) AS posledni,
              SUM(CASE WHEN status IN ('otevreny', 'policie') AND category IN ('kradez', 'poskozeni') THEN 1 ELSE 0 END) AS otevrene
         FROM club_incidents WHERE team_id = ? AND season_number = ? GROUP BY kind`,
    ).bind(teamId, seasonNumber),
    db.prepare(
      `SELECT 1 AS ano FROM season_calendar sc
        WHERE sc.status = 'scheduled' AND substr(sc.scheduled_at, 1, 10) IN (?1, ?2)
          AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id AND (m.home_team_id = ?3 OR m.away_team_id = ?3))
        LIMIT 1`,
    ).bind(den, zitra, teamId),
    db.prepare(
      `SELECT DISTINCT culprit_player_id AS id FROM club_incidents
        WHERE team_id = ? AND season_number = ? AND culprit_type = 'hrac' AND culprit_player_id IS NOT NULL
          AND status = 'uzavreny' AND COALESCE(resolution, '') NOT IN ('bez_skody', 'nestalo_se', 'konec_sezony')
          AND resolved_on >= ?`,
    ).bind(teamId, seasonNumber, gameExpiry(gameDate, -RECIDIVA_DNI)),
    db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId),
    db.prepare(
      `SELECT subject_player_id AS id, kind FROM club_incidents
        WHERE team_id = ? AND status = 'probiha' AND category = 'zivotni' AND subject_player_id IS NOT NULL`,
    ).bind(teamId),
    db.prepare(
      `SELECT subject_player_id AS id FROM club_incidents
        WHERE team_id = ? AND status = 'probiha' AND kind = 'dluhy'
          AND json_extract(resolution_data, '$.zaloha') = 'odmitnuto' AND subject_player_id IS NOT NULL`,
    ).bind(teamId),
    db.prepare(
      "SELECT 1 AS je FROM club_incidents WHERE team_id = ? AND season_number = ? AND kind = 'utek_s_penezi' LIMIT 1",
    ).bind(teamId, seasonNumber),
    db.prepare(
      "SELECT id, first_name, last_name, judgement, role FROM staff_members WHERE team_id = ? AND role IN ('ekonom', 'obsluha')",
    ).bind(teamId),
  ]).catch((e) => { logger.warn({ module: M }, `stav klubu ${teamId}`, e); return null; });
  if (!vysledky) return null;
  const [stadionRes, kadrRes, zapasRes, hospodaRes, pocetRes, incidentyRes, blizkyZapasRes, recidivisteRes, rozpocetRes, situaceRes, zalohyRes, utekRes, ekonomRes] = vysledky;

  const stadion: Record<string, number> = {};
  for (const [k, v] of Object.entries((stadionRes.results[0] ?? {}) as Record<string, unknown>)) {
    if (typeof v === "number") stadion[k] = v;
  }

  const recidiviste = new Set((recidivisteRes.results as Array<{ id: string }>).map((r) => String(r.id)));
  const situace = new Map((situaceRes.results as Array<{ id: string; kind: string }>).map((r) => [String(r.id), String(r.kind)]));
  const odmitnuteZalohy = new Set((zalohyRes.results as Array<{ id: string }>).map((r) => String(r.id)));
  const kadr: HracKlubu[] = (kadrRes.results as Array<Record<string, unknown>>).map((r) => hracZRadku(r, recidiviste, { situace, odmitnuteZalohy }));

  let vceraZapas: StavKlubu["vcera"] = null;
  const zapas = zapasRes.results[0] as { id: string; home_team_id: string; home_score: number; away_score: number } | undefined;
  if (zapas) {
    const doma = zapas.home_team_id === teamId;
    const vyhra = doma ? zapas.home_score > zapas.away_score : zapas.away_score > zapas.home_score;
    // Tržby se párují na id zápasu, ne na datum. `transactions.game_date` se u zápasových
    // příjmů plní reálným časem (match-runner.ts ukládá `new Date().toISOString()`),
    // kdežto herní den je o `game_clock.offset_days` jinde. Dneska je posun nula a datum
    // by sedělo, jenže první nenulový posun by udělal z tržeb natrvalo nulu, kasa
    // a tombola by se přestaly krást a nic by nespadlo. Obě transakce nesou id zápasu
    // v `reference_id` (season/finance-processor.ts), to je jediný spolehlivý klíč.
    // Dotaz musí až za dávku, protože id zápasu se dozvíme teprve z jejího výsledku;
    // jede ve stejné dávce jako červené karty, takže je to pořád jeden okružní dotaz navíc
    // a jen v den po zápase.
    const poZapase = await db.batch([
      db.prepare("SELECT player_id FROM match_player_stats WHERE match_id = ? AND team_id = ? AND red_cards > 0").bind(zapas.id, teamId),
      db.prepare(
        `SELECT SUM(CASE WHEN type = 'concession_income_self' THEN amount END) AS kasa,
                SUM(CASE WHEN type = 'raffle_income' THEN amount END) AS tombola
           FROM transactions
          WHERE team_id = ? AND reference_id = ? AND type IN ('concession_income_self', 'raffle_income')`,
      ).bind(teamId, zapas.id),
    ]).catch((e) => { logger.warn({ module: M }, `červené karty a tržby ze zápasu ${zapas.id}`, e); return null; });

    const cervene = (poZapase?.[0].results ?? []) as Array<{ player_id: string }>;
    const suma = poZapase?.[1].results[0] as { kasa?: unknown; tombola?: unknown } | undefined;
    // Chybějící řádek, NULL i zápor jsou nula: krást se dá jen ze skutečné tržby.
    const trzby = { kasa: Math.max(0, cislo(suma?.kasa, 0)), tombola: Math.max(0, cislo(suma?.tombola, 0)) };
    vceraZapas = { vyhra, doma, cervenaKarta: cervene.map((r) => r.player_id), zapasId: zapas.id, trzby };
  }

  // Hospoda zná i vůdce fanoušků (playerId „fan-…") a hosty. Do stavu patří jen hráči kádru.
  const idKadru = new Set(kadr.map((h) => h.id));
  const hospodaVcera = pole((hospodaRes.results[0] as { attendees?: unknown } | undefined)?.attendees, "attendees")
    .filter((a) => a.teamId === teamId && !a.isVisitor && !a.isCoach && typeof a.playerId === "string" && idKadru.has(a.playerId))
    .map((a) => String(a.playerId));

  const posledniVyskyt: Record<string, string> = {};
  let otevreneProblemy = 0;
  for (const r of incidentyRes.results as Array<{ kind: string; posledni: string; otevrene: number }>) {
    posledniVyskyt[r.kind] = String(r.posledni).slice(0, 10);
    otevreneProblemy += r.otevrene ?? 0;
  }

  const staffRadky = ekonomRes.results as Array<{ id: string; first_name: string; last_name: string; judgement: number | null; role: string }>;
  const ekonomRadek = staffRadky.find((r) => r.role === "ekonom");
  const ekonom = ekonomRadek
    ? { id: String(ekonomRadek.id), jmeno: `${ekonomRadek.first_name} ${ekonomRadek.last_name}`, judgement: ekonomRadek.judgement ?? 5 }
    : null;
  const obsluhaRadek = staffRadky.find((r) => r.role === "obsluha");
  const obsluha = obsluhaRadek
    ? { id: String(obsluhaRadek.id), jmeno: `${obsluhaRadek.first_name} ${obsluhaRadek.last_name}` }
    : null;

  return {
    teamId, leagueId: team.league_id, seasonNumber, gameDate, den,
    vybaveni, stadion, kadr, vcera: vceraZapas, hospodaVcera,
    odehranychZapasu: cislo((pocetRes.results[0] as { n?: number } | undefined)?.n, 0),
    otevreneProblemy, posledniVyskyt,
    zapasDnesNeboZitra: blizkyZapasRes.results.length > 0,
    rozpocet: cislo((rozpocetRes.results[0] as { budget?: number } | undefined)?.budget, 0),
    situace,
    utekLetos: utekRes.results.length > 0,
    ekonom, obsluha,
  };
}
