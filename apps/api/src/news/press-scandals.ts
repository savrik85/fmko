/**
 * Kauzy pro redaktory — skutečné průšvihy klubu, na které se dá v rozhovoru zeptat.
 *
 * Redaktoři byli se všemi zadobře a ptali se jen na formu a sestavu. Mají umět
 * i konfrontaci a bulvár, ale nesmí si nic vymýšlet. Proto dostávají hotové věty
 * složené z dat (hospoda, krádeže, pokuty, dluhy, prodeje, sliby, trenérova
 * vlastní slova z minula) a k nim jména, která v nich smí použít. Domýšlet
 * smí jen otázkou, nikdy tvrzením.
 *
 * Věty jsou ve třetí osobě („trenér slíbil…"), protože předzápasový rozhovor vyká
 * a pozápasový tyká; přeformulování do oslovení je práce otázky, ne faktu.
 */

import { logger } from "../lib/logger";
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { sanitizeForPrompt } from "./post-match-context";
import type { JournalistStyle } from "./journalists";

const M = "press-scandals";

export type ScandalKind =
  | "pub" | "club_incident" | "sanction" | "debt" | "sale" | "purchase"
  | "promise" | "own_words" | "same_owner" | "fans";

export interface Scandal {
  /** Klíč konkrétní kauzy. Podle něj se tatáž kauza neotevírá v dalších rozhovorech znovu. */
  ref: string;
  kind: ScandalKind;
  /** Hotová věta s fakty. Nic víc redaktor o kauze neví. */
  fact: string;
  /** Jména, která věta obsahuje. */
  names: string[];
  /** Čím vyšší, tím spíš se na to redaktor zeptá. */
  weight: number;
}

/**
 * Hospodské historky, které stojí za otázku. Chybí ty, co souvisí s vyšetřováním
 * krádeže (chlubení, drby, rvačka se zlodějem): pojmenovávají pachatele, kterého
 * manažer teprve hledá, a článek čte celá liga.
 */
const PUB_TYPES: Record<string, number> = {
  drunk_fight: 6,
  cross_team_fight: 6,
  stezuje_si_na_trenera: 6,
  vudce_trener_hadka: 5,
  vudce_konfrontace: 4,
  coach_lost_bet: 4,
  coach_naps: 4,
  coach_scold: 3,
  cross_team_provocation: 3,
  drink_record: 3,
  pije_na_sekeru: 3,
  tab: 3,
  utraci_za_rundy: 2,
  pub_accident: 3,
  wife_call: 2,
  vudce_kara_hrace: 2,
  vudce_vytka: 2,
};

/** Co koho z redakce láká. Násobí váhu kauzy. */
const STYLE_AFFINITY: Record<JournalistStyle, Partial<Record<ScandalKind, number>>> = {
  bulvar: { pub: 2, club_incident: 1.8, same_owner: 1.5, debt: 1.5, fans: 1.3, sale: 1.2 },
  vycurany: { own_words: 2.2, promise: 1.8, same_owner: 1.5, pub: 1.2 },
  seriozni: { own_words: 1.5, sanction: 1.8, debt: 1.6, sale: 1.5, purchase: 1.5, pub: 0.4 },
  patriot: { fans: 2, sale: 1.5, pub: 0.6 },
};

