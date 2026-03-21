"use client";

import { useState } from "react";
import { StepLocation } from "@/components/onboarding/step-location";
import { StepTeam } from "@/components/onboarding/step-team";
import { StepReveal } from "@/components/onboarding/step-reveal";

interface OnboardingState {
  village: VillageSelection | null;
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
}

export interface VillageSelection {
  name: string;
  code: string;
  district: string;
  region: string;
  population: number;
  category: string;
  pitchType: string;
  baseBudget: number;
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<OnboardingState>({
    village: null,
    teamName: "",
    primaryColor: "#2D5F2D",
    secondaryColor: "#FFFFFF",
  });

  return (
    <main className="min-h-screen flex flex-col">
      {/* Progress bar */}
      <div className="h-1 bg-gray-200">
        <div
          className="h-full bg-pitch-500 transition-all duration-500"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      <div className="flex-1 flex flex-col">
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

        {step === 2 && state.village && (
          <StepTeam
            village={state.village}
            teamName={state.teamName}
            primaryColor={state.primaryColor}
            secondaryColor={state.secondaryColor}
            onBack={() => setStep(1)}
            onSubmit={(teamName, primary, secondary) => {
              setState((s) => ({
                ...s,
                teamName,
                primaryColor: primary,
                secondaryColor: secondary,
              }));
              setStep(3);
            }}
          />
        )}

        {step === 3 && state.village && (
          <StepReveal
            village={state.village}
            teamName={state.teamName}
            primaryColor={state.primaryColor}
            secondaryColor={state.secondaryColor}
          />
        )}
      </div>
    </main>
  );
}
