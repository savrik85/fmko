"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";
import { Spinner } from "@/components/ui";
import { PhoneFrame } from "@/components/phone/phone-frame";
import { SponsorLink } from "@/components/sponsors/sponsor-link";
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
  senderManagerName?: string | null;
  senderManagerAvatar?: Record<string, unknown> | null;
}

interface ConvInfo {
  id: string;
  type: string;
  title: string;
  participantAvatar: Record<string, unknown> | null;
}

interface AiThreadState {
  awaiting: "coach" | "player" | "done";
  scenarioId?: string;
  resolution?: {
    summary?: string;
    tone?: "positive" | "negative" | "neutral";
    offended?: boolean;
  } | null;
}

interface UnrestInfo {
  level: number;
  teamName?: string;
  mood?: string;
  actions: { id: string; label: string; description: string }[];
}

interface ConvDetailResponse {
  messages: Message[];
  /** Hlavička konverzace — chodí s detailem, ne ze seznamu. */
  conversation?: ConvInfo;
  /** Má se na druhé straně kdo ozvat? Rozhoduje server. */
  canReply?: boolean;
  /** `sms` stojí kredit, `imessage` je zdarma, `null` = jednosměrné oznámení. */
  channel?: "sms" | "imessage" | null;
  /** Proč se psát nedá — formuluje server, zná kontext odesílatele. */
  replyHint?: string;
  replyHintHref?: string;
  /** Text odkazu k nápovědě, formuluje server. */
  replyHintLabel?: string;
  aiThreadActive: boolean;
  aiThreadState: AiThreadState | null;
  participantId?: string | null;
  unrest?: UnrestInfo | null;
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

/** Hotová odpověď na SMS od majitele firmy (`messages.metadata.options`). */
interface OwnerOption {
  id: string;
  label: string;
  text: string;
}

function ownerOptionsOf(msg: Message | undefined): OwnerOption[] {
  const meta = msg?.metadata;
  if (!meta || meta.type !== "sponsor_owner" || !Array.isArray(meta.options)) return [];
  return (meta.options as unknown[]).filter((o): o is OwnerOption => {
    const x = o as Partial<OwnerOption> | null;
    return !!x && typeof x.id === "string" && typeof x.label === "string" && typeof x.text === "string";
  });
}

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const { teamId } = useTeam();
  const convId = decodeURIComponent(params.id as string);
  const isGroup = isGroupChatId(convId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [conv, setConv] = useState<ConvInfo | null>(null);
  const [aiThreadState, setAiThreadState] = useState<AiThreadState | null>(null);
  const [aiThreadActive, setAiThreadActive] = useState(false);
  const [unrest, setUnrest] = useState<UnrestInfo | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [unrestBusy, setUnrestBusy] = useState(false);
  const [unrestEffects, setUnrestEffects] = useState<string[] | null>(null);
  // Rozhovory, které ještě čekají na odpověď — jen u nich má proklik smysl.
  // Bez toho by tlačítko viselo i u dávno vypršelých žádostí z minulých sezón.
  const [otevreneRozhovory, setOtevreneRozhovory] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  /** Svítí „píše…". Naskakuje s odstupem, ne hned po odeslání. */
  const [pise, setPise] = useState(false);
  const [credit, setCredit] = useState<{ zbyva: number; cenaSms: number; zprav: number } | null>(null);
  // Skupinové chaty vlastní detail endpoint nemají — tam se píše vždycky.
  const [canReply, setCanReply] = useState(true);
  const [channel, setChannel] = useState<"sms" | "imessage" | null>("imessage");
  const [replyHint, setReplyHint] = useState<{ text: string; href?: string; label?: string } | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const messagesUrl = isGroup
    ? `/api/teams/${teamId}/group-chats/${encodeURIComponent(convId)}/messages`
    : `/api/teams/${teamId}/conversations/${convId}`;

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ interviews: Array<{ id: string }> }>(`/api/teams/${teamId}/coach-interviews`)
      .then((d) => setOtevreneRozhovory(new Set((d.interviews ?? []).map((iv) => iv.id))))
      .catch((e) => { console.error("otevřené rozhovory:", e); });
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    let stopped = false;

    const convListUrl = isGroup
      ? `/api/teams/${teamId}/conversations` // group chats are merged in
      : `/api/teams/${teamId}/conversations`;

