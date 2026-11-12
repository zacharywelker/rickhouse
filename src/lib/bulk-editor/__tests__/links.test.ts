import { describe, expect, it } from "vitest";
import type { Option } from "@/lib/admin/types";
import { applyEdits } from "../changes";
import { EDITORS, editorFor } from "../editors";
import { linkApplies, linkedFacts, linksBody, listsWith, type LinkLists } from "../links";
import { bottlePatchBody, createBody, labelPatchBody, serverFields } from "../save";
import { SHEET_COLUMNS, type SheetColumn, type SheetContext, type SheetLabel, type SheetRow } from "../sheet";

const label = (over: Record<string, unknown> = {}) =>
  ({ id: 1, brand: "B", name: "L", category: "Bourbon", categorySlug: "bourbon", categoryId: 5, fieldGroup: "whiskey", isAgedGin: false, isAged: false, regions: [], originCountryManual: false, originRegionManual: false,
    links: { distilleries: [], mashbills: [], finishes: [], ingredients: [] }, ...over }) as unknown as SheetLabel;
const row = (l = label()): SheetRow => ({ key: "l1", label: l, bottle: null });
const kinds = { 5: "american" } as const;
const ctx: SheetContext = { currency: "USD", kinds };
const col = (id: string): SheetColumn => SHEET_COLUMNS.find((c) => c.id === id)!;
const d = (id: number, name: string, over: Record<string, unknown> = {}) => ({ id, label: name, amount: "", ...over });

describe("which spirits have which list (the label form's own rule)", () => {
  const applies = (key: Parameters<typeof linkApplies>[0], l: SheetLabel, kind: string) => linkApplies(key, row(l), { 5: kind as never });
  it("gives every spirit distilleries", () => {
    for (const group of ["whiskey", "rum", "gin", "vodka", "agave"]) expect(applies("distilleries", label({ fieldGroup: group }), "other")).toBe(true);
  });
  it("gives mashbills to whiskey but not to a single malt or the spirits that list ingredients instead", () => {
    expect(applies("mashbills", label(), "american")).toBe(true);
    expect(applies("mashbills", label({ categorySlug: "single-malt-scotch" }), "scotch")).toBe(false);
    for (const group of ["rum", "agave", "brandy", "gin", "vodka", "amaro", "liqueur"]) expect(applies("mashbills", label({ fieldGroup: group }), "other")).toBe(false);
  });
  it("gives ingredients to the spirits with a recipe of them, and none to whiskey", () => {
    for (const group of ["rum", "agave", "brandy", "vodka", "amaro", "liqueur"]) expect(applies("ingredients", label({ fieldGroup: group }), "other")).toBe(true);
    expect(applies("ingredients", label(), "american")).toBe(false);
  });
  it("gives finishes to every spirit that ages: not to vodka, nor an unaged gin or amaro", () => {
    expect(applies("finishes", label(), "american")).toBe(true);
    expect(applies("finishes", label({ fieldGroup: "vodka" }), "other")).toBe(false);
    expect(applies("finishes", label({ fieldGroup: "gin", isAgedGin: false }), "gin")).toBe(false);
    expect(applies("finishes", label({ fieldGroup: "gin", isAgedGin: true }), "gin")).toBe(true);
  });
  it("is editable on a label row, and locked on a bottle row until triple-clicked, like the label's other facts", () => {
    expect(editorFor(col("distilleries"), { labels: true, bottles: false }, row(), undefined, kinds)?.links).toBe("distilleries");
    expect(editorFor(col("distilleries"), { labels: true, bottles: true }, { ...row(), bottle: { id: 7 } as never }, undefined, kinds)).toBeNull();
    expect(editorFor(col("ingredients"), { labels: true, bottles: false }, row(), undefined, kinds)).toBeNull(); // whiskey
  });
});

describe("what an edited cell shows", () => {
  it("is the table's own summary of the list", () => {
    const rows = JSON.stringify([d(1, "Buffalo Trace", { amount: "60" }), d(2, "Heaven Hill")]);
    expect(EDITORS.distilleries!.display(rows, ctx, row()).text).toBe("Buffalo Trace (60%), Heaven Hill");
    expect(EDITORS.distilleries!.display("[]", ctx, row()).text).toBe("—");
    expect(col("ingredients").cell(row(label({ fieldGroup: "rum", links: { distilleries: [], mashbills: [], finishes: [], ingredients: [{ name: "Molasses", family: null, kind: "rum_base", isManual: true }] } })), { ...ctx, kinds: { 5: "other" } }).text).toBe("Molasses");
  });
  it("is not written onto the row's own data", () => {
    const l = label();
    expect(applyEdits([row(l)], { l1: { distilleries: JSON.stringify([d(1, "X")]) } })[0]!.label).toBe(l);
  });
});

