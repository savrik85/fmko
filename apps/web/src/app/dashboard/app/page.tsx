"use client";

import { useEffect, useState } from "react";

type DeviceType =
  | "ios-safari"
  | "ios-chrome"
  | "ios-other"
  | "android-chrome"
  | "android-samsung"
  | "android-firefox"
  | "android-other"
  | "desktop"
  | "unknown";

function detectDevice(): DeviceType {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);

  if (isIOS) {
    if (/CriOS/.test(ua)) return "ios-chrome";
    if (/FxiOS/.test(ua)) return "ios-other";
    if (/EdgiOS/.test(ua)) return "ios-other";
    if (/Safari/.test(ua)) return "ios-safari";
    return "ios-other";
  }
  if (isAndroid) {
    if (/SamsungBrowser/.test(ua)) return "android-samsung";
    if (/Firefox/.test(ua)) return "android-firefox";
    if (/Chrome/.test(ua)) return "android-chrome";
    return "android-other";
  }
  return "desktop";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true)
  );
}

type Step = { icon: string; text: string };

const INSTRUCTIONS: Record<DeviceType, { title: string; browser: string; steps: Step[] } | null> = {
  "ios-safari": {
    title: "iPhone / iPad — Safari",
    browser: "Safari",
    steps: [
      { icon: "🌐", text: "Otevři Prales FM v Safari (jsi tam teď)" },
      { icon: "⬆️", text: 'Klepni na tlačítko Sdílet — ikona čtverce se šipkou nahoru, dole uprostřed obrazovky' },
      { icon: "➕", text: 'Přejeď dolů a vyber „Přidat na plochu"' },
      { icon: "✏️", text: 'Název ponech nebo uprav, pak klepni „Přidat" vpravo nahoře' },
      { icon: "🏟", text: "Hotovo — ikona Prales FM se objeví na ploše jako normální appka" },
    ],
  },
  "ios-chrome": {
    title: "iPhone / iPad — Chrome",
    browser: "Chrome",
    steps: [
      { icon: "🌐", text: "Otevři Prales FM v Chrome (jsi tam teď)" },
      { icon: "⬆️", text: "Klepni na tlačítko Sdílet — ikona čtverce se šipkou, vlevo od adresního řádku" },
      { icon: "➕", text: 'Vyber „Přidat na plochu"' },
      { icon: "✏️", text: 'Klepni „Přidat" pro potvrzení' },
      { icon: "🏟", text: "Hotovo — Prales FM je na ploše" },
    ],
  },
  "ios-other": {
    title: "iPhone / iPad",
    browser: "prohlížeč",
    steps: [
      { icon: "📱", text: "Pro nejlepší výsledek otevři tuto stránku v Safari" },
      { icon: "⬆️", text: 'Klepni na tlačítko Sdílet (čtverec se šipkou)' },
      { icon: "➕", text: 'Vyber „Přidat na plochu"' },
      { icon: "✏️", text: 'Potvrď „Přidat"' },
      { icon: "🏟", text: "Prales FM se objeví na ploše" },
    ],
  },
  "android-chrome": {
    title: "Android — Chrome",
    browser: "Chrome",
    steps: [
      { icon: "🌐", text: "Otevři Prales FM v Chrome (jsi tam teď)" },
      { icon: "⋮", text: "Klepni na tři tečky vpravo nahoře (menu prohlížeče)" },
      { icon: "➕", text: 'Vyber „Přidat na plochu" nebo „Nainstalovat aplikaci"' },
      { icon: "✅", text: 'Klepni „Nainstalovat" / „Přidat"' },
      { icon: "🏟", text: "Prales FM se nainstaluje jako plnohodnotná appka" },
    ],
  },
  "android-samsung": {
    title: "Android — Samsung Internet",
    browser: "Samsung Internet",
    steps: [
      { icon: "🌐", text: "Otevři Prales FM v Samsung Internet (jsi tam teď)" },
      { icon: "⬇️", text: "V adresním řádku najdi ikonu pro přidání / instalaci (nebo menu)" },
      { icon: "➕", text: 'Vyber „Přidat stránku do" → „Plocha"' },
      { icon: "✅", text: 'Klepni „Přidat"' },
      { icon: "🏟", text: "Prales FM je na ploše" },
    ],
  },
  "android-firefox": {
    title: "Android — Firefox",
    browser: "Firefox",
    steps: [
      { icon: "🌐", text: "Otevři Prales FM ve Firefoxu (jsi tam teď)" },
      { icon: "⋮", text: "Klepni na tři tečky (menu) vpravo dole nebo nahoře" },
      { icon: "➕", text: 'Vyber „Nainstalovat"' },
      { icon: "✅", text: 'Potvrď instalaci' },
      { icon: "🏟", text: "Prales FM se nainstaluje jako appka" },
    ],
  },
  "android-other": {
    title: "Android",
    browser: "prohlížeč",
    steps: [
      { icon: "📱", text: "Pro nejlepší výsledek použij Chrome" },
      { icon: "⋮", text: "Otevři menu prohlížeče (tři tečky)" },
      { icon: "➕", text: 'Vyber „Přidat na plochu" nebo „Nainstalovat"' },
      { icon: "✅", text: 'Potvrď' },
      { icon: "🏟", text: "Prales FM je na ploše" },
    ],
  },
  desktop: null,
  unknown: null,
};

