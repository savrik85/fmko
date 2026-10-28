/**
 * Průvodce prvním týdnem: kapitán nováčka vede SMS a na Přehledu visí karta
 * „První týden“. Každý krok je skutečná věc ve hře, kterou hra pozná z dat sama
 * (uložená sestava, nastavený trénink, sponzor…). Nic se neodklikává ručně.
 *
 * Bez migrace: start průvodce je první SMS od kapitána (`metadata.type = "guide"`),
 * splnění kroku se počítá jen z toho, co klub udělal PO ní (převzatý AI klub
 * si nese sestavy a zprávy z dob AI). Odměnu hlídá `reference_id` transakce.
 *
 * Kapitán píše nanejvýš jednu zprávu s úkolem za den; kdo krok splní dřív,
 * dostane další hned (zavolá se z karty na Přehledu i z hodinového cronu).
 */

import { logger } from "../lib/logger";
import { sendSystemSMS } from "../messaging/system-sms";

const M = "first-week";

export const GUIDE_SENDER = "Kapitán";
export const GUIDE_REWARD = 5000;
/** Další úkol nejdřív po tolika hodinách, když předchozí ještě není hotový. */
const NEXT_STEP_AFTER_HOURS = 20;
/** Po kolika dnech od startu průvodce přestane (karta zmizí, kapitán nepíše). */
const GUIDE_DAYS = 14;

export type GuideStepKey = "lineup" | "training" | "sponsor" | "player_chat" | "market" | "stadium" | "equipment";

/** Kroky, které se splní jen otevřením stránky (`recordGuideVisit`), nic se na nich dělat nemusí. */
export const VISIT_STEPS: readonly GuideStepKey[] = ["stadium", "equipment"];

export interface GuideStepDef {
  key: GuideStepKey;
  label: string;
  /** Jedna věta na kartě: k čemu krok je a jak to ve hře funguje. */
  hint: string;
  href: string;
  button: string;
  sms: string;
}

export const GUIDE_STEPS: GuideStepDef[] = [
  {
    key: "lineup", label: "Nastav sestavu na zápas", href: "/zapas", button: "Otevřít sestavu",
    hint: "Vybereš jedenáctku, lavičku a taktiku. Když sestavu nenastavíš, postaví ji za tebe hra sama.",
    sms: "Čau trenére, vítej u nás. Kluci se ptají, kdo bude hrát příští zápas. Postav nám sestavu, ať víme, na čem jsme.",
  },
  {
    key: "training", label: "Nastav trénink", href: "/trenink", button: "Otevřít tréninky",
    hint: "Trénink zvedá dovednosti hráčů. Vybereš dny a zaměření, kluci chodí, jak jim to dovolí práce.",
    sms: "Trenére, kdy a co budeme trénovat? Nastav nám tréninky, ať se kluci můžou v práci domluvit.",
  },
  {
    key: "sponsor", label: "Podepiš sponzora", href: "/sponzori", button: "Otevřít sponzory",
    hint: "Sponzor platí každý měsíc. Hlídej sliby ve smlouvě, za nesplněný se platí pokuta.",
    sms: "Bez peněz to nepůjde. Mrkni na sponzory, nějaká firma z okolí by nám určitě přispěla.",
  },
  {
    key: "player_chat", label: "Napiš někomu z kabiny", href: "/telefon", button: "Otevřít telefon",
    hint: "S hráči si píšeš přes telefon a vztah k tobě ovlivňuje jejich náladu. Každá SMS stojí kredit, denně máš 36 Kč.",
    sms: "Kluci by tě rádi poznali. Napiš někomu z kabiny, ať ví, že trenér o nich ví.",
  },
  {
    key: "market", label: "Podívej se po posile na trhu", href: "/prestupy", button: "Otevřít přestupy",
    hint: "Hráče si můžeš dát do sledovaných, poslat nabídku jeho klubu, nebo podepsat volného hráče.",
    sms: "Na pár postech jsme tenký. Podívej se na trh po posile a někoho si dej do sledovaných, nebo rovnou pošli nabídku.",
  },
  {
    key: "stadium", label: "Podívej se na stadion", href: "/stadion", button: "Otevřít stadion",
    hint: "Stadion přivádí diváky a peníze ze vstupného. Tribuny, kabiny a další části se dají vylepšit z kasy.",
    sms: "Trenére, zajdi se podívat na stadion, ať víš, kde hrajeme a co by chtělo opravit.",
  },
  {
    key: "equipment", label: "Podívej se na vybavení", href: "/vybaveni", button: "Otevřít vybavení",
    hint: "Míče, dresy a další vybavení zlepšují trénink, ale opotřebovávají se. Tady vidíš, co je potřeba obnovit.",
    sms: "Ještě vybavení. Míče a dresy už něco pamatujou, podívej se, co je potřeba obnovit.",
  },
];

