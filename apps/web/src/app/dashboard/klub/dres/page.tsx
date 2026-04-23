"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, Card, CardHeader, CardBody, JerseyPreview, BadgePreview, SectionLabel } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import type { JerseyPattern } from "@/lib/jersey-pattern-canvas";

const JerseyShowcase3D = dynamic(
  () => import("@/components/klub/JerseyShowcase3D").then((m) => m.JerseyShowcase3D),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-white/40 text-sm">
        <Spinner />
      </div>
    ),
  }
);

const JERSEY_PATTERNS: Array<{ key: JerseyPattern; label: string }> = [
  { key: "solid", label: "Solid" },
  { key: "stripes", label: "Pruhy" },
  { key: "hoops", label: "Vodorovné pruhy" },
  { key: "halves", label: "Půlky" },
  { key: "sash", label: "Šerpa" },
  { key: "sleeves", label: "Rukávy" },
  { key: "chest_band", label: "Hrudní pás" },
  { key: "pinstripes", label: "Tenké pruhy" },
  { key: "quarters", label: "Čtvrtky" },
  { key: "gradient", label: "Gradient" },
];

const BADGE_PATTERNS: Array<{ key: BadgePattern; label: string }> = [
  { key: "shield", label: "Štít" },
  { key: "rounded_shield", label: "Oblý štít" },
  { key: "crest", label: "Erb" },
  { key: "circle", label: "Kruh" },
  { key: "diamond", label: "Kosočtverec" },
  { key: "hexagon", label: "Šestiúhel." },
  { key: "pennant", label: "Praporek" },
  { key: "square", label: "Čtverec" },
];

interface ClubData {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  badgePattern: BadgePattern | null;
  jersey: {
    pattern: JerseyPattern | null;
    homePrimary: string;
    homeSecondary: string;
    awayPrimary: string | null;
    awaySecondary: string | null;
    awayPattern: JerseyPattern | null;
    sponsor: string | null;
  };
  badge: { pattern: BadgePattern | null; primary: string; secondary: string };
}

function invertHex(hex: string): string {
  const c = hex.replace("#", "");
  const r = 255 - parseInt(c.substring(0, 2), 16);
  const g = 255 - parseInt(c.substring(2, 4), 16);
  const b = 255 - parseInt(c.substring(4, 6), 16);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function ColorPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-12 h-12 rounded-lg cursor-pointer border-2 border-gray-200 shrink-0"
        aria-label={label}
      />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-heading font-bold text-muted uppercase tracking-wider">{label}</div>
        <div className="text-sm font-mono text-ink mt-0.5">{value.toUpperCase()}</div>
      </div>
    </label>
  );
}

