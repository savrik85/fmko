"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Player } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { NapovedaOnboarding } from "@/components/ui/napoveda";
import { StepLocation } from "@/components/onboarding/step-location";
import { StepManager } from "@/components/onboarding/step-manager";
import { StepClubName } from "@/components/onboarding/step-club-name";
import { StepTeam } from "@/components/onboarding/step-team";
import { StepReveal } from "@/components/onboarding/step-reveal";
import type { ManagerBackstory } from "@okresni-masina/shared";

interface OnboardingState {
  village: VillageSelection | null;
  managerName: string;
  managerBackstory: ManagerBackstory | null;
  managerAvatar: Record<string, unknown> | null;
  teamName: string;
  stadiumName: string;
  sponsor?: {
    name: string;
    type: string;
    seasonBonus: number;
    seasons: number;
    terminationFee: number;
    isNamingRights: boolean;
  };
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

const EMPTY_STATE: OnboardingState = {
  village: null, managerName: "", managerBackstory: null, managerAvatar: null,
  teamName: "", stadiumName: "", sponsor: undefined,
  primaryColor: "#2D5F2D", secondaryColor: "#FFFFFF", createdTeamId: null, players: [],
};

function restoreOnboarding(): { step: number; state: OnboardingState } {
  if (typeof window === "undefined") return { step: 1, state: EMPTY_STATE };

  const savedState = sessionStorage.getItem("onboarding_state");
  const savedStep = sessionStorage.getItem("onboarding_step");

  if (!savedState || !savedStep) return { step: 1, state: EMPTY_STATE };

  let parsed: OnboardingState;
  try { parsed = JSON.parse(savedState); } catch { return { step: 1, state: EMPTY_STATE }; }

  // If team was already created, go to reveal step (step 5)
  if (parsed.createdTeamId) {
    return { step: 5, state: parsed };
  }

  // Validate step has required data — if not, fall back to the highest valid step
  const requestedStep = Number(savedStep) || 1;
  let validStep = 1;
  if (parsed.village) validStep = 2;
  if (validStep >= 2 && parsed.managerName) validStep = 3;
  if (validStep >= 3 && parsed.teamName) validStep = 4;

  return { step: Math.min(requestedStep, validStep), state: parsed };
}

export default function OnboardingPage() {
  const restored = restoreOnboarding();
  const [step, setStep] = useState(restored.step);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const { token, isLoading, teamId, setTeam } = useTeam();
  const router = useRouter();

  // Redirect to register if not authenticated
  useEffect(() => {
    if (!isLoading && !token) router.replace("/register");
  }, [isLoading, token, router]);

  // If user already has a team, redirect to dashboard
  useEffect(() => {
    if (!isLoading && teamId) router.replace("/dashboard");
  }, [isLoading, teamId, router]);

  const [state, setState] = useState<OnboardingState>(restored.state);

  // Persist step + state to sessionStorage (but not step 5 / completed state)
  useEffect(() => {
    if (step < 5 && !state.createdTeamId) {
      sessionStorage.setItem("onboarding_step", String(step));
      sessionStorage.setItem("onboarding_state", JSON.stringify(state));
    }
  }, [step, state]);

  async function handleCreateTeam(teamName: string, primary: string, secondary: string, jerseyPattern?: string, badgePattern?: string) {
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
          stadiumName: state.stadiumName || undefined,
          sponsor: state.sponsor || undefined,
        }),
      });

      const players = await apiFetch<Player[]>(`/api/teams/${result.id}/players`);
      setTeam(result.id, result.name);

      // Clear onboarding persistence — done
      sessionStorage.removeItem("onboarding_step");
      sessionStorage.removeItem("onboarding_state");

      setState((s) => ({
        ...s,
        teamName,
        primaryColor: primary,
        secondaryColor: secondary,
        createdTeamId: result.id,
        players,
      }));

      setStep(5);
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
          {[1, 2, 3, 4, 5].map((s) => (
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

        {/* Step 3: Club name + sponsor */}
        {step === 3 && state.village && (
          <StepClubName
            village={state.village}
            initialTeamName={state.teamName}
            onBack={() => setStep(2)}
            onSubmit={(data) => {
              setState((s) => ({
                ...s,
                teamName: data.teamName,
                stadiumName: data.stadiumName,
                sponsor: data.sponsor,
              }));
              setStep(4);
            }}
          />
        )}

        {/* Step 4: Visual (colors, jersey, badge) */}
        {step === 4 && state.village && (
          <>
            <StepTeam
              village={state.village}
              teamName={state.teamName}
              primaryColor={state.primaryColor}
              secondaryColor={state.secondaryColor}
              onBack={() => setStep(3)}
              onSubmit={handleCreateTeam}
            />
            {creating && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-card p-8 flex flex-col items-center gap-3">
                  <Spinner />
                  <p className="font-heading font-bold text-pitch-500">{"Generuji tým..."}</p>
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

        {/* Step 5: Reveal */}
        {step === 5 && state.createdTeamId && (
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

      <NapovedaOnboarding step={step === 1 ? "location" : step === 2 ? "manager" : step === 3 ? "club" : step === 4 ? "team" : "reveal"} />
    </main>
  );
}
