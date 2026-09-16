"use client";

/**
 * Zmeškané hovory.
 *
 * V Čechách je hromada nepřijatých hovorů od jednoho člověka univerzální
 * znamení, že máš průšvih. Sponzor volal pětkrát a ty nevíš proč, ale víš,
 * že to nebude nic dobrého.
 *
 * Nezvoní náhodně. Každý hovor má důvod navázaný na stav klubu, takže když
 * ti volá starosta, opravdu se na stadionu něco semlelo.
 */

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { apiFetch } from "@/lib/api";

const IKONA: Record<string, string> = {
  kotel: "🔥",
  sponzor: "💼",
  starosta: "🏛️",
  komise: "⚖️",
  hrac: "👤",
  novinar: "📰",
};

interface Hovor {
  id: string;
  volajici: string;
  volajiciLabel: string;
  jmeno: string;
  duvod: string;
  pocet: number;
  gameDate: string;
  seen: boolean;
}

function kdy(gameDate: string): string {
  const d = new Date(gameDate);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
}

export function Hovory({ teamId, onZavrit }: { teamId: string; onZavrit: () => void }) {
  const [hovory, setHovory] = useState<Hovor[] | null>(null);
  const [rozbaleny, setRozbaleny] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ calls: Hovor[] }>(`/api/teams/${teamId}/missed-calls`)
      .then((d) => setHovory(d.calls ?? []))
      .catch((e) => { console.error("zmeškané hovory:", e); setHovory([]); });
    // Otevřením seznamu hovory přestávají svítit.
    apiFetch(`/api/teams/${teamId}/missed-calls/seen`, { method: "POST" })
      .catch((e) => console.error("označení hovorů:", e));
  }, [teamId]);

  return (
    <div className="absolute inset-0 z-30 bg-white flex flex-col">
      <div className="bg-[#1c1c1e] text-white px-3 py-2.5 flex items-center gap-2 shrink-0">
        <button onClick={onZavrit} aria-label="Zpět" className="text-white/80 hover:text-white px-1">
          &#9664;
        </button>
        <span className="font-heading font-bold text-base">Zmeškané</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {hovory === null ? (
          <div className="flex items-center justify-center h-40"><Spinner /></div>
        ) : hovory.length === 0 ? (
          <div className="p-6 text-center text-muted">
            <p className="text-base mb-1">Nikdo nevolal</p>
            <p className="text-sm">Buď je klid, nebo to ještě nikdo nezjistil.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {hovory.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setRozbaleny(rozbaleny === h.id ? null : h.id)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-base shrink-0">
                    {IKONA[h.volajici] ?? "📞"}
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* Červeně jako nepřijatý hovor v mobilu. */}
                    <div className="font-heading font-bold text-base text-card-red truncate">
                      {h.jmeno}
                      {h.pocet > 1 && <span className="ml-1.5 tabular-nums">({h.pocet})</span>}
                    </div>
                    <div className="text-sm text-muted">{h.volajiciLabel}</div>
                  </div>
                  <span className="text-sm text-muted shrink-0">{kdy(h.gameDate)}</span>
                </div>
                {rozbaleny === h.id && (
                  <p className="text-sm text-ink-light mt-2 pl-13 leading-snug">{h.duvod}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 bg-white border-t border-gray-100 px-4 py-2">
        <p className="text-sm text-muted leading-snug">
          Zpátky se volat nedá, na vsi se to řeší osobně. Klepnutím zjistíš, o co šlo.
        </p>
      </div>
    </div>
  );
}
