/**
 * Transparent v kotli, když si ho píšou fanoušci.
 *
 * Posbírá stav, který o partách stejně víme (nálada, kampaně, rivalita,
 * miláček, série, střelba, taktika), a nechá `engine/fan-banner.ts` vybrat
 * heslo z ručně psaného katalogu. Model hesla psal dřív, ale skládal slova
 * bez smyslu a s patvary („SPŮLE JE NAŠE KRVOU, SRDCEM, DUŠÍ“). Přepočítává se v denním ticku, ne při zobrazení: nápis na plachtě se
 * nemá měnit pokaždé, když někdo otevře stránku stadionu.
 */

import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { logger } from "../lib/logger";
import { mozneTransparenty, vyberTransparent, type StavProTransparent } from "../engine/fan-banner";
import { rivaloveKlubu } from "./fan-rivalries";
import type { FanGroupRow } from "./fan-group-generator";
import type { FanGroupKind } from "../engine/fan-groups";

const M = "fan-banner";

/**
 * Přepočte nápis v kotli.
 *
 * Vrací nový text, když se změnil, jinak `null` — volající z toho udělá
 * příspěvek na Tribunu. Tichá výměna plachty by hráči utekla.
 */
export async function prepoctiTransparent(
  db: D1Database,
  teamId: string,
  groups: readonly FanGroupRow[],
  gameDate: string,
): Promise<{ text: string; duvod: string } | null> {
  const stadion = await db
    .prepare("SELECT ultras_text, ultras_text_duvod, ultras_stand FROM stadiums WHERE team_id = ?")
    .bind(teamId)
    .first<{ ultras_text: string | null; ultras_text_duvod: string | null; ultras_stand: number }>()
    .catch((e) => { logger.warn({ module: M }, `stadion ${teamId}`, e); return null; });
  if (!stadion) return null;
  // Bez kotle není kam plachtu pověsit. Ve 3D se sektor při úrovni 0 vůbec
  // nekreslí, takže by se počítal nápis, který nikdo nikdy neuvidí.
  if ((stadion.ultras_stand ?? 0) <= 0) return null;

  // Kotel drží plachtu. Když ho klub nemá, vezme se nejvášnivější parta.
  const parta = groups.find((g) => g.kind === "kotel")
    ?? [...groups].sort((a, b) => b.passion - a.passion)[0];
  if (!parta) return null;

  const [kampane, oblibenec, trener, rivalove, forma, taktika] = await Promise.all([
    db.prepare(
      "SELECT kind, target_name FROM fan_campaigns WHERE team_id = ? AND status IN ('sbira','splnena')",
    ).bind(teamId).all<{ kind: string; target_name: string }>()
      .catch((e) => { logger.warn({ module: M }, "kampaně pro transparent", e); return { results: [] as never[] }; }),
    db.prepare(
      `SELECT p.first_name, p.last_name FROM fan_group_players fgp
       JOIN players p ON p.id = fgp.player_id
       WHERE fgp.group_id = ? AND fgp.stance = 'oblibenec' AND p.status = 'active'`,
    ).bind(parta.id).first<{ first_name: string; last_name: string }>()
      .catch((e) => { logger.warn({ module: M }, "miláček pro transparent", e); return null; }),
    db.prepare("SELECT name FROM managers WHERE team_id = ?").bind(teamId).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: M }, "trenér pro transparent", e); return null; }),
    rivaloveKlubu(db, teamId, gameDate, 1),
    formaKlubu(db, teamId),
    db.prepare("SELECT tactic FROM teams WHERE id = ?").bind(teamId).first<{ tactic: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "taktika pro transparent", e); return null; }),
  ]);

  // Na plachtě se klub i rival jmenují podle obce. Celý název nese sponzora.
  const obce = await obceKlubu(db, [teamId, ...(rivalove[0] ? [rivalove[0].teamId] : [])]);
  const rivalObec = rivalove[0] ? (obce.get(rivalove[0].teamId) ?? rivalove[0].name) : null;

  const protiHraci = kampane.results.find((k) => k.kind === "hrac_ven");
  const stav: StavProTransparent = {
    naladaKotle: parta.mood,
    heatKotle: parta.heat,
    kampanProtiTreneru: kampane.results.some((k) => k.kind === "trener_ven"),
    kampanProtiHraci: protiHraci?.target_name ?? null,
    oblibenec: oblibenec ? `${oblibenec.first_name} ${oblibenec.last_name}` : null,
    trener: trener?.name ?? null,
    rival: rivalove[0] && rivalObec ? { nazev: rivalObec, heat: rivalove[0].heat } : null,
    serie: forma.serie,
    golyPoslednich5: forma.goly,
    taktika: taktika?.tactic ?? null,
    kind: parta.kind as FanGroupKind,
    obec: obce.get(teamId) ?? null,
  };

  // Seed z herního dne, ne z času: nápis se smí měnit ze dne na den, ne mezi
  // dvěma načteními stránky.
  const rng = createRng(seedFromString(`banner|${teamId}|${gameDate.slice(0, 10)}`));
  const sablona = vyberTransparent(stav, rng.random());

  // Plachta visí, dokud platí důvod. Heslo se losuje každý den znovu, takže bez
  // téhle podmínky by se měnilo KAŽDÝ DEN a každý den by o tom přišel příspěvek
  // na Tribunu. Plachta se přepisuje, když se změní důvod, ne když se přetočí
  // kalendář. Výjimka: text, který katalog pro dnešní stav vůbec nezná (hesla
  // od modelu z dřívějška), jde dolů i beze změny důvodu.
  const zKatalogu = !!stadion.ultras_text && mozneTransparenty(stav).includes(stadion.ultras_text);
  if (stadion.ultras_text && stadion.ultras_text_duvod === sablona.duvod && zKatalogu) return null;
  if (stadion.ultras_text && !zKatalogu) {
    logger.info({ module: M, teamId }, `plachta „${stadion.ultras_text}" není z katalogu, jde dolů`);
  }
  const t = sablona;

  await db
    .prepare("UPDATE stadiums SET ultras_text = ?, ultras_text_duvod = ? WHERE team_id = ?")
    .bind(t.text, t.duvod, teamId)
    .run()
    .catch((e) => { logger.warn({ module: M }, `zápis transparentu ${teamId}`, e); });

  logger.info({ module: M, teamId }, `nový transparent: „${t.text}" (${t.tone})`);
  return { text: t.text, duvod: t.duvod };
}

