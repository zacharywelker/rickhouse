import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.fn();
const listLookup = vi.fn();
const createLookup = vi.fn();
const createStore = vi.fn();
const findDistilleryByName = vi.fn();
const getMashbillItem = vi.fn();
const distilleriesSave = vi.fn();
const mashbillsSave = vi.fn();

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/lookups", () => ({
  LOOKUP_KINDS: ["brands", "distilleries", "mashbills", "finishes", "stores"],
  CREATABLE_KINDS: ["brands", "distilleries", "finishes"],
  listLookup: (...args: unknown[]) => listLookup(...args),
  createLookup: (...args: unknown[]) => createLookup(...args),
  createStore: (...args: unknown[]) => createStore(...args),
  findDistilleryByName: (...args: unknown[]) => findDistilleryByName(...args),
  getMashbillItem: (...args: unknown[]) => getMashbillItem(...args),
}));
vi.mock("@/lib/admin/registry", () => ({
  RESOURCES: {
    distilleries: { save: (...args: unknown[]) => distilleriesSave(...args) },
    mashbills: { save: (...args: unknown[]) => mashbillsSave(...args) },
  },
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
  createStore.mockResolvedValue({ id: 4, name: "Total Wine", created: true });
  findDistilleryByName.mockResolvedValue(null);
  distilleriesSave.mockResolvedValue({ ok: true, id: 12 });
  mashbillsSave.mockResolvedValue({ ok: true, id: 31 });
  getMashbillItem.mockResolvedValue({ id: 31, name: "75% Corn, 25% Rye", detail: null });
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

describe("POST /api/v1/lookups/stores", () => {
  it("makes a store from its name and place", async () => {
    const res = await post("stores", { name: " Total Wine ", city: "Dallas", state: "TX", country: "", isOnline: false });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 4, name: "Total Wine", created: true });
    expect(createStore).toHaveBeenCalledWith(7, { name: "Total Wine", city: "Dallas", state: "TX", country: null, isOnline: false });
    expect(createLookup).not.toHaveBeenCalled();
  });

  it("takes a name alone, and an online store", async () => {
    expect((await post("stores", { name: "Binny's" })).status).toBe(201);
    expect(createStore).toHaveBeenLastCalledWith(7, { name: "Binny's", city: null, state: null, country: null, isOnline: false });
    await post("stores", { name: "Caskers", isOnline: true });
    expect(createStore).toHaveBeenLastCalledWith(7, expect.objectContaining({ isOnline: true }));
  });

  it("returns the store already at that name and place with a 200", async () => {
    createStore.mockResolvedValue({ id: 2, name: "total wine", created: false });
    const res = await post("stores", { name: "Total Wine", city: "Austin", state: "TX" });
    expect(res.status).toBe(200);
    expect((await res.json()).created).toBe(false);
  });

  it.each([
    ["no name", {}],
    ["a blank name", { name: "  " }],
    ["a city over 80 characters", { name: "X", city: "x".repeat(81) }],
    ["a field the phone doesn't send", { name: "X", url: "https://x.com" }],
  ])("refuses %s with a 422", async (_n, body) => {
    expect((await post("stores", body)).status).toBe(422);
    expect(createStore).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/lookups/distilleries with details", () => {
  const details = { name: "Bowmore", country: "Scotland", region: "Islay", city: "Bowmore", isDefunct: false };

  it("saves through the web's distillery rules and reports it as new", async () => {
    const res = await post("distilleries", details);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 12, name: "Bowmore", created: true });
    expect(distilleriesSave).toHaveBeenCalledWith(details, null, 7);
    expect(createLookup).not.toHaveBeenCalled();
  });

  it("hands back one with that name without saving or overwriting", async () => {
    findDistilleryByName.mockResolvedValue({ id: 3, name: "Bowmore" });
    const res = await post("distilleries", details);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 3, name: "Bowmore", created: false });
    expect(distilleriesSave).not.toHaveBeenCalled();
  });

  it("still takes a name alone the old way", async () => {
    await post("distilleries", { name: "Port" });
    expect(createLookup).toHaveBeenCalledWith("distilleries", 7, "Port");
    expect(distilleriesSave).not.toHaveBeenCalled();
  });

  it.each([
    ["a region that isn't Scotch", { ...details, region: "Atlantis" }],
    ["no country", { name: "Bowmore", region: "Islay" }],
    ["a field the phone may not set", { ...details, slug: "x" }],
    ["an unknown field", { ...details, owner: 1 }],
  ])("refuses %s with a 422", async (_n, body) => {
    expect((await post("distilleries", body)).status).toBe(422);
    expect(distilleriesSave).not.toHaveBeenCalled();
  });

  it("passes the web's own error and field messages through", async () => {
    distilleriesSave.mockResolvedValue({ ok: false, error: "Nope.", fieldErrors: { founded: "That is too early." } });
    const res = await post("distilleries", { ...details, founded: 1700 });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatchObject({ message: "Nope.", fields: { founded: "That is too early." } });
  });
});

describe("POST /api/v1/lookups/mashbills", () => {
  const recipe = { grains: [{ grain: "Corn", percent: 75 }, { grain: "Rye", percent: 25 }] };

  it("saves a recipe through the web's mashbill rules and returns it as the picker shows it", async () => {
    const res = await post("mashbills", recipe);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 31, name: "75% Corn, 25% Rye", created: true });
    expect(mashbillsSave).toHaveBeenCalledWith({ grains: JSON.stringify(recipe.grains) }, null, 7);
  });

  it("sends no grains as an empty list, for a secret or generic one", async () => {
    await post("mashbills", { isSecret: true, name: "Buffalo Trace Wheated" });
    expect(mashbillsSave).toHaveBeenCalledWith({ isSecret: true, name: "Buffalo Trace Wheated", grains: "[]" }, null, 7);
  });

  it("passes the web's rule failures through as a 422", async () => {
    mashbillsSave.mockResolvedValue({ ok: false, error: "Add at least one ingredient.", fieldErrors: { grains: "Add at least one ingredient." } });
    const res = await post("mashbills", {});
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toEqual({ grains: "Add at least one ingredient." });
  });

  it.each([
    ["grains that aren't a list", { grains: "corn" }],
    ["a percent that isn't a number", { grains: [{ grain: "Corn", percent: "75" }] }],
    ["an unknown field", { ...recipe, ownerId: 2 }],
  ])("refuses %s before saving", async (_n, body) => {
    expect((await post("mashbills", body)).status).toBe(422);
    expect(mashbillsSave).not.toHaveBeenCalled();
  });

  it("still needs a signed-in caller", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await post("mashbills", recipe)).status).toBe(401);
  });
});
