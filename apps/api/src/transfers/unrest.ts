/**
 * SMS usmiřování nespokojeného hráče (transferUnrest) — deterministické efekty,
 * AI (Gemini) generuje POUZE textaci odpovědi hráče. Při výpadku AI se použije
 * šablonový fallback — efekt se aplikuje vždy.
 */

import { nazevSituace } from "../incidents/situace";
import { logger } from "../lib/logger";
import { sendPlayerSMS } from "../messaging/system-sms";
import { parseUnrest, type TransferUnrest } from "./offer-rejection-impact";
import type { UnrestReason } from "./unrest-reasons";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const DAY_MS = 86400000;

export type UnrestActionId =
  | "promise_minutes" | "raise_wage" | "bonus" | "promise_transfer" | "release"
  | "personal_talk" | "captaincy" | "appeal_loyalty" | "tough_love";

type Outcome = "calmed" | "partial" | "backfired";

export interface UnrestActionDef {
  id: UnrestActionId;
  label: string;          // text na FE chipu (bez ceny, ceny do tlačítek nepatří)
  coachMessage: string;   // co trenér hráči napíše (šablona: {name} křestní, {amount} částka, {team} klub)
  description: string;    // vysvětlení efektu pro FE ({amount}, {team} se doplní)
}

/**
 * Dohody s hráčem, který chtěl odejít (přepracováno 2026-10-18). Nabízí se jen ty, které
 * řeší jeho důvod (`availableActions`), a každá zabere, jak je popsaná: dřív byly dvě
 * z pěti loterie podle skrytých vlastností a spolehlivě fungovalo jen zvednout plat.
 */
export const UNREST_ACTIONS: UnrestActionDef[] = [
  {
    id: "bonus",
    label: "Vyplatit prémii",
    coachMessage: "{name}, vím, že ti šlo i o peníze. Tady máš {amount} prémii, zasloužíš si ji. A teď hlavu nahoru, potřebuju tě.",
    description: "Jednorázově {amount} z klubové kasy. Hráče, kterému šlo o peníze, spolehlivě uklidní.",
  },
  {
    id: "raise_wage",
    label: "Zvednout odměny (+30 %)",
    coachMessage: "{name}, vážím si tě a chci, abys tu byl spokojený. Od příštího týdne ti zvedám odměny o třetinu.",
    description: "Trvale zvýší týdenní odměny hráče o 30 %. Jde použít 1× za sezónu.",
  },
  {
    id: "promise_minutes",
    label: "Slíbit místo v sestavě",
    coachMessage: "{name}, chápu, že jsi naštvaný. Uděláme dohodu, v příštích zápasech s tebou počítám v základu. Ukaž mi, že na to máš.",
    description: "Zklidní hráče, ale slib se počítá: 2 ze 3 příštích zápasů v základu, jinak se naštve víc.",
  },
  {
    id: "promise_transfer",
    label: "Slíbit prodej při další nabídce",
    coachMessage: "{name}, dobře. Když přijde další slušná nabídka, pustím tě. Máš moje slovo. Do té doby chci ale plný nasazení.",
    description: "Výrazně zklidní. Slib platí 30 dní: další odmítnutá nabídka, o kterou hráč stojí, ho rozzuří naplno.",
  },
  {
    id: "captaincy",
    label: "Dát mu kapitánskou pásku",
    coachMessage: "{name}, chceš víc? Tak to ukaž tady. Od zítřka jsi kapitán, beru tě jako lídra týmu.",
    description: "Stane se kapitánem týmu (dosavadní kapitán o pásku přijde). Ambiciózního hráče to podrží.",
  },
  {
    id: "personal_talk",
    label: "Pozvat ho na pivo",
    coachMessage: "{name}, pojď večer na pivo, platím já. Chci slyšet, co tě štve, a vyříkat si to z očí do očí.",
    description: "Posezení za {amount}. Zlepší vztah s tebou a hráč se vypovídá.",
  },
  {
    id: "appeal_loyalty",
    label: "Apelovat na srdcaře",
    coachMessage: "{name}, tenhle klub tě vychoval. Kabina tě potřebuje a lidi ve vsi za tebou stojí. Nenech se zblbnout penězi.",
    description: "Na hráče, kterému na klubu záleží, apel zabere.",
  },
  {
    id: "tough_love",
    label: "Zpražit ho",
    coachMessage: "{name}, poslouchej. Trucování ti nepomůže. Buď makáš jako ostatní, nebo si sedneš na lavku. Tvoje volba.",
    description: "Disciplinovaný hráč si to vezme k srdci.",
  },
  {
    id: "release",
    label: "Zavolat klubu a pustit ho",
    coachMessage: "{name}, dobře, nebudu ti stát v cestě. Volal jsem do {team}, jestli o tebe pořád stojí. Když pošlou nabídku znovu, pustím tě.",
    description: "{team} pošle stejnou nabídku znovu (najdeš ji v Přestupech). Když ji pak odmítneš nebo necháš propadnout, hráč se rozzuří naplno.",
  },
];