export function formatCzk(n: number): string {
  return `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
}

function dayOf(d: string | null | undefined): string {
  return String(d ?? "").slice(0, 10);
}

function firstSentence(text: string, max = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  const end = t.search(/[.!?…](\s|$)/);
  const sentence = end > 0 ? t.slice(0, end + 1) : t;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

// ── Jednotlivé zdroje ────────────────────────────────────────────────────────

interface Attendee { playerId: string; firstName: string; lastName: string }
interface PubStory { type: string; playerIds?: string[]; text?: string; incidentId?: string }

async function pubScandals(db: D1Database, teamId: string, gameDate: string): Promise<Scandal[]> {
  const rows = await db.prepare(
    `SELECT game_date, attendees, incidents FROM pub_sessions
     WHERE team_id = ? AND game_date >= date(?, '-7 days') ORDER BY game_date DESC LIMIT 6`,
  ).bind(teamId, gameDate).all<{ game_date: string; attendees: string; incidents: string }>()
    .catch((e) => { logger.warn({ module: M }, "hospoda", e); return { results: [] as Array<{ game_date: string; attendees: string; incidents: string }> }; });

  const out: Scandal[] = [];
  for (const r of rows.results ?? []) {
    let attendees: Attendee[] = [];
    let stories: PubStory[] = [];
    try {
      attendees = JSON.parse(r.attendees) as Attendee[];
      stories = JSON.parse(r.incidents) as PubStory[];
    } catch (e) {
      logger.warn({ module: M }, "nečitelný večer v hospodě", e);
      continue;
    }
    for (const s of stories) {
      const weight = PUB_TYPES[s.type];
      if (!weight || s.incidentId || !s.text) continue;
      const names = (s.playerIds ?? [])
        .map((id) => attendees.find((a) => a.playerId === id))
        .filter((a): a is Attendee => !!a)
        .map((a) => `${a.firstName} ${a.lastName}`);
      out.push({
        ref: `pub:${dayOf(r.game_date)}:${s.type}:${(s.playerIds ?? [])[0] ?? ""}`,
        kind: "pub",
        fact: `V hospodě se mezi lidmi vypráví: „${s.text.trim()}"`,
        names,
        weight,
      });
    }
  }
  return out;
}

/** Jak klub s odhaleným hráčem naložil. Klíče jsou `AkceTrestu` z incidents/typy.ts. */
const PUNISHMENT: Record<string, string> = {
  srazka: "Klub mu to strhává z výplaty.",
  pokuta: "Klub mu dal pokutu.",
  vyradit: "Klub ho na pár zápasů vyřadil.",
  vyhodit: "Klub ho vyhodil.",
  policie: "Klub to předal policii.",
  nechat_byt: "Klub to nechal být.",
  odpustit: "Klub mu to odpustil.",
};

async function clubIncidentScandals(db: D1Database, teamId: string, gameDate: string): Promise<Scandal[]> {
  // Jen to, co se opravdu stalo. Uzavřená hrozba (`nestalo_se`, konec sezóny bez
  // pachatele) má v textu jen řeči z hospody a redaktor by z ní udělal krádež,
  // která nikdy nebyla.
  const rows = await db.prepare(
    `SELECT ci.id, ci.category, ci.status, ci.resolution, ci.text, ci.culprit_type, ci.culprit_revealed,
            p.first_name, p.last_name
     FROM club_incidents ci
     LEFT JOIN players p ON p.id = ci.culprit_player_id AND ci.culprit_revealed = 1
     WHERE ci.team_id = ? AND ci.category IN ('kradez','poskozeni')
       AND (ci.status IN ('otevreny','policie','probiha')
            OR (ci.status = 'uzavreny' AND (ci.resolution IN ('nevyreseno','srazka','pokuta','vyradit','vyhodit','policie','nechat_byt','odpustit')
                                            OR (ci.resolution IS NULL AND ci.culprit_revealed = 1))))
       AND substr(ci.game_date, 1, 10) >= date(?, '-14 days')
     ORDER BY ci.game_date DESC LIMIT 4`,
  ).bind(teamId, gameDate).all<{
    id: string; category: string; status: string; resolution: string | null; text: string;
    culprit_type: string | null; culprit_revealed: number; first_name: string | null; last_name: string | null;
  }>().catch((e) => { logger.warn({ module: M }, "průšvihy v klubu", e); return { results: [] }; });

  return (rows.results ?? []).map((r) => {
    const culprit = r.culprit_revealed === 1 && r.culprit_type === "hrac" && r.first_name
      ? `${r.first_name} ${r.last_name}` : null;
    const suffix = culprit
      ? [
        r.text.includes(culprit) ? "" : `Ukázalo se, že to udělal ${culprit}, hráč klubu.`,
        PUNISHMENT[r.resolution ?? ""] ?? "",
      ].filter(Boolean).map((v) => ` ${v}`).join("")
      : r.status === "policie" ? " Případ řeší policie."
      : r.resolution === "nevyreseno" ? " Kdo to udělal, se nezjistilo."
      : r.status === "uzavreny" ? ""
      : " Pachatel zatím není známý.";
    return {
      ref: `incident:${r.id}`,
      kind: "club_incident" as const,
      fact: `V klubu se stal průšvih: ${r.text.trim()}${suffix}`,
      names: culprit ? [culprit] : [],
      weight: (r.category === "kradez" ? 5 : 3) + (culprit ? 3 : 0),
    };
  });
}

