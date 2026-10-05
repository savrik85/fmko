"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  STADIUM_PHOTO_VIEWPOINTS,
  type ClubWebsiteData,
  type StadiumPhotoViewpoint,
} from "@okresni-masina/shared";
import { clientOnly } from "@/components/client-only";
import { Spinner } from "@/components/ui";
import { apiFetch } from "@/lib/api";

const Stadium3D = clientOnly(
  () => import("@/components/stadium/stadium-3d/Stadium3D").then((m) => m.Stadium3D),
  <div className="h-full flex items-center justify-center text-white/60 text-sm bg-[#141b26]">
    <Spinner />
  </div>,
);

const VIEWPOINT_LABELS: Record<StadiumPhotoViewpoint, { label: string; title: string }> = {
  overview: { label: "Panorama", title: "Celkový pohled na areál" },
  main_stand: { label: "Z tribuny", title: "Pohled z hlavní tribuny na hřiště" },
  behind_goal: { label: "Za bránou", title: "Pohled zpoza branky" },
  dugout: { label: "Ze střídačky", title: "Pohled ze střídačky trenéra" },
};

const PITCH_LABELS: Record<string, string> = {
  natural: "Přírodní tráva",
  hybrid: "Hybridní trávník",
  artificial: "Umělá tráva",
};

/**
 * Fotka se zmenší na rozumnou velikost a uloží jako JPEG. JPEG umí všechny prohlížeče
 * i generátor náhledu odkazu (opengraph-image), který WebP nenačte.
 */
async function toUploadBlob(dataUrl: string): Promise<Blob> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const width = Math.min(1600, img.naturalWidth);
  const height = Math.round((img.naturalHeight / img.naturalWidth) * width);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D kontext není k dispozici");
  ctx.drawImage(img, 0, 0, width, height);
  const jpeg = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.86));
  if (!jpeg) throw new Error("fotku se nepodařilo převést");
  return jpeg;
}

interface StadiumPhotoCardProps {
  data: ClubWebsiteData;
  /** Vlastník fotky po vyfocení nahraje, aby je návštěvníci dostali hotové. */
  isOwner: boolean;
  tone?: "light" | "dark";
  /** Fakta o stadionu pod fotkami (kapacita, povrch…); v administraci jsou jinde. */
  showFacts?: boolean;
  onOpenLightbox?: (photo: { src: string; title: string; desc: string }) => void;
}

/**
 * Fotky stadionu z 3D modelu klubu (4 úhly) a interaktivní 3D prohlídka.
 * Hotové fotky přijdou ze serveru. Chybějící se vyfotí v prohlížeči až ve chvíli,
 * kdy návštěvník dojede k sekci stadionu (3D je na mobilu náročné), a vlastníkovi
 * se rovnou nahrají, takže příští návštěvníci už nic nepočítají.
 */
