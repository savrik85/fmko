/**
 * Odchody hráčů na konci sezóny — důchod (věk) + rodinné důvody.
 *
 * Garantovaně 2–3 odchody na tým (pokud to velikost kádru dovolí), hráči
 * odcházejí NADOBRO (nejdou na trh volných hráčů). Zbylým hráčům +1 rok.
 *
 * Retirement pravděpodobnost je ČISTĚ věkově řízená (scale-safe) — nezávisí
 * na nejednoznačné škále atributů discipline/morale v JSON. Pokud přirozených
 * důchodů nestačí na cílové 2–3, dorovnají se "rodinnými důvody" (nejstarší).
 *
 * Floor kádru je chráněn capem `min(3, active - MIN_SQUAD)`, takže kádr nikdy
 * neklesne pod hratelnou velikost.
 */

import { createRng } from "../generators/rng";
import { removePlayer } from "../transfers/remove-player";
import { maintainFreeAgentPool } from "../transfers/free-agent-pool";
import { developSquadAndManager, type DevResult } from "./season-development";
import { logger } from "../lib/logger";

/** Minimální velikost kádru, pod kterou odchody nikdy nesnižují. */
export const MIN_SQUAD = 14;

/** Důvody důchodu (věk / konec kariéry). */
const RETIREMENT_REASONS = [
  "Kolena už nedávají. Doktor říkal, že mám přestat.",
  "Po tom posledním zranění už to nejde.",
  "Radši budu trénovat mládež, než se trápit na hřišti.",
  "Už mě to nebaví, dávám přednost zahradě.",
  "Věk je věk. Je čas pověsit kopačky na hřebík.",
];

/** Rodinné / životní důvody (i pro mladší hráče). */
const FAMILY_REASONS = [
  "Manželka řekla dost. Buď fotbal, nebo ona.",
  "Stěhuju se pryč — dostal jsem práci v jiném kraji.",
  "Mám malou firmu, nemám čas. Ale přijdu fandit!",
  "Čekáme miminko, teď musí být rodina na prvním místě.",
  "Dojíždění mě zničilo, končím s aktivním fotbalem.",
];

export type DepartureKind = "retirement" | "family";

export interface DepartureInfo {
  playerId: string;
  name: string;
  age: number;
  position: string;
  overallRating: number;
  kind: DepartureKind;
  reason: string;
  wasCaptain: boolean;
}

export interface TeamDeparturesResult {
  teamId: string;
  departures: DepartureInfo[];
  agedCount: number;
  dev: DevResult;
}

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  age: number;
  position: string;
  overall_rating: number;
  life_context: string | null;
}

/** Deterministický 32-bit seed z řetězce (FNV-1a). */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Věkově řízená pravděpodobnost důchodu (scale-safe). */
function retirementProb(age: number, morale: number): number {
  let p = 0;
  if (age >= 45) p = 0.85;
  else if (age >= 42) p = 0.6;
  else if (age >= 40) p = 0.45;
  else if (age >= 38) p = 0.3;
  else if (age >= 36) p = 0.15;
  else if (age >= 34) p = 0.06;
  if (morale < 30) p *= 1.4;
  return p;
}

function moraleOf(lifeContext: string | null): number {
  if (!lifeContext) return 50;
  try {
    const lc = JSON.parse(lifeContext) as { morale?: number };
    return typeof lc.morale === "number" ? lc.morale : 50;
  } catch {
    return 50;
  }
}

/**
 * Zpracuje odchody jednoho týmu + zestárne zbytek kádru.
 * Idempotence řeší orchestrátor přes cursor (processedTeamIds).
 */
