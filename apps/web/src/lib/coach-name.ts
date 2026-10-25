/**
 * Jméno trenéra jako prostý text (popisek grafu, meta popis stránky).
 *
 * AI klub se od lidského klubu liší jen odznakem u jména trenéra. Kde se dá vykreslit prvek,
 * patří tam `CoachName` (components/manager/coach-name.tsx): robot v rámečku, který si nikdo
 * nenapíše do jména. Tady, kde je jen text, zůstane robot jako znak. Do jména v databázi se
 * nikdy nezapisuje, přidává se při zobrazení podle příznaku z API (`coachIsAi`).
 */

const AI_COACH_MARK = "🤖";

export function coachDisplayName(name: string, isAi: boolean): string {
  const trimmed = name.trim();
  if (!isAi || !trimmed || trimmed.endsWith(AI_COACH_MARK)) return trimmed;
  return `${trimmed} ${AI_COACH_MARK}`;
}
