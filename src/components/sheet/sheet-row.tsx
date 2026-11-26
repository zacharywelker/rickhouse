import * as React from "react";
import { cn } from "@/lib/utils";

/** One row of the data sheet: a small-caps label on the left, the chips beside it (stacked under it on a narrow screen). */
export function SheetRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-x-4 gap-y-1.5 border-b border-border py-3 sm:grid-cols-[7.5rem_minmax(0,1fr)]", className)}>
      <div className="pt-1.5 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2">{children}</div>
    </div>
  );
}
