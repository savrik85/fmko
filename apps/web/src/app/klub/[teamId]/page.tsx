import type { Metadata } from "next";
import Link from "next/link";
import { BadgePreview, JerseyPreview, ShortsPreview, SocksPreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { ShareButton } from "./ShareButton";
import { ManagerFace } from "./ManagerFace";
import { ClubScarf } from "@/components/team/club-scarf";

export const runtime = "edge";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

interface TeamBasic {
  id: string; name: string; village_name: string; district: string; region: string;
  primary_color: string; secondary_color: string; league_id?: string;
}
interface ManagerData {
  id?: string; name: string; backstory?: string; age: number; bio?: string; birthplace?: string;
  coaching?: number; motivation?: number; tactics?: number; youth_development?: number;
  discipline?: number; reputation?: number; avatar?: Record<string, unknown> | null;
}
interface ClubData {
  id: string; name: string; primaryColor: string; secondaryColor: string;
  village: { name: string; district: string; region: string; population: number };
  identity: { nickname: string | null; motto: string | null; foundingYear: number | null; foundingStory: string | null; colorsMeaning: string | null };
  stadium: { name: string | null; capacity: number | null; pitchCondition: number | null; pitchType: string | null; nickname: string | null; builtYear: number | null; specialita: string | null; tribunaNorth: string | null; tribunaSouth: string | null; namingSponsor: string | null };
  jersey: { pattern: string | null; homePrimary: string; homeSecondary: string; awayPrimary: string | null; awaySecondary: string | null; awayPattern: string | null; sponsor: string | null; homeShortsColor: string | null; homeSocksColor: string | null; awayShortsColor: string | null; awaySocksColor: string | null };
  badge: { pattern: BadgePattern | null; primary: string; secondary: string; customPrimary: string | null; customSecondary: string | null; customInitials: string | null; symbol: string | null };
  anthem: { url: string | null; lyrics: string | null; title: string | null; style: string | null };
  mascot: { name: string | null; imageUrl: string | null; story: string | null };
}
interface StandingsData { leagueName: string; standings: Array<{ teamId: string | null; pos: number }> }

async function fetchSafe<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  } catch (e) { console.error("fetchSafe", path, e); return null; }
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
    openGraph: { title: baseName, description: desc, type: "website", siteName: "Prales FM", locale: "cs_CZ" },
    twitter: { card: "summary_large_image", title: baseName, description: desc },
  };
}

