import type { CategoryKind } from "./rules";
import { describeAgeParts } from "./display";

export type WhiskeyAgeFacts = {
  ageYears: string | null;
  ageMonths: number | null;
  ageDays: number | null;
  ageStatement: string | null;
  isStraight?: boolean;
  isNas?: boolean;
  isBottledInBond?: boolean;
};

export type WhiskeyAge = { text: string | null; groupingYears: number | null; inferred: boolean; explanation: string | null };

/** Only read a youngest age when the statement explicitly gives years. */
export function youngestStatementYears(statement: string | null | undefined): number | null {
  const text = statement?.trim() ?? "";
  if (!text || /^NAS$/i.test(text)) return null;
  const range = /\b(\d{1,3}(?:\.\d)?)\s*(?:-|–|—|to)\s*\d{1,3}(?:\.\d)?\s*(?:years?|yrs?)\b/i.exec(text);
  const direct = /\b(\d{1,3}(?:\.\d)?)\s*(?:years?|yrs?)\b/i.exec(text);
  const match = range ?? direct;
  if (!match) return null;
  const age = Number(match[1]);
  return Number.isFinite(age) && age >= 0 && age <= 100 ? age : null;
}

/** A range reads briefly in a grid without losing its original wording on the detail page. */
export function compactAgeStatement(statement: string): string {
  const range = /\b(\d{1,3}(?:\.\d)?)\s*(?:-|–|—|to)\s*(\d{1,3}(?:\.\d)?)\s*(?:years?|yrs?)(?:\s+old)?\b/i.exec(statement);
  return range ? `${range[1]}–${range[2]} yrs` : statement;
}

export function whiskeyAge(facts: WhiskeyAgeFacts, kind: CategoryKind): WhiskeyAge {
  const statement = facts.ageStatement?.trim();
  const numeric = facts.ageYears !== null || facts.ageMonths !== null || facts.ageDays !== null;
  const enteredYears = numeric ? Number(facts.ageYears ?? 0) + (facts.ageMonths ?? 0) / 12 + (facts.ageDays ?? 0) / 365 : null;
  if (statement && !/^NAS$/i.test(statement)) return {
    text: compactAgeStatement(statement), groupingYears: enteredYears ?? youngestStatementYears(statement),
    inferred: false, explanation: `Age statement: ${statement}`,
  };
  if (numeric) return { text: describeAgeParts(facts.ageYears, facts.ageMonths, facts.ageDays), groupingYears: enteredYears, inferred: false, explanation: null };
  const minimum = kind === "american" && facts.isBottledInBond ? 4 : kind === "american" && facts.isStraight ? (facts.isNas ? 4 : 2) :
    kind === "canadian" || kind === "irish" || kind === "scotch" ? 3 : null;
  const reason = kind === "american" && facts.isBottledInBond ? "Bottled in Bond implies a minimum of 4 years." :
    kind === "american" && facts.isStraight ? facts.isNas ? "Straight whiskey with no age statement implies a minimum of 4 years." : "Straight whiskey implies a minimum of 2 years." :
    kind === "canadian" ? "Canadian Whisky has a minimum maturation of 3 years." :
    kind === "irish" ? "Irish Whiskey has a minimum maturation of 3 years." :
    kind === "scotch" ? "Scotch Whisky has a minimum maturation of 3 years." : null;
  return { text: minimum === null ? null : `${minimum} yrs`, groupingYears: minimum, inferred: minimum !== null, explanation: reason };
}

/** Keep a statement's youngest age as grouping data until the owner edits that number. */
export function withStatementAge<T extends Record<string, unknown>>(prev: T, next: T, field: string): T {
  if (field === "ageStatement") {
    const hasEnteredAge = prev.ageYearsSource !== "derived" &&
      [prev.ageYears, prev.ageMonths, prev.ageDays].some((value) => String(value ?? "").trim() !== "");
    if (hasEnteredAge) return next;
    const suggestion = youngestStatementYears(String(next.ageStatement ?? ""));
    return { ...next, ageYears: suggestion === null ? "" : String(suggestion), ageMonths: "", ageDays: "", ageYearsSource: suggestion === null ? "entered" : "derived" };
  }
  if (["ageYears", "ageMonths", "ageDays"].includes(field) && prev.ageYearsSource === "derived") {
    return { ...next, ageYearsSource: "entered" };
  }
  return next;
}
