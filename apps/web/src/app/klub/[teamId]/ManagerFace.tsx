"use client";

import dynamic from "next/dynamic";

const FaceAvatar = dynamic(
  () => import("@/components/players/face-avatar").then((m) => m.FaceAvatar),
  { ssr: false, loading: () => <div style={{ width: 96, height: 115 }} className="bg-gray-100 rounded-lg animate-pulse" /> },
);

export function ManagerFace({ faceConfig, size = 96 }: { faceConfig: Record<string, unknown>; size?: number }) {
  return <FaceAvatar faceConfig={faceConfig} size={size} />;
}
