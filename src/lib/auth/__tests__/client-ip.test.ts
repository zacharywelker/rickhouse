import { describe, expect, it } from "vitest";
import { buildBlockList, clientIpFromForwardedFor } from "../client-ip";

const none = buildBlockList([]);
// A few of Cloudflare's published ranges, as someone behind it would list.
const cloudflare = buildBlockList(["173.245.48.0/20", "2400:cb00::/32"]);

describe("clientIpFromForwardedFor", () => {
  it("returns nothing without a header", () => {
    expect(clientIpFromForwardedFor(null, none)).toBeNull();
    expect(clientIpFromForwardedFor("", none)).toBeNull();
  });

  it("takes a lone address — a direct connection, which Next fills in", () => {
    expect(clientIpFromForwardedFor("192.168.1.50", none)).toBe("192.168.1.50");
  });

  it("takes the rightmost hop: the one the reverse proxy appended", () => {
    // NPM/Traefik append, so a client-supplied value ends up on the left.
    expect(clientIpFromForwardedFor("6.6.6.6, 198.51.100.7", none)).toBe("198.51.100.7");
  });

  it("skips trusted proxies further out, like Cloudflare", () => {
    expect(clientIpFromForwardedFor("6.6.6.6, 198.51.100.7, 173.245.48.10", cloudflare)).toBe("198.51.100.7");
    expect(clientIpFromForwardedFor("2001:db8::1, 2400:cb00::5", cloudflare)).toBe("2001:db8::1");
  });

  it("does not skip an untrusted hop just because it is private", () => {
    expect(clientIpFromForwardedFor("1.2.3.4, 10.0.0.9", none)).toBe("10.0.0.9");
  });

  it("unwraps IPv4-mapped IPv6 addresses", () => {
    expect(clientIpFromForwardedFor("::ffff:192.168.1.50", none)).toBe("192.168.1.50");
    expect(clientIpFromForwardedFor("198.51.100.7, ::ffff:173.245.48.10", cloudflare)).toBe("198.51.100.7");
  });

  it("stops at a malformed hop rather than trusting what's left of it", () => {
    expect(clientIpFromForwardedFor("1.2.3.4, not-an-ip", none)).toBeNull();
  });

  it("falls back to the leftmost hop when every hop is trusted", () => {
    expect(clientIpFromForwardedFor("173.245.48.1, 173.245.48.2", cloudflare)).toBe("173.245.48.1");
  });
});

describe("buildBlockList", () => {
  it("accepts addresses and ranges in both families", () => {
    const list = buildBlockList(["10.0.0.0/8", "203.0.113.5", "fc00::/7", "::1"]);
    expect(list.check("10.1.2.3", "ipv4")).toBe(true);
    expect(list.check("203.0.113.5", "ipv4")).toBe(true);
    expect(list.check("203.0.113.6", "ipv4")).toBe(false);
    expect(list.check("fd12::1", "ipv6")).toBe(true);
  });

  it("rejects entries that are not addresses or ranges", () => {
    expect(() => buildBlockList(["cloudflare"])).toThrow(/not an IP address/);
    expect(() => buildBlockList(["10.0.0.0/33"])).toThrow(/not an IP address/);
    expect(() => buildBlockList(["10.0.0.0/x"])).toThrow(/not an IP address/);
  });
});
