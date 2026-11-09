import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRuleError } from "@/lib/admin/errors";

const remove = vi.fn();
vi.mock("@/lib/auth", () => ({ requireSession: async () => ({ id: 1, role: "user" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/registry", () => ({
  isResourceKey: (key: string) => key === "ingredients",
  RESOURCES: { ingredients: { singular: "Ingredient", remove: (...args: unknown[]) => remove(...args) } },
}));

import { deleteResourceAction } from "../actions";

// Braces matter: a beforeEach that returns a function has it run as teardown, which would call the mock.
beforeEach(() => {
  remove.mockReset();
});

describe("deleteResourceAction", () => {
  it("shows a rule error's own words", async () => {
    remove.mockRejectedValue(new AdminRuleError("2 labels use this ingredient"));
    expect(await deleteResourceAction("ingredients", 5)).toEqual({ ok: false, error: "2 labels use this ingredient" });
  });

  it("reports success when nothing throws", async () => {
    remove.mockResolvedValue(undefined);
    expect(await deleteResourceAction("ingredients", 5)).toEqual({ ok: true, message: "Ingredient deleted." });
    expect(remove).toHaveBeenCalledWith(5, 1);
  });
});
