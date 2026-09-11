/**
 * Co se stalo na tribunách — vyhodnocení jednoho domácího zápasu.
 *
 * Idempotence: nárok se bere atomickým `UPDATE matches SET fan_incidents = '[]'
 * WHERE id = ? AND fan_incidents IS NULL`. Když `changes === 0`, tenhle zápas už
 * někdo vyhodnotil a druhý běh nesmí strhnout pokutu podruhé. Stejný princip jako
 * `claimTeamDay` v `season/team-day.ts`. Selže-li worker mezi nárokem a zápisem,
 * o výtržnosti přijdeme — což je správný směr selhání, opak by bral peníze dvakrát.
 *
 * Losování je navíc deterministické (seed z `matchId` a druhu party), takže i kdyby
 * se nárok obešel, vyjdou tytéž incidenty s týmiž ID.
 */

import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { logger } from "../lib/logger";
import { calculateFacilityEffects } from "../stadium/stadium-generator";
import { DERBY_HEAT_THRESHOLD } from "../community/manager-relations";
import {
  FAN_GROUPS, FAN_INCIDENTS, FAN_SKALY,
  incidentChance, incidentWeights, rollSeverity, incidentOutcome,
  type FanGroupKind, type FanIncidentKind, type IncidentOutcome, type FanSector,
} from "../engine/fan-groups";
import { ensureFanGroups, fanLeaderFullName, type FanGroupRow, type FanLeaderRow } from "./fan-group-generator";
import { syncFanGroups, odbytZapasUzavreniSektoru } from "./fan-group-state";

const M = "fan-incidents";

/** Nejvýš tolik výtržností za zápas — dva průšvihy jsou dost, tři už je fraška. */
const MAX_INCIDENTU_ZA_ZAPAS = 2;

export interface ResolveOpts {
  matchId: string;
  /** Odkud se bere nárok a kam se zapisuje snapshot. Pohár má vlastní tabulku. */
  table?: "matches" | "cup_matches";
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  attendance: number;
  /** Vzájemný heat manažerů před zápasem — nad prahem je to derby. */
  preMatchHeat: number;
  leagueId: string | null;
  seasonNumber: number;
  gameDate: string;
  /** Rozhodčí měl v zápase spornou situaci nebo dal červenou — přilévá olej. */
  sporneVerdikty: boolean;
  refereeId: string | null;
}

export interface ResolveResult {
  skipped: boolean;
  incidents: number;
  totalFine: number;
}

/** Řádek zapsaný do `matches.fan_incidents` a čtený detailem zápasu. */
interface IncidentSnapshot {
  id: string;
  kind: FanIncidentKind;
  label: string;
  severity: number;
  minute: number;
  groupName: string;
  text: string;
  fine: number;
  closedMatches: number;
  fansLost: number;
}

