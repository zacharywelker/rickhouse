/** The smallest step a page button takes, so a window shorter than the bar still moves. */
const MIN_STEP = 40;

/** One screen minus the bar's height, so no row is skipped under the bar. */
export function pageStep(viewportHeight: number, barHeight: number): number {
  return Math.max(MIN_STEP, viewportHeight - barHeight);
}

/** Where to scroll to for one page up (-1) or down (1), kept within the document. */
export function scrollTarget(current: number, direction: -1 | 1, viewportHeight: number, barHeight: number, documentHeight: number): number {
  const max = Math.max(0, documentHeight - viewportHeight);
  return Math.min(max, Math.max(0, current + direction * pageStep(viewportHeight, barHeight)));
}

/** Whether there is anything left to scroll to, either way (a pixel of slack for fractional scroll positions). */
export function canPage(current: number, viewportHeight: number, documentHeight: number): { up: boolean; down: boolean } {
  return { up: current > 1, down: current + viewportHeight < documentHeight - 1 };
}

/** The Top button shows once you are more than half a screen down. */
export function showTop(current: number, viewportHeight: number): boolean {
  return current > viewportHeight / 2;
}
