/**
 * Recap konce sezóny — per-tým snapshot pro obrazovku, co manažerovi naskočí
 * po přihlášení po přelomu sezóny.
 *
 * Departures se zachytí během fáze departures (captureDepartures), zbytek
 * (umístění, odměna, ocenění, trofej, statistiky) sestaví buildTeamRecap
 * ve fázi recap z league_history (jeden archivní zdroj) + transactions.
 */

import { logger } from "../lib/logger";
import type { TeamDeparturesResult } from "./season-departures";

const M = "season-recap";

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/** Zachytí odchody týmu do recap snapshotu (volá fáze departures). */
export async function captureDepartures(
  db: D1Database,
  teamId: string,
  seasonNumber: number,
  result: TeamDeparturesResult,
): Promise<void> {
  const existing = await db.prepare("SELECT data FROM season_recap WHERE team_id = ? AND season_number = ?")
    .bind(teamId, seasonNumber).first<{ data: string }>()
    .catch((e) => { logger.warn({ module: M }, "load recap for departures", e); return null; });
  const data = parseJson<Record<string, unknown>>(existing?.data, {});
  data.departures = result.departures.map((d) => ({ name: d.name, age: d.age, position: d.position, kind: d.kind, reason: d.reason, wasCaptain: d.wasCaptain }));
  data.agedCount = result.agedCount;
  data.playerDev = { improved: result.dev.improved, declined: result.dev.declined };
  data.manager = result.dev.manager;
  await db.prepare(
    "INSERT INTO season_recap (team_id, season_number, data, seen) VALUES (?, ?, ?, 0) ON CONFLICT(team_id, season_number) DO UPDATE SET data = excluded.data",
  ).bind(teamId, seasonNumber, JSON.stringify(data)).run()
    .catch((e) => logger.warn({ module: M }, "upsert departures", e));
}

interface StandingRow { pos: number; teamId: string; teamName: string }
interface BestElevenEntry { playerId: string; name: string; position: string; teamName: string }

/** Sestaví kompletní recap pro lidský tým (volá fáze recap, PŘED rolloverem). */
export async function buildTeamRecap(
  db: D1Database,
  teamId: string,
  leagueId: string,
  seasonNumber: number,
): Promise<void> {
  const lh = await db.prepare("SELECT final_standings, awards, season_stats FROM league_history WHERE league_id = ? AND season_number = ?")
    .bind(leagueId, seasonNumber).first<{ final_standings: string; awards: string | null; season_stats: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "load league_history", e); return null; });
  if (!lh) { logger.warn({ module: M }, `no league_history for league=${leagueId} s=${seasonNumber}`); return; }

  const finalStandings = parseJson<StandingRow[]>(lh.final_standings, []);
  const awards = parseJson<Record<string, any>>(lh.awards, {});
  const seasonStats = parseJson<Record<string, unknown>>(lh.season_stats, {});

  const team = await db.prepare("SELECT name, primary_color, secondary_color, trophies FROM teams WHERE id = ?")
    .bind(teamId).first<{ name: string; primary_color: string; secondary_color: string; trophies: string }>()
    .catch((e) => { logger.warn({ module: M }, "load team", e); return null; });
  if (!team) return;

  const leagueName = (await db.prepare("SELECT name FROM leagues WHERE id = ?").bind(leagueId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: M }, "load league name", e); return null; }))?.name ?? "Liga";

  const myEntry = finalStandings.find((s) => s.teamId === teamId);
  const pos = myEntry?.pos ?? null;
  const totalTeams = finalStandings.length;

  const rewardRow = await db.prepare("SELECT amount FROM transactions WHERE reference_id = ? LIMIT 1")
    .bind(`season-${seasonNumber}-rwd-${teamId}`).first<{ amount: number }>()
    .catch((e) => { logger.warn({ module: M }, "load reward", e); return null; });
  const reward = rewardRow?.amount ?? 0;
  const repDelta = pos ? Math.round((totalTeams / 2 - pos + 0.5) * 1.5) : 0;

  const trophies = parseJson<Array<Record<string, unknown>>>(team.trophies, []);
  const trophy = trophies.find((t) => t.seasonNumber === seasonNumber && t.leagueId === leagueId) ?? null;

  const existing = await db.prepare("SELECT data FROM season_recap WHERE team_id = ? AND season_number = ?")
    .bind(teamId, seasonNumber).first<{ data: string }>()
    .catch((e) => { logger.warn({ module: M }, "load existing recap", e); return null; });
  const prev = parseJson<Record<string, unknown>>(existing?.data, {});

  const bestEleven = (awards.bestEleven as BestElevenEntry[]) ?? [];
  const bestElevenMine = bestEleven.filter((p) => p.teamName === team.name);
  const championIsMe = awards.champion?.teamId === teamId || finalStandings[0]?.teamId === teamId;

  const extras = await buildRecapExtras(db, teamId);

  const data = {
    seasonNumber,
    newSeasonNumber: seasonNumber + 1,
    leagueName,
    teamName: team.name,
    primaryColor: team.primary_color || "#2D5F2D",
    secondaryColor: team.secondary_color || "#FFFFFF",
    finalPos: pos,
    totalTeams,
    champion: { name: awards.champion?.name ?? finalStandings[0]?.teamName ?? "?", isMe: championIsMe },
    reward,
    repDelta,
    departures: prev.departures ?? [],
    agedCount: prev.agedCount ?? 0,
    playerDev: prev.playerDev ?? { improved: [], declined: [] },
    manager: prev.manager ?? null,
    awards: {
      playerOfSeason: awards.playerOfSeason ?? null,
      topScorer: awards.topScorer ?? null,
      managerOfSeason: awards.managerOfSeason ?? null,
      discovery: awards.discovery ?? null,
      bestEleven,
      bestElevenMine,
    },
    trophy,
    seasonStats,
    relationships: extras.relationships,
    village: extras.village,
    quote: extras.quote,
  };

  await db.prepare(
    "INSERT INTO season_recap (team_id, season_number, data, seen) VALUES (?, ?, ?, 0) ON CONFLICT(team_id, season_number) DO UPDATE SET data = excluded.data, seen = 0",
  ).bind(teamId, seasonNumber, JSON.stringify(data)).run()
    .catch((e) => logger.warn({ module: M }, "upsert recap", e));

  logger.info({ module: M }, `recap built team=${teamId} s=${seasonNumber} pos=${pos}`);
}

