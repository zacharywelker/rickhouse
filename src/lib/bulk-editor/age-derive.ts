import { youngestStatementYears } from "@/lib/expressions/whiskey-age";

/**
 * What the single forms do with a whiskey's age statement, as one rule the sheet and the server share (the forms'
 * `withStatementAge`): typing a statement fills the years in from its youngest age ("8 to 12 years" is 8) and marks them
 * *derived*, unless the person has entered an age, which is never replaced. Typing years, months or days marks the age
 * *entered*. Only whiskey does this.
 */
export type AgeState = { ageYears?: unknown; ageMonths?: unknown; ageDays?: unknown; ageStatement?: unknown; ageYearsSource?: unknown; [other: string]: unknown };

const filled = (value: unknown) => String(value ?? "").trim() !== "";
export const hasAge = (state: AgeState) => filled(state.ageYears) || filled(state.ageMonths) || filled(state.ageDays);

/**
 * The extra age facts a patch of `patch` implies for a label or bottle that is `current` (null for a new one), or
 * nothing. `ageYearsSource` is only meaningful for whiskey.
 */
export function derivedAge(current: AgeState | null, patch: AgeState, whiskey: boolean): Record<string, unknown> {
  if (!whiskey) return {};
  const touchedParts = "ageYears" in patch || "ageMonths" in patch || "ageDays" in patch;
  if (touchedParts) return { ageYearsSource: "entered" };
  if (!("ageStatement" in patch)) return {};
  const entered = current !== null && hasAge(current) && current.ageYearsSource !== "derived";
  if (entered) return {};
  const years = youngestStatementYears(String(patch.ageStatement ?? ""));
  return years === null
    ? { ageYears: null, ageMonths: null, ageDays: null, ageYearsSource: "entered" }
    : { ageYears: String(years), ageMonths: null, ageDays: null, ageYearsSource: "derived" };
}
