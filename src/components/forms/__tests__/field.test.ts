import { describe, expect, it } from "vitest";
import { initialFieldValues } from "@/lib/forms/values";
import type { FieldSpec } from "@/lib/admin/types";

const numberField: FieldSpec = { kind: "number", name: "proof", label: "Proof" };

describe("initialFieldValues", () => {
  // Drizzle returns `numeric` as a string padded to the column scale. A number
  // input showing "108.00" for a proof reads like a price.
  it.each([
    ["108.00", "108"],
    ["54.50", "54.5"],
    ["1500.00", "1500"],
    ["0.10", "0.1"],
    ["750", "750"],
    ["69.99", "69.99"],
    ["-12.50", "-12.5"],
  ])("trims the padding on %s", (input, expected) => {
    expect(initialFieldValues([numberField], { proof: input }).proof).toBe(expected);
  });

  it("leaves text fields exactly as stored", () => {
    const spec: FieldSpec = { kind: "text", name: "batch", label: "Batch" };
    expect(initialFieldValues([spec], { batch: "B524" }).batch).toBe("B524");
  });

  it("reads a null as blank rather than the string 'null'", () => {
    expect(initialFieldValues([numberField], { proof: null }).proof).toBe("");
  });

  it("applies a default only when creating", () => {
    const spec: FieldSpec = { kind: "number", name: "sizeMl", label: "Size", defaultValue: "750" };
    expect(initialFieldValues([spec], null).sizeMl).toBe("750");
    expect(initialFieldValues([spec], { sizeMl: null }).sizeMl).toBe("");
  });

  it("treats an unset checkbox as false, not undefined", () => {
    const spec: FieldSpec = { kind: "checkbox", name: "isCaskStrength", label: "Cask strength" };
    expect(initialFieldValues([spec], null).isCaskStrength).toBe(false);
    expect(initialFieldValues([spec], { isCaskStrength: true }).isCaskStrength).toBe(true);
  });

  it("falls back to the first option for a select", () => {
    const spec: FieldSpec = {
      kind: "select",
      name: "status",
      label: "Status",
      options: [
        { value: "owned", label: "Owned" },
        { value: "open", label: "Open" },
      ],
    };
    expect(initialFieldValues([spec], null).status).toBe("owned");
    expect(initialFieldValues([spec], { status: "open" }).status).toBe("open");
  });

  it("reads a stored yes/no as its option, so editing does not clear it", () => {
    const spec: FieldSpec = {
      kind: "select",
      name: "isChillFiltered",
      label: "Chill Filtered",
      options: [
        { value: "", label: "Unknown" },
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
    };
    expect(initialFieldValues([spec], { isChillFiltered: true }).isChillFiltered).toBe("true");
    expect(initialFieldValues([spec], { isChillFiltered: false }).isChillFiltered).toBe("false");
    expect(initialFieldValues([spec], { isChillFiltered: null }).isChillFiltered).toBe("");
  });
});
