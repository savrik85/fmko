// Workers AI přes REST API účtu (stejný model i vstup jako binding env.AI).
// Lokální proxy z getPlatformProxy padala u dlouhých volání („fetch failed"), REST ne.
export function restAi(): Ai {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error("chybí CLOUDFLARE_ACCOUNT_ID (wrangler whoami)");
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("chybí CLOUDFLARE_API_TOKEN");
  const once = async (model: string, input: unknown): Promise<unknown> => {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = await res.json() as { success?: boolean; result?: unknown; errors?: unknown };
    if (!res.ok || json.success === false) throw new Error(`${res.status}: ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
    return json.result;
  };
  return {
    run: async (model: string, input: unknown) => {
      try {
        return await once(model, input);
      } catch (e) {
        // Síťová chyba na straně počítače (ne modelu): jednou zopakovat.
        if (String((e as Error)?.message ?? e).includes("fetch failed")) return once(model, input);
        throw e;
      }
    },
  } as unknown as Ai;
}
