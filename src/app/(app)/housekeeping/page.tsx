import type { Metadata } from "next";
import { PhotosSection } from "@/components/housekeeping/photos-section";
import { requireSession } from "@/lib/auth";
import { pageWindow, parsePhotoParams } from "@/lib/housekeeping/photo-params";
import { countMissingPhotos, listMissingPhotos } from "@/lib/housekeeping/photo-queries";

export const metadata: Metadata = { title: "Housekeeping" };
export const dynamic = "force-dynamic";

/** Occasional upkeep of the collection. For now: photos that are missing. */
export default async function HousekeepingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession();
  const { tab, per, page } = parsePhotoParams(await searchParams);
  const counts = await countMissingPhotos(user.id);
  const window = pageWindow(counts[tab], per, page);
  const items = await listMissingPhotos(user.id, tab, window.offset, per);
  const waiting = counts.labels + counts.barrels + counts.vintages;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl text-accent">Housekeeping</h1>
        <p className="text-muted-foreground">
          {waiting === 0
            ? "Every label, barrel and vintage has a photo."
            : `${waiting} ${waiting === 1 ? "item is" : "items are"} waiting for a photo.`}
        </p>
      </div>
      <PhotosSection tab={tab} per={per} counts={counts} items={items} window={window} />
    </div>
  );
}
