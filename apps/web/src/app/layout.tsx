import type { Metadata, Viewport } from "next";
import { TeamProvider } from "@/context/team-context";
import { PushNotificationManager } from "@/components/PushNotificationManager";
import { ErrorDialogProvider } from "@/components/ui";
import { PostHogProvider } from "@/components/analytics/PostHogProvider";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prales. Fotbalový Manažer",
  description: "Online fotbalový manažer z českého okresu. Postav si tým, vyhraj okresní přebor.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: {
    siteName: "Prales",
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
    <html lang="cs" className={fontVariables}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* Neprůhledný stavový řádek. S `black-translucent` počítá iOS 26 okno
            nainstalované aplikace o výšku výřezu kratší (pod spodní lištou zbylo
            62 px prázdna) a přes horní okraj kreslí rozmazání; CSS to neobejde
            (zkoušeno 2026-11-17). iOS čte tuhle značku jen při přidání na plochu,
            starší instalace zůstávají průhledné, dokud se nepřidají znovu. */}
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Prales" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      {/* Bez min-h-dvh: výšku má body z globals.css a třída by mu navíc přidala
          safe-area odsazení, které si aplikační obal uvnitř řeší sám. Součet
          obojího dělal dokument vyšší než obrazovka a horní lišta odscrollovala. */}
      <body>
        <PostHogProvider>
          <TeamProvider>{children}</TeamProvider>
          <PushNotificationManager />
          <ErrorDialogProvider />
        </PostHogProvider>
      </body>
    </html>
  );
}
