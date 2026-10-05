/**
 * Síň slávy klubu pro veřejný klubový web: minulé sezóny, trofeje, ocenění,
 * pohárová tažení, nejlepší střelci všech dob a achievementy.
 *
 * Čte jen to, co hra archivuje (nic nedopočítává ani nevymýšlí):
 * - `league_history`   konečné tabulky + snímek ocenění se jmény (fáze archive konce sezóny)
 * - `season_recap`     název ligy, jak se jmenovala v té sezóně (jen lidské týmy)
 * - `teams.trophies`   medailová umístění v lize
 * - `cup_teams` / `cup_competitions` / `cup_matches`  kam klub v poháru došel
 * - `match_player_stats` + `departed_players`  střelci, i ti, co už ze hry odešli
 *   (`player_stats` se při odchodu hráče maže, proto se nepoužívá)
 * - `team_achievements` + katalog `ACHIEVEMENTS`
 *
 * `season_awards` se nečte: drží jen ID a hráče z nich nejde přiřadit klubu,
 * `league_history.awards` je jeho snímek i se jmény a týmem hráče.
 */

import type {
  ClubWebsiteHistory,
  ClubWebsiteHistoryAchievement,
  ClubWebsiteHistoryAward,
  ClubWebsiteHistoryCupRun,
  ClubWebsiteHistoryScorer,
  ClubWebsiteHistorySeason,
  ClubWebsiteHistoryTrophy,
} from "@okresni-masina/shared";
import { logger } from "../lib/logger";
import { roundName } from "../cup/cup";
import { ACHIEVEMENTS, getTeamAchievements } from "../services/achievements";

const MODULE = { module: "club-website" };

/** Kolik nejlepších střelců všech dob web ukáže. */
const TOP_SCORERS_LIMIT = 10;
/** D1 povolí nejvýš 100 parametrů na dotaz. */
const ID_CHUNK = 90;

// ── SQL ──────────────────────────────────────────────────────────────────────

/**
 * Sezóny, ve kterých klub hrál. `league_history` je malá tabulka (řádek = liga × sezóna)
 * bez indexu na tým, `instr` vyřadí cizí ligy a `json_each` vrátí jen řádek klubu z tabulky.
 */
const LEAGUE_HISTORY_SQL = `
  SELECT lh.league_id, lh.season_number, l.name AS league_name,
         json_array_length(lh.final_standings) AS teams,
         (SELECT je.value FROM json_each(lh.final_standings) je
           WHERE json_extract(je.value, '$.teamId') = ?1 LIMIT 1) AS entry,
         lh.awards
  FROM league_history lh
  LEFT JOIN leagues l ON l.id = lh.league_id
  WHERE lh.season_number IS NOT NULL AND instr(lh.final_standings, ?1) > 0
  ORDER BY lh.season_number DESC`;

/** Recap konce sezóny (PK team_id + season_number), jen pár polí z JSONu. */
const RECAP_SQL = `
  SELECT season_number,
         json_extract(data, '$.leagueName') AS league_name,
         json_extract(data, '$.finalPos') AS final_pos,
         json_extract(data, '$.totalTeams') AS total_teams
  FROM season_recap
  WHERE team_id = ?1`;

/** Účast v poháru po ročnících. Stejná logika jako `cupRoundReached` u slibů sponzorům. */
const CUP_SQL = `
  SELECT cc.id AS cup_id, cc.season_number, cc.name, cc.status, cc.total_rounds, cc.current_round,
         ct.id AS cup_team_id, ct.eliminated_round,
         CASE WHEN cc.winner_team_id IS NOT NULL AND cc.winner_team_id = ct.id THEN 1 ELSE 0 END AS is_winner,
         (SELECT MAX(season_number) FROM cup_competitions) AS latest_season
  FROM cup_teams ct
  JOIN cup_competitions cc ON cc.id = ct.cup_id
  WHERE ct.team_id = ?1
  ORDER BY cc.season_number DESC`;

/** Rozhodující pohárový zápas klubu v daném kole (index cup_id + round). */
const CUP_MATCH_SQL = `
  SELECT cm.home_cup_team_id, cm.home_score, cm.away_score, cm.home_pens, cm.away_pens,
         hct.name AS home_name, hct.team_id AS home_team_id,
         act.name AS away_name, act.team_id AS away_team_id
  FROM cup_matches cm
  LEFT JOIN cup_teams hct ON hct.id = cm.home_cup_team_id
  LEFT JOIN cup_teams act ON act.id = cm.away_cup_team_id
  WHERE cm.cup_id = ?1 AND cm.round = ?2 AND cm.status = 'simulated'
    AND (cm.home_cup_team_id = ?3 OR cm.away_cup_team_id = ?3)
  LIMIT 1`;

