"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";
import { AutoGrowTextarea, Spinner } from "@/components/ui";
import { PhoneFrame } from "@/components/phone/phone-frame";
import { SponsorLink } from "@/components/sponsors/sponsor-link";
import { VoiceMessage } from "../VoiceMessage";
import { PlayerPhoto } from "../PlayerPhoto";
import { CoachVoiceRecorder, SendIcon, isVoiceRecordingSupported, type CoachVoiceNote } from "../CoachVoiceRecorder";
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
  /** Jak je naštvaný, slovy (čísla se nezobrazují, hra je simulace). */
  levelText?: string;
  teamName?: string;
  mood?: string;
  /** Proč chtěl odejít („penězům a lepšímu klubu“), u starších trucu chybí. */
  reasons?: string | null;
  /** Platný slib trenéra. */
  pledge?: string | null;
  /** V rozhovoru jde dohodu nabídnout jen, když je na tahu trenér. */
  canAct?: boolean;
  /** Proč teď dohoda nejde (už dnes byla jedna). */
  blockedText?: string | null;
  actions: { id: string; label: string; description: string; message: string }[];
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

/**
 * Telefon vypadá jako WhatsApp (přání 2026-10-24). Barvy jsou schválně mimo tokeny
 * hry, stejně jako rámeček telefonu: je to rekvizita, ne panel aplikace.
 */
const WA_BUBBLE_SHADOW = "shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]";
const WA_LINK_BUTTON = "block -mx-2.5 mt-1.5 border-t border-black/10 pt-1.5 pb-0.5 text-center text-sm font-medium text-[#027EB5]";
/** Barvy jmen ve skupinové konverzaci, jako ve WhatsAppu podle odesílatele. */
const WA_NAME_COLORS = ["#E5368B", "#1FA855", "#027EB5", "#A62C71", "#FA6533", "#5E47DE", "#C88B2A", "#00A5F4"];

function nameColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return WA_NAME_COLORS[h % WA_NAME_COLORS.length];
}

/** Ocásek u první bubliny v řadě zpráv od stejného odesílatele. */
function BubbleTail({ outgoing }: { outgoing: boolean }) {
  return outgoing ? (
    <svg viewBox="0 0 8 13" width="8" height="13" className="absolute top-0 -right-2 text-[#D9FDD3]" aria-hidden>
      <path fill="currentColor" d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z" />
    </svg>
  ) : (
    <svg viewBox="0 0 8 13" width="8" height="13" className="absolute top-0 -left-2 text-white" aria-hidden>
      <path fill="currentColor" d="M1.533 3.568 8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z" />
    </svg>
  );
}

/** Dvě fajfky: modré, když už druhá strana odpověděla (zprávu četla). */
function Ticks({ read }: { read: boolean }) {
  return (
    <svg viewBox="0 0 16 11" width="16" height="11" className={read ? "text-[#53BDEB]" : "text-[#8696A0]"} aria-label={read ? "Přečteno" : "Doručeno"}>
      <path fill="currentColor" d="M11.07.65 10.4.12a.46.46 0 0 0-.64.08L4.3 7.1 2.2 5.12a.46.46 0 0 0-.65.02L1 5.75a.46.46 0 0 0 .02.65l2.97 2.8a.46.46 0 0 0 .66-.04l6.5-7.9a.46.46 0 0 0-.08-.6z" />
      <path fill="currentColor" d="M15.07.65 14.4.12a.46.46 0 0 0-.64.08L8.3 7.1l-.83-.78-.72.88 1.27 1.2a.46.46 0 0 0 .66-.04l6.5-7.9a.46.46 0 0 0-.08-.6z" />
    </svg>
  );
}

function isGroupChatId(id: string): boolean {
  return id === "global" || id.startsWith("league:");
}

/** Hotová odpověď na SMS od majitele firmy nebo na pozvánku na okresní akci (`messages.metadata.options`). */
interface OwnerOption {
  id: string;
  label: string;
  text: string;
}

