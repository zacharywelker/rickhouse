import type { RowColumn } from "./row-list-editor";

/**
 * The columns of the label form's two row lists (older names, known releases), shared so the bulk editor's popovers
 * open the same boxes, with the same hints and the same checks on what is typed.
 */
export const OTHER_NAME_COLUMNS: RowColumn[] = [
  { key: "name", label: "Name", placeholder: "Old Grand-Dad Bonded" },
  { key: "yearFrom", label: "From", placeholder: "1980", inputMode: "numeric", pattern: "\\d{4}", title: "A four-digit year", className: "sm:w-24" },
  { key: "yearTo", label: "Until", placeholder: "1995", inputMode: "numeric", pattern: "\\d{4}", title: "A four-digit year", className: "sm:w-24" },
];

export const RELEASE_COLUMNS: RowColumn[] = [
  { key: "name", label: "Name", placeholder: "2024-01 Springfield" },
  { key: "year", label: "Year", placeholder: "2024", inputMode: "numeric", pattern: "\\d{4}", title: "A four-digit year", className: "sm:w-20" },
  { key: "proof", label: "Proof", kind: "proofAbv", className: "sm:w-24" },
  { key: "ageYears", label: "Years", placeholder: "7", inputMode: "decimal", pattern: "\\d+(\\.\\d)?", title: "Years, like 7 or 7.5", className: "sm:w-16" },
  { key: "ageMonths", label: "Months", placeholder: "2", inputMode: "numeric", pattern: "\\d+", title: "Whole months", className: "sm:w-16" },
  { key: "ageDays", label: "Days", placeholder: "3", inputMode: "numeric", pattern: "\\d+", title: "Whole days", className: "sm:w-16" },
  { key: "ageStatement", label: "Age Statement", placeholder: "8–16 years", className: "sm:w-36" },
  { key: "msrp", label: "MSRP", placeholder: "99.99", inputMode: "decimal", pattern: "\\$?\\d+(\\.\\d{1,2})?", title: "A price, like 99.99", className: "sm:w-24" },
];

/** A label's older names as the list holds them: every value text. */
export const otherNameRows = (names: ReadonlyArray<{ name: string; yearFrom: number | null; yearTo: number | null }>): Array<Record<string, string>> =>
  names.map((n) => ({ name: n.name, yearFrom: n.yearFrom === null ? "" : String(n.yearFrom), yearTo: n.yearTo === null ? "" : String(n.yearTo) }));
