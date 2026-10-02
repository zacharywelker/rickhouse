"use client";

import * as React from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMediaQuery } from "@/lib/use-media-query";
import { categoryColorVar } from "@/lib/bottles/category-color";
import { ChartCard } from "./chart-card";
import type { Point, Slice } from "@/lib/dashboard/queries";
import type { YearCount } from "@/lib/dashboard/numbers";
import { BOTTLE_STATUSES } from "@/db/schema";
import { useMoney } from "@/components/currency-context";
import { humanise } from "@/lib/utils";

/** Money and acquisition charts count everything ever acquired, so their links do too. */
const EVER_ACQUIRED = BOTTLE_STATUSES.filter((s) => s !== "wishlist").join(",");

const ACCENT = "var(--viz-accent)";

const axis = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function filterHref(params: Record<string, string>): Route {
  return `/bottles?${new URLSearchParams(params).toString()}` as Route;
}

/** Tooltips wear text tokens; the colour swatch beside them carries identity. */
function Hint({
  active,
  label,
  rows,
}: {
  active?: boolean;
  label?: string;
  rows: Array<{ swatch?: string; name: string; value: string }>;
}) {
  if (!active) return null;
  return (
    <div className="border border-border bg-card px-3 py-2 text-sm shadow-lg">
      {label ? <p className="mb-1 font-medium text-foreground">{label}</p> : null}
      {rows.map((row) => (
        <p key={row.name} className="flex items-center gap-2 text-muted-foreground">
          {row.swatch ? (
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: row.swatch }} aria-hidden="true" />
          ) : null}
          <span>{row.name}</span>
          <span className="ml-auto tabular-nums text-foreground">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Part-to-whole across spirit classes, as one horizontal stacked bar.
 *
 * Horizontal because the category names are words, not codes. Segments carry a
 * 2px surface gap so adjacent fills never blend, every segment is direct-
 * labelled in the legend below — identity is never colour alone — and each
 * segment's colour is the same one that class wears everywhere else in the
 * app (DESIGN-TOKENS.md §7), not an arbitrary chart palette.
 */
export function CategoryShare({ data }: { data: Slice[] }) {
  const router = useRouter();
  const stacked = React.useMemo(() => [Object.fromEntries(data.map((d) => [d.label, d.count]))], [data]);

  const goTo = (slice: Slice) => {
    if (slice.categoryIds.length === 0) return;
    router.push(filterHref({ category: slice.categoryIds.join(",") }));
  };

  return (
    <ChartCard
      title="What the collection is"
      description="Share of bottles by spirit family. Click a class to see its bottles."
      tableHeaders={["Class", "Bottles", "Share"]}
      tableRows={data.map((d) => [d.label, d.count, `${d.share}%`])}
    >
      <div className="flex flex-col gap-3">
        <ResponsiveContainer width="100%" height={56}>
          <BarChart data={stacked} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" hide />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => (
                <Hint
                  active={active}
                  rows={(payload ?? []).map((entry) => ({
                    swatch: String(entry.color),
                    name: String(entry.name),
                    value: `${entry.value} bottle${entry.value === 1 ? "" : "s"}`,
                  }))}
                />
              )}
            />
            {data.map((slice, index) => (
              <Bar
                key={slice.label}
                dataKey={slice.label}
                stackId="share"
                fill={categoryColorVar(slice.fieldGroup)}
                // 2px of surface between segments keeps adjacent fills apart.
                stroke="var(--viz-surface)"
                strokeWidth={2}
                radius={index === 0 ? [4, 0, 0, 4] : index === data.length - 1 ? [0, 4, 4, 0] : 0}
                cursor={slice.categoryIds.length > 0 ? "pointer" : undefined}
                onClick={() => goTo(slice)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>

        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {data.map((slice) => (
            <li key={slice.label} className="flex items-center gap-1.5 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: categoryColorVar(slice.fieldGroup) }}
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => goTo(slice)}
                disabled={slice.categoryIds.length === 0}
                className="text-foreground hover:text-accent disabled:pointer-events-none"
              >
                {slice.label}
              </button>
              <span className="tabular-nums text-muted-foreground">{slice.share}%</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}

/** Bars share one ink: magnitude is the length, not the colour. Square ends, like every other edge here. */
function InkBars<T extends Record<string, unknown>>({
  data,
  x,
  y,
  label,
  format = String,
  onPick,
  layout = "horizontal",
}: {
  data: T[];
  x: string;
  y: string;
  label: (row: T) => string;
  format?: (value: number) => string;
  onPick: (row: T) => void;
  layout?: "horizontal" | "vertical";
}) {
  const narrow = useMediaQuery("(max-width: 640px)");
  const vertical = layout === "vertical";
  return (
    <ResponsiveContainer width="100%" height={vertical ? Math.max(120, data.length * 34) : 220}>
      <BarChart
        data={data}
        layout={vertical ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 16, bottom: 0, left: vertical ? 0 : -12 }}
      >
        <CartesianGrid vertical={vertical} horizontal={!vertical} stroke="var(--viz-grid)" />
        {vertical ? (
          <>
            <XAxis type="number" allowDecimals={false} {...axis} tickFormatter={format} />
            <YAxis type="category" dataKey={x} width={narrow ? 84 : 110} {...axis} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} {...axis} minTickGap={16} />
            <YAxis allowDecimals={false} {...axis} tickFormatter={format} />
          </>
        )}
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as T | undefined;
            return row ? <Hint active={active} rows={[{ name: label(row), value: format(Number((row as Record<string, unknown>)[y])) }]} /> : null;
          }}
        />
        <Bar dataKey={y} fill={ACCENT} maxBarSize={vertical ? 22 : 44} cursor="pointer" onClick={(bar) => onPick(bar.payload as T)} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** Sealed bottles by the year they came home: how old the unopened pile is. */
export function SealedByYear({ data }: { data: YearCount[] }) {
  const router = useRouter();
  return (
    <ChartCard
      title="Sealed bottles, by year acquired"
      description="Click a year to see its bottles."
      tableHeaders={["Year", "Sealed"]}
      tableRows={data.map((d) => [d.year, d.count])}
    >
      <InkBars
        data={data}
        x="year"
        y="count"
        label={(row) => `${row.year}: ${plural(row.count, "sealed bottle")}`}
        onPick={(row) =>
          router.push(filterHref({ open: "closed", acquiredFrom: `${row.year}-01-01`, acquiredTo: `${row.year}-12-31` }))
        }
      />
    </ChartCard>
  );
}

/** Spend per month over the last two years, gaps kept so quiet months show as quiet. */
export function SpendByMonth({ data }: { data: Point[] }) {
  const router = useRouter();
  const formatMoney = useMoney();
  const money = (value: number) => formatMoney(String(Math.round(value)));
  return (
    <ChartCard
      title="Spend by month"
      description="What was paid for bottles acquired each month. Click a month to see them."
      tableHeaders={["Month", "Bottles", "Spend"]}
      tableRows={data.map((d) => [d.month, d.count, formatMoney(String(d.spend))])}
    >
      <InkBars
        data={data}
        x="month"
        y="spend"
        format={money}
        label={(row) => `${row.month}, ${plural(row.count, "bottle")}`}
        onPick={(row) => {
          const [year, month] = row.month.split("-").map(Number) as [number, number];
          const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
          router.push(
            filterHref({
              status: EVER_ACQUIRED,
              acquiredFrom: `${row.month}-01`,
              acquiredTo: `${row.month}-${String(last).padStart(2, "0")}`,
            }),
          );
        }}
      />
    </ChartCard>
  );
}

/** How bottles arrived. Horizontal, because the kinds are words. */
export function AcquisitionMix({ data }: { data: Array<{ kind: string; count: number }> }) {
  const router = useRouter();
  const rows = data.map((d) => ({ ...d, label: humanise(d.kind) }));
  return (
    <ChartCard
      title="How bottles arrived"
      description="Every bottle ever acquired, by how it came. Click a bar to see them."
      tableHeaders={["Acquired as", "Bottles"]}
      tableRows={rows.map((d) => [d.label, d.count])}
    >
      <InkBars
        data={rows}
        x="label"
        y="count"
        layout="vertical"
        label={(row) => `${row.label}: ${plural(row.count, "bottle")}`}
        onPick={(row) => router.push(filterHref({ status: EVER_ACQUIRED, acq: row.kind }))}
      />
    </ChartCard>
  );
}
