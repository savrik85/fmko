"use client";

/**
 * Jednání s cizími kluby v Přestupy → Nabídky. Data si načítá samo, aby stránka Přestupů
 * nemusela řešit další zdroj.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PositionBadge, ListCard, ListRow, StatusChip } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { ratingText } from "@/components/scouting/WillingnessBadge";
import { AI_NEGOTIATION_STATUS_LABELS, formatTermsSummary, type AiNegotiationStatus, type TransferTerms } from "@okresni-masina/shared";

export interface AiNegotiationSummary {
  id: string;
  status: AiNegotiationStatus;
  source: "listing" | "scout_report";
  playerName: string;
  position: string | null;
  age: number | null;
  avatar: Record<string, unknown>;
  ratingLo: number | null;
  ratingHi: number | null;
  clubName: string;
  clubCity: string | null;
  terms: TransferTerms;
  lastActionBy: "buyer" | "club";
  waiting: boolean;
  onTurn: boolean;
  resolvedAt: string | null;
}

/** Stav jednání jako krátký štítek vpravo v řádku; celá věta je v bublině. */
function stateChip(n: AiNegotiationSummary): { label: string; text: string; tone: "ok" | "warn" | "neutral" } {
  if (n.status === "agreed") return { label: "Podepiš", text: "Klub souhlasí, podepiš", tone: "ok" };
  if (n.status === "open" && n.waiting) return { label: "Rozmýšlí si to", text: "Klub si to rozmýšlí", tone: "neutral" };
  if (n.status === "open" && n.onTurn) return { label: "Jsi na tahu", text: "Klub odpověděl, jsi na tahu", tone: "warn" };
  const label = AI_NEGOTIATION_STATUS_LABELS[n.status];
  return { label, text: label, tone: "neutral" };
}

export function AiNegotiationsList({ teamId, view }: { teamId: string | null; view: "active" | "closed" }) {
  const [data, setData] = useState<{ active: AiNegotiationSummary[]; closed: AiNegotiationSummary[] } | null>(null);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ active: AiNegotiationSummary[]; closed: AiNegotiationSummary[] }>(`/api/teams/${teamId}/negotiations`)
      .then(setData)
      .catch((e) => console.error("Načtení jednání s cizími kluby selhalo:", e));
  }, [teamId]);

  const items = view === "active" ? data?.active ?? [] : data?.closed ?? [];
  if (items.length === 0) return null;

  return (
    <ListCard title="Jednání s cizími kluby" count={view === "active" ? items.length : undefined}>
      {items.map((n) => {
        const st = stateChip(n);
        return (
          <ListRow key={n.id} href={`/prestupy/jednani/${n.id}`}
            tone={n.onTurn || n.status === "agreed" ? "new" : undefined}
            leading={Object.keys(n.avatar ?? {}).length > 0
              ? <FaceAvatar faceConfig={n.avatar} size={30} className="rounded-full" />
              : <span className="w-9 h-9 rounded-full bg-surface-3" />}
            title={<>{n.playerName}{n.position && <span className="ml-2 align-middle"><PositionBadge position={n.position as "GK" | "DEF" | "MID" | "FWD"} /></span>}</>}
            // Ukončená jednání mají stav na začátku podrobností: dlouhý štítek vpravo
            // by na telefonu zalomil jméno na dva řádky.
            meta={[st.tone === "neutral" ? st.label : null, `hod. ${ratingText(n.ratingLo, n.ratingHi)}`, n.age != null ? `${n.age} let` : null,
              `${n.clubName}${n.clubCity ? `, ${n.clubCity}` : ""}`, formatTermsSummary(n.terms)].filter(Boolean).join(" · ")}
            trailing={st.tone !== "neutral" ? <span title={st.text}><StatusChip tone={st.tone}>{st.label}</StatusChip></span> : undefined} />
        );
      })}
    </ListCard>
  );
}
