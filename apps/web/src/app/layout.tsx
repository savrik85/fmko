import type { Metadata } from "next";
import { DM_Sans, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import { TeamProvider } from "@/context/team-context";
import "./globals.css";

const dmSans = DM_Sans({
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
  title: "Prales — Fotbalový Manažer",
  description: "Online fotbalový manažer z českého okresu",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs" className={`${dmSans.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#153615" />
      </head>
      <body className="min-h-screen"><TeamProvider>{children}</TeamProvider></body>
    </html>
  );
}
