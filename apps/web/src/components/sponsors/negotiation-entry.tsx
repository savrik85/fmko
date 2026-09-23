"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Card, CardBody, SectionLabel } from "@/components/ui";
import { categoryLabel, type NegotiationAvailability } from "@/lib/sponsor-negotiation";

/** Tlačítka „Jednat o …" na stránce sponzora. Otevře (nebo obnoví) jednání a přejde na jeho obrazovku. */
export function NegotiationEntry({ sponsorId, teamId, availability }: {
  sponsorId: number;
  teamId: string;
  availability: { main: NegotiationAvailability; stadium: NegotiationAvailability };
}) {
  const router = useRouter();
  const [acting, setActing] = useState<"main" | "stadium" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (category: "main" | "stadium") => {
    const a = availability[category];
    if (acting) return;
    if (a.openId) {
      router.push(`/sponzor/${sponsorId}/jednani?id=${a.openId}`);
      return;
    }
    setActing(category);
    setError(null);
    const v = await apiFetch<{ id: string }>(`/api/teams/${teamId}/sponsors/${sponsorId}/negotiations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category }),
    }).catch((e) => { console.error("otevření jednání:", e); setError((e as Error).message); return null; });
    if (!v) { setActing(null); return; }
    router.push(`/sponzor/${sponsorId}/jednani?id=${v.id}`);
  };

  return (
    <section>
      <SectionLabel>{"\u{1F91D}"} Jednání o smlouvě</SectionLabel>
      <Card>
        <CardBody className="space-y-3">
          {(["main", "stadium"] as const).map((cat) => {
            const a = availability[cat];
            const label = a.openId
              ? `Pokračovat v jednání: ${categoryLabel(cat).toLowerCase()}`
              : a.isRenewal ? `Jednat o prodloužení: ${categoryLabel(cat).toLowerCase()}` : `Jednat: ${categoryLabel(cat).toLowerCase()}`;
            return (
              <div key={cat}>
                <button type="button" onClick={() => go(cat)} disabled={acting !== null || !a.canOpen} className="btn btn-primary w-full min-h-11">
                  {/* .btn má nowrap mimo vrstvy Tailwindu (utilita na tlačítku by nezabrala), dlouhý popisek
                      by na 375px vytekl z karty; zalomí se až na vnořeném spanu. */}
                  <span className="whitespace-normal text-center px-3 py-2">{acting === cat ? "Majitel chystá návrh smlouvy…" : label}</span>
                </button>
                {!a.canOpen && a.reason && <div className="text-sm text-muted mt-1">{a.reason}.</div>}
              </div>
            );
          })}
          {error && <div className="text-sm text-card-red">{error}</div>}
        </CardBody>
      </Card>
    </section>
  );
}
