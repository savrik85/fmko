/**
 * Chorály v databázi.
 *
 * Denní tick se podívá, co z dnešního stavu dává smysl, a porovná to s tím, co
 * se už zpívá. Nové založí, těm, jejichž důvod trvá, přidá na síle, a ty, na
 * které se zapomnělo, uzavře.
 *
 * Chorál je záměrně trvalejší než příspěvek na Tribuně: „tohle se u nás zpívá
 * od podzimu" je jiná informace než „někdo to jednou napsal".
 */

import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import { logger } from "../lib/logger";
import {
  vymysliChoraly, silaPo, PRAH_ZAPOMENUTI, chantSilaWord,
  type ChantStav, type ChantKind,
} from "../engine/fan-chants";
import { rivaloveKlubu } from "./fan-rivalries";
import type { FanGroupRow } from "./fan-group-generator";

const M = "fan-chants";

export interface ChantRow {
  id: string;
  team_id: string;
  group_id: string | null;
  kind: string;
  text: string;
  duvod: string;
  sila: number;
  since_game_date: string | null;
  status: string;
}

/** Co se u klubu zpívá. Seřazeno od nejhlasitějšího. */
export async function nactiChoraly(db: D1Database, teamId: string): Promise<Array<ChantRow & { silaWord: string }>> {
  const rows = await db
    .prepare("SELECT * FROM fan_chants WHERE team_id = ? AND status = 'zpiva' ORDER BY sila DESC")
    .bind(teamId)
    .all<ChantRow>()
    .catch((e) => { logger.warn({ module: M }, `chorály ${teamId}`, e); return { results: [] as ChantRow[] }; });
  return rows.results.map((r) => ({ ...r, silaWord: chantSilaWord(r.sila) }));
}

/**
 * Jeden herní den chorálů.
 *
 * Vrací nově vzniklé, aby se o nich dalo napsat na Tribunu. Zapomenuté se
 * nehlásí: na to, že se něco přestalo zpívat, nikdo transparent nevěší.
 */
