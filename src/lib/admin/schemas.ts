/**
 * Zod schemas for the taxonomy forms. Every mutation is validated with these
 * on the server regardless of what the client checked (SPEC: Conventions).
 *
 * Input is always FormData, so every field arrives as a string. The schemas
 * own the string -> null / number / boolean conversion; nothing downstream
 * should be parsing form values by hand.
 */
import { z } from "zod";
import { FIELD_GROUPS, FINISH_TYPES } from "@/db/schema";

const trimmed = z.string().trim();

/**
 * Forms send every key, but the inline "create new" path sends only a name.
 * Treating an absent optional field as blank lets one schema serve both.
 */
const blankIfAbsent = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === undefined || value === null ? "" : value), schema);

const requiredText = (max = 160) =>
  trimmed.min(1, "Required.").max(max, `Keep this under ${max} characters.`);

const optionalText = (max = 2000) =>
  blankIfAbsent(trimmed.max(max, `Keep this under ${max} characters.`).transform((v) => (v === "" ? null : v)));

/** Slug is optional on input: blank means "generate it from the name". */
const optionalSlug = blankIfAbsent(
  trimmed
    .max(80)
    .refine((v) => v === "" || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v), "Lowercase letters, numbers and hyphens only.")
    .transform((v) => (v === "" ? null : v)),
);

const optionalUrl = blankIfAbsent(
  trimmed
    .max(500)
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^https?:\/\//i.test(v), "Must start with http:// or https://"),
);

/** A nullable foreign key from a <select>/combobox that submits "" for none. */
const optionalRef = blankIfAbsent(
  z.union([z.literal(""), z.coerce.number().int().positive()]).transform((v) => (v === "" ? null : v)),
);

const optionalYear = blankIfAbsent(
  z
    .union([z.literal(""), z.coerce.number().int().min(1600, "That is too early.").max(2200, "That is too late.")])
    .transform((v) => (v === "" ? null : v)),
);

const optionalSortOrder = blankIfAbsent(
  z.union([z.literal(""), z.coerce.number().int().min(0).max(9999)]).transform((v) => (v === "" ? 0 : v)),
);

/** Unchecked boxes are simply absent from FormData, which means false. */
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/**
 * A grain percentage. Stored as Postgres numeric, so it leaves here as a
 * string — never a float (SPEC: Conventions).
 */
const percent = blankIfAbsent(
  z
    .union([z.literal(""), z.coerce.number().min(0, "Cannot be negative.").max(100, "Cannot exceed 100.")])
    .transform((v) => (v === "" ? 0 : v)),
);

const hexColor = blankIfAbsent(
  trimmed
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^#[0-9a-fA-F]{6}$/.test(v), "Use a hex colour like #b5651d."),
);

export const categorySchema = z.object({
  name: requiredText(80),
  slug: optionalSlug,
  parentId: optionalRef,
  fieldGroup: z.enum(FIELD_GROUPS),
  sortOrder: optionalSortOrder,
});

export const companySchema = z.object({
  name: requiredText(120),
  slug: optionalSlug,
  parentId: optionalRef,
  country: optionalText(80),
  website: optionalUrl,
  notes: optionalText(),
});

export const brandSchema = z.object({
  name: requiredText(120),
  slug: optionalSlug,
  companyId: optionalRef,
  isNdp: checkbox,
  notes: optionalText(),
});

export const distillerySchema = z.object({
  name: requiredText(120),
  slug: optionalSlug,
  companyId: optionalRef,
  city: optionalText(80),
  state: optionalText(40),
  country: requiredText(80),
  dspNumber: optionalText(40),
  founded: optionalYear,
  notes: optionalText(),
});

export const mashbillSchema = z
  .object({
    name: optionalText(120),
    corn: percent,
    rye: percent,
    wheat: percent,
    maltedBarley: percent,
    maltedRye: percent,
    otherGrain: percent,
    otherGrainName: optionalText(80),
    distilleryId: optionalRef,
    notes: optionalText(),
  })
  .superRefine((value, ctx) => {
    const total = value.corn + value.rye + value.wheat + value.maltedBarley + value.maltedRye + value.otherGrain;
    // Matches the mashbill_sums_to_100 check constraint, which allows a point
    // of slack for published mashbills that are rounded.
    if (total < 99 || total > 101) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["corn"],
        message: `The grains add up to ${Number(total.toFixed(2))}%, not 100%.`,
      });
    }
    if (value.otherGrain > 0 && value.otherGrainName === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["otherGrainName"],
        message: "Name the other grain, or set its percentage to 0.",
      });
    }
  });

export const finishSchema = z.object({
  name: requiredText(120),
  slug: optionalSlug,
  finishType: z.enum(FINISH_TYPES),
  notes: optionalText(),
});

export const storeSchema = z.object({
  name: requiredText(120),
  slug: optionalSlug,
  location: optionalText(120),
  isOnline: checkbox,
  url: optionalUrl,
  notes: optionalText(),
});

export const tagSchema = z.object({
  name: requiredText(60),
  slug: optionalSlug,
  color: hexColor,
});

/** Inline "create new" from a picker: a name is all we ask for. */
export const quickCreateSchema = z.object({
  name: requiredText(120),
});

export type CategoryInput = z.infer<typeof categorySchema>;
export type MashbillInput = z.infer<typeof mashbillSchema>;