export default function AppInstallPage() {
  const [device, setDevice] = useState<DeviceType>("unknown");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setDevice(detectDevice());
    setInstalled(isStandalone());
  }, []);

  const info = device !== "unknown" ? INSTRUCTIONS[device] : null;
  const isMobile = device !== "desktop" && device !== "unknown";

  if (installed) {
    return (
      <div className="page-container">
        <div className="card p-6 text-center">
          <div className="text-5xl mb-3">🏟</div>
          <h2 className="font-heading font-bold text-lg mb-1">Prales FM je nainstalovaný</h2>
          <p className="text-sm text-muted">Používáš appku v plnohodnotném režimu. Paráda!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container space-y-4">
      {/* Header */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-pitch-900 flex items-center justify-center text-2xl font-heading font-bold text-white">
            P
          </div>
          <div>
            <h2 className="font-heading font-bold text-base">Nainstaluj Prales FM</h2>
            <p className="text-sm text-muted">Funguje jako normální appka, bez App Store</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap mt-3">
          {["Rychlý přístup z plochy", "Offline podpora", "Push notifikace"].map((f) => (
            <span key={f} className="text-xs bg-pitch-50 text-pitch-700 font-heading font-bold px-2 py-1 rounded-full">
              ✓ {f}
            </span>
          ))}
        </div>
      </div>

      {/* Návod */}
      {!isMobile && (
        <div className="card p-5 text-center">
          <p className="text-4xl mb-3">💻</p>
          <p className="font-heading font-bold text-base mb-1">Jsi na počítači</p>
          <p className="text-sm text-muted">
            Otevři Prales FM na svém mobilu a nainstaluj ho na plochu. Nebo v Chrome na Windows klikni na ikonu
            instalace v adresním řádku vpravo.
          </p>
        </div>
      )}

      {isMobile && !info && (
        <div className="card p-5">
          <p className="text-sm text-muted">Otevři menu svého prohlížeče a hledej „Přidat na plochu" nebo „Nainstalovat".</p>
        </div>
      )}

      {isMobile && info && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-heading font-bold text-muted uppercase tracking-wide">Návod pro</span>
            <span className="text-xs font-heading font-bold bg-pitch-50 text-pitch-700 px-2 py-0.5 rounded-full">
              {info.title}
            </span>
          </div>

          <ol className="space-y-4">
            {info.steps.map((step, i) => (
              <li key={i} className="flex gap-3 items-start">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-pitch-900 text-white text-xs font-heading font-bold flex items-center justify-center">
                  {i + 1}
                </div>
                <div className="flex gap-2 items-start pt-0.5">
                  <span className="text-lg leading-tight">{step.icon}</span>
                  <span className="text-sm leading-snug">{step.text}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Tip pro špatný prohlížeč na iOS */}
      {(device === "ios-chrome" || device === "ios-other") && (
        <div className="card p-4 border border-amber-200 bg-amber-50">
          <p className="text-xs font-heading font-bold text-amber-800 mb-1">Tip</p>
          <p className="text-xs text-amber-700">
            Na iPhonu funguje instalace nejlépe v Safari. Zkopíruj odkaz a otevři ho v Safari.
          </p>
        </div>
      )}
    </div>
  );
}
