"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { VillageSelection } from "@/app/onboarding/page";

// Mock generated players for the reveal (in real app this comes from API)
interface RevealPlayer {
  firstName: string;
  lastName: string;
  nickname: string | null;
  age: number;
  position: string;
  occupation: string;
  rating: number;
  description: string;
}

function generateMockSquad(villageName: string): RevealPlayer[] {
  const players: RevealPlayer[] = [
    { firstName: "Zdeněk", lastName: "Novák", nickname: "Buřtík", age: 42, position: "GK", occupation: "Řezník", rating: 5, description: "Na fotbal chodí hlavně kvůli pivu po zápase. Ale v bráně umí zázraky." },
    { firstName: "Petr", lastName: "Dvořák", nickname: "Prochás", age: 34, position: "DEF", occupation: "Zedník", rating: 8, description: "Nejspolehlivější hráč kádru. Nepropustí míč ani brigádu." },
    { firstName: "Jakub", lastName: "Svoboda", nickname: null, age: 17, position: "FWD", occupation: "Student", rating: 10, description: "Talent, ale radši by hrál PlayStation. Když chce, je nejrychlejší na hřišti." },
    { firstName: "Milan", lastName: "Černý", nickname: "Tank", age: 38, position: "DEF", occupation: "Traktorista", rating: 7, description: "Přezdívku si vysloužil stavbou těla. Soupeři se mu vyhýbají." },
    { firstName: "Tomáš", lastName: "Veselý", nickname: "Veselej", age: 28, position: "MID", occupation: "Automechanik", rating: 9, description: "Srdce týmu. Vždycky s úsměvem, i když prohrávají 0:5." },
    { firstName: "Martin", lastName: "Horák", nickname: "Dělo", age: 25, position: "FWD", occupation: "Hasič", rating: 11, description: "Jeho střela se jednou odrazila od tyče a rozbila okno u Nováků." },
    { firstName: "Jaroslav", lastName: "Procházka", nickname: "Děda", age: 48, position: "DEF", occupation: "Důchodce", rating: 4, description: "Hraje od roku 1995. Neběhá, ale ví kde má stát." },
    { firstName: "David", lastName: "Kučera", nickname: "Ajťák", age: 31, position: "MID", occupation: "Programátor", rating: 8, description: "Jediný v týmu kdo umí obsloužit web. Přihrávky jako algoritmicky přesné." },
    { firstName: "Ondřej", lastName: "Marek", nickname: "Šnek", age: 36, position: "MID", occupation: "Účetní", rating: 6, description: "Pomalý, ale s přehledem. Říká se, že kalkuluje i trajektorii míče." },
    { firstName: "Filip", lastName: "Jelínek", nickname: null, age: 20, position: "FWD", occupation: "Skladník", rating: 9, description: "Mladý a dravý. Dává góly, ale zapomíná chodit na tréninky." },
    { firstName: "Radek", lastName: "Sedláček", nickname: "Sedla", age: 29, position: "DEF", occupation: "Policista", rating: 8, description: "Na hřišti stejně nekompromisní jako v práci. Sežere každého útočníka." },
  ];
  return players;
}

interface Props {
  village: VillageSelection;
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
}

export function StepReveal({ village, teamName, primaryColor }: Props) {
  const router = useRouter();
  const squad = generateMockSquad(village.name);
  const [revealedCount, setRevealedCount] = useState(0);
  const [isRevealing, setIsRevealing] = useState(true);

  useEffect(() => {
    if (revealedCount >= squad.length) {
      setIsRevealing(false);
      return;
    }
    const timer = setTimeout(() => {
      setRevealedCount((c) => c + 1);
    }, 600);
    return () => clearTimeout(timer);
  }, [revealedCount, squad.length]);

  const positionLabel: Record<string, string> = {
    GK: "Brankář", DEF: "Obránce", MID: "Záložník", FWD: "Útočník",
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full">
      <h2 className="font-heading text-3xl font-bold text-pitch-500 mb-1">
        {teamName}
      </h2>
      <p className="text-muted mb-6">Tady je tvůj kádr!</p>

      {/* Player cards */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-6">
        {squad.slice(0, revealedCount).map((player, i) => (
          <div
            key={i}
            className="bg-white rounded-card shadow-card p-4 flex gap-4 items-start animate-[slideIn_0.3s_ease-out]"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            {/* Mini avatar placeholder */}
            <div
              className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-white font-heading font-bold text-lg"
              style={{ backgroundColor: primaryColor }}
            >
              {player.firstName[0]}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-heading font-bold text-base">
                  {player.firstName} {player.lastName}
                </span>
                {player.nickname && (
                  <span className="text-sm text-gold-500 font-medium">
                    &bdquo;{player.nickname}&ldquo;
                  </span>
                )}
              </div>
              <div className="text-xs text-muted flex gap-2 items-center mt-0.5">
                <span className="bg-pitch-500/10 text-pitch-500 px-1.5 py-0.5 rounded font-heading font-bold">
                  {positionLabel[player.position] ?? player.position}
                </span>
                <span>{player.age} let</span>
                <span>&middot;</span>
                <span>{player.occupation}</span>
              </div>
              <p className="text-sm text-muted mt-1.5 leading-snug">
                {player.description}
              </p>
            </div>

            {/* Rating */}
            <div className="text-right shrink-0">
              <div className="font-heading font-bold text-2xl tabular-nums" style={{ color: primaryColor }}>
                {player.rating}
              </div>
              <div className="text-[10px] text-muted uppercase">rating</div>
            </div>
          </div>
        ))}

        {isRevealing && revealedCount < squad.length && (
          <div className="text-center py-4">
            <div className="inline-block w-6 h-6 border-2 border-pitch-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* CTA */}
      {!isRevealing && (
        <button
          onClick={() => router.push("/dashboard")}
          className="w-full bg-pitch-500 hover:bg-pitch-400 text-white font-heading text-xl font-bold py-4 rounded-card shadow-card hover:shadow-hover transition-all"
        >
          Jdeme na to!
        </button>
      )}
    </div>
  );
}
