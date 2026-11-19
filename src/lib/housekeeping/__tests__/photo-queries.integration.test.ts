import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { bottles, bottleImages, brands, categories, expressions, expressionReleases, users } from "@/db/schema";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("missing photos against a real database", () => {
  let db: typeof import("@/db").db;
  let queries: typeof import("@/lib/housekeeping/photo-queries");
  let owner: number;
  let other: number;
  let l1: number;
  let l2: number;
  let l3: number;
  let theirs: number;
  let b1: number;
  let b2: number;
  let v1: number;
  const labelIds: number[] = [];
  const brandIds: number[] = [];

  beforeAll(async () => {
    if (new URL(url!).pathname !== "/rickhouse_housekeeping_test") {
      throw new Error("Housekeeping integration tests require rickhouse_housekeeping_test");
    }
    process.env.SESSION_SECRET ??= "x".repeat(40);
    queries = await import("@/lib/housekeeping/photo-queries");
    ({ db } = await import("@/db"));
    const accounts = await db.select().from(users).where(inArray(users.username, ["admin", "member"]));
    owner = accounts.find((row) => row.username === "admin")!.id;
    other = accounts.find((row) => row.username === "member")!.id;
    const [category] = await db.select().from(categories).where(eq(categories.slug, "bourbon"));
    const suffix = crypto.randomUUID();
    const makeBrand = async (ownerId: number, name: string) => {
      const [row] = await db.insert(brands).values({ ownerId, name: `${name} ${suffix}`, slug: `${name}-${suffix}` }).returning();
      brandIds.push(row!.id);
      return row!.id;
    };
    const brandId = await makeBrand(owner, "Photo Brand");
    const otherBrand = await makeBrand(other, "Other Brand");
    const makeLabel = async (ownerId: number, brandId: number, name: string, photoPath: string | null = null) => {
      const [row] = await db.insert(expressions).values({ ownerId, brandId, categoryId: category!.id, name, slug: `${name}-${suffix}`, photoPath }).returning();
      labelIds.push(row!.id);
      return row!.id;
    };
    // Insert in reverse name order so insertion order cannot satisfy sorting.
    l3 = await makeLabel(owner, brandId, "L3");
    l2 = await makeLabel(owner, brandId, "L2", "label.jpg");
    l1 = await makeLabel(owner, brandId, "L1");
    theirs = await makeLabel(other, otherBrand, "Other Label");
    const rows = await db.insert(bottles).values([
      { ownerId: owner, expressionId: l1, isSingleBarrel: true, barrelNumber: "42", status: "wishlist" },
      { ownerId: owner, expressionId: l1, isSingleBarrelPick: true },
      { ownerId: owner, expressionId: l2 },
      { ownerId: other, expressionId: theirs, isSingleBarrelPick: true },
    ]).returning();
    b1 = rows[0]!.id;
    b2 = rows[1]!.id;
    // Even a non-primary life photo means the barrel has a photo.
    await db.insert(bottleImages).values({ bottleId: b2, filePath: "life.jpg", kind: "life", isPrimary: false });
    const releases = await db.insert(expressionReleases).values([
      { expressionId: l2, name: "Autumn", releaseYear: 2024 },
      { expressionId: l2, name: "Spring", photoPath: "vintage.jpg" },
      { expressionId: theirs, name: "Other Vintage" },
    ]).returning();
    v1 = releases[0]!.id;
  });

  afterAll(async () => {
    if (!db) return;
    if (labelIds.length) {
      await db.delete(bottles).where(inArray(bottles.expressionId, labelIds));
      await db.delete(expressions).where(inArray(expressions.id, labelIds));
    }
    if (brandIds.length) await db.delete(brands).where(inArray(brands.id, brandIds));
  });

  it("counts each owner's missing own photos without multiplying labels by bottles", async () => {
    expect(await queries.countMissingPhotos(owner)).toEqual({ labels: 2, barrels: 1, vintages: 1 });
    expect(await queries.countMissingPhotos(other)).toEqual({ labels: 1, barrels: 1, vintages: 1 });
    expect(await queries.countMissingPhotos(-1)).toEqual({ labels: 0, barrels: 0, vintages: 0 });
  });

  it("lists labels by brand, name and id with their category and owner-scoped bottle count", async () => {
    const rows = await queries.listMissingPhotos(owner, "labels", 0, 8);
    expect(rows.map((row) => row.target)).toEqual([
      { kind: "label", expressionId: l1 }, { kind: "label", expressionId: l3 },
    ]);
    const [brand] = await db.select().from(brands).innerJoin(expressions, eq(expressions.brandId, brands.id)).where(eq(expressions.id, l1));
    expect(rows[0]).toEqual({ key: `label:${l1}`, seed: l1, name: `${brand!.brands.name} L1`, meta: "Bourbon · 2 bottles", target: { kind: "label", expressionId: l1 } });
    expect(rows[1]!.meta).toBe("Bourbon · 0 bottles");
  });

  it("applies offset and limit and returns no rows for an empty owner", async () => {
    expect((await queries.listMissingPhotos(owner, "labels", 1, 1)).map((row) => row.key)).toEqual([`label:${l3}`]);
    expect(await queries.listMissingPhotos(owner, "labels", 2, 1)).toEqual([]);
    for (const tab of ["labels", "barrels", "vintages"] as const) {
      expect(await queries.listMissingPhotos(-1, tab, 0, 8)).toEqual([]);
    }
  });

  it("includes wishlist single barrels but excludes ordinary bottles and any imaged barrel", async () => {
    const rows = await queries.listMissingPhotos(owner, "barrels", 0, 8);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: `barrel:${b1}`, seed: b1, meta: "Bourbon · Barrel 42", target: { kind: "barrel", bottleId: b1 } });
    expect(rows[0]!.name).toBe((await queries.listMissingPhotos(owner, "labels", 0, 1))[0]!.name);
    const otherRows = await queries.listMissingPhotos(other, "barrels", 0, 8);
    expect(otherRows).toHaveLength(1);
    expect(otherRows[0]!.meta).toBe("Bourbon");
  });

  it("lists a vintage's own missing photo despite its label photo and supplies both target ids", async () => {
    const rows = await queries.listMissingPhotos(owner, "vintages", 0, 8);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: `vintage:${v1}`, seed: v1, meta: "Autumn · 2024", target: { kind: "vintage", expressionId: l2, vintageId: v1 } });
    expect(rows[0]!.name).toMatch(/ L2$/);
    expect((await queries.listMissingPhotos(other, "vintages", 0, 8))[0]!.meta).toBe("Other Vintage");
  });

  it("orders labels by brand before label name", async () => {
    const [brand] = await db.insert(brands).values({ ownerId: owner, name: `A brand ${crypto.randomUUID()}`, slug: crypto.randomUUID() }).returning();
    brandIds.push(brand!.id);
    const [source] = await db.select().from(expressions).where(and(eq(expressions.id, l1), eq(expressions.ownerId, owner)));
    const extra = await db.insert(expressions).values([
      { ownerId: owner, brandId: brand!.id, categoryId: source!.categoryId, name: "Z label", slug: crypto.randomUUID() },
    ]).returning();
    labelIds.push(...extra.map((row) => row.id));
    try {
      expect((await queries.listMissingPhotos(owner, "labels", 0, 8)).map((row) => row.seed)).toEqual([extra[0]!.id, l1, l3]);
    } finally {
      await db.delete(expressions).where(inArray(expressions.id, extra.map((row) => row.id)));
    }
  });
});
