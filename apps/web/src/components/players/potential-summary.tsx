"use client";

/**
 * Potenciál hráče rozdělený na tři místa profilu, aby se nic neopakovalo:
 *   - `usePotencial` načte data jednou a sdílí je,
 *   - `PotentialBox` → hvězdy do hlavičky vedle Kondice/Morálky/Ratingu,
 *   - `PotentialBadge` → slovní verdikt mezi ostatní odznaky hráče,
 *   - odhad maxima si vykresluje karta `PotentialProgress` dole.
 */

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { TalentStars } from "@/components/players/talent-stars";

export interface PotencialData {
  hrac?: { hodnoceni: number };
  skaut: { maSkauta: boolean; rozptyl: number | null };
  talent: { slovne: string; hodnota: number } | null;
  nadejnost: {
    slovne: string; uroven: string; zobrazitOdznak: boolean;
    odhadStropu: number; realnyStrop: number;
    stropOpor: number; zbyvaDoStropu: number;
  } | null;
}

/** Jeden fetch pro všechna tři místa v profilu. */
export function usePotencial(teamId: string | null, playerId: string): PotencialData | null {
  const [data, setData] = useState<PotencialData | null>(null);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<PotencialData>(`/api/teams/${teamId}/players/${playerId}/development`)
      .then(setData)
      .catch((e) => console.error("potential:", e));
  }, [teamId, playerId]);

  return data;
}

/** Odhad maxima, kam hráč reálně dojde — jako rozpětí, protože je to odhad skauta. */
export function rozpetiMaxima(data: PotencialData): { dolni: number; horni: number } | null {
  if (!data.nadejnost) return null;
  const rozptyl = data.skaut.rozptyl ?? 0;
  const dnes = data.hrac?.hodnoceni ?? 0;
  return {
    dolni: Math.max(dnes, data.nadejnost.realnyStrop - rozptyl),
    horni: Math.min(100, data.nadejnost.realnyStrop + rozptyl),
  };
}

/** Hvězdy do hlavičky. Popisek a rozložení si řeší hlavička sama, tady jsou jen hvězdy. */
export function PotentialStars(
  { data, klic }:
  {
    data: PotencialData | null;
    /** Unikátní napříč stránkou — SVG gradienty se jinak přebijí. */ klic: string;
  },
) {
  if (!data?.nadejnost) return null;

  const rozpeti = rozpetiMaxima(data);
  const popis = [data.nadejnost.slovne, rozpeti && `maximum ${rozpeti.dolni}–${rozpeti.horni}`, data.talent?.slovne]
    .filter(Boolean).join(" · ");

  return (
    <span className="flex justify-center leading-none" title={popis}>
      <TalentStars
        hodnoceni={data.hrac?.hodnoceni ?? 0}
        odhadStropu={data.nadejnost.realnyStrop}
        stropOpor={data.nadejnost.stropOpor}
        kompaktni
        klic={klic}
        uroven={data.nadejnost.uroven as "hvezda" | "nadejny" | "prumer" | "slaby"}
      />
    </span>
  );
}

const BARVA_ODZNAKU: Record<string, string> = {
  hvezda: "bg-gold-50 text-gold-700 border-gold-200",
  nadejny: "bg-pitch-50 text-pitch-600 border-pitch-200",
  prumer: "bg-blue-50 text-blue-700 border-blue-200",
  slaby: "bg-gray-50 text-muted border-gray-200",
};

const EMOJI_ODZNAKU: Record<string, string> = {
  hvezda: "✨", nadejny: "📈", prumer: "🔁", slaby: "🪑",
};

/** Slovní verdikt jako odznak — patří mezi ostatní charakteristiky hráče. */
export function PotentialBadge({ data }: { data: PotencialData | null }) {
  // Bez posunu odznak nemá co říct — hráč v tom pásmu už je
  if (!data?.nadejnost?.zobrazitOdznak) return null;
  const u = data.nadejnost.uroven;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-heading font-bold ${BARVA_ODZNAKU[u] ?? BARVA_ODZNAKU.slaby}`}
      title="Odhad skauta, kam to hráč dotáhne proti tomu, co máš v áčku. Může se mýlit."
    >
      <span>{EMOJI_ODZNAKU[u] ?? "🪑"}</span>
      <span>{data.nadejnost.slovne}</span>
    </div>
  );
}
