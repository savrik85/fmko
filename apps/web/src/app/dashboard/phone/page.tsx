"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";
import { Spinner } from "@/components/ui";
import { PhoneFrame } from "@/components/phone/phone-frame";

interface Conversation {
  id: string;
  type: "squad_group" | "player" | "manager" | "system";
  title: string;
  participantId: string | null;
  participantAvatar: Record<string, unknown> | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  pinned: boolean;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "teď";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function PhonePage() {
  const { teamId } = useTeam();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<Conversation[]>(`/api/teams/${teamId}/conversations`)
      .then((data) => { setConversations(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [teamId]);

  return (
    <PhoneFrame>
      {/* Status bar */}
      <div className="bg-pitch-600 text-white px-4 py-2.5 flex items-center justify-between">
        <span className="font-heading font-bold text-sm">Zprávy</span>
        <span className="text-xs text-white/60">
          {conversations.reduce((s, c) => s + c.unreadCount, 0)} nepřečtených
        </span>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-40"><Spinner /></div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-muted">
            <p className="text-base mb-1">Žádné zprávy</p>
            <p className="text-sm">Zprávy se objeví zde.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/dashboard/phone/${conv.id}`}
                className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white ${conv.unreadCount > 0 ? "bg-white" : ""}`}
              >
                {/* Avatar */}
                <div className="shrink-0">
                  {conv.type === "squad_group" ? (
                    <div className="w-10 h-10 rounded-full bg-pitch-500 flex items-center justify-center text-white text-base">
                      {"\u{1F3BD}"}
                    </div>
                  ) : conv.participantAvatar && Object.keys(conv.participantAvatar).length > 2 ? (
                    <FaceAvatar faceConfig={conv.participantAvatar} size={40} className="rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-heading font-bold text-xs">
                      {conv.title.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-[13px] truncate ${conv.unreadCount > 0 ? "font-bold text-ink" : "font-medium text-ink"}`}>
                      {conv.title}
                    </span>
                    <span className="text-xs text-muted shrink-0 ml-2">
                      {timeAgo(conv.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className={`text-xs truncate ${conv.unreadCount > 0 ? "text-ink" : "text-muted"}`}>
                      {conv.lastMessageText || "Žádné zprávy"}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="shrink-0 ml-2 bg-pitch-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PhoneFrame>
  );
}
