/**
 * Suggestions from your own past entries for the bottle's free-text fields,
 * so "Seelbach's" is typed the same way on every pick and stays something a
 * search or filter can find. Pure, so the ranking is tested without a database.
 */
import { words } from "@/lib/expressions/label-search";

/** Free text that repeats across bottles. Pick names don't (each pick has its own), so they aren't here. */
export const SUGGESTED_BOTTLE_FIELDS = ["pickedBy", "warehouse", "rickFloor", "location"] as const;
export type SuggestedBottleField = (typeof SUGGESTED_BOTTLE_FIELDS)[number];
export type BottleSuggestions = Record<SuggestedBottleField, string[]>;

export const NO_SUGGESTIONS: BottleSuggestions = { pickedBy: [], warehouse: [], rickFloor: [], location: [] };

/** Spellings that differ only in case, accents, punctuation or spacing are one entry. */
function keyOf(value: string): string {
  return words(value).join(" ");
}

/**
 * Past values, most used first, with each set of near-identical spellings
 * folded into its most used one. `extra` (for Picked By, your stores' names)
 * follows, minus anything already there.
 */
export function rankSuggestions(
  rows: ReadonlyArray<{ value: string; count: number }>,
  extra: ReadonlyArray<string> = [],
  limit = 50,
): string[] {
  const byKey = new Map<string, { total: number; best: string; bestCount: number }>();
  for (const { value, count } of rows) {
    const trimmed = value.trim();
    const key = keyOf(trimmed);
    if (key === "") continue;
    const entry = byKey.get(key);
    if (!entry) {
      byKey.set(key, { total: count, best: trimmed, bestCount: count });
      continue;
    }
    entry.total += count;
    if (count > entry.bestCount || (count === entry.bestCount && trimmed.localeCompare(entry.best) < 0)) {
      entry.best = trimmed;
      entry.bestCount = count;
    }
  }
  const ranked = [...byKey.values()]
    .sort((a, b) => b.total - a.total || a.best.localeCompare(b.best))
    .map((entry) => entry.best);
  for (const value of extra) {
    const key = keyOf(value);
    if (key !== "" && !byKey.has(key)) {
      byKey.set(key, { total: 0, best: value, bestCount: 0 });
      ranked.push(value.trim());
    }
  }
  return ranked.slice(0, limit);
}

/** Adds what was just typed, so the next bottle of a haul offers it at once. */
export function withEntered(
  suggestions: BottleSuggestions,
  values: Record<string, unknown>,
): BottleSuggestions {
  const next = { ...suggestions };
  for (const field of SUGGESTED_BOTTLE_FIELDS) {
    const value = values[field];
    if (typeof value !== "string" || keyOf(value) === "") continue;
    if (next[field].some((existing) => keyOf(existing) === keyOf(value))) continue;
    next[field] = [value.trim(), ...next[field]];
  }
  return next;
}
