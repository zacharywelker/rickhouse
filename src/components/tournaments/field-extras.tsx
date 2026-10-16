"use client";

import * as React from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchLabelsAction } from "@/app/(app)/tournaments/actions";
import type { LabelCandidate } from "@/lib/tournaments/field";
import { MAX_NAME, type PickedEntry } from "@/lib/tournaments/field-selection";

/** A label you own no bottle of (or want as a label-only competitor): searched as you type, shown after the first answer. */
function LabelAdder({ entries, onAdd }: { entries: readonly PickedEntry[]; onAdd: (label: { expressionId: number; name: string }) => void }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [labels, setLabels] = React.useState<LabelCandidate[] | null>(null);
  const latest = React.useRef(0);

  React.useEffect(() => {
    if (!open) return;
    const request = ++latest.current;
    const timer = setTimeout(() => {
      searchLabelsAction(query)
        .then((answer) => {
          if (request === latest.current) setLabels(answer.labels);
        })
        .catch(() => {
          if (request === latest.current) setLabels([]);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [open, query]);

  const have = new Set(entries.flatMap((e) => (e.kind === "label" ? [e.expressionId] : [])));

  return (
    <div className="flex flex-col gap-1.5">
      <Label id="add-label-label">Add a label you don&apos;t own</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-labelledby="add-label-label" className="min-h-11 justify-start font-normal text-muted-foreground">
            <Plus className="size-4" /> Search your labels…
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-0">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Brand or label name…" />
            <CommandList>
              {labels === null ? (
                <p role="status" className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Looking…
                </p>
              ) : labels.length === 0 ? (
                <CommandEmpty>No label matches.</CommandEmpty>
              ) : (
                <CommandGroup>
                  {labels.map((label) => (
                    <CommandItem
                      key={label.expressionId}
                      value={String(label.expressionId)}
                      className="min-h-11"
                      onSelect={() => {
                        onAdd({ expressionId: label.expressionId, name: label.name });
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <Check className={have.has(label.expressionId) ? "size-4 opacity-100" : "size-4 opacity-0"} />
                      <span className="min-w-0 flex-1">{label.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {label.category}
                        {label.proof === null ? "" : ` · ${label.proof}`}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">Competes as the label itself, with no bottle of yours behind it. Its facts come from the label.</p>
    </div>
  );
}

/** A name typed in: for a bottle you tasted somewhere else. */
function OutsideEntry({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = React.useState("");
  const submit = () => {
    if (name.trim() === "") return;
    onAdd(name);
    setName("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="outside-entry">Add an outside entry</Label>
      <div className="flex gap-2">
        <Input
          id="outside-entry"
          value={name}
          maxLength={MAX_NAME + 20}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="A bottle you don't have"
          className="h-11"
        />
        <Button type="button" variant="outline" className="min-h-11 shrink-0" disabled={name.trim() === ""} onClick={submit}>
          Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Outside entries stay out of the long-term ranking until you match them to a label.</p>
    </div>
  );
}

export function FieldExtras({
  entries,
  onAddLabel,
  onAddAdhoc,
}: {
  entries: readonly PickedEntry[];
  onAddLabel: (label: { expressionId: number; name: string }) => void;
  onAddAdhoc: (name: string) => void;
}) {
  return (
    <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
      <LabelAdder entries={entries} onAdd={onAddLabel} />
      <OutsideEntry onAdd={onAddAdhoc} />
    </div>
  );
}
