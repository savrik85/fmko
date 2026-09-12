"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";
import { Spinner } from "@/components/ui";
import { PhoneFrame } from "@/components/phone/phone-frame";
import { Adresar } from "./Adresar";
import { Oznameni } from "./Oznameni";
import { Tribuna } from "./Tribuna";

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

interface Credit {
  /** Zbývající kredit v korunách. */
  zbyva: number;
  denni: number;
  cenaSms: number;
  /** Kolik zpráv se z toho ještě dá poslat. */
  zprav: number;
  label: string;
}

/**
 * Kulaté tlačítko v hlavičce — jako ikony v liště iOS.
 *
 * Odznak je tečka, ne pilulka s číslem: přesný počet nepřečtených oznámení
 * hráč stejně neřeší a číslo natlačené vedle dalších prvků dělalo z hlavičky
 * změť. Kolik jich je, ukáže obrazovka s oznámeními.
 */
function IkonaTlacitko({ emoji, label, badge, onClick }: {
  emoji: string; label: string; badge?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="relative w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-xs shrink-0"
    >
      {emoji}
      {badge && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-card-red ring-2 ring-pitch-600" />
      )}
    </button>
  );
}

/** Kredit jako drobný text, ne další barevná pilulka. */
function KreditText({ credit }: { credit: Credit }) {
  const dochazi = credit.zbyva < credit.cenaSms;
  return (
    <span
      className={`text-xs tabular-nums ${dochazi ? "text-card-yellow font-semibold" : "text-white/70"}`}
      title={credit.label}
    >
      {credit.zbyva} Kč
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
  const [adresarOtevren, setAdresarOtevren] = useState(false);
  const [oznameniOtevrena, setOznameniOtevrena] = useState(false);
  const [tribunaOtevrena, setTribunaOtevrena] = useState(false);
  const [neprectenaOznameni, setNeprectenaOznameni] = useState(0);
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
    nactiOznameni();
  }, [teamId]);

  const nactiOznameni = () => {
    if (!teamId) return;
    apiFetch<{ unread: number }>(`/api/teams/${teamId}/notifications?limit=1`)
      .then((d) => setNeprectenaOznameni(d.unread ?? 0))
      .catch((e) => console.error("počet oznámení:", e));
  };

  return (
    <PhoneFrame>
      {/* Status bar */}
      <div className="bg-pitch-600 text-white px-4 py-2.5 flex items-center justify-between">
        <span className="font-heading font-bold text-base">Zprávy</span>
        <div className="ml-auto flex items-center gap-2">
          {credit && <KreditText credit={credit} />}
          <IkonaTlacitko
            emoji="&#127967;"
            label="Tribuna"
            onClick={() => setTribunaOtevrena(true)}
          />
          <IkonaTlacitko
            emoji="&#128276;"
            label="Oznámení"
            badge={neprectenaOznameni > 0}
            onClick={() => setOznameniOtevrena(true)}
          />
          <IkonaTlacitko
            emoji="&#9998;"
            label="Nová zpráva"
            onClick={() => setAdresarOtevren(true)}
          />
        </div>
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

      {tribunaOtevrena && teamId && (
        <Tribuna teamId={teamId} onZavrit={() => setTribunaOtevrena(false)} />
      )}

      {oznameniOtevrena && teamId && (
        <Oznameni
          teamId={teamId}
          onZavrit={() => setOznameniOtevrena(false)}
          onZmena={nactiOznameni}
        />
      )}

      {adresarOtevren && teamId && (
        <Adresar
          teamId={teamId}
          onZavrit={() => setAdresarOtevren(false)}
          onOtevrit={(id) => router.push(`/dashboard/phone/${encodeURIComponent(id)}`)}
        />
      )}

      {/* Adresář je vždycky po ruce — i kdyby se stav kreditu nenačetl. */}
      <div className="bg-white border-t border-gray-100 px-4 py-2">
        {credit && (
          <p className="text-xs text-muted leading-snug">
            {credit.zbyva >= credit.cenaSms ? (
              <>Na kartě máš <strong className="text-ink">{credit.zbyva} Kč</strong> — to je{" "}
                {credit.zprav === 1 ? "jedna SMS" : `${credit.zprav} SMS`}.{" "}
                Hráčům a do kabiny jde <span className="text-pitch-600 font-medium">SMS</span> za{" "}
                {credit.cenaSms} Kč, zbytek přes{" "}
                <span className="text-blue-600 font-medium">iMessage</span> zdarma.</>
            ) : (
              <>Na kartě máš {credit.zbyva} Kč, na SMS to nestačí. Dobije se zítra ráno — přes{" "}
                <span className="text-blue-600 font-medium">iMessage</span> píšeš dál zdarma.</>
            )}
          </p>
        )}
      </div>
    </PhoneFrame>
  );
}
