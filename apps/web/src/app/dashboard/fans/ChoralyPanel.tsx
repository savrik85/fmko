"use client";

/**
 * Chorály klubu.
 *
 * Vlastní soubor, protože `FanGroupsPanel` má svých čtyři sta řádků a tohle
 * je samostatná věc: text chorálu, jak je slyšet a jestli k němu je nahrávka.
 */

import { useState } from "react";
import { SectionLabel } from "@/components/ui";
import { apiFetch, showError } from "@/lib/api";

/** Síla, od které si chorál zaslouží nahrávku. Musí sedět s API. */
export const SILA_NA_NAHRAVKU = 80;

export interface ChantAudioView {
  url: string;
  maDruhou: boolean;
  vybrana: string;
}

export interface ChantView {
  id: string;
  kind: string;
  text: string;
  duvod: string;
  sila: number;
  silaWord: string;
  since: string | null;
  audio: ChantAudioView | null;
  nahravkaSeChysta: boolean;
}

const DRUH: Record<string, { label: string; ikona: string }> = {
  domov: { label: "Domácí", ikona: "🏡" },
  oblibenec: { label: "Miláček kotle", ikona: "⭐" },
  rival: { label: "Proti soupeři", ikona: "⚔️" },
  trener_pro: { label: "Za trenéra", ikona: "🙌" },
  trener_proti: { label: "Proti trenérovi", ikona: "✊" },
  vyhra: { label: "Vítězná", ikona: "🏆" },
  vzdor: { label: "Vzdor", ikona: "🪨" },
  vybaveni: { label: "Stížnost", ikona: "🚽" },
};

function silaBarva(v: number): string {
  if (v >= SILA_NA_NAHRAVKU) return "bg-pitch-500";
  if (v >= 55) return "bg-gold-500";
  if (v >= 30) return "bg-gold-600";
  return "bg-card-red";
}

export function ChoralyPanel({ chants, teamId, onChanged }: {
  chants: ChantView[];
  teamId: string;
  onChanged: () => Promise<void> | void;
}) {
  const [meni, setMeni] = useState<string | null>(null);

  if (chants.length === 0) {
    return (
      <div className="card p-4 sm:p-5">
        <SectionLabel>Chorály</SectionLabel>
        <p className="text-sm text-muted mt-2">
          Zatím se u vás nic nezpívá. Chorál si fanoušci vymyslí sami, až k tomu budou mít důvod.
        </p>
      </div>
    );
  }

  // Domácí chorál patří nahoru, je to ten, co se zpívá pořád. Zbytek podle síly.
  const serazene = [...chants].sort((a, b) => {
    if (a.kind === "domov") return -1;
    if (b.kind === "domov") return 1;
    return b.sila - a.sila;
  });

  const vyberVerzi = async (chantId: string, varianta: "a" | "b") => {
    setMeni(chantId);
    const res = await apiFetch<{ error?: string }>(
      `/api/teams/${teamId}/fans/chants/${chantId}/audio`,
      { method: "POST", body: JSON.stringify({ varianta }) },
    ).catch((e) => {
      console.error("výběr verze chorálu:", e);
      return { error: "Verzi se nepodařilo přepnout." };
    });
    setMeni(null);
    if (res?.error) { showError("Nepovedlo se", res.error); return; }
    await onChanged();
  };

  return (
    <div className="card p-4 sm:p-5">
      <SectionLabel>Chorály</SectionLabel>
      <p className="text-sm text-muted mt-2 mb-4">
        Nahrávku dostane domácí chorál a pak každý, který kotel opravdu přijme, tedy
        od síly {SILA_NA_NAHRAVKU}. Nekupuje se, vyzpívá se.
      </p>

      <div className="space-y-4">
        {serazene.map((ch) => {
          const d = DRUH[ch.kind] ?? { label: ch.kind, ikona: "📣" };
          const domaci = ch.kind === "domov";
          return (
            <div
              key={ch.id}
              className={`rounded-lg border p-3 ${domaci ? "border-pitch-500 bg-pitch-50" : "border-line"}`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-bold">
                  {d.ikona} {d.label}
                </span>
                <span className="text-sm text-muted">{ch.silaWord}</span>
              </div>

              <p className="font-heading font-bold text-base mt-2 leading-snug">{ch.text}</p>
              <p className="text-sm text-muted mt-1">{ch.duvod}</p>

              <div className="mt-2 h-1.5 rounded bg-line overflow-hidden">
                <div className={`h-full ${silaBarva(ch.sila)}`} style={{ width: `${ch.sila}%` }} />
              </div>

              {ch.audio ? (
                <div className="mt-3">
                  {/* `key` na adrese: bez něj si prohlížeč po přepnutí verze
                      nechá načtenou tu starou a tlačítko vypadá jako mrtvé. */}
                  <audio
                    key={`${ch.id}-${ch.audio.vybrana}`}
                    controls
                    preload="none"
                    src={`${ch.audio.url}?v=${ch.audio.vybrana}`}
                    className="w-full"
                  />
                  {ch.audio.maDruhou && (
                    <div className="mt-2">
                      <p className="text-sm text-muted mb-1">
                        Nahrávky jsou dvě a znějí jinak. Vyber si tu, co se ti líbí víc.
                      </p>
                      <div className="flex gap-2">
                        {(["a", "b"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            disabled={meni === ch.id}
                            onClick={() => vyberVerzi(ch.id, v)}
                            className={`px-3 py-1.5 rounded text-sm font-bold border ${
                              ch.audio?.vybrana === v
                                ? "bg-pitch-500 text-white border-pitch-500"
                                : "border-line hover:bg-parchment"
                            } disabled:opacity-50`}
                          >
                            {v === "a" ? "První verze" : "Druhá verze"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : ch.nahravkaSeChysta ? (
                <p className="text-sm text-gold-700 mt-3">🎙️ Nahrává se, bude to chvíli trvat.</p>
              ) : (
                <p className="text-sm text-muted mt-3">
                  {domaci
                    ? "Nahrávka se pořídí při nejbližším zpracování dne."
                    : `Bez nahrávky. Kotel ji dostane, až se chorál chytne naplno (${ch.sila} ze ${SILA_NA_NAHRAVKU}).`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
