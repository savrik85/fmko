/**
 * Co hráč napíše, když mu trenér za průšvih dá trest (odpuštění, srážka, pokuta, vyřazení).
 *
 * Dřív přišla jedna ze tří pokorných vět bez ohledu na to, co hráč psal před chvílí: Turek
 * (Výškovice, 13. 10.) v 5:02 odepsal „Seru na to!“ a v 5:07 dostal trenér „Zaplatím to.
 * Zasloužil jsem si to.“ Teď text píše model: zná trest a částku, za co ho dostal, svou
 * povahu, vztah k trenérovi, náladu a posledních pár zpráv. Vzdorovitý hráč může skřípat
 * zubama, ale trest vezme na vědomí; popřít, že ho dostal, nesmí (`deniesPunishment`).
 * Když model nejede, pošle se předem napsaná varianta podle postoje (pokorný, vzdorný,
 * ironický), kterou hráč ještě neposlal.
 */

import type { ChatEnv } from "../messaging/ai-player-chat";
import { logger } from "../lib/logger";
import { PUNISHMENT_TALK_RE, aiReplyCoveredIt } from "./button-sms";
import { clubReceivesMessages } from "./club-messages";
import { smsIncidentu } from "./incident-db";

const M = "incidents-punishment";

export type PunishmentKind = "odpustit" | "srazka" | "pokuta" | "vyradit";
export type ReplyStance = "humble" | "defiant" | "ironic";

/** Předem napsané reakce podle trestu a postoje. Hráč trest nepopírá, jen ho bere po svém. */
export const PUNISHMENT_REPLIES: Record<PunishmentKind, Record<ReplyStance, readonly string[]>> = {
  srazka: {
    humble: [
      "Chápu, trenére. Odpracuju to.",
      "Je to fér. Srážku beru.",
      "Zasloužil jsem si to, strhněte mi to ze mzdy.",
      "Beru, trenére. Ať je to z krku.",
    ],
    defiant: [
      "No tak si to strhněte. Radost z toho fakt nemám.",
      "Strhnout, jo? Tak dobře, ale fér mi to nepřijde.",
      "Fajn, berte si to z výplaty. Víc k tomu říkat nebudu.",
      "Tak mi to strhněte, když jinak nedáte. Spokojenej nejsem.",
    ],
    ironic: [
      "Tak to bude hubená výplata. No co, beru.",
      "Paráda, tenhle měsíc budu jíst rohlíky. Dobře, trenére.",
      "Aspoň vím, kam mi letos půjdou peníze. Beru to.",
      "No jo, srážka. Doma budou mít radost.",
    ],
  },
  pokuta: {
    humble: [
      "Zaplatím to. Zasloužil jsem si to.",
      "Dobře, pokutu beru.",
      "Je to moje chyba, zaplatím.",
      "Chápu, trenére. Pokutu zaplatím a bude klid.",
    ],
    defiant: [
      "Pokuta, jo? Tak jo, zaplatím, ale nadšenej nejsem.",
      "No dobře, zaplatím. Ale tohle jste přehnal, trenére.",
      "Zaplatím, když to jinak nejde. Spokojenej s tím nejsem.",
      "Tak tu pokutu zaplatím. Víc k tomu říkat nebudu.",
    ],
    ironic: [
      "Tak to mě vyšlo draho. Beru.",
      "Pokuta, no jasně. Aspoň má klubová kasa radost.",
      "Dobrá, zaplatím. Za tyhle peníze jsem mohl mít sud piva.",
      "No vida, a já myslel, že letos ušetřím. Beru, trenére.",
    ],
  },
  odpustit: {
    humble: [
      "Díky, trenére. Už se to nestane.",
      "Tohle jsem nečekal. Nezklamu vás.",
      "Díky za šanci, trenére. Beru to vážně.",
      "Vážím si toho, trenére. Podruhé už to neudělám.",
    ],
    defiant: [
      "Tak jo. Ale stejně si myslím, že se z toho dělala zbytečná věda.",
      "Dobře, trenére. Ať mi to v kabině už nikdo neomílá.",
      "Fajn. Doufám, že tím je to uzavřený.",
    ],
    ironic: [
      "No vida, tak přece jen máte srdce, trenére. Díky.",
      "Tak to jsem z toho vyklouzl. Díky, už budu hodnej.",
      "Odpuštěno? Tak to si dám pivo na vaše zdraví. Díky, trenére.",
    ],
  },
  vyradit: {
    humble: [
      "Chápu, trenére. Pár zápasů si odsedím.",
      "Dobře, zasloužil jsem si to. Budu makat na tréninku.",
      "Beru to. Vrátím se lepší.",
    ],
    defiant: [
      "Tak jo, budu sedět doma. Ale tohle mě fakt štve.",
      "Vyřazenej, jo? Fajn. Uvidíme, jak si beze mě poradíte.",
      "Dobře, odsedím si to. Ale nelíbí se mi to.",
    ],
    ironic: [
      "Aspoň budu mít víkendy volný. Beru, trenére.",
      "Tak to budu fandit z tribuny. Dobře, trenére.",
      "No co, aspoň si odpočinu. Zasloužil jsem si to.",
    ],
  },
};

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
}

