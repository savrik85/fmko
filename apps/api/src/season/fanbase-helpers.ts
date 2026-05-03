// Helpers pro tier-based fanbase: haversine vzdálenost, výpočet expected attendance,
// home advantage modifier, post-match konverze (bus + promo) a tier promotion.

import { logger } from "../lib/logger";
import {
  FANBASE_CONFIG,
  BUS_CONFIG,
  PROMO_CONVERSION,
  type TeamFanbaseRow,
  type BusSize,
} from "./fanbase-config";

type DB = D1Database;

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function rngBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export async function loadOrInitFanbase(
  db: DB,
  teamId: string,
): Promise<TeamFanbaseRow> {
  const row = await db
    .prepare("SELECT * FROM team_fanbase WHERE team_id = ?")
    .bind(teamId)
    .first<TeamFanbaseRow>()
    .catch((e) => {
      logger.warn({ module: "fanbase-helpers" }, "load fanbase", e);
      return null;
    });
  if (row) return row;

  // Backfill pro tým, který chybí v migrace (nový team založený po migraci)
  const init = await db
    .prepare(
      `SELECT CAST(v.population * 0.005 AS INTEGER) AS hc,
              CAST(v.population * 0.020 AS INTEGER) AS reg,
              CAST(v.population * 0.030 AS INTEGER) AS cas
       FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?`,
    )
    .bind(teamId)
    .first<{ hc: number; reg: number; cas: number }>()
    .catch((e) => {
      logger.warn({ module: "fanbase-helpers" }, "init fanbase backfill", e);
      return null;
    });
  const hardcore = init?.hc ?? 0;
  const regular = init?.reg ?? 0;
  const casual = init?.cas ?? 0;
  await db
    .prepare(
      `INSERT INTO team_fanbase (team_id, hardcore_count, regular_count, casual_count)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(teamId, hardcore, regular, casual)
    .run()
    .catch((e) => {
      logger.warn({ module: "fanbase-helpers" }, "insert fanbase", e);
    });
  return {
    team_id: teamId,
    hardcore_count: hardcore,
    regular_count: regular,
    casual_count: casual,
    casual_to_regular_streak: 0,
    regular_to_hardcore_streak: 0,
    promo_consecutive_matches: 0,
    promo_unpromoted_streak: 0,
  };
}

export function expectedAttendance(fb: TeamFanbaseRow): {
  hardcore: number;
  regular: number;
  casual: number;
  walkUp: number;
  total: number;
} {
  const hardcoreAtt = Math.round(
    fb.hardcore_count *
      rngBetween(
        FANBASE_CONFIG.ATTENDANCE_RATE.hardcore.min,
        FANBASE_CONFIG.ATTENDANCE_RATE.hardcore.max,
      ),
  );
  const regularAtt = Math.round(
    fb.regular_count *
      rngBetween(
        FANBASE_CONFIG.ATTENDANCE_RATE.regular.min,
        FANBASE_CONFIG.ATTENDANCE_RATE.regular.max,
      ),
  );
  const casualAtt = Math.round(
    fb.casual_count *
      rngBetween(
        FANBASE_CONFIG.ATTENDANCE_RATE.casual.min,
        FANBASE_CONFIG.ATTENDANCE_RATE.casual.max,
      ),
  );
  const totalLoyal = fb.hardcore_count + fb.regular_count + fb.casual_count;
  const walkUp = Math.round(
    totalLoyal *
      rngBetween(
        FANBASE_CONFIG.WALK_UP_RATE.min,
        FANBASE_CONFIG.WALK_UP_RATE.max,
      ),
  );
  return {
    hardcore: hardcoreAtt,
    regular: regularAtt,
    casual: casualAtt,
    walkUp,
    total: hardcoreAtt + regularAtt + casualAtt + walkUp,
  };
}

export function homeAdvantageFromFanbase(
  fb: TeamFanbaseRow,
  finalAttendance: number,
  stadiumCapacity: number,
): { fromFans: number; atmosphere: number; total: number } {
  const fromFans =
    fb.hardcore_count * FANBASE_CONFIG.HOME_ADVANTAGE_PER_FAN.hardcore +
    fb.regular_count * FANBASE_CONFIG.HOME_ADVANTAGE_PER_FAN.regular +
    fb.casual_count * FANBASE_CONFIG.HOME_ADVANTAGE_PER_FAN.casual;
  const fillRatio = stadiumCapacity > 0 ? finalAttendance / stadiumCapacity : 0;
  let atmosphere = 0;
  if (fillRatio >= FANBASE_CONFIG.ATMOSPHERE.sellOutThreshold) {
    atmosphere = FANBASE_CONFIG.ATMOSPHERE.sellOutBonus;
  } else if (fillRatio <= FANBASE_CONFIG.ATMOSPHERE.emptyThreshold) {
    atmosphere = FANBASE_CONFIG.ATMOSPHERE.emptyDebuff;
  }
  return { fromFans, atmosphere, total: fromFans + atmosphere };
}

export interface BusAttendeesCalc {
  attendees: number;
  busSize: BusSize;
}

export function calcBusAttendees(busSize: BusSize): BusAttendeesCalc {
  const cfg = BUS_CONFIG.SIZES[busSize];
  const attendees = Math.round(
    rngBetween(cfg.attendeesMin, cfg.attendeesMax),
  );
  return { attendees, busSize };
}

// Po home zápase: pro každý bus_subsidy záznam aktualizuj satellite + globální fanbase
export async function applyBusConversion(
  db: DB,
  teamId: string,
  matchId: string,
): Promise<{ totalDropIn: number; totalConverted: number }> {
  const subsidies = await db
    .prepare(
      `SELECT id, source_village_id, bus_size FROM bus_subsidies
       WHERE team_id = ? AND match_id = ? AND attendees_brought IS NULL`,
    )
    .bind(teamId, matchId)
    .all<{ id: string; source_village_id: string; bus_size: BusSize }>()
    .catch((e) => {
      logger.warn(
        { module: "fanbase-helpers" },
        "load bus subsidies for match",
        e,
      );
      return { results: [] as Array<{ id: string; source_village_id: string; bus_size: BusSize }> };
    });

  let totalDropIn = 0;
  let totalConverted = 0;

  for (const s of subsidies.results) {
    const { attendees } = calcBusAttendees(s.bus_size);
    totalDropIn += attendees;

    await db
      .prepare("UPDATE bus_subsidies SET attendees_brought = ? WHERE id = ?")
      .bind(attendees, s.id)
      .run()
      .catch((e) => {
        logger.warn({ module: "fanbase-helpers" }, "update bus attendees", e);
      });

    // UPSERT bus_satellite_fans
    const existing = await db
      .prepare(
        "SELECT id, casual_count, consecutive_buses FROM bus_satellite_fans WHERE team_id = ? AND village_id = ?",
      )
      .bind(teamId, s.source_village_id)
      .first<{ id: string; casual_count: number; consecutive_buses: number }>()
      .catch((e) => {
        logger.warn(
          { module: "fanbase-helpers" },
          "load satellite fans",
          e,
        );
        return null;
      });

    let consecutive = 1;
    let newCasual = 0;
    let satelliteId: string;

    if (existing) {
      consecutive = existing.consecutive_buses + 1;
      satelliteId = existing.id;

      let conversionDelta = 0;
      if (consecutive === 3) {
        conversionDelta = Math.min(
          BUS_CONFIG.CONVERSION.THRESHOLD_3.capPerVillage,
          Math.round(attendees * BUS_CONFIG.CONVERSION.THRESHOLD_3.rate),
        );
      } else if (consecutive === 5) {
        const remainingCap =
          BUS_CONFIG.CONVERSION.THRESHOLD_5.capPerVillage -
          existing.casual_count;
        if (remainingCap > 0) {
          conversionDelta = Math.min(
            remainingCap,
            Math.round(attendees * BUS_CONFIG.CONVERSION.THRESHOLD_5.rate),
          );
        }
      }
      newCasual = existing.casual_count + conversionDelta;

      await db
        .prepare(
          `UPDATE bus_satellite_fans
           SET casual_count = ?, consecutive_buses = ?, last_bus_match_id = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(newCasual, consecutive, matchId, satelliteId)
        .run()
        .catch((e) => {
          logger.warn(
            { module: "fanbase-helpers" },
            "update satellite fans",
            e,
          );
        });

      if (conversionDelta > 0) {
        totalConverted += conversionDelta;
      }
    } else {
      satelliteId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO bus_satellite_fans (id, team_id, village_id, casual_count, consecutive_buses, last_bus_match_id)
           VALUES (?, ?, ?, 0, 1, ?)`,
        )
        .bind(satelliteId, teamId, s.source_village_id, matchId)
        .run()
        .catch((e) => {
          logger.warn(
            { module: "fanbase-helpers" },
            "insert satellite fans",
            e,
          );
        });
    }
  }

  // Přidej totalConverted do team_fanbase.casual_count
  if (totalConverted > 0) {
    await db
      .prepare(
        `UPDATE team_fanbase
         SET casual_count = casual_count + ?, updated_at = datetime('now')
         WHERE team_id = ?`,
      )
      .bind(totalConverted, teamId)
      .run()
      .catch((e) => {
        logger.warn(
          { module: "fanbase-helpers" },
          "update fanbase from bus",
          e,
        );
      });
  }

  return { totalDropIn, totalConverted };
}

// Po home zápase: aktualizuj promo streak + případnou konverzi.
export async function applyPromoConversion(
  db: DB,
  teamId: string,
  wasPromoted: boolean,
  rawAttendance: number,
): Promise<{ converted: number; lost: number }> {
  const fb = await loadOrInitFanbase(db, teamId);
  let converted = 0;
  let lost = 0;

  if (wasPromoted) {
    const newConsecutive = fb.promo_consecutive_matches + 1;
    let conversionDelta = 0;
    if (newConsecutive === 3) {
      conversionDelta = Math.min(
        PROMO_CONVERSION.THRESHOLD_3.cap,
        Math.round(
          rawAttendance *
            PROMO_CONVERSION.PROMO_ATTENDANCE_BOOST *
            PROMO_CONVERSION.THRESHOLD_3.rate,
        ),
      );
    } else if (newConsecutive === 6) {
      const cap = PROMO_CONVERSION.THRESHOLD_6.cap;
      conversionDelta = Math.min(
        cap,
        Math.round(
          rawAttendance *
            PROMO_CONVERSION.PROMO_ATTENDANCE_BOOST *
            PROMO_CONVERSION.THRESHOLD_6.rate,
        ),
      );
    }
    converted = conversionDelta;
    await db
      .prepare(
        `UPDATE team_fanbase
         SET promo_consecutive_matches = ?, promo_unpromoted_streak = 0,
             casual_count = casual_count + ?, updated_at = datetime('now')
         WHERE team_id = ?`,
      )
      .bind(newConsecutive, conversionDelta, teamId)
      .run()
      .catch((e) => {
        logger.warn(
          { module: "fanbase-helpers" },
          "update fanbase promo streak",
          e,
        );
      });
  } else {
    const newUnpromoted = fb.promo_unpromoted_streak + 1;
    if (
      newUnpromoted >= PROMO_CONVERSION.STREAK_BREAK_AFTER &&
      fb.promo_consecutive_matches >= 3
    ) {
      const decay = Math.floor(
        fb.casual_count * PROMO_CONVERSION.STREAK_BREAK_DECAY,
      );
      lost = decay;
      await db
        .prepare(
          `UPDATE team_fanbase
           SET promo_unpromoted_streak = ?, promo_consecutive_matches = 0,
               casual_count = MAX(0, casual_count - ?), updated_at = datetime('now')
           WHERE team_id = ?`,
        )
        .bind(newUnpromoted, decay, teamId)
        .run()
        .catch((e) => {
          logger.warn(
            { module: "fanbase-helpers" },
            "decay fanbase promo",
            e,
          );
        });
    } else {
      await db
        .prepare(
          `UPDATE team_fanbase
           SET promo_unpromoted_streak = ?, updated_at = datetime('now')
           WHERE team_id = ?`,
        )
        .bind(newUnpromoted, teamId)
        .run()
        .catch((e) => {
          logger.warn(
            { module: "fanbase-helpers" },
            "increment unpromoted streak",
            e,
          );
        });
    }
  }

  return { converted, lost };
}

// Po každém home zápase aplikuj tier promotion (loyalty progression).
export async function applyTierPromotion(
  db: DB,
  teamId: string,
): Promise<{ casualToRegular: number; regularToHardcore: number }> {
  const fb = await loadOrInitFanbase(db, teamId);
  const newCasualStreak = fb.casual_to_regular_streak + 1;
  const newRegularStreak = fb.regular_to_hardcore_streak + 1;
  let casualToRegular = 0;
  let regularToHardcore = 0;
  let casualResetStreak = newCasualStreak;
  let regularResetStreak = newRegularStreak;

  if (newCasualStreak >= FANBASE_CONFIG.PROMOTION.casualToRegular.matchesNeeded) {
    casualToRegular = Math.round(
      fb.casual_count * FANBASE_CONFIG.PROMOTION.casualToRegular.conversionRate,
    );
    casualResetStreak = 0;
  }
  if (
    newRegularStreak >= FANBASE_CONFIG.PROMOTION.regularToHardcore.matchesNeeded
  ) {
    regularToHardcore = Math.round(
      fb.regular_count *
        FANBASE_CONFIG.PROMOTION.regularToHardcore.conversionRate,
    );
    regularResetStreak = 0;
  }

  await db
    .prepare(
      `UPDATE team_fanbase
       SET casual_count = MAX(0, casual_count - ?),
           regular_count = MAX(0, regular_count + ? - ?),
           hardcore_count = hardcore_count + ?,
           casual_to_regular_streak = ?,
           regular_to_hardcore_streak = ?,
           updated_at = datetime('now')
       WHERE team_id = ?`,
    )
    .bind(
      casualToRegular,
      casualToRegular,
      regularToHardcore,
      regularToHardcore,
      casualResetStreak,
      regularResetStreak,
      teamId,
    )
    .run()
    .catch((e) => {
      logger.warn(
        { module: "fanbase-helpers" },
        "tier promotion update",
        e,
      );
    });

  return { casualToRegular, regularToHardcore };
}

// Loss streak penalty: pokud team má 5 home/away proher v řadě, decay casual+regular.
export async function applyLossStreakPenalty(
  db: DB,
  teamId: string,
): Promise<{ casualLost: number; regularLost: number; triggered: boolean }> {
  const last5 = await db
    .prepare(
      `SELECT
         CASE WHEN (home_team_id = ? AND home_score < away_score)
                OR (away_team_id = ? AND away_score < home_score)
              THEN 1 ELSE 0 END AS lost
       FROM matches
       WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'
       ORDER BY simulated_at DESC LIMIT 5`,
    )
    .bind(teamId, teamId, teamId, teamId)
    .all<{ lost: number }>()
    .catch((e) => {
      logger.warn({ module: "fanbase-helpers" }, "load last 5 matches", e);
      return { results: [] as Array<{ lost: number }> };
    });

  if (last5.results.length < FANBASE_CONFIG.LOSS_STREAK_PENALTY.matchesNeeded) {
    return { casualLost: 0, regularLost: 0, triggered: false };
  }
  const allLost = last5.results.every((r) => r.lost === 1);
  if (!allLost) {
    return { casualLost: 0, regularLost: 0, triggered: false };
  }

  const fb = await loadOrInitFanbase(db, teamId);
  const casualLost = Math.round(
    fb.casual_count * FANBASE_CONFIG.LOSS_STREAK_PENALTY.casualDecayRate,
  );
  const regularLost = Math.round(
    fb.regular_count * FANBASE_CONFIG.LOSS_STREAK_PENALTY.regularDecayRate,
  );
  if (casualLost === 0 && regularLost === 0) {
    return { casualLost: 0, regularLost: 0, triggered: false };
  }

  await db
    .prepare(
      `UPDATE team_fanbase
       SET casual_count = MAX(0, casual_count - ?),
           regular_count = MAX(0, regular_count - ?),
           updated_at = datetime('now')
       WHERE team_id = ?`,
    )
    .bind(casualLost, regularLost, teamId)
    .run()
    .catch((e) => {
      logger.warn(
        { module: "fanbase-helpers" },
        "loss streak penalty update",
        e,
      );
    });

  return { casualLost, regularLost, triggered: true };
}
