/**
 * Propojené kluby: víc účtů téhož člověka.
 *
 * Stejného majitele kód nepozná, každý účet má vlastní user_id. Propojení proto
 * zapisuje admin ručně do `club_links`, kluby se stejným `group_id` patří jednomu
 * člověku. Za propojené se berou i dva A-týmy pod jedním user_id.
 *
 * Mezi propojenými kluby neprojde přestup, hostování, výměna, odkup z hostování,
 * podpis propuštěného hráče, nabídnutí do poptávky ani sázka na zápas toho druhého.
 * A-tým a jeho U21 jsou jeden klub, přesun mezi nimi se neblokuje.
 *
 * Propojení je veřejné: profil týmu ukazuje, se kterým klubem má stejného majitele.
 * Co už běží (hostování, splátky), doběhne. Srpnové oznámení slíbilo amnestii.
 */

import { logger } from "../lib/logger";

const M = "club-links";

/** Hlášky pro klub, kterému propojení něco zablokovalo. */
export const LINKED_CLUBS_ERRORS = {
  transfer: "Kluby mají stejného majitele. Přestupy, hostování ani výměny mezi nimi pravidla soutěže nepovolují.",
  freeAgent: "Hráče propuštěného z klubu se stejným majitelem podepsat nemůžeš.",
  demandPitch: "Klubu se stejným majitelem hráče přes poptávku nenabídneš.",
  bet: "Na zápasy klubu se stejným majitelem se nesází.",
} as const;

const VIRTUAL_TEAM_ID = "virtual_ai";

interface ClubRow {
  club_team_id: string;
  user_id: string | null;
  group_id: string | null;
}

async function clubOf(db: D1Database, teamId: string): Promise<ClubRow | null> {
  return db.prepare(
    `SELECT club.id AS club_team_id, club.user_id, l.group_id
       FROM teams t
       JOIN teams club ON club.id = COALESCE(t.parent_team_id, t.id)
       LEFT JOIN club_links l ON l.team_id = club.id
      WHERE t.id = ?`,
  ).bind(teamId).first<ClubRow>();
}

function isHumanUser(userId: string | null): userId is string {
  return !!userId && userId !== "ai";
}

/**
 * Patří dvě soupisky propojeným klubům?
 *
 * Bez try/catch schválně: přestup, který proklouzne kvůli chybě čtení,
 * je horší než chyba, kterou manažer zopakuje.
 */
export async function areClubsLinked(db: D1Database, teamA: string | null | undefined, teamB: string | null | undefined): Promise<boolean> {
  if (!teamA || !teamB || teamA === VIRTUAL_TEAM_ID || teamB === VIRTUAL_TEAM_ID) return false;
  const [a, b] = await Promise.all([clubOf(db, teamA), clubOf(db, teamB)]);
  if (!a || !b || a.club_team_id === b.club_team_id) return false;
  if (isHumanUser(a.user_id) && a.user_id === b.user_id) return true;
  return a.group_id != null && a.group_id === b.group_id;
}

/** A-týmy propojené s klubem, kam patří `teamId` (parametr ?1), bez klubu samotného. */
const LINKED_CLUBS_CTE = `
  WITH me AS (
    SELECT club.id AS club_id, club.user_id, l.group_id
      FROM teams t
      JOIN teams club ON club.id = COALESCE(t.parent_team_id, t.id)
      LEFT JOIN club_links l ON l.team_id = club.id
     WHERE t.id = ?1
  ),
  linked_clubs AS (
    SELECT l.team_id AS club_id FROM club_links l, me
     WHERE me.group_id IS NOT NULL AND l.group_id = me.group_id AND l.team_id <> me.club_id
    UNION
    SELECT c.id FROM teams c, me
     WHERE c.parent_team_id IS NULL AND me.user_id IS NOT NULL AND me.user_id <> 'ai'
       AND c.user_id = me.user_id AND c.id <> me.club_id
  )`;

