/**
 * Exkluzivita hlavního sponzora: jeden sponzor (řádek district_sponsors) je hlavním
 * sponzorem nejvýš jednoho klubu. Stadion a bannery se sdílet smí.
 *
 * Po vypršení hlavní smlouvy dostane přednost klub s nejvyšší reputací (z těch, kterým
 * smlouva se sponzorem končí): celou další sezónu sponzor jedná jen s ním. Přednost padá,
 * jakmile si ten klub podepíše jiného hlavního sponzora.
 *
 * Sdílení z doby před exkluzivitou: firma byla hlavním sponzorem několika klubů najednou
 * a migrace 0215 jim všem smlouvy zkrátila na tuhle sezónu. Kluby, které firmu takhle sdílejí,
 * s ní smějí jednat o prodloužení, „kdo se dohodne první": kdo podepíše, má firmu od příští
 * sezóny sám, ostatním sdílená smlouva doběhne s koncem sezóny. Nová smlouva vzniká jednáním
 * (negotiation_id), takže po prvním podpisu už zbylé kluby výjimku nemají.
 */
import { logger } from "../lib/logger";

export interface MainSponsorBlock {
  reason: string;
  holderTeamId: string;
  holderTeamName: string;
}

/**
 * Sdílená hlavní smlouva z doby před exkluzivitou (alias tabulky `a`): končí letos a nevznikla
 * jednáním. Taková smlouva jiného klubu neblokuje klub, který firmu sdílí také.
 */
export function sharedLeftoverSql(a: string): string {
  return `(${a}.seasons_remaining <= 1 AND ${a}.negotiation_id IS NULL)`;
}

/** Proč sponzor nemůže být hlavním sponzorem klubu teamId (null = může). */
export async function mainSponsorBlock(
  db: D1Database, sponsorId: number, teamId: string, season: number,
): Promise<MainSponsorBlock | null> {
  const own = await db.prepare(
    `SELECT id FROM sponsor_contracts WHERE sponsor_id = ? AND team_id = ? AND status = 'active' AND category = 'main' LIMIT 1`,
  ).bind(sponsorId, teamId).first<{ id: string }>();
  // Klub, který firmu sdílí, blokují jen smlouvy jiných klubů, které nejsou sdíleným zbytkem.
  const holder = await db.prepare(
    `SELECT sc.team_id, t.name, sc.sponsor_name, sc.negotiation_id FROM sponsor_contracts sc JOIN teams t ON t.id = sc.team_id
     WHERE sc.sponsor_id = ? AND sc.status = 'active' AND sc.category = 'main' AND sc.team_id != ?${own ? ` AND NOT ${sharedLeftoverSql("sc")}` : ""}
     ORDER BY (sc.negotiation_id IS NULL), sc.signed_at LIMIT 1`,
  ).bind(sponsorId, teamId).first<{ team_id: string; name: string; sponsor_name: string; negotiation_id: string | null }>();
  if (holder) {
    return {
      reason: own && holder.negotiation_id !== null
        ? `${holder.sponsor_name} už podepsal smlouvu s klubem ${holder.name} od příští sezóny`
        : `${holder.sponsor_name} je hlavním sponzorem klubu ${holder.name}`,
      holderTeamId: holder.team_id, holderTeamName: holder.name,
    };
  }

  const prio = await db.prepare(
    `SELECT ds.name AS sponsor_name, ds.priority_team_id, t.name AS team_name FROM district_sponsors ds
     JOIN teams t ON t.id = ds.priority_team_id
     WHERE ds.id = ? AND ds.priority_season = ? AND ds.priority_team_id != ?
       AND NOT EXISTS (SELECT 1 FROM sponsor_contracts sc WHERE sc.team_id = ds.priority_team_id AND sc.status = 'active' AND sc.category = 'main')`,
  ).bind(sponsorId, season, teamId).first<{ sponsor_name: string; priority_team_id: string; team_name: string }>();
  if (prio) {
    return {
      reason: `${prio.sponsor_name} letos jedná přednostně s klubem ${prio.team_name}`,
      holderTeamId: prio.priority_team_id, holderTeamName: prio.team_name,
    };
  }
  return null;
}

/** Id sponzorů okresu, které klub teamId nemůže podepsat jako hlavní (pro filtrování nabídek). */
export async function blockedMainSponsorIds(
  db: D1Database, district: string, teamId: string, season: number,
): Promise<Set<number>> {
  const rows = await db.prepare(
    `SELECT ds.id FROM district_sponsors ds
     WHERE ds.district = ? AND (
       EXISTS (SELECT 1 FROM sponsor_contracts sc WHERE sc.sponsor_id = ds.id AND sc.status = 'active' AND sc.category = 'main' AND sc.team_id != ?
         AND NOT (${sharedLeftoverSql("sc")} AND EXISTS (SELECT 1 FROM sponsor_contracts own WHERE own.sponsor_id = ds.id AND own.team_id = ? AND own.status = 'active' AND own.category = 'main')))
       OR (ds.priority_season = ? AND ds.priority_team_id != ?
           AND NOT EXISTS (SELECT 1 FROM sponsor_contracts sc WHERE sc.team_id = ds.priority_team_id AND sc.status = 'active' AND sc.category = 'main'))
     )`,
  ).bind(district, teamId, teamId, season, teamId).all<{ id: number }>();
  return new Set(rows.results.map((r) => r.id));
}

