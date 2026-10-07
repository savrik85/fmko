import type { Player } from "@/lib/api";

/**
 * Hodnota atributu, který nemusí být v plochém `skills` — přehled a zkušenost tam u části
 * hráčů chybí, přestože do hodnocení vstupují. Dohledá se ze `skills_max` (resp. ze sloupce
 * `experience`), stejně jako to dělá přepočet hodnocení na serveru.
 */
export function attrValue(player: Player, key: "vision" | "experience"): number {
  const flat = (player.skills as Record<string, unknown> | undefined)?.[key];
  if (typeof flat === "number") return flat;

  const raw = (player as unknown as Record<string, unknown>).skills_max;
  let parsed: Record<string, unknown> | undefined;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch (e) { console.warn("parse skills_max:", e); }
  } else if (raw && typeof raw === "object") {
    parsed = raw as Record<string, unknown>;
  }
  const entry = parsed?.[key];
  if (typeof entry === "number") return entry;
  if (entry && typeof entry === "object" && typeof (entry as { current?: unknown }).current === "number") {
    return (entry as { current: number }).current;
  }

  const column = (player as unknown as Record<string, unknown>).experience;
  if (key === "experience" && typeof column === "number") return column;
  return 0;
}
