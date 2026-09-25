"use client";

import * as React from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMediaQuery } from "@/lib/use-media-query";
import { categoryColorVar } from "@/lib/bottles/category-color";
import { ChartCard } from "./chart-card";
import type { Bin, Point, Ranked, Slice } from "@/lib/dashboard/queries";
import { formatMoney } from "@/lib/utils";

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

/** One measure, so one hue. Magnitude is the bar height, not the colour. */
export function ProofDistribution({ data }: { data: Bin[] }) {
  const router = useRouter();
  return (
    <ChartCard
      title="Proof distribution"
      description="Bottles grouped into ten-proof bands. Click a band to see its bottles."
      tableHeaders={["Proof", "Bottles"]}
      tableRows={data.map((d) => [d.label, d.count])}
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload, label }) => (
              <Hint
                active={active}
                label={`${label} proof`}
                rows={[{ name: "Bottles", value: String(payload?.[0]?.value ?? 0) }]}
              />
            )}
          />
          <Bar
            dataKey="count"
            fill={ACCENT}
            radius={[4, 4, 0, 0]}
            maxBarSize={44}
            cursor="pointer"
            onClick={(bar) => {
              const bin = bar.payload as Bin;
              router.push(filterHref({ proofMin: String(bin.min), proofMax: String(bin.max) }));
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function Acquisitions({ data }: { data: Point[] }) {
  return (
    <ChartCard
      title="Acquisitions over time"
      description="Bottles added each month, and what they cost."
      tableHeaders={["Month", "Bottles", "Spend"]}
      tableRows={data.map((d) => [d.month, d.count, formatMoney(String(d.spend))])}
    >
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="acq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.45} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="month" {...axis} minTickGap={24} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              const point = payload?.[0]?.payload as Point | undefined;
              return (
                <Hint
                  active={active}
                  label={String(label)}
                  rows={[
                    { name: "Bottles", value: String(point?.count ?? 0) },
                    { name: "Spend", value: formatMoney(String(point?.spend ?? 0)) },
                  ]}
                />
              );
            }}
          />
          {/* Stepped, not smoothed: a month's count is a discrete value, and a curve
              between two months would draw bottles that were never bought. */}
          <Area type="stepAfter" dataKey="count" stroke={ACCENT} strokeWidth={2} fill="url(#acq)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Horizontal, because distillery names are long. One hue; length is the data. */
/*
 * Ellipsis rather than a clipped word: "Bardstown Bourbo…" beats "ardstown".
 * The character budget is set so the text always renders narrower than the
 * axis gutter — Recharts wraps a tick that does not fit and then clips the
 * second line, which is worse than either.
 */
function truncate(label: string, max: number) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export function TopDistilleries({ data }: { data: Ranked[] }) {
  const router = useRouter();
  // A 150px label gutter eats half a phone screen, so the axis narrows and the
  // names truncate instead of overflowing the card.
  const narrow = useMediaQuery("(max-width: 640px)");
  return (
    <ChartCard
      title="Most represented distilleries"
      description="Counting every blend a distillery contributed to, not only the bottles it made alone. Click a bar to see its bottles."
      tableHeaders={["Distillery", "Bottles"]}
      tableRows={data.map((d) => [d.label, d.count])}
    >
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
          <XAxis type="number" allowDecimals={false} {...axis} />
          <YAxis
            type="category"
            dataKey="label"
            width={narrow ? 96 : 190}
            tickFormatter={(label: string) => truncate(label, narrow ? 13 : 26)}
            {...axis}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload, label }) => (
              <Hint
                active={active}
                label={String(label)}
                rows={[{ name: "Bottles", value: String(payload?.[0]?.value ?? 0) }]}
              />
            )}
          />
          <Bar
            dataKey="count"
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            cursor="pointer"
            onClick={(bar) => {
              const row = bar.payload as Ranked;
              router.push(filterHref({ distillery: String(row.id) }));
            }}
          >
            {data.map((row) => (
              <Cell key={row.label} fill={ACCENT} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
