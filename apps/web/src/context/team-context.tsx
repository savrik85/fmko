"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

interface TeamContextValue {
  teamId: string | null;
  teamName: string | null;
  setTeam: (id: string, name: string) => void;
  clearTeam: () => void;
  isLoading: boolean;
}

const TeamContext = createContext<TeamContextValue | null>(null);

const STORAGE_KEY = "om_team_id";
const STORAGE_NAME_KEY = "om_team_name";

const PUBLIC_PATHS = ["/", "/onboarding"];

export function TeamProvider({ children }: { children: ReactNode }) {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const storedName = localStorage.getItem(STORAGE_NAME_KEY);
    if (stored) {
      setTeamId(stored);
      setTeamName(storedName);
    }
    setIsLoading(false);
  }, []);

  // Redirect logic
  useEffect(() => {
    if (isLoading) return;

    const isPublic = PUBLIC_PATHS.includes(pathname);
    const isOnboarding = pathname.startsWith("/onboarding") || pathname.startsWith("/create");

    if (!teamId && !isPublic && !isOnboarding) {
      router.replace("/onboarding");
    }
  }, [teamId, isLoading, pathname, router]);

  function setTeam(id: string, name: string) {
    setTeamId(id);
    setTeamName(name);
    localStorage.setItem(STORAGE_KEY, id);
    localStorage.setItem(STORAGE_NAME_KEY, name);
  }

  function clearTeam() {
    setTeamId(null);
    setTeamName(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_NAME_KEY);
  }

  return (
    <TeamContext.Provider value={{ teamId, teamName, setTeam, clearTeam, isLoading }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within TeamProvider");
  return ctx;
}
