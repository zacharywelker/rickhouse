import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getCurrentUser, life, heats, transitions, queries, rankingFor, field } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    getCurrentUser: vi.fn(),
    life: { createTournament: fn(), updateDraft: fn(), deleteTournament: fn() },
    transitions: { startTournament: fn(), resetRound: fn(), recordHeat: fn(), undoHeat: fn(), withdrawEntry: fn() },
    heats: { removeDraftEntry: fn(), moveHeat: fn(), drawHeat: fn(), setGlasses: fn(), moveEntry: fn(), swapEntries: fn(), promoteEntry: fn(), renameHeat: fn() },
    queries: { getTournament: fn(), listTournaments: fn() },
    rankingFor: vi.fn(),
    field: { fieldCandidates: fn(), labelCandidates: fn() },
  };
});

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/tournaments/lifecycle", () => life);
vi.mock("@/lib/tournaments/heats", () => heats);
vi.mock("@/lib/tournaments/transitions", () => transitions);
vi.mock("@/lib/tournaments/queries", () => queries);
vi.mock("@/lib/tournaments/field", () => field);
vi.mock("@/lib/tournaments/ranking-query", () => ({ rankingFor: (...a: unknown[]) => rankingFor(...a) }));

import * as list from "../route";
import * as one from "../[id]/route";
import * as start from "../[id]/start/route";
import * as reset from "../[id]/reset/route";
import * as draw from "../[id]/draw/route";
import * as heat from "../[id]/heats/[heatId]/route";
import * as result from "../[id]/heats/[heatId]/result/route";
import * as glass from "../[id]/heats/[heatId]/glass/route";
import * as moveHeatRoute from "../[id]/heats/[heatId]/move/route";
import * as move from "../[id]/entries/[entryId]/move/route";
import * as swap from "../[id]/entries/[entryId]/swap/route";
import * as withdraw from "../[id]/entries/[entryId]/withdraw/route";
import * as promote from "../[id]/entries/[entryId]/route";
import * as ranking from "../ranking/route";
import * as fieldRoute from "../field/route";
import * as fieldLabels from "../field/labels/route";

const view = { id: 3, name: "Spring" };

