/**
 * Pachatel slíbí, že škodu napraví: vrátí, co vzal, nebo rozbité opraví brigádou.
 *
 * Turek (Fezko Výškovice) 24. 10. na „Vrátíš ty poháry?“ odepsal „Jasně že je přinesu
 * zpátky… V pondělí je máš v kabině.“ Incident `vitrina` byl ale od 23. 10. uzavřený srážkou,
 * přemlouvání (restitution.ts) běželo jen u otevřeného incidentu a poháry se nevrátily nikdy.
 * 11. 10. slíbil „s Pexou to opravíme“ a sprchy zůstaly rozbité, oprava brigádou ve hře nebyla.
 *
 * Teď trenérova žádost (restitution.ts) při kývnutí založí úkol hráče (`coach_commitments`,
 * druh `task_return` nebo `task_repair`) s lhůtou dva dny. Denní vyhodnocení slibů
 * (`settleCoachCommitments`) ho pak splní (`settleAmendsTask`): podle povahy hráč věci opravdu
 * vrátí (vybavení zpátky, hotovost do kasy, `recovered = 1`) nebo opraví (oprava zdarma, trávník,
 * stav vybavení; hráč je po brigádě unavený), napíše „vráceno“ / „hotovo“ a kustod to potvrdí.
 * Když to nestihne, napíše výmluvu a škoda platí dál. Jednou na incident.
 *
 * E2E 22. 11. (Turek znovu): klub vitrínu mezitím dokoupil, takže „není co vracet“ a slib
 * „Jo, vrátím je“ zůstal bez dopadu. Vrácené vybavení, které už klub nahradil, teď klub prodá
 * do zastavárny (`resaleValue`, peníze do kasy). A úkol vzniká i ze slibu hráče v odpovědi
 * (restitution.ts `recordPromisedAmends`); kdo podle povahy nekývl, ho má s `willFail` a nesplní.
 */

import {
  CATEGORIES, CATEGORY_LABELS, PAWN_RATE, cumulativeInvestment, equipmentConditionFactor,
} from "../equipment/equipment-generator";
import { createRng } from "../generators/rng";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { sendPlayerTemplateSMS } from "../messaging/system-sms";
import { recordTransaction } from "../season/finance-processor";
import { FACILITY_LABELS } from "../stadium/stadium-generator";
import { czechDayWords } from "../weddings/wedding";
import { clubReceivesMessages, sendIncidentSystemSms } from "./club-messages";
import { smsIncidentu } from "./incident-db";
import { nazevIncidentu } from "./katalog";
import { SMS_ROLE_KUSTOD } from "./nastaveni";
import { nactiZtraty } from "./popis";
import { hodnotaSkody } from "./tresty";
import type { Ztrata } from "./typy";

const M = "incidents-amends";
const DAY_MS = 86_400_000;

export type AmendsTask = "task_return" | "task_repair";
/** Za kolik dní má hráč věci vrátit nebo opravit. */
export const AMENDS_DUE_DAYS = 2;
/** Únava po brigádě (kondice dolů). */
const REPAIR_FATIGUE = 10;

// ── Co jde vrátit a opravit ──

/** Ukradené, co jde vrátit: vybavení, které klub ještě nemá zpátky, a hotovost. */
export async function returnableLosses(db: D1Database, teamId: string, losses: readonly Ztrata[]): Promise<Ztrata[]> {
  const out: Ztrata[] = [];
  for (const z of losses) {
    if (z.typ === "penize" && z.castka > 0) { out.push(z); continue; }
    if (z.typ !== "vybaveni" || !(CATEGORIES as readonly string[]).includes(z.kategorie)) continue;
    const row = await db.prepare(`SELECT ${z.kategorie} AS lvl FROM equipment WHERE team_id = ?`).bind(teamId).first<{ lvl: number | null }>()
      .catch((e) => { logger.warn({ module: M }, `vybavení ${z.kategorie} ${teamId}`, e); return null; });
    if (row && (row.lvl ?? 0) < z.uroven) out.push(z);
  }
  return out;
}

