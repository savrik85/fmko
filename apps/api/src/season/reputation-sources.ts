import { logger } from "../lib/logger";
import { applyReputationDelta, reputationBaseline } from "../lib/reputation";

/**
 * Zdroje klubové reputace nad rámec konce sezóny a poháru.
 *
 * Proč vůbec: reputace se v praxi skoro nehýbala — 75 týmů ze 113 sedělo přesně
 * na výchozí 50. Měnil ji jen konec sezóny (±5), pohár a sezónní události.
 * Přitom odemyká vyšší úrovně stadionu (50, resp. 70) a vybavení (40, resp. 60),
 * takže hráč s penězi neměl jak dál stavět.
 *
 * Všechno je idempotentní přes `reference_id` v `reputation_log` a všechno je
 * obousměrné — dřív reputace prakticky jen rostla.
 */

/** Vyprodáno musí být zásluha, ne důsledek mikro-stadionu. */
const SELLOUT_RATIO = 0.95;
const SELLOUT_MIN_ATTENDANCE = 120;
const SELLOUT_MAX_PER_SEASON = 6;

/** Prázdné hlediště se počítá až u stadionu, kde je co zaplnit. */
const EMPTY_RATIO = 0.35;
const EMPTY_MIN_CAPACITY = 200;
const EMPTY_MIN_HOME_MATCHES = 5;

/** Milníky série výher — za každý jednou za sezónu. */
const WIN_STREAK_MILESTONES = [5, 10, 15];
const STREAK_MAX_PER_SEASON = 6;

/**
 * Po domácím zápase: vyprodáno (+1) nebo prázdné hlediště (−1).
 * Obojí sdílí `reference_id`, takže jeden zápas dá nejvýš jeden zápis.
 */
export async function applyAttendanceReputation(
  db: D1Database,
  teamId: string,
  matchId: string,
  attendance: number,
  capacity: number,
  seasonNumber: number,
  gameDate: string,
): Promise<void> {
  if (capacity <= 0) return;
  // Sezóna je součástí klíče, aby šel sezónní strop spočítat prefixem.
  const refId = `rep-att-s${seasonNumber}-${matchId}-${teamId}`;

  const fill = attendance / capacity;

  if (fill >= SELLOUT_RATIO && attendance >= SELLOUT_MIN_ATTENDANCE) {
    // Strop na sezónu — ať se z toho nestane renta za velký stadion.
    const already = await db.prepare(
      `SELECT COUNT(*) AS c FROM reputation_log
       WHERE team_id = ? AND source = 'sellout' AND reference_id LIKE ?`,
    ).bind(teamId, `rep-att-s${seasonNumber}-%`).first<{ c: number }>()
      .catch((e) => { logger.warn({ module: "reputation-sources" }, "count sellouts", e); return null; });
    if ((already?.c ?? 0) >= SELLOUT_MAX_PER_SEASON) return;

    await applyReputationDelta(db, teamId, 1, "sellout", `Vyprodáno — ${attendance} diváků`, {
      referenceId: refId, gameDate,
    });
    return;
  }

  if (fill <= EMPTY_RATIO && capacity >= EMPTY_MIN_CAPACITY) {
    const homeMatches = await db.prepare(
      "SELECT COUNT(*) AS c FROM matches WHERE home_team_id = ? AND status = 'simulated'",
    ).bind(teamId).first<{ c: number }>()
      .catch((e) => { logger.warn({ module: "reputation-sources" }, "count home matches", e); return null; });
    if ((homeMatches?.c ?? 0) < EMPTY_MIN_HOME_MATCHES) return;

    await applyReputationDelta(db, teamId, -1, "empty_stands", `Poloprázdné hlediště — ${attendance} diváků`, {
      referenceId: refId, gameDate,
    });
  }
}

/**
 * Po ligovém zápase: milníky série výher (+2) a série pěti proher (−2).
 * Série se počítá ze stejného zdroje jako forma pro návštěvnost.
 */
export async function applyStreakReputation(
  db: D1Database,
  teamId: string,
  seasonNumber: number,
  gameDate: string,
): Promise<void> {
  const recent = await db.prepare(
    `SELECT CASE
              WHEN (home_team_id = ? AND home_score > away_score) OR
                   (away_team_id = ? AND away_score > home_score) THEN 'W'
              WHEN home_score = away_score THEN 'D'
              ELSE 'L' END AS res
     FROM matches
     WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'
     ORDER BY simulated_at DESC LIMIT 15`,
  ).bind(teamId, teamId, teamId, teamId).all<{ res: string }>()
    .catch((e) => {
      logger.warn({ module: "reputation-sources" }, "load streak", e);
      return { results: [] as Array<{ res: string }> };
    });

  const rows = recent.results ?? [];
  if (rows.length === 0) return;

  let winStreak = 0;
  for (const r of rows) {
    if (r.res === "W") winStreak++;
    else break;
  }
  let lossStreak = 0;
  for (const r of rows) {
    if (r.res === "L") lossStreak++;
    else break;
  }

  if (winStreak >= WIN_STREAK_MILESTONES[0]) {
    const milestone = [...WIN_STREAK_MILESTONES].reverse().find((m) => winStreak >= m);
    if (milestone) {
      const already = await db.prepare(
        `SELECT COUNT(*) AS c FROM reputation_log
         WHERE team_id = ? AND source = 'streak_win' AND reference_id LIKE ?`,
      ).bind(teamId, `rep-streak-w%-${teamId}-s${seasonNumber}`).first<{ c: number }>()
        .catch((e) => { logger.warn({ module: "reputation-sources" }, "count win streaks", e); return null; });
      if ((already?.c ?? 0) * 2 < STREAK_MAX_PER_SEASON) {
        await applyReputationDelta(db, teamId, 2, "streak_win", `Série ${milestone} výher v řadě`, {
          referenceId: `rep-streak-w${milestone}-${teamId}-s${seasonNumber}`, gameDate,
        });
      }
    }
  }

  if (lossStreak >= 5) {
    await applyReputationDelta(db, teamId, -2, "streak_loss", "Série pěti proher v řadě", {
      referenceId: `rep-streak-l5-${teamId}-s${seasonNumber}`, gameDate,
    });
  }
}

