"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface Teammate {
  id: string;
  first_name: string;
  last_name: string;
  squad_number?: number | null;
}

interface Props {
  teamId: string;
  playerId: string;
  current: number | null | undefined;
  teammates: Teammate[];
  /** Změněná čísla (hráč a případně spoluhráč, se kterým se prohodilo). */
  onChanged: (changes: Array<{ id: string; number: number | null }>) => void;
}

/**
 * Výběr čísla dresu. U obsazeného čísla je vidět, kdo ho nosí: server čísla prohodí,
 * takže dva hráči týmu nikdy nemají stejné číslo.
 */
export function SquadNumberEditor({ teamId, playerId, current, teammates, onChanged }: Props) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const holders = new Map<number, Teammate>();
  for (const t of teammates) {
    if (t.id !== playerId && t.squad_number) holders.set(t.squad_number, t);
  }

  const change = async (value: number) => {
    if (value === current) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch<{ number: number; swappedWith: { id: string; name: string; number: number | null } | null }>(
        `/api/teams/${teamId}/players/${playerId}/squad-number`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number: value }) },
      );
      const changes: Array<{ id: string; number: number | null }> = [{ id: playerId, number: res.number }];
      if (res.swappedWith) changes.push({ id: res.swappedWith.id, number: res.swappedWith.number });
      onChanged(changes);
      setMessage(
        res.swappedWith
          ? `Hotovo. ${res.swappedWith.name} teď nosí číslo ${res.swappedWith.number ?? "bez čísla"}.`
          : "Číslo dresu změněno.",
      );
    } catch (e) {
      console.error("změna čísla dresu selhala:", e);
      setError(e instanceof Error ? e.message : "Číslo se nepodařilo změnit.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="text-right">
      <select
        aria-label="Číslo dresu"
        value={current ?? ""}
        disabled={saving}
        onChange={(e) => change(Number(e.target.value))}
        className="font-heading font-bold text-sm border border-gray-300 rounded-soft px-2 py-1 bg-white max-w-[220px]"
      >
        {!current && <option value="">Bez čísla</option>}
        {Array.from({ length: 99 }, (_, i) => i + 1).map((n) => {
          const holder = holders.get(n);
          return (
            <option key={n} value={n}>
              {holder ? `${n} (nosí ${holder.last_name}, prohodí se)` : `${n}`}
            </option>
          );
        })}
      </select>
      {message && <div className="text-sm text-pitch-600 mt-1">{message}</div>}
      {error && <div className="text-sm text-red-600 mt-1">{error}</div>}
    </div>
  );
}
