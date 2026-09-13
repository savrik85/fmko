/**
 * Fanouškovské party — API.
 *
 * `routes/game.ts` má přes devět tisíc řádků a fanouškovská ekonomika (vstupné,
 * občerstvení, spokojenost) tam zůstává; party a jejich vůdci dostávají vlastní
 * router, aby ten soubor dál nerostl. Vzor je `routes/referees.ts`.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { requireAdmin, requireTeamOwnership } from "../auth/middleware";
import { SECURITY_POPIS } from "../stadium/stadium-generator";
import { CLUB_EVENTS, type ClubEventKind } from "../engine/fan-reactions";
import {
  FAN_GROUPS, SECTOR_LABELS, fanLeaderArchetypeLabel, moodWord, heatWord,
  type FanGroupKind, type FanSector,
} from "../engine/fan-groups";
import { fanLeaderFullName, type FanGroupRow, type FanLeaderRow } from "../fans/fan-group-generator";
import { syncFanGroups } from "../fans/fan-group-state";
import { rivaloveKlubu } from "../fans/fan-rivalries";
import { nactiOblibence } from "../fans/fan-favourites";
import { nactiKampane } from "../fans/fan-campaigns";
import { nactiPoskozeni } from "../stadium/stadium-damage";
import { nactiZed } from "../fans/fan-feed";
import { nactiChoraly } from "../fans/fan-chants";
import {
  FAN_ACTIONS, FAN_ACTION_KEYS, actionCost, dnuOd,
  dopadSchuzky, dopadSlevy, dopadTifa, dopadZakazu, dopadOdvolaniZakazu, dopadPresunu,
  type FanActionKey, type Dopad,
} from "../fans/fan-group-actions";

export const fansRouter = new Hono<{ Bindings: Bindings }>();

// Zápisy jen vlastníkovi týmu. Middleware GET propouští, takže čtení cizích
// part (třeba kotle soupeře před derby) zůstává otevřené.
fansRouter.use("/teams/:teamId/fans/*", requireTeamOwnership);

const M = "fans-api";

interface IncidentRow {
  id: string;
  match_id: string | null;
  group_id: string | null;
  kind: string;
  severity: number;
  minute: number | null;
  text: string;
  fine: number;
  sector_closed_matches: number;
  fans_lost: number;
  game_date: string | null;
  created_at: string;
}

function safeJson(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) {
    logger.warn({ module: M }, "nečitelný JSON avataru vůdce", e);
    return null;
  }
}

function leaderView(l: FanLeaderRow) {
  return {
    id: l.id,
    name: fanLeaderFullName(l),
    firstName: l.first_name,
    lastName: l.last_name,
    nickname: l.nickname,
    age: l.age,
    occupation: l.occupation,
    archetype: l.archetype,
    archetypeLabel: fanLeaderArchetypeLabel(l.archetype, l.gender),
    bio: l.bio,
    hlaska: l.hlaska,
    sentiment: l.sentiment,
    duvod: l.duvod,
    charisma: l.charisma,
    radikalnost: l.radikalnost,
    vyjednavani: l.vyjednavani,
    avatar: safeJson(l.avatar),
  };
}

function groupView(g: FanGroupRow, leader: FanLeaderRow | undefined) {
  const def = FAN_GROUPS[g.kind as FanGroupKind];
  return {
    id: g.id,
    kind: g.kind,
    kindLabel: def?.label ?? g.kind,
    popis: def?.popis ?? "",
    name: g.name,
    size: g.size,
    /** Tvrdé jádro: kolik z party dělá bordel a jezdí na výjezdy. */
    core: g.core ?? 0,
    mood: g.mood,
    moodWord: moodWord(g.mood),
    heat: g.heat,
    heatWord: heatWord(g.heat),
    passion: g.passion,
    aggression: g.aggression,
    loyalty: g.loyalty,
    spending: g.spending,
    noise: g.noise,
    sector: g.sector,
    sectorLabel: SECTOR_LABELS[g.sector as FanSector] ?? g.sector,
    sectorClosed: g.closed_matches > 0,
    closedMatches: g.closed_matches,
    ticketDiscount: g.ticket_discount,
    leader: leader ? leaderView(leader) : null,
  };
}

function incidentView(i: IncidentRow) {
  return {
    id: i.id,
    matchId: i.match_id,
    groupId: i.group_id,
    kind: i.kind,
    severity: i.severity,
    minute: i.minute,
    text: i.text,
    fine: i.fine,
    sectorClosedMatches: i.sector_closed_matches,
    fansLost: i.fans_lost,
    gameDate: i.game_date,
    createdAt: i.created_at,
  };
}

/** Detail události do výpisu — jméno hráče, částka, nový název. */
function detailUdalosti(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const v = p.co ?? p.jmeno ?? p.nazev;
    return v == null ? null : String(v);
  } catch (e) {
    logger.warn({ module: M }, "nečitelný payload události", e);
    return null;
  }
}

async function teamGameDate(db: D1Database, teamId: string): Promise<string> {
  const row = await db.prepare("SELECT game_date FROM teams WHERE id = ?")
    .bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "herní datum týmu", e); return null; });
  return row?.game_date ?? new Date().toISOString().slice(0, 10);
}

async function loadLeaders(db: D1Database, teamId: string): Promise<Map<string, FanLeaderRow>> {
  const rows = await db
    .prepare("SELECT * FROM fan_leaders WHERE team_id = ? AND status = 'active'")
    .bind(teamId).all<FanLeaderRow>()
    .catch((e) => { logger.warn({ module: M }, "načtení vůdců", e); return null; });
  return new Map((rows?.results ?? []).map((l) => [l.id, l]));
}

/**
 * Party klubu i s vůdci a posledními výtržnostmi.
 *
 * Velikosti se před odpovědí srovnají s fanbází (`drift: false` — náladou hýbe
 * jedině denní tick, jinak by ji hráč posouval refreshem stránky).
 */
