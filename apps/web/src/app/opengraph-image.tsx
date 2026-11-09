import { OG_SIZE, ogCard } from "@/lib/og-card";

export const runtime = "edge";
export const alt = "Prales: fotbalový manažer z českého okresu";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({
    eyebrow: "FOTBALOVÝ MANAŽER",
    title: ["Vedl bys to líp"],
    accent: "než váš trenér?",
    footer: "Okresní liga ze skutečných obcí. Zdarma, v mobilu.",
  });
}
