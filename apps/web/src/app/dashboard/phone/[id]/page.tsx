"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";
import { Spinner } from "@/components/ui";
import { PhoneFrame } from "@/components/phone/phone-frame";

interface Message {
  id: string;
  senderType: "player" | "manager" | "system" | "user";
  senderId: string | null;
  senderName: string;
  body: string;
  metadata: Record<string, unknown> | null;
  sentAt: string;
  read: boolean;
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

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const { teamId } = useTeam();
  const convId = params.id as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [conv, setConv] = useState<ConvInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!teamId) return;
    let stopped = false;
    Promise.all([
      apiFetch<Message[]>(`/api/teams/${teamId}/conversations/${convId}`),
      apiFetch<ConvInfo[]>(`/api/teams/${teamId}/conversations`).then((all) => all.find((c) => c.id === convId) ?? null),
    ]).then(([msgs, c]) => {
      setMessages(msgs);
      setConv(c);
      setLoading(false);
    }).catch((e) => {
      // 404 = konverzace neexistuje nebo nepatří uživateli → redirect
      const msg = e?.message ?? "";
      if (msg.includes("nenalezena") || msg.includes("404")) {
        stopped = true;
        router.replace("/dashboard");
        return;
      }
      console.error("phone load messages:", e);
      setLoading(false);
    });

    // Poll for new messages every 3s — zastavit po 404
    const interval = setInterval(() => {
      if (stopped) return;
      apiFetch<Message[]>(`/api/teams/${teamId}/conversations/${convId}`)
        .then((msgs) => {
          setMessages((prev) => {
            if (msgs.length !== prev.length) return msgs;
            if (msgs.length > 0 && prev.length > 0 && msgs[msgs.length - 1].id !== prev[prev.length - 1].id) return msgs;
            return prev;
          });
        })
        .catch((e) => {
          const msg = e?.message ?? "";
          if (msg.includes("nenalezena") || msg.includes("404")) {
            // Konverzace zmizela — zastavit poll, tiše
            stopped = true;
            clearInterval(interval);
            return;
          }
          console.error("phone poll messages:", e);
        });
    }, 3000);
    return () => { stopped = true; clearInterval(interval); };
  }, [teamId, convId, router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMsg.trim() || sending || !teamId) return;
    setSending(true);
    try {
      const res = await apiFetch<{ id: string; sentAt: string }>(`/api/teams/${teamId}/conversations/${convId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newMsg.trim() }),
      });
      setMessages((prev) => [...prev, {
        id: res.id, senderType: "user", senderId: teamId, senderName: "Ty",
        body: newMsg.trim(), metadata: null, sentAt: res.sentAt, read: true,
      }]);
      setNewMsg("");
    } catch (e) { console.error("send message:", e); }
    setSending(false);
  };

  // Group messages by date
  const grouped: Array<{ date: string; messages: Message[] }> = [];
  for (const msg of messages) {
    const date = formatDate(msg.sentAt);
    const last = grouped[grouped.length - 1];
    if (last?.date === date) last.messages.push(msg);
    else grouped.push({ date, messages: [msg] });
  }

  return (
    <PhoneFrame>
      {/* Header */}
      <div className="bg-pitch-600 text-white px-3 py-2.5 flex items-center gap-2.5 shrink-0">
        <button onClick={() => router.push("/dashboard/phone")} className="text-white/70 hover:text-white text-sm">
          &#8592;
        </button>
        {conv?.participantAvatar && Object.keys(conv.participantAvatar).length > 2 ? (
          <FaceAvatar faceConfig={conv.participantAvatar} size={28} className="rounded-full shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {conv?.type === "squad_group" ? "\u{1F3BD}" : (conv?.title?.[0] ?? "?")}
          </div>
        )}
        <span className="font-heading font-bold text-sm truncate">{conv?.title ?? "..."}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-40"><Spinner /></div>
        ) : (
          grouped.map((group) => (
            <div key={group.date}>
              <div className="text-center mb-2">
                <span className="text-xs text-muted bg-gray-200/60 px-2.5 py-0.5 rounded-full">{group.date}</span>
              </div>
              <div className="space-y-1">
                {group.messages.map((msg) => {
                  const isUser = msg.senderType === "user";
                  const isSystem = msg.senderType === "system";

                  // System announcements in group chats → centered label
                  if (isSystem && conv?.type === "squad_group") {
                    return (
                      <div key={msg.id} className="text-center py-1">
                        <span className="text-xs text-muted italic">{emoticonize(msg.body)}</span>
                      </div>
                    );
                  }

                  // Everything else → SMS bubble (left=incoming, right=user sent)
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