fansRouter.get("/teams/:teamId/fans/groups", async (c) => {
  const teamId = c.req.param("teamId");
  const db = c.env.DB;

  const groups = await syncFanGroups(db, teamId, { drift: false });
  if (groups.length === 0) return c.json({ error: "Tým nenalezen" }, 404);

  const [leaders, gameDate, incidents, security] = await Promise.all([
    loadLeaders(db, teamId),
    teamGameDate(db, teamId),
    db.prepare(
      `SELECT id, match_id, group_id, kind, severity, minute, text, fine,
              sector_closed_matches, fans_lost, game_date, created_at
       FROM fan_incidents WHERE team_id = ? ORDER BY created_at DESC LIMIT 10`,
    ).bind(teamId).all<IncidentRow>()
      .catch((e) => { logger.warn({ module: M }, "poslední výtržnosti", e); return null; }),
    db.prepare("SELECT security FROM stadiums WHERE team_id = ?")
      .bind(teamId).first<{ security: number }>()
      .catch((e) => { logger.warn({ module: M }, "úroveň pořadatelské služby", e); return null; }),
  ]);

  const kdy = await cooldownyKlubu(db, teamId);
  const udalosti = await db
    .prepare(
      `SELECT kind, severity, payload, game_date FROM club_events
       WHERE team_id = ? ORDER BY created_at DESC LIMIT 8`,
    ).bind(teamId).all<{ kind: string; severity: number; payload: string | null; game_date: string }>()
    .catch((e) => { logger.warn({ module: M }, "poslední dění klubu", e); return null; });

  return c.json({
    groups: groups.map((g) => ({
      ...groupView(g, g.leader_id ? leaders.get(g.leader_id) : undefined),
      options: nabidkaAkci(kdy, gameDate, g),
    })),
    recentIncidents: (incidents?.results ?? []).map(incidentView),
    recentEvents: (udalosti?.results ?? []).map((u) => ({
      kind: u.kind,
      label: CLUB_EVENTS[u.kind as ClubEventKind]?.label ?? u.kind,
      detail: detailUdalosti(u.payload),
      severity: u.severity,
      gameDate: u.game_date,
    })),
    securityLevel: security?.security ?? 0,
    securityLabel: SECURITY_POPIS[Math.max(0, Math.min(3, security?.security ?? 0))],
    rivals: await rivaloveKlubu(db, teamId, gameDate),
    favourites: (await nactiOblibence(db, teamId)).map((o) => ({
      groupName: o.group_name,
      groupKind: o.group_kind,
      stance: o.stance,
      playerId: o.player_id,
      playerName: `${o.first_name} ${o.last_name}`,
      position: o.position,
      duvod: o.duvod,
      since: o.since,
    })),
    campaigns: (await nactiKampane(db, teamId)).map((k) => ({
      id: k.id,
      kind: k.kind,
      target: k.target_name,
      targetPlayerId: k.target_player_id,
      duvod: k.duvod,
      podpisy: k.podpisy,
      prah: k.prah,
      status: k.status,
    })),
    chants: (await nactiChoraly(db, teamId)).map((ch) => ({
      id: ch.id, kind: ch.kind, text: ch.text, duvod: ch.duvod,
      sila: ch.sila, silaWord: ch.silaWord, since: ch.since_game_date,
      audio: ch.audio_a
        ? {
            url: `${zakladApi(c)}/api/choraly/${ch.id}/audio`,
            maDruhou: !!ch.audio_b,
            vybrana: ch.audio_vybrana ?? "a",
          }
        : null,
      // Bez nahrávky: ať je vidět, jestli se na ni čeká, nebo si ji chorál
      // teprve musí vyzpívat.
      nahravkaSeChysta: !ch.audio_a && !!ch.audio_task_id,
    })),
    damage: (await nactiPoskozeni(db, teamId)).map((d) => ({
      id: d.id, facility: d.facility, label: d.label,
      levels: d.levels, cost: d.repair_cost, popis: d.popis, gameDate: d.game_date,
    })),
    gameDate,
  });
});

/**
 * Tribuna — zeď fanoušků.
 *
 * Vlastní endpoint, ne součást `/fans/groups`: čte ji telefon, který o partách
 * nic dalšího nepotřebuje, a tahá se opakovaně.
 */
fansRouter.get("/teams/:teamId/fans/feed", async (c) => {
  const teamId = c.req.param("teamId");
  const limit = Number.parseInt(c.req.query("limit") ?? "40", 10);
  const posts = await nactiZed(c.env.DB, teamId, Number.isFinite(limit) ? limit : 40);
  return c.json({
    posts: posts.map((p) => ({
      id: p.id,
      author: p.author_name,
      handle: p.author_handle,
      authorKind: p.author_kind,
      avatar: typeof p.author_avatar === "string" ? bezpecnyAvatar(p.author_avatar) : null,
      body: p.body,
      tone: p.tone,
      likes: p.likes,
      topic: p.topic,
      gameDate: p.game_date,
      createdAt: p.created_at,
    })),
  });
});

/** Oprava rozbitého zařízení. */
fansRouter.post("/teams/:teamId/fans/repair/:damageId", async (c) => {
  const teamId = c.req.param("teamId");
  const damageId = c.req.param("damageId");
  const gameDate = await teamGameDate(c.env.DB, teamId);

  const { opravVybaveni } = await import("../stadium/stadium-damage");
  const res = await opravVybaveni(c.env.DB, { teamId, damageId, gameDate });
  if (!res.ok) {
    const hlaska = res.duvod === "malo_penez"
      ? `Na opravu chybí ${(res.chybi ?? 0).toLocaleString("cs-CZ")} Kč.`
      : res.duvod === "uz_opraveno"
        ? "Tohle už je opravené."
        : "Takové poškození u klubu není.";
    return c.json({ error: hlaska }, 400);
  }
  return c.json({ ok: true, label: res.label, cost: res.cost, novaUroven: res.novaUroven });
});