export async function resolveMatchIncidents(db: D1Database, opts: ResolveOpts): Promise<ResolveResult> {
  const prazdny: ResolveResult = { skipped: true, incidents: 0, totalFine: 0 };

  // ── Nárok na vyhodnocení ──
  // Název tabulky je z uzavřené množiny, ne z uživatelského vstupu — do SQL
  // se interpoluje bezpečně a dvě skoro stejné kopie funkce tím odpadají.
  const tabulka = opts.table === "cup_matches" ? "cup_matches" : "matches";
  const claim = await db
    .prepare(`UPDATE ${tabulka} SET fan_incidents = '[]' WHERE id = ? AND fan_incidents IS NULL`)
    .bind(opts.matchId)
    .run()
    .catch((e) => { logger.warn({ module: M }, `nárok na zápas ${opts.matchId}`, e); return null; });
  if (!claim || (claim.meta?.changes ?? 0) === 0) return prazdny;

  const groups = await syncFanGroups(db, opts.homeTeamId, { drift: false });
  if (groups.length === 0) return { skipped: false, incidents: 0, totalFine: 0 };

  // Uzavření sektoru se odbývá po zápase — i po tom, na kterém se nic nestalo.
  await odbytZapasUzavreniSektoru(db, opts.homeTeamId);

  const ctx = await nactiKontext(db, opts);
  const leaders = await nactiVudce(db, opts.homeTeamId);

  // ── Losování, jedna výtržnost na partu ──
  const kandidati: { group: FanGroupRow; kind: FanIncidentKind; severity: number; minute: number }[] = [];

  for (const g of groups) {
    const def = FAN_GROUPS[g.kind as FanGroupKind];
    if (!def) continue;
    const leader = g.leader_id ? leaders.get(g.leader_id) : undefined;
    const rng = createRng(seedFromString(`fanincident|${opts.matchId}|${g.kind}`));

    const sance = incidentChance({
      group: {
        kind: g.kind as FanGroupKind,
        aggression: g.aggression,
        heat: g.heat,
        mood: g.mood,
        size: g.size,
        // Sektor byl zavřený PŘED odečtem výše — kdo se dovnitř nedostal, nic neprovedl.
        sectorClosed: g.closed_matches > 0,
      },
      sector: (g.sector as FanSector) ?? "hlavni",
      leaderRadikalnost: leader?.radikalnost ?? 50,
      derby: opts.preMatchHeat >= DERBY_HEAT_THRESHOLD,
      homeLosing: opts.homeScore < opts.awayScore,
      beerPerAttendee: ctx.pivoNaHlavu * (g.spending / 100),
      awayUltrasSize: ctx.hostujiciKotel,
      securityRiskReduction: ctx.fx.securityRiskReduction,
      sectorSeparation: ctx.fx.sectorSeparation,
      tifo: false,
    });

    const zvyseneRiziko = opts.sporneVerdikty ? sance * 1.35 : sance;
    if (rng.random() >= zvyseneRiziko) continue;

    const vahy = incidentWeights(g.kind as FanGroupKind, {
      awayUltrasPresent: ctx.hostujiciKotel >= 15,
      sector: (g.sector as FanSector) ?? "hlavni",
    });
    if (Object.keys(vahy).length === 0) continue;
    const kind = rng.weighted(vahy) as FanIncidentKind;

    const severity = rollSeverity(rng.random(), rng.random(), kind, {
      aggression: g.aggression,
      leaderRadikalnost: leader?.radikalnost ?? 50,
      severityDropChance: ctx.fx.securitySeverityDrop,
    });

    kandidati.push({ group: g, kind, severity, minute: rng.int(3, 92) });
  }

  // Když jich vyjde víc, řeší se ty nejvážnější — zbytek delegát přejde.
  kandidati.sort((a, b) => b.severity - a.severity);
  const vybrane = kandidati.slice(0, MAX_INCIDENTU_ZA_ZAPAS);

  const snapshoty: IncidentSnapshot[] = [];
  let celkemPokuta = 0;

  for (let i = 0; i < vybrane.length; i++) {
    const { group, kind, severity, minute } = vybrane[i];
    const leader = group.leader_id ? leaders.get(group.leader_id) : undefined;
    const dopad = incidentOutcome(kind, severity, { reputation: ctx.reputace, groupSize: group.size });
    const text = sestavText(opts.matchId, kind, severity, group, leader, ctx.fx.securitySeverityDrop > 0);
    const incidentId = `inc-${opts.matchId}-${group.kind}`;

    const zapsano = await zapisIncident(db, {
      incidentId, opts, group, kind, severity, minute, text, dopad,
    });
    // Řádek už existoval — pokutu ani následky nedávat podruhé.
    if (!zapsano) continue;

    await aplikujDopady(db, { opts, group, leader, kind, dopad, text, groups });
    celkemPokuta += dopad.fine;

    snapshoty.push({
      id: incidentId,
      kind,
      label: dopad.label,
      severity,
      minute,
      groupName: group.name,
      text,
      fine: dopad.fine,
      closedMatches: dopad.closeSectorMatches,
      fansLost: dopad.fansLost,
    });
  }

  // Šacování u vstupu a kamery kotel štvou — daň za klid, placená každý domácí zápas.
  const kotelHeat = FAN_SKALY.KOTEL_HEAT_ZA_OCHRANKU[Math.max(0, Math.min(3, ctx.securityLevel))] ?? 0;
  if (kotelHeat > 0) {
    await db
      .prepare("UPDATE fan_groups SET heat = MIN(100, heat + ?) WHERE team_id = ? AND kind = 'kotel'")
      .bind(kotelHeat, opts.homeTeamId)
      .run()
      .catch((e) => { logger.warn({ module: M }, "heat kotle z ochranky", e); });
  }

  await db
    .prepare(`UPDATE ${tabulka} SET fan_incidents = ? WHERE id = ?`)
    .bind(JSON.stringify(snapshoty), opts.matchId)
    .run()
    .catch((e) => { logger.warn({ module: M }, `zápis snapshotu k zápasu ${opts.matchId}`, e); });

  if (snapshoty.length > 0) {
    logger.info(
      { module: M, teamId: opts.homeTeamId, matchId: opts.matchId },
      `výtržnosti: ${snapshoty.map((s) => `${s.kind}/${s.severity}`).join(", ")} pokuty ${celkemPokuta} Kč`,
    );
    await oznam(db, opts, snapshoty, celkemPokuta);
  }

  return { skipped: false, incidents: snapshoty.length, totalFine: celkemPokuta };
}

