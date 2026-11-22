/**
 * Přemluvit pachatele, ať to vrátí nebo zaplatí (zadání 2026-11-18).
 *
 * Trenér napíše hráči „vrať to“ nebo „zaplať tu škodu“. Když je hráč opravdu pachatel
 * krádeže nebo poškození (odhalený, nebo ho trenér tipnul správně), rozhodne se podle povahy
 * a vztahu k trenérovi. Když kývne: ukradené vybavení vrátí, hotovost dá zpátky, rozbité
 * zaplatí (nejvýš čtyři týdenní odměny jako u srážky), přizná se a incident se uzavře.
 * Když trenér chce opravu („uděláte brigádu“) a je co opravit, slíbí opravu brigádou do dvou
 * dní. I po uzavřeném incidentu (trest padl, lup zůstal u hráče nebo je pořád rozbito) slíbí,
 * že to vrátí nebo opraví; splnění hlídá amends.ts (zadání 2026-11-22, Turek a poháry).
 * Zkouší se jednou na incident (značka `restitution` ve sloupci `tactics`, migrace 0317).
 * Volá incidents/zprava-trenera.ts ještě před odpovědí hráče, ta už výsledek zná.
 */

import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { recordTransaction } from "../season/finance-processor";
import { sendIncidentSystemSms } from "./club-messages";
import { nactiHraceKadru, smsIncidentu } from "./incident-db";
import { nazevIncidentu } from "./katalog";
import { SMS_ROLE_KUSTOD } from "./nastaveni";
import { nactiZtraty } from "./popis";
import { nactiStopy } from "./stopy-db";
import { castkaSrazky } from "./tresty";
import {
  dueWords, recordAmendsTask, repairableLosses, returnableLosses, returnLosses, type AmendsTask,
} from "./amends";
import { stopaNaHrace } from "./vysetrovani";

const M = "incidents-restitution";

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
}

/** Co trenér po pachateli chce: vrátit, zaplatit, nebo opravit (brigádou). */
export type AmendsRequest = "return" | "pay" | "repair";

const RETURN_RE = /\b(vrat|vratis|vratit|vratte|vrat to|vrat ty|vrat mi|dej to zpatky|dej to zpet|vrat to zpatky|prines (to|ty|je) zpatky|dones (to|ty|je) zpatky)\b/;
const PAY_RE = /\b(zaplat|zaplatis|zaplatit|nahrad|nahradis|nahradit|uhrad|uhradis)\b/;
/** „Opravíte to“, „uděláte brigádu“, „dej to do pořádku“. Ne „opravdu“ ani „uklidni se“. */
const REPAIR_RE = /\b(oprav|opravis|opravite|opravit|opravte|opravime|sprav|spravis|spravite|spravit|spravte|spravime|uklid|uklidis|uklidite|uklidit|uklidte|dej to do poradku|dat to do poradku|date to do poradku)\b|brigad/;

/** Co trenér ve zprávě po pachateli chce. Prázdné = nic z toho. */
export function amendsRequestOf(text: string): Set<AmendsRequest> {
  const t = plain(text);
  const out = new Set<AmendsRequest>();
  if (RETURN_RE.test(t)) out.add("return");
  if (PAY_RE.test(t)) out.add("pay");
  if (REPAIR_RE.test(t)) out.add("repair");
  return out;
}

/** Trenér chce, ať to hráč vrátí, zaplatí nebo opraví („vrať to“, „zaplať tu škodu“, „uděláte brigádu“). */
export function isRestitutionRequest(text: string): boolean {
  return amendsRequestOf(text).size > 0;
}
/** Slib mírnosti pomáhá („když to vrátíš, nebudu to řešit“). */
const LENIENCY_RE = /\b(nebudu to resit|nebude se to resit|zapomeneme|bez trestu|nic se ti nestane|odpustim|zmirnim|mezi nama|mezi nami|zustane to mezi)\b/;
const INSULT_RE = /\b(kurv\w*|pic\w*|kokot\w*|debil\w*|zmrd\w*|zlodej\w*|parchant\w*|hovad\w*)\b/;

