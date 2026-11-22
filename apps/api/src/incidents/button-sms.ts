/**
 * Šablona od hráče po kliknutí trenéra (záloha, trest, obvinění) se nepošle, když hráč na
 * totéž před chvílí odpověděl v rozhovoru.
 *
 * Filip Němec (FORPSI Čkyně, 31. 10. 10:59): trenér mu na prosbu o zálohu odepsal „můžeš 👍“,
 * hráč v rozhovoru poděkoval a o devět vteřin později trenér klikl na „Půjčit“. Přišla i šablona
 * „Trenére, díky. Tohle mi hodně pomohlo.“ a hráč děkoval dvakrát. Turek (Výškovice, 23. 10.)
 * odepsal na „Zaplatíš si to!“ vztekle a za dvě minuty po kliknutí na srážku přišlo „Je to fér.
 * Srážku beru.“ Jen 8 z 31 šablon po trestu přišlo dál než 30 minut od zprávy hráče od modelu.
 */

import { logger } from "../lib/logger";

const M = "incidents-button-sms";

/** Jak dlouho platí, že hráč na věc už v rozhovoru reagoval. */
export const COVERED_WINDOW_MINUTES = 10;

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
}

/** Trenér v rozhovoru mluví o trestu („strhnu ti to“, „dostaneš pokutu“, „zaplatíš si to“, „odpouštím ti“). */
export const PUNISHMENT_TALK_RE = /(strh|srazk|pokut|zaplat|z vyplat|ze mzdy|z platu|odpoust|odpust|promij|nepostav|vyraz|nebudes hrat)/;
/** Trenér v rozhovoru mluví o záloze („můžeš“ na prosbu o zálohu jde přes vlákno, tohle je mimo něj). */
export const ADVANCE_TALK_RE = /(zaloh|pujc|penize|prachy|vyplat)/;
/** Trenér v rozhovoru obviňuje („byl jsi to ty“, „ukradl jsi…“, „přiznej se“). */
export const ACCUSATION_TALK_RE = /(byl jsi to ty|byls to ty|tys to (byl|udelal|vzal|rozbil)|ty jsi to (byl|udelal|vzal|rozbil|ukradl)|ukradl jsi|vzal jsi|rozbil jsi|udelal jsi to|prizn|zapir)/;

export function coachSaid(text: string, re: RegExp): boolean {
  return re.test(plain(text));
}

/**
 * Odpověděl hráč za posledních `COVERED_WINDOW_MINUTES` minut v rozhovoru (text od modelu)
 * na totéž? Totéž znamená: odpověď patří do vlákna té věci (`scenarioIds`, např. prosba
 * o zálohu), nebo trenér v tom okně psal o téhle věci (`coachRe`) a hráč mu na to odpověděl.
 */
export async function aiReplyCoveredIt(
  db: D1Database,
  o: { teamId: string; playerId: string; scenarioIds?: readonly string[]; coachRe?: RegExp; now?: Date },
): Promise<boolean> {
  const since = new Date((o.now ?? new Date()).getTime() - COVERED_WINDOW_MINUTES * 60_000).toISOString();
  const rows = await db.prepare(
    `SELECT m.sender_type, m.body, m.sent_at, json_extract(m.metadata, '$.ai_generated') AS ai,
            json_extract(m.metadata, '$.scenario_id') AS scenario
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'player' AND c.participant_id = ?
        AND m.sender_type IN ('player', 'user') AND julianday(m.sent_at) >= julianday(?)
      ORDER BY julianday(m.sent_at), m.rowid`,
  ).bind(o.teamId, o.playerId, since)
    .all<{ sender_type: string; body: string | null; sent_at: string; ai: number | null; scenario: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `poslední rozhovor s hráčem ${o.playerId}`, e); return null; });
  const list = rows?.results ?? [];
  const aiReplies = list.map((r, i) => ({ r, i })).filter(({ r }) => r.sender_type === "player" && r.ai === 1);
  if (aiReplies.length === 0) return false;
  if (o.scenarioIds && aiReplies.some(({ r }) => r.scenario && o.scenarioIds!.includes(r.scenario))) return true;
  if (!o.coachRe) return false;
  const re = o.coachRe;
  // Trenérova zpráva o věci, na kterou hráč po ní odpověděl.
  return aiReplies.some(({ i }) => list.slice(0, i).some((m) => m.sender_type === "user" && coachSaid(m.body ?? "", re)));
}
