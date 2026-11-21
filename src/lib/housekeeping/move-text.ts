const SINGULAR: Record<string, string> = {
  labels: "label",
  bottles: "bottle",
  brands: "brand",
  distilleries: "distillery",
  "child companies": "child company",
  "other names": "other name",
  "mashbill links": "mashbill link",
  "smart groups": "smart group",
};

/** "3 labels, 1 mashbill link and 2 other names": what a merge moves, for a sentence. Empty when nothing moves. */
export function describeMoves(moves: ReadonlyArray<{ label: string; count: number }>): string {
  const parts = moves.map(({ label, count }) => `${count} ${count === 1 ? (SINGULAR[label] ?? label) : label}`);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