/** Šance v procentech, že pachatel kývne. Odhalený a se stopou na sobě se brání méně. */
export function restitutionChance(
  p: { disciplina: number; temperament: number; vztahKTrenerovi: number },
  o: { revealed: boolean; clueOnHim: boolean; leniency: boolean; insult: boolean },
): number {
  const base = (p.disciplina + (100 - p.temperament) + p.vztahKTrenerovi) / 3 - 15;
  const score = base + (o.revealed ? 25 : 0) + (o.clueOnHim ? 10 : 0) + (o.leniency ? 15 : 0) - (o.insult ? 20 : 0);
  return Math.max(5, Math.min(90, Math.round(score)));
}

export type RestitutionOutcome =
  | { outcome: "returned" | "paid"; amount: number }
  /** Kývl, že to do `dueOn` (herní den) vrátí nebo opraví brigádou (amends.ts). */
  | { outcome: "promised"; task: AmendsTask; dueOn: string }
  | { outcome: "refused" };

interface IncidentRow {
  id: string; kind: string; category: string; status: string; loss: string | null; culprit_revealed: number;
}

/** Uzavřený incident, u kterého jde škodu ještě napravit, se hledá tolik dní zpátky. */
const CLOSED_AMENDS_DAYS = 30;
/** Výsledky, po kterých už není co vracet ani opravovat (nebo hráč v klubu není). */
const SETTLED_RESOLUTIONS = ["vratil", "nahradil", "opravil", "vyhodit", "nestalo_se", "nehoda", "vyreseno_policii", "bez_skody", "policie"];

/** Co se s incidentem na žádost trenéra udělá, když hráč kývne. */
type AmendsPlan = "return_now" | "pay_now" | AmendsTask;

/**
 * Zpráva trenéra hráči: chce, ať to vrátí, zaplatí nebo opraví. Vrací výsledek, nebo null
 * (žádost to není, hráč nic neprovedl, není co napravit, už se zkoušelo).
 *
 * Otevřený incident: krádež vrátí hned, rozbité zaplatí, nebo slíbí opravu brigádou (když
 * je co opravit a trenér o opravě píše). Uzavřený incident (trest už padl, lup ale u hráče
 * zůstal nebo je pořád rozbito): slíbí, že to do dvou dní vrátí nebo opraví (amends.ts).
 */
