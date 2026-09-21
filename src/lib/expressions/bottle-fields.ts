import { ACQUISITIONS, BOTTLE_STATUSES } from "@/db/schema";
import type { FieldSpec } from "@/lib/admin/types";

const titleCase = (value: string) => value[0]!.toUpperCase() + value.slice(1);

/**
 * The physical unit on the shelf. Everything about the *product* lives on the
 * expression; this is only what is true of your particular bottle.
 */
export const BOTTLE_FIELDS: FieldSpec[] = [
  {
    kind: "reference",
    name: "expressionId",
    label: "Expression",
    // Expressions have too many required parts to conjure from a name.
    resource: null,
    required: true,
    span: "full",
  },
  { kind: "number", name: "pricePaid", label: "Price paid", min: 0, step: 0.01, span: "half" },
  { kind: "reference", name: "storeId", label: "Store", resource: "stores", span: "half" },
  { kind: "date", name: "dateAcquired", label: "Date acquired", span: "half" },
  {
    kind: "select",
    name: "acquisition",
    label: "How you got it",
    options: ACQUISITIONS.map((value) => ({ value, label: titleCase(value) })),
    span: "half",
  },
  {
    kind: "select",
    name: "status",
    label: "Status",
    options: BOTTLE_STATUSES.map((value) => ({ value, label: titleCase(value) })),
    span: "half",
  },
  { kind: "text", name: "location", label: "Where it lives", placeholder: "Bar cart, basement shelf 3", span: "half" },
  { kind: "number", name: "estimatedValue", label: "Estimated value", min: 0, step: 0.01, span: "half" },
  { kind: "checkbox", name: "isFavorite", label: "Favourite", span: "half" },
  { kind: "textarea", name: "acquisitionNotes", label: "Acquisition notes", span: "full" },
  { kind: "textarea", name: "notes", label: "Notes", span: "full" },
];