/** Prémie: 15 % z odmítnuté nabídky (o tolik hráč „přišel“), 1 000–50 000 Kč. */
export function bonusAmount(unrest: Pick<TransferUnrest, "offer">): number {
  const base = unrest.offer?.amount ? unrest.offer.amount * 0.15 : 5_000;
  return Math.max(1_000, Math.min(50_000, Math.round(base / 100) * 100));
}

/** Pivo s trenérem. */
export const PERSONAL_TALK_COST = 500;
/** Do kdy po odmítnutí jde klubu zavolat (pak už má jiného hráče). */
export const RELEASE_WINDOW_DAYS = 7;

/** Truc bez uložených důvodů (vznikl před 2026-10-18): nabídnou se dohody na nejčastější důvody. */
const LEGACY_REASONS: UnrestReason[] = ["money", "minutes", "better_club"];

/** Co se o hráči a klubu ví pro výběr dohod. */
export interface UnrestContext {
  seasonNumber: number | null;
  patriotism: number;
  discipline: number;
  leadership: number;
  coachRelationship: number;
  isCaptain: boolean;
  /**
   * Hráč je v kádru klubu, který s ním jedná, a není na hostování. Jen pak jde dát pásku
   * a „pustit ho“: obojí zapisuje do jeho týmu (kapitán, nabídka) a u hostování by to byl
   * cizí tým.
   */
  ownedHere: boolean;
  now?: Date;
}

function teamNameOf(unrest: Pick<TransferUnrest, "offer" | "teamName">): string {
  try {
    const vd = unrest.offer?.virtualTeamData ? JSON.parse(unrest.offer.virtualTeamData) as { name?: string } : null;
    return vd?.name ?? unrest.teamName ?? "ten klub";
  } catch {
    return unrest.teamName ?? "ten klub";
  }
}

function fillText(text: string, unrest: TransferUnrest, actionId: UnrestActionId): string {
  const amount = actionId === "personal_talk" ? PERSONAL_TALK_COST : bonusAmount(unrest);
  return text.replace("{amount}", `${amount.toLocaleString("cs")} Kč`).replace("{team}", teamNameOf(unrest));
}

/**
 * Dohody, které má smysl hráči nabídnout: podle toho, proč chtěl odejít, plus „pustit ho“,
 * dokud o něj klub stojí. Každá dohoda jde v jednom truci uzavřít jen jednou.
 */
