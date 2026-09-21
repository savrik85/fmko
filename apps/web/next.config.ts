import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@okresni-masina/shared", "@okresni-masina/ui"],
  // Source mapy pro PostHog Error Tracking. CI je po buildu nahraje do PostHogu
  // a z výstupu smaže, na web se nedostanou.
  productionBrowserSourceMaps: true,
};

export default nextConfig;
