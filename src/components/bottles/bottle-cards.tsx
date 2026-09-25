"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { Star } from "lucide-react";
import { cn, formatMoney, formatNumeric } from "@/lib/utils";
import { categorySwatchClass } from "@/lib/bottles/category-color";
import type { GridRow } from "@/lib/bottles/grid";
import { FillGauge } from "./fill-gauge";
import { StatusMark } from "./status-mark";

/**
 * The grid, below 768px (SPEC M6). A fourteen-column table on a phone is
 * either a sideways scroll or unreadable text, so the same rows become cards:
 * the identity up top, the numbers you actually compare on underneath, and
 * the gauge kept because it is the fastest read on the whole page.
 *
 * Column visibility deliberately does not apply here. It exists to make a wide
 * table fit; a card already shows only what fits, and honouring a hidden
 * column would silently blank a field the phone had room for.
 */
export function BottleCards({ rows }: { rows: GridRow[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/bottles/${row.id}` as Route}
            className="flex gap-3 border border-border bg-card p-3 transition-colors hover:border-primary/40"
          >
            {row.thumbPath ? (
              <Image
                src={`/api/images/${row.thumbPath}`}
                alt=""
                width={56}
                height={56}
                unoptimized
                className="size-14 shrink-0 border border-border object-cover"
              />
            ) : (
              <FillGauge value={row.fillPct} readOnly decorative fieldGroup={row.fieldGroup} height={56} />
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-muted-foreground">{row.brand}</p>
              <p className="flex items-center gap-1 font-medium leading-tight">
                <span className="truncate">{row.expressionName}</span>
                {row.isFavorite ? (
                  <Star className="size-3.5 shrink-0 fill-accent text-accent" aria-label="Favorite" />
                ) : null}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                <span
                  className={cn("size-2 shrink-0 rounded-full", categorySwatchClass(row.fieldGroup))}
                  aria-hidden="true"
                />
                <span className="truncate">
                  {[row.category, row.proof ? `${formatNumeric(row.proof)} proof` : null, row.ageStatement]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <StatusMark status={row.status} className="text-muted-foreground" />
                <span className="tabular-nums text-muted-foreground">{row.fillPct}% full</span>
                {row.pricePaid ? <span className="tabular-nums">{formatMoney(row.pricePaid)}</span> : null}
                {row.avgRating ? (
                  <span className="tabular-nums text-accent">{Number(row.avgRating)}/10</span>
                ) : null}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