function call(handler: (r: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>, method: string, params: Record<string, string>, body?: unknown, type = "application/json") {
  return handler(
    new NextRequest("https://rickhouse.example.com/api/v1/tournaments", {
      method,
      headers: body === undefined ? {} : { "content-type": type },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve(params) },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  getCurrentUser.mockResolvedValue({ id: 7 });
});

/** Every route: [name, handler, method, path params, a valid body (undefined for none)]. */
const routes: [string, Parameters<typeof call>[0], string, Record<string, string>, unknown][] = [
  ["POST /tournaments", list.POST as never, "POST", {}, { name: "Spring", heatSize: 4, entries: [] }],
  ["GET /tournaments/:id", one.GET as never, "GET", { id: "3" }, undefined],
  ["PATCH /tournaments/:id", one.PATCH as never, "PATCH", { id: "3" }, { name: "x" }],
  ["DELETE /tournaments/:id", one.DELETE as never, "DELETE", { id: "3" }, undefined],
  ["POST start", start.POST as never, "POST", { id: "3" }, {}],
  ["POST reset", reset.POST as never, "POST", { id: "3" }, {}],
  ["POST draw", draw.POST as never, "POST", { id: "3" }, {}],
  ["PATCH heat", heat.PATCH as never, "PATCH", { id: "3", heatId: "5" }, { label: "x" }],
  ["POST result", result.POST as never, "POST", { id: "3", heatId: "5" }, { ranking: [1, 2] }],
  ["DELETE result", result.DELETE as never, "DELETE", { id: "3", heatId: "5" }, undefined],
  ["PUT glass", glass.PUT as never, "PUT", { id: "3", heatId: "5" }, { assign: [{ entryId: 1, glass: "A" }, { entryId: 2, glass: "B" }] }],
  ["POST heat move", moveHeatRoute.POST as never, "POST", { id: "3", heatId: "5" }, { toSlot: 2 }],
  ["POST move", move.POST as never, "POST", { id: "3", entryId: "9" }, { toHeatId: 5 }],
  ["POST swap", swap.POST as never, "POST", { id: "3", entryId: "9" }, { withEntryId: 5 }],
  ["POST withdraw", withdraw.POST as never, "POST", { id: "3", entryId: "9" }, {}],
  ["PATCH entry", promote.PATCH as never, "PATCH", { id: "3", entryId: "9" }, { bottleId: 4 }],
  ["DELETE entry", promote.DELETE as never, "DELETE", { id: "3", entryId: "9" }, undefined],
];

describe("every tournament route", () => {
  it.each(routes)("%s asks for sign-in", async (_name, handler, method, params, body) => {
    getCurrentUser.mockResolvedValue(null);
    const res = await call(handler, method, params, body);
    expect(res.status).toBe(401);
  });

  it.each(routes.filter(([, , , p]) => "id" in p))("%s answers 404 for an id that is not a number", async (_name, handler, method, params, body) => {
    const res = await call(handler, method, { ...params, id: "abc" }, body);
    expect(res.status).toBe(404);
  });

  it.each(routes.filter(([, , method]) => method !== "GET" && method !== "DELETE"))("%s refuses a body that is not JSON", async (_name, handler, method, params) => {
    const res = await call(handler, method, params, "name=x", "application/x-www-form-urlencoded");
    expect(res.status).toBe(415);
  });
});

describe("the commands' answers become the API's", () => {
  it("maps 404, 409 and 422 failures to not_found, conflict and invalid, with the fields", async () => {
    transitions.recordHeat.mockResolvedValueOnce({ ok: false, status: 404, message: "That flight is gone." });
    let res = await call(result.POST as never, "POST", { id: "3", heatId: "5" }, { ranking: [1, 2] });
    expect([res.status, (await res.json()).error]).toEqual([404, { code: "not_found", message: "That flight is gone." }]);

    transitions.recordHeat.mockResolvedValueOnce({ ok: false, status: 409, message: "That flight already has a result." });
    res = await call(result.POST as never, "POST", { id: "3", heatId: "5" }, { ranking: [1, 2] });
    expect([res.status, (await res.json()).error.code]).toEqual([409, "conflict"]);

    transitions.recordHeat.mockResolvedValueOnce({ ok: false, status: 422, message: "Rank every bottle exactly once.", fields: { ranking: "Rank every bottle exactly once." } });
    res = await call(result.POST as never, "POST", { id: "3", heatId: "5" }, { ranking: [1, 2] });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toEqual({ code: "invalid", message: "Rank every bottle exactly once.", fields: { ranking: "Rank every bottle exactly once." } });
  });
});

describe("the list and create routes", () => {
  it("lists the caller's tournaments", async () => {
    queries.listTournaments.mockResolvedValue([{ id: 1 }]);
    const res = await list.GET();
    expect(res.status).toBe(200);
    expect(queries.listTournaments).toHaveBeenCalledWith(7);
    expect(await res.json()).toEqual({ tournaments: [{ id: 1 }] });
  });

  it("creates a draft with defaults filled in, and answers 201 with the id", async () => {
    life.createTournament.mockResolvedValue({ ok: true, id: 12 });
    const res = await call(list.POST as never, "POST", {}, { name: "  Spring  ", heatSize: 3, entries: [{ bottleId: 1 }, { expressionId: 2 }, { name: " Joe's pour " }] });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 12 });
    expect(life.createTournament).toHaveBeenCalledWith(
      7,
      { name: "Spring", heatSize: 3, seeding: "similar", groupOrder: ["proof", "mashbill", "distillery", "age", "finish"], blind: false, fieldNote: null },
      [{ bottleId: 1 }, { expressionId: 2 }, { name: "Joe's pour" }],
    );
  });

  it.each([
    ["a heat size of 7", { name: "x", heatSize: 7 }, "heatSize"],
    ["a heat size of 1", { name: "x", heatSize: 1 }, "heatSize"],
    ["no name", { heatSize: 3 }, "name"],
    ["a group order missing a key", { name: "x", heatSize: 3, groupOrder: ["proof", "mashbill"] }, "groupOrder"],
    ["a repeated key", { name: "x", heatSize: 3, groupOrder: ["proof", "proof", "distillery", "age", "finish"] }, "groupOrder"],
    ["an unknown seeding", { name: "x", heatSize: 3, seeding: "seeded" }, "seeding"],
    ["an entry of two kinds", { name: "x", heatSize: 3, entries: [{ bottleId: 1, name: "both" }] }, "entries"],
    ["a blank outside entry", { name: "x", heatSize: 3, entries: [{ name: "   " }] }, "entries"],
    ["an unknown field", { name: "x", heatSize: 3, color: "red" }, null],
  ])("refuses %s", async (_what, body, field) => {
    const res = await call(list.POST as never, "POST", {}, body);
    expect(res.status).toBe(422);
    if (field) expect(Object.keys((await res.json()).error.fields)).toContain(field);
    expect(life.createTournament).not.toHaveBeenCalled();
  });
});

