import { describe, expect, it } from "vitest";
import { expressionSchema } from "../schema";

// The catalog form posts the label as JSON, so a checkbox arrives as a real boolean, not "on".
describe("isAdditiveFree", () => {
  const label = { brandId: "1", categoryId: "2", name: "X" };
  const parse = (isAdditiveFree: unknown) => expressionSchema.safeParse({ ...label, isAdditiveFree });

  it.each([
    [true, true],
    [false, null], // unchecked is unknown, never false
    ["on", true],
    ["true", true],
    ["false", false],
    ["", null],
    [undefined, null],
  ])("reads %j as %j", (input, expected) => {
    const result = parse(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isAdditiveFree).toBe(expected);
  });
});
