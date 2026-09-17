/**
 * Den po obvinění, které hráč zapřel, se hráč ozve trenérovi sám (spec 17d,
 * vynucený scénář `krivde_obvineny`).
 *
 * Ozve se každý, kdo zapíral, vinný i nevinný. Kdyby psali jen nevinní, manažer
 * by podle toho poznal, koho obvinil neprávem, a zúžil by si podezřelé.
 */

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { isAiEnabled } from "../lib/ai-provider";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { getOrCreatePlayerConversation } from "../messaging/ai-player-spawn";
import { sendPlayerSMS } from "../messaging/system-sms";
import { denPlus } from "./absence-hracu";
import { smsIncidentu } from "./incident-db";
import { nazevIncidentu } from "./katalog";
import { OKNO_VLIVU_DNI } from "./nastaveni";
import { text } from "./texty";
import { nactiObvineni } from "./vysetrovani";

const M = "incidents-krivda";

type RadekIncidentu = { id: string; kind: string; accused: string };
type RadekHrace = { id: string; first_name: string; last_name: string; nickname: string | null; avatar: string | null };

export async function ozviSeObvineni(
  env: Bindings, t: { teamId: string; gameDate: string; seasonNumber: number }, opts: { denObvineni?: string } = {},
): Promise<number> {
  // Bez modelu by hráč napsal a na odpověď trenéra už by nikdo nereagoval.
  if (!(await isAiEnabled(env))) return 0;
  const db = env.DB;
  const den = opts.denObvineni ?? denPlus(t.gameDate, -1);

  const rows = await db.prepare(
    `SELECT id, kind, accused FROM club_incidents
      WHERE team_id = ? AND season_number = ? AND accusations > 0 AND game_date >= ?`,
  ).bind(t.teamId, t.seasonNumber, gameExpiry(t.gameDate, -OKNO_VLIVU_DNI)).all<RadekIncidentu>()
    .catch((e) => { logger.warn({ module: M }, `obvinění ${t.teamId}`, e); return null; });

  let ozvalo = 0;
  for (const inc of rows?.results ?? []) {
    for (const o of nactiObvineni(inc.accused)) {
      if (o.den !== den || o.vysledek !== "zapira") continue;
      if (await otevriKrivdu(db, t.teamId, inc, o.playerId)) ozvalo++;
    }
  }
  return ozvalo;
}

async function otevriKrivdu(db: D1Database, teamId: string, inc: RadekIncidentu, playerId: string): Promise<boolean> {
  const hrac = await db.prepare(
    `SELECT id, first_name, last_name, nickname, avatar FROM players
      WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')`,
  ).bind(playerId, teamId).first<RadekHrace>()
    .catch((e) => { logger.warn({ module: M }, `obviněný hráč ${playerId}`, e); return null; });
  if (!hrac) return false;

  const ref = { id: hrac.id, firstName: hrac.first_name, lastName: hrac.last_name, nickname: hrac.nickname, avatar: hrac.avatar };
  const convId = await getOrCreatePlayerConversation(db, teamId, ref)
    .catch((e) => { logger.warn({ module: M }, `konverzace s obviněným ${playerId}`, e); return null; });
  if (!convId) return false;

  // Běžící rozhovor se nepřebíjí. Vlákno se zabírá dřív, než hráč napíše.
  const ted = new Date().toISOString();
  const narok = await db.prepare(
    `UPDATE conversations SET ai_thread_active = 1, ai_thread_last_at = ?, ai_thread_state = ?
      WHERE id = ? AND ai_thread_active != 1`,
  ).bind(ted, JSON.stringify({
    trigger: "krivde_obvineny", scenario_id: "krivde_obvineny", max_replies: 2, current_replies: 0,
    awaiting: "coach", initiated_at: ted, player_id: playerId, resolution: null,
  }), convId).run()
    .catch((e) => { logger.warn({ module: M }, `vlákno křivdy ${convId}`, e); return null; });
  if ((narok?.meta?.changes ?? 0) === 0) return false;

  const rng = createRng(seedFromString(`krivda|${inc.id}|${playerId}`));
  await sendPlayerSMS(db, teamId, ref, text(rng, "krivda_obvineny", { nazev: nazevIncidentu(inc.kind) }), smsIncidentu(inc.id))
    .catch((e) => logger.warn({ module: M }, `SMS křivdy ${inc.id}`, e));
  return true;
}
