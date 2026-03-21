"use client";

const MOCK_STANDINGS = [
  { pos: 1, team: "SK Lhenice", played: 7, wins: 6, draws: 0, losses: 1, gf: 18, ga: 5, points: 18, form: ["W", "W", "W", "L", "W"] },
  { pos: 2, team: "Sokol Netolice", played: 7, wins: 5, draws: 1, losses: 1, gf: 14, ga: 7, points: 16, form: ["W", "D", "W", "W", "W"] },
  { pos: 3, team: "SK Prachatice", played: 7, wins: 4, draws: 2, losses: 1, gf: 12, ga: 6, points: 14, form: ["W", "W", "D", "W", "D"], isPlayer: true },
  { pos: 4, team: "TJ Husinec", played: 7, wins: 4, draws: 1, losses: 2, gf: 11, ga: 8, points: 13, form: ["L", "W", "W", "W", "L"] },
  { pos: 5, team: "Slavoj Vlachovo Březí", played: 7, wins: 3, draws: 2, losses: 2, gf: 10, ga: 9, points: 11, form: ["D", "W", "L", "W", "D"] },
  { pos: 6, team: "FK Čkyně", played: 7, wins: 3, draws: 1, losses: 3, gf: 9, ga: 10, points: 10, form: ["W", "L", "W", "L", "W"] },
  { pos: 7, team: "Jiskra Stachy", played: 7, wins: 3, draws: 0, losses: 4, gf: 8, ga: 11, points: 9, form: ["L", "W", "L", "W", "L"] },
  { pos: 8, team: "TJ Vacov", played: 7, wins: 2, draws: 3, losses: 2, gf: 9, ga: 9, points: 9, form: ["D", "D", "W", "L", "D"] },
  { pos: 9, team: "Sokol Vimperk B", played: 7, wins: 2, draws: 2, losses: 3, gf: 8, ga: 10, points: 8, form: ["L", "W", "D", "L", "D"] },
  { pos: 10, team: "SK Zdíkov", played: 7, wins: 2, draws: 1, losses: 4, gf: 7, ga: 12, points: 7, form: ["L", "L", "W", "L", "W"] },
  { pos: 11, team: "TJ Strunkovice", played: 7, wins: 1, draws: 2, losses: 4, gf: 6, ga: 13, points: 5, form: ["L", "D", "L", "L", "D"] },
  { pos: 12, team: "Spartak Bavorov", played: 7, wins: 1, draws: 1, losses: 5, gf: 5, ga: 14, points: 4, form: ["L", "L", "L", "W", "L"] },
  { pos: 13, team: "FK Volary", played: 7, wins: 0, draws: 2, losses: 5, gf: 4, ga: 15, points: 2, form: ["L", "D", "L", "L", "D"] },
  { pos: 14, team: "TJ Lenora", played: 7, wins: 0, draws: 0, losses: 7, gf: 2, ga: 19, points: 0, form: ["L", "L", "L", "L", "L"] },
];

const FORM_COLORS: Record<string, string> = {
  W: "bg-pitch-500",
  D: "bg-card-yellow",
  L: "bg-card-red",
};

export default function TablePage() {
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="font-heading text-2xl font-bold text-pitch-500 mb-1">
        Okresní přebor Prachatice
      </h1>
      <p className="text-sm text-muted mb-4">Sezóna 2024/2025 &middot; 7. kolo</p>

      {/* Table */}
      <div className="bg-white rounded-card shadow-card overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2rem_1fr_2rem_2rem_2rem_2rem_3rem_3rem_2.5rem_4rem] sm:grid-cols-[2rem_1fr_2.5rem_2.5rem_2.5rem_2.5rem_3rem_3rem_3rem_5rem] gap-1 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[10px] sm:text-xs text-muted font-heading font-bold">
          <div className="text-center">#</div>
          <div>Tým</div>
          <div className="text-center">Z</div>
          <div className="text-center">V</div>
          <div className="text-center">R</div>
          <div className="text-center">P</div>
          <div className="text-center">Skóre</div>
          <div className="text-center hidden sm:block">Rozdíl</div>
          <div className="text-center font-extrabold">B</div>
          <div className="text-center">Forma</div>
        </div>

        {/* Rows */}
        {MOCK_STANDINGS.map((row) => {
          const isPromotion = row.pos <= 2;
          const isRelegation = row.pos >= MOCK_STANDINGS.length - 1;
          const goalDiff = row.gf - row.ga;

          return (
            <div
              key={row.pos}
              className={`grid grid-cols-[2rem_1fr_2rem_2rem_2rem_2rem_3rem_3rem_2.5rem_4rem] sm:grid-cols-[2rem_1fr_2.5rem_2.5rem_2.5rem_2.5rem_3rem_3rem_3rem_5rem] gap-1 px-3 py-2.5 border-b border-gray-50 items-center text-xs sm:text-sm transition-colors ${
                row.isPlayer
                  ? "bg-pitch-500/5 font-bold"
                  : "hover:bg-gray-50"
              }`}
            >
              {/* Position */}
              <div className={`text-center font-heading font-bold text-sm ${
                isPromotion ? "text-pitch-500" : isRelegation ? "text-card-red" : "text-muted"
              }`}>
                {isPromotion && <span className="inline-block w-1.5 h-1.5 rounded-full bg-pitch-500 mr-0.5 align-middle" />}
                {isRelegation && <span className="inline-block w-1.5 h-1.5 rounded-full bg-card-red mr-0.5 align-middle" />}
                {row.pos}
              </div>

              {/* Team name */}
              <div className={`truncate ${row.isPlayer ? "text-pitch-600" : ""}`}>
                {row.team}
              </div>

              <div className="text-center tabular-nums">{row.played}</div>
              <div className="text-center tabular-nums">{row.wins}</div>
              <div className="text-center tabular-nums">{row.draws}</div>
              <div className="text-center tabular-nums">{row.losses}</div>
              <div className="text-center tabular-nums text-xs">{row.gf}:{row.ga}</div>
              <div className={`text-center tabular-nums hidden sm:block ${goalDiff > 0 ? "text-pitch-500" : goalDiff < 0 ? "text-card-red" : "text-muted"}`}>
                {goalDiff > 0 ? "+" : ""}{goalDiff}
              </div>
              <div className="text-center font-heading font-extrabold tabular-nums">{row.points}</div>

              {/* Form */}
              <div className="flex gap-0.5 justify-center">
                {row.form.map((f, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full ${FORM_COLORS[f]} flex items-center justify-center text-white text-[8px] font-bold`}
                  >
                    {f}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3 text-xs text-muted">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-pitch-500" /> Postup
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-card-red" /> Sestup
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="w-3 h-3 rounded-full bg-pitch-500 text-white text-[7px] flex items-center justify-center font-bold">V</span>
          <span className="w-3 h-3 rounded-full bg-card-yellow text-white text-[7px] flex items-center justify-center font-bold">R</span>
          <span className="w-3 h-3 rounded-full bg-card-red text-white text-[7px] flex items-center justify-center font-bold">P</span>
        </div>
      </div>
    </div>
  );
}
