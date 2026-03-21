"use client";

import { Card, CardBody } from "@/components/ui";

// Mock data — in real app from API
const MOCK_TEAM = {
  name: "SK Prachatice",
  village: "Prachatice",
  league: "Okresní přebor Prachatice",
  position: 3,
  totalTeams: 14,
  budget: 42350,
  nextMatch: {
    opponent: "Sokol Netolice",
    round: 8,
    isHome: true,
    date: "Neděle 14:00",
  },
  squadStatus: {
    total: 20,
    fit: 16,
    injured: 2,
    suspended: 1,
    lowMorale: 1,
  },
};

const MOCK_EVENTS = [
  { emoji: "\u{1F37A}", text: "Milan Černý nebude v neděli — kocovina po pátku", time: "Dnes" },
  { emoji: "\u{1F4B0}", text: "Řeznictví Novák prodloužilo sponzoring na další sezónu", time: "Včera" },
  { emoji: "\u{1F915}", text: "Petr Dvořák si na tréninku natáhl sval — chybí 2 kola", time: "Středa" },
  { emoji: "\u{1F44B}", text: "Z dorostu postoupil Jakub Svoboda (17). Nadšený mladík!", time: "Pondělí" },
];

export default function DashboardPage() {
  const team = MOCK_TEAM;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      {/* Team header */}
      <div className="bg-pitch-500 text-white rounded-card p-5">
        <h1 className="font-heading text-2xl font-bold">{team.name}</h1>
        <div className="text-white/70 text-sm mt-1">
          {team.league} &middot; {team.position}. místo
        </div>
        <div className="text-white/70 text-sm">
          Rozpočet: {team.budget.toLocaleString("cs")} Kč
        </div>
      </div>

      {/* Next match */}
      <Card hover>
        <CardBody>
          <div className="text-xs text-muted uppercase font-heading font-bold mb-2">
            Příští zápas &middot; {team.nextMatch.round}. kolo
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-heading font-bold text-lg">
                {team.nextMatch.isHome ? team.name : team.nextMatch.opponent}
              </div>
              <div className="text-muted text-sm">vs</div>
              <div className="font-heading font-bold text-lg">
                {team.nextMatch.isHome ? team.nextMatch.opponent : team.name}
              </div>
            </div>
            <div className="text-right">
              <div className="font-heading font-bold text-pitch-500 text-lg">
                {team.nextMatch.date}
              </div>
              <div className="text-xs text-muted">
                {team.nextMatch.isHome ? "Domácí" : "Venku"}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Squad status */}
      <Card>
        <CardBody>
          <div className="text-xs text-muted uppercase font-heading font-bold mb-3">
            Stav kádru
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            <StatusItem value={team.squadStatus.fit} label="Fit" color="text-pitch-500" />
            <StatusItem value={team.squadStatus.injured} label="Zraněno" color="text-card-red" />
            <StatusItem value={team.squadStatus.suspended} label="Trest" color="text-card-yellow" />
            <StatusItem value={team.squadStatus.lowMorale} label="Demotiv." color="text-muted" />
          </div>
        </CardBody>
      </Card>

      {/* Event feed */}
      <Card>
        <CardBody>
          <div className="text-xs text-muted uppercase font-heading font-bold mb-3">
            Co se děje
          </div>
          <div className="space-y-3">
            {MOCK_EVENTS.map((event, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className="text-lg shrink-0">{event.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{event.text}</p>
                  <p className="text-xs text-muted mt-0.5">{event.time}</p>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function StatusItem({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div>
      <div className={`font-heading font-bold text-2xl tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
