"use client";

import * as React from "react";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** A flight with room for one more bottle, as the menu names it: "Flight 3 · High rye bourbons (3 of 4)". */
export type MoveTarget = { heatId: number; title: string; count: number; size: number };
export type SwapTarget = { entryId: number; name: string; flight: string };

/**
 * A bottle's menu, one flat list (arrow keys and Enter): "Move to" each flight that has room, then "Swap with a bottle…",
 * which opens the searchable list of bottles of the other flights. Dragging does the same for a mouse; this is the path
 * for the keyboard and touch. The swap list is built only when it is opened, since a field can be large.
 */
export function MoveMenu({
  name,
  busy,
  targets,
  anyOther,
  swaps,
  onMove,
  onSwap,
}: {
  name: string;
  /** An edit is running: nothing more can be picked until it answers. */
  busy: boolean;
  /** The other flights that still have room. */
  targets: MoveTarget[];
  /** There is some other open flight to trade with. */
  anyOther: boolean;
  /** The bottles of the other open flights; called when the swap list opens. */
  swaps: () => SwapTarget[];
  onMove: (heatId: number, done: () => void) => void;
  onSwap: (entryId: number, done: () => void) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"menu" | "swap">("menu");
  const list = React.useMemo(() => (open && mode === "swap" ? swaps() : []), [open, mode, swaps]);
  if (targets.length === 0 && !anyOther) return null;
  const close = () => setOpen(false);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setMode("menu");
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" className="size-11 p-0" aria-label={`Move ${name} to another flight`}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {mode === "menu" ? (
          <Command>
            <CommandList className="max-h-[22rem]">
              <CommandGroup heading="Move to flight">
                {targets.map((t) => (
                  <CommandItem key={t.heatId} disabled={busy} value={`move ${t.heatId}`} onSelect={() => onMove(t.heatId, close)} className="min-h-11 justify-between gap-3">
                    <span>{t.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {t.count} of {t.size}
                    </span>
                  </CommandItem>
                ))}
                {targets.length === 0 ? <p className="px-2 py-2 text-sm text-muted-foreground">All other flights are full: drag onto a bottle, or choose Swap.</p> : null}
              </CommandGroup>
              {anyOther ? (
                <CommandGroup heading="Trade places">
                  <CommandItem value="swap" disabled={busy} onSelect={() => setMode("swap")} className="min-h-11">
                    Swap with a bottle…
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        ) : (
          <Command>
            <Button type="button" variant="ghost" className="min-h-11 justify-start rounded-none px-3 text-sm" onClick={() => setMode("menu")}>
              <ArrowLeft className="size-4" aria-hidden />
              Back to the menu
            </Button>
            <CommandInput autoFocus placeholder="Find a bottle…" aria-label={`Find a bottle to swap ${name} with`} />
            <CommandList className="max-h-[22rem]">
              <CommandEmpty>No bottle matches.</CommandEmpty>
              {list.map((swap) => (
                <CommandItem key={swap.entryId} disabled={busy} value={`${swap.name} ${swap.entryId}`} onSelect={() => onSwap(swap.entryId, close)} className="min-h-11 justify-between gap-3">
                  <span>{swap.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{swap.flight}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