/**
 * Forma klubu: série výher nebo proher a kolik dal gólů za posledních pět
 * zápasů. Kotel má názor na obojí.
 */
export async function formaKlubu(db: D1Database, teamId: string): Promise<{ serie: number; goly: number; zapasu: number }> {
  const rows = await db
    .prepare(
      `SELECT home_team_id, away_team_id, home_score, away_score
       FROM matches
       WHERE (home_team_id = ? OR away_team_id = ?) AND home_score IS NOT NULL
       ORDER BY COALESCE(simulated_at, created_at) DESC LIMIT 5`,
    )
    .bind(teamId, teamId)
    .all<{ home_team_id: string; away_team_id: string; home_score: number; away_score: number }>()
    .catch((e) => { logger.warn({ module: M }, `forma ${teamId}`, e); return { results: [] as never[] }; });

  let serie = 0;
  let goly = 0;
  let ukoncena = false;
  for (const m of rows.results) {
    const doma = m.home_team_id === teamId;
    const gf = doma ? m.home_score : m.away_score;
    const ga = doma ? m.away_score : m.home_score;
    goly += gf;
    if (ukoncena) continue;
    if (gf > ga) {
      if (serie < 0) { ukoncena = true; continue; }
      serie++;
    } else if (gf < ga) {
      if (serie > 0) { ukoncena = true; continue; }
      serie--;
    } else {
      ukoncena = true;
    }
  }
  return { serie, goly, zapasu: rows.results.length };
}

/** Obce klubů podle id. Kluby bez obce ve výsledku chybí. */
async function obceKlubu(db: D1Database, teamIds: string[]): Promise<Map<string, string>> {
  const rows = await db.prepare(
    `SELECT t.id, v.name FROM teams t JOIN villages v ON v.id = t.village_id
      WHERE t.id IN (${teamIds.map(() => "?").join(",")})`,
  ).bind(...teamIds).all<{ id: string; name: string }>()
    .catch((e) => { logger.warn({ module: M }, "obce klubů pro transparent", e); return { results: [] as never[] }; });
  return new Map(rows.results.map((r) => [r.id, r.name]));
}
