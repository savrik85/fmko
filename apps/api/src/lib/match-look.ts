/**
 * Vzhled hráčů a dresy pro 3D záznam zápasu (detail zápasu v routes/matches.ts).
 */

export interface PlayerLook {
  skinColor?: string;
  /** null = holá hlava. */
  hairColor?: string | null;
  /** Výška v cm. */
  height?: number;
}

interface MatchKit {
  shirt: string;
  shorts: string;
  socks: string;
}

/** Barvy dresů klubu z tabulky teams; nevyplněné jsou null. */
interface TeamKitColors {
  primary: string;
  homeShorts: string | null;
  homeSocks: string | null;
  awayShirt: string | null;
  awayShorts: string | null;
  awaySocks: string | null;
}

/** Pleť a vlasy z obličeje (facesjs v `players.avatar`), výška z `players.physical`. */
export function playerLook(row: { avatar: string | null; physical: string | null }): PlayerLook {
  const look: PlayerLook = {};
  if (row.avatar) {
    const avatar = JSON.parse(row.avatar) as { body?: { color?: string }; hair?: { id?: string; color?: string } };
    if (avatar.body?.color) look.skinColor = avatar.body.color;
    if (avatar.hair?.id) look.hairColor = avatar.hair.id.includes("bald") ? null : (avatar.hair.color ?? null);
  }
  if (row.physical) {
    const physical = JSON.parse(row.physical) as { height?: number };
    if (typeof physical.height === "number") look.height = physical.height;
  }
  return look;
}

/** Domácí sada: trenýrky a štulpny bez vlastní barvy jsou v barvě dresu (jako v editoru dresu). */
function homeKit(team: Pick<TeamKitColors, "primary" | "homeShorts" | "homeSocks">): MatchKit {
  return { shirt: team.primary, shorts: team.homeShorts || team.primary, socks: team.homeSocks || team.primary };
}

/**
 * Domácí hrají v domácí sadě. Hosté ve venkovní, když si ji klub v editoru uložil;
 * jinak taky v domácí, druhou sadu nemají.
 */
export function matchKits(
  home: Pick<TeamKitColors, "primary" | "homeShorts" | "homeSocks">,
  away: TeamKitColors,
): { home_kit: MatchKit; away_kit: MatchKit } {
  return {
    home_kit: homeKit(home),
    away_kit: away.awayShirt
      ? { shirt: away.awayShirt, shorts: away.awayShorts || away.awayShirt, socks: away.awaySocks || away.awayShirt }
      : homeKit(away),
  };
}
