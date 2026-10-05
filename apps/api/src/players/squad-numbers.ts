/**
 * Čísla dresů. Každý aktivní hráč týmu má číslo 1–99 a v rámci týmu (A-tým a U21 zvlášť)
 * ho nemá nikdo jiný. Dřív se čísla rozdala jen při založení týmu a přestup je smazal,
 * takže většina kádrů běhala bez čísel.
 *
 * Kolize se hlídají aplikací, ne unikátním indexem v DB: přestup mění `team_id` na mnoha
 * místech a index by takový UPDATE shodil. Místo toho:
 *  - přestup/hostování přidělí číslo hned (`ensureSquadNumbers` pro nový tým),
 *  - pravidelný úklid (`ensureAllSquadNumbers`) doplní čísla hráčům, kteří přišli jinudy
 *    (mládež, hospoda, volní hráči) a rozřeší případné kolize,
 *  - změna čísla manažerem při obsazeném čísle hráče prohodí (`setSquadNumber`).
 */

import { logger } from "../lib/logger";

const MODULE = { module: "squad-numbers" };

/** Aktivní hráč týmu: propuštěný ani hráč, který odmítá hrát, číslo neblokuje. */
const ACTIVE_SQL = "(status IS NULL OR status NOT IN ('released', 'quit'))";

export const MIN_SQUAD_NUMBER = 1;
export const MAX_SQUAD_NUMBER = 99;

type Group = "GK" | "DEF" | "MID" | "FWD";

/** Oblíbená čísla podle postu, jak je nosí hráči na okresních hřištích. */
const PREFERRED: Record<Group, number[]> = {
  GK: [1, 12, 30, 23, 33, 31, 21, 41],
  DEF: [2, 3, 4, 5, 6, 13, 15, 16, 22, 24, 25, 26],
  MID: [8, 6, 10, 7, 14, 16, 18, 20, 17, 19, 28, 21],
  FWD: [9, 11, 7, 10, 19, 17, 20, 27, 29, 18],
};

export function positionGroup(position: string | null | undefined): Group {
  const p = (position || "").toUpperCase();
  if (p === "GK" || p === "BRA") return "GK";
  if (["DEF", "OBR", "CB", "LB", "RB", "LWB", "RWB"].includes(p)) return "DEF";
  if (["FWD", "UTO", "ÚTO", "ST", "CF", "LW", "RW"].includes(p)) return "FWD";
  return "MID";
}

export function isValidSquadNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= MIN_SQUAD_NUMBER && n <= MAX_SQUAD_NUMBER;
}

/** Volné číslo pro hráče: nejdřív oblíbená čísla postu, pak nejnižší volné. */
export function pickFreeNumber(taken: Set<number>, position: string | null | undefined): number | null {
  for (const n of PREFERRED[positionGroup(position)]) {
    if (!taken.has(n)) return n;
  }
  for (let n = MIN_SQUAD_NUMBER; n <= MAX_SQUAD_NUMBER; n++) {
    if (!taken.has(n)) return n;
  }
  return null;
}

export interface SquadPlayer {
  id: string;
  position: string | null;
  squad_number: number | null;
}

/**
 * Které hráče přečíslovat a na co. Platné číslo si nechá první hráč, který ho má
 * (pořadí podle ID, aby výsledek nezávisel na pořadí řádků z DB); ostatní a hráči bez čísla
 * dostanou volné číslo. Brankáři vybírají první, aby jim zůstala jednička.
 */
export function planSquadNumbers(players: SquadPlayer[]): Array<{ id: string; number: number }> {
  const sorted = [...players].sort((a, b) => a.id.localeCompare(b.id));
  const taken = new Set<number>();
  const needs: SquadPlayer[] = [];
  for (const p of sorted) {
    if (isValidSquadNumber(p.squad_number) && !taken.has(p.squad_number)) {
      taken.add(p.squad_number);
    } else {
      needs.push(p);
    }
  }
  const order: Record<Group, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  needs.sort((a, b) => order[positionGroup(a.position)] - order[positionGroup(b.position)] || a.id.localeCompare(b.id));

  const changes: Array<{ id: string; number: number }> = [];
  for (const p of needs) {
    const n = pickFreeNumber(taken, p.position);
    if (n === null) break; // víc než 99 hráčů v jednom týmu se nestává
    taken.add(n);
    changes.push({ id: p.id, number: n });
  }
  return changes;
}

