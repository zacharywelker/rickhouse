"use client";

import * as React from "react";
import { Check, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Option } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

/** Pick any number of categories (choosing one includes the categories under it). The same popover pattern as the label filters. */
export function CategoryFilter({ options, selected, onToggle }: { options: Option[]; selected: number[]; onToggle: (id: number) => void }) {
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle === "" ? options : options.filter((o) => o.label.toLowerCase().includes(needle));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("min-h-11", selected.length > 0 && "border-primary/50 text-primary")}
          aria-label="Filter by category"
        >
          Category
          {selected.length > 0 ? <Badge className="ml-1 border-primary/40 text-primary">{selected.length}</Badge> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search categories…"
            aria-label="Search categories"
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul className="max-h-64 overflow-y-auto p-1">
          {shown.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches.</li>
          ) : (
            shown.map((option) => {
              const active = selected.includes(option.value);
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => onToggle(option.value)}
                    aria-pressed={active}
                    className="flex min-h-11 w-full items-center gap-2 px-2 text-left text-sm hover:bg-muted"
                  >
                    <Check className={cn("size-4 shrink-0", active ? "text-primary opacity-100" : "opacity-0")} />
                    <span className="min-w-0 flex-1">{option.label}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
