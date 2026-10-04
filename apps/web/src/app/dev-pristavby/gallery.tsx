"use client";

/**
 * DOČASNÁ lokální galerie přístaveb tribun (jen pro ladění vzhledu, před nasazením smazat).
 *
 * /dev-pristavby            přehled hotových variant
 * /dev-pristavby?v=3        jedna varianta (šipky přepínají), &game=1 = barvy klubu jako ve hře
 * Ruční sestavení: ?ext=slot:kind:level,...  &preview=slot:kind:level  &sl=main,opposite,goalW,goalE  &cam=x,y,z  &at=x,y,z
 */
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useSearchParams } from "next/navigation";
import { Stand } from "@/components/stadium/stadium-3d/Stand";
import { StandExtensions } from "@/components/stadium/stadium-3d/StandExtensions";
import { Stadium3D } from "@/components/stadium/stadium-3d/Stadium3D";
import { getSideLevels, joinedEnds, replacedSides } from "@/components/stadium/stadium-3d/stand-levels";

interface Variant {
  name: string;
  note: string;
  /** úrovně tribun: hlavní, protější, za levou brankou, za pravou brankou */
  sl: [number, number, number, number];
  ext: string;
  cam?: [number, number, number];
  at?: [number, number, number];
}

const C = (slot: string, kind: string, level: number) => `${slot}:${kind}:${level}`;
const CORNERS = ["corner_main_goal_east", "corner_main_goal_west", "corner_opposite_goal_east", "corner_opposite_goal_west"];
const all = (kind: string, level: number) => CORNERS.map((s) => C(s, kind, level)).join(",");

const VARIANTS: Variant[] = [
  { name: "Zaoblený stadion", note: "Čtyři zahnuté rohy spojí všechny tribuny do jednoho oválu.", sl: [3, 3, 3, 3], ext: all("curved_corner", 3) },
  { name: "Zaoblený s točenými brankami", note: "Zahnuté rohy a před oběma brankami točená tribuna.", sl: [3, 3, 3, 3],
    ext: `${all("curved_corner", 2)},${C("ext_goal_west", "round_stand", 3)},${C("ext_goal_east", "round_stand", 3)}` },
  { name: "Dvoupatrová hlavní", note: "Hlavní tribuna jako dvojitá, protější s druhým patrem, brankoviště nízká.", sl: [3, 3, 2, 2],
    ext: `${C("ext_main", "double_stand", 3)},${C("ext_opposite", "second_tier", 2)}` },
  { name: "Vesnický stadion", note: "Malé tribuny, travnaté valy za brankami, lávka u plotu a mobilní kousky v rozích.", sl: [2, 1, 0, 0],
    ext: `${C("ext_goal_west", "terrace", 3)},${C("ext_goal_east", "terrace", 3)},${C("ext_opposite", "footbridge", 2)},${all("mobile", 2)}` },
  { name: "Jednostranný", note: "Jediná velká hlavní tribuna na pilotech, v rozích mobilní kusy.", sl: [3, 0, 0, 0],
    ext: `${C("ext_main", "stilts", 3)},${C("corner_main_goal_east", "mobile", 3)},${C("corner_main_goal_west", "mobile", 3)}` },
  { name: "Podkova", note: "Hlavní a obě brankoviště, protější strana otevřená, rohy zaoblené.", sl: [3, 0, 3, 3],
    ext: `${C("corner_main_goal_east", "curved_corner", 3)},${C("corner_main_goal_west", "curved_corner", 3)},${C("ext_goal_west", "second_tier", 2)},${C("ext_goal_east", "second_tier", 2)}` },
  { name: "Kotel za brankou", note: "Vysoké tribuny za brankami s patrem, po stranách nižší tribuny, křídla v rozích.", sl: [2, 2, 3, 3],
    ext: `${C("ext_goal_west", "second_tier", 3)},${C("ext_goal_east", "second_tier", 3)},${all("wing", 2)}` },
  { name: "Aréna", note: "Všechno naplno: dvojitá hlavní, protější s druhým patrem, točené brankoviště, zahnuté rohy.", sl: [3, 3, 3, 3],
    ext: `${C("ext_main", "double_stand", 3)},${C("ext_opposite", "second_tier", 3)},${C("ext_goal_west", "round_stand", 3)},${C("ext_goal_east", "round_stand", 3)},${all("curved_corner", 3)}` },
  { name: "Věže a mosty", note: "Hlavní tribuna s věží, rohy propojené mosty, protější s lávkou.", sl: [3, 2, 2, 2],
    ext: `${C("ext_main", "tower", 3)},${C("ext_opposite", "footbridge", 3)},${all("bridge", 2)}` },
  { name: "Rohové klíny", note: "Rovné tribuny, v rozích přímé klíny místo mezer.", sl: [3, 3, 3, 3], ext: all("corner", 3) },
  { name: "Minimální", note: "Čtyři nejmenší tribunky a mobilní kousky v rozích, nejlevnější začátek.", sl: [1, 1, 1, 1],
    ext: all("mobile", 1) },
  { name: "Prodloužené boky", note: "Dlouhé strany prodloužené k rohům, brankoviště s valem.", sl: [3, 3, 2, 2],
    ext: `${C("ext_main", "length", 3)},${C("ext_opposite", "length", 3)},${C("ext_goal_west", "terrace", 3)},${C("ext_goal_east", "terrace", 3)}` },
];