async function sanctionScandals(db: D1Database, teamId: string, gameDate: string): Promise<Scandal[]> {
  const rows = await db.prepare(
    `SELECT id, amount, reason FROM competition_sanctions
     WHERE team_id = ? AND status IN ('issued','appealed') AND amount > 0
       AND substr(game_date, 1, 10) >= date(?, '-21 days')
     ORDER BY game_date DESC LIMIT 10`,
  ).bind(teamId, gameDate).all<{ id: string; amount: number; reason: string }>()
    .catch((e) => { logger.warn({ module: M }, "pokuty od svazu", e); return { results: [] }; });

  const list = rows.results ?? [];
  if (list.length === 0) return [];
  const lowerFirst = (r: string) => r.charAt(0).toLowerCase() + r.slice(1);
  const latest = list[0];
  if (list.length === 1) {
    return [{
      ref: `sanction:${latest.id}`, kind: "sanction",
      fact: `Disciplinárka klubu napařila pokutu ${formatCzk(latest.amount)} za ${lowerFirst(latest.reason)}.`,
      names: [], weight: 4,
    }];
  }
  const total = list.reduce((s, r) => s + r.amount, 0);
  return [{
    ref: `sanction:${latest.id}`, kind: "sanction",
    fact: `Za poslední tři týdny dostal klub od svazu ${list.length} pokut, dohromady ${formatCzk(total)}, naposledy za ${lowerFirst(latest.reason)}.`,
    names: [], weight: 5,
  }];
}

async function debtScandals(db: D1Database, teamId: string, budget: number | null, gameDate: string): Promise<Scandal[]> {
  const out: Scandal[] = [];
  if (budget != null && budget < 0) {
    // Zaokrouhleno na tisíce: bulvár ví, že je klub v minusu, ne na korunu kolik.
    const thousands = Math.floor(Math.abs(budget) / 1000) * 1000;
    out.push({
      ref: `debt:minus:${dayOf(gameDate).slice(0, 7)}`, kind: "debt",
      fact: thousands >= 1000
        ? `Klub je na účtu v minusu, víc než ${formatCzk(thousands)}.`
        : "Klub je na účtu v minusu.",
      names: [], weight: 5,
    });
  }
  const loan = await db.prepare(
    `SELECT id, remaining FROM cash_loans WHERE team_id = ? AND status = 'active'
     ORDER BY remaining DESC LIMIT 1`,
  ).bind(teamId).first<{ id: string; remaining: number }>()
    .catch((e) => { logger.warn({ module: M }, "půjčky", e); return null; });
  if (loan && loan.remaining > 0) {
    out.push({
      ref: `debt:loan:${loan.id}`, kind: "debt",
      fact: `Klub splácí půjčku z každého zápasu, vrátit musí ještě ${formatCzk(loan.remaining)}.`,
      names: [], weight: 3,
    });
  }
  return out;
}