/**
 * Střelci všech dob z `match_player_stats` (index na team_id, liga i pohár, záznamy zůstávají
 * i po odchodu hráče). Jméno odešlého hráče je v `departed_players`, stejně jako u ocenění sezóny.
 * Vnitřní LIMIT má rezervu na hráče, jejichž jméno se nedochovalo.
 */
const TOP_SCORERS_SQL = `
  SELECT agg.player_id, agg.goals, agg.apps,
         COALESCE(p.first_name, dp.first_name) AS first_name,
         COALESCE(p.last_name, dp.last_name) AS last_name,
         p.id IS NOT NULL AS in_game,
         p.team_id AS current_team_id
  FROM (
    SELECT player_id, SUM(goals) AS goals, SUM(minutes_played > 0) AS apps
    FROM match_player_stats
    WHERE team_id = ?1
    GROUP BY player_id
    HAVING SUM(goals) > 0
    ORDER BY goals DESC, apps ASC
    LIMIT ${TOP_SCORERS_LIMIT * 2}
  ) agg
  LEFT JOIN players p ON p.id = agg.player_id
  LEFT JOIN departed_players dp ON dp.id = agg.player_id
  WHERE COALESCE(p.first_name, dp.first_name) IS NOT NULL
  ORDER BY agg.goals DESC, agg.apps ASC
  LIMIT ${TOP_SCORERS_LIMIT}`;

// ── Řádky z DB ───────────────────────────────────────────────────────────────

interface LeagueHistoryRow {
  league_id: string;
  season_number: number;
  league_name: string | null;
  teams: number | null;
  entry: string | null;
  awards: string | null;
}

interface StandingEntry {
  pos: number;
  teamId: string;
  teamName?: string;
  points?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  gf?: number;
  ga?: number;
  played?: number;
}

/** Snímek ocenění z `season-archive.ts` (starší sezóny nemají `teamName` u hráčů). */
interface AwardsSnapshot {
  playerOfSeason?: { id?: string | null; name?: string | null; teamName?: string | null; reason?: string | null } | null;
  topScorer?: { id?: string | null; name?: string | null; teamName?: string | null; goals?: number | null } | null;
  managerOfSeason?: { teamId?: string | null; name?: string | null; teamName?: string | null; reason?: string | null } | null;
  discovery?: { id?: string | null; name?: string | null; teamName?: string | null; reason?: string | null } | null;
  bestEleven?: Array<{ playerId?: string | null; name?: string | null; position?: string | null; teamName?: string | null }> | null;
}

interface RecapRow {
  season_number: number;
  league_name: string | null;
  final_pos: number | null;
  total_teams: number | null;
}

interface StoredTrophy {
  seasonNumber?: number;
  leagueId?: string;
  leagueName?: string;
  place?: number;
}

interface CupRow {
  cup_id: string;
  season_number: number;
  name: string;
  status: string;
  total_rounds: number;
  current_round: number;
  cup_team_id: string;
  eliminated_round: number | null;
  is_winner: number;
  latest_season: number | null;
}

interface CupMatchRow {
  home_cup_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  home_pens: number | null;
  away_pens: number | null;
  home_name: string | null;
  home_team_id: string | null;
  away_name: string | null;
  away_team_id: string | null;
}

interface ScorerRow {
  player_id: string;
  goals: number;
  apps: number;
  first_name: string;
  last_name: string;
  in_game: number;
  current_team_id: string | null;
}

// ── Pomocníci ────────────────────────────────────────────────────────────────

function parseJson<T>(text: string | null | undefined, fallback: T, what: string): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    logger.warn(MODULE, `history: parse ${what}`, e);
    return fallback;
  }
}

/** Texty od AI (zdůvodnění poroty) bez dlouhé pomlčky, ta na webu nemá co dělat. */
function cleanText(text: string | null | undefined): string | null {
  const t = (text ?? "").replace(/\s*—\s*/g, " - ").trim();
  return t || null;
}

function goalsLabel(n: number): string {
  if (n === 1) return "1 gól";
  if (n >= 2 && n <= 4) return `${n} góly`;
  return `${n} gólů`;
}

