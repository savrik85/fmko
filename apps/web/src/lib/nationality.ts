/** Vlajka dle národnosti hráče. Pro Čechy (CZ) vrací prázdno — vlaječku ukazujeme jen u cizinců. */
const FLAGS: Record<string, string> = {
  SK: "🇸🇰",
  UA: "🇺🇦",
  PL: "🇵🇱",
  DE: "🇩🇪",
  AT: "🇦🇹",
  VN: "🇻🇳",
};

export function nationalityFlag(code?: string | null): string {
  if (!code || code === "CZ") return "";
  return FLAGS[code] ?? "";
}

const LABELS: Record<string, string> = {
  CZ: "🇨🇿 Česko",
  SK: "🇸🇰 Slovensko",
  UA: "🇺🇦 Ukrajina",
  PL: "🇵🇱 Polsko",
  DE: "🇩🇪 Německo",
  AT: "🇦🇹 Rakousko",
  VN: "🇻🇳 Vietnam",
};

/** Vlajka + název pro profil hráče (pro Čechy vrací "🇨🇿 Česko"). */
export function nationalityLabel(code?: string | null): string {
  return LABELS[code || "CZ"] ?? "🇨🇿 Česko";
}
