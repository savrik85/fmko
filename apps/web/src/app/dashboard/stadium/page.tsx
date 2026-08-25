"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team } from "@/lib/api";
import { Spinner, SectionLabel, useConfirm, LockDetail, type LockDetailData } from "@/components/ui";
import { StadiumView } from "@/components/stadium/stadium-view";

const Stadium3D = dynamic(
  () => import("@/components/stadium/stadium-3d/Stadium3D").then((m) => m.Stadium3D),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-muted text-sm">
        <Spinner />
      </div>
    ),
  }
);

const Stadium3DViewer = dynamic(
  () => import("@/components/stadium/stadium-3d/Stadium3DViewer").then((m) => m.Stadium3DViewer),
  { ssr: false }
);

type ViewMode = "2d" | "3d";

interface UpgradeOption {
  facility: string;
  label: string;
  currentLevel: number;
  nextLevel: number;
  cost: number;
  effect: string;
  locked?: boolean;
  lockReason?: string;
  lockDetail?: LockDetailData;
  lockHint?: string;
  villageCanFund?: boolean;
}

interface PitchAction {
  level: string;
  label: string;
  desc: string;
  cost: number;
  improvement: number;
}

interface PitchUpgrade {
  pitchType: string;
  label: string;
  desc: string;
  cost: number;
}

interface Customization {
  fenceColor: string | null;
  standColor: string | null;
  seatColor: string | null;
  roofColor: string | null;
  accentColor: string | null;
  scoreboardLevel: number;
  flagSize: number;
  ultrasText: string | null;
  ultrasBannerColor: string | null;
  ultrasTextColor: string | null;
  flagColor: string | null;
  mowingPattern?: string | null;
  netPattern?: string | null;
  netStyle?: string | null;
  surroundSurface?: string | null;
}

interface VisualUpgrade {
  kind: "scoreboard" | "flag";
  currentLevel: number;
  nextLevel: number;
  cost: number;
  label: string;
}

interface PitchCare {
  mode: "auto" | "manual" | "off";
  modeLabel: string;
  heatingLevel: number;
  irrigationLevel: number;
  heatingCost: number;
  irrigationCost: number;
  snowClearingCost: number;
  careOrdered: boolean;
  snowClearingOrdered: boolean;
}

interface StadiumData {
  stadiumName: string | null;
  capacity: number;
  pitchCondition: number;
  pitchType: string;
  facilities: Record<string, number>;
  /** Úroveň vyhřívání trávníku (0–3) z vybavení — vyhřívaná plocha nezasněží. */
  pitchHeating?: number;
  /** Úroveň sekačky (0–3) z vybavení. */
  mowerLevel?: number;
  pitchCare?: PitchCare;
  /** Vlhkost půdy 0–100 (50 = normál). */
  pitchMoisture?: number;
  customization: Customization;
  visualUpgrades: VisualUpgrade[];
  upgrades: UpgradeOption[];
  pitchActions: PitchAction[];
  pitchUpgrades: PitchUpgrade[];
}

const FACILITY_ICONS: Record<string, string> = {
  changing_rooms: "🚪",
  showers: "🚿",
  refreshments: "🍺",
  lighting: "💡",
  stands: "🏟",
  roof: "☂️",
  ultras_stand: "🥁",
  toilets: "🚻",
  parking: "🚗",
  fence: "🏗",
  entrance_gate: "🎟️",
};

const FACILITY_LABELS: Record<string, string> = {
  changing_rooms: "Šatny",
  showers: "Sprchy",
  refreshments: "Občerstvení",
  lighting: "Osvětlení",
  stands: "Tribuny",
  roof: "Zastřešení tribun",
  ultras_stand: "Sektor kotle",
  toilets: "Sociálky",
  parking: "Parkoviště",
  fence: "Oplocení",
  entrance_gate: "Vstupní brána",
};

const FACILITY_DESCRIPTIONS: Record<string, string[]> = {
  changing_rooms: ["Převlékání za autem", "Bouda s lavicí", "Šatna se skříňkami", "Moderní šatny s vyhříváním"],
  showers: ["Hadice na dvoře", "Jedna sprcha se studenou vodou", "Sprchy s teplou vodou", "Sprchy s masážními tryskami"],
  refreshments: ["Žádné", "Dřevěný kiosek", "Zděná klubová hospůdka", "Moderní restaurace s terasou"],
  lighting: ["Žádné", "Dva základní stožáry", "Čtyři stožáry s osvětlením hřiště", "Plné profesionální osvětlení"],
  stands: ["Diváci stojí kolem hřiště", "Pár laviček", "Dřevěná tribuna", "Betonová tribuna se sedačkami"],
  roof: ["Bez střechy — v dešti se to vylidní", "Plachta nad lavičkami", "Plechová stříška nad tribunou", "Kompletní zastřešení tribun"],
  ultras_stand: ["Bez kotle", "Pár bubeníků za brankou", "Vlajkový sektor s bubny", "Peklo — chorály slyšet do vedlejší vsi"],
  toilets: ["Kopřivy za střídačkou", "Kadibudka", "Zděné záchodky", "Čisté sociálky s teplou vodou"],
  parking: ["Žádné", "Louka vedle hřiště", "Štěrkové parkoviště", "Asfaltové parkoviště s čarami"],
  fence: ["Žádné", "Provizorní páska", "Drátěný plot", "Zděné oplocení s branami"],
  entrance_gate: ["Závora a pokladna na stolečku", "Dřevěná pokladna a kovaná brána", "Zděná brána se 2 turnikety", "Monumentální stadionový portál s turnikety"],
};

