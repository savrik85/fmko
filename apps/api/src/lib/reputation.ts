import { logger } from "./logger";

/**
 * Klubová reputace (`teams.reputation`) — jediné místo, kudy se mění.
 *
 * Pozor na záměnu: tohle je reputace KLUBU (0–100, start 50), ne reputace TRENÉRA
 * (`managers.reputation`, 15–75). Klubová se po zápase nemění, trenérská ano.
 *
 * Dřív ji měnilo devět nezávislých míst, každé vlastním UPDATE bez auditu. Teď
 * všechna volají `applyReputationDelta`, takže hráč vidí v historii, odkud se
 * každý bod vzal.
 */

export type ReputationSource =
  | "season_position"   // konečné pořadí v lize
  | "cup"               // postup pohárem
  | "event"             // sezónní událost
  | "celebrity"         // podpis hvězdy
  | "rename"            // přejmenování klubu
  | "sponsor"           // podpis / ukončení smlouvy hlavního sponzora
  | "sellout"           // vyprodaný stadion
  | "empty_stands"      // prázdné hlediště
  | "streak_win"        // série výher
  | "streak_loss"       // série proher
  | "locals"            // rodáci v kádru
  | "village_favor"     // přízeň obce
  | "decay"             // útlum za dlouhou nečinnost
  | "admin";

/**
 * Klesající výnosy: čím výš klub je, tím dráž se stoupá.
 *
 * Bez toho by oprava sdílených sezónních událostí (každý tým má nově vlastní sadu
 * místo jedné na ligu) dala každému ~+30 reputace za sezónu a stadion 3. úrovně
 * (reputace 70) by byl rutina hned v první sezóně.
 *
 * Ztráty se NEkrátí — jinak by byla reputace jednosměrná.
 */
export function gainFactor(current: number): number {
  if (current >= 85) return 0.25;
  if (current >= 70) return 0.5;
  if (current >= 55) return 0.75;
  return 1;
}

/** Podlaha, pod kterou útlum za nečinnost netlačí. Podle velikosti obce. */
export function reputationBaseline(villageCategory: string): number {
  switch (villageCategory) {
    case "mesto": return 43;
    case "mestys": return 40;
    case "obec": return 38;
    default: return 35; // vesnice
  }
}

export interface ReputationChange {
  applied: number;
  oldValue: number;
  newValue: number;
  skipped: "duplicate" | "capped" | "no_team" | "error" | null;
}

/**
 * Změní klubovou reputaci a zapíše důvod do auditního logu.
 *
 * Zápis logu a změna reputace jdou v jednom `db.batch()` — to je implicitní
 * transakce, takže při duplicitním `referenceId` shodí unikátní index obojí
 * a nemůže vzniknout stav "reputace připsaná dvakrát, log jednou".
 *
 * @param referenceId klíč idempotence, např. `cup-{cupId}-r{round}-{teamId}`
 */
export async function applyReputationDelta(
  db: D1Database,
  teamId: string,
  rawDelta: number,
  source: ReputationSource,
  description: string,
  opts?: { referenceId?: string; gameDate?: string },
): Promise<ReputationChange> {
  const referenceId = opts?.referenceId ?? null;
  const gameDate = opts?.gameDate ?? null;

  if (referenceId) {
    const exists = await db.prepare("SELECT 1 FROM reputation_log WHERE reference_id = ?")
      .bind(referenceId).first()
      .catch((e) => {
        logger.warn({ module: "reputation" }, "check reputation reference", e);
        return null;
      });
    if (exists) {
      return { applied: 0, oldValue: 0, newValue: 0, skipped: "duplicate" };
    }
  }

  const teamRow = await db.prepare("SELECT reputation FROM teams WHERE id = ?")
    .bind(teamId).first<{ reputation: number }>()
    .catch((e) => {
      logger.warn({ module: "reputation" }, "load team reputation", e);
      return null;
    });
  if (!teamRow) {
    return { applied: 0, oldValue: 0, newValue: 0, skipped: "no_team" };
  }

  const oldValue = teamRow.reputation;
  const applied = rawDelta > 0
    ? Math.round(rawDelta * gainFactor(oldValue))
    : rawDelta;
  const newValue = Math.max(0, Math.min(100, oldValue + applied));

  // Zisk sežraný stropem se loguje taky — jinak by hráč nechápal, proč se nic nestalo.
  const cappedAway = applied === 0 && rawDelta > 0;

  try {
    await db.batch([
      db.prepare(
        `INSERT INTO reputation_log (team_id, old_value, new_value, delta, raw_delta, source, description, reference_id, game_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(teamId, oldValue, newValue, applied, rawDelta, source, description, referenceId, gameDate),
      // Self-referenční UPDATE, ne zápis absolutní hodnoty. D1 nemá transakci napříč
      // příkazy, takže mezi SELECTem výše a tímhle zápisem může jiná invokace
      // (crony 0 16 a 5 16 běží minutu po sobě) reputaci změnit — absolutní hodnota
      // by její změnu přepsala a audit log by pak nesouhlasil s teams.reputation.
      db.prepare("UPDATE teams SET reputation = MAX(0, MIN(100, reputation + ?)) WHERE id = ?")
        .bind(applied, teamId),
    ]);
  } catch (e) {
    // Duplicitní reference_id shodí celý batch (unikátní index) — to je očekávaná
    // idempotence. Cokoli jiného je skutečná chyba a nesmí vypadat stejně.
    const message = e instanceof Error ? e.message : String(e);
    const isDuplicate = /UNIQUE constraint failed: reputation_log\.reference_id/i.test(message);
    if (!isDuplicate) {
      logger.error({ module: "reputation" }, `apply reputation delta ${source} for ${teamId}`, e);
      return { applied: 0, oldValue, newValue: oldValue, skipped: "error" };
    }
    return { applied: 0, oldValue, newValue: oldValue, skipped: "duplicate" };
  }

  // Skutečnou novou hodnotu čteme zpátky — applied se mohl potkat se souběžnou změnou.
  const after = await db.prepare("SELECT reputation FROM teams WHERE id = ?")
    .bind(teamId).first<{ reputation: number }>()
    .catch((e) => { logger.warn({ module: "reputation" }, "read back reputation", e); return null; });

  return {
    applied,
    oldValue,
    newValue: after?.reputation ?? newValue,
    skipped: cappedAway ? "capped" : null,
  };
}