export interface GuideState {
  active: boolean;
  startedAt: string | null;
  steps: Array<{ key: GuideStepKey; label: string; hint: string; href: string; done: boolean }>;
  rewardPaid: boolean;
}

const rewardRef = (teamId: string) => `first-week-reward-${teamId}`;
const visitKey = (teamId: string) => `first-week-visits:${teamId}`;

/** Trenér otevřel stránku kroku, který se splní jen podíváním (stadion, vybavení). */
export async function recordGuideVisit(kv: KVNamespace | undefined, teamId: string, step: string): Promise<void> {
  if (!kv || !(VISIT_STEPS as readonly string[]).includes(step)) return;
  const seen = await readVisits(kv, teamId);
  if (seen.has(step as GuideStepKey)) return;
  seen.add(step as GuideStepKey);
  await kv.put(visitKey(teamId), JSON.stringify([...seen]), { expirationTtl: GUIDE_DAYS * 86_400 * 2 })
    .catch((e) => logger.warn({ module: M, teamId }, "zápis návštěvy průvodce", e));
}

async function readVisits(kv: KVNamespace | undefined, teamId: string): Promise<Set<GuideStepKey>> {
  if (!kv) return new Set();
  const raw = await kv.get(visitKey(teamId)).catch((e) => { logger.warn({ module: M, teamId }, "čtení návštěv průvodce", e); return null; });
  try {
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    return new Set(list.filter((x): x is GuideStepKey => typeof x === "string" && (VISIT_STEPS as readonly string[]).includes(x)));
  } catch (e) {
    logger.warn({ module: M, teamId }, "nečitelné návštěvy průvodce", e);
    return new Set();
  }
}

async function exists(db: D1Database, label: string, sql: string, ...binds: unknown[]): Promise<boolean> {
  const row = await db.prepare(sql).bind(...binds).first()
    .catch((e) => { logger.warn({ module: M }, label, e); return null; });
  return !!row;
}

/** Které kroky klub od startu průvodce splnil. */
async function doneSteps(db: D1Database, kv: KVNamespace | undefined, teamId: string, since: string): Promise<Set<GuideStepKey>> {
  const done = await readVisits(kv, teamId);
  const checks: Array<[GuideStepKey, Promise<boolean>]> = [
    ["lineup", exists(db, "sestava", "SELECT 1 FROM lineups WHERE team_id = ? AND COALESCE(is_auto, 0) = 0 AND julianday(submitted_at) >= julianday(?) LIMIT 1", teamId, since)],
    ["training", exists(db, "trénink", "SELECT 1 FROM teams WHERE id = ? AND training_days IS NOT NULL", teamId)],
    ["sponsor", exists(db, "sponzor", "SELECT 1 FROM sponsor_contracts WHERE team_id = ? AND status = 'active' LIMIT 1", teamId)],
    ["player_chat", exists(db, "zpráva hráči",
      `SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE c.team_id = ? AND c.type = 'player' AND m.sender_type = 'user' AND julianday(m.sent_at) >= julianday(?) LIMIT 1`, teamId, since)],
    ["market", (async () =>
      await exists(db, "sledovaní", "SELECT 1 FROM player_watchlist WHERE team_id = ? LIMIT 1", teamId)
      || await exists(db, "nabídka", "SELECT 1 FROM transfer_offers WHERE from_team_id = ? AND julianday(created_at) >= julianday(?) LIMIT 1", teamId, since))()],
  ];
  for (const [key, check] of checks) if (await check) done.add(key);
  return done;
}

async function sentSteps(db: D1Database, teamId: string): Promise<Array<{ step: string; sentAt: string }>> {
  const rows = await db.prepare(
    `SELECT json_extract(m.metadata, '$.step') AS step, m.sent_at FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE c.team_id = ? AND c.type = 'system' AND c.title = ? AND json_extract(m.metadata, '$.type') = 'guide'
      ORDER BY m.sent_at`,
  ).bind(teamId, GUIDE_SENDER).all<{ step: string | null; sent_at: string }>()
    .catch((e) => { logger.warn({ module: M, teamId }, "odeslané zprávy průvodce", e); return { results: [] as Array<{ step: string | null; sent_at: string }> }; });
  return rows.results.filter((r) => !!r.step).map((r) => ({ step: r.step as string, sentAt: r.sent_at }));
}

async function sendStep(db: D1Database, teamId: string, step: GuideStepDef): Promise<void> {
  await sendSystemSMS(db, teamId, GUIDE_SENDER, step.sms, { type: "guide", step: step.key, href: step.href, label: step.button });
}

/** Spustí průvodce novému klubu: první úkol od kapitána. Volá se po založení klubu. */
export async function startFirstWeekGuide(db: D1Database, teamId: string): Promise<void> {
  if ((await sentSteps(db, teamId)).length > 0) return;
  await sendStep(db, teamId, GUIDE_STEPS[0]);
}

