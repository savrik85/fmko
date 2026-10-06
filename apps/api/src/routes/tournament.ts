/**
 * Turnaj P-Mobile — každoroční turnaj přihlášených lidských klubů na konci sezóny.
 * Přihlášky (přihlásit / odhlásit do uzávěrky), pozvánka od sponzora, los a průběh
 * (admin), data pro stránku /turnaj, detail zápasu a hřiště pro 3D.
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireAdmin, requireTeamOwnership } from "../auth/middleware";
import { sendSystemSMS } from "../messaging/system-sms";
import { sendWebPushToTeam, getNotificationPreferences } from "../community/web-push";
import { logger } from "../lib/logger";
import { DrawError, drawPreview, loadCurrentTournament, performDraw, type TournamentRow } from "../tournament/service";
import { loadCompetitionView } from "../tournament/view";
import { maybeAdvanceTournament } from "../tournament/advance";

const M = "tournament";

const tournamentRouter = new Hono<{ Bindings: Bindings }>();

tournamentRouter.use("/teams/:teamId/tournament/*", requireTeamOwnership);
tournamentRouter.use("/admin/tournament/*", requireAdmin);

// SMS se tlačítkem „Otevřít turnaj" v telefonu.
const SMS_META = { type: "tournament" };

interface TeamRow {
  id: string;
  user_id: string | null;
  team_type: string | null;
}

function isRegistrationOpen(t: TournamentRow, now: Date): boolean {
  return t.status === "registration" && now.toISOString() < t.registration_deadline;
}

/** Přihlásit se může jen lidský A-tým. Vrací důvod, proč ne, nebo null. */
function ineligibleReason(team: TeamRow): string | null {
  if (team.user_id === "ai" || !team.user_id) return "Turnaj je jen pro kluby vedené manažery.";
  if (team.team_type && team.team_type !== "senior") return "Přihlásit se může jen A-tým.";
  return null;
}

// Den v týdnu s předložkou: „v pondělí" (kdy), „do pondělí" (dokdy), „od středy" (odkdy).
const ON_WEEKDAY = ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"];
const UNTIL_WEEKDAY = ["do neděle", "do pondělí", "do úterý", "do středy", "do čtvrtka", "do pátku", "do soboty"];
const FROM_WEEKDAY = ["od neděle", "od pondělí", "od úterý", "od středy", "od čtvrtka", "od pátku", "od soboty"];

/** „ve 20:00" / „v 18:00" — „ve" před dvě, tři, čtyři, dvanáct a dvacet. */
function atTime(hour: number, minute: string): string {
  const ve = [2, 3, 4, 12, 20, 21, 22, 23].includes(hour);
  return `${ve ? "ve" : "v"} ${hour}:${minute}`;
}

/** Den v týdnu, datum a čas v pražském čase (uzávěrka je skutečný čas, ne herní). */
function pragueParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
    date: `${get("day")}. ${get("month")}.`,
    hour: Number(get("hour")),
    minute: get("minute"),
  };
}

/** „v pondělí 12. 10. ve 20:00" */
function formatPragueDeadline(iso: string): string {
  const p = pragueParts(iso);
  return `${ON_WEEKDAY[p.weekday] ?? ""} ${p.date} ${atTime(p.hour, p.minute)}`.trim();
}

/** „do pondělí 12. 10. (20:00)" */
function untilDeadline(iso: string): string {
  const p = pragueParts(iso);
  return `${UNTIL_WEEKDAY[p.weekday] ?? "do"} ${p.date} (${p.hour}:${p.minute})`;
}

