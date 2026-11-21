import type { Route } from "next";
import Link from "next/link";
import { DuplicateNoticeList, DuplicateNoticesProvider } from "@/components/housekeeping/duplicate-notices";
import { DuplicatePairCard } from "@/components/housekeeping/duplicate-pair-card";
import { Section, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { DUPLICATE_KINDS, KIND_LABELS, type DuplicateKind } from "@/lib/housekeeping/duplicate-kinds";
import type { PairView } from "@/lib/housekeeping/duplicate-queries";
import type { MergePreview } from "@/lib/housekeeping/merge-reference";
import { photoHref, type PhotoTab } from "@/lib/housekeeping/photo-params";
import { cn } from "@/lib/utils";

/** How many pairs of a kind are shown at once; merging or dismissing one brings the next into view. */
export const PAIRS_SHOWN = 10;

/**
 * Housekeeping's Duplicates section: rows of one kind that look like the same thing entered twice. The tab lives in
 * the address (`dup`), and every link carries the Photos section's own place, so neither section resets the other.
 */
export function DuplicatesSection({
  kind,
  counts,
  shown,
  photo,
}: {
  kind: DuplicateKind;
  counts: Record<DuplicateKind, number>;
  shown: Array<{ pair: PairView; previews: { aKeeps: MergePreview; bKeeps: MergePreview } }>;
  photo: { tab: PhotoTab; per: number; offset: number };
}) {
  const total = counts[kind];
  return (
    <Section aria-labelledby="duplicates-heading" className="mt-12">
      <SectionHeader>
        <SectionTitle id="duplicates-heading">Likely duplicates</SectionTitle>
        <SectionDescription>
          Pick the one to keep. Everything that used the other moves to it. A merge can’t be undone, so it asks once before it happens.
        </SectionDescription>
      </SectionHeader>

      <nav aria-label="Kinds of duplicate" className="mb-4 flex flex-wrap border-b border-border">
        {DUPLICATE_KINDS.map((key) => {
          const current = key === kind;
          return (
            <Link
              key={key}
              href={photoHref(photo.tab, photo.per, photo.offset, key) as Route}
              aria-current={current ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                current ? "border-foreground font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                !current && counts[key] === 0 && "opacity-60",
              )}
            >
              {KIND_LABELS[key]}
              <span className="ml-1.5 tabular-nums text-muted-foreground">{counts[key]}</span>
            </Link>
          );
        })}
      </nav>

      <DuplicateNoticesProvider>
        <DuplicateNoticeList />
        {shown.length === 0 ? (
          <p className="border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
            Nothing to merge in {KIND_LABELS[kind].toLowerCase()}. New candidates show up here after you add or import more.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {shown.map(({ pair, previews }) => (
              <DuplicatePairCard key={pair.key} pair={pair} previews={previews} />
            ))}
          </div>
        )}
      </DuplicateNoticesProvider>

      {total > shown.length ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Showing the {shown.length} likeliest of {total}. The rest come into view as you merge or dismiss these.
        </p>
      ) : null}
      <p className="mt-6 max-w-prose text-sm text-muted-foreground">
        Mashbills match only when the grain recipe is identical. A pair marked “Not a duplicate” does not come back. Labels are not
        covered here yet.
      </p>
    </Section>
  );
}
