import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { connect, fixtures, settings, url, type Cat, type Db, type Fixtures } from "./fixtures";

/** The draft page's settings line promises what regroups and clears flight names; this pins that promise to the data layer. */
describe.skipIf(!url)("changing a draft's settings", () => {
  let m: Db;
  let fx: Fixtures;
  let owner: number;
  let cat: Cat;
  let bottles: number[];

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    owner = await fx.mkUser();
    cat = await fx.mkCategories();
    ({ bottles } = await fx.mkField(owner, cat.whiskey, "Label"));
  });
  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  async function namedDraft() {
    const made = (await m.life.createTournament(owner, settings({ heatSize: 3 }), bottles.map((bottleId) => ({ bottleId })))) as { id: number };
    const preview = await m.transitions.resetRound(owner, made.id);
    if (!preview.ok) throw new Error("no preview");
    const first = preview.view.rounds[0]!.heats[0]!;
    expect((await m.heats.renameHeat(owner, made.id, first.id, "Mine")).ok).toBe(true);
    return made.id;
  }
  const labels = async (id: number) => (await m.queries.getTournament(owner, id))!.rounds[0]!.heats.map((h) => h.label);

  it("keeps your flight names when only the name, blind or the note change", async () => {
    const id = await namedDraft();
    for (const patch of [{ name: "Renamed" }, { blind: true }, { fieldNote: "A note" }]) {
      expect((await m.life.updateDraft(owner, id, patch)).ok).toBe(true);
      expect(await labels(id)).toContain("Mine");
    }
  });

  it("regroups and clears the names when flight size, seeding or the priority change", async () => {
    for (const patch of [{ heatSize: 2 }, { seeding: "random" as const }, { groupOrder: ["distillery", "proof", "mashbill", "age", "finish"] }]) {
      const id = await namedDraft();
      const result = await m.life.updateDraft(owner, id, patch);
      expect(result.ok).toBe(true);
      expect((await labels(id)).every((l) => l === null)).toBe(true);
      expect((await m.queries.getTournament(owner, id))!.rounds[0]!.heats.length).toBeGreaterThan(0);
    }
  });

  it("regroups the remaining bottles when flight size or seeding change after a bottle was removed", async () => {
    for (const patch of [{ heatSize: 2 }, { seeding: "random" as const }]) {
      const id = await namedDraft();
      const view = (await m.queries.getTournament(owner, id))!;
      const gone = view.rounds[0]!.heats[0]!.entries[0]!.entryId;
      expect((await m.heats.removeDraftEntry(owner, id, gone)).ok).toBe(true);
      expect((await m.life.updateDraft(owner, id, patch)).ok).toBe(true);
      const after = (await m.queries.getTournament(owner, id))!;
      const kept = after.rounds[0]!.heats.flatMap((h) => h.entries.map((e) => e.entryId));
      expect(kept).toHaveLength(bottles.length - 1);
      expect(kept).not.toContain(gone);
      expect(after.entries.map((e) => e.id)).not.toContain(gone);
      expect(after.rounds[0]!.heats.every((h) => h.label === null)).toBe(true);
      if ("heatSize" in patch) expect(after.rounds[0]!.heats.every((h) => h.entries.length <= 2)).toBe(true);
    }
  });
});
