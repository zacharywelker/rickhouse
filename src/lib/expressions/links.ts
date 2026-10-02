import type { ReferenceResource } from "@/lib/admin/types";
import type { LinkedRow } from "@/components/expressions/ordered-picker";

export type LinkKind = "distilleries" | "mashbills" | "finishes";

/** Each ordered list as the label form sets it up, keyed by the name it submits under. */
export const LINK_KINDS: Record<
  LinkKind,
  {
    field: "distilleryLinks" | "mashbillLinks" | "finishLinks";
    label: string;
    description: string;
    resource: ReferenceResource | null;
    /** Each row can be marked as identified from outside the label. */
    inferable?: boolean;
    /** A "Distillery not disclosed" tick for a label that names only a place. */
    undisclosable?: boolean;
    emptyHint?: string;
    amountLabel: string;
    amountSuffix: string;
    /** The most the amount can be: 100 for a share. Months have no cap. */
    amountMax?: number;
  }
> = {
  distilleries: {
    field: "distilleryLinks",
    label: "Distilleries",
    description:
      "Every distillery that contributed, in the order you would list them. Tick Inferred when the label does not name it and you worked it out elsewhere.",
    resource: "distilleries",
    inferable: true,
    undisclosable: true,
    amountLabel: "Share",
    amountSuffix: "%",
    amountMax: 100,
  },
  mashbills: {
    field: "mashbillLinks",
    label: "Mashbills",
    description: "One per contributing recipe. With more than one distillery, say which one made each.",
    resource: null,
    emptyHint: "No mashbills yet — add a new one from here.",
    amountLabel: "Share",
    amountSuffix: "%",
    amountMax: 100,
  },
  finishes: {
    field: "finishLinks",
    label: "Finishes",
    description: "In sequence, for a double or triple finish.",
    resource: "finishes",
    amountLabel: "Months",
    amountSuffix: "mo",
  },
};

export const LINK_FIELDS = (Object.keys(LINK_KINDS) as LinkKind[]).map((kind) => LINK_KINDS[kind].field);

/**
 * A share as the form and the label page show it: a whole percentage. "33.33%"
 * is more exact than anyone knows a blend to be, so shares are kept whole —
 * this also rounds any saved before that was the rule.
 */
export function shareText(value: string | null): string {
  return value === null || value === "" ? "" : String(Math.round(Number(value)));
}

/** "Buffalo Trace (60%), Barton (40%)" — the list as a line of text. */
export function describeLinks(kind: LinkKind, rows: ReadonlyArray<LinkedRow>): string {
  const suffix = LINK_KINDS[kind].amountSuffix;
  return rows
    .map((row) => (row.amount === "" ? row.label : `${row.label} (${row.amount}${suffix === "%" ? "%" : ` ${suffix}`})`))
    .join(", ");
}

/** The JSON the server's `parseLinks` reads — the same shape the form submits. */
export function linksPayload(rows: ReadonlyArray<LinkedRow>): string {
  return JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      distilleryId: row.distilleryId ?? null,
      inferred: row.inferred === true,
      // An undisclosed place not yet saved as a row; the save resolves it.
      ...(row.place ? { place: row.place } : {}),
    })),
  );
}
