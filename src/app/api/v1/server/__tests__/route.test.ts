import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** env() is cached, so each case imports fresh modules. */
async function get(vars: Record<string, string>, email = false) {
  vi.resetModules();
  vi.doMock("@/lib/email/settings", () => ({ emailEnabled: async () => email }));
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
    expect(await res.json()).toEqual({ app: "rickhouse", apiVersion: "1", turnstileSiteKey: "site", emailCodes: false });
  });

  it("says null when Turnstile isn't set up", async () => {
    const res = await get({});
    expect(await res.json()).toEqual({ app: "rickhouse", apiVersion: "1", turnstileSiteKey: null, emailCodes: false });
  });

  it("says emailCodes only when the server can send mail", async () => {
    const res = await get({}, true);
    expect((await res.json()).emailCodes).toBe(true);
  });
});
