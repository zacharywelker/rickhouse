/**
 * What a vintage uses where its own box is blank: the label's proof, age and MSRP. Said next to the vintages
 * editor so a blank box is not a mystery (a copy would go stale the day the label changes, so nothing is copied).
 * `money` formats a price with the owner's currency.
 */
export function vintageDefaultsNote(label: Record<string, unknown>, money: (value: string) => string): string | null {
  const text = (name: string) => (label[name] === null || label[name] === undefined ? "" : String(label[name]).trim());
  const parts: string[] = [];
  if (text("proof") !== "") parts.push(`${Number(text("proof"))} proof`);
  const age = [["ageYears", "year"], ["ageMonths", "month"], ["ageDays", "day"]]
    .flatMap(([name, unit]) => (text(name!) !== "" && Number(text(name!)) > 0 ? [`${Number(text(name!))} ${unit}${Number(text(name!)) === 1 ? "" : "s"}`] : []))
    .join(" ");
  if (label.isNas === true || label.isNas === "true") parts.push("NAS");
  else if (age !== "") parts.push(age);
  else if (text("ageStatement") !== "") parts.push(text("ageStatement"));
  if (text("msrp") !== "") parts.push(`${money(text("msrp"))} MSRP`);
  return parts.length > 0 ? `A blank box uses the label's: ${parts.join(" · ")}.` : null;
}
