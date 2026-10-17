import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";

const session = vi.hoisted(() => ({ id: 0 }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ requireSession: async () => ({ id: session.id }) }));

/** Opt-in, like the tournament integration tests: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("relabeling a bottle against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let owner: number;
  let stranger: number;
  let state: typeof import("../state");
  let actions: typeof import("@/app/(app)/bottles/actions");

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories();
    owner = await fx.mkUser();
    stranger = await fx.mkUser();
    session.id = owner;
    state = await import("../state");
    actions = await import("@/app/(app)/bottles/actions");
  });

  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  /** A bottle with a tasting, a tournament entry, and a label-only tasting and entry that stay on the old label. */
  async function mkHistory(user: number, from: number) {
    const bottle = await fx.mkBottle(user, from);
    const [tasting] = await m.sql<{ id: number }>(`INSERT INTO tasting_notes (owner_id, expression_id, bottle_id) VALUES ($1, $2, $3) RETURNING id`, user, from, bottle);
    const [labelTasting] = await m.sql<{ id: number }>(`INSERT INTO tasting_notes (owner_id, expression_id) VALUES ($1, $2) RETURNING id`, user, from);
    const [t] = await m.sql<{ id: number }>(`INSERT INTO tournaments (owner_id, name, heat_size) VALUES ($1, 'T', 4) RETURNING id`, user);
    const [entry] = await m.sql<{ id: number }>(
      `INSERT INTO tournament_entries (tournament_id, owner_id, bottle_id, expression_id, display_name) VALUES ($1, $2, $3, $4, 'b') RETURNING id`,
      t!.id, user, bottle, from,
    );
    const [labelEntry] = await m.sql<{ id: number }>(
      `INSERT INTO tournament_entries (tournament_id, owner_id, expression_id, display_name) VALUES ($1, $2, $3, 'l') RETURNING id`,
      t!.id, user, from,
    );
    return { bottle, tasting: tasting!.id, labelTasting: labelTasting!.id, entry: entry!.id, labelEntry: labelEntry!.id };
  }

  const labelOf = async (table: "bottles" | "tasting_notes" | "tournament_entries", id: number) =>
    (await m.sql<{ expression_id: number }>(`SELECT expression_id FROM ${table} WHERE id = $1`, id))[0]!.expression_id;
  const bottleOf = async (table: "tasting_notes" | "tournament_entries", id: number) =>
    (await m.sql<{ bottle_id: number | null }>(`SELECT bottle_id FROM ${table} WHERE id = $1`, id))[0]!.bottle_id;

  async function expectFollowed(h: Awaited<ReturnType<typeof mkHistory>>, to: number, from: number) {
    expect(await labelOf("bottles", h.bottle)).toBe(to);
    expect(await labelOf("tasting_notes", h.tasting)).toBe(to);
    expect(await bottleOf("tasting_notes", h.tasting)).toBe(h.bottle);
    expect(await labelOf("tournament_entries", h.entry)).toBe(to);
    expect(await bottleOf("tournament_entries", h.entry)).toBe(h.bottle);
    // Label-only rows stay on the old label.
    expect(await labelOf("tasting_notes", h.labelTasting)).toBe(from);
    expect(await labelOf("tournament_entries", h.labelEntry)).toBe(from);
  }

  it("updateBottle: tastings and entries follow the bottle, label-only ones stay", async () => {
    const from = await fx.mkLabel(owner, cat.whiskey, "From A");
    const to = await fx.mkLabel(owner, cat.whiskey, "To A");
    const h = await mkHistory(owner, from);
    const out = await state.updateBottle(h.bottle, owner, { columns: { expressionId: to } });
    expect(out).toMatchObject({ ok: true });
    await expectFollowed(h, to, from);
  });

  it("updateBottle: a label that is not the caller's is refused and nothing moves", async () => {
    const from = await fx.mkLabel(owner, cat.whiskey, "From B");
    const theirs = await fx.mkLabel(stranger, cat.whiskey, "Theirs B");
    const h = await mkHistory(owner, from);
    const out = await state.updateBottle(h.bottle, owner, { columns: { expressionId: theirs } });
    expect(out).toMatchObject({ ok: false, code: "invalid", field: "expressionId" });
    expect(await labelOf("bottles", h.bottle)).toBe(from);
    expect(await labelOf("tasting_notes", h.tasting)).toBe(from);
    expect(await labelOf("tournament_entries", h.entry)).toBe(from);
  });

  it("updateBottle: a bottle with no history relabels, and an unchanged label touches nothing", async () => {
    const from = await fx.mkLabel(owner, cat.whiskey, "From C");
    const to = await fx.mkLabel(owner, cat.whiskey, "To C");
    const bottle = await fx.mkBottle(owner, from);
    expect(await state.updateBottle(bottle, owner, { columns: { expressionId: to } })).toMatchObject({ ok: true });
    expect(await labelOf("bottles", bottle)).toBe(to);
    const h = await mkHistory(owner, from);
    expect(await state.updateBottle(h.bottle, owner, { columns: { expressionId: from, notes: "same label" } })).toMatchObject({ ok: true });
    expect(await labelOf("tasting_notes", h.tasting)).toBe(from);
  });

  it("the bulk grid: several bottles relabel together with their history, a stranger's label is refused", async () => {
    const from = await fx.mkLabel(owner, cat.whiskey, "From D");
    const to = await fx.mkLabel(owner, cat.whiskey, "To D");
    const theirs = await fx.mkLabel(stranger, cat.whiskey, "Theirs D");
    const a = await mkHistory(owner, from);
    const b = await mkHistory(owner, from);
    const plain = await fx.mkBottle(owner, from);
    const edit = (id: number, expressionId: number) => ({ id, expressionId, storeId: null, status: "owned", pricePaid: "", dateAcquired: "", releaseYear: "" });
    const res = await actions.updateBottlesBulkAction([edit(a.bottle, to), edit(b.bottle, to), edit(plain, to), edit(a.bottle, theirs)]);
    expect(res.results.map((r) => r.ok)).toEqual([true, true, true, false]);
    await expectFollowed(a, to, from);
    await expectFollowed(b, to, from);
    expect(await labelOf("bottles", plain)).toBe(to);
  });

  it("saveBottleAction: the edit form moves the history too", async () => {
    const from = await fx.mkLabel(owner, cat.whiskey, "From E");
    const to = await fx.mkLabel(owner, cat.whiskey, "To E");
    const h = await mkHistory(owner, from);
    const form = new FormData();
    form.set("expressionId", String(to));
    form.set("acquisition", "purchase");
    form.set("status", "owned");
    const res = await actions.saveBottleAction(h.bottle, { ok: false, error: "" }, form);
    expect(res).toMatchObject({ ok: true });
    await expectFollowed(h, to, from);
  });

  it("never touches a stranger's rows", async () => {
    const mine = await fx.mkLabel(owner, cat.whiskey, "From F");
    const to = await fx.mkLabel(owner, cat.whiskey, "To F");
    const theirLabel = await fx.mkLabel(stranger, cat.whiskey, "Theirs F");
    const theirs = await mkHistory(stranger, theirLabel);
    // Their bottle id through my session: gone, and their history stays put.
    expect(await state.updateBottle(theirs.bottle, owner, { columns: { expressionId: to } })).toBeNull();
    const res = await actions.updateBottlesBulkAction([{ id: theirs.bottle, expressionId: to, storeId: null, status: "owned", pricePaid: "", dateAcquired: "", releaseYear: "" }]);
    expect(res.results[0]).toMatchObject({ ok: false });
    expect(await labelOf("bottles", theirs.bottle)).toBe(theirLabel);
    expect(await labelOf("tasting_notes", theirs.tasting)).toBe(theirLabel);
    expect(await labelOf("tournament_entries", theirs.entry)).toBe(theirLabel);
    expect(mine).toBeGreaterThan(0);
  });
});
