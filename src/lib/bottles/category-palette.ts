/**
 * One colour per kind of spirit (DESIGN.md §3.2), matched on whole words of the
 * category's name so "Gin" doesn't catch "Virginia". Mirrors CategoryPalette in
 * the iOS app so a bottle's frame is the same colour on every platform.
 * `dark` marks frames that need paper-coloured text on top.
 */
export type CategoryColor = { hex: string; dark: boolean };

const OTHER: CategoryColor = { hex: "#F7EA48", dark: false };

export function categoryColor(category: string): CategoryColor {
  const lower = category.toLowerCase();
  const words = new Set(lower.split(/[^\p{L}]+/u).filter(Boolean));
  const has = (...candidates: string[]) => candidates.some((c) => words.has(c));

  if (has("bourbon")) return { hex: "#FC9350", dark: false };
  if (has("rye")) return { hex: "#1CAA3D", dark: false };
  if (has("scotch")) return { hex: "#F4633A", dark: false };
  if (has("irish")) return { hex: "#A6DD45", dark: false };
  if (has("japanese")) return { hex: "#BA0C2F", dark: true };
  if (has("canadian")) return { hex: "#5461C8", dark: true };
  if (has("american", "wheat", "corn", "light") || lower === "single malt") return { hex: "#CA9A8E", dark: false };
  if (has("whiskey", "whisky")) return { hex: "#EAB8E4", dark: false };
  if (has("rum", "rhum", "cachaça", "cachaca")) return { hex: "#9678D3", dark: false };
  if (has("gin")) return { hex: "#48D597", dark: false };
  if (has("vodka")) return { hex: "#56B7E6", dark: false };
  if (has("amaro", "amari")) return { hex: "#EF426F", dark: false };
  if (has("liqueur", "liqueurs")) return { hex: "#E93CAC", dark: false };
  if (has("agave", "tequila", "mezcal")) return { hex: "#50A684", dark: false };
  if (has("brandy", "cognac", "armagnac")) return { hex: "#61007D", dark: true };
  return OTHER;
}
