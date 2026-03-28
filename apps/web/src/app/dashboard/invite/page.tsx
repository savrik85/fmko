"use client";

import { useState } from "react";
import { useTeam } from "@/context/team-context";
import { BadgePreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

export default function InvitePage() {
  const { teamId, teamName, villageName, district, leaguePosition, primaryColor, secondaryColor, badgePattern } = useTeam();
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteUrl = `${origin}/invite/${teamId}`;
  const color = primaryColor || "#2D5F2D";
  const initials = (teamName ?? "").split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const input = document.querySelector<HTMLInputElement>("#invite-url");
      if (input) { input.select(); document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    }
  }

  async function shareLink() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${teamName} te vyzyva! | Prales FM`,
          text: `Pridej se do okresniho preboru ${district} a ukaz mi, kdo je tu lepsi trener!`,
          url: inviteUrl,
        });
      } catch { /* user cancelled */ }
    } else {
      copyLink();
    }
  }

  return (
    <div className="page-container max-w-xl mx-auto space-y-6">
      {/* Hero card */}
      <div className="card overflow-hidden">
        <div className="px-6 pt-6 pb-5 text-center" style={{ background: `linear-gradient(135deg, ${color}18, ${color}08)` }}>
          <BadgePreview
            primary={color}
            secondary={secondaryColor || "#FFF"}
            pattern={(badgePattern as BadgePattern) || "shield"}
            initials={initials}
            size={56}
          />
          <h2 className="font-heading font-extrabold text-xl mt-3 mb-0.5">{teamName}</h2>
          <p className="text-sm text-muted">
            {villageName} &middot; {district}
            {leaguePosition != null && <span> &middot; {leaguePosition}. v lize</span>}
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-ink">
            Posli tento odkaz kamaradovi. Uvidi tvuj tym s vyzvou a muze si rovnou zalozit ucet ve tvem okresu.
          </p>

          {/* Link */}
          <div className="flex gap-2">
            <input
              id="invite-url"
              type="text"
              readOnly
              value={inviteUrl}
              className="input flex-1 text-sm font-mono bg-gray-50 truncate"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button onClick={copyLink} className="btn btn-primary shrink-0 min-w-[110px]">
              {copied ? "\u2714 Zkopirovano!" : "\u{1F4CB} Kopirovat"}
            </button>
          </div>

          {/* Share (mobile) */}
          <button onClick={shareLink} className="btn btn-secondary w-full">
            {"\u{1F4E4}"} Sdilet odkaz
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="card">
        <div className="px-6 py-5">
          <h3 className="font-heading font-bold text-sm text-muted uppercase tracking-wide mb-4">Jak to funguje</h3>
          <div className="space-y-3">
            <Step n={1} text="Posli odkaz kamaradovi pres SMS, WhatsApp nebo Messenger" />
            <Step n={2} text="Kamarad uvidi tvuj tym a vyzvu k zapasu" />
            <Step n={3} text={`Zaregistruje se a jeho tym se prida do okresu ${district}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-pitch-100 text-pitch-700 font-heading font-bold text-sm flex items-center justify-center shrink-0">{n}</div>
      <p className="text-sm text-ink pt-0.5">{text}</p>
    </div>
  );
}
