import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.fn();
const listLookup = vi.fn();
const createLookup = vi.fn();

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/lookups", () => ({
  LOOKUP_KINDS: ["brands", "distilleries", "mashbills", "finishes", "stores"],
  CREATABLE_KINDS: ["brands", "distilleries", "finishes"],
  listLookup: (...args: unknown[]) => listLookup(...args),
  createLookup: (...args: unknown[]) => createLookup(...args),
}));

import { GET, POST } from "../route";

const ctx = (kind: string) => ({ params: Promise.resolve({ kind }) });
const get = (kind: string, query = "") => GET(new NextRequest(`https://rickhouse.example.com/api/v1/lookups/${kind}${query}`), ctx(kind));
const post = (kind: string, body: unknown, contentType = "application/json") =>
  POST(
    new NextRequest(`https://rickhouse.example.com/api/v1/lookups/${kind}`, {
      method: "POST",
      headers: { "content-type": contentType },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ctx(kind),
  );

beforeEach(() => {
  vi.resetAllMocks();
  getCurrentUser.mockResolvedValue({ id: 7 });
  listLookup.mockResolvedValue([{ id: 1, name: "Wild Turkey", detail: null }]);
  createLookup.mockResolvedValue({ id: 9, name: "Port", created: true });
});

describe("GET /api/v1/lookups/:kind", () => {
  it("lists the caller's own, narrowed by q", async () => {
    const res = await get("distilleries", "?q=wild");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ id: 1, name: "Wild Turkey", detail: null }] });
    expect(listLookup).toHaveBeenCalledWith("distilleries", 7, "wild");
  });

  it("answers 404 for a list that does not exist, and 401 signed out", async () => {
    expect((await get("tags")).status).toBe(404);
    expect(listLookup).not.toHaveBeenCalled();
    getCurrentUser.mockResolvedValue(null);
    expect((await get("brands")).status).toBe(401);
  });
});

describe("POST /api/v1/lookups/:kind", () => {
  it("creates by name and says it was new", async () => {
    const res = await post("finishes", { name: "  Port " });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 9, name: "Port", created: true });
    expect(createLookup).toHaveBeenCalledWith("finishes", 7, "Port");
  });

  it("returns the existing one with a 200 when the name is already there", async () => {
    createLookup.mockResolvedValue({ id: 3, name: "port", created: false });
    const res = await post("finishes", { name: "Port" });
    expect(res.status).toBe(200);
    expect((await res.json()).created).toBe(false);
  });

  it.each(["mashbills", "stores"])("will not create %s from the phone", async (kind) => {
    const res = await post(kind, { name: "X" });
    expect(res.status).toBe(405);
    expect(createLookup).not.toHaveBeenCalled();
  });

  it.each([
    ["no name", {}],
    ["a blank name", { name: "   " }],
    ["a name over 120 characters", { name: "x".repeat(121) }],
    ["an extra field", { name: "X", country: "France" }],
  ])("refuses %s with a 422", async (_n, body) => {
    expect((await post("brands", body)).status).toBe(422);
    expect(createLookup).not.toHaveBeenCalled();
  });

  it("refuses a text/plain body, an unknown list and signed out", async () => {
    expect((await post("brands", "name=X", "text/plain")).status).toBe(415);
    expect((await post("tags", { name: "X" })).status).toBe(404);
    getCurrentUser.mockResolvedValue(null);
    expect((await post("brands", { name: "X" })).status).toBe(401);
    expect(createLookup).not.toHaveBeenCalled();
  });
});
