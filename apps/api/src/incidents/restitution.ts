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
 * Rozhoduje se jednou na incident (značka `restitution` ve sloupci `tactics`, migrace 0317).
 * Další výzva (téhož dne i později) nové losování nemá: dostane stejné rozhodnutí znovu
 * (`repeated`). Kdo odmítl, odmítá dál; kdo slíbil, jeho slib (úkol s lhůtou) platí.
 * Volá incidents/zprava-trenera.ts ještě před odpovědí hráče. Rozhodnutí jde do
 * `life_context.amendsDecision` a odpověď dostane pevný pokyn (amends-decision.ts).
 */

import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { recordTransaction } from "../season/finance-processor";
import { sendIncidentSystemSms } from "./club-messages";
import { nactiHraceKadru, smsIncidentu } from "./incident-db";
import { nazevIncidentu } from "./katalog";
import { SMS_ROLE_KUSTOD, ZNALOST_PACHATEL_DNI } from "./nastaveni";
import { nactiZtraty } from "./popis";
import { nactiStopy } from "./stopy-db";
import { castkaSrazky } from "./tresty";
import {
  dueWords, recordAmendsTask, repairableLosses, replacedLosses, returnableLosses, returnLosses, type AmendsTask,
} from "./amends";
import type { Ztrata } from "./typy";
import { incidentNamedInText } from "./tema";
import { stopaNaHrace } from "./vysetrovani";
import type { AmendsDecision } from "./amends-decision";

const M = "incidents-restitution";

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
}

/** Co trenér po pachateli chce: vrátit, zaplatit, nebo opravit (brigádou). */
export type AmendsRequest = "return" | "pay" | "repair";

/**
 * „Vrať to“, „vrátíš ty poháry?“, „dáš to klukům zpátky?“, „přineseš ty dresy?“. Samotné
 * „přineseš to“ ne („přineseš to pivo?“): jen se „zpátky“, místem v klubu nebo ukradenou věcí.
 * Procházka (E2E 22. 11.) dostal „Dáš to klukům zpátky, nebo nic?“, slíbil a hra nic nezapsala.
 */
const RETURN_RE = new RegExp(`\\b(${[
  "vrat", "vratis", "vratit", "vratte", "vrat to", "vrat ty", "vrat mi", "vrat to zpatky",
  "dej (to|ty|je) (zpatky|zpet)", "das (to|ty|je|mi|nam|klubu|klukum)( \\w+)? (zpatky|zpet)", "das zpatky",
  "(prines|dones)(es|te)? (to|ty|je)( \\w+)? (zpatky|zpet)",
  "(prines|dones)(es|te)? (to|ty|je) do (klubu|kabiny|skladu|klubovny|vitriny)",
  "(prines|dones)(es|te)? (ty|ten|tu) (pohary|dresy|mice|penize|prachy|veci|pomucky|kasu|tombolu)",
].join("|")})\\b`);
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

export type RestitutionOutcome = (
  | { outcome: "returned" | "paid"; amount: number }
  /** Kývl, že to do `dueOn` (herní den) vrátí nebo opraví brigádou (amends.ts). */
  | { outcome: "promised"; task: AmendsTask; dueOn: string }
  | { outcome: "refused" }
) & {
  /** Incident, o který šlo. Zpráva trenéra se jím stává tématem rozhovoru (zprava-trenera.ts). */
  incidentId: string;
  /** Rozhodlo se už dřív (další výzva k témuž incidentu): stejné rozhodnutí, nový los ani zápis není. */
  repeated?: true;
};

interface IncidentRow {
  id: string; kind: string; category: string; status: string; loss: string | null; culprit_revealed: number;
}

/**
 * Uzavřený incident, u kterého jde škodu ještě napravit, se hledá tolik dní zpátky. Stejně
 * dlouho si pachatel průšvih pamatuje (`ZNALOST_PACHATEL_DNI`): dokud mu prompt říká, že lup
 * má u sebe a vrátit ho může (znalosti.ts `lootLine`), musí jít slib i zapsat.
 */
