/**
 * Zod schema for the Group form. Same conventions as
 * src/lib/admin/schemas.ts: input is always FormData, so every field
 * arrives as a string, and the schema owns the string -> null conversion.
 *
 * There is no slug field in the form (matching the expression form): the
 * slug is always derived from the name on save (src/lib/slug.ts).
 */
import { z } from "zod";

const trimmed = z.string().trim();

const blankIfAbsent = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === undefined || value === null ? "" : value), schema);

const optionalText = (max = 4000) =>
  blankIfAbsent(trimmed.max(max, `Keep this under ${max} characters.`).transform((v) => (v === "" ? null : v)));

export const groupSchema = z.object({
  name: trimmed.min(1, "Name this group.").max(120, "Keep this under 120 characters."),
  description: optionalText(),
});

export type GroupInput = z.infer<typeof groupSchema>;
