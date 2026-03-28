import type { Metadata } from "next";
import { Outfit, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import { TeamProvider } from "@/context/team-context";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
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
  title: "Prales \u2014 Fotbalov\u00FD Mana\u017Eer",
  description: "Online fotbalov\u00FD mana\u017Eer z \u010Desk\u00E9ho okresu. Postav si t\u00FDm, \u0159e\u0161 kocoviny a p\u0159\u00EDbuzensk\u00E9 vazby, vyhraj okresn\u00ED p\u0159ebor.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: {
    siteName: "Prales FM",
    locale: "cs_CZ",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs" className={`${outfit.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#153615" />
      </head>
      <body className="min-h-screen"><TeamProvider>{children}</TeamProvider></body>
    </html>
  );
}
