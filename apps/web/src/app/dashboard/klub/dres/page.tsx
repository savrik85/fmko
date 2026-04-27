"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch, showError } from "@/lib/api";
import { Spinner, Card, CardHeader, CardBody, JerseyPreview, BadgePreview, ShortsPreview, SocksPreview, SectionLabel, Modal } from "@/components/ui";
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
  { key: "double_shield", label: "Dvojštít" },
  { key: "circle", label: "Kruh" },
  { key: "oval", label: "Ovál" },
  { key: "square", label: "Čtverec" },
  { key: "diamond", label: "Kosočtv." },
  { key: "hexagon", label: "Šestiúhel." },
  { key: "octagon", label: "Osmiúhel." },
  { key: "triangle", label: "Trojúhel." },
  { key: "star", label: "Hvězda" },
  { key: "pennant", label: "Praporek" },
  { key: "banner", label: "Korouhev" },
  { key: "chevron", label: "Diamant" },
  { key: "arch", label: "Oblouk" },
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
  badge: {
    pattern: BadgePattern | null;
    primary: string;
    secondary: string;
    customPrimary: string | null;
    customSecondary: string | null;
    customInitials: string | null;
    symbol: string | null;
  };
}

const BADGE_SYMBOLS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Žádný" },
  { value: "svg:crescent", label: "Půlměsíc (bílý)" },
  { value: "⚽", label: "Míč" },
  { value: "🍺", label: "Pivo" },
  { value: "🍻", label: "Přípitek" },
  { value: "🥃", label: "Panák" },
  { value: "🍷", label: "Víno" },
  { value: "🥂", label: "Šampus" },
  { value: "🍸", label: "Koktejl" },
  { value: "🦁", label: "Lev" },
  { value: "🦅", label: "Orel" },
  { value: "🐺", label: "Vlk" },
  { value: "🐻", label: "Medvěd" },
  { value: "🐗", label: "Kanec" },
  { value: "🦌", label: "Jelen" },
  { value: "🐴", label: "Kůň" },
  { value: "🐓", label: "Kohout" },
  { value: "🌲", label: "Strom" },
  { value: "🌾", label: "Obilí" },
  { value: "⚓", label: "Kotva" },
  { value: "⚔️", label: "Meče" },
  { value: "👑", label: "Koruna" },
  { value: "🏆", label: "Pohár" },
  { value: "⚡", label: "Blesk" },
  { value: "🔥", label: "Plamen" },
  { value: "⛰️", label: "Hora" },
  { value: "🏰", label: "Hrad" },
  { value: "🌟", label: "Hvězda" },
  { value: "☀️", label: "Slunce" },
  { value: "🚜", label: "Traktor" },
  { value: "🪓", label: "Sekera" },
];

