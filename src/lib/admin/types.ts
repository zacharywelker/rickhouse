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
  /** Categories only: the stable identifier behind the display name. */
  slug?: string;
  hint?: string;
  /** Distilleries only: a placeholder for a place a label names and no distillery. */
  undisclosed?: boolean;
  /** Distilleries only: the Scotch region it sits in, copied onto a label that links it. */
  region?: string;
  country?: string;
  categoryId?: number;
  tequilaClass?: string | null;
  brandyGrade?: string | null;
  isAgedGin?: boolean;
  isNas?: boolean;
  /** Set on self-referencing resources, so the form can exclude descendants. */
  parentId?: number | null;
};

/**
 * A fixed width for a field on a form that lets its fields flow along a line. `xxs` fits about four
 * characters and `xs` about six; `auto` is as wide as its content (a checkbox); `lg` is a full row on a phone and a fixed width from `sm` up.
 */
export type FieldWidth = "auto" | "xxs" | "xs" | "sm" | "md" | "lg";

/** Fields shared by every field kind. */
type FieldBase = {
  name: string;
  label: string;
  span?: FieldSpan;
  width?: FieldWidth;
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
      /** A size in mL: shown as a choice of these, with "Other size…" for any other whole number. */
      presets?: ReadonlyArray<number>;
      /** With presets: the choice that leaves it blank, e.g. "Same as the label". */
      blankLabel?: string;
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
      /** A price: shown with the account's currency symbol. */
      money?: boolean;
      required?: boolean;
      min?: number;
      max?: number;
      step?: number;
      placeholder?: string;
      help?: string;
      /** Prefilled when creating. Mirror the column default where there is one. */
      defaultValue?: string;
      /** A size in mL: shown as a choice of these, with "Other size…" for any other whole number. */
      presets?: ReadonlyArray<number>;
      /** With presets: the choice that leaves it blank, e.g. "Same as the label". */
      blankLabel?: string;
    })
  | (FieldBase & { kind: "checkbox"; help?: string })
  | (FieldBase & {
      kind: "select";
      options: ReadonlyArray<{ value: string; label: string }>;
      required?: boolean;
      help?: string;
    })
  | (FieldBase & {
      kind: "slider";
      /** Ordered stops; the first is the empty/unknown one. */
      options: ReadonlyArray<{ value: string; label: string }>;
      /** "stave": draw the stops as the Char Level stave in the full form. */
      look?: "stave";
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
  "cooperages",
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
  /** Cannot be edited, and why. The tag is the short word shown in the row; allowDelete says whether Delete and Merge stay available. */
  locked?: { tag: string; reason: string; allowDelete: boolean };
};

export type ActionResult =
  | { ok: true; message: string; createdId?: number; bottleId?: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; needsChoice?: "opened_cleared" };

export type QuickCreateResult = { ok: true; option: Option } | { ok: false; error: string };

export const IDLE_RESULT: ActionResult = { ok: true, message: "" };

/** Resources a picker can create with their whole form, without leaving the page. */
export const DETAILED_RESOURCES = [
  "categories",
  "companies",
  "brands",
  "distilleries",
  "finishes",
  "cooperages",
  "stores",
  "tags",
  "mashbills",
] as const;
export type DetailedResource = (typeof DETAILED_RESOURCES)[number];

export type ResourceFormSpec =
  | {
      ok: true;
      singular: string;
      fields: FieldSpec[];
      options: Record<string, Option[]>;
      row?: AdminRow;
    }
  | { ok: false; error: string };
