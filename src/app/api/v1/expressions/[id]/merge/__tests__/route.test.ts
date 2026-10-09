import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.fn();
const mergeLabels = vi.fn();
const pickerLabel = vi.fn();

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/expressions/picker", () => ({ pickerLabel: (...args: unknown[]) => pickerLabel(...args) }));
vi.mock("@/lib/expressions/merge", async () => {
  class MergeError extends Error {
    constructor(readonly code: "same" | "gone") {
      super(code);
    }
  }
  return {
    KEEPABLE_FACTS: ["categoryId", "proof", "ageYears", "ageStatement", "sizeMl", "msrp", "upc"],
    MergeError,
    mergeLabels: (...args: unknown[]) => mergeLabels(...args),
  };
});

import { POST } from "../route";
import { MergeError } from "@/lib/expressions/merge";

function post(id: string, body: unknown, contentType = "application/json") {
  return POST(
    new NextRequest(`https://rickhouse.example.com/api/v1/expressions/${id}/merge`, {
      method: "POST",
      headers: { "content-type": contentType },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  getCurrentUser.mockResolvedValue({ id: 7 });
  pickerLabel.mockResolvedValue({ id: 20, name: "Rare Breed Barrel Proof" });
});

describe("POST /api/v1/expressions/:id/merge", () => {
  it("merges for the signed-in account and answers with the surviving label and the counts", async () => {
    mergeLabels.mockResolvedValue({ intoId: 20, bottles: 2, tastings: 4 });
    const res = await post("10", { into: 20, keepMine: ["proof", "msrp"] });
    expect(res.status).toBe(200);
    expect(mergeLabels).toHaveBeenCalledWith(7, 10, 20, ["proof", "msrp"]);
    expect(await res.json()).toEqual({ label: { id: 20, name: "Rare Breed Barrel Proof" }, bottles: 2, tastings: 4 });
  });

  it("keeps nothing of the removed label's facts when keepMine is left out", async () => {
    mergeLabels.mockResolvedValue({ intoId: 20, bottles: 0, tastings: 0 });
    await post("10", { into: 20 });
    expect(mergeLabels).toHaveBeenCalledWith(7, 10, 20, []);
  });

  it("refuses when signed out, without merging", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await post("10", { into: 20 })).status).toBe(401);
    expect(mergeLabels).not.toHaveBeenCalled();
  });

  it("refuses a body that isn't declared JSON, before reading it", async () => {
    const res = await post("10", "into=20", "text/plain");
    expect(res.status).toBe(415);
    expect(mergeLabels).not.toHaveBeenCalled();
  });

  it.each([
    ["no target", {}],
    ["a non-integer target", { into: "20" }],
    ["a fact that cannot be carried over", { into: 20, keepMine: ["name"] }],
    ["an unknown field", { into: 20, deleteBottles: true }],
  ])("rejects %s with a 422 and merges nothing", async (_label, body) => {
    const res = await post("10", body);
    expect(res.status).toBe(422);
    expect(mergeLabels).not.toHaveBeenCalled();
  });

  it("says a label cannot merge into itself", async () => {
    mergeLabels.mockRejectedValue(new MergeError("same"));
    const res = await post("10", { into: 10 });
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toEqual({ into: "Choose a different label." });
  });

  it("answers 404 for a label that is not the caller's, or does not exist", async () => {
    mergeLabels.mockRejectedValue(new MergeError("gone"));
    expect((await post("10", { into: 20 })).status).toBe(404);
  });

  it("answers 404 for a path id that is not a number", async () => {
    expect((await post("abc", { into: 20 })).status).toBe(404);
    expect(mergeLabels).not.toHaveBeenCalled();
  });
});
