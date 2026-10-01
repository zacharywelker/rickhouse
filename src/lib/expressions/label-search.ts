/**
 * Finding a label from whatever someone types.
 *
 * People type a label the way it reads on the shelf — "Pursuit Double Oak",
 * "Buffalo Trace Bourbon" — which mixes the brand and the label's name in one
 * string. Matching that as one phrase fails as soon as the brand on file is
 * "Pursuit Spirits", so each word is matched on its own, against every field
 * that could have produced it, and the results are ranked by where the words
 * landed. Nothing tries to decide which words are the brand: that guess breaks
 * on Old Forester vs. Old Fitzgerald, and it isn't needed to find a match.
 *
 * Pure, so it runs the same on the server (the add-bottle search, the labels
 * list) and is tested without a database. A home collection's catalog is
 * hundreds or a few thousand labels, which is microseconds to scan.
 */
import { normalizeTtbId } from "@/lib/cola/ids";

export type LabelDoc = {
  id: number;
  brand: string;
  name: string;
  categoryId: number;
  category: string;
  /** The category and its ancestors, nearest first: Bourbon, American Whiskey, Whiskey. */
  categoryPath: Array<{ id: number; name: string }>;
  distilleries: string[];
  finishes: string[];
  upc: string | null;
  ttbIds: string[];
  proof: string | null;
  bottles: number;
};

/**
 * Where a result was found. A label is "yours by name" when every word matched
 * its brand, name or category; a label that needed its distillery to match
 * ("Buffalo Trace" finding Eagle Rare) is listed apart, below, so the brand's
 * own label is never buried under everything that brand's distillery made.
 */
export type HitGroup = "label" | "distillery";

export type LabelHit = {
  doc: LabelDoc;
  score: number;
  group: HitGroup;
  /** For the distillery group: the distillery that matched. */
  via: string | null;
  /** Found by its barcode or TTB ID rather than by words. */
  exact: boolean;
};

export type CategoryFacet = { id: number; name: string; count: number };

/** What a typed code turned out to be, so the page can say so (and prefill a new label's UPC). */
export type TypedCode = { kind: "upc"; value: string } | { kind: "ttb"; value: string } | null;

export type LabelSearchResult = {
  hits: LabelHit[];
  /** Categories among the matches, before the category filter, most common first. */
  facets: CategoryFacet[];
  /** How many labels matched in all, before the limit. */
  total: number;
  code: TypedCode;
};

// ---------------------------------------------------------------------------
// Words

/**
 * Lowercase, accents folded, apostrophes dropped ("Blanton's" -> "blantons"),
 * everything else that isn't a letter or digit is a word break.
 */
export function words(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "");
}

/**
 * A field's words plus each adjacent pair run together, so "E.H. Taylor"
 * answers "eh" and "Four Roses" answers "fourroses".
 */
function fieldTokens(text: string): string[] {
  const parts = words(text);
  const joined: string[] = [];
  for (let i = 0; i + 1 < parts.length; i++) joined.push(parts[i]! + parts[i + 1]!);
  return [...parts, ...joined];
}

/** Optimal string alignment distance, stopping early once it passes `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prevPrev: number[] = new Array(b.length + 1).fill(0);
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, prevPrev[j - 2]! + 1);
      cur.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    prevPrev.splice(0, prevPrev.length, ...prev);
    prev = cur;
  }
  return prev[b.length]!;
}

/** Typos allowed for a word of this length: none for short words, where one letter is a different word. */
function typoBudget(term: string): number {
  if (/^[0-9]+$/.test(term)) return 0;
  if (term.length >= 8) return 2;
  if (term.length >= 4) return 1;
  return 0;
}

/**
 * How well one typed word matches one word on file: whole word, the start of
 * a word (typing as you go, and "oak" for "Oaked"), or a near miss ("weler").
 */
function termQuality(term: string, token: string): number {
  if (term === token) return 1;
  if (token.startsWith(term)) return term.length >= 2 || token.length === 1 ? 0.85 : 0.5;
  const budget = typoBudget(term);
  if (budget === 0) return 0;
  if (editDistance(term, token, budget) <= budget) return 0.6;
  // A typo in a word still being typed: compare against the same-length start.
  if (token.length > term.length && editDistance(term, token.slice(0, term.length), Math.min(budget, 1)) <= 1) return 0.5;
  return 0;
}

// ---------------------------------------------------------------------------
// Matching

type FieldKind = "brand" | "name" | "category" | "distillery" | "finish";

/** Brand and name say what a label is; a category or finish narrows it; a distillery is where it came from. */
const WEIGHT: Record<FieldKind, number> = { brand: 3, name: 3, category: 1.5, finish: 1, distillery: 1 };

type IndexedDoc = {
  doc: LabelDoc;
  fields: Array<{ kind: FieldKind; text: string; tokens: string[] }>;
  /** Brand and name words, for how much of the label's own name the query covered. */
  ownWords: string[];
  /** Brand + name as one run of words, for the phrase bonus. */
  phrase: string;
};

