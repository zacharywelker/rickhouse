import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** env() is cached, so each case imports a fresh module. */
async function loadRequestUrl(vars: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgres://rickhouse:rickhouse@localhost:5432/rickhouse");
  vi.stubEnv("SESSION_SECRET", "x".repeat(32));
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  return import("../request-url");
}

const behindProxy = { APP_URL: "https://rickhouse.example.com", COOKIE_SECURE: "true" };
const request = (headers: Record<string, string>) => new Headers(headers);
const lan = { host: "192.168.1.152:1964", "x-forwarded-proto": "http" };

describe("secureCookiesFor", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it("keeps plain cookies on the LAN address over HTTP, where Secure ones are dropped", async () => {
    const { secureCookiesFor } = await loadRequestUrl(behindProxy);
    expect(secureCookiesFor(request(lan))).toBe(false);
    // Next fills X-Forwarded-Proto in, but not always before middleware runs.
    expect(secureCookiesFor(request({ host: "192.168.1.152:1964" }))).toBe(false);
  });

  it("marks cookies Secure when the proxy reports HTTPS", async () => {
    const { secureCookiesFor } = await loadRequestUrl(behindProxy);
    expect(secureCookiesFor(request({ host: "rickhouse.lan", "x-forwarded-proto": "https" }))).toBe(true);
    expect(secureCookiesFor(request({ host: "rickhouse.lan", "x-forwarded-proto": "HTTPS, http" }))).toBe(true);
  });

  it("always marks cookies Secure at an https APP_URL, whatever the proxy reports", async () => {
    const { secureCookiesFor } = await loadRequestUrl(behindProxy);
    // A tunnel into Caddy over plain HTTP: Caddy reports its own hop.
    expect(secureCookiesFor(request({ host: "rickhouse.example.com", "x-forwarded-proto": "http" }))).toBe(true);
    // A tunnel that rewrites Host passes the public name on.
    expect(secureCookiesFor(request({ ...lan, "x-forwarded-host": "rickhouse.example.com" }))).toBe(true);
  });

  it("never marks cookies Secure with COOKIE_SECURE off", async () => {
    const { secureCookiesFor } = await loadRequestUrl({ ...behindProxy, COOKIE_SECURE: "false" });
    expect(secureCookiesFor(request({ host: "rickhouse.example.com", "x-forwarded-proto": "https" }))).toBe(false);
  });

  it("goes by X-Forwarded-Proto alone without APP_URL", async () => {
    const { secureCookiesFor } = await loadRequestUrl({ COOKIE_SECURE: "true", APP_URL: "" });
    expect(secureCookiesFor(request({ host: "rickhouse.example.com", "x-forwarded-proto": "https" }))).toBe(true);
    expect(secureCookiesFor(request({ host: "rickhouse.example.com", "x-forwarded-proto": "http" }))).toBe(false);
  });
});

describe("sentToAppUrl", () => {
  it("matches the hostname in Host or X-Forwarded-Host, ignoring port and case", async () => {
    const { sentToAppUrl } = await loadRequestUrl({});
    expect(sentToAppUrl(request({ host: "RickHouse.example.com:443" }), "rickhouse.example.com")).toBe(true);
    expect(sentToAppUrl(request({ host: "x", "x-forwarded-host": "a.test, rickhouse.example.com" }), "rickhouse.example.com")).toBe(true);
    expect(sentToAppUrl(request({ host: "192.168.1.152:1964" }), "rickhouse.example.com")).toBe(false);
    expect(sentToAppUrl(request({ host: "bad host/" }), "rickhouse.example.com")).toBe(false);
  });
});
