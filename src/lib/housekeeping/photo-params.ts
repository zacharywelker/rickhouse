export const PHOTO_TABS = ["labels", "barrels", "vintages"] as const;
export type PhotoTab = (typeof PHOTO_TABS)[number];
export const PER_PAGE_OPTIONS = [8, 12, 24, 48] as const;
export type PerPage = (typeof PER_PAGE_OPTIONS)[number];
export const DEFAULT_PER: PerPage = 8;

export function parsePhotoParams(sp: Record<string, string | string[] | undefined>): { tab: PhotoTab; per: PerPage; page: number } {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const tab = first(sp.tab);
  const per = Number(first(sp.per));
  const page = Number(first(sp.page));
  return {
    tab: PHOTO_TABS.find((option) => option === tab) ?? "labels",
    per: PER_PAGE_OPTIONS.find((option) => option === per) ?? DEFAULT_PER,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function pageWindow(total: number, per: number, page: number): { page: number; pages: number; from: number; to: number; offset: number } {
  const pages = Math.max(1, Math.ceil(total / per));
  const current = Math.min(pages, Math.max(1, page));
  const offset = (current - 1) * per;
  return { page: current, pages, from: total === 0 ? 0 : offset + 1, to: Math.min(total, offset + per), offset };
}