function indexDoc(doc: LabelDoc): IndexedDoc {
  const fields: IndexedDoc["fields"] = [
    { kind: "brand", text: doc.brand, tokens: fieldTokens(doc.brand) },
    { kind: "name", text: doc.name, tokens: fieldTokens(doc.name) },
    ...doc.categoryPath.map((c) => ({ kind: "category" as const, text: c.name, tokens: fieldTokens(c.name) })),
    ...doc.distilleries.map((d) => ({ kind: "distillery" as const, text: d, tokens: fieldTokens(d) })),
    ...doc.finishes.map((f) => ({ kind: "finish" as const, text: f, tokens: fieldTokens(f) })),
  ];
  const ownWords = [...words(doc.brand), ...words(doc.name)];
  return { doc, fields, ownWords, phrase: ownWords.join(" ") };
}

type Scored = { score: number; group: HitGroup; via: string | null };

function scoreDoc(indexed: IndexedDoc, terms: string[], phrase: string): Scored | null {
  let score = 0;
  let via: string | null = null;
  let needsDistillery = false;
  const covered = new Set<string>();

  for (const term of terms) {
    // The best place this word landed, preferring the label's own fields on
    // a tie so "Buffalo Trace" credits the brand before the distillery.
    let best = 0;
    let bestKind: FieldKind | null = null;
    let bestField = "";
    let bestToken = "";
    for (const field of indexed.fields) {
      for (const token of field.tokens) {
        const quality = termQuality(term, token);
        if (quality === 0) continue;
        const value = quality * WEIGHT[field.kind];
        if (value > best) {
          best = value;
          bestKind = field.kind;
          bestField = field.text;
          bestToken = token;
        }
      }
    }
    if (bestKind === null) return null;
    score += best;
    if (bestKind === "brand" || bestKind === "name") covered.add(bestToken);
    if (bestKind === "distillery") {
      needsDistillery = true;
      via ??= bestField;
    }
  }

  // How much of the label's own name was asked for: "Buffalo Trace Bourbon"
  // is closer to "Buffalo Trace Bourbon" than to "Buffalo Trace Bourbon Cream".
  if (indexed.ownWords.length > 0) {
    const hit = indexed.ownWords.filter((word) => covered.has(word)).length;
    score += hit / indexed.ownWords.length;
  }
  // A word that is also the label's category says what kind of spirit is
  // wanted: "Buffalo Trace Bourbon" is the bourbon, not the Bourbon Cream.
  const categoryTokens = indexed.fields.filter((field) => field.kind === "category").flatMap((field) => field.tokens);
  if (terms.some((term) => categoryTokens.some((token) => termQuality(term, token) >= 0.85))) score += 1.5;
  // Typed in the order it reads, or the whole of it.
  if (phrase === indexed.phrase) score += 3;
  else if (phrase.length > 0 && indexed.phrase.includes(phrase)) score += 1;
  // Something already on the shelf is the likelier one being looked for.
  if (indexed.doc.bottles > 0) score += 0.25;

  return { score, group: needsDistillery ? "distillery" : "label", via: needsDistillery ? via : null };
}

/** A typed UPC (8 to 14 digits) or TTB ID / registry link, if that's what the query is. */
export function typedCode(query: string): TypedCode {
  const fromLink = /ttbid=/i.test(query) ? normalizeTtbId(query) : null;
  if (fromLink) return { kind: "ttb", value: fromLink };
  const digits = query.trim().replace(/[\s-]/g, "");
  if (!/^[0-9]{8,14}$/.test(digits)) return null;
  // Fourteen digits is a TTB ID, and also a valid GTIN-14; searchLabels tries both.
  return digits.length === 14 ? { kind: "ttb", value: digits } : { kind: "upc", value: digits };
}

function digitsOnly(value: string | null): string {
  return (value ?? "").replace(/[^0-9]/g, "");
}

/** Does the label sit in this category, or anywhere beneath it? */
function inCategory(doc: LabelDoc, categoryId: number): boolean {
  return doc.categoryPath.some((c) => c.id === categoryId);
}

