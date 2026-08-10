"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { EntityLink } from "@/components/ui/entity-link";

interface Journalist {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  age: number;
  style: string;
  bulvarnost: number;
  zlomyslnost: number;
  odbornost: number;
  bio: string;
  hlaska: string;
  leagueId: string;
  avatar: Record<string, unknown> | null;
}

interface Relation {
  teamId: string;
  teamName: string;
  sentiment: number;
  duvod: string;
}

interface Clanek {
  id: string;
  type: string;
  headline: string;
  game_week: number | null;
  created_at: string;
}

const STYL_LABEL: Record<string, string> = {
  bulvar: "Bulvární pero",
  seriozni: "Seriózní pero",
  vycurany: "Vyčůrané pero",
  patriot: "Srdcař okresu",
};

const RUBRIKA: Record<string, string> = {
  round_summary: "Hráč a trenér kola",
  matchday_preview: "Před zápasem",
  ai_report: "Komentář kola",
  ultras_report: "Prales Ultras",
  interview: "Rozhovor s trenérem",
  player_interview: "Rozhovor s hráčem",
  season_opener: "Otevírák sezóny",
  season_wrap: "Ohlédnutí za sezónou",
};

/** Vodorovný ukazatel povahové osy 0–100. */
function Osa({ popis, hodnota }: { popis: string; hodnota: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] mb-0.5">
        <span className="uppercase tracking-[0.12em] font-heading font-bold text-muted">{popis}</span>
        <span className="font-heading font-bold tabular-nums">{hodnota}</span>
      </div>
      <div className="h-1.5 bg-ink/10">
        <div className="h-full bg-ink" style={{ width: `${Math.max(0, Math.min(100, hodnota))}%` }} />
      </div>
    </div>
  );
}

/** Jak redaktor smýšlí o klubu — od nenávisti po náklonnost. */
function vztahPopis(s: number): { text: string; barva: string } {
  if (s >= 60) return { text: "drží palce", barva: "text-pitch-600" };
  if (s >= 25) return { text: "nakloněn", barva: "text-pitch-600" };
  if (s > -25) return { text: "neutrální", barva: "text-muted" };
  if (s > -60) return { text: "kritický", barva: "text-card-red" };
  return { text: "jde po nich", barva: "text-card-red" };
}

export default function ProfilRedaktora() {
  const params = useParams();
  const id = params?.id as string;

  const [j, setJ] = useState<Journalist | null>(null);
  const [vztahy, setVztahy] = useState<Relation[]>([]);
  const [clanky, setClanky] = useState<Clanek[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiFetch<{ journalist: Journalist; relations: Relation[]; articles: Clanek[] }>(`/api/journalists/${id}`)
      .then((d) => {
        setJ(d.journalist);
        setVztahy(d.relations ?? []);
        setClanky(d.articles ?? []);
        setLoading(false);
      })
      .catch((e) => { console.error("načtení profilu redaktora:", e); setLoading(false); });
  }, [id]);

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!j) return <div className="page-container">Redaktor nenalezen.</div>;

  const jmeno = j.nickname ? `${j.firstName} „${j.nickname}" ${j.lastName}` : `${j.firstName} ${j.lastName}`;

  return (
    <div className="page-container">
      <Link href="/dashboard/news" className="text-sm text-muted hover:text-ink">← Zpět do zpravodaje</Link>

      {/* Hlavička profilu — vizitka jako v tiráži novin */}
      <header className="np-dvojlinka mt-3 pt-4 pb-4 border-b border-ink/20">
        <div className="flex items-start gap-4">
          {j.avatar && (
            <FaceAvatar faceConfig={j.avatar} size={132} className="border border-ink/40 bg-white shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted">
              {STYL_LABEL[j.style] ?? "Redakce"}
            </div>
            <h1 className="np-titulek text-3xl sm:text-4xl mt-0.5">{jmeno}</h1>
            <div className="text-sm text-muted mt-1">{j.age} let · redaktor okresního zpravodaje</div>
            <p className="np-text text-[15px] mt-2 max-w-2xl">{j.bio}</p>
            <p className="np-citat mt-3 max-w-2xl">„{j.hlaska}"</p>
          </div>
        </div>
      </header>

      {/* Povaha */}
      <section className="mt-6">
        <div className="np-rubrika">Povaha</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-2xl">
          <Osa popis="Bulvárnost" hodnota={j.bulvarnost} />
          <Osa popis="Zlomyslnost" hodnota={j.zlomyslnost} />
          <Osa popis="Odbornost" hodnota={j.odbornost} />
        </div>
      </section>

      {/* Vztahy ke klubům */}
      <section className="mt-8">
        <div className="np-rubrika">Vztah ke klubům</div>
        {vztahy.length === 0 ? (
          <p className="np-text text-[15px] max-w-2xl">
            Zatím nikoho v merku ani v oblibě. Vztah se rodí z toho, jak s ním trenéři mluví v rozhovorech.
          </p>
        ) : (
          <div className="divide-y divide-ink/10 max-w-2xl">
            {vztahy.map((v) => {
              const p = vztahPopis(v.sentiment);
              return (
                <div key={v.teamId} className="flex items-baseline gap-3 py-2">
                  <EntityLink type="team" id={v.teamId} className="font-heading font-bold text-base">
                    {v.teamName}
                  </EntityLink>
                  <span className={`text-sm font-heading font-bold ${p.barva}`}>{p.text}</span>
                  <span className="text-xs text-muted tabular-nums ml-auto">{v.sentiment > 0 ? "+" : ""}{v.sentiment}</span>
                  {v.duvod && <span className="text-xs text-muted italic hidden sm:inline">{v.duvod}</span>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Poslední články */}
      <section className="mt-8 mb-10">
        <div className="np-rubrika">Poslední články</div>
        {clanky.length === 0 ? (
          <p className="np-text text-[15px]">Zatím nic nenapsal.</p>
        ) : (
          <div className="np-sloupce np-sloupce-2">
            {clanky.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/news?article=${c.id}`}
                className="block pb-2.5 mb-2.5 border-b border-ink/10 break-inside-avoid-column hover:underline underline-offset-2"
              >
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
                  {RUBRIKA[c.type] ?? c.type}{c.game_week ? ` · ${c.game_week}. kolo` : ""}
                </div>
                <div className="np-titulek text-[15px]">{c.headline}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
