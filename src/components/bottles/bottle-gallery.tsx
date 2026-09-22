"use client";

import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatNumeric, humanise } from "@/lib/utils";
import type { GridRow } from "@/lib/bottles/grid";
import { FillGauge } from "./fill-gauge";

/** The same filtered set as the table, shown as photos (SPEC M4). */
export function BottleGallery({ rows }: { rows: GridRow[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/bottles/${row.id}`}
            className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50"
          >
            <div className="relative flex aspect-square items-center justify-center bg-muted/40">
              {row.thumbPath ? (
                <Image
                  src={`/api/images/${row.thumbPath}`}
                  alt=""
                  width={480}
                  height={480}
                  unoptimized
                  className="size-full object-cover"
                />
              ) : (
                <FillGauge value={row.fillPct} readOnly height={130} label={`${row.expressionName} fill`} />
              )}
              {row.isFavorite ? (
                <Star className="absolute right-2 top-2 size-4 fill-accent text-accent" aria-label="Favorite" />
              ) : null}
              {row.thumbPath ? (
                <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs tabular-nums text-white">
                  {row.fillPct}%
                </span>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3">
              <p className="text-xs text-muted-foreground">{row.brand}</p>
              <p className="font-medium leading-tight group-hover:text-accent">{row.expressionName}</p>
              <p className="text-xs text-muted-foreground">
                {formatNumeric(row.proof)} proof
                {row.batch ? ` · ${row.batch}` : ""}
              </p>
              <Badge className={`mt-auto w-fit ${row.isOpen ? "border-primary/40 text-primary" : ""}`}>
                {humanise(row.status)}
              </Badge>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
