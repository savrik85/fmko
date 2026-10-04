"use client";

/**
 * Jednání s cizími kluby v Přestupy → Nabídky. Data si načítá samo, aby stránka Přestupů
 * nemusela řešit další zdroj.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { SectionLabel, PositionBadge } from "@/components/ui";
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

function stateLine(n: AiNegotiationSummary): { text: string; tone: string } {
  if (n.status === "agreed") return { text: "Klub souhlasí, podepiš", tone: "text-pitch-600" };
  if (n.status === "open" && n.waiting) return { text: "Klub si to rozmýšlí", tone: "text-muted" };
  if (n.status === "open" && n.onTurn) return { text: "Klub odpověděl, jsi na tahu", tone: "text-gold-600" };
  return { text: AI_NEGOTIATION_STATUS_LABELS[n.status], tone: "text-muted" };
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
    <div>
      <SectionLabel>{view === "active" ? `Jednání s cizími kluby (${items.length})` : "Jednání s cizími kluby"}</SectionLabel>
      <div className="space-y-2">
        {items.map((n) => {
          const s = stateLine(n);
          return (
            <Link key={n.id} href={`/prestupy/jednani/${n.id}`} className={`card p-3 flex items-center gap-3 hover:bg-pitch-50/40 transition-colors ${n.onTurn ? "ring-2 ring-gold-300/60" : ""}`}>
              {Object.keys(n.avatar ?? {}).length > 0
                ? <FaceAvatar faceConfig={n.avatar} size={40} className="rounded-full shrink-0" />
                : <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-heading font-bold text-base">{n.playerName}</span>
                  {n.position && <PositionBadge position={n.position as "GK" | "DEF" | "MID" | "FWD"} />}
                  {n.age != null && <span className="text-sm text-muted">{n.age} let</span>}
                  <span className="text-sm font-heading font-bold tabular-nums">{ratingText(n.ratingLo, n.ratingHi)}</span>
                </div>
                <div className="text-sm text-muted truncate">{n.clubName}{n.clubCity ? `, ${n.clubCity}` : ""} · {formatTermsSummary(n.terms)}</div>
                <div className={`text-sm font-heading font-bold ${s.tone}`}>{s.text}</div>
              </div>
              <span className="text-muted shrink-0">→</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
