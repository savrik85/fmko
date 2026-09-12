/**
 * Jak si klub vede teď, jedním číslem.
 *
 * Vzniklo kvůli konkrétní chybě: vliv trenéra na fanoušky počítal jen
 * z kariéry a povahy, takže nováček vedoucí ligu byl pro tribunu „odepsaný"
 * a vyhořelý matador na posledním místě „uznávaný". Aby se to dalo spravit,
 * musí mít všichni tři volající (pozápasová spokojenost, denní drift loajality
 * a stránka fanoušků) stejné číslo ze stejného zdroje.
 */

import { formaSkore } from "@okresni-masina/shared";
import { logger } from "./logger";

const M = "forma-klubu";

export interface FormaKlubu {
  vyher: number;
  remiz: number;
  proher: number;
  pozice: number | null;
  tymu: number | null;
  /** 0–100 pro `managerInfluence`. */
  skore: number;
}

/** Neutrál, když se nedá nic spočítat. Ne nula: nula by znamenala „je to zlé". */
export const NEUTRALNI_FORMA: FormaKlubu = {
  vyher: 0, remiz: 0, proher: 0, pozice: null, tymu: null, skore: 50,
};

/**
 * Posledních pět ligových zápasů a postavení v tabulce.
 *
 * Jeden dotaz na výsledky, jeden na pozici. Nepoužívá `calculateStandings`,
 * protože ta počítá celou tabulku včetně skóre a tady stačí pořadí podle bodů.
 */
export async function nactiFormuKlubu(db: D1Database, teamId: string): Promise<FormaKlubu> {
  const zapasy = await db
    .prepare(
      `SELECT home_team_id, home_score, away_score FROM matches
       WHERE (home_team_id = ? OR away_team_id = ?) AND home_score IS NOT NULL
       ORDER BY COALESCE(simulated_at, created_at) DESC LIMIT 5`,
    )
    .bind(teamId, teamId)
    .all<{ home_team_id: string; home_score: number; away_score: number }>()
    .catch((e) => { logger.warn({ module: M }, `forma týmu ${teamId}`, e); return null; });
  if (!zapasy) return { ...NEUTRALNI_FORMA };

  let vyher = 0, remiz = 0, proher = 0;
  for (const m of zapasy.results) {
    const doma = m.home_team_id === teamId;
    const gf = doma ? m.home_score : m.away_score;
    const ga = doma ? m.away_score : m.home_score;
    if (gf > ga) vyher++;
    else if (gf < ga) proher++;
    else remiz++;
  }

  const { pozice, tymu } = await nactiPozici(db, teamId);
  return { vyher, remiz, proher, pozice, tymu, skore: formaSkore({ vyher, remiz, proher, pozice, tymu }) };
}

/**
 * Pořadí v lize podle bodů.
 *
 * Body se počítají z odehraných zápasů aktuální sezóny; remíza 1, výhra 3.
 * Skóre se pro pořadí neřeší, pro účel „jak vysoko jsme" to stačí.
 */
async function nactiPozici(db: D1Database, teamId: string): Promise<{ pozice: number | null; tymu: number | null }> {
  const liga = await db
    .prepare("SELECT league_id FROM teams WHERE id = ?")
    .bind(teamId).first<{ league_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "liga týmu", e); return null; });
  if (!liga?.league_id) return { pozice: null, tymu: null };

  const rows = await db
    .prepare(
      `SELECT t.id,
              SUM(CASE
                WHEN m.home_team_id = t.id AND m.home_score > m.away_score THEN 3
                WHEN m.away_team_id = t.id AND m.away_score > m.home_score THEN 3
                WHEN m.home_score = m.away_score THEN 1
                ELSE 0 END) AS body
       FROM teams t
       LEFT JOIN matches m
         ON (m.home_team_id = t.id OR m.away_team_id = t.id) AND m.home_score IS NOT NULL
       WHERE t.league_id = ?
       GROUP BY t.id`,
    )
    .bind(liga.league_id)
    .all<{ id: string; body: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "pořadí v lize", e); return null; });
  if (!rows || rows.results.length === 0) return { pozice: null, tymu: null };

  const serazene = [...rows.results].sort((a, b) => (b.body ?? 0) - (a.body ?? 0));
  const idx = serazene.findIndex((r) => r.id === teamId);
  return { pozice: idx >= 0 ? idx + 1 : null, tymu: serazene.length };
}

