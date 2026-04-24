"use client";

import dynamic from "next/dynamic";

const FaceAvatar = dynamic(
  () => import("@/components/players/face-avatar").then((m) => m.FaceAvatar),
  { ssr: false, loading: () => <div style={{ width: 48, height: 58 }} className="bg-gray-100 rounded-lg animate-pulse" /> },
);

export interface OfferEvent {
  id: string;
  event_type: "offer" | "counter" | "accept" | "reject" | "withdraw" | "expire";
  team_id: string;
  team_name: string;
  amount: number | null;
  message: string | null;
  created_at: string;
}

export interface TimelineManager {
  avatar: Record<string, unknown>;
  name: string;
}

const icons: Record<OfferEvent["event_type"], string> = {
  offer: "💰",
  counter: "🔄",
  accept: "✅",
  reject: "❌",
  withdraw: "↩️",
  expire: "⌛",
};

const labels: Record<OfferEvent["event_type"], string> = {
  offer: "úvodní nabídka",
  counter: "protinabídka",
  accept: "přijato",
  reject: "zamítnuto",
  withdraw: "nabídka stažena",
  expire: "vypršelo",
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "před chvílí";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `před ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `před ${h} h`;
  const d = Math.floor(h / 24);
  return `před ${d} dny`;
}

export function OfferTimeline({
  events, myTeamId,
  fromTeamId, toTeamId,
  fromManager, toManager,
}: {
  events: OfferEvent[];
  myTeamId: string;
  fromTeamId: string;
  toTeamId: string;
  fromManager: TimelineManager | null;
  toManager: TimelineManager | null;
}) {
  if (events.length === 0) {
    return <div className="text-sm text-muted italic">Žádná historie</div>;
  }

  const managerFor = (teamId: string) => {
    if (teamId === fromTeamId) return fromManager;
    if (teamId === toTeamId) return toManager;
    return null;
  };

  return (
    <ol className="flex flex-col gap-4">
      {events.map((e) => {
        const mine = e.team_id === myTeamId;
        const mgr = managerFor(e.team_id);
        const hasAvatar = mgr?.avatar && Object.keys(mgr.avatar).length > 0;
        const tone = mine ? "mine" : "opponent";
        return (
          <li key={e.id} className={`flex items-start gap-3 ${mine ? "" : "flex-row-reverse"}`}>
            {/* Avatar */}
            <div className="shrink-0 flex flex-col items-center w-14">
              <div className="rounded-full overflow-hidden w-12 h-12 bg-paper ring-2 ring-white shadow-sm flex items-center justify-center">
                {hasAvatar ? (
                  <FaceAvatar faceConfig={mgr!.avatar} size={48} />
                ) : (
                  <span className="text-2xl">👤</span>
                )}
              </div>
              <span className="text-[10px] font-heading font-bold text-muted uppercase tracking-tight text-center mt-1 leading-tight line-clamp-2">
                {mgr?.name ?? e.team_name}
              </span>
            </div>

            {/* Bubble */}
            <Bubble tone={tone} direction={mine ? "left" : "right"}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-base leading-none">{icons[e.event_type] ?? "•"}</span>
                <span className="text-xs text-muted font-heading uppercase tracking-wider">{labels[e.event_type]}</span>
              </div>
              {e.amount != null && (
                <div className="font-heading font-bold tabular-nums text-lg leading-tight">
                  {e.amount > 0 ? `${e.amount.toLocaleString("cs")} Kč` : "zdarma"}
                </div>
              )}
              {e.message && (
                <div className="text-sm italic text-ink mt-1.5 whitespace-pre-wrap break-words">&ldquo;{e.message}&rdquo;</div>
              )}
              <div className="text-[11px] text-muted mt-1.5">{formatRelative(e.created_at)}</div>
            </Bubble>
          </li>
        );
      })}
    </ol>
  );
}

function Bubble({
  tone, direction, children,
}: {
  tone: "mine" | "opponent";
  direction: "left" | "right";
  children: React.ReactNode;
}) {
  // "direction" = na kterou stranu mírí ocásek (vždy směrem k avataru)
  const bg = tone === "mine" ? "bg-pitch-50" : "bg-gold-50/60";
  const border = tone === "mine" ? "border-pitch-200" : "border-gold-300/60";
  const tailBg = tone === "mine" ? "bg-pitch-50" : "bg-gold-50";
  const tailBorder = tone === "mine" ? "border-pitch-200" : "border-gold-300/60";

  return (
    <div className={`relative flex-1 min-w-0 ${bg} border ${border} rounded-2xl px-4 py-2.5`}>
      {/* Tail — čtvereček rotovaný 45° překrytý bublinou */}
      <span
        aria-hidden
        className={`absolute top-4 ${direction === "left" ? "-left-1.5" : "-right-1.5"} w-3 h-3 ${tailBg} border ${tailBorder} ${direction === "left" ? "border-r-transparent border-t-transparent" : "border-l-transparent border-b-transparent"} rotate-45`}
      />
      {children}
    </div>
  );
}
