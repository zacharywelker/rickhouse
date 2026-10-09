import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.fn();
const updateBottle = vi.fn();

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/bottles/state", () => ({ updateBottle: (...args: unknown[]) => updateBottle(...args) }));
// The route also serves DELETE through the web action, which this file never calls.
vi.mock("@/app/(app)/bottles/actions", () => ({ deleteBottleAction: vi.fn() }));
// The GET half of the route reads these; the PATCH tests never reach them.
vi.mock("@/lib/releases-store", () => ({ releaseById: vi.fn() }));
vi.mock("@/lib/tasting-wheel-for", () => ({ categoryWheels: vi.fn() }));
vi.mock("@/lib/expressions/queries", () => ({ bottleImagesFor: vi.fn(), expressionLinks: vi.fn(), getBottle: vi.fn(), tastingNotesFor: vi.fn() }));

import { PATCH } from "../route";

function patch(id: string, body: unknown, contentType = "application/json") {
  return PATCH(
    new NextRequest(`https://rickhouse.example.com/api/v1/bottles/${id}`, {
      method: "PATCH",
      headers: { "content-type": contentType },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

const done = { ok: true, result: { fillPct: 60, isOpen: true, status: "open", dateOpened: "2026-09-14" } };

beforeEach(() => {
  vi.resetAllMocks();
  getCurrentUser.mockResolvedValue({ id: 7 });
  updateBottle.mockResolvedValue(done);
});

describe("PATCH /api/v1/bottles/:id", () => {
  it("still takes just a level, as the fill control sends it", async () => {
    const res = await patch("5", { fillPct: 60 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(done.result);
    expect(updateBottle).toHaveBeenCalledWith(5, 7, { fillPct: 60, dateOpened: undefined, ifOpenedCleared: undefined, columns: {} });
  });

  it("passes the bottle's own facts through their web validators", async () => {
    await patch("5", { pricePaid: 54.99, storeId: 3, dateAcquired: "2026-08-30", batch: " B24-03 ", barrelNumber: "", notes: null, releaseYear: "2024" });
    const columns = updateBottle.mock.calls[0]![2].columns;
    expect(columns).toEqual({ pricePaid: "54.99", storeId: 3, dateAcquired: "2026-08-30", batch: "B24-03", barrelNumber: null, notes: null, releaseYear: 2024 });
  });

  it("sends a cleared fact as null, and leaves out what was not sent", async () => {
    await patch("5", { pickName: null });
    expect(updateBottle.mock.calls[0]![2].columns).toEqual({ pickName: null });
  });

  it("passes the Opened date and the choice together with a level, as an undo sends them", async () => {
    await patch("5", { fillPct: 60, dateOpened: "2026-09-14" });
    expect(updateBottle).toHaveBeenCalledWith(5, 7, { fillPct: 60, dateOpened: "2026-09-14", ifOpenedCleared: undefined, columns: {} });
    await patch("5", { dateOpened: null, ifOpenedCleared: "seal" });
    expect(updateBottle.mock.calls[1]![2]).toMatchObject({ dateOpened: null, ifOpenedCleared: "seal" });
  });

  it.each([
    ["status, which follows the level", { status: "open" }],
    ["a field that isn't listed", { isFavorite: true }],
    ["an empty body", {}],
    ["a level out of range", { fillPct: 101 }],
    ["a price that isn't a number", { pricePaid: "cheap" }],
    ["a date acquired in the future", { dateAcquired: "2999-01-01" }],
    ["a year out of range", { releaseYear: 1200 }],
    ["a choice that isn't one", { dateOpened: null, ifOpenedCleared: "maybe" }],
  ])("refuses %s with a 422 and changes nothing", async (_name, body) => {
    const res = await patch("5", body);
    expect(res.status).toBe(422);
    expect(updateBottle).not.toHaveBeenCalled();
  });

  it("asks which when Opened is cleared on an open bottle", async () => {
    updateBottle.mockResolvedValue({ ok: false, code: "opened_cleared", message: "This bottle is open. Keep it open, or mark it sealed?" });
    const res = await patch("5", { dateOpened: null });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("opened_cleared");
    expect(body.error.fields).toEqual({ dateOpened: body.error.message });
  });

  it("names the field when the data layer refuses one", async () => {
    updateBottle.mockResolvedValue({ ok: false, code: "invalid", message: "Choose one of your stores.", field: "storeId" });
    const res = await patch("5", { storeId: 99 });
    expect((await res.json()).error.fields).toEqual({ storeId: "Choose one of your stores." });
  });

  it("answers 404 for someone else's bottle, signed out as 401, and a text/plain body as 415", async () => {
    updateBottle.mockResolvedValue(null);
    expect((await patch("5", { fillPct: 60 })).status).toBe(404);
    getCurrentUser.mockResolvedValue(null);
    expect((await patch("5", { fillPct: 60 })).status).toBe(401);
    getCurrentUser.mockResolvedValue({ id: 7 });
    expect((await patch("5", "fillPct=60", "text/plain")).status).toBe(415);
  });
});
