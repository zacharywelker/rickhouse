"use client";

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

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="border border-border bg-muted px-1 font-sans text-[11px] text-foreground">{children}</kbd>;
}

/** From `md` up: the basics on one line under the sheet, and the full help a click away. */
export function ShortcutsFooter() {
  return (
    <div className="hidden items-center gap-4 text-xs text-muted-foreground md:flex">
      <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden whitespace-nowrap">
        <span>Arrow keys move. Type or press Enter to edit.</span>
        <span><Key>Tab</Key> next cell</span>
        <span><Key>Esc</Key> cancels</span>
        <span><Key>{platformKeyName() === "Option" ? "Cmd" : "Ctrl"}</Key>+<Key>Z</Key> undo</span>
        <span><Key>Alt</Key>+<Key>Shift</Key>+<Key>&larr;</Key><Key>&rarr;</Key> resize a column</span>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="shrink-0">
            All shortcuts
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-[min(44rem,calc(100vw-2rem))] p-3 text-xs text-muted-foreground">
          <p>
            <Shortcuts />
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
