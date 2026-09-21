"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, Tabs, useTabParam } from "@/components/ui";
import { KurzovyListek } from "./kurzy";
import { TiketLista, TiketSheet } from "./tiket";
import { MojeTikety } from "./tikety";
import { Arena } from "./arena";
import { czk, Prazdno, signed } from "./ui";
import type { ArenaOdpoved, Board, TiketyOdpoved, VybranyTip } from "./types";

const TAB_KEYS = ["kurzy", "tikety", "arena"] as const;

const DUVOD: Record<string, string> = {
  no_round: "Tenhle týden se už nehraje. Kurzy vyvěsíme, jakmile bude jasné, kdo s kým příští kolo nastoupí.",
  no_league: "Tvůj klub zatím nemá soutěž, takže není na co sázet.",
};

export default function SazkyPage() {
  const { teamId } = useTeam();
  const [tab, setTab] = useTabParam(TAB_KEYS);
  const [board, setBoard] = useState<Board | null>(null);
  const [tikety, setTikety] = useState<TiketyOdpoved | null>(null);
  const [arena, setArena] = useState<ArenaOdpoved | null>(null);
  const [nacitam, setNacitam] = useState(true);
  const [vybrane, setVybrane] = useState<VybranyTip[]>([]);
  const [sheet, setSheet] = useState(false);

  const nactiBoard = useCallback(async () => {
    if (!teamId) return;
    try {
      setBoard(await apiFetch<Board>(`/api/teams/${teamId}/bets/board`));
    } catch (e) {
      console.error("načtení kurzového lístku:", e);
    }
  }, [teamId]);

  const nactiTikety = useCallback(async () => {
    if (!teamId) return;
    try {
      setTikety(await apiFetch<TiketyOdpoved>(`/api/teams/${teamId}/bets`));
    } catch (e) {
      console.error("načtení tiketů:", e);
    }
  }, [teamId]);

  const nactiArenu = useCallback(async () => {
    if (!teamId) return;
    try {
      setArena(await apiFetch<ArenaOdpoved>(`/api/teams/${teamId}/bets/arena`));
    } catch (e) {
      console.error("načtení arény:", e);
    }
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    Promise.all([nactiBoard(), nactiTikety()]).finally(() => setNacitam(false));
  }, [teamId, nactiBoard, nactiTikety]);

  // Aréna se načítá až při otevření záložky — je to nejtěžší dotaz ze všech tří.
  useEffect(() => {
    if (tab === "arena") nactiArenu();
  }, [tab, nactiArenu]);

  // Otevření záložky s tikety smaže odznak v menu.
  useEffect(() => {
    if (tab !== "tikety" || !teamId) return;
    apiFetch(`/api/teams/${teamId}/bets/seen`, { method: "POST" })
      .catch((e) => console.error("označení tiketů za přečtené:", e));
  }, [tab, teamId]);

  /**
   * Jeden zápas = jeden tip. Klik na jiný kurz téhož zápasu předchozí nahradí,
   * klik na už vybraný ho odebere. Server to stejně vynucuje unikátním klíčem,
   * ale hráč se to nemá dozvědět až z chyby.
   */
  const prepni = (t: VybranyTip) => setVybrane((p) =>
    p.some((x) => x.matchId === t.matchId && x.selection === t.selection)
      ? p.filter((x) => !(x.matchId === t.matchId && x.selection === t.selection))
      : [...p.filter((x) => x.matchId !== t.matchId), t]);

  const celkovyKurz = useMemo(
    () => vybrane.length === 0 ? 100
      : Math.max(100, Math.floor(vybrane.reduce((acc, v) => (acc * v.oddsX100) / 100, 1) * 100)),
    [vybrane],
  );

  if (nacitam) {
    return (
      <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>
    );
  }

  const bezici = tikety?.tickets.filter((t) => t.status === "open").length ?? 0;
  const bilance = tikety?.summary ?? null;

  return (
    <>
      <div className="page-container space-y-4 max-w-[820px] pb-28 sm:pb-4">
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5" style={{ background: "#7A2E2E" }}>
            <div className="font-heading font-[800] text-white text-lg leading-none tracking-wide">
              OKRESNÍ TIKET
            </div>
            <div className="text-micro text-white/60 font-heading uppercase tracking-widest mt-1">
              sázková kancelář · přepážka v hospodě
            </div>
          </div>
          {board?.open && (
            <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap text-sm">
              <span className="font-heading font-bold">{board.gameWeek}. kolo</span>
              <span className="text-gray-300">·</span>
              <span className={board.canBet ? "text-ink" : "text-card-red font-semibold"}>
                {board.canBet ? "otevřeno" : "zavřeno"}
              </span>
              <span className="ml-auto text-muted tabular-nums">
                tikety {board.ticketsLeft}/{board.limits.ticketsPerRound}
              </span>
            </div>
          )}

          {/* Bilance patří na první obrazovku, ne až do historie: hráč má vidět,
              jak si u kanceláře stojí, dřív než vsadí další korunu. */}
          {bilance && bilance.tickets > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50/50">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-micro font-heading font-bold uppercase tracking-wide text-muted">
                  Bilance u kanceláře
                </span>
                <span className="text-sm tabular-nums">
                  <span className="text-muted">vsazeno</span>{" "}
                  <b className="font-heading">{czk(bilance.staked + bilance.levy)}</b>
                  <span className="text-gray-300"> · </span>
                  <span className="text-muted">vyhráno</span>{" "}
                  <b className="font-heading">{czk(bilance.won)}</b>
                  <span className="text-gray-300"> · </span>
                  <b className={`font-heading ${bilance.net >= 0 ? "text-pitch-600" : "text-card-red"}`}>
                    {signed(bilance.net)}
                  </b>
                </span>
              </div>
            </div>
          )}
        </div>

        <Tabs value={tab} onChange={setTab} ariaLabel="Sázková kancelář"
          items={[
            { key: "kurzy", label: "Kurzy", icon: "🎫" },
            { key: "tikety", label: "Tikety", icon: "📄", count: bezici || undefined },
            { key: "arena", label: "Aréna", icon: "🗣️" },
          ]} />

        {tab === "kurzy" && (
          board?.open
            ? <KurzovyListek board={board} vybrane={vybrane} onToggle={prepni} />
            : <Prazdno nadpis="Zavřeno">
                {DUVOD[(board as { closedReason?: string } | null)?.closedReason ?? ""] ?? DUVOD.no_round}
              </Prazdno>
        )}

        {tab === "arena" && (
          <Arena data={arena} teamId={teamId ?? ""} onZmena={nactiArenu} />
        )}

        {tab === "tikety" && (
          tikety && tikety.tickets.length > 0
            ? <MojeTikety data={tikety} teamId={teamId ?? ""} onZmena={() => { nactiTikety(); nactiArenu(); }} />
            : <Prazdno nadpis="Zatím sis nevsadil">
                Vyber kurz na lístku, přidej ho na tiket a řekni, kolik do toho dáš.
              </Prazdno>
        )}
      </div>

      {tab === "kurzy" && board?.open && board.canBet && (
        <>
          <TiketLista vybrane={vybrane} celkovyKurz={celkovyKurz} onOpen={() => setSheet(true)} />
          <TiketSheet
            open={sheet} onClose={() => setSheet(false)}
            vybrane={vybrane} celkovyKurz={celkovyKurz} board={board} teamId={teamId ?? ""}
            onOdeber={(klic) => setVybrane((p) => p.filter((x) => `${x.matchId}|${x.selection}` !== klic))}
            onVysyp={() => setVybrane([])}
            onHotovo={() => { nactiBoard(); nactiTikety(); setTab("tikety"); }}
          />
        </>
      )}
    </>
  );
}
