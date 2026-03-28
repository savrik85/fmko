"use client";

import { useState } from "react";
import { useTeam } from "@/context/team-context";
import { SectionLabel } from "@/components/ui";

function checkPassword(pw: string): string[] {
  const errors: string[] = [];
  if (pw.length < 8) errors.push("min. 8 znaků");
  if (!/[a-z]/.test(pw)) errors.push("malé písmeno");
  if (!/[A-Z]/.test(pw)) errors.push("velké písmeno");
  if (!/[0-9]/.test(pw)) errors.push("číslo");
  return errors;
}

export default function SettingsPage() {
  const { email } = useTeam();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [status, setStatus] = useState<{ type: "ok" | "error"; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
  const pwErrors = newPw ? checkPassword(newPw) : [];
  const pwMatch = newPw2 && newPw !== newPw2;
  const canSubmit = currentPw && newPw && newPw2 && pwErrors.length === 0 && newPw === newPw2;

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`${API}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus({ type: "ok", msg: "Heslo změněno" });
        setCurrentPw(""); setNewPw(""); setNewPw2("");
      } else {
        setStatus({ type: "error", msg: data.error ?? "Chyba" });
      }
    } catch {
      setStatus({ type: "error", msg: "Nepodařilo se spojit se serverem" });
    }
    setSaving(false);
  }

  return (
    <div className="page-container space-y-5">
      <SectionLabel>Nastavení</SectionLabel>

      <div className="card p-5 max-w-md">
        <h3 className="font-heading font-bold text-base mb-1">Účet</h3>
        <p className="text-sm text-muted mb-4">{email}</p>

        <h3 className="font-heading font-bold text-base mb-3">Změna hesla</h3>
        <form onSubmit={handleChange} className="space-y-3">
          <div>
            <label className="text-xs text-muted uppercase font-heading font-bold block mb-1">Současné heslo</label>
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-400" required />
          </div>
          <div>
            <label className="text-xs text-muted uppercase font-heading font-bold block mb-1">Nové heslo</label>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-400" required />
            {newPw && pwErrors.length > 0 && (
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {["min. 8 znaků", "malé písmeno", "velké písmeno", "číslo"].map((req) => {
                  const ok = !pwErrors.includes(req);
                  return (
                    <span key={req} className={`text-[10px] px-1.5 py-0.5 rounded-full font-heading font-bold ${ok ? "bg-pitch-50 text-pitch-600" : "bg-gray-100 text-muted"}`}>
                      {ok ? "✓" : "○"} {req}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-muted uppercase font-heading font-bold block mb-1">Nové heslo znovu</label>
            <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-400" required />
            {pwMatch && <p className="text-card-red text-xs mt-1">Hesla se neshodují</p>}
          </div>

          {status && (
            <div className={`text-sm font-heading font-bold px-3 py-2 rounded-lg ${status.type === "ok" ? "bg-pitch-50 text-pitch-600" : "bg-red-50 text-card-red"}`}>
              {status.msg}
            </div>
          )}

          <button type="submit" disabled={!canSubmit || saving}
            className="w-full py-2 rounded-lg bg-pitch-500 text-white font-heading font-bold text-sm hover:bg-pitch-600 disabled:opacity-50 transition-colors">
            {saving ? "Ukládám..." : "Změnit heslo"}
          </button>
        </form>
      </div>
    </div>
  );
}
