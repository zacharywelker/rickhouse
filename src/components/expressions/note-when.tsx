import Link from "next/link";
import type { ReactNode } from "react";
import type { TastingSource } from "@/db/schema";

/** How a tasting's source reads on a page. */
export const SOURCE_LABELS: Record<TastingSource, string> = {
  owned: "Owned",
  bar: "At a bar",
  bottle_share: "Bottle share",
  sample: "Sample",
  store_pour: "Store pour",
};

/** Where and how it was tasted, for a pour that is not from one of your own bottles; null for an owned one. */
export function pourNote(source: TastingSource, tastedAt: string | null): string | null {
  if (source === "owned") return tastedAt;
  return tastedAt ? `${SOURCE_LABELS[source]}, ${tastedAt}` : SOURCE_LABELS[source];
}

/**
 * The date line of a tasting. It links to the bottle when the tasting is on one; a pour of a bottle you do not
 * own has no page to go to.
 */
export function NoteWhen({ bottleId, children }: { bottleId: number | null; children: ReactNode }) {
  if (bottleId === null) return <span className="font-medium">{children}</span>;
  return (
    <Link href={`/bottles/${bottleId}`} className="font-medium hover:text-accent hover:underline">
      {children}
    </Link>
  );
}
