import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { connect, fixtures, url, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";

const session = vi.hoisted(() => ({ id: 0 }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: session.id }) }));

/** Opt-in, like the tournament integration tests: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("creating a distillery or mashbill with details, against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let owner: number;
  let stranger: number;
  let route: typeof import("../route");

  const ctx = (kind: string) => ({ params: Promise.resolve({ kind }) });
  const post = (kind: string, body: unknown) =>
    route.POST(new NextRequest(`https://rickhouse.example.com/api/v1/lookups/${kind}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }), ctx(kind));
  const list = async (kind: string, as: number) => {
    session.id = as;
    const res = await route.GET(new NextRequest(`https://rickhouse.example.com/api/v1/lookups/${kind}`), ctx(kind));
    session.id = owner;
    return ((await res.json()) as { items: { id: number; name: string }[] }).items;
  };

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    owner = await fx.mkUser();
    stranger = await fx.mkUser();
    session.id = owner;
    route = await import("../route");
  });

  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  it("saves a Scotch distillery with its region and place, owned by the caller", async () => {
    const res = await post("distilleries", { name: "Bowmore", country: "Scotland", region: "Islay", city: "Bowmore", isDefunct: false, notes: "Founded on the shore" });
    expect(res.status).toBe(201);
    const { id, created } = (await res.json()) as { id: number; created: boolean };
    expect(created).toBe(true);
    const [row] = await m.sql<{ owner_id: number; region: string; country: string; city: string; disclosure: string; slug: string }>(
      `SELECT owner_id, region, country, city, disclosure, slug FROM distilleries WHERE id = $1`, id);
    expect(row).toMatchObject({ owner_id: owner, region: "Islay", country: "Scotland", city: "Bowmore", disclosure: "named", slug: "bowmore" });
    expect((await list("distilleries", stranger)).map((i) => i.name)).not.toContain("Bowmore");
  });

  it("hands back the one it has, in any case, and keeps what it holds", async () => {
    const res = await post("distilleries", { name: "BOWMORE", country: "USA", region: "", city: "Elsewhere" });
    expect(res.status).toBe(200);
    expect((await res.json()).created).toBe(false);
    const rows = await m.sql<{ city: string }>(`SELECT city FROM distilleries WHERE owner_id = $1 AND name = 'Bowmore'`, owner);
    expect(rows).toEqual([{ city: "Bowmore" }]);
  });

  it("refuses a region that isn't Scotch, and an unknown field, without saving", async () => {
    const bad = await post("distilleries", { name: "Nowhere", country: "Scotland", region: "Atlantis" });
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.fields).toHaveProperty("region");
    expect((await post("distilleries", { name: "Nowhere", country: "USA", ownerId: stranger })).status).toBe(422);
    expect(await m.sql(`SELECT 1 FROM distilleries WHERE name = 'Nowhere'`)).toHaveLength(0);
  });

  it("saves a mashbill recipe and lists it the way the picker shows it", async () => {
    const res = await post("mashbills", { grains: [{ grain: "Corn", percent: 75 }, { grain: "Rye", percent: 25 }] });
    expect(res.status).toBe(201);
    const { id, name } = (await res.json()) as { id: number; name: string };
    expect(name).toContain("Corn");
    const grains = await m.sql<{ grain: string; percent: string }>(`SELECT grain, percent FROM mashbill_grains WHERE mashbill_id = $1 ORDER BY position`, id);
    expect(grains.map((g) => [g.grain, Number(g.percent)])).toEqual([["Corn", 75], ["Rye", 25]]);
    expect((await list("mashbills", owner)).find((i) => i.id === id)?.name).toBe(name);
    expect((await list("mashbills", stranger)).map((i) => i.id)).not.toContain(id);
  });

  // Every user starts with the generic styles (the users_seed_generic_mashbills trigger), so count against what was there.
  const mashbillCount = async () => (await m.sql(`SELECT 1 FROM mashbills WHERE owner_id = $1`, owner)).length;

  it("refuses the same recipe twice, and a recipe that doesn't add up to 100", async () => {
    const before = await mashbillCount();
    const dup = await post("mashbills", { grains: [{ grain: "Rye", percent: 25 }, { grain: "Corn", percent: 75 }] });
    expect(dup.status).toBe(422);
    expect((await dup.json()).error.fields).toHaveProperty("grains");
    const short = await post("mashbills", { grains: [{ grain: "Corn", percent: 60 }, { grain: "Barley", percent: 10 }] });
    expect(short.status).toBe(422);
    expect(await mashbillCount()).toBe(before);
  });

  it("saves a secret mashbill by reference name, with no grains", async () => {
    const res = await post("mashbills", { isSecret: true, name: "Buffalo Trace Wheated" });
    expect(res.status).toBe(201);
    expect((await res.json()).name).toBe("Buffalo Trace Wheated");
  });
});