/** Avatar vůdce je volný JSON — rozbitý nesmí shodit celou zeď. */
function bezpecnyAvatar(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (e) {
    logger.warn({ module: M }, "rozbitý avatar v příspěvku", e);
    return null;
  }
}

/** Detail jedné party — plná historie jejích výtržností a manažerských zásahů. */
fansRouter.get("/teams/:teamId/fans/groups/:groupId", async (c) => {
  const teamId = c.req.param("teamId");
  const groupId = c.req.param("groupId");
  const db = c.env.DB;

  const groups = await syncFanGroups(db, teamId, { drift: false });
  const group = groups.find((g) => g.id === groupId);
  if (!group) return c.json({ error: "Parta nenalezena" }, 404);

  const [leaders, gameDate, incidents, actions] = await Promise.all([
    loadLeaders(db, teamId),
    teamGameDate(db, teamId),
    db.prepare(
      `SELECT id, match_id, group_id, kind, severity, minute, text, fine,
              sector_closed_matches, fans_lost, game_date, created_at
       FROM fan_incidents WHERE group_id = ? ORDER BY created_at DESC LIMIT 30`,
    ).bind(groupId).all<IncidentRow>()
      .catch((e) => { logger.warn({ module: M }, "výtržnosti party", e); return null; }),
    db.prepare(
      "SELECT id, action, cost, game_date, created_at FROM fan_group_actions WHERE group_id = ? ORDER BY created_at DESC LIMIT 30",
    ).bind(groupId).all<{ id: string; action: string; cost: number; game_date: string; created_at: string }>()
      .catch((e) => { logger.warn({ module: M }, "historie zásahů", e); return null; }),
  ]);

  return c.json({
    group: groupView(group, group.leader_id ? leaders.get(group.leader_id) : undefined),
    options: nabidkaAkci(await cooldownyKlubu(db, teamId), gameDate, group),
    incidents: (incidents?.results ?? []).map(incidentView),
    actions: (actions?.results ?? []).map((a) => ({
      id: a.id, action: a.action, cost: a.cost, gameDate: a.game_date, createdAt: a.created_at,
    })),
    gameDate,
  });
});

/** Profil vůdce. Vrací i partu, kterou vede — bez ní ten člověk nedává smysl. */
fansRouter.get("/fan-leaders/:leaderId", async (c) => {
  const db = c.env.DB;
  const leader = await db
    .prepare("SELECT * FROM fan_leaders WHERE id = ?")
    .bind(c.req.param("leaderId")).first<FanLeaderRow>()
    .catch((e) => { logger.warn({ module: M }, "načtení vůdce", e); return null; });
  if (!leader) return c.json({ error: "Vůdce nenalezen" }, 404);

  const [group, team, gameDate] = await Promise.all([
    db.prepare("SELECT * FROM fan_groups WHERE id = ?")
      .bind(leader.group_id).first<FanGroupRow>()
      .catch((e) => { logger.warn({ module: M }, "parta vůdce", e); return null; }),
    db.prepare("SELECT id, name FROM teams WHERE id = ?")
      .bind(leader.team_id).first<{ id: string; name: string }>()
      .catch((e) => { logger.warn({ module: M }, "klub vůdce", e); return null; }),
    teamGameDate(db, leader.team_id),
  ]);

  return c.json({
    leader: leaderView(leader),
    group: group ? groupView(group, leader) : null,
    team: team ? { id: team.id, name: team.name } : null,
  });
});

/** Kronika bordelu — co se stalo a kolik to stálo. */
fansRouter.get("/teams/:teamId/fans/incidents", async (c) => {
  const teamId = c.req.param("teamId");
  const limit = Math.max(1, Math.min(100, Number(c.req.query("limit")) || 20));

  const rows = await c.env.DB.prepare(
    `SELECT i.id, i.match_id, i.group_id, i.kind, i.severity, i.minute, i.text, i.fine,
            i.sector_closed_matches, i.fans_lost, i.game_date, i.created_at,
            g.name AS group_name
     FROM fan_incidents i LEFT JOIN fan_groups g ON g.id = i.group_id
     WHERE i.team_id = ? ORDER BY i.created_at DESC LIMIT ?`,
  ).bind(teamId, limit).all<IncidentRow & { group_name: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "kronika výtržností", e); return null; });

  const items = (rows?.results ?? []).map((r) => ({ ...incidentView(r), groupName: r.group_name }));

  // Součet za sezónu se počítá zvlášť — výpis je stránkovaný a sečíst ho na FE by lhalo.
  const suma = await c.env.DB.prepare(
    "SELECT COUNT(*) AS pocet, COALESCE(SUM(fine),0) AS pokuty FROM fan_incidents WHERE team_id = ?",
  ).bind(teamId).first<{ pocet: number; pokuty: number }>()
    .catch((e) => { logger.warn({ module: M }, "součet pokut", e); return null; });

  return c.json({
    items,
    total: suma?.pocet ?? items.length,
    finesTotal: suma?.pokuty ?? 0,
  });
});

// ── Dev trigger ──────────────────────────────────────────────────────────────

/**
 * Vynutí vyhodnocení výtržností u odehraného zápasu.
 *
 * Jinak se čeká na zápasový tick a mechanika se nedá otestovat.
 *
 * `reset=1` uvolní jen nárok, ne zapsané incidenty. Losování je deterministické,
 * takže druhý běh dojde ke stejnému skutku, `INSERT OR IGNORE` na jeho ID vrátí
 * nula změn a dopady se přeskočí — přesně tím se dá ověřit, že druhá obrana proti
 * dvojí pokutě drží i bez nároku.
 */