async function transferScandals(db: D1Database, teamId: string, gameDate: string): Promise<Scandal[]> {
  const out: Scandal[] = [];

  // Prodej: cenu nese nová smlouva u kupujícího, odchozí smlouva má poplatek nulový.
  const sold = await db.prepare(
    `SELECT pc.id, p.first_name, p.last_name, t.name AS new_team,
            (SELECT x.fee FROM player_contracts x WHERE x.player_id = pc.player_id AND x.is_active = 1 LIMIT 1) AS fee
     FROM player_contracts pc
     JOIN players p ON p.id = pc.player_id
     LEFT JOIN teams t ON t.id = p.team_id
     WHERE pc.team_id = ? AND pc.leave_type = 'transfer'
       AND substr(pc.left_at, 1, 10) >= date(?, '-10 days')
     ORDER BY p.overall_rating DESC LIMIT 1`,
  ).bind(teamId, gameDate).first<{ id: string; first_name: string; last_name: string; new_team: string | null; fee: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "prodeje", e); return null; });
  if (sold?.new_team) {
    const name = `${sold.first_name} ${sold.last_name}`;
    out.push({
      ref: `sale:${sold.id}`, kind: "sale",
      fact: sold.fee && sold.fee > 0
        ? `${name} nedávno přestoupil do týmu ${sold.new_team}, klub za něj dostal ${formatCzk(sold.fee)}.`
        : `${name} nedávno odešel do týmu ${sold.new_team}.`,
      names: [name], weight: 3,
    });
  }

  const bought = await db.prepare(
    `SELECT pc.id, pc.fee, pc.from_club_name, p.first_name, p.last_name
     FROM player_contracts pc
     JOIN players p ON p.id = pc.player_id
     WHERE pc.team_id = ? AND pc.is_active = 1 AND pc.join_type = 'transfer' AND pc.fee > 0
       AND substr(pc.joined_at, 1, 10) >= date(?, '-10 days')
     ORDER BY pc.fee DESC LIMIT 1`,
  ).bind(teamId, gameDate).first<{ id: string; fee: number; from_club_name: string | null; first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: M }, "nákupy", e); return null; });
  if (bought) {
    const name = `${bought.first_name} ${bought.last_name}`;
    out.push({
      ref: `purchase:${bought.id}`, kind: "purchase",
      fact: `${name} nedávno přišel do klubu${bought.from_club_name ? ` z týmu ${bought.from_club_name}` : ""}, stál ${formatCzk(bought.fee)}.`,
      names: [name], weight: 2,
    });
  }
  return out;
}

async function promiseScandals(db: D1Database, teamId: string, gameDate: string): Promise<Scandal[]> {
  const rows = await db.prepare(
    `SELECT pp.id, pp.type, pp.details, p.first_name, p.last_name
     FROM player_promises pp JOIN players p ON p.id = pp.player_id
     WHERE pp.team_id = ? AND pp.status = 'broken'
       AND substr(COALESCE(pp.resolved_at, pp.made_at), 1, 10) >= date(?, '-21 days')
     ORDER BY pp.resolved_at DESC LIMIT 2`,
  ).bind(teamId, gameDate).all<{ id: string; type: string; details: string | null; first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: M }, "porušené sliby", e); return { results: [] }; });

  return (rows.results ?? []).map((r) => {
    const name = `${r.first_name} ${r.last_name}`;
    let club: string | null = null;
    try { club = r.details ? (JSON.parse(r.details) as { club?: string | null }).club ?? null : null; } catch (e) {
      logger.warn({ module: M }, "detaily slibu", e);
    }
    const what = r.type === "minutes" ? "že bude víc hrát"
      : r.type === "transfer" ? `že ho pustí na přestup${club ? ` do týmu ${club}` : ""}`
      : "že ho uvolní z klubu";
    return {
      ref: `promise:${r.id}`, kind: "promise" as const,
      fact: `${name} dostal od trenéra slib, ${what}. Trenér ho nedodržel.`,
      names: [name], weight: 6,
    };
  });
}

