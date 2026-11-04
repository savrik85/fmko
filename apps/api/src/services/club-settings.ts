/**
 * Klubová nastavení bez nákupu: vstupné a investice do akademie. Jedna služba pro
 * manažera (PATCH /teams/:teamId/fans/ticket-price, POST /teams/:teamId/academy)
 * i AI trenéra.
 */

import { logger } from "../lib/logger";
import type { ServiceError } from "./lineup";

/** Nastaví základní vstupné (0 = sazba obce). Fanoušci si všimnou zdražení i zlevnění. */
export async function setTicketPrice(db: D1Database, teamId: string, rawPrice: number): Promise<{ ok: true; baseTicketPrice: number }> {
  const price = Math.max(0, Math.min(500, Math.round(rawPrice ?? 0)));

  const { ensureFansRow } = await import("../season/fans-processor");
  const { getBaseTicketPrice, mapVillageSize } = await import("../season/finance-processor");
  await ensureFansRow(db, teamId);

  // Starou cenu je potřeba znát dřív, než ji přepíšeme — bez ní by fanoušci
  // nepoznali, jestli jsi zdražil nebo zlevnil.
  //
  // Nula v `base_ticket_price` neznamená vstup zdarma, ale „platí sazba obce".
  // Kdyby se brala doslova, první nastavení ceny by fanoušky minulo — a přitom
  // skok z obecní třicetikoruny na stovku je přesně to, co je naštve nejvíc.
  const storedPrice = (await db.prepare("SELECT base_ticket_price FROM fans WHERE team_id = ?")
    .bind(teamId).first<{ base_ticket_price: number }>()
    .catch((e) => { logger.warn({ module: "game" }, "stará cena vstupného", e); return null; }))?.base_ticket_price ?? 0;
  const villageSize = (await db.prepare(
    "SELECT v.size FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?",
  ).bind(teamId).first<{ size: string }>()
    .catch((e) => { logger.warn({ module: "game" }, "velikost obce pro cenu", e); return null; }))?.size;
  const previousPrice = storedPrice > 0 ? storedPrice : getBaseTicketPrice(mapVillageSize(villageSize ?? "village"));

  await db.prepare(
    "UPDATE fans SET base_ticket_price = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE team_id = ?",
  ).bind(price, teamId).run().catch((e) => logger.warn({ module: "game" }, "update ticket price", e));

  if (previousPrice > 0 && price !== previousPrice) {
    const { recordClubEvent } = await import("../fans/club-events");
    const { silaZmenyCeny } = await import("../engine/fan-reactions");
    const direction = price > previousPrice ? "Zdraženo" : "Zlevněno";
    await recordClubEvent(db, {
      teamId,
      kind: price > previousPrice ? "zdrazeni_vstupneho" : "zlevneni_vstupneho",
      severity: silaZmenyCeny(previousPrice, price),
      payload: { co: `${direction} z ${previousPrice} na ${price} Kč` },
    });
  }

  return { ok: true, baseTicketPrice: price };
}

export const ACADEMY_LEVELS = ["none", "volunteer", "parent", "staff"] as const;
export type AcademyLevel = typeof ACADEMY_LEVELS[number];

/**
 * Družstvo žáků jednou volbou (AI trenér): none = zrušit, jinak založit (když není) a dát
 * trenéra: dobrovolník z áčka, táta jednoho z kluků, nebo placený trenér mládeže.
 * Člověk nastavuje na stránce Žáci (academy/service.ts).
 */
export async function setAcademyInvestment(db: D1Database, teamId: string, investment: unknown): Promise<{ ok: true; investment: AcademyLevel } | ServiceError> {
  if (typeof investment !== "string" || !(ACADEMY_LEVELS as readonly string[]).includes(investment)) {
    return { ok: false, status: 400, error: "Neplatná volba žáků" };
  }
  const { applyYouthChoice } = await import("../academy/service");
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>();
  const res = await applyYouthChoice(db, teamId, investment as AcademyLevel, team?.game_date ?? new Date().toISOString());
  if (!res.ok) return { ok: false, status: res.status === 409 ? 400 : res.status, error: res.error };
  logger.info({ module: "development", teamId }, `žáci: ${investment}`);
  return { ok: true, investment: investment as AcademyLevel };
}
