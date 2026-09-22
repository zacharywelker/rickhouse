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

/** One row of the grain editor, as it arrives in the hidden JSON field. */
const grainRow = z.object({
  grain: z.string().trim().min(1, "Name the grain.").max(60),
  percent: z.coerce.number().gt(0, "More than 0%.").max(100, "100% at the most."),
});

export const mashbillSchema = z
  .object({
    name: optionalText(120),
    distilleryId: optionalRef,
    notes: optionalText(),
    // The editor serialises its rows into one hidden field.
    grains: z
      .string()
      .default("[]")
      .transform((raw, ctx) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw === "" ? "[]" : raw);
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Could not read the grains." });
          return z.NEVER;
        }
        const rows = z.array(grainRow).safeParse(parsed);
        if (!rows.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: rows.error.issues[0]?.message ?? "Check the grains.",
          });
          return z.NEVER;
        }
        return rows.data;
      }),
  })
  .superRefine((value, ctx) => {
    // The transform bails with z.NEVER when the field is not parseable JSON
    // or not a list of grains, and superRefine still runs — so without this
    // guard a malformed field throws a TypeError instead of failing cleanly.
    if (!Array.isArray(value.grains)) return;

    const seen = new Set<string>();
    for (const row of value.grains) {
      const key = row.grain.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["grains"],
          message: `${row.grain} is in there twice. Combine them into one row.`,
        });
        return;
      }
      seen.add(key);
    }

    // An empty recipe is allowed: a mashbill you know the name of but not the
    // contents is a real thing to record. Anything else has to add up, with
    // the same slack the database trigger allows for rounded published bills.
    if (value.grains.length === 0) return;
    const total = value.grains.reduce((sum, row) => sum + row.percent, 0);
    if (total < 99 || total > 101) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["grains"],
        message: `The grains add up to ${Number(total.toFixed(2))}%, not 100%.`,
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
