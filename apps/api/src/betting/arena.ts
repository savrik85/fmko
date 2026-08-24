/**
 * Tiketaréna — vyvěšené tikety a vlákna pod nimi.
 *
 * Sdílení je vědomé gesto: u běžícího tiketu tím hráč odkrývá, na co vsadil,
 * a ostatní to můžou okomentovat dřív, než se hraje. Proto jde vzít zpět.
 *
 * Aréna je per soutěž. Tikety z cizí ligy nezajímají nikoho — hráč ty týmy nezná.
 */

import { logger } from "../lib/logger";

const M = "betting-arena";

/** Avatar je v databázi JSON string. Rozbitý avatar nesmí shodit celou arénu. */
function avatarJson(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "string") return null;
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch (e) { logger.warn({ module: M }, "avatar trenéra nejde přečíst", e); return null; }
}

/** Nejdelší komentář. Delší je fórum, ne poznámka pod tiketem. */
export const MAX_KOMENTAR = 300;

/** Vzkaz autora k vyvěšenému tiketu. Kratší než komentář — je to titulek, ne projev. */
export const MAX_VZKAZ = 200;

/** Kolik tiketů se v aréně ukáže. */
export const ARENA_LIMIT = 40;

export interface ArenaTip {
  market: string;
  label: string;
  oddsX100: number;
  result: string;
  zapas: string;
  vysledek: string | null;
}

export interface ArenaKomentar {
  id: string;
  teamId: string;
  teamName: string;
  authorName: string | null;
  authorAvatar: Record<string, unknown> | null;
  body: string;
  createdAt: string;
  muzuSmazat: boolean;
}

export interface ArenaTiket {
  id: string;
  cislo: string;
  teamId: string;
  teamName: string;
  authorName: string | null;
  authorAvatar: Record<string, unknown> | null;
  stake: number;
  totalOddsX100: number;
  potentialPayout: number;
  payout: number;
  capped: boolean;
  status: string;
  gameWeek: number | null;
  sharedAt: string;
  /** Co k tiketu napsal autor při vyvěšení. */
  vzkaz: string | null;
  jeMuj: boolean;
  tipy: ArenaTip[];
  komentare: ArenaKomentar[];
}

/**
 * Vyvěšené tikety soutěže i s vlákny.
 *
 * `mujTeamId` rozhoduje jen o příznacích „jeMuj" a „muzuSmazat" — obsah vidí
 * všichni stejně.
 */
