/**
 * Šablona od hráče po kliknutí trenéra (záloha, trest, obvinění) se nepošle, když hráč na
 * totéž před chvílí odpověděl v rozhovoru.
 *
 * Filip Němec (FORPSI Čkyně, 31. 10. 10:59): trenér mu na prosbu o zálohu odepsal „můžeš 👍“,
 * hráč v rozhovoru poděkoval a o devět vteřin později trenér klikl na „Půjčit“. Přišla i šablona
 * „Trenére, díky. Tohle mi hodně pomohlo.“ a hráč děkoval dvakrát. Turek (Výškovice, 23. 10.)
 * odepsal na „Zaplatíš si to!“ vztekle a za dvě minuty po kliknutí na srážku přišlo „Je to fér.
 * Srážku beru.“ Jen 8 z 31 šablon po trestu přišlo dál než 30 minut od zprávy hráče od modelu.
 *
 * U trestu ale „zaplatíš si to“ trest neoznamuje (E2E 22. 11., Sedlecký): reakci vezme jen
 * odpověď na trest, který mu trenér v rozhovoru opravdu oznámil (`announcesPunishment`).
 * Reakce na trest píše model s historií rozhovoru, takže na vztek z rozhovoru naváže.
 */

import { logger } from "../lib/logger";

const M = "incidents-button-sms";

/** Jak dlouho platí, že hráč na věc už v rozhovoru reagoval. */
export const COVERED_WINDOW_MINUTES = 10;

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
}

/**
 * Trenér hráči v rozhovoru oznámil právě ten trest, na který pak klikl („strhnu ti to
 * z výplaty“, „dostaneš pokutu“, „odpouštím ti“, „nepostavím tě“). Jen pak reakce z tlačítka
 * odpadne, hráč už na trest odpověděl.
 *
 * Výzva „zaplatíš to do koruny“ ani výhrůžka „jestli to nevrátíš, dostaneš pokutu“ trest
 * neoznamují: Sedlecký (Akcent, E2E 22. 11.) dostal tři výzvy „zaplatíš“, odpovídal o něčem
 * jiném, trenér klikl na pokutu a reakce nepřišla vůbec. Dřív tu stačilo slovo „zaplat“.
 */
const PUNISHMENT_ANNOUNCED_RE: Record<"odpustit" | "srazka" | "pokuta" | "vyradit", RegExp> = {
  srazka: /(strhnu|strhnem|strhavam|strhavame|strhava se|strhnout|srazim|srazime|srazk|z vyplaty|ze mzdy|z platu|z odmen)/,
  pokuta: /pokut/,
  odpustit: /(odpoustim|odpustim|odpoustime|odpustime|odpusteno|promijim|promijime|nebudu to resit|nechame to byt)/,
  vyradit: /(nepostavim|vyrazuj|vyradim|nebudes hrat|na lavicce|stopk)/,
};
/** Podmínka, výhrůžka nebo nabídka: „jestli…“, „…, nebo dostaneš pokutu“, „až to vrátíš“. */
const CONDITIONAL_RE = /\b(jestli|jestlize|pokud|kdyz|kdyby|jinak|nebo|az|zkus\w*)\b/;
/** Zápor oznámení („nebudu ti nic strhávat“) je spíš odpuštění; odpuštění zápor mít může. */
const NEGATED_RE = /\b(nebudu|nechci|nehodlam|nikdy)\b/;

export function announcesPunishment(text: string, kind: keyof typeof PUNISHMENT_ANNOUNCED_RE): boolean {
  const re = PUNISHMENT_ANNOUNCED_RE[kind];
  return text.split(/(?<=[.!?…])\s+|\n+/).some((raw) => {
    const s = plain(raw.trim());
    if (!s || !re.test(s) || s.endsWith("?") || CONDITIONAL_RE.test(s)) return false;
    return kind === "odpustit" || !NEGATED_RE.test(s);
  });
}
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
 * o zálohu), nebo trenér v tom okně psal o téhle věci (`coachRe`, u trestu `coachSaidIt`)
 * a hráč mu na to odpověděl.
 */
export async function aiReplyCoveredIt(
  db: D1Database,
  o: {
    teamId: string; playerId: string; scenarioIds?: readonly string[]; coachRe?: RegExp;
    /** Přesnější než `coachRe`: věc ve zprávě trenéra opravdu byla (oznámený trest, ne výzva). */
    coachSaidIt?: (text: string) => boolean;
    now?: Date;
  },
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
  const re = o.coachRe;
  const said = o.coachSaidIt ?? (re ? (text: string) => coachSaid(text, re) : null);
  if (!said) return false;
  // Trenérova zpráva o věci, na kterou hráč po ní odpověděl.
  return aiReplies.some(({ i }) => list.slice(0, i).some((m) => m.sender_type === "user" && said(m.body ?? "")));
}
