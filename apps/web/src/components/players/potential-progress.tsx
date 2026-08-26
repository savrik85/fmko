"use client";

/**
 * Potenciál rozvoje — kam až hráč může dojít a kolik už z toho ušel.
 *
 * Skutečný strop se nikdy neukazuje přesně; klub vidí jen pásmo, které je tím užší,
 * čím lepšího má skauta. Bez skauta nevidí nic — to je celý smysl toho, aby se skaut
 * v realizačním týmu vyplatil.
 */

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { SectionLabel } from "@/components/ui";
import { TalentStars } from "@/components/players/talent-stars";

interface AtributRozvoje {
  atribut: string;
  nazev: string;
  soucasna: number;
  odhadMin: number | null;
  odhadMax: number | null;
  vahaVHodnoceni: number;
}

interface RozvojData {
  hrac?: { hodnoceni: number };
  skaut: { maSkauta: boolean; presnost: string | null; rozptyl: number | null };
  talent: { slovne: string; hodnota: number } | null;
  /** Jen u hráčů do 21 let a jen se skautem — kam to podle odhadu dotáhne. */
  nadejnost: {
    slovne: string; uroven: string; odhadStropu: number; realnyStrop: number;
    stropOpor: number; zbyvaDoStropu: number;
  } | null;
  atributy: AtributRozvoje[];
  rustZa30Dni: { celkem: number; podleAtributu: Array<{ atribut: string; nazev: string; zmena: number }> };
}

/** Barva verdiktu nadějnosti. */
const BARVA_NADEJNOSTI: Record<string, string> = {
  hvezda: "bg-gold-50 text-gold-700 border-gold-300",
  nadejny: "bg-pitch-50 text-pitch-600 border-pitch-300",
  prumer: "bg-blue-50 text-blue-600 border-blue-200",
  slaby: "bg-gray-100 text-muted border-gray-200",
};

/**
 * Barva odznaku tempa rozvoje. Tempo NENÍ totéž co strop — proto je odznak vizuálně
 * odlišený od hvězd a verdiktu, aby se to nepletlo.
 */
function barvaTempa(slovne: string): string {
  if (slovne === "učí se bleskově") return "bg-purple-50 text-purple-600";
  if (slovne === "učí se rychle") return "bg-blue-50 text-blue-600";
  if (slovne === "průměrné tempo") return "bg-gray-100 text-muted";
  return "bg-gray-100 text-muted";
}

export function PotentialProgress({ teamId, playerId }: { teamId: string; playerId: string }) {
  const [data, setData] = useState<RozvojData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch<RozvojData>(`/api/teams/${teamId}/players/${playerId}/development`)
      .then((d) => { setData(d); setLoaded(true); })
      .catch((e) => { console.error("development load:", e); setLoaded(true); });
  }, [teamId, playerId]);

  if (!loaded || !data) return null;

  const rustMap = new Map(data.rustZa30Dni.podleAtributu.map((r) => [r.atribut, r.zmena]));
  // Ukázat jen to, na čem na dané pozici záleží — jinak by karta byla nekonečná
  const atributy = data.atributy.filter((a) => a.vahaVHodnoceni > 0);

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <SectionLabel>Potenciál rozvoje</SectionLabel>
        {data.talent && (
          <span
            className={`text-sm px-2.5 py-1 rounded-full font-heading font-bold ${barvaTempa(data.talent.slovne)}`}
            title="Jak rychle se hráč zlepšuje. Kam až dojde, ukazují hvězdy."
          >
            {data.talent.slovne}
          </span>
        )}
      </div>

      {!data.skaut.maSkauta ? (
        <p className="text-sm text-muted">
          Bez skauta v realizačním týmu nikdo neodhadne, kam až hráč může dojít.
          Najmi skauta v sekci Zaměstnanci a uvidíš odhad stropu i talent.
        </p>
      ) : (
        <>
          {/* Legenda k hvězdám v hlavičce. Bez ní není poznat, co je dnešek a co výhled. */}
          <div className="flex items-center gap-3 flex-wrap mb-3 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#2D5F2D" }} />
              hvězdy plnou barvou = jak hraje dnes
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#81C784" }} />
              světlé = kam může dojít
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#F0D060" }} />
              zlaté = přeroste opory áčka
            </span>
          </div>

          <div className="flex items-baseline gap-2 flex-wrap mb-4">
            {/* Odhad maxima patří sem, ne do hlavičky — tam jsou jen hvězdy */}
            {data.nadejnost && (
              <span className="text-sm">
                Dotáhne to zhruba na{" "}
                <strong className="text-ink font-heading tabular-nums">
                  {Math.max(data.hrac?.hodnoceni ?? 0, data.nadejnost.realnyStrop - (data.skaut.rozptyl ?? 0))}
                  –
                  {Math.min(100, data.nadejnost.realnyStrop + (data.skaut.rozptyl ?? 0))}
                </strong>
              </span>
            )}
            <span className="text-sm text-muted">
              Odhad skauta je <strong className="text-ink font-heading">{data.skaut.presnost}</strong>
              {data.skaut.rozptyl !== null && ` (±${data.skaut.rozptyl})`}
            </span>
            {data.rustZa30Dni.celkem > 0 && (
              <span className="text-sm font-heading font-bold text-pitch-500">
                +{data.rustZa30Dni.celkem} za posledních 30 dní
              </span>
            )}
          </div>

          <div className="space-y-3">
            {atributy.map((a) => {
              const rust = rustMap.get(a.atribut) ?? 0;
              const min = a.odhadMin ?? a.soucasna;
              const max = a.odhadMax ?? a.soucasna;
              const naStropu = a.soucasna >= max;

              return (
                <div key={a.atribut}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-sm font-heading font-bold text-ink">{a.nazev}</span>
                    <span className="text-sm tabular-nums">
                      <strong className="font-heading text-ink">{a.soucasna}</strong>
                      <span className="text-muted"> / {min}–{max}</span>
                      {rust > 0 && <span className="text-pitch-500 font-heading font-bold ml-2">+{rust}</span>}
                    </span>
                  </div>

                  {/* Plná část = co hráč umí teď, světlé pásmo = kam ho odhad skauta pouští */}
                  <div className="relative h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-pitch-100"
                      style={{ width: `${Math.min(100, max)}%` }}
                    />
                    <div
                      className={`absolute inset-y-0 left-0 ${naStropu ? "bg-gold-500" : "bg-pitch-500"}`}
                      style={{ width: `${Math.min(100, a.soucasna)}%` }}
                    />
                  </div>

                  {naStropu && (
                    <div className="text-micro text-gold-600 font-heading font-bold mt-0.5">
                      Na svém stropu — tréninkem už z něj víc nedostaneš
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