export async function arena(
  db: D1Database, leagueId: string, mujTeamId: string | null, limit = ARENA_LIMIT,
): Promise<ArenaTiket[]> {
  const tikety = await db.prepare(
    `SELECT t.id, t.team_id, t.stake, t.total_odds_x100, t.potential_payout, t.payout,
            t.capped, t.status, t.shared_at, t.share_note, tm.name AS team_name, sc.game_week,
            (SELECT m.name FROM managers m WHERE m.team_id = t.team_id ORDER BY m.created_at LIMIT 1) AS author_name,
            (SELECT m.avatar FROM managers m WHERE m.team_id = t.team_id ORDER BY m.created_at LIMIT 1) AS author_avatar
       FROM bet_tickets t
       JOIN teams tm ON tm.id = t.team_id
       LEFT JOIN season_calendar sc ON sc.id = t.calendar_id
      WHERE t.league_id = ? AND t.shared_at IS NOT NULL AND t.status <> 'pending'
      ORDER BY t.shared_at DESC LIMIT ?`
  ).bind(leagueId, limit).all<Record<string, unknown>>()
    .catch((e) => { logger.error({ module: M }, `aréna ligy ${leagueId}`, e); return { results: [] }; });

  if (tikety.results.length === 0) return [];
  const ids = tikety.results.map((t) => t.id as string);
  const ph = ids.map(() => "?").join(",");

  const [tipy, komentare] = await Promise.all([
    db.prepare(
      `SELECT s.ticket_id, s.market, s.label, s.odds_x100, s.result,
              h.name AS domaci, a.name AS hoste, m.home_score, m.away_score
         FROM bet_selections s
         JOIN matches m ON m.id = s.match_id
         JOIN teams h ON h.id = m.home_team_id
         JOIN teams a ON a.id = m.away_team_id
        WHERE s.ticket_id IN (${ph})`
    ).bind(...ids).all<Record<string, unknown>>()
      .catch((e) => { logger.error({ module: M }, "tipy arény", e); return { results: [] }; }),

    db.prepare(
      `SELECT c.id, c.ticket_id, c.team_id, c.team_name, c.author_name, c.body, c.created_at,
              (SELECT m.avatar FROM managers m WHERE m.team_id = c.team_id ORDER BY m.created_at LIMIT 1) AS author_avatar
         FROM bet_comments c WHERE c.ticket_id IN (${ph}) ORDER BY c.created_at ASC`
    ).bind(...ids).all<Record<string, unknown>>()
      .catch((e) => { logger.error({ module: M }, "komentáře arény", e); return { results: [] }; }),
  ]);

  const tipyPodle = new Map<string, ArenaTip[]>();
  for (const x of tipy.results) {
    const arr = tipyPodle.get(x.ticket_id as string) ?? [];
    arr.push({
      market: x.market as string,
      label: x.label as string,
      oddsX100: x.odds_x100 as number,
      result: x.result as string,
      zapas: `${x.domaci} — ${x.hoste}`,
      vysledek: x.home_score === null ? null : `${x.home_score}:${x.away_score}`,
    });
    tipyPodle.set(x.ticket_id as string, arr);
  }

  const komPodle = new Map<string, ArenaKomentar[]>();
  for (const k of komentare.results) {
    const arr = komPodle.get(k.ticket_id as string) ?? [];
    arr.push({
      id: k.id as string,
      teamId: k.team_id as string,
      teamName: k.team_name as string,
      authorName: (k.author_name as string) ?? null,
      authorAvatar: avatarJson(k.author_avatar),
      body: k.body as string,
      createdAt: k.created_at as string,
      muzuSmazat: !!mujTeamId && k.team_id === mujTeamId,
    });
    komPodle.set(k.ticket_id as string, arr);
  }

  return tikety.results.map((t) => ({
    id: t.id as string,
    cislo: String(t.id).slice(0, 4).toUpperCase(),
    teamId: t.team_id as string,
    teamName: t.team_name as string,
    authorName: (t.author_name as string) ?? null,
    authorAvatar: avatarJson(t.author_avatar),
    stake: t.stake as number,
    totalOddsX100: t.total_odds_x100 as number,
    potentialPayout: t.potential_payout as number,
    payout: t.payout as number,
    capped: !!t.capped,
    status: t.status as string,
    gameWeek: (t.game_week as number) ?? null,
    sharedAt: t.shared_at as string,
    vzkaz: (t.share_note as string) ?? null,
    jeMuj: !!mujTeamId && t.team_id === mujTeamId,
    tipy: tipyPodle.get(t.id as string) ?? [],
    komentare: komPodle.get(t.id as string) ?? [],
  }));
}

/**
 * Vyvěsí tiket do arény nebo ho stáhne. Vrací nový stav.
 * Sdílet jde jen vlastní tiket, který už není `pending`.
 */
