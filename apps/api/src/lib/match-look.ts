/**
 * Vzhled hráčů, dresy a trenéři pro 3D záznam zápasu (detail ligového, pohárového i turnajového zápasu).
 */
import { orderPair } from "../community/manager-relations";
import { currentSeasonSql } from "./season";

interface PlayerLook {
  skinColor?: string;
  /** null = holá hlava. */
  hairColor?: string | null;
  /** Výška v cm. */
  height?: number;
  /** Celý obličej (facesjs) pro titulek s hráčem v záznamu. */
  avatar?: Record<string, unknown>;
}

/** Sada dresů: `shirt` je hlavní barva dresu, `secondary` a `pattern` jeho vzor (editor dresu), trenýrky a štulpny. */
interface MatchKit {
  shirt: string;
  secondary: string;
  pattern: string;
  shorts: string;
  socks: string;
}

/** Trenér u lajny = manažer klubu. Podle `motivation` (1–100) záznam pozná, jak moc zápas prožívá. */
interface MatchCoach {
  name: string;
  motivation: number;
  skinColor?: string;
  hairColor?: string | null;
  /** Celý obličej (facesjs) pro představení trenéra před výkopem. */
  avatar?: Record<string, unknown>;
  /** Kolik ligových zápasů téhle sezóny tým před zápasem odehrál a vyhrál; null = ještě žádný. */
  record: { played: number; won: number } | null;
}

interface MatchLook {
  home_kit: MatchKit;
  away_kit: MatchKit;
  /** null = klub manažera nemá (velkoklub v poháru). */
  home_coach: MatchCoach | null;
  away_coach: MatchCoach | null;
  /** Trenéři jsou aspoň dobří známí: před výkopem se i obejmou. */
  coaches_on_good_terms: boolean;
}

interface TeamKitRow {
  id: string;
  primary_color: string | null;
  secondary_color: string | null;
  jersey_pattern: string | null;
  home_shorts_color: string | null;
  home_socks_color: string | null;
  away_primary_color: string | null;
  away_secondary_color: string | null;
  away_jersey_pattern: string | null;
  away_shorts_color: string | null;
  away_socks_color: string | null;
}

/** Klub v zápase: reálný tým (velkoklub v poháru ho nemá) a barva, když řádek v teams chybí. */
interface MatchSide {
  teamId: string | null;
  fallbackColor?: string | null;
}

type LineupLike = { starters: Array<{ id: string }>; subs: Array<{ id: string }> } | null;

const DEFAULT_HOME_COLOR = "#2D5F2D";
const DEFAULT_AWAY_COLOR = "#D94032";
const WHITE = "#FFFFFF";
const BLACK = "#111111";
/**
 * Dresy hostů se musí od domácích lišit: eukleidovská vzdálenost v RGB (0–255 na složku,
 * maximum ~441) nad 100. Tmavě zelená vs. tmavě modrá (~90) ještě splývá, zelená vs. modrá (~120) už ne.
 */
const MIN_KIT_DISTANCE = 100;

