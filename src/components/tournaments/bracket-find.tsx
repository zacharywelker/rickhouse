"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SEARCH_INPUT_ID } from "@/components/keyboard-shortcuts";

/**
 * "Find a bottle": type a name, matches are highlighted, Next and Previous (or Enter) walk through them. It reuses the
 * input id of the global "/" shortcut, so "/" focuses it here (this page has no other search).
 */
export function BracketFind({
  query,
  onQuery,
  count,
  index,
  onStep,
}: {
  query: string;
  onQuery: (q: string) => void;
  count: number;
  index: number | null;
  onStep: (direction: 1 | -1) => void;
}) {
  const searching = query.trim() !== "";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <label htmlFor={SEARCH_INPUT_ID} className="sr-only">
        Find a bottle
      </label>
      <Input
        id={SEARCH_INPUT_ID}
        type="search"
        value={query}
        placeholder="Find a bottle"
        autoComplete="off"
        className="h-11 w-full min-w-0 sm:w-72"
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onStep(e.shiftKey ? -1 : 1);
          }
        }}
      />
      <Button type="button" variant="outline" className="size-11 p-0" aria-label="Previous match" disabled={count === 0} onClick={() => onStep(-1)}>
        <ChevronUp className="size-4" aria-hidden />
      </Button>
      <Button type="button" variant="outline" className="size-11 p-0" aria-label="Next match" disabled={count === 0} onClick={() => onStep(1)}>
        <ChevronDown className="size-4" aria-hidden />
      </Button>
      <p role="status" className="text-sm tabular-nums text-muted-foreground">
        {!searching ? "" : count === 0 ? "No bottle matches." : index === null ? `${count} ${count === 1 ? "match" : "matches"}` : `Match ${index + 1} of ${count}`}
      </p>
    </div>
  );
}