// ── Extra "lidský" obsah: vztahy trenérů, kabina, vesnice, výrok sezóny ──

function villageVerdict(favor: number): string {
  if (favor >= 72) return "Vesnice tě zbožňuje. Hospoda na tebe připíjí každý večer.";
  if (favor >= 56) return "Vesnice je spokojená — chodí fandit a nereptá.";
  if (favor >= 42) return "Vesnice mírně reptá. Pár piv u výčepu padlo i na tvůj účet.";
  return "Vesnice je zklamaná. U výčepu se hučí, že to chce změnu.";
}

async function teamAndManager(db: D1Database, teamId: string): Promise<{ name: string; mgr: string | null }> {
  const r = await db.prepare("SELECT t.name AS name, m.name AS mgr FROM teams t LEFT JOIN managers m ON m.team_id = t.id AND m.user_id = t.user_id WHERE t.id = ?")
    .bind(teamId).first<{ name: string; mgr: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "team+manager", e); return null; });
  return { name: r?.name ?? "?", mgr: r?.mgr ?? null };
}

async function computeClubFact(db: D1Database, teamId: string): Promise<string | null> {
  const pair = async (types: string[]) => db.prepare(
    `SELECT pa.first_name || ' ' || pa.last_name AS a, pb.first_name || ' ' || pb.last_name AS b
     FROM relationships r JOIN players pa ON pa.id = r.player_a_id JOIN players pb ON pb.id = r.player_b_id
     WHERE r.type IN (${types.map(() => "?").join(",")}) AND pa.team_id = ? AND pb.team_id = ? LIMIT 1`,
  ).bind(...types, teamId, teamId).first<{ a: string; b: string }>()
    .catch((e) => { logger.warn({ module: M }, "club fact pair", e); return null; });

  const rivals = await pair(["rivals"]);
  if (rivals) return `V kabině to jiskří — ${rivals.a} a ${rivals.b} se nemůžou ani cítit, a hrají za stejný dres.`;
  const fam = await pair(["brothers", "father_son"]);
  if (fam) return `Rodinná firma: ${fam.a} a ${fam.b} nastupují bok po boku.`;
  const drink = await db.prepare(
    `SELECT COUNT(*) AS c FROM relationships r JOIN players pa ON pa.id = r.player_a_id JOIN players pb ON pb.id = r.player_b_id
     WHERE r.type = 'drinking_buddies' AND pa.team_id = ? AND pb.team_id = ?`,
  ).bind(teamId, teamId).first<{ c: number }>()
    .catch((e) => { logger.warn({ module: M }, "club fact drink", e); return null; });
  if ((drink?.c ?? 0) > 0) return `Po zápase plno: v kádru ${drink!.c} ${drink!.c === 1 ? "dvojice nerozlučných parťáků" : drink!.c < 5 ? "dvojice nerozlučných parťáků" : "dvojic nerozlučných parťáků"} na pivo.`;
  return null;
}

