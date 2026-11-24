"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { Menu, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NARROW_QUERY, PLACES, isCurrent } from "@/components/nav/nav-items";
import { NavSearch } from "@/components/nav/nav-search";
import { OPEN_SEARCH_EVENT } from "@/lib/nav-search/shortcuts";

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
  userMenu,
  accountPanel,
  wide = false,
}: {
  /** The name and its popover, from 720px up. */
  userMenu: React.ReactNode;
  /** The same account sections, rendered under the places in the narrow menu panel. */
  accountPanel: React.ReactNode;
  wide?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  // Below 720px the search takes over the bar.
  const [searchOpen, setSearchOpen] = React.useState(false);

  // ⌘K or "/" on a narrow screen opens the takeover; on a wide one the inline field answers the same event itself.
  React.useEffect(() => {
    const onOpenSearch = () => {
      if (window.matchMedia(NARROW_QUERY).matches) {
        setOpen(false);
        setSearchOpen(true);
      }
    };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenSearch);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, onOpenSearch);
  }, []);

  // Navigating closes the panel, including from a link inside the account sections.
  const [prevPathname, setPrevPathname] = React.useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
    setSearchOpen(false);
  }

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
    <header className="relative border-b border-border">
      {searchOpen ? (
        <div className={cn("mx-auto flex w-full items-center px-4 py-2 sm:px-6 min-[720px]:hidden", !wide && "max-w-page")}>
          <NavSearch variant="takeover" onClose={() => setSearchOpen(false)} />
        </div>
      ) : null}
      <div className={cn("mx-auto flex w-full items-center gap-6 px-4 py-3 sm:px-6", !wide && "max-w-page", searchOpen && "max-[719px]:hidden")}>
        <Link href="/bottles" className="text-lg font-bold uppercase tracking-wide text-foreground">
          Rickhouse
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-5 min-[720px]:flex">
          {PLACES.map((item) => desktopLink(item.href, item.label))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden min-[720px]:block">
            <NavSearch variant="inline" />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 min-w-11 min-[720px]:hidden"
            aria-label="Search"
            title="Search"
            onClick={() => {
              setOpen(false);
              setSearchOpen(true);
            }}
          >
            <Search className="size-4" aria-hidden />
          </Button>
          <div className="hidden min-[720px]:block">{userMenu}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 min-w-11 min-[720px]:hidden"
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
        <div id="mobile-nav" className={cn("mx-auto w-full border-t border-border min-[720px]:hidden", !wide && "max-w-page")}>
          <nav aria-label="Main" className="flex flex-col gap-1 px-4 py-3">
            {PLACES.map((item) => mobileLink(item.href, item.label))}
          </nav>
          <div className="border-t border-border px-4 py-3">{accountPanel}</div>
        </div>
      ) : null}
    </header>
  );
}
