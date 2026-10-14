import { z } from "zod";

const text = z.union([z.string(), z.number(), z.null()]).transform((value) => (value === null ? "" : String(value)));

/**
 * What the phone may send for a release: the label form's columns, as typed. Everything is optional, a blank clears
 * it, and a field that is not listed (the photo, the notes, the age statement) is refused rather than ignored.
 */
export const releaseBodySchema = z
  .object({ name: text, year: text, proof: text, ageYears: text, ageMonths: text, ageDays: text, msrp: text })
  .partial()
  .strict();