async function buildRecapExtras(db: D1Database, teamId: string) {
  // 1) Vztahy trenérů (manager_relations) — rival (heat) + spojenec (respect)
  const rels = await db.prepare("SELECT team_a_id, team_b_id, respect, heat, history FROM manager_relations WHERE team_a_id = ? OR team_b_id = ?")
    .bind(teamId, teamId).all<{ team_a_id: string; team_b_id: string; respect: number; heat: number; history: string }>()
    .catch((e) => { logger.warn({ module: M }, "load relations", e); return { results: [] as any[] }; });

  let rivalRow: { other: string; heat: number; history: string } | null = null;
  let allyRow: { other: string; respect: number } | null = null;
  for (const r of rels.results) {
    const other = r.team_a_id === teamId ? r.team_b_id : r.team_a_id;
    if (r.heat > 0 && (!rivalRow || r.heat > rivalRow.heat)) rivalRow = { other, heat: r.heat, history: r.history };
    if (r.respect > 0 && (!allyRow || r.respect > allyRow.respect)) allyRow = { other, respect: r.respect };
  }

  let rival: { teamName: string; managerName: string | null; heat: number; moment: string | null; verdict: string } | null = null;
  if (rivalRow) {
    const n = await teamAndManager(db, rivalRow.other);
    let moment: string | null = null;
    try { const h = JSON.parse(rivalRow.history) as { text: string }[]; if (h.length) moment = h[h.length - 1].text; } catch { moment = null; }
    const verdict = rivalRow.heat >= 40 ? "Krev by tekla proudem." : rivalRow.heat >= 20 ? "Pořádná řežba." : "Lehké pošťuchování.";
    rival = { teamName: n.name, managerName: n.mgr, heat: rivalRow.heat, moment, verdict };
  }
  let ally: { teamName: string; managerName: string | null; respect: number } | null = null;
  if (allyRow) {
    const n = await teamAndManager(db, allyRow.other);
    ally = { teamName: n.name, managerName: n.mgr, respect: allyRow.respect };
  }

  // 2) Kabina (coach_relationship) — miláček + černá ovce (jen když je rozdíl výrazný)
  const squad = await db.prepare("SELECT first_name || ' ' || last_name AS name, position, coach_relationship AS cr FROM players WHERE team_id = ? AND status = 'active'")
    .bind(teamId).all<{ name: string; position: string; cr: number }>()
    .catch((e) => { logger.warn({ module: M }, "load squad rel", e); return { results: [] as any[] }; });
  let favorite: { name: string; position: string; value: number } | null = null;
  let blackSheep: { name: string; position: string; value: number } | null = null;
  if (squad.results.length > 0) {
    const sorted = [...squad.results].sort((a, b) => b.cr - a.cr);
    const top = sorted[0], bot = sorted[sorted.length - 1];
    if (top.cr >= 60) favorite = { name: top.name, position: top.position, value: top.cr };
    if (bot.cr <= 40) blackSheep = { name: bot.name, position: bot.position, value: bot.cr };
  }

  // 3) Klubová historka (relationships)
  const clubFact = await computeClubFact(db, teamId);

  // 4) Vesnice (village_team_favor)
  const v = await db.prepare("SELECT vt.favor AS favor, vv.name AS name FROM village_team_favor vt JOIN teams t ON t.id = vt.team_id JOIN villages vv ON vv.id = t.village_id WHERE vt.team_id = ? AND vt.official_id IS NULL LIMIT 1")
    .bind(teamId).first<{ favor: number; name: string }>()
    .catch((e) => { logger.warn({ module: M }, "load village favor", e); return null; });
  const village = v ? { name: v.name, favor: v.favor, verdict: villageVerdict(v.favor) } : null;

  // 5) Výrok sezóny (z odpovězeného trenérského rozhovoru)
  let quote: { question: string; text: string } | null = null;
  const qi = await db.prepare("SELECT questions, answers FROM coach_interviews WHERE team_id = ? AND status = 'answered' AND answers IS NOT NULL ORDER BY created_at DESC LIMIT 1")
    .bind(teamId).first<{ questions: string; answers: string }>()
    .catch((e) => { logger.warn({ module: M }, "load quote", e); return null; });
  if (qi) {
    try {
      const qs = JSON.parse(qi.questions) as string[];
      const as = JSON.parse(qi.answers) as string[];
      let bi = -1;
      for (let i = 0; i < as.length; i++) { if ((as[i] ?? "").trim().length > (bi >= 0 ? (as[bi] ?? "").length : 2)) bi = i; }
      if (bi >= 0 && (as[bi] ?? "").trim()) quote = { question: qs[bi] ?? "", text: as[bi].trim() };
    } catch (e) { logger.warn({ module: M }, "parse quote", e); }
  }

  return { relationships: { rival, ally, favorite, blackSheep, clubFact }, village, quote };
}
