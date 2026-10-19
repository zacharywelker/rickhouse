import type { MashbillInput } from "./types";

/** A sort key part: numbers and strings, compared left to right. Every index holds one type across all keys. */
export type Comparable = readonly (number | string)[];

/** A grain must hold at least this many points to define a mashbill's style. A smaller share is too minor. */
export const FLAVORING_MIN = 10;
/** Shares are compared in bands this many points wide, so 21% and 20% rye count as the same. */
export const SHARE_BAND = 5;
/** With no flavoring grain, a recipe this malted-barley-heavy is a malt whiskey. */
const MALT_CLASS_MIN = 51;

const UNKNOWN = Number.POSITIVE_INFINITY;
const band = (share: number): number => Math.floor(share / SHARE_BAND);

/** Free text as a lookup key: trimmed, lowercase, runs of whitespace collapsed. */
const normalize = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, " ");

/** Which family a grain name belongs to. Names are free text, so match on the words; any other name is its own family. */
export function grainFamily(name: string): string {
  const n = normalize(name);
  if (/\bcorn\b/.test(n)) return "corn";
  if (n.includes("wheat")) return "wheat";
  if (n.includes("rye")) return "rye";
  if (n.includes("barley") || n === "malt") return "malt";
  return n;
}

/** Where a generic style sits when it names no grains: its typical flavoring grain and share. Judgment calls; tune here. */
const GENERIC: Record<string, { family: string; share: number } | "four grain"> = {
  "low rye": { family: "rye", share: 12 },
  "high rye": { family: "rye", share: 27 },
  wheated: { family: "wheat", share: 15 },
  "high wheat": { family: "wheat", share: 30 },
  "four grain": "four grain",
};

/** A recipe's share per grain family, summed over its grains (a grain whose percent is not a number is dropped). */
function familyShares(grains: readonly { grain: string; percent: number }[]): Map<string, number> {
  const shares = new Map<string, number>();
  for (const { grain, percent } of grains) {
    if (!Number.isFinite(percent)) continue;
    const family = grainFamily(grain);
    shares.set(family, (shares.get(family) ?? 0) + percent);
  }
  return shares;
}

/** A rye share at or above this is a high rye; at or below `LOW_RYE_MAX` a low rye; in between has no name. */
export const HIGH_RYE_MIN = 20;
export const LOW_RYE_MAX = 12;

export type MashbillClass = "High rye" | "Low rye" | "Wheated";

/**
 * The name a bourbon-style mashbill goes by, for flight titles: "High rye" (rye share of 20 or more), "Wheated" (wheat is
 * the flavoring grain: at least 10 points and no rye flavoring), "Low rye" (rye share of 12 or less); null for anything
 * else (13 to 19 rye, a blend, a recipe with no grains, an unknown style). A generic style maps by its name.
 */
export function mashbillClass(mashbill: MashbillInput | null): MashbillClass | null {
  if (mashbill === null || mashbill.kind === "blend") return null;
  let rye: number;
  let wheat: number;
  if (mashbill.kind === "generic") {
    const style = normalize(mashbill.style);
    const typical = Object.hasOwn(GENERIC, style) ? GENERIC[style]! : undefined;
    if (typical === undefined || typical === "four grain") return null;
    rye = typical.family === "rye" ? typical.share : 0;
    wheat = typical.family === "wheat" ? typical.share : 0;
  } else {
    const shares = familyShares(mashbill.grains);
    if (shares.size === 0) return null;
    rye = shares.get("rye") ?? 0;
    wheat = shares.get("wheat") ?? 0;
  }
  if (rye >= HIGH_RYE_MIN) return "High rye";
  if (wheat >= FLAVORING_MIN && rye < FLAVORING_MIN) return "Wheated";
  if (rye <= LOW_RYE_MAX) return "Low rye";
  return null;
}

// Class kinds, in sort order.
const CORN = 0;
const ONE = 1;
const MANY = 2;
const MALT = 3;
const BLEND = 4;

/**
 * A mashbill as a sort key: a class (corn-dominant, one flavoring grain, several, malt, blend) then the flavoring
 * grains' shares and the malted barley share, each in bands of 5 points. `exact` holds the same without banding, for
 * tie-breaks. Null when there is nothing to compare. A share the data does not give sorts after every known one.
 */
export function mashbillKey(mashbill: MashbillInput | null): { band: Comparable; exact: Comparable } | null {
  if (mashbill === null) return null;
  if (mashbill.kind === "blend") return { band: [BLEND], exact: [BLEND] };

  if (mashbill.kind === "generic") {
    const style = normalize(mashbill.style);
    if (!Object.hasOwn(GENERIC, style)) return null;
    const typical = GENERIC[style]!;
    if (typical === "four grain") {
      const unknown = [MANY, "2rye+wheat", UNKNOWN, UNKNOWN, UNKNOWN];
      return { band: unknown, exact: unknown };
    }
    return { band: [ONE, typical.family, band(typical.share), UNKNOWN], exact: [ONE, typical.family, typical.share, UNKNOWN] };
  }

  // A recipe with no grains says nothing to compare.
  if (mashbill.grains.length === 0) return null;

  // A grain whose percent is not a finite number says nothing; drop it rather than let a NaN break the sort.
  const grains = mashbill.grains.filter((g) => Number.isFinite(g.percent));
  if (grains.length === 0) return null;

  const shares = familyShares(grains);
  const corn = shares.get("corn") ?? 0;
  const malt = shares.get("malt") ?? 0;
  const flavoring = [...shares]
    .filter(([family, share]) => family !== "corn" && family !== "malt" && share >= FLAVORING_MIN)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  if (flavoring.length === 0) {
    if (malt >= MALT_CLASS_MIN) return { band: [MALT, "", band(malt)], exact: [MALT, "", malt] };
    return { band: [CORN, "", band(corn), band(malt)], exact: [CORN, "", corn, malt] };
  }
  const kind = flavoring.length === 1 ? ONE : MANY;
  const names = flavoring.map(([family]) => family).join("+");
  const klass = kind === ONE ? names : `${flavoring.length}${names}`;
  return {
    band: [kind, klass, ...flavoring.map(([, share]) => band(share)), band(malt)],
    exact: [kind, klass, ...flavoring.map(([, share]) => share), malt],
  };
}

/** A mashbill as it reads on a flight's label: its name, else the recipe's shares ("75/21/4"), else the style. */
export function mashbillDisplay(mashbill: MashbillInput): string {
  if (mashbill.kind === "blend") return "Blend";
  if (mashbill.kind === "generic") return mashbill.style.trim();
  const name = mashbill.name?.trim();
  if (name) return name;
  return [...mashbill.grains]
    .sort((a, b) => b.percent - a.percent)
    .map((g) => String(Math.round(g.percent)))
    .join("/");
}
