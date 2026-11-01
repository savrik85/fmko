/**
 * Upozornění na rozhodnutí obce s termínem: petice, investice a setkání v hospodě.
 *
 * Dřív vznikala potichu, bez notifikace a SMS, a trenér se o nich dozvěděl, jen když
 * sám otevřel Obec. Na produ (11-01) propadlo 36 % petic (vždy s postihem přízně),
 * 38 % setkání v hospodě a 15 ze 63 investic. Teď přijde zpráva hned při vzniku
 * a připomínka den před koncem.
 */

import { createNotification } from "../community/notifications";
import { pushEnvOf, type OptionalPushKeys } from "../community/phone-push";
import { logger } from "../lib/logger";
import { sendSystemSMS } from "../messaging/system-sms";
import type { CreatedVillageDecision } from "../season/village-processor";

const M = "decision-alerts";
const DAY_MS = 86_400_000;

/** Odesílatel SMS v Telefonu, jedno vlákno pro všechno od obce. */
export const VILLAGE_SMS_SENDER = "Obecní úřad";

export type VillageDecisionKind = "petition" | "investment" | "pub";

/** Kolik herních dní zbývá do konce (aspoň 1). */
export function daysLeft(gameDate: string, expiresAt: string): number {
  return Math.max(1, Math.round((Date.parse(expiresAt) - Date.parse(gameDate)) / DAY_MS));
}

function days(n: number): string {
  return `${n} ${n === 1 ? "den" : n < 5 ? "dny" : "dní"}`;
}

/** Texty upozornění a SMS. Čisté, ať jdou otestovat. */
export function decisionTexts(kind: VillageDecisionKind, title: string, left: number): { title: string; body: string; sms: string } {
  switch (kind) {
    case "petition":
      return {
        title: `🏛️ Petice: ${title}`,
        body: `Obec čeká na tvou odpověď, máš na ni ${days(left)}. Když ji necháš ležet, přízeň obce klesne.`,
        sms: `Dobrý den, občané sepsali petici „${title}“ a čekají, jak se klub zachová. Odpovědět můžete na stránce Obec, máte na to ${days(left)}.`,
      };
    case "investment":
      return {
        title: `🏗️ Obec nabízí: ${title}`,
        body: `Obec přispěje na stavbu, když se klub připojí. Nabídka platí ${days(left)}.`,
        sms: `Dobrý den, obec je ochotná přispět na „${title}“. Podrobnosti najdete na stránce Obec, nabídka platí ${days(left)}.`,
      };
    case "pub":
      return {
        title: `🍺 ${title}`,
        body: `Rád by s tebou probral klub. Zajdi do hospody, máš na to ${days(left)}.`,
        sms: `${title} a ptá se po vás. Kdybyste se během ${days(left)} stavil, rád by probral klub. Najdete ho na stránce Obec.`,
      };
  }
}

/** Upozornění a SMS k právě vzniklým rozhodnutím. Selhání u jednoho klubu nezastaví ostatní. */
export async function notifyNewVillageDecisions(
  db: D1Database,
  env: OptionalPushKeys,
  kind: VillageDecisionKind,
  created: CreatedVillageDecision[],
  gameDate: string,
): Promise<number> {
  const pushEnv = pushEnvOf(db, env);
  let sent = 0;
  for (const d of created) {
    const t = decisionTexts(kind, d.title, daysLeft(gameDate, d.expiresAt));
    try {
      await createNotification(db, d.teamId, "event", t.title, t.body, "/obec", pushEnv);
      await sendSystemSMS(db, d.teamId, VILLAGE_SMS_SENDER, t.sms);
      sent++;
    } catch (e) {
      logger.warn({ module: M, teamId: d.teamId }, `upozornění na ${kind}`, e);
    }
  }
  return sent;
}

/**
 * Připomínka den před koncem u rozhodnutí, na která trenér nesáhl. Denní tick běží
 * jednou za herní den, takže okno (dnes, zítra] zachytí každé rozhodnutí právě jednou.
 */
export async function remindExpiringVillageDecisions(db: D1Database, env: OptionalPushKeys, gameDate: string): Promise<number> {
  const rows = await db.prepare(
    `SELECT vp.team_id, vp.title AS title, 'petition' AS kind FROM village_petitions vp
      WHERE vp.status = 'active' AND julianday(vp.expires_at) > julianday(?1) AND julianday(vp.expires_at) <= julianday(?1) + 1
     UNION ALL
     SELECT vi.team_id, 'Nabídka obce na spolufinancování' AS title, 'investment' AS kind FROM village_investments vi
      WHERE vi.status = 'offered' AND julianday(vi.expires_at) > julianday(?1) AND julianday(vi.expires_at) <= julianday(?1) + 1
     UNION ALL
     SELECT pe.team_id, TRIM(COALESCE(o.first_name, '') || ' ' || COALESCE(o.last_name, '')) AS title, 'pub' AS kind
       FROM village_pub_encounters pe LEFT JOIN village_officials o ON o.id = pe.official_id
      WHERE pe.status = 'active' AND julianday(pe.expires_at) > julianday(?1) AND julianday(pe.expires_at) <= julianday(?1) + 1`,
  ).bind(gameDate).all<{ team_id: string; title: string | null; kind: VillageDecisionKind }>()
    .catch((e) => { logger.warn({ module: M }, "rozhodnutí obce před koncem", e); return { results: [] as Array<{ team_id: string; title: string | null; kind: VillageDecisionKind }> }; });

  const pushEnv = pushEnvOf(db, env);
  let sent = 0;
  for (const r of rows.results) {
    const what = r.kind === "pub" ? `${r.title || "Zastupitel"} v hospodě` : r.title || "Rozhodnutí obce";
    try {
      await createNotification(db, r.team_id, "event", `⏳ Zítra je poslední den: ${what}`,
        r.kind === "petition" ? "Bez odpovědi přízeň obce klesne." : "Rozhodni na stránce Obec, zítra už bude pozdě.",
        "/obec", pushEnv);
      sent++;
    } catch (e) {
      logger.warn({ module: M, teamId: r.team_id }, "připomínka rozhodnutí obce", e);
    }
  }
  return sent;
}
