"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";
import { Spinner } from "@/components/ui";
import { PhoneFrame } from "@/components/phone/phone-frame";
import { BadgePreview, type BadgePattern } from "@/components/ui/badge-preview";

type SenderBadge = {
  primary: string;
  secondary: string;
  pattern: string;
  initials: string;
  symbol: string | null;
};

interface Message {
  id: string;
  body: string;
  sentAt: string;
  // 1:1 conversations:
  senderType?: "player" | "manager" | "system" | "user";
  senderId?: string | null;
  senderName?: string;
  metadata?: Record<string, unknown> | null;
  read?: boolean;
  // group chats:
  senderTeamId?: string;
  senderTeamName?: string | null;
  senderBadge?: SenderBadge;
}

interface ConvInfo {
  id: string;
  type: string;
  title: string;
  participantAvatar: Record<string, unknown> | null;
}

const EMOTICONS: [RegExp, string][] = [
  [/(?<!\w):-?\)/g, "\u{1F642}"],
  [/(?<!\w):-?\(/g, "\u{1F641}"],
  [/(?<!\w):-?D/g, "\u{1F604}"],
  [/(?<!\w):-?P/g, "\u{1F61B}"],
  [/(?<!\w);-?\)/g, "\u{1F609}"],
  [/(?<!\w):-?\|/g, "\u{1F610}"],
  [/(?<!\w):-?O/gi, "\u{1F62E}"],
  [/(?<!\w):-?\*/g, "\u{1F618}"],
  [/(?<!\w)<3(?!\d)/g, "\u{2764}\u{FE0F}"],
  [/(?<!\w):\'/g, "\u{1F622}"],
  [/(?<!\w)xD/gi, "\u{1F606}"],
];

