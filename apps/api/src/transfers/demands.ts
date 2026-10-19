/**
 * Poptávky na přestupech (2026-10-19).
 *
 * Manažer napíše, koho hledá (post, věk, kam ho chce, strop ceny), ostatní manažeři mu
 * nabídnou svého hráče a poptávající pak pošle běžnou nabídku z profilu hráče.
 * Poptávky dávají i kluby mimo hru: nabídnutého hráče posoudí hned, a když stačí,
 * pošlou na něj nabídku jako ostatní CPU kluby (`virtual_ai`).
 */

import { marketValue } from "@okresni-masina/shared";
import type { Rng } from "../generators/rng";
import { logger } from "../lib/logger";
import { brokenCzech } from "../messaging/foreign-speech";
import { sendSystemSMS } from "../messaging/system-sms";
import { offerReplyDeadline } from "./offer-deadline";
import { resolveClubTeamId } from "./offer-club-scope";

export type DemandPosition = "GK" | "DEF" | "MID" | "FWD";
export type DemandRole = "starter" | "squad" | "prospect";

const POSITIONS: DemandPosition[] = ["GK", "DEF", "MID", "FWD"];
const ROLES: DemandRole[] = ["starter", "squad", "prospect"];

export const DEMAND_ROLE_LABELS: Record<DemandRole, string> = {
  starter: "do základu",
  squad: "do kádru",
  prospect: "mladý talent",
};

/** Post ve 4. pádě: „hledá záložníka“. */
const POSITION_ACCUSATIVE: Record<DemandPosition, string> = {
  GK: "brankáře", DEF: "obránce", MID: "záložníka", FWD: "útočníka",
};

export const MAX_ACTIVE_DEMANDS = 3;
export const DEMAND_DAYS = 14;
export const MAX_PITCHES_PER_DEMAND = 2;
export const NOTE_MAX = 140;
const AGE_LOW = 15;
const AGE_HIGH = 40;
const PRICE_HIGH = 5_000_000;

/** Kolik poptávek klubů mimo hru visí v okrese najednou a jak často přibude nová. */
export const CLUB_DEMANDS_PER_DISTRICT = 3;
const CLUB_DEMAND_CHANCE = 0.4;
/** Část poptávek u hranice dávají bavorské kluby, stejně jako u CPU nabídek. */
const GERMAN_DEMAND_SHARE = 0.35;
/** Bavorský klub nabídne víc, stejně jako u CPU nabídek (o 30–50 %). */
const ABROAD_PRICE_MUL = 1.6;
const HOME_PRICE_MUL = 1.2;
const SMS_ROLE = "Sportovní ředitel";

export interface DemandInput {
  position: DemandPosition;
  ageMin: number;
  ageMax: number;
  role: DemandRole;
  maxPrice: number | null;
  note: string | null;
}

interface ClubData {
  name: string;
  city: string;
  district: string;
  rating: number;
  country?: string;
}

interface DemandRow {
  id: string;
  team_id: string | null;
  club_data: string | null;
  district: string | null;
  league_id: string | null;
  position: DemandPosition;
  age_min: number;
  age_max: number;
  role: DemandRole;
  max_price: number | null;
  min_rating: number | null;
  note: string | null;
  status: string;
  expires_at: string;
  created_at: string;
}

/** Ověří a uklidí vstup z formuláře. */
export function parseDemandInput(body: unknown): { ok: true; value: DemandInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const position = b.position as DemandPosition;
  if (!POSITIONS.includes(position)) return { ok: false, error: "Vyber post." };
  const role = b.role as DemandRole;
  if (!ROLES.includes(role)) return { ok: false, error: "Vyber, kam hráče chceš." };
  const ageMin = Math.round(Number(b.ageMin));
  const ageMax = Math.round(Number(b.ageMax));
  if (!Number.isFinite(ageMin) || !Number.isFinite(ageMax) || ageMin < AGE_LOW || ageMax > AGE_HIGH || ageMin > ageMax) {
    return { ok: false, error: `Věk musí být od ${AGE_LOW} do ${AGE_HIGH} let a „od“ nesmí být víc než „do“.` };
  }
  let maxPrice: number | null = null;
  if (b.maxPrice !== null && b.maxPrice !== undefined && b.maxPrice !== "") {
    maxPrice = Math.round(Number(b.maxPrice));
    if (!Number.isFinite(maxPrice) || maxPrice <= 0 || maxPrice > PRICE_HIGH) return { ok: false, error: "Strop ceny nedává smysl." };
  }
  const rawNote = typeof b.note === "string" ? b.note.trim().replace(/\s+/g, " ") : "";
  if (rawNote.length > NOTE_MAX) return { ok: false, error: `Poznámka může mít nejvýš ${NOTE_MAX} znaků.` };
  return { ok: true, value: { position, ageMin, ageMax, role, maxPrice, note: rawNote || null } };
}

