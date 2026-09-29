import "server-only";
import tls from "node:tls";
import { EnvHttpProxyAgent, fetch, type Dispatcher } from "undici";
import { TTB_INTERMEDIATE_PEM } from "./intermediate";
import { colaDetailUrl, colaFormUrl, registryUrl } from "./ids";
import { ColaNotFoundError, ColaParseError, parseColaDetail, parseColaForm, type ColaForm, type ColaRecord } from "./parse";

/**
 * Talks to TTB's public COLA registry (SPEC M11). The only outbound call the
 * app makes on a person's behalf, so it is deliberately narrow:
 *
 * - Only the registry's hosts. Redirects and scraped image links are checked
 *   against them hop by hop (`registryUrl`), so a changed page cannot point a
 *   fetch anywhere else.
 * - At most one request a second from this server, whoever is asking. It is
 *   a public government service, not a CDN.
 * - Size caps and timeouts on every response.
 * - TLS is verified. TTB's server omits its intermediate certificate, which
 *   is supplied here for these requests only (see intermediate.ts).
 */

const TIMEOUT_MS = 20_000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // MAX_UPLOAD_BYTES in images.ts
const MAX_IMAGES = 12;
const MAX_REDIRECTS = 3;
const MIN_GAP_MS = 1_000;
const USER_AGENT = "Rickhouse/1.0 (self-hosted collection tracker; COLA lookup by TTB ID)";

/** Anything that stopped a lookup other than "no such COLA" or "page changed". */
export class ColaLookupError extends Error {}
export { ColaNotFoundError, ColaParseError };

let dispatcher: Dispatcher | undefined;

/**
 * Node's trust store plus TTB's missing intermediate. Honours HTTPS_PROXY /
 * NO_PROXY when set, and connects directly otherwise.
 */
function registryDispatcher(): Dispatcher {
  if (dispatcher) return dispatcher;
  // `getCACertificates("default")` includes NODE_EXTRA_CA_CERTS; rootCertificates is the fallback on older Node.
  const roots = typeof tls.getCACertificates === "function" ? tls.getCACertificates("default") : tls.rootCertificates;
  const trust = { ca: [...roots, TTB_INTERMEDIATE_PEM] };
  dispatcher = new EnvHttpProxyAgent({ connect: trust, requestTls: trust });
  return dispatcher;
}

let nextSlot = 0;

/** Waits for this server's next turn at the registry. */
async function turn(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

async function readCapped(body: AsyncIterable<Uint8Array> | null, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  if (!body) return Buffer.alloc(0);
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > limit) throw new ColaLookupError("The COLA registry sent more data than expected.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * One lookup's worth of requests. The registry ties label images to the
 * session that loaded the form page, so the cookies it sets are kept for
 * the lookup and dropped with it.
 */
class RegistrySession {
  private cookies = new Map<string, string>();

  async get(start: URL, limit: number): Promise<{ body: Buffer; contentType: string }> {
    let url = start;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await turn();
      let response;
      try {
        response = await fetch(url, {
          dispatcher: registryDispatcher(),
          redirect: "manual",
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: {
            "user-agent": USER_AGENT,
            ...(this.cookies.size > 0
              ? { cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ") }
              : {}),
          },
        });
      } catch (error: unknown) {
        throw new ColaLookupError(`Could not reach the COLA registry: ${describe(error)}`);
      }

      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(";", 1)[0]!;
        const eq = pair.indexOf("=");
        if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }

      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const next = registryUrl(new URL(response.headers.get("location") ?? "", url).toString());
        if (!next) throw new ColaLookupError("The COLA registry redirected somewhere unexpected.");
        url = next;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new ColaLookupError(`The COLA registry answered ${response.status}.`);
      }
      return {
        body: await readCapped(response.body, limit),
        contentType: (response.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase(),
      };
    }
    throw new ColaLookupError("The COLA registry redirected too many times.");
  }

  async page(url: string): Promise<string> {
    const { body } = await this.get(new URL(url), MAX_PAGE_BYTES);
    // The registry declares ISO-8859-1.
    return new TextDecoder("latin1").decode(body);
  }
}

function describe(error: unknown): string {
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  if (error instanceof Error && error.name === "TimeoutError") return "it took too long to answer.";
  return cause?.code ?? cause?.message ?? (error instanceof Error ? error.message : String(error));
}

export type FetchedLabelImage = { panel: string | null; bytes: Buffer; contentType: string };

export type ColaLookup = {
  record: ColaRecord & Omit<ColaForm, "images">;
  images: FetchedLabelImage[];
  /** Panels that could not be downloaded; the rest of the lookup still counts. */
  skipped: string[];
};

/**
 * Reads one COLA: the record page, the printable form, and — when asked —
 * its label images. Throws ColaNotFoundError, ColaParseError or
 * ColaLookupError.
 */
export async function lookupCola(ttbId: string, options: { images: boolean }): Promise<ColaLookup> {
  const session = new RegistrySession();
  const record = parseColaDetail(await session.page(colaDetailUrl(ttbId)), ttbId);
  const form = parseColaForm(await session.page(colaFormUrl(ttbId)), ttbId);
  const { images: links, ...codes } = form;

  const images: FetchedLabelImage[] = [];
  const skipped: string[] = [];
  if (options.images) {
    for (const link of links.slice(0, MAX_IMAGES)) {
      const name = link.panel ?? "label image";
      const url = registryUrl(link.href);
      if (!url) {
        skipped.push(`${name} (not a registry link)`);
        continue;
      }
      try {
        const { body, contentType } = await session.get(url, MAX_IMAGE_BYTES);
        // An expired session gets an HTML error page with a 200.
        if (!contentType.startsWith("image/")) {
          skipped.push(`${name} (${contentType || "not an image"})`);
          continue;
        }
        images.push({ panel: link.panel, bytes: body, contentType });
      } catch (error: unknown) {
        if (!(error instanceof ColaLookupError)) throw error;
        skipped.push(`${name} (${error.message})`);
      }
    }
    if (links.length > MAX_IMAGES) skipped.push(`${links.length - MAX_IMAGES} more panels`);
  }

  return { record: { ...record, ...codes }, images, skipped };
}
