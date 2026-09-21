import { describe, expect, it } from "vitest";
import { createSessionToken, passwordMatches, verifySessionToken } from "../session";

const SECRET = "test-secret-at-least-32-characters-long-ok";

/**
 * Flip one character to a guaranteed-different one. Mutating the *last*
 * base64url character is not enough: it carries only two significant bits, so
 * a quarter of random edits are no edit at all.
 */
function corruptAt(value: string, index: number): string {
  const current = value[index];
  const replacement = current === "A" ? "B" : "A";
  return `${value.slice(0, index)}${replacement}${value.slice(index + 1)}`;
}

describe("session tokens", () => {
  it("round-trips a freshly minted token", async () => {
    const token = await createSessionToken(SECRET, 30);
    await expect(verifySessionToken(token, SECRET)).resolves.toBe(true);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken(SECRET, 30);
    await expect(verifySessionToken(token, `${SECRET}-rotated`)).resolves.toBe(false);
  });

  it("rejects a tampered payload", async () => {
    const token = await createSessionToken(SECRET, 30);
    const [body = "", signature = ""] = token.split(".");
    await expect(verifySessionToken(`${corruptAt(body, 2)}.${signature}`, SECRET)).resolves.toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken(SECRET, 30);
    const dot = token.indexOf(".");
    await expect(verifySessionToken(corruptAt(token, dot + 3), SECRET)).resolves.toBe(false);
    // Truncation must fail too, not just substitution.
    await expect(verifySessionToken(token.slice(0, -4), SECRET)).resolves.toBe(false);
  });

  it("rejects an expired token", async () => {
    // A zero-day TTL expires in the same second it is issued.
    const token = await createSessionToken(SECRET, 0);
    await expect(verifySessionToken(token, SECRET)).resolves.toBe(false);
  });

  it("rejects junk", async () => {
    await expect(verifySessionToken(undefined, SECRET)).resolves.toBe(false);
    await expect(verifySessionToken("", SECRET)).resolves.toBe(false);
    await expect(verifySessionToken("no-dot", SECRET)).resolves.toBe(false);
    await expect(verifySessionToken(".onlysig", SECRET)).resolves.toBe(false);
  });
});

describe("passwordMatches", () => {
  it("accepts the configured password and nothing else", () => {
    expect(passwordMatches("correct horse", "correct horse")).toBe(true);
    expect(passwordMatches("correct hors", "correct horse")).toBe(false);
    expect(passwordMatches("correct horse ", "correct horse")).toBe(false);
    expect(passwordMatches("", "correct horse")).toBe(false);
  });
});
