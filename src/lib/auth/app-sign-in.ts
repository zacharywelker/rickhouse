import { createHash } from "node:crypto";
import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSignInAttempts } from "@/db/schema";

/**
 * Back-off for the iOS app's sign-in route, which has no Turnstile check. Attempts
 * are counted when they start, not when they fail, so a burst of parallel guesses
 * can't all pass a check made before any of them is recorded. A correct password
 * clears the count.
 */
export const FREE_ATTEMPTS = 5;
export const BASE_LOCK_SECONDS = 60;
export const MAX_LOCK_SECONDS = 15 * 60;
/** A quiet hour starts the count over. */
export const QUIET_RESET_SECONDS = 60 * 60;

export type AttemptState = { failures: number; lastAttemptAt: Date; lockedUntil: Date | null };
export type Verdict = { allowed: true; state: AttemptState } | { allowed: false; retryAfterSeconds: number };

/**
 * What happens to an account when someone starts an attempt. The fifth attempt
 * is still let through and locks the account for a minute; each attempt after a
 * lock expires doubles that, up to fifteen minutes. Attempts made during a lock
 * are refused without counting, so they can't extend it.
 */
export function nextAttempt(prev: AttemptState | null, now: Date): Verdict {
  if (prev?.lockedUntil && prev.lockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((prev.lockedUntil.getTime() - now.getTime()) / 1000) };
  }
  const quiet = !prev || now.getTime() - prev.lastAttemptAt.getTime() >= QUIET_RESET_SECONDS * 1000;
  const failures = quiet ? 1 : prev.failures + 1;
  const lockSeconds = Math.min(BASE_LOCK_SECONDS * 2 ** Math.max(0, failures - FREE_ATTEMPTS), MAX_LOCK_SECONDS);
  const lockedUntil = failures >= FREE_ATTEMPTS ? new Date(now.getTime() + lockSeconds * 1000) : null;
  return { allowed: true, state: { failures, lastAttemptAt: now, lockedUntil } };
}

/** Hashed so the table never holds the names strangers typed; lowercased like Better Auth's username lookup. */
export function attemptKey(username: string): string {
  return createHash("sha256").update(username.trim().toLowerCase().slice(0, 200)).digest("hex");
}

/**
 * Counts an attempt, or says how long to wait. The row is locked for the read and
 * the write, so concurrent attempts for one name take turns.
 */
export async function reserveAttempt(key: string, now = new Date()): Promise<Verdict> {
  const verdict = await db.transaction(async (tx) => {
    await tx.insert(appSignInAttempts).values({ key, failures: 0, lastAttemptAt: new Date(0) }).onConflictDoNothing();
    const [row] = await tx.select().from(appSignInAttempts).where(eq(appSignInAttempts.key, key)).for("update");
    const prev = row && row.failures > 0 ? row : null;
    const result = nextAttempt(prev, now);
    if (result.allowed) await tx.update(appSignInAttempts).set(result.state).where(eq(appSignInAttempts.key, key));
    return result;
  });
  // Rows for names nobody tries again would pile up otherwise.
  if (Math.random() < 0.01) await pruneAttempts(now).catch(() => {});
  return verdict;
}

export async function clearAttempts(key: string): Promise<void> {
  await db.delete(appSignInAttempts).where(eq(appSignInAttempts.key, key));
}

async function pruneAttempts(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - QUIET_RESET_SECONDS * 1000);
  await db.delete(appSignInAttempts).where(sql`${lt(appSignInAttempts.lastAttemptAt, cutoff)}`);
}

/**
 * Attempts per address, any username: the same 5 a minute Better Auth's
 * limiter gives the web sign-in. Held in memory, like that one.
 * ponytail: per process, resets on restart; the per-account back-off above is what survives one.
 */
const IP_WINDOW_MS = 60_000;
const IP_MAX = 5;
const seen = new Map<string, number[]>();

/** True when this address is over its limit; otherwise records the attempt. */
export function ipLimited(ip: string | null, now = Date.now()): boolean {
  // Without an address everyone would share one bucket (see the /api/auth route), so only the account back-off applies.
  if (!ip) return false;
  const recent = (seen.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (recent.length >= IP_MAX) {
    seen.set(ip, recent);
    return true;
  }
  recent.push(now);
  seen.set(ip, recent);
  if (seen.size > 10_000) for (const [key, times] of seen) if (!times.some((t) => now - t < IP_WINDOW_MS)) seen.delete(key);
  return false;
}
