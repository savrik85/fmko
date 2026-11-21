"use client";

/**
 * Domácí pomezní s praporkem (F15). Jen u domácího ligového zápasu: klub smí k čáře
 * postavit vlastního člověka, poctivého, nebo takového, co vidí ofsajd jen u hostů.
 *
 * Stav drží stránka sestavy (ukládá se se sestavou). Komponenta si sama načte vůdce
 * fanoušků, uloženou volbu a kolikrát klub letos nadržoval, a uloženou volbu předá
 * přes `onLoad` (bez označení neuložené změny).
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ChoiceGroup } from "@/components/ui";

export type LinesmanStyle = "fair" | "homer";
export interface LinesmanChoice {
  kind: "player" | "fan_leader";
  id: string;
  style: LinesmanStyle;
}

interface Overview {
  applies: boolean;
  current: LinesmanChoice | null;
  fanLeaders: Array<{ id: string; name: string; groupName: string | null }>;
  homerUses: number;
  limit: number;
  fine: number;
}

/** Hráč, který může vzít praporek (nehraje ani nesedí na lavičce). */
export interface LinesmanPlayerOption {
  id: string;
  name: string;
  note: string | null;
}

type StyleKey = "none" | LinesmanStyle;

const STYLE_OPTIONS: Array<{ value: StyleKey; label: string }> = [
  { value: "none", label: "Žádný" },
  { value: "fair", label: "Poctivý" },
  { value: "homer", label: "Nadržuje nám" },
];

const selectClass =
  "w-full min-w-0 px-2.5 py-2 rounded-soft border-2 border-gray-200 bg-white text-sm font-heading text-ink";

function key(c: { kind: string; id: string }): string {
  return `${c.kind}:${c.id}`;
}

export function LinesmanPicker({ teamId, calendarId, value, onChange, onLoad, players, referee }: {
  teamId: string;
  calendarId: string;
  value: LinesmanChoice | null | undefined;
  onChange: (next: LinesmanChoice | null) => void;
  onLoad: (current: LinesmanChoice | null) => void;
  players: LinesmanPlayerOption[];
  referee: { name: string; strictness: number } | null;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOverview(null);
    apiFetch<Overview>(`/api/teams/${teamId}/linesman?calendarId=${encodeURIComponent(calendarId)}`)
      .then((d) => {
        if (cancelled) return;
        setOverview(d);
        onLoad(d.applies ? d.current : null);
      })
      .catch((e) => console.error("načtení domácího pomezního:", e));
    return () => { cancelled = true; };
    // onLoad je z rodiče a mění se s každým renderem; načítá se jen při změně zápasu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, calendarId]);

  if (!overview?.applies) return null;

  const leaders = overview.fanLeaders;
  const style: StyleKey = value ? value.style : "none";
  const candidates: Array<{ kind: LinesmanChoice["kind"]; id: string }> = [
    ...leaders.map((l) => ({ kind: "fan_leader" as const, id: l.id })),
    ...players.map((p) => ({ kind: "player" as const, id: p.id })),
  ];
  const chosenAvailable = !!value && candidates.some((c) => key(c) === key(value));
  const noOne = candidates.length === 0;

  const pickStyle = (next: StyleKey) => {
    if (next === "none") { onChange(null); return; }
    if (value && chosenAvailable) { onChange({ ...value, style: next }); return; }
    // Kdo vezme praporek: nadržovat umí nejlíp vůdce kotle, poctivě mávat hráč mimo zápas.
    const preferred = next === "homer"
      ? candidates.find((c) => c.kind === "fan_leader") ?? candidates[0]
      : candidates.find((c) => c.kind === "player") ?? candidates[0];
    if (preferred) onChange({ ...preferred, style: next });
  };

  const pickPerson = (raw: string) => {
    const c = candidates.find((x) => key(x) === raw);
    if (c && value) onChange({ kind: c.kind, id: c.id, style: value.style });
  };

  const usesLeft = overview.limit - overview.homerUses;
  const fine = overview.fine.toLocaleString("cs-CZ");

  return (
    <div className="card p-3">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-micro text-muted font-heading uppercase tracking-wide">Domácí pomezní</span>
        {overview.homerUses > 0 && (
          <span className="text-micro text-muted">
            Nadržoval letos: <span className={`font-heading font-bold ${usesLeft <= 1 ? "text-card-red" : "text-gold-600"}`}>{overview.homerUses}×</span>
          </span>
        )}
      </div>
      <ChoiceGroup ariaLabel="Domácí pomezní" columns={3} size="sm" value={style}
        onChange={pickStyle}
        options={STYLE_OPTIONS.map((o) => ({ ...o, disabled: o.value !== "none" && noOne }))} />

      {value && (
        <label className="block mt-2">
          <span className="block text-micro text-muted font-heading uppercase tracking-wide mb-1">Praporek drží</span>
          <select className={selectClass} value={chosenAvailable ? key(value) : ""} onChange={(e) => pickPerson(e.target.value)}>
            {!chosenAvailable && <option value="" disabled>Vyber, kdo půjde k čáře</option>}
            {leaders.length > 0 && (
              <optgroup label="Fanoušci">
                {leaders.map((l) => (
                  <option key={l.id} value={key({ kind: "fan_leader", id: l.id })}>
                    {l.name}{l.groupName ? ` (${l.groupName})` : ""}
                  </option>
                ))}
              </optgroup>
            )}
            {players.length > 0 && (
              <optgroup label="Hráči mimo zápas">
                {players.map((p) => (
                  <option key={p.id} value={key({ kind: "player", id: p.id })}>
                    {p.name}{p.note ? ` (${p.note})` : ""}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      )}

      {value && !chosenAvailable && (
        <p className="text-micro text-card-red mt-1.5">Pomezní teď hraje nebo sedí na lavičce. Vyber jiného, jinak sestava nepůjde uložit.</p>
      )}

      <p className="text-micro text-muted mt-1.5 leading-relaxed">
        {style === "none" && (noOne
          ? "Nemáte koho postavit k čáře. Sudí si poradí sám."
          : "Sudí si poradí sám. Na zápas to nemá vliv.")}
        {style === "fair" && "Mává, co vidí. Na zápas to nemá vliv a nic tím neriskujete."}
        {style === "homer" && (
          <>
            Ofsajd soupeře uvidí i tam, kde nebyl, takže sporný ofsajd padne spíš vám.
            Sudí ho ale může prokouknout a před zápasem vyměnit.
            Potřetí v sezóně a pak za každého dalšího dostanete od svazu pokutu {fine} Kč.
          </>
        )}
      </p>
      {style === "homer" && referee && referee.strictness >= 65 && (
        <p className="text-micro text-gold-600 mt-1">{referee.name} píská přísně, takže je velká šance, že pomezního prokoukne.</p>
      )}
      {style === "homer" && usesLeft <= 1 && (
        <p className="text-micro text-card-red mt-1">
          Tenhle nadržující pomezní už vás bude stát pokutu {fine} Kč.
        </p>
      )}
    </div>
  );
}
