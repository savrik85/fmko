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

    const inner = containerRef.current.querySelector(".face-inner");
    if (!inner) return;

    while (inner.firstChild) {
      inner.removeChild(inner.firstChild);
    }

    try {
      display(inner as HTMLDivElement, faceConfig as any, { width: size * 2.2, height: size * 3.3 });
    } catch {
      // Fallback
    }
  }, [faceConfig, size]);

  return (
    <div
      ref={containerRef}
      className={`rounded-full overflow-hidden bg-gray-50 shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Inner div is larger than container, positioned so head is centered in the circle */}
      <div
        className="face-inner"
        style={{
          width: size * 2.2,
          height: size * 3.3,
          transform: `translate(-${size * 0.6}px, -${size * 0.15}px)`,
        }}
      />
    </div>
  );
}