const num = (s: string | null, d: number[]) => (s ? s.split(",").map(Number) : d);

function Index({ game, real, roof }: { game: boolean; real: boolean; roof: number }) {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Varianty přístaveb tribun</h1>
      <p style={{ color: "#555", margin: "8px 0 16px" }}>
        Klikni na variantu, uvnitř přepínáš šipkami. Zobrazení:{" "}
        <a href={`?${real ? "" : "real=1"}`} style={{ textDecoration: "underline" }}>{real ? "přepnout na rychlou galerii" : "přepnout na skutečnou herní scénu"}</a>
        {!real && (
          <>
            {" "}| Barvy:{" "}
            <a href={`?${game ? "" : "game=1"}`} style={{ textDecoration: "underline" }}>{game ? "šedý beton" : "barvy klubu"}</a>
          </>
        )}
      </p>
      <ol style={{ display: "grid", gap: 8, paddingLeft: 0, listStyle: "none" }}>
        {VARIANTS.map((v, i) => (
          <li key={v.name}>
            <a
              href={`?v=${i}${real ? `&real=1&roof=${roof}` : game ? "&game=1" : ""}`}
              style={{ display: "block", padding: 12, border: "1px solid #ccd", borderRadius: 10, background: "#fff", textDecoration: "none", color: "#111" }}
            >
              <b style={{ fontSize: 17 }}>{i + 1}. {v.name}</b>
              <div style={{ color: "#555", fontSize: 15 }}>{v.note}</div>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Gallery() {
  const q = useSearchParams();
  const game = !!q.get("game");
  const vIndex = q.get("v") !== null ? Number(q.get("v")) : null;
  const variant = vIndex !== null ? VARIANTS[vIndex] : undefined;
  const real = !!q.get("real");
  const roofIdx = Math.max(0, Math.min(3, Number(q.get("roof") ?? 0)));
  if (!q.get("ext") && !variant) return <Index game={game} real={real} roof={roofIdx} />;

  const ext = (variant ? variant.ext : q.get("ext") ?? "").split(",").filter(Boolean).map((e) => {
    const [slot, kind, level] = e.split(":");
    return { slot, kind, level: Number(level) };
  });
  const pv = (q.get("preview") ?? "").split(":");
  const preview = pv.length === 3 ? { slot: pv[0], kind: pv[1], level: Number(pv[2]) } : null;
  const [m, o, gw, ge] = variant ? variant.sl : num(q.get("sl"), [3, 3, 3, 3]);
  const sideLevels = getSideLevels({ stand_main: m, stand_opposite: o, stand_goal_west: gw, stand_goal_east: ge });
  const roofParam = Math.max(0, Math.min(3, Number(q.get("roof") ?? 0)));
  if (real && (variant || ext.length > 0)) {
    const facilities: Record<string, number> = {
      stand_main: m, stand_opposite: o, stand_goal_west: gw, stand_goal_east: ge, stands: Math.max(m, o, gw, ge),
      lighting: 2, fence: 2, parking: 1, entrance_gate: 1, refreshments: 1, changing_rooms: 2, showers: 1, toilets: 1,
      roof: roofParam,
    };
    const navBtn: React.CSSProperties = { padding: "10px 16px", background: "#fff", border: "1px solid #ccd", borderRadius: 8, fontWeight: 700, textDecoration: "none", color: "#111", fontSize: 16 };
    const vi = vIndex ?? 0;
    const p = (vi + VARIANTS.length - 1) % VARIANTS.length;
    const n = (vi + 1) % VARIANTS.length;
    return (
      <div style={{ position: "fixed", inset: 0 }}>
        <Stadium3D
          key={`${vIndex}-${roofParam}-${q.get("vp") ?? ""}`}
          initialViewpoint={(q.get("vp") as never) ?? "overview"}
          pitchCondition={90}
          pitchType="natural"
          facilities={facilities}
          standExtensions={ext}
          extensionPreview={preview}
          teamColor="#2563eb"
          secondaryColor="#ffffff"
          stadiumName="Sportovní areál (náhled variant)"
          initialWeather="sunny"
          initialMode="match_day"
          showControls
        />
        <div style={{ position: "fixed", top: 12, left: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontFamily: "system-ui, sans-serif", zIndex: 50 }}>
          <a href={`?real=1&roof=${roofParam}`} style={navBtn}>Přehled</a>
          <a href={`?v=${p}&real=1&roof=${roofParam}`} style={navBtn}>‹</a>
          <a href={`?v=${n}&real=1&roof=${roofParam}`} style={navBtn}>›</a>
          <span style={{ ...navBtn, border: "none" }}>{variant ? `${vi + 1}/${VARIANTS.length} ${variant.name}` : "Ruční sestava"}</span>
          {variant && (
            <>
              <a href={`?v=${vi}&real=1&roof=${roofParam === 0 ? 2 : 0}`} style={navBtn}>{roofParam === 0 ? "Se střechou" : "Bez střechy"}</a>
              <a href={`?v=${vi}`} style={navBtn}>Rychlá galerie</a>
            </>
          )}
        </div>
      </div>
    );
  }
  const cam = (variant?.cam ?? num(q.get("cam"), [78, 62, 78])) as [number, number, number];
  const at = (variant?.at ?? num(q.get("at"), [0, 0, 0])) as [number, number, number];
  const replaced = replacedSides(ext, preview);
  const standColor = game ? "#2563eb" : "#9CA3AF";
  const common = {
    teamColor: "#2563eb", secondaryColor: "#ffffff", standColor, seatColor: "#2563eb", accentColor: "#C9A84C",
    mode: "match_day" as const, attendanceRatio: 0.6, reducedDetail: true, cageLevel: 0, ultrasSide: "south" as const,
  };
  const g = game ? "&game=1" : "";
  const prev = vIndex !== null ? (vIndex + VARIANTS.length - 1) % VARIANTS.length : 0;
  const next = vIndex !== null ? (vIndex + 1) % VARIANTS.length : 0;
  const btn: React.CSSProperties = { padding: "10px 16px", background: "#fff", border: "1px solid #ccd", borderRadius: 8, fontWeight: 700, textDecoration: "none", color: "#111", fontSize: 16 };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#bcd" }}>
      <Canvas shadows camera={{ position: cam, fov: 40, near: 0.5, far: 500 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[40, 60, 30]} intensity={1.4} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color="#5c8f4b" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <planeGeometry args={[40, 60]} />
          <meshStandardMaterial color="#2f6b34" />
        </mesh>
        {(["north", "south", "east", "west"] as const).map((side) =>
          sideLevels[side] > 0 && !replaced.has(side)
            ? <Stand key={side} side={side} level={sideLevels[side]} joinedEnds={joinedEnds(side, ext)} {...common} />
            : null,
        )}
        <StandExtensions
          extensions={ext}
          preview={preview}
          sideLevels={sideLevels}
          standColor={standColor}
          seatColor="#2563eb"
          accentColor="#C9A84C"
          teamColor="#2563eb"
          secondaryColor="#ffffff"
          reducedDetail
        />
        <OrbitControls target={at} />
      </Canvas>
      {variant && vIndex !== null && (
        <div style={{ position: "fixed", top: 12, left: 12, right: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontFamily: "system-ui, sans-serif" }}>
          <a href={`?${g.slice(1)}`} style={btn}>Přehled</a>
          <a href={`?v=${prev}${g}`} style={btn}>‹</a>
          <a href={`?v=${next}${g}`} style={btn}>›</a>
          <span style={{ ...btn, border: "none" }}>{vIndex + 1}/{VARIANTS.length} {variant.name}</span>
          <a href={`?v=${vIndex}${game ? "" : "&game=1"}`} style={btn}>{game ? "Beton" : "Barvy klubu"}</a>
        </div>
      )}
    </div>
  );
}