const POSITION_LABELS: Record<string, string> = {
  GK: "Brankář",
  DEF: "Obránce",
  MID: "Záložník",
  FWD: "Útočník",
};

const TROPHY_KIND: Record<number, ClubWebsiteHistoryTrophy["kind"]> = {
  1: "league_champion",
  2: "league_runner_up",
  3: "league_third",
};

const TROPHY_ORDER: Record<ClubWebsiteHistoryTrophy["kind"], number> = {
  league_champion: 0,
  cup_winner: 1,
  league_runner_up: 2,
  league_third: 3,
};

const TIER_ORDER: Record<ClubWebsiteHistoryAchievement["tier"], number> = { gold: 0, silver: 1, bronze: 2 };

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Která z daných ID hráčů ještě existují (jen na ně jde odkaz). */
async function existingPlayerIds(db: D1Database, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
  const results = await Promise.all(chunks.map((chunk) =>
    db.prepare(`SELECT id FROM players WHERE id IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk).all<{ id: string }>()
      .catch((e) => {
        logger.warn(MODULE, "history: check award players", e);
        return { results: [] as { id: string }[] };
      }),
  ));
  for (const r of results) for (const row of r.results ?? []) found.add(row.id);
  return found;
}

// ── Hlavní funkce ────────────────────────────────────────────────────────────

export async function loadClubHistory(db: D1Database, teamId: string): Promise<ClubWebsiteHistory> {
  const [leagueRows, recapRows, trophyRow, cupRows, scorerRows, earned] = await Promise.all([
    db.prepare(LEAGUE_HISTORY_SQL).bind(teamId).all<LeagueHistoryRow>()
      .catch((e) => {
        logger.warn(MODULE, "history: fetch league history", e);
        return { results: [] as LeagueHistoryRow[] };
      }),
    db.prepare(RECAP_SQL).bind(teamId).all<RecapRow>()
      .catch((e) => {
        logger.warn(MODULE, "history: fetch season recaps", e);
        return { results: [] as RecapRow[] };
      }),
    db.prepare("SELECT trophies FROM teams WHERE id = ?1").bind(teamId).first<{ trophies: string | null }>()
      .catch((e) => {
        logger.warn(MODULE, "history: fetch trophies", e);
        return null;
      }),
    db.prepare(CUP_SQL).bind(teamId).all<CupRow>()
      .catch((e) => {
        logger.warn(MODULE, "history: fetch cup runs", e);
        return { results: [] as CupRow[] };
      }),
    db.prepare(TOP_SCORERS_SQL).bind(teamId).all<ScorerRow>()
      .catch((e) => {
        logger.warn(MODULE, "history: fetch top scorers", e);
        return { results: [] as ScorerRow[] };
      }),
    getTeamAchievements(db, teamId)
      .catch((e) => {
        logger.warn(MODULE, "history: fetch achievements", e);
        return [] as Awaited<ReturnType<typeof getTeamAchievements>>;
      }),
  ]);

  // ── Názvy lig, jak se jmenovaly v té sezóně ──
  const recapBySeason = new Map<number, RecapRow>();
  for (const r of recapRows.results ?? []) recapBySeason.set(r.season_number, r);

  const storedTrophies = parseJson<StoredTrophy[]>(trophyRow?.trophies, [], "trophies")
    .filter((t) => typeof t?.seasonNumber === "number" && typeof t?.place === "number");
  const trophyLeagueName = new Map<string, string>();
  for (const t of storedTrophies) {
    if (t.leagueId && t.leagueName) trophyLeagueName.set(`${t.seasonNumber}|${t.leagueId}`, t.leagueName);
  }

  // ── Sezóny + ocenění z archivu ──
  const seasons: ClubWebsiteHistorySeason[] = [];
  const archivedPos = new Map<string, number>();
  const pendingAwards: ClubWebsiteHistoryAward[] = [];
  const seenSeasons = new Set<number>();

  for (const row of leagueRows.results ?? []) {
    const entry = parseJson<StandingEntry | null>(row.entry, null, "standing entry");
    if (!entry || entry.teamId !== teamId || typeof entry.pos !== "number") continue;
    archivedPos.set(`${row.season_number}|${row.league_id}`, entry.pos);
    if (seenSeasons.has(row.season_number)) continue;
    seenSeasons.add(row.season_number);

    const leagueName = recapBySeason.get(row.season_number)?.league_name
      || trophyLeagueName.get(`${row.season_number}|${row.league_id}`)
      || row.league_name
      || "Liga";

    seasons.push({
      seasonNumber: row.season_number,
      leagueName,
      position: entry.pos,
      teams: num(row.teams),
      points: num(entry.points),
      played: num(entry.played),
      wins: num(entry.wins),
      draws: num(entry.draws),
      losses: num(entry.losses),
      goalsFor: num(entry.gf),
      goalsAgainst: num(entry.ga),
    });

    // Hráče k ocenění přiřadí jméno klubu v té sezóně (stejně jako recap konce sezóny)
    const clubName = entry.teamName ?? null;
    const aw = parseJson<AwardsSnapshot | null>(row.awards, null, "awards snapshot");
    if (!aw) continue;
    const base = { seasonNumber: row.season_number, leagueName };
    const ours = (teamName: string | null | undefined) => !!clubName && teamName === clubName;

    const pos = aw.playerOfSeason;
    if (pos?.name && ours(pos.teamName)) {
      pendingAwards.push({ ...base, kind: "player_of_season", playerId: pos.id ?? null, name: pos.name, detail: cleanText(pos.reason) });
    }
    const ts = aw.topScorer;
    if (ts?.name && ours(ts.teamName)) {
      const goals = num(ts.goals);
      pendingAwards.push({ ...base, kind: "top_scorer", playerId: ts.id ?? null, name: ts.name, detail: goals !== null ? goalsLabel(goals) : null });
    }
    const mos = aw.managerOfSeason;
    if (mos?.teamId === teamId) {
      // U klubu bez lidského manažera archiv místo jména trenéra uloží název klubu
      const mgrName = mos.name && mos.name !== mos.teamName && mos.name !== clubName ? mos.name : null;
      pendingAwards.push({ ...base, kind: "manager_of_season", playerId: null, name: mgrName, detail: cleanText(mos.reason) });
    }
    const disc = aw.discovery;
    if (disc?.name && ours(disc.teamName)) {
      pendingAwards.push({ ...base, kind: "discovery", playerId: disc.id ?? null, name: disc.name, detail: cleanText(disc.reason) });
    }
    for (const p of aw.bestEleven ?? []) {
      if (!p?.name || !ours(p.teamName)) continue;
      pendingAwards.push({
        ...base,
        kind: "best_eleven",
        playerId: p.playerId ?? null,
        name: p.name,
        detail: POSITION_LABELS[(p.position ?? "").toUpperCase()] ?? null,
      });
    }
  }

  // Sezóny, kde archiv tabulky chybí, ale recap lidského týmu umístění zná
  for (const r of recapBySeason.values()) {
    const pos = num(r.final_pos);
    if (pos === null || seenSeasons.has(r.season_number)) continue;
    seenSeasons.add(r.season_number);
    seasons.push({
      seasonNumber: r.season_number,
      leagueName: r.league_name || "Liga",
      position: pos,
      teams: num(r.total_teams),
      points: null, played: null, wins: null, draws: null, losses: null, goalsFor: null, goalsAgainst: null,
    });
  }
  seasons.sort((a, b) => b.seasonNumber - a.seasonNumber);

  // ── Pohár ──
  type CupCandidate = { row: CupRow; run: Omit<ClubWebsiteHistoryCupRun, "decidingMatch"> };
  const cupCandidates: CupCandidate[] = [];
  for (const row of cupRows.results ?? []) {
    let status: ClubWebsiteHistoryCupRun["status"];
    let reachedRound: number;
    if (row.is_winner === 1) {
      status = "won";
      reachedRound = row.total_rounds;
    } else if (row.eliminated_round !== null) {
      status = "eliminated";
      reachedRound = row.eliminated_round;
    } else if (row.status === "active" && row.season_number === row.latest_season) {
      status = "running";
      reachedRound = row.current_round;
    } else {
      // Starý ročník, který se nedohrál, nebo nekonzistentní záznam: kam klub došel, nevíme
      continue;
    }
    cupCandidates.push({
      row,
      run: {
        seasonNumber: row.season_number,
        cupName: row.name,
        status,
        reachedRound,
        reachedRoundName: roundName(reachedRound, row.total_rounds),
        totalRounds: row.total_rounds,
      },
    });
  }

  // ── Druhá vlna: odkazy na oceněné hráče + rozhodující pohárové zápasy ──
  const awardPlayerIds = [...new Set(pendingAwards.map((a) => a.playerId).filter((id): id is string => !!id))];
  const [livePlayers, decidingMatches] = await Promise.all([
    awardPlayerIds.length > 0 ? existingPlayerIds(db, awardPlayerIds) : Promise.resolve(new Set<string>()),
    Promise.all(cupCandidates.map(({ row, run }) =>
      run.status === "running"
        ? Promise.resolve(null)
        : db.prepare(CUP_MATCH_SQL).bind(row.cup_id, run.reachedRound, row.cup_team_id).first<CupMatchRow>()
          .catch((e) => {
            logger.warn(MODULE, "history: fetch deciding cup match", e);
            return null;
          }),
    )),
  ]);

  const awards: ClubWebsiteHistoryAward[] = pendingAwards.map((a) => ({
    ...a,
    playerId: a.playerId && livePlayers.has(a.playerId) ? a.playerId : null,
  }));

  const cup: ClubWebsiteHistoryCupRun[] = cupCandidates.map(({ row, run }, i) => {
    const m = decidingMatches[i];
    if (!m || m.home_score === null || m.away_score === null) return { ...run, decidingMatch: null };
    const isHome = m.home_cup_team_id === row.cup_team_id;
    const goalsFor = isHome ? m.home_score : m.away_score;
    const goalsAgainst = isHome ? m.away_score : m.home_score;
    const level = goalsFor === goalsAgainst;
    return {
      ...run,
      decidingMatch: {
        opponentName: (isHome ? m.away_name : m.home_name) ?? "Soupeř",
        opponentTeamId: (isHome ? m.away_team_id : m.home_team_id) ?? null,
        isHome,
        goalsFor,
        goalsAgainst,
        pensFor: level ? num(isHome ? m.home_pens : m.away_pens) : null,
        pensAgainst: level ? num(isHome ? m.away_pens : m.home_pens) : null,
      },
    };
  });

  // ── Trofeje: medaile z ligy (jedna za ligu a sezónu) + vítězství v poháru ──
  const trophyGroups = new Map<string, StoredTrophy[]>();
  for (const t of storedTrophies) {
    const key = `${t.seasonNumber}|${t.leagueId ?? ""}`;
    const list = trophyGroups.get(key) ?? [];
    list.push(t);
    trophyGroups.set(key, list);
  }
  const trophies: ClubWebsiteHistoryTrophy[] = [];
  for (const [key, list] of trophyGroups) {
    // Opakovaný archiv mohl k jedné sezóně zapsat dvě umístění; platí to z archivní tabulky
    const archived = archivedPos.get(key);
    const pick = archived !== undefined
      ? list.find((t) => t.place === archived)
      : [...list].sort((a, b) => (a.place ?? 99) - (b.place ?? 99))[0];
    const kind = pick?.place !== undefined ? TROPHY_KIND[pick.place] : undefined;
    if (!pick || !kind) continue;
    trophies.push({ seasonNumber: pick.seasonNumber as number, kind, competitionName: pick.leagueName || "Liga" });
  }
  for (const run of cup) {
    if (run.status === "won") trophies.push({ seasonNumber: run.seasonNumber, kind: "cup_winner", competitionName: run.cupName });
  }
  trophies.sort((a, b) => b.seasonNumber - a.seasonNumber || TROPHY_ORDER[a.kind] - TROPHY_ORDER[b.kind]);

  // ── Střelci všech dob ──
  const topScorers: ClubWebsiteHistoryScorer[] = (scorerRows.results ?? []).map((r) => ({
    playerId: r.in_game ? r.player_id : null,
    name: `${r.first_name} ${r.last_name}`.trim(),
    goals: Number(r.goals ?? 0),
    appearances: Number(r.apps ?? 0),
    stillAtClub: r.current_team_id === teamId,
  }));

  // ── Achievementy ──
  const achievements: ClubWebsiteHistoryAchievement[] = earned
    .filter((a) => a.def !== null)
    .map((a) => ({
      key: a.key,
      icon: a.def!.icon,
      title: a.def!.title,
      desc: a.def!.desc,
      tier: a.def!.tier,
      earnedAt: a.earnedAt,
    }))
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.earnedAt.localeCompare(a.earnedAt));

  return {
    seasons,
    trophies,
    awards,
    cup,
    topScorers,
    achievements,
    achievementsTotal: ACHIEVEMENTS.length,
  };
}
