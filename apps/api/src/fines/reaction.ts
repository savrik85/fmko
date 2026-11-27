/**
 * Co hráč odepíše na pokutu (sazebník, ruční položka, pokuta z SMS).
 *
 * Dřív na SMS pokutu přišla jedna ze tří pevných vět bez ohledu na to, za co byla
 * („No jo, trenére. Zasloužil jsem si to.“ i hráči, který na tréninku byl). Teď text píše
 * model z faktů, které připraví kód: co se doopravdy stalo, jestli pravidlo platilo předem
 * a schválil ho kapitán, kolik pro něj ta částka znamená, jestli jiný za totéž neplatil.
 * Postoj (přijme / bručí / ohradí se / odmítne) určuje kód, model ho jen napíše.
 *
 * Posílá hodinový běh telefonu (messaging/casual-messages.ts): zápasový runner k modelu
 * přístup nemá a víc pokut najednou dostane hráč v jedné zprávě.
 */

import { fineItemDef, fineValueLabel, type FineValueKind } from "@okresni-masina/shared";
import type { ChatEnv } from "../messaging/ai-player-chat";
import { logger } from "../lib/logger";
import { BURDEN_STAGE_LABELS, type BurdenStage } from "./burden";
import { addDays, PLAYER_PROFILE_SQL, playerBurden, profileFromRow, type PlayerFineProfile } from "./store";

const M = "fines-reaction";

export type FineStance = "accepts" | "grumbles" | "objects" | "refuses";

export interface PendingFine {
  id: string;
  teamId: string;
  playerId: string;
  itemKey: string | null;
  conditionKey: string | null;
  source: "auto" | "manual" | "sms";
  valueKind: FineValueKind;
  amountCzk: number | null;
  status: "paid" | "refused" | "forgiven";
  fact: string | null;
  inSchedule: boolean;
  gameDate: string;
}

export interface FineReactionFacts {
  fines: PendingFine[];
  origin: "approved" | "imposed" | null;
  stage: BurdenStage;
  /** Jiný hráč dostal za totéž prominuto. */
  othersForgiven: string[];
  /** Pokuta z SMS: na posledním tréninku byl (nebo měl volno od trenéra). */
  attendedLastTraining: boolean | null;
  restByCoachLastTraining: boolean;
  /** Krátký popis hráčovy kapsy slovy. */
  pocketWords: string;
  stance: FineStance;
}

/** Pokuta, kterou hráč bere jako nespravedlivou (trest za práci, rodinu, fotbal, mimo sazebník bez důvodu). */
export function feelsUnjust(f: PendingFine, attendedLastTraining: boolean | null): boolean {
  if (f.source === "sms" && !f.inSchedule && attendedLastTraining === true && /tr[eé]nink/i.test(f.fact ?? "")) return true;
  if (f.itemKey === "training_missed" && f.conditionKey === "any" && !/hospod|zasp|zapomn|telefon|pozd[eě]|zabija|oslav|narozen|piv/i.test(f.fact ?? "")) return true;
  if (f.itemKey === "match_excuse" && f.conditionKey !== "hangover" && !/kocovin|alkohol/i.test(f.fact ?? "")) return true;
  if (f.itemKey === "yellow_card" && /za faul/i.test(f.fact ?? "")) return true;
  if (f.itemKey === "penalty_miss") return true;
  return false;
}

export function fineStance(
  fines: readonly PendingFine[], p: Pick<PlayerFineProfile, "coachRelationship" | "temper">,
  o: { stage: BurdenStage; origin: "approved" | "imposed" | null; othersForgiven: number; attendedLastTraining: boolean | null },
): FineStance {
  if (fines.some((f) => f.status === "refused")) return "refuses";
  if (fines.some((f) => feelsUnjust(f, o.attendedLastTraining)) || o.othersForgiven > 0) return "objects";
  if (o.stage >= 1 || p.temper >= 65 || p.coachRelationship < 40 || (o.origin === "imposed" && p.coachRelationship < 55)) return "grumbles";
  return "accepts";
}

function pocketWords(p: PlayerFineProfile): string {
  if (p.age < 19) return "Jsi mladý, peněz moc nemáš, každá stovka je pro tebe znát.";
  if (/student|u[cč]e[nň]|brig[aá]d|nezam[eě]stnan/i.test(p.occupation ?? "")) return "Peněz máš málo, stovka je pro tebe dost.";
  if (/podnikatel|majitel|[zž]ivnostn|l[eé]ka[rř]|mana[zž]er|program[aá]tor/i.test(p.occupation ?? "")) return "Peníze ti problém nedělají, jde ti spíš o princip.";
  return "Normální výplata z práce, pár stovek tě nezabije, ale radost z toho nemáš.";
}

