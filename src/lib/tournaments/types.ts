/** One grain of a recipe: its name as typed, and its share in percent. */
export type Grain = { grain: string; percent: number };

/**
 * What the grouping knows about a label's mashbill. A recipe has grains (and a name when it is a secret one, such as
 * "Buffalo Trace High Rye"); a generic style ("High Rye") has none; a label with several mashbills is a blend.
 */
export type MashbillInput =
  | { kind: "recipe"; grains: Grain[]; name: string | null }
  | { kind: "generic"; style: string }
  | { kind: "blend" };

/** The five things flights can be matched on. */
export type GroupKey = "proof" | "mashbill" | "distillery" | "age" | "finish";

export const GROUP_KEYS: readonly GroupKey[] = ["proof", "mashbill", "distillery", "age", "finish"];

/** Proof first: bottles at different strengths are not a fair taste. */
export const DEFAULT_GROUP_ORDER: readonly GroupKey[] = GROUP_KEYS;

/** A competitor as the grouping sees it. `id` is the tournament entry's id, the last tie-break. */
export type Entrant = {
  id: number;
  name: string;
  proof: number | null;
  /** Null when the label has no mashbill recorded, or the spirit is not a whiskey. */
  mashbill: MashbillInput | null;
  /** Every distillery of the label. None is unknown; more than one is a blend. */
  distilleries: string[];
  ageYears: number | null;
  /** The label's finishes in listed order; the first is the one compared. */
  finishes: string[];
};

/** True when `order` holds each of the five keys exactly once. */
export function isGroupOrder(order: readonly string[]): order is GroupKey[] {
  return order.length === GROUP_KEYS.length && GROUP_KEYS.every((key) => order.includes(key));
}
