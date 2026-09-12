"use client";

/**
 * „Co si o nás píšou" — poslední příspěvky z Tribuny.
 *
 * Nálada part je na stránce fanoušků jako číslo a graf. Tohle je ta samá věc
 * hlasem lidí, a hlavně na nástěnce, kde se hráč dívá první. Plný text a filtry
 * jsou v telefonu, tady se vejde jen špička.
 */

import Link from "next/link";
import { FaceAvatar } from "@/components/players/face-avatar";
import type { WidgetProps } from "../types";

const TON_PRUH: Record<string, string> = {
  pozitivni: "border-l-pitch-500",
  negativni: "border-l-card-red",
  neutralni: "border-l-gray-200",
};

function pred(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (!Number.isFinite(min)) return "";
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

export function TribunaWidget({ data }: WidgetProps) {
  const posts = data.fanFeed.data ?? [];

  if (posts.length === 0) {
    return (
      <div className="card p-4 sm:p-5 text-sm text-muted text-center">
        Na Tribuně zatím nikdo nic nenapsal.
      </div>
    );
  }

  // Nálada zeře: kolik z posledních příspěvků je proti tobě.
  const zapornych = posts.filter((p) => p.tone === "negativni").length;
  const podil = Math.round((zapornych / posts.length) * 100);

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="font-heading font-bold text-sm uppercase tracking-wide text-muted">
          Co si o nás píšou
        </h3>
        <span className={`text-xs font-semibold ${podil >= 60 ? "text-card-red" : podil <= 20 ? "text-pitch-600" : "text-muted"}`}>
          {podil} % negativních
        </span>
      </div>

      <div className="space-y-2">
        {posts.slice(0, 5).map((p) => (
          <article key={p.id} className={`flex gap-2.5 pl-2 border-l-4 ${TON_PRUH[p.tone] ?? "border-l-gray-200"}`}>
            {p.avatar ? (
              <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
                <FaceAvatar faceConfig={p.avatar} size={27} />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-200 text-ink-light flex items-center justify-center text-xs font-heading font-bold shrink-0">
                {p.author.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-heading font-bold text-sm text-ink truncate">{p.author}</span>
                <span className="text-xs text-muted shrink-0">· {pred(p.createdAt)}</span>
              </div>
              <p className="text-sm text-ink-light leading-snug break-words">{p.body}</p>
            </div>
          </article>
        ))}
      </div>

      <Link href="/dashboard/phone" className="block mt-3 text-xs text-pitch-600 font-semibold hover:underline text-center">
        Celá Tribuna v telefonu →
      </Link>
    </div>
  );
}
