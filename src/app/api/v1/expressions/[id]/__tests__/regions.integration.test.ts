import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { connect, fixtures, url, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";

const session = vi.hoisted(() => ({ id: 0 }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: session.id }) }));

/** Opt-in, like the tournament integration tests: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("a label's Scotch regions, against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let owner: number;
  let scotch: number;
  let american: number;
  const madeCategories: number[] = [];
  let route: typeof import("../route");

  /** The category with this slug (its kind comes from the slug, walking up), made here if the database has none. */
  async function category(slug: string): Promise<number> {
    const [had] = await m.sql<{ id: number }>(`SELECT id FROM categories WHERE slug = $1`, slug);
    if (had) return had.id;
    const [made] = await m.sql<{ id: number }>(`INSERT INTO categories (name, slug, field_group) VALUES ($1, $2, 'whiskey') RETURNING id`, `Test ${slug}`, slug);
    madeCategories.push(made!.id);
    return made!.id;
  }

  const call = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
  const patch = (id: number, body: unknown) =>
    route.PATCH(new NextRequest(`https://rickhouse.example.com/api/v1/expressions/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }), call(id));
  const read = async (id: number) =>
    (await (await route.GET(new NextRequest(`https://rickhouse.example.com/api/v1/expressions/${id}`), call(id))).json()) as { regions: string[] };
  const stored = async (id: number) => (await m.sql<{ regions: string[] | null }>(`SELECT regions FROM expressions WHERE id = $1`, id))[0]!.regions;

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    owner = await fx.mkUser();
    session.id = owner;
    scotch = await category("scotch");
    american = await category("american-whiskey");
    route = await import("../route");
  });

  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      for (const id of madeCategories) await m.sql(`DELETE FROM categories WHERE id = $1`, id);
      await m.end();
    }
  });

  it("saves regions on a Scotch label, in order, and reads them back as a list", async () => {
    const label = await fx.mkLabel(owner, scotch, "Single Malt");
    expect((await read(label)).regions).toEqual([]);
    const res = await patch(label, { regions: ["islay", "Speyside"] });
    expect(res.status).toBe(200);
    expect(await stored(label)).toEqual(["Islay", "Speyside"]);
    expect((await read(label)).regions).toEqual(["Islay", "Speyside"]);
  });

  it("clears them with null, and keeps them when the edit is about something else", async () => {
    const label = await fx.mkLabel(owner, scotch, "Blend");
    await patch(label, { regions: ["Highland", "Islands"] });
    await patch(label, { description: "Smoky" });
    expect(await stored(label)).toEqual(["Highland", "Islands"]);
    await patch(label, { regions: null });
    expect(await stored(label)).toBeNull();
  });

  it("ignores regions sent for a label that is not Scotch", async () => {
    const label = await fx.mkLabel(owner, american, "Bourbon");
    const res = await patch(label, { regions: ["Islay"], description: "Kentucky" });
    expect(res.status).toBe(200);
    expect(await stored(label)).toBeNull();
    expect((await read(label)).regions).toEqual([]);
  });

  it("refuses a region that isn't Scotch and changes nothing", async () => {
    const label = await fx.mkLabel(owner, scotch, "Other");
    await patch(label, { regions: ["Lowland"] });
    const res = await patch(label, { regions: ["Lowland", "Atlantis"], description: "Should not save" });
    expect(res.status).toBe(422);
    expect(await stored(label)).toEqual(["Lowland"]);
    expect((await m.sql<{ description: string | null }>(`SELECT description FROM expressions WHERE id = $1`, label))[0]!.description).toBeNull();
  });
});
