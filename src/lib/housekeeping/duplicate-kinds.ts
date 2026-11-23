export const DUPLICATE_KINDS = ["brands", "distilleries", "companies", "finishes", "ingredients", "mashbills", "cooperages", "stores", "tags"] as const;
export type DuplicateKind = (typeof DUPLICATE_KINDS)[number];

export const KIND_LABELS: Record<DuplicateKind, string> = {
  brands: "Brands",
  distilleries: "Distilleries",
  companies: "Companies",
  finishes: "Finishes",
  ingredients: "Ingredients",
  mashbills: "Mashbills",
  cooperages: "Cooperages",
  stores: "Stores",
  tags: "Tags",
};
