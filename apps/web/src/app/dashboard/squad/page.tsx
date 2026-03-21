"use client";

import { useState } from "react";
import { PlayerCardCompact, PlayerCardFull, type PlayerCardData } from "@/components/players/player-card";

// Mock squad data
const MOCK_SQUAD: PlayerCardData[] = [
  { id: 1, firstName: "Zdeněk", lastName: "Novák", nickname: "Buřtík", age: 42, position: "GK", occupation: "Řezník", speed: 3, technique: 4, shooting: 2, passing: 5, heading: 4, defense: 6, goalkeeping: 12, stamina: 5, condition: 85, morale: 60, alcohol: 16, discipline: 8, primaryColor: "#2D5F2D" },
  { id: 2, firstName: "Petr", lastName: "Dvořák", nickname: "Prochás", age: 34, position: "DEF", occupation: "Zedník", speed: 7, technique: 6, shooting: 4, passing: 7, heading: 9, defense: 12, goalkeeping: 1, stamina: 8, condition: 90, morale: 70, alcohol: 10, discipline: 14, primaryColor: "#2D5F2D" },
  { id: 3, firstName: "Milan", lastName: "Černý", nickname: "Tank", age: 38, position: "DEF", occupation: "Traktorista", speed: 5, technique: 4, shooting: 3, passing: 5, heading: 11, defense: 13, goalkeeping: 1, stamina: 6, condition: 75, morale: 55, alcohol: 14, discipline: 10, primaryColor: "#2D5F2D" },
  { id: 4, firstName: "Radek", lastName: "Sedláček", nickname: "Sedla", age: 29, position: "DEF", occupation: "Policista", speed: 9, technique: 7, shooting: 5, passing: 8, heading: 8, defense: 11, goalkeeping: 1, stamina: 10, condition: 95, morale: 75, alcohol: 5, discipline: 17, primaryColor: "#2D5F2D" },
  { id: 5, firstName: "Tomáš", lastName: "Veselý", nickname: "Veselej", age: 28, position: "MID", occupation: "Automechanik", speed: 8, technique: 10, shooting: 7, passing: 11, heading: 6, defense: 7, goalkeeping: 1, stamina: 9, condition: 100, morale: 85, alcohol: 8, discipline: 12, primaryColor: "#2D5F2D" },
  { id: 6, firstName: "David", lastName: "Kučera", nickname: "Ajťák", age: 31, position: "MID", occupation: "Programátor", speed: 6, technique: 9, shooting: 6, passing: 12, heading: 5, defense: 6, goalkeeping: 1, stamina: 7, condition: 80, morale: 65, alcohol: 4, discipline: 15, primaryColor: "#2D5F2D" },
  { id: 7, firstName: "Ondřej", lastName: "Marek", nickname: "Šnek", age: 36, position: "MID", occupation: "Účetní", speed: 3, technique: 8, shooting: 5, passing: 9, heading: 4, defense: 5, goalkeeping: 1, stamina: 5, condition: 70, morale: 50, alcohol: 6, discipline: 16, primaryColor: "#2D5F2D" },
  { id: 8, firstName: "Martin", lastName: "Horák", nickname: "Dělo", age: 25, position: "FWD", occupation: "Hasič", speed: 10, technique: 8, shooting: 14, passing: 7, heading: 8, defense: 3, goalkeeping: 1, stamina: 11, condition: 95, morale: 80, alcohol: 9, discipline: 11, primaryColor: "#2D5F2D" },
  { id: 9, firstName: "Filip", lastName: "Jelínek", nickname: null, age: 20, position: "FWD", occupation: "Skladník", speed: 12, technique: 9, shooting: 10, passing: 6, heading: 7, defense: 2, goalkeeping: 1, stamina: 10, condition: 100, morale: 70, alcohol: 12, discipline: 6, primaryColor: "#2D5F2D" },
  { id: 10, firstName: "Jakub", lastName: "Svoboda", nickname: null, age: 17, position: "FWD", occupation: "Student", speed: 11, technique: 8, shooting: 9, passing: 7, heading: 5, defense: 3, goalkeeping: 1, stamina: 9, condition: 100, morale: 90, alcohol: 2, discipline: 8, primaryColor: "#2D5F2D" },
  { id: 11, firstName: "Jaroslav", lastName: "Procházka", nickname: "Děda", age: 48, position: "DEF", occupation: "Důchodce", speed: 2, technique: 6, shooting: 3, passing: 7, heading: 8, defense: 10, goalkeeping: 1, stamina: 3, condition: 60, morale: 45, alcohol: 15, discipline: 7, primaryColor: "#2D5F2D" },
];

type PositionFilter = "all" | "GK" | "DEF" | "MID" | "FWD";

export default function SquadPage() {
  const [filter, setFilter] = useState<PositionFilter>("all");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerCardData | null>(null);

  const filtered = filter === "all"
    ? MOCK_SQUAD
    : MOCK_SQUAD.filter((p) => p.position === filter);

  const posOrder: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const sorted = [...filtered].sort((a, b) => posOrder[a.position] - posOrder[b.position]);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="font-heading text-2xl font-bold text-pitch-500 mb-4">
        Kádr ({MOCK_SQUAD.length} hráčů)
      </h1>

      {/* Position filter */}
      <div className="flex gap-2 mb-4">
        {(["all", "GK", "DEF", "MID", "FWD"] as PositionFilter[]).map((pos) => (
          <button
            key={pos}
            onClick={() => setFilter(pos)}
            className={`px-3 py-1.5 rounded-full text-sm font-heading font-bold transition-colors ${
              filter === pos
                ? "bg-pitch-500 text-white"
                : "bg-white text-muted hover:text-pitch-500 shadow-card"
            }`}
          >
            {pos === "all" ? "Všichni" : pos === "GK" ? "BRA" : pos === "DEF" ? "OBR" : pos === "MID" ? "ZÁL" : "ÚTO"}
          </button>
        ))}
      </div>

      {/* Player list */}
      <div className="space-y-2">
        {sorted.map((player) => (
          <PlayerCardCompact
            key={player.id}
            player={player}
            onClick={() => setSelectedPlayer(player)}
          />
        ))}
      </div>

      {/* Player detail modal */}
      {selectedPlayer && (
        <PlayerCardFull
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}
