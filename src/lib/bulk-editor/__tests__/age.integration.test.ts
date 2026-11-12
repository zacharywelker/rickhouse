import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Cat, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";
import { EDITORS } from "../editors";
import { bottlePatchBody, labelPatchBody } from "../save";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** Opt-in, like the other integration tests: a throwaway migrated database. */
describe.skipIf(!url)("the Age cells save, against a real database", () => {
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

  const labelAge = async (id: number) => (await m.sql<Record<string, unknown>>(`SELECT age_years::float AS age_years, age_months, age_days, age_statement, is_nas FROM expressions WHERE id = $1`, id))[0]!;
  const bottleAge = async (id: number) => (await m.sql<Record<string, unknown>>(`SELECT age_years::float AS age_years, age_months, age_days, age_statement FROM bottles WHERE id = $1`, id))[0]!;
  const setLabel = (id: number, text: string) => rows.patchLabelRow(owner, id, labelPatchBody({ age: text }));
  const setBottle = (id: number, text: string) => rows.patchBottleRow(owner, id, bottlePatchBody({ ownAge: text }, undefined));

  it("a label: years, months and days; a statement; NAS; and blank, each replacing the one before", async () => {
    const label = await fx.mkLabel(owner, cat.whiskey, "Age One");
    expect(await setLabel(label, "12y 6m")).toEqual({ ok: true });
    expect(await labelAge(label)).toEqual({ age_years: 12, age_months: 6, age_days: null, age_statement: null, is_nas: false });
    expect(await setLabel(label, "8 to 12 years")).toEqual({ ok: true });
    expect(await labelAge(label)).toEqual({ age_years: null, age_months: null, age_days: null, age_statement: "8 to 12 years", is_nas: false });
    expect(await setLabel(label, "NAS")).toEqual({ ok: true });
    expect(await labelAge(label)).toEqual({ age_years: null, age_months: null, age_days: null, age_statement: null, is_nas: true });
    expect(await setLabel(label, "4.5")).toEqual({ ok: true });
    expect(await labelAge(label)).toEqual({ age_years: 4.5, age_months: null, age_days: null, age_statement: null, is_nas: false });
    expect(await setLabel(label, "")).toEqual({ ok: true });
    expect(await labelAge(label)).toEqual({ age_years: null, age_months: null, age_days: null, age_statement: null, is_nas: false });
  });

  it("a label that had numbers loses them when a statement is typed (they would win over it on screen)", async () => {
    const label = await fx.mkLabel(owner, cat.whiskey, "Age Two", { ageYears: 10 });
    await setLabel(label, "Straight (at least 2 years)");
    expect(await labelAge(label)).toMatchObject({ age_years: null, age_statement: "Straight (at least 2 years)" });
  });

  it("a bottle: its own age, a statement, and blank to go back to the label's", async () => {
    const label = await fx.mkLabel(owner, cat.whiskey, "Age Three", { ageYears: 12 });
    const bottle = await fx.mkBottle(owner, label);
    expect(await setBottle(bottle, "9y 2m 3d")).toEqual({ ok: true });
    expect(await bottleAge(bottle)).toEqual({ age_years: 9, age_months: 2, age_days: 3, age_statement: null });
    expect(await setBottle(bottle, "9 Year Old")).toEqual({ ok: true });
    expect(await bottleAge(bottle)).toEqual({ age_years: null, age_months: null, age_days: null, age_statement: "9 Year Old" });
    expect(await setBottle(bottle, "")).toEqual({ ok: true });
    expect(await bottleAge(bottle)).toEqual({ age_years: null, age_months: null, age_days: null, age_statement: null });
    expect(await labelAge(label)).toMatchObject({ age_years: 12 }); // the label is untouched
  });

  it("a new row takes the label's age in its facts and the bottle's own in its bottle", async () => {
    const out = await rows.createRow(owner, {
      brand: { name: "Age Brand" },
      label: { name: "Age Four", categoryId: cat.whiskey, facts: EDITORS.age!.fieldsOf!("7y") },
      bottle: EDITORS.ownAge!.fieldsOf!("6y 6m"),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(await labelAge(out.labelId)).toMatchObject({ age_years: 7, age_statement: null });
    expect(await bottleAge(out.bottleId!)).toMatchObject({ age_years: 6, age_months: 6 });
  });

  it("refuses an age beyond what the form takes, with the field named", async () => {
    const label = await fx.mkLabel(owner, cat.whiskey, "Age Five");
    expect(await rows.patchLabelRow(owner, label, { ageYears: "150" })).toMatchObject({ ok: false, fieldErrors: { ageYears: expect.any(String) } });
    const bottle = await fx.mkBottle(owner, label);
    expect(await rows.patchBottleRow(owner, bottle, { ageMonths: 5000 })).toMatchObject({ ok: false });
  });
});
