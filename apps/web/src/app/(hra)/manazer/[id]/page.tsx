"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, showError, type ManagerProfile, type Team } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { FaceAvatar } from "@/components/players/face-avatar";
import { SectionLabel, Spinner, BadgePreview, Tabs, useTabParam, type TabItem } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { EditManagerModal } from "@/components/manager/EditManagerModal";
import { CoachKabinaTab } from "@/components/manager/CoachKabinaTab";
import { CoachEducationTab } from "@/components/manager/CoachEducationTab";
import { RelationCard, RelationsOverview } from "@/components/relations/RelationSection";
import { isLightColor, bestTextOn } from "@/lib/team-color";
import { coachAttributeEffects, licenceCap, LICENCE_LEVELS } from "@okresni-masina/shared";
import { LicenceBadge } from "@/components/manager/LicenceBadge";

type CoachTab = "prehled" | "kabina" | "treneri" | "vzdelani" | "historie";
const TAB_KEYS: CoachTab[] = ["prehled", "kabina", "treneri", "vzdelani", "historie"];

const BACKSTORY_LABELS: Record<string, string> = {
  byvaly_hrac: "Bývalý hráč",
  mistni_ucitel: "Místní učitel",
  pristehovalec: "Přistěhovalec",
  syn_trenera: "Syn předchozího trenéra",
  hospodsky: "Hospodský",
};

function attrColor(value: number): string {
  if (value >= 70) return "text-pitch-600 font-bold";
  if (value >= 50) return "text-emerald-600 font-bold";
  if (value >= 35) return "text-amber-600 font-bold";
  return "text-card-red font-bold";
}

function attrBarColor(value: number): string {
  if (value >= 70) return "#16a34a";
  if (value >= 50) return "#10b981";
  if (value >= 35) return "#f59e0b";
  return "#ef4444";
}

function shortLicence(level: number): string {
  const item = LICENCE_LEVELS.find((l) => l.level === level);
  return item ? item.short : "bez";
}

