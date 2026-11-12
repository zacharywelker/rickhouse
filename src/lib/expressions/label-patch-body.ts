import { z } from "zod";
import { parseOtherNames } from "@/lib/other-names";
import { labelFactsSchema } from "./label-patch";
import { EXPRESSION_SECTIONS } from "./fields";
import { expressionSchema, linkRowSchema } from "./schema";

/** A share the app read as null comes back as null; the web form's rule wants it blank. */
const linkRow = z.preprocess(
  (row) => (typeof row === "object" && row !== null && (row as { amount?: unknown }).amount === null ? { ...row, amount: "" } : row),
  linkRowSchema,
);
/** Duplicates would break the join table's key, and an order is what was sent. */
const linkList = z.array(linkRow).max(50).refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, "A row appears twice.");
const ingredientList = z.array(z.object({ name: z.string().trim().min(1).max(120), family: z.enum(["grape", "apple", "pear", "other"]).nullable().optional(), kind: z.enum(["maguey", "distillate", "rum_base", "botanical", "gin_base"]).optional() })).max(100);

/**
 * Every fact the label form has, as a schema: the phone API's (`labelFactsSchema`) is a chosen subset of it; this is all
 * of it, taken from the form's own field list so a field added to the form is taken here too. The system field (the slug,
 * made from the name) is not a fact to send.
 */
const FORM_FACT_NAMES = [...new Set(EXPRESSION_SECTIONS.flatMap((section) => section.fields.map((field) => field.name)))].filter(
  (name) => name !== "slug" && name in expressionSchema.shape,
);
// The names are only known when this runs, so the mask cannot be checked by the compiler: `in expressionSchema.shape` above does it.
export const bulkLabelFactsSchema = (expressionSchema as unknown as { pick: (mask: Record<string, true>) => unknown }).pick(Object.fromEntries(FORM_FACT_NAMES.map((name) => [name, true]))) as typeof labelFactsSchema;

/**
 * The body of a label change, built over a set of facts: any of them, partially, a brand by name, and the three ordered
 * lists together. Strict, so a field that is not listed is refused.
 */
function patchBody(facts: typeof labelFactsSchema) {
  return facts
  .partial()
  .extend({
    // A list of Scotch regions, as GET gives it (the web form's comma text also passes). Its rules are the form's: only
    // the six regions, once each, and null or [] clears them.
    regions: z.preprocess((value) => (Array.isArray(value) && value.every((r) => typeof r === "string") ? value.join(", ") : value), labelFactsSchema.shape.regions),
    brand: z.string().trim().min(1, "Enter a brand.").max(120, "Keep this under 120 characters."),
    distilleries: linkList,
    mashbills: linkList,
    finishes: linkList,
    ingredients: ingredientList,
    otherNames: z
      .string()
      .max(10_000)
      .nullable()
      .transform((text, ctx) => {
        const parsed = parseOtherNames(text);
        if (parsed.error) {
          ctx.addIssue({ code: "custom", message: parsed.error });
          return z.NEVER;
        }
        return parsed.names;
      }),
  })
  .partial()
  .strict()
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) ctx.addIssue({ code: "custom", message: "Send at least one field to change." });
    if (value.brandId !== undefined && value.brand !== undefined) ctx.addIssue({ code: "custom", path: ["brand"], message: "Send brandId or brand, not both." });
    // Which distillery made each mashbill depends on the distillery list, so the three are rewritten together.
    const lists = [value.distilleries, value.mashbills, value.finishes].filter((list) => list !== undefined).length;
    if (lists !== 0 && lists !== 3) ctx.addIssue({ code: "custom", path: ["distilleries"], message: "Send distilleries, mashbills and finishes together." });
  });
}

/**
 * What can change on a label through the phone API (`PATCH /api/v1/expressions/:id`): its facts as the API has always
 * taken them. Unchanged by the bulk editor, which takes more (below).
 */
export const labelPatchBody = patchBody(labelFactsSchema);

/** What the bulk editor can change on a label: every fact on the label form, and the same brand and lists. */
export const bulkLabelPatchBody = patchBody(bulkLabelFactsSchema);
