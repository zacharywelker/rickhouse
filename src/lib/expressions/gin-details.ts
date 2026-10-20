import type { CategoryKind } from "./rules";

export const GIN_STYLES = ["London Dry", "Old Tom", "Contemporary", "Plymouth", "Holland-Style", "Other"] as const;
export const GIN_BASES = ["Corn", "Potato", "Rye", "Grape", "Molasses", "Sugarcane", "Apple", "Wheat", "Barley", "Whey"] as const;
export const GIN_BOTANICALS = [
  "Juniper", "Coriander", "Angelica Root", "Cassia Bark", "Lemon", "Bitter Orange", "Lime", "Yuzu",
  "Grapefruit", "Pomelo", "Cardamom", "Cucumber", "Lavender", "Allspice", "Almond", "Bergamot",
  "Anise", "Basil", "Bay Laurel", "Black Pepper", "Blood Orange", "Butterfly Pea Flower",
  "Hibiscus", "Chamomile", "Cloves", "Cubeb Pepper", "Dill", "Elderflower", "Elderberry",
  "Fennel", "Ginger", "Grains of Paradise", "Honeysuckle", "Lemongrass", "Licorice",
  "Meadowsweet", "Nutmeg", "Orris Root", "Rosemary", "Rose", "Thyme",
] as const;

export const isGinKind = (kind: CategoryKind | null) => kind === "gin" || kind === "genever";
export const NAVY_GIN_PROOF = 108;
