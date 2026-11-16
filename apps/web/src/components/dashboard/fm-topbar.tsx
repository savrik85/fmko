"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { usePageHeaderOverride } from "@/context/page-header-context";
import { Napoveda } from "@/components/ui/napoveda";
import { BadgePreview } from "@/components/ui/badge-preview";
import type { BadgePattern } from "@/components/ui/badge-preview";
import { pageTitleFor } from "@/lib/page-title";
import { chromeColorFor } from "@/lib/team-color";

/** Stránky s vlastním nadpisem hned pod lištou: lišta místo něj ukáže název klubu. */
const PAGES_WITH_OWN_TITLE = ["/telefon"];

const CHIP = "rounded-control bg-white/10 hover:bg-white/20 transition-colors whitespace-nowrap flex items-center gap-1 px-2 py-1.5 leading-none";

/**
 * Horní lišta v barvě klubu: znak, název stránky, pozice v lize, peníze a příští zápas.
 *
 * Dřív tu byla zelená lišta (56 px) a pod ní ještě pruh hlavičky stránky v barvě
 * klubu (42 px). Teď je to jeden pruh a všechno v něm vede tam, kde se s tím dá
 * něco dělat: peníze do Financí, zápas na Sestavu, pozice do Ligy.
 */
export function FMTopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const ctx = useTeam();
  const { budget, season, seasonDay, seasonTotal, nextMatch, currentWeather } = ctx;
  const { override } = usePageHeaderOverride();

  // Vlastní barva stránky (turnaj pořadatele) se bere tak, jak je; klubová se ztmaví pro bílý text.
  const background = override?.color ?? chromeColorFor(ctx.primaryColor, ctx.secondaryColor);
  const ownTitle = PAGES_WITH_OWN_TITLE.includes(pathname);
  const title = override?.name || (ownTitle ? ctx.teamName : pageTitleFor(pathname)) || ctx.teamName || "";

  const autoInitials = (ctx.teamName || "").split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
  const clubBadge = ctx.primaryColor ? (
    <BadgePreview
      primary={ctx.badgePrimary || ctx.primaryColor}
      secondary={ctx.badgeSecondary || ctx.secondaryColor || "#FFFFFF"}
      pattern={(ctx.badgePattern as BadgePattern) || "shield"}
      initials={ctx.badgeInitials || autoInitials}
      symbol={ctx.badgeSymbol}
      size={28}
    />
  ) : null;
  const badge = override?.badge === null ? null : (override?.badge ?? clubBadge);
  const showPosition = !override?.hideLeaguePosition && ctx.leaguePosition != null;

  return (
    <>
    {/* Jednobarevný pevný pruh pod hodinami. iOS 26 kreslí přes horní okraj
        nainstalované aplikace rozmazání, pokud tam nenajde pevný prvek v jedné
        plné barvě; přechod lišty proto začíná až pod ním (.topbar-club). */}
    <div
      aria-hidden
      className="sm:hidden fixed top-0 inset-x-0 pointer-events-none"
      style={{ height: "env(safe-area-inset-top, 0px)", backgroundColor: background }}
    />
    <header
      /* h-14 je výška obsahu; horní inset se přičítá jako padding, aby barva
         sahala pod status bar a nevznikal nad lištou světlý pruh. */
      className="on-dark topbar-club flex items-center pl-1 pr-2 sm:pl-3 sm:pr-5 gap-1 sm:gap-3 shrink-0"
      style={{
        backgroundColor: background,
        height: "calc(3.5rem + env(safe-area-inset-top, 0px))",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <button
        onClick={() => router.back()}
        className="w-10 h-11 sm:w-8 sm:h-8 rounded-control flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        aria-label="Zpět"
      >
        <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      {badge && <Link href="/prehled" aria-label="Domů" className="shrink-0 hidden min-[400px]:block">{badge}</Link>}

      <h1 className="font-heading font-[800] text-white text-lg sm:text-xl leading-none truncate min-w-0 sm:shrink-0">
        {title}
      </h1>

      <Napoveda />

      {/* ml-auto místo prázdného roztahovacího prvku: ten bral na mobilu další mezeru. */}
      <div className="ml-auto flex items-center gap-1 sm:gap-2 shrink-0 sm:shrink sm:min-w-0 text-micro sm:text-sm font-heading text-white">
        {/* Počasí herního dne: na mobilu místo nezbývá, je na Domů. */}
        {currentWeather && (
          <span
            className="hidden lg:inline text-white/80 tabular-nums whitespace-nowrap px-1"
            title={`${currentWeather.description} · ${currentWeather.temperature} °C`}
          >
            {currentWeather.icon}{" "}
            <span className="hidden 2xl:inline">{currentWeather.description}{" · "}</span>
            {currentWeather.temperature}{"°"}
          </span>
        )}
        {season != null && (
          <span className="text-white/80 whitespace-nowrap hidden xl:inline px-1">
            {"Sezóna"} {season}{seasonDay != null && seasonTotal != null && seasonTotal > 0 ? ` · den ${seasonDay}/${seasonTotal}` : ""}
          </span>
        )}
        {showPosition && (
          <Link href="/liga" className={CHIP} title="Tabulka ligy">
            <span className="font-[800] tabular-nums">{ctx.leaguePosition}.</span>
            <span className="hidden md:inline text-white/80 text-micro font-bold uppercase">v lize</span>
          </Link>
        )}
        {budget != null && (
          <Link href="/finance" className={`${CHIP} tabular-nums`} title="Finance klubu">
            <span className="hidden md:inline" aria-hidden="true">{"💰"}</span>
            <span className="font-bold">{budget.toLocaleString("cs")} {"Kč"}</span>
          </Link>
        )}
        {nextMatch && (
          <Link href="/zapas" className={`${CHIP} sm:min-w-0`} title={`Příští zápas: ${nextMatch.opponent}. Otevře sestavu.`}>
            <span aria-hidden="true">{nextMatch.isCup ? "🏆" : "⚽"}</span>
            {nextMatch.isFriendly && <span className="text-amber-300 text-micro hidden lg:inline">přátelák</span>}
            {nextMatch.isCup && <span className="text-amber-300 text-micro hidden lg:inline">pohár</span>}
            {/* Jméno soupeře se ukazuje celé od šířky, kam se vejde (lg). Pod ní
                zbyde „⚽ za 6 dní“; uříznuté „FK Ma…“ je horší než nic. */}
            {/* Celý název soupeře; zkrátí se až ve chvíli, kdy se do lišty opravdu nevejde. */}
            <span className="font-bold hidden lg:inline truncate min-w-0">{nextMatch.opponent}</span>
            <span className="hidden lg:inline text-white/60">{"·"}</span>
            {nextMatch.isFriendly ? (
              <span className="text-amber-300 font-bold">sestava!</span>
            ) : nextMatch.daysUntil === 0 ? (
              <span className="font-[800]">{"dnes!"}</span>
            ) : nextMatch.daysUntil === 1 ? (
              <span className="font-bold">{"zítra"}</span>
            ) : (
              <span>{"za"} {nextMatch.daysUntil} {"dní"}</span>
            )}
          </Link>
        )}
      </div>
    </header>
    </>
  );
}