/** Všechny soupisky (A-týmy i U21) klubů propojených s klubem, kam patří `teamId`. */
export async function linkedTeamIds(db: D1Database, teamId: string): Promise<Set<string>> {
  const rows = await db.prepare(
    `${LINKED_CLUBS_CTE}
     SELECT t.id FROM teams t WHERE COALESCE(t.parent_team_id, t.id) IN (SELECT club_id FROM linked_clubs)`,
  ).bind(teamId).all<{ id: string }>();
  return new Set(rows.results.map((r) => r.id));
}

/** Kluby se stejným majitelem pro profil týmu. Jen A-týmy, U21 patří pod ně. */
export async function sameOwnerClubs(db: D1Database, teamId: string): Promise<Array<{ id: string; name: string }>> {
  const rows = await db.prepare(
    `${LINKED_CLUBS_CTE}
     SELECT t.id, t.name FROM teams t WHERE t.id IN (SELECT club_id FROM linked_clubs) ORDER BY t.name`,
  ).bind(teamId).all<{ id: string; name: string }>();
  return rows.results;
}

// ── Přehled pro admina ─────────────────────────────────────────────────────

export interface ClubBrief {
  teamId: string;
  name: string;
  email: string | null;
  district: string | null;
}

export interface LinkGroup {
  groupId: string;
  clubs: Array<ClubBrief & { note: string | null; linkedAt: string }>;
}

/** Klub v přehledu dvojic; `groupId` je skupina, kam ho admin už zapsal. */
export type PairClub = ClubBrief & { groupId: string | null };

export interface SuspiciousPair {
  a: PairClub;
  b: PairClub;
  friendlies: number;
  transfers: number;
  loans: number;
  /** Kolik korun se mezi nimi přelilo v přijatých nabídkách a sázkách v přátelácích, oběma směry. */
  money: number;
  linked: boolean;
}

interface PairStats { friendlies: number; transfers: number; loans: number; money: number }

/** Jak moc dvojice stojí za pohled. Přestup váží víc než přátelák. */
export function pairScore(s: PairStats): number {
  return s.friendlies + 3 * (s.transfers + s.loans);
}

/** Od kolika bodů se dvojice v přehledu ukáže. Tři přáteláky nebo jeden obchod. */
export const SUSPICIOUS_MIN_SCORE = 3;