/**
 * Ukradené vybavení, které si klub mezitím koupil znovu (úroveň je zpátky). Turek (Fezko
 * Výškovice): vitrínu klub 24. 10. dokoupil na úroveň 2, poháry ale zůstaly u něj. Vrátit je
 * pořád může, jen klub originál nepotřebuje: prodá ho (`resaleValue`).
 */
export async function replacedLosses(db: D1Database, teamId: string, losses: readonly Ztrata[]): Promise<Ztrata[]> {
  const out: Ztrata[] = [];
  for (const z of losses) {
    if (z.typ !== "vybaveni" || !(CATEGORIES as readonly string[]).includes(z.kategorie)) continue;
    const row = await db.prepare(`SELECT ${z.kategorie} AS lvl FROM equipment WHERE team_id = ?`).bind(teamId).first<{ lvl: number | null }>()
      .catch((e) => { logger.warn({ module: M }, `nahrazené vybavení ${z.kategorie} ${teamId}`, e); return null; });
    if (row && (row.lvl ?? 0) >= z.uroven) out.push(z);
  }
  return out;
}

/**
 * Kolik klub dostane za vrácené vybavení, které už nahradil: výkup zastavárny (30 % ceny
 * ukradených úrovní podle stavu, `getPawnQuote`). Stejně by ho trenér zpeněžil sám.
 */
export function resaleValue(z: Ztrata): number {
  if (z.typ !== "vybaveni") return 0;
  const stolen = cumulativeInvestment(z.kategorie, z.uroven) - cumulativeInvestment(z.kategorie, Math.max(0, z.uroven - z.urovniDolu));
  const value = stolen * PAWN_RATE * equipmentConditionFactor(z.stav);
  // Zaokrouhlení jako u cen vybavení (equipment-generator.ts roundPrice).
  return value >= 10000 ? Math.round(value / 100) * 100 : Math.round(value / 10) * 10;
}

/** Rozbité, co jde opravit brigádou: neopravená škoda na stadionu, trávník, opotřebené vybavení. */
export async function repairableLosses(db: D1Database, teamId: string, losses: readonly Ztrata[]): Promise<Ztrata[]> {
  const out: Ztrata[] = [];
  for (const z of losses) {
    if (z.typ === "stadion" && z.damageId) {
      const d = await db.prepare("SELECT repaired_at FROM stadium_damage WHERE id = ? AND team_id = ?").bind(z.damageId, teamId)
        .first<{ repaired_at: string | null }>()
        .catch((e) => { logger.warn({ module: M }, `škoda na stadionu ${z.damageId}`, e); return null; });
      if (d && !d.repaired_at) out.push(z);
    } else if (z.typ === "travnik") {
      const s = await db.prepare("SELECT pitch_condition AS c FROM stadiums WHERE team_id = ?").bind(teamId).first<{ c: number | null }>()
        .catch((e) => { logger.warn({ module: M }, `trávník ${teamId}`, e); return null; });
      if (s && (s.c ?? 0) < z.pred) out.push(z);
    } else if (z.typ === "vybaveni_stav" && (CATEGORIES as readonly string[]).includes(z.kategorie)) {
      const e = await db.prepare(`SELECT ${z.kategorie}_condition AS c FROM equipment WHERE team_id = ?`).bind(teamId).first<{ c: number | null }>()
        .catch((err) => { logger.warn({ module: M }, `stav vybavení ${z.kategorie} ${teamId}`, err); return null; });
      if (e && (e.c ?? 0) < z.stavPred) out.push(z);
    }
  }
  return out;
}

/**
 * Vrátí ukradené: vybavení na úroveň a stav před krádeží, hotovost se sečte. `damage` je
 * hodnota ostatních ztrát, které vrátit nejde (rozbité při krádeži).
 */
