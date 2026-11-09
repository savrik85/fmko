/**
 * Co smí vyhledávače indexovat. Veřejné jsou úvod, registrace, přihlášení, weby klubů
 * a pozvánky; hra sama je za přihlášením a do výsledků hledání nepatří.
 * Testovací web (doména s „test“) se neindexuje vůbec.
 */

export const DEFAULT_SITE_URL = "https://prales.fun";

/** Stránky do mapy webu. */
export const PUBLIC_PAGES: ReadonlyArray<{ path: string; priority: number }> = [
  { path: "/", priority: 1 },
  { path: "/registrace", priority: 0.9 },
  { path: "/prihlaseni", priority: 0.3 },
];

/** Části webu, kam vyhledávač nemá chodit (hra za přihlášením, správa, analytika). */
export const PRIVATE_PATHS: readonly string[] = ["/admin", "/onboarding", "/relay", "/prehled", "/kadr", "/zapas", "/finance", "/telefon"];

export function siteUrl(raw: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(value) ? value : DEFAULT_SITE_URL;
}

/** Testovací nebo místní web: nesmí se dostat do vyhledávačů místo produkce. */
export function isIndexable(url: string): boolean {
  const host = url.replace(/^https?:\/\//, "").split("/")[0];
  return !host.startsWith("test.") && !host.includes("-test.") && !host.startsWith("localhost") && !host.startsWith("127.");
}

export function robotsRules(url: string): { rules: { userAgent: string; allow?: string; disallow?: string | string[] }; sitemap?: string } {
  if (!isIndexable(url)) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] }, sitemap: `${url}/sitemap.xml` };
}

export function sitemapEntries(url: string): Array<{ url: string; changeFrequency: "daily" | "weekly"; priority: number }> {
  if (!isIndexable(url)) return [];
  return PUBLIC_PAGES.map((p) => ({ url: `${url}${p.path === "/" ? "" : p.path}`, changeFrequency: p.path === "/" ? "daily" : "weekly", priority: p.priority }));
}
