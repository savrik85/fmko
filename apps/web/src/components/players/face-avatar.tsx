"use client";

import { useEffect, useRef } from "react";
import { display } from "facesjs";

interface FaceAvatarProps {
  /** Face config JSON from DB (generated on server at player creation) */
  faceConfig: Record<string, unknown>;
  size?: number;
  className?: string;
}

/**
 * Football Manager-style face avatar.
 * Renders a pre-generated face config from the database.
 * Face is generated ONCE on the server when player is created
 * and stored in the avatar column — so it's always the same.
 */
export function FaceAvatar({ faceConfig, size = 80, className = "" }: FaceAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !faceConfig) return;

    // Clear previous
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }

    try {
      display(containerRef.current, faceConfig as any, { width: size, height: size });
    } catch {
      // Fallback — pokud config je starý formát
    }
  }, [faceConfig, size]);

  return (
    <div
      ref={containerRef}
      className={`rounded-full overflow-hidden bg-gray-50 shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
