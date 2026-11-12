import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";
import { bottlePatchBody, labelPatchBody } from "../save";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** Opt-in, like the other integration tests: a throwaway migrated database. */
describe.skipIf(!url)("the age boxes save, against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let cat: Cat;
  let owner: number;
  let rows: typeof import("../rows");

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    cat = await fx.mkCategories(); // cat.whiskey is a whiskey; cat.rum is not
    owner = await fx.mkUser();
    rows = await import("../rows");
  });
  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  const age = async (table: "expressions" | "bottles", id: number) =>
    (await m.sql<Record<string, unknown>>(`SELECT age_years::float AS age_years, age_months, age_days, age_statement, age_years_source FROM ${table} WHERE id = $1`, id))[0]!;
  const label = (id: number, cells: Record<string, string>) => rows.patchLabelRow(owner, id, labelPatchBody(cells));
  const bottle = (id: number, cells: Record<string, string>) => rows.patchBottleRow(owner, id, bottlePatchBody(cells, undefined));

  it("a whiskey's statement fills the years in, as derived", async () => {
    const id = await fx.mkLabel(owner, cat.whiskey, "Age One");
    expect(await label(id, { ageStatement: "8 to 12 years" })).toEqual({ ok: true });
    expect(await age("expressions", id)).toEqual({ age_years: 8, age_months: null, age_days: null, age_statement: "8 to 12 years", age_years_source: "derived" });
    // A new statement replaces years it derived; clearing it clears them again.
    await label(id, { ageStatement: "12 Year" });
    expect(await age("expressions", id)).toMatchObject({ age_years: 12, age_years_source: "derived" });
    await label(id, { ageStatement: "" });
    expect(await age("expressions", id)).toMatchObject({ age_years: null, age_statement: null, age_years_source: "entered" });
  });

  it("never replaces years that were entered, and typing years marks them entered", async () => {
    const id = await fx.mkLabel(owner, cat.whiskey, "Age Two");
    await label(id, { ageStatement: "8 Year" });
    expect(await label(id, { ageYears: "9" })).toEqual({ ok: true });
    expect(await age("expressions", id)).toMatchObject({ age_years: 9, age_statement: "8 Year", age_years_source: "entered" });
    await label(id, { ageStatement: "20 Year" });
    expect(await age("expressions", id)).toMatchObject({ age_years: 9, age_statement: "20 Year", age_years_source: "entered" });
    // Clearing the statement leaves the entered age alone.
    await label(id, { ageStatement: "" });
    expect(await age("expressions", id)).toMatchObject({ age_years: 9, age_statement: null });
  });

  it("months and days are written too, and clearing them empties the box", async () => {
    const id = await fx.mkLabel(owner, cat.whiskey, "Age Three");
    expect(await label(id, { ageYears: "4", ageMonths: "6", ageDays: "10" })).toEqual({ ok: true });
    expect(await age("expressions", id)).toMatchObject({ age_years: 4, age_months: 6, age_days: 10 });
    expect(await label(id, { ageMonths: "", ageDays: "" })).toEqual({ ok: true });
    expect(await age("expressions", id)).toMatchObject({ age_years: 4, age_months: null, age_days: null });
  });

  it("a spirit that is not whiskey keeps the statement and the years as typed, with no derived years", async () => {
    const id = await fx.mkLabel(owner, cat.rum, "Age Four");
    await label(id, { ageStatement: "8 Year" });
    expect(await age("expressions", id)).toMatchObject({ age_years: null, age_statement: "8 Year", age_years_source: "entered" });
  });

  it("a bottle's own age follows the same rule", async () => {
    const l = await fx.mkLabel(owner, cat.whiskey, "Age Five", { ageYears: 12 });
    const b = await fx.mkBottle(owner, l);
    expect(await bottle(b, { ageStatement: "9 Year" })).toEqual({ ok: true });
    expect(await age("bottles", b)).toMatchObject({ age_years: 9, age_statement: "9 Year", age_years_source: "derived" });
    expect(await bottle(b, { ageYears: "7" })).toEqual({ ok: true });
    expect(await age("bottles", b)).toMatchObject({ age_years: 7, age_years_source: "entered" });
    expect((await age("expressions", l)).age_years).toBe(12); // the label's is untouched
  });

  it("a new row derives the years for its label and its bottle", async () => {
    const out = await rows.createRow(owner, {
      brand: { name: "Age Brand" },
      label: { name: "Age Six", categoryId: cat.whiskey, facts: { ageStatement: "10 Year" } },
      bottle: { ageStatement: "6 Year" },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(await age("expressions", out.labelId)).toMatchObject({ age_years: 10, age_years_source: "derived" });
    expect(await age("bottles", out.bottleId!)).toMatchObject({ age_years: 6, age_years_source: "derived" });
  });

  it("refuses an age beyond what the form takes, with the field named", async () => {
    const id = await fx.mkLabel(owner, cat.whiskey, "Age Seven");
    expect(await rows.patchLabelRow(owner, id, { ageYears: "150" })).toMatchObject({ ok: false, fieldErrors: { ageYears: expect.any(String) } });
  });
});
