import type { MetadataRoute } from "next";
import { robotsRules, siteUrl } from "@/lib/site-index";

export default function robots(): MetadataRoute.Robots {
  return robotsRules(siteUrl());
}