/** Fakt pokuty ve druhé osobě pro model („Na tréninku chyběl: X“ → „chyběl jsi na tréninku, protože: X“). */
function factForModel(fact: string | null): string {
  if (!fact) return "trenér důvod neuvedl";
  const m = /^Na tréninku chyběl: (.+)$/.exec(fact);
  return m ? `na tréninku jsi chyběl a doopravdy to bylo takhle: ${m[1]}` : fact;
}

function fineLine(f: PendingFine): string {
  const def = f.itemKey ? fineItemDef(f.itemKey) : undefined;
  const cond = def?.conditions.find((c) => c.key === f.conditionKey);
  const what = fineValueLabel(f.valueKind, f.amountCzk);
  const rule = f.source === "sms" && !f.inSchedule
    ? "pokuta od trenéra v SMS, v sazebníku kabiny není"
    : `podle sazebníku kabiny, položka „${def?.label ?? "pokuta"}${cond && cond.key !== "any" ? `: ${cond.label.toLowerCase()}` : def && def.conditions.length > 1 ? " (jakýkoli důvod)" : ""}“`;
  const status = f.status === "forgiven" ? " Tentokrát se promíjí, je to první v sezóně."
    : f.status === "refused" ? " Zaplatit odmítáš, dlužíš." : "";
  return `- Pokuta ${what}, ${rule}. Co se stalo: ${factForModel(f.fact)}.${status}`;
}

const STANCE_HINT: Record<FineStance, string> = {
  accepts: "Bereš to, víš, že pravidlo platilo a porušil jsi ho. Klidně s trochou studu nebo vtipu.",
  grumbles: "Zaplatíš, ale bručíš, že je toho na tebe moc. Neodmítáš to.",
  objects: "Přijde ti to nefér a ohradíš se: řekni konkrétně proč (co se doopravdy stalo, že za tohle se pokuta nedává, nebo že jiný za totéž neplatil). Nevymýšlej si nic, co v těchhle faktech není.",
  refuses: "Na tohle už nemáš a zaplatit to odmítáš. Řekni to rovnou, klidně naštvaně. Netvrď, že zaplatíš.",
};

export function fineInstruction(f: FineReactionFacts): string {
  const inSchedule = f.fines.some((x) => x.inSchedule);
  const where = inSchedule ? " do pokladničky kabiny" : ", peníze jdou klubu";
  const lines = [
    f.fines.length === 1 ? `Trenér ti právě dal pokutu${where}:` : `Trenér ti právě dal pokuty${where}:`,
    ...f.fines.map(fineLine),
  ];
  if (inSchedule) {
    lines.push(f.origin === "approved"
      ? "Sazebník platil předem, kabina ho přes kapitána odsouhlasila."
      : "Sazebník platil předem, ale trenér ho kabině vnutil, kapitán s ním nesouhlasil.");
  }
  if (f.fines.some((x) => x.source === "sms" && !x.inSchedule)) {
    if (f.attendedLastTraining === true) lines.push("Na posledním tréninku jsi byl.");
    else if (f.restByCoachLastTraining) lines.push("Na posledním tréninku jsi nebyl, protože ti trenér sám dal volno.");
  }
  if (f.othersForgiven.length > 0) lines.push(`Víš, že ${f.othersForgiven.join(", ")} za totéž platit nemusel.`);
  lines.push(f.pocketWords);
  if (f.stage >= 1) lines.push(`Pokut už máš za poslední měsíc dost. Jak to cítíš: ${BURDEN_STAGE_LABELS[f.stage].toLowerCase()}.`);
  lines.push(STANCE_HINT[f.stance]);
  lines.push(
    "Drž se jen těchhle faktů. Nevymýšlej jiný důvod absence, zranění, zápasy, směny ani nic, co tu není. "
    + (f.othersForgiven.length > 0 ? "Ze spoluhráčů smíš zmínit jen ty, kdo jsou jmenovaní výš." : "Nejmenuj žádné spoluhráče."),
  );
  lines.push("Piš krátce, jako SMS trenérovi. Žádná čísla o náladě ani body.");
  return lines.join("\n");
}

