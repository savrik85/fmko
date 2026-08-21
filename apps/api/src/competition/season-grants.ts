/**
 * Dotace, které se vyplácejí až na konci sezóny.
 *
 * Sezónní ceny a rozdělení přebytku se odhlasují kdykoli během sezóny, ale
 * vyplatit je dřív nejde: cena za fair play se počítá z odehraných zápasů
 * a přebytek se pozná až po výplatě odměn za umístění.
 *
 * Běží proto ve fázi `rewards` konce sezóny, hned po odměnách — z pokladny se
 * rozdává jen to, co po nich opravdu zbylo.
 */

import { logger } from "../lib/logger";
import { readBalance } from "./ledger";
import { GRANT_LABEL, SURPLUS_MAX_PCT, payGrants, seasonAwards, type GrantKind } from "./grants";
import { loadGovernance } from "./rules";

const M = "competition-season-grants";

interface PassedGrant {
  id: string;
  payload: string;
}

export interface SeasonGrantResult {
  kind: GrantKind;
  vyplaceno: number;
  polozek: number;
}

/**
 * Vyplatí odhlasované sezónní ceny a přebytek.
 *
 * Pořadí je dané: nejdřív ceny (mají pevnou částku a měřitelného vítěze), teprve
 * pak přebytek, který se počítá z toho, co po nich zůstalo. Obráceně by přebytek
 * spolkl peníze, na které už soutěž měla závazek.
 */
export async function paySeasonEndGrants(db: D1Database, opts: {
  leagueId: string;
  seasonNumber: number;
  level: string;
  gameDate: string;
}): Promise<SeasonGrantResult[]> {
  const gov = await loadGovernance(db, opts.leagueId);
  if (!gov?.enabled) return [];

  const passed = await db.prepare(
    `SELECT id, payload FROM competition_proposals
      WHERE league_id = ? AND kind = 'grant' AND status = 'passed' AND season_number = ?
      ORDER BY closed_at ASC`
  ).bind(opts.leagueId, opts.seasonNumber).all<PassedGrant>()
    .catch((e) => { logger.warn({ module: M }, "schválené dotace", e); return { results: [] }; });

  const out: SeasonGrantResult[] = [];

  // Nejdřív ceny, pak přebytek — viz komentář v hlavičce.
  for (const faze of ["award", "surplus"] as const) {
    for (const row of passed.results) {
      let payload: { grantKind?: string; amount?: number; targetTeamId?: string | null } = {};
      try { payload = JSON.parse(row.payload || "{}"); }
      catch (e) { logger.warn({ module: M }, `payload dotace ${row.id}`, e); continue; }
      if (payload.grantKind !== faze) continue;

      const amount = Math.round(Number(payload.amount) || 0);
      if (amount <= 0) continue;

      const zbyva = await readBalance(db, opts.leagueId);
      if (zbyva <= 0) {
        logger.warn({ module: M }, `soutěž ${opts.leagueId}: na ${GRANT_LABEL[faze]} už v pokladně nic nezbylo`);
        continue;
      }

      if (faze === "award") {
        const ceny = await seasonAwards(db, {
          leagueId: opts.leagueId, seasonNumber: opts.seasonNumber, amountPerAward: amount,
        });
        if (ceny.length === 0) continue;

        // Kdyby na všechny ceny nebylo, vyplatí se poměrně — nikdo nesmí přijít
        // zkrátka jen proto, že se jmenuje později v abecedě.
        const potreba = ceny.length * amount;
        const pomer = potreba > zbyva ? zbyva / potreba : 1;
        let vyplaceno = 0;
        for (const [i, cena] of ceny.entries()) {
          vyplaceno += await payGrants(db, {
            leagueId: opts.leagueId, seasonNumber: opts.seasonNumber, kind: "award",
            referenceKey: `${row.id}-${i}`, gameDate: opts.gameDate,
            description: cena.title,
            payments: [{ teamId: cena.teamId, amount: Math.floor(cena.amount * pomer) }],
          });
        }
        out.push({ kind: "award", vyplaceno, polozek: ceny.length });
        continue;
      }

      // Přebytek: rozdělí se procento z toho, co v pokladně zbylo, ale nikdy víc
      // než strop. Zbytek musí soutěži zůstat na rozjezd příští sezóny.
      const pct = Math.min(SURPLUS_MAX_PCT, Math.max(0, amount));
      const kDeleni = Math.floor(zbyva * pct / 100);
      if (kDeleni <= 0) continue;

      const kluby = await db.prepare(
        `SELECT id FROM teams
          WHERE league_id = ? AND team_type = 'senior' AND parent_team_id IS NULL
          ORDER BY id`
      ).bind(opts.leagueId).all<{ id: string }>()
        .catch((e) => { logger.warn({ module: M }, "kluby pro přebytek", e); return { results: [] }; });
      if (kluby.results.length === 0) continue;

      const podil = Math.floor(kDeleni / kluby.results.length);
      if (podil <= 0) continue;

      const vyplaceno = await payGrants(db, {
        leagueId: opts.leagueId, seasonNumber: opts.seasonNumber, kind: "surplus",
        referenceKey: row.id, gameDate: opts.gameDate,
        description: `Podíl z přebytku pokladny (${pct} %)`,
        payments: kluby.results.map((t) => ({ teamId: t.id, amount: podil })),
      });
      out.push({ kind: "surplus", vyplaceno, polozek: kluby.results.length });
    }
  }

  if (out.length > 0) {
    const celkem = out.reduce((s, o) => s + o.vyplaceno, 0);
    logger.info({ module: M }, `soutěž ${opts.leagueId}: sezónní dotace ${celkem} Kč v ${out.length} položkách`);
  }
  return out;
}
