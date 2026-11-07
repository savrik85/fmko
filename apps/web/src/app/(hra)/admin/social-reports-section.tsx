"use client";

/**
 * Socky v administraci: nahlášené příspěvky a komentáře a vypínač odpovědí
 * fanoušků a novinářů (Workers AI).
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SectionLabel, Spinner } from "@/components/ui";

interface ReportRow {
  target_key: string;
  reports: number;
  first_at: string;
  reasons: string | null;
  body: string | null;
  author: string | null;
  team_name: string | null;
  removed_at: string | null;
  deleted_at: string | null;
}

export function SocialReportsSection() {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [aiMode, setAiMode] = useState<"on" | "off">("on");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ reports: ReportRow[]; aiMode: "on" | "off" }>("/api/admin/social/reports");
      setRows(r.reports);
      setAiMode(r.aiMode);
    } catch (e) {
      console.error("nahlášené v Sockách:", e);
      setError("Nahlášené se nepodařilo načíst.");
      setRows([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const resolve = async (key: string, action: "remove" | "dismiss") => {
    try {
      await apiFetch("/api/admin/social/reports/resolve", { method: "POST", body: JSON.stringify({ key, action }) });
      setRows((list) => (list ?? []).filter((r) => r.target_key !== key));
    } catch (e) {
      console.error("vyřízení nahlášení:", e);
      setError("Vyřízení se nepodařilo.");
    }
  };

  const toggleAi = async () => {
    const mode = aiMode === "on" ? "off" : "on";
    try {
      await apiFetch("/api/admin/social/ai-mode", { method: "POST", body: JSON.stringify({ mode }) });
      setAiMode(mode);
    } catch (e) {
      console.error("přepnutí odpovědí fanoušků:", e);
      setError("Přepnutí se nepodařilo.");
    }
  };

  return (
    <div className="card p-4">
      <SectionLabel>🗣️ Socky</SectionLabel>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm text-ink flex-1">
          Odpovědi fanoušků a novinářů (Workers AI): <b>{aiMode === "on" ? "zapnuté" : "vypnuté"}</b>
        </span>
        <button onClick={toggleAi} className="btn btn-secondary">{aiMode === "on" ? "Vypnout" : "Zapnout"}</button>
      </div>
      {error && <p className="text-sm text-card-red mb-2">{error}</p>}
      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-muted">Nic nahlášeného.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => (
            <li key={r.target_key} className="py-3">
              <div className="text-sm text-muted">
                {r.author ?? "?"}{r.team_name ? ` · ${r.team_name}` : ""} · nahlášeno {r.reports}×
                {r.deleted_at ? " · autor smazal" : ""}{r.removed_at ? " · staženo" : ""}
              </div>
              <p className="text-base text-ink whitespace-pre-wrap break-words mt-1">{r.body ?? "(text chybí)"}</p>
              {r.reasons && r.reasons.replace(/[\s|]/g, "") && (
                <p className="text-sm text-muted mt-1">Důvod: {r.reasons}</p>
              )}
              <div className="flex gap-2 mt-2">
                <button onClick={() => resolve(r.target_key, "remove")} className="px-3 py-2 rounded-lg bg-card-red text-white text-sm font-semibold">Stáhnout</button>
                <button onClick={() => resolve(r.target_key, "dismiss")} className="px-3 py-2 rounded-lg bg-gray-100 text-ink text-sm font-semibold">Nechat</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
