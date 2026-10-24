"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { currentPushSubscription, enablePush, pushAvailability } from "@/lib/push";

const DISMISS_KEY = "push_prompt_dismissed_at";
const DISMISS_MS = 14 * 24 * 3600 * 1000;

type View = "hidden" | "offer" | "ios" | "enabling" | "done" | "denied" | "failed";

function dismissedRecently(): boolean {
  const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
  return Date.now() - at < DISMISS_MS;
}

/**
 * Výzva k zapnutí upozornění na Přehledu. Dřív šlo upozornění zapnout jen v Nastavení,
 * kam skoro nikdo nechodí, a odběr mělo 4 z 20 klubů. Komu upozornění chodí, výzvu nevidí.
 */
export function PushPrompt() {
  const [view, setView] = useState<View>("hidden");

  useEffect(() => {
    let alive = true;
    const decide = async () => {
      if (dismissedRecently()) return;
      const availability = pushAvailability();
      if (availability === "ios_install") { if (alive) setView("ios"); return; }
      // Zakázané v prohlížeči se z Přehledu napravit nedá, to vysvětlí Nastavení.
      if (availability !== "supported" || Notification.permission === "denied") return;
      const sub = await currentPushSubscription()
        .catch((e) => { console.error("Upozornění: zjištění odběru selhalo:", e); return null; });
      if (alive && !sub) setView("offer");
    };
    decide();
    return () => { alive = false; };
  }, []);

  if (view === "hidden") return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setView("hidden");
  };
  const turnOn = async () => {
    setView("enabling");
    const result = await enablePush();
    setView(result === "enabled" ? "done" : result === "denied" ? "denied" : result === "failed" ? "failed" : "offer");
  };

  const primary = "px-4 py-2 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 disabled:opacity-50 transition-colors";
  const secondary = "px-3 py-2 rounded-soft text-sm font-heading font-bold text-muted hover:bg-gray-100 transition-colors";

  if (view === "ios") {
    return (
      <div className="card p-4" role="status">
        <div className="font-heading font-bold text-base">🔔 Upozornění na iPhonu</div>
        <p className="text-sm mt-1">
          Na iPhonu chodí upozornění jen z Pralesu přidaného na plochu. Klepni dole na Sdílet,
          vyber „Přidat na plochu“ a Prales pak otevírej z plochy. Tam upozornění zapneš jedním klepnutím.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Link href="/aplikace" className={primary}>Jak na to</Link>
          <button type="button" onClick={dismiss} className={secondary}>Teď ne</button>
        </div>
      </div>
    );
  }

  if (view === "done") {
    return (
      <div className="card p-4" role="status">
        <div className="font-heading font-bold text-base">🔔 Upozornění zapnutá</div>
        <p className="text-sm mt-1">Nabídky, výsledky a připomenutí sestavy ti teď přijdou i se zavřenou hrou.</p>
        <div className="mt-3">
          <button type="button" onClick={() => setView("hidden")} className={secondary}>OK</button>
        </div>
      </div>
    );
  }

  if (view === "denied") {
    return (
      <div className="card p-4" role="status">
        <div className="font-heading font-bold text-base">🔕 Prohlížeč upozornění zablokoval</div>
        <p className="text-sm mt-1">Povolíš je v nastavení prohlížeče u stránky prales.fun, pak je tady zapneš znovu.</p>
        <div className="mt-3">
          <button type="button" onClick={dismiss} className={secondary}>OK</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4" role="status">
      <div className="font-heading font-bold text-base">🔔 Upozornění do mobilu</div>
      <p className="text-sm mt-1">
        Ať ti neuteče nabídka na hráče, výsledek zápasu nebo připomenutí sestavy, i když hru nemáš otevřenou.
      </p>
      {view === "failed" && <p className="text-sm mt-2 text-card-red">Zapnout se nepovedlo. Zkus to prosím znovu.</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" onClick={turnOn} disabled={view === "enabling"} className={primary}>
          {view === "enabling" ? "Zapínám…" : "Zapnout upozornění"}
        </button>
        <button type="button" onClick={dismiss} disabled={view === "enabling"} className={secondary}>Teď ne</button>
      </div>
    </div>
  );
}
