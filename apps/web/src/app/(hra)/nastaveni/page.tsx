"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { Button, ChoiceGroup, Input, ListCard, ListRow, Sheet, StatusChip, Switch, type ChoiceOption } from "@/components/ui";
import { currentPushSubscription, disablePush, enablePush, pushAvailability, type EnablePushResult, type PushAvailability } from "@/lib/push";
import { cachedReplayView, DEFAULT_REPLAY_VIEW, fetchReplayView, saveReplayView, type ReplayView } from "@/lib/ui-prefs";
import { PitchIcon, VideoIcon } from "@/components/match/replay-view-icons";

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

const PREF_LABELS: { key: keyof NotifPrefs; label: string; desc: string }[] = [
  { key: "match_result",   label: "Výsledek zápasu",           desc: "Hned po odehrání zápasu" },
  { key: "match_reminder", label: "Sestava před zápasem",       desc: "Připomenutí den předem" },
  { key: "transfer",       label: "Přestupy",                   desc: "Nabídka nebo odpověď na přestup" },
  { key: "challenge",      label: "Výzvy",                      desc: "Výzva od jiného týmu" },
  // `event` je společný typ pro všechno ostatní: sezónní události, incidenty, sázky i hlídač.
  // Typy `season` a `system` hra nikdy neposílá, jejich přepínače nic neřídily (skryté).
  { key: "event",          label: "Události a ostatní",         desc: "Sezónní události, incidenty, sázky a další zprávy klubu" },
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

const REPLAY_VIEW_OPTIONS: ReadonlyArray<ChoiceOption<ReplayView>> = [
  { value: "2d", label: <span className="inline-flex items-center gap-1.5"><PitchIcon />Hřiště</span> },
  { value: "3d", label: <span className="inline-flex items-center gap-1.5"><VideoIcon />Video</span> },
];

/**
 * Jak se záznam zápasu otevře. Volba patří účtu (platí na mobilu i na počítači) a ukládá se hned po kliknutí.
 * Dokud odpověď nedorazí, ukazuje se poslední známá volba z prohlížeče.
 */
function ReplayViewCard() {
  const [view, setView] = useState<ReplayView | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Hráč už volil: pozdě došlá uložená volba z API by jeho klik přepsala. */
  const chosen = useRef(false);

  useEffect(() => {
    setView(cachedReplayView());
    fetchReplayView()
      .then((v) => { if (!chosen.current) setView(v); })
      .catch((e) => {
        console.error("Načtení předvolby záznamu zápasu selhalo:", e);
        if (chosen.current) return;
        setView((v) => v ?? DEFAULT_REPLAY_VIEW);
        setError("Uloženou volbu se nepodařilo načíst. Zkus stránku obnovit.");
      });
  }, []);

  async function choose(next: ReplayView) {
    if (saving || next === view) return;
    chosen.current = true;
    const previous = view;
    setView(next);
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      setView(await saveReplayView(next));
      setSaved(true);
    } catch (e) {
      console.error("Uložení předvolby záznamu zápasu selhalo:", e);
      setView(previous);
      setError("Uložit se nepovedlo. Zkus to prosím znovu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ListCard title="Záznam zápasu">
      <div className="px-4 py-4">
        <p className="text-meta text-muted mb-3">Jak se záznam zápasu otevře. Přepnout můžeš kdykoli i během zápasu.</p>
        <ChoiceGroup ariaLabel="Jak se záznam zápasu otevře" columns={2} value={view} onChange={choose} options={REPLAY_VIEW_OPTIONS} />
        {error && <p role="alert" className="text-sm text-card-red mt-3">{error}</p>}
        {!error && saved && <p className="text-sm text-pitch-600 mt-3">Uloženo. Platí na všech tvých zařízeních.</p>}
      </div>
    </ListCard>
  );
}

function checkPassword(pw: string): string[] {
  const errors: string[] = [];
  if (pw.length < 8) errors.push("min. 8 znaků");
  if (!/[a-z]/.test(pw)) errors.push("malé písmeno");
  if (!/[A-Z]/.test(pw)) errors.push("velké písmeno");
  if (!/[0-9]/.test(pw)) errors.push("číslo");
  return errors;
}

/** Změna hesla v plachtě: formulář se otevře, až ho hráč potřebuje. */
function PasswordSheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pwErrors = newPw ? checkPassword(newPw) : [];
  const pwMatch = newPw2 && newPw !== newPw2;
  const canSubmit = currentPw && newPw && newPw2 && pwErrors.length === 0 && newPw === newPw2;

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem("om_token");
      const res = await fetch(`${API}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (data.ok) {
        onChanged();
        return;
      }
      setError(data.error ?? "Chyba");
    } catch (e) {
      console.error("change-password failed:", e);
      setError("Nepodařilo se spojit se serverem");
    }
    setSaving(false);
  }

  return (
    <Sheet open onClose={onClose} maxWidth="420px" closeOnBackdrop={false} title="Změna hesla">
      <form onSubmit={handleChange} className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-heading font-bold text-lg text-ink">Změna hesla</h3>
          <button type="button" onClick={onClose} aria-label="Zavřít" className="-mr-2 -mt-1 w-10 h-10 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-surface-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {/* Name a autoComplete pro správce hesel; popisky svazuje Input přes htmlFor. */}
        <Input label="Současné heslo" name="current-password" type="password" autoComplete="current-password"
          value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
        <div>
          <Input label="Nové heslo" name="new-password" type="password" autoComplete="new-password"
            value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
          {newPw && pwErrors.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {["min. 8 znaků", "malé písmeno", "velké písmeno", "číslo"].map((req) => {
                const ok = !pwErrors.includes(req);
                return (
                  <StatusChip tone={ok ? "ok" : "neutral"} key={req}>
                    {ok ? "✓" : "○"} {req}
                  </StatusChip>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <Input label="Nové heslo znovu" name="new-password-confirm" type="password" autoComplete="new-password"
            value={newPw2} onChange={(e) => setNewPw2(e.target.value)} required />
          {pwMatch && <p className="text-sm text-card-red mt-1">Hesla se neshodují</p>}
        </div>
        {error && <p role="alert" className="text-sm text-card-red">{error}</p>}
        <Button type="submit" disabled={!canSubmit || saving} className="w-full">
          {saving ? "Ukládám…" : "Změnit heslo"}
        </Button>
      </form>
    </Sheet>
  );
}

function pushStatusText(availability: PushAvailability, enabled: boolean, blocked: boolean): string {
  if (availability === "ios_install") return "Na iPhonu jen z Pralesu přidaného na plochu";
  if (availability !== "supported") return "Tenhle prohlížeč upozornění neumí";
  if (enabled) return "Zapnuto, dostáváš upozornění";
  if (blocked) return "Zablokované v prohlížeči";
  return "Vypnuto";
}

export default function SettingsPage() {
  const { email } = useTeam();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const { pushEnabled, availability, blocked, pushError, pushBusy, prefs, prefsSaving, enable, disable, savePrefs } = usePushNotifications();
  const pushSupported = availability === "supported";

  return (
    <div className="page-container space-y-5 lg:max-w-2xl">
      <ReplayViewCard />

      <ListCard title="Upozornění">
        <ListRow
          title="Push notifikace"
          meta={pushStatusText(availability, pushEnabled, blocked)}
          trailing={pushSupported ? (
            <Switch checked={pushEnabled} disabled={pushBusy} label="Push notifikace"
              onChange={(next) => { if (next) enable(); else disable(); }} />
          ) : undefined}
        />
        {availability === "ios_install" && (
          <p className="px-4 py-3 text-sm border-b border-line-soft last:border-b-0">
            Klepni dole na Sdílet, vyber „Přidat na plochu“ a Prales pak otevírej z plochy. Tam upozornění zapneš.{" "}
            <Link href="/aplikace" className="font-bold text-pitch-600 hover:underline">Jak na to</Link>
          </p>
        )}
        {pushSupported && !pushEnabled && blocked && !pushError && (
          <p className="px-4 py-3 text-sm border-b border-line-soft last:border-b-0">Povol upozornění v nastavení prohlížeče u stránky prales.fun, pak je tady zapneš.</p>
        )}
        {pushError && <p role="alert" className="px-4 py-3 text-sm text-card-red border-b border-line-soft last:border-b-0">{pushError}</p>}
        {pushSupported && !pushEnabled && !blocked && (
          <p className="px-4 py-3 text-sm text-muted">
            Zapni a dostávej upozornění na výsledky, přestupy nebo výzvy, i když máš Prales zavřený.
          </p>
        )}
        {pushSupported && pushEnabled && (
          <>
            {PREF_LABELS.map(({ key, label, desc }) => (
              <ListRow key={key} title={label} meta={desc}
                trailing={<Switch checked={prefs[key]} disabled={prefsSaving} label={label}
                  onChange={(next) => savePrefs({ ...prefs, [key]: next })} />} />
            ))}
            <p className="px-4 py-3 text-meta text-muted">
              Vypnutí upozornění odhlásí jen toto zařízení. Ostatní zařízení zůstanou, jak jsou.
            </p>
          </>
        )}
      </ListCard>

      <ListCard title="Účet">
        <ListRow title="E-mail" meta={email} />
        <ListRow title="Změnit heslo" meta={passwordChanged ? "Heslo změněno" : undefined}
          onClick={() => { setPasswordChanged(false); setPasswordOpen(true); }} />
      </ListCard>

      {passwordOpen && (
        <PasswordSheet onClose={() => setPasswordOpen(false)}
          onChanged={() => { setPasswordOpen(false); setPasswordChanged(true); }} />
      )}
    </div>
  );
}
