import { mashbillClass, mashbillDisplay } from "./grains";
import { distilleryNames } from "./keys";
import { pluralizeCategory } from "./pluralize-category";
import type { Entrant } from "./types";

/** The one value every item shares ignoring case (the first spelling), or null when any is missing, blank or different. */
export function shared(values: readonly (string | null)[]): string | null {
  const first = values[0];
  if (first === null || first === undefined || first.trim() === "") return null;
  return values.every((v) => v !== null && v.trim().toLowerCase() === first.trim().toLowerCase()) ? first.trim() : null;
}

// Wine-based finishes: fortified and sweet wines, wine itself, and the common grape and region names.
const WINE =
  /\b(wine|port|ruby|tawny|sherry|oloroso|px|pedro ximenez|fino|amontillado|palo cortado|cream|madeira|marsala|sauternes|tokaji|vermouth|cabernet|merlot|pinot|zinfandel|syrah|shiraz|malbec|bordeaux|burgundy|champagne|chardonnay|sauvignon|riesling|rioja)\b/i;

/** True when a finish's name is wine-based ("Port cask", "Oloroso sherry", "Cabernet barrel"). */
export const isWineFinish = (finish: string): boolean => WINE.test(finish);

const sentenceCase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A flight's automatic title from what its bottles share: an optional distillery in front (`Buffalo Trace · `), then
 * qualifiers (mashbill class, finish), then the category plural: "High rye, wine-finished bourbons". A lone bottle (a
 * bye) is named the same way in the singular. Without a shared category the qualifiers stand alone, else the shared
 * mashbill name, else the distillery, else "Mixed". Null for an empty flight. The proof band is not part of the title.
 */
export function autoLabel(heat: readonly Entrant[]): string | null {
  if (heat.length === 0) return null;
  const distillery = shared(
    heat.map((e) => {
      const names = distilleryNames(e);
      return names.length === 0 ? null : names.length > 1 ? "Blend" : names[0]!;
    }),
  );
  const category = shared(heat.map((e) => e.category));
  const classes = heat.map((e) => mashbillClass(e.mashbill));
  let klass = classes.every((c) => c !== null && c === classes[0]) ? classes[0]! : null;
  // A rye whiskey is rye by definition: only "Wheated" still says something.
  if (category !== null && /rye/i.test(category) && klass !== "Wheated") klass = null;
  const finished = heat.every((e) => e.finishes.some((f) => f.trim() !== ""));
  const finish = !finished ? null : heat.every((e) => e.finishes.some(isWineFinish)) ? "Wine-finished" : "Finished";

  const qualifiers = [klass, finish].filter((q): q is string => q !== null).map((q, i) => (i === 0 ? q : q.toLowerCase()));
  const lead = qualifiers.join(", ");
  let body: string | null;
  if (category !== null) body = `${lead} ${pluralizeCategory(category, heat.length)}`.trim();
  else if (lead !== "") body = lead;
  else body = shared(heat.map((e) => (e.mashbill === null ? null : mashbillDisplay(e.mashbill))));
  if (body === null) return distillery ?? "Mixed";
  body = sentenceCase(body);
  // A distillery already in the mashbill's own name ("Buffalo Trace High Rye") is not said twice.
  if (distillery === null || body.toLowerCase().includes(distillery.toLowerCase())) return body;
  return `${distillery} · ${body}`;
}