fansRouter.post("/admin/force-fan-incident", requireAdmin, async (c) => {
  const db = c.env.DB;
  const matchId = c.req.query("matchId");
  if (!matchId) return c.json({ error: "Chybí matchId" }, 400);

  const m = await db
    .prepare(
      `SELECT m.id, m.home_team_id, m.away_team_id, m.home_score, m.away_score,
              m.attendance, m.calendar_id, m.league_id, m.referee_id, m.status
       FROM matches m WHERE m.id = ?`,
    )
    .bind(matchId)
    .first<{
      id: string; home_team_id: string; away_team_id: string;
      home_score: number | null; away_score: number | null; attendance: number | null;
      calendar_id: string | null; league_id: string | null; referee_id: string | null;
      status: string;
    }>()
    .catch((e) => { logger.warn({ module: M }, "načtení zápasu pro dev trigger", e); return null; });
  if (!m) return c.json({ error: "Zápas nenalezen" }, 404);
  if (m.status !== "simulated") return c.json({ error: "Zápas ještě není odehraný" }, 400);

  if (c.req.query("reset") === "1") {
    await db.prepare("UPDATE matches SET fan_incidents = NULL WHERE id = ?").bind(matchId).run()
      .catch((e) => { logger.warn({ module: M }, "reset nároku", e); });
  }

  const cal = m.calendar_id
    ? await db.prepare("SELECT season_number, league_id FROM season_calendar WHERE id = ?")
        .bind(m.calendar_id).first<{ season_number: number; league_id: string }>()
        .catch((e) => { logger.warn({ module: M }, "kalendář pro dev trigger", e); return null; })
    : null;

  const { getRelation } = await import("../community/manager-relations");
  const rel = await getRelation(db, m.home_team_id, m.away_team_id)
    .catch((e) => { logger.warn({ module: M }, "vztah manažerů", e); return null; });

  const { resolveMatchIncidents } = await import("../fans/resolve-match-incidents");
  const res = await resolveMatchIncidents(db, {
    matchId: m.id,
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    homeScore: m.home_score ?? 0,
    awayScore: m.away_score ?? 0,
    attendance: m.attendance ?? 0,
    preMatchHeat: rel?.heat ?? 0,
    leagueId: cal?.league_id ?? m.league_id ?? null,
    seasonNumber: cal?.season_number ?? 0,
    gameDate: await teamGameDate(db, m.home_team_id),
    sporneVerdikty: c.req.query("sporne") === "1",
    refereeId: m.referee_id,
  });

  return c.json(res);
});

// ── Akce manažera ────────────────────────────────────────────────────────────

interface AkceView {
  action: string;
  label: string;
  popis: string;
  cost: number;
  cooldownDnu: number;
  variants: { key: string; label: string; cost: number }[];
  available: boolean;
  blockedReason?: string;
}

/**
 * Kdy naposled která parta co dělala — jedním dotazem za celý klub.
 *
 * Per-partu by to bylo pět dotazů na jedno otevření stránky; nabídka se přitom
 * počítá pro všechny party naráz.
 */
async function cooldownyKlubu(db: D1Database, teamId: string): Promise<Map<string, string>> {
  const rows = await db
    .prepare(
      `SELECT group_id, action, MAX(game_date) AS gd FROM fan_group_actions
       WHERE team_id = ? GROUP BY group_id, action`,
    )
    .bind(teamId)
    .all<{ group_id: string; action: string; gd: string }>()
    .catch((e) => { logger.warn({ module: M }, "cooldowny akcí", e); return null; });
  return new Map((rows?.results ?? []).map((r) => [`${r.group_id}|${r.action}`, r.gd]));
}

/** Nabídka akcí pro jednu partu i s tím, proč která zrovna nejde. */
function nabidkaAkci(
  kdy: Map<string, string>,
  gameDate: string,
  group: FanGroupRow,
): AkceView[] {
  return FAN_ACTION_KEYS.map((key) => {
    const def = FAN_ACTIONS[key];
    const uplynulo = dnuOd(kdy.get(`${group.id}|${key}`) ?? null, gameDate);
    let available = true;
    let blockedReason: string | undefined;

    if (def.cooldownDnu > 0 && uplynulo < def.cooldownDnu) {
      available = false;
      const zbyva = def.cooldownDnu - uplynulo;
      blockedReason = `Znovu až za ${zbyva === 1 ? "den" : zbyva <= 4 ? `${zbyva} dny` : `${zbyva} dnů`}.`;
    }
    if (key === "odvolat_zakaz" && group.closed_matches <= 0) {
      available = false;
      blockedReason = "Sektor není zavřený.";
    }
    if (key === "zakaz" && group.closed_matches > 0) {
      available = false;
      blockedReason = "Sektor už zavřený je.";
    }

    // U přesunu se nenabízí sektor, ve kterém parta stojí.
    const variants = def.variants
      ? def.variants.filter((v) => key !== "presun" || v.key !== group.sector)
      : [];
    if (key === "presun" && variants.length === 0) {
      available = false;
      blockedReason = "Není kam je přestěhovat.";
    }

    return {
      action: key,
      label: def.label,
      popis: def.popis,
      cost: def.cost,
      cooldownDnu: def.cooldownDnu,
      variants,
      available,
      blockedReason,
    };
  });
}

/**
 * Provede akci s partou.
 *
 * Pořadí je záměrné: nejdřív cooldown a peníze, teprve pak dopad. Kdyby se
 * účinek počítal dřív, blokovaný nákup by nechal partu spokojenější zadarmo.
 */