export async function returnLosses(
  db: D1Database, teamId: string, incidentId: string, losses: readonly Ztrata[],
): Promise<{ returned: string[]; cash: number; damage: number }> {
  let cash = 0;
  let damage = 0;
  const returned: string[] = [];
  for (const z of losses) {
    if (z.typ === "penize") { cash += z.castka; continue; }
    if (z.typ === "vybaveni" && (CATEGORIES as readonly string[]).includes(z.kategorie)) {
      const r = await db.prepare(
        `UPDATE equipment SET ${z.kategorie} = ?, ${z.kategorie}_condition = ? WHERE team_id = ? AND ${z.kategorie} < ?`,
      ).bind(z.uroven, z.stav, teamId, z.uroven).run()
        .catch((e) => { logger.error({ module: M }, `vrácení vybavení ${incidentId}`, e); return null; });
      if ((r?.meta?.changes ?? 0) > 0) returned.push(CATEGORY_LABELS[z.kategorie] ?? z.kategorie);
      continue;
    }
    damage += hodnotaSkody([z]);
  }
  return { returned, cash, damage };
}

/** Opraví rozbité: škodu na stadionu zdarma, trávník a stav vybavení na hodnotu před škodou. */
export async function repairLosses(
  db: D1Database, teamId: string, incidentId: string, losses: readonly Ztrata[], gameDate: string,
): Promise<string[]> {
  const repaired: string[] = [];
  for (const z of losses) {
    if (z.typ === "stadion" && z.damageId) {
      const { opravZdarma } = await import("../stadium/stadium-damage");
      const r = await opravZdarma(db, { teamId, damageId: z.damageId, gameDate })
        .catch((e) => { logger.error({ module: M }, `oprava brigádou ${incidentId}`, e); return null; });
      if (r?.ok) repaired.push(FACILITY_LABELS[z.zarizeni] ?? z.zarizeni);
    } else if (z.typ === "travnik") {
      const r = await db.prepare("UPDATE stadiums SET pitch_condition = ? WHERE team_id = ? AND pitch_condition < ?")
        .bind(z.pred, teamId, z.pred).run()
        .catch((e) => { logger.error({ module: M }, `trávník po brigádě ${incidentId}`, e); return null; });
      if ((r?.meta?.changes ?? 0) > 0) repaired.push("trávník");
    } else if (z.typ === "vybaveni_stav" && (CATEGORIES as readonly string[]).includes(z.kategorie)) {
      const r = await db.prepare(`UPDATE equipment SET ${z.kategorie}_condition = ? WHERE team_id = ? AND ${z.kategorie}_condition < ?`)
        .bind(z.stavPred, teamId, z.stavPred).run()
        .catch((e) => { logger.error({ module: M }, `vybavení po brigádě ${incidentId}`, e); return null; });
      if ((r?.meta?.changes ?? 0) > 0) repaired.push(CATEGORY_LABELS[z.kategorie] ?? z.kategorie);
    }
  }
  return repaired;
}

/** Co pachatel vrátil, pro SMS (za dvojtečkou, rod ani číslo nevadí). Poháry z vitríny poznáme. */
export function returnedWhat(kind: string, returned: readonly string[], cash: number): string {
  const items = kind === "vitrina" && returned.length > 0 ? ["poháry z vitríny"] : returned.map((l) => l.charAt(0).toLowerCase() + l.slice(1));
  return [...items, ...(cash > 0 ? [`${cash.toLocaleString("cs-CZ")} Kč`] : [])].join(", ");
}

// ── Úkol hráče ──

/** Lhůta slovy pro prompt: „nejpozději v pondělí 26. 10.“ (herní den + `AMENDS_DUE_DAYS`). */
export function dueWords(dueOn: string | undefined): string {
  return dueOn ? `nejpozději ${czechDayWords(dueOn)}` : `do ${AMENDS_DUE_DAYS} dnů`;
}

/**
 * Hráč kývl, že to vrátí nebo opraví: úkol do `coach_commitments`. Jednou na incident a druh.
 * Vrací herní den lhůty, nebo null (úkol už je).
 */
