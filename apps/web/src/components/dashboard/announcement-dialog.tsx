"use client";

/**
 * Jednorázové oznámení pro všechny manažery — zobrazí se po vstupu do dashboardu
 * a po potvrzení se už neukáže (localStorage podle ID oznámení).
 *
 * Nové oznámení = změnit ANNOUNCEMENT (nové `id` zajistí, že se ukáže i těm,
 * kdo zavřeli to předchozí). `active: false` oznámení vypne.
 */

import { useEffect, useState } from "react";

interface Announcement {
  id: string;
  active: boolean;
  emoji: string;
  title: string;
  subtitle: string;
  paragraphs: string[];
  highlight?: { title: string; text: string };
  bullets?: { title: string; items: string[] };
  aside?: string;
  footer?: string;
  buttonLabel: string;
}

export const ANNOUNCEMENT: Announcement = {
  id: "prepocet-hodnoceni-2026-07-31",
  active: true,
  emoji: "📊",
  title: "Přepočet hodnocení hráčů",
  subtitle: "Zítra opravíme chybu, která se táhne od začátku hry",
  paragraphs: [
    "Celkové hodnocení hráčů — to velké číslo u každého jména — se celou dobu zobrazovalo špatně. Když hráč něco natrénoval, hodnocení mu vyskočilo mnohem víc, než odpovídalo tomu, co se doopravdy naučil.",
    "Čím pilněji se u vás trénovalo, tím větší byla odchylka. U nejvytíženějších hráčů je rozdíl přes 30 bodů. Sestavy jste tak skládali podle špatně zobrazeného čísla — hráč s hodnocením 67 mohl být ve skutečnosti ten nejslabší muž na hřišti.",
  ],
  highlight: {
    title: "Zápasy se ale počítaly správně",
    text: "Simulace s tím rozbitým číslem nikdy nepracovala — vždycky brala skutečné schopnosti hráčů. Žádný výsledek, gól ani tabulka se neruší. Všechno platí.",
  },
  bullets: {
    title: "Co se stane zítra",
    items: [
      "Všem hráčům ve hře přepočítáme hodnocení na správnou hodnotu.",
      "Čísla půjdou dolů, u některých výrazně. Není to oslabení ani trest — váš hráč je přesně tak dobrý jako včera, jen konečně uvidíte pravdu.",
      "Týká se to úplně všech týmů včetně soupeřů. Poměr sil v soutěži zůstává stejný.",
      "Mzdy se počítají z hodnocení, takže většině hráčů klesnou. O přidání, které jste komu vyjednali, nikdo nepřijde.",
    ],
  },
  aside:
    "Pevně věřím, že jste všichni sestavy skládali podle podrobných statistik a na to velké číslo se nikdo z vás ani nepodíval. 😄 Kdyby se přece jen někdo nechal zlákat — teď je ta pravá chvíle projít si soupisku znovu. Klidně zjistíte, že váš nejlepší hráč vám celou sezónu seděl na lavičce.",
  footer: "Omlouvám se. Byla to chyba od samého začátku.",
  buttonLabel: "Chápu, stane se...",
};

const SEEN_KEY_PREFIX = "announcement_seen_";

/** Bylo tohle oznámení už potvrzené? (SSR-safe) */
function isSeen(id: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SEEN_KEY_PREFIX + id) === "1";
  } catch (e) {
    console.warn("announcement seen check:", e);
    return true;
  }
}

function markSeen(id: string): void {
  try {
    localStorage.setItem(SEEN_KEY_PREFIX + id, "1");
  } catch (e) {
    console.warn("announcement seen store:", e);
  }
}

export function AnnouncementDialog() {
  const [open, setOpen] = useState(false);
  const a = ANNOUNCEMENT;

  // Kontrola až po mountu — localStorage není dostupný při SSR.
  useEffect(() => {
    if (a.active && !isSeen(a.id)) setOpen(true);
  }, [a.active, a.id]);

  if (!open) return null;

  const close = () => {
    markSeen(a.id);
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-title"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="relative bg-surface w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92dvh] sm:max-h-[85dvh] flex flex-col">
        {/* Hlavička */}
        <div className="bg-pitch-500 px-5 py-4 flex items-start gap-3 shrink-0">
          <span className="text-3xl leading-none" aria-hidden>
            {a.emoji}
          </span>
          <div className="min-w-0">
            <h2
              id="announcement-title"
              className="font-heading font-bold text-lg text-white leading-tight"
            >
              {a.title}
            </h2>
            <p className="text-sm text-white/80 mt-0.5">{a.subtitle}</p>
          </div>
        </div>

        {/* Obsah */}
        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {a.paragraphs.map((p, i) => (
            <p key={i} className="text-base text-ink-light leading-relaxed">
              {p}
            </p>
          ))}

          {a.highlight && (
            <div className="bg-pitch-50 border-l-4 border-pitch-500 rounded-r-xl px-4 py-3">
              <p className="font-heading font-bold text-base text-pitch-700">
                {a.highlight.title}
              </p>
              <p className="text-sm text-ink-light leading-relaxed mt-1">
                {a.highlight.text}
              </p>
            </div>
          )}

          {a.bullets && (
            <div>
              <p className="font-heading font-bold text-base text-ink mb-2">
                {a.bullets.title}
              </p>
              <ul className="space-y-2">
                {a.bullets.items.map((item, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-ink-light leading-relaxed">
                    <span className="text-pitch-500 shrink-0 mt-0.5" aria-hidden>
                      •
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {a.aside && (
            <p className="text-sm text-ink-light leading-relaxed italic bg-paper rounded-xl px-4 py-3">
              {a.aside}
            </p>
          )}

          {a.footer && (
            <p className="text-sm text-muted leading-relaxed border-t border-gray-100 pt-3">
              {a.footer}
            </p>
          )}
        </div>

        {/* Potvrzení */}
        <div className="px-5 py-3 border-t border-gray-100 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={close}
            className="w-full py-3.5 rounded-xl bg-pitch-500 hover:bg-pitch-600 transition-colors text-white font-heading font-bold text-base"
          >
            {a.buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
