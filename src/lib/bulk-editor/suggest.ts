/**
 * What the Brand, Label and Category cells offer as you type, and what Tab and Enter do with it. Pure, so the rule that
 * matters most is testable on its own: **a typo never silently creates a brand or label.** A new one is made only by
 * choosing the visible *Create "…"* option with Enter. Tab takes an existing match and nothing else, and leaving a cell
 * does not create anything.
 */

export type Candidate = {
  /** The id it has in the database; null for one that so far exists only in this sheet (an unsaved row made it). */
  id: number | null;
  name: string;
  hint?: string;
};

export type Suggestion = Candidate & {
  /** Only close to what was typed (a slip, or different spacing or punctuation), not a match for it. */
  near: boolean;
};

export type Suggestions = {
  /** Matches first (by how well they match), then near misses. An exact match, if there is one, is first. */
  items: Suggestion[];
  /** The *Create "…"* option: offered when creating is allowed and nothing already has exactly this name. */
  create: { name: string } | null;
  /** Something already has exactly this name (any case): it is what Enter takes, and creating would only collide with it. */
  exact: Suggestion | null;
  /** "Did you mean …?", when nothing matches but something is close. */
  hint: string | null;
};

/** Lower case, no accents or punctuation, "&" as "and", one space between words. */
export function normalise(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const squish = (text: string) => normalise(text).replace(/ /g, "");

/** Edit distance where swapping two neighbours counts as one slip ("Singel" is one away from "Single"). */
export function distance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[rows - 1]![cols - 1]!;
}

/** How many slips still count as "close": none for very short text, where nearly everything would be. */
const slipsAllowed = (length: number) => (length <= 3 ? 0 : length <= 6 ? 1 : 2);

/** 0 for the best kind of match, up to 3, or null for no match. */
function matchTier(typed: string, candidate: string): number | null {
  const t = normalise(typed);
  const c = normalise(candidate);
  if (t === "") return 0;
  if (c.startsWith(t)) return 0;
  if (c.split(" ").some((word) => word.startsWith(t))) return 1;
  if (squish(candidate).startsWith(squish(typed))) return 1;
  if (c.includes(t)) return 2;
  return null;
}

/** How many slips away the candidate is (0 for the same words in other spacing), or null when it is not close. */
function nearness(typed: string, candidate: string): number | null {
  const t = squish(typed);
  const c = squish(candidate);
  if (t === "" || c === "") return null;
  // The same words in different spacing or punctuation: not a match for it, but certainly the same thing.
  if (t === c) return 0;
  const allowed = slipsAllowed(t.length);
  if (allowed === 0) return null;
  // Compared with the whole name, and with the same length of its start, since the text is usually unfinished.
  const slips = Math.min(distance(t, c), distance(t, c.slice(0, t.length)), distance(t, c.slice(0, t.length + 1)));
  return slips <= allowed ? slips : null;
}

/**
 * `cap` is the most the list shows once something is typed (exact and close matches together), so the Create option is
 * never more than that many arrow presses away. Nothing typed lists up to 50, as before.
 */
export function suggest(typed: string, candidates: ReadonlyArray<Candidate>, options: { allowCreate: boolean; limit?: number; cap?: number }): Suggestions {
  const text = typed.trim().replace(/\s+/g, " ");
  const limit = options.limit ?? (text === "" ? 50 : 8);
  const byName = (a: Candidate, b: Candidate) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

  const exact = text === "" ? null : (candidates.find((c) => c.name.trim().toLowerCase() === text.toLowerCase()) ?? null);

  const matched: Array<{ candidate: Candidate; tier: number }> = [];
  const near: Array<{ candidate: Candidate; slips: number }> = [];
  for (const candidate of candidates) {
    if (candidate === exact) continue;
    const tier = matchTier(text, candidate.name);
    if (tier !== null) matched.push({ candidate, tier });
    else if (text !== "") {
      const slips = nearness(text, candidate.name);
      if (slips !== null) near.push({ candidate, slips });
    }
  }
  matched.sort((a, b) => a.tier - b.tier || byName(a.candidate, b.candidate));
  // The closest first, since the first is what Tab and Enter take: "Brand 33" is nearer "Brand 3" than "Brand 0".
  near.sort((a, b) => a.slips - b.slips || byName(a.candidate, b.candidate));

  const exactSuggestion: Suggestion | null = exact ? { ...exact, near: false } : null;
  const items: Suggestion[] = [
    ...(exactSuggestion ? [exactSuggestion] : []),
    ...matched.slice(0, limit).map(({ candidate }) => ({ ...candidate, near: false })),
    ...near.slice(0, 3).map(({ candidate }) => ({ ...candidate, near: true })),
  ].slice(0, text === "" ? undefined : options.cap);
  const create = options.allowCreate && text !== "" && !exact ? { name: text } : null;
  const hint = !exact && matched.length === 0 && near.length > 0 ? `Did you mean ${near[0]!.candidate.name}?` : null;
  return { items, create, exact: exactSuggestion, hint };
}

/** What is highlighted when the list opens or the text changes: the first existing match, else Create, else nothing. */
export type Highlight = { kind: "item"; index: number } | { kind: "create" } | null;
export function defaultHighlight(suggestions: Suggestions): Highlight {
  if (suggestions.items.length > 0) return { kind: "item", index: 0 };
  return suggestions.create ? { kind: "create" } : null;
}

/** Moves the highlight through the items and then the Create option, stopping at the ends. */
export function moveHighlight(suggestions: Suggestions, from: Highlight, step: 1 | -1): Highlight {
  const slots = suggestions.items.length + (suggestions.create ? 1 : 0);
  if (slots === 0) return null;
  const at = from === null ? (step === 1 ? -1 : slots) : from.kind === "create" ? suggestions.items.length : from.index;
  const next = Math.max(0, Math.min(slots - 1, at + step));
  return next < suggestions.items.length ? { kind: "item", index: next } : { kind: "create" };
}

export type KeyOutcome =
  | { accept: Suggestion }
  | { create: string }
  /** Nothing is chosen, and the cell stays open saying why. */
  | { block: string };

/**
 * What Enter, Tab and Ctrl+Enter do with the highlight. Enter takes the highlighted match, or creates when Create is highlighted.
 * **Tab takes an existing match only**: with Create highlighted it blocks, so a Tab at the end of a row never makes a
 * brand or label by accident. With nothing highlighted either one blocks, and what was typed is never dropped silently.
 */
export function resolveKey(key: "Enter" | "Tab" | "CreateNow", suggestions: Suggestions, highlight: Highlight, what: string): KeyOutcome {
  // Ctrl+Enter makes what was typed whatever is highlighted, since a close match is often not what was meant. When
  // creating is not allowed, or something already has exactly this name, it is an ordinary Enter.
  if (key === "CreateNow") {
    if (suggestions.create) return { create: suggestions.create.name };
    key = "Enter";
  }
  if (highlight?.kind === "item") {
    const item = suggestions.items[highlight.index];
    if (item) return { accept: item };
  }
  if (highlight?.kind === "create" && suggestions.create) {
    if (key === "Enter") return { create: suggestions.create.name };
    return { block: `Press Enter to create "${suggestions.create.name}", or keep typing to pick an existing ${what}.` };
  }
  return { block: `Choose a ${what} from the list.` };
}
