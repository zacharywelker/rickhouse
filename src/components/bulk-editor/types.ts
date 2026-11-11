import type { Pick } from "@/lib/bulk-editor/drafts";
import type { Candidate } from "@/lib/bulk-editor/suggest";

/** What the editor opens with. `replace`: typing started it, so the caret goes after the character instead of selecting the old value. */
export type Editing = { value: string; replace: boolean };

export type Move = "stay" | "down" | "up" | "next" | "prev";

/** How an editor ends: cancelled, or with something to keep, and where the cursor goes after. */
export type Finish =
  | { cancel: true; focus: boolean }
  /** A value typed into a plain cell. */
  | { value: string; move: Move; focus: boolean }
  /** A brand or a label, chosen from the list or created with Enter on Create. */
  | { pick: Pick; move: Move; focus: boolean }
  | { categoryId: number; move: Move; focus: boolean }
  /** Nothing was changed; only the cursor moves. */
  | { keep: true; move: Move; focus: boolean };

/** What a picking cell offers, worked out for the active cell only. */
export type ComboData = {
  candidates: Candidate[];
  allowCreate: boolean;
  /** "brand", "label" or "category": for the messages. */
  what: string;
  /** Why Create is not offered, when it is not allowed. */
  noCreateReason?: string;
};
