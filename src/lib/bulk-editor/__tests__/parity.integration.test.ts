import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, fixtures, url, type Db, type Fixtures } from "@/lib/tournaments/__tests__/fixtures";
import type { FieldGroup } from "@/db/schema";
import { categoryKinds } from "@/lib/expressions/rules";
import type { CellEditor } from "../editors";
import { EDITORS } from "../editors";
import { GENERATED_BOTTLE, GENERATED_LABEL, type Kinds } from "../fields";
import { bottlePatchBody, serverFields } from "../save";
import type { SheetBottle, SheetLabel, SheetRow } from "../sheet";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/**
 * The proof that every simple field the sheet edits really saves: for each generated cell, a value the cell would hold is
 * sent through the same mapping the sheet uses, to the same server paths, on a spirit where the sheet says the cell applies,
 * and read back from the database. Opt-in like the other integration tests (a throwaway migrated database).
 */
describe.skipIf(!url)("every simple field the sheet edits saves, against a real database", () => {
  let m: Db;
  let fx: Fixtures;
  let owner: number;
  let rows: typeof import("../rows");
  let bodies: typeof import("@/lib/expressions/label-patch-body");

  /** Spirits to try, by what the forms key on: the category's slug (its kind) and its field group. */
  const SPIRITS: Array<{ slug: string; group: FieldGroup }> = [
    { slug: "american-whiskey", group: "whiskey" },
    { slug: "scotch", group: "whiskey" },
    { slug: "rum", group: "rum" },
    { slug: "gin", group: "gin" },
    { slug: "tequila", group: "agave" },
    { slug: "mezcal", group: "agave" },
    { slug: "cognac", group: "brandy" },
    { slug: "amaro", group: "amaro" },
    { slug: "liqueur", group: "liqueur" },
  ];
  const catId: Record<string, number> = {};
  let kinds: Kinds = {};

  beforeAll(async () => {
    m = await connect();
    fx = fixtures(m);
    owner = await fx.mkUser();
    for (const { slug, group } of SPIRITS) {
      const found = await m.sql<{ id: number }>(`SELECT id FROM categories WHERE slug = $1`, slug);
      catId[slug] = found[0]?.id ?? (await m.sql<{ id: number }>(`INSERT INTO categories (name, slug, field_group) VALUES ($1, $2, $3) RETURNING id`, `Parity ${slug}`, slug, group))[0]!.id;
    }
    const all = await m.sql<{ id: number; slug: string; parent_id: number | null }>(`SELECT id, slug, parent_id FROM categories`);
    kinds = categoryKinds(all.map((r) => ({ id: r.id, slug: r.slug, parentId: r.parent_id })));
    rows = await import("../rows");
    bodies = await import("@/lib/expressions/label-patch-body");
  });

  afterAll(async () => {
    if (m) {
      await fx.cleanup();
      await m.end();
    }
  });

  const snake = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  const one = async (query: string, ...params: unknown[]) => (await m.sql<Record<string, unknown>>(query, ...params))[0]!;

  /** A value the cell could hold, in the text the editor keeps. */
  function sample(editor: CellEditor): string {
    const spec = editor.spec;
    switch (spec.kind) {
      case "checkbox": return "true";
      case "select": return spec.options.find((o) => o.value !== "")?.value ?? "";
      case "date": return "2020-01-15";
      case "number": {
        const lo = spec.min ?? 1;
        const hi = spec.max ?? lo + 10;
        return String(Math.min(Math.max(1, lo), hi));
      }
      default: return editor.field === "upc" ? "012345678905" : "Sample";
    }
  }
  /** A choice the picking cells can hold, made for this label: `id:N` of a real store, cooperage, release or label name. */
  async function pick(editor: CellEditor, label: number): Promise<string> {
    const at = async (query: string, ...params: unknown[]) => `id:${(await m.sql<{ id: number }>(query, ...params))[0]!.id}`;
    switch (editor.reference) {
      case "store": return at(`INSERT INTO stores (owner_id, name, slug) VALUES ($1, $2::text, $2::text) RETURNING id`, owner, `Parity Store ${label}`);
      case "cooperage": return at(`INSERT INTO cooperages (owner_id, name, slug) VALUES ($1, $2::text, $2::text) RETURNING id`, owner, `Parity Cooperage ${label}`);
      case "release": return at(`INSERT INTO expression_releases (expression_id, name) VALUES ($1, 'Parity Release') RETURNING id`, label);
      default: return at(`INSERT INTO expression_names (expression_id, name) VALUES ($1, 'Parity Name') RETURNING id`, label);
    }
  }
  const valueFor = async (editor: CellEditor, label: number) => (editor.reference ? pick(editor, label) : sample(editor));
  const stored = (value: unknown): string => (value === null || value === undefined ? "" : value instanceof Date ? value.toISOString().slice(0, 10) : String(value));
  const same = (got: unknown, want: string) => {
    const g = stored(got);
    return g === want || g === want.replace(/^id:/, "") || (g !== "" && want !== "" && !Number.isNaN(Number(g)) && Number(g) === Number(want));
  };

  /** A label row on a spirit, as the sheet would hold it, to ask whether a cell applies. */
  const fakeLabelRow = (categoryId: number, group: FieldGroup, label: Record<string, unknown> = {}): SheetRow => ({ key: "l-1", label: { id: -1, categoryId, fieldGroup: group, isAgedGin: false, tequilaClass: null, ...label } as unknown as SheetLabel, bottle: { id: -1, isSingleBarrel: true, isSingleBarrelPick: true, tequilaClass: null } as unknown as SheetBottle });

  describe("a label's facts", () => {
    for (const g of GENERATED_LABEL) {
      it(`${g.column.id} (${g.column.section}) saves as ${g.editor.field}`, async () => {
        const spirit = SPIRITS.find((s) => g.editor.applies!(fakeLabelRow(catId[s.slug]!, s.group), kinds));
        expect(spirit, `no spirit the sheet applies ${g.column.id} to`).toBeDefined();
        const label = await fx.mkLabel(owner, catId[spirit!.slug]!, `Parity ${g.column.id}`);
        const value = await valueFor(g.editor, label);
        const out = await rows.patchLabelRow(owner, label, serverFields(g.editor, g.column.id, value));
        expect(out, JSON.stringify(out)).toEqual({ ok: true });
        const row = await one(`SELECT to_jsonb(e) AS j FROM expressions e WHERE id = $1`, label);
        const got = (row.j as Record<string, unknown>)[snake(g.editor.field)];
        expect(same(got, value), `${g.editor.field}: sent ${value}, stored ${stored(got)}`).toBe(true);
      });
    }
  });

  describe("a bottle's own values", () => {
    for (const g of GENERATED_BOTTLE) {
      it(`${g.column.id} (${g.column.section}) saves as ${g.editor.field}`, async () => {
        // A single barrel and a private pick, on whichever spirit takes this cell.
        const spirit = SPIRITS.find((s) => {
          const row = fakeLabelRow(catId[s.slug]!, s.group, { isAgedGin: true });
          return g.editor.applies!(row, kinds);
        });
        expect(spirit, `no spirit the sheet applies ${g.column.id} to`).toBeDefined();
        const label = await fx.mkLabel(owner, catId[spirit!.slug]!, `Parity bottle ${g.column.id}`);
        if (spirit!.group === "gin") await m.sql(`UPDATE expressions SET is_aged_gin = true WHERE id = $1`, label);
        const bottle = await fx.mkBottle(owner, label);
        await m.sql(`UPDATE bottles SET is_single_barrel = true, is_single_barrel_pick = true WHERE id = $1`, bottle);
        const value = await valueFor(g.editor, label);
        const out = await rows.patchBottleRow(owner, bottle, bottlePatchBody({ [g.column.id]: value }, undefined));
        expect(out, JSON.stringify(out)).toEqual({ ok: true });
        const row = await one(`SELECT to_jsonb(b) AS j FROM bottles b WHERE id = $1`, bottle);
        const got = (row.j as Record<string, unknown>)[snake(g.editor.field)];
        expect(same(got, value), `${g.editor.field}: sent ${value}, stored ${stored(got)}`).toBe(true);
      });
    }
  });

  describe("clearing a cell (Delete) saves too", () => {
    const clearable = (g: { editor: CellEditor }) => g.editor.required !== true;
    for (const g of GENERATED_LABEL.filter(clearable)) {
      it(`${g.column.id} clears`, async () => {
        const spirit = SPIRITS.find((s) => g.editor.applies!(fakeLabelRow(catId[s.slug]!, s.group), kinds))!;
        const label = await fx.mkLabel(owner, catId[spirit.slug]!, `Parity clear ${g.column.id}`);
        expect(await rows.patchLabelRow(owner, label, serverFields(g.editor, g.column.id, await valueFor(g.editor, label)))).toEqual({ ok: true });
        const blank = g.editor.spec.kind === "checkbox" ? "false" : "";
        const out = await rows.patchLabelRow(owner, label, serverFields(g.editor, g.column.id, blank));
        expect(out, JSON.stringify(out)).toEqual({ ok: true });
        const j = ((await one(`SELECT to_jsonb(e) AS j FROM expressions e WHERE id = $1`, label)).j as Record<string, unknown>)[snake(g.editor.field)];
        expect(j === null || j === false || j === "", `${g.editor.field} is still ${stored(j)}`).toBe(true);
      });
    }
    for (const g of GENERATED_BOTTLE.filter(clearable)) {
      it(`${g.column.id} clears`, async () => {
        const spirit = SPIRITS.find((s) => g.editor.applies!(fakeLabelRow(catId[s.slug]!, s.group, { isAgedGin: true }), kinds))!;
        const label = await fx.mkLabel(owner, catId[spirit.slug]!, `Parity clear bottle ${g.column.id}`);
        if (spirit.group === "gin") await m.sql(`UPDATE expressions SET is_aged_gin = true WHERE id = $1`, label);
        const bottle = await fx.mkBottle(owner, label);
        await m.sql(`UPDATE bottles SET is_single_barrel = true, is_single_barrel_pick = true WHERE id = $1`, bottle);
        expect(await rows.patchBottleRow(owner, bottle, bottlePatchBody({ [g.column.id]: await valueFor(g.editor, label) }, undefined))).toEqual({ ok: true });
        const blank = g.editor.spec.kind === "checkbox" ? "false" : "";
        const out = await rows.patchBottleRow(owner, bottle, bottlePatchBody({ [g.column.id]: blank }, undefined));
        expect(out, JSON.stringify(out)).toEqual({ ok: true });
        const j = ((await one(`SELECT to_jsonb(b) AS j FROM bottles b WHERE id = $1`, bottle)).j as Record<string, unknown>)[snake(g.editor.field)];
        expect(j === null || j === false || j === "", `${g.editor.field} is still ${stored(j)}`).toBe(true);
      });
    }
  });

  describe("the two cells that set two flags", () => {
    it("Cask / Bonded sets both of the label's flags", async () => {
      const label = await fx.mkLabel(owner, catId["american-whiskey"]!, "Parity designation");
      expect(await rows.patchLabelRow(owner, label, serverFields(EDITORS.designation, "designation", "cask"))).toEqual({ ok: true });
      let row = (await one(`SELECT is_cask_strength AS cask, is_bottled_in_bond AS bib FROM expressions WHERE id = $1`, label)) as { cask: boolean; bib: boolean };
      expect([row.cask, row.bib]).toEqual([true, false]);
      expect(await rows.patchLabelRow(owner, label, serverFields(EDITORS.designation, "designation", ""))).toEqual({ ok: true });
      row = (await one(`SELECT is_cask_strength AS cask, is_bottled_in_bond AS bib FROM expressions WHERE id = $1`, label)) as { cask: boolean; bib: boolean };
      expect([row.cask, row.bib]).toEqual([false, false]);
    });
    it("Single barrel / pick sets the bottle's two flags independently: a pick need not be a single barrel", async () => {
      const label = await fx.mkLabel(owner, catId["american-whiskey"]!, "Parity pick");
      const bottle = await fx.mkBottle(owner, label);
      const flags = async () => {
        const row = (await one(`SELECT is_single_barrel AS one, is_single_barrel_pick AS pick FROM bottles WHERE id = $1`, bottle)) as { one: boolean; pick: boolean };
        return [row.one, row.pick];
      };
      for (const [choice, expected] of [["pick", [false, true]], ["single", [true, false]], ["both", [true, true]], ["", [false, false]]] as const) {
        expect(await rows.patchBottleRow(owner, bottle, serverFields(EDITORS.singleBarrel, "singleBarrel", choice))).toEqual({ ok: true });
        expect(await flags(), `choice "${choice}"`).toEqual(expected);
      }
    });
  });

  describe("a new row takes the same fields", () => {
    it("creates a label with facts and a bottle with its own values, through the same mapping", async () => {
      const brand = `Parity Create ${Date.now()}`;
      const facts = { ...serverFields(EDITORS.isStraight, "isStraight", "true"), ...serverFields(EDITORS.designation, "designation", "cask"), ...serverFields(EDITORS.upc, "upc", "012345678905") };
      const bottle = { ...serverFields(EDITORS.batch, "batch", "B524"), ...serverFields(EDITORS.acquisition, "acquisition", "gift"), ...serverFields(EDITORS.singleBarrel, "singleBarrel", "single") };
      const out = await rows.createRow(owner, { brand: { name: brand }, label: { name: "Created", categoryId: catId["american-whiskey"], facts }, bottle });
      expect(out, JSON.stringify(out)).toMatchObject({ ok: true });
      if (!out.ok) return;
      const l = (await one(`SELECT is_straight AS straight, is_cask_strength AS cask, upc FROM expressions WHERE id = $1`, out.labelId)) as { straight: boolean; cask: boolean; upc: string };
      expect(l).toEqual({ straight: true, cask: true, upc: "012345678905" });
      const b = (await one(`SELECT batch, acquisition, is_single_barrel AS one FROM bottles WHERE id = $1`, out.bottleId)) as { batch: string; acquisition: string; one: boolean };
      expect(b).toEqual({ batch: "B524", acquisition: "gift", one: true });
    });
  });

  describe("the phone API's schema", () => {
    it("is unchanged: it still refuses the facts only the bulk editor takes, and the bulk editor takes them", () => {
      expect(bodies.labelPatchBody.safeParse({ peatStatus: "peated" }).success).toBe(false);
      expect(bodies.bulkLabelPatchBody.safeParse({ peatStatus: "peated" }).success).toBe(true);
      expect(bodies.labelPatchBody.safeParse({ proof: "100" }).success).toBe(true);
      for (const body of [bodies.labelPatchBody, bodies.bulkLabelPatchBody]) expect(body.safeParse({ nonsense: 1 }).success).toBe(false);
    });
  });
});