const LEVEL_LABELS = ["Žádné", "Základní", "Dobré", "Vynikající"];

function pitchColor(condition: number): string {
  if (condition >= 80) return "text-pitch-500";
  if (condition >= 60) return "text-pitch-600";
  if (condition >= 40) return "text-gold-600";
  return "text-card-red";
}

function pitchBarColor(condition: number): string {
  if (condition >= 80) return "bg-pitch-400";
  if (condition >= 60) return "bg-pitch-500";
  if (condition >= 40) return "bg-gold-500";
  return "bg-card-red";
}

function formatCZK(v: number): string { return v.toLocaleString("cs") + " Kč"; }

function teamInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
}

const COLOR_PALETTE = [
  "#141414", "#A89078", "#8B7355", "#9CA3AF", "#374151", "#3B6B8C",
  "#558B2F", "#A0432C", "#C9A84C", "#E63946", "#F5E6C8", "#FFFFFF",
];

const CUSTOM_FIELDS: Array<{ field: keyof Customization; label: string; defaultColor: string; requiresKotel?: boolean; requiresFlag?: boolean; teamDefault?: boolean }> = [
  { field: "fenceColor", label: "Plot", defaultColor: "#A89078" },
  { field: "standColor", label: "Tribuny", defaultColor: "#9CA3AF" },
  { field: "seatColor", label: "Sedačky", defaultColor: "#9CA3AF" },
  { field: "roofColor", label: "Střechy", defaultColor: "#A0432C" },
  { field: "accentColor", label: "Akcent (VIP)", defaultColor: "#C9A84C" },
  { field: "flagColor", label: "Vlajka", defaultColor: "#2D5F2D", requiresFlag: true, teamDefault: true },
  { field: "ultrasBannerColor", label: "Kotel plachta", defaultColor: "#7A2530", requiresKotel: true, teamDefault: true },
  { field: "ultrasTextColor", label: "Kotel nápis", defaultColor: "#FFFFFF", requiresKotel: true },
];

const MOWING_PATTERNS = [
  { id: "stripes", label: "Pruhy", icon: "📏", desc: "Klasické vodorovné pruhy" },
  { id: "checkerboard", label: "Šachovnice", icon: "🏁", desc: "Anglický čtvercový vzor" },
  { id: "circles", label: "Kruhy", icon: "🎯", desc: "Soustředné prstence" },
  { id: "crooked", label: "Správce Franta", icon: "🚜", desc: "Křivé okresní vlnovky" },
];

const NET_PATTERNS = [
  { id: "white", label: "Bílá klasika", icon: "⚪", desc: "Tradiční bílá síť" },
  { id: "checkered", label: "Šachovnice", icon: "🏁", desc: "V klubových barvách" },
  { id: "striped", label: "Pruhy", icon: "💈", desc: "Klubové pruhy" },
];

const NET_STYLES = [
  { id: "loose", label: "Okresní volná", icon: "📐", desc: "Šikmé vzpěry, splývající síť" },
  { id: "box", label: "Krabicová", icon: "📦", desc: "Napnutá moderní síť" },
];

const SURROUND_SURFACES = [
  { id: "grass", label: "Přírodní tráva", icon: "🌿", cost: 0, desc: "Základní venkovský terén (Zdarma)" },
  { id: "cinders", label: "Antukový pás", icon: "🟤", cost: 3000, desc: "Červeno-hnědý zpevněný lem podél lajn" },
  { id: "paving", label: "Zámková dlažba", icon: "🧱", cost: 10000, desc: "Dlážděný výběh & chodníky k šatnám a hospodě" },
  { id: "astro", label: "Umělý trávník", icon: "🟢", cost: 25000, desc: "Sytě zelený AstroTurf výběhový koberec" },
  { id: "tartan", label: "Klubový VIP koberec", icon: "🔵", cost: 50000, desc: "Syntetický koberec v klubových barvách" },
];

