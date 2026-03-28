"use client";

import Link from "next/link";
import { BadgePreview } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import type { BadgePattern } from "@/components/ui";

interface Props {
  team: {
    id: string;
    name: string;
    village_name: string;
    district: string;
    region: string;
    primary_color: string;
    secondary_color: string;
    badge_pattern: string;
  };
  manager: { name: string; backstory: string; age: number; avatar: Record<string, unknown> | null } | null;
  position: number | null;
}

export function InvitePageClient({ team, manager, position }: Props) {
  const managerName = manager?.name ?? "Tren\u00E9r";
  const color = team.primary_color || "#2D5F2D";
  const initials = team.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();

  return (
    <main className="min-h-screen bg-auth relative overflow-hidden flex flex-col items-center px-4 py-8 sm:p-6">
      {/* Background accents */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[50%] -translate-x-1/2 w-[600px] h-[600px] rounded-full" style={{ background: `${color}12` }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-gold-500/[0.04]" />
      </div>

      <div className="relative z-10 w-full max-w-md mx-auto animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-white/20 text-xs tracking-[0.2em] uppercase">
            <span className="w-6 h-px bg-white/10" />
            Est. 2026
            <span className="w-6 h-px bg-white/10" />
          </div>
          <h1 className="font-heading font-extrabold text-white text-3xl sm:text-4xl tracking-tight">
            PRA<span className="text-pitch-400">L</span>ES
          </h1>
        </div>

        {/* Challenge card */}
        <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {/* Team header */}
          <div className="px-6 pt-6 pb-4 text-center">
            <div className="flex justify-center">
              <BadgePreview
                primary={color}
                secondary={team.secondary_color || "#FFF"}
                pattern={(team.badge_pattern as BadgePattern) || "shield"}
                initials={initials}
                size={64}
              />
            </div>
            <h2 className="font-heading font-extrabold text-white text-2xl sm:text-3xl mt-3 mb-0.5">
              {team.name}
            </h2>
            <p className="text-white/40 text-sm">
              {team.village_name} &middot; {team.district}
              {position != null && <span> &middot; {position}. v lize</span>}
            </p>
          </div>

          {/* Manager challenge */}
          <div className="mx-4 mb-4 rounded-xl p-4 flex items-center gap-4" style={{ background: "rgba(255,255,255,0.04)" }}>
            {manager?.avatar && typeof manager.avatar === "object" && Object.keys(manager.avatar).length > 2 ? (
              <FaceAvatar faceConfig={manager.avatar} size={56} className="shrink-0 rounded-xl bg-white/5" />
            ) : (
              <div className="shrink-0 w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center text-white font-heading font-bold text-xl">
                {managerName[0]}
              </div>
            )}
            <div>
              <p className="text-white font-heading font-bold text-base">{managerName}</p>
              <p className="text-white/50 text-sm">{`t\u011B vyz\u00FDv\u00E1 do souboje!`}</p>
            </div>
          </div>

          <div className="px-4 pb-4 text-center">
            <p className="text-white/40 text-sm mb-5">
              {`Zalo\u017E si t\u00FDm v okresu ${team.district} a utkej se o titul.`}
            </p>

            <Link href="/register" className="btn btn-primary-dark btn-xl w-full text-base font-bold">
              {`P\u0159ijmout v\u00FDzvu \u2192`}
            </Link>
            <p className="text-white/15 text-xs mt-2.5">
              {`Zdarma. Bez karet, bez z\u00E1vazk\u016F.`}
            </p>
          </div>
        </div>

        {/* What is this */}
        <div className="space-y-2 mb-5">
          <Feature text={`Postav fotbalov\u00FD t\u00FDm v re\u00E1ln\u00E9 \u010Desk\u00E9 obci`} />
          <Feature text={`Ka\u017Ed\u00FD hr\u00E1\u010D m\u00E1 sv\u016Fj \u017Eivot \u2014 pr\u00E1ci, rodinu i v\u00FDmluvy`} />
          <Feature text={`Odtr\u00E9nuj sez\u00F3nu a vyhraj okresn\u00ED p\u0159ebor`} />
          <Feature text={`Hraj proti kamar\u00E1d\u016Fm ze stejn\u00E9ho okresu`} />
        </div>

        {/* Early access note */}
        <div className="rounded-xl px-4 py-3 mb-8 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-white/40 text-xs leading-relaxed">
            {`\u{1F331} Prob\u00EDh\u00E1 prvn\u00ED testovac\u00ED sez\u00F3na. Hra se aktivn\u011B vyv\u00EDj\u00ED \u2014 tv\u016Fj feedback pom\u016F\u017Ee utv\u00E1\u0159et budouc\u00ED verze.`}
          </p>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-white/20 text-xs">
            {`U\u017E m\u00E1\u0161 \u00FA\u010Det? `}
            <Link href="/login" className="text-pitch-400 hover:text-pitch-300 underline">
              {`P\u0159ihl\u00E1sit se`}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
      <span className="text-pitch-400 text-sm shrink-0">{"\u2714"}</span>
      <span className="text-white/60 text-sm">{text}</span>
    </div>
  );
}
