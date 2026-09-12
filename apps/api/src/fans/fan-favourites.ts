/**
 * Kdo je čí miláček — napojení hodnocení na databázi.
 *
 * Počítá se jednou za herní den v ticku, ne při každém zobrazení: výběr má být
 * stabilní. „Kotel ho miluje" nesmí být věta, která platí jen do dalšího gólu
 * někoho jiného, proto je v `engine/fan-favourites.ts` náskok na výměnu.
 */

import { logger } from "../lib/logger";
import {
  vyberOblibence, type HodnocenyHrac, type Stance,
} from "../engine/fan-favourites";
import type { FanGroupKind } from "../engine/fan-groups";
import type { FanGroupRow } from "./fan-group-generator";

const M = "fan-favourites";

export interface OblibenecRow {
  id: string;
  group_id: string;
  team_id: string;
  player_id: string;
  stance: Stance;
  score: number;
  duvod: string;
  since: string | null;
}

/**
 * Přepočet oblíbenců všech part jednoho klubu.
 *
 * Vrací, u koho se to změnilo — volající z toho udělá zprávu na síť. Tichý
 * přepočet bez výstupu by znamenal, že se miláček vymění a nikdo se to nedozví.
 */
export async function prepoctiOblibence(
  db: D1Database,
  teamId: string,
  groups: readonly FanGroupRow[],
  gameDate: string,
): Promise<Array<{ groupId: string; groupName: string; stance: Stance; playerId: string; playerName: string; duvod: string; novy: boolean }>> {
  if (groups.length === 0) return [];

  const kadr = await nactiKadr(db, teamId);
  if (kadr.length < 6) return [];

  const stare = await db
    .prepare("SELECT * FROM fan_group_players WHERE team_id = ?")
    .bind(teamId)
    .all<OblibenecRow>()
    .catch((e) => { logger.warn({ module: M }, `staří oblíbenci ${teamId}`, e); return { results: [] as OblibenecRow[] }; });
  const podleKlice = new Map(stare.results.map((r) => [`${r.group_id}|${r.stance}`, r]));

  const zmeny: Array<{ groupId: string; groupName: string; stance: Stance; playerId: string; playerName: string; duvod: string; novy: boolean }> = [];
  const stmts: D1PreparedStatement[] = [];

  for (const g of groups) {
    const stavajici = {
      oblibenec: podleKlice.get(`${g.id}|oblibenec`),
      otloukanek: podleKlice.get(`${g.id}|otloukanek`),
    };
    const volba = vyberOblibence(g.kind as FanGroupKind, kadr, {
      oblibenec: stavajici.oblibenec
        ? { playerId: stavajici.oblibenec.player_id, score: stavajici.oblibenec.score }
        : undefined,
      otloukanek: stavajici.otloukanek
        ? { playerId: stavajici.otloukanek.player_id, score: stavajici.otloukanek.score }
        : undefined,
    });

    for (const stance of ["oblibenec", "otloukanek"] as const) {
      const v = volba[stance];
      const stary = stavajici[stance];

      if (!v) {
        // Parta už nikoho takového nemá (kádr se srovnal) — řádek pryč, ať
        // profil hráče netvrdí něco, co dávno neplatí.
        if (stary) stmts.push(db.prepare("DELETE FROM fan_group_players WHERE id = ?").bind(stary.id));
        continue;
      }

      const novy = !stary || stary.player_id !== v.hrac.id;
      stmts.push(
        db.prepare(
          `INSERT INTO fan_group_players (id, group_id, team_id, player_id, stance, score, duvod, since, updated_at)
           VALUES (?,?,?,?,?,?,?,?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
           ON CONFLICT(group_id, stance) DO UPDATE SET
             player_id = excluded.player_id, score = excluded.score, duvod = excluded.duvod,
             since = CASE WHEN fan_group_players.player_id = excluded.player_id
                          THEN fan_group_players.since ELSE excluded.since END,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
        ).bind(
          `fgp-${g.id}-${stance}`, g.id, teamId, v.hrac.id, stance,
          v.score, v.duvod, gameDate,
        ),
      );

      if (novy) {
        zmeny.push({
          groupId: g.id, groupName: g.name, stance,
          playerId: v.hrac.id,
          playerName: `${v.hrac.firstName} ${v.hrac.lastName}`,
          duvod: v.duvod, novy: true,
        });
      }
    }
  }

  if (stmts.length > 0) {
    await db.batch(stmts).catch((e) => { logger.warn({ module: M }, `zápis oblíbenců ${teamId}`, e); });
  }
  return zmeny;
}

/** Oblíbenci klubu i s daty hráče — pro stránku fanoušků a profil hráče. */
export async function nactiOblibence(
  db: D1Database,
  teamId: string,
): Promise<Array<OblibenecRow & { first_name: string; last_name: string; position: string; group_name: string; group_kind: string }>> {
  const rows = await db
    .prepare(
      `SELECT fgp.*, p.first_name, p.last_name, p.position, g.name AS group_name, g.kind AS group_kind
       FROM fan_group_players fgp
       JOIN players p ON p.id = fgp.player_id
       JOIN fan_groups g ON g.id = fgp.group_id
       WHERE fgp.team_id = ? AND p.status = 'active'
       ORDER BY g.kind, fgp.stance`,
    )
    .bind(teamId)
    .all<OblibenecRow & { first_name: string; last_name: string; position: string; group_name: string; group_kind: string }>()
    .catch((e) => { logger.warn({ module: M }, `načtení oblíbenců ${teamId}`, e); return { results: [] as never[] }; });
  return rows.results;
}

/** Co si party myslí o jednom hráči — pro jeho profil. */
export async function nazoryNaHrace(
  db: D1Database,
  playerId: string,
): Promise<Array<{ stance: Stance; duvod: string; groupName: string; groupKind: string }>> {
  const rows = await db
    .prepare(
      `SELECT fgp.stance, fgp.duvod, g.name AS group_name, g.kind AS group_kind
       FROM fan_group_players fgp JOIN fan_groups g ON g.id = fgp.group_id
       WHERE fgp.player_id = ?`,
    )
    .bind(playerId)
    .all<{ stance: Stance; duvod: string; group_name: string; group_kind: string }>()
    .catch((e) => { logger.warn({ module: M }, `názory na hráče ${playerId}`, e); return { results: [] as never[] }; });
  return rows.results.map((r) => ({
    stance: r.stance, duvod: r.duvod, groupName: r.group_name, groupKind: r.group_kind,
  }));
}

/**
 * Kádr přepočítaný do podoby, kterou hodnotí engine.
 *
 * Góly a asistence z aktuální sezóny, „domácí" podle bydliště v obci klubu,
 * a kolik zápasů po sobě hráč neodehrál ani minutu — na miláčka, co sedí na
 * lavici, parta zapomene.
 */
async function nactiKadr(db: D1Database, teamId: string): Promise<HodnocenyHrac[]> {
  const rows = await db
    .prepare(
      `SELECT p.id, p.first_name, p.last_name, p.nickname, p.position, p.age,
              p.overall_rating, p.personality, p.experience, p.residence,
              v.name AS obec,
              COALESCE(ps.goals, 0) AS goals, COALESCE(ps.assists, 0) AS assists,
              COALESCE(ps.appearances, 0) AS appearances
       FROM players p
       JOIN teams t ON t.id = p.team_id
       LEFT JOIN villages v ON v.id = t.village_id
       LEFT JOIN player_stats ps ON ps.player_id = p.id AND ps.team_id = p.team_id
         AND ps.season_id = (SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1)
       WHERE p.team_id = ? AND p.status = 'active'`,
    )
    .bind(teamId)
    .all<{
      id: string; first_name: string; last_name: string; nickname: string | null;
      position: string; age: number; overall_rating: number; personality: string;
      experience: number; residence: string | null; obec: string | null;
      goals: number; assists: number; appearances: number;
    }>()
    .catch((e) => { logger.warn({ module: M }, `kádr pro oblíbence ${teamId}`, e); return { results: [] as never[] }; });

  // Kolik zápasů klub odehrál — kdo z nich nenastoupil ani jednou, je zapomenutý.
  const odehrano = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM matches
       WHERE (home_team_id = ? OR away_team_id = ?) AND home_score IS NOT NULL`,
    )
    .bind(teamId, teamId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "odehrané zápasy", e); return null; });
  const zapasu = odehrano?.n ?? 0;

  return rows.results.map((r) => {
    const osobnost = bezpecnyObjekt(r.personality);
    const cislo = (k: string, vychozi: number) =>
      typeof osobnost[k] === "number" ? (osobnost[k] as number) : vychozi;
    return {
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      nickname: r.nickname,
      position: r.position,
      age: r.age,
      overallRating: r.overall_rating,
      workRate: cislo("workRate", 50),
      aggression: cislo("aggression", 40),
      discipline: cislo("discipline", 50),
      patriotism: cislo("patriotism", 50),
      leadership: cislo("leadership", 30),
      alcohol: cislo("alcohol", 30),
      experience: r.experience ?? 0,
      domaci: !!r.obec && !!r.residence && r.residence === r.obec,
      goly: r.goals ?? 0,
      asistence: r.assists ?? 0,
      zapasuBezMinuty: Math.max(0, Math.min(6, zapasu - (r.appearances ?? 0))),
    };
  });
}

function bezpecnyObjekt(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch (e) {
    logger.warn({ module: M }, "rozbitá osobnost hráče", e);
    return {};
  }
}
