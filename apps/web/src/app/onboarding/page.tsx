"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Player } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { StepLocation } from "@/components/onboarding/step-location";
import { StepManager } from "@/components/onboarding/step-manager";
import { StepTeam } from "@/components/onboarding/step-team";
import { StepReveal } from "@/components/onboarding/step-reveal";
import type { ManagerBackstory } from "@okresni-masina/shared";

interface OnboardingState {
  village: VillageSelection | null;
  managerName: string;
  managerBackstory: ManagerBackstory | null;
  managerAvatar: Record<string, unknown> | null;
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  createdTeamId: string | null;
  players: Player[];
}

export interface VillageSelection {
  id: string;
  name: string;
  code?: string;
  district: string;
  region: string;
  population: number;
  category?: string;
  size?: string;
  pitchType?: string;
  baseBudget?: number;
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const { token, setTeam } = useTeam();
  const router = useRouter();

  const [state, setState] = useState<OnboardingState>({
    village: null,
    managerName: "",
    managerBackstory: null,
    managerAvatar: null,
    teamName: "",
    primaryColor: "#2D5F2D",
    secondaryColor: "#FFFFFF",
    createdTeamId: null,
    players: [],
  });

  async function handleCreateTeam(teamName: string, primary: string, secondary: string, jerseyPattern?: string, badgePattern?: string, stadiumName?: string) {
    if (!state.village) return;
    setCreating(true);
    setError("");

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const result = await apiFetch<{ id: string; name: string }>("/api/teams", {
        method: "POST",
        headers,
        body: JSON.stringify({
          villageId: state.village.id,
          name: teamName,
          primaryColor: primary,
          secondaryColor: secondary,
          managerName: state.managerName || undefined,
          managerBackstory: state.managerBackstory || undefined,
          managerAvatar: state.managerAvatar || undefined,
          jerseyPattern: jerseyPattern || undefined,
          badgePattern: badgePattern || undefined,
          stadiumName: stadiumName || undefined,
        }),
      });

      const players = await apiFetch<Player[]>(`/api/teams/${result.id}/players`);
      setTeam(result.id, result.name);

      setState((s) => ({
        ...s,
        teamName,
        primaryColor: primary,
        secondaryColor: secondary,
        createdTeamId: result.id,
        players,
      }));

      setStep(4);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-paper">
      {/* Header with progress */}
      <div className="bg-pitch-800 px-5 py-3 flex items-center justify-between">
        <span className="font-heading font-bold text-white/80 text-sm tracking-wide uppercase">Prales</span>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`w-8 h-1.5 rounded-full transition-all ${s <= step ? "bg-pitch-400" : "bg-white/10"}`} />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {/* Step 1: Location */}
        {step === 1 && (
          <StepLocation
            onSelect={(village) => {
              setState((s) => ({
                ...s,
                village,
                teamName: `SK ${village.name}`,
              }));
              setStep(2);
            }}
          />
        )}

        {/* Step 2: Manager profile */}
        {step === 2 && state.village && (
          <StepManager
            villageName={state.village.name}
            initialName=""
            onBack={() => setStep(1)}
            onSubmit={(name, backstory, avatar) => {
              setState((s) => ({
                ...s,
                managerName: name,
                managerBackstory: backstory,
                managerAvatar: avatar,
              }));
              setStep(3);
            }}
          />
        )}

        {/* Step 3: Team */}
        {step === 3 && state.village && (
          <>
            <StepTeam
              village={state.village}
              teamName={state.teamName}
              primaryColor={state.primaryColor}
              secondaryColor={state.secondaryColor}
              onBack={() => setStep(2)}
              onSubmit={handleCreateTeam}
            />
            {creating && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-card p-8 text-center">
                  <Spinner />
                  <p className="font-heading font-bold text-pitch-500">Generuji tým...</p>
                </div>
              </div>
            )}
            {error && (
              <div className="fixed bottom-4 left-4 right-4 bg-card-red text-white p-4 rounded-card text-center">
                {error}
              </div>
            )}
          </>
        )}

        {/* Step 4: Reveal */}
        {step === 4 && state.createdTeamId && (
          <StepReveal
            village={state.village!}
            teamName={state.teamName}
            primaryColor={state.primaryColor}
            secondaryColor={state.secondaryColor}
            players={state.players}
            onComplete={() => router.push("/dashboard")}
          />
        )}
      </div>
    </main>
  );
}
