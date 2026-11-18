/**
 * Odpověď manažera na SMS od vůdce party.
 *
 * Záměrně bez modelu: postoj se pozná lexikálně (stejně jako u pozápasových
 * rozhovorů) a vůdce odepíše hotovou větou. Dopad je deterministický, takže se
 * dá testovat, nestojí kvótu a funguje i s vypnutou AI.
 *
 * Není tu správná volba — smířlivost sedí vyjednavači a urazí radikála, tvrdost
 * naopak. Mlčet je jediná varianta, která je špatně vždycky.
 */

import { logger } from "../lib/logger";
import { klasifikujOdpoved, dopadOdpovedi } from "../engine/fan-reactions";
import { fanLeaderFullName, type FanLeaderRow } from "./fan-group-generator";
import type { ChatEnv } from "../messaging/ai-player-chat";

const M = "fan-leader-reply";

interface ThreadState {
  kind?: string;
  leaderId?: string;
  groupId?: string;
  tema?: string | null;
  awaiting?: string;
  /** Kolik odpovědí trenéra už vůdce dostal (druhá je jen doplňující, bez dopadu). */
  replies?: number;
}

/**
 * Zpracuje trenérovu odpověď v konverzaci s vůdcem.
 *
 * Vrací `false`, když konverzace vůdci nepatří — volající pak nic neřeší.
 * Nikdy nehází: neúspěšná odpověď nesmí shodit odeslání zprávy.
 */
export async function handleFanLeaderReply(
  db: D1Database,
  convId: string,
  odpovedTrenera: string,
  env?: ChatEnv,
): Promise<boolean> {
  try {
    const conv = await db
      .prepare("SELECT team_id, ai_thread_state FROM conversations WHERE id = ? AND ai_thread_active = 1")
      .bind(convId)
      .first<{ team_id: string; ai_thread_state: string | null }>();
    if (!conv?.ai_thread_state) return false;

    let state: ThreadState;
    try { state = JSON.parse(conv.ai_thread_state) as ThreadState; } catch { return false; }
    if (state.kind !== "fan_leader" || !state.leaderId || !state.groupId) return false;

    // Atomicky zavřít thread — dvě rychlé odpovědi za sebou nesmí dopad zdvojit.
    const claim = await db
      .prepare(
        `UPDATE conversations SET ai_thread_active = 0
         WHERE id = ? AND ai_thread_active = 1
           AND json_extract(ai_thread_state, '$.awaiting') = 'coach'`,
      )
      .bind(convId)
      .run();
    if ((claim.meta?.changes ?? 0) === 0) return true;

    const leader = await db
      .prepare("SELECT * FROM fan_leaders WHERE id = ?")
      .bind(state.leaderId)
      .first<FanLeaderRow>();
    if (!leader) return true;

    const postoj = klasifikujOdpoved(odpovedTrenera);
    const dopad = dopadOdpovedi(postoj, {
      vyjednavani: leader.vyjednavani,
      radikalnost: leader.radikalnost,
    });
    // Druhá odpověď trenéra (doplňující otázka) už náladou party nehýbe: dopad má jen ta první.
    const followUp = (state.replies ?? 0) >= 1;

    // Text odpovědi napíše model (téma, povaha vůdce, nálada party, jak trenér odpověděl).
    // Dopad zůstává deterministický; bez modelu zůstane hotová věta (dřív na všechno „Jasně. Tak nic.“).
    const text = await leaderReplyText(db, env, {
      convId, leader, groupId: state.groupId, coachMessage: odpovedTrenera,
      outcome: followUp ? "followup" : dopad.sentiment > 0 ? "calmed" : dopad.sentiment < 0 ? "annoyed" : "neutral",
    }) ?? dopad.odpoved;
    // Trenér se ptá („kolik je přijatelná cena?“): vůdce odpoví a nechá mu ještě jednu odpověď.
    const keepOpen = !followUp && odpovedTrenera.includes("?");
    const nextState = keepOpen ? JSON.stringify({ ...state, replies: 1, awaiting: "coach" }) : null;

    await db.batch([
      ...(followUp ? [] : [
        db.prepare(
          `UPDATE fan_leaders SET sentiment = MAX(-100, MIN(100, sentiment + ?)), duvod = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
        ).bind(dopad.sentiment, zkratitDuvod(postoj, odpovedTrenera), leader.id),
        db.prepare(
          `UPDATE fan_groups SET mood = MAX(0, MIN(100, mood + ?)), heat = MAX(0, MIN(100, heat + ?)),
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
        ).bind(dopad.mood, dopad.heat, state.groupId),
      ]),
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at)
         VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
      ).bind(crypto.randomUUID(), convId, leader.id, fanLeaderFullName(leader), text),
      db.prepare(
        `UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?,
           last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), ai_thread_state = ?, ai_thread_active = ?
         WHERE id = ?`,
      ).bind(text.slice(0, 100), nextState, keepOpen ? 1 : 0, convId),
    ]);

    logger.info(
      { module: M, teamId: conv.team_id },
      `odpověď vůdci ${leader.id}: ${postoj} → sentiment ${dopad.sentiment > 0 ? "+" : ""}${dopad.sentiment}`,
    );
    return true;
  } catch (e) {
    logger.warn({ module: M }, `odpověď vůdci v konverzaci ${convId}`, e);
    return false;
  }
}

