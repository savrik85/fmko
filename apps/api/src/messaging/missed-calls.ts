/**
 * Zmeškané hovory: sestavení stavu, zápis a čtení.
 *
 * Stav se skládá z věcí, které o klubu stejně víme. Nic se kvůli hovorům
 * nepočítá navíc, jen se to jinak podá.
 */

import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { logger } from "../lib/logger";
import { kdoVolal, type StavHovoru, type Hovor } from "../engine/missed-calls";
import type { FanGroupRow } from "../fans/fan-group-generator";

const M = "missed-calls";

export interface HovorRow {
  id: string;
  volajici: string;
  jmeno: string;
  duvod: string;
  pocet: number;
  game_date: string;
  seen: number;
  created_at: string;
}

/** Zmeškané hovory klubu, od nejnovějších. */
export async function nactiHovory(db: D1Database, teamId: string, limit = 20): Promise<HovorRow[]> {
  const rows = await db.prepare(
    "SELECT * FROM missed_calls WHERE team_id = ? ORDER BY created_at DESC LIMIT ?",
  ).bind(teamId, Math.max(1, Math.min(50, limit))).all<HovorRow>()
    .catch((e) => { logger.warn({ module: M }, `hovory ${teamId}`, e); return { results: [] as HovorRow[] }; });
  return rows.results ?? [];
}

/** Kolik hovorů hráč ještě neviděl. Jde do odznaku. */
export async function neprectenychHovoru(db: D1Database, teamId: string): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM missed_calls WHERE team_id = ? AND seen = 0")
    .bind(teamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "počet hovorů", e); return null; });
  return r?.n ?? 0;
}

/** Seznam otevřen, hovory přestávají svítit. */
export async function oznacHovoryPrectene(db: D1Database, teamId: string): Promise<void> {
  await db.prepare("UPDATE missed_calls SET seen = 1 WHERE team_id = ? AND seen = 0")
    .bind(teamId).run()
    .catch((e) => { logger.warn({ module: M }, "označení hovorů", e); });
}

/**
 * Jeden herní den hovorů.
 *
 * `INSERT OR IGNORE` na (tým, volající, den): když tick doběhne dvakrát,
 * nenasype deset stejných zmeškaných hovorů.
 */
export async function tikHovoru(
  db: D1Database,
  teamId: string,
  groups: readonly FanGroupRow[],
  gameDate: string,
): Promise<Hovor[]> {
  // Rezervě nikdo nevolá. Nemá sponzora, nemá kotel a starosta řeší áčko.
  const druh = await db.prepare("SELECT team_type FROM teams WHERE id = ?")
    .bind(teamId).first<{ team_type: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "druh týmu", e); return null; });
  if (druh?.team_type === "u21") return [];

  const stav = await sestavStav(db, teamId, groups);
  const rng = createRng(seedFromString(`hovory|${teamId}|${gameDate.slice(0, 10)}`));
  const hovory = kdoVolal(stav, rng.random());
  if (hovory.length === 0) return [];

  const den = gameDate.slice(0, 10);
  const stmts = hovory.map((h) => db.prepare(
    `INSERT OR IGNORE INTO missed_calls (id, team_id, volajici, jmeno, duvod, pocet, game_date)
     VALUES (?,?,?,?,?,?,?)`,
  ).bind(`call-${teamId}-${h.volajici}-${den}`, teamId, h.volajici, h.jmeno, h.duvod, h.pocet, gameDate));

  await db.batch(stmts).catch((e) => { logger.warn({ module: M }, `zápis hovorů ${teamId}`, e); });

  // Staré hovory se nedrží. Zmeškaný hovor z minulého měsíce nikoho nezajímá.
  await db.prepare(
    "DELETE FROM missed_calls WHERE team_id = ? AND created_at < datetime('now', '-14 days')",
  ).bind(teamId).run().catch((e) => logger.warn({ module: M }, "úklid hovorů", e));

  return hovory;
}

async function sestavStav(
  db: D1Database,
  teamId: string,
  groups: readonly FanGroupRow[],
): Promise<StavHovoru> {
  const kotel = groups.find((g) => g.kind === "kotel") ?? groups[0] ?? null;

  const [vudce, kampan, sponzor, pokuta, hrac, obec, forma] = await Promise.all([
    kotel
      ? db.prepare("SELECT first_name, last_name FROM fan_leaders WHERE group_id = ? AND status = 'active' LIMIT 1")
          .bind(kotel.id).first<{ first_name: string; last_name: string }>()
          .catch((e) => { logger.warn({ module: M }, "vůdce kotle", e); return null; })
      : Promise.resolve(null),
    db.prepare("SELECT 1 AS x FROM fan_campaigns WHERE team_id = ? AND kind = 'trener_ven' AND status IN ('sbira','splnena')")
      .bind(teamId).first<{ x: number }>()
      .catch((e) => { logger.warn({ module: M }, "kampaň", e); return null; }),
    db.prepare("SELECT sponsor_name FROM sponsor_contracts WHERE team_id = ? AND status = 'active' ORDER BY monthly_amount DESC LIMIT 1")
      .bind(teamId).first<{ sponsor_name: string }>()
      .catch((e) => { logger.warn({ module: M }, "sponzor", e); return null; }),
    db.prepare("SELECT COALESCE(SUM(fine),0) AS f FROM fan_incidents WHERE team_id = ? AND created_at > datetime('now','-2 days')")
      .bind(teamId).first<{ f: number }>()
      .catch((e) => { logger.warn({ module: M }, "pokuty", e); return null; }),
    db.prepare(
      `SELECT first_name, last_name FROM players
        WHERE team_id = ? AND status = 'active'
        ORDER BY COALESCE(json_extract(life_context, '$.morale'), 50) ASC LIMIT 1`,
    ).bind(teamId).first<{ first_name: string; last_name: string }>()
      .catch((e) => { logger.warn({ module: M }, "naštvaný hráč", e); return null; }),
    db.prepare("SELECT v.name FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?")
      .bind(teamId).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: M }, "obec", e); return null; }),
    (await import("../fans/fan-banner")).formaKlubu(db, teamId),
  ]);

  return {
    vudceKotle: vudce ? `${vudce.first_name} ${vudce.last_name}` : null,
    heatKotle: kotel?.heat ?? 0,
    kampanProtiTreneru: !!kampan,
    serie: forma.serie,
    sponzor: sponzor?.sponsor_name ?? null,
    pokutaZaBordel: pokuta?.f ?? 0,
    // Hráč volá jen občas, ne každý den. Jinak by to zevšednělo.
    nastvanyHrac: hrac && forma.serie <= -2 ? `${hrac.first_name} ${hrac.last_name}` : null,
    obec: obec?.name ?? null,
  };
}
