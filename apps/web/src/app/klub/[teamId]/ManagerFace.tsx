"use client";

import { clientOnly } from "@/components/client-only";

const FaceAvatar = clientOnly(
  () => import("@/components/players/face-avatar").then((m) => m.FaceAvatar),
  <div style={{ width: 96, height: 115 }} className="bg-gray-100 rounded-soft animate-pulse" />,
);

export function ManagerFace({ faceConfig, size = 96 }: { faceConfig: Record<string, unknown>; size?: number }) {
  return <FaceAvatar faceConfig={faceConfig} size={size} />;
}