/** Obličej (facesjs v `players.avatar`) a z něj pleť a vlasy pro 3D postavu, výška z `players.physical`. */
export function playerLook(row: { avatar: string | null; physical: string | null }): PlayerLook {
  const look: PlayerLook = {};
  if (row.avatar) {
    const avatar = JSON.parse(row.avatar) as { body?: { color?: string }; hair?: { id?: string; color?: string } };
    look.avatar = avatar;
    if (avatar.body?.color) look.skinColor = avatar.body.color;
    if (avatar.hair?.id) look.hairColor = avatar.hair.id.includes("bald") ? null : (avatar.hair.color ?? null);
  }
  if (row.physical) {
    const physical = JSON.parse(row.physical) as { height?: number };
    if (typeof physical.height === "number") look.height = physical.height;
  }
  return look;
}

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Nečitelnou barvu bereme jako dost odlišnou, ať kvůli ní hosté nepřijdou o svůj dres. */
function colorDistance(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  if (!x || !y) return Infinity;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

function solidKit(color: string): MatchKit {
  return { shirt: color, secondary: color, pattern: "solid", shorts: color, socks: color };
}

/** Domácí sada: trenýrky a štulpny bez vlastní barvy jsou v barvě dresu (jako v editoru dresu). */
function homeKit(team: TeamKitRow | undefined, fallback: string): MatchKit {
  const shirt = team?.primary_color || fallback;
  return {
    shirt, secondary: team?.secondary_color || shirt, pattern: team?.jersey_pattern || "solid",
    shorts: team?.home_shorts_color || shirt, socks: team?.home_socks_color || shirt,
  };
}

/**
 * Hosté: uložená venkovní sada, domácí sada, sekundární barva, bílá, černá — první,
 * která se dost liší od dresu domácích. Bílá a černá jsou od sebe dál než dvojnásobek
 * MIN_KIT_DISTANCE, takže aspoň jedna z nich vyhoví vždy.
 */
function awayKit(team: TeamKitRow | undefined, fallback: string, homeShirt: string): MatchKit {
  const candidates: MatchKit[] = [];
  if (team?.away_primary_color) {
    const shirt = team.away_primary_color;
    candidates.push({
      shirt, secondary: team.away_secondary_color || shirt, pattern: team.away_jersey_pattern || "solid",
      shorts: team.away_shorts_color || shirt, socks: team.away_socks_color || shirt,
    });
  }
  candidates.push(homeKit(team, fallback));
  if (team?.secondary_color) candidates.push(solidKit(team.secondary_color));
  candidates.push(solidKit(WHITE), solidKit(BLACK));
  return candidates.find((kit) => colorDistance(kit.shirt, homeShirt) > MIN_KIT_DISTANCE)!;
}

/** Ligová bilance klubu v aktuální sezóně před výkopem `kickoff`; u zápasu z dřívější sezóny tedy žádná. */
async function leagueRecordBefore(db: D1Database, teamId: string, kickoff: string): Promise<MatchCoach["record"]> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS played,
            COALESCE(SUM((m.home_team_id = ?1 AND m.home_score > m.away_score) OR (m.away_team_id = ?1 AND m.away_score > m.home_score)), 0) AS won
       FROM matches m
       JOIN season_calendar sc ON sc.id = m.calendar_id
      WHERE m.status = 'simulated' AND (m.home_team_id = ?1 OR m.away_team_id = ?1)
        AND ${currentSeasonSql("sc")} AND sc.scheduled_at < ?2`,
  ).bind(teamId, kickoff).first<{ played: number; won: number }>();
  return row && row.played > 0 ? { played: row.played, won: row.won } : null;
}

/**
 * Dresy a trenéři obou klubů a vzhled hráčů pro 3D záznam. Vzhled (pleť, vlasy, výška) doplní
 * přímo do hráčů v sestavách; vzhled i trenér se berou aktuální, jako číslo dresu. `kickoff` je
 * čas zápasu (ISO), k němu se počítá ligová bilance trenérů; přátelák ho nemá.
 */
export async function loadMatchLook(
  db: D1Database,
  home: MatchSide,
  away: MatchSide,
  homeLineup: LineupLike,
  awayLineup: LineupLike,
  kickoff: string | null,
): Promise<MatchLook> {
  const teamIds = [home.teamId, away.teamId].filter((id): id is string => !!id);
  const players = [homeLineup, awayLineup].flatMap((ld) => (ld ? [...ld.starters, ...ld.subs] : []));
  const playerIds = [...new Set(players.map((p) => p.id).filter(Boolean))];
  const rowsIn = async <T>(select: string, ids: string[]): Promise<T[]> =>
    ids.length === 0 ? [] : (await db.prepare(`${select} IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<T>()).results;
  const recordOf = (teamId: string | null) => (teamId && kickoff ? leagueRecordBefore(db, teamId, kickoff) : null);
  // Čtení na sobě nezávisí, jdou najednou.
  const [teams, managers, looks, relation, homeRecord, awayRecord] = await Promise.all([
    rowsIn<TeamKitRow>(
      `SELECT id, primary_color, secondary_color, jersey_pattern, home_shorts_color, home_socks_color,
              away_primary_color, away_secondary_color, away_jersey_pattern, away_shorts_color, away_socks_color
         FROM teams WHERE id`, teamIds),
    rowsIn<{ team_id: string; name: string; avatar: string; motivation: number }>("SELECT team_id, name, avatar, motivation FROM managers WHERE team_id", teamIds),
    rowsIn<{ id: string; avatar: string | null; physical: string | null }>("SELECT id, avatar, physical FROM players WHERE id", playerIds),
    home.teamId && away.teamId
      ? db.prepare("SELECT respect, heat FROM manager_relations WHERE team_a_id = ? AND team_b_id = ?").bind(...orderPair(home.teamId, away.teamId)).first<{ respect: number; heat: number }>()
      : null,
    recordOf(home.teamId),
    recordOf(away.teamId),
  ]);

  const home_kit = homeKit(teams.find((t) => t.id === home.teamId), home.fallbackColor || DEFAULT_HOME_COLOR);
  const away_kit = awayKit(teams.find((t) => t.id === away.teamId), away.fallbackColor || DEFAULT_AWAY_COLOR, home_kit.shirt);

  const coachOf = (teamId: string | null, record: MatchCoach["record"]): MatchCoach | null => {
    const row = managers.find((m) => m.team_id === teamId);
    if (!row) return null;
    const { skinColor, hairColor, avatar } = playerLook({ avatar: row.avatar, physical: null });
    return { name: row.name, motivation: row.motivation, skinColor, hairColor, avatar, record };
  };

  const lookById = new Map(looks.map((r) => [r.id, r]));
  for (const p of players) {
    const row = lookById.get(p.id);
    if (row) Object.assign(p, playerLook(row));
  }
  // Aspoň „Dobří známí“ ze škály relationLabel: respekt od 10 a bez napětí. Bez řádku v manager_relations je vztah neutrální.
  return {
    home_kit, away_kit, home_coach: coachOf(home.teamId, homeRecord), away_coach: coachOf(away.teamId, awayRecord),
    coaches_on_good_terms: !!relation && relation.respect >= 10 && relation.heat < 20,
  };
}
