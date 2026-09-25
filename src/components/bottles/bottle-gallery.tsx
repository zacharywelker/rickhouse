"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Layers, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumeric, humanise } from "@/lib/utils";
import type { GridRow } from "@/lib/bottles/grid";
import { FillGauge } from "./fill-gauge";

/** A slight, deterministic stagger per stack position — never dead straight. */
const STACK_TILT = ["-rotate-3", "rotate-2", "-rotate-1"];

function BottleTile({ row }: { row: GridRow }) {
  return (
    <Link
      href={`/bottles/${row.id}`}
      className="group flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50"
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
          <FillGauge
            value={row.fillPct}
            readOnly
            fieldGroup={row.fieldGroup}
            height={130}
            label={`${row.expressionName} fill`}
          />
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
  );
}

/**
 * Same Label, more than one bottle: the database sees N rows, the gallery
 * sees a family (SPEC §18). Collapsed, it's a small stack of photos rather
 * than N identical cards; a click fans it out into the individual bottles,
 * right there in the grid.
 */
function FamilyCluster({ rows, onExpand }: { rows: GridRow[]; onExpand: () => void }) {
  const front = rows.find((r) => r.isFavorite && r.thumbPath) ?? rows.find((r) => r.thumbPath) ?? rows[0]!;
  const behind = rows.filter((r) => r.id !== front.id).slice(0, 2);

  return (
    <button
      type="button"
      onClick={onExpand}
      className="group flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary/50"
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted/40 p-4">
        {behind.map((row, i) => (
          <div
            key={row.id}
            className={cn(
              "absolute inset-4 rounded-md border border-border bg-card shadow-md",
              STACK_TILT[i % STACK_TILT.length],
            )}
          >
            {row.thumbPath ? (
              <Image src={`/api/images/${row.thumbPath}`} alt="" fill unoptimized className="rounded-md object-cover" />
            ) : null}
          </div>
        ))}
        <div className="absolute inset-4 rounded-md border border-border bg-card shadow-lg">
          {front.thumbPath ? (
            <Image src={`/api/images/${front.thumbPath}`} alt="" fill unoptimized className="rounded-md object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center">
              <FillGauge
                value={front.fillPct}
                readOnly
                fieldGroup={front.fieldGroup}
                height={110}
                label={`${front.expressionName} fill`}
              />
            </div>
          )}
        </div>
        <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium tabular-nums text-white">
          {rows.length} bottles
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-xs text-muted-foreground">{front.brand}</p>
        <p className="font-medium leading-tight group-hover:text-accent">{front.expressionName}</p>
        <p className="text-xs text-muted-foreground">Tap to see all {rows.length}</p>
      </div>
    </button>
  );
}

/** Sits at the front of an expanded family so fanning it out isn't a one-way trip. */
function CollapseTile({ brand, expressionName, onCollapse }: { brand: string; expressionName: string; onCollapse: () => void }) {
  return (
    <button
      type="button"
      onClick={onCollapse}
      className="group flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-center text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
    >
      <Layers className="size-6" />
      <span className="text-xs">
        Regroup {brand} <span className="font-medium">{expressionName}</span>
      </span>
    </button>
  );
}

/** The same filtered set as the table, shown as photos (SPEC M4). */
export function BottleGallery({ rows }: { rows: GridRow[] }) {
  const [expanded, setExpanded] = React.useState<ReadonlySet<number>>(new Set());

  const families = React.useMemo(() => {
    const byExpression = new Map<number, GridRow[]>();
    for (const row of rows) {
      const group = byExpression.get(row.expressionId);
      if (group) group.push(row);
      else byExpression.set(row.expressionId, [row]);
    }
    return byExpression;
  }, [rows]);

  const seen = new Set<number>();

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {rows.map((row) => {
        if (seen.has(row.expressionId)) return null;
        seen.add(row.expressionId);

        const family = families.get(row.expressionId)!;
        if (family.length === 1) {
          return (
            <li key={row.id}>
              <BottleTile row={row} />
            </li>
          );
        }

        if (expanded.has(row.expressionId)) {
          return [
            <li key={`${row.expressionId}-collapse`}>
              <CollapseTile
                brand={row.brand}
                expressionName={row.expressionName}
                onCollapse={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    next.delete(row.expressionId);
                    return next;
                  })
                }
              />
            </li>,
            ...family.map((member) => (
              <li key={member.id}>
                <BottleTile row={member} />
              </li>
            )),
          ];
        }

        return (
          <li key={row.expressionId}>
            <FamilyCluster
              rows={family}
              onExpand={() => setExpanded((prev) => new Set(prev).add(row.expressionId))}
            />
          </li>
        );
      })}
    </ul>
  );
}
