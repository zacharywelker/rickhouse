import type { CategoryKind } from "./rules";

export const GIN_STYLES = ["London Dry", "Old Tom", "Contemporary", "Plymouth", "Holland-Style", "Other"] as const;
export { GIN_BASES, GIN_BOTANICALS } from "./ingredient-presets";

export const isGinKind = (kind: CategoryKind | null) => kind === "gin" || kind === "genever";
export const NAVY_GIN_PROOF = 108;
