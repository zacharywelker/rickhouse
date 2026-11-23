import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { bottles, brands, categories, expressionColas, expressions, housekeepingDismissals, users } from "@/db/schema";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("labels without a TTB approval against a real database", () => {
  let db: typeof import("@/db").db;
  let q: typeof import("@/lib/housekeeping/ttb-queries");
  let dismissals: typeof import("@/lib/housekeeping/dismissals");
  let owner: number;
  let other: number;
  let categoryId: number;
  let n = 0;
  const brandIds: number[] = [];
  const labelIds: number[] = [];
  const slug = (value: string) => `${value}-${++n}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const brand = async (ownerId: number, name: string) => {
    const [row] = await db.insert(brands).values({ ownerId, name, slug: slug(name) }).returning();
    brandIds.push(row!.id);
    return row!.id;
  };
  const label = async (ownerId: number, brandId: number, name: string) => {
    const [row] = await db.insert(expressions).values({ ownerId, brandId, categoryId, name, slug: slug(name) }).returning();
    labelIds.push(row!.id);
    return row!.id;
  };
  const approval = (ownerId: number, expressionId: number, ttbId: string, fetchError: string | null = null) =>
    db.insert(expressionColas).values({ ownerId, expressionId, ttbId, fetchError });

  let l1: number, l2: number, l3: number, l4: number, l5: number, a1: number, a2: number, theirs: number;

  beforeAll(async () => {
    if (new URL(url!).pathname !== "/rickhouse_housekeeping_test") {
      throw new Error("Housekeeping integration tests require rickhouse_housekeeping_test");
    }
    process.env.SESSION_SECRET ??= "x".repeat(40);
    q = await import("@/lib/housekeeping/ttb-queries");
    dismissals = await import("@/lib/housekeeping/dismissals");
    ({ db } = await import("@/db"));
    const accounts = await db.select().from(users).where(inArray(users.username, ["admin", "member"]));
    owner = accounts.find((row) => row.username === "admin")!.id;
    other = accounts.find((row) => row.username === "member")!.id;
    const [category] = await db.select().from(categories).where(eq(categories.slug, "bourbon"));
    categoryId = category!.id;

    const zed = await brand(owner, "Zed Brand");
    const alpha = await brand(owner, "Alpha Brand");
    // Inserted out of order so insertion order cannot satisfy the sort.
    l4 = await label(owner, zed, "Open");
    l1 = await label(owner, alpha, "Beta");
    a1 = await label(owner, alpha, "Alpha");
    l2 = await label(owner, alpha, "Approved");
    l3 = await label(owner, alpha, "Dismissed");
    l5 = await label(owner, alpha, "Failed Lookup");
    a2 = a1;
    await approval(owner, l2, "21132001000620");
    await approval(owner, l5, "19045001000288", "TTB did not answer");
    await dismissals.dismiss(owner, q.TTB_SCOPE, String(l3));
    await db.insert(bottles).values([{ ownerId: owner, expressionId: l1 }, { ownerId: owner, expressionId: l1 }, { ownerId: owner, expressionId: a1 }]);

    const theirBrand = await brand(other, "Their Brand");
    theirs = await label(other, theirBrand, "Theirs");
    await dismissals.dismiss(other, q.TTB_SCOPE, String(l4)); // another account's dismissal of an id that happens to be mine
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(housekeepingDismissals).where(inArray(housekeepingDismissals.ownerId, [owner, other]));
    if (labelIds.length) await db.delete(expressionColas).where(inArray(expressionColas.expressionId, labelIds));
    if (labelIds.length) await db.delete(bottles).where(inArray(bottles.expressionId, labelIds));
    if (labelIds.length) await db.delete(expressions).where(inArray(expressions.id, labelIds));
    if (brandIds.length) await db.delete(brands).where(inArray(brands.id, brandIds));
  });

  it("counts only the owner's labels with no approval and no dismissal", async () => {
    // Open, Beta, Alpha: not Approved, not Dismissed, not Failed Lookup (it has a row), none of the other account's.
    expect(await q.countLabelsWithoutTtb(owner)).toBe(3);
    expect(await q.countLabelsWithoutTtb(other)).toBe(1);
    expect(await q.countLabelsWithoutTtb(-1)).toBe(0);
  });

  it("lists them by brand, then label name, then id, with category and the owner's bottle count", async () => {
    const rows = await q.listLabelsWithoutTtb(owner, 0, 10);
    expect(rows.map((row) => row.name)).toEqual(["Alpha Brand Alpha", "Alpha Brand Beta", "Zed Brand Open"]);
    expect(rows.map((row) => row.expressionId)).toEqual([a2, l1, l4]);
    expect(rows[0]).toEqual({ expressionId: a1, name: "Alpha Brand Alpha", brandName: "Alpha Brand", meta: "Bourbon · 1 bottle" });
    expect(rows[1]!.meta).toBe("Bourbon · 2 bottles");
    expect(rows[2]!.meta).toBe("Bourbon · 0 bottles");
  });

  it("does not let another account's dismissal hide my label, or mine hide theirs", async () => {
    expect((await q.listLabelsWithoutTtb(owner, 0, 10)).map((row) => row.expressionId)).toContain(l4);
    expect((await q.listLabelsWithoutTtb(other, 0, 10)).map((row) => row.expressionId)).toEqual([theirs]);
  });

  it("pages with offset and limit", async () => {
    expect((await q.listLabelsWithoutTtb(owner, 1, 1)).map((row) => row.expressionId)).toEqual([l1]);
    expect((await q.listLabelsWithoutTtb(owner, 0, 2)).length).toBe(2);
    expect(await q.listLabelsWithoutTtb(owner, 3, 5)).toEqual([]);
  });

  it("drops a label from the list once it gains an approval, with no dismissal", async () => {
    await approval(owner, l4, "20211001000143");
    expect((await q.listLabelsWithoutTtb(owner, 0, 10)).map((row) => row.expressionId)).not.toContain(l4);
    expect(await q.countLabelsWithoutTtb(owner)).toBe(2);
  });

  it("says whether a label belongs to the account", async () => {
    expect(await q.labelBelongsTo(owner, l1)).toBe(true);
    expect(await q.labelBelongsTo(owner, theirs)).toBe(false);
    expect(await q.labelBelongsTo(owner, 999_999_999)).toBe(false);
  });
});
