import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.fn();
const patchLabel = vi.fn();
const pickerLabel = vi.fn();
const returning = vi.fn();

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/expressions/picker", () => ({ pickerLabel: (...args: unknown[]) => pickerLabel(...args) }));
vi.mock("@/lib/expressions/label-patch", async () => {
  const { expressionSchema } = await import("@/lib/expressions/schema");
  return {
    labelFactsSchema: expressionSchema.pick({ brandId: true, categoryId: true, name: true, proof: true, ageYears: true, ageStatement: true, sizeMl: true, msrp: true, upc: true }),
    patchLabel: (...args: unknown[]) => patchLabel(...args),
  };
});
// The scanner's barcode path writes with one conditional update.
vi.mock("@/db", () => ({ db: { update: () => ({ set: () => ({ where: () => ({ returning }) }) }) } }));
vi.mock("@/lib/expressions/queries", () => ({ bottlesOfLabel: vi.fn(), expressionLinks: vi.fn(), getExpression: vi.fn(), tastingNotesForLabel: vi.fn() }));
vi.mock("@/lib/releases-store", () => ({ expressionReleaseList: vi.fn() }));
vi.mock("@/lib/tasting-wheel-for", () => ({ categoryWheels: vi.fn() }));

import { PATCH } from "../route";

function patch(id: string, body: unknown, contentType = "application/json") {
  return PATCH(
    new NextRequest(`https://rickhouse.example.com/api/v1/expressions/${id}`, {
      method: "PATCH",
      headers: { "content-type": contentType },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

const label = { id: 10, name: "Rare Breed", upc: null };

beforeEach(() => {
  vi.resetAllMocks();
  getCurrentUser.mockResolvedValue({ id: 7 });
  patchLabel.mockResolvedValue({ ok: true });
  pickerLabel.mockResolvedValue(label);
  returning.mockResolvedValue([{ id: 10 }]);
});

describe("PATCH /api/v1/expressions/:id: the scanner's barcode", () => {
  it("a body of only upc takes the old path and never reaches the label edit", async () => {
    const res = await patch("10", { upc: "012345678905" });
    expect(res.status).toBe(200);
    expect(patchLabel).not.toHaveBeenCalled();
    expect(returning).toHaveBeenCalled();
  });

  it("still answers 409 has_barcode when the label has a different code", async () => {
    returning.mockResolvedValue([]);
    pickerLabel.mockResolvedValue({ ...label, upc: "999999999999" });
    const res = await patch("10", { upc: "012345678905" });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("has_barcode");
  });
});

describe("PATCH /api/v1/expressions/:id: editing the label", () => {
  it("passes facts through the web form's validators, partially", async () => {
    const res = await patch("10", { name: "  Rare Breed Barrel Proof ", proof: 116.8, msrp: "69.99", sizeMl: 1000 });
    expect(res.status).toBe(200);
    expect(patchLabel).toHaveBeenCalledWith(7, 10, { facts: { name: "Rare Breed Barrel Proof", proof: "116.8", msrp: "69.99", sizeMl: 1000 } });
  });

  it("changes the barcode inside a larger edit, and clears a fact sent as null", async () => {
    await patch("10", { upc: "012345678905", ageStatement: null });
    expect(patchLabel.mock.calls[0]![2].facts).toEqual({ upc: "012345678905", ageStatement: null });
  });

  it("takes a brand by name, and the three lists together, with a share the app read as null", async () => {
    await patch("10", {
      brand: "Wild Turkey",
      distilleries: [{ id: 3, amount: null, inferred: false }],
      mashbills: [{ id: 4, amount: 100, distilleryId: 3 }],
      finishes: [],
    });
    const arg = patchLabel.mock.calls[0]![2];
    expect(arg.brand).toBe("Wild Turkey");
    expect(arg.links.distilleries[0]).toMatchObject({ id: 3, amount: null });
    expect(arg.links.mashbills[0]).toMatchObject({ id: 4, amount: 100, distilleryId: 3 });
    expect(arg.links.finishes).toEqual([]);
  });

  it.each([
    ["an empty body", {}],
    ["a field that is not listed (slug)", { slug: "x" }],
    ["brandId and brand together", { brandId: 2, brand: "Other" }],
    ["only one of the three lists", { distilleries: [] }],
    ["the same distillery twice", { distilleries: [{ id: 3, amount: null }, { id: 3, amount: null }], mashbills: [], finishes: [] }],
    ["a barcode that is not 6 to 32 digits (inside an edit)", { name: "X", upc: "12" }],
    ["a proof out of range", { proof: 250 }],
    ["a blank name", { name: "   " }],
  ])("refuses %s with a 422 and saves nothing", async (_name, body) => {
    const res = await patch("10", body);
    expect(res.status).toBe(422);
    expect(patchLabel).not.toHaveBeenCalled();
  });

  it("answers 409 name_taken with the label it collides with", async () => {
    patchLabel.mockResolvedValue({ ok: false, kind: "name_taken", existing: { id: 20, title: "Wild Turkey Rare Breed Barrel Proof" } });
    const res = await patch("10", { name: "Rare Breed Barrel Proof" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("name_taken");
    expect(body.error.fields).toEqual({ name: "Already taken." });
    expect(body.existing).toEqual({ id: 20, title: "Wild Turkey Rare Breed Barrel Proof" });
  });

  it("names the field when the data layer refuses one, and 404s someone else's label", async () => {
    patchLabel.mockResolvedValue({ ok: false, kind: "invalid", field: "brandId", message: "Choose one of your brands." });
    const bad = await patch("10", { brandId: 99 });
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.fields).toEqual({ brandId: "Choose one of your brands." });
    patchLabel.mockResolvedValue({ ok: false, kind: "gone" });
    expect((await patch("10", { name: "X" })).status).toBe(404);
  });

  it("refuses signed out, and a text/plain body", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await patch("10", { name: "X" })).status).toBe(401);
    getCurrentUser.mockResolvedValue({ id: 7 });
    expect((await patch("10", "name=X", "text/plain")).status).toBe(415);
    expect(patchLabel).not.toHaveBeenCalled();
  });
});
