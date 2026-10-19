"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { FieldCandidate } from "@/lib/tournaments/field";

/** The bottles a search found, one hairline row each: checkbox and name, then category and status, proof and tastings in tabular figures. */
export function FieldResults({
  rows,
  chosen,
  onToggle,
}: {
  rows: FieldCandidate[];
  chosen: ReadonlySet<number>;
  onToggle: (row: FieldCandidate) => void;
}) {
  return (
    <ul className="max-h-[30rem] overflow-y-auto border-b border-border" aria-label="Bottles">
      {rows.map((row) => {
        const id = `field-bottle-${row.bottleId}`;
        return (
          <li key={row.bottleId} className="border-t border-border">
            <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5 hover:bg-muted/50">
              <Checkbox id={id} checked={chosen.has(row.bottleId)} onCheckedChange={() => onToggle(row)} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug">{row.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {row.category} · {row.isOpen ? "open" : row.status}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                <span className="block">{row.proof === null ? "no proof" : `${row.proof} proof`}</span>
                <span className="block">{row.tastings === 0 ? "untasted" : `${row.tastings} tasting${row.tastings === 1 ? "" : "s"}`}</span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