export async function processTeamDepartures(
  db: D1Database,
  leagueId: string,
  teamId: string,
  seasonNumber: number,
): Promise<TeamDeparturesResult> {
  const rng = createRng(hashSeed(`${teamId}:s${seasonNumber}:departures`));

  const captainRow = await db.prepare("SELECT captain_id FROM teams WHERE id = ?").bind(teamId)
    .first<{ captain_id: string | null }>().catch((e) => { logger.warn({ module: "season-departures" }, "load captain", e); return null; });
  const captainId = captainRow?.captain_id ?? null;

  const playersRes = await db.prepare(
    "SELECT id, first_name, last_name, nickname, age, position, overall_rating, life_context FROM players WHERE team_id = ? AND status = 'active'",
  ).bind(teamId).all().catch((e) => { logger.warn({ module: "season-departures" }, "load squad", e); return null; });
  if (!playersRes) return { teamId, departures: [], agedCount: 0, dev: { improved: [], declined: [], manager: null } };

  const players = playersRes.results as unknown as PlayerRow[];
  const activeCount = players.length;

  const cap = Math.min(3, Math.max(0, activeCount - MIN_SQUAD));
  if (cap <= 0) {
    // Příliš tenký kádr — žádné odchody, jen vývoj + zestárnutí.
    const dev = await developSquadAndManager(db, leagueId, teamId, seasonNumber);
    const aged = await bumpAges(db, teamId);
    return { teamId, departures: [], agedCount: aged, dev };
  }

  // Cílový počet 2–3 (nebo méně, když to cap nedovolí)
  const target = cap === 1 ? 1 : rng.int(2, cap);

  // Přirozené důchody (věkově)
  const natural = players
    .filter((p) => rng.random() < retirementProb(p.age, moraleOf(p.life_context)))
    .sort((a, b) => b.age - a.age);

  const chosen: Array<{ p: PlayerRow; kind: DepartureKind }> = [];
  for (const p of natural) {
    if (chosen.length >= target) break;
    chosen.push({ p, kind: "retirement" });
  }

  // Dorovnat rodinnými důvody (nejstarší z nevybraných) na cíl
  if (chosen.length < target) {
    const chosenIds = new Set(chosen.map((c) => c.p.id));
    const rest = players
      .filter((p) => !chosenIds.has(p.id))
      .sort((a, b) => b.age - a.age || rng.random() - 0.5);
    for (const p of rest) {
      if (chosen.length >= target) break;
      chosen.push({ p, kind: "family" });
    }
  }

  const departures: DepartureInfo[] = [];
  for (const { p, kind } of chosen) {
    const leaveType = kind === "retirement" ? "retired" : "quit";
    const removed = await removePlayer(db, p.id, leaveType, { toFreeAgent: false, teamId });
    if (!removed.ok) continue;
    const reason = kind === "retirement" ? rng.pick(RETIREMENT_REASONS) : rng.pick(FAMILY_REASONS);
    departures.push({
      playerId: p.id,
      name: `${p.first_name} ${p.last_name}`,
      age: p.age,
      position: p.position,
      overallRating: p.overall_rating,
      kind,
      reason,
      wasCaptain: p.id === captainId,
    });
  }

  // Vývoj kádru + trenéra (před zestárnutím — používá aktuální věk zbylých hráčů)
  const dev = await developSquadAndManager(db, leagueId, teamId, seasonNumber);

  // Zestárnout zbytek kádru
  const agedCount = await bumpAges(db, teamId);

  // Rozloučení s legendou — nejvýraznější odcházející hráč (kapitán / vysoký rating / vysoký věk)
  await maybeCreateLegendFarewell(db, leagueId, teamId, seasonNumber, departures, rng);

  return { teamId, departures, agedCount, dev };
}

async function bumpAges(db: D1Database, teamId: string): Promise<number> {
  const res = await db.prepare("UPDATE players SET age = age + 1 WHERE team_id = ? AND status = 'active'")
    .bind(teamId).run().catch((e) => { logger.warn({ module: "season-departures" }, "bump ages", e); return null; });
  return res?.meta?.changes ?? 0;
}

async function maybeCreateLegendFarewell(
  db: D1Database,
  leagueId: string,
  teamId: string,
  seasonNumber: number,
  departures: DepartureInfo[],
  rng: ReturnType<typeof createRng>,
): Promise<void> {
  if (departures.length === 0) return;
  // Vyber nejvýraznějšího: kapitán > nejvyšší rating > nejstarší
  const legend = [...departures].sort((a, b) => {
    if (a.wasCaptain !== b.wasCaptain) return a.wasCaptain ? -1 : 1;
    if (b.overallRating !== a.overallRating) return b.overallRating - a.overallRating;
    return b.age - a.age;
  })[0];

  const worthy = legend.wasCaptain || legend.overallRating >= 60 || legend.age >= 38;
  if (!worthy) return;

  const teamRow = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId)
    .first<{ name: string }>().catch((e) => { logger.warn({ module: "season-departures" }, "load team name", e); return null; });
  const teamName = teamRow?.name ?? "klub";

  const role = legend.wasCaptain ? "kapitán" : "opora";
  const headline = `Sbohem, legendo: ${legend.name} končí`;
  const intros = [
    `${teamName} se po ${seasonNumber}. sezóně loučí se svou oporou.`,
    `Kabina ${teamName} ztichla — odchází ${role}, který tým držel pohromadě.`,
    `Na hřišti ${teamName} už ho neuvidíme. ${legend.name} pověsil kopačky na hřebík.`,
  ];
  const body = [
    rng.pick(intros),
    `${legend.name} (${legend.age}, ${legend.position}) odehrál svou poslední sezónu jako ${role} týmu. „${legend.reason}"`,
    legend.wasCaptain
      ? `Jako kapitán byl srdcem kabiny. Spoluhráči mu připravili rozlučku v hospodě a celá vesnice mu děkuje za odvedené roky.`
      : `Roky dřel na tréninku i v zápasech. Vesnice mu děkuje a fanoušci slibují, že na něj nezapomenou.`,
    `Hodně štěstí v dalším životě, ${legend.name.split(" ")[0]}!`,
  ].join("\n\n");

  await db.prepare(
    "INSERT INTO news (id, league_id, team_id, type, headline, body, game_week, created_at) VALUES (?, ?, ?, 'legend_farewell', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
  ).bind(crypto.randomUUID(), leagueId, teamId, headline, body, seasonNumber * 100).run()
    .catch((e) => logger.warn({ module: "season-departures" }, "insert legend farewell", e));
}

/**
 * Refresh poolu volných hráčů (proven path) — "prostor pro nové hráče".
 * Voláno jednou ve fázi replenish (ne per tým).
 */
export async function refreshFreeAgents(db: D1Database, rng: ReturnType<typeof createRng>, gameDate: Date): Promise<number> {
  return maintainFreeAgentPool(db, rng, gameDate).catch((e) => {
    logger.warn({ module: "season-departures" }, "refresh free agents", e);
    return 0;
  });
}
