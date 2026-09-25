"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { formatMoney, formatNumeric } from "@/lib/utils";
import type { ExpressionRow } from "@/lib/expressions/queries";

/**
 * Mirrors the bottle grid's double-click-to-open (SPEC M8): the row opens
 * the label's edit page, skipped when the pointer is on something that
 * already does its own thing or there is a text selection to preserve.
 */
function openOnDoubleClick(event: React.MouseEvent, router: ReturnType<typeof useRouter>, id: number) {
  if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea, [role='slider']")) {
    return;
  }
  if ((window.getSelection()?.toString() ?? "") !== "") return;
  router.push(`/expressions/${id}/edit` as Route);
}

export function LabelTableBody({
  rows,
  unlocked,
  selectedIds,
  onToggle,
}: {
  rows: ExpressionRow[];
  unlocked: boolean;
  selectedIds: ReadonlySet<number>;
  onToggle: (id: number, selected: boolean) => void;
}) {
  const router = useRouter();

  return (
    <TableBody>
      {rows.map((row) => (
        <TableRow
          key={row.id}
          onDoubleClick={(event) => !unlocked && openOnDoubleClick(event, router, row.id)}
          className={unlocked ? undefined : "cursor-pointer"}
        >
          {unlocked ? (
            <TableCell>
              <Checkbox
                checked={selectedIds.has(row.id)}
                onCheckedChange={(value) => onToggle(row.id, Boolean(value))}
                aria-label={`Select ${row.brand} ${row.name}`}
              />
            </TableCell>
          ) : null}
          <TableCell className="hidden font-medium sm:table-cell">{row.brand}</TableCell>
          <TableCell>
            {/* Brand folds in here on a phone; the edit link is the only
                way into a label, so it must never be squeezed off. */}
            <span className="block text-xs text-muted-foreground sm:hidden">{row.brand}</span>
            <span className="text-accent">{row.name}</span>
            {row.pickCount > 0 ? (
              <Badge className="ml-2 border-primary/40 text-primary">
                {row.pickCount} pick{row.pickCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </TableCell>
          <TableCell className="hidden sm:table-cell">{row.category}</TableCell>
          <TableCell className="text-right tabular-nums">{formatNumeric(row.proof)}</TableCell>
          <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMoney(row.msrp)}</TableCell>
          <TableCell className="text-right tabular-nums">{row.bottleCount}</TableCell>
          <TableCell className="text-right">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/expressions/${row.id}/edit`} aria-label={`Edit ${row.brand} ${row.name}`}>
                <Pencil className="size-4" />
              </Link>
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}
