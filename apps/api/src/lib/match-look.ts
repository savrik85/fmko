/**
 * Vzhled hráčů, dresy a trenéři pro 3D záznam zápasu (detail ligového, pohárového i turnajového zápasu).
 */

export interface PlayerLook {
  skinColor?: string;
  /** null = holá hlava. */
  hairColor?: string | null;
  /** Výška v cm. */
  height?: number;
  /** Celý obličej (facesjs) pro titulek s hráčem v záznamu. */
  avatar?: Record<string, unknown>;
}

export interface MatchKit {
  shirt: string;
  shorts: string;
  socks: string;
}

/** Trenér u lajny = manažer klubu. Podle `motivation` (1–100) záznam pozná, jak moc zápas prožívá. */
export interface MatchCoach {
  name: string;
  motivation: number;
  skinColor?: string;
  hairColor?: string | null;
}

export interface MatchLook {
  home_kit: MatchKit;
  away_kit: MatchKit;
  /** null = klub manažera nemá (velkoklub v poháru). */
  home_coach: MatchCoach | null;
  away_coach: MatchCoach | null;
}

interface TeamKitRow {
  id: string;
  primary_color: string | null;
  secondary_color: string | null;
  home_shorts_color: string | null;
  home_socks_color: string | null;
  away_primary_color: string | null;
  away_shorts_color: string | null;
  away_socks_color: string | null;
}

/** Klub v zápase: reálný tým (velkoklub v poháru ho nemá) a barva, když řádek v teams chybí. */
export interface MatchSide {
  teamId: string | null;
  fallbackColor?: string | null;
}

type LineupLike = { starters?: Array<{ id: string }>; subs?: Array<{ id: string }> } | null;

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
  return { shirt: color, shorts: color, socks: color };
}

/** Domácí sada: trenýrky a štulpny bez vlastní barvy jsou v barvě dresu (jako v editoru dresu). */
function homeKit(team: TeamKitRow | undefined, fallback: string): MatchKit {
  const shirt = team?.primary_color || fallback;
  return { shirt, shorts: team?.home_shorts_color || shirt, socks: team?.home_socks_color || shirt };
}

/**
 * Hosté: uložená venkovní sada, domácí sada, sekundární barva, bílá, černá — první,
 * která se dost liší od dresu domácích. Když žádná, hrají v poslední (černé).
 */
function awayKit(team: TeamKitRow | undefined, fallback: string, homeShirt: string): MatchKit {
  const candidates: MatchKit[] = [];
  if (team?.away_primary_color) {
    const shirt = team.away_primary_color;
    candidates.push({ shirt, shorts: team.away_shorts_color || shirt, socks: team.away_socks_color || shirt });
  }
  candidates.push(homeKit(team, fallback));
  if (team?.secondary_color) candidates.push(solidKit(team.secondary_color));
  candidates.push(solidKit(WHITE), solidKit(BLACK));
  return candidates.find((kit) => colorDistance(kit.shirt, homeShirt) > MIN_KIT_DISTANCE) ?? candidates[candidates.length - 1];
}

/**
 * Dresy a trenéři obou klubů a vzhled hráčů pro 3D záznam. Vzhled (pleť, vlasy, výška) doplní
 * přímo do hráčů v sestavách; vzhled i trenér se berou aktuální, jako číslo dresu.
 */
export async function loadMatchLook(
  db: D1Database,
  home: MatchSide,
  away: MatchSide,
  homeLineup: LineupLike,
  awayLineup: LineupLike,
): Promise<MatchLook> {
  const teamIds = [home.teamId, away.teamId].filter((id): id is string => !!id);
  const teams = teamIds.length === 0 ? [] : (await db.prepare(
    `SELECT id, primary_color, secondary_color, home_shorts_color, home_socks_color,
            away_primary_color, away_shorts_color, away_socks_color
       FROM teams WHERE id IN (${teamIds.map(() => "?").join(",")})`,
  ).bind(...teamIds).all<TeamKitRow>()).results;
  const homeTeam = teams.find((t) => t.id === home.teamId);
  const awayTeam = teams.find((t) => t.id === away.teamId);
  const home_kit = homeKit(homeTeam, home.fallbackColor || DEFAULT_HOME_COLOR);
  const away_kit = awayKit(awayTeam, away.fallbackColor || DEFAULT_AWAY_COLOR, home_kit.shirt);

  const managers = teamIds.length === 0 ? [] : (await db.prepare(
    `SELECT team_id, name, avatar, motivation FROM managers WHERE team_id IN (${teamIds.map(() => "?").join(",")})`,
  ).bind(...teamIds).all<{ team_id: string; name: string; avatar: string; motivation: number }>()).results;
  const coachOf = (teamId: string | null): MatchCoach | null => {
    const row = managers.find((m) => m.team_id === teamId);
    if (!row) return null;
    const { skinColor, hairColor } = playerLook({ avatar: row.avatar, physical: null });
    return { name: row.name, motivation: row.motivation, skinColor, hairColor };
  };

  const players = [homeLineup, awayLineup].flatMap((ld) => (ld ? [...(ld.starters ?? []), ...(ld.subs ?? [])] : []));
  const ids = [...new Set(players.map((p) => p.id).filter(Boolean))];
  if (ids.length > 0) {
    const rows = await db.prepare(`SELECT id, avatar, physical FROM players WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids).all<{ id: string; avatar: string | null; physical: string | null }>();
    const byId = new Map(rows.results.map((r) => [r.id, r]));
    for (const p of players) {
      const row = byId.get(p.id);
      if (row) Object.assign(p, playerLook(row));
    }
  }
  return { home_kit, away_kit, home_coach: coachOf(home.teamId), away_coach: coachOf(away.teamId) };
}
