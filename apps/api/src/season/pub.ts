/**
 * Hospoda U Pralesa — generator denních hospodských session.
 * Spouští se z daily-tick (idempotentní per team_id + game_date).
 *
 * Pravidla viz IDEAS.md #1. Fáze 1: attendees + 5% cross-team visit + 3 typy incidentů.
 */

import { logConditionStmt } from "../lib/condition-log";
import { logger } from "../lib/logger";

interface PubAttendee {
  playerId: string;
  firstName: string;
  lastName: string;
  alcohol: number;
  teamId: string;
  isVisitor: boolean;
  fromTeamName?: string;
}

interface PubIncident {
  type: string; // "drink_record" | "story" | "automat_win" | "cross_team_fight" | "cross_team_brotherhood" | "cross_team_provocation" | "lone_drinker"
  playerIds: string[];
  text: string;
}

interface DbPlayer {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  alcohol: number;
  patriotism: number;
  temper: number;
  condition: number;
  injured: boolean;
  suspended: boolean;
  recent_pub_days: number; // počet dní co byl v hospodě v posledních 3 dnech
}

interface DbTeam {
  id: string;
  name: string;
  user_id: string;
  league_id: string | null;
  last_match_result: "win" | "loss" | "draw" | null;
  next_match_in_days: number | null;
}

const DAY_WEEKDAY_MOD: Record<number, number> = {
  0: 0.8,  // Ne
  1: 0.6,  // Po
  2: 1.0,  // Út
  3: 1.0,  // St
  4: 1.0,  // Čt
  5: 1.5,  // Pá
  6: 1.5,  // So
};

function attendanceProb(p: DbPlayer, ctx: {
  dayOfWeek: number;
  lastMatchResult: "win" | "loss" | "draw" | null;
  daysToNextMatch: number | null;
  buddiesAlreadyIn: number;
  rivalsAlreadyIn: number;
}): number {
  if (p.injured || p.suspended) return 0;
  let prob = (p.alcohol / 100) * 0.4;

  prob *= DAY_WEEKDAY_MOD[ctx.dayOfWeek] ?? 1.0;
  if (ctx.buddiesAlreadyIn > 0) prob *= 1.5;
  if (ctx.rivalsAlreadyIn > 0) prob *= 0.7;
  if (ctx.lastMatchResult === "win") prob *= 1.4;
  if (ctx.lastMatchResult === "loss") prob *= 1.2;
  if (ctx.daysToNextMatch !== null && ctx.daysToNextMatch <= 1) prob *= 0.5;
  if (p.condition < 30) prob *= 0.3;
  if (p.recent_pub_days >= 2) prob *= 0.4; // cooldown — manželka

  return Math.min(0.85, prob);
}

const STORY_TEMPLATES = [
  "{name} vyprávěl o legendárním zápase, kdy v Bohdalci dali 7 gólů soupeři za poločas.",
  "{name} říkal, že strejda Mlejnek mu doporučil nového kopáče z Petrovic.",
  "{name} stěžoval na to, že žena už dva dny neuvařila vepřové.",
  "{name} sledoval s ostatními zápas v televizi.",
  "{name} si popovídal s hospodským o krávě, která se ztratila u sousedů.",
  "{name} dlouho přesvědčoval ostatní, že soudce v sobotu byl podplacený.",
];

const SOLO_TEMPLATES = [
  "{name} seděl sám u baru, ostatní chlapci dnes nikam nešli.",
  "Jen {name} u Pralesa — pivař musí vždycky být.",
  "{name} dorazil sám, hospodský mu nalil bez ptaní.",
];

