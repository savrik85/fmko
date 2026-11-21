"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatKc } from "@/lib/format";
import { Button, ListCard, ListEmpty, ListRow } from "@/components/ui";

interface OpenAuction {
  id: string;
  player_name: string;
  position: string;
  age: number;
  overall_rating: number;
  source_team_name: string;
  start_price: number;
  current_bid: number | null;
  ends_at: string;
  minNext: number;
  leading: boolean;
  leaderName: string | null;
  myBid: number | null;
}

interface ClosedAuction {
  id: string;
  player_name: string;
  position: string;
  age: number;
  source_team_name: string;
  status: "sold" | "unsold";
  sold_price: number | null;
  winnerName: string | null;
}

const POSITION: Record<string, string> = { GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník" };

function timeLeft(endsAt: string, now: number): string {
  const ms = Date.parse(endsAt) - now;
  if (ms <= 0) return "končí";
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return h > 0 ? `zbývá ${h} h ${m} min` : `zbývá ${m} min`;
}

function AuctionRow({ a, teamId, now, onDone }: { a: OpenAuction; teamId: string; now: number; onDone: () => void }) {
  const [amount, setAmount] = useState(String(a.minNext));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setAmount(String(a.minNext)); }, [a.minNext]);

  const bid = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/teams/${teamId}/auctions/${a.id}/bid`, { method: "POST", body: JSON.stringify({ amount: Number(amount) }) });
      onDone();
    } catch (e) {
      console.error("příhoz v dražbě:", e);
      setError(e instanceof Error ? e.message : "Příhoz se nepodařilo uložit.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`px-4 py-3 border-b border-line-soft last:border-b-0 ${a.leading ? "bg-pitch-50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-heading font-bold text-sm truncate">{a.player_name}</div>
          <div className="text-meta text-muted">{POSITION[a.position] ?? a.position}, {a.age} let, hodnocení {a.overall_rating}, z klubu {a.source_team_name}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-heading font-bold tabular-nums">{formatKc(a.current_bid ?? a.start_price)}</div>
          <div className="text-meta text-muted">{a.current_bid == null ? "vyvolávací cena" : a.leading ? "vede váš příhoz" : `vede ${a.leaderName ?? "jiný klub"}`}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-meta text-muted">{timeLeft(a.ends_at, now)}</span>
        {!a.leading && (
          <>
            <span className="text-meta text-muted">· nejméně {formatKc(a.minNext)}</span>
            <input inputMode="numeric" aria-label={`Příhoz na ${a.player_name}`} className="w-28 h-9 rounded-soft border border-line px-2 text-sm tabular-nums bg-white"
              value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} disabled={busy} />
            <Button variant="primary" size="sm" disabled={busy || !amount || Number(amount) < a.minNext} onClick={bid}>
              {busy ? "Přihazuji…" : "Přihodit"}
            </Button>
          </>
        )}
      </div>
      {error && <div className="mt-1 text-sm text-card-red">{error}</div>}
    </div>
  );
}

/** Dražba hráčů z opuštěných klubů: běžící dražby s příhozem a posledních deset výsledků. */
export function AuctionsTab({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState<OpenAuction[]>([]);
  const [closed, setClosed] = useState<ClosedAuction[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    apiFetch<{ open: OpenAuction[]; closed: ClosedAuction[] }>(`/api/teams/${teamId}/auctions`)
      .then((d) => { setOpen(d.open); setClosed(d.closed); })
      .catch((e) => console.error("načtení dražeb:", e));
  }, [teamId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      <ListCard title="Dražba" count={open.length ? `${open.length}` : undefined}>
        <div className="px-4 py-3 text-sm text-ink/80 border-b border-line-soft">
          Když nový trenér převezme opuštěný klub, nejlepších pět hráčů jde do dražby na 48 hodin. Příhoz musí být aspoň o 10 % vyšší,
          příhoz v posledních 10 minutách dražbu prodlouží. Platí se až po skončení; kdo pak nemá peníze, o hráče přijde a bere další v pořadí.
        </div>
        {open.length === 0
          ? <ListEmpty icon="🔨">Teď se nic nedraží. Dražba začne, až nový trenér převezme opuštěný klub.</ListEmpty>
          : open.map((a) => <AuctionRow key={a.id} a={a} teamId={teamId} now={now} onDone={load} />)}
      </ListCard>
      {closed.length > 0 && (
        <ListCard title="Skončené dražby">
          {closed.map((c) => (
            <ListRow key={c.id} dense title={c.player_name}
              meta={`${POSITION[c.position] ?? c.position}, ${c.age} let, z klubu ${c.source_team_name}`}
              trailing={<span className="text-meta text-muted text-right">{c.status === "sold" ? `${c.winnerName ?? "?"}, ${formatKc(c.sold_price ?? 0)}` : "neprodán, je mezi volnými"}</span>} />
          ))}
        </ListCard>
      )}
    </div>
  );
}
