import { OG_SIZE, ogCard } from "@/lib/og-card";

export const runtime = "edge";
export const alt = "Prales: registrace a založení klubu";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({
    eyebrow: "REGISTRACE",
    title: ["Založ si klub"],
    accent: "ve svém okrese.",
    footer: "Jméno, e-mail, heslo a jdeš na hřiště.",
  });
}
