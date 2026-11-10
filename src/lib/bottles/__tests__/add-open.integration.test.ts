import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";

const session = vi.hoisted(() => ({ id: 0 }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ requireSession: async () => ({ id: session.id }), getCurrentUser: async () => ({ id: session.id }) }));

/** Opt-in, like the tournament integration tests: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("adding a bottle opened, against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let owner: number;
  let label: number;
  let form: typeof import("@/app/(app)/bottles/actions");
  let catalog: typeof import("@/app/(app)/bottles/add/actions");
  let api: typeof import("@/app/api/v1/bottles/route");

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    const cat = await fx.mkCategories();
    owner = await fx.mkUser();
    label = await fx.mkLabel(owner, cat.whiskey, "Add Open");
    session.id = owner;
    form = await import("@/app/(app)/bottles/actions");
    catalog = await import("@/app/(app)/bottles/add/actions");
    api = await import("@/app/api/v1/bottles/route");
  });

  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  const row = async (id: number) =>
    (await m.sql<{ is_open: boolean; fill_pct: number; status: string; date_opened: string | null }>(
      `SELECT is_open, fill_pct, status, date_opened::text FROM bottles WHERE id = $1`, id,
    ))[0]!;

  const formData = (extra: Record<string, string>) => {
    const data = new FormData();
    data.set("expressionId", String(label));
    data.set("status", "owned");
    data.set("acquisition", "purchase");
    for (const [k, v] of Object.entries(extra)) data.set(k, v);
    return data;
  };
  const idle = { ok: false, error: "" } as never;

  it("form: with nothing ticked the bottle stays sealed", async () => {
    const result = await form.saveBottleAction(null, idle, formData({}));
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    expect(await row((result as { createdId: number }).createdId)).toMatchObject({ is_open: false, fill_pct: 100, status: "owned", date_opened: null });
  });

  it("form: an opened bottle at 40% is open, dated, and keeps its level", async () => {
    const result = await form.saveBottleAction(null, idle, formData({ isOpen: "true", fillPct: "40", dateOpened: "2026-06-01" }));
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    expect(await row((result as { createdId: number }).createdId)).toMatchObject({ is_open: true, fill_pct: 40, status: "open", date_opened: "2026-06-01" });
  });

  it("catalog: a level under full opens it, dated today when no date is given", async () => {
    const result = await catalog.catalogBottleAction({ expressionId: label, label: null, links: null, ttbIds: "", bottle: { status: "owned", acquisition: "purchase", isOpen: false, fillPct: "75", dateOpened: "" } });
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    const bottle = await row((result as { bottleId: number }).bottleId);
    expect(bottle).toMatchObject({ is_open: true, fill_pct: 75, status: "open" });
    expect(bottle.date_opened).toBe(new Date().toISOString().slice(0, 10));
  });

  it("catalog: a date in the future is refused on the bottle", async () => {
    const result = await catalog.catalogBottleAction({ expressionId: label, label: null, links: null, ttbIds: "", bottle: { status: "owned", acquisition: "purchase", isOpen: true, fillPct: "100", dateOpened: "2999-01-01" } });
    expect(result).toMatchObject({ ok: false, bottleErrors: { dateOpened: expect.any(String) } });
  });

  const post = (body: Record<string, unknown>) =>
    api.POST(new Request("http://localhost/api/v1/bottles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expressionId: label, ...body }) }) as never);

  it("phone API: an opened bottle at 30% is open and dated; a bare post stays sealed", async () => {
    const opened = await post({ isOpen: true, fillPct: 30, dateOpened: "2026-05-02" });
    expect(opened.status).toBe(201);
    expect(await row(((await opened.json()) as { id: number }).id)).toMatchObject({ is_open: true, fill_pct: 30, status: "open", date_opened: "2026-05-02" });
    const bare = await post({});
    expect(await row(((await bare.json()) as { id: number }).id)).toMatchObject({ is_open: false, fill_pct: 100, status: "owned", date_opened: null });
  });

  it("phone API: a future opened date is a 422 on dateOpened", async () => {
    const res = await post({ isOpen: true, dateOpened: "2999-01-01" });
    expect(res.status).toBe(422);
  });
});
