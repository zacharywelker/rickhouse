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

/** Fields shared by every field kind. */
type FieldBase = {
  name: string;
  label: string;
  span?: FieldSpan;
  /** Shown only when at least one of these boolean fields (in the same form) is on. Absent means always. */
  showWhenAny?: ReadonlyArray<string>;
};

/** A field on an admin form. `name` matches the FormData key and the Zod key. */
export type FieldSpec =
  | (FieldBase & {
      kind: "text";
      required?: boolean;
      placeholder?: string;
      help?: string;
      /** Prefilled when creating. Mirror the column default where there is one. */
      defaultValue?: string;
    })
  | (FieldBase & { kind: "textarea"; placeholder?: string; help?: string })
  | (FieldBase & {
      kind: "date";
      required?: boolean;
      help?: string;
      defaultValue?: string;
    })
  | (FieldBase & {
      kind: "number";
      required?: boolean;
      min?: number;
      max?: number;
      step?: number;
      placeholder?: string;
      help?: string;
      /** Prefilled when creating. Mirror the column default where there is one. */
      defaultValue?: string;
    })
  | (FieldBase & { kind: "checkbox"; help?: string })
  | (FieldBase & {
      kind: "select";
      options: ReadonlyArray<{ value: string; label: string }>;
      required?: boolean;
      help?: string;
    })
  /**
   * A picker over another entity, with "create new" inline. This is the field
   * that stops adding a bottle from turning into a detour to go create a
   * distillery first.
   */
  | (FieldBase & {
      kind: "reference";
      /** Null disables inline create for this picker. */
      resource: ReferenceResource | null;
      required?: boolean;
      help?: string;
      /** Rows that would create a cycle, e.g. a category's own descendants. */
      excludeSelfAndDescendants?: boolean;
    });

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
