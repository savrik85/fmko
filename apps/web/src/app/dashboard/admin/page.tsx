"use client";

import { useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { SectionLabel } from "@/components/ui";

export default function AdminPage() {
  const { isAdmin, teamId } = useTeam();
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  if (!isAdmin) {
    return <div className="page-container"><div className="card p-8 text-center text-card-red font-heading font-bold text-xl">Přístup odepřen</div></div>;
  }

  const addLog = (msg: string) => setOutput((prev) => [...prev, `[${new Date().toLocaleTimeString("cs")}] ${msg}`]);

  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

  const advanceDay = async () => {
    setRunning(true);
    addLog("Spouštím denní tick (posunutí dne, tréninky, zprávy)...");
    try {
      const res = await fetch(`${API}/api/game/advance-day`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => ({}));
      addLog(`Denní tick hotov: ${JSON.stringify(data).slice(0, 200)}`);
    } catch (e: any) { addLog(`CHYBA: ${e.message}`); }
    setRunning(false);
  };

  const runMatches = async () => {
    setRunning(true);
    addLog("Spouštím zápasový tick (18:00 simulace)...");
    try {
      const res = await fetch(`${API}/api/game/run-matches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => ({}));
      addLog(`Zápasový tick hotov: ${JSON.stringify(data).slice(0, 200)}`);
    } catch (e: any) { addLog(`CHYBA: ${e.message}`); }
    setRunning(false);
  };

  const advanceWeek = async () => {
    setRunning(true);
    addLog("Spouštím 7 dní (denní tick + zápasový tick)...");
    for (let i = 0; i < 7; i++) {
      try {
        await fetch(`${API}/api/game/advance-day`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        await fetch(`${API}/api/game/run-matches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        addLog(`Den ${i + 1}/7 hotov`);
      } catch (e: any) { addLog(`CHYBA den ${i + 1}: ${e.message}`); break; }
    }
    addLog("Týden hotov");
    setRunning(false);
  };

  const wipePlayers = async () => {
    if (!confirm("Opravdu smazat všechna herní data?")) return;
    addLog("Toto vyžaduje přímý přístup k DB — použij CLI");
  };

  return (
    <div className="page-container space-y-5">
      <SectionLabel>Administrace</SectionLabel>

      {/* Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button onClick={advanceDay} disabled={running}
          className="card p-4 text-center hover:bg-gray-50 transition-colors disabled:opacity-50">
          <div className="text-2xl mb-1">⏭️</div>
          <div className="font-heading font-bold text-sm">+1 den</div>
          <div className="text-sm text-muted">Denní tick</div>
        </button>
        <button onClick={runMatches} disabled={running}
          className="card p-4 text-center hover:bg-gray-50 transition-colors disabled:opacity-50">
          <div className="text-2xl mb-1">⚽</div>
          <div className="font-heading font-bold text-sm">Zápasy</div>
          <div className="text-sm text-muted">18:00 tick</div>
        </button>
        <button onClick={advanceWeek} disabled={running}
          className="card p-4 text-center hover:bg-gray-50 transition-colors disabled:opacity-50">
          <div className="text-2xl mb-1">⏩</div>
          <div className="font-heading font-bold text-sm">+7 dní</div>
          <div className="text-sm text-muted">Denní + zápasy</div>
        </button>
        <button onClick={() => { addLog("Reloading..."); window.location.reload(); }}
          className="card p-4 text-center hover:bg-gray-50 transition-colors">
          <div className="text-2xl mb-1">🔄</div>
          <div className="font-heading font-bold text-sm">Refresh</div>
          <div className="text-sm text-muted">Reload stránky</div>
        </button>
        <button onClick={wipePlayers}
          className="card p-4 text-center hover:bg-red-50 transition-colors">
          <div className="text-2xl mb-1">🗑️</div>
          <div className="font-heading font-bold text-sm text-card-red">Wipe DB</div>
          <div className="text-sm text-muted">Smazat data</div>
        </button>
      </div>

      {/* Console output */}
      <div className="card p-4">
        <SectionLabel>Konzole</SectionLabel>
        <div className="bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-lg max-h-[400px] overflow-y-auto">
          {output.length === 0 ? (
            <div className="text-gray-500">Žádný výstup. Spusť akci výše.</div>
          ) : (
            output.map((line, i) => <div key={i}>{line}</div>)
          )}
        </div>
      </div>

      {/* Info */}
      <div className="card p-4">
        <SectionLabel>Systém</SectionLabel>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted">Team ID:</span> <span className="font-mono">{teamId ?? "—"}</span></div>
          <div><span className="text-muted">API:</span> <span className="font-mono">{process.env.NEXT_PUBLIC_API_URL ?? "localhost:8787"}</span></div>
          <div><span className="text-muted">Env:</span> <span className="font-mono">{process.env.NODE_ENV}</span></div>
          <div><span className="text-muted">Admin:</span> <span className="font-mono text-pitch-500">true</span></div>
        </div>
      </div>
    </div>
  );
}
