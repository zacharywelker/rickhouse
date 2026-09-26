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
    emptyHint?: string;
    amountLabel: string;
    amountSuffix: string;
  }
> = {
  distilleries: {
    field: "distilleryLinks",
    label: "Distilleries",
    description: "Every distillery that contributed, in the order you would list them.",
    resource: "distilleries",
    amountLabel: "Share",
    amountSuffix: "%",
  },
  mashbills: {
    field: "mashbillLinks",
    label: "Mashbills",
    description: "One per contributing recipe. With more than one distillery, say which one made each.",
    resource: null,
    emptyHint: "Add mashbills under Configuration — their grains have to total 100%.",
    amountLabel: "Share",
    amountSuffix: "%",
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

/** "Buffalo Trace (60%), Barton (40%)" — the list as a line of text. */
export function describeLinks(kind: LinkKind, rows: ReadonlyArray<LinkedRow>): string {
  const suffix = LINK_KINDS[kind].amountSuffix;
  return rows
    .map((row) => (row.amount === "" ? row.label : `${row.label} (${row.amount}${suffix === "%" ? "%" : ` ${suffix}`})`))
    .join(", ");
}

/** The JSON the server's `parseLinks` reads — the same shape the form submits. */
export function linksPayload(rows: ReadonlyArray<LinkedRow>): string {
  return JSON.stringify(rows.map((row) => ({ id: row.id, amount: row.amount, distilleryId: row.distilleryId ?? null })));
}
