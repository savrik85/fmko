/**
 * Historie staveb stadionu a vrácení omylem postavené tribuny.
 *
 * Každá stavba (zařízení i přístavba) zapíše řádek do `stadium_builds`. Stavby z doby před
 * historií se dohledávají z plateb ve financích (typ stadium_upgrade bez reference): tam je
 * jen název a částka, úroveň ne.
 *
 * Vrátit jde jen úroveň tribuny (jedna ze čtyř stran), a to do 48 hodin od stavby, jen dokud
 * je to poslední stavba na té straně a dokud se na ní nehrál domácí zápas (jinak by šla
 * kapacita na zápas půjčit zadarmo). Vrátí se úroveň i celá zaplacená částka.
 */
import { logger } from "../lib/logger";
import { recordTransaction } from "../season/finance-processor";
import type { ServiceError } from "../services/lineup";
import { EXT_KIND_LABELS, EXT_SLOT_DEFS, requirementOf, type ExtKind, type ExtSlot } from "./extension-catalog";
import { loadExtensions } from "./extensions-db";
import { STAND_SIDES, readStandLevels, standsMaxLevel, type StandSide } from "./stands-model";
import { claimStadiumUpgrade } from "./upgrade-claim";

const M = "stadium-builds";

/** Jak dlouho po stavbě jde tribuna vrátit. */
export const STAND_BUILD_UNDO_HOURS = 48;
const HISTORY_LIMIT = 60;

export function buildReference(buildId: string): string {
  return `build-${buildId}`;
}

interface BuildRow {
  id: string;
  team_id: string;
  facility: string;
  label: string;
  from_level: number | null;
  to_level: number | null;
  cost: number;
  built_at: string;
  reverted_at: string | null;
}

export interface StadiumBuildView {
  id: string;
  facility: string;
  label: string;
  fromLevel: number | null;
  toLevel: number | null;
  cost: number;
  builtAt: string;
  revertedAt: string | null;
  /** Vrácení stavby: `until` = do kdy to jde, `blockedReason` = proč to nejde (null = jde). */
  undo: { available: boolean; until: string; blockedReason: string | null } | null;
}

/**
 * Zapíše stavbu do historie a vrátí její id (nebo null, když zápis selže: stavba už stojí
 * a kvůli historii se nesmí rozbít, jen ji pak nepůjde vrátit).
 */