function pairKey(x: string, y: string): string {
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

async function loadClubBriefs(db: D1Database, ids: string[]): Promise<Map<string, PairClub>> {
  if (ids.length === 0) return new Map();
  const rows = await db.prepare(
    `SELECT t.id, t.name, u.email, v.district, l.group_id
       FROM teams t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN villages v ON v.id = t.village_id
       LEFT JOIN club_links l ON l.team_id = t.id
      WHERE t.id IN (${ids.map(() => "?").join(",")})`,
  ).bind(...ids).all<{ id: string; name: string; email: string | null; district: string | null; group_id: string | null }>();
  return new Map(rows.results.map((r) => [r.id, { teamId: r.id, name: r.name, email: r.email, district: r.district, groupId: r.group_id }]));
}

/** Zapsaná propojení po skupinách. */
export async function listLinkGroups(db: D1Database): Promise<LinkGroup[]> {
  const rows = await db.prepare(
    "SELECT team_id, group_id, note, created_at FROM club_links ORDER BY group_id, created_at",
  ).all<{ team_id: string; group_id: string; note: string | null; created_at: string }>();
  const briefs = await loadClubBriefs(db, rows.results.map((r) => r.team_id));
  const groups = new Map<string, LinkGroup>();
  for (const r of rows.results) {
    const brief = briefs.get(r.team_id) ?? { teamId: r.team_id, name: "(klub nenalezen)", email: null, district: null };
    const group = groups.get(r.group_id) ?? { groupId: r.group_id, clubs: [] };
    group.clubs.push({ teamId: brief.teamId, name: brief.name, email: brief.email, district: brief.district, note: r.note, linkedAt: r.created_at });
    groups.set(r.group_id, group);
  }
  return [...groups.values()];
}

/**
 * Dvojice lidských klubů, které spolu nejčastěji hrají přáteláky a obchodují.
 *
 * Nic netrestá, jen ukazuje stopu. Rozhoduje admin: z přehledu pozná, koho propojit.
 */
export async function suspiciousPairs(db: D1Database, limit = 20): Promise<SuspiciousPair[]> {
  const stats = new Map<string, PairStats & { x: string; y: string }>();
  const statsFor = (x: string, y: string) => {
    const key = pairKey(x, y);
    let s = stats.get(key);
    if (!s) {
      s = { x: x < y ? x : y, y: x < y ? y : x, friendlies: 0, transfers: 0, loans: 0, money: 0 };
      stats.set(key, s);
    }
    return s;
  };

  // Sázka v přáteláku je další cesta, jak přelít peníze, proto se přičítá k obchodům.
  const friendlies = await db.prepare(
    `SELECT challenger_team_id AS x, challenged_team_id AS y, COUNT(*) AS n,
            SUM(CASE WHEN stake_status = 'paid' THEN stake ELSE 0 END) AS staked
       FROM challenges WHERE status = 'played'
      GROUP BY MIN(challenger_team_id, challenged_team_id), MAX(challenger_team_id, challenged_team_id)`,
  ).all<{ x: string; y: string; n: number; staked: number | null }>()
    .catch((e) => { logger.error({ module: M }, "přáteláky pro přehled dvojic", e); return { results: [] as Array<{ x: string; y: string; n: number; staked: number | null }> }; });
  for (const r of friendlies.results) {
    const pair = statsFor(r.x, r.y);
    pair.friendlies += r.n;
    pair.money += r.staked ?? 0;
  }

  // Nabídka drží soupisku, dvojice se počítá za kluby (U21 patří pod A-tým).
  const deals = await db.prepare(
    `SELECT COALESCE(f.parent_team_id, f.id) AS x, COALESCE(t.parent_team_id, t.id) AS y,
            o.offer_type, COUNT(*) AS n, SUM(COALESCE(o.counter_amount, o.offer_amount, 0)) AS money
       FROM transfer_offers o
       JOIN teams f ON f.id = o.from_team_id
       JOIN teams t ON t.id = o.to_team_id
      WHERE o.status = 'accepted' AND f.user_id <> 'ai' AND t.user_id <> 'ai'
        AND COALESCE(f.parent_team_id, f.id) <> COALESCE(t.parent_team_id, t.id)
      GROUP BY 1, 2, 3`,
  ).all<{ x: string; y: string; offer_type: string | null; n: number; money: number | null }>()
    .catch((e) => { logger.error({ module: M }, "přestupy pro přehled dvojic", e); return { results: [] as Array<{ x: string; y: string; offer_type: string | null; n: number; money: number | null }> }; });
  for (const r of deals.results) {
    const s = statsFor(r.x, r.y);
    if (r.offer_type === "loan") s.loans += r.n;
    else s.transfers += r.n;
    s.money += r.money ?? 0;
  }

  const top = [...stats.values()]
    .filter((s) => pairScore(s) >= SUSPICIOUS_MIN_SCORE)
    .sort((p, q) => pairScore(q) - pairScore(p) || q.money - p.money)
    .slice(0, limit);

  const briefs = await loadClubBriefs(db, [...new Set(top.flatMap((s) => [s.x, s.y]))]);
  const missing = (id: string): PairClub =>
    ({ teamId: id, name: "(klub nenalezen)", email: null, district: null, groupId: null });

  return top.map((s) => {
    const a = briefs.get(s.x) ?? missing(s.x);
    const b = briefs.get(s.y) ?? missing(s.y);
    return {
      a, b,
      friendlies: s.friendlies, transfers: s.transfers, loans: s.loans, money: s.money,
      linked: a.groupId != null && a.groupId === b.groupId,
    };
  });
}