/**
 * Odpověď vůdce party napsaná modelem. Zná, s čím za trenérem přišel (jeho poslední zpráva),
 * náladu party a výsledek, který rozhodla hra. Na otázku odpoví věcně: manažeři se ptali
 * „Kolik je přijatelná cena?“, „Myslíš, že je to hodně?“ a dostali „Jasně. Tak nic.“
 * Null = model nic nevrátil, platí hotová věta.
 */
async function leaderReplyText(
  db: D1Database,
  env: ChatEnv | undefined,
  o: { convId: string; leader: FanLeaderRow; groupId: string; coachMessage: string; outcome: "calmed" | "annoyed" | "neutral" | "followup" },
): Promise<string | null> {
  if (!env) return null;
  try {
    const chat = await import("../messaging/ai-player-chat");
    const [said, group] = await Promise.all([
      db.prepare("SELECT body FROM messages WHERE conversation_id = ? AND sender_id = ? ORDER BY sent_at DESC LIMIT 2")
        .bind(o.convId, o.leader.id).all<{ body: string }>(),
      db.prepare("SELECT name, mood, heat FROM fan_groups WHERE id = ?").bind(o.groupId).first<{ name: string; mood: number; heat: number }>(),
    ]);
    const mood = (group?.mood ?? 50) >= 65 ? "spokojená" : (group?.mood ?? 50) >= 40 ? "nejistá, něco ji štve" : "naštvaná";
    const how = {
      calmed: "Trenérova odpověď tě uklidnila, ber to smířlivě, ale po svém.",
      annoyed: "Trenérova odpověď tě naštvala nebo urazila, dej to najevo podle povahy.",
      neutral: "Trenérova odpověď s tebou moc nepohnula, odpověz stroze.",
      followup: "Je to doplňující otázka trenéra, odpověz na ni a uzavři to.",
    }[o.outcome];
    const parsed = await chat.askModelJson<{ body?: unknown }>(env, [
      chat.COACH_TEXT_RULE,
      `Jsi ${fanLeaderFullName(o.leader)}, ${o.leader.age} let, ${o.leader.occupation}, vůdce fanouškovské party${group?.name ? ` „${group.name}“` : ""} vesnického fotbalového klubu.`,
      `Povaha: radikálnost ${o.leader.radikalnost}/100, ochota vyjednávat ${o.leader.vyjednavani}/100. ${o.leader.bio ?? ""}`.trim(),
      `Parta je teď ${mood}.`,
      said.results.length > 0 ? `Trenérovi jsi napsal: „${said.results.reverse().map((m) => m.body).join(" … ")}“` : "",
      `Trenér ti odpověděl: ${chat.coachQuote(o.coachMessage)}`,
      "",
      how,
      "Když se trenér na něco ptá (třeba jaká cena je pro kluky ještě přijatelná, jestli to vadí), odpověz mu věcně a konkrétně za partu.",
      "Piš jako chlap z kotle v SMS: 1–2 věty, hovorově, bez spisovných obratů, bez podpisu, bez dlouhé pomlčky.",
      "Vrať POUZE JSON: {\"body\": \"text SMS\"}",
    ].filter(Boolean).join("\n"), 160);
    const body = typeof parsed?.body === "string" ? parsed.body.replace(/\s+/g, " ").replace(/—/g, ",").trim().slice(0, 280) : "";
    return body.length > 0 ? body : null;
  } catch (e) {
    logger.warn({ module: M }, `text odpovědi vůdce ${o.leader.id}`, e);
    return null;
  }
}

/** Krátký záznam do profilu vůdce — celý text zprávy by se tam nevešel. */
function zkratitDuvod(postoj: string, text: string): string {
  const uvod = postoj === "uklidnit"
    ? "Snažil ses to urovnat"
    : postoj === "postavit_se"
      ? "Postavil ses mu"
      : "Odbyl jsi ho";
  const vyrok = text.trim().replace(/\s+/g, " ").slice(0, 90);
  return `${uvod}: „${vyrok}${text.trim().length > 90 ? "…" : ""}"`;
}