export async function recordStadiumBuild(db: D1Database, build: {
  teamId: string; facility: string; label: string; fromLevel: number | null; toLevel: number | null; cost: number;
}): Promise<string | null> {
  const id = crypto.randomUUID();
  try {
    await db.prepare(
      "INSERT INTO stadium_builds (id, team_id, facility, label, from_level, to_level, cost) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, build.teamId, build.facility, build.label, build.fromLevel, build.toLevel, build.cost).run();
    return id;
  } catch (e) {
    logger.error({ module: M, teamId: build.teamId }, `stavba ${build.facility} se nezapsala do historie`, e);
    return null;
  }
}

function isStandSide(facility: string): facility is StandSide {
  return (STAND_SIDES as readonly string[]).includes(facility);
}

function undoDeadline(builtAt: string): Date {
  return new Date(Date.parse(builtAt) + STAND_BUILD_UNDO_HOURS * 3600_000);
}

/** Proč stavbu nejde vrátit. `null` = vrátit jde. Čas se tu nehlídá, ten řeší volající. */
async function undoBlocker(db: D1Database, build: BuildRow, stadium: Record<string, unknown>): Promise<string | null> {
  const side = build.facility as StandSide;
  if (build.from_level === null || build.to_level === null) return "U téhle stavby není známá úroveň.";

  const later = await db.prepare(
    "SELECT 1 AS n FROM stadium_builds WHERE team_id = ? AND facility = ? AND reverted_at IS NULL AND built_at > ? LIMIT 1",
  ).bind(build.team_id, build.facility, build.built_at).first<{ n: number }>();
  if (later) return "Na téhle tribuně už proběhla další stavba. Vrátit jde jen ta poslední.";

  if (((stadium[side] as number | null) ?? 0) !== build.to_level) {
    return "Tribuna má teď jinou úroveň, než jakou tahle stavba postavila.";
  }

  // Tribuna, na které se už hrálo, vydělala na vstupném: vrátit ji pak zadarmo by byla půjčka kapacity.
  const played = await db.prepare(
    "SELECT 1 AS n FROM matches WHERE home_team_id = ? AND status = 'simulated' AND julianday(simulated_at) > julianday(?) LIMIT 1",
  ).bind(build.team_id, build.built_at).first<{ n: number }>();
  // Pohár má vlastní tabulku zápasů. Vstupné z každého domácího zápasu (liga i pohár) ale
  // zapisuje stejná funkce (processMatchDayFinances), takže ho spolehlivě pozná platba.
  const gate = played ? null : await db.prepare(
    "SELECT 1 AS n FROM transactions WHERE team_id = ? AND type = 'match_income' AND julianday(created_at) > julianday(?) LIMIT 1",
  ).bind(build.team_id, build.built_at).first<{ n: number }>();
  if (played || gate) return "Na tribuně se už hrál domácí zápas. Vrátit jde jen stavba, na které se ještě nehrálo.";

  const damage = await db.prepare(
    "SELECT 1 AS n FROM stadium_damage WHERE team_id = ? AND facility = ? AND repaired_at IS NULL LIMIT 1",
  ).bind(build.team_id, build.facility).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "poškození tribuny před vrácením stavby", e); return null; });
  if (damage) return "Tribuna je poškozená. Nejdřív ji oprav.";

  const levels = { ...readStandLevels(stadium), [side]: build.from_level };
  for (const ext of await loadExtensions(db, build.team_id)) {
    const def = EXT_SLOT_DEFS[ext.slot as ExtSlot];
    if (!def || !def.sides.includes(side)) continue;
    const requirement = requirementOf(ext.kind as ExtKind);
    const sideLevels = def.sides.map((s) => levels[s] ?? 0);
    const stillFits = requirement.mode === "all"
      ? sideLevels.every((v) => v >= requirement.min)
      : sideLevels.some((v) => v >= requirement.min);
    if (!stillFits) {
      return `Na tribuně stojí přístavba (${EXT_KIND_LABELS[ext.kind as ExtKind] ?? ext.kind}), která tuhle úroveň potřebuje.`;
    }
  }

  if (standsMaxLevel(levels) === 0) {
    if (((stadium.roof as number | null) ?? 0) > 0) return "Bez tribuny by nebylo co zastřešit. Zastřešení tu už stojí.";
    if (((stadium.vip_box as number | null) ?? 0) > 0) return "VIP lóže potřebuje aspoň jednu tribunu.";
  }
  return null;
}

/** Historie staveb klubu, nejnovější první: záznamy z historie a starší platby z financí. */
export async function loadStadiumBuilds(db: D1Database, teamId: string, now = new Date()): Promise<StadiumBuildView[]> {
  const rows = await db.prepare(
    "SELECT * FROM stadium_builds WHERE team_id = ? ORDER BY built_at DESC LIMIT ?",
  ).bind(teamId, HISTORY_LIMIT).all<BuildRow>()
    .catch((e) => { logger.warn({ module: M }, "načtení historie staveb", e); return { results: [] as BuildRow[] }; });
  const stadium = await db.prepare("SELECT * FROM stadiums WHERE team_id = ?").bind(teamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, "stadion pro historii staveb", e); return null; });

  const views: StadiumBuildView[] = [];
  for (const row of rows.results) {
    let undo: StadiumBuildView["undo"] = null;
    const deadline = undoDeadline(row.built_at);
    if (isStandSide(row.facility) && !row.reverted_at && deadline.getTime() > now.getTime() && stadium) {
      const blockedReason = await undoBlocker(db, row, stadium)
        .catch((e) => { logger.warn({ module: M }, `kontrola vrácení stavby ${row.id}`, e); return "Teď to nejde ověřit, zkus to za chvíli."; });
      undo = { available: blockedReason === null, until: deadline.toISOString(), blockedReason };
    }
    views.push({
      id: row.id, facility: row.facility, label: row.label, fromLevel: row.from_level, toLevel: row.to_level,
      cost: row.cost, builtAt: row.built_at, revertedAt: row.reverted_at, undo,
    });
  }

  // Stavby z doby před historií: platba nese jen název a částku (reference nemá).
  const legacy = await db.prepare(
    `SELECT id, amount, description, created_at FROM transactions
      WHERE team_id = ? AND type = 'stadium_upgrade' AND reference_id IS NULL AND amount < 0
      ORDER BY created_at DESC LIMIT ?`,
  ).bind(teamId, HISTORY_LIMIT).all<{ id: string; amount: number; description: string; created_at: string }>()
    .catch((e) => { logger.warn({ module: M }, "starší stavby z financí", e); return { results: [] }; });
  for (const t of legacy.results) {
    views.push({
      id: `txn-${t.id}`, facility: "legacy", label: t.description.replace(/^Vylepšení stadionu:\s*/, ""),
      fromLevel: null, toLevel: null, cost: -t.amount,
      builtAt: t.created_at.includes("T") ? t.created_at : `${t.created_at.replace(" ", "T")}Z`,
      revertedAt: null, undo: null,
    });
  }
  return views.sort((a, b) => b.builtAt.localeCompare(a.builtAt)).slice(0, HISTORY_LIMIT);
}

