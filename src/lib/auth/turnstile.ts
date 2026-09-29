import type { captcha } from "better-auth/plugins";
import { CLIENT_IP_HEADER, buildBlockList, listIncludes } from "./client-ip";
import { clientIpOf } from "./request-ip";
import { env } from "@/lib/env";

let skipNetworks: ReturnType<typeof buildBlockList> | undefined;

/** Whether the Turnstile keys are both set. */
export function turnstileConfigured(): boolean {
  const { TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY } = env();
  return Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY);
}

/** "192.168.1.10:1964" -> "192.168.1.10"; null for anything that isn't a host. */
function hostnameOf(host: string): string | null {
  try {
    return new URL(`http://${host.trim()}`).hostname;
  } catch {
    return null;
  }
}

/**
 * Whether the request was sent to APP_URL's hostname. Reverse proxies and
 * tunnels route on that name and pass it on, as Host or, when they rewrite
 * Host, as X-Forwarded-Host.
 */
function sentToAppUrl(headers: Headers, appHostname: string): boolean {
  const hosts = [headers.get("host"), ...(headers.get("x-forwarded-host") ?? "").split(",")];
  return hosts.some((host) => host && hostnameOf(host) === appHostname);
}

/**
 * True for a visitor who signs in without the check: coming from
 * TURNSTILE_SKIP_NETWORKS, to an address other than APP_URL. The second
 * half matters behind a proxy that lets visitors pick the address it
 * forwards (Nginx Proxy Manager trusts X-Real-IP from Cloudflare, for one):
 * they still arrive at APP_URL. Without APP_URL there is no telling, so
 * nobody skips.
 */
export function turnstileSkippedFor(ip: string | null, headers: Headers): boolean {
  const appUrl = env().APP_URL;
  if (!appUrl) return false;
  skipNetworks ??= buildBlockList(env().TURNSTILE_SKIP_NETWORKS);
  return listIncludes(skipNetworks, ip) && !sentToAppUrl(headers, new URL(appUrl).hostname);
}

/**
 * The Turnstile site key for the browser, or null when this visitor gets no
 * check: the keys aren't both set, or they're skipped (see turnstileSkippedFor).
 */
export function turnstileSiteKeyFor(headers: Headers): string | null {
  if (!turnstileConfigured() || turnstileSkippedFor(clientIpOf(headers), headers)) return null;
  return env().TURNSTILE_SITE_KEY ?? null;
}

type CaptchaPlugin = ReturnType<typeof captcha>;

/**
 * Better Auth's captcha plugin, letting skipped visitors through without a
 * token. The IP comes from CLIENT_IP_HEADER, which the /api/auth route sets
 * itself and never takes from the browser.
 */
export function skippingNetworks(plugin: CaptchaPlugin): CaptchaPlugin {
  return {
    ...plugin,
    onRequest: async (request, ctx) =>
      turnstileSkippedFor(request.headers.get(CLIENT_IP_HEADER), request.headers)
        ? undefined
        : plugin.onRequest(request, ctx),
  };
}
