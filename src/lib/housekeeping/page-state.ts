import type { DuplicateKind } from "./duplicate-kinds";
import { DEFAULT_PER, parseDuplicateKind, parsePhotoParams, type PerPage, type PhotoTab } from "./photo-params";

export type PageState = {
  tab: PhotoTab;
  per: PerPage;
  offset: number;
  dup: DuplicateKind | null;
  ttbOffset: number;
  ttbPer: PerPage;
};

export function parsePageState(sp: Record<string, string | string[] | undefined>): PageState {
  const photos = parsePhotoParams(sp);
  const ttb = parsePhotoParams({ offset: sp.to, per: sp.tp });
  return {
    ...photos,
    dup: parseDuplicateKind(sp),
    ttbOffset: ttb.offset,
    ttbPer: ttb.per,
  };
}

export function pageHref(state: PageState, patch?: Partial<PageState>): string {
  const { tab, per, offset, dup, ttbOffset, ttbPer } = { ...state, ...patch };
  return `/housekeeping?tab=${tab}&per=${per}${offset > 0 ? `&offset=${offset}` : ""}${dup ? `&dup=${dup}` : ""}${ttbOffset > 0 ? `&to=${ttbOffset}` : ""}${ttbPer !== DEFAULT_PER ? `&tp=${ttbPer}` : ""}`;
}
