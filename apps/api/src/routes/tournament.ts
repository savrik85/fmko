/**
 * Turnaj P-Mobile — každoroční turnaj přihlášených lidských klubů na konci sezóny.
 * Etapa 1: ročník a přihlášky (přihlásit / odhlásit do uzávěrky, seznam přihlášených)
 * a pozvánka od sponzora všem klubům (admin).
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireAdmin, requireTeamOwnership } from "../auth/middleware";
import { sendSystemSMS } from "../messaging/system-sms";
import { sendWebPushToTeam, getNotificationPreferences } from "../community/web-push";
import { logger } from "../lib/logger";

const M = "tournament";

const tournamentRouter = new Hono<{ Bindings: Bindings }>();

tournamentRouter.use("/teams/:teamId/tournament/*", requireTeamOwnership);
tournamentRouter.use("/admin/tournament/*", requireAdmin);

// SMS se tlačítkem „Otevřít turnaj" v telefonu.
const SMS_META = { type: "tournament" };

interface TournamentRow {
  id: string;
  edition: number;
  name: string;
  sponsor: string;
  city: string;
  city_locative: string | null;
  venue_name: string;
  status: string;
  registration_deadline: string;
  starts_on: string | null;
  point_reward: number;
  prize_quarterfinal: number;
  prize_semifinal: number;
  prize_finalist: number;
  prize_winner: number;
  league_matches: number | null;
  invited_at: string | null;
}

interface TeamRow {
  id: string;
  user_id: string | null;
  team_type: string | null;
}

/** Aktuální ročník = nejvyšší číslo ročníku (po skončení zůstává vidět výsledek). */
async function loadCurrentTournament(db: D1Database): Promise<TournamentRow | null> {
  return db.prepare("SELECT * FROM tournaments ORDER BY edition DESC LIMIT 1").first<TournamentRow>();
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
    `Dobrý den, tady ${t.sponsor}! Zveme váš klub na ${t.edition}. ročník ${nameGenitive(t.name)}. ` +
    `Hraje se ${where}${when}, každý den, 7 až 12 dní. ` +
    `Za každý získaný bod vyplácíme ${kc(t.point_reward)}, vítěz bere ${kc(t.prize_winner)} a trofej. ` +
    `Všechny náklady hradíme my. Přihlásit se můžete ${untilDeadline(t.registration_deadline)} na stránce Turnaj.`
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
    },
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

export default tournamentRouter;
