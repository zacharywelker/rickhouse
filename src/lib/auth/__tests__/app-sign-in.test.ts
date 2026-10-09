import { describe, expect, it, vi } from "vitest";

// Only the pure functions run here; the store itself needs a database.
vi.mock("@/db", () => ({ db: {} }));

import { attemptKey, ipLimited, nextAttempt, type AttemptState, type Verdict } from "../app-sign-in";

const T0 = new Date("2026-10-08T12:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

/** Runs attempts at the given times against one account, as the store would. */
function run(times: number[]): Verdict[] {
  let state: AttemptState | null = null;
  return times.map((t) => {
    const verdict = nextAttempt(state, at(t));
    if (verdict.allowed) state = verdict.state;
    return verdict;
  });
}

describe("nextAttempt", () => {
  it("lets four attempts through freely and locks on the fifth", () => {
    const v = run([0, 1, 2, 3, 4]);
    expect(v.every((x) => x.allowed)).toBe(true);
    expect(v.slice(0, 4).map((x) => x.allowed && x.state.lockedUntil)).toEqual([null, null, null, null]);
    expect(v[4]).toMatchObject({ allowed: true, state: { failures: 5, lockedUntil: at(4 + 60) } });
  });

  it("refuses during the lock, says how long is left, and doesn't extend it", () => {
    const v = run([0, 1, 2, 3, 4, 10, 30]);
    expect(v[5]).toEqual({ allowed: false, retryAfterSeconds: 54 });
    expect(v[6]).toEqual({ allowed: false, retryAfterSeconds: 34 });
  });

  it("doubles the lock after each attempt once it expires, up to fifteen minutes", () => {
    let state: AttemptState | null = null;
    let now = 0;
    const locks: number[] = [];
    for (let i = 0; i < 12; i++) {
      const v = nextAttempt(state, at(now));
      if (!v.allowed) throw new Error("should be allowed after the lock");
      state = v.state;
      if (state.lockedUntil) {
        locks.push((state.lockedUntil.getTime() - at(now).getTime()) / 1000);
        now = (state.lockedUntil.getTime() - T0.getTime()) / 1000;
      } else now += 1;
    }
    expect(locks).toEqual([60, 120, 240, 480, 900, 900, 900, 900]);
  });

  it("starts over after a quiet hour", () => {
    const v = run([0, 1, 2, 3, 4, 4 + 3600]);
    expect(v[5]).toMatchObject({ allowed: true, state: { failures: 1, lockedUntil: null } });
  });
});

describe("attemptKey", () => {
  it("treats case and padding the way sign-in does, and never holds the name", () => {
    expect(attemptKey(" Zach ")).toBe(attemptKey("zach"));
    expect(attemptKey("zach")).not.toContain("zach");
  });
});

describe("ipLimited", () => {
  it("allows five a minute per address, then refuses until the window passes", () => {
    const now = 1_000_000;
    const results = Array.from({ length: 6 }, (_, i) => ipLimited("203.0.113.9", now + i));
    expect(results).toEqual([false, false, false, false, false, true]);
    expect(ipLimited("203.0.113.10", now)).toBe(false);
    expect(ipLimited("203.0.113.9", now + 61_000)).toBe(false);
  });

  it("doesn't limit what it can't attribute", () => {
    expect(Array.from({ length: 10 }, () => ipLimited(null))).not.toContain(true);
  });
});
