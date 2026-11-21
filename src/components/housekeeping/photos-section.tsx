import type { Route } from "next";
import Link from "next/link";
import { PhotoCard } from "@/components/housekeeping/photo-card";
import { PerPageSelect } from "@/components/housekeeping/per-page-select";
import { PhotoPager } from "@/components/housekeeping/photo-pager";
import { SavedCountProvider } from "@/components/housekeeping/saved-count";
import { Section, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import type { DuplicateKind } from "@/lib/housekeeping/duplicate-kinds";
import { PER_PAGE_OPTIONS, PHOTO_TABS, photoHref, type PhotoTab } from "@/lib/housekeeping/photo-params";
import type { MissingPhoto } from "@/lib/housekeeping/photo-queries";
import { cn } from "@/lib/utils";

const TAB_LABELS: Record<PhotoTab, string> = {
  labels: "Labels",
  barrels: "Single & private barrels",
  vintages: "Vintages",
};

/**
 * Housekeeping's Photos section: labels, single and private barrels, and vintages that have no photo, one page of
 * cards at a time. The tab, page size and page live in the address, so a reload or a shared link lands in the same place.
 */
export function PhotosSection({
  tab,
  per,
  counts,
  items,
  window,
  dup,
}: {
  tab: PhotoTab;
  per: number;
  counts: Record<PhotoTab, number>;
  items: MissingPhoto[];
  window: { offset: number; from: number; to: number; hasPrev: boolean; hasNext: boolean };
  /** The Duplicates tab, carried in every link so this section never resets that one. */
  dup?: DuplicateKind;
}) {
  const total = counts[tab];
  return (
    <Section aria-labelledby="photos-heading">
      <SectionHeader>
        <SectionTitle id="photos-heading">Photos</SectionTitle>
        <SectionDescription>
          One photo per label covers every bottle of it. Photos under 600 px on the long side are turned down.
        </SectionDescription>
      </SectionHeader>

      <nav aria-label="What needs a photo" className="mb-4 flex flex-wrap border-b border-border">
        {PHOTO_TABS.map((key) => {
          const current = key === tab;
          return (
            <Link
              key={key}
              href={photoHref(key, per, 0, dup) as Route}
              aria-current={current ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                current ? "border-foreground font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_LABELS[key]}
              <span className="ml-1.5 tabular-nums text-muted-foreground">{counts[key]}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Click a card, then <kbd className="border border-border px-1 text-xs">Ctrl</kbd>+
          <kbd className="border border-border px-1 text-xs">V</kbd> to paste a copied image. You can also drop a file on a card.
        </p>
        <PerPageSelect per={per} options={PER_PAGE_OPTIONS} />
      </div>

      {/* Keyed by the batch itself: when every card is saved, Next lands on the same address, with new cards at the same offset. */}
      <SavedCountProvider key={`${tab}-${per}-${window.offset}-${items.map((item) => item.key).join(",")}`}>
        {items.length === 0 ? (
          <p className="border border-border px-4 py-6 text-sm text-muted-foreground">Nothing left to photograph here.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 px-1 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <PhotoCard key={item.key} item={item} />
            ))}
          </div>
        )}
        <PhotoPager tab={tab} per={per} total={total} window={window} dup={dup} />
      </SavedCountProvider>
    </Section>
  );
}