// ── Kontext ──────────────────────────────────────────────────────────────────

interface Kontext {
  fx: ReturnType<typeof calculateFacilityEffects>;
  securityLevel: number;
  reputace: number;
  hostujiciKotel: number;
  /** 0–1: kolik piva je vůbec k mání. Vlastní prodej se v tuhle chvíli ještě nezaúčtoval,
   *  proto se bere z úrovně občerstvení, ne z tržeb. */
  pivoNaHlavu: number;
}

async function nactiKontext(db: D1Database, opts: ResolveOpts): Promise<Kontext> {
  const stadion = await db
    .prepare(
      `SELECT changing_rooms, showers, refreshments, lighting, stands, parking, fence,
              roof, ultras_stand, toilets, entrance_gate, security
       FROM stadiums WHERE team_id = ?`,
    )
    .bind(opts.homeTeamId)
    .first<Record<string, number>>()
    .catch((e) => { logger.warn({ module: M }, "stadion pro výtržnosti", e); return null; });

  const facilities: Record<string, number> = {};
  for (const [k, v] of Object.entries(stadion ?? {})) facilities[k] = (v as number) ?? 0;

  const tym = await db
    .prepare("SELECT reputation FROM teams WHERE id = ?")
    .bind(opts.homeTeamId)
    .first<{ reputation: number }>()
    .catch((e) => { logger.warn({ module: M }, "reputace klubu", e); return null; });

  // Hostující kotel — jeho party se zakládají líně stejně jako domácí.
  await ensureFanGroups(db, opts.awayTeamId).catch((e) => {
    logger.warn({ module: M }, `party hostů ${opts.awayTeamId}`, e); return [];
  });
  const host = await db
    .prepare("SELECT size FROM fan_groups WHERE team_id = ? AND kind = 'kotel'")
    .bind(opts.awayTeamId)
    .first<{ size: number }>()
    .catch((e) => { logger.warn({ module: M }, "kotel hostů", e); return null; });

  // Hosté nejezdí v plném počtu — na okresní zápas vyrazí zlomek jejich kotle.
  const hostujiciKotel = Math.round((host?.size ?? 0) * 0.25);

  return {
    fx: calculateFacilityEffects(facilities),
    securityLevel: facilities.security ?? 0,
    reputace: tym?.reputation ?? 50,
    hostujiciKotel,
    pivoNaHlavu: (facilities.refreshments ?? 0) / 3,
  };
}

async function nactiVudce(db: D1Database, teamId: string): Promise<Map<string, FanLeaderRow>> {
  const rows = await db
    .prepare("SELECT * FROM fan_leaders WHERE team_id = ? AND status = 'active'")
    .bind(teamId)
    .all<FanLeaderRow>()
    .catch((e) => { logger.warn({ module: M }, "vůdci pro výtržnosti", e); return null; });
  return new Map((rows?.results ?? []).map((l) => [l.id, l]));
}

// ── Text ─────────────────────────────────────────────────────────────────────

function sestavText(
  matchId: string,
  kind: FanIncidentKind,
  severity: number,
  group: FanGroupRow,
  leader: FanLeaderRow | undefined,
  ochrankaZasahla: boolean,
): string {
  // Vlastní seed, aby výběr věty nekonzumoval sekvenci, na které visí závažnost.
  const rng = createRng(seedFromString(`fantext|${matchId}|${group.kind}`));
  const sablona = rng.pick(FAN_INCIDENTS[kind].texty);
  let text = sablona
    .replace(/\{skupina\}/g, group.name)
    .replace(/\{vudce\}/g, leader ? fanLeaderFullName(leader) : "někdo z party");

  // Investice do pořadatelů musí být vidět i ve chvíli, kdy průšvih nezastavila celý.
  if (ochrankaZasahla && severity <= 1) text += " Pořadatelé zasáhli rychle, mohlo to dopadnout hůř.";
  return text;
}

// ── Zápis a dopady ───────────────────────────────────────────────────────────

