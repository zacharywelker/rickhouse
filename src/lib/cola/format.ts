/**
 * Display helpers for COLA records (SPEC M11).
 */

/** Tokens the registry's capitals should keep: age marks, grades, numerals. */
const KEEP_UPPER = new Set(["YO", "YR", "YRS", "BIB", "VS", "VSOP", "XO", "XXO", "NAS", "USA", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII"]);
const KEEP_LOWER = new Set(["a", "an", "and", "at", "by", "de", "del", "for", "in", "of", "on", "or", "the", "to"]);

/**
 * The registry files everything in capitals: "OLD POTRERO" → "Old Potrero",
 * "6 YO" → "6 YO", "18TH CENTURY" → "18th Century", "HOTALING'S" →
 * "Hotaling's". Text that already has lower case letters was typed that way
 * on purpose and is left alone.
 */
export function registryCase(text: string): string {
  if (/[a-z]/.test(text)) return text;
  return text
    .split(/(\s+|-|\/)/)
    .map((part, index) => {
      if (!/[A-Z]/.test(part)) return part;
      // Ordinals read "18th"; anything else with a digit ("6YO", "B524") stays as filed.
      if (/^\d+(ST|ND|RD|TH)$/.test(part)) return part.toLowerCase();
      // Compared without punctuation, so "(BIB)" stays "(BIB)".
      if (/\d/.test(part) || KEEP_UPPER.has(part.replace(/[^A-Z]/g, ""))) return part;
      const lower = part.toLowerCase();
      if (index > 0 && KEEP_LOWER.has(lower)) return lower;
      // Capitalise the first letter, and one after an apostrophe mid-word
      // ("O'BRIEN" → "O'Brien", but "HOTALING'S" → "Hotaling's"). "MC" and
      // "MAC" are too ambiguous to guess, so they get plain title case.
      return lower
        .replace(/^(\p{L})/u, (letter) => letter.toUpperCase())
        .replace(/(['’])(\p{L})(?=\p{L})/u, (_match, quote: string, letter: string) => quote + letter.toUpperCase());
    })
    .join("");
}

/**
 * The registry searches at most 15 years of approvals at once. Window 0 is
 * the latest 15 years; window 1 the 15 before that, and so on. Images exist
 * from 1999, so two windows cover everything worth attaching.
 */
export function searchWindow(index: number, now: Date): { from: Date; to: Date; label: string } {
  const to = new Date(Date.UTC(now.getUTCFullYear() - 15 * index, now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(Date.UTC(to.getUTCFullYear() - 15, to.getUTCMonth(), to.getUTCDate() + 1));
  return { from, to, label: `${from.getUTCFullYear()}–${to.getUTCFullYear()}` };
}

function words(text: string | null): string[] {
  return (text ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * How well a result's fanciful name fits the label's name: 2 for the same
 * words, 1 for any word in common, 0 for none. "6 YO" and "6 Years Old"
 * share "6"; "Single Barrel Reserve" and "Single Barrel" share two words.
 */
export function nameMatch(labelName: string, fancifulName: string | null): number {
  const label = words(labelName);
  const fanciful = words(fancifulName);
  if (label.length === 0 || fanciful.length === 0) return 0;
  if (label.join(" ") === fanciful.join(" ")) return 2;
  return fanciful.some((word) => label.includes(word)) ? 1 : 0;
}

/** Best name match first, then newest first. */
export function rankResults<T extends { fancifulName: string | null; completedOn: string | null }>(
  rows: readonly T[],
  labelName: string,
): (T & { match: number })[] {
  return rows
    .map((row) => ({ ...row, match: nameMatch(labelName, row.fancifulName) }))
    .sort((a, b) => b.match - a.match || (b.completedOn ?? "").localeCompare(a.completedOn ?? ""));
}
