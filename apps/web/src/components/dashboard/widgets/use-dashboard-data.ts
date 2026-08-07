"use client";

/**
 * Načítání dat pro dashboard — jen to, co aktivní widgety opravdu chtějí.
 *
 * Původní stránka Domů pálila 11 requestů natvrdo. S katalogem přes padesát
 * widgetů to tak nejde: každý widget deklaruje `needs`, tady se z toho udělá
 * sjednocení a stáhne se jen ono. Kdo má na dashboardu tři widgety, pošle tři
 * requesty.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, type Team, type Player, type ManagerProfile, type TeamMatchResults } from "@/lib/api";
import type {
  DashboardData, DataKey, DataSlot, Standing, ScheduleMatch, MatchPreview, NewsArticle,
  Achievement, HallOfFameRank, PubSession, BudgetData, Transaction, WagesData, SponsorsData,
  FansData, FansHistoryItem, FanbaseData, FanbaseHistoryPoint, ConcessionSaleMatch,
  TrainingStats, TrainingPlan, AttendanceData, LeagueStats, ReputationData,
  ManagerHistoryEntry, InjuryEntry, StadiumData, EquipmentData, StaffMember, CupData,
  SeasonalEvent, TransferOffer, WatchlistEntry, SeasonHistoryEntry,
  FreeAgent, MarketListing, LeagueTransfer,
} from "./types";

const IDLE: DataSlot<never> = { data: null, loading: false, error: false };

/** Prázdný balík — všechny sloty nečinné. Widget si sáhne jen na to, co deklaroval. */
function emptyData(): DashboardData {
  const keys: DataKey[] = [
    "team", "players", "standings", "schedule", "manager", "matchResults",
    "preview", "news", "achievements", "pubSession", "hallOfFame",
    "budget", "transactions", "wages", "sponsors",
    "fans", "fansHistory", "fanbase", "fanbaseHistory", "concessionSales",
    "trainingStats", "trainingPlan", "attendance",
    "leagueStats", "reputation", "managerHistory", "injuries",
    "stadium", "equipment", "staff", "trophies", "cup", "u21",
    "events", "offers", "watchlist", "seasonHistory",
    "freeAgents", "market", "leagueTransfers",
  ];
  const out = {} as Record<DataKey, DataSlot<unknown>>;
  for (const k of keys) out[k] = { ...IDLE };
  return out as unknown as DashboardData;
}

/**
 * Loadery jednotlivých zdrojů. Každý vrací už rozbalený tvar, aby widgety
 * nemusely znát obálky odpovědí (`{ articles }`, `{ items }`, `{ players }` …).
 *
 * `preview` chybí schválně — závisí na rozpisu a řeší se zvlášť níž.
 */