function invertHex(hex: string): string {
  const c = hex.replace("#", "");
  const r = 255 - parseInt(c.substring(0, 2), 16);
  const g = 255 - parseInt(c.substring(2, 4), 16);
  const b = 255 - parseInt(c.substring(4, 6), 16);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function ShowcaseFrame({ label, sublabel, children, className = "", onZoom }: { label: string; sublabel?: string; children: React.ReactNode; className?: string; onZoom?: () => void }) {
  return (
    <div className={`flex flex-col items-center h-full ${className}`}>
      <div className="text-[11px] font-heading font-bold text-muted uppercase tracking-[0.18em] mb-3">{label}</div>
      <div
        className="relative w-full rounded-2xl p-6 sm:p-8 flex items-center justify-center shadow-inner flex-1"
        style={{
          background: "linear-gradient(180deg, #f7f5f0 0%, #e8e3d8 100%)",
          minHeight: 420,
        }}
      >
        <div style={{ filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.2))" }}>
          {children}
        </div>
        <div className="absolute bottom-3 left-8 right-8 h-2 rounded-full bg-black/10 blur-sm" />
        {onZoom && (
          <button
            type="button"
            onClick={onZoom}
            aria-label="Zvětšit"
            title="Prohlédnout v plné velikosti"
            className="absolute top-3 right-3 w-9 h-9 rounded-lg bg-white/80 hover:bg-white text-gray-700 flex items-center justify-center text-base shadow transition-colors"
          >
            {"\u{1F50D}"}
          </button>
        )}
      </div>
      {/* Sublabel vždy rezervuje výšku aby panely byly stejně vysoké napříč kolonami */}
      <div className="text-xs text-muted mt-2 text-center min-h-[18px]">{sublabel || " "}</div>
    </div>
  );
}

function JerseyFrontBack({ primary, secondary, pattern, sponsor, number, shortsColor, socksColor, badge }: {
  primary: string;
  secondary: string;
  pattern: JerseyPattern;
  sponsor: string | null;
  number?: number;
  shortsColor: string;
  socksColor: string;
  badge: { primary: string; secondary: string; pattern: BadgePattern; initials: string; symbol: string | null };
}) {
  // Sponsor box = plné bílé pozadí s tmavým textem — univerzálně čitelné
  // na jakékoliv barvě/vzoru dresu (stejně jako skutečné reklamy na dresech).
  const maxChars = Math.max(sponsor?.length ?? 6, 6);
  const sponsorFontSize = Math.min(10, 95 / maxChars);

  const JERSEY_SIZE = 140;
  const SHORTS_SIZE = 90;
  const SOCKS_SIZE = 85;

  return (
    <div className="flex items-start gap-4 sm:gap-6">
      {/* Čelní — kit: dres / trenýrky / štulpny */}
      <div className="flex flex-col items-center">
        <div className="relative">
          <JerseyPreview primary={primary} secondary={secondary} pattern={pattern} size={JERSEY_SIZE} />
          {/* Znak klubu na levé hrudi nositele (pravá strana obrázku) — menší */}
          <div className="absolute" style={{ top: "28%", right: "30%" }}>
            <BadgePreview primary={badge.primary} secondary={badge.secondary} pattern={badge.pattern}
              initials={badge.initials} symbol={badge.symbol} size={14} />
          </div>
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
                border: "0.5px solid rgba(0,0,0,0.15)",
              }}
            >
              {sponsor}
            </div>
          )}
        </div>
        <div style={{ marginTop: -8 }}>
          <ShortsPreview color={shortsColor} trim={secondary} size={SHORTS_SIZE} />
        </div>
        <div style={{ marginTop: -6 }}>
          <SocksPreview color={socksColor} trim={secondary} size={SOCKS_SIZE} />
        </div>
        <div className="text-[10px] font-heading font-bold text-muted uppercase tracking-wider mt-2">Čelní</div>
      </div>
      {/* Zadní */}
      <div className="flex flex-col items-center">
        <JerseyPreview primary={primary} secondary={secondary} pattern={pattern} size={JERSEY_SIZE} number={number ?? 10} />
        <div style={{ marginTop: -8 }}>
          <ShortsPreview color={shortsColor} trim={secondary} size={SHORTS_SIZE} />
        </div>
        <div style={{ marginTop: -6 }}>
          <SocksPreview color={socksColor} trim={secondary} size={SOCKS_SIZE} />
        </div>
        <div className="text-[10px] font-heading font-bold text-muted uppercase tracking-wider mt-2">Zadní</div>
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
  const [badgePrimary, setBadgePrimary] = useState("#2D5F2D");
  const [badgeSecondary, setBadgeSecondary] = useState("#FFFFFF");
  const [badgeInitials, setBadgeInitials] = useState("");
  const [badgeSymbol, setBadgeSymbol] = useState("");
  const [zoomedKit, setZoomedKit] = useState<"home" | "away" | null>(null);

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
        setBadgePrimary(data.badge.customPrimary || data.primaryColor || "#2D5F2D");
        setBadgeSecondary(data.badge.customSecondary || data.secondaryColor || "#FFFFFF");
        setBadgeInitials(data.badge.customInitials || "");
        setBadgeSymbol(data.badge.symbol || "");
        setLoading(false);
      })
      .catch((e) => { console.error("load club:", e); setLoading(false); });
  }, [teamId]);

  const autoInitials = useMemo(() => {
    if (!club) return "X";
    return club.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
  }, [club]);
  const effectiveInitials = badgeInitials.trim() || autoInitials;

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
          badgePrimary,
          badgeSecondary,
          badgeInitials: badgeInitials.trim() || null,
          badgeSymbol: badgeSymbol || null,
        }),
      });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (e) {
      console.error("save club:", e);
      showError("Uložení selhalo", (e as Error).message || "Zkus to prosím znovu.");
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

  const badgeForJersey = {
    primary: badgePrimary,
    secondary: badgeSecondary,
    pattern: badgePattern,
    initials: effectiveInitials,
    symbol: badgeSymbol || null,
  };
  const homeShowcase = (
    <ShowcaseFrame label="Domácí dres" onZoom={() => setZoomedKit("home")}>
      <JerseyFrontBack primary={homePrimary} secondary={homeSecondary} pattern={homePattern}
        sponsor={club.jersey.sponsor} shortsColor={homeShortsColor} socksColor={homeSocksColor}
        badge={badgeForJersey} />
    </ShowcaseFrame>
  );
  const homeEditor = (
    <Card>
      <CardHeader>
        <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
          <span>{"\u{1F3E0}"}</span> Domácí dres
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
  );
  const awayShowcase = (
    <ShowcaseFrame label="Hostující dres" onZoom={() => setZoomedKit("away")}>
      <JerseyFrontBack primary={awayPrimary} secondary={awaySecondary} pattern={awayPattern}
        sponsor={club.jersey.sponsor} shortsColor={awayShortsColor} socksColor={awaySocksColor}
        badge={badgeForJersey} />
    </ShowcaseFrame>
  );
  const awayEditor = (
    <Card>
      <CardHeader>
        <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
          <span>{"\u{2708}️"}</span> Hostující dres
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
  );
  const badgeShowcase = (
    <ShowcaseFrame label="Znak klubu" sublabel={club.name}>
      <BadgePreview primary={badgePrimary} secondary={badgeSecondary} pattern={badgePattern}
        initials={effectiveInitials} symbol={badgeSymbol || null} size={200} />
    </ShowcaseFrame>
  );
  const badgeEditor = (
    <Card>
      <CardHeader>
        <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
          <span>{"\u{1F6E1}️"}</span> Znak klubu
        </h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <ColorPicker label="Primární barva" value={badgePrimary} onChange={setBadgePrimary} />
        <ColorPicker label="Sekundární barva" value={badgeSecondary} onChange={setBadgeSecondary} />
        <div>
          <SectionLabel>Iniciály (nepovinné)</SectionLabel>
          <input
            type="text"
            value={badgeInitials}
            onChange={(e) => setBadgeInitials(e.target.value.slice(0, 5).toUpperCase())}
            placeholder={`Auto: ${autoInitials}`}
            maxLength={5}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono uppercase focus:border-pitch-500 focus:outline-none"
          />
          <div className="text-xs text-muted mt-1">Max 5 znaků. Prázdné = auto z názvu klubu.</div>
        </div>
        <div>
          <SectionLabel>Tvar</SectionLabel>
          <PatternPicker value={badgePattern} onChange={(v) => setBadgePattern(v as BadgePattern)}
            options={BADGE_PATTERNS} primary={badgePrimary} secondary={badgeSecondary} kind="badge" />
        </div>
        <div>
          <SectionLabel>Symbol uvnitř</SectionLabel>
          <div className="grid grid-cols-5 gap-1.5">
            {BADGE_SYMBOLS.map((opt) => {
              const active = badgeSymbol === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value || "none"}
                  onClick={() => setBadgeSymbol(opt.value)}
                  title={opt.label}
                  className={`aspect-square flex items-center justify-center text-xl rounded-lg border-2 transition-all ${
                    active ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  {opt.value === "svg:crescent" ? (
                    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
                      <circle cx="11" cy="11" r="8" fill="#1f2937" />
                      <circle cx="11" cy="11" r="6" fill="white" />
                      <circle cx="13.5" cy="11" r="5.5" fill="#1f2937" />
                    </svg>
                  ) : opt.value || <span className="text-xs text-muted">—</span>}
                </button>
              );
            })}
          </div>
        </div>
      </CardBody>
    </Card>
  );

  return (
    <div className="page-container">
      <div className="mb-5">
        <Link href="/dashboard/klub" className="text-sm text-muted hover:text-ink">← Zpět na Klub</Link>
        <h1 className="font-heading font-extrabold text-2xl text-ink mt-1">Dres a znak</h1>
        <p className="text-sm text-muted mt-0.5">Vlastní vzhled klubu — barvy, vzor dresu a znak.</p>
      </div>

      {/* ═══ Desktop: 2 řádky (náhledy nahoře stejně vysoké, editory dole) ═══ */}
      <div className="hidden md:block">
        <div className="grid grid-cols-3 gap-4 mb-4">
          {homeShowcase}
          {awayShowcase}
          {badgeShowcase}
        </div>
        <div className="grid grid-cols-3 gap-4 items-start">
          {homeEditor}
          {awayEditor}
          {badgeEditor}
        </div>
      </div>

      {/* ═══ Mobile: náhled + editor v páru ═══ */}
      <div className="md:hidden flex flex-col gap-4">
        {homeShowcase}
        {homeEditor}
        {awayShowcase}
        {awayEditor}
        {badgeShowcase}
        {badgeEditor}
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

      {/* ═══ Zoom modal — velký náhled dresu ═══ */}
      <Modal isOpen={zoomedKit !== null} onClose={() => setZoomedKit(null)} maxWidth="760px">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-extrabold text-xl text-ink">
              {zoomedKit === "home" ? "Domácí dres" : "Hostující dres"}
            </h2>
            <button type="button" onClick={() => setZoomedKit(null)} className="w-8 h-8 rounded-lg text-gray-400 hover:text-ink hover:bg-gray-100 text-xl">×</button>
          </div>
          <div className="flex items-center justify-center rounded-2xl p-4 sm:p-8 overflow-hidden"
            style={{ background: "linear-gradient(180deg, #f7f5f0 0%, #e8e3d8 100%)" }}>
            <div
              className="scale-95 sm:scale-[1.4] lg:scale-[1.7]"
              style={{ transformOrigin: "center", filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.2))", padding: "40px 20px" }}
            >
              {zoomedKit === "home" ? (
                <JerseyFrontBack primary={homePrimary} secondary={homeSecondary} pattern={homePattern}
                  sponsor={club.jersey.sponsor} shortsColor={homeShortsColor} socksColor={homeSocksColor}
                  badge={badgeForJersey} />
              ) : zoomedKit === "away" ? (
                <JerseyFrontBack primary={awayPrimary} secondary={awaySecondary} pattern={awayPattern}
                  sponsor={club.jersey.sponsor} shortsColor={awayShortsColor} socksColor={awaySocksColor}
                  badge={badgeForJersey} />
              ) : null}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