describe("one tournament", () => {
  it("reads one, or answers 404 when it is not theirs", async () => {
    queries.getTournament.mockResolvedValueOnce(view).mockResolvedValueOnce(null);
    expect(await (await call(one.GET as never, "GET", { id: "3" })).json()).toEqual(view);
    expect(queries.getTournament).toHaveBeenCalledWith(7, 3);
    expect((await call(one.GET as never, "GET", { id: "3" })).status).toBe(404);
  });

  it("edits a draft, and refuses an empty change", async () => {
    life.updateDraft.mockResolvedValue({ ok: true, view });
    expect((await call(one.PATCH as never, "PATCH", { id: "3" }, {})).status).toBe(422);
    const res = await call(one.PATCH as never, "PATCH", { id: "3" }, { heatSize: 2, entries: [{ bottleId: 4 }] });
    expect(res.status).toBe(200);
    expect(life.updateDraft).toHaveBeenCalledWith(7, 3, { heatSize: 2, entries: [{ bottleId: 4 }] });
  });

  it("deletes", async () => {
    life.deleteTournament.mockResolvedValue({ ok: true });
    const res = await call(one.DELETE as never, "DELETE", { id: "3" });
    expect([res.status, await res.json()]).toEqual([200, { id: 3 }]);
    life.deleteTournament.mockResolvedValue({ ok: false, status: 409, message: "A running tournament cannot be deleted. Finish it first." });
    expect((await call(one.DELETE as never, "DELETE", { id: "3" })).status).toBe(409);
  });

  it.each([
    ["start", start, transitions.startTournament],
    ["reset", reset, transitions.resetRound],
  ])("%s takes an empty JSON object and refuses data", async (_name, mod, command) => {
    command.mockResolvedValue({ ok: true, view });
    expect((await call(mod.POST as never, "POST", { id: "3" }, {})).status).toBe(200);
    expect(command).toHaveBeenCalledWith(7, 3);
    expect((await call(mod.POST as never, "POST", { id: "3" }, { force: true })).status).toBe(422);
  });
});

