"use client";

import { useEffect, useState } from "react";
import { Stadium3D } from "./Stadium3D";
import type { Stadium3DCustomization, LastMatchScore } from "./Stadium3D";

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
  stadiumName?: string | null;
  sponsors?: string[];
  customization?: Stadium3DCustomization;
  lastMatch?: LastMatchScore | null;
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
    <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-[101] w-12 h-12 rounded-full bg-white/15 hover:bg-white/30 text-white text-2xl font-bold flex items-center justify-center transition-colors backdrop-blur-sm"
        aria-label="Zavřít"
      >
        ✕
      </button>

      {/* Title */}
      {props.stadiumName && (
        <div className="absolute top-4 left-4 z-[101] bg-white/15 backdrop-blur-sm rounded-lg px-4 py-2 text-white">
          <div className="font-heading font-bold text-base">{props.stadiumName}</div>
        </div>
      )}

      {/* Portrait orientation prompt na mobilu */}
      {isPortraitMobile ? (
        <div className="text-white text-center px-6">
          <div className="text-7xl mb-4 animate-pulse">📱</div>
          <div className="font-heading font-bold text-xl mb-2">Otoč zařízení</div>
          <div className="text-sm opacity-80">Pro nejlepší zážitek otoč telefon do landscape režimu</div>
          <button
            onClick={onClose}
            className="mt-6 px-6 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold transition-colors"
          >
            Zrušit
          </button>
        </div>
      ) : (
        <div className="w-screen h-screen sm:w-[90vw] sm:h-[90vh] bg-gradient-to-b from-sky-100 to-sky-50 sm:rounded-2xl overflow-hidden">
          <Stadium3D {...sceneProps} />
        </div>
      )}
    </div>
  );
}
