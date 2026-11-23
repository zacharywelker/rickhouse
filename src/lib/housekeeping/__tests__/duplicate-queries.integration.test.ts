import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  brands,
  categories,
  distilleries,
  expressionDistilleries,
  expressions,
  housekeepingDismissals,
  ingredients,
  mashbillGrains,
  mashbills,
  stores,
  users,
} from "@/db/schema";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("duplicate candidates against a real database", () => {
  let db: typeof import("@/db").db;
  let q: typeof import("@/lib/housekeeping/duplicate-queries");
  let owner: number;
  let other: number;
  const brandIds: Record<string, number> = {};
  const distilleryIds: Record<string, number> = {};
  const labelIds: number[] = [];
  const mashbillIds: number[] = [];
  const storeIds: number[] = [];
  const ingredientIds: number[] = [];
  const created: { brands: number[]; distilleries: number[] } = { brands: [], distilleries: [] };

  beforeAll(async () => {
    if (new URL(url!).pathname !== "/rickhouse_housekeeping_test") {
      throw new Error("Housekeeping integration tests require rickhouse_housekeeping_test");
    }
    process.env.SESSION_SECRET ??= "x".repeat(40);
    q = await import("@/lib/housekeeping/duplicate-queries");
    ({ db } = await import("@/db"));
    const accounts = await db.select().from(users).where(inArray(users.username, ["admin", "member"]));
    owner = accounts.find((row) => row.username === "admin")!.id;
    other = accounts.find((row) => row.username === "member")!.id;
    const [category] = await db.select().from(categories).where(eq(categories.slug, "bourbon"));

    const brand = async (ownerId: number, name: string) => {
      const [row] = await db.insert(brands).values({ ownerId, name, slug: `${name}-${ownerId}`.toLowerCase().replace(/[^a-z0-9]+/g, "-") }).returning();
      created.brands.push(row!.id);
      return row!.id;
    };
    for (const name of ["Maker's Mark", "Makers Mark", "Wild Turkey", "Four Roses", "Four Rose", "Old Grand-Dad", "Old Granddad"]) {
      brandIds[name] = await brand(owner, name);
    }
    await brand(other, "Maker's Mark");
    await brand(other, "Makers Mark");

    const distillery = async (name: string, city: string | null) => {
      const [row] = await db.insert(distilleries).values({ ownerId: owner, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), city }).returning();
      created.distilleries.push(row!.id);
      return row!.id;
    };
    distilleryIds.bt = await distillery("Buffalo Trace", "Frankfort");
    distilleryIds.btd = await distillery("Buffalo Trace Distillery", null);
    distilleryIds.hh = await distillery("Heaven Hill", "Bardstown");

    const label = async (brandId: number, name: string) => {
      const [row] = await db.insert(expressions).values({ ownerId: owner, brandId, categoryId: category!.id, name, slug: `${name}-${brandId}`.toLowerCase().replace(/[^a-z0-9]+/g, "-") }).returning();
      labelIds.push(row!.id);
      return row!.id;
    };
    const e1 = await label(brandIds["Maker's Mark"]!, "Label One");
    const e2 = await label(brandIds["Wild Turkey"]!, "Label Two");
    const e3 = await label(brandIds["Wild Turkey"]!, "Label Three");
    await db.insert(expressionDistilleries).values([
      { expressionId: e1, distilleryId: distilleryIds.bt! },
      { expressionId: e2, distilleryId: distilleryIds.bt! },
      { expressionId: e3, distilleryId: distilleryIds.btd! },
    ]);

    const mashbill = async (partial: boolean, grains: Array<[string, string]>) => {
      const [row] = await db.insert(mashbills).values({ ownerId: owner, isPartial: partial }).returning();
      mashbillIds.push(row!.id);
      await db.insert(mashbillGrains).values(grains.map(([grain, percent], position) => ({ mashbillId: row!.id, grain, percent, position })));
      return row!.id;
    };
    await mashbill(false, [["Corn", "75"], ["Rye", "13"], ["Malted barley", "12"]]);
    await mashbill(false, [["malted barley", "12"], ["rye", "13"], ["corn", "75"]]);
    await mashbill(false, [["Corn", "60"], ["Rye", "28"], ["Malted barley", "12"]]);
    await mashbill(true, [["Corn", "75"], ["Rye", "13"], ["Malted barley", "12"]]);

    const store = async (name: string, city: string, state: string) => {
      const [row] = await db.insert(stores).values({ ownerId: owner, name, slug: `${name}-${city}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"), city, state }).returning();
      storeIds.push(row!.id);
    };
    await store("Binny's", "Chicago", "IL");
    await store("Binnys", "Chicago", "IL");
    await store("Binny's Beverage", "Springfield", "IL");

    const ingredient = async (kind: "maguey" | "distillate", name: string) => {
      const [row] = await db.insert(ingredients).values({ ownerId: owner, kind, name }).returning();
      ingredientIds.push(row!.id);
    };
    await ingredient("maguey", "Agave");
    await ingredient("distillate", "Agave");
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(housekeepingDismissals).where(inArray(housekeepingDismissals.ownerId, [owner, other]));
    if (labelIds.length) await db.delete(expressions).where(inArray(expressions.id, labelIds));
    if (created.brands.length) await db.delete(brands).where(inArray(brands.id, created.brands));
    if (created.distilleries.length) await db.delete(distilleries).where(inArray(distilleries.id, created.distilleries));
    if (mashbillIds.length) await db.delete(mashbills).where(inArray(mashbills.id, mashbillIds));
    if (storeIds.length) await db.delete(stores).where(inArray(stores.id, storeIds));
    if (ingredientIds.length) await db.delete(ingredients).where(inArray(ingredients.id, ingredientIds));
  });

  it("counts each kind's likely pairs for the owner alone", async () => {
    const counts = await q.countDuplicatePairs(owner);
    expect(counts).toEqual({
      brands: 3, // Maker's/Makers, Four Roses/Four Rose, Old Grand-Dad/Old Granddad
      distilleries: 1,
      companies: 0,
      finishes: 0,
      ingredients: 0, // the same name in two kinds is not a pair
      mashbills: 1, // the partial recipe and the different recipe are not pairs
      cooperages: 0,
      stores: 1, // Binny's and Binnys in one place; Binny's Beverage is in another
      tags: 0,
    });
  });

  it("lists pairs best first with each side's labels in use, and never another account's rows", async () => {
    const list = await q.listDuplicatePairs(owner, "brands", 10);
    expect(list).toHaveLength(3);
    const makers = list.find((pair) => pair.a.name === "Maker's Mark")!;
    expect(makers.kind).toBe("brands");
    expect(makers.score).toBe(0);
    expect(makers.a.id).toBe(brandIds["Maker's Mark"]);
    expect(makers.b.id).toBe(brandIds["Makers Mark"]);
    expect(makers.a.uses).toBe(1);
    expect(makers.b.uses).toBe(0);
    expect(makers.key).toBe(`${makers.a.id}:${makers.b.id}`);
    const seen = new Set(list.flatMap((pair) => [pair.a.id, pair.b.id]));
    for (const id of created.brands) if (!Object.values(brandIds).includes(id)) expect(seen.has(id)).toBe(false);
    expect(list.map((pair) => pair.score)).toEqual([...list.map((pair) => pair.score)].sort());
  });

  it("describes a distillery pair with its places and how many labels use each", async () => {
    const [pair] = await q.listDuplicatePairs(owner, "distilleries", 10);
    expect(pair!.score).toBe(1);
    expect(pair!.a.name).toBe("Buffalo Trace");
    expect(pair!.a.detail).toBe("Frankfort");
    expect(pair!.a.uses).toBe(2);
    expect(pair!.b.uses).toBe(1);
    // A distillery with no place of its own is not described by the column's default country.
    expect(pair!.b.detail).toBe("");
    expect(pair!.a.fields).toMatchObject({ city: "Frankfort" });
    expect(pair!.b.fields).toMatchObject({ city: null });
  });

  it("names a mashbill by its recipe and pairs only identical complete recipes", async () => {
    const [pair] = await q.listDuplicatePairs(owner, "mashbills", 10);
    expect(pair!.reason).toBe("Same grain recipe");
    expect(pair!.a.name.toLowerCase()).toBe("75% corn · 13% rye · 12% malted barley");
    expect(pair!.b.name.toLowerCase()).toBe("75% corn · 13% rye · 12% malted barley");
    expect((await q.listDuplicatePairs(owner, "mashbills", 10))).toHaveLength(1);
  });

  it("does not pair stores in different places or ingredients of different kinds", async () => {
    expect(await q.listDuplicatePairs(owner, "stores", 10)).toHaveLength(1);
    expect(await q.listDuplicatePairs(owner, "ingredients", 10)).toEqual([]);
  });

  it("truncates to the limit", async () => {
    expect(await q.listDuplicatePairs(owner, "brands", 1)).toHaveLength(1);
  });

  it("leaves a dismissed pair out, in either order, and keeps the others", async () => {
    const { dismiss, duplicateScope, pairKey } = await import("@/lib/housekeeping/dismissals");
    await dismiss(owner, duplicateScope("brands"), pairKey(brandIds["Four Rose"]!, brandIds["Four Roses"]!));
    expect((await q.countDuplicatePairs(owner)).brands).toBe(2);
    const names = (await q.listDuplicatePairs(owner, "brands", 10)).flatMap((pair) => [pair.a.name, pair.b.name]);
    expect(names).not.toContain("Four Roses");
    expect(names).toContain("Old Granddad");
  });

  it("is empty for an account with nothing like it", async () => {
    expect(await q.listDuplicatePairs(-1, "brands", 10)).toEqual([]);
    expect(Object.values(await q.countDuplicatePairs(-1)).every((n) => n === 0)).toBe(true);
  });
});