function PatternPicker({ value, onChange, options, primary, secondary, kind }: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ key: string; label: string }>;
  primary: string;
  secondary: string;
  kind: "jersey" | "badge";
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            type="button"
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all ${
              active ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            {kind === "jersey" ? (
              <JerseyPreview primary={primary} secondary={secondary} pattern={opt.key} size={48} />
            ) : (
              <BadgePreview primary={primary} secondary={secondary} pattern={opt.key as BadgePattern} initials="X" size={48} />
            )}
            <span className={`text-[11px] font-medium leading-tight text-center ${active ? "text-pitch-700" : "text-muted"}`}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function DresPage() {
  const { teamId } = useTeam();
  const router = useRouter();
  const [club, setClub] = useState<ClubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Editovatelný state
  const [homePrimary, setHomePrimary] = useState("#2D5F2D");
  const [homeSecondary, setHomeSecondary] = useState("#FFFFFF");
  const [homePattern, setHomePattern] = useState<JerseyPattern>("solid");
  const [awayPrimary, setAwayPrimary] = useState("#FFFFFF");
  const [awaySecondary, setAwaySecondary] = useState("#2D5F2D");
  const [awayPattern, setAwayPattern] = useState<JerseyPattern>("solid");
  const [badgePattern, setBadgePattern] = useState<BadgePattern>("shield");

  useEffect(() => {
    if (!teamId) return;
    apiFetch<ClubData>(`/api/teams/${teamId}/club`)
      .then((data) => {
        setClub(data);
        setHomePrimary(data.primaryColor || "#2D5F2D");
        setHomeSecondary(data.secondaryColor || "#FFFFFF");
        setHomePattern((data.jersey.pattern as JerseyPattern) || "solid");
        setAwayPrimary(data.jersey.awayPrimary || invertHex(data.primaryColor || "#2D5F2D"));
        setAwaySecondary(data.jersey.awaySecondary || data.primaryColor || "#2D5F2D");
        setAwayPattern((data.jersey.awayPattern as JerseyPattern) || "solid");
        setBadgePattern((data.badge.pattern as BadgePattern) || "shield");
        setLoading(false);
      })
      .catch((e) => { console.error("load club:", e); setLoading(false); });
  }, [teamId]);

  const initials = useMemo(() => {
    if (!club) return "X";
    return club.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
  }, [club]);

  async function handleSave() {
    if (!teamId || saving) return;
    setSaving(true);
    try {
      await apiFetch(`/api/teams/${teamId}/club`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homePrimary,
          homeSecondary,
          homePattern,
          awayPrimary,
          awaySecondary,
          awayPattern,
          badgePattern,
        }),
      });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (e) {
      console.error("save club:", e);
      alert((e as Error).message || "Uložení selhalo");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;
  }
  if (!club) {
    return <div className="page-container">Klub nenalezen.</div>;
  }

  return (
    <div className="page-container">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/dashboard/klub" className="text-sm text-muted hover:text-ink">← Zpět na Klub</Link>
          <h1 className="font-heading font-extrabold text-2xl text-ink mt-1">Dres a znak</h1>
          <p className="text-sm text-muted mt-0.5">Vlastní vzhled klubu — barvy, vzor dresu, znak a sponzor.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* EDITOR — 2 columns out of 5 */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
                <span>{"\u{1F3E0}"}</span> Domácí dres
              </h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <ColorPicker label="Primární" value={homePrimary} onChange={setHomePrimary} />
              <ColorPicker label="Sekundární" value={homeSecondary} onChange={setHomeSecondary} />
              <div>
                <SectionLabel>Vzor</SectionLabel>
                <PatternPicker value={homePattern} onChange={(v) => setHomePattern(v as JerseyPattern)}
                  options={JERSEY_PATTERNS} primary={homePrimary} secondary={homeSecondary} kind="jersey" />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
                <span>{"\u{2708}️"}</span> Hostující dres
              </h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <ColorPicker label="Primární" value={awayPrimary} onChange={setAwayPrimary} />
              <ColorPicker label="Sekundární" value={awaySecondary} onChange={setAwaySecondary} />
              <div>
                <SectionLabel>Vzor</SectionLabel>
                <PatternPicker value={awayPattern} onChange={(v) => setAwayPattern(v as JerseyPattern)}
                  options={JERSEY_PATTERNS} primary={awayPrimary} secondary={awaySecondary} kind="jersey" />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
                <span>{"\u{1F6E1}️"}</span> Znak klubu
              </h2>
            </CardHeader>
            <CardBody>
              <PatternPicker value={badgePattern} onChange={(v) => setBadgePattern(v as BadgePattern)}
                options={BADGE_PATTERNS} primary={homePrimary} secondary={homeSecondary} kind="badge" />
              <div className="text-xs text-muted mt-2">Barvy znaku se přebírají z domácího dresu.</div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
                <span>{"\u{1F4B0}"}</span> Sponzor na dresu
              </h2>
            </CardHeader>
            <CardBody>
              {club.jersey.sponsor ? (
                <div className="text-sm text-ink">
                  Na dresu: <span className="font-bold">{club.jersey.sponsor}</span>
                </div>
              ) : (
                <div className="text-sm text-muted">Zatím žádný hlavní sponzor.</div>
              )}
              <div className="text-xs text-muted mt-2">
                Hlavní sponzor se spravuje v sekci{" "}
                <Link href="/dashboard/sponsors" className="text-pitch-600 underline hover:text-pitch-700">Sponzoři</Link>.
              </div>
            </CardBody>
          </Card>
        </div>

        {/* 3D PREVIEW — 3 columns out of 5, sticky on desktop */}
        <div className="lg:col-span-3">
          <div className="lg:sticky lg:top-4">
            <Card variant="dark" className="overflow-hidden">
              <div className="h-[60vh] lg:h-[75vh] min-h-[400px] relative">
                <JerseyShowcase3D
                  homePrimary={homePrimary}
                  homeSecondary={homeSecondary}
                  homePattern={homePattern}
                  awayPrimary={awayPrimary}
                  awaySecondary={awaySecondary}
                  awayPattern={awayPattern}
                  badgePattern={badgePattern}
                  initials={initials}
                  sponsor={club.jersey.sponsor}
                />
                <div className="absolute bottom-3 left-3 text-white/50 text-xs font-heading bg-black/40 px-2 py-1 rounded backdrop-blur-sm">
                  Táhni myší pro rotaci · Scroll pro zoom
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Save bar — fixed bottom */}
      <div className="mt-6 sticky bottom-0 bg-canvas/95 backdrop-blur-sm border-t border-gray-200 -mx-3 sm:-mx-8 px-3 sm:px-8 py-3 flex items-center justify-end gap-3">
        {savedAt && (
          <span className="text-sm text-pitch-600 font-bold">{"\u{2705}"} Uloženo</span>
        )}
        <button
          type="button"
          onClick={() => router.push("/dashboard/klub")}
          className="px-4 py-2 rounded-lg text-sm font-heading font-bold text-muted hover:text-ink"
        >
          Zrušit
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 rounded-lg text-sm font-heading font-bold text-white bg-pitch-500 hover:bg-pitch-600 disabled:opacity-50 transition-colors"
        >
          {saving ? "Ukládám..." : "Uložit"}
        </button>
      </div>
    </div>
  );
}
