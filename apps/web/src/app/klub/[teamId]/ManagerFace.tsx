"use client";

import { clientOnly } from "@/components/client-only";

const FaceAvatar = clientOnly(
  () => import("@/components/players/face-avatar").then((m) => m.FaceAvatar),
  <div style={{ width: 64, height: 76 }} className="bg-white/10 rounded-xl animate-pulse" />,
);

export function ManagerFace({ faceConfig, size = 64 }: { faceConfig: Record<string, unknown> | null | undefined; size?: number }) {
  if (!faceConfig || typeof faceConfig !== "object" || Object.keys(faceConfig).length === 0) {
    return (
      <div
        style={{ width: size, height: size * 1.2 }}
        className="flex items-center justify-center bg-white/5 rounded-xl text-white/40 text-xl font-heading"
      >
        👤
      </div>
    );
  }
  return <FaceAvatar faceConfig={faceConfig} size={size} />;
}
