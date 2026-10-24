"use client";

import "./globals.css";
import { fontVariables } from "./fonts";
import { AppErrorPanel } from "@/components/app-error-panel";

/**
 * Chyba v kořenovém layoutu nebo na stránce mimo herní obal (přihlášení, zápasový den,
 * konec sezóny…). Nahrazuje celý kořenový layout, proto má vlastní <html> a <body>
 * a sama si načte styly a písma.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="cs" className={fontVariables}>
      <body>
        <main className="min-h-dvh bg-paper flex items-center justify-center p-4">
          <AppErrorPanel error={error} boundary="global" showHomeLink />
        </main>
      </body>
    </html>
  );
}
