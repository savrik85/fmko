"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { SectionLabel } from "@/components/ui";
import { currentPushSubscription, disablePush, enablePush, pushAvailability, type EnablePushResult, type PushAvailability } from "@/lib/push";

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

const ENABLE_FAILURE_TEXT: Partial<Record<EnablePushResult, string>> = {
  denied: "Prohlížeč upozornění zablokoval. Povol je v nastavení prohlížeče u stránky prales.fun.",
  failed: "Zapnout se nepovedlo. Zkus to prosím znovu.",
};

function usePushNotifications() {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [availability, setAvailability] = useState<PushAvailability>("unsupported");
  const [blocked, setBlocked] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
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
    const avail = pushAvailability();
    setAvailability(avail);
    if (avail !== "supported") return;
    setBlocked(Notification.permission === "denied");

    // Zapnuto je, když prohlížeč odběr opravdu má, ne když to tvrdí localStorage.
    currentPushSubscription()
      .then((sub) => setPushEnabled(!!sub))
      .catch((e) => console.error("Zjištění odběru upozornění selhalo:", e));

    const token = localStorage.getItem("om_token");
    if (!token) return;
    fetch(`${API}/api/push/preferences`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setPrefs(data as NotifPrefs))
      .catch((e) => console.error("Failed to load push prefs:", e));
  }, []);

  const enable = useCallback(async () => {
    setPushBusy(true);
    setPushError(null);
    const result = await enablePush();
    setPushBusy(false);
    if (result === "enabled") { setPushEnabled(true); setBlocked(false); return; }
    if (result === "denied") setBlocked(true);
    setPushError(ENABLE_FAILURE_TEXT[result] ?? null);
  }, []);

  const disable = useCallback(async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      await disablePush();
      setPushEnabled(false);
    } catch (e) {
      console.error("Vypnutí upozornění selhalo:", e);
      setPushError("Vypnout se nepovedlo. Zkus to prosím znovu.");
    } finally {
      setPushBusy(false);
    }
  }, []);

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

  return { pushEnabled, availability, blocked, pushError, pushBusy, prefs, prefsSaving, enable, disable, savePrefs };
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
  const { pushEnabled, availability, blocked, pushError, pushBusy, prefs, prefsSaving, enable, disable, savePrefs } = usePushNotifications();
  const pushSupported = availability === "supported";
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
          {/* Popisky svázané přes htmlFor a autoComplete pro správce hesel —
              bez toho pole nikdo nevyplní ani nepřečte. */}
          <div>
            <label htmlFor="pw-current" className="text-xs text-muted uppercase font-heading font-bold block mb-1">Současné heslo</label>
            <input id="pw-current" name="current-password" type="password" autoComplete="current-password"
              value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full border border-gray-200 rounded-soft px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-400" required />
          </div>
          <div>
            <label htmlFor="pw-new" className="text-xs text-muted uppercase font-heading font-bold block mb-1">Nové heslo</label>
            <input id="pw-new" name="new-password" type="password" autoComplete="new-password"
              value={newPw} onChange={(e) => setNewPw(e.target.value)}
              className="w-full border border-gray-200 rounded-soft px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-400" required />
            {newPw && pwErrors.length > 0 && (
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {["min. 8 znaků", "malé písmeno", "velké písmeno", "číslo"].map((req) => {
                  const ok = !pwErrors.includes(req);
                  return (
                    <span key={req} className={`text-micro px-1.5 py-0.5 rounded-full font-heading font-bold ${ok ? "bg-pitch-50 text-pitch-600" : "bg-gray-100 text-muted"}`}>
                      {ok ? "✓" : "○"} {req}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <label htmlFor="pw-new-2" className="text-xs text-muted uppercase font-heading font-bold block mb-1">Nové heslo znovu</label>
            <input id="pw-new-2" name="new-password-confirm" type="password" autoComplete="new-password"
              value={newPw2} onChange={(e) => setNewPw2(e.target.value)}
              className="w-full border border-gray-200 rounded-soft px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-400" required />
            {pwMatch && <p className="text-card-red text-xs mt-1">Hesla se neshodují</p>}
          </div>

          {status && (
            <div className={`text-sm font-heading font-bold px-3 py-2 rounded-soft ${status.type === "ok" ? "bg-pitch-50 text-pitch-600" : "bg-red-50 text-card-red"}`}>
              {status.msg}
            </div>
          )}

          <button type="submit" disabled={!canSubmit || saving}
            className="w-full py-2 rounded-soft bg-pitch-500 text-white font-heading font-bold text-sm hover:bg-pitch-600 disabled:opacity-50 transition-colors">
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
              <p className="text-sm text-muted mt-0.5">
                {availability === "ios_install"
                  ? "Na iPhonu jen z Pralesu přidaného na plochu"
                  : !pushSupported
                  ? "Tenhle prohlížeč upozornění neumí"
                  : pushEnabled
                  ? "Zapnuto, dostáváš upozornění"
                  : blocked
                  ? "Zablokované v prohlížeči"
                  : "Vypnuto"}
              </p>
            </div>
          </div>
          {pushSupported && (
            <button
              onClick={pushEnabled ? disable : enable}
              disabled={pushBusy}
              aria-label={pushEnabled ? "Vypnout upozornění" : "Zapnout upozornění"}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 mt-1.5 disabled:opacity-50 ${pushEnabled ? "bg-pitch-500" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${pushEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          )}
        </div>
        {availability === "ios_install" && (
          <p className="px-5 pb-4 text-sm">
            Klepni dole na Sdílet, vyber „Přidat na plochu“ a Prales pak otevírej z plochy. Tam upozornění zapneš.{" "}
            <Link href="/aplikace" className="font-bold text-pitch-600 hover:underline">Jak na to</Link>
          </p>
        )}
        {pushSupported && !pushEnabled && blocked && !pushError && (
          <p className="px-5 pb-4 text-sm">Povol upozornění v nastavení prohlížeče u stránky prales.fun, pak je tady zapneš.</p>
        )}
        {pushError && <p className="px-5 pb-4 text-sm text-card-red">{pushError}</p>}

        {/* Preference typů */}
        {pushSupported && pushEnabled && (
          <>
            <div className="mx-5 mb-3 border-t border-gray-100" />
            <div className="px-5 pb-2">
              <p className="text-micro text-muted uppercase font-heading font-bold tracking-wide mb-3">Co tě má budit</p>
              <div className="space-y-1">
                {PREF_LABELS.map(({ key, icon, label, desc }) => (
                  <div
                    key={key}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-base w-6 text-center flex-shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">{label}</p>
                      <p className="text-micro text-muted leading-tight mt-0.5">{desc}</p>
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
              <p className="text-micro text-muted/60 leading-snug">
                Vypnutí notifikací odhlásí toto zařízení. Ostatní zařízení nejsou ovlivněna.
              </p>
            </div>
          </>
        )}

        {pushSupported && !pushEnabled && !blocked && (
          <div className="px-5 pb-5">
            <p className="text-sm text-muted">
              Zapni a dostávej upozornění na výsledky, přestupy nebo výzvy, i když máš Prales zavřený.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
