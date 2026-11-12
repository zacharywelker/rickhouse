import type { CellEditor } from "./editors";
import type { Cell } from "./sheet";

/**
 * Copy and paste, as plain data. The clipboard holds tab-separated text (a tab between columns, a line per row, a quoted
 * field where it holds a tab, a quote or a line break), which is what Excel and Sheets copy and paste, so a block copied
 * here pastes there and back. Nothing in this file knows about the sheet's rows: `bulk-editor.tsx` decides where a block
 * lands, and this says what a piece of text means for one cell.
 */

/** Text, as the lines and fields of a tab-separated block. A trailing line break does not make an empty last row. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") {
      quoted = true;
      started = true;
    } else if (ch === "\t") {
      row.push(field);
      field = "";
      started = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      started = false;
    } else {
      field += ch;
      started = true;
    }
  }
  if (started || field !== "") {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const needsQuotes = /[\t\n\r"]/;
export const toTsv = (rows: ReadonlyArray<ReadonlyArray<string>>): string =>
  rows.map((row) => row.map((field) => (needsQuotes.test(field) ? `"${field.replace(/"/g, '""')}"` : field)).join("\t")).join("\n");

/** A blank cell is a dash on screen, and is copied as nothing. */
const BLANKS = new Set(["—", "–", "-"]);
const isBlank = (text: string) => BLANKS.has(text.trim());

/**
 * What one cell puts on the clipboard: the value as it is typed (an ISO date, a number as typed, a choice by its label),
 * or, where the cell has no value of its own to type (a name picked from a list, a list, a cell that cannot be edited),
 * what it shows.
 */
export function copyText(editor: CellEditor | null, value: string, shown: Cell): string {
  const text = isBlank(shown.text) ? "" : shown.text;
  if (!editor || editor.combo || editor.reference || editor.links) return text;
  const { spec } = editor;
  if (spec.kind === "checkbox") return value === "true" ? "Yes" : "No";
  if (spec.kind === "select" || spec.kind === "slider") return value === "" ? "" : (spec.options.find((o) => o.value === value)?.label ?? value);
  return value;
}

export type Read = { ok: true; value: string } | { ok: false; message: string };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** A date as a spreadsheet or a person writes it: 2025-06-14, 6/14/2025, or Jun 14, 2025. Null if it is none of those. */
export function readDate(text: string): string | null {
  const t = text.trim();
  let year: number;
  let month: number;
  let day: number;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) [year, month, day] = [Number(m[3]), Number(m[1]), Number(m[2])];
  else if ((m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t)) && MONTHS.includes(m[1]!.toLowerCase())) [year, month, day] = [Number(m[3]), MONTHS.indexOf(m[1]!.toLowerCase()) + 1, Number(m[2])];
  else return null;
  const made = new Date(Date.UTC(year, month - 1, day));
  // A date that rolls over (February 31) is not the date that was written.
  return made.getUTCFullYear() === year && made.getUTCMonth() === month - 1 && made.getUTCDate() === day ? `${year}-${pad(month)}-${pad(day)}` : null;
}

const YES = new Set(["yes", "true", "1", "y", "x", "✓"]);
const NO = new Set(["no", "false", "0", "n", ""]);
const norm = (text: string) => text.trim().toLowerCase();

/**
 * What a pasted piece of text means for a cell that holds a plain value, as the text the cell would hold had it been
 * typed. It is not yet checked by the cell's own rules (`parseCell` does that). Cells that pick from a list are not
 * read here: they match a name (`matchName`).
 */
export function readPasted(editor: CellEditor, text: string): Read {
  const t = isBlank(text) ? "" : text.trim();
  const { spec } = editor;
  switch (spec.kind) {
    case "checkbox":
      if (YES.has(norm(t))) return { ok: true, value: "true" };
      if (NO.has(norm(t))) return { ok: true, value: "false" };
      return { ok: false, message: "Use yes or no." };
    case "select":
    case "slider": {
      if (t === "") return { ok: true, value: "" };
      const found = spec.options.find((o) => o.value !== "" && (norm(o.value) === norm(t) || norm(o.label) === norm(t)));
      return found ? { ok: true, value: found.value } : { ok: false, message: "Choose one of the options." };
    }
    case "date": {
      if (t === "") return { ok: true, value: "" };
      const iso = readDate(t);
      return iso ? { ok: true, value: iso } : { ok: false, message: "Use a date like 2025-06-14." };
    }
    case "number":
      // A price, a size or a proof as a spreadsheet shows it: $47.00, 1,750 mL, 45%.
      return { ok: true, value: t.replace(/[$,%\s]/g, "").replace(/ml$/i, "") };
    case "textarea":
      return { ok: true, value: text.trim() };
    default:
      return { ok: true, value: t };
  }
}

export type Named = { id: number | null; name: string };

/**
 * A pasted name against what a cell can pick from. A complete name, in any case, that only one thing has is taken as it
 * is (it was most likely copied from another cell). Anything else is only something to search for: the person chooses.
 */
export function matchName<T extends Named>(text: string, candidates: ReadonlyArray<T>): { kind: "exact"; match: T } | { kind: "search" } | { kind: "blank" } {
  const t = norm(text);
  if (t === "" || BLANKS.has(text.trim())) return { kind: "blank" };
  const same = candidates.filter((c) => norm(c.name) === t);
  return same.length === 1 ? { kind: "exact", match: same[0]! } : { kind: "search" };
}
