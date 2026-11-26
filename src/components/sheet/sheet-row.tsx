import * as React from "react";
import { cn } from "@/lib/utils";

/** One row of the data sheet (the mockup's `.r`): a 10px small-caps label in a 104px column, the chips beside it, a hairline under. */
export function SheetRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid items-start gap-x-2.5 gap-y-1 border-b border-border py-1.5 sm:grid-cols-[104px_minmax(0,1fr)]", className)}>
      <div className="pt-[7px] text-[10px] uppercase leading-[1.35] tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** The quiet "More:" line (the mockup's `.quiet`): links that each open something rare, until it is opened or has a value. */
export function MoreLine({ items }: { items: ReadonlyArray<{ id: string; label: string; opened: boolean; content: React.ReactNode }> }) {
  const [shown, setShown] = React.useState<ReadonlySet<string>>(new Set());
  const visible = items.filter((item) => item.opened || shown.has(item.id));
  const links = items.filter((item) => !visible.includes(item));
  return (
    <>
      {visible.map((item) => <div key={item.id} className="border-b border-border py-1.5">{item.content}</div>)}
      {links.length > 0 ? (
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 py-[7px] text-[12px] text-muted-foreground">
          <span>More:</span>
          {links.map((item) => (
            <button key={item.id} type="button" onClick={() => setShown((prev) => new Set(prev).add(item.id))} className="text-foreground underline">{item.label}</button>
          ))}
        </div>
      ) : null}
    </>
  );
}
