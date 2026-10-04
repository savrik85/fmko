"use client";

import { Suspense } from "react";
import { clientOnly } from "@/components/client-only";

const Gallery = clientOnly(() => import("./gallery").then((m) => m.Gallery));

/** DOČASNÉ: lokální ladění vzhledu přístaveb tribun. Před nasazením smazat. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Gallery />
    </Suspense>
  );
}
