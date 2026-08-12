import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { TeamProvider } from "@/context/team-context";
import { PushNotificationManager } from "@/components/PushNotificationManager";
import { ErrorDialogProvider } from "@/components/ui";
import "./globals.css";

// Fonty leží v repozitáři, ne na Google Fonts. Build na CI dvakrát spadl na tom,
// že si je next/font/google nestihl stáhnout — teď na síti nezávisí.
// Soubory jsou přímo ty z Google Fonts (latin + latin-ext), a to po statických
// řezech — ne variabilní. Stránka na spoustě míst používá font-weight 450;
// statické řezy ho zaokrouhlí na 400 stejně jako dřív, kdežto variabilní font
// by 450 vykreslil doopravdy a všechen text by ztloustl.

const outfit = localFont({
  src: [
    { path: "../fonts/outfit-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/outfit-latin-ext-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/outfit-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/outfit-latin-ext-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/outfit-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/outfit-latin-ext-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/outfit-latin-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/outfit-latin-ext-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-body",
  display: "block",
  fallback: ["ui-sans-serif", "sans-serif"],
});

const barlowCondensed = localFont({
  src: [
    { path: "../fonts/barlow-condensed-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/barlow-condensed-latin-ext-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/barlow-condensed-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/barlow-condensed-latin-ext-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/barlow-condensed-latin-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/barlow-condensed-latin-ext-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/barlow-condensed-latin-800.woff2", weight: "800", style: "normal" },
    { path: "../fonts/barlow-condensed-latin-ext-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-heading",
  display: "block",
  fallback: ["Impact", "ui-sans-serif", "sans-serif"],
});

const jetbrainsMono = localFont({
  src: [
    { path: "../fonts/jetbrains-mono-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/jetbrains-mono-latin-ext-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/jetbrains-mono-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/jetbrains-mono-latin-ext-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-commentary",
  display: "block",
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: "Prales — Fotbalový Manažer",
  description: "Online fotbalový manažer z českého okresu. Postav si tým, vyhraj okresní přebor.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: {
    siteName: "Prales FM",
    locale: "cs_CZ",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#153615",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs" className={`${outfit.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Prales FM" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="min-h-dvh">
        <TeamProvider>{children}</TeamProvider>
        <PushNotificationManager />
        <ErrorDialogProvider />
      </body>
    </html>
  );
}