fansRouter.post("/teams/:teamId/fans/groups/:groupId/action", async (c) => {
  const db = c.env.DB;
  const teamId = c.req.param("teamId");
  const groupId = c.req.param("groupId");
  const body = await c.req.json<{ action?: string; variant?: string }>().catch(() => null);
  const action = body?.action as FanActionKey | undefined;

  if (!action || !FAN_ACTIONS[action]) return c.json({ error: "Neznámá akce" }, 400);
  const def = FAN_ACTIONS[action];
  const variant = body?.variant ?? null;
  if (def.variants && !def.variants.some((v) => v.key === variant)) {
    return c.json({ error: "Vyber prosím variantu." }, 400);
  }

  const groups = await syncFanGroups(db, teamId, { drift: false });
  const group = groups.find((g) => g.id === groupId);
  if (!group) return c.json({ error: "Parta nenalezena" }, 404);

  const gameDate = await teamGameDate(db, teamId);

  // Cooldown a stavové podmínky — stejná pravidla, jaká hlásí nabídka.
  const polozka = nabidkaAkci(await cooldownyKlubu(db, teamId), gameDate, group)
    .find((n) => n.action === action);
  if (polozka && !polozka.available) {
    return c.json({ error: polozka.blockedReason ?? "Tahle akce teď nejde." }, 400);
  }

  const cena = actionCost(action, variant);
  if (cena > 0) {
    const { assertPurchaseAllowed, recordTransaction } = await import("../season/finance-processor");
    const check = await assertPurchaseAllowed(db, teamId, cena);
    if (!check.ok) return c.json({ error: check.reason }, 400);
    await recordTransaction(
      db, teamId, "fan_relations", -cena,
      `${def.label} ${group.name}`, gameDate, `fanact-${groupId}-${action}-${gameDate}`,
    );
  }

  const leader = group.leader_id
    ? await db.prepare("SELECT * FROM fan_leaders WHERE id = ?").bind(group.leader_id).first<FanLeaderRow>()
        .catch((e) => { logger.warn({ module: M }, "vůdce pro akci", e); return null; })
    : null;

  const dopad = await spocitejDopad(db, { action, variant, group, leader, teamId });
  await zapisDopad(db, { action, variant, group, leader, dopad, gameDate, teamId, cena });

  return c.json({
    ok: true,
    message: dopad.text,
    sentiment: dopad.sentiment,
    mood: dopad.mood,
    cost: cena,
  });
});

async function spocitejDopad(
  db: D1Database,
  a: { action: FanActionKey; variant: string | null; group: FanGroupRow; leader: FanLeaderRow | null; teamId: string },
): Promise<Dopad> {
  switch (a.action) {
    case "schuzka": {
      const tym = await db.prepare("SELECT reputation FROM teams WHERE id = ?")
        .bind(a.teamId).first<{ reputation: number }>()
        .catch((e) => { logger.warn({ module: M }, "reputace pro schůzku", e); return null; });
      return dopadSchuzky({
        vyjednavani: a.leader?.vyjednavani ?? 50,
        sentiment: a.leader?.sentiment ?? 0,
        managerReputation: tym?.reputation ?? 50,
        // Výsledek se nesmí dát opakovat refreshem — schůzka je jednorázová
        // událost, ne něco, co jde losovat dokola.
        roll: Math.random(),
      });
    }
    case "sleva": return dopadSlevy(Number(a.variant) || 0);
    case "tifo": return dopadTifa(a.variant ?? "male", a.leader?.vyjednavani ?? 50);
    case "zakaz": return dopadZakazu(Number(a.variant) || 1);
    case "odvolat_zakaz": return dopadOdvolaniZakazu();
    case "presun": return dopadPresunu(a.group.sector, a.variant ?? a.group.sector);
  }
}

