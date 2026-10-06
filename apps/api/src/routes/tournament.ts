/**
 * Turnaj P-Mobile — každoroční turnaj přihlášených lidských klubů na konci sezóny.
 * Etapa 1: ročník a přihlášky (přihlásit / odhlásit do uzávěrky, seznam přihlášených).
 */

import { Hono } from "hono";
import type { Bindings } from "../index";
import { requireTeamOwnership } from "../auth/middleware";
import { sendSystemSMS } from "../messaging/system-sms";
import { logger } from "../lib/logger";

const M = "tournament";

const tournamentRouter = new Hono<{ Bindings: Bindings }>();

tournamentRouter.use("/teams/:teamId/tournament/*", requireTeamOwnership);

interface TournamentRow {
  id: string;
  edition: number;
  name: string;
  sponsor: string;
  city: string;
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

// Den v týdnu s předložkou (4. pád): „v pondělí", „ve středu".
const ON_WEEKDAY = ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"];

/** „ve 20:00" / „v 18:00" — „ve" před dvě, tři, čtyři, dvanáct a dvacet. */
function atTime(hour: number, minute: string): string {
  const ve = [2, 3, 4, 12, 20, 21, 22, 23].includes(hour);
  return `${ve ? "ve" : "v"} ${hour}:${minute}`;
}

/** „v pondělí 12. 10. ve 20:00" v pražském čase. */
function formatPragueDeadline(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return `${ON_WEEKDAY[weekdayIdx] ?? ""} ${get("day")}. ${get("month")}. ${atTime(Number(get("hour")), get("minute"))}`.trim();
}

/** „ve středu 14. 10." z data YYYY-MM-DD. */
function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${ON_WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
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
    await sendSystemSMS(db, teamId, tournament.sponsor, body)
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

export default tournamentRouter;
