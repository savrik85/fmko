/** Vlajka dle národnosti hráče (vč. 🇨🇿 pro Čechy). */
const FLAGS: Record<string, string> = {
  CZ: "🇨🇿",
  SK: "🇸🇰",
  UA: "🇺🇦",
  PL: "🇵🇱",
  DE: "🇩🇪",
  AT: "🇦🇹",
  VN: "🇻🇳",
};

export function nationalityFlag(code?: string | null): string {
  return FLAGS[code || "CZ"] ?? "🇨🇿";
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