describe("flights and entries", () => {
  it("draws a flight for the pourer", async () => {
    heats.drawHeat.mockResolvedValue({ ok: true, heat: { heatId: 5, glasses: [] } });
    const res = await call(draw.POST as never, "POST", { id: "3" }, {});
    expect([res.status, await res.json()]).toEqual([200, { heatId: 5, glasses: [] }]);
    expect(heats.drawHeat).toHaveBeenCalledWith(7, 3, undefined);
  });

  it("opens a chosen flight for pouring, and refuses a bad heatId", async () => {
    heats.drawHeat.mockResolvedValue({ ok: true, heat: { heatId: 5, glasses: [] } });
    expect((await call(draw.POST as never, "POST", { id: "3" }, { heatId: 5 })).status).toBe(200);
    expect(heats.drawHeat).toHaveBeenLastCalledWith(7, 3, 5);
    for (const heatId of [0, -1, 1.5, "5"]) expect((await call(draw.POST as never, "POST", { id: "3" }, { heatId })).status).toBe(422);
  });

  it("records a result by entry id or by glass, and not both or neither", async () => {
    transitions.recordHeat.mockResolvedValue({ ok: true, view });
    expect((await call(result.POST as never, "POST", { id: "3", heatId: "5" }, { ranking: [4, 3, 2, 1] })).status).toBe(200);
    expect(transitions.recordHeat).toHaveBeenLastCalledWith(7, 3, 5, { ranking: [4, 3, 2, 1] }, 7);
    expect((await call(result.POST as never, "POST", { id: "3", heatId: "5" }, { glasses: ["B", "A", "C"] })).status).toBe(200);
    expect(transitions.recordHeat).toHaveBeenLastCalledWith(7, 3, 5, { glasses: ["B", "A", "C"] }, 7);
    for (const bad of [{ ranking: [1, 2], glasses: ["A", "B"] }, {}, { ranking: [1] }, { ranking: [1, 2, 3, 4, 5, 6, 7] }, { glasses: ["A", "G"] }, { ranking: [1.5, 2] }]) {
      expect((await call(result.POST as never, "POST", { id: "3", heatId: "5" }, bad)).status).toBe(422);
    }
  });

  it("takes a result back", async () => {
    transitions.undoHeat.mockResolvedValue({ ok: true, view });
    expect((await call(result.DELETE as never, "DELETE", { id: "3", heatId: "5" })).status).toBe(200);
    expect(transitions.undoHeat).toHaveBeenCalledWith(7, 3, 5);
  });

  it("sets glasses, moves, withdraws, promotes and renames", async () => {
    for (const command of [heats.setGlasses, heats.moveEntry, heats.swapEntries, transitions.withdrawEntry, heats.promoteEntry, heats.renameHeat]) command.mockResolvedValue({ ok: true, view });
    const assign = [{ entryId: 1, glass: "A" }, { entryId: 2, glass: "B" }];
    expect((await call(glass.PUT as never, "PUT", { id: "3", heatId: "5" }, { assign })).status).toBe(200);
    expect(heats.setGlasses).toHaveBeenCalledWith(7, 3, 5, assign);
    expect((await call(move.POST as never, "POST", { id: "3", entryId: "9" }, { toHeatId: 6 })).status).toBe(200);
    expect(heats.moveEntry).toHaveBeenCalledWith(7, 3, 9, 6);
    expect((await call(swap.POST as never, "POST", { id: "3", entryId: "9" }, { withEntryId: 6 })).status).toBe(200);
    expect(heats.swapEntries).toHaveBeenCalledWith(7, 3, 9, 6);
    expect((await call(swap.POST as never, "POST", { id: "3", entryId: "9" }, { withEntryId: 0 })).status).toBe(422);
    expect((await call(swap.POST as never, "POST", { id: "3", entryId: "x" }, { withEntryId: 6 })).status).toBe(404);
    expect((await call(withdraw.POST as never, "POST", { id: "3", entryId: "9" }, {})).status).toBe(200);
    expect(transitions.withdrawEntry).toHaveBeenCalledWith(7, 3, 9);
    heats.removeDraftEntry.mockResolvedValue({ ok: true, view });
    expect((await call(promote.DELETE as never, "DELETE", { id: "3", entryId: "9" })).status).toBe(200);
    expect(heats.removeDraftEntry).toHaveBeenCalledWith(7, 3, 9);
    expect((await call(promote.DELETE as never, "DELETE", { id: "3", entryId: "x" })).status).toBe(404);
    heats.removeDraftEntry.mockResolvedValue({ ok: false, status: 409, error: "Only a draft can have bottles removed." });
    expect((await call(promote.DELETE as never, "DELETE", { id: "3", entryId: "9" })).status).toBe(409);
    expect((await call(promote.PATCH as never, "PATCH", { id: "3", entryId: "9" }, { expressionId: 4 })).status).toBe(200);
    expect(heats.promoteEntry).toHaveBeenCalledWith(7, 3, 9, { expressionId: 4 });
    expect((await call(promote.PATCH as never, "PATCH", { id: "3", entryId: "9" }, { bottleId: 1, expressionId: 4 })).status).toBe(422);
    expect((await call(heat.PATCH as never, "PATCH", { id: "3", heatId: "5" }, { label: null })).status).toBe(200);
    expect(heats.renameHeat).toHaveBeenCalledWith(7, 3, 5, null);
    expect((await call(heat.PATCH as never, "PATCH", { id: "3", heatId: "5" }, { label: "x".repeat(81) })).status).toBe(422);
    heats.moveHeat.mockResolvedValue({ ok: true, view });
    expect((await call(moveHeatRoute.POST as never, "POST", { id: "3", heatId: "5" }, { toSlot: 2 })).status).toBe(200);
    expect(heats.moveHeat).toHaveBeenCalledWith(7, 3, 5, 2);
    for (const bad of [{ toSlot: 0 }, { toSlot: 1.5 }, { toSlot: "2" }, {}, { toSlot: 2, extra: 1 }]) {
      expect((await call(moveHeatRoute.POST as never, "POST", { id: "3", heatId: "5" }, bad)).status).toBe(422);
    }
    expect((await call(moveHeatRoute.POST as never, "POST", { id: "3", heatId: "x" }, { toSlot: 2 })).status).toBe(404);
    heats.moveHeat.mockResolvedValue({ ok: false, status: 422, message: "Choose a place from 1 to 3." });
    expect((await call(moveHeatRoute.POST as never, "POST", { id: "3", heatId: "5" }, { toSlot: 9 })).status).toBe(422);
  });
});

