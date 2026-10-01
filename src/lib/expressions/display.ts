/**
 * How a label's age reads: the statement as printed when there is one,
 * otherwise the parts that are known ("4y 6m"), otherwise nothing.
 */
export function ageLabel(e: {
  ageStatement: string | null;
  ageYears: string | null;
  ageMonths: number | null;
  ageDays: number | null;
}): string | null {
  if (e.ageStatement) return e.ageStatement;
  const parts = [
    e.ageYears ? `${Number(e.ageYears)}y` : null,
    e.ageMonths ? `${e.ageMonths}m` : null,
    e.ageDays ? `${e.ageDays}d` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}
