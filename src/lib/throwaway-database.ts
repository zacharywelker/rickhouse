/**
 * Which databases a script or test may wipe or fill.
 *
 * A destructive tool must not decide this from the host alone: the real database is usually on `localhost` too
 * (the Docker port mapping, or a dev machine), so a host check passes for exactly the database it exists to protect.
 * The name is what tells them apart. A throwaway database has a name with a `test`, `tourney`, `scratch`, `proto`,
 * `e2e` or `audit` segment, set off by underscores or the ends of the name: `rickhouse_e2e`, `rickhouse_test` and
 * `scratch` pass; `rickhouse`, `rickhouse_prod`, `contest` and `latest` do not (a segment, not a substring).
 *
 * No Node or database imports, so scripts, Playwright and vitest can all use it.
 */

export const LOCAL_HOSTS: ReadonlyArray<string> = ["localhost", "127.0.0.1", "[::1]"];

const THROWAWAY_NAME = /(^|_)(test|tourney|scratch|proto|e2e|audit)(_|$)/;

/** Whether a database name is one of the throwaway kind. Says nothing about where the database is. */
export function isThrowawayName(name: string): boolean {
  return THROWAWAY_NAME.test(name);
}

/**
 * Throws unless the URL names a throwaway database on one of `hosts` (this machine, by default), with no `host=`
 * override that would send the connection somewhere else. The message names the database and host it refused,
 * never the credentials. Call it before anything that empties or seeds a database.
 */
export function assertThrowawayDatabase(url: string | undefined = process.env.DATABASE_URL, hosts: ReadonlyArray<string> = LOCAL_HOSTS): void {
  let name = "";
  let host = "";
  let local = false;
  try {
    const parsed = new URL(url ?? "");
    name = decodeURIComponent(parsed.pathname.slice(1));
    host = parsed.hostname;
    local = hosts.includes(host) && !parsed.searchParams.has("host");
  } catch {
    // Not a URL: refused below.
  }
  if (!local || !isThrowawayName(name)) {
    throw new Error(
      `DATABASE_URL must be a local throwaway database (a name with a test, tourney, scratch, proto, e2e or audit segment, on this machine); got "${name || "none"}" on ${host || "no host"}. ` +
        "Create one (for example `create database rickhouse_e2e`), run `npm run db:migrate` against it, and point DATABASE_URL at it.",
    );
  }
}
