"use client";

/**
 * StadiumView v5 — SVG pitch + SVG stands/parking + HTML chips for small buildings.
 */

interface StadiumViewProps {
  pitchCondition: number;
  pitchType: string;
  facilities: Record<string, number>;
  teamColor?: string;
}

function pitchGreen(c: number): string {
  if (c >= 85) return "#2A6E10";
  if (c >= 70) return "#3D7A1A";
  if (c >= 55) return "#558B2F";
  if (c >= 40) return "#7A8B3A";
  if (c >= 25) return "#908555";
  return "#8B7355";
}

const FACILITY_CONFIG: Record<string, { icon: string; label: string }> = {
  changing_rooms: { icon: "\u{1F6AA}", label: "Šatny" },
  showers: { icon: "\u{1F6BF}", label: "Sprchy" },
  refreshments: { icon: "\u{1F37A}", label: "Občerstvení" },
  fence: { icon: "\u{1F3D7}\uFE0F", label: "Oplocení" },
};

export function StadiumView({ pitchCondition, pitchType, facilities, teamColor = "#2D5F2D" }: StadiumViewProps) {
  const cond = pitchCondition;
  const gc = pitchGreen(cond);
  const f = facilities;
  const hasLines = cond >= 20;
  const hasCenter = cond >= 40;
  const hasFull = cond >= 65;
  const hasStripes = cond >= 55;

  // Small building chips (bottom row)
  const bottomFacilities = ["changing_rooms", "showers", "refreshments"].filter((k) => f[k] > 0);
  // Icon chips (top row)
  const topChips = ["fence"].filter((k) => f[k] > 0);

  // Parking dimensions
  const parkW = f.parking > 0 ? 80 + f.parking * 40 : 0;
  const carCount = f.parking > 0 ? 1 + f.parking * 2 : 0;

  // Stand dimensions
  const standW = f.stands > 0 ? 8 + f.stands * 5 : 0;
  const standH = 160 + f.stands * 20;
  const seatRows = 2 + f.stands * 3;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Top: parking SVG + icon chips */}
      <div className="flex items-end gap-3 justify-center">
        {topChips.map((k) => (
          <FacilityChip key={k} facility={k} level={f[k]} color={teamColor} />
        ))}

        {/* Parking SVG */}
        {f.parking > 0 && (
          <svg viewBox={`0 0 ${parkW} 40`} width={parkW * 0.8} height={32} className="shrink-0">
            {/* Asphalt */}
            <rect x="0" y="0" width={parkW} height="40" rx="4" fill="#777" />
            {/* Parking lines */}
            {Array.from({ length: carCount + 1 }).map((_, i) => (
              <line key={i} x1={8 + i * ((parkW - 16) / carCount)} y1="4" x2={8 + i * ((parkW - 16) / carCount)} y2="36" stroke="#999" strokeWidth="1" />
            ))}
            {/* Cars */}
            {Array.from({ length: carCount }).map((_, i) => {
              const cx = 8 + i * ((parkW - 16) / carCount) + ((parkW - 16) / carCount) / 2;
              const colors = ["#4A6741", "#8B4513", "#4A708B", "#CD5C5C", "#6B6B6B", "#B8860B", "#556B2F"];
              const col = colors[i % colors.length];
              return (
                <g key={i}>
                  {/* Car body */}
                  <rect x={cx - 7} y="10" width="14" height="22" rx="3" fill={col} />
                  {/* Windshield */}
                  <rect x={cx - 4} y="12" width="8" height="5" rx="1" fill="#9BC4E2" opacity="0.5" />
                  {/* Rear window */}
                  <rect x={cx - 3} y="26" width="6" height="3" rx="1" fill="#9BC4E2" opacity="0.4" />
                </g>
              );
            })}
            {/* Bus (lv3) */}
            {f.parking >= 3 && (
              <g>
                <rect x={parkW - 30} y="6" width="24" height="30" rx="3" fill="#2E5518" />
                {[10, 16, 22].map((y) => (
                  <rect key={y} x={parkW - 27} y={y} width="6" height="4" rx="0.5" fill="#9BC4E2" opacity="0.5" />
                ))}
              </g>
            )}
          </svg>
        )}
      </div>

      {/* Main: stands + pitch + stands */}
      <div className="flex items-center gap-0">
        {/* Left stand SVG */}
        {f.stands > 0 && (
          <svg viewBox={`0 0 ${standW + 4} ${standH}`} width={standW * 1.2 + 4} height={standH * 0.7} className="shrink-0">
            {/* Stand body */}
            <rect x="0" y="0" width={standW} height={standH} rx="2" fill={teamColor} />
            {/* Seat rows */}
            {Array.from({ length: seatRows }).map((_, i) => (
              <g key={i}>
                <rect x="2" y={4 + i * (standH / seatRows)} width={standW - 4} height={standH / seatRows * 0.4} rx="1" fill="#fff" opacity="0.15" />
                {/* Individual seats */}
                {Array.from({ length: Math.max(1, f.stands) }).map((_, j) => (
                  <rect key={j} x={3 + j * (standW / f.stands - 1)} y={6 + i * (standH / seatRows)} width={Math.max(2, standW / f.stands - 3)} height={standH / seatRows * 0.3} rx="0.5" fill="#fff" opacity="0.1" />
                ))}
              </g>
            ))}
            {/* Bench row at bottom */}
            <rect x="1" y={standH - 6} width={standW - 2} height="4" rx="1" fill="#6B4226" opacity="0.6" />
          </svg>
        )}

        {/* PITCH SVG */}
        <svg viewBox="0 0 260 300" className="w-[220px] sm:w-[260px]" style={{ filter: cond < 25 ? "saturate(0.5)" : cond < 40 ? "saturate(0.8)" : undefined }}>
          <rect x="0" y="0" width="260" height="300" rx="3" fill={gc} />

          {/* Mowing stripes */}
          {hasStripes && (
            <g opacity="0.1">
              {Array.from({ length: 8 }).map((_, i) => (
                <rect key={i} x="0" y={i * 38} width="260" height="19" fill="#000" />
              ))}
            </g>
          )}

          {/* ── DAMAGE ── */}
          {/* Worn goal mouths — biggest damage always here */}
          {cond < 80 && (
            <g>
              <ellipse cx="130" cy="25" rx={cond < 30 ? 55 : cond < 50 ? 42 : 28} ry={cond < 30 ? 22 : cond < 50 ? 15 : 10} fill="#8B7350" opacity={cond < 30 ? 0.7 : cond < 50 ? 0.5 : 0.25} />
              <ellipse cx="130" cy="278" rx={cond < 30 ? 55 : cond < 50 ? 42 : 28} ry={cond < 30 ? 22 : cond < 50 ? 15 : 10} fill="#8B7350" opacity={cond < 30 ? 0.7 : cond < 50 ? 0.5 : 0.25} />
            </g>
          )}

          {/* Worn center circle */}
          {cond < 55 && (
            <ellipse cx="130" cy="150" rx={cond < 25 ? 50 : 32} ry={cond < 25 ? 28 : 18} fill="#8B7F50" opacity={cond < 30 ? 0.5 : 0.3} />
          )}

          {/* Sideline wear (where players run) */}
          {cond < 50 && (
            <g>
              <rect x="5" y="60" width="12" height="180" rx="4" fill="#8B7B50" opacity="0.25" />
              <rect x="243" y="60" width="12" height="180" rx="4" fill="#8B7B50" opacity="0.25" />
            </g>
          )}

          {/* Scattered damage */}
          {cond < 65 && <ellipse cx="65" cy="100" rx="22" ry="13" fill="#8B7B50" opacity="0.3" />}
          {cond < 65 && <ellipse cx="205" cy="210" rx="20" ry="11" fill="#8B7B50" opacity="0.25" />}
          {cond < 50 && <ellipse cx="185" cy="75" rx="28" ry="15" fill="#8B7350" opacity="0.4" />}
          {cond < 50 && <ellipse cx="55" cy="235" rx="25" ry="14" fill="#8B7350" opacity="0.35" />}
          {cond < 40 && <ellipse cx="160" cy="120" rx="32" ry="17" fill="#7A6840" opacity="0.45" />}
          {cond < 40 && <ellipse cx="90" cy="195" rx="30" ry="16" fill="#7A6840" opacity="0.4" />}
          {cond < 30 && <ellipse cx="200" cy="160" rx="38" ry="20" fill="#6B5830" opacity="0.55" />}
          {cond < 30 && <ellipse cx="70" cy="270" rx="35" ry="18" fill="#6B5830" opacity="0.5" />}
          {cond < 20 && <ellipse cx="130" cy="200" rx="50" ry="25" fill="#5A4820" opacity="0.6" />}

          {/* Puddles */}
          {cond < 20 && (
            <g>
              <ellipse cx="95" cy="170" rx="22" ry="10" fill="#6B7B90" opacity="0.3" />
              <ellipse cx="190" cy="240" rx="16" ry="8" fill="#6B7B90" opacity="0.25" />
            </g>
          )}

          {/* Pitch lines */}
          {hasLines && (
            <g stroke="#fff" strokeWidth={hasFull ? 1.5 : 0.7} fill="none" opacity={hasFull ? 0.8 : cond < 30 ? 0.12 : 0.28}>
              <rect x="10" y="10" width="240" height="280" rx="2" />
              <line x1="10" y1="150" x2="250" y2="150" />
              {hasCenter && <circle cx="130" cy="150" r="30" />}
              <circle cx="130" cy="150" r="2" fill="#fff" />
              <rect x="75" y="10" width="110" height="45" />
              <rect x="75" y="245" width="110" height="45" />
              {hasFull && (
                <g>
                  <rect x="95" y="10" width="70" height="18" />
                  <rect x="95" y="272" width="70" height="18" />
                  <circle cx="130" cy="40" r="1.5" fill="#fff" />
                  <circle cx="130" cy="260" r="1.5" fill="#fff" />
                </g>
              )}
            </g>
          )}

          {/* Goals */}
          <rect x="112" y="3" width="36" height="8" rx="1" fill="none" stroke="#ddd" strokeWidth="1.5" />
          <rect x="112" y="289" width="36" height="8" rx="1" fill="none" stroke="#ddd" strokeWidth="1.5" />
        </svg>

        {/* Right stand SVG (lv2+) */}
        {f.stands >= 2 && (
          <svg viewBox={`0 0 ${standW + 4} ${standH}`} width={standW * 1.1 + 4} height={standH * 0.7} className="shrink-0">
            <rect x="4" y="0" width={standW} height={standH} rx="2" fill={teamColor} />
            {Array.from({ length: seatRows }).map((_, i) => (
              <rect key={i} x="6" y={4 + i * (standH / seatRows)} width={standW - 4} height={standH / seatRows * 0.4} rx="1" fill="#fff" opacity="0.15" />
            ))}
            {/* VIP section (lv3) */}
            {f.stands >= 3 && (
              <g>
                <rect x="5" y={standH * 0.35} width={standW - 1} height={standH * 0.2} rx="2" fill="#C9A84C" />
                <text x={standW / 2 + 4} y={standH * 0.46} textAnchor="middle" fontSize="7" fill="#fff" fontWeight="bold">VIP</text>
              </g>
            )}
          </svg>
        )}
      </div>

      {/* Bottom: building chips */}
      {bottomFacilities.length > 0 && (
        <div className="flex gap-2 justify-center">
          {bottomFacilities.map((k) => (
            <FacilityChip key={k} facility={k} level={f[k]} color={teamColor} />
          ))}
        </div>
      )}

      {/* Label */}
      <div className="text-xs text-muted text-center">
        Trávník {pitchCondition}% &middot; {pitchType === "natural" ? "přírodní" : pitchType === "hybrid" ? "hybridní" : "umělý"}
      </div>
    </div>
  );
}

function FacilityChip({ facility, level, color }: { facility: string; level: number; color: string }) {
  const cfg = FACILITY_CONFIG[facility];
  if (!cfg || level <= 0) return null;

  return (
    <div
      className="rounded-xl px-3 py-2 text-center"
      style={{
        backgroundColor: color + (level === 1 ? "18" : level === 2 ? "28" : "38"),
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="text-base leading-none">{cfg.icon}</div>
      <div className="text-[9px] font-heading font-bold mt-0.5" style={{ color }}>{cfg.label}</div>
      <div className="flex gap-0.5 justify-center mt-0.5">
        {[1, 2, 3].map((l) => (
          <div key={l} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: l <= level ? color : "#ddd" }} />
        ))}
      </div>
    </div>
  );
}
