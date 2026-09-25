import { describe, expect, it } from "vitest";
import { normalizeUsername, usernameProblem } from "../accounts";
import { sameHostOrigins } from "../origins";
import {
  PASSWORD_MIN_LENGTH,
  generatePassword,
  isPlaceholderEmail,
  passwordProblem,
} from "../passwords";

describe("generatePassword", () => {
  it("makes four dash-separated groups of six unambiguous characters", () => {
    const password = generatePassword();
    expect(password).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{6}(-[a-km-zA-HJ-NP-Z2-9]{6}){3}$/);
  });

  it("clears the minimum length it asks of everyone else", () => {
    expect(passwordProblem(generatePassword())).toBeNull();
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(seen.size).toBe(200);
  });
});

describe("passwordProblem", () => {
  it("rejects anything shorter than the minimum", () => {
    expect(passwordProblem("x".repeat(PASSWORD_MIN_LENGTH - 1))).toMatch(/at least/);
    expect(passwordProblem("x".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  it("rejects absurdly long input", () => {
    expect(passwordProblem("x".repeat(129))).toMatch(/at most/);
  });
});

describe("usernames", () => {
  it("normalises to trimmed lowercase, as Better Auth stores them", () => {
    expect(normalizeUsername("  Zach.W ")).toBe("zach.w");
  });

  it("allows letters, numbers, dots and underscores", () => {
    expect(usernameProblem("zach_w.2")).toBeNull();
    expect(usernameProblem("zach w")).toMatch(/letters, numbers/);
    expect(usernameProblem("zach@home")).toMatch(/letters, numbers/);
  });

  it("enforces the length limits", () => {
    expect(usernameProblem("ab")).toMatch(/3–30/);
    expect(usernameProblem("a".repeat(31))).toMatch(/3–30/);
  });
});

describe("isPlaceholderEmail", () => {
  it("recognises the first-run admin's stand-in address", () => {
    expect(isPlaceholderEmail("admin@rickhouse.invalid")).toBe(true);
    expect(isPlaceholderEmail("Admin@Rickhouse.Invalid")).toBe(true);
    expect(isPlaceholderEmail("admin@example.com")).toBe(false);
  });
});

describe("sameHostOrigins", () => {
  it("trusts the host the request was sent to, over either scheme", () => {
    const headers = new Headers({ host: "rickhouse.example.com" });
    expect(sameHostOrigins(headers)).toEqual(["https://rickhouse.example.com", "http://rickhouse.example.com"]);
  });

  it("keeps the port", () => {
    expect(sameHostOrigins(new Headers({ host: "192.168.1.10:1964" }))).toContain("http://192.168.1.10:1964");
  });

  it("trusts nothing when the host is missing or malformed", () => {
    expect(sameHostOrigins(new Headers())).toEqual([]);
    expect(sameHostOrigins(new Headers({ host: "evil.com/path" }))).toEqual([]);
  });
});
