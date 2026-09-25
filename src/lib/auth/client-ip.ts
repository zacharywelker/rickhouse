import { BlockList, isIP } from "node:net";

/**
 * The header Better Auth reads the client IP from (rate limiting, session
 * records). The /api/auth route sets it from X-Forwarded-For and discards
 * any copy the browser sent, so it only ever holds our own answer.
 */
export const CLIENT_IP_HEADER = "x-rickhouse-client-ip";

/** "::ffff:10.0.0.1" -> "10.0.0.1", so IPv4 ranges match mapped addresses. */
function unmap(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  return mapped?.[1] ?? address;
}

function familyOf(address: string): "ipv4" | "ipv6" | null {
  const version = isIP(address);
  return version === 4 ? "ipv4" : version === 6 ? "ipv6" : null;
}

/** Throws on an entry that is neither an address nor a CIDR range. */
export function buildBlockList(entries: readonly string[]): BlockList {
  const list = new BlockList();
  for (const entry of entries) {
    const [rawAddress, rawPrefix] = entry.split("/");
    const address = unmap(rawAddress ?? "");
    const family = familyOf(address);
    const prefix = rawPrefix === undefined ? undefined : Number(rawPrefix);
    const maxPrefix = family === "ipv4" ? 32 : 128;
    if (!family || (prefix !== undefined && (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix))) {
      throw new Error(`"${entry}" is not an IP address or CIDR range`);
    }
    if (prefix === undefined) list.addAddress(address, family);
    else list.addSubnet(address, prefix, family);
  }
  return list;
}

/**
 * Picks the client out of an X-Forwarded-For chain.
 *
 * Each proxy appends the address it received the request from, so the
 * rightmost entry is what the last proxy saw. When nothing sent the header,
 * Next.js fills it in with the socket's address, so a direct connection
 * lands here too. Walking right to left, entries inside `trusted` are
 * proxies further out (e.g. Cloudflare in front of Caddy) and are skipped;
 * the first address outside it is the client. Anything to its left was
 * written by the client and could say anything.
 *
 * The limit: a client that connects *directly* and sends its own header is
 * believed, because Next doesn't append the socket address when the header
 * already exists. Only machines that can reach the app port without the
 * proxy (normally the LAN) can do that.
 */
export function clientIpFromForwardedFor(header: string | null, trusted: BlockList): string | null {
  if (!header) return null;
  const hops = header
    .split(",")
    .map((hop) => unmap(hop.trim()))
    .filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i -= 1) {
    const hop = hops[i] as string;
    const family = familyOf(hop);
    // A malformed hop means the chain can't be trusted from here on.
    if (!family) return null;
    if (!trusted.check(hop, family)) return hop;
  }
  // Every hop is a trusted proxy: the leftmost is as close to a client as it gets.
  return hops[0] ?? null;
}
