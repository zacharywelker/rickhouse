export const PHOTO_TABS = ["labels", "barrels", "vintages"] as const;
export type PhotoTab = (typeof PHOTO_TABS)[number];
export const PER_PAGE_OPTIONS = [8, 12, 24, 48] as const;
export type PerPage = (typeof PER_PAGE_OPTIONS)[number];
export const DEFAULT_PER: PerPage = 8;

/**
 * The list is addressed by `offset`, not by page number. A card that has been saved stays on screen but leaves the
 * server's list, so a page number would skip the rows that slid up behind it; an offset can be moved by exactly the
 * number of cards saved (see `nextOffset`).
 */
export function parsePhotoParams(sp: Record<string, string | string[] | undefined>): { tab: PhotoTab; per: PerPage; offset: number } {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const tab = first(sp.tab);
  const per = Number(first(sp.per));
  const offset = Number(first(sp.offset));
  return {
    tab: PHOTO_TABS.find((option) => option === tab) ?? "labels",
    per: PER_PAGE_OPTIONS.find((option) => option === per) ?? DEFAULT_PER,
    offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
  };
}

/** The window of `per` rows starting at `offset`; an offset past the end is pulled back to the last full window. */
export function pageWindow(
  total: number,
  per: number,
  offset: number,
): { offset: number; from: number; to: number; hasPrev: boolean; hasNext: boolean } {
  const start = total === 0 ? 0 : offset >= total ? Math.max(0, total - per) : offset;
  return {
    offset: start,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(total, start + per),
    hasPrev: start > 0,
    hasNext: start + per < total,
  };
}

/** Where Next goes: a page on, less the cards saved on this page, since saved rows have left the list. */
export function nextOffset(offset: number, per: number, saved: number): number {
  return offset + per - Math.min(Math.max(saved, 0), per);
}

export function previousOffset(offset: number, per: number): number {
  return Math.max(0, offset - per);
}

/** The address of a window of a tab. The offset is left out at the start so the first page has a clean address. */
export function photoHref(tab: PhotoTab, per: number, offset: number): string {
  return `/housekeeping?tab=${tab}&per=${per}${offset > 0 ? `&offset=${offset}` : ""}`;
}
