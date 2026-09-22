/**
 * Validation for expressions and bottles.
 *
 * As with the configuration forms, input is always FormData, so everything
 * arrives as a string and the schemas own the conversion. Numerics destined
 * for Postgres `numeric` columns leave here as strings — never floats.
 */
import { z } from "zod";
import { ACQUISITIONS, BOTTLE_STATUSES, STILL_TYPES } from "@/db/schema";

const trimmed = z.string().trim();

const blankIfAbsent = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === undefined || value === null ? "" : value), schema);

const requiredText = (max = 160) => trimmed.min(1, "Required.").max(max, `Keep this under ${max} characters.`);

const optionalText = (max = 2000) =>
  blankIfAbsent(trimmed.max(max, `Keep this under ${max} characters.`).transform((v) => (v === "" ? null : v)));

const optionalSlug = blankIfAbsent(
  trimmed
    .max(80)
    .refine((v) => v === "" || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v), "Lowercase letters, numbers and hyphens only.")
    .transform((v) => (v === "" ? null : v)),
);

const requiredRef = z.coerce.number().int().positive("Required.");

const optionalRef = blankIfAbsent(
  z.union([z.literal(""), z.coerce.number().int().positive()]).transform((v) => (v === "" ? null : v)),
);

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** A nullable boolean column: blank means genuinely unknown, not false. */
const tristate = blankIfAbsent(
  z.enum(["", "true", "false"]).transform((v) => (v === "" ? null : v === "true")),
);

const optionalInt = (min: number, max: number) =>
  blankIfAbsent(
    z
      .union([z.literal(""), z.coerce.number().int().min(min, `Must be at least ${min}.`).max(max, `Must be at most ${max}.`)])
      .transform((v) => (v === "" ? null : v)),
  );

/** Numeric column: validated as a number, stored as a string. */
const optionalDecimal = (min: number, max: number) =>
  blankIfAbsent(
    z
      .union([z.literal(""), z.coerce.number().min(min, `Must be at least ${min}.`).max(max, `Must be at most ${max}.`)])
      .transform((v) => (v === "" ? null : String(v))),
  );

const optionalDate = blankIfAbsent(
  trimmed
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a date.")
    .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "That is not a real date.")
    .transform((v) => (v === "" ? null : v)),
);

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  blankIfAbsent(z.enum(["", ...values] as unknown as readonly [string, ...string[]]).transform((v) => (v === "" ? null : v)));

export const expressionSchema = z
  .object({
    // Identity
    brandId: requiredRef,
    categoryId: requiredRef,
    name: requiredText(160),
    slug: optionalSlug,
    batch: optionalText(80),
    releaseYear: optionalInt(1700, 2200),
    description: optionalText(),

    // Strength and age
    proof: optionalDecimal(0, 200),
    isCaskStrength: checkbox,
    ageYears: optionalDecimal(0, 100),
    ageMonths: optionalInt(0, 1200),
    ageDays: optionalInt(0, 40000),
    ageStatement: optionalText(200),
    isStraight: checkbox,
    isNas: checkbox,

    // Whiskey process
    isBottledInBond: checkbox,
    entryProof: optionalDecimal(0, 200),
    isChillFiltered: tristate,
    colorAdded: tristate,
    charLevel: optionalText(80),

    // Rum
    stillType: optionalEnum(STILL_TYPES),
    estate: optionalText(120),
    marque: optionalText(80),
    molassesOrCane: optionalEnum(["molasses", "cane juice", "honey"] as const),
    esterGl: optionalDecimal(0, 999999),
    sugarGPerL: optionalDecimal(0, 9999),
    tropicalYears: optionalDecimal(0, 100),
    continentalYears: optionalDecimal(0, 100),
    isSolera: tristate,
    soleraRange: optionalText(80),

    // Agave
    agaveType: optionalText(120),
    agaveRegion: optionalText(120),
    cookingMethod: optionalEnum(["brick oven", "autoclave", "pit"] as const),
    extraction: optionalEnum(["tahona", "roller mill"] as const),
    isAdditiveFree: tristate,

    // Commercial
    msrp: optionalDecimal(0, 99_999_999),
    sizeMl: blankIfAbsent(
      z.union([z.literal(""), z.coerce.number().int().min(1).max(20000)]).transform((v) => (v === "" ? 750 : v)),
    ),
    upc: blankIfAbsent(
      trimmed
        .max(32)
        .refine((v) => v === "" || /^[0-9]{6,32}$/.test(v), "A barcode is 6–32 digits.")
        .transform((v) => (v === "" ? null : v)),
    ),
    labelNotes: optionalText(),
  });

export type ExpressionInput = z.infer<typeof expressionSchema>;

/** One row of an ordered many-to-many list, as the form submits it. */
export const linkRowSchema = z.object({
  id: z.coerce.number().int().positive(),
  /** Share percentage for distilleries and mashbills; months for finishes. */
  amount: z
    .union([z.literal(""), z.coerce.number().min(0).max(100000)])
    .transform((v) => (v === "" ? null : v)),
});

export type LinkRow = z.infer<typeof linkRowSchema>;

/** Parses the JSON the ordered pickers submit in a hidden input. */
export function parseLinks(raw: FormDataEntryValue | null): LinkRow[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = z.array(linkRowSchema).max(50).safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    // Duplicates would violate the join table's composite primary key.
    const seen = new Set<number>();
    return parsed.data.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
  } catch {
    return [];
  }
}

export const bottleSchema = z.object({
  expressionId: requiredRef,
  pricePaid: optionalDecimal(0, 99_999_999),
  storeId: optionalRef,
  dateAcquired: optionalDate,
  acquisition: z.enum(ACQUISITIONS),
  acquisitionNotes: optionalText(),
  status: z.enum(BOTTLE_STATUSES),
  location: optionalText(120),
  isFavorite: checkbox,
  notes: optionalText(),

  // Release identity (M7). Moved here from the label with its validation.
  batch: optionalText(80),
  releaseYear: optionalInt(1700, 2200),
  isSingleBarrel: checkbox,
  isSingleBarrelPick: checkbox,
  barrelNumber: optionalText(80),
  bottleCount: optionalInt(1, 10_000_000),
  pickName: optionalText(160),
  pickedBy: optionalText(160),
  barrelFilledOn: optionalDate,
  bottledOn: optionalDate,
  warehouse: optionalText(80),
  rickFloor: optionalText(80),

  // Overrides. Blank inherits from the label.
  proof: optionalDecimal(0, 200),
  ageYears: optionalDecimal(0, 100),
  ageMonths: optionalInt(0, 1200),
  ageDays: optionalInt(0, 40000),
  ageStatement: optionalText(200),
}).superRefine((value, ctx) => {
  if (value.barrelFilledOn && value.bottledOn && value.bottledOn < value.barrelFilledOn) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bottledOn"],
      message: "Bottled before it was filled — check these dates.",
    });
  }
});

export type BottleInput = z.infer<typeof bottleSchema>;

export const tastingNoteSchema = z.object({
  tastedOn: blankIfAbsent(
    trimmed
      .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a date.")
      .transform((v) => (v === "" ? new Date().toISOString().slice(0, 10) : v)),
  ),
  rating: blankIfAbsent(
    z
      .union([z.literal(""), z.coerce.number().min(0, "0 at the lowest.").max(10, "10 at the highest.")])
      .transform((v) => (v === "" ? null : String(v))),
  ),
  nose: optionalText(),
  palate: optionalText(),
  finish: optionalText(),
  overall: optionalText(),
});
