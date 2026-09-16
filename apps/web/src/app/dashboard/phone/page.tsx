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
import { ZamykaciObrazovka, jeOdemceno } from "./ZamykaciObrazovka";
import { Hovory } from "./Hovory";
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
      className="relative w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-sm shrink-0"
    >
      {emoji}
      {badge && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-card-red ring-2 ring-pitch-600" />
      )}
    </button>
  );
}

/**
 * Záložka na spodní liště telefonu.
 *
 * Musí být vidět popisek: „Tribuna" je zeď fanoušků, tedy vlastní část
 * aplikace, a jako samotná ikonka stadionu ji nikdo nenašel.
 */
function ZalozkaTelefonu({ emoji, label, badge, aktivni, onClick }: {
  emoji: string; label: string; badge?: boolean; aktivni?: boolean; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={aktivni ? "page" : undefined}
      // Čtyři záložky na 390px displeji: užší odsazení, ať se popisky
      // nezalamují. Menší písmo ne, minimum je `text-sm`.
      className={`relative flex-1 min-w-0 px-0.5 py-2 flex flex-col items-center gap-0.5 text-sm ${
        aktivni ? "bg-[#3a3a3c] font-bold" : "hover:bg-[#3a3a3c]/60"
      }`}
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className="truncate max-w-full">{label}</span>
      {badge && (
        <span className="absolute top-1.5 right-1/2 translate-x-4 w-2.5 h-2.5 rounded-full bg-card-red ring-2 ring-pitch-700" />
      )}
    </button>
  );
}

/** Kredit jako drobný text, ne další barevná pilulka. */
function KreditText({ credit }: { credit: Credit }) {
  const dochazi = credit.zbyva < credit.cenaSms;
  return (
    <span
      className={`text-sm tabular-nums ${dochazi ? "text-card-yellow font-semibold" : "text-white/70"}`}
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
  // Zámek. `true` do prvního vykreslení na klientu, jinak by při hydrataci
  // problikl odemčený telefon a hned se zamkl.
  const [zamceno, setZamceno] = useState(true);
  const [hovoryOtevrene, setHovoryOtevrene] = useState(false);
  const [zmeskaneHovory, setZmeskaneHovory] = useState(0);
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
    apiFetch<{ unread: number }>(`/api/teams/${teamId}/missed-calls`)
      .then((d) => setZmeskaneHovory(d.unread ?? 0))
      .catch((e) => console.error("zmeškané hovory:", e));
  }, [teamId]);

  // `sessionStorage` je až na klientu, proto ne v počátečním stavu.
  useEffect(() => { setZamceno(!jeOdemceno()); }, []);

  const nactiOznameni = () => {
    if (!teamId) return;
    apiFetch<{ unread: number }>(`/api/teams/${teamId}/notifications?limit=1`)
      .then((d) => setNeprectenaOznameni(d.unread ?? 0))
      .catch((e) => console.error("počet oznámení:", e));
  };

  const neprectenychZprav = conversations.reduce((s, c) => s + (c.unreadCount ?? 0), 0);

  return (
    <PhoneFrame>
      {zamceno && (
        <ZamykaciObrazovka
          neprectenychZprav={neprectenychZprav}
          neprectenychOznameni={neprectenaOznameni}
          onOdemknout={() => setZamceno(false)}
        />
      )}
      {/* Hlavička telefonu. `shrink-0`, aby ji dlouhý seznam zpráv nesmáčkl:
          v aplikaci na telefonu vršek stojí a scrolluje se obsah pod ním. */}
      <div className="shrink-0 bg-[#1c1c1e] text-white px-4 py-2.5 flex items-center justify-between">
        <span className="font-heading font-bold text-base">Telefon</span>
        <div className="ml-auto flex items-center gap-2">
          {credit && <KreditText credit={credit} />}
          <IkonaTlacitko
            emoji="&#9998;"
            label="Nová zpráva"
            onClick={() => setAdresarOtevren(true)}
          />
        </div>
      </div>

      {/* Záložky.
          Socky i Oznámení dřív visely v hlavičce jako holé ikonky vedle sebe
          a nešlo z nich poznat, co jsou zač. Původní „Tribuna" navíc nikomu
          neřekla, že jde o sociální síť. */}
      <div className="shrink-0 bg-[#2c2c2e] text-white flex">
        <ZalozkaTelefonu emoji="&#128172;" label="Zprávy" aktivni />
        <ZalozkaTelefonu
          emoji="&#128483;&#65039;"
          label="Socky"
          onClick={() => setTribunaOtevrena(true)}
        />
        <ZalozkaTelefonu
          emoji="&#128222;"
          label="Hovory"
          badge={zmeskaneHovory > 0}
          onClick={() => { setZmeskaneHovory(0); setHovoryOtevrene(true); }}
        />
        <ZalozkaTelefonu
          emoji="&#128276;"
          label="Oznámení"
          badge={neprectenaOznameni > 0}
          onClick={() => setOznameniOtevrena(true)}
        />
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
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-heading font-bold text-sm">
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
                        <span className="ml-1.5 inline-block bg-pitch-100 text-pitch-700 text-sm font-medium px-1.5 py-0.5 rounded-full align-middle">
                          čeká na odpověď
                        </span>
                      )}
                      {conv.aiThreadActive && conv.aiThreadState?.awaiting === "player" && (
                        <span className="ml-1.5 inline-block bg-amber-100 text-amber-700 text-sm font-medium px-1.5 py-0.5 rounded-full align-middle">
                          píše…
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-muted shrink-0 ml-2">
                      {timeAgo(conv.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className={`text-sm truncate ${conv.unreadCount > 0 ? "text-ink" : "text-muted"}`}>
                      {conv.lastMessageText || "Žádné zprávy"}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="shrink-0 ml-2 bg-pitch-500 text-white text-sm font-bold w-5 h-5 rounded-full flex items-center justify-center">
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

      {hovoryOtevrene && teamId && (
        <Hovory teamId={teamId} onZavrit={() => setHovoryOtevrene(false)} />
      )}

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
      <div className="shrink-0 bg-white border-t border-gray-100 px-4 py-2">
        {credit && (
          <p className="text-sm text-muted leading-snug">
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
