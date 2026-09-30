import * as React from "react";

/**
 * A distillery identified from outside the label: its name in rust, followed
 * by "(inferred)". Plain text, so it needs no hover and works on a phone.
 */
export function Inferred({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-inferred">
      {children} (inferred)
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
