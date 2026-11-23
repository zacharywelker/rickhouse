import type { Metadata } from "next";
import { DuplicatesSection, PAIRS_SHOWN } from "@/components/housekeeping/duplicates-section";
import { PhotosSection } from "@/components/housekeeping/photos-section";
import { TtbSection } from "@/components/housekeeping/ttb-section";
import { requireSession } from "@/lib/auth";
import { colaLookupEnabled } from "@/lib/cola/store";
import { DUPLICATE_KINDS } from "@/lib/housekeeping/duplicate-kinds";
import { countDuplicatePairs, listDuplicatePairs } from "@/lib/housekeeping/duplicate-queries";
import { previewMerge } from "@/lib/housekeeping/merge-reference";
import { parsePageState } from "@/lib/housekeeping/page-state";
import { pageWindow } from "@/lib/housekeeping/photo-params";
import { countMissingPhotos, listMissingPhotos } from "@/lib/housekeeping/photo-queries";
import { countLabelsWithoutTtb, listLabelsWithoutTtb } from "@/lib/housekeeping/ttb-queries";

export const metadata: Metadata = { title: "Housekeeping" };
export const dynamic = "force-dynamic";

/** Occasional upkeep of the collection: photos that are missing, and rows that look like the same thing twice. */
export default async function HousekeepingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession();
  const params = await searchParams;
  const parsed = parsePageState(params);
  const { tab, per, offset } = parsed;
  const counts = await countMissingPhotos(user.id);
  const window = pageWindow(counts[tab], per, offset);
  const items = await listMissingPhotos(user.id, tab, window.offset, per);
  const waiting = counts.labels + counts.barrels + counts.vintages;

  // With no tab chosen the Duplicates section opens on the first kind that has something to show.
  const pairCounts = await countDuplicatePairs(user.id);
  const dup = parsed.dup ?? DUPLICATE_KINDS.find((kind) => pairCounts[kind] > 0) ?? "brands";
  // Links in the other sections carry the kind that is showing, so they do not make Duplicates pick again.
  const state = { ...parsed, dup };
  const pairs = await listDuplicatePairs(user.id, dup, PAIRS_SHOWN);
  const shown = await Promise.all(
    pairs.map(async (pair) => ({
      pair,
      // Both directions, so choosing the other side to keep shows its own move line without a round trip.
      previews: {
        aKeeps: await previewMerge(user.id, dup, pair.a.id, pair.b.id),
        bKeeps: await previewMerge(user.id, dup, pair.b.id, pair.a.id),
      },
    })),
  );
  const pairsWaiting = DUPLICATE_KINDS.reduce((sum, kind) => sum + pairCounts[kind], 0);

  const ttbTotal = await countLabelsWithoutTtb(user.id);
  const ttbWindow = pageWindow(ttbTotal, state.ttbPer, state.ttbOffset);
  const ttbRows = await listLabelsWithoutTtb(user.id, ttbWindow.offset, state.ttbPer);

  const photosText = waiting === 0 ? "Every label, barrel and vintage has a photo" : `${waiting} ${waiting === 1 ? "item is" : "items are"} waiting for a photo`;
  const pairsText = pairsWaiting === 0 ? "there are no likely duplicates" : `${pairsWaiting} ${pairsWaiting === 1 ? "pair looks" : "pairs look"} like duplicates`;
  const ttbText = ttbTotal === 0 ? "every label has a TTB approval" : `${ttbTotal} ${ttbTotal === 1 ? "label has" : "labels have"} no TTB approval`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl text-accent">Housekeeping</h1>
        <p className="text-muted-foreground">
          {photosText}, {pairsText}, and {ttbText}.
        </p>
      </div>
      <PhotosSection state={state} counts={counts} items={items} window={window} />
      <DuplicatesSection kind={dup} counts={pairCounts} shown={shown} state={state} />
      <TtbSection state={state} total={ttbTotal} rows={ttbRows} window={ttbWindow} lookupEnabled={colaLookupEnabled()} />
    </div>
  );
}