export default function ManagerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { teamId } = useTeam();
  const managerId = params.id as string;

  const [manager, setManager] = useState<ManagerProfile | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [achievements, setAchievements] = useState<AchievementsPayload | null>(null);
  const [hofRank, setHofRank] = useState<{ rank: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Vlastnik muze editovat jen svuj profil (managerId == jeho teamId) a jen u non-AI manazeru
  const canEdit = !!manager && manager.userId !== "ai" && teamId === managerId;
  const isOwn = !!teamId && teamId === managerId;
  const [attrHistory, setAttrHistory] = useState<AttrHistoryItem[]>([]);
  const [tabParam, setTab] = useTabParam(TAB_KEYS);
  // Kabina je jen na vlastním profilu — cizí odkaz s ?tab=kabina spadne na přehled.
  const tab: CoachTab = tabParam === "kabina" && !isOwn ? "prehled" : tabParam;

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<ManagerProfile>(`/api/teams/${managerId}/manager`).catch((e) => { console.error("manager profile load:", e); return null; }),
      apiFetch<Team>(`/api/teams/${managerId}`).catch((e) => { console.error("manager team load:", e); return null; }),
      apiFetch<AchievementsPayload>(`/api/teams/${managerId}/achievements`).catch((e) => { console.error("achievements load:", e); return null; }),
      apiFetch<{ entries: Array<{ teamId: string; isHuman: boolean }> }>(`/api/hall-of-fame`).catch((e) => { console.error("hof load:", e); return null; }),
      apiFetch<{ items: AttrHistoryItem[] }>(`/api/teams/${managerId}/manager/history?limit=25`).catch((e) => { console.error("manager history load:", e); return null; }),
    ]).then(([mgr, t, ach, hof, hist]) => {
      setManager(mgr);
      setTeam(t);
      setAchievements(ach);
      setAttrHistory(hist?.items ?? []);
      if (hof) {
        const humans = hof.entries.filter((e) => e.isHuman);
        const idx = humans.findIndex((e) => e.teamId === managerId);
        if (idx >= 0) setHofRank({ rank: idx + 1, total: humans.length });
      }
      setLoading(false);
    }).catch((e) => { console.error("manager page load:", e); setLoading(false); });
  }, [teamId, managerId]);

  if (loading) return <div className="min-h-dvh flex items-center justify-center"><Spinner size="lg" /></div>;
  if (!manager || !team) return <div className="page-container">Trenér nenalezen.</div>;

  const color = team.primary_color || "#2D5F2D";
  const isDarkText = bestTextOn(color) === "dark";
  const txt = isDarkText ? "text-gray-900" : "text-white";
  const txtMuted = isDarkText ? "text-gray-800" : "text-white/80";
  const txtSoft = isDarkText ? "text-gray-600" : "text-white/50";
  const boxBg = isDarkText ? "bg-black/10 text-gray-900" : "bg-white/15 text-white";
  const boxBgHover = isDarkText ? "hover:bg-black/15" : "hover:bg-white/25";
  const boxLabel = isDarkText ? "text-gray-700 font-semibold" : "text-white/70";

  return (
    <>
      {/* ═══ Manager header — konzistentní se zbytkem aplikace (Hráč/Tým) ═══ */}
      <div className="hero-gradient px-3 sm:px-8 py-4 sm:py-5" style={{ backgroundColor: color }}>
        <div className="max-w-[1280px] mx-auto">
          
          {/* ─── Desktop ─── */}
          <div className="hidden sm:flex items-center gap-4">
            {manager.avatar && Object.keys(manager.avatar).length > 2 ? (
              <FaceAvatar faceConfig={manager.avatar} size={72} className={`shrink-0 ${boxBg} rounded-xl`} />
            ) : (
              <div className={`shrink-0 w-[72px] h-[72px] rounded-xl ${boxBg} flex items-center justify-center ${txt} font-heading font-bold text-2xl`}>
                {manager.name[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className={`font-heading font-extrabold ${txt} text-2xl leading-tight truncate`}>
                {manager.name}
              </h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {manager.backstory && (
                  <span className={`${txtMuted} text-sm font-heading font-semibold`}>
                    {BACKSTORY_LABELS[manager.backstory] ?? manager.backstory}
                  </span>
                )}
                <LicenceBadge level={manager.licenceLevel ?? 0} showNone />
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {manager.age && <span className={`${txtMuted} text-sm`}>{manager.age} let</span>}
                {manager.birthplace && (
                  <>
                    <span className={txtSoft}>&middot;</span>
                    <span className={`${txtMuted} text-sm`}>{manager.birthplace}</span>
                  </>
                )}
                <span className={txtSoft}>&middot;</span>
                <a href={`/tym/${team.id}`} className={`${txtMuted} text-sm hover:opacity-80 underline transition-colors flex items-center gap-1.5`}>
                  <BadgePreview primary={color} secondary={team.secondary_color || "#FFF"} pattern={(team.badge_pattern as BadgePattern) || "shield"}
                    initials={team.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={18} />
                  {team.name}
                </a>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div className={`${boxBg} rounded-xl py-2.5 text-center min-w-[64px]`}>
                <div className={`font-heading font-extrabold text-xl tabular-nums leading-none ${txt}`}>
                  {manager.reputation ?? 30}
                </div>
                <div className={`${boxLabel} text-micro font-heading font-bold uppercase mt-0.5`}>Reputace</div>
              </div>

              <div className={`${boxBg} rounded-xl py-2.5 text-center min-w-[64px]`}>
                <div className={`font-heading font-extrabold text-xl leading-none ${txt}`}>
                  {shortLicence(manager.licenceLevel ?? 0)}
                </div>
                <div className={`${boxLabel} text-micro font-heading font-bold uppercase mt-0.5`}>Licence</div>
              </div>

              {canEdit && (
                <button onClick={() => setEditing(true)}
                  className={`${boxBg} ${boxBgHover} rounded-xl px-4 py-2 text-center transition-colors cursor-pointer shrink-0`}>
                  <div className="text-xl leading-none">✏️</div>
                  <div className={`${boxLabel} text-micro font-heading font-bold uppercase mt-1`}>Upravit</div>
                </button>
              )}

              {managerId !== teamId && teamId && (team as any).user_id !== "ai" && (
                <button onClick={async () => {
                  if (!teamId) return;
                  try {
                    const res = await apiFetch<{ conversationId: string }>(`/api/teams/${teamId}/conversation-with/${managerId}`, {
                      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
                    });
                    if (res?.conversationId) router.push(`/telefon/${res.conversationId}`);
                  } catch (e) {
                    console.error("conversation-with:", e);
                    showError("Nepodařilo se otevřít konverzaci", (e as Error)?.message || "Zkus to prosím znovu.");
                  }
                }}
                  className={`${boxBg} ${boxBgHover} rounded-xl px-4 py-2 text-center transition-colors cursor-pointer shrink-0`}>
                  <div className="text-xl leading-none">💬</div>
                  <div className={`${boxLabel} text-micro font-heading font-bold uppercase mt-1`}>Napsat</div>
                </button>
              )}
            </div>
          </div>

          {/* ─── Mobil ─── */}
          <div className="sm:hidden">
            {/* Řádek 1: avatar + jméno/licence + akční tlačítka */}
            <div className="flex items-center gap-3">
              {manager.avatar && Object.keys(manager.avatar).length > 2 ? (
                <FaceAvatar faceConfig={manager.avatar} size={56} className={`shrink-0 ${boxBg} rounded-xl`} />
              ) : (
                <div className={`shrink-0 w-14 h-14 rounded-xl ${boxBg} flex items-center justify-center ${txt} font-heading font-bold text-xl`}>
                  {manager.name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className={`font-heading font-extrabold ${txt} text-xl leading-tight truncate`}>
                  {manager.name}
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <LicenceBadge level={manager.licenceLevel ?? 0} showNone />
                </div>
              </div>
              {canEdit && (
                <button onClick={() => setEditing(true)}
                  className={`w-9 h-9 rounded-soft ${boxBg} ${boxBgHover} flex items-center justify-center ${txt} transition-colors text-base shrink-0`}
                  title="Upravit profil">
                  ✏️
                </button>
              )}
              {managerId !== teamId && teamId && (team as any).user_id !== "ai" && (
                <button onClick={async () => {
                  if (!teamId) return;
                  try {
                    const res = await apiFetch<{ conversationId: string }>(`/api/teams/${teamId}/conversation-with/${managerId}`, {
                      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
                    });
                    if (res?.conversationId) router.push(`/telefon/${res.conversationId}`);
                  } catch (e) {
                    showError("Nepodařilo se otevřít konverzaci", (e as Error)?.message || "Zkus to prosím znovu.");
                  }
                }}
                  className={`w-9 h-9 rounded-soft ${boxBg} ${boxBgHover} flex items-center justify-center ${txt} transition-colors text-base shrink-0`}
                  title="Napsat trenérovi">
                  💬
                </button>
              )}
            </div>

            {/* Řádek 2: pozadí, věk, bydliště, tým */}
            <div className="flex items-center gap-2 mt-2 flex-wrap text-sm">
              {manager.backstory && (
                <span className={`${txtMuted} font-heading font-semibold`}>
                  {BACKSTORY_LABELS[manager.backstory] ?? manager.backstory}
                </span>
              )}
              {manager.age && (
                <>
                  <span className={txtSoft}>&middot;</span>
                  <span className={`${txtMuted}`}>{manager.age} let</span>
                </>
              )}
              {manager.birthplace && (
                <>
                  <span className={txtSoft}>&middot;</span>
                  <span className={`${txtMuted}`}>{manager.birthplace}</span>
                </>
              )}
              <span className={txtSoft}>&middot;</span>
              <a href={`/tym/${team.id}`} className={`${txtMuted} hover:opacity-80 underline flex items-center gap-1.5`}>
                <BadgePreview primary={color} secondary={team.secondary_color || "#FFF"} pattern={(team.badge_pattern as BadgePattern) || "shield"}
                  initials={team.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={16} />
                <span className="truncate max-w-[170px]">{team.name}</span>
              </a>
            </div>

            {/* Řádek 3: Staty na celou šířku (stejné jako v detailu hráče) */}
            <div className="flex gap-1.5 mt-2">
              <div className={`flex-1 ${boxBg} rounded-soft py-1 text-center`}>
                <div className={`font-heading font-extrabold text-sm tabular-nums leading-none ${txt}`}>
                  {manager.reputation ?? 30}
                </div>
                <div className={`${boxLabel} text-micro font-heading font-bold uppercase mt-0.5`}>Reputace</div>
              </div>
              <div className={`flex-1 ${boxBg} rounded-soft py-1 text-center`}>
                <div className={`font-heading font-extrabold text-sm leading-none ${txt}`}>
                  {shortLicence(manager.licenceLevel ?? 0)}
                </div>
                <div className={`${boxLabel} text-micro font-heading font-bold uppercase mt-0.5`}>Licence</div>
              </div>
              <div className={`flex-1 ${boxBg} rounded-soft py-1 text-center`}>
                <div className={`font-heading font-extrabold text-sm tabular-nums leading-none ${txt}`}>
                  {achievements ? `${achievements.earnedCount}/${achievements.totalCount}` : "—"}
                </div>
                <div className={`${boxLabel} text-micro font-heading font-bold uppercase mt-0.5`}>Úspěchy</div>
              </div>
              {hofRank && (
                <div className={`flex-1 ${boxBg} rounded-soft py-1 text-center`}>
                  <div className={`font-heading font-extrabold text-sm tabular-nums leading-none ${txt}`}>
                    #{hofRank.rank}
                  </div>
                  <div className={`${boxLabel} text-micro font-heading font-bold uppercase mt-0.5`}>Síň slávy</div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Edit modal */}
      {editing && manager && teamId && (
        <EditManagerModal
          manager={manager}
          teamId={teamId}
          onClose={() => setEditing(false)}
          onSaved={(m) => setManager(m)}
        />
      )}

      {/* ═══ Main container with tabs ═══ */}
      <div className="page-container space-y-5">

        <Tabs
          items={[
            { key: "prehled", label: "Přehled" },
            ...(isOwn ? [{ key: "kabina" as const, label: "Kabina" }] : []),
            { key: "treneri", label: "Trenéři" },
            { key: "vzdelani", label: "Vzdělání" },
            { key: "historie", label: "Historie" },
          ] satisfies TabItem<CoachTab>[]}
          value={tab}
          onChange={setTab}
          ariaLabel="Profil trenéra"
        />

        {/* ═══ Přehled: vlastnosti, informace, bio ═══ */}
        {tab === "prehled" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">

            {/* Vlastnosti a jejich dopad — přehledný seznam ve standardním stylu aplikace */}
            <div className="card p-4 sm:p-5">
              <SectionLabel>Trenérské vlastnosti a co dělají</SectionLabel>
              <div className="divide-y divide-gray-50">
                {coachAttributeEffects({
                  coaching: manager.coaching ?? 40,
                  motivation: manager.motivation ?? 40,
                  tactics: manager.tactics ?? 40,
                  youthDevelopment: manager.youthDevelopment ?? 40,
                  discipline: manager.discipline ?? 40,
                  reputation: manager.reputation ?? 30,
                }).map((fx) => (
                  <AttrRow key={fx.key} label={fx.label} value={fx.value} lines={fx.lines}
                    max={fx.key === "reputation" ? 75 : 99}
                    cap={fx.key === "reputation" ? undefined : licenceCap(manager.licenceLevel ?? 0)} />
                ))}
              </div>
            </div>

            {/* Info + Bio */}
            <div className="space-y-5">
              <div className="card p-4 sm:p-5">
                <SectionLabel>Informace</SectionLabel>
                <div className="space-y-0">
                  <DetailRow label="Jméno" value={manager.name} />
                  {manager.age && <DetailRow label="Věk" value={`${manager.age} let`} />}
                  {manager.birthplace && <DetailRow label="Bydliště" value={manager.birthplace} />}
                  {manager.backstory && <DetailRow label="Pozadí" value={BACKSTORY_LABELS[manager.backstory] ?? manager.backstory} />}
                  <DetailRow label="Licence" value={<LicenceBadge level={manager.licenceLevel ?? 0} showNone />} />
                  <DetailRow label="Reputace" value={<span className="tabular-nums">{manager.reputation ?? 30} / 75</span>} />
                  {hofRank && (
                    <DetailRow label="Síň slávy" value={
                      <Link href="/sin-slavy" className="text-ink hover:text-pitch-500 transition-colors">
                        {hofRank.rank}. <span className="text-muted font-normal text-xs">z {hofRank.total}</span>
                      </Link>
                    } />
                  )}
                  <DetailRow label="Tým" value={
                    <a href={`/tym/${team.id}`} className="text-ink hover:underline flex items-center gap-1.5">
                      <BadgePreview primary={color} secondary={team.secondary_color || "#FFF"} pattern={(team.badge_pattern as BadgePattern) || "shield"}
                        initials={team.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={18} />
                      {team.name}
                    </a>
                  } />
                </div>
              </div>

              {manager.bio && (
                <div className="card p-4 sm:p-5">
                  <SectionLabel>Bio</SectionLabel>
                  <p className="text-sm text-ink-light leading-relaxed">{manager.bio}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ Kabina: vztah vlastních hráčů k trenérovi ═══ */}
        {tab === "kabina" && isOwn && teamId && <CoachKabinaTab teamId={teamId} />}

        {/* ═══ Trenéři — cizí profil: karta vztahu, vlastní: přehled ve skupinách ═══ */}
        {tab === "treneri" && teamId && !isOwn && (
          <RelationCard myTeamId={teamId} otherTeamId={managerId} otherManagerName={manager.name} />
        )}
        {tab === "treneri" && isOwn && teamId && <RelationsOverview teamId={teamId} />}

        {/* ═══ Vzdělání: licence a trenérská škola ═══ */}
        {tab === "vzdelani" && <CoachEducationTab teamId={managerId} isOwn={isOwn} />}

        {/* ═══ Historie: odkud se vzaly vlastnosti + úspěchy ═══ */}
        {tab === "historie" && attrHistory.length === 0 && !(achievements && achievements.achievements.length > 0) && (
          <div className="card p-4 text-sm text-muted">Zatím tu nic není.</div>
        )}
        {tab === "historie" && attrHistory.length > 0 && (
          <div className="card p-4 sm:p-5">
            <SectionLabel>Odkud se vzaly vlastnosti</SectionLabel>
            <div className="space-y-1">
              {attrHistory.map((h, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-b-0">
                  <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-heading font-bold text-sm tabular-nums ${
                    h.delta > 0 ? "bg-pitch-50 text-pitch-600"
                      : h.delta < 0 ? "bg-red-50 text-card-red"
                      : "bg-gray-50 text-muted"
                  }`}>
                    {h.delta > 0 ? "+" : ""}{h.delta}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-heading font-bold text-ink">{h.attrLabel}</div>
                    <div className="text-sm text-muted">{h.description}</div>
                    {h.delta === 0 && h.rawDelta !== 0 && (
                      <div className="text-sm text-muted">
                        Mělo být {h.rawDelta > 0 ? "+" : ""}{h.rawDelta}, ale atribut je na hranici.
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm text-muted tabular-nums">{formatShortDate(h.date)}</div>
                    <div className="text-sm font-heading font-bold text-ink tabular-nums">{h.newValue}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "historie" && achievements && achievements.achievements.length > 0 && (
          <AchievementsSection data={achievements} />
        )}
      </div>
    </>
  );
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "numeric" });
  } catch (e) {
    console.warn("format manager history date:", e);
    return "";
  }
}

interface AchievementItem {
  key: string;
  icon: string;
  title: string;
  desc: string;
  tier: "bronze" | "silver" | "gold";
  earnedAt: string | null;
}

interface AttrHistoryItem {
  attr: string;
  attrLabel: string;
  oldValue: number;
  newValue: number;
  delta: number;
  rawDelta: number;
  source: string;
  description: string;
  date: string;
}

interface AchievementsPayload {
  achievements: AchievementItem[];
  earnedCount: number;
  totalCount: number;
}

const TIER_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  bronze: { bg: "#8B451312", border: "#8B4513", text: "#8B4513", label: "Bronz" },
  silver: { bg: "#8B8B8B14", border: "#8B8B8B", text: "#595959", label: "Stříbro" },
  gold:   { bg: "#B8860B18", border: "#B8860B", text: "#8B6914", label: "Zlato" },
};

function AchievementsSection({ data }: { data: AchievementsPayload }) {
  const byTier: Record<string, AchievementItem[]> = { gold: [], silver: [], bronze: [] };
  for (const a of data.achievements) byTier[a.tier]?.push(a);

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <SectionLabel>Úspěchy ({data.earnedCount}/{data.totalCount})</SectionLabel>
      </div>
      {(["gold", "silver", "bronze"] as const).map((tier) => {
        const list = byTier[tier];
        if (!list || list.length === 0) return null;
        const tc = TIER_COLORS[tier];
        const earned = list.filter((a) => !!a.earnedAt);
        return (
          <div key={tier} className="mt-3">
            <div className="text-micro text-muted uppercase tracking-wide font-heading font-bold mb-1.5">{tc.label} ({earned.length}/{list.length})</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {list.map((a) => {
                const isEarned = !!a.earnedAt;
                return (
                  <div
                    key={a.key}
                    className={`rounded-soft p-2.5 flex items-start gap-2 ${isEarned ? "" : "opacity-40 grayscale"}`}
                    style={isEarned ? { borderLeft: `3px solid ${tc.border}`, background: tc.bg } : { background: "#f5f5f5" }}
                    title={a.desc}
                  >
                    <div className="text-xl shrink-0 leading-none">{a.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading font-bold text-xs truncate">{a.title}</div>
                      <div className="text-micro text-muted leading-snug line-clamp-2">{a.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-heading font-bold text-sm">{value}</span>
    </div>
  );
}

function AttrRow({ label, value, lines, max = 99, cap }: { label: string; value: number; lines: string[]; max?: number; cap?: number }) {
  const barColor = attrBarColor(value);
  const showCap = cap !== undefined && cap < max;
  const atCap = showCap && value >= cap;
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm sm:text-base font-heading font-bold text-ink">{label}</span>
        <div className="flex items-center gap-1.5">
          {atCap && (
            <span className="text-micro font-heading font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              strop licence
            </span>
          )}
          <span className={`text-base sm:text-lg font-heading font-extrabold tabular-nums ${attrColor(value)}`}>
            {value}
          </span>
          <span className="text-xs text-muted font-normal">/{max}</span>
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden mb-1.5">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: barColor }} />
        {showCap && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-ink/60" style={{ left: `${(cap / max) * 100}%` }}
            title={`Strop licence: ${cap}`} />
        )}
      </div>
      <ul className="space-y-0.5">
        {lines.map((l) => (
          <li key={l} className="text-xs sm:text-sm text-ink-light leading-snug flex items-start gap-1.5">
            <span className="text-pitch-500 font-bold leading-none mt-1 text-micro">•</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
