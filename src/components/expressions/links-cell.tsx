"use client";

import * as React from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Option } from "@/lib/admin/types";
import { describeLinks, LINK_KINDS, type LinkKind } from "@/lib/expressions/links";
import { OrderedPicker, type LinkedRow } from "./ordered-picker";

/**
 * An ordered list in a single grid cell. The cell shows what is there; the
 * list itself opens as the form's own picker, so order, shares, months and
 * which distillery made each mashbill all work exactly as they do there.
 */
export function LinksCell({
  kind,
  id,
  labelledBy,
  value,
  onChange,
  options,
  distilleryChoices,
  className,
}: {
  kind: LinkKind;
  id: string;
  labelledBy: string;
  value: LinkedRow[];
  onChange: (rows: LinkedRow[]) => void;
  options: Option[];
  /** Mashbills only: the row's distilleries, to attribute each recipe to. */
  distilleryChoices?: Array<{ id: number; name: string }>;
  className?: string;
}) {
  const config = LINK_KINDS[kind];
  const summary =
    value.length === 0 ? "Add…" : value.length === 1 ? value[0]!.label : `${value[0]!.label} +${value.length - 1}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-labelledby={`${labelledBy} ${id}`}
          title={value.length > 0 ? describeLinks(kind, value) : undefined}
          className={cn(
            "h-9 w-full justify-between font-normal",
            value.length === 0 && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(34rem,calc(100vw-2rem))] p-3">
        <OrderedPicker
          name={`${id}-${config.field}`}
          label={config.label}
          description={config.description}
          resource={config.resource}
          options={options}
          amountLabel={config.amountLabel}
          amountSuffix={config.amountSuffix}
          value={value}
          onChange={onChange}
          {...(config.emptyHint ? { emptyHint: config.emptyHint } : {})}
          {...(distilleryChoices ? { distilleryChoices } : {})}
        />
      </PopoverContent>
    </Popover>
  );
}
