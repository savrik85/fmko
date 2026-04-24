"use client";

export interface OfferEvent {
  id: string;
  event_type: "offer" | "counter" | "accept" | "reject" | "withdraw" | "expire";
  team_id: string;
  team_name: string;
  amount: number | null;
  message: string | null;
  created_at: string;
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

export function OfferTimeline({ events, myTeamId }: { events: OfferEvent[]; myTeamId: string }) {
  if (events.length === 0) {
    return <div className="text-sm text-muted italic">Žádná historie</div>;
  }
  return (
    <ol className="flex flex-col gap-2">
      {events.map((e) => {
        const mine = e.team_id === myTeamId;
        return (
          <li
            key={e.id}
            className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${
              mine ? "bg-pitch-50 border-pitch-500" : "bg-gold-500/5 border-gold-500"
            }`}
          >
            <span className="text-lg leading-none pt-0.5">{icons[e.event_type] ?? "•"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-heading font-bold text-sm truncate">{e.team_name}</span>
                <span className="text-xs text-muted">{labels[e.event_type]}</span>
              </div>
              {e.amount != null && (
                <div className="font-heading font-bold tabular-nums text-base mt-0.5">
                  {e.amount > 0 ? `${e.amount.toLocaleString("cs")} Kč` : "zdarma"}
                </div>
              )}
              {e.message && (
                <div className="text-xs italic text-ink mt-1 whitespace-pre-wrap break-words">&ldquo;{e.message}&rdquo;</div>
              )}
              <div className="text-xs text-muted mt-0.5">{formatRelative(e.created_at)}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
