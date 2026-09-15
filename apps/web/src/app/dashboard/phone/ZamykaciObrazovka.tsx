"use client";

/**
 * Zamykací obrazovka telefonu.
 *
 * Když telefon otevřeš, nejdřív uvidíš zámek s odznakem klubu, hodinami
 * a tím, co ti přišlo. Je to kus rekvizity: telefon má působit jako mobil,
 * který ve hře držíš, ne jako další stránka se seznamem.
 *
 * Odemyká se tapnutím nebo tahem nahoru a drží to po dobu návštěvy. Ukazovat
 * zámek při každém prokliknutí konverzace by po druhé otravovalo, takže se
 * stav pamatuje v `sessionStorage`: po zavření záložky se zamkne znovu.
 */

import { useEffect, useRef, useState } from "react";
import { BadgePreview, type BadgePattern } from "@/components/ui/badge-preview";
import { useTeam } from "@/context/team-context";

const KLIC = "telefon-odemceno";

/** Odemčeno pro tuhle návštěvu? Čte se i zapisuje opatrně, může to házet. */
export function jeOdemceno(): boolean {
  try {
    return sessionStorage.getItem(KLIC) === "1";
  } catch (e) {
    console.warn("čtení zámku telefonu:", e);
    return true;
  }
}

export function ZamykaciObrazovka({ neprectenychZprav, neprectenychOznameni, onOdemknout }: {
  neprectenychZprav: number;
  neprectenychOznameni: number;
  onOdemknout: () => void;
}) {
  const ctx = useTeam();
  const [cas, setCas] = useState("");
  const [datum, setDatum] = useState("");
  const [odchazi, setOdchazi] = useState(false);
  const zacatekTahu = useRef<number | null>(null);

  useEffect(() => {
    const obnov = () => {
      const d = new Date();
      setCas(d.toLocaleTimeString("cs", { hour: "2-digit", minute: "2-digit" }));
      setDatum(d.toLocaleDateString("cs", { weekday: "long", day: "numeric", month: "long" }));
    };
    obnov();
    const t = setInterval(obnov, 20000);
    return () => clearInterval(t);
  }, []);

  const odemkni = () => {
    if (odchazi) return;
    setOdchazi(true);
    try { sessionStorage.setItem(KLIC, "1"); } catch (e) { console.warn("uložení zámku telefonu:", e); }
    // Krátká pauza na animaci vyjetí nahoru, ať to nemrkne.
    setTimeout(onOdemknout, 260);
  };

  const inicialy = (ctx.teamName || "").split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
  const celkem = neprectenychZprav + neprectenychOznameni;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Odemknout telefon"
      onClick={odemkni}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") odemkni(); }}
      onTouchStart={(e) => { zacatekTahu.current = e.touches[0]?.clientY ?? null; }}
      onTouchEnd={(e) => {
        const z = zacatekTahu.current;
        const k = e.changedTouches[0]?.clientY ?? null;
        // Tah nahoru aspoň o 40 px odemyká, jako na iPhonu.
        if (z !== null && k !== null && z - k > 40) odemkni();
        zacatekTahu.current = null;
      }}
      className={`absolute inset-0 z-40 flex flex-col items-center text-white cursor-pointer select-none transition-transform duration-[250ms] ease-in ${
        odchazi ? "-translate-y-full" : "translate-y-0"
      }`}
      style={{
        // Tapeta z barev klubu. Tmavá, aby byl bílý text čitelný na každém dresu.
        background: `linear-gradient(160deg, ${ctx.primaryColor || "#2D5F2D"} 0%, #101012 65%, #000 100%)`,
      }}
    >
      {/* Hodiny a datum, jako na zámku iPhonu. */}
      <div className="pt-10 text-center px-4">
        <div className="text-sm capitalize text-white/70">{datum}</div>
        <div className="font-heading font-bold tabular-nums leading-none text-6xl mt-1">{cas}</div>
      </div>

      {/* Odznak klubu. Kvůli němu to celé je. */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
        <BadgePreview
          primary={ctx.badgePrimary || ctx.primaryColor || "#2D5F2D"}
          secondary={ctx.badgeSecondary || ctx.secondaryColor || "#FFFFFF"}
          pattern={(ctx.badgePattern as BadgePattern) || "shield"}
          initials={ctx.badgeInitials || inicialy}
          symbol={ctx.badgeSymbol}
          size={104}
        />
        <div className="font-heading font-bold text-xl text-center">{ctx.teamName}</div>

        {celkem > 0 ? (
          <div className="mt-2 rounded-2xl bg-white/10 backdrop-blur px-4 py-2.5 text-center">
            <div className="text-sm">
              {neprectenychZprav > 0 && (
                <span>{neprectenychZprav === 1 ? "1 nepřečtená zpráva" : `${neprectenychZprav} nepřečtených zpráv`}</span>
              )}
              {neprectenychZprav > 0 && neprectenychOznameni > 0 && <span> · </span>}
              {neprectenychOznameni > 0 && (
                <span>{neprectenychOznameni === 1 ? "1 oznámení" : `${neprectenychOznameni} oznámení`}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-white/50">Nic nového.</div>
        )}
      </div>

      {/* Výzva k odemčení a čárka domů. */}
      <div className="pb-4 flex flex-col items-center gap-2.5">
        <div className="text-sm text-white/60">Přejeď nahoru</div>
        <div className="w-28 h-1 bg-white/70 rounded-full" />
      </div>
    </div>
  );
}