describe("what a save sends for the lists", () => {
  const loaded: LinkLists = {
    distilleries: [d(1, "A"), d(2, "B")],
    mashbills: [d(10, "Rye", { distilleryId: 1 })],
    finishes: [d(20, "Port", { share: "60", mashbills: [{ id: 10, share: "60" }] }), { id: 0, label: "No finish", amount: "", unfinished: true, share: "40", mashbills: [{ id: 10, share: "40" }] }],
    ingredients: [],
  };
  const base = { distilleries: [], mashbills: [], finishes: [], ingredients: [] } as LinkLists;
  it("sends all three ordered lists when one was edited, taking the others (with finish pairs) from what the picker read", () => {
    const body = linksBody({ distilleries: JSON.stringify([d(1, "A", { amount: "100" })]) }, loaded, base);
    expect(Object.keys(body).sort()).toEqual(["distilleries", "finishes", "mashbills"]);
    expect(body.distilleries).toEqual([expect.objectContaining({ id: 1, amount: "100" })]);
    expect((body.finishes as Array<Record<string, unknown>>)[0]).toMatchObject({ id: 20, share: "60", mashbills: [{ id: 10, share: "60" }] });
    expect((body.finishes as Array<Record<string, unknown>>)[1]).toMatchObject({ unfinished: true });
  });
  it("sends the ingredients alone when only they were edited, with their kind and whether chosen by hand", () => {
    const body = linksBody({ ingredients: JSON.stringify([{ name: "Vanilla", family: null, kind: "flavor", isManual: true }]) }, loaded, base);
    expect(body).toEqual({ ingredients: [{ name: "Vanilla", family: null, kind: "flavor", isManual: true }] });
  });
  it("sends nothing for the lists when none was edited", () => {
    expect(linksBody({ proof: "100" }, loaded, base)).toEqual({});
  });
  it("is part of a saved label's request, beside its other facts", () => {
    const l = label();
    expect(labelPatchBody({ proof: "100", distilleries: JSON.stringify([d(1, "A")]) }, { label: l, loaded })).toMatchObject({ proof: "100", distilleries: [expect.objectContaining({ id: 1 })], mashbills: expect.any(Array), finishes: expect.any(Array) });
    expect(labelPatchBody({ proof: "100" })).toEqual({ proof: "100" });
  });
  it("is part of a new row's facts in the form the server reads", () => {
    const draft = { key: "d1", brand: { kind: "existing", id: 1, name: "B" }, label: { kind: "new", name: "N" }, categoryId: 5 } as const;
    const body = createBody(draft, { distilleries: JSON.stringify([d(1, "A")]), ingredients: JSON.stringify([{ name: "Molasses", kind: "rum_base" }]), regions: "Islay" }, false) as { label: { facts: Record<string, string> } };
    expect(JSON.parse(body.label.facts.distilleryLinks!)).toEqual([expect.objectContaining({ id: 1 })]);
    expect(JSON.parse(body.label.facts.ingredientLinks!)).toEqual([{ name: "Molasses", kind: "rum_base" }]);
    expect(body.label.facts.regions).toBe("Islay");
  });
  it("does not send a list for a bottle's request", () => {
    expect(bottlePatchBody({ distilleries: JSON.stringify([d(1, "A")]) }, undefined)).toEqual({});
  });
});

describe("what linking a distillery brings along (the form's changeLinks)", () => {
  const opt = (value: number, over: Partial<Option>): Option => ({ value, label: `D${value}`, ...over });
  const options = [opt(1, { region: "Islay", country: "Scotland" }), opt(2, { region: "Speyside", country: "Scotland" }), opt(3, { country: "Italy", region: "Piedmont" }), opt(4, { country: "Spain" })];
  it("adds a Scotch distillery's region to a Scotch label, once", () => {
    const l = label({ fieldGroup: "whiskey", regions: ["Islay"] });
    expect(linkedFacts(l, "scotch", options, [d(1, "D1")], [d(1, "D1"), d(2, "D2")])).toEqual({ regions: "Islay, Speyside" });
    expect(linkedFacts(l, "scotch", options, [d(1, "D1")], [d(1, "D1")])).toEqual({});
    expect(linkedFacts(l, "american", options, [], [d(1, "D1")])).toEqual({});
  });
  it("gives an amaro the origin of its distilleries, and blanks it where they differ or one has none", () => {
    const amaro = label({ fieldGroup: "amaro" });
    expect(linkedFacts(amaro, "amaro", options, [], [d(3, "D3")])).toEqual({ originCountryLinked: "Italy", originRegionLinked: "Piedmont" });
    expect(linkedFacts(amaro, "amaro", options, [], [d(1, "D1"), d(3, "D3")])).toEqual({ originCountryLinked: "", originRegionLinked: "" });
    expect(linkedFacts(amaro, "amaro", options, [], [d(4, "D4")])).toEqual({ originCountryLinked: "Spain", originRegionLinked: "" });
  });
  it("leaves an origin the owner typed alone", () => {
    const typed = label({ fieldGroup: "liqueur", originCountryManual: true, originRegionManual: false });
    expect(linkedFacts(typed, "liqueur", options, [], [d(3, "D3")])).toEqual({ originRegionLinked: "Piedmont" });
  });
});

describe("the origin of an amaro or liqueur typed into its cell", () => {
  it("is remembered as the owner's own, and clearing it hands it back", () => {
    const origin = EDITORS.originCountry!;
    expect(serverFields(origin, "originCountry", "Italy")).toEqual({ originCountry: "Italy", originCountryManual: true });
    expect(serverFields(origin, "originCountry", "")).toEqual({ originCountry: null, originCountryManual: false });
  });
  it("is not marked when it was brought by a link", () => {
    expect(labelPatchBody({ originCountryLinked: "Italy", regions: "Islay" })).toEqual({ originCountry: "Italy", regions: "Islay" });
  });
});

describe("listsWith", () => {
  it("puts an edited list over the label's own", () => {
    const l = label({ links: { distilleries: [d(1, "A")], mashbills: [], finishes: [], ingredients: [] } });
    expect(listsWith(l, { distilleries: JSON.stringify([d(2, "B")]) }).distilleries).toEqual([d(2, "B")]);
    expect(listsWith(l, undefined).distilleries).toEqual([d(1, "A")]);
  });
});
