import { isBandKey, type BandKey } from "./rules";

/** A comma-separated list of positive integers, each once, at most 50. Anything else in it is dropped. */
export function idList(raw: string | null): number[] {
  if (!raw) return [];
  const seen = new Set<number>();
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0) seen.add(n);
  }
  return [...seen].slice(0, 50);
}

/** A JSON array of positive integers, or [] for anything else. */
export function idArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((n): n is number => Number.isInteger(n) && n > 0))].slice(0, 500);
}

export function bandArray(value: unknown): BandKey[] {
  return Array.isArray(value) ? [...new Set(value.filter(isBandKey))] : [];
}

/** A JSON array of descriptor keys, at most 40, each at most 120 characters. */
export function keyArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 120))].slice(0, 40);
}
