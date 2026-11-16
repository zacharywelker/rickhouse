import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";
import { labelPatchBody } from "../save";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** Opt-in, like the other integration tests: a throwaway migrated database. */
describe.skipIf(!url)("regions, older names, releases and the category save, against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let owner: number;
  let rows: typeof import("../rows");

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories();
    owner = await fx.mkUser();
    rows = await import("../rows");
  });
  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  const q = (text: string, ...params: unknown[]) => m.sql<Record<string, unknown>>(text, ...params);
  const releases = (label: number) => q(`SELECT id, name, release_year, proof::float AS proof FROM expression_releases WHERE expression_id = $1 ORDER BY position`, label);
  const save = (label: number, cells: Record<string, string>) => rows.patchLabelRow(owner, label, labelPatchBody(cells));

  describe("known releases", () => {
    it("are written as the form's rows, in order, with a rename keeping the release (and what hangs off it)", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Rel One");
      expect(await save(label, { releases: JSON.stringify([{ name: "2024 Spring", year: "2024", proof: "110" }, { name: "2024 Fall" }]) })).toEqual({ ok: true });
      const first = await releases(label);
      expect(first).toMatchObject([{ name: "2024 Spring", release_year: 2024, proof: 110 }, { name: "2024 Fall", release_year: null }]);
      const bottle = await fx.mkBottle(owner, label);
      await q(`UPDATE bottles SET release_id = $1 WHERE id = $2`, first[0]!.id, bottle);
      // Renamed by its id: the bottle keeps it.
      expect(await save(label, { releases: JSON.stringify([{ id: String(first[0]!.id), name: "Spring 2024", year: "2024", proof: "110" }, { id: String(first[1]!.id), name: "2024 Fall" }]) })).toEqual({ ok: true });
      expect((await releases(label)).map((r) => r.name)).toEqual(["Spring 2024", "2024 Fall"]);
      expect((await q(`SELECT release_id FROM bottles WHERE id = $1`, bottle))[0]).toEqual({ release_id: first[0]!.id });
    });

    it("are removed when left out, a bottle that used one losing it, and all of them with a blank", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Rel Two");
      await save(label, { releases: JSON.stringify([{ name: "A" }, { name: "B" }]) });
      const [a, b] = await releases(label);
      const bottle = await fx.mkBottle(owner, label);
      await q(`UPDATE bottles SET release_id = $1 WHERE id = $2`, b!.id, bottle);
      expect(await save(label, { releases: JSON.stringify([{ id: String(a!.id), name: "A" }]) })).toEqual({ ok: true });
      expect((await releases(label)).map((r) => r.name)).toEqual(["A"]);
      expect((await q(`SELECT release_id FROM bottles WHERE id = $1`, bottle))[0]).toEqual({ release_id: null });
      expect(await save(label, { releases: "" })).toEqual({ ok: true });
      expect(await releases(label)).toEqual([]);
    });

    it("are refused with the form's message when two share a name, and nothing else in the request is saved", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Rel Three");
      const out = await save(label, { proof: "88", releases: JSON.stringify([{ name: "Same" }, { name: "same" }]) });
      expect(out).toMatchObject({ ok: false, kind: "invalid", fieldErrors: { releases: expect.stringMatching(/Two releases are both called/) } });
      expect((await q(`SELECT proof::float AS proof FROM expressions WHERE id = $1`, label))[0]!.proof).not.toBe(88);
    });

    it("are saved together with the label's other facts", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Rel Four");
      expect(await save(label, { proof: "93", releases: JSON.stringify([{ name: "Batch 1" }]) })).toEqual({ ok: true });
      expect((await q(`SELECT proof::float AS proof FROM expressions WHERE id = $1`, label))[0]).toEqual({ proof: 93 });
      expect((await releases(label)).length).toBe(1);
    });
  });

  describe("older names", () => {
    it("are written as lines with their years, and cleared with a blank", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Names One");
      expect(await save(label, { otherNames: "Old Grand-Dad Bonded (1980–1995)\nOld Name (from 2001)\nPlain" })).toEqual({ ok: true });
      expect(await q(`SELECT name, year_from, year_to FROM expression_names WHERE expression_id = $1 ORDER BY position`, label)).toEqual([
        { name: "Old Grand-Dad Bonded", year_from: 1980, year_to: 1995 },
        { name: "Old Name", year_from: 2001, year_to: null },
        { name: "Plain", year_from: null, year_to: null },
      ]);
      expect(await save(label, { otherNames: "" })).toEqual({ ok: true });
      expect((await q(`SELECT 1 FROM expression_names WHERE expression_id = $1`, label)).length).toBe(0);
    });
    it("are refused with the form's message when a line is wrong", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Names Two");
      expect(await save(label, { otherNames: "Backwards (1995–1980)" })).toMatchObject({ ok: false });
    });
  });

  describe("regions", () => {
    it("are kept for a Scotch label, as the form writes them", async () => {
      const scotch = (await q(`SELECT id FROM categories WHERE slug = 'scotch' LIMIT 1`))[0]?.id as number | undefined;
      if (scotch === undefined) return; // the seeded Scotch category is what the form keys on
      const label = await fx.mkLabel(owner, scotch, "Regions One");
      expect(await save(label, { regions: "Islay, Speyside" })).toEqual({ ok: true });
      expect((await q(`SELECT regions FROM expressions WHERE id = $1`, label))[0]).toEqual({ regions: ["Islay", "Speyside"] });
      expect(await save(label, { regions: "" })).toEqual({ ok: true });
      expect((await q(`SELECT regions FROM expressions WHERE id = $1`, label))[0]!.regions).toBeNull();
    });
  });

  describe("a saved label's category", () => {
    it("is changed, keeping every fact that was stored, even those the new category does not use", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Cat One");
      await q(`UPDATE expressions SET is_straight = true, age_statement = '4 Year' WHERE id = $1`, label);
      expect(await save(label, { category: `id:${cat.rum}` })).toEqual({ ok: true });
      expect((await q(`SELECT category_id, is_straight, age_statement FROM expressions WHERE id = $1`, label))[0]).toEqual({ category_id: cat.rum, is_straight: true, age_statement: "4 Year" });
    });
    it("is refused when there is no such category", async () => {
      const label = await fx.mkLabel(owner, cat.whiskey, "Cat Two");
      expect(await save(label, { category: "id:99999999" })).toMatchObject({ ok: false, fieldErrors: { categoryId: expect.any(String) } });
    });
  });
});
