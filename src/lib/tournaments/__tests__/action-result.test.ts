import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Failure } from "../state";
import { parseInput, toActionResult, toFailure } from "../action-result";
import type { TournamentView } from "../view";

/** `fail` from state.ts would load the database client; a literal keeps this test pure. */
const fail = (status: Failure["status"], message: string, fields?: Record<string, string>): Failure => ({ ok: false, status, message, ...(fields ? { fields } : {}) });

const view = { id: 3, name: "Spring" } as unknown as TournamentView;

describe("toActionResult", () => {
  it("passes a view through", () => {
    expect(toActionResult({ ok: true, view })).toEqual({ ok: true, view });
  });

  it("turns a Failure into error and fieldErrors", () => {
    expect(toActionResult(fail(422, "Name the tournament.", { name: "Name the tournament." }))).toEqual({
      ok: false,
      error: "Name the tournament.",
      fieldErrors: { name: "Name the tournament." },
    });
  });

  it("omits fieldErrors when the Failure has none, and keeps a 404's message", () => {
    const out = toActionResult(fail(404, "That tournament is gone."));
    expect(out).toEqual({ ok: false, error: "That tournament is gone." });
    expect("fieldErrors" in out).toBe(false);
  });
});

describe("toFailure", () => {
  it("keeps a 409's message", () => {
    expect(toFailure(fail(409, "Only a draft can be changed."))).toEqual({ ok: false, error: "Only a draft can be changed." });
  });
});

describe("parseInput", () => {
  const schema = z.object({ name: z.string().min(1, "Name it."), size: z.number().min(2, "Too small.") }).strict();

  it("returns the parsed data", () => {
    expect(parseInput(schema, { name: "a", size: 3 })).toEqual({ ok: true, data: { name: "a", size: 3 } });
  });

  it("uses the first issue as the error and maps each field", () => {
    expect(parseInput(schema, { name: "", size: 1 })).toEqual({
      ok: false,
      error: "Name it.",
      fieldErrors: { name: "Name it.", size: "Too small." },
    });
  });

  it("answers a non-object input without throwing", () => {
    expect(parseInput(schema, null).ok).toBe(false);
  });
});
