import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  bottleTags,
  bottles,
  brands,
  categories,
  companies,
  cooperages,
  distilleries,
  distilleryNames,
  expressionDistilleries,
  expressionIngredients,
  expressionMashbills,
  expressions,
  groups,
  housekeepingDismissals,
  housekeepingMerges,
  ingredients,
  mashbills,
  stores,
  tags,
  users,
} from "@/db/schema";

vi.mock("server-only", () => ({}));

// The rollback test makes the last step of a merge fail once; every other call goes through.
const control = { failClear: false };
vi.mock("@/lib/housekeeping/dismissals", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/housekeeping/dismissals")>();
  return {
    ...real,
    clearDismissalsFor: (...args: Parameters<typeof real.clearDismissalsFor>) => {
      if (control.failClear) {
        control.failClear = false;
        return Promise.reject(new Error("boom"));
      }
      return real.clearDismissalsFor(...args);
    },
  };
});

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("merging reference rows against a real database", () => {
  let db: typeof import("@/db").db;
  let m: typeof import("@/lib/housekeeping/merge-reference");
  let dismissals: typeof import("@/lib/housekeeping/dismissals");
  let owner: number;
  let other: number;
  let categoryId: number;
  let n = 0;
  const mine = {
    brands: [] as number[], labels: [] as number[], stores: [] as number[], bottles: [] as number[], tags: [] as number[],
    companies: [] as number[], cooperages: [] as number[], ingredients: [] as number[], groups: [] as number[], distilleries: [] as number[], mashbills: [] as number[],
  };
  const name = (base: string) => `${base} ${++n}`;
  const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const brand = async (ownerId = owner, value = name("Brand")) => {
    const [row] = await db.insert(brands).values({ ownerId, name: value, slug: slug(`${value}-${ownerId}`) }).returning();
    mine.brands.push(row!.id);
    return row!;
  };
  const label = async (brandId: number, value = name("Label"), extra: Partial<typeof expressions.$inferInsert> = {}) => {
    const [row] = await db.insert(expressions).values({ ownerId: owner, brandId, categoryId, name: value, slug: slug(`${value}-${brandId}`), ...extra }).returning();
    mine.labels.push(row!.id);
    return row!;
  };
  const bottle = async (expressionId: number, extra: Partial<typeof bottles.$inferInsert> = {}) => {
    const [row] = await db.insert(bottles).values({ ownerId: owner, expressionId, ...extra }).returning();
    mine.bottles.push(row!.id);
    return row!;
  };
  const store = async (value = name("Store")) => {
    const [row] = await db.insert(stores).values({ ownerId: owner, name: value, slug: slug(value) }).returning();
    mine.stores.push(row!.id);
    return row!;
  };
  const tag = async (value = name("Tag")) => {
    const [row] = await db.insert(tags).values({ ownerId: owner, name: value, slug: slug(value) }).returning();
    mine.tags.push(row!.id);
    return row!;
  };
  const company = async (extra: Partial<typeof companies.$inferInsert> = {}) => {
    const value = name("Company");
    const [row] = await db.insert(companies).values({ ownerId: owner, name: value, slug: slug(value), ...extra }).returning();
    mine.companies.push(row!.id);
    return row!;
  };
  const exists = async (table: typeof brands | typeof stores | typeof tags | typeof companies | typeof cooperages, id: number) =>
    (await db.select().from(table).where(eq(table.id, id))).length === 1;

  beforeAll(async () => {
    if (new URL(url!).pathname !== "/rickhouse_housekeeping_test") {
      throw new Error("Housekeeping integration tests require rickhouse_housekeeping_test");
    }
    process.env.SESSION_SECRET ??= "x".repeat(40);
    m = await import("@/lib/housekeeping/merge-reference");
    dismissals = await import("@/lib/housekeeping/dismissals");
    ({ db } = await import("@/db"));
    const accounts = await db.select().from(users).where(inArray(users.username, ["admin", "member"]));
    owner = accounts.find((row) => row.username === "admin")!.id;
    other = accounts.find((row) => row.username === "member")!.id;
    const [category] = await db.select().from(categories).where(eq(categories.slug, "bourbon"));
    categoryId = category!.id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(housekeepingMerges).where(inArray(housekeepingMerges.ownerId, [owner, other]));
    await db.delete(housekeepingDismissals).where(inArray(housekeepingDismissals.ownerId, [owner, other]));
    if (mine.groups.length) await db.delete(groups).where(inArray(groups.id, mine.groups));
    if (mine.bottles.length) await db.delete(bottles).where(inArray(bottles.id, mine.bottles));
    if (mine.labels.length) await db.delete(expressions).where(inArray(expressions.id, mine.labels));
    if (mine.distilleries.length) await db.delete(distilleries).where(inArray(distilleries.id, mine.distilleries));
    if (mine.mashbills.length) await db.delete(mashbills).where(inArray(mashbills.id, mine.mashbills));
    if (mine.brands.length) await db.delete(brands).where(inArray(brands.id, mine.brands));
    if (mine.stores.length) await db.delete(stores).where(inArray(stores.id, mine.stores));
    if (mine.tags.length) await db.delete(tags).where(inArray(tags.id, mine.tags));
    if (mine.companies.length) await db.delete(companies).where(inArray(companies.id, mine.companies));
    if (mine.cooperages.length) await db.delete(cooperages).where(inArray(cooperages.id, mine.cooperages));
    if (mine.ingredients.length) await db.delete(ingredients).where(inArray(ingredients.id, mine.ingredients));
  });

  const moved = (summary: { moves: Array<{ label: string; count: number }> }, label: string) =>
    summary.moves.find((move) => move.label === label)?.count ?? 0;

  describe("companies", () => {
    it("moves brands, distilleries and child companies to the survivor and adopts a missing city", async () => {
      const survivor = await company();
      const removed = await company({ city: "Louisville", notes: "removed notes" });
      const child = await company({ parentId: removed.id });
      const b = await brand();
      await db.update(brands).set({ companyId: removed.id }).where(eq(brands.id, b.id));
      const [d] = await db.insert(distilleries).values({ ownerId: owner, name: name("Dist"), slug: slug(name("dist")), companyId: removed.id }).returning();
      mine.distilleries.push(d!.id);

      const summary = await m.mergeReference(owner, "companies", survivor.id, removed.id, ["city", "ownerId"]);

      expect((await db.select().from(brands).where(eq(brands.id, b.id)))[0]!.companyId).toBe(survivor.id);
      expect((await db.select().from(distilleries).where(eq(distilleries.id, d!.id)))[0]!.companyId).toBe(survivor.id);
      expect((await db.select().from(companies).where(eq(companies.id, child.id)))[0]!.parentId).toBe(survivor.id);
      expect(await exists(companies, removed.id)).toBe(false);
      const [after] = await db.select().from(companies).where(eq(companies.id, survivor.id));
      expect(after!.city).toBe("Louisville");
      expect(after!.notes).toBeNull();
      expect(after!.ownerId).toBe(owner);
      expect(moved(summary, "brands")).toBe(1);
      expect(moved(summary, "distilleries")).toBe(1);
      expect(moved(summary, "child companies")).toBe(1);
      expect(summary.adopted).toEqual(["city"]);
    });
  });

  describe("brands", () => {
    it("moves the removed brand's labels, follows smart groups, and keeps the survivor's own facts", async () => {
      const survivor = await brand();
      const removed = await brand();
      const l1 = await label(survivor.id);
      const l2 = await label(removed.id);
      const l3 = await label(removed.id);
      const [g] = await db.insert(groups).values({ ownerId: owner, name: name("Group"), slug: slug(name("group")), filterQuery: `brand=${removed.id}&pick=1` }).returning();
      mine.groups.push(g!.id);

      const summary = await m.mergeReference(owner, "brands", survivor.id, removed.id, []);

      const rows = await db.select().from(expressions).where(inArray(expressions.id, [l1.id, l2.id, l3.id]));
      expect(rows.every((row) => row.brandId === survivor.id)).toBe(true);
      expect(await exists(brands, removed.id)).toBe(false);
      expect((await db.select().from(groups).where(eq(groups.id, g!.id)))[0]!.filterQuery).toBe(`brand=${survivor.id}&pick=1`);
      expect(moved(summary, "labels")).toBe(2);
      expect(moved(summary, "smart groups")).toBe(1);
    });

    it("refuses, with the label's name, when both brands have a label of the same name, and changes nothing", async () => {
      const a = await brand();
      const b = await brand();
      const shared = name("Shared Label");
      const la = await label(a.id, shared);
      const lb = await label(b.id, shared);
      await expect(m.mergeReference(owner, "brands", a.id, b.id, [])).rejects.toMatchObject({ code: "blocked", message: expect.stringContaining(shared) });
      expect(await exists(brands, b.id)).toBe(true);
      expect((await db.select().from(expressions).where(eq(expressions.id, lb.id)))[0]!.brandId).toBe(b.id);
      expect((await db.select().from(expressions).where(eq(expressions.id, la.id)))[0]!.brandId).toBe(a.id);
      const preview = await m.previewMerge(owner, "brands", a.id, b.id);
      expect(preview.blocked).toContain(shared);
    });
  });

  describe("cooperages and stores", () => {
    it("moves labels to the surviving cooperage", async () => {
      const [survivor] = await db.insert(cooperages).values({ ownerId: owner, name: name("Cooper"), slug: slug(name("cooper")) }).returning();
      const [removed] = await db.insert(cooperages).values({ ownerId: owner, name: name("Cooper"), slug: slug(name("cooper")) }).returning();
      mine.cooperages.push(survivor!.id, removed!.id);
      const l = await label((await brand()).id, name("Label"), { cooperageId: removed!.id });
      const summary = await m.mergeReference(owner, "cooperages", survivor!.id, removed!.id, []);
      expect((await db.select().from(expressions).where(eq(expressions.id, l.id)))[0]!.cooperageId).toBe(survivor!.id);
      expect(moved(summary, "labels")).toBe(1);
    });

    it("moves bottles to the surviving store and follows smart groups", async () => {
      const survivor = await store();
      const removed = await store();
      const b = await bottle((await label((await brand()).id)).id, { storeId: removed.id });
      const [g] = await db.insert(groups).values({ ownerId: owner, name: name("Group"), slug: slug(name("group")), filterQuery: `store=${removed.id},999` }).returning();
      mine.groups.push(g!.id);
      const summary = await m.mergeReference(owner, "stores", survivor.id, removed.id, []);
      expect((await db.select().from(bottles).where(eq(bottles.id, b.id)))[0]!.storeId).toBe(survivor.id);
      expect((await db.select().from(groups).where(eq(groups.id, g!.id)))[0]!.filterQuery).toBe(`store=${survivor.id},999`);
      expect(moved(summary, "bottles")).toBe(1);
    });
  });

  describe("tags", () => {
    it("gives each bottle the surviving tag once, including a bottle that had both", async () => {
      const survivor = await tag();
      const removed = await tag();
      const lab = await label((await brand()).id);
      const both = await bottle(lab.id);
      const onlyRemoved = await bottle(lab.id);
      await db.insert(bottleTags).values([
        { bottleId: both.id, tagId: survivor.id },
        { bottleId: both.id, tagId: removed.id },
        { bottleId: onlyRemoved.id, tagId: removed.id },
      ]);
      const summary = await m.mergeReference(owner, "tags", survivor.id, removed.id, []);
      const rows = await db.select().from(bottleTags).where(inArray(bottleTags.bottleId, [both.id, onlyRemoved.id]));
      expect(rows.map((row) => `${row.bottleId}:${row.tagId}`).sort()).toEqual([`${both.id}:${survivor.id}`, `${onlyRemoved.id}:${survivor.id}`].sort());
      expect(await exists(tags, removed.id)).toBe(false);
      expect(moved(summary, "bottles")).toBe(2);
    });
  });

  describe("ingredients", () => {
    const ingredient = async (kind: "maguey" | "distillate", value: string) => {
      const [row] = await db.insert(ingredients).values({ ownerId: owner, kind, name: value }).returning();
      mine.ingredients.push(row!.id);
      return row!;
    };

    it("keeps the survivor's row on a label that had both and moves the rest", async () => {
      const survivor = await ingredient("maguey", name("Agave"));
      const removed = await ingredient("maguey", name("Agave"));
      const b = await brand();
      const both = await label(b.id);
      const onlyRemoved = await label(b.id);
      await db.insert(expressionIngredients).values([
        { expressionId: both.id, ingredientId: survivor.id, position: 0 },
        { expressionId: both.id, ingredientId: removed.id, position: 1 },
        { expressionId: onlyRemoved.id, ingredientId: removed.id, position: 2 },
      ]);
      const summary = await m.mergeReference(owner, "ingredients", survivor.id, removed.id, []);
      const rows = await db.select().from(expressionIngredients).where(inArray(expressionIngredients.expressionId, [both.id, onlyRemoved.id]));
      expect(rows.map((row) => `${row.expressionId}:${row.ingredientId}:${row.position}`).sort()).toEqual(
        [`${both.id}:${survivor.id}:0`, `${onlyRemoved.id}:${survivor.id}:2`].sort(),
      );
      expect(moved(summary, "labels")).toBe(2);
    });

    it("refuses two ingredients of different kinds", async () => {
      const a = await ingredient("maguey", name("Agave"));
      const b = await ingredient("distillate", name("Agave"));
      await expect(m.mergeReference(owner, "ingredients", a.id, b.id, [])).rejects.toMatchObject({ code: "blocked" });
      expect((await db.select().from(ingredients).where(eq(ingredients.id, b.id))).length).toBe(1);
    });
  });


  describe("distilleries", () => {
    const distillery = async (extra: Partial<typeof distilleries.$inferInsert> = {}) => {
      const value = name("Distillery");
      const [row] = await db.insert(distilleries).values({ ownerId: owner, name: value, slug: slug(value), ...extra }).returning();
      mine.distilleries.push(row!.id);
      return row!;
    };

    it("moves labels, mashbill links and other names, keeps the survivor's row on a label that had both, and keeps the removed name as another name", async () => {
      const survivor = await distillery({ city: null });
      const removed = await distillery({ city: "Bardstown" });
      await db.insert(distilleryNames).values([
        { distilleryId: removed.id, name: "Old Name", position: 0 },
        { distilleryId: removed.id, name: "Shared Name", position: 1 },
      ]);
      await db.insert(distilleryNames).values({ distilleryId: survivor.id, name: "Shared Name", position: 0 });
      const b = await brand();
      const onlyRemoved = await label(b.id);
      const both = await label(b.id);
      await db.insert(expressionDistilleries).values([
        { expressionId: onlyRemoved.id, distilleryId: removed.id, position: 2, isInferred: true },
        { expressionId: both.id, distilleryId: survivor.id, position: 0 },
        { expressionId: both.id, distilleryId: removed.id, position: 1 },
      ]);
      const [mb] = await db.insert(mashbills).values({ ownerId: owner }).returning();
      mine.mashbills.push(mb!.id);
      await db.insert(expressionMashbills).values({ expressionId: both.id, mashbillId: mb!.id, distilleryId: removed.id });
      const [g] = await db.insert(groups).values({ ownerId: owner, name: name("Group"), slug: slug(name("group")), filterQuery: `distillery=${removed.id}` }).returning();
      mine.groups.push(g!.id);

      const summary = await m.mergeReference(owner, "distilleries", survivor.id, removed.id, ["city"]);

      const links = await db.select().from(expressionDistilleries).where(inArray(expressionDistilleries.expressionId, [onlyRemoved.id, both.id]));
      expect(links.map((row) => `${row.expressionId}:${row.distilleryId}:${row.position}:${row.isInferred}`).sort()).toEqual(
        [`${onlyRemoved.id}:${survivor.id}:2:true`, `${both.id}:${survivor.id}:0:false`].sort(),
      );
      expect((await db.select().from(expressionMashbills).where(eq(expressionMashbills.expressionId, both.id)))[0]!.distilleryId).toBe(survivor.id);
      const names = (await db.select().from(distilleryNames).where(eq(distilleryNames.distilleryId, survivor.id))).map((row) => row.name).sort();
      expect(names).toEqual(["Old Name", removed.name, "Shared Name"].sort());
      expect((await db.select().from(distilleries).where(eq(distilleries.id, removed.id))).length).toBe(0);
      expect((await db.select().from(distilleries).where(eq(distilleries.id, survivor.id)))[0]!.city).toBe("Bardstown");
      expect((await db.select().from(groups).where(eq(groups.id, g!.id)))[0]!.filterQuery).toBe(`distillery=${survivor.id}`);
      expect(moved(summary, "labels")).toBe(2);
      expect(moved(summary, "mashbill links")).toBe(1);
      expect(moved(summary, "other names")).toBe(2);
      expect(moved(summary, "smart groups")).toBe(1);
      expect(summary.adopted).toEqual(["city"]);
    });

    it("does not list the removed name twice when the survivor already has it as another name", async () => {
      const survivor = await distillery();
      const removed = await distillery();
      await db.insert(distilleryNames).values({ distilleryId: survivor.id, name: removed.name, position: 0 });
      await m.mergeReference(owner, "distilleries", survivor.id, removed.id, []);
      const names = await db.select().from(distilleryNames).where(eq(distilleryNames.distilleryId, survivor.id));
      expect(names.map((row) => row.name)).toEqual([removed.name]);
    });
  });

  describe("every merge", () => {
    it("refuses a row merged into itself", async () => {
      const a = await store();
      await expect(m.mergeReference(owner, "stores", a.id, a.id, [])).rejects.toMatchObject({ code: "same" });
    });

    it("treats another account's rows, and rows that do not exist, as gone and changes nothing", async () => {
      const mineStore = await store();
      const [theirs] = await db.insert(stores).values({ ownerId: other, name: name("Theirs"), slug: slug(name("theirs")) }).returning();
      try {
        await expect(m.mergeReference(owner, "stores", mineStore.id, theirs!.id, [])).rejects.toMatchObject({ code: "gone" });
        await expect(m.mergeReference(owner, "stores", mineStore.id, 999_999_999, [])).rejects.toMatchObject({ code: "gone" });
        expect(await exists(stores, theirs!.id)).toBe(true);
        expect(await exists(stores, mineStore.id)).toBe(true);
      } finally {
        await db.delete(stores).where(eq(stores.id, theirs!.id));
      }
    });

    it("says gone, not an error, when the same pair is merged twice", async () => {
      const a = await store();
      const b = await store();
      await m.mergeReference(owner, "stores", a.id, b.id, []);
      await expect(m.mergeReference(owner, "stores", a.id, b.id, [])).rejects.toMatchObject({ code: "gone" });
    });

    it("adopts only the fields it offers, whatever is asked for", async () => {
      const survivor = await brand();
      const removed = await brand();
      await db.update(brands).set({ notes: "kept from the removed one" }).where(eq(brands.id, removed.id));
      await m.mergeReference(owner, "brands", survivor.id, removed.id, ["notes", "ownerId", "slug", "bogus"]);
      const [after] = await db.select().from(brands).where(eq(brands.id, survivor.id));
      expect(after!.notes).toBe("kept from the removed one");
      expect(after!.ownerId).toBe(owner);
      expect(after!.slug).toBe(survivor.slug);
    });

    it("records the merge and forgets dismissals that mention the removed row", async () => {
      const survivor = await store(name("Keeper"));
      const removed = await store(name("Goner"));
      const third = await store();
      await dismissals.dismiss(owner, dismissals.duplicateScope("stores"), dismissals.pairKey(removed.id, third.id));
      await dismissals.dismiss(owner, dismissals.duplicateScope("stores"), dismissals.pairKey(survivor.id, third.id));
      const b = await bottle((await label((await brand()).id)).id, { storeId: removed.id });
      await m.mergeReference(owner, "stores", survivor.id, removed.id, []);
      const kept = await dismissals.listDismissed(owner, dismissals.duplicateScope("stores"));
      expect(kept.has(dismissals.pairKey(removed.id, third.id))).toBe(false);
      expect(kept.has(dismissals.pairKey(survivor.id, third.id))).toBe(true);
      const [log] = await db.select().from(housekeepingMerges).where(and(eq(housekeepingMerges.ownerId, owner), eq(housekeepingMerges.removedId, removed.id)));
      expect(log).toMatchObject({ kind: "stores", survivorId: survivor.id, survivorName: survivor.name, removedName: removed.name, adopted: [] });
      expect(log!.moved).toEqual([{ label: "bottles", count: 1 }]);
      expect(b.id).toBeGreaterThan(0);
    });

    it("undoes everything when a late step fails", async () => {
      const survivor = await brand();
      const removed = await brand();
      const l = await label(removed.id);
      control.failClear = true;
      await expect(m.mergeReference(owner, "brands", survivor.id, removed.id, [])).rejects.toThrow("boom");
      expect(await exists(brands, removed.id)).toBe(true);
      expect((await db.select().from(expressions).where(eq(expressions.id, l.id)))[0]!.brandId).toBe(removed.id);
      expect(await db.select().from(housekeepingMerges).where(eq(housekeepingMerges.removedId, removed.id))).toEqual([]);
    });

    it("previews what a merge would move without changing anything", async () => {
      const survivor = await brand();
      const removed = await brand();
      await db.update(brands).set({ notes: "offered" }).where(eq(brands.id, removed.id));
      await label(removed.id);
      const preview = await m.previewMerge(owner, "brands", survivor.id, removed.id);
      expect(preview.blocked).toBeNull();
      expect(preview.moves).toEqual([{ label: "labels", count: 1 }]);
      expect(preview.adoptable).toEqual([{ field: "notes", label: "Notes", value: "offered" }]);
      expect(await exists(brands, removed.id)).toBe(true);
      const gone = await m.previewMerge(owner, "brands", survivor.id, 999_999_999);
      expect(gone.blocked).toContain("already been merged");
    });
  });
});
