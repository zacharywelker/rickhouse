"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GROUP_KEY_HELP, GROUP_KEY_LABELS, moveKey } from "@/lib/tournaments/priority";
import type { GroupKey } from "@/lib/tournaments/types";

/** The five grouping keys in order of importance, moved with buttons (no dragging: it has to work by keyboard and on a phone). */
export function PriorityList({ order, onChange }: { order: readonly GroupKey[]; onChange: (order: GroupKey[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <ol aria-label="Grouping priority, most important first" className="border-b border-border">
        {order.map((key, i) => (
          <li key={key} className="flex items-center gap-2 border-t border-border py-1">
            <span className="w-5 text-right text-sm tabular-nums text-muted-foreground" aria-hidden>
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{GROUP_KEY_LABELS[key]}</span>
              <span className="block text-xs text-muted-foreground">{GROUP_KEY_HELP[key]}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              className="size-11 shrink-0 p-0"
              disabled={i === 0}
              aria-label={`Move ${GROUP_KEY_LABELS[key]} up`}
              onClick={() => onChange(moveKey(order, i, -1))}
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="size-11 shrink-0 p-0"
              disabled={i === order.length - 1}
              aria-label={`Move ${GROUP_KEY_LABELS[key]} down`}
              onClick={() => onChange(moveKey(order, i, 1))}
            >
              <ArrowDown className="size-4" />
            </Button>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        Whatever comes first splits the field; the rest only order bottles inside it. Changing the order applies to the next round, or to this one right away with Reset to automatic.
      </p>
    </div>
  );
}