/** Hráč v rozhovoru trest nebo náhradu odmítal („Seru na to!“, „za sprchy neplatím“). */
export const REFUSAL_RE = /(seru na to|neplat|nezaplat|nedam ani korunu|ani korunu|nebudu platit|nic platit nebudu|at strhnou|nic nedam|neopravim|nebudu to opravovat|nikam nejdu)/;

export function refusedIn(lines: readonly string[]): boolean {
  return lines.some((l) => REFUSAL_RE.test(plain(l)));
}

/** Jak trest vezme: podle toho, jestli ho před chvílí odmítal, vztahu, nálady a povahy. */
export function replyStance(p: { relationship: number; morale: number; temper: number }, refusedRecently: boolean): ReplyStance {
  if (refusedRecently) return p.relationship >= 60 && p.temper < 50 ? "ironic" : "defiant";
  if (p.relationship >= 55 && p.morale >= 40 && p.temper < 65) return "humble";
  if (p.temper >= 65 || p.relationship < 35) return "defiant";
  return "ironic";
}

const STANCE_HINT: Record<ReplyStance, string> = {
  humble: "Bereš to pokorně, víš, že sis to zasloužil.",
  defiant: "Štve tě to a dáš to najevo, klidně skřípeš zubama. Trest ale bereš na vědomí, hádat se o něj už nebudeš.",
  ironic: "Bereš to s ironií nebo rýpnutím, ale bereš to.",
};

const KIND_TEXT: Record<PunishmentKind, (amount: number | null, matches: number | null) => string> = {
  odpustit: () => "Trenér ti to odpustil, žádný trest nedostaneš.",
  srazka: (a) => `Trenér ti dal srážku ze mzdy${a ? ` ${a.toLocaleString("cs-CZ")} Kč` : ""}, strhává se ti po čtyři týdny.`,
  pokuta: (a) => `Trenér ti dal pokutu${a ? ` ${a.toLocaleString("cs-CZ")} Kč` : ""}, zaplatíš ji klubu.`,
  vyradit: (_, n) => `Trenér tě vyřadil ze sestavy${n ? ` na ${n} ${n === 1 ? "zápas" : n < 5 ? "zápasy" : "zápasů"}` : ""}.`,
};

export interface PunishmentFacts {
  kind: PunishmentKind;
  amount: number | null;
  matches: number | null;
  /** Název průšvihu („Poháry z vitríny“). */
  offence: string;
  stance: ReplyStance;
  /** V posledních 24 hodinách trest nebo náhradu v rozhovoru odmítal. */
  refusedRecently: boolean;
}

