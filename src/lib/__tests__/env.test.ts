import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** env() caches its first parse, so each case imports a fresh module. */
async function loadEnv(vars: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgres://rickhouse:rickhouse@localhost:5432/rickhouse");
  vi.stubEnv("SESSION_SECRET", "x".repeat(32));
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  const { env } = await import("../env");
  return env;
}

describe("env", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it("treats the empty strings Compose passes for unset variables as unset", async () => {
    const env = await loadEnv({ APP_URL: "", TRUSTED_PROXIES: "" });
    expect(env().APP_URL).toBeUndefined();
    expect(env().TRUSTED_PROXIES).toEqual([]);
  });

  it("drops a trailing slash from APP_URL", async () => {
    const env = await loadEnv({ APP_URL: "https://rickhouse.example.com/" });
    expect(env().APP_URL).toBe("https://rickhouse.example.com");
  });

  it("splits TRUSTED_PROXIES on commas", async () => {
    const env = await loadEnv({ TRUSTED_PROXIES: "173.245.48.0/20, 10.0.0.1" });
    expect(env().TRUSTED_PROXIES).toEqual(["173.245.48.0/20", "10.0.0.1"]);
  });

  it("fails at boot on a TRUSTED_PROXIES entry that isn't an address", async () => {
    const env = await loadEnv({ TRUSTED_PROXIES: "cloudflare" });
    expect(() => env()).toThrow(/TRUSTED_PROXIES/);
  });
});
