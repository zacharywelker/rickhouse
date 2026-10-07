export const WHEEL_IDS = ["bourbon", "whisky", "rum", "agave", "brandy", "gin"] as const;
export type WheelId = (typeof WHEEL_IDS)[number];

/** A set of descriptors under a subcategory. `name` is null for a wheel that has no middle ring. */
export type WheelGroup = { name: string | null; descriptors: string[] };

export type WheelCategory = { name: string; groups: WheelGroup[] };

export type Wheel = {
  id: WheelId;
  name: string;
  /** The credit line for the wheel; the owners and permission status are tracked in CREDITS.md. */
  credit: string;
  categories: WheelCategory[];
};
