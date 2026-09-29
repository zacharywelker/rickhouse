/**
 * Turns a COLA into suggestions for a new label's form (SPEC M11). Only
 * suggestions: they are reviewed on the form before anything is saved.
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
      if (/\d/.test(part) || KEEP_UPPER.has(part)) return part;
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
 * The seeded category a TTB class/type belongs in, by slug. Keyed on the
 * description rather than the numeric code, which the registry does not show
 * on the record page and which TTB has renumbered before. The first match
 * wins, so specific rules come before the catch-alls. Null when nothing fits.
 */
const CATEGORY_RULES: ReadonlyArray<{ test: RegExp; slug: string }> = [
  { test: /\bBOURBON\b/, slug: "bourbon" },
  { test: /\bSCOTCH\b/, slug: "scotch" },
  { test: /\bIRISH\b/, slug: "irish-whiskey" },
  { test: /\bRYE\b/, slug: "rye" },
  { test: /\bWHEAT\b/, slug: "wheat-whiskey" },
  { test: /\bLIGHT WHISK/, slug: "light-whiskey" },
  { test: /\bMALT WHISK/, slug: "american-single-malt" },
  { test: /\bRUM\b|\bCACHACA\b/, slug: "rum" },
  { test: /\bTEQUILA\b|\bMEZCAL\b|\bAGAVE\b/, slug: "agave" },
  { test: /\bBRANDY\b|\bCOGNAC\b|\bARMAGNAC\b|\bCALVADOS\b|\bPISCO\b|\bGRAPPA\b/, slug: "brandy" },
  { test: /\bWHISK(E)?Y\b/, slug: "whiskey" },
];

/** From the form's "source of product" when known, else a guess from the origin's name. */
function isUsOrigin(origin: string | null, isImported: boolean | null): boolean {
  if (isImported !== null) return !isImported;
  return origin !== null && !/SCOTLAND|IRELAND|CANADA|JAPAN|MEXICO|FRANCE|ENGLAND|UNITED KINGDOM/i.test(origin);
}

export function categorySlugFor(classType: string | null, origin: string | null, isImported: boolean | null): string | null {
  if (!classType) return null;
  const upper = classType.toUpperCase();
  for (const rule of CATEGORY_RULES) {
    if (!rule.test.test(upper)) continue;
    // A malt whisky is only American single malt when it is American.
    if (rule.slug === "american-single-malt" && !isUsOrigin(origin, isImported)) return "whiskey";
    // A plain whisky from the US has a closer home than the top level.
    if (rule.slug === "whiskey" && isUsOrigin(origin, isImported)) return "american-whiskey";
    return rule.slug;
  }
  return null;
}

export type LabelSuggestion = {
  brandName: string | null;
  name: string | null;
  categorySlug: string | null;
};

export function suggestLabel(record: {
  brandName: string | null;
  fancifulName: string | null;
  classType: string | null;
  origin: string | null;
  isImported: boolean | null;
}): LabelSuggestion {
  const brandName = record.brandName ? registryCase(record.brandName) : null;
  // A COLA without a fanciful name is usually the brand's flagship; the class
  // ("Straight Rye Whisky") is the closest thing to a product name it has.
  const name = record.fancifulName
    ? registryCase(record.fancifulName)
    : record.classType
      ? registryCase(record.classType)
      : null;
  return {
    brandName,
    name,
    categorySlug: categorySlugFor(record.classType, record.origin, record.isImported),
  };
}
