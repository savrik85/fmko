/**
 * Jak tvrdý je sazebník a co na něj řekne kapitán (spec bod 2 a 4).
 *
 * Odhad zátěže vychází z toho, jak často se prohřešky na produ dějí (`weeklyRatePerPlayer`),
 * a z kapsy slabšího hráče kádru (učeň, student, hráč s malou odměnou). Kapitánův verdikt
 * určuje kód, model jen píše text SMS.
 */

import {
  fineCzkEquivalent, fineItemDef,
  type FineRepeatMode, type FineScheduleItemInput,
} from "@okresni-masina/shared";

/** Kapsa slabšího hráče kádru (Kč týdně), proti které se tvrdost měří. */
export const WEAK_POCKET_CZK = 450;

const REPEAT_FACTOR: Record<FineRepeatMode, number> = { flat: 1, double_from_second: 1.35, first_free: 0.8 };

export interface ItemHarshness {
  index: number;
  /** Odhad korun za 4 týdny pro průměrného hráče. */
  cost4w: number;
  /** Kolik navíc položka štve kvůli podmínce (0 = rozumná). */
  trap: number;
  score: number;
}

export interface ScheduleHarshness {
  items: ItemHarshness[];
  /** Odhad zátěže slabšího hráče (podíl týdenní kapsy za 4 týdny). */
  expectedBurden: number;
  trapScore: number;
  score: number;
}

export function scheduleHarshness(items: readonly FineScheduleItemInput[]): ScheduleHarshness {
  const per: ItemHarshness[] = items.map((it, index) => {
    const def = fineItemDef(it.itemKey);
    const cond = def?.conditions.find((c) => c.key === it.conditionKey);
    const rate = def?.weeklyRatePerPlayer[it.conditionKey] ?? 0;
    const czk = fineCzkEquivalent(it.valueKind, it.amountCzk);
    const cost4w = rate * 4 * czk * REPEAT_FACTOR[it.repeatMode];
    // Basa nebo 500 Kč za jeden prohřešek je tvrdost sama o sobě, i když se stává zřídka.
    const steep = czk >= 500 ? 0.35 : czk >= 200 ? 0.12 : 0;
    const trap = Math.max(0, (cond?.harshness ?? 1) - 1) + steep;
    return { index, cost4w, trap, score: (cost4w / WEAK_POCKET_CZK) * 2 + trap * 0.6 };
  });
  const cost = per.reduce((s, i) => s + i.cost4w, 0);
  const expectedBurden = cost / WEAK_POCKET_CZK;
  const trapScore = per.reduce((s, i) => s + i.trap, 0);
  const crowd = items.length > 4 ? 0.15 * (items.length - 4) : 0;
  return { items: per, expectedBurden, trapScore, score: expectedBurden * 2 + trapScore * 0.6 + crowd };
}

export type CaptainVerdict = "approved" | "reservation" | "rejected";

export interface CaptainInput {
  coachRelationship: number;
  temper: number;
  discipline: number;
  alcohol: number;
  leadership: number;
}

export interface CaptainDecision {
  verdict: CaptainVerdict;
  /** U výhrady (a odmítnutí) položka, která kapitánovi vadí nejvíc. */
  objectionIndex: number | null;
  /** Kapitán hájí sám sebe (flaká nebo chodí do hospody a sazebník na to míří). */
  selfInterest: boolean;
  score: number;
}

const APPROVE_BELOW = 0.6;
const RESERVATION_BELOW = 1.3;

export function captainDecision(items: readonly FineScheduleItemInput[], captain: CaptainInput): CaptainDecision {
  const h = scheduleHarshness(items);
  let score = h.score;
  // Vztah k trenérovi a povaha: věrný kapitán snese víc, prchlivý míň.
  score += -(captain.coachRelationship - 50) / 120 + (captain.temper - 50) / 160;
  // Kapitán, který sám flaká nebo pije, hájí právě tyhle položky.
  const selfIdx = items.findIndex((it) =>
    (it.itemKey === "training_missed" && (it.conditionKey === "pub" || it.conditionKey === "unexcused") && captain.alcohol >= 65)
    || (it.itemKey === "pub_before_match" && captain.alcohol >= 65)
    || (it.itemKey === "training_missed" && it.conditionKey === "slacking" && captain.discipline < 35));
  const selfInterest = selfIdx >= 0;
  if (selfInterest) score += 0.6;
  score = Math.max(0, score);

  const worst = h.items.reduce<ItemHarshness | null>((w, i) => (!w || i.score > w.score ? i : w), null);
  const objectionIndex = selfInterest ? selfIdx : worst && worst.score > 0.05 ? worst.index : null;
  if (score < APPROVE_BELOW) return { verdict: "approved", objectionIndex: null, selfInterest: false, score };
  if (score < RESERVATION_BELOW && objectionIndex !== null) return { verdict: "reservation", objectionIndex, selfInterest, score };
  return { verdict: "rejected", objectionIndex, selfInterest, score };
}

/** Nový sazebník je mírnější (nebo stejný) než starý: zmírnění kapitánův souhlas nepotřebuje. */
export function isSoftening(next: readonly FineScheduleItemInput[], current: readonly FineScheduleItemInput[]): boolean {
  if (current.length === 0) return next.length === 0;
  return scheduleHarshness(next).score <= scheduleHarshness(current).score + 1e-9
    && next.every((n) => current.some((c) => c.itemKey === n.itemKey && c.conditionKey === n.conditionKey));
}
