"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Layers, Star } from "lucide-react";
import { categoryColor } from "@/lib/bottles/category-palette";
import { ageLabel } from "@/lib/expressions/display";
import { cn, formatNumeric } from "@/lib/utils";
import type { GridRow } from "@/lib/bottles/grid";
import { FillGauge } from "./fill-gauge";

/** A slight, deterministic stagger per stack position — never dead straight. */
const STACK_TILT = ["-rotate-3", "rotate-2", "-rotate-1"];

/** The brand is dropped from the title when the name already starts with it. */
function tileTitle(row: GridRow): string {
  return row.expressionName.toLowerCase().startsWith(row.brand.toLowerCase())
    ? row.expressionName
    : `${row.brand} ${row.expressionName}`;
}

/** Proof, then age, then where it was bought — a slot is never blank (DESIGN.md §4.3). */
function tileFacts(row: GridRow): string[] {
  const facts: string[] = [];
  if (row.proof) facts.push(`${formatNumeric(row.proof)} proof`);
  const age = ageLabel(row);
  if (age) facts.push(age);
  if (row.batch) facts.push(row.batch);
  if (facts.length === 0) facts.push(row.category);
  return facts.slice(0, 2);
}

/**
 * The photo in a category-coloured plate with an ink hairline, in a fixed 3:4
 * slot. The photo is scaled to fit (never cropped), so the whole bottle shows
 * whatever its own shape. A thin gauge on the right edge shows how full it is.
 */
function Frame({ row, children }: { row: GridRow; children?: React.ReactNode }) {
  const color = categoryColor(row.category);
  return (
    <div
      className="relative aspect-[3/4] border border-foreground p-2"
      style={{ backgroundColor: color.hex }}
    >
      <div className="relative size-full overflow-hidden">
        {row.thumbPath ? (
          <Image
            src={`/api/images/${row.thumbPath}`}
            alt=""
            fill
            unoptimized
            className="object-contain p-1"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <FillGauge
              value={row.fillPct}
              readOnly
              fieldGroup={row.fieldGroup}
              height={130}
              label={`${row.expressionName} fill`}
            />
          </div>
        )}
      </div>
      <span
        aria-hidden
        className="absolute bottom-2 right-0.5 top-2 w-[3px] overflow-hidden rounded-full bg-paper/75"
      >
        <span
          className="absolute inset-x-0 bottom-0 bg-foreground"
          style={{ height: `${Math.max(0, Math.min(100, row.fillPct))}%` }}
        />
      </span>
      {row.isFavorite ? (
        <Star className="absolute left-2 top-2 size-4 fill-foreground text-foreground" aria-label="Favorite" />
      ) : null}
      {children}
    </div>
  );
}

function CategoryLine({ category }: { category: string }) {
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
      <span
        aria-hidden
        className="size-2 shrink-0 border border-foreground"
        style={{ backgroundColor: categoryColor(category).hex }}
      />
      <span className="truncate">{category}</span>
    </p>
  );
}

function BottleTile({ row }: { row: GridRow }) {
  const facts = tileFacts(row);
  return (
    <Link href={`/bottles/${row.id}`} className="group flex h-full w-full flex-col">
      <Frame row={row} />
      <p className="mt-2 line-clamp-2 min-h-[2lh] text-[13px] font-semibold leading-snug group-hover:text-accent">
        {tileTitle(row)}
      </p>
      <CategoryLine category={row.category} />
      {facts.map((fact, i) => (
        <p
          key={fact}
          className={cn(
            "truncate text-xs tabular-nums",
            i === 0 ? "mt-1 font-medium" : "text-muted-foreground",
          )}
        >
          {fact}
        </p>
      ))}
    </Link>
  );
}

/**
 * Same Label, more than one bottle: the database sees N rows, the gallery
 * sees a family (SPEC §18). Collapsed, it's a small stack of frames rather
 * than N identical cards; a click fans it out into the individual bottles,
 * right there in the grid.
 */
function FamilyCluster({ rows, onExpand }: { rows: GridRow[]; onExpand: () => void }) {
  const front = rows.find((r) => r.isFavorite && r.thumbPath) ?? rows.find((r) => r.thumbPath) ?? rows[0]!;
  const behind = rows.filter((r) => r.id !== front.id).slice(0, 2);

  return (
    <button type="button" onClick={onExpand} className="group flex h-full w-full flex-col text-left">
      <div className="relative aspect-[3/4]">
        {behind.map((row, i) => (
          <div
            key={row.id}
            className={cn("absolute inset-0 shadow-md", STACK_TILT[i % STACK_TILT.length])}
          >
            <Frame row={row} />
          </div>
        ))}
        <div className="absolute inset-0 shadow-lg">
          <Frame row={front}>
            <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium tabular-nums text-white">
              {rows.length} bottles
            </span>
          </Frame>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 min-h-[2lh] text-[13px] font-semibold leading-snug group-hover:text-accent">
        {tileTitle(front)}
      </p>
      <CategoryLine category={front.category} />
      <p className="mt-1 text-xs font-medium">See all {rows.length}</p>
    </button>
  );
}

/** Sits at the front of an expanded family so fanning it out isn't a one-way trip. */
function CollapseTile({ brand, expressionName, onCollapse }: { brand: string; expressionName: string; onCollapse: () => void }) {
  return (
    <button
      type="button"
      onClick={onCollapse}
      className="group flex h-full w-full flex-col items-center justify-center gap-2 border border-dashed border-border p-4 text-center text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
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
    <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