export async function prepniSdileni(
  db: D1Database, teamId: string, ticketId: string, vzkaz?: string,
): Promise<{ ok: true; sdileno: boolean } | { ok: false; duvod: string }> {
  const t = await db.prepare(
    "SELECT shared_at, status FROM bet_tickets WHERE id = ? AND team_id = ?"
  ).bind(ticketId, teamId).first<{ shared_at: string | null; status: string }>()
    .catch((e) => { logger.warn({ module: M }, "načtení tiketu ke sdílení", e); return null; });

  if (!t) return { ok: false, duvod: "Tenhle tiket ti nepatří." };
  if (t.status === "pending") return { ok: false, duvod: "Tiket ještě není podaný." };

  const sdileno = !t.shared_at;
  // Vzkaz se drží jen u vyvěšeného tiketu — po stažení z arény zmizí s ním.
  const text = (vzkaz ?? "").trim().slice(0, MAX_VZKAZ);
  const res = await db.prepare(
    `UPDATE bet_tickets
        SET shared_at = ${sdileno ? "strftime('%Y-%m-%dT%H:%M:%SZ','now')" : "NULL"},
            share_note = ?
      WHERE id = ? AND team_id = ?`
  ).bind(sdileno && text ? text : null, ticketId, teamId).run()
    .catch((e) => { logger.error({ module: M }, "přepnutí sdílení", e); return null; });

  if (!res || (res.meta?.changes ?? 0) === 0) return { ok: false, duvod: "Nepodařilo se to uložit." };
  return { ok: true, sdileno };
}

/**
 * Přidá komentář do vlákna pod vyvěšeným tiketem.
 *
 * Komentovat jde jen tiket, který je opravdu vyvěšený a je ze stejné soutěže —
 * jinak by šlo psát pod cizí tikety přes opsané id.
 */
export async function pridejKomentar(db: D1Database, opts: {
  ticketId: string;
  teamId: string;
  body: string;
}): Promise<{ ok: true; id: string } | { ok: false; duvod: string; status: number }> {
  const text = opts.body.trim();
  if (text.length < 2) return { ok: false, duvod: "Napiš aspoň něco.", status: 400 };
  if (text.length > MAX_KOMENTAR) {
    return { ok: false, duvod: `Nejvýš ${MAX_KOMENTAR} znaků.`, status: 400 };
  }

  const t = await db.prepare(
    `SELECT t.league_id FROM bet_tickets t
      WHERE t.id = ? AND t.shared_at IS NOT NULL`
  ).bind(opts.ticketId).first<{ league_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "kontrola tiketu ke komentáři", e); return null; });

  if (!t) return { ok: false, duvod: "Tenhle tiket v aréně není.", status: 404 };

  const kdo = await db.prepare(
    `SELECT tm.name, tm.league_id,
            (SELECT m.name FROM managers m WHERE m.team_id = tm.id ORDER BY m.created_at LIMIT 1) AS manager
       FROM teams tm WHERE tm.id = ?`
  ).bind(opts.teamId).first<{ name: string; league_id: string | null; manager: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "autor komentáře", e); return null; });

  if (!kdo) return { ok: false, duvod: "Klub nenalezen.", status: 404 };
  if (kdo.league_id !== t.league_id) {
    return { ok: false, duvod: "Do arény cizí soutěže nepíšeš.", status: 403 };
  }

  const id = crypto.randomUUID();
  const res = await db.prepare(
    `INSERT INTO bet_comments (id, ticket_id, team_id, team_name, author_name, body)
     VALUES (?,?,?,?,?,?)`
  ).bind(id, opts.ticketId, opts.teamId, kdo.name, kdo.manager, text).run()
    .catch((e) => { logger.error({ module: M }, "zápis komentáře", e); return null; });

  if (!res) return { ok: false, duvod: "Komentář se nepodařilo uložit.", status: 500 };
  return { ok: true, id };
}

/** Smazat jde jen vlastní komentář. */
export async function smazKomentar(
  db: D1Database, teamId: string, commentId: string,
): Promise<boolean> {
  const res = await db.prepare(
    "DELETE FROM bet_comments WHERE id = ? AND team_id = ?"
  ).bind(commentId, teamId).run()
    .catch((e) => { logger.error({ module: M }, "mazání komentáře", e); return null; });
  return !!res && (res.meta?.changes ?? 0) > 0;
}
