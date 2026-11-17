"use client";

import { useState, useEffect, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, showError, type ManagerProfile, type Team } from "@/lib/api";
import { useTeam } from "@/context/team-context";
import { FaceAvatar } from "@/components/players/face-avatar";
import { SectionLabel, Spinner, BadgePreview, Tabs, useTabParam, ListCard, ListRow, ListEmpty, RowGroup, RowValue, DeltaMark, type TabItem } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import { HeroBackdrop } from "@/components/ui/hero-backdrop";
import { EditManagerModal } from "@/components/manager/EditManagerModal";
import { CoachKabinaTab } from "@/components/manager/CoachKabinaTab";
import { CoachEducationTab } from "@/components/manager/CoachEducationTab";
import { FamilyCard, RelationCard, RelationsOverview } from "@/components/relations/RelationSection";
import { readableOnLight } from "@/lib/team-color";
import { HERO_BUTTON, HeroActions, HeroStat, HeroStats, heroTone } from "@/components/ui/hero-kit";
import { coachAttributeEffects, coachTags, licenceCap, LICENCE_LEVELS } from "@okresni-masina/shared";
import { LicenceBadge } from "@/components/manager/LicenceBadge";
import { CoachName } from "@/components/manager/coach-name";

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
      apiFetch<{ entries: Array<{ teamId: string }> }>(`/api/hall-of-fame`).catch((e) => { console.error("hof load:", e); return null; }),
      apiFetch<{ items: AttrHistoryItem[] }>(`/api/teams/${managerId}/manager/history?limit=25`).catch((e) => { console.error("manager history load:", e); return null; }),
    ]).then(([mgr, t, ach, hof, hist]) => {
      setManager(mgr);
      setTeam(t);
      setAchievements(ach);
      setAttrHistory(hist?.items ?? []);
      if (hof) {
        // Síň slávy řadí všechny kluby včetně AI, pořadí je stejné jako na její stránce.
        const idx = hof.entries.findIndex((e) => e.teamId === managerId);
        if (idx >= 0) setHofRank({ rank: idx + 1, total: hof.entries.length });
      }
      setLoading(false);
    }).catch((e) => { console.error("manager page load:", e); setLoading(false); });
  }, [teamId, managerId]);

  if (loading) return <div className="min-h-dvh flex items-center justify-center"><Spinner size="lg" /></div>;
  if (!manager || !team) return <div className="page-container">Trenér nenalezen.</div>;

  // Jediný viditelný rozdíl AI klubu: odznak s robotem u jména trenéra.
  const isAiCoach = manager.coachIsAi === true;
  const displayName = <CoachName name={manager.name} isAi={isAiCoach} />;

  const color = team.primary_color || "#2D5F2D";
  const tone = heroTone(color);
  // Reputace stojí na plné destičce; na ní se píše barvou klubu.
  const plateText = tone.light ? "#FFFFFF" : readableOnLight(color);
  const statNumber = "font-heading font-extrabold text-lg sm:text-3xl tabular-nums leading-none";
  const hasFace = !!manager.avatar && Object.keys(manager.avatar).length > 2;
  const canWrite = managerId !== teamId && !!teamId && (team as any).user_id !== "ai";

  const openConversation = async () => {
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
  };

  // Věk, bydliště a klub: jednou, vykreslí se na mobilu i na desktopu.
  const metaLine = (
    <>
      {manager.age && <span className={`${tone.muted} text-sm`}>{manager.age} let</span>}
      {manager.birthplace && (
        <>
          <span className={tone.soft}>&middot;</span>
          {manager.birthplaceVillageId
            ? <Link href={`/obec/${manager.birthplaceVillageId}`} className={`${tone.muted} text-sm underline decoration-current/30 hover:decoration-current`}>{manager.birthplace}</Link>
            : <span className={`${tone.muted} text-sm`}>{manager.birthplace}</span>}
        </>
      )}
      <span className={tone.soft}>&middot;</span>
      <a href={`/tym/${team.id}`} className={`${tone.muted} text-sm hover:opacity-80 underline decoration-current/30 transition-colors flex items-center gap-1.5`}>
        <BadgePreview primary={color} secondary={team.secondary_color || "#FFF"} pattern={(team.badge_pattern as BadgePattern) || "shield"}
          initials={team.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase()} size={18} />
        {team.name}
      </a>
    </>
  );

  return (
    <>
      {/* ═══ Manager header — konzistentní se zbytkem aplikace (Hráč/Tým) ═══ */}
      <div className="hero-gradient hero-detail px-3 sm:px-8 py-3 sm:py-5" style={{ backgroundColor: color }}>
        <HeroBackdrop primary={color} secondary={team.secondary_color} pattern={team.badge_pattern ?? null} />
        <div className="max-w-[1280px] mx-auto">
          {/* Jedno rozložení pro mobil i desktop, stejné jako u hráče a týmu. */}
          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-2 sm:gap-y-3">
            <div className="shrink-0">
              {hasFace ? (
                <>
                  <FaceAvatar faceConfig={manager.avatar} size={46} className={`sm:hidden ${tone.panel} rounded-xl`} />
                  <FaceAvatar faceConfig={manager.avatar} size={80} className={`hidden sm:block ${tone.panel} rounded-xl`} />
                </>
              ) : (
                <div className={`w-[46px] h-14 sm:w-20 sm:h-24 rounded-xl ${tone.panel} flex items-center justify-center ${tone.text} font-heading font-bold text-xl sm:text-3xl`}>
                  {manager.name[0]}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className={`font-heading font-extrabold ${tone.text} text-lg sm:text-3xl leading-tight`}>
                {displayName}
              </h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {manager.backstory && (
                  <span className={`${tone.muted} text-sm font-heading font-semibold hidden sm:inline`}>
                    {BACKSTORY_LABELS[manager.backstory] ?? manager.backstory}
                  </span>
                )}
                <LicenceBadge level={manager.licenceLevel ?? 0} showNone />
              </div>
              <div className="hidden sm:flex items-center gap-x-3 gap-y-1 mt-1 flex-wrap">{metaLine}</div>
            </div>
            {/* Na mobilu jsou akce ikonou vedle jména: samostatná řada by hlavičku zvedla o čtvrtinu. */}
            {canEdit && (
              <button onClick={() => setEditing(true)} aria-label="Upravit profil" title="Upravit profil"
                className={`sm:hidden w-8 h-8 rounded-control flex items-center justify-center shrink-0 transition-colors ${tone.nav}`}>
                ✏️
              </button>
            )}
            {canWrite && (
              <button onClick={openConversation} aria-label="Napsat trenérovi" title="Napsat trenérovi"
                className={`sm:hidden w-8 h-8 rounded-control flex items-center justify-center shrink-0 transition-colors ${tone.nav}`}>
                💬
              </button>
            )}
            <div className="sm:hidden w-full flex items-center gap-x-2 gap-y-1 flex-wrap">
              {manager.backstory && (
                <>
                  <span className={`${tone.muted} text-sm font-heading font-semibold`}>{BACKSTORY_LABELS[manager.backstory] ?? manager.backstory}</span>
                  <span className={tone.soft}>&middot;</span>
                </>
              )}
              {metaLine}
            </div>

            <HeroStats tone={tone}>
              <HeroStat tone={tone} label="Reputace">
                <span className={`min-w-[38px] sm:min-w-[54px] h-7 sm:h-11 px-1.5 sm:px-2 rounded-control flex items-center justify-center font-heading font-extrabold text-lg sm:text-3xl tabular-nums leading-none ${tone.plate}`}
                  style={{ color: plateText }}>
                  {manager.reputation ?? 30}
                </span>
              </HeroStat>
              <HeroStat tone={tone} label="Licence">
                <span className={statNumber}>{shortLicence(manager.licenceLevel ?? 0)}</span>
              </HeroStat>
              <HeroStat tone={tone} label="Úspěchy">
                <span className={statNumber}>{achievements ? `${achievements.earnedCount}/${achievements.totalCount}` : "-"}</span>
              </HeroStat>
              {hofRank && (
                <HeroStat tone={tone} label="Síň slávy" title={`${hofRank.rank}. z ${hofRank.total} trenérů`}>
                  <span className={statNumber}>{hofRank.rank}.</span>
                </HeroStat>
              )}
            </HeroStats>
          </div>

          {(canEdit || canWrite) && (
            <div className="hidden sm:block">
              <HeroActions tone={tone}>
                {canEdit && (
                  <button onClick={() => setEditing(true)} className={`${HERO_BUTTON} ${tone.button}`}>✏️ Upravit profil</button>
                )}
                {canWrite && (
                  <button onClick={openConversation} className={`${HERO_BUTTON} ${tone.button}`}>💬 Napsat trenérovi</button>
                )}
              </HeroActions>
            </div>
          )}

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
        {tab === "prehled" && (() => {
          // Štítky trenéra jako u hráčů: výrazné stránky z vlastností, popis = skutečný účinek.
          const tags = coachTags({
            coaching: manager.coaching ?? 40, motivation: manager.motivation ?? 40, tactics: manager.tactics ?? 40,
            youthDevelopment: manager.youthDevelopment ?? 40, discipline: manager.discipline ?? 40,
            reputation: manager.reputation ?? 30, licence: manager.licenceLevel ?? 0,
          });
          if (tags.length === 0) return null;
          const COLORS: Record<string, string> = {
            green: "bg-pitch-50 text-pitch-600 border-pitch-200",
            gold: "bg-amber-50 text-amber-700 border-amber-200",
            red: "bg-red-50 text-card-red border-red-200",
            blue: "bg-blue-50 text-blue-700 border-blue-200",
            purple: "bg-purple-50 text-purple-700 border-purple-200",
            muted: "bg-gray-50 text-muted border-gray-200",
          };
          return (
            <div className="flex flex-wrap gap-2 mb-4">
              {tags.map((t) => (
                <div key={t.key} title={t.description}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-heading font-bold ${COLORS[t.color] ?? COLORS.muted}`}>
                  <span>{t.emoji}</span>
                  <span>{t.label}</span>
                </div>
              ))}
            </div>
          );
        })()}
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
                  <DetailRow label="Jméno" value={displayName} />
                  {manager.age && <DetailRow label="Věk" value={`${manager.age} let`} />}
                  {manager.birthplace && <DetailRow label="Bydliště" value={manager.birthplaceVillageId
                    ? <Link href={`/obec/${manager.birthplaceVillageId}`} className="underline decoration-pitch-500/30 hover:text-pitch-600">{manager.birthplace}</Link>
                    : manager.birthplace} />}
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
        {tab === "treneri" && <FamilyCard teamId={managerId} />}
        {tab === "treneri" && teamId && !isOwn && (
          <RelationCard myTeamId={teamId} otherTeamId={managerId} otherManagerName={manager.name} />
        )}
        {tab === "treneri" && isOwn && teamId && <RelationsOverview teamId={teamId} />}

        {/* ═══ Vzdělání: licence a trenérská škola ═══ */}
        {tab === "vzdelani" && <CoachEducationTab teamId={managerId} isOwn={isOwn} />}

        {/* ═══ Historie: odkud se vzaly vlastnosti + úspěchy ═══ */}
        {tab === "historie" && attrHistory.length === 0 && !(achievements && achievements.achievements.length > 0) && (
          <ListCard><ListEmpty icon="📜">Zatím tu nic není. Vlastnosti se mění tréninkem, kurzy a zápasy.</ListEmpty></ListCard>
        )}
        {tab === "historie" && attrHistory.length > 0 && (
          <ListCard title="Odkud se vzaly vlastnosti">
            {attrHistory.map((h, i) => (
              <ListRow key={i}
                leading={<DeltaMark value={h.delta} />}
                title={h.attrLabel}
                detail={<>{h.description}{h.delta === 0 && h.rawDelta !== 0 && <> Mělo být {h.rawDelta > 0 ? "+" : ""}{h.rawDelta}, ale atribut je na hranici.</>}</>}
                trailing={<RowValue sub={formatShortDate(h.date)}>{h.newValue}</RowValue>} />
            ))}
          </ListCard>
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

const TIER_COLORS: Record<string, { border: string; text: string; label: string }> = {
  bronze: { border: "#8B4513", text: "#8B4513", label: "Bronz" },
  silver: { border: "#8B8B8B", text: "#595959", label: "Stříbro" },
  gold:   { border: "#B8860B", text: "#8B6914", label: "Zlato" },
};

function AchievementsSection({ data }: { data: AchievementsPayload }) {
  const byTier: Record<string, AchievementItem[]> = { gold: [], silver: [], bronze: [] };
  for (const a of data.achievements) byTier[a.tier]?.push(a);

  return (
    <ListCard title="Úspěchy" count={`${data.earnedCount}/${data.totalCount}`} className="overflow-hidden">
      {(["gold", "silver", "bronze"] as const).map((tier) => {
        const list = byTier[tier];
        if (!list || list.length === 0) return null;
        const tc = TIER_COLORS[tier];
        const earned = list.filter((a) => !!a.earnedAt);
        return (
          <Fragment key={tier}>
            <RowGroup label={<span style={{ color: tc.text }}>{tc.label}</span>} aside={`${earned.length}/${list.length}`} />
            {/* Po dvou vedle sebe jako dřív dlaždice: pod sebou by karta na telefonu narostla skoro o polovinu.
                Získaný úspěch má vlevo proužek barvy stupně, nezískaný je vybledlý. Popis je drobným
                písmem jako dřív, ať řádek na telefonu nenaroste. */}
            <div className="grid grid-cols-2 -mb-px [&>*]:border-b [&>*]:border-line-soft [&>*:nth-child(odd)]:border-r">
              {list.map((a) => {
                const isEarned = !!a.earnedAt;
                return (
                  <div key={a.key} title={a.desc}
                    className={isEarned ? "" : "opacity-40 grayscale"}
                    style={isEarned ? { boxShadow: `inset 3px 0 0 ${tc.border}` } : undefined}>
                    <ListRow dense
                      leading={<span className="text-lg leading-none" aria-hidden="true">{a.icon}</span>}
                      title={a.title}
                      detail={<span className="block text-micro text-muted">{a.desc}</span>} />
                  </div>
                );
              })}
            </div>
          </Fragment>
        );
      })}
    </ListCard>
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
