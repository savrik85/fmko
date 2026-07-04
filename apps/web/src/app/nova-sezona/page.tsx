"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch, apiAction } from "@/lib/api";
import { Spinner } from "@/components/ui";

interface WelcomeData {
  seasonNumber: number;
  teamName: string;
  firstMatch: string | null;
  squadSize: number;
  cup: { name: string; rounds: number; myStrength: number | null; bigMin: number; bigMax: number; realAvg: number } | null;
  news: { icon: string; title: string; text: string }[];
}

export default function NovaSezonaPage() {
  const { teamId } = useTeam();
  const router = useRouter();
  const [data, setData] = useState<WelcomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<WelcomeData | null>(`/api/teams/${teamId}/season-welcome`)
      .then((d) => { if (!d) { router.replace("/dashboard"); return; } setData(d); })
      .catch((e) => { console.error("load welcome:", e); router.replace("/dashboard"); })
      .finally(() => setLoading(false));
  }, [teamId, router]);

  const start = async () => {
    if (!teamId) return;
    setDismissing(true);
    await apiAction(apiFetch(`/api/teams/${teamId}/season-welcome/dismiss`, { method: "POST" }), "Nepovedlo se uložit");
    router.replace("/dashboard");
  };

  if (loading) return <div className="min-h-screen flex justify-center items-center bg-pitch-700"><Spinner /></div>;
  if (!data) return null;

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("cs", { day: "numeric", month: "long" }) : "—";

  return (
    <div className="min-h-screen bg-gradient-to-b from-pitch-600 to-pitch-800 text-white">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="text-xs font-heading uppercase tracking-[0.2em] text-white/60">Nová sezóna</div>
          <h1 className="text-4xl font-heading font-[800] mt-1 leading-tight">Vítej ve {data.seasonNumber}. sezóně!</h1>
          <div className="text-white/70 mt-1 text-lg">{data.teamName}</div>
        </div>

        {/* Co tě čeká */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-white/60">První zápas</div>
            <div className="font-heading font-bold mt-0.5">{fmtDate(data.firstMatch)}</div>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-white/60">Kádr</div>
            <div className="font-heading font-bold mt-0.5">{data.squadSize} hráčů</div>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-white/60">Pohár</div>
            <div className="font-heading font-bold mt-0.5">{data.cup ? `${data.cup.rounds} kol` : "—"}</div>
          </div>
        </div>

        {data.cup && (
          <div className="bg-white/10 rounded-xl p-4 mb-6 text-sm leading-relaxed">
            <span className="font-heading font-bold">🏆 {data.cup.name}</span> — tvoje síla <b>{data.cup.myStrength ?? "?"}</b>, velkokluby z měst mají <b>{data.cup.bigMin}–{data.cup.bigMax}</b>. V 1. kole na velkoklub nenarazíš, máš šanci projít.
          </div>
        )}

        {/* Co je nového */}
        {data.news.length > 0 && (
          <>
            <div className="text-xs font-heading uppercase tracking-wider text-white/60 mb-2">Co je nového</div>
            <div className="space-y-2 mb-8">
              {data.news.map((n, i) => (
                <div key={i} className="bg-white/10 rounded-xl p-3 flex gap-3 items-start">
                  <div className="text-2xl shrink-0 leading-none mt-0.5">{n.icon}</div>
                  <div className="min-w-0">
                    <div className="font-heading font-bold">{n.title}</div>
                    <div className="text-sm text-white/70 leading-snug">{n.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <button
          onClick={start}
          disabled={dismissing}
          className="w-full py-3.5 rounded-xl bg-white text-pitch-700 font-heading font-bold text-lg hover:bg-white/90 transition-colors disabled:opacity-60"
        >
          {dismissing ? "..." : "Do toho! →"}
        </button>
      </div>
    </div>
  );
}