/** Co model ví, když hráč reaguje na trest. */
export function punishmentInstruction(f: PunishmentFacts): string {
  return [
    `Trenér právě rozhodl o tvém průšvihu (${f.offence}). ${KIND_TEXT[f.kind](f.amount, f.matches)}`,
    f.refusedRecently
      ? "Před chvílí jsi mu v rozhovoru psal, že to nezaplatíš nebo že na to sereš (je to v historii). Teď už je rozhodnuto: navaž na to, co jsi psal, nedělej, že se nic nestalo."
      : "",
    STANCE_HINT[f.stance],
    f.kind === "odpustit"
      ? "Netvrď, že dostaneš trest."
      : "Trest jsi dostal a netvrď opak: nepiš, že nezaplatíš, že si to nenecháš strhnout ani že to nebudeš respektovat.",
    "Částku ani počet zápasů neměň a nic dalšího si nevymýšlej. Krátce, 1 až 2 věty.",
  ].filter(Boolean).join(" ");
}

/** Text od modelu popírá trest („nezaplatím“, „nic mi strhávat nebudete“): nepoužije se. */
export function deniesPunishment(body: string, kind: PunishmentKind): string | null {
  if (kind === "odpustit") {
    return /(dostal jsem (pokutu|srazku|trest)|zaplatim (tu )?pokutu|strhnete mi)/.test(plain(body)) ? "mluví o trestu, který nedostal" : null;
  }
  return /(nezaplat|neplatim|nebudu platit|nic platit nebudu|nic mi (strhavat|strhnout)|nenecham si (to )?strhnout|nerespektuj)/.test(plain(body))
    ? "popírá trest" : null;
}

/**
 * Pošle reakci hráče na trest. Když na trest už odpověděl v rozhovoru (trenér mu ho tam
 * oznámil a hráč do deseti minut odepsal), nepošle nic: druhá reakce by se tloukla s první.
 */
export async function sendPunishmentReaction(
  db: D1Database,
  env: ChatEnv | undefined,
  o: {
    teamId: string; incidentId: string; kind: PunishmentKind; amount: number | null; matches: number | null; offence: string;
    player: { id: string; firstName: string; lastName: string };
    now?: Date;
  },
): Promise<"sent" | "covered" | "skipped"> {
  if (!(await clubReceivesMessages(db, o.teamId))) return "skipped";
  const now = o.now ?? new Date();
  if (await aiReplyCoveredIt(db, { teamId: o.teamId, playerId: o.player.id, coachRe: PUNISHMENT_TALK_RE, now })) {
    logger.info({ module: M, teamId: o.teamId }, `reakce na trest ${o.incidentId} se neposílá, hráč na něj už odpověděl v rozhovoru`);
    return "covered";
  }
  const p = await db.prepare(
    `SELECT coach_relationship, json_extract(life_context, '$.morale') AS morale, json_extract(personality, '$.temper') AS temper
       FROM players WHERE id = ?`,
  ).bind(o.player.id).first<{ coach_relationship: number | null; morale: number | null; temper: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `hráč pro reakci na trest ${o.player.id}`, e); return null; });
  const recent = await db.prepare(
    `SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'player' AND c.participant_id = ? AND m.sender_type = 'player'
        AND julianday(m.sent_at) >= julianday(?)`,
  ).bind(o.teamId, o.player.id, new Date(now.getTime() - 86_400_000).toISOString()).all<{ body: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `poslední zprávy hráče ${o.player.id}`, e); return null; });
  const refusedRecently = refusedIn((recent?.results ?? []).map((r) => r.body ?? ""));
  const stance = replyStance({
    relationship: p?.coach_relationship ?? 50, morale: p?.morale ?? 50, temper: p?.temper ?? 40,
  }, refusedRecently);
  const facts: PunishmentFacts = { kind: o.kind, amount: o.amount, matches: o.matches, offence: o.offence, stance, refusedRecently };
  const { sendEventSms } = await import("../messaging/event-sms");
  await sendEventSms(db, env, {
    clubTeamId: o.teamId,
    player: o.player,
    instruction: punishmentInstruction(facts),
    fallback: PUNISHMENT_REPLIES[o.kind][stance],
    seed: `trest|${o.incidentId}|${o.kind}`,
    scenarioId: "punishment_reaction",
    metadata: { ...smsIncidentu(o.incidentId), punishment: o.kind, stance },
    reject: (body) => deniesPunishment(body, o.kind),
  });
  return "sent";
}
