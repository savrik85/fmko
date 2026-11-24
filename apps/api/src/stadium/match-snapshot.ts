/**
 * Podoba stadionu při zápase. Ukládá se k zápasu (`stadium_snapshot`), aby ho video ukázalo tak, jak tehdy
 * vypadal: klub mezitím staví, mění povrch i barvy a objednaný úklid sněhu platí jen na jeden zápas.
 */
import type { ExtensionRow } from "./extensions-db";
import type { PitchService } from "./pitch-care";
import { calculateFacilityEffects, FACILITY_LABELS } from "./stadium-generator";
import { logger } from "../lib/logger";

type StadiumRow = Record<string, unknown>;

/** Vzhled areálu, který si klub nastavil: barvy, tabule, vlajka, plachta kotle, sítě a okolí hřiště. */
export function stadiumCustomization(stadium: StadiumRow) {
  return {
    fenceColor: (stadium.fence_color as string | null) ?? null,
    standColor: (stadium.stand_color as string | null) ?? null,
    seatColor: (stadium.seat_color as string | null) ?? null,
    roofColor: (stadium.roof_color as string | null) ?? null,
    accentColor: (stadium.accent_color as string | null) ?? null,
    scoreboardLevel: (stadium.scoreboard_level as number | null) ?? 0,
    flagSize: (stadium.flag_size as number | null) ?? 0,
    ultrasText: (stadium.ultras_text as string | null) ?? null,
    ultrasBannerColor: (stadium.ultras_banner_color as string | null) ?? null,
    ultrasTextColor: (stadium.ultras_text_color as string | null) ?? null,
    flagColor: (stadium.flag_color as string | null) ?? null,
    mowingPattern: (stadium.mowing_pattern as string | null) ?? "stripes",
    netPattern: (stadium.net_pattern as string | null) ?? "white",
    netStyle: (stadium.net_style as string | null) ?? "loose",
    surroundSurface: (stadium.surround_surface as string | null) ?? "grass",
  };
}

export interface StadiumSnapshot {
  /** Kapacita i s tribunami, jako na stránce Stadion. */
  capacity: number;
  pitchType: string;
  pitchMoisture: number;
  mowerLevel: number;
  /** Péče o trávník, která se na zápas opravdu zapnula (vyhřívání, úklid sněhu, zavlažování). */
  care: PitchService | null;
  facilities: Record<string, number>;
  extensions: ExtensionRow[];
  /** Názvy sponzorů s reklamou u hřiště. */
  sponsors: string[];
  customization: ReturnType<typeof stadiumCustomization>;
}

export function buildStadiumSnapshot(
  stadium: StadiumRow, mowerLevel: number, extensions: ExtensionRow[], sponsors: string[], care: PitchService | null,
): StadiumSnapshot {
  const facilities: Record<string, number> = {};
  // Přístavby drží součet kapacity ve `stand_ext_capacity`; mezi zařízeními s popiskem není.
  for (const key of [...Object.keys(FACILITY_LABELS), "stand_ext_capacity"]) {
    if (typeof stadium[key] === "number") facilities[key] = stadium[key];
  }
  return {
    capacity: ((stadium.capacity as number | null) ?? 200) + calculateFacilityEffects(facilities).capacityBonus,
    pitchType: (stadium.pitch_type as string | null) ?? "natural",
    pitchMoisture: (stadium.pitch_moisture as number | null) ?? 50,
    mowerLevel,
    care,
    facilities,
    extensions,
    sponsors,
    customization: stadiumCustomization(stadium),
  };
}

/**
 * Uloží podobu domácího stadionu k odehranému zápasu. Chybu jen loguje: kvůli obrazu ve videu se kolo nezdrží
 * a video pak ukáže stadion, jak vypadá dnes.
 */
export async function saveStadiumSnapshot(
  db: D1Database, table: "matches" | "cup_matches", matchId: string, homeTeamId: string, care: PitchService | null,
): Promise<void> {
  try {
    const [stadium, equipment, extensions, banners] = await db.batch([
      db.prepare("SELECT * FROM stadiums WHERE team_id = ?").bind(homeTeamId),
      db.prepare("SELECT mower FROM equipment WHERE team_id = ?").bind(homeTeamId),
      db.prepare("SELECT slot, kind, level FROM stadium_extensions WHERE team_id = ? ORDER BY slot").bind(homeTeamId),
      db.prepare("SELECT sponsor_name FROM sponsor_contracts WHERE team_id = ? AND status = 'active' AND category = 'banner'").bind(homeTeamId),
    ]);
    const row = stadium.results[0] as StadiumRow | undefined;
    if (!row) return;
    const mowerLevel = (equipment.results[0] as { mower: number | null } | undefined)?.mower ?? 0;
    const sponsors = (banners.results as { sponsor_name: string }[]).map((b) => b.sponsor_name);
    const snapshot = buildStadiumSnapshot(row, mowerLevel, extensions.results as ExtensionRow[], sponsors, care);
    await db.prepare(`UPDATE ${table} SET stadium_snapshot = ? WHERE id = ?`).bind(JSON.stringify(snapshot), matchId).run();
  } catch (e) {
    logger.warn({ module: "match-snapshot", matchId }, "uložení podoby stadionu k zápasu", e);
  }
}
