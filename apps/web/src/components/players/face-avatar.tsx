"use client";

import { useEffect, useRef } from "react";
import { display } from "facesjs";

interface FaceAvatarProps {
  faceConfig: Record<string, unknown>;
  size?: number;
  className?: string;
}

export function FaceAvatar({ faceConfig, size = 80, className = "" }: FaceAvatarProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const visibleHeight = size * 1.2;
  const renderHeight = size * 1.6;

  useEffect(() => {
    if (!innerRef.current || !faceConfig) return;

    while (innerRef.current.firstChild) {
      innerRef.current.removeChild(innerRef.current.firstChild);
    }

    try {
      display(innerRef.current, faceConfig as any, { width: size, height: renderHeight });
    } catch {
      // Fallback
    }
  }, [faceConfig, size, renderHeight]);

  // Render face taller, then clip vertically to center the actual face
  return (
    <div
      ref={outerRef}
      className={`shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: visibleHeight }}
    >
      <div
        ref={innerRef}
        style={{
          width: size,
          height: renderHeight,
          marginTop: -(renderHeight - visibleHeight) * 0.35,
        }}
      />
    </div>
  );
}
