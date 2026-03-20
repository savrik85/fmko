import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Okresní Mašina — Fotbalový Manažer",
  description: "Online fotbalový manažer z českého okresu",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
