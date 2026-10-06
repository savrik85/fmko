"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button, JerseyPreview, Modal } from "@/components/ui";

interface Teammate {
  id: string;
  first_name: string;
  last_name: string;
  squad_number?: number | null;
}

interface Props {
  teamId: string;
  playerId: string;
  playerName: string;
  current: number | null | undefined;
  teammates: Teammate[];
  jersey: { primary: string; secondary: string; pattern: string };
  /** Změněná čísla (hráč a případně spoluhráč, se kterým se prohodilo). */
  onChanged: (changes: Array<{ id: string; number: number | null }>) => void;
}

const NUMBERS = Array.from({ length: 99 }, (_, i) => i + 1);

/**
 * Číslo dresu: dres s číslem a tlačítko Změnit, výběr v mřížce 1–99. Obsazené číslo je
 * vidět i s tím, kdo ho nosí; po potvrzení server čísla prohodí, takže kolize nevznikne.
 */
export function SquadNumberEditor({ teamId, playerId, playerName, current, teammates, jersey, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(current ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelected(current ?? null);
      setError(null);
    }
  }, [open, current]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const holders = new Map<number, Teammate>();
  for (const t of teammates) {
    if (t.id !== playerId && t.squad_number) holders.set(t.squad_number, t);
  }
  const holder = selected ? holders.get(selected) : undefined;
  const changed = selected !== null && selected !== current;

  const save = async () => {
    if (!changed || selected === null) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ number: number; swappedWith: { id: string; name: string; number: number | null } | null }>(
        `/api/teams/${teamId}/players/${playerId}/squad-number`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number: selected }) },
      );
      const changes: Array<{ id: string; number: number | null }> = [{ id: playerId, number: res.number }];
      if (res.swappedWith) changes.push({ id: res.swappedWith.id, number: res.swappedWith.number });
      onChanged(changes);
      setMessage(
        res.swappedWith
          ? `Číslo ${res.number} je jeho. ${res.swappedWith.name} teď nosí ${res.swappedWith.number ?? "jiné číslo"}.`
          : `Hotovo, nové číslo ${res.number}.`,
      );
      setOpen(false);
    } catch (e) {
      console.error("změna čísla dresu selhala:", e);
      setError(e instanceof Error ? e.message : "Číslo se nepodařilo změnit.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-soft border border-gray-200 bg-white pl-2.5 pr-3 py-1 hover:border-pitch-500 hover:bg-pitch-50 transition-colors"
        aria-label={`Číslo dresu ${current ?? "nepřiděleno"}, změnit`}
      >
        <span className="font-heading font-black text-base tabular-nums text-ink">{current ?? "-"}</span>
        <span className="text-sm font-heading font-bold text-pitch-600">Změnit</span>
      </button>
      {message && <div className="text-sm text-pitch-600 mt-1">{message}</div>}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Číslo dresu" maxWidth="520px">
        <div className="text-left">
          {/* Hlavička zůstává nahoře, i když se mřížka posouvá: je v ní, co se stane po uložení.
              Na mobilu má plachta nahoře 16px úchyt, proto top-4. */}
          <div className="sticky top-4 sm:top-0 z-10 bg-paper px-4 sm:px-5 pt-2 sm:pt-5 pb-3 border-b border-line">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="font-heading font-bold text-lg text-ink">Číslo dresu</div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Zavřít" className="text-muted hover:text-ink text-xl leading-none px-1">✕</button>
            </div>
            <div className="flex items-center gap-3">
              <JerseyPreview
                primary={jersey.primary}
                secondary={jersey.secondary}
                pattern={jersey.pattern as Parameters<typeof JerseyPreview>[0]["pattern"]}
                size={56}
                number={selected ?? undefined}
              />
              <div className="min-w-0 flex-1">
                <div className="font-heading font-bold text-base text-ink truncate">{playerName}</div>
                <div className="text-sm text-ink min-h-[40px]" aria-live="polite">
                  {!changed && <span className="text-muted">{current ? `Teď nosí ${current}. ` : "Zatím nemá číslo. "}Klepni na nové.</span>}
                  {changed && !holder && <>Číslo <strong>{selected}</strong> je volné.</>}
                  {changed && holder && (
                    <>
                      Číslo <strong>{selected}</strong> nosí {holder.first_name} {holder.last_name}. Čísla se prohodí,
                      {current ? <> {holder.last_name} dostane <strong>{current}</strong>.</> : <> {holder.last_name} dostane volné číslo.</>}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-5 py-4 space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-white border border-line-strong" />volné</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-amber-50 border border-amber-300" />nosí spoluhráč</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-white border-2 border-pitch-500" />teď</span>
            </div>

            <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5" role="listbox" aria-label="Čísla dresů">
              {NUMBERS.map((n) => {
                const taken = holders.get(n);
                const isCurrent = n === current;
                const isSelected = n === selected;
                const base = "relative h-10 rounded-lg font-heading font-bold text-base tabular-nums transition-colors";
                const look = isSelected
                  ? "bg-pitch-500 text-white border border-pitch-500 shadow"
                  : isCurrent
                    ? "bg-white text-pitch-700 border-2 border-pitch-500"
                    : taken
                      ? "bg-amber-50 text-amber-900 border border-amber-300 hover:border-amber-500"
                      : "bg-white text-ink border border-line-strong hover:border-pitch-500 hover:bg-pitch-50";
                return (
                  <button
                    key={n}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    title={taken ? `Nosí ${taken.first_name} ${taken.last_name}` : isCurrent ? "Současné číslo" : "Volné"}
                    aria-label={`Číslo ${n}, ${taken ? `nosí ${taken.first_name} ${taken.last_name}` : isCurrent ? "současné" : "volné"}`}
                    onClick={() => setSelected(n)}
                    className={`${base} ${look}`}
                  >
                    {n}
                    {taken && !isSelected && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Uložit je pořád na očích, ne až pod číslem 99. */}
          <div className="sticky bottom-0 z-10 bg-paper border-t border-line px-4 sm:px-5 py-3 space-y-2">
            {error && <div className="text-sm text-card-red">{error}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" type="button" onClick={() => setOpen(false)}>Zrušit</Button>
              <Button variant="primary" size="md" type="button" disabled={!changed || saving} onClick={save}>
                {saving ? "Ukládám…" : "Uložit číslo"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
