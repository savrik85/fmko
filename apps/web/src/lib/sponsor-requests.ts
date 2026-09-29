/** Prosba o příspěvek u majitele firmy (přes SMS): přehled pro kartu majitele. */

export type RequestPurpose = "coach" | "transfer" | "equipment" | "stadium" | "youth";
export type RequestRefusal = "broken" | "too_soon" | "dislike" | "stranger" | "exhausted";

export interface RequestInfo {
  owner: { name: string; firmName: string; faceConfig: Record<string, unknown> };
  favor: number;
  relation: "main" | "stadium" | "banner" | "none";
  given: number;
  block: RequestRefusal | null;
  nextAskDay: string | null;
  purposes: Array<{ purpose: RequestPurpose; label: string; estimate: { low: number; high: number } | null }>;
  obligations: Array<{ id: string; purpose: RequestPurpose; label: string; granted: number; required: number; spent: number; checkDay: string }>;
  history: Array<{ purpose: RequestPurpose; label: string; asked: number; granted: number; status: string; day: string }>;
  minAsk: number;
}

/** Herní den YYYY-MM-DD jako „11. 12.". */
export function dayMonth(day: string): string {
  const [, m, d] = day.slice(0, 10).split("-").map(Number);
  return `${d}. ${m}.`;
}

/** Proč teď nejde požádat (ještě před odesláním). */
export function blockText(info: RequestInfo): string | null {
  switch (info.block) {
    case "broken": return "Minule šly jeho peníze jinam, než jsi slíbil. Letos ti už nedá nic.";
    case "too_soon": return info.nextAskDay
      ? `Nedávno jsi ho prosil. Znovu to zkus od ${dayMonth(info.nextAskDay)}, dřív by ho to naštvalo.`
      : "Nedávno jsi ho prosil. Dřívější prosba by ho naštvala.";
    case "dislike": return "Nemá tě v lásce. Než ho poprosíš o peníze, zlepši vztah.";
    case "stranger": return "Nejsi jeho klub a moc se neznáte. Bez smlouvy dá jen tomu, koho má hodně rád.";
    default: return null;
  }
}

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  refused: "odmítl",
  granted: "čeká na útratu",
  kept: "dodrženo",
  broken: "nedodrženo",
  lapsed: "propadlo",
};