/**
 * Trenérova slova z minulého předzápasového rozhovoru, když pak zápas nevyšel.
 * Nejostřejší konfrontace, jaká jde udělat bez jediného vymyšleného slova.
 */
async function ownWordsScandal(db: D1Database, teamId: string, currentCalendarId: string | null): Promise<Scandal[]> {
  const prev = await db.prepare(
    `SELECT ci.id, ci.answers, ci.match_calendar_id FROM coach_interviews ci
     WHERE ci.team_id = ? AND ci.status = 'answered' AND COALESCE(ci.kind, 'pre_match') = 'pre_match'
       AND ci.match_calendar_id NOT LIKE 'season-%' AND ci.match_calendar_id != ?
     ORDER BY ci.created_at DESC LIMIT 1`,
  ).bind(teamId, currentCalendarId ?? "").first<{ id: string; answers: string | null; match_calendar_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "minulý rozhovor", e); return null; });
  if (!prev?.answers) return [];

  const match = await db.prepare(
    `SELECT m.home_team_id, m.home_score, m.away_score, ht.name AS home_name, at.name AS away_name
     FROM matches m JOIN teams ht ON ht.id = m.home_team_id JOIN teams at ON at.id = m.away_team_id
     WHERE m.calendar_id = ?1 AND (m.home_team_id = ?2 OR m.away_team_id = ?2) AND m.status = 'simulated'
     LIMIT 1`,
  ).bind(prev.match_calendar_id, teamId).first<{
    home_team_id: string; home_score: number; away_score: number; home_name: string; away_name: string;
  }>().catch((e) => { logger.warn({ module: M }, "zápas minulého rozhovoru", e); return null; });
  if (!match) return [];

  const isHome = match.home_team_id === teamId;
  const own = isHome ? match.home_score : match.away_score;
  const opp = isHome ? match.away_score : match.home_score;
  if (own > opp) return [];
  const opponentName = isHome ? match.away_name : match.home_name;

  let answers: string[] = [];
  try { answers = JSON.parse(prev.answers) as string[]; } catch (e) {
    logger.warn({ module: M }, "odpovědi minulého rozhovoru", e);
    return [];
  }
  // Nejdelší odpověď bývá ta, ve které se trenér nejvíc rozpovídal a nejvíc slíbil.
  const longest = answers.filter((a) => typeof a === "string" && a.trim().length >= 25)
    .sort((a, b) => b.length - a.length)[0];
  if (!longest) return [];
  const quote = sanitizeForPrompt(firstSentence(longest), 160).replace(/["„“”]/g, "'");

  return [{
    ref: `own_words:${prev.id}`, kind: "own_words",
    fact: `Před zápasem s týmem ${opponentName} trenér řekl novinám: „${quote}" Zápas pak skončil ${own < opp ? "prohrou" : "remízou"} ${own}:${opp}.`,
    names: [], weight: own < opp ? 6 : 3,
  }];
}

async function sameOwnerScandal(db: D1Database, teamId: string, opponentTeamId: string | null): Promise<Scandal[]> {
  const rows = await db.prepare(
    `SELECT b.team_id, t.name FROM club_links a
     JOIN club_links b ON b.group_id = a.group_id AND b.team_id != a.team_id
     JOIN teams t ON t.id = b.team_id
     WHERE a.team_id = ?`,
  ).bind(teamId).all<{ team_id: string; name: string }>()
    .catch((e) => { logger.warn({ module: M }, "propojené kluby", e); return { results: [] }; });
  const list = rows.results ?? [];
  if (list.length === 0) return [];

  const opponentLink = opponentTeamId ? list.find((r) => r.team_id === opponentTeamId) : undefined;
  if (opponentLink) {
    return [{
      ref: `same_owner:${opponentLink.team_id}:${opponentTeamId}`, kind: "same_owner",
      fact: `Klub má stejného majitele jako soupeř, tým ${opponentLink.name}.`,
      names: [], weight: 8,
    }];
  }
  return [{
    ref: `same_owner:${list.map((r) => r.team_id).sort().join(",")}`, kind: "same_owner",
    fact: `Klub má stejného majitele jako ${list.map((r) => `tým ${r.name}`).join(" a ")}.`,
    names: [], weight: 2,
  }];
}

/** Tribuna: kampaně proti trenérovi či hráči, výtržnosti, vyhrocená rivalita, špatná nálada. */
async function fanScandals(db: D1Database, teamId: string): Promise<Scandal[]> {
  const out: Scandal[] = [];
  const campaign = await db.prepare(
    `SELECT id, kind, target_name, podpisy FROM fan_campaigns
     WHERE team_id = ? AND status IN ('sbira','splnena')
     ORDER BY podpisy DESC LIMIT 1`,
  ).bind(teamId).first<{ id: string; kind: string; target_name: string; podpisy: number }>()
    .catch((e) => { logger.warn({ module: M }, "kampaň fanoušků", e); return null; });
  if (campaign) {
    out.push(campaign.kind === "trener_ven"
      ? {
        ref: `fans:campaign:${campaign.id}`, kind: "fans",
        fact: `Na tribuně se objevil transparent s trenérovým jménem a slovem „konči", podepsalo se pod to ${campaign.podpisy} lidí.`,
        names: [], weight: 8,
      }
      : {
        ref: `fans:campaign:${campaign.id}`, kind: "fans",
        fact: `Fanoušci sbírají podpisy za to, aby ${campaign.target_name} přestal nastupovat, mají jich ${campaign.podpisy}.`,
        names: [campaign.target_name], weight: 6,
      });
  }

  const disorder = await db.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(fine), 0) AS fines FROM fan_incidents
     WHERE team_id = ? AND created_at > datetime('now', '-30 days')`,
  ).bind(teamId).first<{ n: number; fines: number }>()
    .catch((e) => { logger.warn({ module: M }, "výtržnosti fanoušků", e); return null; });
  if (disorder && disorder.n >= 2) {
    out.push({
      ref: `fans:disorder:${disorder.n}`, kind: "fans",
      fact: `Za poslední měsíc má klub ${disorder.n} zápisů o výtržnostech fanoušků a na pokutách zaplatil ${formatCzk(disorder.fines)}.`,
      names: [], weight: 4,
    });
  }

  const rival = await db.prepare(
    `SELECT CASE WHEN r.team_a = ?1 THEN tb.name ELSE ta.name END AS opponent
     FROM fan_rivalries r
     LEFT JOIN teams ta ON ta.id = r.team_a
     LEFT JOIN teams tb ON tb.id = r.team_b
     WHERE (r.team_a = ?1 OR r.team_b = ?1) AND r.heat >= 60
     ORDER BY r.heat DESC LIMIT 1`,
  ).bind(teamId).first<{ opponent: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "rivalita fanoušků", e); return null; });
  if (rival?.opponent) {
    out.push({
      ref: `fans:rivalry:${rival.opponent}`, kind: "fans",
      fact: `Mezi fanoušky klubu a fanoušky týmu ${rival.opponent} je to dlouhodobě vyhrocené.`,
      names: [], weight: 2,
    });
  }

  const mood = await db.prepare("SELECT ROUND(AVG(mood)) AS m FROM fan_groups WHERE team_id = ?")
    .bind(teamId).first<{ m: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "nálada fanoušků", e); return null; });
  if (mood?.m != null && mood.m <= 28) {
    out.push({
      ref: "fans:mood", kind: "fans",
      fact: "Nálada na tribuně je dlouhodobě špatná a chodí míň lidí.",
      names: [], weight: 3,
    });
  }
  return out;
}

// ── Sběr a výběr ─────────────────────────────────────────────────────────────

/**
 * Všechny kauzy klubu, které se teď dají otevřít. Okna se počítají v herním čase
 * týmu, ne v reálném, protože tak běží i hospoda, smlouvy a pokuty.
 */
export async function loadScandals(
  db: D1Database,
  teamId: string,
  opts: { opponentTeamId?: string | null; calendarId?: string | null } = {},
): Promise<Scandal[]> {
  const team = await db.prepare("SELECT game_date, budget FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string | null; budget: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "tým", e); return null; });
  const gameDate = dayOf(team?.game_date) || new Date().toISOString().slice(0, 10);

  const parts = await Promise.all([
    pubScandals(db, teamId, gameDate),
    clubIncidentScandals(db, teamId, gameDate),
    sanctionScandals(db, teamId, gameDate),
    debtScandals(db, teamId, team?.budget ?? null, gameDate),
    transferScandals(db, teamId, gameDate),
    promiseScandals(db, teamId, gameDate),
    ownWordsScandal(db, teamId, opts.calendarId ?? null),
    sameOwnerScandal(db, teamId, opts.opponentTeamId ?? null),
    fanScandals(db, teamId),
  ]);
  return parts.flat();
}

/** Kauzy otevřené v posledních rozhovorech týmu — ty se hned znovu neotvírají. */
export async function recentScandalRefs(db: D1Database, teamId: string): Promise<Set<string>> {
  const rows = await db.prepare(
    `SELECT topics FROM coach_interviews WHERE team_id = ? AND topics IS NOT NULL
     ORDER BY created_at DESC LIMIT 8`,
  ).bind(teamId).all<{ topics: string }>()
    .catch((e) => { logger.warn({ module: M }, "použité kauzy", e); return { results: [] }; });
  const refs = new Set<string>();
  for (const r of rows.results ?? []) {
    try {
      for (const t of JSON.parse(r.topics) as Array<{ ref?: string }>) if (t?.ref) refs.add(t.ref);
    } catch (e) {
      logger.warn({ module: M }, "nečitelná témata rozhovoru", e);
    }
  }
  return refs;
}

/**
 * Vybere kauzy do jednoho rozhovoru: váženě podle závažnosti a povahy redaktora,
 * bez opakování z posledních rozhovorů a nanejvýš jednu od každého druhu.
 * Deterministické podle `seed`, ať opakovaný běh dá tentýž rozhovor.
 */
export function pickScandals(
  scandals: readonly Scandal[],
  opts: { style: JournalistStyle | null; count: number; seed: string; usedRefs?: ReadonlySet<string> },
): Scandal[] {
  const affinity = opts.style ? STYLE_AFFINITY[opts.style] : {};
  const rng = createRng(seedFromString(`scandal|${opts.seed}`));
  const weightedPick = <T,>(items: Array<{ item: T; w: number }>): T => {
    const total = items.reduce((sum, x) => sum + x.w, 0);
    let r = rng.random() * total;
    for (const x of items) {
      r -= x.w;
      if (r <= 0) return x.item;
    }
    return items[items.length - 1].item;
  };

  // Nejdřív jeden zástupce za každý druh. Jinak by hospoda, kde se za týden
  // sejde pět historek, přehlasovala jedinou pokutu nebo dluh jen počtem.
  const byKind = new Map<ScandalKind, Scandal[]>();
  for (const s of scandals) {
    if (opts.usedRefs?.has(s.ref) || s.weight <= 0) continue;
    byKind.set(s.kind, [...(byKind.get(s.kind) ?? []), s]);
  }
  let pool = [...byKind.entries()]
    .map(([kind, list]) => {
      const representative = weightedPick(list.map((s) => ({ item: s, w: s.weight })));
      return { item: representative, w: Math.max(...list.map((s) => s.weight)) * (affinity[kind] ?? 1) };
    })
    .filter((x) => x.w > 0);

  const out: Scandal[] = [];
  while (out.length < opts.count && pool.length > 0) {
    const chosen = weightedPick(pool);
    out.push(chosen);
    pool = pool.filter((x) => x.item !== chosen);
  }
  return out;
}