async function zapisDopad(
  db: D1Database,
  a: {
    action: FanActionKey; variant: string | null; group: FanGroupRow; leader: FanLeaderRow | null;
    dopad: Dopad; gameDate: string; teamId: string; cena: number;
  },
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];

  const zmeny: string[] = [
    "mood = MAX(0, MIN(100, mood + ?))",
    "heat = MAX(0, MIN(100, heat + ?))",
  ];
  const hodnoty: unknown[] = [a.dopad.mood, a.dopad.heat];

  if (a.action === "sleva") {
    zmeny.push("ticket_discount = ?");
    hodnoty.push((Number(a.variant) || 0) / 100);
  }
  if (a.action === "zakaz") {
    zmeny.push("closed_matches = ?");
    hodnoty.push(Math.max(1, Math.min(3, Number(a.variant) || 1)));
  }
  if (a.action === "odvolat_zakaz") {
    zmeny.push("closed_matches = 0");
  }
  if (a.action === "presun" && a.variant) {
    zmeny.push("sector = ?");
    hodnoty.push(a.variant);
  }

  stmts.push(
    db.prepare(
      `UPDATE fan_groups SET ${zmeny.join(", ")},
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
    ).bind(...hodnoty, a.group.id),
  );

  if (a.leader && a.dopad.sentiment !== 0) {
    stmts.push(
      db.prepare(
        `UPDATE fan_leaders SET sentiment = MAX(-100, MIN(100, sentiment + ?)), duvod = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
      ).bind(a.dopad.sentiment, a.dopad.text, a.leader.id),
    );
  }

  stmts.push(
    db.prepare(
      `INSERT INTO fan_group_actions (id, team_id, group_id, action, cost, game_date, effect_json)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(), a.teamId, a.group.id, a.action, a.cena, a.gameDate,
      JSON.stringify({ variant: a.variant, ...a.dopad }),
    ),
  );

  await db.batch(stmts).catch((e) => { logger.error({ module: M }, `zápis akce ${a.action}`, e); });
}

/**
 * Nechá fanoušky vstřebat nezpracované dění klubu.
 *
 * Normálně to dělá denní tick uvnitř `syncFanGroups`. Bez tohohle by se reakce
 * na přestup nebo zdražení daly ověřit až druhý herní den.
 */
/**
 * Fanouškovská část denního ticku pro jeden tým.
 *
 * Normálně to běží v `team-day.ts` jednou za herní den. Bez tohohle se po
 * nasazení nedá nic ověřit dřív než druhý den ráno.
 */
fansRouter.post("/admin/fan-daily", requireAdmin, async (c) => {
  const teamId = c.req.query("teamId");
  if (!teamId) return c.json({ error: "Chybí teamId" }, 400);

  const gameDate = await teamGameDate(c.env.DB, teamId);
  const party = await syncFanGroups(c.env.DB, teamId, { drift: true });
  if (party.length === 0) return c.json({ error: "Tým nemá party" }, 404);

  const { prepoctiOblibence } = await import("../fans/fan-favourites");
  const { tikKampani, dopadSplneneKampane } = await import("../fans/fan-campaigns");
  const { prepoctiTransparent, formaKlubu } = await import("../fans/fan-banner");
  const {
    prispevkyKOblibencum, prispevkyKeKampani, prispevekKTransparentu, prispevkyKHre,
  } = await import("../fans/fan-feed");

  const zmeny = await prepoctiOblibence(c.env.DB, teamId, party, gameDate);
  if (zmeny.length > 0) await prispevkyKOblibencum(c.env.DB, teamId, zmeny, gameDate);

  const kampane = await tikKampani(c.env.DB, teamId, party, gameDate);
  for (const k of kampane.zalozene) await prispevkyKeKampani(c.env.DB, k, "zalozena", gameDate);
  for (const k of kampane.splnene) {
    await dopadSplneneKampane(c.env.DB, k, gameDate);
    await prispevkyKeKampani(c.env.DB, k, "splnena", gameDate);
  }

  const plachta = await prepoctiTransparent(c.env.DB, teamId, party, gameDate, c.env);
  if (plachta) await prispevekKTransparentu(c.env.DB, teamId, plachta, gameDate);

  const { tikChoralu, zalozDomaciChoral } = await import("../fans/fan-chants");
  const { prispevkyKChoralum } = await import("../fans/fan-feed");
  const domov = await zalozDomaciChoral(c.env.DB, teamId, party, gameDate, c.env);
  const noveChoraly = await tikChoralu(c.env.DB, teamId, party, gameDate, c.env);
  const vsechnyChoraly = domov ? [domov, ...noveChoraly] : noveChoraly;
  if (vsechnyChoraly.length > 0) await prispevkyKChoralum(c.env.DB, teamId, vsechnyChoraly, gameDate);

  // Týdenní dopad prostředí. V dev triggeru se pouští vždycky, ať se dá ověřit.
  const { nactiProstredi, dopadProstredi, dopadKamaradeniSRivalem, zijeRivalitu } =
    await import("../fans/fan-prostredi");
  const prostredi = await nactiProstredi(c.env.DB, teamId);
  const kamaradeni = await dopadKamaradeniSRivalem(c.env.DB, teamId, party, gameDate);
  const dopady: Array<{ parta: string; mood: number; heat: number; duvod: string }> = [];
  const pStmts: D1PreparedStatement[] = [];
  for (const g of party) {
    let mood = 0, heat = 0, duvod = "";
    if (prostredi) {
      const d = dopadProstredi({ kind: g.kind as never, id: g.id }, prostredi);
      mood += d.mood; heat += d.heat; duvod = d.duvod;
    }
    if (kamaradeni && zijeRivalitu(g.kind)) { heat += kamaradeni.heat; duvod = kamaradeni.duvod; }
    if (mood === 0 && heat === 0) continue;
    dopady.push({ parta: g.name, mood, heat, duvod });
    pStmts.push(c.env.DB.prepare(
      `UPDATE fan_groups SET mood = MAX(0, MIN(100, mood + ?)), heat = MAX(0, MIN(100, heat + ?)),
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
    ).bind(mood, heat, g.id));
  }
  if (pStmts.length > 0) {
    await c.env.DB.batch(pStmts).catch((e) => logger.warn({ module: M }, "dev dopad prostředí", e));
  }

  const forma = await formaKlubu(c.env.DB, teamId);
  const taktika = await c.env.DB.prepare("SELECT tactic FROM teams WHERE id = ?")
    .bind(teamId).first<{ tactic: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "taktika pro dev tick", e); return null; });
  const hraPrispevky = await prispevkyKHre(c.env.DB, {
    teamId, taktika: taktika?.tactic ?? null, golyPoslednich5: forma.goly,
    zapasu: forma.zapasu, gameDate,
  });

  return c.json({
    ok: true, gameDate,
    jadra: party.map((g) => ({ name: g.name, core: g.core })),
    oblibenci: zmeny,
    kampane: { zalozene: kampane.zalozene.length, splnene: kampane.splnene.length, vysumele: kampane.vysumele.length },
    transparent: plachta,
    choraly: vsechnyChoraly,
    prostredi: dopady,
    kamaradeniSRivalem: kamaradeni,
    forma,
    prispevkyKHre: hraPrispevky,
  });
});

fansRouter.post("/admin/process-fan-events", requireAdmin, async (c) => {
  const teamId = c.req.query("teamId");
  if (!teamId) return c.json({ error: "Chybí teamId" }, 400);

  const groups = await syncFanGroups(c.env.DB, teamId, { drift: false });
  if (groups.length === 0) return c.json({ error: "Tým nemá party" }, 404);

  const { zpracujUdalostiKlubu } = await import("../fans/fan-reactions");
  const res = await zpracujUdalostiKlubu(c.env.DB, teamId, groups);
  return c.json(res);
});

/**
 * Zkušební nahrávka chorálu přes Suno.
 *
 * Otázka, kterou to má zodpovědět: dá se ze Suna dostat SAMOTNÝ zpěv bez
 * hudby? Přepínač na a cappella API nemá (`instrumental: true` znamená opak,
 * hudbu bez zpěvu), takže se to dá tlačit jen stylem, `negativeTags` a vahou
 * stylu. Tohle to zkusí a vrátí, co skutečně přišlo.
 *
 * Klíč je Cloudflare secret, ven se nedostane, proto to musí jít přes worker.
 * Nic to nezapisuje do DB, nesahá na `team_anthems` ani na limit pokusů hymny.
 */
