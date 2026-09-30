import { buildBlockList, clientIpFromForwardedFor } from "./client-ip";
import { env } from "@/lib/env";

let trustedProxies: ReturnType<typeof buildBlockList> | undefined;

/**
 * The visitor's IP for a request that reached the app: the sign-in route
 * and the pages that render its forms read it the same way, so both agree
 * on who is asking.
 */
export function clientIpOf(headers: Headers): string | null {
  trustedProxies ??= buildBlockList(env().TRUSTED_PROXIES);
  return clientIpFromForwardedFor(headers.get("x-forwarded-for"), trustedProxies);
}
