/** Canonical style tags Rickhouse can infer from a mashbill's trailing name. */
export const MASHBILL_STYLES = ["Wheated", "Low Rye", "High Rye", "High Wheat", "Four Grain"] as const;
export type MashbillStyle = (typeof MASHBILL_STYLES)[number];

/**
 * Recognize an explicit trailing style, including parenthesized labels such as
 * "Buffalo Trace Mashbill #1 (Low Rye)". Other words in a name are ignored.
 */
export function inferMashbillStyle(name: string | null | undefined): MashbillStyle | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  for (const style of MASHBILL_STYLES) {
    const words = style.toLowerCase();
    const pattern = new RegExp(`(?:^|[\\s(])${words.replace(/ /g, "\\s+")}\\)?[.!]?$`, "i");
    if (pattern.test(normalized)) return style;
  }
  return null;
}
