"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { formatCZK } from "@/lib/sponsor-owners";
import { blockText, dayMonth, REQUEST_STATUS_LABELS, type RequestInfo } from "@/lib/sponsor-requests";

/** Karta majitele: prosby o příspěvek (co už dal, co musíš utratit) a cesta do SMS s ním. */
export function RequestSection({ teamId, sponsorId }: { teamId: string; sponsorId: number }) {
  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [opening, setOpening] = useState(false);
  const router = useRouter();

  const openSms = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const res = await apiFetch<{ conversationId: string }>(`/api/teams/${teamId}/sponsor-owners/${sponsorId}/conversation`, { method: "POST" });
      router.push(`/telefon/${res.conversationId}`);
    } catch (e) {
      console.error("otevření SMS s majitelem:", e);
      setOpening(false);
    }
  };

  const load = () => {
    apiFetch<RequestInfo>(`/api/teams/${teamId}/sponsor-owners/${sponsorId}/request`)
      .then(setInfo)
      .catch((e) => console.error("prosby o příspěvek:", e));
  };
  useEffect(load, [teamId, sponsorId]);

  if (!info) return null;
  const blocked = blockText(info);

  return (
    <div className="pt-3 border-t border-gray-100 space-y-2">
      <div className="text-sm">
        {info.given > 0
          ? <>Za posledních 90 dní ti dal <span className="font-heading font-bold">{formatCZK(info.given)}</span>.</>
          : "Můžeš mu napsat SMS a poprosit o příspěvek na trenéra, přestup, vybavení, stadion nebo mládež."}
      </div>

      {info.obligations.map((o) => {
        const pct = Math.min(100, Math.round((o.spent / Math.max(1, o.required)) * 100));
        return (
          <div key={o.id} className="bg-surface rounded-xl p-3">
            <div className="text-sm">
              Dal {formatCZK(o.granted)} na {o.label}. Do <span className="font-heading font-bold">{dayMonth(o.checkDay)}</span> je musíš utratit.
            </div>
            <div className="text-sm text-muted mt-0.5">Utraceno {formatCZK(o.spent)} z {formatCZK(o.required)}</div>
            <div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden">
              <div className={`h-full ${pct >= 100 ? "bg-pitch-500" : "bg-gold-500"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}

      {blocked && <p className="text-sm text-muted">{blocked}</p>}
      <button onClick={openSms} disabled={opening} className="btn btn-secondary btn-sm min-h-11">Napsat SMS</button>

      {info.history.length > 0 && (
        <ul className="text-sm text-muted space-y-0.5">
          {info.history.slice(0, 3).map((h, i) => (
            <li key={i}>
              {dayMonth(h.day)} na {h.label}: chtěl jsi {formatCZK(h.asked)}
              {h.granted > 0 ? `, dal ${formatCZK(h.granted)}` : ""} · {REQUEST_STATUS_LABELS[h.status] ?? h.status}
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
