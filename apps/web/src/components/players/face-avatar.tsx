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
      // Let facesjs render at its natural aspect ratio
      display(containerRef.current, faceConfig as any, { width: size, height: size * 1.3 });
    } catch {
      // Fallback
    }
  }, [faceConfig, size]);

  // No rounded-full, no overflow hidden — just let facesjs render naturally
  return (
    <div
      ref={containerRef}
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size * 1.3 }}
    />
  );
}
