"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatKc } from "@/lib/format";
import { Button, ListCard, ListEmpty, ListRow } from "@/components/ui";

interface TipMatch {
  matchId: string;
  leagueName: string;
  home: string;
  away: string;
  kickoffAt: string;
  open: boolean;
  homeScore: number | null;
  awayScore: number | null;
  tip: { home: number; away: number } | null;
}

interface TipView {
  round: { id: string; day: string; stake: number; pot: number; entries: number; joined: boolean } | null;
  matches: TipMatch[];
  last: { day: string; winners: Array<{ name: string; points: number; payout: number }>; myPoints: number | null; myPayout: number } | null;
  season: Array<{ teamId: string; name: string; points: number; rounds: number }>;
}

type Draft = Record<string, { home: string; away: string }>;

function dayLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d}. ${m}.`;
}

function pointsLabel(n: number): string {
  return n === 1 ? "bod" : n >= 2 && n <= 4 ? "body" : "bodů";
}

/** Tipovačka v hospodě: lístek na nejbližší kolo okresu, poslední výsledky a tabulka sezóny. */
export function TipGameCard({ teamId }: { teamId: string }) {
  const [view, setView] = useState<TipView | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<TipView>(`/api/teams/${teamId}/pub-tips`)
      .then((v) => {
        setView(v);
        const d: Draft = {};
        for (const m of v.matches) d[m.matchId] = { home: m.tip ? String(m.tip.home) : "", away: m.tip ? String(m.tip.away) : "" };
        setDraft(d);
      })
      .catch((e) => console.error("načtení tipovačky:", e));
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const filled = useMemo(() => (view?.matches ?? []).filter((m) => m.open && draft[m.matchId]?.home !== "" && draft[m.matchId]?.away !== ""), [view, draft]);
  const leagues = useMemo(() => [...new Set((view?.matches ?? []).map((m) => m.leagueName))], [view]);

  if (!view) return null;

  const set = (id: string, side: "home" | "away", value: string) => {
    setSaved(null);
    const clean = value.replace(/[^0-9]/g, "").slice(0, 2);
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? { home: "", away: "" }), [side]: clean } }));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const tips = filled.map((m) => ({ matchId: m.matchId, home: Number(draft[m.matchId].home), away: Number(draft[m.matchId].away) }));
      const res = await apiFetch<{ saved: number; charged: boolean }>(`/api/teams/${teamId}/pub-tips`, { method: "PUT", body: JSON.stringify({ tips }) });
      setSaved(res.charged ? `Tipy jsou na lístku, vklad ${formatKc(view.round?.stake ?? 200)} je zaplacený.` : "Tipy jsou na lístku.");
      load();
    } catch (e) {
      console.error("uložení tipů:", e);
      setError(e instanceof Error ? e.message : "Tipy se nepodařilo uložit.");
    } finally {
      setBusy(false);
    }
  };

  const round = view.round;
  return (
    <div className="space-y-3">
      <ListCard title="Tipovačka" count={round ? `${dayLabel(round.day)} · v banku ${formatKc(round.pot)}` : undefined}>
        <div className="px-4 py-3 text-sm text-ink/80 border-b border-line-soft">
          Tipuje se na lístku u výčepu. S prvním tipem kola se strhne vklad {formatKc(round?.stake ?? 200)}.
          Za přesný výsledek 3 body, za tendenci 1, bank bere nejlepší. Tipovat jde do výkopu.
        </div>
        {!round || view.matches.length === 0 ? (
          <ListEmpty icon="📝">Teď se v okrese nic nehraje. Lístek bude na další kolo.</ListEmpty>
        ) : (
          <>
            {leagues.map((league) => (
              <div key={league}>
                <div className="px-4 pt-3 pb-1 text-meta text-muted uppercase tracking-wide">{league}</div>
                {view.matches.filter((m) => m.leagueName === league).map((m) => (
                  <div key={m.matchId} className="flex items-center gap-2 px-4 py-2 border-b border-line-soft last:border-b-0">
                    <div className="flex-1 min-w-0 text-sm">
                      <div className="truncate">{m.home}</div>
                      <div className="truncate">{m.away}</div>
                    </div>
                    {m.open ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <input aria-label={`Góly ${m.home}`} inputMode="numeric" className="w-10 h-9 rounded-soft border border-line text-center text-base tabular-nums bg-white"
                          value={draft[m.matchId]?.home ?? ""} onChange={(e) => set(m.matchId, "home", e.target.value)} disabled={busy} />
                        <span className="text-muted">:</span>
                        <input aria-label={`Góly ${m.away}`} inputMode="numeric" className="w-10 h-9 rounded-soft border border-line text-center text-base tabular-nums bg-white"
                          value={draft[m.matchId]?.away ?? ""} onChange={(e) => set(m.matchId, "away", e.target.value)} disabled={busy} />
                      </div>
                    ) : (
                      <div className="text-right shrink-0 text-sm">
                        <div className="tabular-nums">{m.tip ? `${m.tip.home}:${m.tip.away}` : "bez tipu"}</div>
                        <div className="text-meta text-muted">už se hraje</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <div className="px-4 py-3 border-t border-line-soft space-y-2">
              <div className="text-sm text-muted">
                Tipuje {round.entries} {round.entries === 1 ? "klub" : round.entries >= 2 && round.entries <= 4 ? "kluby" : "klubů"}
                {round.joined ? ", vy taky." : "."}
              </div>
              {error && <div className="text-sm text-card-red">{error}</div>}
              {saved && !error && <div className="text-sm text-pitch-600">{saved}</div>}
              <Button variant="primary" size="md" disabled={busy || filled.length === 0} onClick={save}>
                {busy ? "Ukládám…" : "Uložit tipy"}
              </Button>
            </div>
          </>
        )}
      </ListCard>

      {view.last && (
        <div className="card px-4 py-3 text-sm space-y-1">
          <div className="font-heading font-bold">Minulé kolo ({dayLabel(view.last.day)})</div>
          {view.last.winners.length > 0 && (
            <div>Bank: {view.last.winners.map((w) => `${w.name} (${w.points} ${pointsLabel(w.points)}, ${formatKc(w.payout)})`).join(", ")}</div>
          )}
          {view.last.myPoints != null && (
            <div className="text-muted">Vy: {view.last.myPoints} {pointsLabel(view.last.myPoints)}{view.last.myPayout > 0 ? `, výhra ${formatKc(view.last.myPayout)}` : ""}.</div>
          )}
        </div>
      )}

      {view.season.length > 0 && (
        <ListCard title="Nejlepší tipaři sezóny">
          {view.season.map((s, i) => (
            <ListRow key={s.teamId} dense tone={s.teamId === teamId ? "new" : undefined}
              leading={<span className="text-meta text-muted tabular-nums">{i + 1}.</span>}
              title={s.name}
              trailing={<span className="font-heading font-bold tabular-nums">{s.points} {pointsLabel(s.points)}</span>} />
          ))}
        </ListCard>
      )}
    </div>
  );
}
