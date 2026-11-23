import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));
const requireSession = vi.fn(async () => ({ id: 42 }));
vi.mock("@/lib/auth", () => ({ requireSession: () => requireSession() }));
const labelBelongsTo = vi.fn(async () => true);
vi.mock("@/lib/housekeeping/ttb-queries", () => ({
  TTB_SCOPE: "ttb",
  labelBelongsTo: (...args: unknown[]) => labelBelongsTo(...(args as [])),
}));
const dismiss = vi.fn(async () => {});
vi.mock("@/lib/housekeeping/dismissals", () => ({ dismiss: (...args: unknown[]) => dismiss(...(args as [])) }));

import { dismissTtbAction } from "../ttb-actions";

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ id: 42 });
  labelBelongsTo.mockResolvedValue(true);
  dismiss.mockResolvedValue(undefined);
});

const call = (input: Record<string, unknown>) =>
  dismissTtbAction({ expressionId: 7, name: "Old Forester 1920", ...input } as Parameters<typeof dismissTtbAction>[0]);

describe("dismissTtbAction", () => {
  it.each([[{ expressionId: 0 }], [{ expressionId: -1 }], [{ expressionId: 2.5 }], [{ expressionId: "7" }], [{ expressionId: null }]])(
    "refuses a bad id without touching the store: %j",
    async (input) => {
      expect((await call(input)).ok).toBe(false);
      expect(labelBelongsTo).not.toHaveBeenCalled();
      expect(dismiss).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("checks the label against the signed-in account and files the dismissal under that account", async () => {
    const result = await call({ ownerId: 99 });
    expect(labelBelongsTo).toHaveBeenCalledWith(42, 7);
    expect(dismiss).toHaveBeenCalledWith(42, "ttb", "7");
    expect(result).toEqual({ ok: true, message: "Marked “Old Forester 1920” as not on TTB. It won’t be listed again." });
    expect(revalidatePath).toHaveBeenCalledWith("/housekeeping");
  });

  it("says the label is gone, and stores nothing, when it is not the account's", async () => {
    labelBelongsTo.mockResolvedValue(false);
    expect(await call({})).toEqual({ ok: false, error: "That label is gone." });
    expect(dismiss).not.toHaveBeenCalled();
    // The dead row should leave the list, so the page is refreshed even though nothing was stored.
    expect(revalidatePath).toHaveBeenCalledWith("/housekeeping");
  });

  it("only echoes the name, tidied and capped, and copes with a missing one", async () => {
    expect((await call({ name: "  Spaced   " })).ok && (await call({ name: "  Spaced   " }))).toMatchObject({ message: expect.stringContaining("“Spaced”") });
    const long = await call({ name: "x".repeat(500) });
    expect(long.ok && long.message.length).toBeLessThan(260);
    expect(await call({ name: undefined })).toMatchObject({ ok: true, message: expect.stringContaining("“that label”") });
    expect(dismiss).toHaveBeenCalledWith(42, "ttb", "7");
  });

  it("does not leak an unexpected error", async () => {
    dismiss.mockRejectedValue(new Error("connection refused to db.internal:5432"));
    expect(await call({})).toEqual({ ok: false, error: "That did not save. Try again." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