const CLOSED_AMENDS_DAYS = ZNALOST_PACHATEL_DNI;
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
interface CandidateRow extends IncidentRow {
  recovered: number | null; resolution: string | null; resolved_on: string | null;
}

/**
 * Incident hráče, u kterého jde škoda napravit. Přednost má ten, o kterém zpráva mluví (druh,
 * místo, věc: `incidentNamedInText`), pak téma rozhovoru (`topicIncidentId`), a teprve když
 * zpráva nic konkrétního nejmenuje, nejnovější: otevřený, jinak uzavřený s lupem u něj.
 * Sedlecký (E2E 22. 11.) měl tombolu i vloupání do skladu uzavřené týž den; trenér chtěl
 * peníze z tomboly a hra zapsala vrácení tréninkových pomůcek. Zpráva jmenuje incident, který
 * napravit nejde (vráceno, nikdo neví, že to byl on): null, ne jiný incident.
 */
async function amendableIncident(
  db: D1Database, o: { teamId: string; playerId: string; gameDate: string; text?: string; topicIncidentId?: string | null },
): Promise<{ inc: IncidentRow; open: boolean } | null> {
  const rows = await db.prepare(
    `SELECT id, kind, category, status, loss, culprit_revealed, recovered, resolution, resolved_on FROM club_incidents
      WHERE team_id = ? AND culprit_type = 'hrac' AND culprit_player_id = ? AND category IN ('kradez', 'poskozeni')
        AND (status IN ('otevreny', 'policie')
             OR (status = 'uzavreny' AND julianday(substr(resolved_on, 1, 10)) >= julianday(substr(?, 1, 10)) - ?))
      ORDER BY game_date DESC LIMIT 20`,
  ).bind(o.teamId, o.playerId, o.gameDate, CLOSED_AMENDS_DAYS).all<CandidateRow>()
    .catch((e) => { logger.warn({ module: M }, `incidenty pachatele ${o.playerId}`, e); return null; });
  const all = rows?.results ?? [];
  const isOpen = (r: CandidateRow) => r.status === "otevreny" || r.status === "policie";
  const open = all.filter(isOpen);
  const closed = all
    .filter((r) => r.status === "uzavreny" && r.culprit_revealed === 1 && (r.recovered ?? 0) === 0 && !SETTLED_RESOLUTIONS.includes(r.resolution ?? ""))
    .sort((a, b) => (b.resolved_on ?? "").localeCompare(a.resolved_on ?? ""));
  const amendable = [...open, ...closed];
  const pick = (r: CandidateRow | undefined) => (r ? { inc: r, open: isOpen(r) } : null);
  if (o.text) {
    const ordered = [...amendable, ...all.filter((r) => !amendable.includes(r))];
    const named = incidentNamedInText(o.text, ordered.map((r) => ({ id: r.id, kind: r.kind, ztraty: nactiZtraty(r.loss) })));
    if (named) {
      const found = amendable.find((r) => r.id === named);
      if (!found) logger.info({ module: M }, `zpráva pro ${o.playerId} mluví o ${named}, ten napravit nejde`);
      return pick(found);
    }
  }
  const topic = o.topicIncidentId ? amendable.find((r) => r.id === o.topicIncidentId) : undefined;
  return pick(topic ?? amendable[0]);
}

/** Je co vrátit: lup klub nemá zpátky, nebo si koupil náhradu (pak vrácené prodá, amends.ts). */
async function somethingToReturn(db: D1Database, teamId: string, losses: readonly Ztrata[]): Promise<boolean> {
  return (await returnableLosses(db, teamId, losses)).length > 0 || (await replacedLosses(db, teamId, losses)).length > 0;
}

