/**
 * Tón odpovědi v rozhovoru.
 *
 * Trenér ke každé odpovědi vybere, jak ji myslí. Redaktor (Gemini) to dostane
 * u odpovědi do promptu — hlavně kvůli ironii a nadsázce, které by jinak bral
 * doslova a pochvalu sudího myšlenou jako rýpnutí by zapsal jako obhajobu.
 */

export const ANSWER_TONES = ["normalni", "nadsazka", "ironie", "nastvane", "pokorne"] as const;
export type AnswerTone = (typeof ANSWER_TONES)[number];

const HINT: Record<AnswerTone, string> = {
  normalni: "normálně, bez zvláštního podtónu",
  nadsazka: "s nadsázkou, žertem — přehánění ber jako legraci, ne jako doslovné tvrzení",
  ironie: "ironicky — myslí opak toho, co doslova říká (pochvala je rýpnutí, souhlas je výsměch)",
  nastvane: "naštvaně, podrážděně — je z toho rozladěný, i když to slovy třeba nedává najevo",
  pokorne: "pokorně, skromně — nechce se vytahovat ani nikoho shazovat",
};

/** Doplní chybějící a neznámé tóny na „normální", délka odpovídá počtu odpovědí. */
export function normalizeTones(raw: unknown, count: number): AnswerTone[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: count }, (_, i) =>
    (ANSWER_TONES as readonly string[]).includes(arr[i]) ? (arr[i] as AnswerTone) : "normalni");
}

export function parseStoredTones(json: string | null | undefined, count: number): AnswerTone[] {
  if (!json) return normalizeTones(null, count);
  try { return normalizeTones(JSON.parse(json), count); } catch { return normalizeTones(null, count); }
}

/** Řádek do promptu k odpovědi. U normálního tónu nic, ať prompt zbytečně nebobtná. */
export function toneLine(tone: AnswerTone | undefined): string {
  return tone && tone !== "normalni" ? `TÓN ODPOVĚDI (zvolil sám trenér): ${HINT[tone]}` : "";
}

/** Společný pokyn pro redaktora, přidá se jen když aspoň jedna odpověď má jiný tón. */
export function tonePromptRule(tones: AnswerTone[]): string {
  if (!tones.some((t) => t !== "normalni")) return "";
  return `U některých odpovědí trenér sám označil, jakým tónem je myslí (TÓN ODPOVĚDI). Čti je podle toho:
ironii ber jako ironii, nadsázku jako legraci, naštvání jako naštvání. V článku to čtenáři dej najevo
(„s úšklebkem dodal", „se smíchem přiznal", „rozladěně odsekl"), ať citát nevyzní obráceně.
Obsah odpovědi tím nevymýšlej — tón jen říká, jak slova myslel.`;
}

/**
 * Lexikon čte slova doslova. U ironické odpovědi je „pískal dobře" rýpnutí,
 * takže lexikální obhajoba se obrací na mírnou kritiku. Opačně to neplatí:
 * „sudí je zloděj" s cedulkou ironie zůstává kritikou, jinak by šlo tónem
 * obejít pokutu.
 */
export function lexiconWithTone<T extends { postoj: "kritika" | "neutral" | "obhajoba"; sila: number }>(
  lexicon: T,
  tone: AnswerTone | undefined,
): T {
  if (tone === "ironie" && lexicon.postoj === "obhajoba") {
    return { ...lexicon, postoj: "kritika", sila: Math.min(2, lexicon.sila) };
  }
  return lexicon;
}