/** „ve středu 14. 10." z data YYYY-MM-DD. */
function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${ON_WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

/** „od středy 14. 10." z data YYYY-MM-DD. */
function fromDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${FROM_WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

/** „150 000 Kč" */
function kc(n: number): string {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Kč`;
}

/** „Turnaj P-Mobile" → „Turnaje P-Mobile" (2. pád do věty „ročník …"). */
function nameGenitive(name: string): string {
  return name.startsWith("Turnaj ") ? `Turnaje ${name.slice("Turnaj ".length)}` : name;
}

/** Výchozí text pozvánky od sponzora. Admin ho před odesláním vidí a může upravit. */
function defaultInviteMessage(t: TournamentRow): string {
  const where = t.city_locative ?? `ve městě ${t.city}`;
  const when = t.starts_on ? ` ${fromDay(t.starts_on)}` : "";
  return (
    `Dobrý den, srdečně vás zveme na ${t.edition}. ročník ${nameGenitive(t.name)}! ` +
    `Odehraje se ${where}${when} a potkají se v něm kluby z různých okresů. ` +
    `Připravili jsme štědré odměny: za každý získaný bod vyplácíme ${kc(t.point_reward)}, ` +
    `za postup do play-off další prémie a vítěz si odveze ${kc(t.prize_winner)} a trofej do klubové vitríny. ` +
    `Všechny náklady spojené s turnajem platíme my, vy se soustřeďte jen na fotbal. ` +
    `Zápasy budou každý den, takže je to ideální příležitost dát šanci celému kádru včetně hráčů z U21. ` +
    `Přihlášky přijímáme ${untilDeadline(t.registration_deadline)} na stránce Turnaj. ` +
    `Těšíme se na vás! Váš ${t.sponsor}`
  );
}

/**
 * Turnaj z pohledu klubu: propozice, stav přihlášek, seznam přihlášených.
 * Seznam je veřejný (vidí ho všichni), proto GET bez kontroly vlastnictví.
 */
tournamentRouter.get("/teams/:teamId/tournament", async (c) => {
  const teamId = c.req.param("teamId");
  const db = c.env.DB;

  const tournament = await loadCurrentTournament(db);
  if (!tournament) return c.json({ tournament: null });

  const team = await db.prepare("SELECT id, user_id, team_type FROM teams WHERE id = ?")
    .bind(teamId).first<TeamRow>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const entries = await db.prepare(
    `SELECT e.team_id, e.registered_at, t.name, t.primary_color, l.district
       FROM tournament_entries e
       JOIN teams t ON t.id = e.team_id
       LEFT JOIN leagues l ON l.id = t.league_id
      WHERE e.tournament_id = ?
      ORDER BY e.registered_at ASC`
  ).bind(tournament.id).all<{ team_id: string; registered_at: string; name: string; primary_color: string | null; district: string | null }>();

  const reason = ineligibleReason(team);
  return c.json({
    tournament: {
      id: tournament.id,
      edition: tournament.edition,
      name: tournament.name,
      sponsor: tournament.sponsor,
      city: tournament.city,
      venueName: tournament.venue_name,
      status: tournament.status,
      registrationDeadline: tournament.registration_deadline,
      startsOn: tournament.starts_on,
      pointReward: tournament.point_reward,
      prizes: {
        quarterfinal: tournament.prize_quarterfinal,
        semifinal: tournament.prize_semifinal,
        finalist: tournament.prize_finalist,
        winner: tournament.prize_winner,
      },
      leagueMatches: tournament.league_matches,
      leagueDays: tournament.league_days,
      winnerTeamId: tournament.winner_team_id,
    },
    competition: ["drawn", "running", "finished"].includes(tournament.status)
      ? await loadCompetitionView(db, tournament, teamId)
      : null,
    registrationOpen: isRegistrationOpen(tournament, new Date()),
    entries: entries.results.map((e) => ({
      teamId: e.team_id,
      name: e.name,
      primaryColor: e.primary_color,
      district: e.district,
      registeredAt: e.registered_at,
    })),
    myEntry: entries.results.some((e) => e.team_id === teamId),
    eligible: reason === null,
    ineligibleReason: reason,
  });
});

/** Kontrola před přihlášením i odhlášením. Vrací ročník, nebo odpověď s chybou. */
async function loadOpenTournamentFor(db: D1Database, teamId: string): Promise<{ tournament: TournamentRow } | { error: string; status: 400 | 404 }> {
  const tournament = await loadCurrentTournament(db);
  if (!tournament) return { error: "Turnaj není vypsaný", status: 404 };
  if (!isRegistrationOpen(tournament, new Date())) return { error: "Přihlášky jsou uzavřené", status: 400 };

  const team = await db.prepare("SELECT id, user_id, team_type FROM teams WHERE id = ?")
    .bind(teamId).first<TeamRow>();
  if (!team) return { error: "Tým nenalezen", status: 404 };
  const reason = ineligibleReason(team);
  if (reason) return { error: reason, status: 400 };

  return { tournament };
}

tournamentRouter.post("/teams/:teamId/tournament/entry", async (c) => {
  const teamId = c.req.param("teamId");
  const db = c.env.DB;

  const check = await loadOpenTournamentFor(db, teamId);
  if ("error" in check) return c.json({ error: check.error }, check.status);
  const { tournament } = check;

  const res = await db.prepare("INSERT OR IGNORE INTO tournament_entries (tournament_id, team_id) VALUES (?, ?)")
    .bind(tournament.id, teamId).run();

  // Potvrzení jen při skutečně nové přihlášce, ne při dvojkliku.
  if (res.meta.changes > 0) {
    // formatDay končí tečkou za měsícem („14. 10."), druhou tečku za větu nepřidávat.
    const start = tournament.starts_on ? ` Hrát se začne ${formatDay(tournament.starts_on)}` : "";
    const body =
      `${tournament.name}, ${tournament.edition}. ročník: přihláška je přijata. ` +
      `Uzávěrka je ${formatPragueDeadline(tournament.registration_deadline)}, pak proběhne los.${start} ` +
      `Dějiště: ${tournament.venue_name}, ${tournament.city}. Všechny náklady hradíme my, vy se soustřeďte na fotbal.`;
    await sendSystemSMS(db, teamId, tournament.sponsor, body, SMS_META)
      .catch((e) => logger.warn({ module: M }, `confirmation sms for team ${teamId}`, e));
  }

  return c.json({ ok: true });
});

tournamentRouter.delete("/teams/:teamId/tournament/entry", async (c) => {
  const teamId = c.req.param("teamId");
  const db = c.env.DB;

  const check = await loadOpenTournamentFor(db, teamId);
  if ("error" in check) return c.json({ error: check.error }, check.status);

  await db.prepare("DELETE FROM tournament_entries WHERE tournament_id = ? AND team_id = ?")
    .bind(check.tournament.id, teamId).run();

  return c.json({ ok: true });
});

/**
 * Lidské A-týmy, které se zatím nepřihlásily — adresáti pozvánky.
 * U21 sdílí user_id s A-týmem, proto filtr na team_type.
 */
async function inviteRecipients(db: D1Database, tournamentId: string): Promise<string[]> {
  const rows = await db.prepare(
    `SELECT t.id FROM teams t
      WHERE t.team_type = 'senior' AND t.user_id IS NOT NULL AND t.user_id != 'ai'
        AND t.id NOT IN (SELECT team_id FROM tournament_entries WHERE tournament_id = ?)`
  ).bind(tournamentId).all<{ id: string }>();
  return rows.results.map((r) => r.id);
}

/** Admin: náhled pozvánky — výchozí text, počet adresátů, jestli už odešla. */
tournamentRouter.get("/admin/tournament/invite", async (c) => {
  const db = c.env.DB;
  const t = await loadCurrentTournament(db);
  if (!t) return c.json({ error: "Turnaj není vypsaný" }, 404);
  const recipients = await inviteRecipients(db, t.id);
  return c.json({
    tournament: { id: t.id, edition: t.edition, name: t.name, sponsor: t.sponsor },
    defaultMessage: defaultInviteMessage(t),
    recipients: recipients.length,
    invitedAt: t.invited_at,
  });
});

/**
 * Admin: rozeslat pozvánku od sponzora (SMS + push) všem nepřihlášeným lidským klubům.
 * Jen jednou za ročník — claim přes invited_at, ať dvojklik ani opakovaný fetch
 * nepošle všem SMS dvakrát.
 */
tournamentRouter.post("/admin/tournament/invite", async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{ message?: string }>().catch((e) => {
    logger.warn({ module: M }, "invite: invalid body", e);
    return {} as { message?: string };
  });

  const t = await loadCurrentTournament(db);
  if (!t) return c.json({ error: "Turnaj není vypsaný" }, 404);
  if (!isRegistrationOpen(t, new Date())) return c.json({ error: "Přihlášky jsou uzavřené" }, 400);

  const message = body.message?.trim() || defaultInviteMessage(t);

  const claim = await db.prepare("UPDATE tournaments SET invited_at = ? WHERE id = ? AND invited_at IS NULL")
    .bind(new Date().toISOString(), t.id).run();
  if (claim.meta.changes === 0) {
    return c.json({ error: `Pozvánka už odešla (${t.invited_at ?? "dříve"})` }, 409);
  }

  const pushTitle = `${t.sponsor}: pozvánka na turnaj`;
  const pushBody = message.length > 120 ? `${message.slice(0, 117)}...` : message;
  let sent = 0;
  let pushed = 0;
  for (const teamId of await inviteRecipients(db, t.id)) {
    await sendSystemSMS(db, teamId, t.sponsor, message, SMS_META)
      .then(() => { sent++; })
      .catch((e) => logger.warn({ module: M }, `invite sms for team ${teamId}`, e));

    // Push respektuje vypnuté systémové notifikace; selhání nesmí zastavit rozesílání.
    const prefs = await getNotificationPreferences(db, teamId)
      .catch((e) => { logger.warn({ module: M }, `invite push prefs for team ${teamId}`, e); return null; });
    if (prefs?.system !== false) {
      await sendWebPushToTeam(c.env, teamId, pushTitle, pushBody, "/turnaj")
        .then(() => { pushed++; })
        .catch((e) => logger.warn({ module: M }, `invite push for team ${teamId}`, e));
    }
  }

  logger.info({ module: M }, `invite sent: ${sent} sms, ${pushed} push (tournament ${t.id})`);
  return c.json({ ok: true, sent, pushed });
});

// ── Los a průběh (admin) ──

const SHORT_WEEKDAY = ["ne", "po", "út", "st", "čt", "pá", "so"];

/** Náhled losu: počet přihlášených a možnosti, kolik zápasů na tým a jak dlouho to potrvá. */
tournamentRouter.get("/admin/tournament/draw", async (c) => {
  const preview = await drawPreview(c.env.DB);
  if (!preview) return c.json({ error: "Turnaj není vypsaný" }, 404);
  return c.json(preview);
});

/** Los: rozpis ligové fáze s hřišti, pak SMS od sponzora každému klubu s jeho zápasy. */
tournamentRouter.post("/admin/tournament/draw", async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{ matchesPerTeam?: number }>().catch((e) => {
    logger.warn({ module: M }, "draw: invalid body", e);
    return {} as { matchesPerTeam?: number };
  });
  if (!Number.isInteger(body.matchesPerTeam)) return c.json({ error: "Vyber počet zápasů na tým" }, 400);
  let result: { matches: number; leagueDays: number };
  try {
    result = await performDraw(db, body.matchesPerTeam as number);
  } catch (e) {
    if (e instanceof DrawError) return c.json({ error: e.message }, 400);
    logger.error({ module: M }, "los selhal", e);
    return c.json({ error: "Los se nepodařil" }, 500);
  }

  const t = await loadCurrentTournament(db);
  if (t) {
    const rows = await db.prepare(
      `SELECT m.day, m.scheduled_at, m.home_team_id, m.away_team_id, h.name AS home_name, a.name AS away_name, v.name AS venue
         FROM tournament_matches m JOIN teams h ON h.id = m.home_team_id JOIN teams a ON a.id = m.away_team_id
         LEFT JOIN tournament_venues v ON v.id = m.venue_id
        WHERE m.tournament_id = ? ORDER BY m.day`
    ).bind(t.id).all<{ day: number; scheduled_at: string; home_team_id: string; away_team_id: string; home_name: string; away_name: string; venue: string | null }>();
    const entries = await db.prepare("SELECT team_id FROM tournament_entries WHERE tournament_id = ?").bind(t.id).all<{ team_id: string }>();
    for (const e of entries.results) {
      const mine = rows.results.filter((r) => r.home_team_id === e.team_id || r.away_team_id === e.team_id);
      const lines = mine.map((r) => {
        const opp = r.home_team_id === e.team_id ? r.away_name : r.home_name;
        const d = new Date(r.scheduled_at);
        return `${SHORT_WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}. ${opp} (${r.venue ?? t.venue_name})`;
      });
      const body =
        `Los je hotový! Vaše zápasy v ligové fázi, výkop vždy v 18:00: ${lines.join("; ")}. ` +
        `Nejlepší kluby z tabulky postoupí do play-off. Sestavu na každý zápas nastavíte na stránce Sestava. Hodně štěstí!`;
      await sendSystemSMS(db, e.team_id, t.sponsor, body, SMS_META)
        .catch((err) => logger.warn({ module: M }, `SMS s rozpisem pro tým ${e.team_id}`, err));
    }
  }
  return c.json({ ok: true, ...result });
});

/** Admin (test): odehraje nejbližší neodehraný hrací den hned, bez čekání na 18:00. */
tournamentRouter.post("/admin/tournament/advance", async (c) => {
  const r = await maybeAdvanceTournament(c.env.DB, { forceDay: true, maxMatches: 6 });
  return c.json({ ok: true, ...r });
});

// ── Detail zápasu (stejný tvar jako /cup-matches/:id) ──

const STAGE_NAME: Record<string, string> = { qf: "Čtvrtfinále", sf: "Semifinále", final: "Finále" };

tournamentRouter.get("/tournament-matches/:id", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT m.*, t.name AS tournament_name, t.edition,
            h.name AS home_name, h.primary_color AS home_color, h.secondary_color AS home_secondary, h.badge_pattern AS home_badge,
            a.name AS away_name, a.primary_color AS away_color, a.secondary_color AS away_secondary, a.badge_pattern AS away_badge,
            v.name AS venue_name, v.capacity AS venue_capacity, v.is_main AS venue_is_main
       FROM tournament_matches m
       JOIN tournaments t ON t.id = m.tournament_id
       JOIN teams h ON h.id = m.home_team_id
       JOIN teams a ON a.id = m.away_team_id
       LEFT JOIN tournament_venues v ON v.id = m.venue_id
      WHERE m.id = ?`
  ).bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!row) return c.json({ error: "Match not found" }, 404);

  const parse = <T>(v: unknown, fallback: T): T => {
    if (typeof v !== "string") return fallback;
    try { return JSON.parse(v) as T; } catch (e) {
      logger.warn({ module: M }, `nečitelná data zápasu ${row.id}`, e);
      return fallback;
    }
  };
  const homeLineup = parse<{ starters: Array<{ id: string; squadNumber?: number | null }>; subs: Array<{ id: string; squadNumber?: number | null }> } | null>(row.home_lineup_data, null);
  const awayLineup = parse<typeof homeLineup>(row.away_lineup_data, null);
  const ids = [homeLineup, awayLineup].flatMap((ld) => ld ? [...ld.starters, ...ld.subs].map((p) => p.id) : []).filter(Boolean);
  if (ids.length > 0) {
    const nums = await c.env.DB.prepare(`SELECT id, squad_number FROM players WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids).all<{ id: string; squad_number: number | null }>()
      .catch((e) => { logger.warn({ module: M }, "čísla dresů do detailu", e); return { results: [] as Array<{ id: string; squad_number: number | null }> }; });
    const byId = new Map(nums.results.map((p) => [p.id, p.squad_number]));
    for (const ld of [homeLineup, awayLineup]) {
      if (!ld) continue;
      for (const p of [...ld.starters, ...ld.subs]) { const n = byId.get(p.id); if (n != null) p.squadNumber = n; }
    }
  }

  const stage = row.stage as string;
  return c.json({
    ...row,
    isCup: false,
    isTournament: true,
    round: null,
    roundName: stage === "league" ? `${row.tournament_name}, ${row.day}. den` : `${row.tournament_name}, ${STAGE_NAME[stage] ?? stage}`,
    venue: row.venue_id ? { id: row.venue_id, name: row.venue_name, capacity: row.venue_capacity, isMain: row.venue_is_main === 1 } : null,
    home_badge: row.home_badge ?? "shield", away_badge: row.away_badge ?? "shield",
    home_secondary: row.home_secondary ?? "#FFFFFF", away_secondary: row.away_secondary ?? "#FFFFFF",
    events: parse(row.events, []),
    commentary: parse(row.commentary, []),
    player_ratings: parse(row.player_ratings, {}),
    home_lineup_data: homeLineup,
    away_lineup_data: awayLineup,
    absences: parse(row.absences, []),
    isLocalDerby: false,
  });
});

export default tournamentRouter;
