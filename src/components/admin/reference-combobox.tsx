"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { quickCreateAction } from "@/app/(app)/admin/actions";
import type { Option, ReferenceResource } from "@/lib/admin/types";

type Props = {
  id: string;
  /** Id of the field's <label>; combined with the trigger's own text so the
   * accessible name reads "Distillery, Bardstown Bourbon Company". */
  labelledBy: string;
  /**
   * Null disables inline create. Mashbills are the case: their grains must
   * total 100, so there is nothing sensible to make from a name alone.
   */
  resource: ReferenceResource | null;
  options: Option[];
  /** Shown in place of the create row when `resource` is null. */
  emptyHint?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onOptionCreated: (option: Option) => void;
  /** Ids that would create a loop — the row itself and its descendants. */
  excludeIds?: ReadonlySet<number>;
  invalid?: boolean;
  placeholder?: string;
};

/**
 * A picker that can create what you are looking for without leaving the form.
 *
 * Per SPEC M2 this is the single biggest source of friction in this kind of
 * app: you are halfway through adding a bottle, realise the distillery does
 * not exist yet, and have to abandon the form to go make one. Typing a name
 * that does not match offers "Create it" right there.
 */
export function ReferenceCombobox({
  id,
  labelledBy,
  resource,
  options,
  value,
  onChange,
  onOptionCreated,
  excludeIds,
  invalid,
  emptyHint,
  placeholder,
}: Props) {
  const searchPlaceholder = placeholder ?? (resource === null ? "Search…" : "Search or create…");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectable = React.useMemo(
    () => (excludeIds ? options.filter((o) => !excludeIds.has(o.value)) : options),
    [options, excludeIds],
  );

  const selected = React.useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  const needle = query.trim().toLowerCase();
  const matches = React.useMemo(
    () => (needle === "" ? selectable : selectable.filter((o) => o.label.toLowerCase().includes(needle))),
    [selectable, needle],
  );

  const exactExists = selectable.some((o) => o.label.toLowerCase() === needle);
  const canCreate = resource !== null && needle.length > 0 && !exactExists;

  async function create() {
    const name = query.trim();
    if (resource === null || name === "" || creating) return;
    setCreating(true);
    setError(null);
    const result = await quickCreateAction(resource, name);
    setCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOptionCreated(result.option);
    onChange(result.option.value);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-labelledby={`${labelledBy} ${id}`}
              aria-expanded={open}
              className={cn(
                "h-10 flex-1 justify-between font-normal",
                !selected && "text-muted-foreground",
                invalid && "border-destructive",
              )}
            >
              <span className="truncate">{selected ? selected.label : searchPlaceholder}</span>
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0">
            <Command shouldFilter={false}>
              <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
              <CommandList>
                {matches.length === 0 && !canCreate ? (
                  <CommandEmpty>
                    {emptyHint ??
                      (options.length === 0
                        ? resource === null
                          ? "Nothing here yet."
                          : "Nothing here yet — type a name to create one."
                        : "No match.")}
                  </CommandEmpty>
                ) : null}
                {matches.length > 0 ? (
                  <CommandGroup>
                    {matches.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={String(option.value)}
                        onSelect={() => {
                          onChange(option.value === value ? null : option.value);
                          setOpen(false);
                          setQuery("");
                        }}
                      >
                        <Check className={cn("size-4", option.value === value ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">{option.label}</span>
                        {option.hint ? (
                          <span className="ml-auto truncate text-xs text-muted-foreground">{option.hint}</span>
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {canCreate ? (
                  <>
                    {matches.length > 0 ? <CommandSeparator /> : null}
                    <CommandGroup>
                      <CommandItem value="__create__" onSelect={create} disabled={creating}>
                        {creating ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Plus className="size-4 text-primary" />
                        )}
                        <span className="truncate">
                          Create <span className="font-medium text-foreground">{query.trim()}</span>
                        </span>
                      </CommandItem>
                    </CommandGroup>
                  </>
                ) : null}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {selected ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
            aria-label="Clear selection"
            className="shrink-0"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