describe("GET /tournaments/ranking", () => {
  const get = (query = "") => ranking.GET(new NextRequest(`https://rickhouse.example.com/api/v1/tournaments/ranking${query}`));

  it("asks for sign-in, answers with the ranking, and passes the category", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(401);
    rankingFor.mockResolvedValue({ competitors: [], audit: [] });
    expect((await get()).status).toBe(200);
    expect(rankingFor).toHaveBeenLastCalledWith(7, null);
    await get("?categoryId=12");
    expect(rankingFor).toHaveBeenLastCalledWith(7, 12);
  });

  it("refuses a category id that is not one", async () => {
    for (const bad of ["abc", "0", "-3", "1.5"]) expect((await get(`?categoryId=${bad}`)).status).toBe(422);
  });
});

describe("GET /tournaments/field", () => {
  const get = (query = "") => fieldRoute.GET(new NextRequest(`https://rickhouse.example.com/api/v1/tournaments/field${query}`));

  it("asks for sign-in, and searches only the signed-in owner's bottles", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(401);
    field.fieldCandidates.mockResolvedValue({ rows: [{ bottleId: 1 }], total: 1 });
    const res = await get();
    expect([res.status, await res.json()]).toEqual([200, { rows: [{ bottleId: 1 }], total: 1 }]);
    expect(field.fieldCandidates.mock.calls[0]![0]).toBe(7);
  });

  it("feeds the query string through parseFieldFilters: defaults when absent, the lists split, junk ignored", async () => {
    field.fieldCandidates.mockResolvedValue({ rows: [], total: 0 });
    await get();
    expect(field.fieldCandidates).toHaveBeenLastCalledWith(7, { q: "", categoryIds: [], statuses: ["owned", "open"], opened: "any", tasted: "any" });
    await get("?q=%20buffalo%20%20trace&categoryIds=3,x,4,-1&statuses=owned,sold,bogus&opened=sealed&tasted=untasted");
    expect(field.fieldCandidates).toHaveBeenLastCalledWith(7, { q: "buffalo trace", categoryIds: [3, 4], statuses: ["owned", "sold"], opened: "sealed", tasted: "untasted" });
    await get("?statuses=all");
    expect(field.fieldCandidates.mock.calls.at(-1)![1].statuses).toEqual([]);
    await get("?statuses=bogus&opened=maybe&tasted=1&categoryIds=zz");
    expect(field.fieldCandidates).toHaveBeenLastCalledWith(7, { q: "", categoryIds: [], statuses: ["owned", "open"], opened: "any", tasted: "any" });
  });
});

describe("GET /tournaments/field/labels", () => {
  const get = (query = "") => fieldLabels.GET(new NextRequest(`https://rickhouse.example.com/api/v1/tournaments/field/labels${query}`));

  it("asks for sign-in, and passes the owner and the cleaned words", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    expect((await get("?q=x")).status).toBe(401);
    field.labelCandidates.mockResolvedValue([{ expressionId: 2 }]);
    const res = await get("?q=%20elijah%20%20craig ");
    expect([res.status, await res.json()]).toEqual([200, { rows: [{ expressionId: 2 }] }]);
    expect(field.labelCandidates).toHaveBeenLastCalledWith(7, "elijah craig");
  });

  it("a missing or blank q is the empty search (the first labels), not an error", async () => {
    field.labelCandidates.mockResolvedValue([]);
    expect((await get()).status).toBe(200);
    expect(field.labelCandidates).toHaveBeenLastCalledWith(7, "");
    expect((await get("?q=%20%20")).status).toBe(200);
    expect(field.labelCandidates).toHaveBeenLastCalledWith(7, "");
  });
});
