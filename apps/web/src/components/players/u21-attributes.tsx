"use client";

/**
 * Kompletní přehled atributů U21: stejná tabulka jako kádr áčka, aby šlo dorost seřadit
 * podle čehokoli a hned vidět, kdo má na svém postu klíčové atributy. Zjednodušená správa
 * (přesuny mezi áčkem a U21, povolání) zůstává na záložce Kádr.
 */

import { useEffect, useState } from "react";
import { apiFetch, type Player } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { PositionFilter, SquadAttributeTable, type PosFilter, type PotentialMap } from "./squad-attribute-table";

interface DevelopmentPlayer {
  id: string;
  strop: number | null;
  nadejnost: { slovne: string; uroven: string } | null;
}

export function U21Attributes({ teamId }: { teamId: string }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [potential, setPotential] = useState<PotentialMap>(new Map());
  const [filter, setFilter] = useState<PosFilter>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ players: Player[] }>(`/api/teams/${teamId}/u21/players`)
      .then((d) => setPlayers(d.players ?? []))
      .catch((e) => { console.error("u21 attributes:", e); setError("Kádr U21 se nepodařilo načíst. Zkus záložku otevřít znovu."); });
    // Potenciál stejný jako na záložce Rozvoj. Bez skauta zůstane prázdný.
    apiFetch<{ hraci: DevelopmentPlayer[] }>(`/api/teams/${teamId}/u21/rozvoj`)
      .then((d) => setPotential(new Map(d.hraci.map((h) => [h.id, { strop: h.strop, uroven: h.nadejnost?.uroven ?? null, slovne: h.nadejnost?.slovne ?? null }]))))
      .catch((e) => console.error("u21 potential:", e));
  }, [teamId]);

  if (error) return <p role="alert" className="card p-4 text-sm">{error}</p>;
  if (!players) return <div className="flex justify-center p-8"><Spinner /></div>;
  if (players.length === 0) return <p className="card p-4 text-sm text-muted">Kádr U21 je prázdný.</p>;

  const filtered = filter === "all" ? players : players.filter((p) => p.position === filter);
  return (
    <div className="space-y-3">
      <PositionFilter players={players} value={filter} onChange={setFilter} />
      <SquadAttributeTable players={filtered} potential={potential} />
    </div>
  );
}
