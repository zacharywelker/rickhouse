import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSession, revalidatePath, life, heats, transitions, field, calls } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    life: { createTournament: fn(), updateDraft: fn(), deleteTournament: fn() },
    transitions: { startTournament: fn(), resetRound: fn(), recordHeat: fn(), undoHeat: fn(), withdrawEntry: fn() },
    heats: { removeDraftEntry: fn(), moveHeat: fn(), drawHeat: fn(), setGlasses: fn(), moveEntry: fn(), swapEntries: fn(), promoteEntry: fn(), renameHeat: fn() },
    field: { fieldCandidates: fn(), labelCandidates: fn() },
    calls: [] as string[],
  };
});

vi.mock("@/lib/auth", () => ({ requireSession: () => requireSession() }));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock("@/lib/tournaments/lifecycle", () => life);
vi.mock("@/lib/tournaments/heats", () => heats);
vi.mock("@/lib/tournaments/transitions", () => transitions);
vi.mock("@/lib/tournaments/field", () => field);

import * as actions from "../actions";

const view = { id: 3, name: "Spring" };
const gone = { ok: false as const, status: 404 as const, message: "That tournament is gone." };

beforeEach(() => {
  vi.resetAllMocks();
  calls.length = 0;
  requireSession.mockImplementation(async () => {
    calls.push("session");
    return { id: 7 };
  });
  for (const group of [life, heats, transitions]) {
    for (const [name, mock] of Object.entries(group)) {
      mock.mockImplementation(async () => {
        calls.push(name);
        return { ok: true, view };
      });
    }
  }
});

/** Every action that answers with a view: [name, call, the command it runs, its expected arguments]. */
const viewActions: [string, () => Promise<unknown>, ReturnType<typeof vi.fn>, unknown[]][] = [
  ["updateDraftAction", () => actions.updateDraftAction(3, { name: "x" }), life.updateDraft, [7, 3, { name: "x" }]],
  ["updateDraftAction groupOrder alone", () => actions.updateDraftAction(3, { groupOrder: ["age", "proof", "mashbill", "distillery", "finish"] }), life.updateDraft, [7, 3, { groupOrder: ["age", "proof", "mashbill", "distillery", "finish"] }]],
  ["updateDraftAction seeding alone", () => actions.updateDraftAction(3, { seeding: "random" }), life.updateDraft, [7, 3, { seeding: "random" }]],
  ["startTournamentAction", () => actions.startTournamentAction(3), transitions.startTournament, [7, 3]],
  ["resetRoundAction", () => actions.resetRoundAction(3), transitions.resetRound, [7, 3]],
  ["recordHeatAction", () => actions.recordHeatAction(3, 5, { ranking: [1, 2] }), transitions.recordHeat, [7, 3, 5, { ranking: [1, 2] }, 7]],
  ["undoHeatAction", () => actions.undoHeatAction(3, 5), transitions.undoHeat, [7, 3, 5]],
  ["withdrawEntryAction", () => actions.withdrawEntryAction(3, 9), transitions.withdrawEntry, [7, 3, 9]],
  ["removeDraftEntryAction", () => actions.removeDraftEntryAction(3, 9), heats.removeDraftEntry, [7, 3, 9]],
  [
    "setGlassesAction",
    () => actions.setGlassesAction(3, 5, [{ entryId: 1, glass: "A" }, { entryId: 2, glass: "B" }]),
    heats.setGlasses,
    [7, 3, 5, [{ entryId: 1, glass: "A" }, { entryId: 2, glass: "B" }]],
  ],
  ["moveEntryAction", () => actions.moveEntryAction(3, 9, 5), heats.moveEntry, [7, 3, 9, 5]],
  ["swapEntriesAction", () => actions.swapEntriesAction(3, 9, 5), heats.swapEntries, [7, 3, 9, 5]],
  ["promoteEntryAction", () => actions.promoteEntryAction(3, 9, { bottleId: 4 }), heats.promoteEntry, [7, 3, 9, { bottleId: 4 }]],
  ["renameHeatAction", () => actions.renameHeatAction(3, 5, "Finals"), heats.renameHeat, [7, 3, 5, "Finals"]],
  ["moveHeatAction", () => actions.moveHeatAction(3, 5, 2), heats.moveHeat, [7, 3, 5, 2]],
];

