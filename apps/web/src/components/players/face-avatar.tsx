"use client";

import { useEffect, useRef } from "react";
import { display } from "facesjs";

interface FaceAvatarProps {
  faceConfig: Record<string, unknown>;
  size?: number;
  className?: string;
}

export function FaceAvatar({ faceConfig, size = 80, className = "" }: FaceAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !faceConfig) return;

    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }

    try {
      // Render larger, then scale down — gives CSS more control
      display(containerRef.current, faceConfig as any, { width: size, height: size });

      // Center the SVG inside container
      const svg = containerRef.current.querySelector("svg");
      if (svg) {
        svg.style.display = "block";
        svg.style.margin = "0 auto";
      }
    } catch {
      // Fallback
    }
  }, [faceConfig, size]);

  return (
    <div
      ref={containerRef}
      className={`rounded-full overflow-hidden bg-gray-50 shrink-0 flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
