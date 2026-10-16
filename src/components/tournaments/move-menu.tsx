"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type MoveTarget = { heatId: number; title: string; full: boolean };

/** A bottle's "Move" menu: the other undecided flights of the round, as buttons. A full flight is listed but disabled. */
export function MoveMenu({ name, targets, onMove }: { name: string; targets: MoveTarget[]; onMove: (heatId: number, done: () => void) => void }) {
  const [open, setOpen] = React.useState(false);
  if (targets.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" className="size-11 p-0" aria-label={`Move ${name} to another flight`}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">Move to</p>
        <ul>
          {targets.map((target) => (
            <li key={target.heatId} className="border-t border-border first:border-t-0">
              <button
                type="button"
                disabled={target.full}
                onClick={() => onMove(target.heatId, () => setOpen(false))}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
              >
                <span>{target.title}</span>
                {target.full ? <span className="text-xs">full</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
