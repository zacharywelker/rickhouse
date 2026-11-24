/** Keeps at most `places` digits after the first dot; anything else is left alone. */
export function capDecimals(value: string, places: number): string {
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
