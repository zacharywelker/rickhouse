import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** env() and the lists built from it are cached, so each case imports fresh modules. */
async function loadTurnstile(vars: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgres://rickhouse:rickhouse@localhost:5432/rickhouse");
  vi.stubEnv("SESSION_SECRET", "x".repeat(32));
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  return import("../turnstile");
}

const keys = { TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" };
const lan = { ...keys, TURNSTILE_SKIP_NETWORKS: "192.168.1.0/24" };
const forwarded = (chain: string) => new Headers({ "x-forwarded-for": chain });

describe("turnstileSiteKeyFor", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it("is null unless both keys are set", async () => {
    const { turnstileSiteKeyFor } = await loadTurnstile({ TURNSTILE_SITE_KEY: "site" });
    expect(turnstileSiteKeyFor(forwarded("203.0.113.9"))).toBeNull();
  });

  it("asks everyone when no networks are skipped", async () => {
    const { turnstileSiteKeyFor } = await loadTurnstile(keys);
    expect(turnstileSiteKeyFor(forwarded("192.168.1.50"))).toBe("site");
  });

  it("skips a visitor on a listed network, connecting directly", async () => {
    const { turnstileSiteKeyFor } = await loadTurnstile(lan);
    expect(turnstileSiteKeyFor(forwarded("192.168.1.50"))).toBeNull();
  });

  it("judges a proxied visitor by their own address, not the proxy's", async () => {
    const { turnstileSiteKeyFor } = await loadTurnstile(lan);
    // A tunnel or reverse proxy on the LAN appends the visitor's public IP.
    expect(turnstileSiteKeyFor(forwarded("203.0.113.9"))).toBe("site");
    // A LAN address the visitor typed in themselves is on the left, ignored.
    expect(turnstileSiteKeyFor(forwarded("192.168.1.50, 203.0.113.9"))).toBe("site");
  });

  it("uses TRUSTED_PROXIES to find the visitor behind Cloudflare", async () => {
    const { turnstileSiteKeyFor } = await loadTurnstile({ ...lan, TRUSTED_PROXIES: "173.245.48.0/20" });
    expect(turnstileSiteKeyFor(forwarded("203.0.113.9, 173.245.48.10"))).toBe("site");
  });
});

describe("skippingNetworks", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  async function wrapped() {
    const { skippingNetworks } = await loadTurnstile(lan);
    const { CLIENT_IP_HEADER } = await import("../client-ip");
    const blocked = new Response("captcha required", { status: 400 });
    const onRequest = vi.fn(async () => ({ response: blocked }));
    const plugin = skippingNetworks({ id: "captcha", onRequest } as never);
    const call = (ip?: string) =>
      plugin.onRequest!(
        new Request("http://rickhouse.test/api/auth/sign-in/username", {
          method: "POST",
          headers: ip ? { [CLIENT_IP_HEADER]: ip } : {},
        }),
        {} as never,
      );
    return { call, onRequest };
  }

  it("lets a listed network through without asking the plugin", async () => {
    const { call, onRequest } = await wrapped();
    expect(await call("192.168.1.50")).toBeUndefined();
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("hands everyone else to the captcha check", async () => {
    const { call, onRequest } = await wrapped();
    expect(await call("203.0.113.9")).toHaveProperty("response");
    expect(await call()).toHaveProperty("response");
    expect(onRequest).toHaveBeenCalledTimes(2);
  });
});