/** „záložníka do základu (18 až 25 let)“, „mladého brankáře (do 20 let)“ — do SMS a do textů poptávky. */
export function demandSummary(d: { position: DemandPosition; ageMin: number; ageMax: number; role: DemandRole }): string {
  const age = d.ageMin <= 16 ? `do ${d.ageMax} let` : `${d.ageMin} až ${d.ageMax} let`;
  const who = POSITION_ACCUSATIVE[d.position];
  return d.role === "prospect" ? `mladého ${who} (${age})` : `${who} ${DEMAND_ROLE_LABELS[d.role]} (${age})`;
}

/** Okres U21 soutěže je „Prachatice U21“; poptávky klubů mimo hru visí v okrese áčka. */
function baseDistrict(district: string | null | undefined): string | null {
  return district ? district.replace(/ U21$/, "") : null;
}

const nowIso = () => new Date().toISOString();

function parseClub(raw: string | null): ClubData | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as ClubData; } catch (e) {
    logger.warn({ module: "demands" }, "parse club_data", e);
    return null;
  }
}

interface MyTeam {
  clubTeamId: string;
  userId: string | null;
  name: string;
  leagueId: string | null;
  district: string | null;
  leagueName: string | null;
}

async function loadMyTeam(db: D1Database, teamId: string): Promise<MyTeam | null> {
  const clubTeamId = (await resolveClubTeamId(db, teamId)) ?? teamId;
  const row = await db.prepare(
    "SELECT t.user_id, t.name, t.league_id, l.district, l.name AS league_name FROM teams t LEFT JOIN leagues l ON l.id = t.league_id WHERE t.id = ?",
  ).bind(clubTeamId).first<{ user_id: string | null; name: string; league_id: string | null; district: string | null; league_name: string | null }>();
  if (!row) return null;
  return { clubTeamId, userId: row.user_id, name: row.name, leagueId: row.league_id, district: baseDistrict(row.district), leagueName: row.league_name };
}

function demandView(d: DemandRow) {
  return {
    id: d.id,
    position: d.position,
    ageMin: d.age_min,
    ageMax: d.age_max,
    role: d.role,
    roleLabel: DEMAND_ROLE_LABELS[d.role],
    summary: demandSummary({ position: d.position, ageMin: d.age_min, ageMax: d.age_max, role: d.role }),
    maxPrice: d.max_price,
    note: d.note,
    expiresAt: d.expires_at,
    createdAt: d.created_at,
  };
}

