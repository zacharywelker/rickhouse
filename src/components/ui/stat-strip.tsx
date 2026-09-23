import * as React from "react";

export type StatItem = { label: string; value: React.ReactNode };

/**
 * The Swiss instrument-panel read for a row of top-line numbers (DESIGN-BRIEF.MD
 * §9: hierarchy from typography, spacing and rules, not a box around
 * everything). A thick top rule plus thin dividers between items, no card, no
 * radius, no shadow — replaces the identical rounded-card `Stat` tile that used
 * to be copy-pasted into bottles/page.tsx, page.tsx and entity-page.tsx.
 */
export function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <div
      className={`stat-strip border-t-2 border-foreground ${className ?? ""}`}
      style={{ "--stat-cols": items.length } as React.CSSProperties}
    >
      {items.map((item) => (
        <div key={item.label}>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <p className="m-0 mt-0.5 text-[32px] font-bold tabular-nums leading-tight">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
