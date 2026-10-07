import { agaveWheel } from "./agave";
import { bourbonWheel } from "./bourbon";
import { brandyWheel } from "./brandy";
import { ginWheel } from "./gin";
import { rumWheel } from "./rum";
import type { Wheel, WheelId } from "./types";
import { whiskyWheel } from "./whisky";
import { WHEEL_IDS } from "./types";

export { WHEEL_IDS };
export type { Wheel, WheelCategory, WheelGroup, WheelId } from "./types";

/**
 * The flavor wheels a tasting's descriptors come from, one per spirit family (two for whiskey). Vodka, liqueur
 * and other have none yet, so a tasting of those has free text only. Sources and permissions: CREDITS.md.
 */
export const WHEELS: Record<WheelId, Wheel> = {
  bourbon: bourbonWheel,
  whisky: whiskyWheel,
  rum: rumWheel,
  agave: agaveWheel,
  brandy: brandyWheel,
  gin: ginWheel,
};

/** Lowercase, accents and apostrophes dropped, anything else a hyphen: "Oak (fresh)" is "oak-fresh". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "bourbon/fruity/citrus/lemon": the wheel, the category, the subcategory when there is one, and the word. */
export function descriptorKey(wheel: WheelId, category: string, group: string | null, descriptor: string): string {
  return [wheel, slugify(category), group === null ? null : slugify(group), slugify(descriptor)].filter((p) => p !== null).join("/");
}

export type Descriptor = { key: string; label: string; category: string; group: string | null };

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Every descriptor of a wheel, flat, with the key a tasting stores. */
export function descriptorsOf(wheel: Wheel): Descriptor[] {
  return wheel.categories.flatMap((category) =>
    category.groups.flatMap((group) =>
      group.descriptors.map((word) => ({
        key: descriptorKey(wheel.id, category.name, group.name, word),
        label: sentenceCase(word),
        category: category.name,
        group: group.name,
      })),
    ),
  );
}

let index: Map<string, Descriptor> | null = null;

/** The descriptor a stored key names, or null if no wheel has it (a word since removed from its wheel, say). */
export function findDescriptor(key: string): Descriptor | null {
  if (index === null) {
    index = new Map();
    for (const id of WHEEL_IDS) for (const descriptor of descriptorsOf(WHEELS[id])) index.set(descriptor.key, descriptor);
  }
  return index.get(key) ?? null;
}

/**
 * Which wheel a label's category uses. `slugs` is the category's own slug followed by its ancestors'. Rum, agave,
 * brandy and gin have their own; whiskey uses the Bourbon wheel for American whiskey (Bourbon, Rye, Wheat,
 * American single malt, Light and the rest) and the Whisky wheel for every other whiskey. Null when the family
 * has no wheel yet.
 */
export function wheelForCategory(category: { fieldGroup: string; slugs: string[] }): WheelId | null {
  switch (category.fieldGroup) {
    case "whiskey":
      return category.slugs.includes("american-whiskey") ? "bourbon" : "whisky";
    case "rum":
    case "agave":
    case "brandy":
    case "gin":
      return category.fieldGroup;
    default:
      return null;
  }
}

/**
 * The wheel for every category in a list, walking up each one's parents for the slugs `wheelForCategory` needs.
 * A parent loop (which the tree should never have) ends the walk instead of hanging.
 */
export function categoryWheelMap(rows: { id: number; slug: string; parentId: number | null; fieldGroup: string }[]): Map<number, WheelId | null> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return new Map(
    rows.map((row) => {
      const slugs: string[] = [];
      for (let at: (typeof rows)[number] | undefined = row; at !== undefined && slugs.length < 10; at = at.parentId === null ? undefined : byId.get(at.parentId)) {
        slugs.push(at.slug);
      }
      return [row.id, wheelForCategory({ fieldGroup: row.fieldGroup, slugs })] as const;
    }),
  );
}

/** The keys that are not descriptors of this wheel; with no wheel, every key. */
export function unknownTags(wheel: WheelId | null, tags: string[]): string[] {
  return tags.filter((tag) => wheel === null || !tag.startsWith(`${wheel}/`) || findDescriptor(tag) === null);
}

/** A wheel as the API sends it: categories, then subcategories, then descriptors with their keys. */
export function wheelForApi(wheel: Wheel) {
  return {
    id: wheel.id,
    name: wheel.name,
    credit: wheel.credit,
    categories: wheel.categories.map((category) => ({
      name: category.name,
      groups: category.groups.map((group) => ({
        name: group.name,
        descriptors: group.descriptors.map((word) => ({
          key: descriptorKey(wheel.id, category.name, group.name, word),
          label: sentenceCase(word),
        })),
      })),
    })),
  };
}
