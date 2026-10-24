"use client";

import { AppErrorPanel } from "@/components/app-error-panel";

/**
 * Chyba na stránce hry. Horní lišta, menu i spodní navigace zůstávají, takže se dá
 * odejít jinam; karta nabídne načíst stránku znovu (po nasazení to udělá sama).
 */
export default function GameError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="page-container">
      <div className="pt-4 sm:pt-10">
        <AppErrorPanel error={error} boundary="game" />
      </div>
    </div>
  );
}
