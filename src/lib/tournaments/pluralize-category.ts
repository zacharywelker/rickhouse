// Words that are already plural or have no plural: left as they are. Everything else gets a regular English plural.
const UNCHANGED = new Set(["spirits", "liqueurs", "amari", "other", "others", "misc", "miscellaneous"]);

function pluralizeWord(word: string): string {
  if (UNCHANGED.has(word)) return word;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`; // brandy, whisky
  if (/(s|sh|ch|x|z)$/.test(word)) return `${word}es`; // scotch
  return `${word}s`; // bourbon, whiskey, gin
}

// The last word of a compound ("single malt scotch", "single-malt") is the noun.
const pluralizeLastWord = (part: string): string => part.replace(/[^\s-]+(?=\s*$)/, pluralizeWord);

/**
 * A category's name as the lowercase noun of "3 of 12 ...": its own spelling, singular for 1, otherwise plural.
 * A trailing parenthetical stays as it is ("Whiskey (Other)" -> "whiskeys (other)"), and "/" or "&" separate
 * alternatives that each pluralize ("Bourbon / Tennessee" -> "bourbons / tennessees").
 */
export function pluralizeCategory(name: string, count: number): string {
  const lower = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (count === 1) return lower;
  const [, head = lower, note = ""] = /^(.*?)(\s*\([^)]*\))?$/.exec(lower) ?? [];
  return head.split(/(\s*[/&]\s*)/).map((part, i) => (i % 2 ? part : pluralizeLastWord(part))).join("") + note;
}
