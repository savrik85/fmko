"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface AuthState {
  token: string | null;
  userId: string | null;
  email: string | null;
  teamId: string | null;
  teamName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  badgePattern: string | null;
  villageName: string | null;
  district: string | null;
  budget: number | null;
  leaguePosition: number | null;
  season: number | null;
  seasonDay: number | null;
  seasonTotal: number | null;
  gameDate: string | null;
  nextMatch: { opponent: string; daysUntil: number; isFriendly?: boolean } | null;
  isAdmin: boolean;
  isLoading: boolean;
}

interface TeamContextValue extends AuthState {
  login: (token: string, user: { id: string; email: string; teamId: string | null; teamName: string | null; primaryColor?: string | null; secondaryColor?: string | null; badgePattern?: string | null; villageName?: string | null; district?: string | null; budget?: number | null; leaguePosition?: number | null; season?: number | null; seasonDay?: number | null; seasonTotal?: number | null; gameDate?: string | null; nextMatch?: { opponent: string; daysUntil: number } | null }) => void;
  setTeam: (id: string, name: string) => void;
  logout: () => void;
}

const TeamContext = createContext<TeamContextValue | null>(null);

const STORAGE_TOKEN = "om_token";
const STORAGE_TEAM = "om_team";
const PUBLIC_PATHS = ["/", "/login", "/register", "/invite"];