export function availableActions(
  unrest: TransferUnrest, lifeContext: Record<string, unknown>, ctx: UnrestContext,
): Array<{ id: UnrestActionId; label: string; description: string; message: string }> {
  const reasons = unrest.reasons?.length ? unrest.reasons : LEGACY_REASONS;
  const dealt = new Set((unrest.deals ?? []).map((d) => d.id));
  const ids: UnrestActionId[] = [];
  const add = (id: UnrestActionId) => { if (!dealt.has(id) && !ids.includes(id)) ids.push(id); };
  for (const reason of reasons) {
    if (reason === "money") {
      add("bonus");
      if (ctx.seasonNumber == null || lifeContext.wageRaisedSeason !== ctx.seasonNumber) add("raise_wage");
    } else if (reason === "minutes") {
      if (unrest.pledge?.type !== "minutes") add("promise_minutes");
    } else if (reason === "better_club") {
      if (unrest.pledge?.type !== "transfer") add("promise_transfer");
      if (ctx.ownedHere && ctx.leadership >= 55 && !ctx.isCaptain) add("captaincy");
    } else {
      add("personal_talk");
    }
  }
  if (ctx.patriotism > 60 || ctx.coachRelationship > 65) add("appeal_loyalty");
  if (ctx.discipline > 60) add("tough_love");
  const now = (ctx.now ?? new Date()).getTime();
  if (ctx.ownedHere && unrest.offer?.fromTeamId === "virtual_ai" && unrest.offer.virtualTeamData && unrest.pledge?.type !== "release"
    && now - new Date(unrest.offer.at).getTime() <= RELEASE_WINDOW_DAYS * DAY_MS) add("release");
  return ids.map((id) => {
    const def = UNREST_ACTIONS.find((a) => a.id === id)!;
    // `message` je hotová SMS trenéra (jen {name} doplní volající), v telefonu se nabízí jako rychlá odpověď.
    return { id, label: def.label, description: fillText(def.description, unrest, id), message: fillText(def.coachMessage, unrest, id) };
  });
}

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
  /** Dohoda padla v rozhovoru po zatrhnutém přestupu: volající spustí odpověď hráče v rozhovoru. */
  threadConvId?: string;
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

/** Další dohodu jde uzavřít až den po té poslední. Vrací větu pro panel, nebo null. */
export function dealCooldownText(unrest: Pick<TransferUnrest, "lastActionAt">, now: Date = new Date()): string | null {
  if (!unrest.lastActionAt || now.getTime() - new Date(unrest.lastActionAt).getTime() >= DAY_MS) return null;
  return "Dnes už jste se na něčem dohodli, další dohoda jde až zítra.";
}

/** Jak je hráč naštvaný, slovy (číslo nespokojenosti manažer nevidí). */
export function unrestMoodText(level: number): string {
  if (level >= 70) return "Je hodně naštvaný a hlavou je jinde";
  if (level >= 40) return "Je naštvaný";
  if (level >= 15) return "Pořád to v něm trochu vře";
  if (level > 0) return "Už se skoro uklidnil";
  return "Uklidnil se";
}

/** Co dohoda s hráčem udělala, slovy. */
export function unrestChangeText(before: number, after: number): string {
  if (after <= 0) return "Uklidnil se";
  if (after > before) return "Naštval se ještě víc";
  if (before - after >= 30) return "Výrazně se uklidnil";
  if (after < before) return "Trochu se uklidnil";
  return "Nic se nezměnilo";
}

/** Platný slib trenéra česky pro panel u hráče, nebo null. */
export function pledgeText(unrest: TransferUnrest): string | null {
  const p = unrest.pledge;
  if (!p) return null;
  const until = new Date(p.deadline).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
  if (p.type === "minutes") return "Slíbil jsi mu místo v sestavě: 2 ze 3 příštích zápasů v základu.";
  if (p.type === "transfer") return `Slíbil jsi, že ho při další dobré nabídce pustíš (do ${until}).`;
  return `Slíbil jsi, že přijmeš nabídku od ${teamNameOf(unrest)} (do ${until}).`;
}

