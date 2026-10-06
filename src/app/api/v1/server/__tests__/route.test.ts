import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** env() is cached, so each case imports fresh modules. */
async function get(vars: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgres://rickhouse:rickhouse@localhost:5432/rickhouse");
  vi.stubEnv("SESSION_SECRET", "x".repeat(32));
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  const { GET } = await import("../route");
  return GET(new NextRequest("https://rickhouse.example.com/api/v1/server", { headers: { host: "rickhouse.example.com" } }));
}

describe("GET /api/v1/server", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("hands over the Turnstile site key when the server asks for the check", async () => {
    const res = await get({ TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" });
    expect(await res.json()).toEqual({ apiVersion: "1", turnstileSiteKey: "site" });
  });

  it("says null when Turnstile isn't set up", async () => {
    const res = await get({});
    expect(await res.json()).toEqual({ apiVersion: "1", turnstileSiteKey: null });
  });
});