async function zapisIncident(
  db: D1Database,
  a: {
    incidentId: string; opts: ResolveOpts; group: FanGroupRow;
    kind: FanIncidentKind; severity: number; minute: number; text: string; dopad: IncidentOutcome;
  },
): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO fan_incidents
        (id, reference_id, match_id, team_id, group_id, kind, severity, minute, text,
         fine, sector_closed_matches, fans_lost, morale_delta, game_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      a.incidentId, a.incidentId, a.opts.matchId, a.opts.homeTeamId, a.group.id,
      a.kind, a.severity, a.minute, a.text,
      a.dopad.fine, a.dopad.closeSectorMatches, a.dopad.fansLost, a.dopad.moraleDelta,
      a.opts.gameDate,
    )
    .run()
    .catch((e) => { logger.error({ module: M }, `zápis výtržnosti ${a.incidentId}`, e); return null; });
  return (res?.meta?.changes ?? 0) > 0;
}

async function aplikujDopady(
  db: D1Database,
  a: {
    opts: ResolveOpts; group: FanGroupRow; leader: FanLeaderRow | undefined;
    kind: FanIncidentKind; dopad: IncidentOutcome; text: string; groups: FanGroupRow[];
  },
): Promise<void> {
  const { opts, group, dopad } = a;

  // ── Pokuta ──
  // Jde přes disciplinární radu, ne přímou transakcí: `issued_by = 'rule'` se
  // nepočítá do stropu dvou pokut za sezónu (canFine), peníze přitečou do pokladny
  // soutěže, klub dostane SMS a zbude mu cesta odvolání. Idempotenci drží
  // reference_id, takže opakovaný běh pokutu neuloží podruhé.
  if (dopad.fine > 0 && opts.leagueId) {
    try {
      const { issueSanction } = await import("../competition/discipline");
      await issueSanction(db, {
        leagueId: opts.leagueId,
        seasonNumber: opts.seasonNumber,
        teamId: opts.homeTeamId,
        amount: dopad.fine,
        kind: "fan_disorder",
        reason: dopad.label.toLowerCase(),
        evidence: a.text,
        issuedBy: "rule",
        issuedByTeamId: null,
        proposalId: null,
        gameDate: opts.gameDate,
        referenceId: `faninc-${opts.matchId}-${group.kind}`,
      });
    } catch (e) {
      logger.error({ module: M }, `pokuta za výtržnost ${group.kind}`, e);
    }
  }

  // ── Oprava poškozeného zařízení ──
  if (a.kind === "skoda") {
    try {
      const { recordTransaction } = await import("../season/finance-processor");
      const oprava = 1500 * dopad.severity;
      await recordTransaction(
        db, opts.homeTeamId, "match_expense", -oprava,
        "Oprava po výtržnostech na tribuně", opts.gameDate, `fandmg-${opts.matchId}-${group.kind}`,
      );
    } catch (e) {
      logger.warn({ module: M }, "úhrada opravy po výtržnosti", e);
    }
  }

  // ── Uzavření sektoru ──
  if (dopad.closeSectorMatches > 0) {
    await db
      .prepare("UPDATE fan_groups SET closed_matches = closed_matches + ? WHERE id = ?")
      .bind(dopad.closeSectorMatches, group.id)
      .run()
      .catch((e) => { logger.warn({ module: M }, "uzavření sektoru", e); });
  }

  // ── Kdo odejde ──
  // Neodcházejí výtržníci, ale ti, kterým se to hnusí. Proto se ubírá z příležitostných
  // (rodiny) a teprve při přetečení z pravidelných.
  if (dopad.fansLost > 0) {
    // Neodcházejí výtržníci, ale party, kterým se to hnusí. Jejich loajalita
    // rozhoduje, kolik jich to skutečně vzdá — pamětníci vydrží skoro všechno.
    const citlive = a.groups.filter((g) => g.kind === "rodiny" || g.kind === "pametnici");
    const prumernaLoajalita = citlive.length > 0
      ? citlive.reduce((s, g) => s + g.loyalty, 0) / citlive.length
      : 50;
    const odejde = Math.round(dopad.fansLost * (1 - prumernaLoajalita / 200));
    if (odejde > 0) await odejdouFanousci(db, opts.homeTeamId, odejde);
  }

  // ── Nálada part ──
  // Viník má z akce svoje, ale schytal trest; ostatní se za to jen stydí.
  const stmts: D1PreparedStatement[] = [];
  for (const g of a.groups) {
    const def = FAN_GROUPS[g.kind as FanGroupKind];
    const jeVinik = g.id === group.id;
    const citlive = def?.tier === "casual" || g.kind === "pametnici" || g.kind === "rodiny";
    const moodDelta = jeVinik
      ? (dopad.closeSectorMatches > 0 ? -6 : 2)
      : (citlive ? -3 * dopad.severity : -dopad.severity);
    const heatDelta = jeVinik && dopad.closeSectorMatches > 0 ? 8 : 0;
    stmts.push(
      db.prepare(
        `UPDATE fan_groups SET mood = MAX(0, MIN(100, mood + ?)), heat = MAX(0, MIN(100, heat + ?)),
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
      ).bind(moodDelta, heatDelta, g.id),
    );
  }
  await db.batch(stmts).catch((e) => { logger.warn({ module: M }, "nálada part po výtržnosti", e); });

  // ── Vůdce viníka ──
  // Klub ho volá k odpovědnosti, ať za to může nebo ne. Vztah to zhorší.
  if (a.leader) {
    await db
      .prepare(
        `UPDATE fan_leaders SET sentiment = MAX(-100, sentiment - ?), duvod = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
      )
      .bind(3 * dopad.severity, `Vedení mu vyčetlo, co parta provedla: ${dopad.label.toLowerCase()}.`, a.leader.id)
      .run()
      .catch((e) => { logger.warn({ module: M }, "sentiment vůdce po výtržnosti", e); });
  }

  // ── Morálka mužstva ──
  if (dopad.moraleDelta !== 0) {
    try {
      const { shiftSquadMorale } = await import("../community/manager-relations");
      await shiftSquadMorale(db, opts.homeTeamId, dopad.moraleDelta);
    } catch (e) {
      logger.warn({ module: M }, "morálka po výtržnosti", e);
    }
  }

  // ── Rozhodčí si to pamatuje ──
  if (a.kind === "vyhrozovani" && opts.refereeId) {
    await db
      .prepare(
        `INSERT INTO referee_team_relations (id, referee_id, team_id, sentiment, duvod)
         VALUES (?,?,?,?,?)
         ON CONFLICT(referee_id, team_id) DO UPDATE SET
           sentiment = MAX(-100, referee_team_relations.sentiment - 15),
           duvod = excluded.duvod,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
      )
      .bind(
        `rtr-${opts.refereeId}-${opts.homeTeamId}`, opts.refereeId, opts.homeTeamId, -15,
        "Jejich fanoušci na mě čekali u kabin.",
      )
      .run()
      .catch((e) => { logger.warn({ module: M }, "paměť rozhodčího po výhrůžkách", e); });
  }
}

/**
 * Ubere fanoušky, kterým se bordel zhnusil.
 *
 * Nejdřív příležitostní (rodiny odejdou první), teprve při přetečení pravidelní.
 * Tvrdé jádro nikam nejde — to je právě ta parta, co ten bordel dělá.
 */
async function odejdouFanousci(db: D1Database, teamId: string, kolik: number): Promise<void> {
  await db
    .prepare(
      `UPDATE team_fanbase SET
         casual_count  = MAX(0, casual_count - ?),
         regular_count = MAX(0, regular_count - MAX(0, ? - casual_count)),
         updated_at = ?
       WHERE team_id = ?`,
    )
    .bind(kolik, kolik, new Date().toISOString(), teamId)
    .run()
    .catch((e) => { logger.warn({ module: M }, `odchod fanoušků u ${teamId}`, e); });
}

// ── Oznámení ─────────────────────────────────────────────────────────────────

async function oznam(
  db: D1Database,
  opts: ResolveOpts,
  snapshoty: IncidentSnapshot[],
  celkemPokuta: number,
): Promise<void> {
  const shrnuti = snapshoty.map((s) => s.text).join(" ");
  try {
    const { sendSystemSMS } = await import("../messaging/system-sms");
    const pokuta = celkemPokuta > 0
      ? ` Do zápisu jde pokuta ${celkemPokuta.toLocaleString("cs")} Kč.`
      : " Pokuta tentokrát nepadla.";
    await sendSystemSMS(db, opts.homeTeamId, "Hlavní pořadatel", shrnuti + pokuta);
  } catch (e) {
    logger.warn({ module: M }, "SMS o výtržnostech", e);
  }

  try {
    const { createNotification } = await import("../community/notifications");
    await createNotification(
      db, opts.homeTeamId, "event", "🚨 Výtržnosti na stadionu", shrnuti, "/dashboard/fans",
    );
  } catch (e) {
    logger.warn({ module: M }, "notifikace o výtržnostech", e);
  }
}
