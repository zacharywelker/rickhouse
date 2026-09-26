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
 * The age statement a designation implies, most specific first (SPEC #12).
 * Bottled-in-Bond (>= 4 years) is a stronger claim than Straight (>= 2), and
 * a bottle is never both NAS and one of the others. Used only to fill in a
 * blank statement — a real one, like Old Grand Dad's "7 Year", always wins.
 */
export function defaultAgeStatement(flags: { isStraight: boolean; isBottledInBond: boolean; isNas: boolean }): string {
  if (flags.isBottledInBond) return "Bottled-in-Bond (at least 4 years)";
  if (flags.isStraight) return "Straight (at least 2 years)";
  if (flags.isNas) return "NAS";
  return "";
}

/** Fields whose checkbox, when switched on, offers a default age statement. */
const AGE_DESIGNATION_FIELDS: ReadonlySet<string> = new Set(["isStraight", "isBottledInBond", "isNas"]);

/**
 * The age statement to fill in after `name` changed from `prev` to `next`, or
 * null to leave it alone. Turning on Straight, Bottled In Bond or NAS offers
 * the default, but only into a blank statement — Old Grand Dad 7 is
 * bottled-in-bond and still reads "7 Year", not the BiB default. Shared by the
 * label form and the bulk grid so the two never disagree.
 */
export function offeredAgeStatement(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  name: string,
): string | null {
  if (!AGE_DESIGNATION_FIELDS.has(name) || next[name] !== true) return null;
  if (String(prev.ageStatement ?? "").trim() !== "") return null;
  return defaultAgeStatement({
    isStraight: next.isStraight === true,
    isBottledInBond: next.isBottledInBond === true,
    isNas: next.isNas === true,
  });
}