export async function tryRestitution(
  db: D1Database,
  o: { teamId: string; playerId: string; text: string; gameDate: string },
): Promise<RestitutionOutcome | null> {
  const request = amendsRequestOf(o.text);
  if (request.size === 0) return null;
  const open = await db.prepare(
    `SELECT id, kind, category, status, loss, culprit_revealed FROM club_incidents
      WHERE team_id = ? AND culprit_type = 'hrac' AND culprit_player_id = ? AND status IN ('otevreny', 'policie')
        AND category IN ('kradez', 'poskozeni')
      ORDER BY game_date DESC LIMIT 1`,
  ).bind(o.teamId, o.playerId).first<IncidentRow>()
    .catch((e) => { logger.warn({ module: M }, `incident pachatele ${o.playerId}`, e); return null; });
  const closedIncident = open ? null : await db.prepare(
    `SELECT id, kind, category, status, loss, culprit_revealed FROM club_incidents
      WHERE team_id = ? AND culprit_type = 'hrac' AND culprit_player_id = ? AND status = 'uzavreny' AND culprit_revealed = 1
        AND category IN ('kradez', 'poskozeni') AND COALESCE(recovered, 0) = 0
        AND COALESCE(resolution, '') NOT IN (${SETTLED_RESOLUTIONS.map(() => "?").join(", ")})
        AND julianday(substr(resolved_on, 1, 10)) >= julianday(substr(?, 1, 10)) - ?
      ORDER BY resolved_on DESC LIMIT 1`,
  ).bind(o.teamId, o.playerId, ...SETTLED_RESOLUTIONS, o.gameDate, CLOSED_AMENDS_DAYS).first<IncidentRow>()
    .catch((e) => { logger.warn({ module: M }, `uzavřený incident pachatele ${o.playerId}`, e); return null; });
  const inc = open ?? closedIncident;
  if (!inc) return null;

  const losses = nactiZtraty(inc.loss);
  let plan: AmendsPlan | null = null;
  if (open) {
    const repair = inc.category === "poskozeni" && request.has("repair") && (await repairableLosses(db, o.teamId, losses)).length > 0;
    plan = repair ? "task_repair" : inc.category === "kradez" ? "return_now" : "pay_now";
  } else if (inc.category === "kradez" && (request.has("return") || request.has("pay"))) {
    if ((await returnableLosses(db, o.teamId, losses)).length > 0) plan = "task_return";
  } else if (inc.category === "poskozeni" && request.has("repair")) {
    if ((await repairableLosses(db, o.teamId, losses)).length > 0) plan = "task_repair";
  }
  if (!plan) return null;

  // Jednou na incident: značka v taktikách výslechu (řádek pachatele ve znalostech).
  const mark = await db.prepare(
    `UPDATE club_incident_knowledge SET tactics = json_insert(COALESCE(tactics, '[]'), '$[#]', 'restitution')
      WHERE incident_id = ? AND player_id = ? AND team_id = ? AND role = 'pachatel'
        AND NOT EXISTS (SELECT 1 FROM json_each(COALESCE(club_incident_knowledge.tactics, '[]')) WHERE value = 'restitution')`,
  ).bind(inc.id, o.playerId, o.teamId).run()
    .catch((e) => { logger.warn({ module: M }, `značka přemlouvání ${inc.id}`, e); return null; });
  if ((mark?.meta?.changes ?? 0) === 0) return null;

  const player = await nactiHraceKadru(db, o.teamId, o.playerId);
  if (!player) return null;
  const clueOnHim = stopaNaHrace(await nactiStopy(db, inc.id), player.id);
  const t = plain(o.text);
  const chance = restitutionChance(player, {
    revealed: inc.culprit_revealed === 1, clueOnHim, leniency: LENIENCY_RE.test(t), insult: INSULT_RE.test(t),
  });
  const rng = createRng(seedFromString(`restitution|${inc.id}|${o.playerId}`));
  if (rng.random() * 100 >= chance) {
    // Odmítl: hráč o tom ví a v odpovědi trenérovi nevyhoví (odhalený), nebo zapírá dál.
    if (inc.culprit_revealed === 1) {
      await addCulpritFact(db, inc.id, o.playerId, plan === "task_repair"
        ? "Trenér po tobě chtěl, ať to opravíš. Odmítl jsi to, tak to sám od sebe neslibuj."
        : closedIncident
          ? "Trenér po tobě chtěl, ať to vrátíš. Odmítl jsi to, tak vrácení sám od sebe neslibuj."
          : "Trenér po tobě chce, ať to vrátíš nebo zaplatíš. Nechce se ti a vymlouváš se.");
    }
    logger.info({ module: M, teamId: o.teamId }, `pachatel ${o.playerId} odmítl napravit ${inc.id} (šance ${chance} %)`);
    return { outcome: "refused" };
  }

  if (plan === "task_return" || plan === "task_repair") return promiseAmends(db, o, inc, plan);

  const name = `${player.krestni} ${player.prijmeni}`;
  const title = nazevIncidentu(inc.kind);
  const { returned, cash, damage } = await returnLosses(db, o.teamId, inc.id, losses);
  // Rozbité zaplatí ze svého, nejvýš čtyři týdenní odměny (stejný strop jako srážka ze mzdy).
  const paid = damage > 0 ? castkaSrazky(damage, player.mzda) : 0;
  const total = cash + paid;
  const outcome: "returned" | "paid" = plan === "return_now" ? "returned" : "paid";

  const closed = await db.prepare(
    `UPDATE club_incidents SET status = 'uzavreny', culprit_revealed = 1, resolution = ?, resolution_data = ?, resolved_on = ?
      WHERE id = ? AND team_id = ? AND status IN ('otevreny', 'policie')`,
  ).bind(outcome === "returned" ? "vratil" : "nahradil", JSON.stringify({ castka: total, vraceno: returned }), o.gameDate, inc.id, o.teamId).run()
    .catch((e) => { logger.error({ module: M }, `uzavření incidentu po vrácení ${inc.id}`, e); return null; });
  if ((closed?.meta?.changes ?? 0) === 0) return null;
  if (total > 0) {
    await recordTransaction(db, o.teamId, "incident_recovery", total, `${outcome === "returned" ? "Vrácený lup" : "Náhrada škody"} od hráče: ${name}`, o.gameDate, `nahrada-${inc.id}`)
      .catch((e) => logger.error({ module: M }, `náhrada od hráče ${inc.id}`, e));
  }
  await db.prepare(
    `UPDATE club_incident_knowledge SET interrogation = 'priznal', interrogated_on = COALESCE(interrogated_on, ?)
      WHERE incident_id = ? AND player_id = ? AND team_id = ? AND role = 'pachatel'`,
  ).bind(o.gameDate, inc.id, o.playerId, o.teamId).run()
    .catch((e) => logger.warn({ module: M }, `přiznání po vrácení ${inc.id}`, e));
  await addCulpritFact(db, inc.id, o.playerId, outcome === "returned"
    ? "Trenér tě přemluvil a ty jsi to přiznal a všechno vrátil. Je ti to trapné, ale ulevilo se ti."
    : "Trenér tě přemluvil a ty jsi to přiznal a škodu zaplatil ze svého. Je ti to trapné, ale ulevilo se ti.");

  const what = [...returned, ...(cash > 0 ? [`${cash.toLocaleString("cs-CZ")} Kč`] : [])];
  const body = outcome === "returned"
    ? `✋ ${name} se přiznal (${title}) a vrátil ${what.length > 0 ? what.join(", ") : "co vzal"}. Incident je vyřešený.`
    : `✋ ${name} se přiznal (${title}) a škodu zaplatil${paid > 0 ? `, ${paid.toLocaleString("cs-CZ")} Kč` : ""}. Incident je vyřešený.`;
  await sendIncidentSystemSms(db, o.teamId, SMS_ROLE_KUSTOD, body, smsIncidentu(inc.id))
    .catch((e) => logger.warn({ module: M }, `SMS po vrácení ${inc.id}`, e));
  logger.info({ module: M, teamId: o.teamId }, `pachatel ${o.playerId} ${outcome} ${inc.id}: ${total} Kč`);
  return { outcome, amount: total };
}