export function StadiumPhotoCard({ data, isOwner, tone = "dark", showFacts = true, onOpenLightbox }: StadiumPhotoCardProps) {
  const { team, stadiumPhotos } = data;
  const { render, version } = stadiumPhotos;
  const [selected, setSelected] = useState<StadiumPhotoViewpoint>("overview");
  const [localPhotos, setLocalPhotos] = useState<Partial<Record<StadiumPhotoViewpoint, string>>>({});
  const [uploadedPhotos, setUploadedPhotos] = useState<Partial<Record<StadiumPhotoViewpoint, string>>>({});
  const [is3D, setIs3D] = useState(false);
  const [nearView, setNearView] = useState(false);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [captureQueue, setCaptureQueue] = useState<StadiumPhotoViewpoint[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const uploadBlockedRef = useRef(false);
  const uploadStartedRef = useRef(new Set<StadiumPhotoViewpoint>());

  const photoFor = (vp: StadiumPhotoViewpoint) =>
    uploadedPhotos[vp] ?? stadiumPhotos.photos[vp] ?? localPhotos[vp] ?? null;

  const missing = useMemo(
    () => STADIUM_PHOTO_VIEWPOINTS.filter((vp) => !stadiumPhotos.photos[vp]),
    [stadiumPhotos.photos],
  );
  const stillMissing = missing.filter((vp) => !localPhotos[vp]);

  // Návštěvník: fotit až těsně před sekcí. Vlastník: hned, ať jsou fotky připravené pro ostatní.
  useEffect(() => {
    if (isOwner) {
      setNearView(true);
      return;
    }
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNearView(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNearView(true);
        io.disconnect();
      }
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [isOwner]);

  // Fronta úhlů se zafixuje při startu focení: měnit ji za běhu by scénu restartovalo
  useEffect(() => {
    if (nearView && captureQueue === null && missing.length > 0) setCaptureQueue(missing);
  }, [nearView, missing, captureQueue]);

  const capturing = !!captureQueue && stillMissing.length > 0 && !failed && !is3D;

  // Když WebGL nejde (starý telefon, vypnutá akcelerace), nečekat donekonečna
  useEffect(() => {
    if (!capturing) return;
    const timer = setTimeout(() => {
      console.warn("stadion: fotky z 3D modelu se nepodařilo vytvořit včas");
      setFailed(true);
    }, 45_000);
    return () => clearTimeout(timer);
  }, [capturing, stillMissing.length]);

  const upload = useCallback(async (vp: StadiumPhotoViewpoint, dataUrl: string) => {
    if (uploadBlockedRef.current || uploadStartedRef.current.has(vp)) return;
    uploadStartedRef.current.add(vp);
    setUploading((n) => n + 1);
    try {
      const blob = await toUploadBlob(dataUrl);
      const res = await apiFetch<{ url: string }>(
        `/api/teams/${team.id}/website/stadium-photo/${vp}?version=${version}`,
        { method: "PUT", body: blob, headers: { "Content-Type": blob.type } },
      );
      setUploadedPhotos((p) => ({ ...p, [vp]: res.url }));
    } catch (e) {
      // 409 = stadion se mezitím změnil; další úhly nemá smysl posílat
      if ((e as { status?: number }).status === 409) uploadBlockedRef.current = true;
      console.warn("stadion: nahrání fotky selhalo", vp, e);
    } finally {
      setUploading((n) => n - 1);
    }
  }, [team.id, version]);

  const handleSnapshot = useCallback((dataUrl: string, vp: string) => {
    const viewpoint = vp as StadiumPhotoViewpoint;
    setLocalPhotos((p) => ({ ...p, [viewpoint]: dataUrl }));
    if (isOwner) void upload(viewpoint, dataUrl);
  }, [isOwner, upload]);

  const current = photoFor(selected);
  const stadiumTitle = team.stadium.name || "Místní fotbalové hřiště";
  const dark = tone === "dark";
  const frame = dark ? "bg-slate-950 border-white/10" : "bg-gray-100 border-gray-300";
  const muted = dark ? "text-slate-300" : "text-gray-600";

  const stadium3DProps = {
    pitchCondition: render.pitchCondition,
    pitchType: render.pitchType,
    facilities: render.facilities,
    standExtensions: render.standExtensions,
    teamColor: render.teamColor,
    secondaryColor: render.secondaryColor,
    badgePattern: render.badgePattern,
    badgeInitials: render.badgeInitials,
    badgeSymbol: render.badgeSymbol,
    badgePrimary: render.badgePrimary,
    badgeSecondary: render.badgeSecondary,
    stadiumName: render.stadiumName,
    sponsors: render.sponsors,
    customization: render.customization,
  };

  return (
    <div ref={rootRef} className="space-y-3">
      <div className={`relative w-full aspect-[16/9] min-h-[220px] overflow-hidden rounded-xl border ${frame}`}>
        {is3D ? (
          <>
            <Stadium3D {...stadium3DProps} initialViewpoint={selected} showControls />
            <button
              type="button"
              onClick={() => setIs3D(false)}
              className="absolute top-3 right-3 z-40 px-3 py-2 rounded-xl bg-black/80 hover:bg-black text-white text-sm font-heading font-bold border border-white/20 shadow-xl"
            >
              ✕ Zpět na fotky
            </button>
          </>
        ) : current && !onOpenLightbox ? (
          <img
            src={current}
            alt={`${stadiumTitle}, ${VIEWPOINT_LABELS[selected].title.toLowerCase()}`}
            className="w-full h-full object-cover"
          />
        ) : current ? (
          <button
            type="button"
            className="block w-full h-full cursor-zoom-in"
            onClick={() => onOpenLightbox?.({
              src: current,
              title: `${stadiumTitle}: ${VIEWPOINT_LABELS[selected].label.toLowerCase()}`,
              desc: `${VIEWPOINT_LABELS[selected].title}. Fotka z 3D modelu stadionu klubu ${team.name}.`,
            })}
            aria-label={`Zvětšit fotku: ${VIEWPOINT_LABELS[selected].title}`}
          >
            <img
              src={current}
              alt={`${stadiumTitle}, ${VIEWPOINT_LABELS[selected].title.toLowerCase()}`}
              className="w-full h-full object-cover"
            />
          </button>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center bg-gradient-to-br from-slate-900 via-slate-950 to-stone-900 text-white">
            {failed ? (
              <>
                <div className="text-3xl" aria-hidden="true">🏟️</div>
                <div className="font-heading font-bold text-base">Fotky stadionu se nepodařilo vytvořit</div>
                <div className="text-sm text-slate-300">Zkus 3D prohlídku níže.</div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
                <div className="font-heading font-bold text-base">Fotím stadion z 3D modelu…</div>
                <div className="text-sm text-slate-300">Tribuny, barvy i reklamy jsou přesně podle areálu klubu.</div>
              </>
            )}
          </div>
        )}

        {/* Skryté focení: plátno 1280×720 vyfotí všechny chybějící úhly jedním vykreslením */}
        {capturing && (
          <div className="absolute top-0 left-0 w-[1280px] h-[720px] opacity-0 pointer-events-none" aria-hidden="true">
            <Stadium3D
              {...stadium3DProps}
              initialViewpoint={captureQueue?.[0] ?? "overview"}
              showControls={false}
              snapshotViewpoints={captureQueue ?? undefined}
              onSnapshotReady={handleSnapshot}
            />
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STADIUM_PHOTO_VIEWPOINTS.map((vp) => {
          const src = photoFor(vp);
          const active = vp === selected && !is3D;
          return (
            <button
              key={vp}
              type="button"
              onClick={() => {
                setSelected(vp);
                setIs3D(false);
              }}
              title={VIEWPOINT_LABELS[vp].title}
              className={`shrink-0 w-28 sm:w-36 rounded-lg overflow-hidden border-2 text-left transition ${
                active
                  ? dark ? "border-[var(--club-accent-dark)]" : "border-[var(--club-accent-light)]"
                  : dark ? "border-white/10 hover:border-white/40" : "border-gray-300 hover:border-gray-500"
              }`}
            >
              <div className={`aspect-[16/9] ${dark ? "bg-slate-800" : "bg-gray-200"}`}>
                {src && <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />}
              </div>
              <div className={`px-2 py-1 text-sm font-heading font-bold truncate ${dark ? "bg-black/60 text-white" : "bg-white text-gray-900"}`}>
                {VIEWPOINT_LABELS[vp].label}
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setIs3D(true)}
          className={`shrink-0 w-28 sm:w-36 rounded-lg border-2 flex flex-col items-center justify-center gap-1 font-heading font-bold text-sm ${
            is3D ? "border-amber-500" : dark ? "border-white/10 hover:border-amber-400 text-white" : "border-gray-300 hover:border-amber-500 text-gray-900"
          }`}
        >
          <span className="text-2xl" aria-hidden="true">🎮</span>
          <span>3D prohlídka</span>
        </button>
      </div>

      {showFacts && (
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Kapacita", value: team.stadium.capacity ? `${team.stadium.capacity.toLocaleString("cs-CZ")} diváků` : null },
          { label: "Povrch", value: PITCH_LABELS[render.pitchType] ?? render.pitchType },
          { label: "Postaven", value: team.stadium.builtYear ? String(team.stadium.builtYear) : null },
          { label: "Přezdívka", value: team.stadium.nickname ? `„${team.stadium.nickname}“` : null },
        ].filter((f) => f.value).map((f) => (
          <div key={f.label} className={`rounded-lg px-3 py-2 border ${dark ? "bg-white/5 border-white/10" : "bg-white border-gray-300"}`}>
            <dt className={`text-sm ${muted}`}>{f.label}</dt>
            <dd className={`text-base font-heading font-bold ${dark ? "text-white" : "text-gray-900"}`}>{f.value}</dd>
          </div>
        ))}
      </dl>
      )}
      {showFacts && team.stadium.specialita && (
        <p className={`text-base ${dark ? "text-slate-200" : "text-gray-800"}`}>
          <strong>U nás na hřišti:</strong> {team.stadium.specialita}
        </p>
      )}

      {isOwner && (uploading > 0 || stillMissing.length > 0) && !failed && (
        <p className={`text-sm ${muted}`}>
          {uploading > 0
            ? "Ukládám fotky stadionu, aby je návštěvníci viděli hned…"
            : "Fotky se vytvoří z 3D modelu tvého stadionu. Po každé přestavbě se samy obnoví."}
        </p>
      )}
    </div>
  );
}