/** Všechno pro záložku Poptávky: moje, manažerů, klubů mimo hru a koho můžu nabídnout. */
export async function listDemands(db: D1Database, teamId: string) {
  const me = await loadMyTeam(db, teamId);
  if (!me) return null;
  const now = nowIso();

  const [mineRes, managersRes, clubsRes, pitchableRes] = await Promise.all([
    db.prepare("SELECT * FROM transfer_demands WHERE team_id = ? AND status = 'active' AND expires_at > ? ORDER BY created_at DESC")
      .bind(me.clubTeamId, now).all<DemandRow>(),
    // Poptávky manažerů ze všech okresů, kromě vlastních a týmů téhož majitele.
    db.prepare(
      `SELECT d.*, t.name AS team_name, l.district AS league_district, l.name AS league_name
       FROM transfer_demands d JOIN teams t ON t.id = d.team_id LEFT JOIN leagues l ON l.id = d.league_id
       WHERE d.team_id IS NOT NULL AND d.status = 'active' AND d.expires_at > ? AND d.team_id != ?
         AND (t.user_id IS NULL OR t.user_id != ?)
       ORDER BY CASE WHEN d.league_id = ? THEN 0 ELSE 1 END, d.created_at DESC LIMIT 60`,
    ).bind(now, me.clubTeamId, me.userId ?? "", me.leagueId ?? "").all<DemandRow & { team_name: string; league_district: string | null; league_name: string | null }>(),
    // Kluby mimo hru z okresu. Obsazená poptávka zůstane vidět tomu, komu klub poslal nabídku.
    db.prepare(
      `SELECT * FROM transfer_demands WHERE team_id IS NULL AND expires_at > ? AND district = ?
         AND (status = 'active' OR (status = 'filled' AND id IN (SELECT demand_id FROM transfer_demand_pitches WHERE team_id = ? AND status = 'accepted')))
       ORDER BY created_at DESC`,
    ).bind(now, me.district ?? "", me.clubTeamId).all<DemandRow>(),
    db.prepare(
      `SELECT id, first_name, last_name, age, position FROM players
       WHERE (team_id = ? OR team_id IN (SELECT id FROM teams WHERE parent_team_id = ?))
         AND (status IS NULL OR status = 'active') AND loan_from_team_id IS NULL AND is_celebrity = 0
       ORDER BY position, age`,
    ).bind(me.clubTeamId, me.clubTeamId).all<{ id: string; first_name: string; last_name: string; age: number; position: DemandPosition }>(),
  ]);

  const mine = mineRes.results;
  const visibleIds = [...managersRes.results, ...clubsRes.results].map((d) => d.id);

  // Kdo mi k mým poptávkám koho nabídl.
  const incoming = new Map<string, Array<{ playerId: string; playerName: string; age: number; position: string; teamId: string; teamName: string; createdAt: string }>>();
  if (mine.length > 0) {
    const rows = await db.prepare(
      `SELECT dp.demand_id, dp.player_id, dp.team_id, dp.created_at, p.first_name, p.last_name, p.age, p.position, t.name AS team_name
       FROM transfer_demand_pitches dp JOIN players p ON p.id = dp.player_id JOIN teams t ON t.id = dp.team_id
       WHERE dp.demand_id IN (${mine.map(() => "?").join(",")}) ORDER BY dp.created_at DESC`,
    ).bind(...mine.map((d) => d.id)).all<{ demand_id: string; player_id: string; team_id: string; created_at: string; first_name: string; last_name: string; age: number; position: string; team_name: string }>();
    for (const r of rows.results) {
      const list = incoming.get(r.demand_id) ?? [];
      list.push({ playerId: r.player_id, playerName: `${r.first_name} ${r.last_name}`, age: r.age, position: r.position, teamId: r.team_id, teamName: r.team_name, createdAt: r.created_at });
      incoming.set(r.demand_id, list);
    }
  }

  // Koho jsem já nabídl k cizím poptávkám a jak to dopadlo.
  const outgoing = new Map<string, Array<{ playerId: string; playerName: string; status: string; reply: string | null; offerId: string | null }>>();
  if (visibleIds.length > 0) {
    const rows = await db.prepare(
      `SELECT dp.demand_id, dp.player_id, dp.status, dp.reply, dp.offer_id, p.first_name, p.last_name
       FROM transfer_demand_pitches dp JOIN players p ON p.id = dp.player_id
       WHERE dp.team_id = ? AND dp.demand_id IN (${visibleIds.map(() => "?").join(",")}) ORDER BY dp.created_at`,
    ).bind(me.clubTeamId, ...visibleIds).all<{ demand_id: string; player_id: string; status: string; reply: string | null; offer_id: string | null; first_name: string; last_name: string }>();
    for (const r of rows.results) {
      const list = outgoing.get(r.demand_id) ?? [];
      list.push({ playerId: r.player_id, playerName: `${r.first_name} ${r.last_name}`, status: r.status, reply: r.reply, offerId: r.offer_id });
      outgoing.set(r.demand_id, list);
    }
  }

  return {
    mine: mine.map((d) => ({ ...demandView(d), pitches: incoming.get(d.id) ?? [] })),
    managers: managersRes.results.map((d) => ({
      ...demandView(d),
      teamId: d.team_id as string,
      teamName: d.team_name,
      // Štítek „odkud“ jako na trhu: okres, u jiné soutěže téhož okresu název soutěže.
      origin: d.league_id === me.leagueId ? null
        : baseDistrict(d.league_district) !== me.district ? baseDistrict(d.league_district)
        : d.league_name,
      myPitches: outgoing.get(d.id) ?? [],
    })),
    clubs: clubsRes.results.map((d) => {
      const club = parseClub(d.club_data);
      return {
        ...demandView(d),
        clubName: club?.name ?? "Klub mimo hru",
        clubCity: club?.city ?? null,
        abroad: !!club?.country && club.country !== "CZ",
        filled: d.status === "filled",
        myPitches: outgoing.get(d.id) ?? [],
      };
    }),
    pitchable: pitchableRes.results.map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, age: p.age, position: p.position })),
    limits: { maxActive: MAX_ACTIVE_DEMANDS, pitchesPerDemand: MAX_PITCHES_PER_DEMAND, noteMax: NOTE_MAX, days: DEMAND_DAYS },
  };
}