export async function recordAmendsTask(
  db: D1Database,
  o: {
    teamId: string; playerId: string; incidentId: string; task: AmendsTask; coachMessage: string; gameDate: string; now?: Date;
    /** Slíbil, ale podle povahy to neudělá (restitution.ts `recordPromisedAmends`): v termínu výmluva. */
    willFail?: boolean;
  },
): Promise<string | null> {
  const now = o.now ?? new Date();
  const dup = await db.prepare(
    "SELECT 1 AS x FROM coach_commitments WHERE player_id = ? AND kind = ? AND json_extract(details, '$.incidentId') = ? LIMIT 1",
  ).bind(o.playerId, o.task, o.incidentId).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: M }, `úkol napravit ${o.incidentId}`, e); return null; });
  if (dup) return null;
  const conv = await db.prepare(
    "SELECT id FROM conversations WHERE team_id = ? AND type = 'player' AND participant_id = ? ORDER BY created_at, rowid LIMIT 1",
  ).bind(o.teamId, o.playerId).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, `konverzace pro úkol ${o.incidentId}`, e); return null; });
  const dueOn = new Date(Date.parse(`${o.gameDate.slice(0, 10)}T12:00:00Z`) + AMENDS_DUE_DAYS * DAY_MS).toISOString().slice(0, 10);
  const quote = o.coachMessage.replace(/\s+/g, " ").trim().slice(0, 160);
  const written = await db.prepare(
    `INSERT INTO coach_commitments (id, team_id, player_id, conversation_id, kind, status, made_at, due_at, quote, details)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), o.teamId, o.playerId, conv?.id ?? null, o.task, now.toISOString(),
    new Date(now.getTime() + AMENDS_DUE_DAYS * DAY_MS).toISOString(), quote,
    JSON.stringify({ incidentId: o.incidentId, dueOn, ...(o.willFail ? { willFail: true } : {}) })).run()
    .then(() => true)
    .catch((e) => { logger.error({ module: M }, `zápis úkolu napravit ${o.incidentId}`, e); return false; });
  return written ? dueOn : null;
}

/** Šance, že hráč slib opravdu splní: disciplína, vztah k trenérovi, u brigády i pracovitost. */
export function amendsDeliveryChance(p: { discipline: number; relationship: number; workRate: number }, task: AmendsTask): number {
  const base = 55 + (p.discipline - 50) * 0.4 + (p.relationship - 50) * 0.3 + (task === "task_repair" ? (p.workRate - 50) * 0.3 : 10);
  return Math.max(20, Math.min(95, Math.round(base)));
}

const RETURNED_SMS: readonly string[] = [
  "Trenére, vráceno: {what}. Promiňte, byla to blbost.",
  "Tak jsem to přinesl zpátky, trenére. Vráceno: {what}.",
  "Trenére, jak jsem slíbil. Vráceno: {what}. Už to víckrát neudělám.",
  "Hotovo, trenére, je to zpátky v klubu: {what}. Doufám, že je to tím vyřízený.",
  "Trenére, vrátil jsem to. V klubovně to najdete: {what}.",
  "Slíbil jsem to, tak to tady máte. Vráceno: {what}.",
  "Trenére, zpátky v klubu: {what}. Stydím se za to.",
  "Je to vrácený, trenére: {what}. Snad už je klid.",
];
const REPAIRED_SMS: readonly string[] = [
  "Trenére, hotovo, opravené: {what}. Bolí mě záda, ale je to jak nový.",
  "Tak jsme to s brigádou dali do pořádku. Opravené: {what}.",
  "Trenére, jak jsem slíbil, opraveno: {what}. Klub to nic nestálo.",
  "Hotovo, trenére. Opravené: {what}. Na tréninku budu možná trochu ztuhlej.",
  "Trenére, celý odpoledne jsme makali, ale opravené: {what}.",
  "Je to spravený, trenére: {what}. Snad je to tím vyřízený.",
  "Trenére, můžete se jít podívat, opravené: {what}.",
  "Brigáda za námi, trenére. Opravené: {what}. Pivo bychom si zasloužili.",
];
const RETURN_FAILED_SMS: readonly string[] = [
  "Trenére, nezlobte se, ještě jsem to nevrátil. Mám toho teď moc.",
  "Trenére, nestihl jsem to, šichta se protáhla. Vím, že jsem slíbil.",
  "Ještě to mám doma, trenére. Nějak jsem to nezvládl.",
  "Trenére, sorry, vrátit jsem to nestihl. Nebudu se vymlouvat.",
  "Nedopadlo to, trenére. Ještě to není zpátky, promiňte.",
  "Trenére, vím, že jsem to sliboval. Zatím to nevyšlo.",
  "Trenére, nevrátil jsem to. Doma bylo moc práce.",
  "Trenére, nezvládl jsem to. Asi jsem toho nasliboval víc, než jsem měl.",
];
const REPAIR_FAILED_SMS: readonly string[] = [
  "Trenére, s tou opravou to nevyšlo. Kluci nemohli a sám jsem to nedal.",
  "Trenére, nestihli jsme to opravit, šichta se protáhla. Vím, že jsem slíbil.",
  "Oprava nedopadla, trenére. Chybělo nářadí a pak i čas.",
  "Trenére, sorry, brigáda padla. Nikdo nemohl.",
  "Trenére, opravit jsem to nestihl. Nebudu se vymlouvat.",
  "Trenére, začali jsme, ale nedodělali. Je to pořád rozbitý.",
  "S tou brigádou to nevyšlo, trenére. Promiňte.",
  "Trenére, nezvládl jsem to. Pořád je to rozbitý, vím.",
];

export interface AmendsTaskRow {
  id: string; team_id: string; player_id: string; kind: string; details: string | null;
  first_name: string; last_name: string; nickname: string | null; avatar: string | null; club_user_id: string | null;
}

/** Doplní pachateli do znalostí, co se stalo, ať o tom v chatu ví. */
async function addCulpritFact(db: D1Database, incidentId: string, playerId: string, fact: string): Promise<void> {
  await db.prepare(
    "UPDATE club_incident_knowledge SET fact = fact || ' ' || ? WHERE incident_id = ? AND player_id = ? AND role = 'pachatel'",
  ).bind(fact, incidentId, playerId).run()
    .catch((e) => logger.warn({ module: M }, `znalost pachatele ${incidentId}`, e));
}

async function claim(db: D1Database, id: string, status: "kept" | "broken" | "expired", now: Date): Promise<boolean> {
  const r = await db.prepare("UPDATE coach_commitments SET status = ?, resolved_at = ? WHERE id = ? AND status = 'active'")
    .bind(status, now.toISOString(), id).run()
    .catch((e) => { logger.warn({ module: M }, `uzavření úkolu ${id}`, e); return null; });
  return (r?.meta?.changes ?? 0) > 0;
}

/**
 * Lhůta úkolu „vrátit“ nebo „opravit“ uplynula: hráč to podle povahy splní, nebo ne.
 * Sám si úkol zabere (souběžné vyhodnocení ho neprovede dvakrát). Vrací, jak dopadl.
 */
export async function settleAmendsTask(db: D1Database, r: AmendsTaskRow, now: Date = new Date()): Promise<"kept" | "broken" | "expired" | null> {
  const task = r.kind as AmendsTask;
  let incidentId: string | undefined;
  let willFail = false;
  try {
    const d = JSON.parse(r.details ?? "{}") as { incidentId?: string; willFail?: boolean };
    incidentId = d.incidentId;
    willFail = d.willFail === true;
  } catch (e) {
    logger.warn({ module: M }, `detaily úkolu ${r.id}`, e);
  }
  const inc = incidentId ? await db.prepare(
    "SELECT id, kind, status, loss, culprit_player_id, recovered FROM club_incidents WHERE id = ? AND team_id = ?",
  ).bind(incidentId, r.team_id).first<{ id: string; kind: string; status: string; loss: string | null; culprit_player_id: string | null; recovered: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `incident úkolu ${r.id}`, e); return null; }) : null;
  if (!inc) return (await claim(db, r.id, "expired", now)) ? "expired" : null;

  const losses = nactiZtraty(inc.loss);
  const pending = task === "task_return" ? await returnableLosses(db, r.team_id, losses) : await repairableLosses(db, r.team_id, losses);
  // Klub si ukradené mezitím koupil znovu: vrácený originál prodá (`resaleValue`), slib má dopad dál.
  const replaced = task === "task_return" ? await replacedLosses(db, r.team_id, losses) : [];
  // Mezitím to vyřešil někdo jiný (zaplatil opravu, lup je zpátky): úkol jen vyprší.
  if ((pending.length === 0 && replaced.length === 0) || (task === "task_return" && inc.recovered === 1)) {
    return (await claim(db, r.id, "expired", now)) ? "expired" : null;
  }

  const p = await db.prepare(
    `SELECT coach_relationship, json_extract(personality, '$.discipline') AS discipline, json_extract(personality, '$.workRate') AS work_rate,
            team_id FROM players WHERE id = ?`,
  ).bind(r.player_id).first<{ coach_relationship: number | null; discipline: number | null; work_rate: number | null; team_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `hráč úkolu ${r.id}`, e); return null; });
  const chance = amendsDeliveryChance({ discipline: p?.discipline ?? 50, relationship: p?.coach_relationship ?? 50, workRate: p?.work_rate ?? 50 }, task);
  // Los podle incidentu a úkolu: stejný úkol dopadne pokaždé stejně (i při opakovaném běhu).
  // Kdo slíbil, ačkoli to podle povahy neudělá (`willFail`), nesplní nikdy.
  const delivered = !willFail && createRng(seedFromString(`amends|${inc.id}|${task}|${r.player_id}`)).random() * 100 < chance;
  if (!(await claim(db, r.id, delivered ? "kept" : "broken", now))) return null;

  const gameDate = (await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(r.team_id).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `herní den úkolu ${r.id}`, e); return null; }))?.game_date ?? now.toISOString();
  const player = { id: r.player_id, firstName: r.first_name, lastName: r.last_name, nickname: r.nickname, avatar: r.avatar };
  const name = `${r.first_name} ${r.last_name}`;
  const title = nazevIncidentu(inc.kind);
  const writes = r.club_user_id !== "ai" && await clubReceivesMessages(db, r.team_id);

  if (!delivered) {
    await addCulpritFact(db, inc.id, r.player_id, task === "task_return"
      ? "Slíbil jsi trenérovi, že to vrátíš, a nevrátil jsi to. Víš o tom."
      : "Slíbil jsi trenérovi, že to s brigádou opravíš, a neopravil jsi to. Víš o tom.");
    if (writes) {
      await sendPlayerTemplateSMS(db, r.team_id, player, task === "task_return" ? RETURN_FAILED_SMS : REPAIR_FAILED_SMS, {
        seed: r.id, metadata: { ...smsIncidentu(inc.id), amends: task, delivered: false },
      }).catch((e) => logger.warn({ module: M }, `SMS nesplněného úkolu ${r.id}`, e));
    }
    logger.info({ module: M, teamId: r.team_id }, `${name} úkol ${task} ${inc.id} nesplnil (šance ${chance} %)`);
    return "broken";
  }

  if (task === "task_return") {
    const { returned, cash } = await returnLosses(db, r.team_id, inc.id, pending);
    if (cash > 0) {
      await recordTransaction(db, r.team_id, "incident_recovery", cash, `Vrácený lup od hráče: ${name}`, gameDate, `returned-${inc.id}`)
        .catch((e) => logger.error({ module: M }, `vrácená hotovost ${inc.id}`, e));
    }
    const resold = replaced.reduce((sum, z) => sum + resaleValue(z), 0);
    if (resold > 0) {
      await recordTransaction(db, r.team_id, "incident_recovery", resold, `Vrácený lup od hráče: ${name} (náhradu klub už měl, prodáno)`, gameDate, `resold-${inc.id}`)
        .catch((e) => logger.error({ module: M }, `prodej vráceného lupu ${inc.id}`, e));
    }
    const items = [...returned, ...replaced.flatMap((z) => (z.typ === "vybaveni" ? [CATEGORY_LABELS[z.kategorie] ?? z.kategorie] : []))];
    await db.prepare(
      `UPDATE club_incidents SET recovered = 1,
         resolution_data = json_set(CASE WHEN json_valid(resolution_data) THEN resolution_data ELSE '{}' END, '$.returnedLater', json(?))
       WHERE id = ?`,
    ).bind(JSON.stringify({ items, amount: cash, ...(resold > 0 ? { resold } : {}), day: gameDate.slice(0, 10) }), inc.id).run()
      .catch((e) => logger.error({ module: M }, `vrácení lupu do incidentu ${inc.id}`, e));
    await addCulpritFact(db, inc.id, r.player_id, "Pak jsi to klubu opravdu vrátil.");
    const what = returnedWhat(inc.kind, items, cash) || "co jsem vzal";
    if (writes) {
      await sendPlayerTemplateSMS(db, r.team_id, player, RETURNED_SMS.map((t) => t.replace("{what}", what)), {
        seed: r.id, metadata: { ...smsIncidentu(inc.id), amends: task, delivered: true },
      }).catch((e) => logger.warn({ module: M }, `SMS o vrácení ${r.id}`, e));
      const sale = resold > 0 ? ` Klub už měl náhradu, vrácené prodal do zastavárny za ${resold.toLocaleString("cs-CZ")} Kč.` : "";
      // Co vrátil, jen když to neříká už název incidentu: „(Poháry z vitríny): poháry z vitríny“ (E2E 22. 11.).
      const detail = what.toLowerCase() === title.toLowerCase() ? "" : `: ${what}`;
      await sendIncidentSystemSms(db, r.team_id, SMS_ROLE_KUSTOD, `✋ ${name} vrátil, co vzal (${title})${detail}.${sale}`, smsIncidentu(inc.id))
        .catch((e) => logger.warn({ module: M }, `kustod o vrácení ${r.id}`, e));
    }
    logger.info({ module: M, teamId: r.team_id }, `${name} vrátil ${inc.id}: ${what}`);
    return "kept";
  }

  const repaired = await repairLosses(db, r.team_id, inc.id, pending, gameDate);
  // Po brigádě je unavený (stejně jako po pomoci sponzorovi).
  await db.prepare(
    `UPDATE players SET life_context = json_set(CASE WHEN json_valid(life_context) THEN life_context ELSE '{}' END, '$.condition',
       MAX(15, COALESCE(json_extract(life_context, '$.condition'), 100) - ?)) WHERE id = ?`,
  ).bind(REPAIR_FATIGUE, r.player_id).run()
    .catch((e) => logger.warn({ module: M }, `únava po brigádě ${r.player_id}`, e));
  // Otevřený incident brigáda vyřeší, uzavřenému (trest už padl) jen ubude škoda.
  await db.prepare(
    `UPDATE club_incidents SET
       status = CASE WHEN status IN ('otevreny', 'policie') THEN 'uzavreny' ELSE status END,
       resolution = CASE WHEN status IN ('otevreny', 'policie') THEN 'opravil' ELSE resolution END,
       resolved_on = CASE WHEN status IN ('otevreny', 'policie') THEN ? ELSE resolved_on END,
       culprit_revealed = 1,
       resolution_data = json_set(CASE WHEN json_valid(resolution_data) THEN resolution_data ELSE '{}' END, '$.repairedByBrigade', json(?))
     WHERE id = ?`,
  ).bind(gameDate, JSON.stringify({ items: repaired, day: gameDate.slice(0, 10) }), inc.id).run()
    .catch((e) => logger.error({ module: M }, `oprava brigádou do incidentu ${inc.id}`, e));
  await addCulpritFact(db, inc.id, r.player_id, "Pak jsi to s brigádou opravdu opravil.");
  const what = repaired.map((l) => l.charAt(0).toLowerCase() + l.slice(1)).join(", ") || "co bylo rozbité";
  if (writes) {
    await sendPlayerTemplateSMS(db, r.team_id, player, REPAIRED_SMS.map((t) => t.replace("{what}", what)), {
      seed: r.id, metadata: { ...smsIncidentu(inc.id), amends: task, delivered: true },
    }).catch((e) => logger.warn({ module: M }, `SMS o opravě ${r.id}`, e));
    await sendIncidentSystemSms(db, r.team_id, SMS_ROLE_KUSTOD, `🔧 ${name} s brigádou opravil (${title}): ${what}. Klub to nic nestálo.`, smsIncidentu(inc.id))
      .catch((e) => logger.warn({ module: M }, `kustod o opravě ${r.id}`, e));
  }
  logger.info({ module: M, teamId: r.team_id }, `${name} opravil brigádou ${inc.id}: ${what}`);
  return "kept";
}
