"use client";

import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { initPostHog, trackPageView, categorizePath, posthog } from "@/lib/analytics";

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname && typeof window !== "undefined") {
      let url = window.origin + pathname;
      const params = searchParams?.toString();
      if (params) {
        url += `?${params}`;
      }
      const { normalizedPath, featureArea } = categorizePath(pathname);
      const currentTab = searchParams?.get("tab") || null;

      trackPageView(url, {
        page_path: normalizedPath,
        feature_area: featureArea,
        tab: currentTab,
      });
    }
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}
