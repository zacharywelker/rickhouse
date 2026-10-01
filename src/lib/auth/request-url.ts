import { env } from "@/lib/env";

/** "192.168.1.10:1964" -> "192.168.1.10"; null for anything that isn't a host. */
function hostnameOf(host: string): string | null {
  try {
    return new URL(`http://${host.trim()}`).hostname;
  } catch {
    return null;
  }
}

/**
 * Whether the request was sent to `appHostname`. Reverse proxies and tunnels
 * route on that name and pass it on, as Host or, when they rewrite Host, as
 * X-Forwarded-Host.
 */
export function sentToAppUrl(headers: Headers, appHostname: string): boolean {
  const hosts = [headers.get("host"), ...(headers.get("x-forwarded-host") ?? "").split(",")];
  return hosts.some((host) => host && hostnameOf(host) === appHostname);
}

/**
 * Whether the browser used HTTPS: the proxy in front says so in
 * X-Forwarded-Proto, or the request went to an https APP_URL's hostname.
 * The second covers a proxy that leaves the header out or reports its own
 * plain-HTTP hop, so the public address always counts as HTTPS.
 */
export function sentOverHttps(headers: Headers): boolean {
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto === "https") return true;
  const appUrl = env().APP_URL;
  return Boolean(appUrl?.startsWith("https://") && sentToAppUrl(headers, new URL(appUrl).hostname));
}

/**
 * Whether this request's cookies are marked Secure: COOKIE_SECURE is on and
 * the browser used HTTPS. Browsers drop Secure cookies sent over plain HTTP,
 * so on the LAN address (http://<server>:1964) sign-in would succeed and
 * then bounce straight back to the login page.
 */
export function secureCookiesFor(headers: Headers): boolean {
  return env().COOKIE_SECURE && sentOverHttps(headers);
}
