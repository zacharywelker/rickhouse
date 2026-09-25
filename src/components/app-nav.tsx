"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Canonical nav per docs/DESIGN.md §14: Home · Collection · Labels · Groups ·
 * Numbers · Settings.
 * "Configuration" stays as-is rather than becoming "Settings": it's
 * reference-data CRUD (distilleries, brands, stores…), not the personalization
 * settings DESIGN.md means by that name, which doesn't exist yet either.
 */
const LINKS = [
  { href: "/", label: "Home" },
  { href: "/bottles", label: "Collection" },
  { href: "/expressions", label: "Labels" },
  { href: "/groups", label: "Groups" },
  { href: "/numbers", label: "Numbers" },
  { href: "/admin", label: "Configuration" },
] as const;

/** Home only matches exactly; everything else matches its subtree. */
function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The header nav. Six links do not fit on a phone, and letting them overflow
 * is what made every page 597px wide on a 390px screen — so under `md` they
 * collapse behind a disclosure rather than wrapping or scrolling sideways.
 * The cut-off is `lg`, not `md`: the full row needs ~905px, so at `md`
 * every iPad in portrait (768–834px) scrolled sideways.
 *
 * A disclosure, not a modal: Escape closes it, navigating closes it, and the
 * page behind stays readable and scrollable.
 *
 * Typographic, not iconography or a filled pill (DESIGN.md §14.1: "stable,
 * predictable, typographic, grid-aligned, restrained"). Current page reads
 * from a rule, not a background fill — Rickhouse leans on rules and spacing
 * for hierarchy rather than card/pill chrome (DESIGN.md §7).
 */
export function AppNav({ signOut }: { signOut: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Escape closes, matching every other dismissable surface in the app.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // A resize past the breakpoint leaves the panel stranded open otherwise.
  React.useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (query.matches) setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const desktopLink = (href: string, label: string) => (
    <Link
      key={href}
      href={href as Route}
      aria-current={isCurrent(pathname, href) ? "page" : undefined}
      onClick={() => setOpen(false)}
      className={cn(
        "border-b-2 px-1 py-1 text-sm font-medium uppercase tracking-wide transition-colors",
        isCurrent(pathname, href)
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  const mobileLink = (href: string, label: string) => (
    <Link
      key={href}
      href={href as Route}
      aria-current={isCurrent(pathname, href) ? "page" : undefined}
      onClick={() => setOpen(false)}
      className={cn(
        "border-l-2 px-3 py-2.5 text-base font-medium uppercase tracking-wide transition-colors",
        isCurrent(pathname, href)
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-page items-center gap-6 px-4 py-3 sm:px-6">
        <Link href="/" className="text-lg font-bold uppercase tracking-wide text-foreground">
          Rickhouse
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-5 lg:flex">
          {LINKS.map((item) => desktopLink(item.href, item.label))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden lg:block">{signOut}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="mx-auto flex w-full max-w-page flex-col gap-1 border-t border-border px-4 py-3 lg:hidden"
        >
          {LINKS.map((item) => mobileLink(item.href, item.label))}
          <div className="mt-2 border-t border-border pt-3">{signOut}</div>
        </nav>
      ) : null}
    </header>
  );
}
