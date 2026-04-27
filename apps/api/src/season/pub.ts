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

interface PubEffect {
  playerId: string;
  type: "condition" | "injury" | "morale" | "hangover";
  delta?: number; // pro condition/morale
  injuryDays?: number; // pro injury
  label: string; // pro UI: "−12 kondice", "Lehké zranění (2 d)", "+3 morálka", "Ranní kocovina"
}

interface PubIncident {
  type: string; // "drink_record" | "story" | "automat_win" | "cross_team_fight" | "cross_team_brotherhood" | "cross_team_provocation" | "lone_drinker"
  playerIds: string[];
  text: string;
  effects: PubEffect[];
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
  if (ctx.lastMatchResult === "win") prob *= 1.8;  // velká oslava
  if (ctx.lastMatchResult === "loss") prob *= 1.4; // smutný flám
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
  "Jen {name} v hospodě — pivař musí vždycky být.",
  "{name} dorazil sám, hospodský mu nalil bez ptaní.",
];

const NOBODY_TEMPLATES = [
  "Včera v hospodě nikdo nebyl, hospodský zavřel už v devět.",
  "Suchá noc — kluci asi sledovali ligu doma.",
  "Tichá středa, jen hospodský s kočkou.",
];

// Cena piva je v hospodě stálá — nedává smysl ji každý den měnit. Specials se proto
// točí kolem jídla / atmosféry, ne kolem ceny.
const DAILY_SPECIALS = [
  "Specialita dne: Vepřo-knedlo-zelo",
  "Specialita dne: Smažený sýr s tatarkou",
  "Specialita dne: Klobásy na pivu",
  "Dnes: Utopenci · Polévka 25 Kč",
  "Specialita dne: Svíčková (jak od babičky)",
  "Kuchyň zavřená — hospodský dělá sám: jen utopenci a klobásy.",
  "Hospodský pustil polku z gramofonu — nikdo neprotestoval.",
  "Nová pohovka v rohu — zatím se na ni nikdo neodvažuje.",
  "Akce: páté pivo zdarma · Specialita: Žebra na Plzni",
  "Dnes čepujeme Krušovice — z dovozu od strejdy.",
  "Pan starosta sliboval, že platí pivo všem — slib nesplnil.",
  "Hospodský má nový televizor — Sport 1 v HD.",
  "Vichřice strhla cedulku, zatím vchází zadem.",
  "Specialita dne: Guláš s knedlíkem",
  "Dnes: Polévka zdarma ke každému druhému pivu",
];

const CAT_INCIDENT_TEMPLATES = [
  "Hospodská kočka se otřela o {name}ovu nohu — Marcela mu doma vyčte chlupy.",
  "{name} dal kočce kus klobásy. Kočka rozhodla u koho si dnes lehne.",
  "Kočka se ztratila — půl vesnice ji hledá. Našla se nakonec v sudu.",
  "Kotě skočilo {name}ovi do klína a usnulo. Půl hodiny se nehnul.",
  "Kočka rozbila skleničku panáka. Hospodský prdí jak žába.",
];

const PRIEST_INCIDENT_TEMPLATES = [
  "Pan farář Antonín zaskočil na malé. Pokáral {name}a za fauly v sobotu.",
  "Pan farář se zastavil, dal si jeden a varoval kluky před hříchem alkoholu (sám si dal druhý).",
  "Pan farář s nadšením vyprávěl o derby z roku 78. Tehdy ještě hrál sám.",
];

const SCOUT_INCIDENT_TEMPLATES = [
  "Cizinec u baru pozoroval celý večer {name}a. Hospodský říká, že byl od pana skauta z Olomouce.",
  "Někdo v koutě si dělal poznámky pokaždé, když {name} otevřel pusu. Skaut z vyšší ligy?",
  "K {name}ovi přisedl muž v dobrém kabátě. Po půl hodině zase zmizel — vizitku nechal pod žbánkem.",
];