const LOADERS: Record<Exclude<DataKey, "preview">, (teamId: string) => Promise<unknown>> = {
  team: (t) => apiFetch<Team>(`/api/teams/${t}`),
  players: (t) => apiFetch<Player[]>(`/api/teams/${t}/players`),
  standings: (t) => apiFetch<{ standings: Standing[] }>(`/api/teams/${t}/standings`).then((d) => d.standings ?? []),
  schedule: (t) => apiFetch<{ matches: ScheduleMatch[]; promotionPrice?: number }>(`/api/teams/${t}/schedule`),
  manager: (t) => apiFetch<ManagerProfile>(`/api/teams/${t}/manager`),
  matchResults: (t) => apiFetch<TeamMatchResults>(`/api/teams/${t}/match-results`),
  news: (t) => apiFetch<{ articles: NewsArticle[] }>(`/api/teams/${t}/news`)
    .then((d) => (d.articles ?? []).filter((a) => a.type !== "standing")),
  achievements: (t) => apiFetch<{ achievements: Achievement[] }>(`/api/teams/${t}/achievements`)
    .then((d) => (d.achievements ?? []).filter((a) => a.earnedAt)
      .sort((a, b) => (b.earnedAt ?? "").localeCompare(a.earnedAt ?? ""))),
  pubSession: (t) => apiFetch<{ session: PubSession | null }>(`/api/teams/${t}/pub-session`).then((d) => d.session),
  hallOfFame: (t) => apiFetch<{ entries: Array<{ teamId: string; teamName: string; isHuman: boolean; total: number; gold: number; silver: number; bronze: number }> }>("/api/hall-of-fame")
    .then((d): HallOfFameRank => {
      const humans = (d.entries ?? []).filter((e) => e.isHuman);
      const idx = humans.findIndex((e) => e.teamId === t);
      const me = idx >= 0 ? humans[idx] : null;
      return {
        myRank: me ? idx + 1 : null,
        myTotal: me?.total ?? 0,
        myGold: me?.gold ?? 0,
        mySilver: me?.silver ?? 0,
        myBronze: me?.bronze ?? 0,
        top3: humans.slice(0, 3).map((e, i) => ({ rank: i + 1, teamName: e.teamName, total: e.total })),
        totalEntries: humans.length,
      };
    }),
  budget: (t) => apiFetch<BudgetData>(`/api/teams/${t}/budget`),
  transactions: (t) => apiFetch<{ transactions: Transaction[] }>(`/api/teams/${t}/transactions?limit=100`)
    .then((d) => d.transactions ?? []),
  wages: (t) => apiFetch<WagesData>(`/api/teams/${t}/wages`),
  sponsors: (t) => apiFetch<SponsorsData>(`/api/teams/${t}/sponsors`),
  fans: (t) => apiFetch<FansData>(`/api/teams/${t}/fans`),
  fansHistory: (t) => apiFetch<{ items: FansHistoryItem[] }>(`/api/teams/${t}/fans/history?limit=20`)
    .then((d) => d.items ?? []),
  fanbase: (t) => apiFetch<FanbaseData>(`/api/teams/${t}/fanbase`),
  fanbaseHistory: (t) => apiFetch<{ history: FanbaseHistoryPoint[] }>(`/api/teams/${t}/fanbase/history?days=60`)
    .then((d) => d.history ?? []),
  concessionSales: (t) => apiFetch<{ matches: ConcessionSaleMatch[] }>(`/api/teams/${t}/concession/sales?limit=30`)
    .then((d) => d.matches ?? []),
  trainingStats: (t) => apiFetch<TrainingStats>(`/api/teams/${t}/training-stats`),
  trainingPlan: (t) => apiFetch<TrainingPlan>(`/api/teams/${t}/training`),
  attendance: (t) => apiFetch<AttendanceData>(`/api/teams/${t}/attendance`),
  leagueStats: (t) => apiFetch<LeagueStats>(`/api/teams/${t}/league-stats`),
  reputation: (t) => apiFetch<ReputationData>(`/api/teams/${t}/reputation`),
  managerHistory: (t) => apiFetch<{ items: ManagerHistoryEntry[] }>(`/api/teams/${t}/manager/history?limit=60`)
    .then((d) => d.items ?? []),
  injuries: (t) => apiFetch<InjuryEntry[]>(`/api/teams/${t}/injuries`),
  stadium: (t) => apiFetch<StadiumData>(`/api/teams/${t}/stadium`),
  equipment: (t) => apiFetch<EquipmentData>(`/api/teams/${t}/equipment`),
  staff: (t) => apiFetch<{ staff: StaffMember[] }>(`/api/teams/${t}/staff`).then((d) => d.staff ?? []),
  trophies: (t) => apiFetch<{ trophies: Array<Record<string, never>> }>(`/api/teams/${t}/trophies`).then((d) => d.trophies ?? []),
  cup: (t) => apiFetch<CupData>(`/api/teams/${t}/cup`),
  u21: (t) => apiFetch<{ players: Player[] }>(`/api/teams/${t}/u21/players`).then((d) => d.players ?? []),
  events: (t) => apiFetch<{ events: SeasonalEvent[] }>(`/api/teams/${t}/seasonal-events`).then((d) => d.events ?? []),
  offers: (t) => apiFetch<{ incoming: TransferOffer[] }>(`/api/teams/${t}/offers`).then((d) => d.incoming ?? []),
  watchlist: (t) => apiFetch<{ players: WatchlistEntry[] }>(`/api/teams/${t}/watchlist`).then((d) => d.players ?? []),
  seasonHistory: () => apiFetch<{ history: SeasonHistoryEntry[] }>("/api/season-history").then((d) => d.history ?? []),
  freeAgents: (t) => apiFetch<{ freeAgents: FreeAgent[] }>(`/api/teams/${t}/free-agents`).then((d) => d.freeAgents ?? []),
  market: (t) => apiFetch<{ listings: MarketListing[] }>(`/api/teams/${t}/market`).then((d) => d.listings ?? []),
  // Přehled přestupů visí na lize, ne na týmu — ligu si musíme napřed zjistit.
  leagueTransfers: (t) => apiFetch<Team>(`/api/teams/${t}`).then((team) => {
    if (!team.league_id) return [];
    return apiFetch<{ recent: LeagueTransfer[] }>(`/api/leagues/${team.league_id}/transfers-overview`)
      .then((d) => d.recent ?? []);
  }),
};

