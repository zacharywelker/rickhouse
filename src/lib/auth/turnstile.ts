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

/** True for a visitor inside TURNSTILE_SKIP_NETWORKS, who signs in without the check. */
export function turnstileSkippedFor(ip: string | null): boolean {
  skipNetworks ??= buildBlockList(env().TURNSTILE_SKIP_NETWORKS);
  return listIncludes(skipNetworks, ip);
}

/**
 * The Turnstile site key for the browser, or null when this visitor gets no
 * check: the keys aren't both set, or they're coming from a skipped network.
 */
export function turnstileSiteKeyFor(headers: Headers): string | null {
  if (!turnstileConfigured() || turnstileSkippedFor(clientIpOf(headers))) return null;
  return env().TURNSTILE_SITE_KEY ?? null;
}

type CaptchaPlugin = ReturnType<typeof captcha>;

/**
 * Better Auth's captcha plugin, letting visitors from TURNSTILE_SKIP_NETWORKS
 * through without a token. The IP comes from CLIENT_IP_HEADER, which the
 * /api/auth route sets itself and never takes from the browser.
 */
export function skippingNetworks(plugin: CaptchaPlugin): CaptchaPlugin {
  return {
    ...plugin,
    onRequest: async (request, ctx) =>
      turnstileSkippedFor(request.headers.get(CLIENT_IP_HEADER)) ? undefined : plugin.onRequest(request, ctx),
  };
}
