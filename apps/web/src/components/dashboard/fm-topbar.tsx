"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { Napoveda } from "@/components/ui/napoveda";

/**
 * Zajede lišta při čtení?
 *
 * Rám aplikace bral 167 px z 844 (horní 103 včetně status baru, spodní 64).
 * Horní lišta nese peníze a nejbližší zápas — užitečné, ale ne při
 * scrollování dlouhým seznamem. Při posunu dolů se proto sbalí a při posunu
 * zpět nahoru se vrátí; 56 px obsahu se tím uvolní.
 *
 * Odsazení pro status bar zůstává i ve sbaleném stavu, jinak by text lezl
 * pod hodiny. Jen na mobilu — na desktopu je místa dost a poskakující lišta
 * by rušila.
 */
function useSbalenaPriScrollu(): boolean {
  const [sbalena, setSbalena] = useState(false);
  useEffect(() => {
    if (window.innerWidth >= 640) return;
    const el = document.querySelector("main");
    if (!el) return;
    let posledni = el.scrollTop;
    const onScroll = () => {
      const y = el.scrollTop;
      // Práh 6 px, ať to nepoletuje při drobném dojezdu setrvačnosti.
      if (y < 64) setSbalena(false);
      else if (y > posledni + 6) setSbalena(true);
      else if (y < posledni - 6) setSbalena(false);
      posledni = y;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  return sbalena;
}

/**
 * Horní lišta = navigace a peníze. Nic víc.
 *
 * Název stránky odsud zmizel — nese ho hlavička stránky, kde je vidět i na
 * mobilu (tady byl schovaný za `hidden sm:flex`). Tlačítko Vpřed zůstává jen
 * na desktopu: na telefonu duplikovalo systémové gesto a bylo použitelné
 * zlomek času, přitom ukrajovalo z 375px šířky.
 */
export function FMTopBar() {
  const router = useRouter();
  const { budget, season, seasonDay, seasonTotal, nextMatch } = useTeam();
  const sbalena = useSbalenaPriScrollu();

  return (
    <header
      /* h-14 je výška obsahu; horní inset se přičítá jako padding, aby zelená
         sahala pod status bar a nevznikal nad lištou světlý pruh.
         Ve sbaleném stavu zbyde jen ten inset. */
      className="on-dark flex items-center pl-1 pr-3 sm:px-5 gap-2 sm:gap-4 shrink-0 overflow-hidden"
      style={{
        background: "var(--color-chrome)",
        height: sbalena
          ? "env(safe-area-inset-top, 0px)"
          : "calc(3.5rem + env(safe-area-inset-top, 0px))",
        paddingTop: "env(safe-area-inset-top, 0px)",
        opacity: sbalena ? 0 : 1,
        // Sbalená lišta nesmí chytat klepnutí — tlačítka v ní jsou sice
        // oříznutá, ale bez tohohle by pořád reagovala.
        pointerEvents: sbalena ? "none" : undefined,
        transition: "height 200ms ease, opacity 160ms ease",
      }}
    >
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => router.back()}
          className="w-11 h-11 sm:w-8 sm:h-8 rounded-control flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Zpět"
        >
          <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button
          onClick={() => { try { window.history.forward(); } catch (e) { console.error("history forward:", e); } }}
          className="hidden sm:flex w-8 h-8 rounded-control items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Vpřed"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      <Napoveda />

      <div className="flex-1 min-w-0" />

      <div className="flex items-center gap-3 sm:gap-6 shrink-0 text-micro sm:text-sm font-heading overflow-hidden">
        {budget != null && (
          <span className="text-white/60 tabular-nums whitespace-nowrap">{"💰"} {budget.toLocaleString("cs")} {"Kč"}</span>
        )}
        {nextMatch && (
          <span className="text-white/60 whitespace-nowrap truncate">
            {nextMatch.isCup ? "🏆" : "⚽"} {nextMatch.isFriendly && <span className="text-amber-400 text-micro mr-1 hidden sm:inline">přátelák</span>}
            {nextMatch.isCup && <span className="text-gold-400 text-micro mr-1 hidden sm:inline">pohár</span>}
            <span className="text-white font-bold">{nextMatch.opponent}</span>
            {" · "}
            {nextMatch.isFriendly ? (
              <span className="text-amber-400 font-bold hidden sm:inline">sestava!</span>
            ) : nextMatch.daysUntil === 0 ? (
              <span className="text-pitch-400 font-bold">{"dnes!"}</span>
            ) : nextMatch.daysUntil === 1 ? (
              <span className="text-pitch-400">{"zítra"}</span>
            ) : (
              <span>{"za"} {nextMatch.daysUntil} {"dní"}</span>
            )}
          </span>
        )}
        {season != null && (
          <span className="text-white/40 whitespace-nowrap hidden sm:inline">
            {"📅"} {"Sezóna"} {season}{seasonDay != null && seasonTotal != null && seasonTotal > 0 ? ` · den ${seasonDay}/${seasonTotal}` : ""}
          </span>
        )}
      </div>
    </header>
  );
}