const SUNO_API = "https://api.sunoapi.org/api/v1";

fansRouter.post("/admin/suno-choral-test", requireAdmin, async (c) => {
  const key = c.env.SUNO_API_KEY;
  if (!key) return c.json({ error: "Chybí SUNO_API_KEY" }, 503);

  type Zadani = {
    text?: string; style?: string; negativeTags?: string;
    model?: string; duration?: number; styleWeight?: number;
  };
  const body: Zadani = await c.req.json<Zadani>().catch((e) => {
    logger.warn({ module: "fans" }, "suno-choral-test: tělo požadavku", e);
    return {} as Zadani;
  });

  // Chorál se opakuje, protože kotel ho taky opakuje a je čím zaplnit 20 vteřin.
  const text = body.text ?? [
    "KOLMAN, KOLMAN, do toho KOLMAN!",
    "KOLMAN, KOLMAN, do toho KOLMAN!",
    "Hej, hej, KOLMAN, hej, hej!",
    "KOLMAN, KOLMAN, do toho KOLMAN!",
  ].join("\n");

  const payload = {
    prompt: text,
    style: body.style
      ?? "football terrace chant, a cappella, male crowd shouting in unison, stadium reverb, no instruments",
    title: "Choral test",
    customMode: true,
    instrumental: false,
    // `duration` bere jen V6 a spol., V4 (co používá hymna) ho ignoruje.
    model: body.model ?? "V6",
    duration: body.duration ?? 20,
    negativeTags: body.negativeTags
      ?? "drums, percussion, guitar, bass, synth, piano, strings, melody, instrumental backing, music, beat",
    vocalGender: "m",
    styleWeight: body.styleWeight ?? 0.9,
    callBackUrl: "https://example.com/suno-callback",
  };

  const res = await fetch(`${SUNO_API}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  if (!res.ok) {
    logger.warn({ module: "fans" }, `suno-choral-test: ${res.status} ${raw.slice(0, 300)}`);
    return c.json({ error: "Suno odmítlo zadání", status: res.status, telo: raw.slice(0, 500) }, 502);
  }

  const json = JSON.parse(raw) as { code?: number; msg?: string; data?: { taskId?: string } };
  const taskId = json.data?.taskId;
  if (!taskId) return c.json({ error: "Suno nevrátilo taskId", odpoved: json }, 502);
  return c.json({ ok: true, taskId, payload });
});

/** Stav zkušební nahrávky. Vrací i odkazy na mp3, ať se to dá poslechnout. */
fansRouter.get("/admin/suno-choral-test", requireAdmin, async (c) => {
  const key = c.env.SUNO_API_KEY;
  const taskId = c.req.query("taskId");
  if (!key) return c.json({ error: "Chybí SUNO_API_KEY" }, 503);
  if (!taskId) return c.json({ error: "Chybí taskId" }, 400);

  const res = await fetch(`${SUNO_API}/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const raw = await res.text();
  if (!res.ok) {
    logger.warn({ module: "fans" }, `suno-choral-test stav: ${res.status} ${raw.slice(0, 300)}`);
    return c.json({ error: "Suno neodpovědělo", status: res.status, telo: raw.slice(0, 500) }, 502);
  }

  const json = JSON.parse(raw) as {
    data?: {
      status?: string; errorMessage?: string;
      response?: { sunoData?: Array<{ audioUrl?: string; streamAudioUrl?: string; duration?: number; title?: string }> };
    };
  };
  const skladby = json.data?.response?.sunoData ?? [];
  return c.json({
    ok: true,
    stav: json.data?.status ?? "?",
    chyba: json.data?.errorMessage ?? null,
    nahravky: skladby.map((s) => ({
      url: s.audioUrl ?? s.streamAudioUrl ?? null,
      delka: s.duration ?? null,
      titul: s.title ?? null,
    })),
  });
});

/**
 * Zbývající kredit u Suna.
 *
 * Kvůli tomu, aby se dala spočítat cena jedné nahrávky: přečíst před generací
 * a po ní. Ceník sunoapi.org neuvádí, kolik která operace stojí, takže rozdíl
 * je jediný spolehlivý zdroj.
 *
 * Zkouší se dva hostitelé, protože dokumentace uvádí u kreditu jiný než
 * u generace a není jisté, který z nich klíč obslouží.
 */
fansRouter.get("/admin/suno-credit", requireAdmin, async (c) => {
  const key = c.env.SUNO_API_KEY;
  if (!key) return c.json({ error: "Chybí SUNO_API_KEY" }, 503);

  const hostitele = ["https://api.sunoapi.org", "https://apibox.erweima.ai"];
  const pokusy: Array<{ host: string; status: number; telo: string }> = [];
  for (const host of hostitele) {
    const res = await fetch(`${host}/api/v1/generate/credit`, {
      headers: { Authorization: `Bearer ${key}` },
    }).catch((e) => {
      logger.warn({ module: "fans" }, `suno-credit ${host}`, e);
      return null;
    });
    if (!res) { pokusy.push({ host, status: 0, telo: "spojení selhalo" }); continue; }
    const telo = (await res.text()).slice(0, 300);
    pokusy.push({ host, status: res.status, telo });
    if (res.ok) {
      const j = JSON.parse(telo) as { data?: number | { credits?: number } };
      const kredit = typeof j.data === "number" ? j.data : j.data?.credits ?? null;
      if (kredit !== null) return c.json({ ok: true, kredit, host });
    }
  }
  return c.json({ error: "Kredit se nepodařilo přečíst", pokusy }, 502);
});

/** Základ veřejné adresy API. Nahrávky se pouští z `<audio src>`, ne fetchem. */
function zakladApi(c: { env: Bindings; req: { url: string } }): string {
  return c.env.API_BASE_URL || new URL(c.req.url).origin;
}

/**
 * Jen chorály, bez zbytku fanouškovské agendy.
 *
 * Stránka stadionu potřebuje v zápasovém režimu pustit kotel a tahat kvůli
 * tomu celý `/fans/groups` (party, vůdci, incidenty, škody) by bylo zbytečné.
 */
fansRouter.get("/teams/:teamId/fans/chants", async (c) => {
  const teamId = c.req.param("teamId");
  const choraly = await nactiChoraly(c.env.DB, teamId);
  return c.json({
    chants: choraly.map((ch) => ({
      id: ch.id, kind: ch.kind, text: ch.text, sila: ch.sila, silaWord: ch.silaWord,
      audio: ch.audio_a
        ? { url: `${zakladApi(c)}/api/choraly/${ch.id}/audio`, vybrana: ch.audio_vybrana ?? "a" }
        : null,
    })),
  });
});

/**
 * Nahrávka chorálu.
 *
 * Bez přihlášení schválně: `<audio src>` neumí poslat hlavičku s tokenem,
 * a je to zpěv o obci, ne citlivý údaj. Stejně to má hymna klubu.
 */
fansRouter.get("/choraly/:chantId/audio", async (c) => {
  const chantId = c.req.param("chantId");
  const row = await c.env.DB.prepare(
    "SELECT audio_a, audio_b, audio_vybrana FROM fan_chants WHERE id = ?",
  ).bind(chantId).first<{ audio_a: string | null; audio_b: string | null; audio_vybrana: string | null }>()
    .catch((e) => { logger.warn({ module: "fans" }, `nahrávka ${chantId}`, e); return null; });
  if (!row?.audio_a) return c.json({ error: "Chorál nahrávku nemá" }, 404);

  const chce = c.req.query("v");
  const varianta = chce === "a" || chce === "b" ? chce : (row.audio_vybrana ?? "a");
  const klic = (varianta === "b" ? row.audio_b : row.audio_a) ?? row.audio_a;

  const obj = await c.env.SEED_DATA.get(klic);
  if (!obj) return c.json({ error: "Nahrávka není k dispozici" }, 404);
  return new Response(obj.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" },
  });
});