/** Jednou na incident: značka v taktikách výslechu (řádek pachatele ve znalostech). Vrací, jestli ji teď zapsal. */
async function markRestitutionTried(db: D1Database, incidentId: string, playerId: string, teamId: string): Promise<boolean> {
  const mark = await db.prepare(
    `UPDATE club_incident_knowledge SET tactics = json_insert(COALESCE(tactics, '[]'), '$[#]', 'restitution')
      WHERE incident_id = ? AND player_id = ? AND team_id = ? AND role = 'pachatel'
        AND NOT EXISTS (SELECT 1 FROM json_each(COALESCE(club_incident_knowledge.tactics, '[]')) WHERE value = 'restitution')`,
  ).bind(incidentId, playerId, teamId).run()
    .catch((e) => { logger.warn({ module: M }, `značka přemlouvání ${incidentId}`, e); return null; });
  return (mark?.meta?.changes ?? 0) > 0;
}

/**
 * Rozhodnutí z dřívější výzvy k témuž incidentu: běžící úkol vrátit nebo opravit = slib platí,
 * jinak odmítl (kývnutí s vrácením hned incident uzavře a sem se nedojde).
 */
async function priorDecision(db: D1Database, incidentId: string, playerId: string): Promise<RestitutionOutcome> {
  const task = await db.prepare(
    `SELECT kind, status, details FROM coach_commitments
      WHERE player_id = ? AND kind IN ('task_return', 'task_repair') AND json_extract(details, '$.incidentId') = ?
      ORDER BY made_at DESC LIMIT 1`,
  ).bind(playerId, incidentId).first<{ kind: AmendsTask; status: string; details: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `dřívější slib nápravy ${incidentId}`, e); return null; });
  if (task?.status === "active") {
    let dueOn: string | undefined;
    try {
      dueOn = (JSON.parse(task.details ?? "{}") as { dueOn?: string }).dueOn;
    } catch (e) {
      logger.warn({ module: M }, `detaily slibu nápravy ${incidentId}`, e);
    }
    if (dueOn) return { outcome: "promised", task: task.kind, dueOn, incidentId, repeated: true };
  }
  return { outcome: "refused", incidentId, repeated: true };
}

/** Co trenér chtěl, slovesem do pokynu (amends-decision.ts). */
function askedVerb(request: ReadonlySet<AmendsRequest>, plan: AmendsPlan): string {
  if (plan === "task_repair" || (request.has("repair") && !request.has("return") && !request.has("pay"))) return "opravíš";
  if (request.has("return") && request.has("pay")) return "vrátíš nebo zaplatíš";
  return request.has("pay") ? "zaplatíš" : "vrátíš";
}

/**
 * Rozhodnutí do `life_context.amendsDecision`: odpověď hráče z něj dostane pevný pokyn.
 * Odmítnutí neodhaleného pachatele ne: pokyn by modelu prozradil, že to byl on (zapírá dál).
 */
async function saveDecision(
  db: D1Database, o: { playerId: string; now?: Date }, r: RestitutionOutcome, asked: string, revealed: boolean,
): Promise<void> {
  if (r.outcome === "refused" && !revealed) return;
  const decision: AmendsDecision = {
    incidentId: r.incidentId, outcome: r.outcome, asked, at: (o.now ?? new Date()).toISOString(),
    ...(r.outcome === "promised" ? { task: r.task, dueText: dueWords(r.dueOn) } : {}),
  };
  await db.prepare(
    `UPDATE players SET life_context = json_set(CASE WHEN json_valid(life_context) THEN life_context ELSE '{}' END, '$.amendsDecision', json(?))
      WHERE id = ?`,
  ).bind(JSON.stringify(decision), o.playerId).run()
    .catch((e) => logger.warn({ module: M }, `rozhodnutí o nápravě pro odpověď ${r.incidentId}`, e));
}

