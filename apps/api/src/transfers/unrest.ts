/**
 * SMS usmiřování nespokojeného hráče (transferUnrest) — deterministické efekty,
 * AI (Gemini) generuje POUZE textaci odpovědi hráče. Při výpadku AI se použije
 * šablonový fallback — efekt se aplikuje vždy.
 */

import { logger } from "../lib/logger";
import { sendPlayerSMS } from "../messaging/system-sms";
import { parseUnrest, type TransferUnrest } from "./offer-rejection-impact";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const DAY_MS = 86400000;

export type UnrestActionId = "promise_minutes" | "raise_wage" | "appeal_loyalty" | "promise_transfer" | "tough_love";

type Outcome = "calmed" | "partial" | "backfired";

export interface UnrestActionDef {
  id: UnrestActionId;
  label: string;          // text na FE chipu
  coachMessage: string;   // co trenér hráči napíše (šablona, {name} = křestní)
  description: string;    // vysvětlení efektu pro FE
}

export const UNREST_ACTIONS: UnrestActionDef[] = [
  {
    id: "promise_minutes",
    label: "Slíbit místo v sestavě",
    coachMessage: "{name}, chápu, že jsi naštvaný. Uděláme dohodu — v příštích zápasech s tebou počítám v základu. Ukaž mi, že na to máš.",
    description: "Zklidní hráče, ale slib se počítá: 2 ze 3 příštích zápasů v základu, jinak se naštve víc.",
  },
  {
    id: "raise_wage",
    label: "Zvednout odměny (+30 %)",
    coachMessage: "{name}, vážím si tě a chci, abys tu byl spokojený. Od příštího týdne ti zvedám odměny o třetinu.",
    description: "Trvale zvýší týdenní odměny hráče o 30 %. Jde použít 1× za sezónu.",
  },
  {
    id: "appeal_loyalty",
    label: "Apelovat na srdcaře",
    coachMessage: "{name}, tenhle klub tě vychoval. Kabina tě potřebuje a lidi ve vsi za tebou stojí. Nenech se zblbnout penězi.",
    description: "Zabírá na patrioty a hráče s dobrým vztahem k trenérovi. Na ostatní může být krátké.",
  },
  {
    id: "promise_transfer",
    label: "Slíbit prodej při další nabídce",
    coachMessage: "{name}, dobře. Když přijde další slušná nabídka, pustím tě. Máš moje slovo. Do té doby chci ale plný nasazení.",
    description: "Výrazně zklidní, ale slib platí 30 dní — další odmítnutá nabídka, o kterou hráč stojí, ho rozzuří naplno.",
  },
  {
    id: "tough_love",
    label: "Zpražit ho",
    coachMessage: "{name}, poslouchej. Trucování ti nepomůže. Buď makáš jako ostatní, nebo si sedneš na lavku. Tvoje volba.",
    description: "Na disciplinované hráče platí. U ostatních hrozí, že se naštvou ještě víc.",
  },
];

// Fallback odpovědi hráče (když AI selže) — dle výsledku akce
const FALLBACK_REPLIES: Record<Outcome, string[]> = {
  calmed: [
    "Tak jo, trenére. Beru. Snad to myslíte vážně.",
    "Dobře. Tohle jsem potřeboval slyšet. Jdu makat.",
    "Fajn, trenére. Dáme to. Ale držte slovo.",
  ],
  partial: [
    "Hm, uvidíme, trenére. Slova jsou levný.",
    "Dobře, dám tomu šanci. Ale budu to sledovat.",
    "Jasně. Tak schválně, jak to dopadne.",
  ],
  backfired: [
    "To myslíte vážně? Tohle mi řeknete po tom všem?",
    "Super pokec, trenére. Fakt jste mi pomohl…",
    "Radši jste mi nemusel psát vůbec.",
  ],
};

export interface UnrestTalkResult {
  ok: boolean;
  error?: string;
  status?: number;
  outcome?: Outcome;
  effects?: string[];       // lidsky čitelný popis efektů pro FE
  playerReply?: string;
  unrestLevel?: number;
}

