import type { Metadata } from "next";
import Link from "next/link";
import { BadgePreview, JerseyPreview, ShortsPreview, SocksPreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { ShareButton } from "./ShareButton";

export const runtime = "edge";
export const revalidate = 60; // 1 min ISR-like cache

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

interface TeamBasic {
  id: string;
  name: string;
  village_name: string;
  district: string;
  region: string;
  primary_color: string;
  secondary_color: string;
  league_id?: string;
}

interface ManagerData {
  id?: string;
  name: string;
  backstory?: string;
  age: number;
  bio?: string;
  birthplace?: string;
  coaching?: number;
  motivation?: number;
  tactics?: number;
  youth_development?: number;
  discipline?: number;
  reputation?: number;
  avatar?: Record<string, unknown> | null;
}

interface ClubData {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  village: { name: string; district: string; region: string; population: number };
  identity: {
    nickname: string | null;
    motto: string | null;
    foundingYear: number | null;
    foundingStory: string | null;
    colorsMeaning: string | null;
  };
  stadium: {
    name: string | null;
    capacity: number | null;
    pitchCondition: number | null;
    pitchType: string | null;
    nickname: string | null;
    builtYear: number | null;
    specialita: string | null;
    tribunaNorth: string | null;
    tribunaSouth: string | null;
    namingSponsor: string | null;
  };
  jersey: {
    pattern: string | null;
    homePrimary: string;
    homeSecondary: string;
    awayPrimary: string | null;
    awaySecondary: string | null;
    awayPattern: string | null;
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
  anthem: {
    url: string | null;
    lyrics: string | null;
    title: string | null;
    style: string | null;
  };
  mascot: {
    name: string | null;
    imageUrl: string | null;
    story: string | null;
  };
}

interface StandingsData {
  leagueName: string;
  standings: Array<{ teamId: string | null; pos: number }>;
}

async function fetchSafe<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, { next: { revalidate: 60 } });
    if (!r.ok) return null;
    return r.json();
  } catch (e) {
    console.error("fetchSafe", path, e);
    return null;
  }
}

function isLight(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
}

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }): Promise<Metadata> {
  const { teamId } = await params;
  const club = await fetchSafe<ClubData>(`/api/teams/${teamId}/club`);
  if (!club) return { title: "Profil klubu — Prales FM" };
  const baseName = club.identity.nickname ? `${club.name} — ${club.identity.nickname}` : club.name;
  const desc = club.identity.motto
    || (club.identity.foundingStory ? club.identity.foundingStory.slice(0, 180) : null)
    || `${club.village.name}, okres ${club.village.district}`;
  return {
    title: `${baseName} | Prales FM`,
    description: desc,
    openGraph: {
      title: baseName,
      description: desc,
      type: "website",
      siteName: "Prales FM",
      locale: "cs_CZ",
    },
    twitter: { card: "summary_large_image", title: baseName, description: desc },
  };
}

