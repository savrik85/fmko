/** Majitelé firem: české popisky povah a náklonnosti. Klíče drží API (apps/api/src/sponsors/owners.ts). */
const PERSONALITY_LABELS: Record<string, string> = {
  patriot: "Patriot",
  businessman: "Obchodník",
  fan: "Fanoušek",
  cautious: "Opatrný",
};

const PERSONALITY_HINTS: Record<string, string> = {
  patriot: "Fandí místnímu klubu, chce vidět mladé hráče a klid na tribunách.",
  businessman: "Počítá s každou korunou, chce plný stadion a být vidět.",
  fan: "Žije výsledky. Na klub v krizi nepřijde.",
  cautious: "Nesnáší riziko a skandály, chce jistotu.",
};

export function personalityLabel(p: string): string {
  return PERSONALITY_LABELS[p] ?? "Neznámá povaha";
}

export function personalityHint(p: string): string {
  return PERSONALITY_HINTS[p] ?? "";
}

export function favorLabel(f: number): string {
  if (f >= 80) return "Fandí vám";
  if (f >= 60) return "Příznivý";
  if (f >= 40) return "Neutrální";
  if (f >= 20) return "Chladný";
  return "Nemá vás rád";
}

export function formatCZK(v: number): string {
  return v.toLocaleString("cs") + " Kč";
}
