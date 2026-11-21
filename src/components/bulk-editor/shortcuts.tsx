"use client";

import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { platformKeyName } from "@/lib/platform";

/** The sheet's help in full: what the footer's "All shortcuts" shows, and what sits under the sheet below `md`. */
export function Shortcuts() {
  return (
    <>
      Arrow keys move. Type or press Enter to edit. A label&rsquo;s own cells on a bottle row change every bottle on the label (the cell says how many). A grey cell with a lock is filled in from another cell, such as an age from its statement: triple-click it to edit. Brand or Label on a bottle moves it to another label. In the empty row, type a brand, then a label, then a category: Enter takes the highlighted match or creates, Tab takes an existing match only, and Ctrl+Enter creates what you typed.
      Tab goes to the next cell you can edit, and Enter finishes and drops to the next row. Escape cancels. {platformKeyName() === "Option" ? "Cmd" : "Ctrl"}+Z takes back the change in the newest notice that offers Undo, while it is showing.
      Drag the edge of a column header to resize it (double-click to undo), or press Alt+Shift+Left or Right on a cell. Rows save as you go: a saved row as soon as a cell is finished, a new row when you leave it.
    </>
  );
}

/** From `md` up: a small keyboard button at the end of the toolbar that shows the full help, so the page has no footer. */
export function ShortcutsButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" className="hidden px-2 text-muted-foreground md:inline-flex">
          <Keyboard aria-hidden className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-[min(44rem,calc(100vw-2rem))] p-3 text-xs text-muted-foreground">
        <p>
          <Shortcuts />
        </p>
      </PopoverContent>
    </Popover>
  );
}
