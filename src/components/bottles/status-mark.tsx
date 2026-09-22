import type { BottleStatus } from "@/db/schema";
import { cn, humanise } from "@/lib/utils";

/**
 * Bottle lifecycle color, restrained per DESIGN-TOKENS.md §41: three states,
 * not a badge per status. Every other status (owned, wishlist, sampled)
 * stays plain text — the dot is reserved for a state that changed the
 * bottle's relationship to the shelf.
 */
const STATE_DOT: Partial<Record<BottleStatus, string>> = {
  open: "bg-state-open",
  killed: "bg-state-empty",
  sold: "bg-state-special",
  traded: "bg-state-special",
};

/**
 * OPEN must be immediately obvious without a giant badge (DESIGN.md §17.2).
 * A colored dot plus the status word, rather than a filled pill, is the
 * compact, unmistakable treatment — and the word is the accessible name, so
 * color is never the only signal (DESIGN-TOKENS.md §7.2/§44).
 */
export function StatusMark({ status, className }: { status: BottleStatus; className?: string }) {
  const dot = STATE_DOT[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      {dot ? <span className={cn("size-1.5 shrink-0 rounded-full", dot)} aria-hidden="true" /> : null}
      {humanise(status)}
    </span>
  );
}