/**
 * Výběr verze nahrávky.
 *
 * Suno vrací dvě a liší se tím, kolik do nich prosáklo nástrojů. Které je
 * čistší, pozná ucho líp než jakékoliv měření, takže rozhoduje manažer.
 */
fansRouter.post("/teams/:teamId/fans/chants/:chantId/audio", async (c) => {
  const teamId = c.req.param("teamId");
  const chantId = c.req.param("chantId");
  const body = await c.req.json<{ varianta?: string }>().catch((e) => {
    logger.warn({ module: "fans" }, "výběr verze chorálu", e);
    return {} as { varianta?: string };
  });
  const varianta = body.varianta;
  if (varianta !== "a" && varianta !== "b") {
    return c.json({ error: "varianta musí být 'a' nebo 'b'" }, 400);
  }

  const row = await c.env.DB.prepare(
    "SELECT audio_a, audio_b FROM fan_chants WHERE id = ? AND team_id = ?",
  ).bind(chantId, teamId).first<{ audio_a: string | null; audio_b: string | null }>();
  if (!row) return c.json({ error: "Chorál nenalezen" }, 404);
  if (varianta === "b" && !row.audio_b) return c.json({ error: "Druhá verze neexistuje" }, 400);

  await c.env.DB.prepare(
    "UPDATE fan_chants SET audio_vybrana = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?",
  ).bind(varianta, chantId).run();
  return c.json({ ok: true, varianta });
});

/**
 * Ruční běh nahrávek.
 *
 * Denní tick to dělá sám, tohle je na rozjezd a na ověření. `limit` drží
 * strop, ať se jedním omylem nespálí celý kredit.
 */
fansRouter.post("/admin/chant-audio-run", requireAdmin, async (c) => {
  const { dotahniNahravky, objednejNahravky, zbyvajiciKredit, MAX_ZA_BEH } =
    await import("../fans/fan-chant-audio");
  const limit = Math.max(0, Math.min(MAX_ZA_BEH * 5, Number(c.req.query("limit") ?? MAX_ZA_BEH)));

  const kreditPred = await zbyvajiciKredit(c.env.SUNO_API_KEY);
  const dotazene = await dotahniNahravky(c.env);
  const objednane = await objednejNahravky(c.env, limit);
  const kreditPo = await zbyvajiciKredit(c.env.SUNO_API_KEY);

  return c.json({
    ok: true, limit, dotazene, objednane,
    kredit: { pred: kreditPred, po: kreditPo,
      spotreba: kreditPred !== null && kreditPo !== null ? kreditPred - kreditPo : null },
  });
});

/** Kdo na nahrávku čeká a proč. Kontrola před tím, než se to pustí naostro. */
fansRouter.get("/admin/chant-audio-run", requireAdmin, async (c) => {
  const { kandidatiNaNahravku, zbyvajiciKredit, KREDITU_ZA_NAHRAVKU } =
    await import("../fans/fan-chant-audio");
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit") ?? 50)));
  const kandidati = await kandidatiNaNahravku(c.env.DB, limit);
  const kredit = await zbyvajiciKredit(c.env.SUNO_API_KEY);
  const hotove = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM fan_chants WHERE audio_a IS NOT NULL",
  ).first<{ n: number }>();
  return c.json({
    ok: true, kredit,
    nahranych: hotove?.n ?? 0,
    ceka: kandidati.length,
    potrebaKreditu: kandidati.length * KREDITU_ZA_NAHRAVKU,
    kandidati: kandidati.map((k) => ({ id: k.id, kind: k.kind, sila: k.sila, text: k.text })),
  });
});
