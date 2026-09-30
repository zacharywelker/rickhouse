import "server-only";
import dns from "node:dns";
import net from "node:net";
import { Agent, fetch } from "undici";
import { ImageError, MAX_UPLOAD_BYTES } from "./images";

/**
 * Downloads a photo from a link someone pasted. The server makes the request,
 * so it must never be steered at the machines around it (the router, this
 * app's own database, cloud metadata): only http(s), and every address the
 * name resolves to is checked, including after each redirect.
 */

const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;

function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPrivateAddress(mapped[1]!);
  return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
}

const guardedLookup: typeof dns.lookup = ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((entry) => isPrivateAddress(entry.address))) {
      return callback(new ImageError("That link points at a private address, so it was not fetched."));
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
}) as typeof dns.lookup;

const agent = new Agent({ connect: { lookup: guardedLookup } });

export async function fetchRemoteImage(input: string): Promise<{ bytes: Buffer; contentType: string }> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ImageError("That does not look like a link.");
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new ImageError("Only http and https links work.");
    if (net.isIP(url.hostname.replace(/^\[|\]$/g, "")) && isPrivateAddress(url.hostname.replace(/^\[|\]$/g, ""))) {
      throw new ImageError("That link points at a private address, so it was not fetched.");
    }

    let response;
    try {
      response = await fetch(url, {
        dispatcher: agent,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: "image/*", "user-agent": "Rickhouse/1.0 (photo import)" },
      });
    } catch (error: unknown) {
      const cause = (error as { cause?: unknown }).cause;
      if (cause instanceof ImageError) throw cause;
      throw new ImageError("Could not download that link.");
    }

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) throw new ImageError("That link redirected nowhere.");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ImageError(`That link answered ${response.status}.`);
    }

    const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
    if (!contentType.startsWith("image/")) {
      await response.body?.cancel();
      throw new ImageError("That link is not a direct link to an image.");
    }

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body!) {
      size += chunk.byteLength;
      if (size > MAX_UPLOAD_BYTES) throw new ImageError(`Images have to be under ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`);
      chunks.push(Buffer.from(chunk));
    }
    return { bytes: Buffer.concat(chunks), contentType };
  }
  throw new ImageError("That link redirected too many times.");
}