/**
 * Formy všech klubů najednou.
 *
 * Denní tick projíždí každý klub v lize; jeden dotaz na tým by znamenal stovky
 * čtení. Tohle načte body všech a poslední zápasy jedním dotazem.
 */
export async function nactiFormyVsech(db: D1Database): Promise<Map<string, FormaKlubu>> {
  const out = new Map<string, FormaKlubu>();

  const vysledky = await db
    .prepare(
      `SELECT home_team_id, away_team_id, home_score, away_score,
              COALESCE(simulated_at, created_at) AS kdy
       FROM matches WHERE home_score IS NOT NULL
       ORDER BY kdy DESC LIMIT 2000`,
    )
    .all<{ home_team_id: string; away_team_id: string; home_score: number; away_score: number }>()
    .catch((e) => { logger.warn({ module: M }, "formy všech", e); return null; });
  if (!vysledky) return out;

  // Posledních pět na tým, v pořadí od nejnovějšího.
  const podleTymu = new Map<string, Array<{ gf: number; ga: number }>>();
  for (const m of vysledky.results) {
    for (const [tid, gf, ga] of [
      [m.home_team_id, m.home_score, m.away_score],
      [m.away_team_id, m.away_score, m.home_score],
    ] as const) {
      const list = podleTymu.get(tid) ?? [];
      if (list.length < 5) { list.push({ gf, ga }); podleTymu.set(tid, list); }
    }
  }

  const tabulky = await db
    .prepare(
      `SELECT t.id, t.league_id,
              SUM(CASE
                WHEN m.home_team_id = t.id AND m.home_score > m.away_score THEN 3
                WHEN m.away_team_id = t.id AND m.away_score > m.home_score THEN 3
                WHEN m.home_score = m.away_score THEN 1
                ELSE 0 END) AS body
       FROM teams t
       LEFT JOIN matches m
         ON (m.home_team_id = t.id OR m.away_team_id = t.id) AND m.home_score IS NOT NULL
       GROUP BY t.id`,
    )
    .all<{ id: string; league_id: string | null; body: number | null }>()
    .catch((e) => { logger.warn({ module: M }, "tabulky všech lig", e); return null; });

  const podleLigy = new Map<string, Array<{ id: string; body: number }>>();
  for (const r of tabulky?.results ?? []) {
    if (!r.league_id) continue;
    const l = podleLigy.get(r.league_id) ?? [];
    l.push({ id: r.id, body: r.body ?? 0 });
    podleLigy.set(r.league_id, l);
  }
  const pozice = new Map<string, { pozice: number; tymu: number }>();
  for (const [, tymy] of podleLigy) {
    const s = [...tymy].sort((a, b) => b.body - a.body);
    s.forEach((t, i) => pozice.set(t.id, { pozice: i + 1, tymu: s.length }));
  }

  for (const [tid, zapasy] of podleTymu) {
    let vyher = 0, remiz = 0, proher = 0;
    for (const z of zapasy) {
      if (z.gf > z.ga) vyher++;
      else if (z.gf < z.ga) proher++;
      else remiz++;
    }
    const p = pozice.get(tid);
    out.set(tid, {
      vyher, remiz, proher,
      pozice: p?.pozice ?? null, tymu: p?.tymu ?? null,
      skore: formaSkore({ vyher, remiz, proher, pozice: p?.pozice ?? null, tymu: p?.tymu ?? null }),
    });
  }
  return out;
}
