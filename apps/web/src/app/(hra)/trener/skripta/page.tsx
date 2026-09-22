"use client";

/**
 * Skripta trenérské školy: lekce kurzu, ze kterých se ptá závěrečný test.
 * Během běžícího testu jsou zamčená (server vrací 423).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { SectionLabel, Spinner } from "@/components/ui";
import { LessonBody } from "@/components/manager/LessonBody";

interface Materials {
  course: { id: string; title: string; topic: string; status: string };
  lessons: Array<{ id: string; title: string; body: string }>;
}

export default function SkriptaPage() {
  const { teamId } = useTeam();
  // undefined = adresa ještě nepřečtená, null = v adrese kurz chybí
  const [courseId, setCourseId] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<Materials | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [index, setIndex] = useState(0);

  // Statická stránka: id kurzu z adresy bez useSearchParams (viz useTabParam).
  useEffect(() => {
    setCourseId(new URLSearchParams(window.location.search).get("kurz"));
  }, []);

  useEffect(() => {
    if (!teamId || !courseId) return;
    apiFetch<Materials>(`/api/teams/${teamId}/coach/courses/${courseId}/materials`)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => {
        console.error("skripta load:", e);
        setError({ status: (e as { status?: number }).status ?? 0, message: (e as Error)?.message || "Skripta se nepodařilo načíst." });
      });
  }, [teamId, courseId]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [index]);

  if (courseId === null) {
    return <div className="page-container"><div className="card p-4 text-sm">Chybí kurz. Skripta najdeš na profilu trenéra v záložce Vzdělání.</div></div>;
  }
  if (error) {
    return (
      <div className="page-container space-y-3">
        <div className="card p-4 text-base">{error.message}</div>
        {error.status === 423 && courseId && (
          <Link href={`/trener/test?kurz=${courseId}`} className="btn btn-primary btn-lg">Zpět k testu</Link>
        )}
      </div>
    );
  }
  if (!data) return <div className="min-h-[50dvh] flex items-center justify-center"><Spinner size="lg" /></div>;

  const lesson = data.lessons[index];
  const last = index === data.lessons.length - 1;
  const examOpen = data.course.status === "exam_ready";

  return (
    <div className="page-container space-y-4 max-w-[760px]">
      <div className="card p-4 sm:p-5">
        <div className="text-sm text-muted">{data.course.topic}</div>
        <h1 className="text-xl font-heading font-extrabold">{data.course.title}</h1>
        <p className="text-sm text-muted mt-1">
          Všechny otázky v testu vycházejí z těchhle {data.lessons.length} lekcí. Během testu budou skripta zamčená.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {data.lessons.map((l, i) => (
            <button key={l.id} type="button" onClick={() => setIndex(i)}
              className={`min-h-11 min-w-11 px-3 rounded-control text-sm font-heading font-bold border transition-colors ${
                i === index ? "bg-pitch-500 text-white border-pitch-500" : "bg-surface text-ink border-gray-200 hover:border-pitch-300"
              }`}
              aria-label={`Lekce ${i + 1}: ${l.title}`}>
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {lesson && (
        <article className="card p-4 sm:p-6">
          <SectionLabel>Lekce {index + 1} z {data.lessons.length}</SectionLabel>
          <h2 className="text-lg font-heading font-extrabold mb-3">{lesson.title}</h2>
          <LessonBody body={lesson.body} />
        </article>
      )}

      <div className="flex gap-2">
        <button type="button" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}
          className="btn btn-secondary btn-lg flex-1 disabled:opacity-40">← Předchozí</button>
        {!last && (
          <button type="button" onClick={() => setIndex((i) => i + 1)} className="btn btn-primary btn-lg flex-1">Další lekce →</button>
        )}
      </div>

      {last && examOpen && (
        <Link href={`/trener/test?kurz=${data.course.id}`} className="btn btn-primary btn-lg w-full text-center">
          Mám načteno, jdu na test
        </Link>
      )}
      {last && !examOpen && teamId && (
        <Link href={`/manazer/${teamId}?tab=vzdelani`} className="btn btn-secondary btn-lg w-full text-center">
          Zpět na vzdělání trenéra
        </Link>
      )}
    </div>
  );
}
