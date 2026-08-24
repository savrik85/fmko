"use client";

import { useEffect, useState } from "react";
import { Stadium3D } from "./Stadium3D";
import type { Stadium3DCustomization, LastMatchScore } from "./Stadium3D";
import type { WeatherType } from "./constants";

interface Stadium3DViewerProps {
  open: boolean;
  onClose: () => void;
  pitchCondition: number;
  pitchType: string;
  facilities: Record<string, number>;
  teamColor: string;
  secondaryColor?: string;
  badgePattern?: string;
  badgeInitials?: string;
  badgeSymbol?: string | null;
  badgePrimary?: string | null;
  badgeSecondary?: string | null;
  stadiumName?: string | null;
  sponsors?: string[];
  customization?: Stadium3DCustomization;
  lastMatch?: LastMatchScore | null;
  weather?: WeatherType;
  initialWeather?: WeatherType;
}

export function Stadium3DViewer(props: Stadium3DViewerProps) {
  const { open, onClose, ...sceneProps } = props;
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);

  // Orientation detection na mobilu
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const isMobile = window.innerWidth <= 900;
      const isPortrait = window.innerHeight > window.innerWidth;
      setIsPortraitMobile(isMobile && isPortrait);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [open]);

  // Pokus o native fullscreen + landscape lock (jen Chrome Android)
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    if (root.requestFullscreen) {
      root.requestFullscreen().catch((e) => console.warn("fullscreen denied:", e));
    }
    const orientation = (screen as Screen & { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
    if (orientation?.lock) {
      orientation.lock("landscape").catch((e) => console.warn("orientation lock denied:", e));
    }
    return () => {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch((e) => console.warn("exit fullscreen failed:", e));
      }
    };
  }, [open]);

  // ESC to close — buď přímo (pokud nejsme ve fullscreen) nebo přes fullscreenchange
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onFsChange = () => {
      // Když user opustí fullscreen (ESC nebo gesture), zavřeme i modal
      if (!document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-viewer)] bg-black w-screen h-screen min-h-dvh overflow-hidden select-none">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 z-30 w-10 h-10 rounded-full bg-black/70 hover:bg-black/90 border border-white/20 text-white text-xl font-bold flex items-center justify-center transition-all backdrop-blur-md shadow-lg"
        aria-label="Zavřít"
      >
        ✕
      </button>

      {/* Title */}
      {props.stadiumName && (
        <div className="absolute top-3 left-3 z-20 bg-black/70 backdrop-blur-md rounded-xl px-3 py-1.5 text-white border border-white/15 shadow-lg pointer-events-none flex items-center gap-1.5">
          <span>🏟️</span>
          <span className="font-heading font-bold text-xs sm:text-sm">{props.stadiumName}</span>
        </div>
      )}

      {/* Portrait orientation prompt na mobilu */}
      {isPortraitMobile ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-white text-center px-6 bg-black">
          <div className="text-7xl mb-4 animate-pulse">📱</div>
          <div className="font-heading font-bold text-xl mb-2">Otoč zařízení</div>
          <div className="text-sm opacity-80">Pro nejlepší zážitek otoč telefon do landscape režimu</div>
          <button
            onClick={onClose}
            className="mt-6 px-6 py-2 bg-white/20 hover:bg-white/30 rounded-soft text-sm font-bold transition-colors"
          >
            Zrušit
          </button>
        </div>
      ) : (
        <div className="w-full h-full relative bg-black">
          <Stadium3D {...sceneProps} reserveCloseButtonSpace />
        </div>
      )}
    </div>
  );
}
