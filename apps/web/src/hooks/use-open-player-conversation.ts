"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, showError } from "@/lib/api";

/**
 * Tlačítko „💬 SMS“ u vlastního hráče: najde nebo založí konverzaci a otevře ji v Telefonu.
 *
 * Než požadavek doběhne, další klepnutí nic nepošle (rychlé klikání dřív zakládalo
 * zdvojené konverzace) a chyba se ukáže v dialogu, ne jen v konzoli. Stejně to dělá
 * adresář v Telefonu.
 */
export function useOpenPlayerConversation(teamId: string | null | undefined) {
  const router = useRouter();
  const busy = useRef(false);
  const [openingPlayerId, setOpeningPlayerId] = useState<string | null>(null);

  const open = async (playerId: string) => {
    if (!teamId || busy.current) return;
    busy.current = true;
    setOpeningPlayerId(playerId);
    try {
      const res = await apiFetch<{ conversationId: string }>(
        `/api/teams/${teamId}/player-conversation/${playerId}`,
        { method: "POST" },
      );
      // Tlačítko zůstane zamčené, dokud se stránka nepřepne na konverzaci.
      router.push(`/telefon/${res.conversationId}`);
    } catch (e) {
      console.error("otevření konverzace s hráčem:", e);
      const message = e instanceof Error && e.message && e.message !== "API error" && e.message !== "Network error"
        ? e.message
        : "Zkus to prosím znovu.";
      showError("Konverzaci se nepodařilo otevřít", message);
      busy.current = false;
      setOpeningPlayerId(null);
    }
  };

  return { open, openingPlayerId };
}
