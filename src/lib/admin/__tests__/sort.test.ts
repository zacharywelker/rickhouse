import { describe, expect, it } from "vitest";
import { adminSortQuery, parseAdminSort, sortAdminRows } from "../sort";
import type { AdminRow, CellValue } from "../types";

const row = (id: number, cells: Record<string, CellValue>): AdminRow => ({ id, cells, values: {} });
const ids = (rows: AdminRow[]) => rows.map((r) => r.id);

const columns = [
  { key: "name", label: "Recipe" },
  { key: "uses", label: "Labels", numeric: true },
];

describe("parseAdminSort", () => {
  it("reads a column and direction from the URL", () => {
    expect(parseAdminSort({ sort: "uses", dir: "desc" }, columns)).toEqual({ key: "uses", desc: true });
    expect(parseAdminSort({ sort: "name" }, columns)).toEqual({ key: "name", desc: false });
  });

  it("ignores a column the table does not have", () => {
    expect(parseAdminSort({ sort: "password" }, columns)).toBeNull();
    expect(parseAdminSort({ sort: ["name", "uses"] }, columns)).toBeNull();
    expect(parseAdminSort({}, columns)).toBeNull();
  });
});

describe("adminSortQuery", () => {
  it("starts a new column ascending and flips the active one", () => {
    expect(adminSortQuery(null, "name")).toBe("?sort=name");
    expect(adminSortQuery({ key: "name", desc: false }, "name")).toBe("?sort=name&dir=desc");
    expect(adminSortQuery({ key: "name", desc: true }, "name")).toBe("?sort=name");
    expect(adminSortQuery({ key: "name", desc: true }, "uses")).toBe("?sort=uses");
  });
});

describe("sortAdminRows", () => {
  const mashbills = [
    row(1, { name: "78% Corn · 10% Rye · 12% Malted Barley", uses: 2, generic: false }),
    row(2, { name: "High Rye", uses: 0, generic: true }),
    row(3, { name: "70% Corn · 20% Wheat · 10% Malted Barley", uses: 5, generic: false }),
    row(4, { name: "Wheated", uses: 0, generic: true }),
    row(5, { name: "8% Corn", uses: null, generic: false }),
  ];

  it("keeps the server's order when nothing is chosen", () => {
    expect(ids(sortAdminRows(mashbills, null))).toEqual([1, 2, 3, 4, 5]);
  });

  it("sorts text naturally, so 8% comes before 70%", () => {
    expect(ids(sortAdminRows(mashbills, { key: "name", desc: false }))).toEqual([5, 3, 1, 2, 4]);
    expect(ids(sortAdminRows(mashbills, { key: "name", desc: true }))).toEqual([4, 2, 1, 3, 5]);
  });

  it("sorts numbers as numbers, with blanks last either way and ties in server order", () => {
    expect(ids(sortAdminRows(mashbills, { key: "uses", desc: false }))).toEqual([2, 4, 1, 3, 5]);
    expect(ids(sortAdminRows(mashbills, { key: "uses", desc: true }))).toEqual([3, 1, 2, 4, 5]);
  });

  it("puts Yes first in a Yes/No column", () => {
    expect(ids(sortAdminRows(mashbills, { key: "generic", desc: false }))).toEqual([2, 4, 1, 3, 5]);
  });

  it("does not reorder the array it was given", () => {
    sortAdminRows(mashbills, { key: "name", desc: false });
    expect(ids(mashbills)).toEqual([1, 2, 3, 4, 5]);
  });
});
