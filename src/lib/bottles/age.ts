/**
 * Age from a fill date and a bottling date (SPEC M8).
 *
 * Pure, and deliberately calendar-aware rather than dividing days by 365.25:
 * "12 years and 2 months" is what a label says, and a bottle filled on a leap
 * day should not come out as 11.99 years.
 */
export type Age = { years: number; months: number; days: number };

/** Null when either date is missing, unparseable, or bottled before filled. */
export function ageBetween(filled: string, bottled: string): Age | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filled) || !/^\d{4}-\d{2}-\d{2}$/.test(bottled)) return null;

  const from = new Date(`${filled}T00:00:00Z`);
  const to = new Date(`${bottled}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (to < from) return null;
  // Date rolls 2020-13-01 over into 2021; reject it rather than accept a date
  // that is not the one the caller typed.
  if (from.toISOString().slice(0, 10) !== filled || to.toISOString().slice(0, 10) !== bottled) return null;

  /*
   * Add whole months to `from`, clamping the day to the end of the target
   * month — the same rule a person uses. From 31 January, "one month later" is
   * 29 February in a leap year, so 1 March is one month and one day. Plain
   * borrowing gets this wrong and can even go negative.
   */
  const anchor = (months: number) => {
    const year = from.getUTCFullYear() + Math.floor((from.getUTCMonth() + months) / 12);
    const month = ((from.getUTCMonth() + months) % 12 + 12) % 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(from.getUTCDate(), lastDay)));
  };

  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (anchor(months) > to) months -= 1;

  const days = Math.round((to.getTime() - anchor(months).getTime()) / 86_400_000);
  return { years: Math.floor(months / 12), months: months % 12, days };
}

/** "12 Year" / "12 Year 4 Month" — the shape an age statement usually takes. */
export function describeAge(age: Age): string {
  const parts: string[] = [];
  if (age.years > 0) parts.push(`${age.years} Year`);
  if (age.months > 0) parts.push(`${age.months} Month`);
  if (parts.length === 0) parts.push(`${age.days} Day`);
  return parts.join(" ");
}

/**
 * The age statement a designation implies (SPEC #12). Used only to fill in a
 * blank statement — a real one, like Old Grand Dad's "7 Year", always wins.
 * Straight and Bottled In Bond have no statement of their own: they imply a
 * number of years instead (see `impliedYears`).
 */
export function defaultAgeStatement(flags: { isNas: boolean }): string {
  return flags.isNas ? "NAS" : "";
}

const blank = (value: unknown) => String(value ?? "").trim() === "";

/** Whether any of years, months or days has something in it. */
export function ageFilled(values: Record<string, unknown>): boolean {
  return !(blank(values.ageYears) && blank(values.ageMonths) && blank(values.ageDays));
}

/**
 * Years a whiskey is at least. Bottled In Bond is 4. Straight is 2, or 4 when
 * it also carries no age statement (a straight whiskey younger than 4 years has
 * to say so). Blank when it is neither.
 */
export function impliedYears(flags: { isStraight: boolean; isNas: boolean; isBottledInBond?: boolean }): string {
  if (flags.isBottledInBond) return "4";
  if (!flags.isStraight) return "";
  return flags.isNas ? "4" : "2";
}

const IMPLYING_FIELDS: ReadonlySet<string> = new Set(["isStraight", "isNas", "isBottledInBond"]);
const implying = (values: Record<string, unknown>) => ({
  isStraight: values.isStraight === true,
  isNas: values.isNas === true,
  isBottledInBond: values.isBottledInBond === true,
});

/**
 * Switching Straight, NAS or Bottled In Bond fills in the age, but only over a blank age or the
 * number the previous ticks produced — anything typed is left exactly as it
 * is. Returns `next`, with the years changed when they should be.
 */
export function withImpliedAge<T extends Record<string, unknown>>(prev: T, next: T, name: string): T {
  if (!IMPLYING_FIELDS.has(name) || prev[name] === next[name]) return next;
  const was = impliedYears(implying(prev));
  const years = String(prev.ageYears ?? "").trim();
  if (!blank(prev.ageMonths) || !blank(prev.ageDays) || (years !== "" && years !== was)) return next;
  return { ...next, ageYears: impliedYears(implying(next)) };
}

/** Fields whose checkbox, when switched on, offers a default age statement. */
const AGE_DESIGNATION_FIELDS: ReadonlySet<string> = new Set(["isNas"]);

const designations = (values: Record<string, unknown>) => ({ isNas: values.isNas === true });

/**
 * The age statement to fill in after `name` changed from `prev` to `next`, or
 * null to leave it alone. Switching NAS on or off offers the
 * default, but only over a blank statement or the default the previous ticks
 * produced — so unticking takes the text back out, while Old Grand Dad 7 is
 * bottled-in-bond and still reads "7 Year". Nothing is offered once an age is
 * filled in: the statement is greyed out then. Shared by the label form and
 * the bulk grid so the two never disagree.
 */
export function offeredAgeStatement(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  name: string,
): string | null {
  if (!AGE_DESIGNATION_FIELDS.has(name) || prev[name] === next[name] || ageFilled(next)) return null;
  const current = String(prev.ageStatement ?? "").trim();
  if (current !== "" && current !== defaultAgeStatement(designations(prev))) return null;
  const offered = defaultAgeStatement(designations(next));
  return offered === current ? null : offered;
}

/** One label field changed: the age Straight implies, then the statement a designation offers. */
export function withAgeDefaults<T extends Record<string, unknown>>(prev: T, next: T, name: string): T {
  const aged = withImpliedAge(prev, next, name);
  const offered = offeredAgeStatement(prev, aged, name);
  return offered === null ? aged : { ...aged, ageStatement: offered };
}
