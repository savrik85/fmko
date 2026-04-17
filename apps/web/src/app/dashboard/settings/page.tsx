"use client";

import { useState, useEffect, useCallback } from "react";
import { useTeam } from "@/context/team-context";
import { SectionLabel } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

type NotifPrefs = {
  match_reminder: boolean;
  match_result: boolean;
  transfer: boolean;
  challenge: boolean;
  event: boolean;
  season: boolean;
  system: boolean;
};

const PREF_LABELS: { key: keyof NotifPrefs; label: string; desc: string; icon: string }[] = [
  { key: "match_result",   icon: "⚽", label: "Výsledek zápasu",           desc: "Hned po odehrání zápasu" },
  { key: "match_reminder", icon: "📋", label: "Sestava před zápasem",       desc: "Připomenutí den předem" },
  { key: "transfer",       icon: "🤝", label: "Přestupy",                   desc: "Nabídka nebo odpověď na přestup" },
  { key: "challenge",      icon: "⚡", label: "Výzvy",                      desc: "Výzva od jiného týmu" },
  { key: "event",          icon: "🎉", label: "Sezónní eventy",             desc: "Speciální příležitosti v sezoně" },
  { key: "season",         icon: "🏆", label: "Konec sezóny",               desc: "Postup, sestup, finální tabulka" },
  { key: "system",         icon: "⚙️", label: "Systémové zprávy",           desc: "Technické a herní oznámení" },
];

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function usePushNotifications() {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [prefs, setPrefs] = useState<NotifPrefs>({
    match_reminder: true, match_result: true, transfer: true,
    challenge: true, event: true, season: true, system: true,
  });
  const [prefsSaving, setPrefsSaving] = useState(false);

  const authHeaders = useCallback((): HeadersInit => {
    const token = localStorage.getItem("om_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    setPushSupported(supported);
    if (!supported) return;

    const stored = localStorage.getItem("push_enabled") === "true";
    setPushEnabled(stored);

    const token = localStorage.getItem("om_token");
    if (!token) return;
    fetch(`${API}/api/push/preferences`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setPrefs(data as NotifPrefs))
      .catch((e) => console.error("Failed to load push prefs:", e));
  }, []);

  const enablePush = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const res = await fetch(`${API}/api/push/vapid-key`);
      const { publicKey } = await res.json() as { publicKey: string };

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const saveRes = await fetch(`${API}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!saveRes.ok) throw new Error(`subscribe failed: ${saveRes.status}`);

      localStorage.setItem("push_enabled", "true");
      setPushEnabled(true);
    } catch (e) {
      console.error("enablePush failed:", e);
    }
  }, [authHeaders]);

  const disablePush = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(`${API}/api/push/unsubscribe`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      localStorage.setItem("push_enabled", "false");
      setPushEnabled(false);
    } catch (e) {
      console.error("disablePush failed:", e);
    }
  }, [authHeaders]);

  const savePrefs = useCallback(async (updated: NotifPrefs) => {
    setPrefs(updated);
    setPrefsSaving(true);
    try {
      await fetch(`${API}/api/push/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(updated),
      });
    } catch (e) {
      console.error("Failed to save push prefs:", e);
    } finally {
      setPrefsSaving(false);
    }
  }, [authHeaders]);

  return { pushEnabled, pushSupported, prefs, prefsSaving, enablePush, disablePush, savePrefs };
}

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
  const { pushEnabled, pushSupported, prefs, prefsSaving, enablePush, disablePush, savePrefs } = usePushNotifications();
  const pwErrors = newPw ? checkPassword(newPw) : [];
  const pwMatch = newPw2 && newPw !== newPw2;
  const canSubmit = currentPw && newPw && newPw2 && pwErrors.length === 0 && newPw === newPw2;

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setStatus(null);
    try {
      const token = localStorage.getItem("om_token");
      const res = await fetch(`${API}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus({ type: "ok", msg: "Heslo změněno" });
        setCurrentPw(""); setNewPw(""); setNewPw2("");
      } else {
        setStatus({ type: "error", msg: data.error ?? "Chyba" });
      }
    } catch (e) {
      console.error("change-password failed:", e);
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

      {/* Push notifikace */}
      <div className="card max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-colors ${pushEnabled ? "bg-pitch-100" : "bg-gray-100"}`}>
              🔔
            </div>
            <div>
              <h3 className="font-heading font-bold text-base leading-tight">Push notifikace</h3>
              <p className="text-xs text-muted mt-0.5">
                {!pushSupported
                  ? "Prohlížeč nepodporuje push"
                  : pushEnabled
                  ? "Zapnuto — dostáváš upozornění"
                  : "Vypnuto"}
              </p>
            </div>
          </div>
          {pushSupported && (
            <button
              onClick={pushEnabled ? disablePush : enablePush}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 mt-1.5 ${pushEnabled ? "bg-pitch-500" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${pushEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          )}
        </div>

        {/* Preference typů */}
        {pushSupported && pushEnabled && (
          <>
            <div className="mx-5 mb-3 border-t border-gray-100" />
            <div className="px-5 pb-2">
              <p className="text-[11px] text-muted uppercase font-heading font-bold tracking-wide mb-3">Co tě má budit</p>
              <div className="space-y-1">
                {PREF_LABELS.map(({ key, icon, label, desc }) => (
                  <div
                    key={key}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-base w-6 text-center flex-shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">{label}</p>
                      <p className="text-[11px] text-muted leading-tight mt-0.5">{desc}</p>
                    </div>
                    <button
                      onClick={() => savePrefs({ ...prefs, [key]: !prefs[key] })}
                      disabled={prefsSaving}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-40 flex-shrink-0 ${prefs[key] ? "bg-pitch-500" : "bg-gray-200"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${prefs[key] ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 pt-1 pb-4">
              <p className="text-[10px] text-muted/60 leading-snug">
                Vypnutí notifikací odhlásí toto zařízení. Ostatní zařízení nejsou ovlivněna.
              </p>
            </div>
          </>
        )}

        {pushSupported && !pushEnabled && (
          <div className="px-5 pb-5">
            <p className="text-xs text-muted">
              Zapni a dostávej upozornění na výsledky, přestupy nebo výzvy — i když máš Prales zavřený.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
