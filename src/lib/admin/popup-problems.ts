/**
 * What a popup's footer says. A blocking problem disables Save; a non-blocking one is a warning
 * the shell ends with "It will still save." Every popup builds its own list and the shell draws it.
 */
export type Problem = {
  text: string;
  blocking: boolean;
  /** A link-style button after the text, such as "Use it". */
  action?: { label: string; onClick: () => void };
};

export function hasBlocking(problems: readonly Problem[]): boolean {
  return problems.some((problem) => problem.blocking);
}

/** Words that stay in capitals: age marks, grades, cask abbreviations. */
const KEEP_UPPER = new Set(["PX", "NAS", "XO", "VS", "VSOP", "USA", "UK", "IPA", "BIB", "II", "III", "IV"]);

/** A letter followed later in the word by a capital ("McKenna", "DeKuyper") was typed that way on purpose. */
const INTERNAL_CAPITAL = /[a-z][A-Z]/;

function titleWord(word: string): string {
  if (INTERNAL_CAPITAL.test(word)) return word;
  const upper = word.toUpperCase();
  if (KEEP_UPPER.has(upper)) return upper;
  return word
    .split("-")
    .map((part) => (part === "" ? part : part[0]!.toUpperCase() + part.slice(1).toLowerCase()))
    .join("-");
}

/** A name as it is stored: single spaces, each word capitalised. Used when the field loses focus. */
export function titleCase(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).map(titleWord).join(" ");
}
