"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, Card, CardHeader, CardBody, BadgePreview, JerseyPreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";

interface ClubData {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  badgePattern: BadgePattern | null;
  jerseyPattern: string | null;
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
  };
  jersey: {
    pattern: string | null;
    homePrimary: string;
    homeSecondary: string;
    awayPrimary: string | null;
    awaySecondary: string | null;
    awayPattern: string | null;
    sponsor: string | null;
  };
  badge: { pattern: BadgePattern | null; primary: string; secondary: string; customInitials: string | null; symbol: string | null };
  anthem: { url: string | null; lyrics: string | null; title: string | null; style: string | null; attemptsUsed: number; attemptsMax: number; generating: boolean };
  mascot: { name: string | null; imageUrl: string | null; story: string | null };
}

function SectionCard({ title, icon, hint, children }: { title: string; icon: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex items-center gap-3">
        <span className="text-2xl leading-none" aria-hidden>{icon}</span>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading font-bold text-base text-ink leading-tight">{title}</h2>
          {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
        </div>
      </CardHeader>
      <CardBody className="flex-1 flex flex-col">{children}</CardBody>
    </Card>
  );
}

function EmptyState({ children, action, href }: { children: React.ReactNode; action: string; href?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
      <div className="text-sm text-muted mb-3 max-w-[260px]">{children}</div>
      {href ? (
        <Link
          href={href}
          className="px-4 py-2 rounded-lg text-sm font-heading font-bold text-white bg-pitch-500 hover:bg-pitch-600 transition-colors"
        >
          {action}
        </Link>
      ) : (
        <button
          type="button"
          disabled
          title="Brzy — připravujeme v dalších krocích"
          className="px-4 py-2 rounded-lg text-sm font-heading font-bold text-gray-400 bg-gray-100 cursor-not-allowed"
        >
          {action}
        </button>
      )}
    </div>
  );
}

export default function KlubPage() {
  const { teamId } = useTeam();
  const [club, setClub] = useState<ClubData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<ClubData>(`/api/teams/${teamId}/club`)
      .then((data) => { setClub(data); setLoading(false); })
      .catch((e) => { console.error("load club:", e); setLoading(false); });
  }, [teamId]);

  if (loading) {
    return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;
  }
  if (!club) {
    return <div className="page-container">Klub nenalezen.</div>;
  }

  const autoInitials = club.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
  const initials = club.badge.customInitials || autoInitials;
  const badgePattern = (club.badge.pattern as BadgePattern) ?? "shield";

  return (
    <>
      <div className="page-container">
        <div className="mb-4">
          <h1 className="font-heading font-extrabold text-2xl text-ink">Klubová identita</h1>
          <p className="text-sm text-muted mt-1">
            Tady postupně vyladíš tvář klubu — od dresu přes znak až po hymnu a maskota. Sekce se postupně oživují.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SectionCard title="Identita" icon={"\u{1F3F7}️"} hint="Motto, přezdívka, založení, příběh">
            <div className="text-sm text-ink/80 mb-3 space-y-1">
              {club.identity.nickname && <div className="font-bold">{"\u{1F4E3}"} {club.identity.nickname}</div>}
              {club.identity.motto && <div className="italic text-muted">&ldquo;{club.identity.motto}&rdquo;</div>}
              {club.identity.foundingYear && (
                <div className="text-xs text-muted">Založeno {club.identity.foundingYear}</div>
              )}
              {club.identity.foundingStory && (
                <div className="text-xs text-ink/70 mt-2 line-clamp-3">{club.identity.foundingStory}</div>
              )}
              {club.identity.colorsMeaning && (
                <div className="text-xs text-ink/70 mt-1">{"\u{1F3A8}"} {club.identity.colorsMeaning}</div>
              )}
            </div>
            <EmptyState action={club.identity.nickname || club.identity.motto ? "Upravit identitu" : "Vyplnit identitu"} href="/dashboard/klub/identita">
              Klubové motto, přezdívky fanoušků, rok založení a příběh jak klub vznikl.
            </EmptyState>
          </SectionCard>

          <SectionCard title="Stadion" icon={"\u{1F3DF}️"} hint="Kapacita, přezdívka, tribuny">
            <div className="text-sm text-ink/80 mb-3 space-y-1">
              <div className="font-bold">
                {club.stadium.name || "Bez názvu"}
                {club.stadium.nickname && <span className="text-muted font-normal"> — &ldquo;{club.stadium.nickname}&rdquo;</span>}
              </div>
              <div className="text-muted text-xs flex flex-wrap gap-x-3">
                {club.stadium.capacity != null && <span>Kapacita: <span className="tabular-nums text-ink/70">{club.stadium.capacity.toLocaleString("cs")}</span></span>}
                {club.stadium.builtYear != null && <span>Postaveno: <span className="text-ink/70">{club.stadium.builtYear}</span></span>}
              </div>
              {(club.stadium.tribunaNorth || club.stadium.tribunaSouth) && (
                <div className="text-muted text-xs">
                  Tribuny: <span className="text-ink/70">{[club.stadium.tribunaNorth, club.stadium.tribunaSouth].filter(Boolean).join(" · ")}</span>
                </div>
              )}
              {club.stadium.specialita && (
                <div className="text-muted text-xs">U nás: <span className="text-ink/70">{club.stadium.specialita}</span></div>
              )}
            </div>
            <EmptyState action={club.stadium.name ? "Upravit stadion" : "Doplnit stadion"} href="/dashboard/klub/stadion">
              Přezdívka stadionu, rok výstavby, názvy tribun a vesnická specialita.
            </EmptyState>
          </SectionCard>

          <SectionCard title="Dres a znak" icon={"\u{1F455}"} hint="Domácí, hostující, vzor a barvy">
            <div className="flex items-center justify-center gap-5 mb-3">
              <BadgePreview
                primary={club.badge.primary}
                secondary={club.badge.secondary || "#FFFFFF"}
                pattern={badgePattern}
                initials={initials}
                symbol={club.badge.symbol}
                size={72}
              />
              <div className="flex flex-col items-center gap-1">
                <JerseyPreview
                  primary={club.jersey.homePrimary}
                  secondary={club.jersey.homeSecondary || "#FFFFFF"}
                  pattern={club.jersey.pattern || "solid"}
                  size={64}
                />
                <span className="text-[10px] font-heading font-bold text-muted uppercase tracking-wider">Domácí</span>
              </div>
              {club.jersey.awayPrimary && (
                <div className="flex flex-col items-center gap-1">
                  <JerseyPreview
                    primary={club.jersey.awayPrimary}
                    secondary={club.jersey.awaySecondary || "#FFFFFF"}
                    pattern={club.jersey.awayPattern || "solid"}
                    size={64}
                  />
                  <span className="text-[10px] font-heading font-bold text-muted uppercase tracking-wider">Hostující</span>
                </div>
              )}
            </div>
            {club.jersey.sponsor && (
              <div className="text-center text-xs text-muted mb-2">Sponzor: <span className="font-bold text-ink">{club.jersey.sponsor}</span></div>
            )}
            <EmptyState action="Upravit dres" href="/dashboard/klub/dres">
              Vlastní vzor dresu (pruhy, šachovnice, gradient), hostující barvy a fake sponzor.
            </EmptyState>
          </SectionCard>

          <SectionCard title="Hymna a maskot" icon={"\u{1F3B5}"} hint="AI hymna a maskot klubu">
            <div className="text-sm text-muted mb-3">
              <div className="flex items-center gap-3 mb-2">
                {club.mascot.imageUrl && (
                  <img src={club.mascot.imageUrl} alt={club.mascot.name || "Maskot"} className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                )}
                <div className="flex-1 min-w-0">
                  <div>Maskot: {club.mascot.name ? (
                    <span className="text-ink font-bold">{club.mascot.name}</span>
                  ) : <span className="text-ink/70">neurčený</span>}
                  </div>
                  <div>Hymna: {club.anthem.url ? (
                    <span className="text-ink font-bold">{club.anthem.title || "Hotová"}</span>
                  ) : <span className="text-ink/70">žádná</span>}
                  </div>
                </div>
              </div>
              {club.anthem.url && (
                <audio controls src={club.anthem.url} className="w-full mt-2" />
              )}
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard/klub/hymna" className="flex-1 px-3 py-2 rounded-lg text-xs font-heading font-bold text-center text-white bg-pitch-500 hover:bg-pitch-600 transition-colors">
                {"\u{1F3B5}"} Hymna
              </Link>
              <Link href="/dashboard/klub/maskot" className="flex-1 px-3 py-2 rounded-lg text-xs font-heading font-bold text-center text-white bg-pitch-500 hover:bg-pitch-600 transition-colors">
                {"\u{1F9F8}"} Maskot
              </Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