const NOBODY_TEMPLATES = [
  "Včera v Pralesu nikdo nebyl, hospodský zavřel už v devět.",
  "Suchá noc — kluci asi sledovali ligu doma.",
  "Tichá středa, jen hospodský s kočkou.",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateIncidents(attendees: PubAttendee[], rivalsMap: Map<string, Set<string>>, buddiesMap: Map<string, Set<string>>): PubIncident[] {
  const incidents: PubIncident[] = [];

  if (attendees.length === 0) {
    return [{ type: "nobody", playerIds: [], text: pickRandom(NOBODY_TEMPLATES) }];
  }

  if (attendees.length === 1) {
    const p = attendees[0];
    return [{ type: "lone_drinker", playerIds: [p.playerId], text: pickRandom(SOLO_TEMPLATES).replace("{name}", `${p.firstName} ${p.lastName}`) }];
  }

  const visitors = attendees.filter((a) => a.isVisitor);
  const locals = attendees.filter((a) => !a.isVisitor);

  // ── Cross-team interactions (přednost) ──
  if (visitors.length > 0 && locals.length > 0) {
    for (const v of visitors) {
      // Najdi případného local rivala
      const localRival = locals.find((l) => rivalsMap.get(l.playerId)?.has(v.playerId) || rivalsMap.get(v.playerId)?.has(l.playerId));
      // Vyšší temper kombinace → bitka
      const partner = localRival ?? pickRandom(locals);

      // 30% bitka pokud je rival, 12% jinak
      const fightProb = localRival ? 0.30 : 0.12;
      // 20% bratření (přátelské)
      // jinak provokace nebo nic

      const roll = Math.random();
      if (roll < fightProb) {
        incidents.push({
          type: "cross_team_fight",
          playerIds: [partner.playerId, v.playerId],
          text: `${partner.firstName} ${partner.lastName} a ${v.firstName} ${v.lastName} (${v.fromTeamName}) se chytli nad pivem. Hospodský je rozdělil koštětem.`,
        });
      } else if (roll < fightProb + 0.20) {
        incidents.push({
          type: "cross_team_brotherhood",
          playerIds: [partner.playerId, v.playerId],
          text: `${partner.firstName} koupil ${v.firstName}ovi (${v.fromTeamName}) pivo a prokecali do dvou ráno. Žádné nepřátelství.`,
        });
      } else if (roll < fightProb + 0.20 + 0.25) {
        incidents.push({
          type: "cross_team_provocation",
          playerIds: [partner.playerId, v.playerId],
          text: `${v.firstName} (${v.fromTeamName}) provokoval domácí, že vesnice neumí kopnout. Naši se nadzvedli.`,
        });
      }
    }
  }

  // ── Local incidents ──
  // Drink record (top alcohol)
  const topDrinker = [...locals].sort((a, b) => b.alcohol - a.alcohol)[0];
  if (topDrinker && topDrinker.alcohol >= 60 && Math.random() < 0.4) {
    const beers = 5 + Math.floor(Math.random() * 5);
    incidents.push({
      type: "drink_record",
      playerIds: [topDrinker.playerId],
      text: `${topDrinker.firstName} ${topDrinker.lastName} vypil ${beers} piv — rekord večera.`,
    });
  }

  // Automat win (low chance)
  if (Math.random() < 0.15) {
    const lucky = pickRandom(locals);
    const win = [200, 300, 500, 700, 1000][Math.floor(Math.random() * 5)];
    incidents.push({
      type: "automat_win",
      playerIds: [lucky.playerId],
      text: `${lucky.firstName} ${lucky.lastName} vyhrál na automatu ${win} Kč.`,
    });
  }

  // Story (atmospheric)
  if (Math.random() < 0.5) {
    const teller = pickRandom(locals);
    incidents.push({
      type: "story",
      playerIds: [teller.playerId],
      text: pickRandom(STORY_TEMPLATES).replace("{name}", `${teller.firstName} ${teller.lastName}`),
    });
  }

  return incidents;
}

/**
 * Aplikuje effects of pub incidents (kondice, absence, condition_log).
 * Volá se v daily-ticku po vygenerování session.
 */
async function applyIncidentEffects(
  db: D1Database,
  sessionTeamId: string,
  incidents: PubIncident[],
  attendees: PubAttendee[],
): Promise<D1PreparedStatement[]> {
  const stmts: D1PreparedStatement[] = [];
  const attMap = new Map(attendees.map((a) => [a.playerId, a]));

  // Načti aktuální podmínky pro hráče co dostanou penalty
  const affectedIds = new Set<string>();
  for (const inc of incidents) {
    if (inc.type === "cross_team_fight" || inc.type === "drink_record") {
      for (const pid of inc.playerIds) affectedIds.add(pid);
    }
  }
  if (affectedIds.size === 0) return stmts;

  const placeholders = [...affectedIds].map(() => "?").join(",");
  const condRows = await db.prepare(
    `SELECT id, team_id, json_extract(life_context, '$.condition') as cond FROM players WHERE id IN (${placeholders})`,
  ).bind(...[...affectedIds]).all<{ id: string; team_id: string; cond: number }>().catch((e) => { logger.warn({ module: "pub" }, "load cond for incidents", e); return { results: [] }; });
  const condMap = new Map(condRows.results.map((r) => [r.id, { teamId: r.team_id, cond: r.cond ?? 100 }]));

  for (const inc of incidents) {
    if (inc.type === "cross_team_fight") {
      // Lehké zranění 1-3 dny NEBO -10 condition (50/50)
      for (const pid of inc.playerIds) {
        const cur = condMap.get(pid);
        if (!cur) continue;
        if (Math.random() < 0.5) {
          // Lehké zranění
          const days = 1 + Math.floor(Math.random() * 3);
          stmts.push(db.prepare(
            `INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total) VALUES (?, ?, ?, 'obecne', 'Zranění z hospodské bitky', 'lehke', ?, ?)`,
          ).bind(crypto.randomUUID(), pid, cur.teamId, days, days));
          stmts.push(logConditionStmt(db, pid, cur.teamId, cur.cond, Math.max(20, cur.cond - 8), "pub", `Bitka v hospodě (zranění ${days} d)`));
          stmts.push(db.prepare(
            `UPDATE players SET life_context = json_set(life_context, '$.condition', ?) WHERE id = ?`,
          ).bind(Math.max(20, cur.cond - 8), pid));
        } else {
          // Jen condition penalty
          const newCond = Math.max(20, cur.cond - 12);
          stmts.push(db.prepare(
            `UPDATE players SET life_context = json_set(life_context, '$.condition', ?) WHERE id = ?`,
          ).bind(newCond, pid));
          stmts.push(logConditionStmt(db, pid, cur.teamId, cur.cond, newCond, "pub", "Bitka v hospodě (modřiny)"));
        }
      }
    }

    if (inc.type === "drink_record") {
      // Mírná condition penalty (na ranní hangover už máme #2)
      for (const pid of inc.playerIds) {
        const cur = condMap.get(pid);
        if (!cur) continue;
        const newCond = Math.max(15, cur.cond - 5);
        stmts.push(db.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.condition', ?) WHERE id = ?`,
        ).bind(newCond, pid));
        stmts.push(logConditionStmt(db, pid, cur.teamId, cur.cond, newCond, "pub", "Vypil rekord — ráno bude težko"));
      }
    }
  }

  return stmts;
}

