/** Narrowest and widest a column can be dragged: enough to still grab its edge, and not wider than a screen. */
export const MIN_COLUMN_WIDTH = 48;
export const MAX_COLUMN_WIDTH = 640;

export const clampWidth = (px: number): number => Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(px)));

/** Column widths read back from storage: only finite numbers, clamped, so a stale or hand-edited entry cannot break the sheet. */
export function parseWidths(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw)) if (typeof value === "number" && Number.isFinite(value)) out[id] = clampWidth(value);
  return out;
}
