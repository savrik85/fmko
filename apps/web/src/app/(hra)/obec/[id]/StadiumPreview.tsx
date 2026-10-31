"use client";

import { useEffect, useRef, useState } from "react";
import type { ClubWebsiteData } from "@okresni-masina/shared";
import { clientOnly } from "@/components/client-only";
import { apiFetch } from "@/lib/api";

const Stadium3D = clientOnly(
  () => import("@/components/stadium/stadium-3d/Stadium3D").then((m) => m.Stadium3D),
  null,
);

/**
 * Fotí se vždy jen jeden stadion naráz: víc WebGL scén najednou telefon nezvládne.
 * Každý náhled si počká, až dofotí ten předchozí.
 */
let queue: Promise<void> = Promise.resolve();

type Render = ClubWebsiteData["stadiumPhotos"]["render"];

/**
 * Náhled stadionu pro klub bez uložené fotky: stejný 3D model jako na stadionové stránce,
 * vyfocený v prohlížeči až ve chvíli, kdy k němu návštěvník dojede. Nahrát fotku smí jen
 * vlastník klubu (klubový web), tady se jen ukáže.
 */
export function StadiumPreview({ teamId, alt }: { teamId: string; alt: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [render, setRender] = useState<Render | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const done = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNear(true); io.disconnect(); }
    }, { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    apiFetch<ClubWebsiteData>(`/api/teams/${teamId}/website`)
      .then((d) => {
        if (cancelled) return;
        setRender(d.stadiumPhotos.render);
        // Do fronty: focení začne, až předchozí stadion skončí.
        queue = queue.then(() => new Promise<void>((resolve) => {
          if (cancelled) { resolve(); return; }
          done.current = resolve;
          setCapturing(true);
        }));
      })
      .catch((e) => { console.error("Data stadionu pro náhled:", e); setFailed(true); });
    return () => { cancelled = true; done.current?.(); };
  }, [near, teamId]);

  // Když WebGL nejde, nečekat donekonečna a pustit frontu dál.
  useEffect(() => {
    if (!capturing) return;
    const timer = setTimeout(() => {
      console.warn("Náhled stadionu se nepodařilo vyfotit včas:", teamId);
      setFailed(true);
      setCapturing(false);
      done.current?.();
    }, 30_000);
    return () => clearTimeout(timer);
  }, [capturing, teamId]);

  if (failed) return null;

  return (
    <div ref={rootRef} className="relative w-full aspect-[16/9] bg-surface overflow-hidden">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">Fotím stadion…</div>
      )}
      {capturing && render && (
        <div className="absolute top-0 left-0 w-[960px] h-[540px] opacity-0 pointer-events-none" aria-hidden="true">
          <Stadium3D
            {...render}
            initialViewpoint="overview"
            showControls={false}
            snapshotViewpoints={["overview"]}
            onSnapshotReady={(dataUrl) => {
              setImage(dataUrl);
              setCapturing(false);
              done.current?.();
            }}
          />
        </div>
      )}
    </div>
  );
}
