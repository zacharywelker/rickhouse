export const OPEN_SEARCH_EVENT = "rickhouse:open-search";

export type ShortcutInput = {
  key: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  typing: boolean;
  hasFilterBox: boolean;
};
export type ShortcutAction = "open-search" | "focus-filter" | "new-bottle";

export function shortcutFor(input: ShortcutInput): ShortcutAction | null {
  const { key, meta, ctrl, alt, typing, hasFilterBox } = input;
  if (alt) return null;
  if (key.toLowerCase() === "k" && (meta || ctrl)) return "open-search";
  if (meta || ctrl) return null;
  if (typing) return null;
  if (key === "/") return hasFilterBox ? "focus-filter" : "open-search";
  if (key === "n") return "new-bottle";
  return null;
}
