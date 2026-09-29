import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A distillery identified from outside the label. Coloured (the system "info"
 * blue, since category colours mean spirit types) and dotted-underlined so it
 * does not rely on colour alone; hovering or focusing it says "Inferred", so
 * the table spends no width on the word.
 */
export function Inferred({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      tabIndex={0}
      className={cn(
        "group/inferred relative inline-block cursor-help text-info underline decoration-dotted underline-offset-2",
        className,
      )}
    >
      {children}
      {/* Opacity, not display: it stays in the accessibility tree, so a screen
          reader hears "MGP of Indiana, Inferred". */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 whitespace-nowrap border border-border bg-card px-2 py-1 text-xs font-normal text-card-foreground no-underline opacity-0 shadow-md group-hover/inferred:opacity-100 group-focus/inferred:opacity-100"
      >
        Inferred
      </span>
    </span>
  );
}

/** A label's distilleries as a comma-separated run, with the inferred ones marked. */
export function DistilleryNames({ links }: { links: ReadonlyArray<{ name: string; inferred: boolean }> | null }) {
  if (!links || links.length === 0) return <>—</>;
  return (
    <>
      {links.map((link, index) => (
        <React.Fragment key={`${link.name}-${index}`}>
          {index > 0 ? ", " : null}
          {link.inferred ? <Inferred>{link.name}</Inferred> : link.name}
        </React.Fragment>
      ))}
    </>
  );
}
