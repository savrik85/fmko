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
let isFetching = false;

function notifyListeners() {
  listeners.forEach((listener) => listener(globalState));
}

export async function fetchMenuBadges(teamId: string, token: string | null, force = false) {
  if (isFetching) return;
  const now = Date.now();
  // Ochrana proti vícenásobnému volání v krátkém čase (throttle 2s pokud není force)
  if (!force && now - lastFetchTime < 2000) return;

  isFetching = true;
  lastFetchTime = now;

  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

    const [convsRes, offersRes, votesRes, gremiumRes, betsRes] = await Promise.allSettled([
      apiFetch<Array<{ unreadCount: number }>>(`/api/teams/${teamId}/conversations`),
      apiFetch<OffersPayload>(`/api/teams/${teamId}/offers`),
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

    fetchMenuBadges(teamId, token);

    const onRefresh = () => {
      fetchMenuBadges(teamId, token, true);
    };
    window.addEventListener("refresh-menu-badges", onRefresh);

    const interval = setInterval(() => {
      fetchMenuBadges(teamId, token);
    }, 30000);

    return () => {
      window.removeEventListener("refresh-menu-badges", onRefresh);
      clearInterval(interval);
    };
  }, [teamId, token, pathname]);

  return state;
}