export function searchLabels(
  docs: ReadonlyArray<LabelDoc>,
  query: string,
  options: { categoryId?: number | null; limit?: number } = {},
): LabelSearchResult {
  const limit = options.limit ?? 30;
  const categoryId = options.categoryId ?? null;
  const code = typedCode(query);

  let matched: LabelHit[];

  if (code) {
    // A scanned barcode or a pasted approval goes straight to its label. A
    // 14-digit number could be either, so both are tried.
    matched = docs
      .filter((doc) => {
        if (code.kind === "ttb" && doc.ttbIds.includes(code.value)) return true;
        const upc = digitsOnly(doc.upc);
        // Scanners differ on the leading zero of a UPC-A read as EAN-13.
        return upc !== "" && upc.replace(/^0+/, "") === code.value.replace(/^0+/, "");
      })
      .map((doc) => ({ doc, score: 100, group: "label" as const, via: null, exact: true }));
  } else {
    const terms = [...new Set(words(query))];
    if (terms.length === 0) {
      // Nothing typed: the newest labels first, as somewhere to start.
      matched = [...docs]
        .sort((a, b) => b.id - a.id)
        .map((doc) => ({ doc, score: 0, group: "label" as const, via: null, exact: false }));
    } else {
      const phrase = terms.join(" ");
      matched = [];
      for (const doc of docs) {
        const scored = scoreDoc(indexDoc(doc), terms, phrase);
        if (scored) matched.push({ doc, ...scored, exact: false });
      }
      matched.sort(
        (a, b) =>
          (a.group === b.group ? 0 : a.group === "label" ? -1 : 1) ||
          b.score - a.score ||
          a.doc.brand.localeCompare(b.doc.brand) ||
          a.doc.name.localeCompare(b.doc.name),
      );
    }
  }

  const counts = new Map<number, CategoryFacet>();
  for (const hit of matched) {
    const facet = counts.get(hit.doc.categoryId) ?? { id: hit.doc.categoryId, name: hit.doc.category, count: 0 };
    facet.count += 1;
    counts.set(hit.doc.categoryId, facet);
  }
  const facets = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const filtered = categoryId === null ? matched : matched.filter((hit) => inCategory(hit.doc, categoryId));
  return { hits: filtered.slice(0, limit), facets, total: filtered.length, code };
}

/** Every label id that matches, for the labels list (which keeps its own sort). */
export function matchingLabelIds(docs: ReadonlyArray<LabelDoc>, query: string): number[] {
  return searchLabels(docs, query, { limit: Number.POSITIVE_INFINITY }).hits.map((hit) => hit.doc.id);
}

// ---------------------------------------------------------------------------
// Starting a new label from the search

/**
 * Words a brand's name carries that nobody types: "Pursuit Spirits" is asked
 * for as "Pursuit". Only these may be left off the end of a brand when
 * recognising it, so "Old Overholt" is never mistaken for "Old Forester".
 */
const BRAND_FILLER = new Set([
  "spirits", "spirit", "distillery", "distilleries", "distillers", "distilling", "distilled", "company", "co",
  "inc", "llc", "ltd", "brands", "brand", "the", "and", "whiskey", "whisky", "bourbon", "rum", "tequila", "mezcal",
  "gin", "vodka", "beverage", "beverages", "craft", "works", "family", "estate", "estates",
]);

export type NewLabelGuess = {
  brandId: number | null;
  brandName: string | null;
  /** The rest of what was typed, as typed. */
  name: string;
  categoryId: number | null;
};

/**
 * Splits "Pursuit Double Oak Rye" into a brand already on file and the rest,
 * as an offer for a new label's fields. Brand words must lead, in order, and
 * cover the brand's name except for filler; the longest such brand wins.
 * With no brand recognised, the whole query is offered as the name.
 */
export function guessNewLabel(
  query: string,
  brands: ReadonlyArray<{ id: number; name: string }>,
  categories: ReadonlyArray<{ id: number; name: string }>,
): NewLabelGuess {
  const typed = query.trim().split(/\s+/).filter((word) => word !== "");
  const typedWords = typed.map((word) => words(word).join(""));

  let best: { id: number; name: string; consumed: number; length: number } | null = null;
  for (const brand of brands) {
    const brandWords = words(brand.name);
    if (brandWords.length === 0) continue;
    let i = 0;
    while (i < typedWords.length && i < brandWords.length && typedWords[i] !== "" && typedWords[i] === brandWords[i]) i++;
    if (i === 0) continue;
    if (!brandWords.slice(i).every((word) => BRAND_FILLER.has(word))) continue;
    // Something has to be left over to be the label's name.
    if (i >= typed.length) continue;
    if (!best || i > best.consumed || (i === best.consumed && brandWords.length < best.length)) {
      best = { id: brand.id, name: brand.name, consumed: i, length: brandWords.length };
    }
  }

  const nameWords = best ? typed.slice(best.consumed) : typed;
  const name = nameWords.join(" ");

  // A category named in what's left, longest name first ("Straight Rye" over "Rye").
  const restWords = nameWords.map((word) => words(word).join(""));
  let categoryId: number | null = null;
  let categoryLength = 0;
  for (const category of categories) {
    const target = words(category.name);
    if (target.length === 0 || target.length <= categoryLength) continue;
    for (let i = 0; i + target.length <= restWords.length; i++) {
      if (target.every((word, j) => restWords[i + j] === word)) {
        categoryId = category.id;
        categoryLength = target.length;
        break;
      }
    }
  }

  return { brandId: best?.id ?? null, brandName: best?.name ?? null, name, categoryId };
}
