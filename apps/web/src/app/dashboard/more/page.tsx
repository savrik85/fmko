"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";

const SECTIONS = [
  { title: "Klub", items: [
    { href: "/dashboard/squad", icon: "\u{1F465}", label: "Kádr", color: "#2D5F2D" },
    { href: "/dashboard/training", icon: "\u{1F3CB}️", label: "Tréninky", color: "#3D7A3D" },
    { href: "/dashboard/transfers", icon: "\u{1F91D}", label: "Přestupy", color: "#4A8A4A" },
    { href: "/dashboard/watchlist", icon: "⭐", label: "Sledovaní", color: "#B8860B" },
    { href: "/dashboard/finances", icon: "\u{1F4B0}", label: "Finance", color: "#6B8E23" },
    { href: "/dashboard/sponsors", icon: "\u{1F4BC}", label: "Sponzoři", color: "#8B7355" },
    { href: "/dashboard/equipment", icon: "\u{1F45F}", label: "Vybavení", color: "#7B6B4E" },
    { href: "/dashboard/stadium", icon: "\u{1F3DF}️", label: "Stadion", color: "#5C7A3D" },
    { href: "/dashboard/fans", icon: "\u{1F4E3}", label: "Fanoušci", color: "#8B4513" },
    { href: "/dashboard/events", icon: "\u{1F389}", label: "Události", color: "#8B6914" },
  ]},
  { title: "Soutěž", items: [
    { href: "/dashboard/liga", icon: "\u{1F3C6}", label: "Liga", color: "#B8860B" },
    { href: "/dashboard/schedule", icon: "\u{1F4C5}", label: "Rozpis", color: "#3D6B5C" },
    { href: "/dashboard/friendly", icon: "\u{1F91C}", label: "Přáteláky", color: "#4A7A5C" },
    { href: "/dashboard/calendar", icon: "\u{1F5D3}️", label: "Kalendář", color: "#6B7B3D" },
    { href: "/dashboard/news", icon: "\u{1F4F0}", label: "Zpravodaj", color: "#556B2F" },
    { href: "/dashboard/hlasovani", icon: "\u{1F5F3}️", label: "Sněm", color: "#B8860B" },
  ]},
  { title: "Ostatní", items: [
    { href: "/dashboard/app", icon: "\u{1F4F2}", label: "Nainstaluj", color: "#153615" },
    { href: "/dashboard/invite", icon: "✉️", label: "Pozvi kamaráda", color: "#3D6B5C" },
    { href: "/dashboard/settings", icon: "⚙️", label: "Nastavení", color: "#6B6B6B" },
  ]},
];

export default function MorePage() {
  const { logout, token } = useTeam();
  const [unvotedCount, setUnvotedCount] = useState(0);

  useEffect(() => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    apiFetch<Array<{ status: string; my_answer: string | null }>>("/api/votes", { headers })
      .then((votes) => setUnvotedCount(votes.filter((v) => v.status === "open" && v.my_answer === null).length))
      .catch((e) => console.error("fetch votes:", e));
  }, [token]);

  return (
    <div className="page-container pb-24">
      {SECTIONS.map((section) => (
        <div key={section.title} className="mb-6">
          <p className="text-xs font-heading font-bold text-muted uppercase tracking-wide mb-3 px-1">{section.title}</p>
          <div className="grid grid-cols-4 gap-2">
            {section.items.map((item) => {
              const badge = item.href === "/dashboard/hlasovani" ? unvotedCount : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all active:scale-95"
                  style={{ background: `${item.color}12` }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: `${item.color}20` }}
                  >
                    {item.icon}
                  </div>
                  <span className="text-[11px] font-medium text-ink text-center leading-tight">{item.label}</span>
                  {badge > 0 && (
                    <span className="absolute top-1 right-1 bg-amber-500 text-white text-[9px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <button onClick={logout}
        className="w-full mt-6 py-3 rounded-xl text-center text-sm font-heading font-bold text-card-red bg-red-50 hover:bg-red-100 transition-colors">
        🚪 Odhlásit se
      </button>
    </div>
  );
}