function ownerOptionsOf(msg: Message | undefined): OwnerOption[] {
  const meta = msg?.metadata;
  if (!meta || (meta.type !== "sponsor_owner" && meta.type !== "district_event") || !Array.isArray(meta.options)) return [];
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
  const [unrestError, setUnrestError] = useState<string | null>(null);
  // Seznam dohod je dlouhý: na mobilu by zakryl rozhovor, proto se rozbaluje až na klepnutí.
  const [unrestOpen, setUnrestOpen] = useState(false);
  // Rozhovory, které ještě čekají na odpověď — jen u nich má proklik smysl.
  // Bez toho by tlačítko viselo i u dávno vypršelých žádostí z minulých sezón.
  const [otevreneRozhovory, setOtevreneRozhovory] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  /** Svítí „píše…". Naskakuje s odstupem, ne hned po odeslání. */
  const [pise, setPise] = useState(false);
  /** Po rychlé odpovědi (majitel, dohoda) čekáme na odpověď, kterou server teprve skládá. */
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [credit, setCredit] = useState<{ zbyva: number; cenaSms: number; zprav: number } | null>(null);
  // Skupinové chaty vlastní detail endpoint nemají — tam se píše vždycky.
  const [canReply, setCanReply] = useState(true);
  const [channel, setChannel] = useState<"sms" | "imessage" | null>("imessage");
  const [replyHint, setReplyHint] = useState<{ text: string; href?: string; label?: string } | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);
  // Trenér nahrává nebo kontroluje hlasovou odpověď: řádek pro SMS ustoupí nahrávání.
  const [voiceActive, setVoiceActive] = useState(false);
  // MediaRecorder existuje až v prohlížeči, ne při renderu na serveru.
  const [voiceSupported, setVoiceSupported] = useState(false);
  useEffect(() => { setVoiceSupported(isVoiceRecordingSupported()); }, []);
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
            // „Přečteno“ bez odpovědi mění jen metadata existující zprávy, počet zůstává.
            if (msgs.some((m, i) => m.metadata?.readAt !== prev[i]?.metadata?.readAt)) return msgs;
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

  // Když pole pro psaní povyroste, ubere místo chatu. Poslední zpráva má zůstat vidět.
  const scrollToLatest = useCallback(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, []);


  // O kanálu i o tom, jestli se dá psát, rozhoduje server.
  const platiSeKredit = !isGroup && channel === "sms";
  // Psaní blokuje jedině to, že hráč zrovna odpovídá. Uzavřené vlákno ne —
  // trenér mu smí napsat znovu a začít nové.
  const cekaSeNaHrace = aiThreadActive && aiThreadState?.awaiting === "player";
  // „Píše" nenaskočí hned. V reálném chatu je nejdřív ticho, než si druhý
  // zprávy všimne, a teprve pak se rozblikají tečky.
  useEffect(() => {
    if (!cekaSeNaHrace && !awaitingReply) { setPise(false); return; }
    const t = setTimeout(() => setPise(true), awaitingReply ? 900 : 1800);
    return () => clearTimeout(t);
  }, [cekaSeNaHrace, awaitingReply]);
  // Zbylá koruna je z pohledu hráče stejně došlý kredit — na zprávu nestačí.
  const nemaNaSms = platiSeKredit && !!credit && credit.zbyva < credit.cenaSms;
  /*
   * Co jde přes data, je zdarma; co jde přes operátora, stojí kredit.
   * Hráči a kabina = SMS (odpovídá model, platí se). Vůdce kotle, svaz
   * a druhý trenér = iMessage. Barva bubliny to řekne bez čtení: modrá
   * data, zelená SMS — přesně jak to lidi znají z telefonu.
   */
  const jeImessage = isGroup || channel === "imessage";
  const lzePsat = isGroup || canReply;
  // Tlačítka jen dokud majitel čeká odpověď.
  // Hledá se zpětně: za čekající SMS mohla přibýt výměna o příspěvek (bez tlačítek).
  const nabidkaOdpovedi = !isGroup && aiThreadActive && canReply && !cekaSeNaHrace
    ? (messages.slice().reverse().map(ownerOptionsOf).find((o) => o.length > 0) ?? [])
    : [];
  // Dohody s hráčem, který chtěl odejít: jen když jdou (na tahu je trenér, dnes ještě žádná nebyla).
  const unrestDeals = !isGroup && canReply && unrest && unrest.level > 0 && !unrest.blockedText && unrest.canAct !== false
    ? unrest.actions
    : [];
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

  /** Hlasová odpověď: přepis jde jako text zprávy, nahrávka v `voice` (jinak stejně jako SMS). */
  const handleSendVoice = async (note: CoachVoiceNote) => {
    if (!teamId) return;
    setCreditError(null);
    const res = await apiFetch<{ id: string; sentAt: string; credit?: { zbyva: number; cenaSms: number; zprav: number } }>(messagesUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: note.transcript,
        voice: { audioKey: note.audioKey, durationSec: note.durationSec, peaks: note.peaks },
      }),
    });
    if (res.credit) setCredit(res.credit);
    setMessages((prev) => [...prev, {
      id: res.id, senderType: "user", senderId: teamId, senderName: "Ty", body: note.transcript,
      metadata: { type: "voice", durationSec: note.durationSec, peaks: note.peaks }, sentAt: res.sentAt, read: true,
    }]);
  };

  const handleUnrestAction = async (deal: { id: string; message: string }) => {
    if (!teamId || !participantId || unrestBusy) return;
    setUnrestBusy(true);
    setUnrestError(null);
    setUnrestOpen(false);
    const tmpId = showOwnMessage(deal.message);
    try {
      await apiFetch<{ ok: boolean }>(
        `/api/teams/${teamId}/players/${participantId}/unrest-talk`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: deal.id }) },
      );
      // Zprávy (trenér + odpověď hráče) vložil server — načíst čerstvě
      const fresh = await apiFetch<ConvDetailResponse>(messagesUrl);
      setMessages(fresh.messages);
      setUnrest(fresh.unrest ?? null);
      // Dohoda v rozhovoru: hráč teď odpovídá, ať se rozblikají tečky.
      setAiThreadActive(fresh.aiThreadActive);
      setAiThreadState(fresh.aiThreadState);
    } catch (e) {
      console.error("unrest action:", e);
      setMessages((prev) => prev.filter((m) => m.id !== tmpId));
      setUnrestError(e instanceof Error ? e.message : "Dohoda se nepovedla.");
    }
    setAwaitingReply(false);
    setUnrestBusy(false);
  };

  /**
   * Hotová SMS (rychlá odpověď): v konverzaci se ukáže hned, ne až po odpovědi serveru.
   * Server mezitím skládá odpověď druhé strany, a to trvá i několik sekund — dřív se
   * po klepnutí chvíli nedělo nic a vypadalo to, že tlačítko nefunguje.
   */
  const showOwnMessage = (text: string): string => {
    const id = `tmp-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id, senderType: "user", senderId: teamId ?? null, senderName: "Ty", body: text, metadata: null,
      sentAt: new Date().toISOString(), read: true,
    }]);
    setAwaitingReply(true);
    return id;
  };

  const handleOwnerOption = async (opt: OwnerOption) => {
    if (!teamId || sending) return;
    setSending(true);
    setCreditError(null);
    const tmpId = showOwnMessage(opt.text);
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
      console.error("hotová odpověď na SMS:", e);
      setMessages((prev) => prev.filter((m) => m.id !== tmpId));
      setCreditError("Odpověď se nepodařilo odeslat.");
    }
    setAwaitingReply(false);
    setSending(false);
  };

  // Moje zpráva je „přečtená", když na ni druhá strana už něco napsala, nebo když si ji
  // hráč jen přečetl a neodpověděl (`metadata.readAt`, api messaging/left-on-read.ts).
  const lastReplyAt = messages.reduce(
    (latest, m) => (m.senderType && m.senderType !== "user" && m.sentAt > latest ? m.sentAt : latest), "",
  );
  const isRead = (m: Message) => m.sentAt <= lastReplyAt || Boolean(m.metadata?.readAt);

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
      <div className="bg-[#008069] text-white px-3 py-2 flex items-center gap-2.5 shrink-0">
        {/* Šipka zpět jako ve WhatsAppu: bílá a výrazná, ne bledý znak. */}
        <button
          onClick={() => router.push("/telefon")}
          aria-label="Zpět na Telefon"
          className="-ml-1 w-8 h-8 shrink-0 flex items-center justify-center text-white"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden>
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </button>
        {headerEmoji ? (
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-sm shrink-0">
            {headerEmoji}
          </div>
        ) : conv?.participantAvatar && Object.keys(conv.participantAvatar).length > 2 ? (
          <FaceAvatar faceConfig={conv.participantAvatar} size={36} className="rounded-full shrink-0 bg-white/90" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {conv?.title?.[0] ?? "?"}
          </div>
        )}
        <div className="min-w-0 flex flex-col leading-tight">
          {ownerSponsorId ? (
            <SponsorLink
              id={ownerSponsorId} name={conv?.title ?? "..."} className="font-heading font-bold text-base truncate"
              hoverClassName="hover:text-white hover:underline"
            />
          ) : (
            <span className="font-heading font-bold text-base truncate">{conv?.title ?? "..."}</span>
          )}
          {/* Jako ve WhatsAppu: „píše…" pod jménem v hlavičce. */}
          {pise && <span className="text-sm text-white/85">píše…</span>}
        </div>
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
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 bg-[#EFEAE2]">
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
                <span className={`text-sm text-[#54656F] bg-white px-3 py-1 rounded-lg ${WA_BUBBLE_SHADOW}`}>{group.date}</span>
              </div>
              <div>
                {group.messages.map((msg, i) => {
                  const prev = group.messages[i - 1];
                  if (isGroup) {
                    const isOwn = msg.senderTeamId === teamId;
                    const first = !prev || prev.senderTeamId !== msg.senderTeamId;
                    const avatar = msg.senderManagerAvatar;
                    const hasFaceAvatar = avatar && Object.keys(avatar).length > 2;
                    const initialsFallback = (msg.senderManagerName ?? msg.senderTeamName ?? "?")
                      .split(" ").map((w) => w[0]).slice(0, 2).join("");
                    return (
                      <div key={msg.id} className={`flex gap-1.5 ${isOwn ? "justify-end" : "justify-start"} ${first ? "mt-2" : "mt-0.5"}`}>
                        {!isOwn && (
                          <div className={`shrink-0 self-start w-8 ${first ? "" : "invisible"}`}>
                            {hasFaceAvatar ? (
                              <FaceAvatar faceConfig={avatar} size={32} className="rounded-full" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-heading font-bold text-sm">
                                {initialsFallback}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="max-w-[80%]">
                          <div className={`relative px-2.5 pt-1.5 pb-1 rounded-lg text-sm leading-snug text-[#111B21] ${WA_BUBBLE_SHADOW} ${
                            isOwn ? "bg-[#D9FDD3]" : "bg-white"
                          } ${first ? (isOwn ? "rounded-tr-none" : "rounded-tl-none") : ""}`}>
                            {first && <BubbleTail outgoing={isOwn} />}
                            {/* Jméno odesílatele uvnitř bubliny barvou podle týmu, jako ve skupině na WhatsAppu. */}
                            {!isOwn && first && msg.senderTeamId && (
                              <Link
                                href={`/tym/${msg.senderTeamId}`}
                                className="text-sm font-medium block hover:underline truncate"
                                style={{ color: nameColor(msg.senderTeamId) }}
                              >
                                {msg.senderManagerName
                                  ? `${msg.senderManagerName}${msg.senderTeamName ? ` (${msg.senderTeamName})` : ""}`
                                  : (msg.senderTeamName ?? "Tým")}
                              </Link>
                            )}
                            <div className="relative">
                              <p className="whitespace-pre-wrap break-words">
                                {emoticonize(msg.body)}
                                <span className="inline-block w-12" aria-hidden />
                              </p>
                              <span className="absolute bottom-0 right-0 text-sm text-[#667781] leading-none">
                                {formatTime(msg.sentAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const isUser = msg.senderType === "user";
                  const isSystem = msg.senderType === "system";
                  // „Konverzace ukončena" se shrnutím se už nepíše a starší se neukazují (uživatel 2026-10-24):
                  // jak rozhovor dopadl, je vidět ve vztahu v profilu hráče.
                  if (isSystem && msg.body.startsWith("💬 Konverzace ukončena")) return null;
                  const first = !prev || prev.senderType !== msg.senderType
                    || (conv?.type === "squad_group" && prev.senderName !== msg.senderName);
                  const isVoice = msg.metadata?.type === "voice" && !!teamId;

                  if (isSystem && conv?.type === "squad_group") {
                    return (
                      <div key={msg.id} className="text-center py-1">
                        <span className="text-sm text-muted italic">{emoticonize(msg.body)}</span>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"} ${first ? "mt-2" : "mt-0.5"}`}>
                      {/* Oznámení z redakce a od svazu jsou jednosměrná — bublina na 75 %
                          by tam nechala mrtvý pruh a dlouhé titulky lámala do sloupce. */}
                      <div className={isSystem ? "w-full" : "max-w-[80%]"}>
                        <div className={`relative px-2.5 pt-1.5 pb-1 rounded-lg text-sm leading-snug text-[#111B21] ${WA_BUBBLE_SHADOW} ${
                          isUser ? "bg-[#D9FDD3]" : "bg-white"
                        } ${first && !isSystem ? (isUser ? "rounded-tr-none" : "rounded-tl-none") : ""}`}>
                          {first && !isSystem && <BubbleTail outgoing={isUser} />}
                          {!isUser && first && conv?.type === "squad_group" && (
                            <div className="text-sm font-medium truncate" style={{ color: nameColor(msg.senderName ?? "") }}>{msg.senderName}</div>
                          )}
                          {isVoice && teamId ? (
                            <>
                              <VoiceMessage
                                teamId={teamId}
                                messageId={msg.id}
                                durationSec={Number(msg.metadata?.durationSec ?? 0)}
                                peaks={Array.isArray(msg.metadata?.peaks) ? (msg.metadata?.peaks as number[]) : undefined}
                                transcript={msg.body}
                                rev={Number(msg.metadata?.rev ?? 1)}
                                outgoing={isUser}
                                avatar={isUser ? null : conv?.participantAvatar}
                              />
                              <div className="flex justify-end items-center gap-1 text-sm text-[#667781] leading-none -mt-4">
                                {formatTime(msg.sentAt)}
                                {isUser && <Ticks read={isRead(msg)} />}
                              </div>
                            </>
                          ) : (
                            <div className="relative">
                              {/* Fotka od hráče (player-photo.ts), text pod ní je popisek jako ve WhatsAppu. */}
                              {msg.metadata?.type === "photo" && (
                                <PlayerPhoto photoKey={String(msg.metadata.photoKey ?? "")} alt={String(msg.metadata.photoAlt ?? "Fotka")} />
                              )}
                              <p className="whitespace-pre-wrap break-words">
                                {emoticonize(msg.body)}
                                <span className={`inline-block ${isUser ? "w-[4.5rem]" : "w-12"}`} aria-hidden />
                              </p>
                              <span className="absolute bottom-0 right-0 flex items-center gap-1 text-sm text-[#667781] leading-none">
                                {formatTime(msg.sentAt)}
                                {isUser && <Ticks read={isRead(msg)} />}
                              </span>
                            </div>
                          )}
                          {/* Žádost o rozhovor chodí SMS, formulář je na stránce rozhovoru ve Zpravodaji. */}
                          {msg.metadata?.type === "interview_request"
                            && otevreneRozhovory.has(String(msg.metadata.interviewId ?? "")) && (
                            <Link
                              href={`/zpravodaj/rozhovor/${encodeURIComponent(String(msg.metadata.interviewId ?? ""))}`}
                              className={WA_LINK_BUTTON}
                            >
                              Otevřít rozhovor
                            </Link>
                          )}
                          {/* Odpověď cizího klubu na nabídku vede na jednání. */}
                          {msg.metadata?.type === "ai_negotiation" && typeof msg.metadata.negotiationId === "string" && (
                            <Link
                              href={`/prestupy/jednani/${encodeURIComponent(msg.metadata.negotiationId)}`}
                              className={WA_LINK_BUTTON}
                            >
                              Otevřít jednání
                            </Link>
                          )}
                          {/* Hlášení skauta vede na detail hlášení. */}
                          {msg.metadata?.type === "scout_report" && typeof msg.metadata.reportId === "string" && (
                            <Link
                              href={`/zamestnanci/skaut?hlaseni=${encodeURIComponent(msg.metadata.reportId)}`}
                              className={WA_LINK_BUTTON}
                            >
                              Otevřít hlášení
                            </Link>
                          )}
                          {/* SMS o incidentu (Kustod, policie, hráč) vede na detail incidentu. */}
                          {msg.metadata?.type === "incident" && typeof msg.metadata.incidentId === "string" && (
                            <Link
                              href={`/incidenty?id=${encodeURIComponent(msg.metadata.incidentId)}`}
                              className={WA_LINK_BUTTON}
                            >
                              Otevřít incident
                            </Link>
                          )}
                          {/* Komunální volby: nové vedení obce. */}
                          {msg.metadata?.type === "village" && (
                            <Link
                              href="/obec"
                              className={WA_LINK_BUTTON}
                            >
                              Otevřít obec
                            </Link>
                          )}
                          {/* Volby do grémia soutěže: kandidovat a volit se dá v záložce Vedení. */}
                          {msg.metadata?.type === "competition" && (
                            <Link
                              href="/soutez?tab=vedeni"
                              className={WA_LINK_BUTTON}
                            >
                              Otevřít grémium
                            </Link>
                          )}
                          {/* Někdo mi nabídl hráče k poptávce. */}
                          {msg.metadata?.type === "demand" && (
                            <Link
                              href="/prestupy?tab=demands"
                              className={WA_LINK_BUTTON}
                            >
                              Otevřít poptávky
                            </Link>
                          )}
                          {/* Pozvánka a potvrzení přihlášky od pořadatele turnaje. */}
                          {/* Úkol od kapitána v prvním týdnu (průvodce): vede rovnou na stránku úkolu. */}
                          {msg.metadata?.type === "guide" && typeof msg.metadata.href === "string" && msg.metadata.href.startsWith("/") && (
                            <Link
                              href={msg.metadata.href}
                              className={WA_LINK_BUTTON}
                            >
                              {typeof msg.metadata.label === "string" ? msg.metadata.label : "Otevřít"}
                            </Link>
                          )}
                          {msg.metadata?.type === "tournament" && (
                            <Link
                              href="/turnaj"
                              className={WA_LINK_BUTTON}
                            >
                              Otevřít turnaj
                            </Link>
                          )}
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
            <div className={`relative mt-2 bg-white ${WA_BUBBLE_SHADOW} rounded-lg rounded-tl-none px-3 py-2 text-sm text-[#667781] flex items-center gap-1.5`}>
              <BubbleTail outgoing={false} />
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
      <div className="bg-[#F0F2F5] px-2 py-1.5 shrink-0">
        {/* Hráč, který chtěl odejít: dohody jako hotové SMS (přání 2026-10-18: „ať je to vše
            formou SMS“). Proč chtěl pryč, řekl hráč sám ve své SMS; výsledek je jeho odpověď. */}
        {unrestDeals.length > 0 && (
          <div className="mb-2">
            <button
              onClick={() => setUnrestOpen((o) => !o)}
              aria-expanded={unrestOpen}
              className="text-sm font-heading font-bold text-pitch-700 px-1 mb-1.5"
            >
              🤝 Nabídnout mu dohodu {unrestOpen ? "▴" : "▾"}
            </button>
            {unrestOpen && (
              <QuickReplies
                options={unrestDeals.map((a) => ({ id: a.id, label: a.label, text: a.message }))}
                disabled={unrestBusy || sending}
                onPick={(o) => handleUnrestAction({ id: o.id, message: o.text })}
              />
            )}
          </div>
        )}
        {unrestError && <p className="text-sm text-card-red mb-1.5 px-1">{unrestError}</p>}
        {nabidkaOdpovedi.length > 0 && (
          <div className="mb-2">
            <QuickReplies
              options={nabidkaOdpovedi.map((o) => ({ id: o.id, label: o.label, text: o.text }))}
              disabled={sending}
              onPick={(o) => { const opt = nabidkaOdpovedi.find((x) => x.id === o.id); if (opt) handleOwnerOption(opt); }}
            />
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
        <div className="flex items-end gap-2">
          {!voiceActive && (
          /* Roste s textem, ať je vidět celá zpráva. Enter odesílá, Shift+Enter dělá nový řádek. */
          <AutoGrowTextarea
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend();
              }
            }}
            onHeightChange={scrollToLatest}
            enterKeyHint="send"
            maxRows={6}
            placeholder={
              cekaSeNaHrace ? (ownerSponsorId ? "Píše…" : "Hráč píše…")
                : nemaNaSms ? "Došel kredit"
                  : ownerSponsorId ? "Třeba: 20 000 na přestup"
                  : jeImessage ? "iMessage"
                    : "SMS"
            }
            disabled={cekaSeNaHrace || nemaNaSms}
            className="flex-1 min-w-0 bg-white rounded-3xl px-4 py-2.5 text-base leading-6 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          )}
          {/* Jako ve WhatsAppu: prázdné pole má vpravo mikrofon, s textem šipku.
              Hlasová odpověď jen hráči, přepis čte AI stejně jako SMS. */}
          {!isGroup && conv?.type === "player" && teamId && voiceSupported && !newMsg.trim() ? (
            <CoachVoiceRecorder
              teamId={teamId}
              convId={convId}
              disabled={sending || cekaSeNaHrace || nemaNaSms}
              onSend={handleSendVoice}
              onActiveChange={setVoiceActive}
              onError={setCreditError}
            />
          ) : !voiceActive && (
          <button
            onClick={handleSend}
            disabled={!newMsg.trim() || sending || cekaSeNaHrace || nemaNaSms}
            aria-label="Odeslat zprávu"
            className="shrink-0 w-11 h-11 rounded-full bg-[#00A884] text-white flex items-center justify-center disabled:opacity-40"
          >
            <SendIcon />
          </button>
          )}
        </div>
      </div>
      )}
    </PhoneFrame>
  );
}

/**
 * Hotové SMS k odeslání (odpověď majiteli, dohoda s hráčem) jako krátké štítky vpravo
 * v barvě mých zpráv. Klepnutí pošle celou připravenou SMS, ta se hned ukáže v rozhovoru.
 * Dřív to byly široké modré obdélníky s celým textem: šest dohod zakrylo celý telefon.
 */
function QuickReplies({ options, disabled, onPick }: {
  options: Array<{ id: string; label: string; text: string }>;
  disabled: boolean;
  onPick: (o: { id: string; text: string }) => void;
}) {
  // Jako tlačítka rychlých odpovědí ve WhatsAppu: bílá, modrý text.
  const colorClass = `border-transparent text-[#027EB5] hover:bg-[#F5F6F6] ${WA_BUBBLE_SHADOW}`;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onPick(o)}
          disabled={disabled}
          title={o.text}
          className={`text-sm font-medium bg-white border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 ${colorClass}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
