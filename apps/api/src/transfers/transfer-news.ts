/**
 * Zpravodajské články o přestupech — generuje české texty s okresním humorem.
 */

import { logger } from "../lib/logger";
import type { Rng } from "../generators/rng";

const HUMOR = [
  "Rekordní přestup okresu!",
  "Spoluhráči mu na rozloučenou koupili klobásu.",
  "Prý mu slíbili, že bude kopat penalty.",
  "Přestupová bomba otřásla okresním fotbalem.",
  "Za ty prachy si koupíš maximálně sud piva.",
  "V hospodě se o ničem jiném nemluví.",
  "Trenér si mne ruce.",
  "Fanoušci jsou nadšení — oba dva.",
];

export async function createTransferNews(
  db: D1Database,
  leagueId: string,
  teamId: string | null,
  type: string,
  data: {
    playerName: string;
    playerAge: number;
    playerPosition: string;
    teamName: string;
    fromTeamName?: string;
    toTeamName?: string;
    fee?: number;
    reason?: string;
  },
  rng?: { pick: <T>(arr: T[]) => T },
): Promise<void> {
  let headline = "";
  let body = "";
  const pick = rng?.pick.bind(rng) ?? ((arr: string[]) => arr[Math.floor(Math.random() * arr.length)]);
  const humor = pick(HUMOR);

  switch (type) {
    case "player_released":
      headline = `${data.teamName} se rozloučil s ${data.playerName}`;
      body = `Vedení ${data.teamName} se rozhodlo uvolnit ${data.playerName} (${data.playerAge}, ${data.playerPosition}). ${data.reason ?? "Důvody nejsou známy."} Je teď volný hráč.`;
      break;

    case "player_signed":
      headline = `${data.playerName} posílí kádr ${data.teamName}`;
      body = `${data.playerName} (${data.playerAge}, ${data.playerPosition}) podepsal za ${data.teamName}. ${humor}`;
      break;

    case "player_quit":
      headline = `${data.playerName} přestal chodit na tréninky`;
      body = `Fotbalista ${data.teamName} ${data.playerName} (${data.playerAge}) přestal docházet. ${data.reason ?? "Prý ho to nebaví."}`;
      break;

    case "transfer_completed":
      headline = `Přestup! ${data.playerName} míří z ${data.fromTeamName} do ${data.toTeamName}`;
      body = `${data.playerName} (${data.playerAge}, ${data.playerPosition}) přestupuje z ${data.fromTeamName} do ${data.toTeamName}${data.fee ? ` za ${data.fee.toLocaleString("cs")} Kč` : ""}. ${humor}`;
      break;

    case "player_listed":
      headline = `${data.teamName} nabízí ${data.playerName} na přestup`;
      body = `Na přestupovém trhu se objevil ${data.playerName} (${data.playerAge}, ${data.playerPosition}) z ${data.teamName}. Požadovaná cena: ${(data.fee ?? 0).toLocaleString("cs")} Kč.`;
      break;

    case "player_sold":
      headline = `${data.playerName} prodán za ${(data.fee ?? 0).toLocaleString("cs")} Kč`;
      body = `${data.toTeamName} koupil ${data.playerName} od ${data.fromTeamName}. ${humor}`;
      break;

    default:
      return;
  }

  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO news (id, league_id, team_id, type, headline, body, created_at) VALUES (?, ?, ?, 'transfer', ?, ?, datetime('now'))"
  ).bind(id, leagueId, teamId, headline, body).run().catch((e) => logger.warn({ module: "transfer-news" }, "insert news", e));
}