export const FINE_REPLIES: Record<FineStance, readonly string[]> = {
  accepts: [
    "Jo, trenére, to je moje. Hodím to do pokladničky.",
    "Beru, pravidlo je pravidlo. Příště si dám pozor.",
    "No jo, chytli mě. Zaplatím a bude klid.",
    "Dobře, zasloužím si to. Do pokladničky to dám ještě tenhle týden.",
    "Máte pravdu, trenére. Zaplatím, ať je to z krku.",
    "Jasně, sazebník je sazebník. Pošlu to pokladníkovi.",
    "Tak jo, beru to. Aspoň bude na sud.",
    "Ok, chápu. Zaplatím a víckrát se to nestane.",
  ],
  grumbles: [
    "Zaplatím, trenére, ale už je toho nějak moc.",
    "Dobře, dám to tam. Ale pomalu na fotbal dělám víc než v práci.",
    "No jo, zase já. Zaplatím, ale radost nemám.",
    "Fajn, zaplatím. Tenhle měsíc to ale fakt bolí.",
    "Beru, ale ty pokuty mě začínají štvát.",
    "Zaplatím. Ale jestli to takhle půjde dál, budu chodit jen platit.",
    "Tak jo. Ale to je letos už kolikátá.",
    "Dobře, trenére. Jen říkám, že mi to dělá díru do kapsy.",
  ],
  objects: [
    "Trenére, tohle mi přijde fakt nefér. Za tohle se přece neplatí.",
    "To snad ne. Já za to nemůžu a mám platit?",
    "S tímhle nesouhlasím, trenére. Za tohle pokuta není fér.",
    "Počkejte, tohle se nepočítá. Řekněte mi, za co přesně.",
    "Tohle je přes čáru, trenére. Za tohle pokutu nedávejte.",
    "Fakt? Za tohle? To mi teda vysvětlete.",
    "Trenére, to je trest za něco, co jsem nemohl ovlivnit.",
    "Tohle mi nesedí. Zaplatím, až mi řeknete, co jsem udělal špatně.",
  ],
  refuses: [
    "Tohle už platit nebudu, trenére. Na to nemám.",
    "Ne. Za poslední měsíc jsem tam nechal víc než za pivo. Neplatím.",
    "Tak tohle ne. Ať si to klidně vymáhá pokladník.",
    "Nezaplatím. Už je toho moc, trenére.",
    "Na další pokutu fakt nemám. Neplatím.",
    "Ne, trenére. Tohle už je ždímání, ne pravidla.",
    "Dlužte si mě klidně. Platit to nebudu.",
    "S tímhle sazebníkem končím. Neplatím.",
  ],
};

/** Připravené věty pro ohrazení podle toho, proč je pokuta nefér (když model nejede). */
export const OBJECTION_REPLIES = {
  attended: [
    "Trenére, vždyť jsem na tréninku byl! Za co mám platit?",
    "Počkejte, na tréninku jsem byl. Zeptejte se kluků.",
    "To musí být omyl, trenére. Na posledním tréninku jsem nechyběl.",
    "Pokuta za trénink? Já tam byl, trenére.",
    "Tohle nesedí, na tréninku jsem byl celou dobu.",
    "Trenére, já na tréninku byl. Tuhle pokutu platit nebudu, dokud mi neřeknete za co.",
    "Byl jsem tam, trenére. Asi si mě s někým pletete.",
    "Za trénink? Vždyť jsem tam běhal s ostatníma.",
  ],
  rest: [
    "Trenére, vždyť jste mi sám dal volno!",
    "Volno jste mi dal vy. Za to mám platit?",
    "Počkejte, říkal jste, ať si odpočinu. Tak za co ta pokuta?",
    "To je vtip? Volno bylo od vás, trenére.",
    "Trenére, dal jste mi pauzu a teď za ni pokuta?",
    "Volno jste mi dal sám, to přece nemůžu platit.",
    "Říkal jste, ať vynechám. Tak proč pokuta?",
    "Tohle nesedí, trenére. Odpočíval jsem, protože jste to chtěl.",
  ],
  othersForgiven: [
    "S tímhle nesouhlasím, trenére. Jiní za to neplatí, tak proč já.",
    "Jinému jste to prominul a já mám platit?",
    "Trenére, to není fér. Za totéž jiný neplatil.",
    "Proč já, když jiný to měl odpuštěný?",
    "Stejně pro všechny, ne? Tak proč jinému prominete a mně ne.",
    "Tohle kluci v kabině probírají. Jiný to dostal odpuštěný.",
    "Za totéž jiný neplatil. To mi vysvětlete.",
    "Trenére, buď platí všichni, nebo nikdo.",
  ],
} as const;