export async function tikChoralu(
  db: D1Database,
  teamId: string,
  groups: readonly FanGroupRow[],
  gameDate: string,
): Promise<Array<{ kind: ChantKind; text: string; duvod: string }>> {
  const kotel = groups.find((g) => g.kind === "kotel") ?? groups[0];
  if (!kotel) return [];

  const stav = await sestavStav(db, teamId, kotel, gameDate);
  const rng = createRng(seedFromString(`chorál|${teamId}|${gameDate.slice(0, 10)}`));
  const navrhy = vymysliChoraly(stav, rng.random());
  const podleDruhu = new Map(navrhy.map((n) => [n.kind, n]));

  const zive = await db
    .prepare("SELECT * FROM fan_chants WHERE team_id = ? AND status = 'zpiva'")
    .bind(teamId).all<ChantRow>()
    .catch((e) => { logger.warn({ module: M }, `živé chorály ${teamId}`, e); return { results: [] as ChantRow[] }; });

  const stmts: D1PreparedStatement[] = [];
  const nove: Array<{ kind: ChantKind; text: string; duvod: string }> = [];

  // Co se už zpívá: buď důvod trvá a sílí, nebo slábne a zapomene se.
  for (const z of zive.results) {
    const navrh = podleDruhu.get(z.kind as ChantKind);
    const trva = !!navrh;
    const sila = silaPo(z.sila, trva);

    if (sila < PRAH_ZAPOMENUTI) {
      stmts.push(db.prepare(
        "UPDATE fan_chants SET status = 'zapomenut', sila = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?",
      ).bind(sila, z.id));
      continue;
    }
    // Text se mění, jen když se změnil důvod: jinak by se chorál přepisoval
    // každý den a „zpívá se od podzimu" by nic neznamenalo.
    const novyText = navrh && navrh.duvod !== z.duvod ? navrh.text : z.text;
    const novyDuvod = navrh?.duvod ?? z.duvod;
    stmts.push(db.prepare(
      `UPDATE fan_chants SET sila = ?, text = ?, duvod = ?, last_game_date = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
    ).bind(sila, novyText, novyDuvod, gameDate, z.id));
    podleDruhu.delete(z.kind as ChantKind);
  }

  // Co zbylo, je nové.
  for (const [kind, n] of podleDruhu) {
    stmts.push(db.prepare(
      `INSERT OR IGNORE INTO fan_chants
         (id, team_id, group_id, kind, text, duvod, sila, since_game_date, last_game_date, status)
       VALUES (?,?,?,?,?,?,?,?,?, 'zpiva')`,
    ).bind(
      `chant-${teamId}-${kind}-${gameDate.slice(0, 10)}`, teamId, kotel.id,
      kind, n.text, n.duvod, n.sila, gameDate, gameDate,
    ));
    nove.push({ kind, text: n.text, duvod: n.duvod });
  }

  if (stmts.length > 0) {
    await db.batch(stmts).catch((e) => { logger.warn({ module: M }, `zápis chorálů ${teamId}`, e); });
  }
  return nove;
}

/** Stav, ze kterého se chorály rodí. */
async function sestavStav(
  db: D1Database,
  teamId: string,
  kotel: FanGroupRow,
  gameDate: string,
): Promise<ChantStav> {
  const [tym, oblibenec, trener, kampan, rivalove, forma, stiznost] = await Promise.all([
    db.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: M }, "název klubu", e); return null; }),
    db.prepare(
      `SELECT p.first_name, p.last_name FROM fan_group_players fgp
       JOIN players p ON p.id = fgp.player_id
       WHERE fgp.group_id = ? AND fgp.stance = 'oblibenec' AND p.status = 'active'`,
    ).bind(kotel.id).first<{ first_name: string; last_name: string }>()
      .catch((e) => { logger.warn({ module: M }, "miláček pro chorál", e); return null; }),
    db.prepare("SELECT name FROM managers WHERE team_id = ?").bind(teamId).first<{ name: string }>()
      .catch((e) => { logger.warn({ module: M }, "trenér pro chorál", e); return null; }),
    db.prepare(
      "SELECT 1 AS x FROM fan_campaigns WHERE team_id = ? AND kind = 'trener_ven' AND status IN ('sbira','splnena')",
    ).bind(teamId).first<{ x: number }>()
      .catch((e) => { logger.warn({ module: M }, "kampaň pro chorál", e); return null; }),
    rivaloveKlubu(db, teamId, gameDate, 1),
    (await import("./fan-banner")).formaKlubu(db, teamId),
    nejvetsiStiznost(db, teamId),
  ]);

  return {
    oblibenec: oblibenec ? `${oblibenec.first_name} ${oblibenec.last_name}` : null,
    rival: rivalove[0] ? { nazev: rivalove[0].name, heat: rivalove[0].heat } : null,
    trener: trener?.name ?? null,
    kampanProtiTreneru: !!kampan,
    serie: forma.serie,
    nalada: kotel.mood,
    heat: kotel.heat,
    stiznostNaVybaveni: stiznost,
    klub: tym?.name ?? "náš klub",
  };
}

/**
 * Co na stadionu chybí nejvíc.
 *
 * Bere první nepostavenou věc z pořadí, na kterém lidem opravdu záleží, když
 * stojí v dešti u díry v zemi. Zastřešení a sociálky před parkovištěm.
 */
async function nejvetsiStiznost(db: D1Database, teamId: string): Promise<string | null> {
  const s = await db
    .prepare("SELECT toilets, roof, refreshments, stands, ultras_stand, pitch_condition FROM stadiums WHERE team_id = ?")
    .bind(teamId)
    .first<Record<string, number>>()
    .catch((e) => { logger.warn({ module: M }, "stadion pro stížnost", e); return null; });
  if (!s) return null;

  if ((s.toilets ?? 0) === 0) return "záchody";
  if ((s.roof ?? 0) === 0) return "střechu nad hlavou";
  if ((s.refreshments ?? 0) === 0) return "pivo na stadionu";
  if ((s.stands ?? 0) === 0) return "tribunu";
  if ((s.ultras_stand ?? 0) === 0) return "pořádnej kotel";
  if ((s.pitch_condition ?? 100) < 35) return "hřiště, ne oraniště";
  return null;
}