const ATTR_LABELS: Record<string, string> = {
  coaching: "Koučink",
  motivation: "Motivace",
  tactics: "Taktika",
  youth_development: "Mládež",
  discipline: "Disciplína",
  reputation: "Reputace",
};

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
      <main className="min-h-screen flex items-center justify-center bg-[#0a0f0a] text-white">
        <div className="text-center max-w-md px-8">
          <div className="text-6xl mb-4">{"\u{1F937}"}</div>
          <h1 className="text-3xl font-heading font-[900] mb-2">Klub nenalezen</h1>
          <p className="text-white/50 mb-8">Tento odkaz je neplatný nebo klub byl smazán.</p>
          <Link href="/" className="inline-block px-8 py-3 bg-white text-black rounded-full font-heading font-bold hover:scale-105 transition-transform">Zpět na úvod</Link>
        </div>
      </main>
    );
  }

  const primary = club.primaryColor || "#2D5F2D";
  const secondary = club.secondaryColor || "#FFFFFF";
  const light = isLight(primary);
  const autoIni = initials(club.name);
  const badgeIni = club.badge.customInitials || autoIni;
  const badgePattern = (club.badge.pattern as BadgePattern) || "shield";
  const myPos = standings?.standings?.find((s) => s.teamId === teamId)?.pos;

  const shareUrl = `${SITE_URL}/klub/${teamId}`;

  // Hero palette
  const heroText = light ? "text-gray-900" : "text-white";
  const heroMuted = light ? "text-gray-800/70" : "text-white/80";
  const heroSoft = light ? "text-gray-800/50" : "text-white/50";
  const chipBg = light ? "bg-black/10" : "bg-white/10";
  const chipBorder = light ? "border-black/5" : "border-white/10";

  const presentAttrs = manager
    ? (["coaching", "motivation", "tactics", "youth_development", "discipline", "reputation"] as const)
        .map((k) => ({ key: k, value: (manager as unknown as Record<string, number | undefined>)[k] }))
        .filter((a) => a.value != null)
    : [];

  return (
    <main className="min-h-screen bg-[#0a0f0a] text-white">
      {/* ═══ HERO — full bleed, dramatic ═══ */}
      <section className="relative overflow-hidden">
        {/* Layered gradients */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 80% 60% at 20% 30%, ${secondary}22, transparent 60%),
              radial-gradient(ellipse 100% 80% at 80% 70%, ${primary}dd, ${primary} 70%),
              linear-gradient(180deg, ${primary} 0%, ${primary}ee 100%)
            `,
          }}
        />
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }} />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[#0a0f0a]" />

        <div className="relative max-w-[1200px] mx-auto px-5 sm:px-10 pt-16 sm:pt-24 pb-24 sm:pb-32">
          <div className="flex items-center justify-between mb-10 sm:mb-16">
            <div className={`text-[11px] sm:text-xs font-heading font-bold uppercase tracking-[0.3em] ${heroSoft}`}>
              Profil klubu · Prales FM
            </div>
            <ShareButton url={shareUrl} title={club.name} textClass={heroText} bgClass={`${chipBg} border ${chipBorder}`} />
          </div>

          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-8 sm:gap-12">
            <div className="shrink-0 relative">
              <div
                className="absolute inset-0 rounded-full blur-3xl opacity-40"
                style={{ background: secondary, transform: "scale(1.5)" }}
              />
              <div className="relative" style={{ filter: "drop-shadow(0 25px 50px rgba(0,0,0,0.5))" }}>
                <BadgePreview
                  primary={club.badge.primary}
                  secondary={club.badge.secondary}
                  pattern={badgePattern}
                  initials={badgeIni}
                  symbol={club.badge.symbol}
                  size={180}
                />
              </div>
            </div>

            <div className="flex-1 min-w-0 text-center sm:text-left">
              {club.identity.nickname && (
                <div className={`text-xs sm:text-sm font-heading font-bold uppercase tracking-[0.25em] ${heroSoft} mb-2`}>
                  {club.identity.nickname}
                </div>
              )}
              <h1 className={`font-heading font-[900] ${heroText} text-4xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tight`}>
                {club.name}
              </h1>
              <div className={`${heroMuted} text-base sm:text-lg mt-4 flex items-center justify-center sm:justify-start gap-2 flex-wrap`}>
                <span>{"\u{1F4CD}"}</span>
                <span>{club.village.name} · {club.village.district}</span>
              </div>
              {club.identity.motto && (
                <div className={`${heroText} italic text-xl sm:text-3xl mt-6 opacity-95 font-heading`}>
                  &ldquo;{club.identity.motto}&rdquo;
                </div>
              )}
            </div>
          </div>

          {/* Stat chips — pokud lichý počet, poslední col-span-2 na mobilu */}
          {(() => {
            const chips: Array<{ label: string; value: string; sub: string }> = [];
            if (myPos && standings?.leagueName) chips.push({ label: "Pozice", value: `${myPos}.`, sub: standings.leagueName });
            if (club.identity.foundingYear) chips.push({ label: "Založeno", value: String(club.identity.foundingYear), sub: `${new Date().getFullYear() - club.identity.foundingYear} let existence` });
            if (club.stadium.capacity) chips.push({ label: "Kapacita", value: club.stadium.capacity.toLocaleString("cs"), sub: club.stadium.name || "Stadion" });
            if (club.village.population) chips.push({ label: "Vesnice", value: club.village.population.toLocaleString("cs"), sub: "obyvatel" });
            if (chips.length === 0) return null;
            return (
              <div className="mt-10 sm:mt-16 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {chips.map((c, i) => {
                  const isLastOdd = chips.length % 2 === 1 && i === chips.length - 1;
                  return (
                    <div key={c.label} className={`${chipBg} border ${chipBorder} backdrop-blur-sm rounded-2xl px-5 py-4 ${isLastOdd ? "col-span-2 sm:col-span-1" : ""}`}>
                      <div className={`text-[10px] font-heading font-bold uppercase tracking-widest ${heroSoft} mb-1`}>{c.label}</div>
                      <div className={`${heroText} font-heading font-[900] text-2xl tabular-nums`}>{c.value}</div>
                      <div className={`${heroMuted} text-xs truncate`}>{c.sub}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </section>

      {/* ═══ Klubová vlajka (šála) ═══ */}
      <section className="relative py-10 sm:py-14">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-10">
          <div className="w-full sm:w-4/5 mx-auto">
            <ClubScarf
              primary={club.badge.primary}
              secondary={club.badge.secondary}
              pattern={badgePattern}
              initials={badgeIni}
              symbol={club.badge.symbol}
              className="h-24 sm:h-36 w-full"
            />
          </div>
        </div>
      </section>

      {/* ═══ KIT — centerpiece ═══ */}
      <section className="relative py-16 sm:py-24 overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-10">
          <div className="text-center mb-12">
            <div className="text-[11px] font-heading font-bold uppercase tracking-[0.3em] text-white/40 mb-3">Klubové barvy</div>
            <h2 className="font-heading font-[900] text-3xl sm:text-5xl">Dres & znak</h2>
          </div>

          <div className="relative rounded-[2.5rem] p-8 sm:p-16 overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${primary}15, transparent 50%, ${secondary}10), #13191c` }}>
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: `radial-gradient(circle at 20% 30%, ${primary}, transparent 40%), radial-gradient(circle at 80% 70%, ${secondary}, transparent 40%)`,
              }}
            />

            <div className="relative flex items-end justify-center gap-6 sm:gap-20 flex-wrap" style={{ filter: "drop-shadow(0 25px 40px rgba(0,0,0,0.5))" }}>
              {/* Home */}
              <div className="flex flex-col items-center">
                <div className="text-[10px] font-heading font-bold uppercase tracking-[0.25em] text-white/40 mb-4">Domácí</div>
                <div className="relative">
                  <JerseyPreview primary={club.jersey.homePrimary} secondary={club.jersey.homeSecondary} pattern={club.jersey.pattern || "solid"} size={160} />
                  <div className="absolute" style={{ top: "28%", right: "30%" }}>
                    <BadgePreview primary={club.badge.primary} secondary={club.badge.secondary} pattern={badgePattern} initials={badgeIni} symbol={club.badge.symbol} size={18} />
                  </div>
                </div>
                <div style={{ marginTop: -10 }}>
                  <ShortsPreview color={club.jersey.homeShortsColor || club.jersey.homePrimary} trim={club.jersey.homeSecondary} size={110} />
                </div>
                <div style={{ marginTop: -6 }}>
                  <SocksPreview color={club.jersey.homeSocksColor || club.jersey.homePrimary} trim={club.jersey.homeSecondary} size={100} />
                </div>
              </div>

              {/* Badge spotlight */}
              <div className="flex flex-col items-center self-center order-first sm:order-none">
                <div className="relative">
                  <div className="absolute inset-0 blur-2xl opacity-40" style={{ background: primary, transform: "scale(1.6)" }} />
                  <div className="relative" style={{ filter: "drop-shadow(0 15px 30px rgba(0,0,0,0.5))" }}>
                    <BadgePreview primary={club.badge.primary} secondary={club.badge.secondary} pattern={badgePattern} initials={badgeIni} symbol={club.badge.symbol} size={180} />
                  </div>
                </div>
                {club.jersey.sponsor && (
                  <div className="mt-6 bg-white text-black font-heading font-bold uppercase tracking-wider text-xs px-4 py-2 rounded shadow-lg">
                    {club.jersey.sponsor}
                  </div>
                )}
              </div>

              {/* Away */}
              {(club.jersey.awayPrimary || club.jersey.awaySecondary) && (
                <div className="flex flex-col items-center">
                  <div className="text-[10px] font-heading font-bold uppercase tracking-[0.25em] text-white/40 mb-4">Hostující</div>
                  <div className="relative">
                    <JerseyPreview primary={club.jersey.awayPrimary || club.jersey.homePrimary} secondary={club.jersey.awaySecondary || club.jersey.homeSecondary} pattern={club.jersey.awayPattern || "solid"} size={160} />
                    <div className="absolute" style={{ top: "28%", right: "30%" }}>
                      <BadgePreview primary={club.badge.primary} secondary={club.badge.secondary} pattern={badgePattern} initials={badgeIni} symbol={club.badge.symbol} size={18} />
                    </div>
                  </div>
                  <div style={{ marginTop: -10 }}>
                    <ShortsPreview color={club.jersey.awayShortsColor || club.jersey.awayPrimary || club.jersey.homePrimary} trim={club.jersey.awaySecondary || club.jersey.homeSecondary} size={110} />
                  </div>
                  <div style={{ marginTop: -6 }}>
                    <SocksPreview color={club.jersey.awaySocksColor || club.jersey.awayPrimary || club.jersey.homePrimary} trim={club.jersey.awaySecondary || club.jersey.homeSecondary} size={100} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ STADION ═══ */}
      <section className="py-16 sm:py-24">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-10 items-start">
            <div className="lg:col-span-2">
              <div className="text-[11px] font-heading font-bold uppercase tracking-[0.3em] text-white/40 mb-3">Domov klubu</div>
              <h2 className="font-heading font-[900] text-3xl sm:text-5xl leading-[1.05]">
                {club.stadium.name || "Bez názvu"}
              </h2>
              {club.stadium.nickname && (
                <div className="italic text-xl sm:text-2xl mt-3 text-white/60">&ldquo;{club.stadium.nickname}&rdquo;</div>
              )}
              {club.stadium.specialita && (
                <div className="mt-6 p-5 rounded-2xl border border-white/10 bg-white/5">
                  <div className="text-[10px] font-heading font-bold uppercase tracking-widest text-white/40 mb-2">{"\u{1F37A}"} U nás ochutnáš</div>
                  <div className="text-white/90 text-lg">{club.stadium.specialita}</div>
                </div>
              )}
            </div>

            <div className="lg:col-span-3 grid grid-cols-2 gap-3 sm:gap-4">
              {(() => {
                const cards: Array<{ label: string; value: string; big?: boolean }> = [];
                if (club.stadium.capacity != null) cards.push({ label: "Kapacita", value: club.stadium.capacity.toLocaleString("cs"), big: true });
                if (club.stadium.builtYear != null) cards.push({ label: "Postaveno", value: String(club.stadium.builtYear), big: true });
                if (club.stadium.tribunaNorth) cards.push({ label: "Severní tribuna", value: club.stadium.tribunaNorth });
                if (club.stadium.tribunaSouth) cards.push({ label: "Jižní tribuna", value: club.stadium.tribunaSouth });
                return cards.map((c, i) => {
                  const isLastOdd = cards.length % 2 === 1 && i === cards.length - 1;
                  return (
                    <div key={c.label} className={`p-5 sm:p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent ${isLastOdd ? "col-span-2" : ""}`}>
                      <div className="text-[10px] font-heading font-bold uppercase tracking-widest text-white/40 mb-2">{c.label}</div>
                      <div className={`${c.big ? "text-3xl sm:text-4xl font-[900] tabular-nums" : "text-lg sm:text-xl font-bold"} font-heading`}>{c.value}</div>
                    </div>
                  );
                });
              })()}
              {club.stadium.namingSponsor && (
                <div className="col-span-2 p-5 rounded-2xl border border-yellow-500/30 bg-yellow-500/5">
                  <div className="text-[10px] font-heading font-bold uppercase tracking-widest text-yellow-500/80 mb-1">Naming rights</div>
                  <div className="text-yellow-100 font-heading font-bold">{club.stadium.namingSponsor}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HYMNA ═══ */}
      {club.anthem.url && (
        <section className="py-16 sm:py-24 relative overflow-hidden">
          <div className="absolute inset-0 opacity-30" style={{
            background: `radial-gradient(ellipse at center, ${primary}40, transparent 70%)`,
          }} />
          <div className="relative max-w-[1000px] mx-auto px-5 sm:px-10">
            <div className="text-center mb-8">
              <div className="text-[11px] font-heading font-bold uppercase tracking-[0.3em] text-white/40 mb-3">Klubová hymna</div>
              <h2 className="font-heading font-[900] text-3xl sm:text-5xl">{club.anthem.title || "Hymna"}</h2>
            </div>
            <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent backdrop-blur p-6 sm:p-10">
              <audio controls src={club.anthem.url} className="w-full">
                Váš prohlížeč nepodporuje audio.
              </audio>
              {club.anthem.lyrics && (
                <details className="mt-6 group">
                  <summary className="cursor-pointer text-sm text-white/60 hover:text-white flex items-center gap-2 font-heading font-bold uppercase tracking-wider">
                    <span className="group-open:rotate-90 transition-transform">{"\u{25B6}"}</span>
                    Text hymny
                  </summary>
                  <pre className="whitespace-pre-wrap text-base text-white/80 font-heading leading-relaxed bg-black/30 rounded-2xl p-6 mt-4 max-h-[500px] overflow-auto">{club.anthem.lyrics}</pre>
                </details>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ═══ MASKOT ═══ */}
      {club.mascot.imageUrl && (
        <section className="py-16 sm:py-24">
          <div className="max-w-[1200px] mx-auto px-5 sm:px-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
              <div className="order-2 lg:order-1">
                <div className="text-[11px] font-heading font-bold uppercase tracking-[0.3em] text-white/40 mb-3">Maskot</div>
                <h2 className="font-heading font-[900] text-4xl sm:text-6xl leading-[1.05]">
                  {club.mascot.name || "Náš maskot"}
                </h2>
                {club.mascot.story && (
                  <p className="text-lg sm:text-xl text-white/80 mt-6 italic leading-relaxed">&ldquo;{club.mascot.story}&rdquo;</p>
                )}
              </div>
              <div className="order-1 lg:order-2 relative">
                <div className="absolute inset-0 blur-3xl opacity-30" style={{ background: primary, transform: "scale(1.2)" }} />
                <div className="relative rounded-3xl overflow-hidden aspect-square bg-gradient-to-br from-white/5 to-white/0 border border-white/10">
                  <img src={club.mascot.imageUrl} alt={club.mascot.name || "Maskot"} className="w-full h-full object-contain" />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══ TRENÉR ═══ */}
      {manager && (
        <section className="py-16 sm:py-24">
          <div className="max-w-[1200px] mx-auto px-5 sm:px-10">
            <div className="rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-8 sm:p-12">
              <div className="flex flex-col sm:flex-row gap-8 sm:gap-12 items-center sm:items-start">
                <div className="shrink-0 relative">
                  <div className="absolute inset-0 blur-2xl opacity-30" style={{ background: primary, transform: "scale(1.3)" }} />
                  <div className="relative rounded-3xl overflow-hidden border-2 border-white/20 bg-white/5" style={{ width: 160, height: 192 }}>
                    {manager.avatar ? (
                      <ManagerFace faceConfig={manager.avatar} size={160} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-6xl text-white/30">{"\u{1F464}"}</div>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <div className="text-[11px] font-heading font-bold uppercase tracking-[0.3em] text-white/40 mb-2">Trenér</div>
                  <h2 className="font-heading font-[900] text-3xl sm:text-5xl">{manager.name}</h2>
                  <div className="text-white/60 text-base sm:text-lg mt-2">
                    {manager.age} let{manager.birthplace ? ` · ${manager.birthplace}` : ""}
                  </div>
                  {manager.bio && (
                    <p className="text-white/80 text-base sm:text-lg mt-5 italic leading-relaxed max-w-2xl">&ldquo;{manager.bio}&rdquo;</p>
                  )}

                  {presentAttrs.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-8 max-w-2xl">
                      {presentAttrs.map(({ key, value }, i) => {
                        const isLastOdd = presentAttrs.length % 2 === 1 && i === presentAttrs.length - 1;
                        return (
                          <div key={key} className={`bg-white/5 rounded-xl px-4 py-3 border border-white/5 ${isLastOdd ? "col-span-2 sm:col-span-1" : ""}`}>
                            <div className="text-[10px] font-heading font-bold uppercase tracking-widest text-white/40">{ATTR_LABELS[key]}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value as number))}%`, background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
                              </div>
                              <span className="text-lg font-heading font-[800] tabular-nums">{value}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══ PŘÍBĚH KLUBU ═══ */}
      {(club.identity.foundingStory || club.identity.colorsMeaning) && (
        <section className="py-16 sm:py-24">
          <div className="max-w-[900px] mx-auto px-5 sm:px-10">
            <div className="text-[11px] font-heading font-bold uppercase tracking-[0.3em] text-white/40 mb-3 text-center">Příběh klubu</div>
            <h2 className="font-heading font-[900] text-3xl sm:text-5xl mb-10 text-center">Jak to začalo</h2>
            {club.identity.foundingStory && (
              <p className="text-lg sm:text-xl leading-relaxed whitespace-pre-line text-white/85">
                {club.identity.foundingStory}
              </p>
            )}
            {club.identity.colorsMeaning && (
              <div className="mt-10 pt-10 border-t border-white/10">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex gap-1">
                    <div className="w-8 h-8 rounded-full shadow-lg" style={{ background: primary }} />
                    <div className="w-8 h-8 rounded-full shadow-lg" style={{ background: secondary }} />
                  </div>
                  <div className="text-[11px] font-heading font-bold uppercase tracking-[0.3em] text-white/40">Význam barev</div>
                </div>
                <p className="text-white/85 text-lg italic leading-relaxed">{club.identity.colorsMeaning}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-12 border-t border-white/5">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/40">
          <div>
            Hráno v <Link href="/" className="font-heading font-bold text-white hover:text-white/80">Prales FM</Link>
          </div>
          <Link href={`/dashboard/team/${teamId}`} className="hover:text-white/80">
            Otevřít v aplikaci {"\u{2192}"}
          </Link>
        </div>
      </footer>
    </main>
  );
}