describe.each(viewActions)("%s", (_name, run, command, args) => {
  it("checks the session before the command", async () => {
    await run();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe("session");
  });

  it("calls the command with the user and returns the view, refreshing the list and the tournament", async () => {
    expect(await run()).toEqual({ ok: true, view });
    expect(command).toHaveBeenCalledWith(...args);
    expect(revalidatePath).toHaveBeenCalledWith("/tournaments");
    expect(revalidatePath).toHaveBeenCalledWith("/tournaments/3");
  });

  it("maps a Failure to ok:false and refreshes nothing", async () => {
    command.mockResolvedValue({ ...gone, status: 409, message: "Nope." });
    expect(await run()).toEqual({ ok: false, error: "Nope." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("carries a Failure's field errors", async () => {
    command.mockResolvedValue({ ok: false, status: 422, message: "Bad.", fields: { x: "Bad." } });
    expect(await run()).toEqual({ ok: false, error: "Bad.", fieldErrors: { x: "Bad." } });
  });

  it("does not catch a thrown error", async () => {
    command.mockRejectedValue(new Error("db down"));
    await expect(run()).rejects.toThrow("db down");
  });
});

describe("invalid input never reaches the command", () => {
  it.each([
    ["updateDraftAction", () => actions.updateDraftAction(3, {}), life.updateDraft],
    ["updateDraftAction with an unknown key", () => actions.updateDraftAction(3, { nope: 1 }), life.updateDraft],
    ["recordHeatAction", () => actions.recordHeatAction(3, 5, { ranking: [1] }), transitions.recordHeat],
    ["setGlassesAction", () => actions.setGlassesAction(3, 5, [{ entryId: 1, glass: "Z" }]), heats.setGlasses],
    ["moveEntryAction", () => actions.moveEntryAction(3, 9, 0), heats.moveEntry],
    ["swapEntriesAction", () => actions.swapEntriesAction(3, 9, 0), heats.swapEntries],
    ["promoteEntryAction", () => actions.promoteEntryAction(3, 9, {}), heats.promoteEntry],
    ["renameHeatAction", () => actions.renameHeatAction(3, 5, "x".repeat(81)), heats.renameHeat],
    ["moveHeatAction", () => actions.moveHeatAction(3, 5, 0), heats.moveHeat],
  ])("%s", async (_name, run, command) => {
    const out = (await run()) as { ok: boolean; error?: string };
    expect(out.ok).toBe(false);
    expect(out.error).toBeTruthy();
    expect(command).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(calls[0]).toBe("session");
  });

  it("a non-integer or non-positive id answers that it is gone", async () => {
    expect(await actions.startTournamentAction(Number.NaN)).toEqual({ ok: false, error: "That tournament is gone." });
    expect(await actions.undoHeatAction(3, -1)).toEqual({ ok: false, error: "That flight is gone." });
    expect(await actions.withdrawEntryAction(3, 1.5)).toEqual({ ok: false, error: "That entry is gone." });
    expect(await actions.removeDraftEntryAction(3, 0)).toEqual({ ok: false, error: "That entry is gone." });
    expect(await actions.removeDraftEntryAction(Number.NaN, 4)).toEqual({ ok: false, error: "That tournament is gone." });
    expect(heats.removeDraftEntry).not.toHaveBeenCalled();
    expect(await actions.deleteTournamentAction(0)).toEqual({ ok: false, error: "That tournament is gone." });
    expect(await actions.drawHeatAction(Number.NaN)).toEqual({ ok: false, error: "That tournament is gone." });
    expect(transitions.startTournament).not.toHaveBeenCalled();
    expect(transitions.undoHeat).not.toHaveBeenCalled();
    expect(transitions.withdrawEntry).not.toHaveBeenCalled();
    expect(life.deleteTournament).not.toHaveBeenCalled();
    expect(heats.drawHeat).not.toHaveBeenCalled();
  });
});

describe("createTournamentAction", () => {
  const input = { name: "Spring", heatSize: 4, entries: [{ bottleId: 1 }, { name: "Mystery" }] };

  it("splits settings from entries, applies the defaults and returns the id", async () => {
    life.createTournament.mockResolvedValue({ ok: true, id: 12 });
    expect(await actions.createTournamentAction(input)).toEqual({ ok: true, id: 12 });
    expect(life.createTournament).toHaveBeenCalledWith(
      7,
      { name: "Spring", heatSize: 4, seeding: "similar", groupOrder: ["proof", "mashbill", "distillery", "age", "finish"], blind: false, fieldNote: null },
      [{ bottleId: 1 }, { name: "Mystery" }],
    );
    expect(revalidatePath).toHaveBeenCalledWith("/tournaments");
    expect(revalidatePath).toHaveBeenCalledWith("/tournaments/12");
  });

  it("rejects a bad input with field errors", async () => {
    const out = await actions.createTournamentAction({ name: "", heatSize: 9 });
    expect(out).toMatchObject({ ok: false, error: "Name the tournament.", fieldErrors: { name: "Name the tournament.", heatSize: "A flight holds 2 to 6 bottles." } });
    expect(life.createTournament).not.toHaveBeenCalled();
    expect(calls).toEqual(["session"]);
  });

  it("maps a Failure", async () => {
    life.createTournament.mockResolvedValue({ ok: false, status: 422, message: "A bottle is listed twice.", fields: { entries: "A bottle is listed twice." } });
    expect(await actions.createTournamentAction(input)).toEqual({ ok: false, error: "A bottle is listed twice.", fieldErrors: { entries: "A bottle is listed twice." } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("deleteTournamentAction", () => {
  it("answers ok and refreshes", async () => {
    life.deleteTournament.mockResolvedValue({ ok: true });
    expect(await actions.deleteTournamentAction(3)).toEqual({ ok: true });
    expect(life.deleteTournament).toHaveBeenCalledWith(7, 3);
    expect(revalidatePath).toHaveBeenCalledWith("/tournaments");
  });

  it("maps a running tournament's 409", async () => {
    life.deleteTournament.mockResolvedValue({ ok: false, status: 409, message: "A running tournament cannot be deleted." });
    expect(await actions.deleteTournamentAction(3)).toEqual({ ok: false, error: "A running tournament cannot be deleted." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("maps a 404 to its message", async () => {
    life.deleteTournament.mockResolvedValue(gone);
    expect(await actions.deleteTournamentAction(3)).toEqual({ ok: false, error: "That tournament is gone." });
  });
});

describe("drawHeatAction", () => {
  const heat = { heatId: 5, round: 1, slot: 1, band: "90-100", glasses: [] };

  it("returns the drawn flight for the pourer", async () => {
    heats.drawHeat.mockResolvedValue({ ok: true, heat });
    expect(await actions.drawHeatAction(3)).toEqual({ ok: true, heat });
    expect(heats.drawHeat).toHaveBeenCalledWith(7, 3, undefined);
    expect(revalidatePath).toHaveBeenCalledWith("/tournaments/3");
  });

  it("opens a chosen flight, and refuses a bad flight id without calling the command", async () => {
    heats.drawHeat.mockResolvedValue({ ok: true, heat });
    expect(await actions.drawHeatAction(3, 5)).toEqual({ ok: true, heat });
    expect(heats.drawHeat).toHaveBeenCalledWith(7, 3, 5);
    heats.drawHeat.mockClear();
    expect(await actions.drawHeatAction(3, 0)).toEqual({ ok: false, error: "That flight is gone." });
    expect(heats.drawHeat).not.toHaveBeenCalled();
  });

  it("maps a Failure", async () => {
    heats.drawHeat.mockResolvedValue({ ok: false, status: 409, message: "No flight is waiting to be tasted." });
    expect(await actions.drawHeatAction(3)).toEqual({ ok: false, error: "No flight is waiting to be tasted." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("a signed-out caller", () => {
  it("is stopped by requireSession before any command", async () => {
    requireSession.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(actions.startTournamentAction(3)).rejects.toThrow("NEXT_REDIRECT");
    await expect(actions.createTournamentAction({})).rejects.toThrow("NEXT_REDIRECT");
    expect(transitions.startTournament).not.toHaveBeenCalled();
  });
});

describe("the setup picker's searches", () => {
  it("searchFieldAction checks the session, parses the filters (junk to defaults) and answers rows and total", async () => {
    field.fieldCandidates.mockResolvedValue({ rows: [{ bottleId: 1 }], total: 812 });
    expect(await actions.searchFieldAction({ q: "  eagle   rare ", opened: "bogus", categoryIds: "4,x,5" })).toEqual({ ok: true, rows: [{ bottleId: 1 }], total: 812 });
    expect(calls[0]).toBe("session");
    expect(field.fieldCandidates).toHaveBeenCalledWith(7, { q: "eagle rare", categoryIds: [4, 5], statuses: ["owned", "open"], opened: "any", tasted: "any" });
  });

  it("searchFieldAction survives a non-object", async () => {
    field.fieldCandidates.mockResolvedValue({ rows: [], total: 0 });
    await actions.searchFieldAction(null);
    expect(field.fieldCandidates).toHaveBeenCalledWith(7, { q: "", categoryIds: [], statuses: ["owned", "open"], opened: "any", tasted: "any" });
  });

  it("searchLabelsAction searches the signed-in owner's labels with trimmed text", async () => {
    field.labelCandidates.mockResolvedValue([{ expressionId: 2 }]);
    expect(await actions.searchLabelsAction("  weller  ")).toEqual({ ok: true, labels: [{ expressionId: 2 }] });
    expect(field.labelCandidates).toHaveBeenCalledWith(7, "weller");
    await actions.searchLabelsAction(42);
    expect(field.labelCandidates).toHaveBeenLastCalledWith(7, "");
  });
});
