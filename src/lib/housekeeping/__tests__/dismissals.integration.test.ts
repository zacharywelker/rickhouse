import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { housekeepingDismissals, users } from "@/db/schema";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("Housekeeping dismissals against a real database", () => {
  let db: typeof import("@/db").db;
  let store: typeof import("@/lib/housekeeping/dismissals");
  let owner: number;
  let other: number;

  beforeAll(async () => {
    if (new URL(url!).pathname !== "/rickhouse_housekeeping_test") {
      throw new Error("Housekeeping integration tests require rickhouse_housekeeping_test");
    }
    process.env.SESSION_SECRET ??= "x".repeat(40);
    store = await import("@/lib/housekeeping/dismissals");
    ({ db } = await import("@/db"));
    const accounts = await db.select().from(users).where(inArray(users.username, ["admin", "member"]));
    owner = accounts.find((row) => row.username === "admin")!.id;
    other = accounts.find((row) => row.username === "member")!.id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(housekeepingDismissals).where(inArray(housekeepingDismissals.ownerId, [owner, other]));
  });

  it("stores a dismissal once however often it is repeated", async () => {
    await store.dismiss(owner, "duplicate:brands", "1:2");
    await store.dismiss(owner, "duplicate:brands", "1:2");
    const rows = await db.select().from(housekeepingDismissals).where(and(eq(housekeepingDismissals.ownerId, owner), eq(housekeepingDismissals.key, "1:2")));
    expect(rows).toHaveLength(1);
  });

  it("lists only the caller's dismissals for the scope", async () => {
    await store.dismiss(owner, "duplicate:brands", "5:6");
    await store.dismiss(owner, "duplicate:stores", "7:8");
    await store.dismiss(other, "duplicate:brands", "9:10");
    const brands = await store.listDismissed(owner, "duplicate:brands");
    expect(brands.has("5:6")).toBe(true);
    expect(brands.has("7:8")).toBe(false);
    expect(brands.has("9:10")).toBe(false);
    expect((await store.listDismissed(other, "duplicate:brands")).has("9:10")).toBe(true);
    expect((await store.listDismissed(-1, "duplicate:brands")).size).toBe(0);
  });

  it("clears every pair that mentions a merged-away row, in either position, and only for that kind and owner", async () => {
    await store.dismiss(owner, "duplicate:finishes", "3:9");
    await store.dismiss(owner, "duplicate:finishes", "1:3");
    await store.dismiss(owner, "duplicate:finishes", "1:9");
    await store.dismiss(owner, "duplicate:tags", "3:9");
    await store.dismiss(other, "duplicate:finishes", "3:9");
    await db.transaction((tx) => store.clearDismissalsFor(tx, owner, "finishes", 3));
    const finishes = await store.listDismissed(owner, "duplicate:finishes");
    expect([...finishes].sort()).toEqual(["1:9"]);
    expect((await store.listDismissed(owner, "duplicate:tags")).has("3:9")).toBe(true);
    expect((await store.listDismissed(other, "duplicate:finishes")).has("3:9")).toBe(true);
  });

  it("does not mistake 3 for 13 or 30 when clearing", async () => {
    await store.dismiss(owner, "duplicate:cooperages", "13:30");
    await store.dismiss(owner, "duplicate:cooperages", "3:4");
    await db.transaction((tx) => store.clearDismissalsFor(tx, owner, "cooperages", 3));
    const kept = await store.listDismissed(owner, "duplicate:cooperages");
    expect([...kept]).toEqual(["13:30"]);
  });
});
