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

/**
 * The API says "vintage" where the code, the database and the shared bottle schema still say "release" (`releaseId`):
 * the one place the two meet is here. A request's `vintageId` becomes `releaseId` for the schema; `releaseId` itself is
 * not an API field, so it is dropped rather than quietly accepted.
 */
export function bodyForSchema(body: Record<string, unknown>): Record<string, unknown> {
  const { vintageId, releaseId: _dropped, ...rest } = body;
  return vintageId === undefined ? rest : { ...rest, releaseId: vintageId };
}

/** The same the other way, for the field names an error reports. */
export function apiFieldNames(fields: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!fields) return fields;
  return Object.fromEntries(Object.entries(fields).map(([name, message]) => [name === "releaseId" ? "vintageId" : name, message]));
}
