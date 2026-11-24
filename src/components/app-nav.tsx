"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { NARROW_QUERY, PLACES, isCurrent } from "@/components/nav/nav-items";

/**
 * The header nav (DESIGN.md §7, docs/superpowers/specs/2026-11-23-web-navigation-redesign-design.md).
 * The four main places sit in the bar from 720px up, which includes half of a
 * 16" MacBook Pro (~864px). Below that they collapse behind a Menu button
 * rather than wrapping or scrolling sideways.
 *
 * A disclosure, not a modal: Escape closes it, navigating closes it, and the
 * page behind stays readable and scrollable.
 *
 * Typographic, not iconography or a filled pill (DESIGN.md §7: "stable,
 * predictable, typographic, grid-aligned, restrained"). Current page reads
 * from a rule, not a background fill.
 */
/** `wide`: the bar spans the whole window instead of the page column, for a page that does (the bulk editor). */
export function AppNav({
  signOut,
  userMenu,
  accountPanel,
  wide = false,
}: {
  signOut: React.ReactNode;
  userMenu: React.ReactNode;
  /** Rendered under the places in the narrow menu panel (Task 2 supplies it). */
  accountPanel?: React.ReactNode;
  wide?: boolean;
}) {
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
    const query = window.matchMedia(NARROW_QUERY);
    const onChange = () => {
      if (!query.matches) setOpen(false);
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
      <div className={cn("mx-auto flex w-full items-center gap-6 px-4 py-3 sm:px-6", !wide && "max-w-page")}>
        <Link href="/bottles" className="text-lg font-bold uppercase tracking-wide text-foreground">
          Rickhouse
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-5 min-[720px]:flex">
          {PLACES.map((item) => desktopLink(item.href, item.label))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* On a phone the three-way toggle moves into the menu panel, so the
              name and sign-out still fit beside the logo at 390px. */}
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          {userMenu}
          {signOut}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-[720px]:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            title={open ? "Close menu" : "Open menu"}
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
          className={cn("mx-auto flex w-full flex-col gap-1 border-t border-border px-4 py-3 min-[720px]:hidden", !wide && "max-w-page")}
        >
          {PLACES.map((item) => mobileLink(item.href, item.label))}
          <div className="mt-2 border-t border-border pt-3 sm:hidden">
            <ThemeToggle />
          </div>
          {accountPanel}
        </nav>
      ) : null}
    </header>
  );
}
