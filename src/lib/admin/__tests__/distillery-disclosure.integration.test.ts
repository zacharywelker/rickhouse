import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";

vi.mock("server-only", () => ({}));

/** Opt-in: needs TOURNAMENT_TEST_DATABASE_URL naming a throwaway migrated database. */
describe.skipIf(!url)("saving a distillery: how it is known is not a web field", () => {
  let m: Db;
  let fx: Fixtures;
  let owner: number;
  let registry: typeof import("../registry");
  const save = (raw: Record<string, unknown>, id: number | null = null) => registry.RESOURCES.distilleries.save(raw, id, owner);
  const disclosureOf = async (id: number) => (await m.sql<{ disclosure: string }>(`SELECT disclosure FROM distilleries WHERE id = $1`, id))[0]!.disclosure;

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    owner = await fx.mkUser();
    registry = await import("../registry");
  });
  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  it("makes a new distillery named when no disclosure is sent", async () => {
    const saved = await save({ name: "Plain Works", country: "USA" });
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(await disclosureOf(saved.id)).toBe("named");
  });

  it("keeps an undisclosed placeholder undisclosed when the web form edits it", async () => {
    const made = await save({ name: "Undisclosed (Indiana)", state: "Indiana", country: "USA", disclosure: "undisclosed" });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(await disclosureOf(made.id)).toBe("undisclosed");
    // The web form no longer sends disclosure; an edit must not turn the placeholder into a named distillery.
    const edited = await save({ name: "Undisclosed (Indiana)", state: "Indiana", country: "USA", notes: "Seen on three labels" }, made.id);
    expect(edited.ok).toBe(true);
    expect(await disclosureOf(made.id)).toBe("undisclosed");
  });

  it("still sets it when the phone sends it", async () => {
    const made = await save({ name: "Phone Works", country: "USA" });
    if (!made.ok) throw new Error("setup");
    await save({ name: "Phone Works", country: "USA", disclosure: "undisclosed" }, made.id);
    expect(await disclosureOf(made.id)).toBe("undisclosed");
  });
});