/**
 * Hráč kývl, že škodu napraví později: úkol s lhůtou (amends.ts). U otevřeného incidentu se tím
 * přiznal. Do znalostí jde, co slíbil a do kdy, ať v odpovědi trenérovi slibuje přesně tohle.
 */
async function promiseAmends(
  db: D1Database, o: { teamId: string; playerId: string; text: string; gameDate: string }, inc: IncidentRow, task: AmendsTask,
): Promise<RestitutionOutcome | null> {
  const dueOn = await recordAmendsTask(db, { teamId: o.teamId, playerId: o.playerId, incidentId: inc.id, task, coachMessage: o.text, gameDate: o.gameDate });
  if (!dueOn) return null;
  if (inc.status !== "uzavreny") {
    await db.batch([
      db.prepare("UPDATE club_incidents SET culprit_revealed = 1 WHERE id = ? AND team_id = ?").bind(inc.id, o.teamId),
      db.prepare(
        `UPDATE club_incident_knowledge SET interrogation = 'priznal', interrogated_on = COALESCE(interrogated_on, ?)
          WHERE incident_id = ? AND player_id = ? AND team_id = ? AND role = 'pachatel'`,
      ).bind(o.gameDate, inc.id, o.playerId, o.teamId),
    ]).catch((e) => logger.warn({ module: M }, `přiznání se slibem nápravy ${inc.id}`, e));
  }
  await addCulpritFact(db, inc.id, o.playerId, task === "task_return"
    ? `Trenér tě požádal, ať to vrátíš, a ty jsi slíbil, že to vrátíš ${dueWords(dueOn)}.`
    : `Trenér chtěl, ať to opravíš, a ty jsi slíbil, že to s brigádou opravíš ${dueWords(dueOn)}.`);
  logger.info({ module: M, teamId: o.teamId }, `pachatel ${o.playerId} slíbil ${task} ${inc.id} do ${dueOn}`);
  return { outcome: "promised", task, dueOn };
}

/** Doplní pachateli do znalostí, co se stalo, ať o tom v odpovědi trenérovi ví. */
async function addCulpritFact(db: D1Database, incidentId: string, playerId: string, fact: string): Promise<void> {
  await db.prepare(
    `UPDATE club_incident_knowledge SET fact = fact || ' ' || ?
      WHERE incident_id = ? AND player_id = ? AND role = 'pachatel'`,
  ).bind(fact, incidentId, playerId).run()
    .catch((e) => logger.warn({ module: M }, `znalost pachatele ${incidentId}`, e));
}
