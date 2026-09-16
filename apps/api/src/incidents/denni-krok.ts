/**
 * Incidenty jednoho klubu za jeden herní den (spec Část 6b, fáze 1 a 2).
 * Volá `processTeamDay`. AI kluby a rezervy U21 se ve fázi 1 přeskakují.
 */

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { oznamIncident, zapisIncident } from "./dopady";
import { vylosujIncident } from "./losovani";
import { nactiStavKlubu } from "./stav-klubu";
import { zpracujVysetrovani } from "./vysetrovani-den";

const M = "incidents-den";

export async function zpracujIncidentyDne(env: Bindings, team: Record<string, unknown>, gameDate: string): Promise<void> {
  if (team.user_id === "ai" || team.team_type === "u21") return;
  const teamId = team.id as string;

  const sezona = await env.DB.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>()
    .catch((e) => { logger.warn({ module: M }, "aktivní sezóna", e); return null; });
  if (!sezona) return;

  // Nejdřív vyšetřování: výsledky policie, propadlé lhůty (uvolní limit otevřených
  // problémů) a v pondělí srážky ze mzdy.
  await zpracujVysetrovani(env, { teamId, gameDate, seasonNumber: sezona.number }, { pondeli: new Date(gameDate).getUTCDay() === 1 });

  const stav = await nactiStavKlubu(env.DB, { id: teamId, league_id: (team.league_id as string | null) ?? null }, gameDate, sezona.number);
  if (!stav) return;

  const rng = createRng(seedFromString(`incident|${teamId}|${stav.den}`));
  const navrh = vylosujIncident(stav, rng);
  if (!navrh) return;

  const zapsany = await zapisIncident(env.DB, stav, navrh);
  if (!zapsany) return;
  await oznamIncident(env, teamId, navrh, zapsany);
  logger.info({ module: M, teamId }, `incident ${navrh.kind}, pachatel ${navrh.culpritType}, stop nalezeno ${zapsany.nalezeneStopy.length}`);
}