// Hláška hráče do panelu nespokojenosti — podle úrovně trucu, deterministicky per hráč
const MOOD_QUOTES_HIGH: string[] = [
  "Chtěl jsem do {team} a vy jste mi to vzal. Tohle jen tak nerozdejchám.",
  "Nemá cenu se přetvařovat, trenére. Hlavou jsem už jinde.",
  "Každej trénink si říkám, co tady ještě dělám.",
];
const MOOD_QUOTES_MID: string[] = [
  "Pořád to ve mně vře. Jestli se nic nezmění, řeknu si o přestup znovu.",
  "Snažím se makat, ale ta nabídka mi pořád leží v hlavě.",
  "Zatím jsem tady. Ale sledujte, jak se mnou počítáte.",
];
const MOOD_QUOTES_LOW: string[] = [
  "Už se to trochu usadilo… ale nezapomněl jsem.",
  "Dobrý, trenére. Jedeme dál. Jen na mě nezapomeňte.",
  "Beru to sportovně. Zatím.",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministická hláška hráče k jeho aktuálnímu trucu (stejný hráč + úroveň = stejná věta). */
export function unrestMoodQuote(playerId: string, level: number, teamName?: string): string {
  const pool = level >= 70 ? MOOD_QUOTES_HIGH : level >= 40 ? MOOD_QUOTES_MID : MOOD_QUOTES_LOW;
  const quote = pool[hashStr(playerId + String(level >= 70 ? 2 : level >= 40 ? 1 : 0)) % pool.length];
  return quote.replace("{team}", teamName ?? "jinam");
}

/** Vrátí akce dostupné pro hráče (pro FE chips) — s ohledem na jednorázové guardy. */
export function availableActions(unrest: TransferUnrest, lifeContext: Record<string, unknown>, seasonNumber: number | null): UnrestActionDef[] {
  return UNREST_ACTIONS.filter((a) => {
    if (a.id === "raise_wage" && seasonNumber != null && (lifeContext.wageRaisedSeason as number | undefined) === seasonNumber) return false;
    if (a.id === "promise_minutes" && unrest.pledge?.type === "minutes") return false;
    if (a.id === "promise_transfer" && unrest.pledge?.type === "transfer") return false;
    return true;
  });
}

export async function performUnrestAction(
  db: D1Database,
  env: { GEMINI_API_KEY?: string },
  teamId: string,
  playerId: string,
  actionId: string,
): Promise<UnrestTalkResult> {
  const action = UNREST_ACTIONS.find((a) => a.id === actionId);
  if (!action) return { ok: false, error: "Neznámá akce", status: 400 };

  const player = await db.prepare(
    `SELECT p.id, p.first_name, p.last_name, p.nickname, p.avatar, p.personality, p.life_context, p.coach_relationship, p.weekly_wage,
            (SELECT COUNT(*) FROM conversations c WHERE c.team_id = ? AND c.type = 'player' AND c.participant_id = p.id AND c.ai_thread_active = 1) as thread_active
     FROM players p
     JOIN teams current_team ON current_team.id = p.team_id
     LEFT JOIN teams owner_team ON owner_team.id = p.loan_from_team_id
     WHERE p.id = ? AND (
       COALESCE(current_team.parent_team_id, current_team.id) = ?
       OR COALESCE(owner_team.parent_team_id, owner_team.id) = ?
     )`
  ).bind(teamId, playerId, teamId, teamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "unrest" }, "load player", e); return null; });
  if (!player) return { ok: false, error: "Hráč nenalezen", status: 404 };
  if ((player.thread_active as number) > 0) {
    return { ok: false, error: "Hráč zrovna řeší s trenérem něco jiného — počkej, až konverzace skončí", status: 409 };
  }

  const lc = (() => { try { return JSON.parse(player.life_context as string) ?? {}; } catch { return {}; } })();
  const unrest = parseUnrest(player.life_context as string);
  if (!unrest || unrest.level <= 0) return { ok: false, error: "Hráč zrovna netrucuje — není co řešit", status: 409 };

  // Limit 1 akce / hráč / den
  if (unrest.lastActionAt && (Date.now() - new Date(unrest.lastActionAt).getTime()) < DAY_MS) {
    return { ok: false, error: "Dnes už jsi s ním mluvil. Dej mu čas do zítřka.", status: 429 };
  }
  // Opakovaná stejná akce nemá efekt
  if ((unrest as TransferUnrest & { lastAction?: string }).lastAction === action.id) {
    return { ok: false, error: "Tohle už od tebe slyšel — zkus to jinak.", status: 409 };
  }

  const pers = (() => { try { return JSON.parse(player.personality as string) ?? {}; } catch { return {}; } })();
  const seasonRow = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>().catch((e) => { logger.warn({ module: "unrest" }, "load season", e); return null; });
  const seasonNumber = seasonRow?.number ?? null;

  // Season guard pro raise_wage
  if (action.id === "raise_wage" && seasonNumber != null && lc.wageRaisedSeason === seasonNumber) {
    return { ok: false, error: "Odměny jsi mu letos už zvedal — dvakrát za sezónu to nejde", status: 409 };
  }
  if ((action.id === "promise_minutes" && unrest.pledge?.type === "minutes")
    || (action.id === "promise_transfer" && unrest.pledge?.type === "transfer")) {
    return { ok: false, error: "Tenhle slib už platí — hráč čeká, jestli ho dodržíš", status: 409 };
  }

  // ── Deterministické efekty ──
  const morale: number = typeof lc.morale === "number" ? lc.morale : 50;
  const coachRel: number = (player.coach_relationship as number) ?? 50;
  const patriotism: number = pers.patriotism ?? 50;
  const temper: number = pers.temper ?? 40;
  const discipline: number = pers.discipline ?? 50;
  const nowIso = new Date().toISOString();

  let unrestDelta = 0;
  let moraleDelta = 0;
  let outcome: Outcome = "partial";
  const effects: string[] = [];
  const dbUpdates: D1PreparedStatement[] = [];

  switch (action.id) {
    case "promise_minutes": {
      unrestDelta = -25; moraleDelta = 5; outcome = "calmed";
      const deadline = new Date(Date.now() + 21 * DAY_MS).toISOString();
      unrest.pledge = { type: "minutes", madeAt: nowIso, deadline };
      effects.push("Slib: 2 ze 3 příštích zápasů v základu");
      break;
    }
    case "raise_wage": {
      unrestDelta = -40; moraleDelta = 10; outcome = "calmed";
      const oldWage = (player.weekly_wage as number) ?? 0;
      const newWage = Math.round(oldWage * 1.3);
      dbUpdates.push(db.prepare("UPDATE players SET weekly_wage = ? WHERE id = ?").bind(newWage, playerId));
      lc.wageRaisedSeason = seasonNumber;
      effects.push(`Týdenní odměny ${oldWage} → ${newWage} Kč (trvale)`);
      break;
    }
    case "appeal_loyalty": {
      if (patriotism > 60 || coachRel > 65) {
        unrestDelta = -30; moraleDelta = 5; outcome = "calmed";
        effects.push("Srdcař — apel zabral");
      } else {
        unrestDelta = -5; outcome = "partial";
        if (temper > 60) { moraleDelta = -3; outcome = "backfired"; effects.push("Horká hlava — řeči ho spíš naštvaly"); }
      }
      break;
    }
    case "promise_transfer": {
      unrestDelta = -35; moraleDelta = 3; outcome = "calmed";
      const deadline = new Date(Date.now() + 30 * DAY_MS).toISOString();
      unrest.pledge = { type: "transfer", madeAt: nowIso, deadline };
      effects.push("Slib: při další dobré nabídce ho pustíš (platí 30 dní)");
      break;
    }
    case "tough_love": {
      if (discipline > 60) {
        unrestDelta = -15; outcome = "partial";
        effects.push("Disciplinovaný — zpražení zabralo");
      } else {
        unrestDelta = 10; moraleDelta = -5; outcome = "backfired";
        effects.push("Vzal to špatně — truc se prohloubil");
      }
      break;
    }
  }

  const newLevel = clamp(unrest.level + unrestDelta, 0, 100);
  const newMorale = clamp(morale + moraleDelta, 0, 100);
  effects.unshift(`Nespokojenost ${unrest.level} → ${newLevel}`);
  if (moraleDelta !== 0) effects.push(`Morálka ${morale} → ${newMorale}`);

  const updatedUnrest: TransferUnrest & { lastAction?: string } = {
    ...unrest,
    level: newLevel,
    lastActionAt: nowIso,
    lastAction: action.id,
  };
  if (newLevel <= 0) {
    delete lc.transferUnrest;
  } else {
    lc.transferUnrest = updatedUnrest;
  }
  lc.morale = newMorale;
  dbUpdates.push(db.prepare("UPDATE players SET life_context = json(?) WHERE id = ?").bind(JSON.stringify(lc), playerId));
  await db.batch(dbUpdates);

  const playerRef = {
    id: playerId,
    firstName: player.first_name as string,
    lastName: player.last_name as string,
    nickname: player.nickname as string | null,
    avatar: player.avatar as string | null,
  };

  // Zázračné uzdravení — truc klesl pod 40 a hráč "marodil"
  const fakeInjury = await db.prepare("SELECT id FROM injuries WHERE player_id = ? AND is_fake = 1 AND days_remaining > 0 LIMIT 1")
    .bind(playerId).first<{ id: string }>().catch((e) => { logger.warn({ module: "unrest" }, "check fake injury", e); return null; });
  if (fakeInjury && newLevel < 40) {
    await db.prepare("DELETE FROM injuries WHERE player_id = ? AND is_fake = 1").bind(playerId).run()
      .catch((e) => logger.warn({ module: "unrest" }, "heal fake injury", e));
    effects.push("Zázračné uzdravení — od zítřka může trénovat");
  }

  // ── Zprávy do telefonu: trenér (šablona) + odpověď hráče (AI s fallbackem) ──
  const { getOrCreatePlayerConversation } = await import("../messaging/ai-player-spawn");
  const convId = await getOrCreatePlayerConversation(db, teamId, playerRef);
  const coachMessage = action.coachMessage.replace("{name}", playerRef.firstName);
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at, read) VALUES (?, ?, 'user', ?, 'Trenér', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 1)"
  ).bind(crypto.randomUUID(), convId, teamId, coachMessage).run()
    .catch((e) => logger.warn({ module: "unrest" }, "insert coach msg", e));

  let playerReply: string | null = null;
  try {
    const { generateUnrestReply } = await import("../messaging/ai-player-chat");
    const { loadPlayerSnapshot } = await import("../messaging/ai-player-spawn");
    const team = await db.prepare("SELECT t.name, v.name as village_name FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
      .bind(teamId).first<{ name: string; village_name: string | null }>();
    const snapshot = loadPlayerSnapshot({ ...player, life_context: JSON.stringify(lc) });
    playerReply = await generateUnrestReply(env, snapshot, { teamName: team?.name ?? "", villageName: team?.village_name ?? undefined }, {
      coachMessage,
      unrestReason: unrest.teamName ? `trenér odmítl nabídku od ${unrest.teamName}, o kterou jsi stál` : "trenér ti zatrhl přestup, o který jsi stál",
      outcome,
    });
  } catch (e) {
    logger.warn({ module: "unrest" }, "AI reply failed, using fallback", e);
  }
  if (!playerReply) {
    const pool = FALLBACK_REPLIES[outcome];
    playerReply = pool[Math.floor(Math.random() * pool.length)];
  }
  await sendPlayerSMS(db, teamId, playerRef, playerReply);

  logger.info({ module: "unrest" }, `unrest-talk ${action.id}: ${playerRef.firstName} ${playerRef.lastName} outcome=${outcome} level ${unrest.level}→${newLevel}`);
  return { ok: true, outcome, effects, playerReply, unrestLevel: newLevel };
}