    const fetchMessages = (): Promise<{ msgs: Message[]; ai: { active: boolean; state: AiThreadState | null } }> => {
      if (isGroup) {
        return apiFetch<Message[]>(messagesUrl).then((msgs) => ({ msgs, ai: { active: false, state: null } }));
      }
      return apiFetch<ConvDetailResponse>(messagesUrl).then((res) => {
        setUnrest(res.unrest ?? null);
        setParticipantId(res.participantId ?? null);
        // Přednost má hlavička z detailu — seznam může být o krok pozadu
        // a čerstvě založená konverzace v něm ještě není.
        if (res.conversation) setConv(res.conversation);
        setCanReply(res.canReply !== false);
        setChannel(res.channel ?? null);
        setReplyHint(res.replyHint ? { text: res.replyHint, href: res.replyHintHref, label: res.replyHintLabel } : null);
        return {
          msgs: res.messages,
          ai: { active: res.aiThreadActive, state: res.aiThreadState },
        };
      });
    };

    Promise.all([
      fetchMessages(),
      apiFetch<ConvInfo[]>(convListUrl).then((all) => all.find((c) => c.id === convId) ?? null),
    ]).then(([{ msgs, ai }, c]) => {
      setMessages(msgs);
      setAiThreadActive(ai.active);
      setAiThreadState(ai.state);
      // Jen záloha pro skupinové chaty, které vlastní detail endpoint nemají —
      // u ostatních už hlavičku nastavil `fetchMessages` z čerstvých dat.
      if (c) setConv((stav) => stav ?? c);
      setLoading(false);
    }).catch((e) => {
      const msg = e?.message ?? "";
      if (msg.includes("nenalezena") || msg.includes("nenalezen") || msg.includes("404")) {
        stopped = true;
        router.replace("/prehled");
        return;
      }
      console.error("phone load messages:", e);
      setLoading(false);
    });