const WIFE_CALL_INCIDENT_TEMPLATES = [
  "Manželka volala {name}ovi. ‚Domů. Hned.‘ Sebral si bundu a šel.",
  "{name}ova žena vtrhla do hospody a odvedla ho domů za ucho. Hospodský se smál ještě hodinu.",
  "{name}ovi přišla SMS od manželky. Z výrazu bylo jasné, co tam stálo. Šel.",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateIncidents(attendees: PubAttendee[], rivalsMap: Map<string, Set<string>>, _buddiesMap: Map<string, Set<string>>): PubIncident[] {
  const incidents: PubIncident[] = [];

  if (attendees.length === 0) {
    return [{ type: "nobody", playerIds: [], text: pickRandom(NOBODY_TEMPLATES), effects: [] }];
  }

  if (attendees.length === 1) {
    const p = attendees[0];
    return [{ type: "lone_drinker", playerIds: [p.playerId], text: pickRandom(SOLO_TEMPLATES).replace("{name}", `${p.firstName} ${p.lastName}`), effects: [] }];
  }

  const visitors = attendees.filter((a) => a.isVisitor);
  const locals = attendees.filter((a) => !a.isVisitor);

  // ── Cross-team interactions (přednost) ──
  if (visitors.length > 0 && locals.length > 0) {
    for (const v of visitors) {
      const localRival = locals.find((l) => rivalsMap.get(l.playerId)?.has(v.playerId) || rivalsMap.get(v.playerId)?.has(l.playerId));
      const partner = localRival ?? pickRandom(locals);
      const fightProb = localRival ? 0.30 : 0.12;
      const roll = Math.random();

      if (roll < fightProb) {
        // Pro každého fightera: 50/50 zranění 1-3 dny | -12 condition
        const fightEffects: PubEffect[] = [];
        for (const fighter of [partner, v]) {
          if (Math.random() < 0.5) {
            const days = 1 + Math.floor(Math.random() * 3);
            fightEffects.push({ playerId: fighter.playerId, type: "injury", injuryDays: days, label: `Lehké zranění (${days} ${days === 1 ? "den" : days < 5 ? "dny" : "dní"})` });
          } else {
            fightEffects.push({ playerId: fighter.playerId, type: "condition", delta: -12, label: "−12 kondice (modřiny)" });
          }
        }
        incidents.push({
          type: "cross_team_fight",
          playerIds: [partner.playerId, v.playerId],
          text: `${partner.firstName} ${partner.lastName} a ${v.firstName} ${v.lastName} (${v.fromTeamName}) se chytli nad pivem. Hospodský je rozdělil koštětem.`,
          effects: fightEffects,
        });
      } else if (roll < fightProb + 0.20) {
        incidents.push({
          type: "cross_team_brotherhood",
          playerIds: [partner.playerId, v.playerId],
          text: `${partner.firstName} koupil ${v.firstName}ovi (${v.fromTeamName}) pivo a prokecali do dvou ráno. Žádné nepřátelství.`,
          effects: [
            { playerId: partner.playerId, type: "morale", delta: 2, label: "+2 morálka" },
          ],
        });
      } else if (roll < fightProb + 0.20 + 0.25) {
        incidents.push({
          type: "cross_team_provocation",
          playerIds: [partner.playerId, v.playerId],
          text: `${v.firstName} (${v.fromTeamName}) provokoval domácí, že vesnice neumí kopnout. Naši se nadzvedli.`,
          effects: [
            { playerId: partner.playerId, type: "morale", delta: 3, label: "+3 morálka (motivace)" },
          ],
        });
      }
    }
  }

  // ── Local incidents ──
  // Ranní kocovina — per attendee s alcohol≥50, prob 10–30% dle alcohol škály.
  // Sjednocuje "drink record" mechaniku: kdo pije moc → ráno bude těžko.
  const hangoverVictims: PubAttendee[] = [];
  for (const a of locals) {
    if (a.alcohol < 50) continue;
    const prob = 0.10 + ((a.alcohol - 50) / 50) * 0.20; // alcohol 50→10%, 75→20%, 100→30%
    if (Math.random() < prob) hangoverVictims.push(a);
  }

  // Top opilec dostane "vypil rekord" flavour text (zachová lore)
  const topDrinker = hangoverVictims.sort((a, b) => b.alcohol - a.alcohol)[0];
  if (topDrinker) {
    const beers = 14 + Math.floor(Math.random() * 14); // 14-27 piv (vesnicky pivar)
    incidents.push({
      type: "drink_record",
      playerIds: [topDrinker.playerId],
      text: `${topDrinker.firstName} ${topDrinker.lastName} vypil ${beers} piv — rekord večera.`,
      effects: [{ playerId: topDrinker.playerId, type: "hangover", label: "Ranní kocovina (−15 kondice)" }],
    });
  }

  // Ostatní opilci — souhrnný incident (méně textu)
  const others = hangoverVictims.slice(1);
  if (others.length > 0) {
    const names = others.map((o) => o.lastName).join(", ");
    incidents.push({
      type: "drink_record",
      playerIds: others.map((o) => o.playerId),
      text: `Pivař za pivařem — ${names} ${others.length === 1 ? "také pořádně přebral" : "taky pořádně přebrali"}.`,
      effects: others.map((o) => ({ playerId: o.playerId, type: "hangover" as const, label: "Ranní kocovina (−15 kondice)" })),
    });
  }

  if (Math.random() < 0.15) {
    const lucky = pickRandom(locals);
    const win = [200, 300, 500, 700, 1000][Math.floor(Math.random() * 5)];
    incidents.push({
      type: "automat_win",
      playerIds: [lucky.playerId],
      text: `${lucky.firstName} ${lucky.lastName} vyhrál na automatu ${win} Kč.`,
      effects: [{ playerId: lucky.playerId, type: "morale", delta: 2, label: "+2 morálka" }],
    });
  }

  if (Math.random() < 0.5) {
    const teller = pickRandom(locals);
    incidents.push({
      type: "story",
      playerIds: [teller.playerId],
      text: pickRandom(STORY_TEMPLATES).replace("{name}", `${teller.firstName} ${teller.lastName}`),
      effects: [],
    });
  }

  // ── Hospodská kočka — 5% prob ──
  if (Math.random() < 0.05) {
    const target = pickRandom(locals);
    incidents.push({
      type: "cat",
      playerIds: [target.playerId],
      text: pickRandom(CAT_INCIDENT_TEMPLATES).replace("{name}", target.firstName),
      effects: [],
    });
  }

  // ── Pan farář Antonín — 5% prob, +1 morale všem attendees ──
  if (Math.random() < 0.05) {
    const target = pickRandom(locals);
    incidents.push({
      type: "priest",
      playerIds: [target.playerId],
      text: pickRandom(PRIEST_INCIDENT_TEMPLATES).replace("{name}", target.firstName),
      effects: locals.map((a) => ({ playerId: a.playerId, type: "morale" as const, delta: 1, label: "+1 morálka" })),
    });
  }

  // ── Skaut z vyšší ligy — 3% prob, jen pokud je v hospodě hráč s vysokou kvalitou ──
  // (atributy nejsou přímo v PubAttendee — jako proxy bere alcohol≥60 = "kluci o kterých se ví")
  // Bez direct effect pro teď, jen warning text. Departure trigger lze navázat později.
  const scoutTarget = locals.find((a) => a.alcohol >= 60);
  if (scoutTarget && Math.random() < 0.03) {
    incidents.push({
      type: "scout",
      playerIds: [scoutTarget.playerId],
      text: pickRandom(SCOUT_INCIDENT_TEMPLATES).replace("{name}", scoutTarget.firstName),
      effects: [],
    });
  }

  // ── Manželka volá — 8% prob na hráče s alcohol≥50 (proxy pro "ten, koho doma řeší") ──
  const wifeTargets = locals.filter((a) => a.alcohol >= 50);
  if (wifeTargets.length > 0 && Math.random() < 0.08) {
    const target = pickRandom(wifeTargets);
    incidents.push({
      type: "wife_call",
      playerIds: [target.playerId],
      text: pickRandom(WIFE_CALL_INCIDENT_TEMPLATES).replace("{name}", target.firstName),
      effects: [{ playerId: target.playerId, type: "morale", delta: -2, label: "−2 morálka" }],
    });
  }

  return incidents;
}

/**
 * Aplikuje effects pub incidentů (kondice, morale, zranění, condition_log).
 * Single source of truth: incident.effects[]. Generator je vyrobil, applier jen aplikuje.
 */
async function applyIncidentEffects(
  db: D1Database,
  incidents: PubIncident[],
): Promise<D1PreparedStatement[]> {
  const stmts: D1PreparedStatement[] = [];

  // Sběr unique player IDs napříč všemi effects pro 1 read condition+team
  const affectedIds = new Set<string>();
  for (const inc of incidents) for (const ef of inc.effects) affectedIds.add(ef.playerId);
  if (affectedIds.size === 0) return stmts;

  const placeholders = [...affectedIds].map(() => "?").join(",");
  const rows = await db.prepare(
    `SELECT id, team_id,
       json_extract(life_context, '$.condition') as cond,
       json_extract(life_context, '$.morale') as morale
     FROM players WHERE id IN (${placeholders})`,
  ).bind(...[...affectedIds]).all<{ id: string; team_id: string; cond: number; morale: number }>()
    .catch((e) => { logger.warn({ module: "pub" }, "load player state for incidents", e); return { results: [] }; });
  const stateMap = new Map(rows.results.map((r) => [r.id, { teamId: r.team_id, cond: r.cond ?? 100, morale: r.morale ?? 50 }]));

  for (const inc of incidents) {
    for (const ef of inc.effects) {
      const cur = stateMap.get(ef.playerId);
      if (!cur) continue;

      if (ef.type === "condition" && ef.delta != null) {
        const newCond = Math.max(15, Math.min(100, cur.cond + ef.delta));
        if (newCond === cur.cond) continue;
        stmts.push(db.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.condition', ?) WHERE id = ?`,
        ).bind(newCond, ef.playerId));
        stmts.push(logConditionStmt(db, ef.playerId, cur.teamId, cur.cond, newCond, "pub", inc.text.slice(0, 100)));
        cur.cond = newCond;
      } else if (ef.type === "morale" && ef.delta != null) {
        const newMorale = Math.max(0, Math.min(100, cur.morale + ef.delta));
        if (newMorale === cur.morale) continue;
        stmts.push(db.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.morale', ?) WHERE id = ?`,
        ).bind(newMorale, ef.playerId));
        cur.morale = newMorale;
      } else if (ef.type === "hangover") {
        // Ranní kocovina: -15 condition + life_context.hangover=1 (vyčistí daily-tick).
        // V condition_logu se zaloguje jako source='hangover' (separátní od jiných pub effects).
        const newCond = Math.max(15, cur.cond - 15);
        stmts.push(db.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.condition', ?, '$.hangover', 1) WHERE id = ?`,
        ).bind(newCond, ef.playerId));
        stmts.push(logConditionStmt(db, ef.playerId, cur.teamId, cur.cond, newCond, "hangover", "Ranní kocovina po hospodě"));
        cur.cond = newCond;
      } else if (ef.type === "injury" && ef.injuryDays != null) {
        stmts.push(db.prepare(
          `INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total) VALUES (?, ?, ?, 'obecne', 'Zranění z hospodské bitky', 'lehke', ?, ?)`,
        ).bind(crypto.randomUUID(), ef.playerId, cur.teamId, ef.injuryDays, ef.injuryDays));
        // Plus mírný condition drop
        const newCond = Math.max(20, cur.cond - 8);
        stmts.push(db.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.condition', ?) WHERE id = ?`,
        ).bind(newCond, ef.playerId));
        stmts.push(logConditionStmt(db, ef.playerId, cur.teamId, cur.cond, newCond, "pub", `Hospodská bitka (zranění ${ef.injuryDays} d)`));
        cur.cond = newCond;
      }
    }
  }

  return stmts;
}

