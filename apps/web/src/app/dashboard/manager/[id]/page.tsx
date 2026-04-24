"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, type ManagerProfile, type Team } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { FaceAvatar } from "@/components/players/face-avatar";
import { SectionLabel, Spinner, BadgePreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

const BACKSTORY_LABELS: Record<string, string> = {
  byvaly_hrac: "Bývalý hráč",
  mistni_ucitel: "Místní učitel",
  pristehovalec: "Přistěhovalec",
  syn_trenera: "Syn předchozího trenéra",
  hospodsky: "Hospodský",
};

function attrColor(value: number): string {
  if (value >= 70) return "text-pitch-400 font-bold";
  if (value >= 50) return "text-pitch-600";
  if (value >= 30) return "text-ink";
  if (value >= 15) return "text-gold-600";
  return "text-card-red";
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

  useEffect(() => {
    if (!teamId) return;
    // Manager ID is the same as team ID for fetching (API uses team ID)
    Promise.all([
      apiFetch<ManagerProfile>(`/api/teams/${managerId}/manager`).catch((e) => { console.error("manager profile load:", e); return null; }),
      apiFetch<Team>(`/api/teams/${managerId}`).catch((e) => { console.error("manager team load:", e); return null; }),
      apiFetch<AchievementsPayload>(`/api/teams/${managerId}/achievements`).catch((e) => { console.error("achievements load:", e); return null; }),
      apiFetch<{ entries: Array<{ teamId: string; isHuman: boolean }> }>(`/api/hall-of-fame`).catch((e) => { console.error("hof load:", e); return null; }),
    ]).then(([mgr, t, ach, hof]) => {
      setManager(mgr);
      setTeam(t);
      setAchievements(ach);
      if (hof) {
        const humans = hof.entries.filter((e) => e.isHuman);
        const idx = humans.findIndex((e) => e.teamId === managerId);
        if (idx >= 0) setHofRank({ rank: idx + 1, total: humans.length });
      }
      setLoading(false);
    }).catch((e) => { console.error("manager page load:", e); setLoading(false); });
  }, [teamId, managerId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>;
  if (!manager || !team) return <div className="page-container">Trenér nenalezen.</div>;

  const color = team.primary_color || "#2D5F2D";

  return (
    <>
      {/* ═══ Manager header ═══ */}
      <div className="hero-gradient px-5 sm:px-8 py-6" style={{ backgroundColor: color }}>
        <div className="flex items-center gap-5 max-w-[1280px] mx-auto">
          {manager.avatar && Object.keys(manager.avatar).length > 2 ? (
            <FaceAvatar faceConfig={manager.avatar} size={80} className="shrink-0 bg-white/10 rounded-xl" />
          ) : (
            <div className="shrink-0 w-20 h-20 rounded-xl bg-white/10 flex items-center justify-center text-white font-heading font-bold text-3xl">
              {manager.name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-heading font-extrabold text-white text-xl sm:text-2xl leading-tight truncate">
              {manager.name}
            </h1>
            {manager.backstory && (
              <div className="text-white/70 text-sm mt-0.5">{BACKSTORY_LABELS[manager.backstory] ?? manager.backstory}</div>
            )}
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {manager.age && <span className="text-white/80 text-sm">{manager.age} let</span>}
              {manager.birthplace && (
                <>
                  <span className="text-white/40">&middot;</span>
                  <span className="text-white/80 text-sm">{manager.birthplace}</span>
                </>
              )}
              <span className="text-white/40">&middot;</span>
              <a href={`/dashboard/team/${team.id}`} className="text-white/90 text-sm hover:text-white underline decoration-white/30 transition-colors flex items-center gap-1.5">
                <BadgePreview primary={color} secondary={team.secondary_color || "#FFF"} pattern={(team.badge_pattern as BadgePattern) || "shield"}
                  initials={team.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={18} />
                {team.name}
              </a>
            </div>
          </div>

          {/* Message button for rival managers */}
          {managerId !== teamId && teamId && (team as any).user_id !== "ai" && (
            <button onClick={async () => {
              if (!teamId) return;
              try {
                const res = await apiFetch<{ conversationId: string }>(`/api/teams/${teamId}/conversation-with/${managerId}`, {
                  method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
                });
                if (res?.conversationId) router.push(`/dashboard/phone/${res.conversationId}`);
              } catch (e) {
                console.error("conversation-with:", e);
                alert((e as Error)?.message || "Nepodařilo se otevřít konverzaci");
              }
            }}
              className="bg-white/10 hover:bg-white/20 rounded-xl px-4 py-2 text-center transition-colors cursor-pointer shrink-0">
              <div className="text-xl leading-none">{"\u{1F4AC}"}</div>
              <div className="text-white/70 text-[10px] font-heading font-bold uppercase mt-1">Napsat</div>
            </button>
          )}
        </div>
      </div>

      <div className="page-container space-y-5">

        {/* ═══ Attributes + Bio ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5">

          {/* Attributes */}
          <div className="card p-4 sm:p-5">
            <SectionLabel>Trenérské atributy</SectionLabel>
            <div>
              <AttrRow label="Koučink" value={manager.coaching ?? 40} description="Schopnost zlepšovat hráče tréninkem" />
              <AttrRow label="Motivace" value={manager.motivation ?? 40} description="Vliv na morálku a nasazení hráčů" />
              <AttrRow label="Taktika" value={manager.tactics ?? 40} description="Schopnost připravit tým na soupeře" />
              <AttrRow label="Práce s mládeží" value={manager.youthDevelopment ?? 40} description="Rozvoj mladých hráčů" />
              <AttrRow label="Disciplína" value={manager.discipline ?? 40} description="Udržování pořádku v kabině" />
            </div>
          </div>

          {/* Info + Bio */}
          <div className="space-y-5">
            <div className="card p-4 sm:p-5">
              <SectionLabel>Informace</SectionLabel>
              <div className="space-y-3">
                <InfoRow label="Jméno" value={manager.name} />
                {manager.age && <InfoRow label="Věk" value={`${manager.age} let`} />}
                {manager.birthplace && <InfoRow label="Bydliště" value={manager.birthplace} />}
                {manager.backstory && <InfoRow label="Pozadí" value={BACKSTORY_LABELS[manager.backstory] ?? manager.backstory} />}
                <InfoRow label="Reputace" value={`${manager.reputation ?? 30}`} />
                {hofRank && (
                  <InfoRow label="Síň slávy" value={
                    <Link href="/dashboard/hall-of-fame" className="text-ink hover:text-pitch-500 transition-colors">
                      {hofRank.rank}. <span className="text-muted font-normal text-xs">z {hofRank.total}</span>
                    </Link>
                  } />
                )}
                <InfoRow label="Tým" value={
                  <a href={`/dashboard/team/${team.id}`} className="text-ink hover:underline flex items-center gap-1.5">
                    <BadgePreview primary={color} secondary={team.secondary_color || "#FFF"} pattern={(team.badge_pattern as BadgePattern) || "shield"}
                      initials={team.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={22} />
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

        {achievements && achievements.achievements.length > 0 && (
          <AchievementsSection data={achievements} />
        )}
      </div>
    </>
  );
}

interface AchievementItem {
  key: string;
  icon: string;
  title: string;
  desc: string;
  tier: "bronze" | "silver" | "gold";
  earnedAt: string | null;
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
  const pct = data.totalCount > 0 ? (data.earnedCount / data.totalCount) * 100 : 0;
  const byTier: Record<string, AchievementItem[]> = { gold: [], silver: [], bronze: [] };
  for (const a of data.achievements) byTier[a.tier]?.push(a);

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <SectionLabel>Úspěchy ({data.earnedCount}/{data.totalCount})</SectionLabel>
        <div className="flex-1 max-w-[240px] bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-300 to-amber-600 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {(["gold", "silver", "bronze"] as const).map((tier) => {
        const list = byTier[tier];
        if (!list || list.length === 0) return null;
        const tc = TIER_COLORS[tier];
        const earned = list.filter((a) => a.earnedAt);
        return (
          <div key={tier} className="mt-3">
            <div className="text-[10px] text-muted uppercase tracking-wide font-heading font-bold mb-1.5">{tc.label} ({earned.length}/{list.length})</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {list.map((a) => {
                const isEarned = !!a.earnedAt;
                return (
                  <div
                    key={a.key}
                    className={`rounded-lg p-2.5 flex items-start gap-2 ${isEarned ? "" : "opacity-40 grayscale"}`}
                    style={isEarned ? { borderLeft: `3px solid ${tc.border}`, background: tc.bg } : { background: "#f5f5f5" }}
                    title={a.desc}
                  >
                    <div className="text-xl shrink-0 leading-none">{a.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading font-bold text-xs truncate">{a.title}</div>
                      <div className="text-[10px] text-muted leading-snug line-clamp-2">{a.desc}</div>
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

/* ── Sub-components ── */

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-heading font-bold text-sm">{value}</span>
    </div>
  );
}

function AttrRow({ label, value, description }: { label: string; value: number; description: string }) {
  const barColor = value >= 70 ? "#22c55e" : value >= 50 ? "#6b7280" : value >= 30 ? "#d97706" : "#ef4444";
  return (
    <div className="py-3 border-b border-gray-50 last:border-b-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-heading font-bold">{label}</span>
        <span className={`text-sm font-heading font-bold tabular-nums ${attrColor(value)}`}>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-1">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: barColor }} />
      </div>
      <div className="text-[11px] text-muted">{description}</div>
    </div>
  );
}