/** Deterministická hláška hráče k jeho aktuálnímu trucu (stejný hráč + úroveň = stejná věta). */
export function unrestMoodQuote(playerId: string, level: number, teamName?: string): string {
  const pool = level >= 70 ? MOOD_QUOTES_HIGH : level >= 40 ? MOOD_QUOTES_MID : MOOD_QUOTES_LOW;
  const quote = pool[hashStr(playerId + String(level >= 70 ? 2 : level >= 40 ? 1 : 0)) % pool.length];
  return quote.replace("{team}", teamName ?? "jinam");
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
    `SELECT p.id, p.team_id, p.loan_from_team_id, p.first_name, p.last_name, p.nationality, p.nickname, p.avatar, p.personality, p.life_context,
            p.coach_relationship, p.weekly_wage, current_team.captain_id,
            COALESCE(current_team.parent_team_id, current_team.id) AS current_club_id
     FROM players p
     JOIN teams current_team ON current_team.id = p.team_id
     LEFT JOIN teams owner_team ON owner_team.id = p.loan_from_team_id
     WHERE p.id = ? AND (
       COALESCE(current_team.parent_team_id, current_team.id) = ?
       OR COALESCE(owner_team.parent_team_id, owner_team.id) = ?
     )`
  ).bind(playerId, teamId, teamId).first<Record<string, unknown>>()
    .catch((e) => { logger.warn({ module: "unrest" }, "load player", e); return null; });
  if (!player) return { ok: false, error: "Hráč nenalezen", status: 404 };

  // Rozhovor v telefonu: dohodu jde uzavřít i uprostřed rozhovoru po zatrhnutém přestupu
  // (je to tah trenéra, hráč na ni v rozhovoru odpoví). Jiný rozhovor ji blokuje.
  const conv = await db.prepare(
    "SELECT id, ai_thread_active, ai_thread_state FROM conversations WHERE team_id = ? AND type = 'player' AND participant_id = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(teamId, playerId).first<{ id: string; ai_thread_active: number; ai_thread_state: string | null }>()
    .catch((e) => { logger.warn({ module: "unrest" }, "load conversation", e); return null; });
  let inThread = false;
  if (conv?.ai_thread_active === 1) {
    const state = (() => { try { return JSON.parse(conv.ai_thread_state ?? "{}") as { scenario_id?: string; awaiting?: string }; } catch { return {}; } })();
    if (state.scenario_id !== "rejected_offer") {
      return { ok: false, error: "Hráč zrovna řeší s trenérem něco jiného, počkej, až konverzace skončí", status: 409 };
    }
    if (state.awaiting !== "coach") return { ok: false, error: "Hráč ti zrovna píše, počkej na jeho odpověď.", status: 409 };
    inThread = true;
  }

  const lc = (() => { try { return JSON.parse(player.life_context as string) ?? {}; } catch { return {}; } })();
  const unrest = parseUnrest(player.life_context as string);
  if (!unrest || unrest.level <= 0) return { ok: false, error: "Hráč zrovna netrucuje, není co řešit", status: 409 };

  // Limit 1 dohoda / hráč / den
  const cooldown = dealCooldownText(unrest);
  if (cooldown) return { ok: false, error: cooldown, status: 429 };

  const pers = (() => { try { return JSON.parse(player.personality as string) ?? {}; } catch { return {}; } })();
  const seasonRow = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ number: number }>().catch((e) => { logger.warn({ module: "unrest" }, "load season", e); return null; });
  const seasonNumber = seasonRow?.number ?? null;
  const coachRel: number = (player.coach_relationship as number) ?? 50;
  const ctx: UnrestContext = {
    seasonNumber, patriotism: pers.patriotism ?? 50, discipline: pers.discipline ?? 50, leadership: pers.leadership ?? 30,
    coachRelationship: coachRel, isCaptain: player.captain_id === playerId,
    ownedHere: player.loan_from_team_id == null && player.current_club_id === teamId,
  };
  if (!availableActions(unrest, lc, ctx).some((a) => a.id === action.id)) {
    return { ok: false, error: "Tahle dohoda teď nejde, vyber jinou.", status: 409 };
  }

  // ── Deterministické efekty ──
  const morale: number = typeof lc.morale === "number" ? lc.morale : 50;
  const nowIso = new Date().toISOString();
  const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: "unrest" }, "herní den klubu", e); return null; });
  const gameDate = team?.game_date ?? nowIso;

  let unrestDelta = 0;
  let moraleDelta = 0;
  let outcome: Outcome = "calmed";
  const effects: string[] = [];
  const dbUpdates: D1PreparedStatement[] = [];
  const name = player.first_name as string;

  switch (action.id) {
    case "bonus": {
      const amount = bonusAmount(unrest);
      const budget = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>();
      if ((budget?.budget ?? 0) < amount) return { ok: false, error: `Na prémii ${amount.toLocaleString("cs")} Kč v kase nemáš.`, status: 400 };
      const { recordTransaction } = await import("../season/finance-processor");
      await recordTransaction(db, teamId, "player_bonus", -amount, `Prémie: ${name} ${player.last_name as string}`, gameDate, playerId);
      unrestDelta = -35; moraleDelta = 5;
      effects.push(`Prémie ${amount.toLocaleString("cs")} Kč`);
      break;
    }
    case "raise_wage": {
      unrestDelta = -40; moraleDelta = 10;
      const oldWage = (player.weekly_wage as number) ?? 0;
      const newWage = Math.round(oldWage * 1.3);
      dbUpdates.push(db.prepare("UPDATE players SET weekly_wage = ? WHERE id = ?").bind(newWage, playerId));
      lc.wageRaisedSeason = seasonNumber;
      effects.push(`Týdenní odměny ${oldWage} → ${newWage} Kč (trvale)`);
      break;
    }
    case "promise_minutes": {
      unrestDelta = -25; moraleDelta = 5;
      unrest.pledge = { type: "minutes", madeAt: nowIso, deadline: new Date(Date.now() + 21 * DAY_MS).toISOString() };
      effects.push("Slib: 2 ze 3 příštích zápasů v základu");
      break;
    }
    case "promise_transfer": {
      unrestDelta = -35; moraleDelta = 3;
      unrest.pledge = { type: "transfer", madeAt: nowIso, deadline: new Date(Date.now() + 30 * DAY_MS).toISOString() };
      effects.push("Slib: při další dobré nabídce ho pustíš (platí 30 dní)");
      break;
    }
    case "captaincy": {
      unrestDelta = -30; moraleDelta = 8;
      dbUpdates.push(db.prepare("UPDATE teams SET captain_id = ? WHERE id = ?").bind(playerId, player.team_id as string));
      effects.push("Nový kapitán týmu");
      break;
    }
    case "personal_talk": {
      const budget = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>();
      if ((budget?.budget ?? 0) < PERSONAL_TALK_COST) return { ok: false, error: "Ani na pivo v kase nemáš.", status: 400 };
      const { recordTransaction } = await import("../season/finance-processor");
      await recordTransaction(db, teamId, "manager_social", -PERSONAL_TALK_COST, `Pivo s hráčem: ${name} ${player.last_name as string}`, gameDate, playerId);
      const { applyCoachRelationDelta } = await import("../lib/coach-relation");
      await applyCoachRelationDelta(db, {
        playerId, delta: 8, source: "sms_thread", description: "Pozval tě na pivo a vyříkali jste si to", gameDate,
        referenceId: `unrest-beer-${playerId}-${nowIso.slice(0, 10)}`,
      });
      unrestDelta = -20; moraleDelta = 3;
      effects.push("Vztah s trenérem se zlepšil");
      break;
    }
    case "appeal_loyalty": {
      unrestDelta = -30; moraleDelta = 5;
      effects.push("Srdcař, apel zabral");
      break;
    }
    case "tough_love": {
      unrestDelta = -15; outcome = "partial";
      effects.push("Disciplinovaný, zpražení zabralo");
      break;
    }
    case "release": {
      const offerId = await recreateOffer(db, teamId, player, unrest);
      if (!offerId) return { ok: false, error: "Klub už o hráče nestojí.", status: 409 };
      unrestDelta = -20; moraleDelta = 5;
      unrest.pledge = { type: "release", madeAt: nowIso, deadline: new Date(Date.now() + 4 * DAY_MS).toISOString(), offerId };
      effects.push(`${teamNameOf(unrest)} poslal nabídku znovu, najdeš ji v Přestupech`);
      break;
    }
  }

  const newLevel = clamp(unrest.level + unrestDelta, 0, 100);
  const newMorale = clamp(morale + moraleDelta, 0, 100);
  // Bez čísel (přání 2026-10-18: hra je simulace, hodnoty nálady a nespokojenosti hráč nevidí).
  effects.unshift(unrestChangeText(unrest.level, newLevel));
  if (moraleDelta > 0) effects.push("Má lepší náladu");
  else if (moraleDelta < 0) effects.push("Spadla mu nálada");

  const updatedUnrest: TransferUnrest & { lastAction?: string } = {
    ...unrest,
    level: newLevel,
    lastActionAt: nowIso,
    lastAction: action.id,
    deals: [...(unrest.deals ?? []), { id: action.id, at: nowIso }],
  };
  // Při nule truc končí, kromě běžícího slibu: ten musí přežít, dokud se nevyhodnotí.
  if (newLevel <= 0 && !updatedUnrest.pledge) {
    delete lc.transferUnrest;
  } else {
    lc.transferUnrest = updatedUnrest;
  }
  lc.morale = newMorale;
  dbUpdates.push(db.prepare("UPDATE players SET life_context = json(?) WHERE id = ?").bind(JSON.stringify(lc), playerId));
  await db.batch(dbUpdates);

  const playerRef = {
    id: playerId,
    firstName: name,
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
    effects.push("Zázračné uzdravení, od zítřka může trénovat");
  }

  // ── Zprávy do telefonu: trenér (šablona) + odpověď hráče ──
  const { getOrCreatePlayerConversation } = await import("../messaging/ai-player-spawn");
  const convId = conv?.id ?? await getOrCreatePlayerConversation(db, teamId, playerRef);
  const coachMessage = fillText(action.coachMessage.replace("{name}", name), unrest, action.id);
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at, read) VALUES (?, ?, 'user', ?, 'Trenér', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 1)"
  ).bind(crypto.randomUUID(), convId, teamId, coachMessage).run()
    .catch((e) => logger.warn({ module: "unrest" }, "insert coach msg", e));
  await db.prepare("UPDATE conversations SET last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
    .bind(coachMessage.slice(0, 100), convId).run()
    .catch((e) => logger.warn({ module: "unrest" }, "update conversation", e));

  // V rozhovoru je dohoda tah trenéra: odpověď hráče přijde v rozhovoru (volající ji spustí
  // přes `handleAiPlayerReply`) a AI rozhodčí na konci dohodu vezme v úvahu.
  if (inThread) {
    const claimed = await db.prepare(
      `UPDATE conversations SET ai_thread_state = json_set(ai_thread_state, '$.awaiting', 'player')
        WHERE id = ? AND ai_thread_active = 1 AND json_extract(ai_thread_state, '$.awaiting') = 'coach'`,
    ).bind(convId).run().catch((e) => { logger.warn({ module: "unrest" }, "tah trenéra v rozhovoru", e); return null; });
    if ((claimed?.meta?.changes ?? 0) > 0) {
      logger.info({ module: "unrest" }, `unrest deal ${action.id} v rozhovoru: ${name} ${playerRef.lastName} level ${unrest.level}→${newLevel}`);
      return { ok: true, outcome, effects, unrestLevel: newLevel, threadConvId: convId };
    }
  }

  let playerReply: string | null = null;
  try {
    const { generateUnrestReply } = await import("../messaging/ai-player-chat");
    const { loadLastOwnMessageAt, loadPlayerSnapshot, nactiSituaceTymu } = await import("../messaging/ai-player-spawn");
    const teamRow = await db.prepare("SELECT t.name, v.name as village_name FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
      .bind(teamId).first<{ name: string; village_name: string | null }>();
    const snapshot = loadPlayerSnapshot({ ...player, life_context: JSON.stringify(lc) });
    const situaceKind = (await nactiSituaceTymu(db, teamId)).get(playerId);
    snapshot.zivotniSituace = situaceKind ? { kind: situaceKind, label: nazevSituace(situaceKind) } : undefined;
    const { nactiZnalostiHrace } = await import("../incidents/znalosti-db");
    snapshot.znalostiIncidentu = await nactiZnalostiHrace(db, { teamId, playerId });
    snapshot.lastOwnMessageAt = await loadLastOwnMessageAt(db, convId, playerId);
    playerReply = await generateUnrestReply(env, snapshot, { teamName: teamRow?.name ?? "", villageName: teamRow?.village_name ?? undefined }, {
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

  logger.info({ module: "unrest" }, `unrest-talk ${action.id}: ${name} ${playerRef.lastName} outcome=${outcome} level ${unrest.level}→${newLevel}`);
  return { ok: true, outcome, effects, playerReply, unrestLevel: newLevel };
}

/**
 * „Pustit ho“: klub, jehož nabídku trenér odmítl, pošle stejnou nabídku znovu (s novou lhůtou).
 * Vrací id nové nabídky, nebo null, když už to nejde (hráč je na hostování, nabídka čeká…).
 */
async function recreateOffer(db: D1Database, teamId: string, player: Record<string, unknown>, unrest: TransferUnrest): Promise<string | null> {
  const offer = unrest.offer;
  if (!offer?.virtualTeamData) return null;
  const pending = await db.prepare(
    "SELECT 1 FROM transfer_offers WHERE player_id = ? AND status IN ('pending','countered') LIMIT 1",
  ).bind(player.id as string).first()
    .catch((e) => { logger.warn({ module: "unrest" }, "čekající nabídka na hráče", e); return null; });
  if (pending) return null;
  const vd = (() => { try { return JSON.parse(offer.virtualTeamData!) as { name?: string; rating?: number; country?: string }; } catch { return null; } })();
  if (!vd?.name) return null;
  const { offerReplyDeadline } = await import("./offer-deadline");
  const { computeInterestForOffer } = await import("./player-interest");
  const interest = await computeInterestForOffer(db, player.id as string, {
    fromTeamId: "virtual_ai", offerAmount: offer.amount, virtualRating: vd.rating ?? null, virtualCountry: vd.country ?? null,
  }).catch((e) => { logger.warn({ module: "unrest" }, "zájem u obnovené nabídky", e); return null; });
  const price = offer.amount.toLocaleString("cs");
  const message = vd.country === "DE"
    ? `Dobrý den pane trenér, vy nám volat, tak my to zkusit znovu. ${vd.name} platit ${price} Kč za ${player.first_name as string} ${player.last_name as string}. Danke!`
    : `Volal jste nám, tak to zkusíme znovu. Nabízíme ${price} Kč, peníze máme připravené.`;
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, offer_type, status, message, virtual_team_data, player_interest, expires_at, created_at)
     VALUES (?, ?, 'virtual_ai', ?, ?, 'transfer', 'pending', ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
  ).bind(id, player.id as string, player.team_id as string, offer.amount, message, offer.virtualTeamData, interest?.level ?? null, offerReplyDeadline()).run();
  return id;
}
