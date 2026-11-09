/**
 * Odkud smí prohlížeč volat API.
 *
 * Dřív `origin: "*"`: jakákoli cizí stránka mohla z prohlížeče hráče číst odpovědi API.
 * Povolený je web hry (produkce a testing), náhledy z Cloudflare Pages obou projektů
 * a localhost pro vývoj. Požadavky bez hlavičky Origin (vykreslování na serveru,
 * obrázky a zvuk přes <img> a <audio>, callbacky služeb) CORS neřeší a projdou dál.
 */

const WEB_HOSTS = new Set(["prales.fun", "www.prales.fun", "test.prales.fun"]);
/** Projekty Cloudflare Pages: hlavní adresa i náhledy `<větev>.<projekt>.pages.dev`. */
const PAGES_PROJECT_HOSTS = ["prales-web.pages.dev", "prales-web-test.pages.dev"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function isAllowedOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (LOCAL_HOSTS.has(url.hostname)) return url.protocol === "http:" || url.protocol === "https:";
  if (url.protocol !== "https:" || url.port !== "") return false;
  if (WEB_HOSTS.has(url.hostname)) return true;
  return PAGES_PROJECT_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

/** Pro `cors({ origin })` z Hono: vrací povolený origin, jinak null (hlavička se nepošle). */
export function corsOrigin(origin: string): string | null {
  return isAllowedOrigin(origin) ? origin : null;
}
