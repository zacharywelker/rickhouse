/**
 * Origins Better Auth should accept for a request, besides APP_URL.
 *
 * Better Auth rejects state-changing requests whose Origin it does not
 * trust. A home server is often reached several ways at once — a LAN IP, a
 * hostname, a domain through Caddy or Cloudflare — so rather than make
 * people list every one, trust whatever host the request itself was sent
 * to. That is the same same-origin rule Next applies to server actions: a
 * page on another site cannot make the browser send our Host with its own
 * Origin, so cross-site requests still fail.
 *
 * Both schemes are allowed because a TLS-terminating proxy usually talks
 * plain http to the app; the browser's Origin says https while the request
 * we see does not.
 */
export function sameHostOrigins(headers: Headers): string[] {
  const host = headers.get("host");
  if (!host || !/^[a-z0-9.\-:[\]]+$/i.test(host)) return [];
  return [`https://${host}`, `http://${host}`];
}
