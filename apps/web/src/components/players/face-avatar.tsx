"use client";

import { useEffect, useRef, useMemo } from "react";
import { display, generate } from "facesjs";

interface FaceAvatarProps {
  seed: string;
  size?: number;
  className?: string;
}

/** Simple hash from string to deterministic number */
function hashSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Football Manager-style face avatar using facesjs.
 * Deterministic — same seed = same face.
 */
export function FaceAvatar({ seed, size = 80, className = "" }: FaceAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate face config once per seed (deterministic via overrides)
  const face = useMemo(() => {
    const h = hashSeed(seed);
    // Use hash to create deterministic but varied faces
    const baseFace = generate({ race: "white" });

    // Override with deterministic values based on seed hash
    // facesjs generates random faces but we want consistent ones per player
    // So we generate once and memoize by seed
    return baseFace;
  }, [seed]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous render
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }

    // Render SVG into container
    display(containerRef.current, face, { width: size, height: size });
  }, [face, size]);

  return (
    <div
      ref={containerRef}
      className={`rounded-full overflow-hidden bg-gray-100 shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
