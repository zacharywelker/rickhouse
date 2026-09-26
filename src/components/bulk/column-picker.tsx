"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PickerColumn = { id: string; label: string; /** Always shown; cannot be switched off. */ locked?: boolean };
export type PickerGroup = { id: string; title: string; columns: ReadonlyArray<PickerColumn> };

/**
 * Which columns a wide grid shows, grouped the way the form is. Each group
 * switches as a whole too — "no rum columns" is one click, not ten.
 *
 * Controlled: the caller decides where the choice lives (the URL for the
 * labels table, this browser for the bulk grids).
 */
export function ColumnPicker({
  label,
  groups,
  visible,
  onChange,
  presets,
  className,
}: {
  label: string;
  groups: ReadonlyArray<PickerGroup>;
  visible: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** One-click choices, e.g. "Show all" and "Defaults". */
  presets: ReadonlyArray<{ label: string; ids: ReadonlyArray<string> }>;
  className?: string;
}) {
  const idPrefix = React.useId();
  const columns = groups.flatMap((group) => group.columns);
  const isOn = (column: PickerColumn) => column.locked === true || visible.has(column.id);
  const shown = columns.filter(isOn).length;

  const set = (ids: ReadonlyArray<string>, on: boolean) => {
    const next = new Set(visible);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={className}>
          <SlidersHorizontal className="size-4" />
          {label}
          <Badge className="ml-1 tabular-nums">
            {shown}/{columns.length}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {shown} of {columns.length} shown
          </span>
          <div className="flex items-center gap-1">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onChange(new Set(preset.ids))}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-1">
          {groups.map((group) => {
            const switchable = group.columns.filter((column) => !column.locked);
            const on = switchable.filter((column) => visible.has(column.id)).length;
            const groupId = `${idPrefix}-group-${group.id}`;
            return (
              <div key={group.id} role="group" aria-labelledby={groupId} className="py-1">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Checkbox
                    id={`${groupId}-all`}
                    checked={on === 0 ? false : on === switchable.length ? true : "indeterminate"}
                    disabled={switchable.length === 0}
                    onCheckedChange={() => set(switchable.map((column) => column.id), on !== switchable.length)}
                    aria-label={`All of ${group.title}`}
                  />
                  <Label
                    id={groupId}
                    htmlFor={`${groupId}-all`}
                    className="flex-1 cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {group.title}
                  </Label>
                </div>
                <ul>
                  {group.columns.map((column) => {
                    const inputId = `${idPrefix}-col-${column.id}`;
                    return (
                      <li key={column.id} className="flex items-center gap-2 py-1.5 pl-7 pr-2 hover:bg-muted">
                        <Checkbox
                          id={inputId}
                          checked={isOn(column)}
                          disabled={column.locked}
                          onCheckedChange={(checked) => set([column.id], checked === true)}
                        />
                        <Label
                          htmlFor={inputId}
                          className={cn("flex-1 text-foreground", column.locked ? "cursor-default" : "cursor-pointer")}
                        >
                          {column.label}
                        </Label>
                        {column.locked ? <span className="text-xs text-muted-foreground">Always</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
