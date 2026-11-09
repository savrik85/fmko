import type { MetadataRoute } from "next";
import { siteUrl, sitemapEntries } from "@/lib/site-index";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(siteUrl());
}
