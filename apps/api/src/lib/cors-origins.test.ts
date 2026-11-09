/**
 * CORS býval `origin: "*"`. Teď smí z prohlížeče volat API jen web hry,
 * náhledy z Cloudflare Pages a localhost.
 */
import { describe, expect, it } from "vitest";
import worker, { type Bindings } from "../index";
import { isAllowedOrigin } from "./cors-origins";

const ENV = {} as unknown as Bindings;

describe("isAllowedOrigin", () => {
  it.each([
    "https://prales.fun",
    "https://www.prales.fun",
    "https://test.prales.fun",
    "https://prales-web.pages.dev",
    "https://prales-web-test.pages.dev",
    "https://a1b2c3d4.prales-web.pages.dev",
    "https://testing.prales-web-test.pages.dev",
    "http://localhost:3000",
    "http://localhost",
    "http://127.0.0.1:3000",
  ])("%s smí", (origin) => {
    expect(isAllowedOrigin(origin)).toBe(true);
  });

  it.each([
    "https://evil.example",
    "http://prales.fun",
    "https://prales.fun.evil.example",
    "https://evilprales.fun",
    "https://api.prales.fun.evil.example",
    "https://evil.pages.dev",
    "https://prales-web.pages.dev.evil.example",
    "https://evil-prales-web.pages.dev",
    "https://prales.fun:8443",
    "https://localhost.evil.example",
    "null",
    "",
  ])("%s nesmí", (origin) => {
    expect(isAllowedOrigin(origin)).toBe(false);
  });
});

describe("hlavičky CORS na API", () => {
  it("web hry dostane svůj origin zpět", async () => {
    const res = await worker.fetch(new Request("https://api.test/health", { headers: { Origin: "https://prales.fun" } }), ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://prales.fun");
    expect(res.headers.get("Vary")).toContain("Origin");
  });

  it("cizí stránka hlavičku nedostane, prohlížeč jí odpověď nevydá", async () => {
    const res = await worker.fetch(new Request("https://api.test/health", { headers: { Origin: "https://evil.example" } }), ENV);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("požadavek bez Origin (server, obrázek) projde beze změny", async () => {
    const res = await worker.fetch(new Request("https://api.test/health"), ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("preflight z testovacího webu povolí Authorization", async () => {
    const res = await worker.fetch(new Request("https://api.test/api/teams/t1/lineup", {
      method: "OPTIONS",
      headers: {
        Origin: "https://test.prales.fun",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    }), ENV);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://test.prales.fun");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("authorization");
  });

  it("preflight z cizí stránky origin nepovolí", async () => {
    const res = await worker.fetch(new Request("https://api.test/api/teams/t1/lineup", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
    }), ENV);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("chybová odpověď guardu nese CORS hlavičku, jinak by web viděl jen síťovou chybu", async () => {
    const res = await worker.fetch(new Request("https://api.test/api/teams/t1/transactions", { headers: { Origin: "https://prales.fun" } }), ENV);
    expect(res.status).toBe(401);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://prales.fun");
  });
});
