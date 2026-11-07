/**
 * Data pro PostHog jdou přes naši doménu (/relay/…), ne přímo na eu.i.posthog.com.
 *
 * Blokátory reklam mají domény PostHogu na seznamu a podle PostHogu tak zahodí 10 až 25 %
 * událostí i nahrávek. Požadavek na vlastní doménu nechají projít. Cesta se schválně
 * nejmenuje „posthog“, „analytics“ ani „ingest“, ty mají blokátory taky na seznamech.
 *
 * Statické skripty (nahrávání sezení, průzkumy) PostHog servíruje z jiného hostitele,
 * proto /relay/static/… míří jinam než zbytek.
 */
export const runtime = "edge";

const API_HOST = "eu.i.posthog.com";
const ASSET_HOST = "eu-assets.i.posthog.com";

/** Hlavičky, které PostHog nepotřebuje: cookies hry a údaje o našem hostiteli. */
const DROPPED_HEADERS = ["host", "cookie", "connection", "content-length", "x-forwarded-host"];

async function forward(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/relay/, "");
  const host = path.startsWith("/static/") ? ASSET_HOST : API_HOST;
  const target = `https://${host}${path}${url.search}`;

  const headers = new Headers(request.headers);
  for (const name of DROPPED_HEADERS) headers.delete(name);
  // Bez toho by PostHog viděl IP adresu Cloudflaru a místo hráče by umístil do datacentra.
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });
    const out = new Headers(response.headers);
    out.delete("set-cookie");
    // fetch tělo už rozbalil: s původní hlavičkou by ho prohlížeč zkusil rozbalit znovu.
    out.delete("content-encoding");
    out.delete("content-length");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: out });
  } catch (e) {
    console.error("[relay] PostHog nedostupný:", target, e);
    return new Response("PostHog unavailable", { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
export const OPTIONS = forward;
export const HEAD = forward;