export async function createDemand(db: D1Database, teamId: string, input: DemandInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const me = await loadMyTeam(db, teamId);
  if (!me) return { ok: false, error: "Tým nenalezen." };
  const active = await db.prepare("SELECT COUNT(*) AS n FROM transfer_demands WHERE team_id = ? AND status = 'active' AND expires_at > ?")
    .bind(me.clubTeamId, nowIso()).first<{ n: number }>();
  if ((active?.n ?? 0) >= MAX_ACTIVE_DEMANDS) return { ok: false, error: `Najednou můžeš mít nejvýš ${MAX_ACTIVE_DEMANDS} poptávky. Nějakou stáhni.` };
  const id = crypto.randomUUID();
  const now = new Date();
  await db.prepare(
    `INSERT INTO transfer_demands (id, team_id, league_id, position, age_min, age_max, role, max_price, note, status, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).bind(id, me.clubTeamId, me.leagueId, input.position, input.ageMin, input.ageMax, input.role, input.maxPrice, input.note,
    new Date(now.getTime() + DEMAND_DAYS * 86_400_000).toISOString(), now.toISOString()).run();
  return { ok: true, id };
}

export async function withdrawDemand(db: D1Database, teamId: string, demandId: string): Promise<boolean> {
  const clubTeamId = (await resolveClubTeamId(db, teamId)) ?? teamId;
  const res = await db.prepare("UPDATE transfer_demands SET status = 'withdrawn' WHERE id = ? AND team_id = ? AND status = 'active'")
    .bind(demandId, clubTeamId).run();
  return (res.meta?.changes ?? 0) > 0;
}

export type PitchResult =
  | { ok: true; status: "pitched" | "accepted" | "declined"; message: string; offerId?: string }
  | { ok: false; error: string };

const CLUB_ACCEPT_REPLIES = [
  "Tohle je přesně hráč, kterého hledáme. Nabídku jsme vám poslali.",
  "Díky za tip, {player} se nám líbí. Nabídka je u vás.",
];
const CLUB_DECLINE_REPLIES = [
  "Díky, ale hledáme někoho, kdo by u nás hrál hned. {player} by se do sestavy nedostal.",
  "Za nabídku díky, ale na tohle místo potřebujeme silnějšího hráče.",
];
const CLUB_DECLINE_PROSPECT = [
  "Díky, ale {player} nás zatím nepřesvědčil. Hledáme talent, který vyčnívá.",
  "Za tip díky, ale hledáme kluka, který už teď převyšuje vrstevníky.",
];

/** Nabídne hráče k poptávce. Klub mimo hru rozhodne hned, manažerovi přijde zpráva. */
export async function pitchPlayer(db: D1Database, teamId: string, demandId: string, playerId: string, rng: Rng): Promise<PitchResult> {
  const me = await loadMyTeam(db, teamId);
  if (!me) return { ok: false, error: "Tým nenalezen." };
  const demand = await db.prepare("SELECT * FROM transfer_demands WHERE id = ? AND status = 'active' AND expires_at > ?")
    .bind(demandId, nowIso()).first<DemandRow>();
  if (!demand) return { ok: false, error: "Poptávka už neplatí." };

  if (demand.team_id) {
    if (demand.team_id === me.clubTeamId) return { ok: false, error: "Vlastní poptávce hráče nenabídneš." };
    const owner = await db.prepare("SELECT user_id FROM teams WHERE id = ?").bind(demand.team_id).first<{ user_id: string | null }>();
    if (owner?.user_id && owner.user_id === me.userId) return { ok: false, error: "Mezi vlastními týmy se hráči přes poptávky nenabízejí." };
  } else if (demand.district !== me.district) {
    return { ok: false, error: "Tahle poptávka je z jiného okresu." };
  }

  const player = await db.prepare(
    `SELECT id, first_name, last_name, nationality, age, position, overall_rating, team_id, loan_from_team_id, status, is_celebrity FROM players
     WHERE id = ? AND (team_id = ? OR team_id IN (SELECT id FROM teams WHERE parent_team_id = ?))`,
  ).bind(playerId, me.clubTeamId, me.clubTeamId).first<{
    id: string; first_name: string; last_name: string; nationality: string | null; age: number; position: string; overall_rating: number;
    team_id: string; loan_from_team_id: string | null; status: string | null; is_celebrity: number;
  }>();
  if (!player || (player.status && player.status !== "active") || player.loan_from_team_id || player.is_celebrity) {
    return { ok: false, error: "Tohohle hráče nabídnout nemůžeš." };
  }
  if (player.position !== demand.position) return { ok: false, error: "Hráč nehraje na poptávaném postu." };
  if (player.age < demand.age_min || player.age > demand.age_max) return { ok: false, error: "Hráč nesedí věkem." };

  const mine = await db.prepare("SELECT player_id FROM transfer_demand_pitches WHERE demand_id = ? AND team_id = ?")
    .bind(demandId, me.clubTeamId).all<{ player_id: string }>();
  if (mine.results.some((r) => r.player_id === playerId)) return { ok: false, error: "Tohohle hráče už jsi nabídl." };
  if (mine.results.length >= MAX_PITCHES_PER_DEMAND) return { ok: false, error: `K jedné poptávce můžeš nabídnout nejvýš ${MAX_PITCHES_PER_DEMAND} hráče.` };

  const playerName = `${player.first_name} ${player.last_name}`;
  const pitchId = crypto.randomUUID();
  const summary = demandSummary({ position: demand.position, ageMin: demand.age_min, ageMax: demand.age_max, role: demand.role });

  if (demand.team_id) {
    await db.prepare("INSERT INTO transfer_demand_pitches (id, demand_id, team_id, player_id, status, created_at) VALUES (?, ?, ?, ?, 'pitched', ?)")
      .bind(pitchId, demandId, me.clubTeamId, playerId, nowIso()).run();
    await sendSystemSMS(db, demand.team_id, SMS_ROLE,
      `${me.name} ti k poptávce na ${summary} nabízí hráče ${playerName} (${player.age} let). Když o něj stojíš, pošli nabídku z jeho profilu.`,
      { type: "demand", demandId, playerId });
    return { ok: true, status: "pitched", message: "Nabídnuto. Manažer dostal zprávu." };
  }

  // Klub mimo hru: stačí hráč na to, co hledá?
  const club = parseClub(demand.club_data);
  const abroad = !!club?.country && club.country !== "CZ";
  const speak = (text: string) => (abroad ? brokenCzech(text, club?.country ?? "DE", `${demandId}|${playerId}`) : text);
  const good = player.overall_rating >= (demand.min_rating ?? 0);

  if (!good) {
    const pool = demand.role === "prospect" ? CLUB_DECLINE_PROSPECT : CLUB_DECLINE_REPLIES;
    const reply = speak(rng.pick(pool).replace("{player}", playerName));
    await db.prepare("INSERT INTO transfer_demand_pitches (id, demand_id, team_id, player_id, status, reply, created_at) VALUES (?, ?, ?, ?, 'declined', ?, ?)")
      .bind(pitchId, demandId, me.clubTeamId, playerId, reply, nowIso()).run();
    return { ok: true, status: "declined", message: reply };
  }

  const { calcOfferPrice, germanClubLetter } = await import("./virtual-teams");
  const marketPrice = calcOfferPrice(player.overall_rating, player.age, player.position, rng, abroad);
  const price = demand.max_price ? Math.min(demand.max_price, marketPrice) : marketPrice;
  const clubName = club?.name ?? "Klub mimo hru";
  const { computeInterestForOffer } = await import("./player-interest");
  const interest = await computeInterestForOffer(db, playerId, {
    fromTeamId: "virtual_ai", offerAmount: price, virtualRating: club?.rating, virtualCountry: club?.country,
  }).catch((e) => { logger.warn({ module: "demands" }, "zájem hráče o klub z poptávky", e); return null; });

  const offerId = crypto.randomUUID();
  const letter = abroad
    ? germanClubLetter(rng, clubName, playerName, price)
    : `Děkujeme za tip na hráče ${playerName}. Je to přesně to, co hledáme, nabízíme ${price.toLocaleString("cs")} Kč.`;
  const reply = speak(rng.pick(CLUB_ACCEPT_REPLIES).replace("{player}", playerName));
  await db.batch([
    db.prepare(
      `INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, offer_type, status, message, virtual_team_data, player_interest, expires_at, created_at)
       VALUES (?, ?, 'virtual_ai', ?, ?, 'transfer', 'pending', ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    ).bind(offerId, playerId, player.team_id, price, letter,
      JSON.stringify({ name: clubName, city: club?.city ?? null, district: club?.district ?? null, rating: club?.rating ?? null, ...(abroad ? { country: club?.country } : {}), demandId }),
      interest?.level ?? null, offerReplyDeadline()),
    db.prepare("INSERT INTO transfer_demand_pitches (id, demand_id, team_id, player_id, status, reply, offer_id, created_at) VALUES (?, ?, ?, ?, 'accepted', ?, ?, ?)")
      .bind(pitchId, demandId, me.clubTeamId, playerId, reply, offerId, nowIso()),
    db.prepare("UPDATE transfer_demands SET status = 'filled' WHERE id = ?").bind(demandId),
  ]);

  // Hráč, kterému trenér slíbil prodej, mu to připomene.
  const { remindTransferPromise } = await import("./promises");
  await remindTransferPromise(db, playerId, clubName, offerId);

  logger.info({ module: "demands" }, `club demand filled: ${clubName} → ${playerName} for ${price} Kč`);
  return { ok: true, status: "accepted", message: reply, offerId };
}

