import * as React from "react";

/**
 * A distillery identified from outside the label: its name in rust, and a small
 * "Inferred" note while a mouse is over it. No word in the table, no underline.
 * Tailwind's hover variant only applies where there is a real pointer, so a tap
 * on a touch screen never leaves the note stuck open.
 */
export function Inferred({ children }: { children: React.ReactNode }) {
  return (
    <span className="group/inferred relative inline-block text-inferred">
      {children}
      {/* Opacity, not display: it stays in the accessibility tree, so a screen
          reader hears "MGP of Indiana, Inferred". */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 whitespace-nowrap border border-border bg-card px-2 py-1 text-xs font-normal text-card-foreground opacity-0 shadow-md group-hover/inferred:opacity-100"
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
