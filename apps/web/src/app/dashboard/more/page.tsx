"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTeam } from "@/context/team-context";
import { hasUnseenNotes } from "@/data/release-notes";

const SECTIONS: Array<{ title: string; items: Array<{ href: string; icon: string; label: string; color: string }> }> = [
  { title: "Klub", items: [
    { href: "/dashboard/klub", icon: "\u{1F3DB}️", label: "Klub", color: "#153615" },
    { href: "/dashboard/obec", icon: "\u{1F3D8}️", label: "Obec", color: "#3D6B5C" },
    { href: "/dashboard/reputace", icon: "\u2B50", label: "Reputace", color: "#B8860B" },
    { href: "/dashboard/squad", icon: "\u{1F465}", label: "Kádr", color: "#2D5F2D" },
    { href: "/dashboard/u21", icon: "\u{1F9D2}", label: "U21", color: "#3D7A3D" },
    { href: "/dashboard/training", icon: "\u{1F3CB}️", label: "Tréninky", color: "#3D7A3D" },
    { href: "/dashboard/zamestnanci", icon: "\u{1F454}", label: "Zaměstnanci", color: "#4E6B7B" },
    { href: "/dashboard/transfers", icon: "\u{1F91D}", label: "Přestupy", color: "#4A8A4A" },
    { href: "/dashboard/watchlist", icon: "⭐", label: "Sledovaní", color: "#B8860B" },
    { href: "/dashboard/finances", icon: "\u{1F4B0}", label: "Finance", color: "#6B8E23" },
    { href: "/dashboard/sponsors", icon: "\u{1F4BC}", label: "Sponzoři", color: "#8B7355" },
    { href: "/dashboard/equipment", icon: "\u{1F45F}", label: "Vybavení", color: "#7B6B4E" },
    { href: "/dashboard/stadium", icon: "\u{1F3DF}️", label: "Stadion", color: "#5C7A3D" },
    { href: "/dashboard/fans", icon: "\u{1F4E3}", label: "Fanoušci", color: "#8B4513" },
    { href: "/dashboard/events", icon: "\u{1F389}", label: "Události", color: "#8B6914" },
    { href: "/dashboard/hospoda", icon: "\u{1F37A}", label: "Hospoda", color: "#8B5A2B" },
  ]},
  { title: "Soutěž", items: [
    { href: "/dashboard/liga", icon: "\u{1F3C6}", label: "Liga", color: "#B8860B" },
    { href: "/dashboard/pohar", icon: "\u{1F3C5}", label: "Pohár", color: "#A0722D" },
    { href: "/dashboard/schedule", icon: "\u{1F4C5}", label: "Rozpis", color: "#3D6B5C" },
    { href: "/dashboard/friendly", icon: "\u{1F91C}", label: "Přáteláky", color: "#4A7A5C" },
    { href: "/dashboard/calendar", icon: "\u{1F5D3}️", label: "Kalendář", color: "#6B7B3D" },
    { href: "/dashboard/news", icon: "\u{1F4F0}", label: "Zpravodaj", color: "#556B2F" },
    { href: "/dashboard/rozhodci", icon: "\u{1F9D1}\u200D\u2696\uFE0F", label: "Rozhodčí", color: "#4E4E4E" },
    { href: "/dashboard/soutez", icon: "\u{1F3DB}\uFE0F", label: "Vedení soutěže", color: "#6B5B3D" },
    // Sněm dočasně skryt z menu — dostupný přes přímou URL /dashboard/hlasovani.
  ]},
  { title: "Ostatní", items: [
    { href: "/dashboard/novinky", icon: "✨", label: "Co je nového", color: "#3D7A3D" },
    { href: "/dashboard/napoveda", icon: "\u{1F4D6}", label: "Nápověda", color: "#2D5F2D" },
    { href: "/dashboard/app", icon: "\u{1F4F2}", label: "Nainstaluj", color: "#153615" },
    { href: "/dashboard/invite", icon: "✉️", label: "Pozvi kamaráda", color: "#3D6B5C" },
    { href: "/dashboard/settings", icon: "⚙️", label: "Nastavení", color: "#6B6B6B" },
  ]},
];

export default function MorePage() {
  const { logout, isAdmin } = useTeam();
  const [notesUnseen, setNotesUnseen] = useState(false);

  // Odznak „Nové" u novinek — přehodnotit při každém otevření stránky.
  useEffect(() => {
    setNotesUnseen(hasUnseenNotes());
  }, []);

  return (
    <div className="page-container pb-24">
      {SECTIONS.map((section) => (
        <div key={section.title} className="mb-6">
          <p className="text-xs font-heading font-bold text-muted uppercase tracking-wide mb-3 px-1 flex items-center gap-2 after:flex-1 after:h-px after:bg-line">{section.title}</p>
          <div className="grid grid-cols-4 gap-2">
            {section.items.map((item) => {

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative flex flex-col items-center gap-1.5 p-3 rounded-xl transition-transform active:scale-95"
                  /* Sytost byla 7 % a 12 % — při té se 25 dlaždic slilo do jedné
                     bledé plochy a barevné kódování neneslo žádnou informaci.
                     Na 14 % a 24 % už jdou skupiny od sebe rozeznat. */
                  style={{ background: `${item.color}24` }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: `${item.color}3D` }}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </div>
                  <span className="text-micro font-medium text-ink text-center leading-tight">{item.label}</span>
                  {item.href === "/dashboard/novinky" && notesUnseen && (
                    <span className="absolute top-1 right-1 bg-pitch-500 text-white text-micro font-bold px-1.5 py-0.5 rounded-full">
                      Nové
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      {/* Administrace — jen pro adminy. Do spodní lišty se nevešla (má 5 položek
          a nemá růst), takže patří sem, kde je zbytek rozcestníku. */}
      {isAdmin && (
        <div className="mb-6">
          <p className="text-xs font-heading font-bold text-muted uppercase tracking-wide mb-3 px-1 flex items-center gap-2 after:flex-1 after:h-px after:bg-line">Správa</p>
          <div className="grid grid-cols-4 gap-2">
            <Link
              href="/dashboard/admin"
              className="relative flex flex-col items-center gap-1.5 p-3 rounded-xl transition-transform active:scale-95"
              style={{ background: "#8B451324" }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                style={{ background: "#8B45133D" }}
                aria-hidden="true"
              >
                🛠️
              </div>
              <span className="text-micro font-medium text-ink text-center leading-tight">Administrace</span>
            </Link>
          </div>
        </div>
      )}

      <button onClick={logout}
        className="w-full mt-6 py-3 rounded-xl text-center text-sm font-heading font-bold text-card-red bg-red-50 hover:bg-red-100 transition-colors">
        🚪 Odhlásit se
      </button>
    </div>
  );
}
