"use client";

/**
 * DOČASNÁ lokální galerie přístaveb tribun (jen pro ladění vzhledu, před nasazením smazat).
 * ?ext=slot:kind:level,...  &preview=slot:kind:level  &sl=main,opposite,goalW,goalE (úrovně tribun)  &cam=x,y,z  &at=x,y,z
 */
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useSearchParams } from "next/navigation";
import { Stand } from "@/components/stadium/stadium-3d/Stand";
import { StandExtensions } from "@/components/stadium/stadium-3d/StandExtensions";
import { getSideLevels } from "@/components/stadium/stadium-3d/stand-levels";

const num = (s: string | null, d: number[]) => (s ? s.split(",").map(Number) : d);

export function Gallery() {
  const q = useSearchParams();
  const ext = (q.get("ext") ?? "").split(",").filter(Boolean).map((e) => {
    const [slot, kind, level] = e.split(":");
    return { slot, kind, level: Number(level) };
  });
  const pv = (q.get("preview") ?? "").split(":");
  const preview = pv.length === 3 ? { slot: pv[0], kind: pv[1], level: Number(pv[2]) } : null;
  const [m, o, gw, ge] = num(q.get("sl"), [3, 3, 3, 3]);
  const sideLevels = getSideLevels({ stand_main: m, stand_opposite: o, stand_goal_west: gw, stand_goal_east: ge });
  const cam = num(q.get("cam"), [60, 40, 60]) as [number, number, number];
  const at = num(q.get("at"), [0, 0, 0]) as [number, number, number];
  const common = {
    teamColor: "#2563eb", secondaryColor: "#ffffff", standColor: "#9CA3AF", seatColor: "#2563eb", accentColor: "#C9A84C",
    mode: "match_day" as const, attendanceRatio: 0.6, reducedDetail: true, cageLevel: 0, ultrasSide: "south" as const,
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#bcd" }}>
      <Canvas shadows camera={{ position: cam, fov: 40, near: 0.5, far: 400 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[40, 60, 30]} intensity={1.4} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[300, 300]} />
          <meshStandardMaterial color="#5c8f4b" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <planeGeometry args={[40, 60]} />
          <meshStandardMaterial color="#2f6b34" />
        </mesh>
        {(["north", "south", "east", "west"] as const).map((side) =>
          sideLevels[side] > 0 ? <Stand key={side} side={side} level={sideLevels[side]} {...common} /> : null,
        )}
        <StandExtensions
          extensions={ext}
          preview={preview}
          sideLevels={sideLevels}
          standColor="#9CA3AF"
          seatColor="#2563eb"
          accentColor="#C9A84C"
          teamColor="#2563eb"
          secondaryColor="#ffffff"
          reducedDetail
        />
        <OrbitControls target={at} />
      </Canvas>
    </div>
  );
}