    const interval = setInterval(() => {
      if (stopped) return;
      fetchMessages()
        .then(({ msgs, ai }) => {
          setAiThreadActive(ai.active);
          setAiThreadState(ai.state);
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


  // O kanálu i o tom, jestli se dá psát, rozhoduje server.
  const platiSeKredit = !isGroup && channel === "sms";
  // Psaní blokuje jedině to, že hráč zrovna odpovídá. Uzavřené vlákno ne —
  // trenér mu smí napsat znovu a začít nové.
  const cekaSeNaHrace = aiThreadActive && aiThreadState?.awaiting === "player";
  // „Píše" nenaskočí hned. V reálném chatu je nejdřív ticho, než si druhý
  // zprávy všimne, a teprve pak se rozblikají tečky.
  useEffect(() => {
    if (!cekaSeNaHrace) { setPise(false); return; }
    const t = setTimeout(() => setPise(true), 1800);
    return () => clearTimeout(t);
  }, [cekaSeNaHrace]);
  // Zbylá koruna je z pohledu hráče stejně došlý kredit — na zprávu nestačí.
  const nemaNaSms = platiSeKredit && !!credit && credit.zbyva < credit.cenaSms;
  /*
   * Co jde přes data, je zdarma; co jde přes operátora, stojí kredit.
   * Hráči a kabina = SMS (odpovídá model, platí se). Vůdce kotle, svaz
   * a druhý trenér = iMessage. Barva bubliny to řekne bez čtení: modrá
   * data, zelená SMS — přesně jak to lidi znají z telefonu.
   */
  const jeImessage = isGroup || channel === "imessage";
  const mojeBublina = jeImessage ? "bg-blue-500 text-white" : "bg-pitch-500 text-white";
  const lzePsat = isGroup || canReply;
  // Tlačítka jen pod poslední zprávou, dokud majitel čeká odpověď.
  const nabidkaOdpovedi = !isGroup && aiThreadActive && canReply ? ownerOptionsOf(messages[messages.length - 1]) : [];
  // Majitel firmy — jméno v hlavičce vede na jeho stránku (`participantId` = `so-{sponsorId}`).
  const ownerSponsorId = participantId?.startsWith("so-") ? Number(participantId.slice(3)) : null;

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ zbyva: number; cenaSms: number; zprav: number }>(`/api/teams/${teamId}/phone-credit`)
      .then(setCredit)
      .catch((e) => console.error("načtení kreditu:", e));
  }, [teamId]);

  const handleSend = async () => {
    if (!newMsg.trim() || sending || !teamId) return;
    setSending(true);
    setCreditError(null);
    try {
      const res = await apiFetch<{ id: string; sentAt: string; credit?: { zbyva: number; cenaSms: number; zprav: number } }>(messagesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newMsg.trim() }),
      });
      if (res.credit) setCredit(res.credit);
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
    } catch (e) {
      console.error("send message:", e);
      // Došlý kredit je běžný stav, ne chyba k reportování — patří k vstupnímu poli.
      const zprava = (e as { message?: string }).message ?? "";
      setCreditError(zprava.includes("kredit") ? zprava : "Zprávu se nepodařilo odeslat.");
    }
    setSending(false);
  };

  const handleUnrestAction = async (actionId: string) => {
    if (!teamId || !participantId || unrestBusy) return;
    setUnrestBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; effects?: string[]; unrestLevel?: number }>(
        `/api/teams/${teamId}/players/${participantId}/unrest-talk`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionId }) },
      );
      setUnrestEffects(res.effects ?? null);
      // Zprávy (trenér + odpověď hráče) vložil server — načíst čerstvě
      const fresh = await apiFetch<ConvDetailResponse>(messagesUrl);
      setMessages(fresh.messages);
      setUnrest(fresh.unrest ?? null);
    } catch (e) {
      console.error("unrest action:", e);
      setUnrestEffects([e instanceof Error ? e.message : "Akce se nezdařila"]);
    }
    setUnrestBusy(false);
  };

  const handleOwnerOption = async (opt: OwnerOption) => {
    if (!teamId || sending) return;
    setSending(true);
    setCreditError(null);
    try {
      await apiFetch(messagesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: opt.text, optionId: opt.id }),
      });
      // Odpověď majitele vložil server hned, stačí načíst detail znovu.
      const fresh = await apiFetch<ConvDetailResponse>(messagesUrl);
      setMessages(fresh.messages);
      setAiThreadActive(fresh.aiThreadActive);
      setAiThreadState(fresh.aiThreadState);
      setCanReply(fresh.canReply !== false);
      setChannel(fresh.channel ?? null);
      setReplyHint(fresh.replyHint ? { text: fresh.replyHint, href: fresh.replyHintHref, label: fresh.replyHintLabel } : null);
    } catch (e) {
      console.error("odpověď majiteli firmy:", e);
      setCreditError("Odpověď se nepodařilo odeslat.");
    }
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
      <div className="bg-[#1c1c1e] text-white px-3 py-2.5 flex items-center gap-2.5 shrink-0">
        <button onClick={() => router.push("/telefon")} className="text-white/70 hover:text-white text-sm">
          &#8592;
        </button>
        {headerEmoji ? (
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-sm shrink-0">
            {headerEmoji}
          </div>
        ) : conv?.participantAvatar && Object.keys(conv.participantAvatar).length > 2 ? (
          <FaceAvatar faceConfig={conv.participantAvatar} size={28} className="rounded-full shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {conv?.title?.[0] ?? "?"}
          </div>
        )}
        {ownerSponsorId ? (
          <SponsorLink id={ownerSponsorId} name={conv?.title ?? "..."} className="font-heading font-bold text-sm truncate" />
        ) : (
          <span className="font-heading font-bold text-sm truncate">{conv?.title ?? "..."}</span>
        )}
        {/* Kredit je hned pod hlavičkou u vstupního pole, kde je i cena zprávy —
            druhá pilulka nahoře z lišty dělala změť. */}
        {credit && (
          <span
            className={`ml-auto shrink-0 text-sm tabular-nums ${
              credit.zbyva < credit.cenaSms ? "text-card-yellow font-semibold" : "text-white/70"
            }`}
          >
            {credit.zbyva} Kč
          </span>
        )}
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
                <span className="text-sm text-muted bg-gray-200/60 px-2.5 py-0.5 rounded-full">{group.date}</span>
              </div>
              <div className="space-y-2">
                {group.messages.map((msg) => {
                  if (isGroup) {
                    const isOwn = msg.senderTeamId === teamId;
                    const avatar = msg.senderManagerAvatar;
                    const hasFaceAvatar = avatar && Object.keys(avatar).length > 2;
                    const initialsFallback = (msg.senderManagerName ?? msg.senderTeamName ?? "?")
                      .split(" ").map((w) => w[0]).slice(0, 2).join("");
                    return (
                      <div key={msg.id} className={`flex gap-1.5 ${isOwn ? "justify-end" : "justify-start"}`}>
                        {!isOwn && (
                          <div className="shrink-0 self-end mb-0.5">
                            {hasFaceAvatar ? (
                              <FaceAvatar faceConfig={avatar} size={32} className="rounded-full" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-heading font-bold text-sm">
                                {initialsFallback}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="max-w-[75%]">
                          {!isOwn && msg.senderTeamId && (
                            <Link
                              href={`/tym/${msg.senderTeamId}`}
                              className="text-sm text-pitch-600 font-medium mb-0.5 ml-1 block hover:underline"
                            >
                              {msg.senderManagerName
                                ? `${msg.senderManagerName}${msg.senderTeamName ? ` (${msg.senderTeamName})` : ""}`
                                : (msg.senderTeamName ?? "Tým")}
                            </Link>
                          )}
                          <div className={`px-3 py-2 rounded-2xl text-[13px] leading-snug ${
                            isOwn
                              ? "bg-pitch-500 text-white rounded-br-tight"
                              : "bg-white shadow-sm rounded-bl-tight"
                          }`}>
                            <p className="whitespace-pre-wrap">{emoticonize(msg.body)}</p>
                            <div className={`text-sm mt-0.5 ${isOwn ? "text-white/50" : "text-muted"} text-right`}>
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
                        <span className="text-sm text-muted italic">{emoticonize(msg.body)}</span>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      {/* Oznámení z redakce a od svazu jsou jednosměrná — bublina na 75 %
                          by tam nechala mrtvý pruh a dlouhé titulky lámala do sloupce. */}
                      <div className={isSystem ? "w-full" : "max-w-[75%]"}>
                        {!isUser && (conv?.type === "squad_group") && (
                          <div className="text-sm text-pitch-600 font-medium mb-0.5 ml-2">{msg.senderName}</div>
                        )}
                        <div className={`px-3 py-2 rounded-2xl text-[13px] leading-snug ${
                          isUser
                            ? `${mojeBublina} rounded-br-tight`
                            : "bg-white shadow-sm rounded-bl-tight"
                        }`}>
                          <p className="whitespace-pre-wrap">{emoticonize(msg.body)}</p>
                          {/* Žádost o rozhovor chodí SMS, ale formulář je na Událostech. */}
                          {msg.metadata?.type === "interview_request"
                            && otevreneRozhovory.has(String(msg.metadata.interviewId ?? "")) && (
                            <Link
                              href={`/udalosti#rozhovor-${String(msg.metadata.interviewId ?? "")}`}
                              className="block mt-1.5 text-center rounded-xl bg-ink text-surface px-3 py-1.5 text-sm font-heading font-bold"
                            >
                              Otevřít rozhovor
                            </Link>
                          )}
                          {/* SMS o incidentu (Kustod, policie, hráč) vede na detail incidentu. */}
                          {msg.metadata?.type === "incident" && typeof msg.metadata.incidentId === "string" && (
                            <Link
                              href={`/incidenty?id=${encodeURIComponent(msg.metadata.incidentId)}`}
                              className="block mt-1.5 text-center rounded-xl bg-ink text-surface px-3 py-1.5 text-sm font-heading font-bold"
                            >
                              Otevřít incident
                            </Link>
                          )}
                          <div className={`text-sm mt-0.5 ${isUser ? "text-white/50" : "text-muted"} text-right`}>
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
        {pise && (
          <div className="flex justify-start">
            <div className="bg-white shadow-sm rounded-2xl rounded-bl-tight px-3 py-2 text-sm text-muted italic flex items-center gap-1.5">
              <span className="inline-flex gap-0.5">
                <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
              {(conv?.title ?? "Hráč").split(" ")[0]} píše…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Unrest — vážně trucující hráč: konkrétní dohody (řeči nestačily) */}
      {!isGroup && unrest && unrest.level >= 40 && !aiThreadActive && (
        <div className="bg-orange-50 border-t border-orange-200 px-3 py-2 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-heading font-bold text-orange-700">
              😠 Nespokojený{unrest.teamName ? ` (nabídka od ${unrest.teamName})` : ""} — {unrest.level}/100
            </span>
          </div>
          {unrest.mood && (
            <div className="text-sm italic text-orange-800/80 mb-1">&bdquo;{unrest.mood}&ldquo;</div>
          )}
          <div className="text-sm font-heading font-bold text-orange-700/70 uppercase tracking-wide mb-1.5">🤝 Nabídni mu něco konkrétního:</div>
          {unrestEffects && (
            <div className="mb-1.5 bg-white rounded-soft px-2.5 py-1.5 text-sm text-gray-700 space-y-0.5">
              {unrestEffects.map((ef, i) => <div key={i}>• {ef}</div>)}
              <button onClick={() => setUnrestEffects(null)} className="text-sm text-muted underline">skrýt</button>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {unrest.actions.map((a) => (
              <button
                key={a.id}
                onClick={() => handleUnrestAction(a.id)}
                disabled={unrestBusy}
                title={a.description}
                className="text-sm font-heading font-bold bg-white border border-orange-300 text-orange-800 rounded-full px-2.5 py-1 hover:bg-orange-100 transition-colors disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI thread done banner */}
      {aiThreadState?.awaiting === "done" && (
        <div className={`px-3 py-2 text-sm text-center border-t shrink-0 ${
          aiThreadState.resolution?.tone === "positive" ? "bg-pitch-50 text-pitch-700 border-pitch-200"
          : aiThreadState.resolution?.tone === "negative" ? "bg-red-50 text-red-700 border-red-200"
          : "bg-gray-50 text-gray-600 border-gray-200"
        }`}>
          <div className="font-medium">💬 Konverzace ukončena</div>
          {aiThreadState.resolution?.summary && (
            <div className="mt-0.5 text-sm opacity-80">{aiThreadState.resolution.summary}</div>
          )}
        </div>
      )}

      {/* Do jednosměrného oznámení se nepíše — vstupní pole by slibovalo odpověď,
          která nikdy nepřijde. Místo něj se rovnou řekne proč. */}
      {!lzePsat ? (
        <div className="bg-white border-t border-gray-100 px-3 py-3 shrink-0 text-center">
          <p className="text-sm text-muted leading-snug">
            {replyHint?.text ?? "Do téhle konverzace se odpovídat nedá."}
          </p>
          {replyHint?.href && (
            <Link href={replyHint.href} className="text-sm text-blue-600 font-medium mt-1 inline-block">
              {replyHint.label ?? "Otevřít"}
            </Link>
          )}
          {credit && (
            <p className="text-sm text-muted mt-1">Kredit {credit.zbyva} Kč</p>
          )}
        </div>
      ) : (
      <div className="bg-white border-t border-gray-100 px-3 py-2 shrink-0">
        {nabidkaOdpovedi.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-2">
            {nabidkaOdpovedi.map((o) => (
              <button
                key={o.id}
                onClick={() => handleOwnerOption(o)}
                disabled={sending}
                title={o.label}
                className="w-full text-left text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-2xl px-3 py-2 hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                {o.text}
              </button>
            ))}
          </div>
        )}
        {creditError && (
          <p className="text-sm text-card-red mb-1.5 px-1">{creditError}</p>
        )}
        {credit && !creditError && (
          <p className="text-sm text-muted mb-1.5 px-1 flex items-center gap-1.5">
            {jeImessage ? (
              <>
                <span className="text-blue-600 font-medium">iMessage</span>
                <span>· přes data, zdarma · kredit {credit.zbyva} Kč</span>
              </>
            ) : credit.zbyva >= credit.cenaSms ? (
              <>
                <span className="text-pitch-600 font-medium">SMS</span>
                <span>· {credit.cenaSms} Kč za zprávu · kredit {credit.zbyva} Kč</span>
              </>
            ) : (
              <span>Kredit {credit.zbyva} Kč — na SMS to nestačí. Dobije se zítra ráno.</span>
            )}
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={
              cekaSeNaHrace ? "Hráč píše…"
                : nemaNaSms ? "Došel kredit"
                  : jeImessage ? "iMessage"
                    : "SMS"
            }
            disabled={cekaSeNaHrace || nemaNaSms}
            className="flex-1 bg-gray-100 rounded-full px-3 py-2 text-base outline-none focus:ring-2 focus:ring-pitch-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!newMsg.trim() || sending || cekaSeNaHrace || nemaNaSms}
            className={`shrink-0 w-8 h-8 rounded-full text-white flex items-center justify-center disabled:opacity-40 text-sm self-end ${
              jeImessage ? "bg-blue-500" : "bg-pitch-500"
            }`}
          >
            &#9654;
          </button>
        </div>
      </div>
      )}
    </PhoneFrame>
  );
}