/** Vrátí omylem postavenou úroveň tribuny: úroveň zpět a celá částka zpátky do pokladny. */
export async function revertStandBuild(
  db: D1Database, teamId: string, buildId: string, now = new Date(),
): Promise<{ ok: true; refund: number; level: number } | ServiceError> {
  const build = await db.prepare("SELECT * FROM stadium_builds WHERE id = ? AND team_id = ?")
    .bind(buildId, teamId).first<BuildRow>();
  if (!build) return { ok: false, status: 404, error: "Stavba nenalezena." };
  if (!isStandSide(build.facility)) return { ok: false, status: 400, error: "Vrátit jde jen stavba tribuny." };
  if (build.reverted_at) return { ok: false, status: 409, error: "Tahle stavba už je vrácená." };
  if (undoDeadline(build.built_at).getTime() <= now.getTime()) {
    return { ok: false, status: 400, error: `Stavbu jde vrátit jen do ${STAND_BUILD_UNDO_HOURS} hodin.` };
  }
  const stadium = await db.prepare("SELECT * FROM stadiums WHERE team_id = ?").bind(teamId).first<Record<string, unknown>>();
  if (!stadium) return { ok: false, status: 404, error: "Stadion nenalezen." };
  const blocker = await undoBlocker(db, build, stadium);
  if (blocker) return { ok: false, status: 409, error: blocker };

  // Nárok na vrácení: kdo prohraje (dvojklik), nevrátí nic a peníze nedostane.
  const claim = await db.prepare(
    "UPDATE stadium_builds SET reverted_at = ? WHERE id = ? AND reverted_at IS NULL",
  ).bind(now.toISOString(), build.id).run();
  if ((claim.meta?.changes ?? 0) === 0) return { ok: false, status: 409, error: "Tahle stavba už je vrácená." };

  // Úroveň zpět stejným podmíněným zápisem jako stavba (sedne, jen když tribuna drží postavenou úroveň).
  const lowered = await claimStadiumUpgrade(db, teamId, build.facility, build.to_level!, build.from_level!);
  if (!lowered) {
    await db.prepare("UPDATE stadium_builds SET reverted_at = NULL WHERE id = ?").bind(build.id).run()
      .catch((e) => logger.error({ module: M, teamId }, `uvolnění nároku na vrácení stavby ${build.id}`, e));
    return { ok: false, status: 409, error: "Tribuna se mezitím změnila, načti stránku znovu." };
  }

  // Vrací se jen to, co se za stavbu opravdu strhlo (platba nese referenci na záznam).
  // Když stržení při stavbě selhalo, není co vracet.
  const paid = await db.prepare(
    "SELECT COALESCE(-SUM(amount), 0) AS total FROM transactions WHERE team_id = ? AND type = 'stadium_upgrade' AND reference_id = ? AND amount < 0",
  ).bind(teamId, buildReference(build.id)).first<{ total: number }>();
  const refund = Math.max(0, Math.min(build.cost, paid?.total ?? 0));
  if (refund > 0) {
    try {
      await recordTransaction(db, teamId, "stadium_refund", refund, `Vrácení stavby: ${build.label}`, now.toISOString(), buildReference(build.id));
    } catch (e) {
      // Úroveň je už dole. Bez peněz by klub přišel o tribunu i o částku a nikdo by to nevěděl.
      logger.error({ module: M, teamId }, `vrácení stavby ${build.id}: úroveň snížena, ale ${refund} Kč se nevrátilo`, e);
      return { ok: false, status: 500, error: "Tribuna je vrácená, ale peníze se nepřipsaly. Napiš správci hry." };
    }
  }
  return { ok: true, refund, level: build.from_level! };
}
