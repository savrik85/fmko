"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";
import { Spinner } from "@/components/ui";
import { PhoneFrame } from "@/components/phone/phone-frame";

interface Conversation {
  id: string;
  type: "squad_group" | "player" | "manager" | "system" | "global_group" | "league_group";
  title: string;
  participantId: string | null;
  participantAvatar: Record<string, unknown> | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  pinned: boolean;
  aiThreadActive?: boolean;
  aiThreadState?: { awaiting: "coach" | "player" | "done" } | null;
}

const GROUP_AVATAR_EMOJI: Record<string, string> = {
  squad_group: "\u{1F3BD}",
  global_group: "\u{1F310}",
  league_group: "\u{1F3C6}",
};

/** Endpoint kádru vrací řádky z DB, takže sloupce jsou snake_case. */
interface SquadPlayer {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  avatar: Record<string, unknown> | null;
}

interface Credit {
  zbyva: number;
  denni: number;
  label: string;
}

/**
 * Kredit jako štítek s číslem.
 *
 * Ne jako čárky signálu — ty už rám telefonu jednou má a dva stejné symboly
 * vedle sebe by znamenaly dvě různé věci.
 */
function CreditChip({ credit }: { credit: Credit }) {
  const barva = credit.zbyva <= 0
    ? "bg-card-red text-white"
    : credit.zbyva <= Math.max(1, Math.floor(credit.denni * 0.25))
      ? "bg-gold-500 text-white"
      : "bg-white/20 text-white";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full tabular-nums ${barva}`} title={credit.label}>
      Kredit {credit.zbyva}/{credit.denni}
    </span>
  );
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
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [vyberOtevren, setVyberOtevren] = useState(false);
  const [kadr, setKadr] = useState<SquadPlayer[] | null>(null);
  const [zaklada, setZaklada] = useState<string | null>(null);
  const [credit, setCredit] = useState<Credit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<Conversation[]>(`/api/teams/${teamId}/conversations`)
      .then((data) => { setConversations(data); setLoading(false); })
      .catch((e) => { console.error("načtení konverzací:", e); setLoading(false); });
    apiFetch<Credit>(`/api/teams/${teamId}/phone-credit`)
      .then(setCredit)
      .catch((e) => console.error("načtení kreditu:", e));
  }, [teamId]);

  /**
   * Otevře konverzaci s hráčem. Endpoint ji najde nebo založí, takže druhé
   * kliknutí na stejného hráče nevytvoří duplicitní vlákno.
   */
  const napsatHraci = async (p: SquadPlayer) => {
    if (!teamId || zaklada) return;
    setZaklada(p.id);
    try {
      const res = await apiFetch<{ conversationId: string }>(
        `/api/teams/${teamId}/player-conversation/${p.id}`, { method: "POST" },
      );
      router.push(`/dashboard/phone/${encodeURIComponent(res.conversationId)}`);
    } catch (e) {
      console.error("založení konverzace s hráčem:", e);
      setZaklada(null);
    }
  };

  const otevritVyber = async () => {
    setVyberOtevren(true);
    if (kadr || !teamId) return;
    try {
      const data = await apiFetch<SquadPlayer[]>(`/api/teams/${teamId}/players`);
      setKadr(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("načtení kádru pro telefon:", e);
      setKadr([]);
    }
  };

  return (
    <PhoneFrame>
      {/* Status bar */}
      <div className="bg-pitch-600 text-white px-4 py-2.5 flex items-center justify-between">
        <span className="font-heading font-bold text-sm">Zprávy</span>
        {credit ? <CreditChip credit={credit} /> : (
          <span className="text-xs text-white/60">
            {conversations.reduce((s, c) => s + c.unreadCount, 0)} nepřečtených
          </span>
        )}
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
                href={`/dashboard/phone/${encodeURIComponent(conv.id)}`}
                className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white ${conv.unreadCount > 0 ? "bg-white" : ""}`}
              >
                {/* Avatar */}
                <div className="shrink-0">
                  {GROUP_AVATAR_EMOJI[conv.type] ? (
                    <div className="w-10 h-10 rounded-full bg-pitch-500 flex items-center justify-center text-white text-base">
                      {GROUP_AVATAR_EMOJI[conv.type]}
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
                      {conv.aiThreadActive && conv.aiThreadState?.awaiting === "coach" && (
                        <span className="ml-1.5 inline-block bg-pitch-100 text-pitch-700 text-micro font-medium px-1.5 py-0.5 rounded-full align-middle">
                          čeká na odpověď
                        </span>
                      )}
                      {conv.aiThreadActive && conv.aiThreadState?.awaiting === "player" && (
                        <span className="ml-1.5 inline-block bg-amber-100 text-amber-700 text-micro font-medium px-1.5 py-0.5 rounded-full align-middle">
                          píše…
                        </span>
                      )}
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

      {vyberOtevren && (
        <div className="fixed inset-0 sm:absolute z-30 bg-white flex flex-col">
          <div className="bg-pitch-600 text-white px-4 py-2.5 flex items-center justify-between">
            <span className="font-heading font-bold text-sm">Komu napsat</span>
            <button className="text-sm text-white/80" onClick={() => setVyberOtevren(false)}>Zavřít</button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {kadr === null ? (
              <div className="flex items-center justify-center h-40"><Spinner /></div>
            ) : kadr.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted">Kádr se nepodařilo načíst.</p>
            ) : kadr.map((p) => (
              <button
                key={p.id}
                onClick={() => napsatHraci(p)}
                disabled={zaklada !== null}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 disabled:opacity-50"
              >
                <div className="shrink-0">
                  {p.avatar && Object.keys(p.avatar).length > 2 ? (
                    <FaceAvatar faceConfig={p.avatar} size={36} className="rounded-full" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-heading font-bold text-xs">
                      {(p.first_name?.[0] ?? "") + (p.last_name?.[0] ?? "")}
                    </div>
                  )}
                </div>
                <span className="text-sm font-medium">{p.first_name} {p.last_name}</span>
                <span className="text-xs text-muted ml-auto">{p.position}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {credit && (
        <div className="bg-white border-t border-gray-100 px-4 py-2">
          <p className="text-xs text-muted leading-snug">
            {credit.zbyva > 0 ? (
              <>Kredit: <strong className="text-ink">{credit.zbyva}</strong> z {credit.denni} odpovědí na dnešek.
                {" "}Každá odpověď hráče stojí jeden.</>
            ) : (
              <>Kredit došel. Dobije se zítra ráno. Psát vedení soutěže ani kotli můžeš dál zdarma.</>
            )}
          </p>
          <button
            onClick={otevritVyber}
            className="mt-2 w-full rounded-full bg-pitch-500 text-white py-2 text-sm font-heading font-bold"
          >
            Napsat hráči
          </button>
        </div>
      )}
    </PhoneFrame>
  );
}