/**
 * Měsíční (28 herních dní) posun podle toho, jak klub žije s obcí:
 * podíl rodáků v kádru a přízeň obce. Obojí obousměrně.
 */
export async function applyMonthlyCommunityReputation(
  db: D1Database,
  teamId: string,
  gameDate: string,
): Promise<void> {
  // Měsíční klíč z herního data — 28denní perioda by se špatně ladila s pondělky.
  const monthKey = gameDate.slice(0, 7);

  const localsRow = await db.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN p.residence = v.name THEN 1 ELSE 0 END) AS locals
       FROM players p
       JOIN teams t ON t.id = p.team_id
       JOIN villages v ON v.id = t.village_id
      WHERE p.team_id = ? AND (p.status IS NULL OR p.status != 'released')`,
  ).bind(teamId).first<{ total: number; locals: number }>()
    .catch((e) => { logger.warn({ module: "reputation-sources" }, "count locals", e); return null; });

  if (localsRow && localsRow.total >= 11) {
    const share = (localsRow.locals ?? 0) / localsRow.total;
    if (share >= 0.4) {
      await applyReputationDelta(db, teamId, 1, "locals",
        `Kádr stojí na místních (${localsRow.locals} z ${localsRow.total})`,
        { referenceId: `rep-locals-${teamId}-${monthKey}`, gameDate });
    } else if (share <= 0.1) {
      await applyReputationDelta(db, teamId, -1, "locals",
        `V kádru skoro žádní rodáci (${localsRow.locals} z ${localsRow.total})`,
        { referenceId: `rep-locals-${teamId}-${monthKey}`, gameDate });
    }
  }

  const favorRow = await db.prepare(
    "SELECT favor FROM village_team_favor WHERE team_id = ? AND official_id IS NULL",
  ).bind(teamId).first<{ favor: number }>()
    .catch((e) => { logger.warn({ module: "reputation-sources" }, "load favor", e); return null; });

  if (favorRow) {
    if (favorRow.favor >= 75) {
      await applyReputationDelta(db, teamId, 1, "village_favor",
        `Obec klub podporuje (přízeň ${favorRow.favor})`,
        { referenceId: `rep-favor-${teamId}-${monthKey}`, gameDate });
    } else if (favorRow.favor <= 25) {
      await applyReputationDelta(db, teamId, -1, "village_favor",
        `Obec se na klub mračí (přízeň ${favorRow.favor})`,
        { referenceId: `rep-favor-${teamId}-${monthKey}`, gameDate });
    }
  }
}

/**
 * Útlum: klub, který dlouho nic nedokázal, pomalu vyšumí z povědomí.
 *
 * Bez tohohle by reputace jen rostla — a to je taky důvod, proč dnes většina
 * týmů sedí přesně na výchozí 50 a nikdy se nepohne dolů.
 * Pod baseline (podle velikosti obce) útlum netlačí, aby netrestal začátečníky.
 */
export async function applyReputationDecay(
  db: D1Database,
  teamId: string,
  villageCategory: string,
  gameDate: string,
): Promise<void> {
  const teamRow = await db.prepare("SELECT reputation FROM teams WHERE id = ?")
    .bind(teamId).first<{ reputation: number }>()
    .catch((e) => { logger.warn({ module: "reputation-sources" }, "load reputation for decay", e); return null; });
  if (!teamRow) return;

  const baseline = reputationBaseline(villageCategory);
  if (teamRow.reputation <= baseline) return;

  // Přišlo za posledních 28 herních dní něco kladného?
  const since = new Date(gameDate);
  since.setUTCDate(since.getUTCDate() - 28);
  const recentGain = await db.prepare(
    `SELECT 1 FROM reputation_log
      WHERE team_id = ? AND delta > 0 AND game_date IS NOT NULL AND game_date >= ?
      LIMIT 1`,
  ).bind(teamId, since.toISOString()).first()
    .catch((e) => { logger.warn({ module: "reputation-sources" }, "check recent gains", e); return null; });
  if (recentGain) return;

  await applyReputationDelta(db, teamId, -1, "decay",
    "Měsíc bez úspěchu — o klubu se přestává mluvit",
    { referenceId: `rep-decay-${teamId}-${gameDate.slice(0, 10)}`, gameDate });
}