/**
 * Stav průvodce a jeho posun: pošle další úkol (hned po splnění, jinak nejdřív po
 * `NEXT_STEP_AFTER_HOURS`) a po splnění všeho vyplatí odměnu. Bez startu nic nedělá.
 */
export async function advanceFirstWeekGuide(
  db: D1Database, teamId: string, now: Date = new Date(), kv?: KVNamespace,
): Promise<GuideState> {
  const sent = await sentSteps(db, teamId);
  const inactive: GuideState = { active: false, startedAt: null, steps: [], rewardPaid: false };
  if (sent.length === 0) return inactive;
  const startedAt = sent[0].sentAt;
  const rewardPaid = await exists(db, "odměna průvodce", "SELECT 1 FROM transactions WHERE reference_id = ? LIMIT 1", rewardRef(teamId));
  const expired = now.getTime() - new Date(startedAt).getTime() > GUIDE_DAYS * 86_400_000;

  const done = await doneSteps(db, kv, teamId, startedAt);
  const steps = GUIDE_STEPS.map((s) => ({ key: s.key, label: s.label, hint: s.hint, href: s.href, done: done.has(s.key) }));
  const state: GuideState = { active: !rewardPaid && !expired, startedAt, steps, rewardPaid };
  if (!state.active) return state;

  if (steps.every((s) => s.done)) {
    const team = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>()
      .catch((e) => { logger.warn({ module: M, teamId }, "herní datum pro odměnu", e); return null; });
    // Výplata jednou dávkou: zápis transakce jen když ještě není, rozpočet jen když zápis vznikl.
    // Dvě souběžná načtení karty tak odměnu nevyplatí dvakrát.
    const txId = crypto.randomUUID();
    const paid = await db.batch([
      db.prepare(
        `INSERT INTO transactions (id, team_id, type, amount, balance_after, description, reference_id, game_date)
         SELECT ?1, ?2, 'other', ?3, (SELECT budget FROM teams WHERE id = ?2) + ?3, 'Starosta obce: odměna za rozjezd klubu', ?4, ?5
          WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE reference_id = ?4)`,
      ).bind(txId, teamId, GUIDE_REWARD, rewardRef(teamId), team?.game_date ?? now.toISOString()),
      db.prepare("UPDATE teams SET budget = budget + ?1 WHERE id = ?2 AND EXISTS (SELECT 1 FROM transactions WHERE id = ?3)")
        .bind(GUIDE_REWARD, teamId, txId),
    ]).catch((e) => { logger.error({ module: M, teamId }, "odměna průvodce", e); return null; });
    if (!paid || (paid[0]?.meta?.changes ?? 0) !== 1) return { ...state, active: false, rewardPaid: !!paid };
    await sendSystemSMS(db, teamId, GUIDE_SENDER,
      `Trenére, to byl rozjezd! Starosta to viděl a posílá do klubové kasy ${GUIDE_REWARD.toLocaleString("cs-CZ")} Kč. Tak ať se daří.`,
      { type: "guide", step: "done" });
    return { ...state, active: false, rewardPaid: true };
  }

  // Další úkol: první nesplněný, který kapitán ještě nenapsal.
  const sentKeys = new Set(sent.map((s) => s.step));
  const next = GUIDE_STEPS.find((s) => !done.has(s.key) && !sentKeys.has(s.key));
  if (!next) return state;
  const lastSent = sent[sent.length - 1];
  const lastStepDone = done.has(lastSent.step as GuideStepKey);
  const waitedEnough = now.getTime() - new Date(lastSent.sentAt).getTime() >= NEXT_STEP_AFTER_HOURS * 3_600_000;
  if (lastStepDone || waitedEnough) await sendStep(db, teamId, next);
  return state;
}

/** Hodinový cron: posune průvodce všem klubům, kterým běží. */
export async function advanceAllFirstWeekGuides(db: D1Database, now: Date = new Date(), kv?: KVNamespace): Promise<number> {
  const rows = await db.prepare(
    `SELECT DISTINCT c.team_id FROM conversations c JOIN messages m ON m.conversation_id = c.id
      WHERE c.type = 'system' AND c.title = ? AND json_extract(m.metadata, '$.type') = 'guide'
        AND m.sent_at >= ?`,
  ).bind(GUIDE_SENDER, new Date(now.getTime() - GUIDE_DAYS * 86_400_000).toISOString()).all<{ team_id: string }>()
    .catch((e) => { logger.warn({ module: M }, "kluby s průvodcem", e); return { results: [] as Array<{ team_id: string }> }; });
  for (const r of rows.results) {
    await advanceFirstWeekGuide(db, r.team_id, now, kv).catch((e) => logger.warn({ module: M, teamId: r.team_id }, "posun průvodce", e));
  }
  return rows.results.length;
}
