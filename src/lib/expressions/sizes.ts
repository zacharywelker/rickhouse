/** The bottle sizes offered as a choice, smallest first; any other whole number of mL can be entered too. */
export const SIZE_PRESETS: ReadonlyArray<number> = [200, 375, 500, 700, 750, 1000];

/** "750 mL", "1 L", "1.75 L" for 1750. Whole litres and quarter-litres read better as litres. */
export function formatSize(ml: number): string {
  if (ml >= 1000 && ml % 250 === 0) return `${ml / 1000} L`;
  return `${ml} mL`;
}
