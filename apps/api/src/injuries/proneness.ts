/**
 * Náchylnost ke zraněním (0–100) z JSON sloupců hráče.
 *
 * Generátor ji ukládá do `physical` (`generators/create-player.ts`), několik míst ji ale
 * četlo z `personality`, kde u žádného hráče není, a všem tak dosadilo 50. Tréninková
 * zranění a zdravotní absence pak náchylnost ignorovaly, i když ji profil hráče ukazuje.
 * `personality` zůstává jako záloha pro případ starého záznamu.
 */
export function injuryPronenessOf(
  physical: Record<string, unknown> | null | undefined,
  personality?: Record<string, unknown> | null,
): number {
  const fromPhysical = physical?.injuryProneness;
  if (typeof fromPhysical === "number") return fromPhysical;
  const fromPersonality = personality?.injuryProneness;
  if (typeof fromPersonality === "number") return fromPersonality;
  return 50;
}
