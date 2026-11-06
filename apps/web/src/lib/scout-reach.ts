/**
 * Co skaut říká o tom, kam to hráč dotáhne, stejně jako jeho SMS (api: scouting/report-text.ts
 * reachPhrase). Mladý do 24: rozpětí. Dospělý: kolik ještě přidá (strop má stejnou chybu skauta
 * jako hodnocení, takže rozdíl horních hranic je přírůstek), nebo že spíš drží.
 */
export function scoutReach(age: number | null, ratingHi: number | null, potentialLo: number, potentialHi: number | null): { value: string; label: string; sentence: string } {
  const hi = potentialHi ?? potentialLo;
  if (age == null || age <= 24 || ratingHi == null) {
    const value = potentialLo === hi ? `${hi}` : `${potentialLo}–${hi}`;
    return { value, label: "ještě poroste", sentence: `dotáhne to na ${value}` };
  }
  const gain = hi - ratingHi;
  if (gain <= 2) return { value: "drží", label: "nahoru už moc nepůjde", sentence: "nahoru už moc nepůjde" };
  const points = gain < 5 ? "body" : "bodů";
  return { value: `+${gain}`, label: `ještě přidá ${points}`, sentence: `ještě přidá asi ${gain} ${points}` };
}
