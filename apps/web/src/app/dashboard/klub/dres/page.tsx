"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, Card, CardHeader, CardBody, JerseyPreview, BadgePreview, ShortsPreview, SocksPreview, SectionLabel } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

type JerseyPattern = "solid" | "stripes" | "hoops" | "halves" | "sash" | "sleeves" | "chest_band" | "pinstripes" | "quarters" | "gradient";

const JERSEY_PATTERNS: Array<{ key: JerseyPattern; label: string }> = [
  { key: "solid", label: "Solid" },
  { key: "stripes", label: "Pruhy" },
  { key: "hoops", label: "Vodorovné" },
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
    homeShortsColor: string | null;
    homeSocksColor: string | null;
    awayShortsColor: string | null;
    awaySocksColor: string | null;
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

function ShowcaseFrame({ label, sublabel, children }: { label: string; sublabel?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-[11px] font-heading font-bold text-muted uppercase tracking-[0.18em] mb-3">{label}</div>
      <div
        className="relative w-full rounded-2xl p-6 sm:p-8 flex items-center justify-center shadow-inner"
        style={{
          background: "linear-gradient(180deg, #f7f5f0 0%, #e8e3d8 100%)",
          minHeight: 260,
        }}
      >
        <div style={{ filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.2))" }}>
          {children}
        </div>
        {/* Podstavec — jemný stín na zem */}
        <div className="absolute bottom-3 left-8 right-8 h-2 rounded-full bg-black/10 blur-sm" />
      </div>
      {sublabel && <div className="text-xs text-muted mt-2 text-center">{sublabel}</div>}
    </div>
  );
}

function JerseyFrontBack({ primary, secondary, pattern, sponsor, number, shortsColor, socksColor }: {
  primary: string;
  secondary: string;
  pattern: JerseyPattern;
  sponsor: string | null;
  number?: number;
  shortsColor: string;
  socksColor: string;
}) {
  // Sponsor box = plné bílé pozadí s tmavým textem — univerzálně čitelné
  // na jakékoliv barvě/vzoru dresu (stejně jako skutečné reklamy na dresech).
  const maxChars = Math.max(sponsor?.length ?? 6, 6);
  const sponsorFontSize = Math.min(10, 95 / maxChars);

  return (
    <div className="flex items-start gap-4 sm:gap-6">
      {/* Čelní — dres + trenýrky + štulpny */}
      <div className="flex flex-col items-center gap-1">
        <div className="relative">
          <JerseyPreview primary={primary} secondary={secondary} pattern={pattern} size={130} />
          {sponsor && (
            <div
              className="absolute left-1/2 -translate-x-1/2 font-heading font-bold uppercase whitespace-nowrap"
              style={{
                top: "46%",
                fontSize: sponsorFontSize,
                color: "#1a1a1a",
                background: "#ffffff",
                padding: "2px 6px",
                borderRadius: 3,
                letterSpacing: "0.04em",
                maxWidth: 90,
                overflow: "hidden",
                textOverflow: "ellipsis",
                boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                border: "0.5px solid rgba(0,0,0,0.1)",
              }}
            >
              {sponsor}
            </div>
          )}
        </div>
        <ShortsPreview color={shortsColor} trim={secondary} size={70} />
        <SocksPreview color={socksColor} trim={secondary} size={60} />
        <div className="text-[10px] font-heading font-bold text-muted uppercase tracking-wider mt-1">Čelní</div>
      </div>
      {/* Zadní */}
      <div className="flex flex-col items-center gap-1">
        <JerseyPreview primary={primary} secondary={secondary} pattern={pattern} size={130} number={number ?? 10} />
        <ShortsPreview color={shortsColor} trim={secondary} size={70} />
        <SocksPreview color={socksColor} trim={secondary} size={60} />
        <div className="text-[10px] font-heading font-bold text-muted uppercase tracking-wider mt-1">Zadní</div>
      </div>
    </div>
  );
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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
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
              <JerseyPreview primary={primary} secondary={secondary} pattern={opt.key} size={44} />
            ) : (
              <BadgePreview primary={primary} secondary={secondary} pattern={opt.key as BadgePattern} initials="X" size={44} />
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

  const [homePrimary, setHomePrimary] = useState("#2D5F2D");
  const [homeSecondary, setHomeSecondary] = useState("#FFFFFF");
  const [homePattern, setHomePattern] = useState<JerseyPattern>("solid");
  const [awayPrimary, setAwayPrimary] = useState("#FFFFFF");
  const [awaySecondary, setAwaySecondary] = useState("#2D5F2D");
  const [awayPattern, setAwayPattern] = useState<JerseyPattern>("solid");
  const [badgePattern, setBadgePattern] = useState<BadgePattern>("shield");
  const [homeShortsColor, setHomeShortsColor] = useState("#2D5F2D");
  const [homeSocksColor, setHomeSocksColor] = useState("#2D5F2D");
  const [awayShortsColor, setAwayShortsColor] = useState("#FFFFFF");
  const [awaySocksColor, setAwaySocksColor] = useState("#FFFFFF");

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
        setHomeShortsColor(data.jersey.homeShortsColor || data.primaryColor || "#2D5F2D");
        setHomeSocksColor(data.jersey.homeSocksColor || data.primaryColor || "#2D5F2D");
        setAwayShortsColor(data.jersey.awayShortsColor || data.jersey.awayPrimary || invertHex(data.primaryColor || "#2D5F2D"));
        setAwaySocksColor(data.jersey.awaySocksColor || data.jersey.awayPrimary || invertHex(data.primaryColor || "#2D5F2D"));
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
          homeShortsColor,
          homeSocksColor,
          awayShortsColor,
          awaySocksColor,
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
      <div className="mb-5">
        <Link href="/dashboard/klub" className="text-sm text-muted hover:text-ink">← Zpět na Klub</Link>
        <h1 className="font-heading font-extrabold text-2xl text-ink mt-1">Dres a znak</h1>
        <p className="text-sm text-muted mt-0.5">Vlastní vzhled klubu — barvy, vzor dresu a znak.</p>
      </div>

      {/* ═══ 3 kolony — v každé náhled nad editorem (mobile stack, desktop 3 cols) ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Domácí */}
        <div className="flex flex-col gap-4">
          <ShowcaseFrame label="Domácí dres">
            <JerseyFrontBack primary={homePrimary} secondary={homeSecondary} pattern={homePattern}
              sponsor={club.jersey.sponsor} shortsColor={homeShortsColor} socksColor={homeSocksColor} />
          </ShowcaseFrame>
          <Card>
            <CardHeader>
              <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
                <span>{"\u{1F3E0}"}</span> Nastavení
              </h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <ColorPicker label="Dres primární" value={homePrimary} onChange={setHomePrimary} />
              <ColorPicker label="Dres sekundární" value={homeSecondary} onChange={setHomeSecondary} />
              <div>
                <SectionLabel>Vzor dresu</SectionLabel>
                <PatternPicker value={homePattern} onChange={(v) => setHomePattern(v as JerseyPattern)}
                  options={JERSEY_PATTERNS} primary={homePrimary} secondary={homeSecondary} kind="jersey" />
              </div>
              <ColorPicker label="Trenýrky" value={homeShortsColor} onChange={setHomeShortsColor} />
              <ColorPicker label="Štulpny" value={homeSocksColor} onChange={setHomeSocksColor} />
            </CardBody>
          </Card>
        </div>

        {/* Hostující */}
        <div className="flex flex-col gap-4">
          <ShowcaseFrame label="Hostující dres">
            <JerseyFrontBack primary={awayPrimary} secondary={awaySecondary} pattern={awayPattern}
              sponsor={club.jersey.sponsor} shortsColor={awayShortsColor} socksColor={awaySocksColor} />
          </ShowcaseFrame>
          <Card>
            <CardHeader>
              <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
                <span>{"\u{2708}️"}</span> Nastavení
              </h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <ColorPicker label="Dres primární" value={awayPrimary} onChange={setAwayPrimary} />
              <ColorPicker label="Dres sekundární" value={awaySecondary} onChange={setAwaySecondary} />
              <div>
                <SectionLabel>Vzor dresu</SectionLabel>
                <PatternPicker value={awayPattern} onChange={(v) => setAwayPattern(v as JerseyPattern)}
                  options={JERSEY_PATTERNS} primary={awayPrimary} secondary={awaySecondary} kind="jersey" />
              </div>
              <ColorPicker label="Trenýrky" value={awayShortsColor} onChange={setAwayShortsColor} />
              <ColorPicker label="Štulpny" value={awaySocksColor} onChange={setAwaySocksColor} />
            </CardBody>
          </Card>
        </div>

        {/* Znak */}
        <div className="flex flex-col gap-4">
          <ShowcaseFrame label="Znak klubu" sublabel={club.name}>
            <BadgePreview primary={homePrimary} secondary={homeSecondary} pattern={badgePattern} initials={initials} size={200} />
          </ShowcaseFrame>
          <Card>
            <CardHeader>
              <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
                <span>{"\u{1F6E1}️"}</span> Nastavení
              </h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              <div>
                <SectionLabel>Tvar</SectionLabel>
                <PatternPicker value={badgePattern} onChange={(v) => setBadgePattern(v as BadgePattern)}
                  options={BADGE_PATTERNS} primary={homePrimary} secondary={homeSecondary} kind="badge" />
              </div>
              <div className="text-xs text-muted">Barvy znaku se přebírají z domácího dresu.</div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ═══ Sponsor info — malý řádek pod editorem ═══ */}
      <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200 text-sm">
        <span className="font-bold text-ink">Sponzor na dresu: </span>
        {club.jersey.sponsor ? (
          <span className="text-ink/80">{club.jersey.sponsor}</span>
        ) : (
          <span className="text-muted">žádný aktivní</span>
        )}
        <span className="text-muted"> · spravuje se v sekci </span>
        <Link href="/dashboard/sponsors" className="text-pitch-600 underline hover:text-pitch-700">Sponzoři</Link>.
      </div>

      {/* ═══ Save bar ═══ */}
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
