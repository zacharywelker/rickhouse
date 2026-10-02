/**
 * Sorting for the configuration tables. Pure — no database, no React.
 *
 * These lists are a few hundred rows at most and already fully loaded, so the
 * sort runs over what the page has rather than going back to the database.
 * It still lives in the URL, like the bottle and label grids, so a sorted
 * view survives a reload and the back button.
 */
import type { AdminRow, CellValue, ColumnSpec } from "./types";

export type AdminSort = { key: string; desc: boolean };

/** `?sort=name&dir=desc`, checked against the table's own columns. Anything else is no sort. */
export function parseAdminSort(
  params: Record<string, string | string[] | undefined>,
  columns: readonly ColumnSpec[],
): AdminSort | null {
  const key = typeof params.sort === "string" ? params.sort : null;
  if (key === null || !columns.some((column) => column.key === key)) return null;
  return { key, desc: params.dir === "desc" };
}

/** The query for a header link: a new column starts ascending, the active one flips. */
export function adminSortQuery(current: AdminSort | null, key: string): string {
  const desc = current?.key === key ? !current.desc : false;
  return desc ? `?sort=${encodeURIComponent(key)}&dir=desc` : `?sort=${encodeURIComponent(key)}`;
}

const blank = (value: CellValue | undefined) => value === null || value === undefined || value === "";

// "70% Corn" before "High Rye", and "Batch 9" before "Batch 10".
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compare(a: CellValue, b: CellValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  // Yes before No, which is what anyone sorting a Yes/No column is after.
  if (typeof a === "boolean" && typeof b === "boolean") return Number(b) - Number(a);
  return collator.compare(String(a), String(b));
}

/**
 * Rows ordered by one column. Blanks go last in either direction — a column
 * of mostly dashes is not what anyone sorts to see. Ties keep the order the
 * server sent, so a sort never shuffles rows that compare equal.
 */
export function sortAdminRows(rows: readonly AdminRow[], sort: AdminSort | null): AdminRow[] {
  if (sort === null) return [...rows];
  const { key, desc } = sort;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      const a = x.row.cells[key];
      const b = y.row.cells[key];
      if (blank(a) || blank(b)) {
        if (blank(a) && blank(b)) return x.index - y.index;
        return blank(a) ? 1 : -1;
      }
      const order = compare(a!, b!);
      if (order !== 0) return desc ? -order : order;
      return x.index - y.index;
    })
    .map(({ row }) => row);
}
