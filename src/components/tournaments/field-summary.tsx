"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { counts, entryKey, type PickedEntry } from "@/lib/tournaments/field-selection";

const KIND = { bottle: "Bottle", label: "Label only", adhoc: "Outside entry" } as const;

/** Everything chosen so far, wherever it came from, each with a remove button. */
export function FieldSummary({ entries, onRemove }: { entries: readonly PickedEntry[]; onRemove: (key: string) => void }) {
  const c = counts(entries);
  if (c.total === 0) return null;
  const parts = [c.bottles > 0 && `${c.bottles} bottle${c.bottles === 1 ? "" : "s"}`, c.labels > 0 && `${c.labels} label${c.labels === 1 ? "" : "s"} only`, c.adhoc > 0 && `${c.adhoc} outside`].filter(Boolean);
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="text-sm font-medium tabular-nums">
        Your field: {c.total} {c.total === 1 ? "entry" : "entries"} <span className="font-normal text-muted-foreground">({parts.join(", ")})</span>
      </h3>
      <ul className="max-h-72 overflow-y-auto border-b border-border" aria-label="Chosen entries">
        {entries.map((entry) => (
          <li key={entryKey(entry)} className="flex items-center gap-2 border-t border-border">
            <span className="min-w-0 flex-1 py-1.5">
              <span className="block text-sm leading-snug">{entry.name}</span>
              <span className="block text-xs text-muted-foreground">{KIND[entry.kind]}</span>
            </span>
            <Button type="button" variant="ghost" className="size-11 shrink-0 p-0" aria-label={`Remove ${entry.name}`} onClick={() => onRemove(entryKey(entry))}>
              <X className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
