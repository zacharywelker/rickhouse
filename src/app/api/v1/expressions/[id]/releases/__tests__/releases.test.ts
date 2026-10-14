import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.fn();
const saveRelease = vi.fn();

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/releases-store", () => ({ saveRelease: (...args: unknown[]) => saveRelease(...args) }));

import { POST } from "../route";
import { PATCH } from "../[releaseId]/route";

const request = (method: string, body: unknown) =>
  new NextRequest("https://rickhouse.example.com/api/v1/expressions/10/releases", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const add = (body: unknown, id = "10") => POST(request("POST", body), { params: Promise.resolve({ id }) });
const change = (body: unknown, id = "10", releaseId = "3") =>
  PATCH(request("PATCH", body), { params: Promise.resolve({ id, releaseId }) });

const saved = { id: "3", name: "2024-01", year: "2024", proof: "", ageYears: "", ageMonths: "", ageDays: "", ageStatement: "", msrp: "" };

beforeEach(() => {
  vi.resetAllMocks();
  getCurrentUser.mockResolvedValue({ id: 7 });
  saveRelease.mockResolvedValue({ ok: true, release: saved });
});

describe("POST /api/v1/expressions/:id/releases", () => {
  it("adds a release for the caller, turning numbers and nulls into the strings the form takes", async () => {
    const res = await add({ name: "2024-01", year: 2024, proof: null });
    expect(res.status).toBe(201);
    expect(saveRelease).toHaveBeenCalledWith(7, 10, null, { name: "2024-01", year: "2024", proof: "" });
  });

  it("refuses a field the phone may not set", async () => {
    const res = await add({ name: "x", photoPath: "a.jpg" });
    expect(res.status).toBe(422);
    expect(saveRelease).not.toHaveBeenCalled();
  });

  it("needs a signed-in user", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await add({ name: "x" })).status).toBe(401);
  });

  it("passes the store's refusals through with their code", async () => {
    saveRelease.mockResolvedValue({ ok: false, status: 409, code: "name_taken", message: "dup" });
    const res = await add({ name: "x" });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("name_taken");
  });

  it("a label id that is not a number is not found", async () => {
    expect((await add({ name: "x" }, "abc")).status).toBe(404);
  });
});

describe("PATCH /api/v1/expressions/:id/releases/:releaseId", () => {
  it("changes only what is sent", async () => {
    const res = await change({ msrp: "99.99" });
    expect(res.status).toBe(200);
    expect(saveRelease).toHaveBeenCalledWith(7, 10, 3, { msrp: "99.99" });
  });

  it("an empty body is refused", async () => {
    expect((await change({})).status).toBe(422);
    expect(saveRelease).not.toHaveBeenCalled();
  });

  it("a release that is not the caller's is not found", async () => {
    saveRelease.mockResolvedValue({ ok: false, status: 404, code: "not_found", message: "That release is gone." });
    expect((await change({ name: "y" })).status).toBe(404);
  });
});