// ═══ Poptávky klubů mimo hru ═══

const CLUB_NOTES: Record<DemandRole, string[]> = {
  starter: [
    "Na jaře chceme hrát nahoře, potřebujeme posilu do sestavy.",
    "Zranil se nám klíčový hráč, hledáme náhradu, která hned nastoupí.",
    "Chceme postoupit, a na tomhle postu nám to chybí.",
  ],
  squad: [
    "Kádr je úzký, hledáme hráče, na kterého je spoleh.",
    "Potřebujeme rozšířit kádr, ať máme koho střídat.",
  ],
  prospect: [
    "Stavíme mladý tým, hledáme kluka s chutí se zlepšovat.",
    "Hledáme talent, kterého u nás vychováme.",
  ],
};

/** Percentil hodnocení (0–1) v seřazeném seznamu. */
function percentile(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

/**
 * Jak dobrého hráče klub chce: podle kádrů lidských týmů v okrese, ne pevné číslo
 * (rating není stovková škála a brankáři mají nafouknutý). Do základu ~ 70. percentil
 * postu, do kádru ~ 40. percentil, talent ~ 75. percentil hráčů do 20 let.
 */
export async function demandRatingThreshold(db: D1Database, district: string, position: DemandPosition, role: DemandRole, clubRating: number): Promise<number> {
  const rows = await db.prepare(
    `SELECT p.overall_rating AS r, p.age, t.parent_team_id FROM players p JOIN teams t ON t.id = p.team_id JOIN leagues l ON l.id = t.league_id
     WHERE (l.district = ? OR l.district = ?) AND t.user_id IS NOT NULL AND t.user_id != 'ai' AND p.position = ?
       AND (p.status IS NULL OR p.status = 'active')`,
  ).bind(district, `${district} U21`, position).all<{ r: number; age: number; parent_team_id: string | null }>()
    .catch((e) => { logger.warn({ module: "demands" }, "hodnocení kádrů okresu", e); return { results: [] as Array<{ r: number; age: number; parent_team_id: string | null }> }; });
  const pool = role === "prospect"
    ? rows.results.filter((x) => x.age <= 20)
    : rows.results.filter((x) => !x.parent_team_id);
  const sorted = pool.map((x) => x.r).sort((a, b) => a - b);
  if (sorted.length < 5) return role === "starter" ? clubRating : role === "squad" ? clubRating - 5 : clubRating - 12;
  return percentile(sorted, role === "starter" ? 0.7 : role === "squad" ? 0.4 : 0.75);
}

const ROLE_AGES: Record<DemandRole, (rng: Rng) => [number, number]> = {
  starter: (rng) => [rng.int(19, 22), rng.int(27, 31)],
  squad: (rng) => [rng.int(18, 21), rng.int(29, 33)],
  prospect: (rng) => [16, rng.int(19, 20)],
};

/** Denně v okrese možná přibude poptávka klubu mimo hru (nejvýš 3 najednou). */
export async function generateClubDemands(db: D1Database, district: string, rng: Rng, opts: { force?: boolean } = {}): Promise<number> {
  const now = nowIso();
  const active = await db.prepare("SELECT club_data FROM transfer_demands WHERE team_id IS NULL AND district = ? AND status = 'active' AND expires_at > ?")
    .bind(district, now).all<{ club_data: string | null }>();
  if (active.results.length >= CLUB_DEMANDS_PER_DISTRICT) return 0;
  if (!opts.force && rng.random() > CLUB_DEMAND_CHANCE) return 0;

  const { getVirtualTeamsForDistrict, germanClubsNear } = await import("./virtual-teams");
  const czech = await getVirtualTeamsForDistrict(db, district);
  // Bavorské kluby v dosahu: vzdálenost se měří od obce lidského týmu okresu.
  const anchor = await db.prepare(
    "SELECT t.id FROM teams t JOIN leagues l ON l.id = t.league_id WHERE l.district = ? AND t.user_id IS NOT NULL AND t.user_id != 'ai' AND t.parent_team_id IS NULL LIMIT 1",
  ).bind(district).first<{ id: string }>();
  const german = anchor ? await germanClubsNear(db, anchor.id) : [];
  const busy = new Set(active.results.map((r) => parseClub(r.club_data)?.name).filter(Boolean));
  const pick = (list: ClubData[]) => list.filter((c) => !busy.has(c.name));
  const pool = german.length > 0 && rng.random() < GERMAN_DEMAND_SHARE && pick(german).length > 0 ? pick(german) : pick(czech);
  if (pool.length === 0) return 0;
  const club = rng.pick(pool);

  const position = rng.weighted({ GK: 1, DEF: 8, MID: 8, FWD: 7 }) as DemandPosition;
  const role = rng.weighted({ starter: 4, squad: 3, prospect: 2 }) as DemandRole;
  const [ageMin, ageMax] = ROLE_AGES[role](rng);
  const minRating = (await demandRatingThreshold(db, district, position, role, club.rating)) + rng.int(-2, 2);
  const abroad = !!club.country && club.country !== "CZ";
  const priceAge = Math.round((ageMin + ageMax) / 2);
  const maxPrice = Math.max(1000, Math.round(marketValue(minRating + 4, priceAge, position) * (abroad ? ABROAD_PRICE_MUL : HOME_PRICE_MUL) / 1000) * 1000);
  const rawNote = rng.pick(CLUB_NOTES[role]);
  const note = abroad ? brokenCzech(rawNote, club.country ?? "DE", `${club.name}|${now}`) : rawNote;
  const days = rng.int(7, 10);

  await db.prepare(
    `INSERT INTO transfer_demands (id, team_id, club_data, district, position, age_min, age_max, role, max_price, min_rating, note, status, expires_at, created_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).bind(crypto.randomUUID(), JSON.stringify(club), district, position, ageMin, ageMax, role, maxPrice, minRating, note,
    new Date(Date.now() + days * 86_400_000).toISOString(), now).run();
  logger.info({ module: "demands" }, `club demand: ${club.name} (${district}) ${position} ${role} min=${minRating} cap=${maxPrice}`);
  return 1;
}
