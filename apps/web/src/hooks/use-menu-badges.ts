"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { hasUnseenNotes } from "@/data/release-notes";
import { getUnseenOffersCount, type OffersPayload } from "@/lib/seen-offers";

export interface MenuBadgesState {
  unreadMessages: number;
  incomingOffers: number;
  unvotedCount: number;
  gremiumCount: number;
  gremiumToVote: number;
  gremiumUnseenMeetings: number;
  betsCount: number;
  notesUnseen: boolean;
  moreBadgeCount: number;
  isLoading: boolean;
}

/**
 * Jak staré odznaky obnoví pravidelná kontrola. Jen u viditelné záložky: skrytá
 * záložka dřív každých 30 s tahala pět endpointů, i když se na ni nikdo nedíval.
 */
const POLL_INTERVAL_MS = 60_000;
/** Změna stránky nebo návrat na záložku obnoví odznaky nejvýš jednou za tuhle dobu. */
const NAVIGATION_REFRESH_MS = 15_000;

let globalState: MenuBadgesState = {
  unreadMessages: 0,
  incomingOffers: 0,
  unvotedCount: 0,
  gremiumCount: 0,
  gremiumToVote: 0,
  gremiumUnseenMeetings: 0,
  betsCount: 0,
  notesUnseen: false,
  moreBadgeCount: 0,
  isLoading: true,
};

const listeners = new Set<(state: MenuBadgesState) => void>();
let lastFetchTime = 0;
let lastFetchTeamId: string | null = null;
let isFetching = false;
/** Vynucené obnovení, které přišlo během běžícího načítání, se pustí hned po něm. */
let queuedRefresh: { teamId: string; token: string | null } | null = null;

function notifyListeners() {
  listeners.forEach((listener) => listener(globalState));
}

interface FetchMenuBadgesOptions {
  /** Obnovit hned, bez ohledu na stáří dat (událost refresh-menu-badges). */
  force?: boolean;
  /** Mladší data se znovu nenačítají. */
  maxAgeMs?: number;
}

export async function fetchMenuBadges(teamId: string, token: string | null, options: FetchMenuBadgesOptions = {}) {
  const { force = false, maxAgeMs = 0 } = options;
  if (isFetching) {
    // Běžící načítání by mohlo vrátit stav ještě před změnou, kvůli které se o obnovu žádá.
    if (force || teamId !== lastFetchTeamId) queuedRefresh = { teamId, token };
    return;
  }
  const now = Date.now();
  if (!force && teamId === lastFetchTeamId && now - lastFetchTime < maxAgeMs) return;

  isFetching = true;
  lastFetchTime = now;
  lastFetchTeamId = teamId;

  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

    const [convsRes, offersRes, votesRes, gremiumRes, betsRes] = await Promise.allSettled([
      apiFetch<Array<{ unreadCount: number }>>(`/api/teams/${teamId}/conversations`),
      // Jen pole pro odznak. Plné /offers je těžké a při zápasovém kole padalo.
      apiFetch<OffersPayload>(`/api/teams/${teamId}/menu-badges/offers`),
      apiFetch<Array<{ status: string; my_answer: string | null }>>("/api/votes", { headers }),
      apiFetch<{ toVote: number; unseenMeetings: number }>(`/api/teams/${teamId}/competition/pending`),
      apiFetch<{ unseen: number }>(`/api/teams/${teamId}/bets/pending`),
    ]);

    const unreadMessages =
      convsRes.status === "fulfilled"
        ? convsRes.value.reduce((s, c) => s + (c.unreadCount ?? 0), 0)
        : globalState.unreadMessages;

    const incomingOffers =
      offersRes.status === "fulfilled"
        ? getUnseenOffersCount(teamId, offersRes.value)
        : globalState.incomingOffers;

    const unvotedCount =
      votesRes.status === "fulfilled"
        ? votesRes.value.filter((v) => v.status === "open" && v.my_answer === null).length
        : globalState.unvotedCount;

    const toVote =
      gremiumRes.status === "fulfilled" ? gremiumRes.value.toVote ?? 0 : 0;
    const unseenMeetings =
      gremiumRes.status === "fulfilled" ? gremiumRes.value.unseenMeetings ?? 0 : 0;
    const gremiumCount = toVote + unseenMeetings;

    const betsCount =
      betsRes.status === "fulfilled" ? betsRes.value.unseen ?? 0 : globalState.betsCount;

    const notesUnseen = hasUnseenNotes();

    const moreBadgeCount =
      unvotedCount + gremiumCount + betsCount + incomingOffers + (notesUnseen ? 1 : 0);

    globalState = {
      unreadMessages,
      incomingOffers,
      unvotedCount,
      gremiumCount,
      gremiumToVote: toVote,
      gremiumUnseenMeetings: unseenMeetings,
      betsCount,
      notesUnseen,
      moreBadgeCount,
      isLoading: false,
    };

    notifyListeners();
  } catch (e) {
    console.error("fetchMenuBadges error:", e);
  } finally {
    isFetching = false;
    const next = queuedRefresh;
    queuedRefresh = null;
    if (next) void fetchMenuBadges(next.teamId, next.token, { force: true });
  }
}

