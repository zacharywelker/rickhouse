"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type MoveTarget = { heatId: number; title: string; full: boolean };
export type SwapTarget = { entryId: number; name: string; flight: string };

/**
 * A bottle's "Move" menu: "Move to" lists the other undecided flights of the round as buttons (a full flight is listed
 * but disabled), and "Swap with" lists the bottles of those flights, searchable by name, since a field can be large.
 */
export function MoveMenu({
  name,
  targets,
  swaps,
  onMove,
  onSwap,
}: {
  name: string;
  targets: MoveTarget[];
  swaps: SwapTarget[];
  onMove: (heatId: number, done: () => void) => void;
  onSwap: (entryId: number, done: () => void) => void;
}) {
  const [open, setOpen] = React.useState(false);
  if (targets.length === 0 && swaps.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" className="size-11 p-0" aria-label={`Move ${name} to another flight`}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        {targets.length > 0 ? <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">Move to</p> : null}
        <ul className={targets.length > 0 ? "border-b border-border" : undefined}>
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
        <p className="px-3 py-2 text-xs text-muted-foreground">Swap with</p>
        <Command>
          <CommandInput placeholder="Find a bottle…" aria-label={`Find a bottle to swap ${name} with`} />
          <CommandList>
            <CommandEmpty>No bottle matches.</CommandEmpty>
            {swaps.map((swap) => (
              <CommandItem key={swap.entryId} value={`${swap.name} ${swap.entryId}`} onSelect={() => onSwap(swap.entryId, () => setOpen(false))} className="min-h-11 justify-between gap-3">
                <span>{swap.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{swap.flight}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
