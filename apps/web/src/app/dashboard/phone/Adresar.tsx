"use client";

/**
 * Adresář telefonu — kdo všechno se dá oslovit.
 *
 * Vzhled jde po iPhonu: sekce s hlavičkami, řádek s obličejem, jménem
 * a podtitulkem, šipka vpravo. Kanál je barevný štítek, protože rozdíl mezi
 * placenou SMS a iMessage přes data má být vidět dřív, než zprávu napíšeš.
 */

import { useEffect, useState } from "react";
import { FaceAvatar } from "@/components/players/face-avatar";
import { Spinner } from "@/components/ui";
import { apiFetch } from "@/lib/api";

export interface ContactsData {
  skupiny: { id: string; title: string; podtitul: string; channel: "sms" | "imessage" }[];
  hraci: { playerId: string; name: string; position: string; avatar: Record<string, unknown> | null }[];
  manazeri: { teamId: string; name: string; teamName: string; avatar: Record<string, unknown> | null }[];
}

const POSICE: Record<string, string> = {
  GK: "Brankář", DEF: "Obránce", MID: "Záložník", FWD: "Útočník",
};

function Stitek({ channel }: { channel: "sms" | "imessage" }) {
  return (
    <span className={`text-micro font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
      channel === "sms" ? "bg-pitch-50 text-pitch-700" : "bg-blue-50 text-blue-600"
    }`}>
      {channel === "sms" ? "SMS" : "iMessage"}
    </span>
  );
}

function Radek({ avatar, iniciály, emoji, name, podtitul, channel, onClick, busy }: {
  avatar?: Record<string, unknown> | null;
  iniciály?: string;
  emoji?: string;
  name: string;
  podtitul: string;
  channel: "sms" | "imessage";
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50"
    >
      <div className="shrink-0">
        {avatar && Object.keys(avatar).length > 2 ? (
          <FaceAvatar faceConfig={avatar} size={36} className="rounded-full" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm">
            {emoji ?? <span className="font-heading font-bold text-xs">{iniciály}</span>}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{name}</div>
        <div className="text-xs text-muted truncate">{podtitul}</div>
      </div>
      <Stitek channel={channel} />
      <span className="text-muted text-xs shrink-0">&#8250;</span>
    </button>
  );
}

function Sekce({ nadpis, children }: { nadpis: string; children: React.ReactNode }) {
  return (
    <>
      <div className="sticky top-0 z-10 bg-gray-100 px-4 py-1 text-xs font-heading font-bold text-muted uppercase tracking-wide">
        {nadpis}
      </div>
      <div className="divide-y divide-gray-100 bg-white">{children}</div>
    </>
  );
}

const iniciályZ = (s: string) => s.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("");

export function Adresar({ teamId, onZavrit, onOtevrit }: {
  teamId: string;
  onZavrit: () => void;
  /** Dostane ID konverzace, na kterou se má přejít. */
  onOtevrit: (conversationId: string) => void;
}) {
  const [data, setData] = useState<ContactsData | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<ContactsData>(`/api/teams/${teamId}/contacts`)
      .then(setData)
      .catch((e) => {
        console.error("načtení adresáře:", e);
        setData({ skupiny: [], hraci: [], manazeri: [] });
      });
  }, [teamId]);

  /** Konverzaci zakládá až kliknutí — adresář sám žádnou nevytváří. */
  const otevrit = async (url: string | null, rovnouId?: string) => {
    if (busy) return;
    if (rovnouId) { onOtevrit(rovnouId); return; }
    if (!url) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ conversationId: string }>(url, { method: "POST" });
      onOtevrit(res.conversationId);
    } catch (e) {
      console.error("otevření konverzace z adresáře:", e);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 sm:absolute z-30 bg-gray-100 flex flex-col">
      <div className="bg-pitch-600 text-white px-4 py-2.5 flex items-center justify-between shrink-0">
        <span className="font-heading font-bold text-sm">Adresář</span>
        <button className="text-sm text-white/80" onClick={onZavrit}>Hotovo</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {data === null ? (
          <div className="flex items-center justify-center h-40"><Spinner /></div>
        ) : (
          <>
            {data.skupiny.length > 0 && (
              <Sekce nadpis="Skupiny">
                {data.skupiny.map((g) => (
                  <Radek
                    key={g.id}
                    emoji={g.channel === "sms" ? "\u{1F3BD}" : g.title.includes("liga") ? "\u{1F3C6}" : "\u{1F310}"}
                    name={g.title}
                    podtitul={g.podtitul}
                    channel={g.channel}
                    busy={busy}
                    onClick={() => otevrit(null, g.id)}
                  />
                ))}
              </Sekce>
            )}

            {data.hraci.length > 0 && (
              <Sekce nadpis={`Můj tým · ${data.hraci.length}`}>
                {data.hraci.map((p) => (
                  <Radek
                    key={p.playerId}
                    avatar={p.avatar}
                    iniciály={iniciályZ(p.name)}
                    name={p.name}
                    podtitul={POSICE[p.position] ?? p.position}
                    channel="sms"
                    busy={busy}
                    onClick={() => otevrit(`/api/teams/${teamId}/player-conversation/${p.playerId}`)}
                  />
                ))}
              </Sekce>
            )}

            {data.manazeri.length > 0 && (
              <Sekce nadpis={`Trenéři v lize · ${data.manazeri.length}`}>
                {data.manazeri.map((m) => (
                  <Radek
                    key={m.teamId}
                    avatar={m.avatar}
                    iniciály={iniciályZ(m.name)}
                    name={m.name}
                    podtitul={m.teamName}
                    channel="imessage"
                    busy={busy}
                    onClick={() => otevrit(`/api/teams/${teamId}/conversation-with/${m.teamId}`)}
                  />
                ))}
              </Sekce>
            )}

            {data.skupiny.length === 0 && data.hraci.length === 0 && data.manazeri.length === 0 && (
              <p className="p-6 text-center text-sm text-muted">Adresář se nepodařilo načíst.</p>
            )}
            <div className="h-4" />
          </>
        )}
      </div>
    </div>
  );
}