/**
 * @param teamId  aktuální tým; bez něj se nenačítá nic
 * @param needed  klíče, které aktivní widgety požadují
 */
export function useDashboardData(teamId: string | null, needed: DataKey[]) {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [nonce, setNonce] = useState(0);

  // Sada se mění jen když se opravdu změní obsah, ne identita pole —
  // jinak by každý render přenačetl celý dashboard.
  const key = useMemo(() => [...new Set(needed)].sort().join(","), [needed]);

  // Zdroje načtené v tomto mountu — přidání widgetu nemá přenačíst zbytek.
  const loaded = useRef<Set<string>>(new Set());
  const teamRef = useRef<string | null>(null);
  // Odmountování zruší zápis stavu; přenačtení uvnitř mountu ale ne — jinak by
  // rozdělaný request po přidání widgetu nechal slot navždy v „načítá se".
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (!teamId) return;
    if (teamRef.current !== teamId) {
      teamRef.current = teamId;
      loaded.current = new Set();
      setData(emptyData());
    }

    const keys = key ? (key.split(",") as DataKey[]) : [];
    const fresh = keys.filter((k) => !loaded.current.has(k));
    if (fresh.length === 0) return;
    fresh.forEach((k) => loaded.current.add(k));

    const patch = (k: DataKey, slot: DataSlot<unknown>) => {
      if (!alive.current) return;
      setData((prev) => ({ ...prev, [k]: slot }));
    };

    fresh.forEach((k) => patch(k, { data: null, loading: true, error: false }));

    // `preview` potřebuje nejbližší neodehraný zápas z rozpisu.
    const wantsPreview = fresh.includes("preview");
    const plain = fresh.filter((k): k is Exclude<DataKey, "preview"> => k !== "preview");

    plain.forEach((k) => {
      LOADERS[k](teamId)
        .then((d) => patch(k, { data: d ?? null, loading: false, error: false }))
        .catch((e) => {
          console.error(`dashboard: načtení "${k}" selhalo:`, e);
          patch(k, { data: null, loading: false, error: true });
        });
    });

    if (wantsPreview) {
      apiFetch<{ matches: ScheduleMatch[] }>(`/api/teams/${teamId}/schedule`)
        .then((d) => {
          const next = (d.matches ?? []).find((m) => m.status !== "simulated");
          if (!next) {
            patch("preview", { data: null, loading: false, error: false });
            return null;
          }
          const url = next.isCup
            ? `/api/teams/${teamId}/cup-preview/${next.id}`
            : `/api/teams/${teamId}/match-preview/${next.id}`;
          return apiFetch<MatchPreview>(url).then((p) => {
            patch("preview", { data: p, loading: false, error: false });
            return p;
          });
        })
        .catch((e) => {
          console.error("dashboard: náhled zápasu selhal:", e);
          patch("preview", { data: null, loading: false, error: true });
        });
    }
  }, [teamId, key, nonce]);

  /** Znovu načte vyjmenované zdroje — po akci, která data změnila (např. propagace zápasu). */
  const reload = (keys: DataKey[]) => {
    keys.forEach((k) => loaded.current.delete(k));
    setData((prev) => {
      const next = { ...prev };
      keys.forEach((k) => { (next as Record<string, DataSlot<unknown>>)[k] = { ...IDLE }; });
      return next;
    });
    setNonce((n) => n + 1);
  };

  return { data, reload };
}
