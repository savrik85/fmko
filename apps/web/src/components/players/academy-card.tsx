"use client";

/**
 * Mládežnická akademie — kolik klub sype do práce s mládeží.
 *
 * Investice se platí průběžně každý týden, odchovanec přijde až na konci sezóny.
 * Cena se schválně neukazuje v tlačítku, ale v informačním řádku u každé úrovně.
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiAction } from "@/lib/api";

interface Uroven {
  klic: "none" | "minimal" | "medium" | "high";
  nazev: string;
  popis: string;
  mesicne: number;
  tydne: number;
  sanceNaOdchovance: number;
}

interface AkademieData {
  aktualni: string;
  populace: number;
  maU21Tym: boolean;
  urovne: Uroven[];
}

export function AcademyCard({ teamId }: { teamId: string }) {
  const [data, setData] = useState<AkademieData | null>(null);
  const [vybrana, setVybrana] = useState<string | null>(null);
  const [uklada, setUklada] = useState(false);
  const [ulozeno, setUlozeno] = useState(false);

  const nacti = useCallback(() => {
    apiFetch<AkademieData>(`/api/teams/${teamId}/academy`)
      .then((d) => { setData(d); setVybrana(d.aktualni); })
      .catch((e) => console.error("academy load:", e));
  }, [teamId]);

  useEffect(() => { nacti(); }, [nacti]);

  if (!data) return null;

  const zmeneno = vybrana !== null && vybrana !== data.aktualni;
  const aktualniUroven = data.urovne.find((u) => u.klic === vybrana);

  const uloz = async () => {
    if (!vybrana || uklada) return;
    setUklada(true);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/academy`, {
        method: "POST",
        body: JSON.stringify({ investment: vybrana }),
        headers: { "Content-Type": "application/json" },
      }),
      "Nastavení akademie se nepodařilo uložit",
    );
    setUklada(false);
    if (ok) {
      setUlozeno(true);
      setTimeout(() => setUlozeno(false), 2500);
      nacti();
    }
  };

  return (
    <section className="card p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="font-heading font-bold text-base">Mládežnická akademie</h2>
        <p className="text-sm text-muted mt-1">
          Kolik klub sype do práce s žáky. Platí se každý týden, odchovanec přijde
          na konci sezóny rovnou do dorostu.
        </p>
      </div>

      {!data.maU21Tym && (
        <div className="card border-l-4 border-gold-500 bg-gold-50 p-3 text-sm">
          Klub nemá dorostenecký tým, takže odchovanec by neměl kam jít. Nejdřív založ U21.
        </div>
      )}

      <div className="space-y-2">
        {data.urovne.map((u) => {
          const aktivni = vybrana === u.klic;
          return (
            <button
              key={u.klic}
              onClick={() => setVybrana(u.klic)}
              className={`w-full text-left p-3 rounded-soft border transition ${
                aktivni ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="font-heading font-bold text-sm text-ink">{u.nazev}</span>
                <span className="text-sm tabular-nums text-muted">
                  {u.tydne > 0 ? `${u.tydne.toLocaleString("cs")} Kč/týden` : "zdarma"}
                  {u.klic !== "none" && ` · šance ${u.sanceNaOdchovance} %`}
                </span>
              </div>
              <p className="text-sm text-muted mt-1 leading-snug">{u.popis}</p>
            </button>
          );
        })}
      </div>

      {aktualniUroven && aktualniUroven.klic !== "none" && (
        <p className="text-sm text-muted">
          Za sezónu tě akademie vyjde zhruba na{" "}
          <strong className="text-ink font-heading tabular-nums">
            {(aktualniUroven.tydne * 26).toLocaleString("cs")} Kč
          </strong>
          . Vesnice s {data.populace.toLocaleString("cs")} obyvateli dává šanci{" "}
          {aktualniUroven.sanceNaOdchovance} % na odchovance za sezónu.
        </p>
      )}

      <div className="pt-1">
        <button
          onClick={uloz}
          disabled={!zmeneno || uklada}
          className="btn btn-primary btn-md w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {uklada ? "Ukládám…" : ulozeno ? "Uloženo" : "Uložit nastavení"}
        </button>
      </div>
    </section>
  );
}
