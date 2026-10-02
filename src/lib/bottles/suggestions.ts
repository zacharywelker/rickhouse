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

/**
 * Spellings that differ only in case, accents, punctuation or spacing are one
 * entry, and "&" reads as "and": "Total Wine & More" is "Total Wine and More".
 */
function keyOf(value: string): string {
  return words(value.replace(/&/g, " and ")).join(" ");
}

/** Small words a title leaves lowercase after its first word: "Total Wine and More". */
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "de", "del", "for", "in", "la", "of", "on", "or", "the", "to", "with",
]);

/**
 * Is this written in Title Case? Every word starts with a capital, except
 * small words after the first; numbers ("5th", "1920") and symbols ("&")
 * don't count either way. A long word in all capitals is shouting, not a
 * title ("SEELBACH'S"); a short one is an acronym ("BBC", "K&L").
 */
export function isTitleCased(value: string): boolean {
  let sawWord = false;
  for (const [i, token] of value.trim().split(/\s+/).entries()) {
    const letters = token.replace(/[^\p{L}]/gu, "");
    if (letters === "" || /^\p{N}/u.test(token)) continue;
    sawWord = true;
    if (i > 0 && letters === letters.toLowerCase() && MINOR_WORDS.has(letters)) continue;
    const first = letters[0]!;
    if (first === first.toLowerCase() || first !== first.toUpperCase()) return false;
    if (letters.length > 4 && letters === letters.toUpperCase()) return false;
  }
  return sawWord;
}

type Spelling = { text: string; count: number; title: boolean };

/** The spelling a group shows: Title Case first, then the most used, then alphabetical. */
function better(a: Spelling, b: Spelling): boolean {
  if (a.title !== b.title) return a.title;
  if (a.count !== b.count) return a.count > b.count;
  return a.text.localeCompare(b.text) < 0;
}

/**
 * Past values, most used first, with each set of near-identical spellings
 * folded into one: the Title Cased one when there is one, otherwise the most
 * used. `extra` (for Picked By, your stores' names) is a candidate spelling
 * for a group it matches, and otherwise follows the past values.
 */
export function rankSuggestions(
  rows: ReadonlyArray<{ value: string; count: number }>,
  extra: ReadonlyArray<string> = [],
  limit = 50,
): string[] {
  const byKey = new Map<string, { total: number; best: Spelling }>();
  const consider = (value: string, count: number): boolean => {
    const text = value.trim();
    const key = keyOf(text);
    if (key === "") return false;
    const spelling: Spelling = { text, count, title: isTitleCased(text) };
    const entry = byKey.get(key);
    if (!entry) {
      byKey.set(key, { total: count, best: spelling });
      return true;
    }
    entry.total += count;
    // The same spelling seen twice (it can't from the database, but can from
    // extras) counts once as a candidate, with its uses added up.
    if (entry.best.text === text) entry.best = { ...entry.best, count: entry.best.count + count };
    else if (better(spelling, entry.best)) entry.best = spelling;
    return true;
  };

  for (const { value, count } of rows) consider(value, count);
  const ranked = [...byKey.values()].sort((a, b) => b.total - a.total || a.best.text.localeCompare(b.best.text));
  // Stores join as spellings (a store's tidy name can win its group), and the
  // ones nobody has typed yet follow the past values.
  const fresh: string[] = [];
  for (const value of extra) {
    const known = byKey.has(keyOf(value));
    if (consider(value, 0) && !known) fresh.push(keyOf(value));
  }
  const result = [...ranked.map((entry) => entry.best.text), ...fresh.map((key) => byKey.get(key)!.best.text)];
  return result.slice(0, limit);
}