export function fallbackReplies(f: FineReactionFacts): readonly string[] {
  if (f.stance !== "objects") return FINE_REPLIES[f.stance];
  const sms = f.fines.some((x) => x.source === "sms" && !x.inSchedule);
  if (sms && f.attendedLastTraining === true) return OBJECTION_REPLIES.attended;
  if (sms && f.restByCoachLastTraining) return OBJECTION_REPLIES.rest;
  if (f.othersForgiven.length > 0) return OBJECTION_REPLIES.othersForgiven;
  return FINE_REPLIES.objects;
}

/** Text modelu jde proti postoji (odmítá, ač má zaplatit, nebo slibuje zaplatit, ač odmítá). */
export function contradictsStance(body: string, stance: FineStance): string | null {
  const t = body.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (stance === "refuses") return /\b(zaplatim|hodim to|poslu to)\b/.test(t) && !/nezaplatim/.test(t) ? "slibuje zaplatit" : null;
  if (stance === "accepts" || stance === "grumbles") return /(nezaplatim|neplatim|nebudu platit|platit nebudu)/.test(t) ? "odmítá zaplatit" : null;
  return null;
}

/** Model jmenuje spoluhráče, o kterém fakta nic neříkají („Kučera taky chyběl a nic mu nebylo“). */
export function namesTeammate(body: string, teammates: readonly string[], allowed: readonly string[]): string | null {
  for (const name of teammates) {
    if (allowed.includes(name)) continue;
    const last = name.split(" ").slice(1).join(" ");
    const escaped = last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (body.includes(name) || (last.length > 3 && new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "u").test(body))) return `jmenuje spoluhráče ${name}`;
  }
  return null;
}

/** Další dopad postoje nad rámec zátěže (store.ts STAGE_EFFECT). */
export const STANCE_RELATION: Record<FineStance, number> = { accepts: 0, grumbles: 0, objects: -2, refuses: -1 };

/**
 * Pošle reakce na pokuty bez odpovědi (nejstarší první, nejvýš `limit` hráčů za běh).
 * Pokuty starší než 3 herní dny se jen označí: stará SMS by nedávala smysl.
 */