export default async function KlubPublicPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const [team, club, manager, standings] = await Promise.all([
    fetchSafe<TeamBasic>(`/api/teams/${teamId}`),
    fetchSafe<ClubData>(`/api/teams/${teamId}/club`),
    fetchSafe<ManagerData>(`/api/teams/${teamId}/manager`),
    fetchSafe<StandingsData>(`/api/teams/${teamId}/standings`),
  ]);

  if (!club || !team) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0f170f] text-white">
        <div className="text-center">
          <h1 className="text-2xl font-heading font-bold mb-2">Klub nenalezen</h1>
          <p className="text-white/50 mb-6">Tento odkaz je neplatný nebo klub byl smazán.</p>
          <Link href="/" className="inline-block px-6 py-3 bg-pitch-500 text-white rounded-lg font-heading font-bold">Na hlavní stránku</Link>
        </div>
      </main>
    );
  }

  const primary = club.primaryColor || "#2D5F2D";
  const secondary = club.secondaryColor || "#FFFFFF";
  const light = isLight(primary);
  const txt = light ? "text-gray-900" : "text-white";
  const txtMuted = light ? "text-gray-600" : "text-white/70";
  const chipBg = light ? "bg-black/10 text-gray-900" : "bg-white/15 text-white";

  const autoIni = initials(club.name);
  const badgeIni = club.badge.customInitials || autoIni;
  const badgePattern = (club.badge.pattern as BadgePattern) || "shield";

  const myPos = standings?.standings?.find((s) => s.teamId === teamId)?.pos;

  const shareUrl = `${SITE_URL}/klub/${teamId}`;

  return (
    <main className="min-h-screen bg-canvas">
      {/* ═══ HERO ═══ */}
      <div
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${primary} 0%, ${primary} 50%, ${secondary}33 100%)`,
        }}
      >
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 py-10 sm:py-16">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 sm:gap-8">
            <div className="shrink-0" style={{ filter: "drop-shadow(0 10px 30px rgba(0,0,0,0.4))" }}>
              <BadgePreview
                primary={club.badge.primary}
                secondary={club.badge.secondary}
                pattern={badgePattern}
                initials={badgeIni}
                symbol={club.badge.symbol}
                size={140}
              />
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h1 className={`font-heading font-[900] ${txt} text-3xl sm:text-5xl leading-tight tracking-tight`}>
                {club.name}
              </h1>
              {club.identity.nickname && (
                <div className={`font-heading font-bold ${txt} text-lg sm:text-2xl mt-1 opacity-80`}>
                  {club.identity.nickname}
                </div>
              )}
              <div className={`${txtMuted} text-sm sm:text-base mt-2`}>
                {club.village.name} · {club.village.district}
              </div>
              {club.identity.motto && (
                <div className={`${txt} italic text-lg sm:text-2xl mt-4 opacity-90`}>
                  &ldquo;{club.identity.motto}&rdquo;
                </div>
              )}
              <div className="flex items-center gap-2 mt-5 flex-wrap justify-center sm:justify-start">
                {myPos && standings?.leagueName && (
                  <div className={`${chipBg} px-3 py-1.5 rounded-full text-xs font-heading font-bold`}>
                    {"\u{2B50}"} {myPos}. v {standings.leagueName}
                  </div>
                )}
                {club.identity.foundingYear && (
                  <div className={`${chipBg} px-3 py-1.5 rounded-full text-xs font-heading font-bold`}>
                    Založeno {club.identity.foundingYear}
                  </div>
                )}
                <ShareButton url={shareUrl} title={club.name} textClass={txt} bgClass={chipBg} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-5 sm:px-8 py-8 sm:py-12 space-y-6 sm:space-y-8">

        {/* ═══ KIT + STADION ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* KIT showcase */}
          <div className="rounded-3xl shadow-lg overflow-hidden" style={{ background: "linear-gradient(180deg, #f7f5f0 0%, #e8e3d8 100%)" }}>
            <div className="p-6 sm:p-8">
              <h2 className="text-[11px] font-heading font-bold text-muted uppercase tracking-[0.2em] mb-5 text-center">Klubové barvy</h2>
              <div className="flex items-end justify-center gap-4 sm:gap-8" style={{ filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.15))" }}>
                {/* Home */}
                <div className="flex flex-col items-center">
                  <JerseyPreview
                    primary={club.jersey.homePrimary}
                    secondary={club.jersey.homeSecondary}
                    pattern={club.jersey.pattern || "solid"}
                    size={110}
                  />
                  <div style={{ marginTop: -6 }}>
                    <ShortsPreview color={club.jersey.homeShortsColor || club.jersey.homePrimary} trim={club.jersey.homeSecondary} size={72} />
                  </div>
                  <div style={{ marginTop: -4 }}>
                    <SocksPreview color={club.jersey.homeSocksColor || club.jersey.homePrimary} trim={club.jersey.homeSecondary} size={70} />
                  </div>
                  <div className="text-[10px] font-heading font-bold text-muted uppercase tracking-wider mt-2">Domácí</div>
                </div>
                {/* Away */}
                {(club.jersey.awayPrimary || club.jersey.awaySecondary) && (
                  <div className="flex flex-col items-center">
                    <JerseyPreview
                      primary={club.jersey.awayPrimary || club.jersey.homePrimary}
                      secondary={club.jersey.awaySecondary || club.jersey.homeSecondary}
                      pattern={club.jersey.awayPattern || "solid"}
                      size={110}
                    />
                    <div style={{ marginTop: -6 }}>
                      <ShortsPreview color={club.jersey.awayShortsColor || club.jersey.awayPrimary || club.jersey.homePrimary} trim={club.jersey.awaySecondary || club.jersey.homeSecondary} size={72} />
                    </div>
                    <div style={{ marginTop: -4 }}>
                      <SocksPreview color={club.jersey.awaySocksColor || club.jersey.awayPrimary || club.jersey.homePrimary} trim={club.jersey.awaySecondary || club.jersey.homeSecondary} size={70} />
                    </div>
                    <div className="text-[10px] font-heading font-bold text-muted uppercase tracking-wider mt-2">Hostující</div>
                  </div>
                )}
              </div>
              {club.jersey.sponsor && (
                <div className="text-center text-xs text-muted mt-4">Sponzor: <span className="font-bold text-ink">{club.jersey.sponsor}</span></div>
              )}
            </div>
          </div>

          {/* Stadion */}
          <div className="card p-6 sm:p-8">
            <h2 className="text-[11px] font-heading font-bold text-muted uppercase tracking-[0.2em] mb-4">Stadion</h2>
            <div className="text-2xl sm:text-3xl font-heading font-[800] text-ink leading-tight">
              {club.stadium.name || "Bez názvu"}
            </div>
            {club.stadium.nickname && (
              <div className="italic text-muted text-base mt-1">&ldquo;{club.stadium.nickname}&rdquo;</div>
            )}
            <div className="grid grid-cols-2 gap-3 mt-5 text-sm">
              {club.stadium.capacity != null && (
                <div>
                  <div className="text-[10px] font-heading font-bold text-muted uppercase tracking-wider">Kapacita</div>
                  <div className="font-heading font-bold text-ink tabular-nums">{club.stadium.capacity.toLocaleString("cs")}</div>
                </div>
              )}
              {club.stadium.builtYear != null && (
                <div>
                  <div className="text-[10px] font-heading font-bold text-muted uppercase tracking-wider">Postaveno</div>
                  <div className="font-heading font-bold text-ink">{club.stadium.builtYear}</div>
                </div>
              )}
              {(club.stadium.tribunaNorth || club.stadium.tribunaSouth) && (
                <div className="col-span-2">
                  <div className="text-[10px] font-heading font-bold text-muted uppercase tracking-wider">Tribuny</div>
                  <div className="text-ink/80">{[club.stadium.tribunaNorth, club.stadium.tribunaSouth].filter(Boolean).join(" · ")}</div>
                </div>
              )}
              {club.stadium.specialita && (
                <div className="col-span-2">
                  <div className="text-[10px] font-heading font-bold text-muted uppercase tracking-wider">U nás ochutnáš</div>
                  <div className="text-ink/80">{club.stadium.specialita}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ HYMNA ═══ */}
        {club.anthem.url && (
          <div className="card p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{"\u{1F3B5}"}</span>
              <div>
                <h2 className="text-[11px] font-heading font-bold text-muted uppercase tracking-[0.2em]">Klubová hymna</h2>
                {club.anthem.title && <div className="font-heading font-bold text-ink text-lg">{club.anthem.title}</div>}
              </div>
            </div>
            <audio controls src={club.anthem.url} className="w-full">
              Váš prohlížeč nepodporuje audio.
            </audio>
            {club.anthem.lyrics && (
              <details className="mt-4">
                <summary className="text-sm text-muted cursor-pointer hover:text-ink">Text hymny</summary>
                <pre className="whitespace-pre-wrap text-sm text-ink font-mono bg-gray-50 rounded-lg p-4 mt-2 max-h-[400px] overflow-auto">{club.anthem.lyrics}</pre>
              </details>
            )}
          </div>
        )}

        {/* ═══ MASKOT + TRENÉR ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Maskot */}
          {club.mascot.imageUrl ? (
            <div className="card overflow-hidden">
              <div className="bg-gray-50 aspect-square">
                <img src={club.mascot.imageUrl} alt={club.mascot.name || "Maskot"} className="w-full h-full object-contain" />
              </div>
              <div className="p-6">
                <h2 className="text-[11px] font-heading font-bold text-muted uppercase tracking-[0.2em] mb-1">Maskot</h2>
                <div className="font-heading font-[800] text-ink text-2xl">{club.mascot.name || "Maskot klubu"}</div>
                {club.mascot.story && (
                  <p className="text-sm text-ink/80 mt-3 italic">&ldquo;{club.mascot.story}&rdquo;</p>
                )}
              </div>
            </div>
          ) : (
            <div className="card p-6 sm:p-8 flex items-center justify-center text-muted italic">
              Maskot zatím není
            </div>
          )}

          {/* Trenér */}
          {manager ? (
            <div className="card p-6 sm:p-8">
              <h2 className="text-[11px] font-heading font-bold text-muted uppercase tracking-[0.2em] mb-4">Trenér</h2>
              <div className="flex items-start gap-4">
                {manager.avatar && (
                  <div className="shrink-0">
                    <FaceAvatar faceConfig={manager.avatar} size={96} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-[800] text-ink text-xl sm:text-2xl">{manager.name}</div>
                  <div className="text-muted text-sm">
                    {manager.age} let{manager.birthplace ? ` · ${manager.birthplace}` : ""}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 text-xs">
                {[
                  { k: "coaching", l: "Koučink" },
                  { k: "motivation", l: "Motivace" },
                  { k: "tactics", l: "Taktika" },
                  { k: "youth_development", l: "Mládež" },
                  { k: "discipline", l: "Disciplína" },
                  { k: "reputation", l: "Reputace" },
                ].map(({ k, l }) => {
                  const v = (manager as unknown as Record<string, number | undefined>)[k];
                  if (v == null) return null;
                  return (
                    <div key={k} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg">
                      <span className="text-muted">{l}</span>
                      <span className="font-heading font-bold text-ink tabular-nums">{v}</span>
                    </div>
                  );
                })}
              </div>
              {manager.bio && (
                <p className="text-sm text-ink/80 mt-4 italic">&ldquo;{manager.bio}&rdquo;</p>
              )}
            </div>
          ) : (
            <div className="card p-6 flex items-center justify-center text-muted italic">Žádný trenér</div>
          )}
        </div>

        {/* ═══ PŘÍBĚH ═══ */}
        {(club.identity.foundingStory || club.identity.colorsMeaning) && (
          <div className="card p-6 sm:p-10">
            <h2 className="text-[11px] font-heading font-bold text-muted uppercase tracking-[0.2em] mb-5">Příběh klubu</h2>
            {club.identity.foundingStory && (
              <p className="text-ink text-base sm:text-lg leading-relaxed whitespace-pre-line mb-5">
                {club.identity.foundingStory}
              </p>
            )}
            {club.identity.colorsMeaning && (
              <div className="pt-5 border-t border-gray-100">
                <div className="text-[11px] font-heading font-bold text-muted uppercase tracking-[0.2em] mb-2">Význam barev</div>
                <p className="text-ink/80 text-base italic">{club.identity.colorsMeaning}</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted py-8">
          Hráno v <Link href="/" className="font-heading font-bold text-pitch-600 hover:text-pitch-700">Prales FM</Link>
          {" · "}
          <Link href={`/dashboard/team/${teamId}`} className="text-muted hover:text-ink">Otevřít v aplikaci</Link>
        </div>
      </div>
    </main>
  );
}