export async function generatePubSessionsForAllTeams(db: D1Database, gameDate: string): Promise<{ sessionsCreated: number }> {
  // Načti všechny lidské týmy + AI týmy (visitors můžou být i AI)
  const allTeams = await db.prepare(
    `SELECT id, name, user_id, league_id FROM teams`,
  ).all<{ id: string; name: string; user_id: string; league_id: string | null }>()
    .catch((e) => { logger.warn({ module: "pub" }, "load teams", e); return { results: [] }; });

  const humanTeams = allTeams.results.filter((t) => t.user_id !== "ai");
  if (humanTeams.length === 0) return { sessionsCreated: 0 };

  const dayOfWeek = new Date(gameDate).getDay();
  let created = 0;

  for (const team of humanTeams) {
    // Idempotence — skip pokud session pro (team, game_date) už existuje
    const existing = await db.prepare(
      `SELECT id FROM pub_sessions WHERE team_id = ? AND game_date = ?`,
    ).bind(team.id, gameDate).first().catch((e) => { logger.warn({ module: "pub" }, "check pub_session existence", e); return null; });
    if (existing) continue;

    // Načti hráče týmu s alcohol/temper/condition + injury/suspension/recent pub days
    const players = await db.prepare(
      `SELECT
         p.id, p.team_id, p.first_name, p.last_name,
         json_extract(p.personality, '$.alcohol') as alcohol,
         json_extract(p.personality, '$.patriotism') as patriotism,
         json_extract(p.personality, '$.temper') as temper,
         json_extract(p.life_context, '$.condition') as condition,
         CASE WHEN EXISTS(SELECT 1 FROM injuries WHERE player_id = p.id AND days_remaining > 0) THEN 1 ELSE 0 END as injured,
         CASE WHEN p.suspended_matches > 0 THEN 1 ELSE 0 END as suspended,
         (SELECT COUNT(*) FROM pub_sessions ps WHERE ps.team_id = p.team_id AND ps.game_date >= date(?, '-3 days')
            AND ps.attendees LIKE '%' || p.id || '%') as recent_pub_days
       FROM players p
       WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')`,
    ).bind(gameDate, team.id).all<DbPlayer>().catch((e) => { logger.warn({ module: "pub" }, "load players for pub", e); return { results: [] }; });

    if (players.results.length === 0) continue;

    // Last match result
    const lastMatch = await db.prepare(
      `SELECT home_team_id, away_team_id, home_score, away_score FROM matches
       WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'
       ORDER BY simulated_at DESC LIMIT 1`,
    ).bind(team.id, team.id).first<{ home_team_id: string; away_team_id: string; home_score: number; away_score: number }>().catch((e) => { logger.warn({ module: "pub" }, "load last match", e); return null; });
    let lastMatchResult: "win" | "loss" | "draw" | null = null;
    if (lastMatch) {
      const isHome = lastMatch.home_team_id === team.id;
      const ours = isHome ? lastMatch.home_score : lastMatch.away_score;
      const theirs = isHome ? lastMatch.away_score : lastMatch.home_score;
      lastMatchResult = ours > theirs ? "win" : ours < theirs ? "loss" : "draw";
    }

    // Next match — daysTo
    const nextMatch = await db.prepare(
      `SELECT scheduled_at FROM season_calendar sc JOIN matches m ON m.calendar_id = sc.id
       WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND sc.status = 'scheduled'
       ORDER BY sc.scheduled_at ASC LIMIT 1`,
    ).bind(team.id, team.id).first<{ scheduled_at: string }>().catch((e) => { logger.warn({ module: "pub" }, "load next match", e); return null; });
    const daysToNextMatch = nextMatch ? Math.max(0, Math.ceil((new Date(nextMatch.scheduled_at).getTime() - new Date(gameDate).getTime()) / 86400000)) : null;

    // Načti relationships pro buddies/rivals
    const playerIds = players.results.map((p) => p.id);
    const placeholders = playerIds.map(() => "?").join(",");
    const rels = await db.prepare(
      `SELECT player_a_id, player_b_id, type FROM relationships
       WHERE (player_a_id IN (${placeholders}) OR player_b_id IN (${placeholders}))
         AND type IN ('drinking_buddies', 'rivals')`,
    ).bind(...playerIds, ...playerIds).all<{ player_a_id: string; player_b_id: string; type: string }>().catch((e) => { logger.warn({ module: "pub" }, "load relationships for pub", e); return { results: [] }; });

    const buddiesMap = new Map<string, Set<string>>();
    const rivalsMap = new Map<string, Set<string>>();
    for (const r of rels.results) {
      const map = r.type === "drinking_buddies" ? buddiesMap : rivalsMap;
      if (!map.has(r.player_a_id)) map.set(r.player_a_id, new Set());
      if (!map.has(r.player_b_id)) map.set(r.player_b_id, new Set());
      map.get(r.player_a_id)!.add(r.player_b_id);
      map.get(r.player_b_id)!.add(r.player_a_id);
    }

    // Iterativně rozhodni účast (buddies bonus se aplikuje za běhu)
    const attendees: PubAttendee[] = [];
    const ctx = { dayOfWeek, lastMatchResult, daysToNextMatch };
    // Sort by alcohol DESC — top pijani jdou první → buddies bonus mají nižší
    const sorted = [...players.results].sort((a, b) => b.alcohol - a.alcohol);
    for (const p of sorted) {
      const buddiesIn = (buddiesMap.get(p.id) ?? new Set()).size > 0
        ? attendees.filter((a) => buddiesMap.get(p.id)!.has(a.playerId)).length : 0;
      const rivalsIn = (rivalsMap.get(p.id) ?? new Set()).size > 0
        ? attendees.filter((a) => rivalsMap.get(p.id)!.has(a.playerId)).length : 0;
      const prob = attendanceProb(p, { ...ctx, buddiesAlreadyIn: buddiesIn, rivalsAlreadyIn: rivalsIn });
      if (Math.random() < prob) {
        attendees.push({
          playerId: p.id, firstName: p.first_name, lastName: p.last_name,
          alcohol: p.alcohol, teamId: team.id, isVisitor: false,
        });
      }
    }

    // Cross-team visitors — 5 % per local attendee, vyber random z téže ligy
    if (attendees.length > 0 && team.league_id) {
      const otherTeams = allTeams.results.filter((t) => t.league_id === team.league_id && t.id !== team.id);
      for (let i = 0; i < attendees.length; i++) {
        if (Math.random() >= 0.05) continue;
        if (otherTeams.length === 0) break;
        const otherTeam = pickRandom(otherTeams);
        // Vyber 1 random hráče z otherTeam s alcohol >= 30 a low patriotism
        const visitor = await db.prepare(
          `SELECT id, first_name, last_name,
             json_extract(personality, '$.alcohol') as alcohol,
             json_extract(personality, '$.patriotism') as patriotism
           FROM players
           WHERE team_id = ? AND (status IS NULL OR status = 'active')
             AND json_extract(personality, '$.alcohol') >= 30
             AND json_extract(personality, '$.patriotism') <= 70
             AND NOT EXISTS(SELECT 1 FROM injuries WHERE player_id = players.id AND days_remaining > 0)
           ORDER BY RANDOM() LIMIT 1`,
        ).bind(otherTeam.id).first<{ id: string; first_name: string; last_name: string; alcohol: number }>().catch((e) => { logger.warn({ module: "pub" }, "load visitor candidate", e); return null; });
        if (visitor) {
          attendees.push({
            playerId: visitor.id, firstName: visitor.first_name, lastName: visitor.last_name,
            alcohol: visitor.alcohol, teamId: otherTeam.id, isVisitor: true, fromTeamName: otherTeam.name,
          });
        }
      }
    }

    // Generate incidents
    const incidents = generateIncidents(attendees, rivalsMap, buddiesMap);

    // Persist session
    await db.prepare(
      `INSERT INTO pub_sessions (team_id, game_date, attendees, incidents) VALUES (?, ?, ?, ?)`,
    ).bind(team.id, gameDate, JSON.stringify(attendees), JSON.stringify(incidents)).run().catch((e) => logger.warn({ module: "pub" }, "insert pub_session", e));

    // Apply effects
    const effectStmts = await applyIncidentEffects(db, team.id, incidents, attendees);
    if (effectStmts.length > 0) await db.batch(effectStmts).catch((e) => logger.warn({ module: "pub" }, "batch incident effects", e));

    created++;
  }

  return { sessionsCreated: created };
}