export function TeamProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null, userId: null, email: null, teamId: null, teamName: null, primaryColor: null, secondaryColor: null, badgePattern: null, villageName: null, district: null, budget: null, leaguePosition: null, season: null, seasonDay: null, seasonTotal: null, gameDate: null, nextMatch: null, isAdmin: false, isLoading: true,
  });
  const router = useRouter();
  const pathname = usePathname();

  // Load token on mount, verify with /auth/me
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_TOKEN);
    if (!stored) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }

    apiFetch<{ id: string; email: string; isAdmin?: boolean; teamId: string | null; teamName: string | null; primaryColor?: string | null; secondaryColor?: string | null; badgePattern?: string | null; villageName?: string | null; district?: string | null; budget?: number | null; leaguePosition?: number | null; season?: number | null; seasonDay?: number | null; seasonTotal?: number | null; gameDate?: string | null; nextMatch?: { opponent: string; daysUntil: number } | null }>("/auth/me", {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then((user) => {
        const teamData = { teamId: user.teamId, teamName: user.teamName, primaryColor: user.primaryColor ?? null, secondaryColor: user.secondaryColor ?? null, badgePattern: user.badgePattern ?? null, villageName: user.villageName ?? null, district: user.district ?? null, budget: user.budget ?? null, leaguePosition: user.leaguePosition ?? null, season: user.season ?? null, seasonDay: user.seasonDay ?? null, seasonTotal: user.seasonTotal ?? null, gameDate: user.gameDate ?? null, nextMatch: user.nextMatch ?? null };
        localStorage.setItem(STORAGE_TEAM, JSON.stringify(teamData));
        setState({
          token: stored, userId: user.id, email: user.email,
          ...teamData, isAdmin: user.isAdmin ?? false, isLoading: false,
        });
      })
      .catch((err: Error & { status?: number }) => {
        if (err?.status === 401) {
          localStorage.removeItem(STORAGE_TOKEN);
          localStorage.removeItem(STORAGE_TEAM);
          setState({ token: null, userId: null, email: null, teamId: null, teamName: null, primaryColor: null, secondaryColor: null, badgePattern: null, villageName: null, district: null, budget: null, leaguePosition: null, season: null, seasonDay: null, seasonTotal: null, gameDate: null, nextMatch: null, isAdmin: false, isLoading: false });
        } else {
          // API unreachable — restore from localStorage so redirect doesn't fire
          const cached = localStorage.getItem(STORAGE_TEAM);
          const teamData = cached ? JSON.parse(cached) : {};
          setState((s) => ({ ...s, token: stored, ...teamData, isLoading: false }));
        }
      });
  }, []);

  // Redirect logic
  useEffect(() => {
    if (state.isLoading) return;
    const isPublic = PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/invite/");
    const isOnboarding = pathname.startsWith("/onboarding");

    if (!state.token && !isPublic) {
      router.replace("/login");
    } else if (state.token && !state.teamId && !isOnboarding && !isPublic) {
      router.replace("/onboarding");
    }
  }, [state.token, state.teamId, state.isLoading, pathname, router]);

  function login(token: string, user: { id: string; email: string; teamId: string | null; teamName: string | null; primaryColor?: string | null; secondaryColor?: string | null; badgePattern?: string | null; villageName?: string | null; district?: string | null; budget?: number | null; leaguePosition?: number | null; season?: number | null; seasonDay?: number | null; seasonTotal?: number | null; gameDate?: string | null; nextMatch?: { opponent: string; daysUntil: number } | null }) {
    localStorage.setItem(STORAGE_TOKEN, token);
    const teamData = { teamId: user.teamId, teamName: user.teamName, primaryColor: user.primaryColor ?? null, secondaryColor: user.secondaryColor ?? null, badgePattern: user.badgePattern ?? null, villageName: user.villageName ?? null, district: user.district ?? null, budget: user.budget ?? null, leaguePosition: user.leaguePosition ?? null, season: user.season ?? null, seasonDay: user.seasonDay ?? null, seasonTotal: user.seasonTotal ?? null, gameDate: user.gameDate ?? null, nextMatch: user.nextMatch ?? null };
    localStorage.setItem(STORAGE_TEAM, JSON.stringify(teamData));
    setState({ token, userId: user.id, email: user.email, ...teamData, isAdmin: false, isLoading: false });
  }

  function setTeam(id: string, name: string) {
    setState((s) => ({ ...s, teamId: id, teamName: name }));
    // Refresh full data from API so topbar/sidebar have budget, season, etc.
    const stored = localStorage.getItem(STORAGE_TOKEN);
    if (stored) {
      apiFetch<{ id: string; email: string; isAdmin?: boolean; teamId: string | null; teamName: string | null; primaryColor?: string | null; secondaryColor?: string | null; badgePattern?: string | null; villageName?: string | null; district?: string | null; budget?: number | null; leaguePosition?: number | null; season?: number | null; seasonDay?: number | null; seasonTotal?: number | null; gameDate?: string | null; nextMatch?: { opponent: string; daysUntil: number } | null }>("/auth/me", {
        headers: { Authorization: `Bearer ${stored}` },
      }).then((user) => {
        const teamData = { teamId: user.teamId, teamName: user.teamName, primaryColor: user.primaryColor ?? null, secondaryColor: user.secondaryColor ?? null, badgePattern: user.badgePattern ?? null, villageName: user.villageName ?? null, district: user.district ?? null, budget: user.budget ?? null, leaguePosition: user.leaguePosition ?? null, season: user.season ?? null, seasonDay: user.seasonDay ?? null, seasonTotal: user.seasonTotal ?? null, gameDate: user.gameDate ?? null, nextMatch: user.nextMatch ?? null };
        localStorage.setItem(STORAGE_TEAM, JSON.stringify(teamData));
        setState((s) => ({ ...s, ...teamData, isAdmin: user.isAdmin ?? false }));
      }).catch(() => {});
    }
  }

  function logout() {
    const t = state.token;
    if (t) apiFetch("/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_TEAM);
    setState({ token: null, userId: null, email: null, teamId: null, teamName: null, primaryColor: null, secondaryColor: null, badgePattern: null, villageName: null, district: null, budget: null, leaguePosition: null, season: null, seasonDay: null, seasonTotal: null, gameDate: null, nextMatch: null, isAdmin: false, isLoading: false });
    router.replace("/login");
  }

  return (
    <TeamContext.Provider value={{ ...state, login, setTeam, logout }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within TeamProvider");
  return ctx;
}
