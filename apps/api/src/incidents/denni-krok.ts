/**
 * Incidenty jednoho klubu za jeden herní den (spec Část 6b, fáze 1 a 2).
 * Volá `processTeamDay`. AI kluby a rezervy U21 se ve fázi 1 přeskakují.
 */

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { vystavKradeneZbozi } from "./bazar-db";
import { oznamIncident, zapisIncident } from "./dopady";
import { vyhodnotHrozici } from "./hrozi-db";
import { ozviSeObvineni } from "./krivda";
import { vylosujIncident } from "./losovani";
import { propadleZalohy, ukonciSituace, zalozSituaci } from "./situace-db";
import { vylosujSituaci } from "./situace";
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

  // Den po zapřeném obvinění se hráč ozve sám (spec 17d).
  await ozviSeObvineni(env, { teamId, gameDate, seasonNumber: sezona.number })
    .catch((e) => logger.warn({ module: M, teamId }, "ozvání obviněných", e));

  // Kradené zboží, kterému nastal den bazaru (spec 6b krok 6). Až po policii: dopadený zloděj věci vrátil.
  await vystavKradeneZbozi(env, { teamId, gameDate, seasonNumber: sezona.number })
    .catch((e) => logger.warn({ module: M, teamId }, "kradené zboží do bazaru", e));

  const stav = await nactiStavKlubu(env.DB, { id: teamId, league_id: (team.league_id as string | null) ?? null }, gameDate, sezona.number);
  if (!stav) return;

  // Činy ohlášené v hospodě, kterým vypršela lhůta (spec 9a). Stal-li se některý, dnes se nový problém nelosuje.
  const splneno = await vyhodnotHrozici(env, stav)
    .catch((e) => { logger.warn({ module: M, teamId }, "hrozící činy", e); return 0; });
  if (splneno > 0) return;

  // Konec životních situací a propadlé lhůty na zálohu (spec 6b krok 4).
  await ukonciSituace(env, { teamId, gameDate }).catch((e) => logger.warn({ module: M, teamId }, "konec situací", e));
  await propadleZalohy(env, { teamId, gameDate }).catch((e) => logger.warn({ module: M, teamId }, "propadlé zálohy", e));

  const rng = createRng(seedFromString(`incident|${teamId}|${stav.den}`));
  const navrh = vylosujIncident(stav, rng);
  if (!navrh) {
    // Žádný problém: může přijít životní situace (spec 4c).
    const situace = vylosujSituaci(stav, createRng(seedFromString(`situace|${teamId}|${stav.den}`)));
    if (situace) {
      const id = await zalozSituaci(env, stav, situace)
        .catch((e) => { logger.warn({ module: M, teamId }, "založení situace", e); return null; });
      if (id) logger.info({ module: M, teamId }, `situace ${situace.kind} pro hráče ${situace.subjectPlayerId}`);
    }
    return;
  }
  const zapsany = await zapisIncident(env.DB, stav, navrh);
  if (!zapsany) return;
  await oznamIncident(env, teamId, navrh, zapsany);
  logger.info({ module: M, teamId }, `incident ${navrh.kind}, pachatel ${navrh.culpritType}, stop nalezeno ${zapsany.nalezeneStopy.length}`);
}
