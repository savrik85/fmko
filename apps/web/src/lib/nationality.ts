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
