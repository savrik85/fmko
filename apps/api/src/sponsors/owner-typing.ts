/**
 * Majitel firmy odpovídá jako hráč: chvíli trvá, než si zprávy všimne a napíše odpověď,
 * a telefon mezitím ukazuje „píše…". Telefon to pozná podle `ai_thread_state.awaiting =
 * "player"` (stejný stav jako u hráčů), proto se po dobu psaní vlákno dočasně přepne do
 * stavu `sponsor_owner_typing` a původní stav (čekající SMS majitele) se pak vrátí.
 */
import { logger } from "../lib/logger";

const TYPING_KIND = "sponsor_owner_typing";
const MIN_MS = 2_500;
const MAX_MS = 14_000;

/** Jak dlouho mu odpověď trvá: všimnout si zprávy a napsat ji (stejné meze jako u hráčů). */
export function ownerReplyDelayMs(text: string, rnd: number = Math.random()): number {
  const notice = 1_500 + rnd * 2_500;
  const typing = Math.min(9_000, 2_000 + text.length * 25);
  return Math.round(Math.min(MAX_MS, Math.max(MIN_MS, notice + typing)));
}

/**
 * Přepne vlákno do „píše…". Vrací false, když už majitel píše (druhá zpráva mezitím),
 * pak se nic dalšího nespouští.
 */
export async function claimOwnerTyping(db: D1Database, convId: string): Promise<boolean> {
  const res = await db.prepare(
    `UPDATE conversations
     SET ai_thread_state = CASE WHEN json_extract(ai_thread_state, '$.kind') = ?1
           -- Převzetí zaseklého psaní: původní stav je uložený v něm, ne psaní samo.
           THEN json_set(ai_thread_state, '$.since', strftime('%s', 'now'))
           ELSE json_object('kind', ?1, 'awaiting', 'player', 'since', strftime('%s', 'now'),
                            'prevActive', ai_thread_active, 'prevState', ai_thread_state) END,
         ai_thread_active = 1
     WHERE id = ?2 AND (COALESCE(json_extract(ai_thread_state, '$.kind'), '') != ?1
       -- Pojistka: psaní, které se nikdy nedokončilo (pád workeru), po minutě neblokuje.
       OR CAST(json_extract(ai_thread_state, '$.since') AS INTEGER) < CAST(strftime('%s', 'now') AS INTEGER) - 60)`,
  ).bind(TYPING_KIND, convId).run();
  return (res.meta?.changes ?? 0) === 1;
}

/**
 * Vrátí vláknu původní stav a řekne, jestli majitel čekal na odpověď na svou SMS.
 * Když mezitím dorazila nová SMS majitele (přepsala stav), nechá ji být.
 */
export async function releaseOwnerTyping(db: D1Database, convId: string): Promise<boolean> {
  await db.prepare(
    `UPDATE conversations
     SET ai_thread_active = COALESCE(json_extract(ai_thread_state, '$.prevActive'), 0),
         ai_thread_state = json_extract(ai_thread_state, '$.prevState')
     WHERE id = ? AND json_extract(ai_thread_state, '$.kind') = ?`,
  ).bind(convId, TYPING_KIND).run();
  const row = await db.prepare("SELECT ai_thread_active FROM conversations WHERE id = ?")
    .bind(convId).first<{ ai_thread_active: number }>();
  return row?.ai_thread_active === 1;
}

/** Čekal majitel na odpověď na svou SMS, než začal psát? (původní stav uložený v psaní) */
async function prevActive(db: D1Database, convId: string): Promise<boolean> {
  const row = await db.prepare(
    `SELECT CASE WHEN json_extract(ai_thread_state, '$.kind') = ? THEN json_extract(ai_thread_state, '$.prevActive')
                 ELSE ai_thread_active END AS active
     FROM conversations WHERE id = ?`,
  ).bind(TYPING_KIND, convId).first<{ active: number | null }>();
  return row?.active === 1;
}

/**
 * Odpověď majitele jako u hráčů: `reply` smí rovnou volat model, `pace()` před odesláním
 * dočká zbytek prodlevy (generování se do ní započítá). `release()` vrátí vláknu původní
 * stav; zavolá se vždy, nejpozději na konci.
 */
export async function replyAfterTyping(
  db: D1Database, convId: string, text: string,
  reply: (threadActive: boolean, pace: () => Promise<void>, release: () => Promise<void>) => Promise<void>,
): Promise<void> {
  const start = Date.now();
  const delay = ownerReplyDelayMs(text);
  const pace = async () => {
    const rest = delay - (Date.now() - start);
    if (rest > 0) await new Promise((r) => setTimeout(r, rest));
  };
  const release = async () => {
    await releaseOwnerTyping(db, convId)
      .catch((e) => logger.warn({ module: "owner-typing" }, `návrat stavu vlákna ${convId}`, e));
  };
  try {
    await reply(await prevActive(db, convId), pace, release);
  } finally {
    await release();
  }
}