/**
 * Podmínka pro atomický zápis: sponzor nesmí mít aktivní hlavní smlouvu u jiného klubu.
 * Výjimka jako v mainSponsorBlock: sdílený zbytek jiného klubu nevadí, když firmu sdílí
 * i zapisující klub. Parametry z mainSponsorFreeParams.
 */
export const MAIN_SPONSOR_FREE_SQL =
  `NOT EXISTS (SELECT 1 FROM sponsor_contracts x WHERE x.sponsor_id = ? AND x.status = 'active' AND x.category = 'main' AND x.team_id != ?`
  + ` AND NOT (${sharedLeftoverSql("x")} AND EXISTS (SELECT 1 FROM sponsor_contracts own WHERE own.sponsor_id = x.sponsor_id AND own.team_id = ? AND own.status = 'active' AND own.category = 'main')))`;

/** Parametry k MAIN_SPONSOR_FREE_SQL v pořadí, jak je čte. */
export function mainSponsorFreeParams(sponsorId: number | null, teamId: string): [number | null, string, string] {
  return [sponsorId, teamId, teamId];
}

export interface PriorityLoss { teamId: string; sponsorName: string; winnerTeamName: string }

/**
 * Rollover: před expirací smluv urči, kdo má u sponzorů s končící hlavní smlouvou přednost
 * v nové sezóně. Vrací kluby, které přednost nedostaly (dostanou zprávu).
 *
 * Sdílená firma (viz hlavička): kdo si ji letos podepsal jednáním, má přednost před sdílenými
 * zbytky bez ohledu na reputaci. Podepsal-li na víc sezón, firma je obsazená a ostatním
 * sdíleným klubům jen doběhne smlouva (zpráva, že firma dala přednost jemu).
 */
export async function assignMainPriorities(db: D1Database, newSeason: number): Promise<PriorityLoss[]> {
  const rows = await db.prepare(
    `SELECT sc.sponsor_id, sc.team_id, sc.sponsor_name, t.name AS team_name, t.reputation
     FROM sponsor_contracts sc JOIN teams t ON t.id = sc.team_id
     WHERE sc.status = 'active' AND sc.category = 'main' AND sc.seasons_remaining <= 1 AND sc.sponsor_id IS NOT NULL
     ORDER BY sc.sponsor_id, (sc.negotiation_id IS NULL), t.reputation DESC, sc.signed_at ASC`,
  ).all<{ sponsor_id: number; team_id: string; sponsor_name: string; team_name: string; reputation: number }>();

  // Pokud má sponzor další (nekončící) hlavní smlouvu, přednost nikomu nedává, je obsazený.
  const stillHeld = await db.prepare(
    `SELECT sc.sponsor_id, sc.team_id, t.name AS team_name FROM sponsor_contracts sc JOIN teams t ON t.id = sc.team_id
     WHERE sc.status = 'active' AND sc.category = 'main' AND sc.seasons_remaining > 1 AND sc.sponsor_id IS NOT NULL`,
  ).all<{ sponsor_id: number; team_id: string; team_name: string }>();
  const held = new Map(stillHeld.results.map((r) => [r.sponsor_id, r]));

  const bySponsor = new Map<number, typeof rows.results>();
  for (const r of rows.results) {
    const list = bySponsor.get(r.sponsor_id) ?? [];
    list.push(r);
    bySponsor.set(r.sponsor_id, list);
  }

  const losses: PriorityLoss[] = [];
  const updates: D1PreparedStatement[] = [];
  for (const [sponsorId, list] of bySponsor) {
    const holder = held.get(sponsorId);
    if (holder) {
      for (const r of list.filter((x) => x.team_id !== holder.team_id)) {
        losses.push({ teamId: r.team_id, sponsorName: r.sponsor_name, winnerTeamName: holder.team_name });
      }
      continue;
    }
    const winner = list[0];
    updates.push(db.prepare("UPDATE district_sponsors SET priority_team_id = ?, priority_season = ? WHERE id = ?")
      .bind(winner.team_id, newSeason, sponsorId));
    for (const loser of list.slice(1)) {
      losses.push({ teamId: loser.team_id, sponsorName: loser.sponsor_name, winnerTeamName: winner.team_name });
    }
  }
  if (updates.length > 0) await db.batch(updates);
  logger.info({ module: "sponsors" }, `přednost hlavních sponzorů: ${updates.length} sponzorů, ${losses.length} klubů bez přednosti`);
  return losses;
}
