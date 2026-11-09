import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";

const deleted = vi.hoisted(() => ({ calls: [] as Array<[string, string | null | undefined]>, fail: false }));
const session = vi.hoisted(() => ({ id: 0 }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: session.id }) }));
vi.mock("@/lib/images", () => ({
  deleteStoredImage: async (filePath: string, thumbPath?: string | null) => {
    if (deleted.fail) throw new Error("disk gone");
    deleted.calls.push([filePath, thumbPath]);
  },
}));

/** Opt-in, like the tournament integration tests: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("removing a known release, against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let owner: number;
  let stranger: number;
  let store: typeof import("@/lib/releases-store");

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories();
    owner = await fx.mkUser();
    stranger = await fx.mkUser();
    store = await import("@/lib/releases-store");
  });

  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  async function mkRelease(label: number, name: string, photo?: { path: string; thumb: string }): Promise<number> {
    const [row] = await m.sql<{ id: number }>(
      `INSERT INTO expression_releases (expression_id, name, photo_path, photo_thumb_path) VALUES ($1, $2, $3, $4) RETURNING id`,
      label, name, photo?.path ?? null, photo?.thumb ?? null,
    );
    return row!.id;
  }
  const exists = async (id: number) => (await m.sql(`SELECT 1 FROM expression_releases WHERE id = $1`, id)).length === 1;

  it("removes it, keeps its bottles and their tastings, and says how many lost it", async () => {
    const label = await fx.mkLabel(owner, cat.whiskey, "Batch Label");
    const release = await mkRelease(label, "2024-01");
    const keeper = await mkRelease(label, "2024-02");
    const bottle = await fx.mkBottle(owner, label);
    await m.sql(`UPDATE bottles SET release_id = $1 WHERE id = $2`, release, bottle);
    await m.sql(`INSERT INTO tasting_notes (owner_id, expression_id, bottle_id) VALUES ($1, $2, $3)`, owner, label, bottle);

    const result = await store.removeRelease(owner, label, release);
    expect(result).toEqual({ ok: true, bottles: 1 });
    expect(await exists(release)).toBe(false);
    expect(await exists(keeper)).toBe(true);
    expect((await m.sql<{ release_id: number | null }>(`SELECT release_id FROM bottles WHERE id = $1`, bottle))[0]!.release_id).toBeNull();
    expect(await m.sql(`SELECT 1 FROM tasting_notes WHERE bottle_id = $1`, bottle)).toHaveLength(1);
  });

  it("deletes the release's photo files, and still removes it when they cannot be deleted", async () => {
    const label = await fx.mkLabel(owner, cat.whiskey, "Photo Label");
    const withPhoto = await mkRelease(label, "Pictured", { path: "releases/a.jpg", thumb: "releases/a-thumb.jpg" });
    deleted.calls.length = 0;
    expect(await store.removeRelease(owner, label, withPhoto)).toEqual({ ok: true, bottles: 0 });
    expect(deleted.calls).toEqual([["releases/a.jpg", "releases/a-thumb.jpg"]]);

    const stuck = await mkRelease(label, "Stuck", { path: "releases/b.jpg", thumb: "releases/b-thumb.jpg" });
    deleted.fail = true;
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await store.removeRelease(owner, label, stuck)).toEqual({ ok: true, bottles: 0 });
      expect(await exists(stuck)).toBe(false);
      expect(quiet).toHaveBeenCalled();
    } finally {
      deleted.fail = false;
      quiet.mockRestore();
    }
  });

  it("will not touch someone else's label, or a release under a different label", async () => {
    const mine = await fx.mkLabel(owner, cat.whiskey, "Mine");
    const other = await fx.mkLabel(owner, cat.whiskey, "Other Of Mine");
    const release = await mkRelease(mine, "Mine 1", { path: "releases/c.jpg", thumb: "releases/c-thumb.jpg" });
    deleted.calls.length = 0;

    expect(await store.removeRelease(stranger, mine, release)).toMatchObject({ ok: false, status: 404 });
    expect(await store.removeRelease(owner, other, release)).toMatchObject({ ok: false, status: 404 });
    expect(await store.removeRelease(owner, mine, 999_999_999)).toMatchObject({ ok: false, status: 404 });
    expect(await exists(release)).toBe(true);
    expect(deleted.calls).toEqual([]);
  });

  it("through the routes: the label read says what removing each release takes, and DELETE then takes it", async () => {
    session.id = owner;
    const labelRoute = await import("@/app/api/v1/expressions/[id]/route");
    const releaseRoute = await import("@/app/api/v1/expressions/[id]/releases/[releaseId]/route");
    const label = await fx.mkLabel(owner, cat.whiskey, "Routes Label");
    const used = await mkRelease(label, "Used", { path: "releases/d.jpg", thumb: "releases/d-thumb.jpg" });
    const bare = await mkRelease(label, "Bare");
    const bottle = await fx.mkBottle(owner, label);
    await m.sql(`UPDATE bottles SET release_id = $1 WHERE id = $2`, used, bottle);

    const read = async () => ((await (await labelRoute.GET(new NextRequest(`https://rickhouse.example.com/api/v1/expressions/${label}`), { params: Promise.resolve({ id: String(label) }) })).json()) as { releases: { id: number; removal: string | null }[] }).releases;
    const before = await read();
    expect(before.find((r) => r.id === used)?.removal).toBe("Used has a photo and 1 bottle. Removing it: its photo will be deleted; the bottle stays but loses this release.");
    expect(before.find((r) => r.id === bare)?.removal).toBeNull();

    deleted.calls.length = 0;
    const res = await releaseRoute.DELETE(new NextRequest("https://rickhouse.example.com/x", { method: "DELETE" }), { params: Promise.resolve({ id: String(label), releaseId: String(used) }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: used, bottles: 1 });
    expect((await read()).map((r) => r.id)).toEqual([bare]);
    expect(deleted.calls).toEqual([["releases/d.jpg", "releases/d-thumb.jpg"]]);
  });
});
