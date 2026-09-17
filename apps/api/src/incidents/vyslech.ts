/**
 * Výslech přes chat (spec 7a). Výsledek rozhoduje DB, ne model: spočítá se jednou
 * na hráče a incident, uloží se a další otázky dostanou stejnou odpověď.
 */

import { createRng, type Rng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { posunVztah } from "./hraci";
import { nactiHraceKadru, nactiIncident, pozdejsi, proAkce, type IncidentRadek } from "./incident-db";
import { KAMARADSKE_VZTAHY, LHUTA_PO_ODHALENI_DNI } from "./nastaveni";
import { nactiStopy, prikazyStop } from "./stopy-db";
import { text } from "./texty";
import type { HracKlubu } from "./typy";
import { lzeVyslychat, sancePriznani, stopaNaHrace } from "./vysetrovani";
import type { RoleSvedka, RoleZnalosti, VysledekVyslechu } from "./znalosti";

const M = "incidents-vyslech";

/** Role, které se vyslýchají. Konstanta, ne vstup. */
const ROLE_VYSLECHU = "('svedek', 'kamarad', 'rival', 'pachatel')";

/** Šance v procentech, že svědek, kamarád nebo rival trenérovi řekne, co ví (spec 7a). */
export function sanceProzrazeni(role: RoleSvedka, ochota: number, vztahKTrenerovi: number): number {
  const sance = ochota + (vztahKTrenerovi - 50) / 2 + (role === "rival" ? 15 : 0) - (role === "kamarad" ? 20 : 0);
  return Math.max(0, Math.min(100, sance));
}

/**
 * Hráč s víc rolemi (kamarád, který i něco viděl) odpovídá jednotně, jinak by si protiřečil.
 * Rozhoduje role, ve které mluví nejméně ochotně. `los` je první číslo ze seedu výslechu.
 */
export function rozhodniSvedka(
  role: ReadonlyArray<{ role: RoleSvedka; ochota: number }>, vztahKTrenerovi: number, los: number,
): "prozradil" | "kryje" {
  if (role.length === 0) return "kryje";
  const sance = Math.min(...role.map((r) => sanceProzrazeni(r.role, r.ochota, vztahKTrenerovi)));
  return los * 100 < sance ? "prozradil" : "kryje";
}

export function rozhodniPachatele(h: HracKlubu, stopaNaNej: boolean, los: number): "priznal" | "zapira" {
  return los * 100 < sancePriznani(h, stopaNaNej) ? "priznal" : "zapira";
}

type RadekRole = { role: RoleZnalosti; willingness: number; interrogation: VysledekVyslechu | null };

function jeSvedecka(r: RadekRole): r is RadekRole & { role: RoleSvedka } {
  return r.role === "svedek" || r.role === "kamarad" || r.role === "rival";
}

export async function vyslechni(
  db: D1Database, opts: { teamId: string; incidentId: string; playerId: string; gameDate: string },
): Promise<{ vysledek: VysledekVyslechu; novy: boolean } | null> {
  const [inc, radky] = await Promise.all([
    nactiIncident(db, opts.teamId, opts.incidentId),
    db.prepare(
      `SELECT role, willingness, interrogation FROM club_incident_knowledge
        WHERE incident_id = ? AND player_id = ? AND team_id = ? AND role IN ${ROLE_VYSLECHU}`,
    ).bind(opts.incidentId, opts.playerId, opts.teamId).all<RadekRole>()
      .catch((e) => { logger.warn({ module: M }, `znalosti k výslechu ${opts.incidentId}`, e); return null; }),
  ]);
  const role = radky?.results ?? [];
  if (!inc || role.length === 0 || !lzeVyslychat(proAkce(inc, false))) return null;

  const ulozeny = role.find((r) => r.interrogation !== null)?.interrogation;
  if (ulozeny) {
    // Kritické následky (stopa, odhalení) jsou idempotentní (found = 0 / culprit_revealed = 0
    // v podmínce UPDATE, INSERT OR IGNORE u stopy). Zopakuj je, kdyby minule spadla celá dávka
    // (např. FK na odešlého pachatele u vztahů) a stopa nebo odhalení tak chyběly napořád.
    // Vztahy znovu neposouvej, ty by se zdvojily.
    const rng = createRng(seedFromString(`vyslech|${opts.incidentId}|${opts.playerId}`));
    rng.random(); // stejný seed jako při prvním výslechu; přeskoč los, ať vyjde stejný text stopy
    const hracJmeno = ulozeny === "priznal" ? (await nactiHraceKadru(db, opts.teamId, opts.playerId))?.jmeno : undefined;
    if (ulozeny !== "priznal" || hracJmeno) {
      const kriticke = kritickeNasledky(db, {
        teamId: opts.teamId, incidentId: opts.incidentId, playerId: opts.playerId, gameDate: opts.gameDate,
        inc, hracJmeno: hracJmeno ?? "", vysledek: ulozeny, rng,
      });
      if (kriticke.length > 0) {
        await db.batch(kriticke).catch((e) => logger.error({ module: M }, `kritické následky výslechu (uložený výsledek) ${opts.incidentId}`, e));
      }
    }
    return { vysledek: ulozeny, novy: false };
  }

  const hrac = await nactiHraceKadru(db, opts.teamId, opts.playerId);
  if (!hrac) return null;

  const rng = createRng(seedFromString(`vyslech|${opts.incidentId}|${opts.playerId}`));
  // První číslo z generátoru je los výslechu, na tom stojí determinismus.
  const los = rng.random();
  const jePachatel = role.some((r) => r.role === "pachatel") && inc.culprit_player_id === opts.playerId;
  const vysledek: VysledekVyslechu = jePachatel
    ? rozhodniPachatele(hrac, stopaNaHrace(await nactiStopy(db, opts.incidentId), hrac.id), los)
    : rozhodniSvedka(role.filter(jeSvedecka).map((r) => ({ role: r.role, ochota: r.willingness })), hrac.vztahKTrenerovi, los);

  const narok = await db.prepare(
    `UPDATE club_incident_knowledge SET interrogation = ?, interrogated_on = ?
      WHERE incident_id = ? AND player_id = ? AND team_id = ? AND role IN ${ROLE_VYSLECHU} AND interrogation IS NULL`,
  ).bind(vysledek, opts.gameDate, opts.incidentId, opts.playerId, opts.teamId).run()
    .catch((e) => { logger.error({ module: M }, `výsledek výslechu ${opts.incidentId}`, e); return null; });
  if ((narok?.meta?.changes ?? 0) === 0) return null;

  const kriticke = kritickeNasledky(db, {
    teamId: opts.teamId, incidentId: opts.incidentId, playerId: opts.playerId, gameDate: opts.gameDate,
    inc, hracJmeno: hrac.jmeno, vysledek, rng,
  });
  if (kriticke.length > 0) {
    await db.batch(kriticke).catch((e) => logger.error({ module: M }, `kritické následky výslechu ${opts.incidentId}`, e));
  }

  const vztahy = await vztahoveNasledky(db, { playerId: opts.playerId, role: role.map((r) => r.role), vysledek, pachatelId: inc.culprit_player_id });
  if (vztahy.length > 0) {
    await db.batch(vztahy).catch((e) => logger.warn({ module: M }, `vztahy po výslechu ${opts.incidentId}`, e));
  }
  return { vysledek, novy: true };
}

/** Stopa a odhalení pachatele - kritické následky, idempotentní, vlastní dávka (spec 7a). */
function kritickeNasledky(
  db: D1Database,
  v: {
    teamId: string; incidentId: string; playerId: string; gameDate: string;
    inc: IncidentRadek; hracJmeno: string; vysledek: VysledekVyslechu; rng: Rng;
  },
): D1PreparedStatement[] {
  const davka: D1PreparedStatement[] = [];
  if (v.vysledek === "prozradil") {
    davka.push(db.prepare(
      `UPDATE club_incident_clues SET found = 1, found_on = ?
        WHERE incident_id = ? AND holder_player_id = ? AND source IN ('svedek', 'kamarad', 'rival') AND found = 0`,
    ).bind(v.gameDate, v.incidentId, v.playerId));
  }
  if (v.vysledek === "priznal") {
    davka.push(
      db.prepare(
        `UPDATE club_incidents SET culprit_revealed = 1, deadline = ?
          WHERE id = ? AND team_id = ? AND culprit_revealed = 0 AND status IN ('otevreny', 'policie')`,
      ).bind(pozdejsi(v.inc.deadline, gameExpiry(v.gameDate, LHUTA_PO_ODHALENI_DNI)), v.incidentId, v.teamId),
      ...prikazyStop(db, v.teamId, v.incidentId, [{
        zdroj: "priznani", ukazujeNa: v.playerId, podezreli: null, drzitel: null, sila: 3, bonusPolicie: 0, nalezena: true,
        text: text(v.rng, "stopa_priznani_vyslech", { hrac: v.hracJmeno }),
      }], v.gameDate),
    );
  }
  return davka;
}

/**
 * Jak se hráč zachoval k pachateli, pozná i jejich vztah (spec 17c). Vlastní dávka: na
 * rozdíl od kritických následků nejde znovu bezpečně opakovat, a odešlý pachatel by
 * porušil cizí klíč `relationships → players`, proto se posouvá jen když pořád je v kádru.
 */
async function vztahoveNasledky(
  db: D1Database,
  v: { playerId: string; role: RoleZnalosti[]; vysledek: VysledekVyslechu; pachatelId: string | null },
): Promise<D1PreparedStatement[]> {
  if (!v.pachatelId || v.pachatelId === v.playerId) return [];
  const pachatelVKadru = await db.prepare(`SELECT 1 AS ano FROM players WHERE id = ?`).bind(v.pachatelId).first<{ ano: number } | null>()
    .catch((e) => { logger.warn({ module: M }, `kontrola pachatele v kádru ${v.pachatelId}`, e); return null; });
  if (!pachatelVKadru) return [];

  const davka: D1PreparedStatement[] = [];
  if (v.role.includes("kamarad")) {
    if (v.vysledek === "prozradil") {
      davka.push(...await posunVztah(db, v.playerId, v.pachatelId, { typy: KAMARADSKE_VZTAHY, delta: -20, smazPod: 10 }));
      davka.push(...await posunVztah(db, v.playerId, v.pachatelId, { typy: ["rivals"], delta: 0, vytvorJako: { typ: "rivals", sila: 40 } }));
    } else {
      davka.push(...await posunVztah(db, v.playerId, v.pachatelId, { typy: KAMARADSKE_VZTAHY, delta: 10 }));
    }
  }
  if (v.role.includes("rival") && v.vysledek === "prozradil") {
    davka.push(...await posunVztah(db, v.playerId, v.pachatelId, { typy: ["rivals"], delta: 15 }));
  }
  return davka;
}
