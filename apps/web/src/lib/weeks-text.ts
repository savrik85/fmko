/** Počet týdnů slovy ve 4. pádu po předložce „za": 1 týden, 2 týdny, 5 týdnů. */
export function weeksText(weeks: number): string {
  if (weeks === 1) return "1 týden";
  if (weeks >= 2 && weeks <= 4) return `${weeks} týdny`;
  return `${weeks} týdnů`;
}
