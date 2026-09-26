import { describe, expect, it } from "vitest";
import { DEFAULT_LABEL_COLUMNS, LABEL_COLUMNS, normaliseLabelColumns } from "../columns";
import { EXPRESSION_SECTIONS } from "../fields";
import { DEFAULT_FILTERS, LABEL_SORTS, parseLabelFilters, serialiseLabelFilters } from "../filters";

describe("label columns", () => {
  it("has a column for every field on the label form", () => {
    // Adding a field to the form without a column would quietly leave it
    // out of the table's "all options".
    const covered = new Set(LABEL_COLUMNS.flatMap((column) => column.specs.map((spec) => spec.name)));
    const missing = EXPRESSION_SECTIONS.flatMap((s) => s.fields.map((f) => f.name)).filter((n) => !covered.has(n));
    expect(missing).toEqual([]);
  });

  it("shows brand, label, category, proof, MSRP and bottles by default", () => {
    const labels = LABEL_COLUMNS.filter((c) => DEFAULT_LABEL_COLUMNS.includes(c.id)).map((c) => c.label);
    expect(labels).toEqual(["Brand", "Label", "Category", "Proof", "MSRP", "Bottles"]);
  });

  it("gives every sort the server knows a column to click", () => {
    const sortable = new Set(LABEL_COLUMNS.flatMap((column) => (column.sort ? [column.sort] : [])));
    expect([...LABEL_SORTS].filter((sort) => !sortable.has(sort))).toEqual([]);
  });

  it("has unique ids", () => {
    const ids = LABEL_COLUMNS.map((column) => column.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("normalises to table order, always keeping the label", () => {
    expect(normaliseLabelColumns(["upc", "brand", "nope"])).toEqual(["brand", "name", "upc"]);
    expect(normaliseLabelColumns([])).toEqual(["name"]);
  });
});

describe("label filters: columns", () => {
  it("defaults when the URL says nothing", () => {
    expect(parseLabelFilters({}).columns).toEqual(DEFAULT_FILTERS.columns);
  });

  it("keeps a plain view's URL clean", () => {
    expect(serialiseLabelFilters(DEFAULT_FILTERS)).toBe("");
  });

  it("round-trips a chosen set through the URL", () => {
    const filters = { ...DEFAULT_FILTERS, columns: ["name", "upc", "estate", "bottles"] };
    const query = serialiseLabelFilters(filters);
    expect(new URLSearchParams(query).get("cols")).toBe("name,estate,upc,bottles");
    expect(parseLabelFilters(Object.fromEntries(new URLSearchParams(query))).columns).toEqual([
      "name",
      "estate",
      "upc",
      "bottles",
    ]);
  });

  it("falls back to the defaults when no named column exists", () => {
    // An old bookmark should not become a one-column table.
    expect(parseLabelFilters({ cols: "gone,missing" }).columns).toEqual(DEFAULT_FILTERS.columns);
  });

  it("allows hiding everything but the label", () => {
    expect(parseLabelFilters({ cols: "name" }).columns).toEqual(["name"]);
  });
});