export async function sendPendingFineReactions(db: D1Database, env: ChatEnv | undefined, now = new Date(), limit = 12): Promise<number> {
  const rows = await db.prepare(
    `SELECT f.*, t.game_date AS team_game_date, t.user_id FROM fines f JOIN teams t ON t.id = f.team_id
      WHERE f.reaction_sent_at IS NULL ORDER BY f.created_at ASC LIMIT 200`,
  ).all<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: M }, "pokuty bez reakce", e); return { results: [] as Record<string, unknown>[] }; });
  const groups = new Map<string, PendingFine[]>();
  const stale: string[] = [];
  for (const r of rows.results ?? []) {
    const teamDay = String(r.team_game_date ?? now.toISOString()).slice(0, 10);
    if (r.user_id === "ai" || String(r.game_date) < addDays(teamDay, -3)) { stale.push(r.id as string); continue; }
    const f: PendingFine = {
      id: r.id as string, teamId: r.team_id as string, playerId: r.player_id as string,
      itemKey: (r.item_key as string | null) ?? null, conditionKey: (r.condition_key as string | null) ?? null,
      source: r.source as PendingFine["source"], valueKind: r.value_kind as FineValueKind, amountCzk: (r.amount_czk as number | null) ?? null,
      status: r.status as PendingFine["status"], fact: (r.fact as string | null) ?? null, inSchedule: r.in_schedule === 1,
      gameDate: r.game_date as string,
    };
    const key = `${f.teamId}|${f.playerId}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const stamp = now.toISOString();
  if (stale.length > 0) {
    await db.batch(stale.map((id) => db.prepare("UPDATE fines SET reaction_sent_at = ? WHERE id = ?").bind(stamp, id)))
      .catch((e) => logger.warn({ module: M }, "označení starých pokut", e));
  }
  let sent = 0;
  for (const fines of [...groups.values()].slice(0, limit)) {
    try {
      await reactToFines(db, env, fines, now);
      sent++;
    } catch (e) {
      logger.error({ module: M, teamId: fines[0].teamId }, `reakce na pokuty hráče ${fines[0].playerId}`, e);
    }
    // I po chybě označit: jinak by se stejná reakce zkoušela každou hodinu donekonečna.
    await db.batch(fines.map((f) => db.prepare("UPDATE fines SET reaction_sent_at = ? WHERE id = ?").bind(stamp, f.id)))
      .catch((e) => logger.warn({ module: M }, "označení reakce na pokuty", e));
  }
  return sent;
}

export async function reactionFacts(db: D1Database, fines: PendingFine[], p: PlayerFineProfile, day: string): Promise<FineReactionFacts> {
  const teamId = fines[0].teamId;
  const [schedule, burden, forgiven, training] = await Promise.all([
    db.prepare("SELECT origin FROM fine_schedules WHERE team_id = ?").bind(teamId).first<{ origin: "approved" | "imposed" | null }>(),
    playerBurden(db, p, day),
    db.prepare(
      `SELECT DISTINCT pl.first_name || ' ' || pl.last_name AS name FROM fines f JOIN players pl ON pl.id = f.player_id
        WHERE f.team_id = ? AND f.player_id != ? AND f.status = 'forgiven' AND f.fact NOT LIKE '%první v sezóně%'
          AND f.item_key IN (${fines.map(() => "?").join(", ")}) AND f.game_date > ? LIMIT 3`,
    ).bind(teamId, p.id, ...fines.map((f) => f.itemKey ?? ""), addDays(day, -28)).all<{ name: string }>(),
    db.prepare("SELECT last_training_result FROM teams WHERE id = ?").bind(teamId).first<{ last_training_result: string | null }>(),
  ]);
  let attended: boolean | null = null;
  let rest = false;
  try {
    const att = (JSON.parse(training?.last_training_result ?? "{}") as { attendance?: Array<{ playerId: string; attended: boolean; reason?: string }> }).attendance ?? [];
    const me = att.find((a) => a.playerId === p.id);
    if (me) { attended = me.attended; rest = !me.attended && /volno|odpo[cč][ií]v|pauz/i.test(me.reason ?? ""); }
  } catch (e) {
    logger.warn({ module: M, teamId }, "poslední trénink pro reakci na pokutu", e);
  }
  const othersForgiven = (forgiven.results ?? []).map((r) => r.name);
  const origin = schedule?.origin ?? null;
  const stance = fineStance(fines, p, { stage: burden.stage, origin, othersForgiven: othersForgiven.length, attendedLastTraining: attended });
  return { fines, origin, stage: burden.stage, othersForgiven, attendedLastTraining: attended, restByCoachLastTraining: rest, pocketWords: pocketWords(p), stance };
}

async function reactToFines(db: D1Database, env: ChatEnv | undefined, fines: PendingFine[], now: Date): Promise<void> {
  const teamId = fines[0].teamId;
  const { clubReceivesMessages } = await import("../incidents/club-messages");
  if (!(await clubReceivesMessages(db, teamId))) return;
  const row = await db.prepare(`${PLAYER_PROFILE_SQL} WHERE id = ?`).bind(fines[0].playerId).first<Record<string, unknown>>();
  if (!row || row.team_id !== teamId) return;
  const p = profileFromRow(row);
  const day = fines.reduce((d, f) => (f.gameDate > d ? f.gameDate : d), fines[0].gameDate);
  const facts = await reactionFacts(db, fines, p, day);
  const squad = await db.prepare("SELECT first_name || ' ' || last_name AS name FROM players WHERE team_id = ? AND id != ?")
    .bind(teamId, p.id).all<{ name: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "jména kádru pro reakci na pokutu", e); return { results: [] as { name: string }[] }; });
  const teammates = (squad.results ?? []).map((r) => r.name);
  const extra = STANCE_RELATION[facts.stance];
  if (extra) {
    const { coachRelationStmts } = await import("../lib/coach-relation");
    await db.batch(coachRelationStmts(db, { playerId: p.id, delta: extra, source: "fine", description: facts.stance === "objects" ? "Pokuta mu přijde nefér" : "Odmítl zaplatit pokutu", gameDate: day }))
      .catch((e) => logger.warn({ module: M, teamId }, `vztah po pokutě ${p.id}`, e));
  }
  const { sendEventSms } = await import("../messaging/event-sms");
  await sendEventSms(db, env, {
    clubTeamId: teamId,
    player: { id: p.id, firstName: p.firstName, lastName: p.lastName },
    instruction: fineInstruction(facts),
    fallback: fallbackReplies(facts),
    seed: `pokuta|${fines.map((f) => f.id).join(",")}`,
    scenarioId: "fine_reaction",
    metadata: { type: "fine_reaction", fineIds: fines.map((f) => f.id), stance: facts.stance },
    reject: (body) => contradictsStance(body, facts.stance) ?? namesTeammate(body, teammates, facts.othersForgiven),
  });
  logger.info({ module: M, teamId }, `reakce na ${fines.length} pokut hráče ${p.id}: ${facts.stance} (${now.toISOString()})`);
}