/** Rozhodovalo se už o nápravě tohohle incidentu (značka `restitution`)? */
async function restitutionTried(db: D1Database, incidentId: string, playerId: string, teamId: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 AS x FROM club_incident_knowledge
      WHERE incident_id = ? AND player_id = ? AND team_id = ? AND role = 'pachatel'
        AND EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(tactics) THEN tactics ELSE '[]' END) WHERE value = 'restitution')`,
  ).bind(incidentId, playerId, teamId).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: M }, `značka přemlouvání ${incidentId}`, e); return null; });
  return !!row;
}

/** Los, jestli pachatel napravit kývne. Stejné semínko pro žádost trenéra i jeho vlastní slib. */
function agreesToAmends(incidentId: string, playerId: string, chance: number): boolean {
  return createRng(seedFromString(`restitution|${incidentId}|${playerId}`)).random() * 100 < chance;
}

export async function tryRestitution(
  db: D1Database,
  o: {
    teamId: string; playerId: string; text: string; gameDate: string; now?: Date;
    /** Incident, o kterém se dnes v rozhovoru mluví: platí, když zpráva sama nic nejmenuje („zaplatíš to, nebo ne?“). */
    topicIncidentId?: string | null;
  },
): Promise<RestitutionOutcome | null> {
  const r = await decideRestitution(db, o);
  if (r) await saveDecision(db, o, r.outcome, r.asked, r.revealed);
  return r?.outcome ?? null;
}

async function decideRestitution(
  db: D1Database,
  o: { teamId: string; playerId: string; text: string; gameDate: string; topicIncidentId?: string | null },
): Promise<{ outcome: RestitutionOutcome; asked: string; revealed: boolean } | null> {
  const request = amendsRequestOf(o.text);
  if (request.size === 0) return null;
  const found = await amendableIncident(db, o);
  if (!found) return null;
  const { inc } = found;
  const closedIncident = found.open ? null : inc;

  const losses = nactiZtraty(inc.loss);
  let plan: AmendsPlan | null = null;
  if (found.open) {
    const repair = inc.category === "poskozeni" && request.has("repair") && (await repairableLosses(db, o.teamId, losses)).length > 0;
    plan = repair ? "task_repair" : inc.category === "kradez" ? "return_now" : "pay_now";
  } else if (inc.category === "kradez" && (request.has("return") || request.has("pay"))) {
    // Turek: vitrínu klub dokoupil, poháry má pořád on. Vrátit je jde, klub je pak prodá.
    if (await somethingToReturn(db, o.teamId, losses)) plan = "task_return";
  } else if (inc.category === "poskozeni" && request.has("repair")) {
    if ((await repairableLosses(db, o.teamId, losses)).length > 0) plan = "task_repair";
  }
  if (!plan) return null;
  const asked = askedVerb(request, plan);
  const revealed = inc.culprit_revealed === 1;

  // Už se rozhodlo (dřív téhož dne nebo jindy): stejné rozhodnutí, žádný nový los.
  if (!(await markRestitutionTried(db, inc.id, o.playerId, o.teamId))) {
    return { outcome: await priorDecision(db, inc.id, o.playerId), asked, revealed };
  }

  const player = await nactiHraceKadru(db, o.teamId, o.playerId);
  if (!player) return null;
  const clueOnHim = stopaNaHrace(await nactiStopy(db, inc.id), player.id);
  const t = plain(o.text);
  const chance = restitutionChance(player, {
    revealed: inc.culprit_revealed === 1, clueOnHim, leniency: LENIENCY_RE.test(t), insult: INSULT_RE.test(t),
  });
  if (!agreesToAmends(inc.id, o.playerId, chance)) {
    // Odmítl: hráč o tom ví a v odpovědi trenérovi nevyhoví (odhalený), nebo zapírá dál.
    if (inc.culprit_revealed === 1) {
      await addCulpritFact(db, inc.id, o.playerId, plan === "task_repair"
        ? "Trenér po tobě chtěl, ať to opravíš. Odmítl jsi to, tak to sám od sebe neslibuj."
        : closedIncident
          ? "Trenér po tobě chtěl, ať to vrátíš. Odmítl jsi to, tak vrácení sám od sebe neslibuj."
          : "Trenér po tobě chce, ať to vrátíš nebo zaplatíš. Nechce se ti to napravit, ale nezapíráš, že jsi to byl ty.");
    }
    logger.info({ module: M, teamId: o.teamId }, `pachatel ${o.playerId} odmítl napravit ${inc.id} (šance ${chance} %)`);
    return { outcome: { outcome: "refused", incidentId: inc.id }, asked, revealed };
  }

  if (plan === "task_return" || plan === "task_repair") {
    const promised = await promiseAmends(db, o, inc, plan);
    return promised ? { outcome: promised, asked, revealed: true } : null;
  }

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
  return { outcome: { outcome, amount: total, incidentId: inc.id }, asked, revealed: true };
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
    ? sentenceEnd(`Trenér tě požádal, ať to vrátíš, a ty jsi slíbil, že to vrátíš ${dueWords(dueOn)}`)
    : sentenceEnd(`Trenér chtěl, ať to opravíš, a ty jsi slíbil, že to s brigádou opravíš ${dueWords(dueOn)}`));
  logger.info({ module: M, teamId: o.teamId }, `pachatel ${o.playerId} slíbil ${task} ${inc.id} do ${dueOn}`);
  return { outcome: "promised", task, dueOn, incidentId: inc.id };
}

// ── Slib v odpovědi hráče ──

/**
 * Hráč v odpovědi trenérovi slíbil, že to vrátí („Jo, vrátím je, trenére“, „Jasně, dám to
 * zpátky“, „přinesu je zpátky“). U krádeže i „zaplatím to“ (Sedlecký, E2E 22. 11.: peníze
 * z tomboly). Bez objektu („vrátím se na trénink“), záporu ani podmínky ne.
 */
const PROMISE_RETURN_RE = /\b(vratim (to|je|ty|vam|ti|vsechno|klubu|penize|pohary|dresy|mice|veci|co jsem vzal)|vratime (to|je|ty)|dam (to|je|ty|vam|ti|klubu|klukum|penize)( \w+)? (zpatky|zpet)|dam zpatky|prinesu (to|je|ty)|donesu (to|je|ty)|(to|je|ty) (prinesu|donesu|vratim|zaplatim)|(prinesu|donesu) (zpatky|zpet)|zaplatim (to|je|ty|vam|ti|klubu|skodu|penize|vsechno))\b/;
/** Slíbil opravu („opravím to“, „spravíme to s klukama“, „uděláme brigádu“). */
const PROMISE_REPAIR_RE = /\b(opravim (to|je|ty)|opravime (to|je|ty)|spravim (to|je|ty)|spravime (to|je|ty)|dam to do poradku|dame to do poradku|udelame brigadu|udelam brigadu)\b/;
const PROMISE_CONDITION_RE = /\b(kdyby|kdybych|jestli|pokud)\b/;

/** Co hráč ve zprávě slíbil napravit. Věta s podmínkou nebo otázka slib není. */
export function promisedAmendsOf(reply: string): Set<"return" | "repair"> {
  const out = new Set<"return" | "repair">();
  for (const raw of reply.split(/(?<=[.!?…])\s+|\n+/)) {
    const s = plain(raw.trim());
    if (!s || s.endsWith("?") || PROMISE_CONDITION_RE.test(s)) continue;
    if (PROMISE_RETURN_RE.test(s)) out.add("return");
    if (PROMISE_REPAIR_RE.test(s)) out.add("repair");
  }
  return out;
}

export function promisesAmends(reply: string): boolean {
  return promisedAmendsOf(reply).size > 0;
}

/**
 * Hráč sám v odpovědi slíbil, že to vrátí nebo opraví: slib se zapíše jako úkol s lhůtou
 * (amends.ts), ať má dopad. Turek (Fezko, E2E 22. 11.) odmítl podle losu a stejně napsal
 * „Jo, vrátím je, trenére.“; hra nezapsala nic a poháry se nevrátily. Kdo podle povahy
 * nekývne (stejný los jako na žádost trenéra), slib dostane také, ale v termínu ho nesplní:
 * napíše výmluvu, škoda trvá a ví, že slib nedodržel. Kdo už žádost trenéra odmítl, má
 * rozhodnuto (jednou na incident): slib je jen slovo a nesplní ho, i kdyby bez urážky
 * v žádosti los vyšel jinak. Jen u provaleného průšvihu. Vrací lhůtu, nebo null.
 */
export async function recordPromisedAmends(
  db: D1Database,
  o: { teamId: string; playerId: string; reply: string; now?: Date; topicIncidentId?: string | null },
): Promise<{ task: AmendsTask; dueOn: string; willFail: boolean } | null> {
  const promised = promisedAmendsOf(o.reply);
  if (promised.size === 0) return null;
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(o.teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `herní den pro slib nápravy ${o.teamId}`, e); return null; });
  if (!team?.game_date) return null;
  const found = await amendableIncident(db, { teamId: o.teamId, playerId: o.playerId, gameDate: team.game_date, text: o.reply, topicIncidentId: o.topicIncidentId });
  if (!found || found.inc.culprit_revealed !== 1) return null;
  const { inc } = found;
  const losses = nactiZtraty(inc.loss);
  const task: AmendsTask | null = inc.category === "kradez" && promised.has("return") && await somethingToReturn(db, o.teamId, losses)
    ? "task_return"
    : inc.category === "poskozeni" && promised.has("repair") && (await repairableLosses(db, o.teamId, losses)).length > 0
      ? "task_repair" : null;
  if (!task) return null;

  const player = await nactiHraceKadru(db, o.teamId, o.playerId);
  if (!player) return null;
  const clueOnHim = stopaNaHrace(await nactiStopy(db, inc.id), player.id);
  const chance = restitutionChance(player, { revealed: true, clueOnHim, leniency: false, insult: false });
  // Žádost trenéra už odmítl (značka je, úkol ne, jinak by recordAmendsTask nic nezapsal): rozhodnuto.
  const willFail = (await restitutionTried(db, inc.id, o.playerId, o.teamId)) || !agreesToAmends(inc.id, o.playerId, chance);
  const dueOn = await recordAmendsTask(db, {
    teamId: o.teamId, playerId: o.playerId, incidentId: inc.id, task, coachMessage: o.reply, gameDate: team.game_date, now: o.now, willFail,
  });
  if (!dueOn) return null;
  await markRestitutionTried(db, inc.id, o.playerId, o.teamId);
  await addCulpritFact(db, inc.id, o.playerId, task === "task_return"
    ? sentenceEnd(`Sám jsi trenérovi slíbil, že to vrátíš ${dueWords(dueOn)}`)
    : sentenceEnd(`Sám jsi trenérovi slíbil, že to s brigádou opravíš ${dueWords(dueOn)}`));
  logger.info({ module: M, teamId: o.teamId }, `pachatel ${o.playerId} sám slíbil ${task} ${inc.id} do ${dueOn}${willFail ? " (nesplní)" : ""}`);
  return { task, dueOn, willFail };
}

/** Věta končí datem („14. 11.“): druhá tečka by byla navíc. */
function sentenceEnd(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

/** Doplní pachateli do znalostí, co se stalo, ať o tom v odpovědi trenérovi ví. */
async function addCulpritFact(db: D1Database, incidentId: string, playerId: string, fact: string): Promise<void> {
  await db.prepare(
    `UPDATE club_incident_knowledge SET fact = fact || ' ' || ?
      WHERE incident_id = ? AND player_id = ? AND role = 'pachatel'`,
  ).bind(fact, incidentId, playerId).run()
    .catch((e) => logger.warn({ module: M }, `znalost pachatele ${incidentId}`, e));
}