/**
 * Coach-led pub session — trenér aktivně rozhodne "Pojedeme na jedno".
 * Volá se z `POST /api/teams/:id/pub-visit`.
 * Vytvoří pub_session pro dnešek (idempotentně přepíše emergent), aplikuje effects.
 *
 * Pro choice="all": všichni active+healthy, +8 morale + −15 cond, vyšší prob hangoveru
 * Pro choice="one": hráč s nejnižší morale, +3 morale, −5 cond, žádné drama
 */
export async function createCoachLedSession(
  db: D1Database,
  teamId: string,
  gameDate: string,
  choice: "all" | "one",
): Promise<{ ok: true; attendeesCount: number; incidentsCount: number } | { ok: false; reason: string }> {
  // Načti aktivní non-injured non-suspended hráče
  const players = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name,
       json_extract(p.personality, '$.alcohol') as alcohol,
       json_extract(p.life_context, '$.morale') as morale
     FROM players p
     WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
       AND p.id NOT IN (SELECT player_id FROM injuries WHERE days_remaining > 0)
       AND COALESCE(p.suspended_matches, 0) = 0`,
  ).bind(teamId).all<{ id: string; first_name: string; last_name: string; alcohol: number; morale: number }>()
    .catch((e) => { logger.warn({ module: "pub" }, "load players for coach-led", e); return { results: [] }; });

  if (players.results.length === 0) return { ok: false, reason: "Žádní dostupní hráči" };

  const attendees: PubAttendee[] = [];
  const incidents: PubIncident[] = [];

  if (choice === "all") {
    for (const p of players.results) {
      attendees.push({
        playerId: p.id, firstName: p.first_name, lastName: p.last_name,
        alcohol: p.alcohol ?? 30, teamId, isVisitor: false,
      });
    }
    // Marker incident: trenér vzal celý tým
    incidents.push({
      type: "coach_led_visit",
      playerIds: attendees.map((a) => a.playerId),
      text: `Trenér vyhlásil "Pojedeme na jedno!" Celý tým v hospodě.`,
      effects: attendees.flatMap((a) => [
        { playerId: a.playerId, type: "morale" as const, delta: 8, label: "+8 morálka" },
        { playerId: a.playerId, type: "condition" as const, delta: -15, label: "−15 kondice" },
      ]),
    });
    // Vyšší prob hangoveru — týmový binge
    for (const a of attendees) {
      if (a.alcohol < 50) continue;
      const prob = 0.25 + ((a.alcohol - 50) / 50) * 0.30; // 50→25%, 100→55%
      if (Math.random() >= prob) continue;
      incidents.push({
        type: "drink_record",
        playerIds: [a.playerId],
        text: `${a.firstName} ${a.lastName} si dal pořádně víc než ostatní.`,
        effects: [{ playerId: a.playerId, type: "hangover", label: "Ranní kocovina (−15 kondice)" }],
      });
    }
  } else {
    // choice === "one" — vyber hráče s nejnižší morale (cílená motivace)
    const target = [...players.results].sort((a, b) => (a.morale ?? 50) - (b.morale ?? 50))[0];
    attendees.push({
      playerId: target.id, firstName: target.first_name, lastName: target.last_name,
      alcohol: target.alcohol ?? 30, teamId, isVisitor: false,
    });
    incidents.push({
      type: "coach_led_one",
      playerIds: [target.id],
      text: `Trenér si pozval ${target.first_name} ${target.last_name} na pivo, probrali sezónu.`,
      effects: [
        { playerId: target.id, type: "morale", delta: 3, label: "+3 morálka" },
        { playerId: target.id, type: "condition", delta: -5, label: "−5 kondice" },
      ],
    });
  }

  // Idempotentně: pokud už dnes existuje (emergent), přepiš ji coach-led variantou.
  await db.prepare(
    `DELETE FROM pub_sessions WHERE team_id = ? AND game_date = ?`,
  ).bind(teamId, gameDate).run().catch((e) => logger.warn({ module: "pub" }, "delete existing emergent session", e));

  await db.prepare(
    `INSERT INTO pub_sessions (team_id, game_date, attendees, incidents, daily_special) VALUES (?, ?, ?, ?, ?)`,
  ).bind(teamId, gameDate, JSON.stringify(attendees), JSON.stringify(incidents), pickRandom(DAILY_SPECIALS)).run()
    .catch((e) => logger.warn({ module: "pub" }, "insert coach-led session", e));

  // Apply effects
  const effectStmts = await applyIncidentEffects(db, incidents);
  if (effectStmts.length > 0) await db.batch(effectStmts).catch((e) => logger.warn({ module: "pub" }, "apply coach-led effects", e));

  return { ok: true, attendeesCount: attendees.length, incidentsCount: incidents.length };
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
      `INSERT INTO pub_sessions (team_id, game_date, attendees, incidents, daily_special) VALUES (?, ?, ?, ?, ?)`,
    ).bind(team.id, gameDate, JSON.stringify(attendees), JSON.stringify(incidents), pickRandom(DAILY_SPECIALS)).run().catch((e) => logger.warn({ module: "pub" }, "insert pub_session", e));

    // Apply effects
    const effectStmts = await applyIncidentEffects(db, incidents);
    if (effectStmts.length > 0) await db.batch(effectStmts).catch((e) => logger.warn({ module: "pub" }, "batch incident effects", e));

    created++;
  }

  return { sessionsCreated: created };
}
