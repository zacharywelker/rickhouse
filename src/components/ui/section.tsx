import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The default container: a ruled section, not a card (DESIGN-BRIEF.MD §9,
 * DESIGN-TOKENS.md §26). Structure comes from a top rule, spacing and type —
 * the same move the StatStrip makes — so there is no box, radius, fill or
 * shadow. Content aligns with the page edge instead of sitting inset in a
 * panel. This replaced the rounded, shadowed `Card` that used to wrap Home,
 * Numbers, every form section and most admin pages.
 */
export function Section({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("border-t border-foreground", className)} {...props} />;
}

export function SectionHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 pb-4 pt-3", className)} {...props} />;
}

export function SectionTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-xl leading-tight tracking-tight", className)} {...props} />;
}

export function SectionDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function SectionContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("pb-2", className)} {...props} />;
}
