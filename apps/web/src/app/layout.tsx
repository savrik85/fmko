import type { Metadata } from "next";
import { Inter, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import { TeamProvider } from "@/context/team-context";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-heading",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-commentary",
});

export const metadata: Metadata = {
  title: "Okresní Mašina — Fotbalový Manažer",
  description: "Online fotbalový manažer z českého okresu",
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
  themeColor: "#2D5F2D",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs" className={`${inter.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen"><TeamProvider>{children}</TeamProvider></body>
    </html>
  );
}
