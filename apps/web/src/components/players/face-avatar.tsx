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
      // Render at larger size so we can crop to head
      display(containerRef.current, faceConfig as any, { width: 200, height: 300 });

      // Adjust SVG viewBox to crop to just the head (centered)
      const svg = containerRef.current.querySelector("svg");
      if (svg) {
        // facesjs default viewBox is "0 0 400 600" — head is roughly at x:100-300 y:0-280
        svg.setAttribute("viewBox", "80 0 240 280");
        svg.style.width = `${size}px`;
        svg.style.height = `${size}px`;
        svg.style.display = "block";
      }
    } catch {
      // Fallback
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