/** Doplní a opraví čísla v jednom týmu. Vrací počet přečíslovaných hráčů. */
export async function ensureSquadNumbers(db: D1Database, teamId: string): Promise<number> {
  const rows = await db
    .prepare(`SELECT id, position, squad_number FROM players WHERE team_id = ? AND ${ACTIVE_SQL}`)
    .bind(teamId)
    .all<SquadPlayer>();
  const changes = planSquadNumbers(rows.results ?? []);
  if (changes.length === 0) return 0;
  await db.batch(
    changes.map((ch) => db.prepare("UPDATE players SET squad_number = ? WHERE id = ?").bind(ch.number, ch.id)),
  );
  return changes.length;
}

/** Úklid napříč hrou: jen týmy, kde někdo nemá číslo nebo se dva hráči o číslo dělí. */
export async function ensureAllSquadNumbers(db: D1Database): Promise<{ teams: number; players: number }> {
  const rows = await db
    .prepare(
      `SELECT DISTINCT team_id FROM players
       WHERE team_id IS NOT NULL AND ${ACTIVE_SQL}
         AND (squad_number IS NULL OR squad_number < ${MIN_SQUAD_NUMBER} OR squad_number > ${MAX_SQUAD_NUMBER})
       UNION
       SELECT team_id FROM players
       WHERE team_id IS NOT NULL AND ${ACTIVE_SQL} AND squad_number BETWEEN ${MIN_SQUAD_NUMBER} AND ${MAX_SQUAD_NUMBER}
       GROUP BY team_id, squad_number HAVING COUNT(*) > 1`,
    )
    .all<{ team_id: string }>();
  let players = 0;
  let teams = 0;
  for (const r of rows.results ?? []) {
    try {
      const changed = await ensureSquadNumbers(db, r.team_id);
      if (changed > 0) {
        teams++;
        players += changed;
      }
    } catch (e) {
      logger.warn(MODULE, `čísla dresů pro tým ${r.team_id} se nepodařilo doplnit`, e);
    }
  }
  return { teams, players };
}

export type SetSquadNumberResult =
  | { ok: true; number: number; swappedWith: { id: string; name: string; number: number | null } | null }
  | { ok: false; error: string; status: 400 | 404 };

/**
 * Manažer mění číslo hráče. Když číslo nosí spoluhráč, čísla se prohodí (spoluhráč dostane
 * původní číslo, nebo volné, když hráč žádné neměl). Obě změny jdou v jedné dávce.
 */
export async function setSquadNumber(
  db: D1Database,
  playerId: string,
  number: number,
): Promise<SetSquadNumberResult> {
  if (!isValidSquadNumber(number)) {
    return { ok: false, status: 400, error: `Číslo dresu musí být celé číslo od ${MIN_SQUAD_NUMBER} do ${MAX_SQUAD_NUMBER}.` };
  }
  const player = await db
    .prepare(`SELECT id, team_id, position, squad_number FROM players WHERE id = ? AND ${ACTIVE_SQL}`)
    .bind(playerId)
    .first<{ id: string; team_id: string | null; position: string | null; squad_number: number | null }>();
  if (!player?.team_id) return { ok: false, status: 404, error: "Hráč nenalezen" };
  if (player.squad_number === number) return { ok: true, number, swappedWith: null };

  const holder = await db
    .prepare(
      `SELECT id, first_name, last_name, position FROM players
       WHERE team_id = ? AND squad_number = ? AND id <> ? AND ${ACTIVE_SQL} LIMIT 1`,
    )
    .bind(player.team_id, number, playerId)
    .first<{ id: string; first_name: string; last_name: string; position: string | null }>();

  if (!holder) {
    await db.prepare("UPDATE players SET squad_number = ? WHERE id = ?").bind(number, playerId).run();
    return { ok: true, number, swappedWith: null };
  }

  let holderNumber: number | null = isValidSquadNumber(player.squad_number) ? player.squad_number : null;
  if (holderNumber === null) {
    const takenRows = await db
      .prepare(`SELECT squad_number FROM players WHERE team_id = ? AND ${ACTIVE_SQL} AND squad_number IS NOT NULL`)
      .bind(player.team_id)
      .all<{ squad_number: number }>();
    const taken = new Set((takenRows.results ?? []).map((r) => r.squad_number));
    taken.add(number);
    holderNumber = pickFreeNumber(taken, holder.position);
  }
  await db.batch([
    db.prepare("UPDATE players SET squad_number = ? WHERE id = ?").bind(holderNumber, holder.id),
    db.prepare("UPDATE players SET squad_number = ? WHERE id = ?").bind(number, playerId),
  ]);
  return {
    ok: true,
    number,
    swappedWith: { id: holder.id, name: `${holder.first_name} ${holder.last_name}`, number: holderNumber },
  };
}