function emoticonize(text: string): string {
  let result = text;
  for (const [pattern, emoji] of EMOTICONS) {
    result = result.replace(pattern, emoji);
  }
  return result;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("cs", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Dnes";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Včera";
  return d.toLocaleDateString("cs", { day: "numeric", month: "long" });
}

function isGroupChatId(id: string): boolean {
  return id === "global" || id.startsWith("league:");
}

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const { teamId } = useTeam();
  const convId = decodeURIComponent(params.id as string);
  const isGroup = isGroupChatId(convId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [conv, setConv] = useState<ConvInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const messagesUrl = isGroup
    ? `/api/teams/${teamId}/group-chats/${encodeURIComponent(convId)}/messages`
    : `/api/teams/${teamId}/conversations/${convId}`;

  useEffect(() => {
    if (!teamId) return;
    let stopped = false;

    const convListUrl = isGroup
      ? `/api/teams/${teamId}/conversations` // group chats are merged in
      : `/api/teams/${teamId}/conversations`;

    Promise.all([
      apiFetch<Message[]>(messagesUrl),
      apiFetch<ConvInfo[]>(convListUrl).then((all) => all.find((c) => c.id === convId) ?? null),
    ]).then(([msgs, c]) => {
      setMessages(msgs);
      setConv(c);
      setLoading(false);
    }).catch((e) => {
      const msg = e?.message ?? "";
      if (msg.includes("nenalezena") || msg.includes("nenalezen") || msg.includes("404")) {
        stopped = true;
        router.replace("/dashboard");
        return;
      }
      console.error("phone load messages:", e);
      setLoading(false);
    });

    const interval = setInterval(() => {
      if (stopped) return;
      apiFetch<Message[]>(messagesUrl)
        .then((msgs) => {
          setMessages((prev) => {
            if (msgs.length !== prev.length) return msgs;
            if (msgs.length > 0 && prev.length > 0 && msgs[msgs.length - 1].id !== prev[prev.length - 1].id) return msgs;
            return prev;
          });
        })
        .catch((e) => {
          const msg = e?.message ?? "";
          if (msg.includes("nenalezena") || msg.includes("nenalezen") || msg.includes("404")) {
            stopped = true;
            clearInterval(interval);
            return;
          }
          console.error("phone poll messages:", e);
        });
    }, 3000);
    return () => { stopped = true; clearInterval(interval); };
  }, [teamId, convId, router, isGroup, messagesUrl]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMsg.trim() || sending || !teamId) return;
    setSending(true);
    try {
      const res = await apiFetch<{ id: string; sentAt: string }>(messagesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newMsg.trim() }),
      });
      if (isGroup) {
        setMessages((prev) => [...prev, {
          id: res.id, body: newMsg.trim(), sentAt: res.sentAt,
          senderTeamId: teamId, senderTeamName: "Ty",
        }]);
      } else {
        setMessages((prev) => [...prev, {
          id: res.id, senderType: "user", senderId: teamId, senderName: "Ty",
          body: newMsg.trim(), metadata: null, sentAt: res.sentAt, read: true,
        }]);
      }
      setNewMsg("");
    } catch (e) { console.error("send message:", e); }
    setSending(false);
  };

  const grouped: Array<{ date: string; messages: Message[] }> = [];
  for (const msg of messages) {
    const date = formatDate(msg.sentAt);
    const last = grouped[grouped.length - 1];
    if (last?.date === date) last.messages.push(msg);
    else grouped.push({ date, messages: [msg] });
  }

  const headerEmoji = conv?.type === "squad_group" ? "\u{1F3BD}"
    : conv?.type === "global_group" ? "\u{1F310}"
    : conv?.type === "league_group" ? "\u{1F3C6}"
    : null;

  return (
    <PhoneFrame>
      {/* Header */}
      <div className="bg-pitch-600 text-white px-3 py-2.5 flex items-center gap-2.5 shrink-0">
        <button onClick={() => router.push("/dashboard/phone")} className="text-white/70 hover:text-white text-sm">
          &#8592;
        </button>
        {headerEmoji ? (
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-sm shrink-0">
            {headerEmoji}
          </div>
        ) : conv?.participantAvatar && Object.keys(conv.participantAvatar).length > 2 ? (
          <FaceAvatar faceConfig={conv.participantAvatar} size={28} className="rounded-full shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {conv?.title?.[0] ?? "?"}
          </div>
        )}
        <span className="font-heading font-bold text-sm truncate">{conv?.title ?? "..."}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-40"><Spinner /></div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center text-muted px-4">
            <p className="text-sm">{isGroup ? "Zatím žádné zprávy. Buď první!" : "Žádné zprávy."}</p>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.date}>
              <div className="text-center mb-2">
                <span className="text-xs text-muted bg-gray-200/60 px-2.5 py-0.5 rounded-full">{group.date}</span>
              </div>
              <div className="space-y-2">
                {group.messages.map((msg) => {
                  if (isGroup) {
                    const isOwn = msg.senderTeamId === teamId;
                    const badge = msg.senderBadge;
                    return (
                      <div key={msg.id} className={`flex gap-1.5 ${isOwn ? "justify-end" : "justify-start"}`}>
                        {!isOwn && badge && (
                          <div className="shrink-0 self-end mb-0.5">
                            <BadgePreview
                              primary={badge.primary}
                              secondary={badge.secondary}
                              pattern={(badge.pattern || "shield") as BadgePattern}
                              initials={badge.initials || ""}
                              symbol={badge.symbol}
                              size={28}
                            />
                          </div>
                        )}
                        <div className="max-w-[75%]">
                          {!isOwn && msg.senderTeamId && (
                            <Link
                              href={`/dashboard/team/${msg.senderTeamId}`}
                              className="text-xs text-pitch-600 font-medium mb-0.5 ml-1 block hover:underline"
                            >
                              {msg.senderTeamName ?? "Tým"}
                            </Link>
                          )}
                          <div className={`px-3 py-2 rounded-2xl text-[13px] leading-snug ${
                            isOwn
                              ? "bg-pitch-500 text-white rounded-br-sm"
                              : "bg-white shadow-sm rounded-bl-sm"
                          }`}>
                            <p className="whitespace-pre-wrap">{emoticonize(msg.body)}</p>
                            <div className={`text-[9px] mt-0.5 ${isOwn ? "text-white/50" : "text-muted"} text-right`}>
                              {formatTime(msg.sentAt)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const isUser = msg.senderType === "user";
                  const isSystem = msg.senderType === "system";

                  if (isSystem && conv?.type === "squad_group") {
                    return (
                      <div key={msg.id} className="text-center py-1">
                        <span className="text-xs text-muted italic">{emoticonize(msg.body)}</span>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <div className="max-w-[75%]">
                        {!isUser && (conv?.type === "squad_group") && (
                          <div className="text-xs text-pitch-600 font-medium mb-0.5 ml-2">{msg.senderName}</div>
                        )}
                        <div className={`px-3 py-2 rounded-2xl text-[13px] leading-snug ${
                          isUser
                            ? "bg-pitch-500 text-white rounded-br-sm"
                            : "bg-white shadow-sm rounded-bl-sm"
                        }`}>
                          <p className="whitespace-pre-wrap">{emoticonize(msg.body)}</p>
                          <div className={`text-[9px] mt-0.5 ${isUser ? "text-white/50" : "text-muted"} text-right`}>
                            {formatTime(msg.sentAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-100 px-3 py-2 flex gap-2 shrink-0">
        <input
          type="text"
          value={newMsg}
          onChange={(e) => setNewMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="Napiš zprávu..."
          className="flex-1 bg-gray-100 rounded-full px-3 py-2 text-base outline-none focus:ring-2 focus:ring-pitch-500/30"
        />
        <button
          onClick={handleSend}
          disabled={!newMsg.trim() || sending}
          className="shrink-0 w-8 h-8 rounded-full bg-pitch-500 text-white flex items-center justify-center disabled:opacity-40 text-xs"
        >
          &#9654;
        </button>
      </div>
    </PhoneFrame>
  );
}
