/**
 * Hráč se ptá sám (F8): zpráva „jen tak" `casual_job_tip` („nevíte o nějaké práci?") od hráče,
 * který přišel o práci. Dřív neměla žádný dopad. Teď se po ní na 36 hodin uloží otevřená
 * otázka (KV, jako pozvání v casual-messages.ts) a když trenér v odpovědi slíbí, že se poptá,
 * hra se zeptá firmy: té, kterou trenér jmenoval, jinak té, která by hráče vzala. Rozhoduje
 * stejně jako SMS trenéra majiteli (sponsors/player-jobs-db.ts `requestPlayerJob`).
 */
import { logger } from "../lib/logger";
import { matchFirm, parseJobHelpPromise } from "../sponsors/job-parse";
import type { ChatEnv } from "./ai-player-chat";

const M = "job-tip";
/** Stejně dlouho jako pozvání: trenér často odpovídá až druhý den. */
const JOB_TIP_TTL_SECONDS = 36 * 3600;

const jobTipKey = (convId: string) => `open_job_tip:${convId}`;

export interface OpenJobTip {
  teamId: string;
  playerId: string;
  playerFirstName: string;
}

export async function openJobTip(kv: KVNamespace | undefined, convId: string, tip: OpenJobTip): Promise<void> {
  await kv?.put(jobTipKey(convId), JSON.stringify(tip), { expirationTtl: JOB_TIP_TTL_SECONDS })
    .catch((e) => logger.warn({ module: M, teamId: tip.teamId }, "uložení otázky na práci", e));
}

/**
 * Trenér napsal hráči. Když na odpověď čeká otázka na práci a trenér slíbil, že se poptá,
 * hra se zeptá firmy. Vrací true, když hráč práci dostal. Volá routes/messaging.ts na pozadí.
 */
export async function handleCoachMessageForJobTip(
  db: D1Database, env: ChatEnv, convId: string, coachMessage: string,
): Promise<boolean> {
  const raw = await env.CACHE_KV?.get(jobTipKey(convId))
    .catch((e) => { logger.warn({ module: M }, "čtení otázky na práci", e); return null; });
  if (!raw) return false;
  let tip: OpenJobTip;
  try {
    tip = JSON.parse(raw) as OpenJobTip;
  } catch (e) {
    logger.warn({ module: M }, "otázka na práci není JSON", e);
    return false;
  }

  const { coachPromisesJobHelp } = await import("./ai-player-chat");
  const judged = await coachPromisesJobHelp(env, { playerFirstName: tip.playerFirstName }, coachMessage)
    .catch((e) => { logger.warn({ module: M, teamId: tip.teamId }, "posouzení slibu práce modelem", e); return null; });
  const promised = judged ?? parseJobHelpPromise(coachMessage);
  if (!promised) return false;
  // Otázka se vyřizuje jednou. Dvě rychlé zprávy „zeptám se" zastaví unikátní index žádostí.
  await env.CACHE_KV?.delete(jobTipKey(convId))
    .catch((e) => logger.warn({ module: M, teamId: tip.teamId }, "smazání otázky na práci", e));

  const [firms, player] = await Promise.all([
    db.prepare(
      `SELECT ds.id, ds.name FROM district_sponsors ds
       WHERE ds.district = (SELECT v.district FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?)`,
    ).bind(tip.teamId).all<{ id: number; name: string }>(),
    db.prepare("SELECT last_name FROM players WHERE id = ?").bind(tip.playerId).first<{ last_name: string }>(),
  ]);
  const named = matchFirm(coachMessage, firms.results, player?.last_name ? [player.last_name] : []);
  const { pickTipSponsor, postJobExchange, requestPlayerJob, thankHiredPlayer } = await import("../sponsors/player-jobs-db");
  const sponsorId = await pickTipSponsor(db, tip.teamId, tip.playerId, named);
  if (sponsorId === null) {
    logger.info({ module: M, teamId: tip.teamId }, `práce pro hráče ${tip.playerId}: klub nemá firmu, které by se zeptal`);
    return false;
  }
  const out = await requestPlayerJob(db, { teamId: tip.teamId, sponsorId, playerId: tip.playerId, source: "player_tip" });
  if (out.kind === "error" || out.kind === "duplicate") return false;
  await postJobExchange(db, out);
  if (out.kind !== "hired") return false;
  await thankHiredPlayer(db, out);
  return true;
}
