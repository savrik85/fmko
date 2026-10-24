/**
 * Otevření okresu registracím (spuštění ligy).
 *
 * Okres v přípravě (`district_registrations.status = 'preparing'`) nepustí nikoho nového,
 * i když jeho liga běží. Otevřením se okres objeví na úvodní stránce a v registraci
 * jako připravený a nováček v něm dostane místo AI klubu.
 */

import { logger } from "../lib/logger";

export interface DistrictOpening {
  district: string;
  before: string | null;
  after: string | null;
  changed: boolean;
}

export async function openDistrictRegistration(db: D1Database, district: string, dryRun: boolean): Promise<DistrictOpening> {
  const row = await db.prepare("SELECT status FROM district_registrations WHERE district = ?")
    .bind(district).first<{ status: string }>()
    .catch((e) => { logger.warn({ module: "district-opening" }, `stav okresu ${district}`, e); return null; });
  const before = row?.status ?? null;
  if (before === "ready" || dryRun) {
    return { district, before, after: dryRun ? "ready" : before, changed: false };
  }

  const now = new Date().toISOString();
  if (row) {
    await db.prepare("UPDATE district_registrations SET status = 'ready', ready_at = ? WHERE district = ?")
      .bind(now, district).run();
  } else {
    await db.prepare("INSERT INTO district_registrations (district, status, ready_at) VALUES (?, 'ready', ?)")
      .bind(district, now).run();
  }
  const after = await db.prepare("SELECT status FROM district_registrations WHERE district = ?")
    .bind(district).first<{ status: string }>();
  return { district, before, after: after?.status ?? null, changed: after?.status === "ready" };
}
