"use client";

import { useEffect } from "react";
import { pushAvailability, syncPushSubscription } from "@/lib/push";

/**
 * Registruje service worker (bez něj nefunguje ani klik na upozornění) a obnoví odběr,
 * který prohlížeč má. Dřív se existující odběr serveru neposlal vůbec, takže odběr,
 * který server smazal, se už nikdy nevrátil. O povolení tady nežádá, to jde jen kliknutím.
 */
function syncQuietly(): void {
  syncPushSubscription().catch((e) => console.warn("Obnova odběru upozornění selhala:", e));
}

export function PushNotificationManager() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .catch((e) => console.error("Registrace service workeru selhala:", e));
    if (pushAvailability() !== "supported") return;

    syncQuietly();
    // Po přihlášení se kořenový layout znovu nepřipojí; obnova proto i při návratu do aplikace.
    const onVisible = () => { if (document.visibilityState === "visible") syncQuietly(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}
