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
  isLoading: boolean;
}

interface TeamContextValue extends AuthState {
  login: (token: string, user: { id: string; email: string; teamId: string | null; teamName: string | null }) => void;
  setTeam: (id: string, name: string) => void;
  logout: () => void;
}

const TeamContext = createContext<TeamContextValue | null>(null);

const STORAGE_TOKEN = "om_token";
const PUBLIC_PATHS = ["/", "/login", "/register"];

export function TeamProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null, userId: null, email: null, teamId: null, teamName: null, isLoading: true,
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

    apiFetch<{ id: string; email: string; teamId: string | null; teamName: string | null }>("/auth/me", {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then((user) => {
        setState({
          token: stored, userId: user.id, email: user.email,
          teamId: user.teamId, teamName: user.teamName, isLoading: false,
        });
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_TOKEN);
        setState({ token: null, userId: null, email: null, teamId: null, teamName: null, isLoading: false });
      });
  }, []);

  // Redirect logic
  useEffect(() => {
    if (state.isLoading) return;
    const isPublic = PUBLIC_PATHS.includes(pathname);
    const isOnboarding = pathname.startsWith("/onboarding");

    if (!state.token && !isPublic) {
      router.replace("/login");
    } else if (state.token && !state.teamId && !isOnboarding && !isPublic) {
      router.replace("/onboarding");
    }
  }, [state.token, state.teamId, state.isLoading, pathname, router]);

  function login(token: string, user: { id: string; email: string; teamId: string | null; teamName: string | null }) {
    localStorage.setItem(STORAGE_TOKEN, token);
    setState({ token, userId: user.id, email: user.email, teamId: user.teamId, teamName: user.teamName, isLoading: false });
  }

  function setTeam(id: string, name: string) {
    setState((s) => ({ ...s, teamId: id, teamName: name }));
  }

  function logout() {
    const t = state.token;
    if (t) apiFetch("/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
    localStorage.removeItem(STORAGE_TOKEN);
    setState({ token: null, userId: null, email: null, teamId: null, teamName: null, isLoading: false });
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
