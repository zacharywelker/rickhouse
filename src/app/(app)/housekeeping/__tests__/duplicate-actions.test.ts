import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));
const requireSession = vi.fn(async () => ({ id: 42 }));
vi.mock("@/lib/auth", () => ({ requireSession: () => requireSession() }));
const mergeReference = vi.fn();
vi.mock("@/lib/housekeeping/merge-reference", () => {
  class HousekeepingMergeError extends Error {
    constructor(
      readonly code: "same" | "gone" | "blocked",
      message: string,
    ) {
      super(message);
    }
  }
  return { HousekeepingMergeError, mergeReference: (...args: unknown[]) => mergeReference(...args) };
});
const dismiss = vi.fn(async () => {});
vi.mock("@/lib/housekeeping/dismissals", () => ({ dismiss: (...args: unknown[]) => dismiss(...(args as [])) }));

import { HousekeepingMergeError } from "@/lib/housekeeping/merge-reference";
import { dismissPairAction, mergePairAction } from "../duplicate-actions";

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ id: 42 });
});

const merge = (input: Record<string, unknown>) =>
  mergePairAction({ kind: "brands", survivorId: 3, removedId: 9, adopt: [], ...input } as Parameters<typeof mergePairAction>[0]);

describe("mergePairAction", () => {
  it.each([
    [{ kind: "categories" }],
    [{ kind: "" }],
    [{ survivorId: 0 }],
    [{ survivorId: -1 }],
    [{ removedId: 2.5 }],
    [{ removedId: "9" }],
    [{ survivorId: 9, removedId: 9 }],
  ])("refuses a bad request without touching the engine: %j", async (input) => {
    const result = await merge(input);
    expect(result.ok).toBe(false);
    expect(mergeReference).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("uses the signed-in account, never an owner from the request", async () => {
    mergeReference.mockResolvedValue({ survivorName: "A", removedName: "B", moves: [], adopted: [] });
    await merge({ ownerId: 7, adopt: ["notes"] });
    expect(mergeReference).toHaveBeenCalledWith(42, "brands", 3, 9, ["notes"]);
  });

  it("passes only strings through as the fields to adopt", async () => {
    mergeReference.mockResolvedValue({ survivorName: "A", removedName: "B", moves: [], adopted: [] });
    await merge({ adopt: ["notes", 5, null, { a: 1 }, "city"] });
    expect(mergeReference).toHaveBeenCalledWith(42, "brands", 3, 9, ["notes", "city"]);
    await merge({ adopt: "notes" });
    expect(mergeReference).toHaveBeenLastCalledWith(42, "brands", 3, 9, []);
  });

  it("says what moved, and refreshes the page", async () => {
    mergeReference.mockResolvedValue({
      survivorName: "Buffalo Trace",
      removedName: "Buffalo Trace Distillery",
      moves: [{ label: "labels", count: 3 }],
      adopted: [],
    });
    const result = await merge({ kind: "distilleries" });
    expect(result).toEqual({ ok: true, message: "Merged “Buffalo Trace Distillery” into “Buffalo Trace”. 3 labels moved." });
    expect(revalidatePath).toHaveBeenCalledWith("/housekeeping");
  });

  it("keeps the message short when nothing needed to move", async () => {
    mergeReference.mockResolvedValue({ survivorName: "A", removedName: "B", moves: [], adopted: [] });
    expect(await merge({})).toEqual({ ok: true, message: "Merged “B” into “A”." });
  });

  it.each([
    ["same", "Choose two different rows to merge.", "Choose two different rows to merge."],
    ["gone", "x", "That pair has already been merged or removed."],
    ["blocked", "Both brands have a label called “X”. Merge those labels first.", "Both brands have a label called “X”. Merge those labels first."],
  ] as const)("turns a %s refusal into a plain message", async (code, text, expected) => {
    mergeReference.mockRejectedValue(new HousekeepingMergeError(code, text));
    expect(await merge({})).toEqual({ ok: false, error: expected });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not leak an unexpected error", async () => {
    mergeReference.mockRejectedValue(new Error("connection refused to db.internal:5432"));
    const result = await merge({});
    expect(result).toEqual({ ok: false, error: "The merge did not go through. Nothing was changed." });
  });
});

describe("dismissPairAction", () => {
  const call = (input: Record<string, unknown>) =>
    dismissPairAction({ kind: "brands", aId: 9, bId: 3, ...input } as Parameters<typeof dismissPairAction>[0]);

  it("remembers the pair under the kind's scope, whichever way round the ids arrive", async () => {
    await call({});
    await call({ aId: 3, bId: 9 });
    expect(dismiss).toHaveBeenNthCalledWith(1, 42, "duplicate:brands", "3:9");
    expect(dismiss).toHaveBeenNthCalledWith(2, 42, "duplicate:brands", "3:9");
    expect(revalidatePath).toHaveBeenCalledWith("/housekeeping");
  });

  it("refuses an unknown kind, bad ids, and a pair of one", async () => {
    for (const input of [{ kind: "categories" }, { aId: 0 }, { bId: 1.5 }, { aId: 4, bId: 4 }]) {
      expect((await call(input)).ok).toBe(false);
    }
    expect(dismiss).not.toHaveBeenCalled();
  });
});
