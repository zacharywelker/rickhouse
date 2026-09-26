import { ACQUISITIONS, BOTTLE_STATUSES } from "@/db/schema";
import type { FormSection } from "./fields";

const titleCase = (value: string) => value[0]!.toUpperCase() + value.slice(1);

/**
 * The physical unit on the shelf.
 *
 * Release identity lives here rather than on the label (SPEC M7): six private
 * selections of one Weller 12 are six bottles of one product, and putting
 * batch and the single-barrel flags upstream forced a duplicate product per
 * pick — exactly the duplication the label/bottle split exists to prevent.
 *
 * Proof and age are overrides. Left blank they inherit from the label, which
 * is resolved when read rather than copied on save, so correcting the label
 * still reaches every bottle that did not say otherwise.
 */
export const BOTTLE_SECTIONS: ReadonlyArray<FormSection> = [
  {
    id: "bottle",
    title: "This Bottle",
    description: "What is true of this particular bottle. The recipe, distillery and MSRP live on the label.",
    fields: [
      {
        kind: "reference",
        name: "expressionId",
        label: "Label",
        // Labels have too many required parts to conjure from a name.
        resource: null,
        required: true,
        span: "full",
      },
      { kind: "number", name: "pricePaid", label: "Price Paid", min: 0, step: 0.01, span: "half" },
      { kind: "reference", name: "storeId", label: "Store", resource: "stores", span: "half" },
      { kind: "date", name: "dateAcquired", label: "Date Acquired", span: "half" },
      {
        kind: "select",
        name: "acquisition",
        label: "How You Got It",
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
      {
        kind: "text",
        name: "location",
        label: "Where It Lives",
        placeholder: "Bar cart, basement shelf 3",
        span: "half",
      },
    ],
  },
  {
    id: "release",
    title: "Release",
    description: "What varies bottle to bottle. Single barrels and private selections reveal more fields below.",
    fields: [
      { kind: "text", name: "batch", label: "Batch", placeholder: "Batch 2 or B524", span: "half" },
      { kind: "number", name: "releaseYear", label: "Release Year", min: 1700, max: 2200, step: 1, span: "half" },
      { kind: "checkbox", name: "isSingleBarrel", label: "Single Barrel", span: "half" },
      {
        kind: "checkbox",
        name: "isSingleBarrelPick",
        label: "Private Selection",
        help: "Private selection or store pick",
        span: "half",
      },
    ],
  },
  {
    id: "pick",
    title: "Single Barrel Detail",
    description: "Fill and bottling dates give the exact age without you having to work it out.",
    showWhenAny: ["isSingleBarrel", "isSingleBarrelPick"],
    fields: [
      {
        kind: "text",
        name: "pickName",
        label: "Pick Name",
        placeholder: "Barrel #24 — Bourbon Society",
        span: "half",
        // A plain single barrel has no pick behind it — only a private
        // selection does.
        showWhenAny: ["isSingleBarrelPick"],
      },
      {
        kind: "text",
        name: "pickedBy",
        label: "Picked By",
        placeholder: "The club, bar or society that chose it",
        span: "half",
        showWhenAny: ["isSingleBarrelPick"],
      },
      { kind: "text", name: "barrelNumber", label: "Barrel Number", span: "half" },
      { kind: "number", name: "bottleCount", label: "Bottles In The Release", min: 1, step: 1, span: "half" },
      { kind: "text", name: "warehouse", label: "Warehouse", placeholder: "Warehouse H", span: "half" },
      { kind: "text", name: "rickFloor", label: "Rick / Floor", placeholder: "5th floor, rick 12", span: "half" },
    ],
  },
  {
    id: "override",
    title: "This Bottle's Own Proof And Age",
    description:
      "Leave these blank to use the label's. A single barrel almost always differs on exactly these two, " +
      "which is why they are here at all.",
    fields: [
      { kind: "number", name: "proof", label: "Proof", min: 0, max: 200, step: 0.01, span: "half" },
      // Surfaced for every bottle, not only picks (SPEC M8): a standard
      // release has a bottling date too, and the pair derives the age.
      { kind: "date", name: "barrelFilledOn", label: "Barrel Filled", span: "half" },
      { kind: "date", name: "bottledOn", label: "Bottled", span: "half" },
      {
        kind: "number",
        name: "ageYears",
        label: "Age — Years",
        min: 0,
        max: 100,
        step: 0.1,
        help: "Filled and bottled above will offer to work this out.",
        span: "half",
      },
      { kind: "number", name: "ageMonths", label: "Age — Months", min: 0, max: 1200, step: 1, span: "half" },
      { kind: "number", name: "ageDays", label: "Age — Days", min: 0, max: 40000, step: 1, span: "half" },
      {
        kind: "text",
        name: "ageStatement",
        label: "Age Statement",
        placeholder: "e.g. 7 Year",
        help: "The human sentence, for when the numbers do not tell the whole story.",
        span: "half",
      },
    ],
  },
  {
    id: "notes",
    title: "Notes",
    fields: [{ kind: "textarea", name: "notes", label: "Notes", span: "full" }],
  },
];

/** Flat list, for seeding form state and for the server's allow-list. */
export const BOTTLE_FIELDS = BOTTLE_SECTIONS.flatMap((section) => section.fields);

/**
 * Where the bottle is in its life. Bulk grid only (`bottleStateSchema`): the
 * bottle page sets these with its own controls, but entering a collection
 * that already exists means entering bottles that are already open.
 */
export const BOTTLE_STATE_SECTION: FormSection = {
  id: "state",
  title: "State",
  fields: [
    { kind: "number", name: "fillPct", label: "Fill %", min: 0, max: 100, step: 1, defaultValue: "100" },
    { kind: "checkbox", name: "isOpen", label: "Opened" },
    { kind: "date", name: "dateOpened", label: "Date Opened" },
    { kind: "date", name: "dateKilled", label: "Date Killed" },
    { kind: "checkbox", name: "isFavorite", label: "Favorite" },
  ],
};
