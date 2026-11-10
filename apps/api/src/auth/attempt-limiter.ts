/**
 * Počítadla pokusů (přihlášení, registrace) v D1, tabulka `rate_limit_counters` (migrace 0295).
 *
 * Přičtení je jeden atomický upsert s RETURNING, takže souběžné pokusy se nepřepíšou
 * (v KV to šlo: čtení a zápis byly dva kroky). Pokus se připisuje PŘED ověřením hesla.
 * Když zápis selže, volající pokus odmítne: bez počítadla by se dalo hádat bez omezení.
 * V klíči je otisk, ne samotný e-mail nebo adresa.
 */

export const LOGIN_WINDOW_SECONDS = 15 * 60;
export const REGISTRATION_WINDOW_SECONDS = 60 * 60;
/** Nejvýš tolik registrací za hodinu z jedné adresy. */
export const REGISTRATION_IP_MAX = 5;
const LONGEST_WINDOW_SECONDS = Math.max(LOGIN_WINDOW_SECONDS, REGISTRATION_WINDOW_SECONDS);
/** Tvrdý blok: pokusy na jeden e-mail z jedné adresy. Cizí člověk tím majiteli účet nezamkne. */
export const LOGIN_PAIR_MAX = 10;
/** Tvrdý blok na adresu: za jednou IP sedí celá domácnost nebo mobilní síť. */
export const LOGIN_IP_MAX = 20;
/**
 * Pokusy na jeden e-mail ze všech adres dohromady (hádání rozložené přes mnoho IP).
 * Nad prahem projde jen adresa, která na ten e-mail v okně ještě nezkoušela: majitel
 * se správným heslem se tak přihlásí, i když na jeho účet někdo útočí.
 */
export const LOGIN_EMAIL_MAX = 50;
/** Nad tímhle počtem pokusů na e-mail v okně se odmítá každý pokus, i z nové adresy. */
export const LOGIN_EMAIL_HARD_MAX = 300;
/** Požadavek bez hlavičky s adresou (mimo Cloudflare) se počítá do společného koše. */
export const UNKNOWN_IP = "unknown";

async function fingerprint(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function counterKey(scope: string, subject: string): Promise<string> {
  return `${scope}:${await fingerprint(subject)}`;
}

/**
 * Připíše pokus ke každému klíči a vrátí nové stavy. Okno začíná prvním pokusem,
 * po jeho uplynutí se počítá znovu od jedné. Jeden dotaz pro všechny klíče.
 * Chybu databáze nechává vyletět: volající musí pokus odmítnout.
 */
export async function bumpCounters(
  db: D1Database,
  keys: string[],
  windowSeconds: number,
  nowMs = Date.now(),
): Promise<Map<string, number>> {
  const now = Math.floor(nowMs / 1000);
  const cutoff = now - windowSeconds;
  const values = keys.map(() => "(?, 1, ?)").join(", ");
  const params: Array<string | number> = [];
  for (const key of keys) params.push(key, now);
  const rows = await db.prepare(
    `INSERT INTO rate_limit_counters (key, count, window_start) VALUES ${values}
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limit_counters.window_start <= ? THEN 1 ELSE rate_limit_counters.count + 1 END,
       window_start = CASE WHEN rate_limit_counters.window_start <= ? THEN excluded.window_start ELSE rate_limit_counters.window_start END
     RETURNING key, count`,
  ).bind(...params, cutoff, cutoff).all<{ key: string; count: number }>();
  const counts = new Map(rows.results.map((row) => [row.key, row.count]));
  // Bez vrácených řádků se nedá věřit, že se pokus připsal.
  for (const key of keys) {
    if (!counts.has(key)) throw new Error("počítadlo pokusů nevrátilo stav");
  }
  return counts;
}

export interface LoginCounterKeys {
  pair: string;
  ip: string;
  email: string;
}

/**
 * Adresa pro počítadla. U IPv6 jen prvních 64 bitů: jeden zákazník dostává celý rozsah /64
 * a střídáním adres v něm by každému pokusu vyšlo čerstvé počítadlo.
 */
export function normalizeClientAddress(ip: string): string {
  const value = ip.trim().toLowerCase();
  if (!value.includes(":")) return value;
  const [head, tail = ""] = value.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const missing = value.includes("::") ? Math.max(0, 8 - headGroups.length - tailGroups.length) : 0;
  const groups = [...headGroups, ...Array<string>(missing).fill("0"), ...tailGroups].slice(0, 4);
  return `${groups.map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

export async function loginCounterKeys(email: string, rawIp: string): Promise<LoginCounterKeys> {
  const ip = normalizeClientAddress(rawIp);
  return {
    pair: await counterKey("login-pair", `${email}|${ip}`),
    ip: await counterKey("login-ip", ip),
    email: await counterKey("login-email", email),
  };
}

export type LoginGate =
  /** Pokus smí k ověření hesla. */
  | { verdict: "verify" }
  | { verdict: "blocked" };

/**
 * Rozhodne z čerstvě připsaných stavů. Počítá se i právě běžící pokus,
 * proto „víc než“: desátý pokus ještě projde, jedenáctý ne.
 */
export function judgeLogin(counts: { pair: number; ip: number; email: number }): LoginGate {
  if (counts.pair > LOGIN_PAIR_MAX || counts.ip > LOGIN_IP_MAX) return { verdict: "blocked" };
  // Na e-mail se útočí z mnoha adres: dál smí jen adresa bez dřívějšího pokusu v okně.
  if (counts.email > LOGIN_EMAIL_MAX && counts.pair > 1) return { verdict: "blocked" };
  // Tvrdý strop na e-mail bez ohledu na adresu: rozložené hádání z mnoha adres, kde je
  // každá „nová“, by jinak mělo jeden pokus na adresu donekonečna.
  if (counts.email > LOGIN_EMAIL_HARD_MAX) return { verdict: "blocked" };
  return { verdict: "verify" };
}

/**
 * Po úspěšném přihlášení: dvojice (e-mail, adresa) začíná od nuly, adrese se úspěšný
 * pokus odečte (jinak by se domácnost zamkla samými správnými přihlášeními) a při té
 * příležitosti se uklidí prošlá okna. Celkové počítadlo e-mailu se nenuluje, útok na
 * účet neskončil tím, že se majitel přihlásil.
 */
export async function settleSuccessfulLogin(
  db: D1Database,
  keys: LoginCounterKeys,
  nowMs = Date.now(),
): Promise<void> {
  // Tabulku sdílí i hodinové okno registrací, proto se maže až to, co je starší než nejdelší okno.
  const staleBefore = Math.floor(nowMs / 1000) - LONGEST_WINDOW_SECONDS;
  await db.batch([
    db.prepare("DELETE FROM rate_limit_counters WHERE key = ? OR window_start <= ?").bind(keys.pair, staleBefore),
    db.prepare("UPDATE rate_limit_counters SET count = MAX(count - 1, 0) WHERE key = ?").bind(keys.ip),
  ]);
}
