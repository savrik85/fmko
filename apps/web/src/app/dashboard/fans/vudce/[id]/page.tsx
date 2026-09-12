"use client";

/**
 * Profil vůdce fanouškovské party.
 *
 * Vzor je profil rozhodčího (`dashboard/rozhodci/[id]`) — stejná struktura karty,
 * os a slovních hodnocení, aby lidi ve hře vypadali jako jeden systém.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { axisWord } from "@/lib/referee-info";
import { sentimentWord } from "@/lib/fan-info";
import type { FanGroupView, FanLeaderView } from "../../FanGroupsPanel";

interface Detail {
  leader: FanLeaderView;
  group: FanGroupView | null;
  team: { id: string; name: string } | null;
}

/** Osy vůdce. Popisky říkají, co s tím manažer nadělá — číslo samo nic neřekne. */
const LEADER_AXES = [
  {
    key: "charisma", label: "Charisma", dobreVysoke: true,
    popis: "Jak moc táhne partu za sebou. Když je spokojený, je spokojená i ona — a naopak.",
  },
  {
    key: "radikalnost", label: "Radikálnost", dobreVysoke: false,
    popis: "Jak daleko je ochotný zajít. Vysoká znamená, že z drobnosti bývá průšvih.",
  },
  {
    key: "vyjednavani", label: "Ochota jednat", dobreVysoke: true,
    popis: "Jestli se s ním dá domluvit u stolu. Nízká znamená, že schůzka může skončit hůř, než začala.",
  },
] as const;

/**
 * Barva pruhu podle toho, jestli je vysoká hodnota pro klub dobrá.
 *
 * `axisColor` z profilu rozhodčího tu použít nejde — ta barví vysoké červeně vždycky,
 * takže charismatický vůdce by svítil jako hrozba.
 */
function osaColor(value: number, dobreVysoke: boolean): string {
  const dobre = dobreVysoke ? value >= 60 : value <= 35;
  const spatne = dobreVysoke ? value <= 35 : value >= 60;
  if (dobre) return "bg-pitch-500";
  if (spatne) return "bg-card-red";
  return "bg-gold-500";
}

export default function VudceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiFetch<Detail>(`/api/fan-leaders/${id}`)
      .then(setData)
      .catch((e) => console.error("fetch fan leader:", e))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div>;
  }
  if (!data) return <div className="page-container">Vůdce nenalezen.</div>;

  const l = data.leader;
  const s = sentimentWord(l.sentiment);

  return (
    <div className="page-container pb-24">
      <Link href="/dashboard/fans?tab=groups" className="text-sm text-muted hover:underline">← Fanoušci</Link>

      <div className="card p-4 mt-3">
        <div className="flex items-start gap-3">
          {l.avatar && (
            <FaceAvatar faceConfig={l.avatar} size={72} className="border border-ink/20 bg-white shrink-0 rounded-soft" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-heading font-bold text-xl leading-tight">{l.name}</h1>
            <div className="text-sm text-muted">{l.archetypeLabel} · {l.age} let</div>
            <div className="text-sm text-muted">V civilu: {l.occupation}</div>
          </div>
        </div>
        <p className="text-sm mt-3">{l.bio}</p>
        {l.hlaska && <p className="text-sm italic text-muted mt-1">„{l.hlaska}"</p>}
      </div>

      {data.group && (
        <>
          <SectionLabel>Vede partu</SectionLabel>
          <div className="card p-4">
            <div className="text-base font-semibold">{data.group.name}</div>
            <div className="text-sm text-muted">
              {data.group.kindLabel} · {data.group.sectorLabel} · {data.group.size} lidí
            </div>
            <p className="text-sm mt-2">{data.group.popis}</p>
            <p className="text-sm text-muted mt-2">
              Nálada v partě: <span className="font-semibold">{data.group.moodWord}</span> ·
              vztah k vedení: <span className="font-semibold">{data.group.heatWord}</span>
            </p>
          </div>
        </>
      )}

      <SectionLabel>Vztah k tobě</SectionLabel>
      <div className="card p-4">
        <p className="text-sm">
          Vztah k tobě: <span className={`font-semibold ${s.cls}`}>{s.text}</span>.
        </p>
        {l.duvod && <p className="text-sm text-muted mt-1">{l.duvod}</p>}
      </div>

      <SectionLabel>Povaha</SectionLabel>
      <div className="card p-4 space-y-1.5">
        {LEADER_AXES.map((axis) => {
          const value = l[axis.key];
          return (
            <div key={axis.key}>
              <div className="flex items-center gap-2">
                <span className="text-sm w-36 shrink-0">{axis.label}</span>
                <div className="flex-1 h-2 rounded-full bg-ink/10 overflow-hidden">
                  <div className={`h-full rounded-full ${osaColor(value, axis.dobreVysoke)}`} style={{ width: `${value}%` }} />
                </div>
                <span className="text-sm text-muted w-28 shrink-0 text-right">{axisWord(value)}</span>
              </div>
              <p className="text-sm text-ink-light mt-0.5 mb-2">{axis.popis}</p>
            </div>
          );
        })}
      </div>

      {data.team && (
        <p className="text-sm text-muted mt-4">
          Chodí na{" "}
          <Link href="/dashboard/klub" className="underline font-medium">{data.team.name}</Link>.
        </p>
      )}
    </div>
  );
}
