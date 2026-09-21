/**
 * The admin section is registry-driven: every lookup entity describes its
 * fields and columns once, and one dynamic route renders all of them.
 *
 * Rows are normalised to `AdminRow` before they reach the client, so the table
 * and form components stay free of per-entity generics.
 */

export type Option = {
  value: number;
  label: string;
  hint?: string;
  /** Set on self-referencing resources, so the form can exclude descendants. */
  parentId?: number | null;
};

/** A field on an admin form. `name` matches the FormData key and the Zod key. */
export type FieldSpec =
  | {
      kind: "text";
      name: string;
      label: string;
      required?: boolean;
      placeholder?: string;
      help?: string;
      /** Prefilled when creating. Mirror the column default where there is one. */
      defaultValue?: string;
      span?: FieldSpan;
    }
  | { kind: "textarea"; name: string; label: string; placeholder?: string; help?: string; span?: FieldSpan }
  | {
      kind: "number";
      name: string;
      label: string;
      required?: boolean;
      min?: number;
      max?: number;
      step?: number;
      placeholder?: string;
      help?: string;
      span?: FieldSpan;
    }
  | { kind: "checkbox"; name: string; label: string; help?: string; span?: FieldSpan }
  | {
      kind: "select";
      name: string;
      label: string;
      options: ReadonlyArray<{ value: string; label: string }>;
      required?: boolean;
      help?: string;
      span?: FieldSpan;
    }
  /**
   * A picker over another entity, with "create new" inline. This is the field
   * that stops adding a bottle from turning into a detour to go create a
   * distillery first.
   */
  | {
      kind: "reference";
      name: string;
      label: string;
      resource: ReferenceResource;
      required?: boolean;
      help?: string;
      /** Rows that would create a cycle, e.g. a category's own descendants. */
      excludeSelfAndDescendants?: boolean;
      span?: FieldSpan;
    };

export type FieldSpan = "full" | "half";

/** Entities reachable from a `reference` field's inline create. */
export const REFERENCE_RESOURCES = [
  "categories",
  "companies",
  "brands",
  "distilleries",
  "finishes",
  "stores",
  "tags",
] as const;
export type ReferenceResource = (typeof REFERENCE_RESOURCES)[number];

export type CellValue = string | number | boolean | null;

export type ColumnSpec = {
  key: string;
  label: string;
  /** Right-align and tabular-nums, for counts and percentages. */
  numeric?: boolean;
  /** Hidden below the `sm` breakpoint. */
  secondary?: boolean;
};

export type AdminRow = {
  id: number;
  /** What the table renders, keyed by `ColumnSpec.key`. */
  cells: Record<string, CellValue>;
  /** What the edit form loads, keyed by `FieldSpec.name`. */
  values: Record<string, CellValue>;
  /** Blocks delete and explains why, e.g. "used by 3 expressions". */
  deleteBlockedBy?: string;
};

export type ActionResult =
  | { ok: true; message: string; createdId?: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type QuickCreateResult = { ok: true; option: Option } | { ok: false; error: string };

export const IDLE_RESULT: ActionResult = { ok: true, message: "" };
