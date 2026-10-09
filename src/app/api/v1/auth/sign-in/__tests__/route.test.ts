import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const signInUsername = vi.fn();
const reserveAttempt = vi.fn();
const clearAttempts = vi.fn();
const ipLimited = vi.fn();

vi.mock("@/lib/auth/server", () => ({ getAuth: async () => ({ api: { signInUsername } }) }));
vi.mock("@/lib/auth/request-ip", () => ({ clientIpOf: () => "203.0.113.9" }));
vi.mock("@/lib/auth/app-sign-in", () => ({
  attemptKey: (name: string) => `key:${name.toLowerCase()}`,
  reserveAttempt: (...args: unknown[]) => reserveAttempt(...args),
  clearAttempts: (...args: unknown[]) => clearAttempts(...args),
  ipLimited: (...args: unknown[]) => ipLimited(...args),
}));

import { POST } from "../route";

function post(body: unknown) {
  return POST(
    new NextRequest("https://rickhouse.example.com/api/v1/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const betterAuthSays = (status: number, body: object, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

beforeEach(() => {
  vi.resetAllMocks();
  ipLimited.mockReturnValue(false);
  reserveAttempt.mockResolvedValue({ allowed: true, state: {} });
});

describe("POST /api/v1/auth/sign-in", () => {
  it("passes a successful sign-in through with its token header, and clears the back-off", async () => {
    signInUsername.mockResolvedValue(betterAuthSays(200, { token: "t", user: { id: "1" } }, { "set-auth-token": "tok" }));
    const res = await post({ username: "Zach", password: "right" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-auth-token")).toBe("tok");
    expect(clearAttempts).toHaveBeenCalledWith("key:zach");
  });

  it("passes the second-step answer through", async () => {
    signInUsername.mockResolvedValue(betterAuthSays(200, { twoFactorRedirect: true }, { "set-cookie": "rickhouse.two_factor=x; Path=/" }));
    const res = await post({ username: "zach", password: "right" });
    expect((await res.json()).twoFactorRedirect).toBe(true);
    expect(res.headers.get("set-cookie")).toContain("two_factor");
  });

  it("answers a wrong password, an unknown name and a malformed name the same way", async () => {
    const answers: Response[] = [];
    for (const [status, message] of [
      [401, "Invalid username or password"],
      [401, "Invalid username or password"],
      [422, "Username is too short"],
    ] as const) {
      signInUsername.mockResolvedValueOnce(betterAuthSays(status, { message }));
      answers.push(await post({ username: "someone", password: "wrong" }));
    }
    const bodies = await Promise.all(answers.map((r) => r.json()));
    expect(answers.map((r) => r.status)).toEqual([401, 401, 401]);
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(bodies[0]).toEqual({ error: { code: "invalid_credentials", message: "Wrong username or password." } });
    expect(clearAttempts).not.toHaveBeenCalled();
  });

  it("refuses while backed off, with how long to wait, without asking Better Auth", async () => {
    reserveAttempt.mockResolvedValue({ allowed: false, retryAfterSeconds: 90 });
    const res = await post({ username: "zach", password: "anything" });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("90");
    expect((await res.json()).error).toMatchObject({ code: "too_many_attempts", message: "Too many attempts. Try again in 2 minutes." });
    expect(signInUsername).not.toHaveBeenCalled();
  });

  it("refuses an address over its limit before counting anything against the account", async () => {
    ipLimited.mockReturnValue(true);
    const res = await post({ username: "zach", password: "x" });
    expect(res.status).toBe(429);
    expect(reserveAttempt).not.toHaveBeenCalled();
    expect(signInUsername).not.toHaveBeenCalled();
  });

  it("says so when the right password belongs to a deactivated account", async () => {
    signInUsername.mockResolvedValue(betterAuthSays(403, { message: "This account has been deactivated." }));
    const res = await post({ username: "zach", password: "right" });
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toBe("This account has been deactivated.");
  });

  it("treats a thrown Better Auth error like its answer", async () => {
    const { APIError } = await import("better-auth/api");
    signInUsername.mockRejectedValue(APIError.from("UNAUTHORIZED", { message: "Invalid username or password", code: "X" }));
    expect((await post({ username: "zach", password: "wrong" })).status).toBe(401);
  });

  it("rejects a body that isn't a username and password, and one too long to be real", async () => {
    expect((await post("nope")).status).toBe(400);
    expect((await post({ username: "zach" })).status).toBe(400);
    expect((await post({ username: "z".repeat(65), password: "x" })).status).toBe(401);
    expect((await post({ username: "zach", password: "x".repeat(129) })).status).toBe(401);
    expect(reserveAttempt).not.toHaveBeenCalled();
  });
});
