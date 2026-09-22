"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { T8KE_SCALE, T8KE_SUMMARY } from "@/lib/t8ke";

/**
 * Explains the scale where the score is entered (SPEC M8). A popover rather
 * than a title tooltip: a native tooltip is unreachable by keyboard and never
 * appears on a phone, which is where notes actually get typed.
 */
export function T8keHint() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What the t8ke scores mean"
          className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3">
        <p className="mb-2 text-sm text-muted-foreground">{T8KE_SUMMARY}</p>
        <dl className="flex flex-col gap-1 text-xs">
          {T8KE_SCALE.map((step) => (
            <div key={step.score} className="flex gap-2">
              <dt className="w-4 shrink-0 text-right font-medium tabular-nums text-foreground">{step.score}</dt>
              <dd>
                <span className="font-medium text-foreground">{step.name}</span>{" "}
                <span className="text-muted-foreground">{step.note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