/**
 * Okamžitá aktualizace počtu nevyřízených nabídek v navigaci
 * (např. při zobrazení záložky Nabídky na /prestupy).
 */
export function setIncomingOffersCount(count: number) {
  if (globalState.incomingOffers === count) return;
  const moreBadgeCount =
    globalState.unvotedCount +
    globalState.gremiumCount +
    globalState.betsCount +
    count +
    (globalState.notesUnseen ? 1 : 0);
  globalState = { ...globalState, incomingOffers: count, moreBadgeCount };
  notifyListeners();
}

/**
 * Umožňuje komponentám vyvolat okamžité přenačtení všech odznaků v aplikaci
 * (např. po odhlasování v grémiu nebo zhlédnutí výsledků).
 */
export function triggerMenuBadgesRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("refresh-menu-badges"));
  }
}

// Hook používá víc komponent naráz (spodní lišta, postranní menu, titulek, stránka Více).
// Kontrola i posluchače proto běží jednou pro všechny, ne v každé komponentě zvlášť.
let subscribers = 0;
let activeTeam: { teamId: string; token: string | null } | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function refreshActiveTeam(options: FetchMenuBadgesOptions) {
  if (activeTeam) void fetchMenuBadges(activeTeam.teamId, activeTeam.token, options);
}

const onForcedRefresh = () => refreshActiveTeam({ force: true });

const onVisibilityChange = () => {
  if (document.visibilityState === "visible") refreshActiveTeam({ maxAgeMs: NAVIGATION_REFRESH_MS });
};

const onPollTick = () => {
  if (document.visibilityState === "visible") refreshActiveTeam({ maxAgeMs: POLL_INTERVAL_MS });
};

function subscribe(teamId: string, token: string | null): () => void {
  activeTeam = { teamId, token };
  subscribers++;
  if (subscribers === 1) {
    window.addEventListener("refresh-menu-badges", onForcedRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    // Kontrola stáří je levná, takže běží častěji. Načítá se, až když jsou data
    // starší než minuta, ať odznaky po kliknutí na jinou stránku nejdou znovu.
    pollTimer = setInterval(onPollTick, NAVIGATION_REFRESH_MS);
  }
  return () => {
    subscribers--;
    if (subscribers > 0) return;
    window.removeEventListener("refresh-menu-badges", onForcedRefresh);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    activeTeam = null;
  };
}

/**
 * Sdílený hook pro notifikační odznaky v navigaci (desktop sidebar, bottom bar, stránka Více).
 */
export function useMenuBadges(): MenuBadgesState {
  const { teamId, token } = useTeam();
  const pathname = usePathname();
  const [state, setState] = useState<MenuBadgesState>(globalState);

  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  useEffect(() => {
    // Přehodnotit notesUnseen při změně stránky (návštěva /novinky ho smaže)
    const unseen = hasUnseenNotes();
    if (globalState.notesUnseen !== unseen) {
      const moreBadgeCount =
        globalState.unvotedCount +
        globalState.gremiumCount +
        globalState.betsCount +
        globalState.incomingOffers +
        (unseen ? 1 : 0);
      globalState = { ...globalState, notesUnseen: unseen, moreBadgeCount };
      notifyListeners();
    }
  }, [pathname]);

  useEffect(() => {
    if (!teamId) return;
    return subscribe(teamId, token);
  }, [teamId, token]);

  // Změna stránky obnoví odznaky, ale nejvýš jednou za 15 s. Dřív každé kliknutí
  // v menu poslalo pět dotazů včetně těžkých nabídek.
  useEffect(() => {
    if (!teamId) return;
    void fetchMenuBadges(teamId, token, { maxAgeMs: NAVIGATION_REFRESH_MS });
  }, [teamId, token, pathname]);

  return state;
}
