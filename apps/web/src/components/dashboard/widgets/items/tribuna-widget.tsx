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
import { ListRow, type RowTone } from "@/components/ui";
import type { WidgetProps } from "../types";

/**
 * Tón příspěvku jako proužek vlevo: zelený u pochvaly, červený u nadávky, neutrální bez proužku.
 * Klíče jsou hodnoty `tone` z API. „new“ je tu jen zelená barva proužku, ne „nepřečtené“.
 */
const POST_TONE: Record<string, RowTone | undefined> = {
  pozitivni: "new",
  negativni: "danger",
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
      <div className="text-sm text-muted text-center py-4">
        Na Tribuně zatím nikdo nic nenapsal.
      </div>
    );
  }

  // Nálada zeře: kolik z posledních příspěvků je proti tobě.
  const zapornych = posts.filter((p) => p.tone === "negativni").length;
  const podil = Math.round((zapornych / posts.length) * 100);

  return (
    <div>
      <div className="flex justify-end mb-2">
        <span className={`text-xs font-semibold ${podil >= 60 ? "text-card-red" : podil <= 20 ? "text-pitch-600" : "text-muted"}`}>
          {podil} % negativních
        </span>
      </div>

      <div className="-mx-4 sm:-mx-5">
        {posts.slice(0, 5).map((p) => (
          <ListRow key={p.id} dense tone={POST_TONE[p.tone]}
            leading={
              p.avatar ? (
                <span className="w-6 h-6 rounded-full overflow-hidden bg-surface-3 flex items-center justify-center">
                  <FaceAvatar faceConfig={p.avatar} size={20} />
                </span>
              ) : (
                <span className="w-6 h-6 rounded-full bg-surface-3 text-ink-light flex items-center justify-center text-micro font-heading font-bold">
                  {p.author.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"}
                </span>
              )
            }
            title={<>{p.author} <span className="text-meta font-normal text-muted">· {pred(p.createdAt)}</span></>}
            detail={<span className="break-words">{p.body}</span>} />
        ))}
      </div>

      <Link href="/telefon" className="block mt-3 text-xs text-pitch-600 font-semibold hover:underline text-center">
        Celá Tribuna v telefonu →
      </Link>
    </div>
  );
}