export default function StadiumPage() {
  const { teamId } = useTeam();
  const [stadium, setStadium] = useState<StadiumData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const [openPicker, setOpenPicker] = useState<keyof Customization | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [ultrasDraft, setUltrasDraft] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("stadium-view-mode");
    if (saved === "2d" || saved === "3d") setViewMode(saved);
  }, []);

  const switchView = (mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("stadium-view-mode", mode);
    }
  };

  const [sponsorNames, setSponsorNames] = useState<string[]>([]);

  const refresh = async () => {
    if (!teamId) return;
    const [s, t, sp] = await Promise.all([
      apiFetch<StadiumData>(`/api/teams/${teamId}/stadium`),
      apiFetch<Team>(`/api/teams/${teamId}`),
      apiFetch<{
        mainContract: { sponsorName: string } | null;
        stadiumContract: { sponsorName: string } | null;
        bannerContracts: Array<{ sponsorName: string }>;
      }>(
        `/api/teams/${teamId}/sponsors`
      ).catch((e) => { console.warn("sponsors fetch:", e); return null; }),
    ]);
    setStadium(s); setTeam(t);
    // Pro 3D bannery jen aktivní banner kontrakty — bez bannerů žádné ploty kolem hřiště
    setSponsorNames(sp?.bannerContracts?.map((c) => c.sponsorName) ?? []);
  };

  useEffect(() => {
    if (!teamId) return;
    refresh().then(() => setLoading(false)).catch(() => setLoading(false));
  }, [teamId]);

  const handleCustomize = async (field: keyof Customization, value: string | null) => {
    if (!teamId) return;
    const dbField = field.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
    await apiFetch(`/api/teams/${teamId}/stadium/customize`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: dbField, value }),
    }).catch((e) => console.error("customize:", e));
    await refresh();
  };

  const handleSurroundChange = async (s: (typeof SURROUND_SURFACES)[number]) => {
    const current = stadium?.customization.surroundSurface ?? "grass";
    if (!team || current === s.id || acting) return;

    if (s.cost > 0) {
      if (team.budget < s.cost) {
        return;
      }
      const ok = await confirm({
        title: `Položit povrch: ${s.label}?`,
        description: `Vybudování a úprava nového povrchu v areálu a kolem hřiště.`,
        details: [{ label: "Cena", value: `-${formatCZK(s.cost)}`, color: "text-card-red" }],
        confirmLabel: `Koupit a položit za ${formatCZK(s.cost)}`,
      });
      if (!ok) return;
    }

    setActing("surround-" + s.id);
    await handleCustomize("surroundSurface", s.id);
    setActing(null);
  };

  const handleVisualUpgrade = async (kind: "scoreboard" | "flag", label: string, cost: number) => {
    if (!teamId || acting) return;
    const ok = await confirm({
      title: `Pořídit: ${label}?`,
      details: [{ label: "Cena", value: `-${formatCZK(cost)}`, color: "text-card-red" }],
      confirmLabel: `Koupit za ${formatCZK(cost)}`,
    });
    if (!ok) return;
    setActing("visual-" + kind);
    await apiFetch(`/api/teams/${teamId}/stadium/visual-upgrade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    }).catch((e) => console.error("visual-upgrade:", e));
    await refresh();
    setActing(null);
  };

  const handleUpgrade = async (facility: string, label: string, cost: number, effect: string) => {
    if (!teamId || acting) return;
    const ok = await confirm({
      title: `Vylepšit ${label}?`,
      description: effect,
      details: [{ label: "Cena", value: `-${formatCZK(cost)}`, color: "text-card-red" }],
      confirmLabel: `Koupit za ${formatCZK(cost)}`,
    });
    if (!ok) return;
    setActing(facility);
    await apiFetch(`/api/teams/${teamId}/stadium/upgrade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facility }),
    }).catch((e) => console.error("stadium upgrade failed:", e));
    await refresh();
    setActing(null);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!stadium || !team) return <div className="page-container">Stadion nenalezen.</div>;

  return (
    <div className="page-container space-y-5">
      {confirmDialog}

      <Stadium3DViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        pitchCondition={stadium.pitchCondition}
        pitchType={stadium.pitchType}
        facilities={stadium.facilities}
        pitchHeating={stadium.pitchHeating ?? 0}
        pitchIrrigation={stadium.pitchCare?.irrigationLevel ?? 0}
        mowerLevel={stadium.mowerLevel ?? 2}
        snowClearingOrdered={stadium.pitchCare?.snowClearingOrdered ?? false}
        pitchMoisture={stadium.pitchMoisture ?? 50}
        teamColor={team.primary_color}
        secondaryColor={team.secondary_color}
        badgePattern={team.badge_pattern}
        badgeInitials={team.badge_initials || teamInitials(team.name)}
        badgeSymbol={team.badge_symbol}
        badgePrimary={team.badge_primary_color}
        badgeSecondary={team.badge_secondary_color}
        stadiumName={stadium.stadiumName}
        sponsors={sponsorNames}
        customization={stadium.customization}
      />

      {/* ═══ Stadium visualization + stats ═══ */}
      <div className="card p-4 sm:p-5">
        {stadium.stadiumName && (
          <div className="text-center mb-3">
            <h2 className="font-heading font-bold text-xl">{stadium.stadiumName}</h2>
          </div>
        )}

        {/* Toggle 2D / 3D */}
        <div className="flex justify-end gap-2 mb-3">
          <button
            onClick={() => switchView("2d")}
            className={`px-5 py-2 rounded-soft text-base font-heading font-bold transition-colors min-w-[64px] ${
              viewMode === "2d"
                ? "bg-pitch-500 text-white"
                : "bg-gray-100 text-muted hover:bg-gray-200"
            }`}
          >
            2D
          </button>
          <button
            onClick={() => switchView("3d")}
            className={`px-5 py-2 rounded-soft text-base font-heading font-bold transition-colors min-w-[64px] ${
              viewMode === "3d"
                ? "bg-pitch-500 text-white"
                : "bg-gray-100 text-muted hover:bg-gray-200"
            }`}
          >
            3D
          </button>
        </div>

        {viewMode === "3d" ? (
          <div className="space-y-2">
            <div
              className="h-[280px] sm:h-[500px] rounded-xl overflow-hidden bg-gradient-to-b from-sky-100 to-sky-50 relative"
              style={{ touchAction: "pan-y" }}
            >
              {!viewerOpen && (
                <Stadium3D
                  pitchCondition={stadium.pitchCondition}
                  pitchType={stadium.pitchType}
                  facilities={stadium.facilities}
                  pitchHeating={stadium.pitchHeating ?? 0}
                  pitchIrrigation={stadium.pitchCare?.irrigationLevel ?? 0}
                  mowerLevel={stadium.mowerLevel ?? 2}
                  snowClearingOrdered={stadium.pitchCare?.snowClearingOrdered ?? false}
                  pitchMoisture={stadium.pitchMoisture ?? 50}
                  teamColor={team.primary_color}
                  secondaryColor={team.secondary_color}
                  badgePattern={team.badge_pattern}
                  badgeInitials={team.badge_initials || teamInitials(team.name)}
                  badgeSymbol={team.badge_symbol}
                  badgePrimary={team.badge_primary_color}
                  badgeSecondary={team.badge_secondary_color}
                  stadiumName={stadium.stadiumName}
                  sponsors={sponsorNames}
                  customization={stadium.customization}
                />
              )}
              <div className="sm:hidden absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-micro px-2 py-1 rounded pointer-events-none">
                dva prsty pro rotaci/zoom
              </div>
            </div>
            <button
              onClick={() => setViewerOpen(true)}
              className="w-full py-2 bg-pitch-500 hover:bg-pitch-600 text-white rounded-soft text-sm font-heading font-bold transition-colors shadow-sm"
            >
              🔍 Prohlédnout v plné velikosti
            </button>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted text-center pt-0.5">
              <span>💡</span>
              <span>Pro přepínání <strong>režimu areálu</strong> (Zápasový vs. Tréninkový den), <strong>počasí</strong> a <strong>kamer</strong> klikněte v rohu scény na <strong>🎛️ Počasí & Kamery</strong>.</span>
            </div>
          </div>
        ) : (
          <StadiumView
            pitchCondition={stadium.pitchCondition}
            pitchType={stadium.pitchType}
            facilities={stadium.facilities}
            teamColor={team.primary_color}
            mowingPattern={stadium.customization.mowingPattern ?? "stripes"}
            surroundSurface={stadium.customization.surroundSurface ?? "grass"}
          />
        )}

        <div className="grid grid-cols-3 gap-4 text-center mt-4 pt-4 border-t border-gray-100">
          <div>
            <div className="font-heading font-bold text-xl tabular-nums text-ink">{stadium.capacity}</div>
            <div className="text-sm text-muted">Kapacita</div>
          </div>
          <div>
            <div className={`font-heading font-bold text-xl tabular-nums ${pitchColor(stadium.pitchCondition)}`}>{stadium.pitchCondition}%</div>
            <div className="text-sm text-muted">Trávník</div>
          </div>
          <div>
            <div className="font-heading font-bold text-xl tabular-nums text-ink">
              {stadium.pitchType === "natural" ? "Přírodní" : stadium.pitchType === "hybrid" ? "Hybridní" : "Umělý"}
            </div>
            <div className="text-sm text-muted">Povrch</div>
          </div>
        </div>

        {/* ─── Vzhled stadionu (jen v 3D) ─── */}
        {viewMode === "3d" && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
            <div className="text-xs text-muted font-heading uppercase">Vzhled stadionu (zdarma)</div>

            {/* Záložky – výběr položky (kotel jen když je postavený) */}
            <div className="flex flex-wrap gap-1.5">
              {CUSTOM_FIELDS.filter((f) => (!f.requiresKotel || (stadium.facilities.ultras_stand ?? 0) > 0) && (!f.requiresFlag || (stadium.customization.flagSize ?? 0) > 0)).map(({ field, label, defaultColor, teamDefault }) => {
                const current = stadium.customization[field] as string | null;
                const displayColor = current ?? (teamDefault ? (team?.primary_color ?? defaultColor) : defaultColor);
                const isActive = openPicker === field;
                return (
                  <button
                    key={field}
                    onClick={() => setOpenPicker(isActive ? null : field)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-soft border-2 transition-colors text-xs font-heading font-bold ${isActive ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:border-gray-400 bg-white"}`}
                  >
                    <span className="w-5 h-5 rounded border border-gray-300 shrink-0" style={{ backgroundColor: displayColor }} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Paleta barev pro aktivní položku – inline pod záložkami, full-width karty */}
            {openPicker && (() => {
              const cf = CUSTOM_FIELDS.find((c) => c.field === openPicker);
              if (!cf) return null;
              const current = stadium.customization[openPicker] as string | null;
              return (
                <div className="p-3 bg-pitch-50 border-2 border-pitch-500 rounded-soft flex flex-wrap gap-3">
                  <button
                    onClick={() => { handleCustomize(openPicker, null); setOpenPicker(null); }}
                    className={`w-10 h-10 rounded-control border-2 flex items-center justify-center text-sm ${current === null ? "border-pitch-500" : "border-gray-300"}`}
                    style={{ backgroundColor: cf.teamDefault ? (team?.primary_color ?? cf.defaultColor) : cf.defaultColor }}
                    title="Výchozí"
                  >
                    ✕
                  </button>
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      onClick={() => { handleCustomize(openPicker, c); setOpenPicker(null); }}
                      className={`w-10 h-10 rounded-control border-2 ${current === c ? "border-pitch-500" : "border-gray-200 hover:border-gray-400"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              );
            })()}

            {/* Nápis v kotli — jen když je postavený sektor kotle */}
            {(stadium.facilities.ultras_stand ?? 0) > 0 && (
              <div className="pt-2 border-t border-gray-50">
                <div className="text-xs text-muted font-heading uppercase mb-1.5">Nápis v kotli</div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={22}
                    value={ultrasDraft ?? stadium.customization.ultrasText ?? ""}
                    onChange={(e) => setUltrasDraft(e.target.value)}
                    placeholder="např. PRALES BOHDALEC"
                    className="flex-1 min-w-0 border border-gray-200 rounded-soft px-3 py-1.5 text-sm font-heading uppercase"
                  />
                  <button
                    onClick={async () => {
                      const v = (ultrasDraft ?? stadium.customization.ultrasText ?? "").trim();
                      await handleCustomize("ultrasText", v || null);
                      setUltrasDraft(null);
                    }}
                    className="btn btn-primary btn-sm shrink-0"
                  >
                    Uložit
                  </button>
                </div>
                <div className="text-micro text-muted mt-1">Zobrazí se na plachtě v sektoru kotle (max 22 znaků). Barvu plachty a nápisu nastavíš výše u „Kotel plachta" / „Kotel nápis".</div>
              </div>
            )}

            {/* 🌿 Vzor sekání trávníku */}
            <div className="pt-2 border-t border-gray-50">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs text-muted font-heading uppercase">🌿 Vzor sekání trávníku</div>
                <div className="text-micro text-muted">
                  {stadium.pitchCondition < 50 ? "⚠️ Vyžaduje trávník ≥ 50 %" : "Aktivní na 3D i 2D"}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {MOWING_PATTERNS.map((p) => {
                  const isSelected = (stadium.customization.mowingPattern ?? "stripes") === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleCustomize("mowingPattern", p.id)}
                      className={`flex flex-col text-left p-2 rounded-soft border-2 transition-all ${
                        isSelected
                          ? "border-pitch-500 bg-pitch-50 shadow-sm"
                          : "border-gray-200 hover:border-gray-400 bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-heading font-bold text-xs">
                        <span>{p.icon}</span>
                        <span>{p.label}</span>
                      </div>
                      <div className="text-micro text-muted mt-0.5 leading-tight">{p.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 🥅 Sítě a styl branek */}
            <div className="pt-2 border-t border-gray-50 space-y-3">
              <div>
                <div className="text-xs text-muted font-heading uppercase mb-1.5">🥅 Vzor brankové sítě</div>
                <div className="grid grid-cols-3 gap-2">
                  {NET_PATTERNS.map((p) => {
                    const isSelected = (stadium.customization.netPattern ?? "white") === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleCustomize("netPattern", p.id)}
                        className={`flex flex-col text-left p-2 rounded-soft border-2 transition-all ${
                          isSelected
                            ? "border-pitch-500 bg-pitch-50 shadow-sm"
                            : "border-gray-200 hover:border-gray-400 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-heading font-bold text-xs">
                          <span>{p.icon}</span>
                          <span>{p.label}</span>
                        </div>
                        <div className="text-micro text-muted mt-0.5 leading-tight">{p.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted font-heading uppercase mb-1.5">📐 Styl zavěšení branky</div>
                <div className="grid grid-cols-2 gap-2">
                  {NET_STYLES.map((s) => {
                    const isSelected = (stadium.customization.netStyle ?? "loose") === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleCustomize("netStyle", s.id)}
                        className={`flex flex-col text-left p-2 rounded-soft border-2 transition-all ${
                          isSelected
                            ? "border-pitch-500 bg-pitch-50 shadow-sm"
                            : "border-gray-200 hover:border-gray-400 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-heading font-bold text-xs">
                          <span>{s.icon}</span>
                          <span>{s.label}</span>
                        </div>
                        <div className="text-micro text-muted mt-0.5 leading-tight">{s.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted font-heading uppercase mb-1.5 flex items-center justify-between">
                  <span>🏃‍♂️ Povrch areálu & oválu</span>
                  <span className="text-micro font-normal text-muted lowercase">stavební investice</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {SURROUND_SURFACES.map((s) => {
                    const isSelected = (stadium.customization.surroundSurface ?? "grass") === s.id;
                    const canAfford = s.cost === 0 || team.budget >= s.cost;
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleSurroundChange(s)}
                        disabled={!!acting || (!isSelected && !canAfford)}
                        className={`flex flex-col text-left p-2.5 rounded-soft border-2 transition-all relative ${
                          isSelected
                            ? "border-pitch-500 bg-pitch-50 shadow-sm"
                            : canAfford
                            ? "border-gray-200 hover:border-gray-400 bg-white"
                            : "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 w-full">
                          <div className="flex items-center gap-1.5 font-heading font-bold text-xs">
                            <span>{s.icon}</span>
                            <span>{s.label}</span>
                          </div>
                          {isSelected ? (
                            <span className="text-micro font-bold text-pitch-600 bg-pitch-100 px-1.5 py-0.5 rounded">
                              Položeno
                            </span>
                          ) : (
                            <span className={`text-micro font-bold tabular-nums ${s.cost === 0 ? "text-emerald-600" : canAfford ? "text-ink" : "text-card-red"}`}>
                              {s.cost === 0 ? "Zdarma" : formatCZK(s.cost)}
                            </span>
                          )}
                        </div>
                        <div className="text-micro text-muted mt-1 leading-tight">{s.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-50 space-y-1">
              <div className="text-xs text-muted font-heading uppercase mb-1">Vybavení (placené)</div>

              <div className="flex items-center justify-between gap-3 py-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">🏟️</span>
                  <div>
                    <div className="font-heading font-bold text-sm">
                      Scoreboard <span className="text-muted">L{stadium.customization.scoreboardLevel}/3</span>
                    </div>
                    <div className="text-xs text-muted">
                      {stadium.customization.scoreboardLevel === 0 ? "Žádný" :
                       stadium.customization.scoreboardLevel === 1 ? "Dřevěná tabule" :
                       stadium.customization.scoreboardLevel === 2 ? "LED jednobarevná" : "Full-color LED"}
                    </div>
                  </div>
                </div>
                {stadium.visualUpgrades.find((u) => u.kind === "scoreboard") && (() => {
                  const u = stadium.visualUpgrades.find((u) => u.kind === "scoreboard")!;
                  const canAfford = team.budget >= u.cost;
                  return (
                    <button
                      onClick={() => handleVisualUpgrade("scoreboard", u.label, u.cost)}
                      disabled={!canAfford || !!acting}
                      className={`shrink-0 py-1.5 px-3 rounded-soft text-xs font-heading font-bold ${canAfford ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-100 text-gray-400"}`}
                    >
                      {acting === "visual-scoreboard" ? "..." : `${u.label} — ${formatCZK(u.cost)}`}
                    </button>
                  );
                })()}
              </div>

              <div className="flex items-center justify-between gap-3 py-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">🚩</span>
                  <div>
                    <div className="font-heading font-bold text-sm">
                      Vlajka týmu <span className="text-muted">L{stadium.customization.flagSize}/3</span>
                    </div>
                    <div className="text-xs text-muted">
                      {stadium.customization.flagSize === 0 ? "Žádná" :
                       stadium.customization.flagSize === 1 ? "Malá (3m)" :
                       stadium.customization.flagSize === 2 ? "Střední (5m)" : "Velká (8m)"}
                    </div>
                  </div>
                </div>
                {stadium.visualUpgrades.find((u) => u.kind === "flag") && (() => {
                  const u = stadium.visualUpgrades.find((u) => u.kind === "flag")!;
                  const canAfford = team.budget >= u.cost;
                  return (
                    <button
                      onClick={() => handleVisualUpgrade("flag", u.label, u.cost)}
                      disabled={!canAfford || !!acting}
                      className={`shrink-0 py-1.5 px-3 rounded-soft text-xs font-heading font-bold ${canAfford ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-100 text-gray-400"}`}
                    >
                      {acting === "visual-flag" ? "..." : `${u.label} — ${formatCZK(u.cost)}`}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Pitch maintenance ═══ */}
      {(stadium.pitchActions.length > 0 || stadium.pitchUpgrades.length > 0) && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Údržba trávníku</SectionLabel>

          {/* Condition bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted uppercase">Stav trávníku</span>
              <span className={`text-sm font-heading font-bold tabular-nums ${pitchColor(stadium.pitchCondition)}`}>{stadium.pitchCondition}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className={`h-2.5 rounded-full transition-all ${pitchBarColor(stadium.pitchCondition)}`} style={{ width: `${stadium.pitchCondition}%` }} />
            </div>
          </div>

          {stadium.pitchActions.length > 0 && (
            <div className="space-y-2 mb-3">
              {stadium.pitchActions.map((a) => {
                const canAfford = team.budget >= a.cost;
                return (
                  <div key={a.level} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-b-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl shrink-0">🌿</span>
                      <div>
                        <div className="font-heading font-bold text-sm">{a.label} <span className="text-muted">—</span> <span className="font-heading font-bold tabular-nums">{formatCZK(a.cost)}</span></div>
                        <div className="text-xs text-muted">{a.desc} · +{a.improvement}% stav</div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: a.label,
                          description: a.desc,
                          details: [
                            { label: "Zlepšení", value: `+${a.improvement}%`, color: "text-pitch-500" },
                            { label: "Cena", value: `-${formatCZK(a.cost)}`, color: "text-card-red" },
                          ],
                          confirmLabel: `Provést za ${formatCZK(a.cost)}`,
                        });
                        if (!ok || !teamId) return;
                        setActing("pitch-" + a.level);
                        await apiFetch(`/api/teams/${teamId}/stadium/maintain-pitch`, {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ level: a.level }),
                        }).catch((e) => console.error("maintain pitch failed:", e));
                        await refresh();
                        setActing(null);
                      }}
                      disabled={!canAfford || !!acting}
                      className={`shrink-0 py-1.5 px-4 rounded-soft text-sm font-heading font-bold transition-colors ${
                        canAfford ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {acting === "pitch-" + a.level ? "..." : "Provést"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {stadium.pitchCare && (
            <div className="pt-3 border-t border-gray-100">
              <div className="text-xs text-muted font-heading uppercase mb-2">Péče o trávník</div>

              {stadium.pitchCare.heatingLevel === 0 && stadium.pitchCare.irrigationLevel === 0 ? (
                <p className="text-sm text-muted mb-3">
                  Nemáš vyhřívání ani zavlažování. Ve Vybavení se dají pořídit — počasí pak trávníku
                  neubližuje tolik.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted mb-2">
                    Zařízení se musí zapnout a ta elektřina i voda něco stojí. Provoz se platí za zápas,
                    ve kterém je potřeba.
                  </p>
                  <div className="text-sm mb-3 space-y-0.5">
                    {stadium.pitchCare.heatingLevel > 0 && (
                      <div className="flex justify-between">
                        <span>🔥 Vyhřívání (déšť a sníh)</span>
                        <span className="font-heading font-bold tabular-nums">{formatCZK(stadium.pitchCare.heatingCost)}</span>
                      </div>
                    )}
                    {stadium.pitchCare.irrigationLevel > 0 && (
                      <div className="flex justify-between">
                        <span>💧 Zavlažování (výheň)</span>
                        <span className="font-heading font-bold tabular-nums">{formatCZK(stadium.pitchCare.irrigationCost)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {([
                      { mode: "auto", label: "Automaticky" },
                      { mode: "manual", label: "Ručně" },
                      { mode: "off", label: "Nezapínat" },
                    ] as const).map((m) => (
                      <button
                        key={m.mode}
                        onClick={async () => {
                          setActing("care-mode");
                          try {
                            await apiFetch(`/api/teams/${teamId}/stadium/pitch-care-mode`, {
                              method: "POST",
                              body: JSON.stringify({ mode: m.mode }),
                            });
                            await refresh();
                          } catch (e) {
                            console.error("Nastavení režimu péče selhalo:", e);
                          } finally {
                            setActing(null);
                          }
                        }}
                        disabled={!!acting}
                        className={`py-1.5 px-4 rounded-soft text-sm font-heading font-bold transition-colors ${
                          stadium.pitchCare!.mode === m.mode
                            ? "bg-pitch-500 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {stadium.pitchCare.mode === "off" && (
                    <p className="text-sm text-amber-700 mb-3">
                      Péče je vypnutá. Ušetříš za provoz, ale trávník půjde dolů rychleji — a soutěž
                      si může neudržované hřiště vytknout.
                    </p>
                  )}

                  {stadium.pitchCare.mode === "manual" && (
                    <div className="flex items-center justify-between gap-3 py-2 border-t border-gray-50">
                      <div className="text-sm">
                        {stadium.pitchCare.careOrdered
                          ? "Na příští domácí zápas je péče objednaná."
                          : "Na příští domácí zápas není objednané nic."}
                      </div>
                      <button
                        onClick={async () => {
                          setActing("care-order");
                          try {
                            await apiFetch(`/api/teams/${teamId}/stadium/pitch-care-order`, {
                              method: stadium.pitchCare!.careOrdered ? "DELETE" : "POST",
                              body: JSON.stringify({ service: "care" }),
                            });
                            await refresh();
                          } catch (e) {
                            console.error("Objednávka péče selhala:", e);
                          } finally {
                            setActing(null);
                          }
                        }}
                        disabled={!!acting}
                        className="shrink-0 py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors"
                      >
                        {acting === "care-order" ? "..." : stadium.pitchCare.careOrdered ? "Zrušit" : "Objednat"}
                      </button>
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-between gap-3 py-2 border-t border-gray-50">
                <div className="min-w-0">
                  <div className="font-heading font-bold text-sm">❄️ Úklid sněhu</div>
                  <div className="text-xs text-muted">
                    Parta s lopatami na jeden zápas. Zabere i bez vyhřívání, ale rozbředlý podklad neřeší.
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setActing("snow");
                    try {
                      await apiFetch(`/api/teams/${teamId}/stadium/pitch-care-order`, {
                        method: stadium.pitchCare!.snowClearingOrdered ? "DELETE" : "POST",
                        body: JSON.stringify({ service: "snow_clearing" }),
                      });
                      await refresh();
                    } catch (e) {
                      console.error("Objednávka úklidu sněhu selhala:", e);
                    } finally {
                      setActing(null);
                    }
                  }}
                  disabled={!!acting}
                  className="shrink-0 py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors"
                >
                  {acting === "snow" ? "..." : stadium.pitchCare.snowClearingOrdered ? "Zrušit" : "Objednat"}
                </button>
              </div>
              <div className="text-xs text-muted mb-1">
                Cena úklidu {formatCZK(stadium.pitchCare.snowClearingCost)}, platí se až u zápasu.
              </div>
            </div>
          )}

          {stadium.pitchUpgrades.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <div className="text-xs text-muted font-heading uppercase mb-2">Upgrade povrchu</div>
              {stadium.pitchUpgrades.map((u) => {
                const canAfford = team.budget >= u.cost;
                return (
                  <div key={u.pitchType} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl shrink-0">{u.pitchType === "hybrid" ? "🌾" : "🟩"}</span>
                      <div>
                        <div className="font-heading font-bold text-sm">{u.label} <span className="text-muted">—</span> <span className="font-heading font-bold tabular-nums">{formatCZK(u.cost)}</span></div>
                        <div className="text-xs text-muted">{u.desc}</div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Upgrade na ${u.label}?`,
                          description: u.desc,
                          details: [{ label: "Cena", value: `-${formatCZK(u.cost)}`, color: "text-card-red" }],
                          confirmLabel: `Upgradovat za ${formatCZK(u.cost)}`,
                        });
                        if (!ok || !teamId) return;
                        setActing("pitch-up-" + u.pitchType);
                        await apiFetch(`/api/teams/${teamId}/stadium/upgrade-pitch`, {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ pitchType: u.pitchType }),
                        }).catch((e) => console.error("upgrade pitch failed:", e));
                        await refresh();
                        setActing(null);
                      }}
                      disabled={!canAfford || !!acting}
                      className={`shrink-0 py-1.5 px-4 rounded-soft text-sm font-heading font-bold transition-colors ${
                        canAfford ? "bg-gold-500 text-white hover:bg-gold-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {acting === "pitch-up-" + u.pitchType ? "..." : "Upgradovat"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ Facilities grid — cards ═══ */}
      <SectionLabel>Zázemí</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(stadium.facilities).map(([key, level]) => {
          const upgrade = stadium.upgrades.find((u) => u.facility === key);
          const canUpgrade = upgrade && !upgrade.locked && team.budget >= upgrade.cost;

          return (
            <div key={key} className="card p-4">
              {/* Header */}
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-2xl">{FACILITY_ICONS[key] ?? "📦"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-bold">{FACILITY_LABELS[key] ?? key}</div>
                  <div className="text-xs text-muted">{FACILITY_DESCRIPTIONS[key]?.[level] ?? LEVEL_LABELS[level]}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {[1, 2, 3].map((l) => (
                    <div key={l} className={`w-3 h-3 rounded-full ${l <= level ? "bg-pitch-400" : "bg-gray-200"}`} />
                  ))}
                </div>
              </div>

              {/* Upgrade info + action */}
              {upgrade && !upgrade.locked && (
                <div className="flex items-center justify-between gap-3 mt-1">
                  <div>
                    <div className="text-sm">
                      <span className="font-heading font-bold">Lv.{upgrade.nextLevel}</span>{" "}
                      <span className="text-muted">—</span>{" "}
                      <span className="font-heading font-bold tabular-nums">{formatCZK(upgrade.cost)}</span>
                    </div>
                    <div className="text-xs text-pitch-600">{upgrade.effect}</div>
                  </div>
                  <button
                    onClick={() => handleUpgrade(upgrade.facility, upgrade.label, upgrade.cost, upgrade.effect)}
                    disabled={!canUpgrade || !!acting}
                    className={`shrink-0 py-1.5 px-4 rounded-soft text-sm font-heading font-bold transition-colors ${
                      canUpgrade ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {acting === key ? "..." : "Koupit"}
                  </button>
                </div>
              )}
              {upgrade?.locked && (
                <LockDetail detail={upgrade.lockDetail} hint={upgrade.lockHint} fallback={upgrade.lockReason} />
              )}
              {!upgrade && level === 3 && (
                <div className="text-sm text-pitch-600 font-heading font-bold mt-2">Maximální úroveň</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
