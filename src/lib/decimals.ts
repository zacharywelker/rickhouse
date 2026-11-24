/**
 * Keeps at most `places` digits after the first dot; anything else is left alone. Exponent form (1.25e2) is left
 * alone too: cutting it would change the number (to 1.25) or break it (1.5e), and the field still accepts it.
 */
export function capDecimals(value: string, places: number): string {
  if (/e/i.test(value)) return value;
  const dot = value.indexOf(".");
  return dot < 0 ? value : value.slice(0, dot + 1 + places);
}

/**
 * Pads a plain decimal to exactly `places` digits after the dot ("100" to
 * "100.00", ".5" to "0.50"). Empty and non-plain values (1e3, -5, ".") come
 * back unchanged.
 */
export function padDecimals(value: string, places: number): string {
  if (!/^\d*\.?\d*$/.test(value) || !/\d/.test(value)) return value;
  const [whole, frac = ""] = value.split(".");
  return `${whole || "0"}.${frac.padEnd(places, "0")}`;
}
