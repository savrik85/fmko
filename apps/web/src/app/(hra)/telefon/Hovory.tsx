"use client";

/**
 * Zmeškané hovory.
 *
 * V Čechách je hromada nepřijatých hovorů od jednoho člověka univerzální
 * znamení, že máš průšvih. Sponzor volal pětkrát a ty nevíš proč, ale víš,
 * že to nebude nic dobrého.
 *
 * Nezvoní náhodně. Každý hovor má důvod navázaný na stav klubu, takže když
 * ti volá starosta, opravdu se na stadionu něco semlelo.
 *
 * Vzhled je schválně obtažený podle Nedávných v iPhonu, protože o tom ten
 * vtip celý je: červené jméno, počet zvonění v závorce, šipka zmeškaného
 * hovoru a modré „i" na detail. Kdyby to vypadalo jako další tabulka ve hře,
 * nefungovalo by to. Proto tu jsou i systémové barvy iOS natvrdo, ne tokeny
 * hry: tohle místo má působit jako cizí aplikace, ne jako Prales.
 */

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { apiFetch } from "@/lib/api";

/** Barvy iOS, ať to sedí i vedle skutečného telefonu. */
const MODRA = "#007AFF";
const CERVENA = "#FF3B30";
const SEDA = "#8E8E93";
const LINKA = "#C6C6C8";

interface Hovor {
  id: string;
  volajici: string;
  volajiciLabel: string;
  jmeno: string;
  duvod: string;
  pocet: number;
  gameDate: string;
  seen: boolean;
}

/** „1 hovor", „3 hovory", „7 hovorů". Číslo se ke slovu nelepí samo. */
function hovoruTvar(n: number): string {
  if (n === 1) return "1 hovor";
  return n < 5 ? `${n} hovory` : `${n} hovorů`;
}

/** „včera", „9:41", „14. 9." — jako v Nedávných. */
function kdy(gameDate: string): string {
  const d = new Date(gameDate);
  if (isNaN(d.getTime())) return "";
  const dnes = new Date();
  const denRozdil = Math.floor(
    (Date.UTC(dnes.getFullYear(), dnes.getMonth(), dnes.getDate())
      - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000,
  );
  if (denRozdil <= 0) return d.toLocaleTimeString("cs", { hour: "numeric", minute: "2-digit" });
  if (denRozdil === 1) return "včera";
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
}

export function Hovory({ teamId, onZavrit }: { teamId: string; onZavrit: () => void }) {
  const [hovory, setHovory] = useState<Hovor[] | null>(null);
  const [rozbaleny, setRozbaleny] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ calls: Hovor[] }>(`/api/teams/${teamId}/missed-calls`)
      .then((d) => setHovory(d.calls ?? []))
      .catch((e) => { console.error("zmeškané hovory:", e); setHovory([]); });
    // Otevřením seznamu hovory přestávají svítit.
    apiFetch(`/api/teams/${teamId}/missed-calls/seen`, { method: "POST" })
      .catch((e) => console.error("označení hovorů:", e));
  }, [teamId]);

  return (
    <div className="absolute inset-0 z-30 bg-white flex flex-col">
      {/* Horní lišta iOS: zpět vlevo modře, nic víc. */}
      <div className="shrink-0 px-2 pt-2 pb-1">
        <button
          onClick={onZavrit}
          className="flex items-center gap-0.5 px-1 py-1 text-base"
          style={{ color: MODRA }}
        >
          <span className="text-xl leading-none -mt-0.5">&#8249;</span>
          Telefon
        </button>
      </div>

      {/* Velký nadpis, jak ho má iOS nad seznamem. Počet je pod ním, na jeden
          řádek vedle sebe se na šířku telefonu nevejdou. */}
      <div className="shrink-0 px-4 pb-2">
        <h2 className="text-2xl font-bold tracking-tight text-black leading-tight">
          Nepřijaté hovory
        </h2>
        {hovory && hovory.length > 0 && (
          <p className="text-sm mt-0.5" style={{ color: SEDA }}>{hovoruTvar(hovory.length)}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {hovory === null ? (
          <div className="flex items-center justify-center h-40"><Spinner /></div>
        ) : hovory.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-base mb-1 text-black">Nikdo nevolal</p>
            <p className="text-sm" style={{ color: SEDA }}>
              Buď je klid, nebo to ještě nikdo nezjistil.
            </p>
          </div>
        ) : (
          hovory.map((h) => {
            const otevreny = rozbaleny === h.id;
            return (
              <div key={h.id}>
                <div className="flex items-stretch pl-3 active:bg-gray-100">
                  {/* Šipka příchozího zmeškaného hovoru, jako v Nedávných. */}
                  <div className="shrink-0 w-6 flex items-start justify-center pt-3.5">
                    <span className="text-base leading-none" style={{ color: SEDA }}>&#8601;</span>
                  </div>

                  {/* Oddělovač začíná až za šipkou, ne od kraje displeje. */}
                  <div
                    className="flex-1 min-w-0 flex items-center gap-2 py-2.5 pr-2"
                    style={{ boxShadow: `inset 0 -0.5px 0 ${LINKA}` }}
                  >
                    <button
                      type="button"
                      onClick={() => setRozbaleny(otevreny ? null : h.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="text-base truncate" style={{ color: CERVENA }}>
                        <span className="font-semibold">{h.jmeno}</span>
                        {h.pocet > 1 && <span className="ml-1 tabular-nums">({h.pocet})</span>}
                      </div>
                      <div className="text-sm mt-0.5" style={{ color: SEDA }}>{h.volajiciLabel}</div>
                    </button>

                    <span className="text-sm shrink-0 tabular-nums" style={{ color: SEDA }}>
                      {kdy(h.gameDate)}
                    </span>

                    {/* Modré „i" otevírá detail, přesně jako v iPhonu. */}
                    <button
                      type="button"
                      onClick={() => setRozbaleny(otevreny ? null : h.id)}
                      aria-label={`Podrobnosti hovoru od ${h.jmeno}`}
                      aria-expanded={otevreny}
                      className="shrink-0 w-7 h-7 rounded-full border flex items-center justify-center text-sm font-serif italic"
                      style={{ color: MODRA, borderColor: MODRA }}
                    >
                      i
                    </button>
                  </div>
                </div>

                {otevreny && (
                  <div className="pl-9 pr-4 py-3 bg-[#F2F2F7]" style={{ boxShadow: `inset 0 -0.5px 0 ${LINKA}` }}>
                    <p className="text-sm leading-snug text-black">{h.duvod}</p>
                    <p className="text-sm mt-1.5" style={{ color: SEDA }}>
                      Zpátky se volat nedá, na vsi se to řeší osobně.
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
