import type { Marker } from "@/lib/bulk-editor/resolve";
import { cn } from "@/lib/utils";

/** What each tag says in words, for a hover and for a screen reader. */
const WORDS: Readonly<Record<Marker, string>> = {
  V: "From the vintage",
  SB: "Single barrel",
  PS: "Private selection",
  "SB PS": "Single barrel and private selection",
  B: "This bottle's own value",
};

/**
 * The small letter tag on a value that is not the label's own: V (its vintage's), SB (single barrel), PS (private
 * selection), SB PS (both) or B (a bottle's own). Always upright, even inside a cell that is italic for an inferred
 * value, and never colour alone: a letter, in a muted box that reads in both themes.
 */
export function SourceTag({ marker, className }: { marker: Marker; className?: string }) {
  return (
    <span
      role="img"
      aria-label={WORDS[marker]}
      title={WORDS[marker]}
      className={cn("inline-block h-3.5 shrink-0 select-none bg-muted px-1 text-center text-[9px] font-semibold not-italic leading-[14px] tracking-wide text-muted-foreground", className)}
    >
      {marker}
    </span>
  );
}
