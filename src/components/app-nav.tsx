"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { BarChart3, FlaskConical, House, Library, Menu, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Home", icon: House },
  { href: "/bottles", label: "Collection", icon: Library },
  { href: "/expressions", label: "Labels", icon: FlaskConical },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/admin", label: "Configuration", icon: SlidersHorizontal },
] as const;

/** Home only matches exactly; everything else matches its subtree. */
function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The header nav. Five links do not fit on a phone, and letting them overflow
 * is what made every page 597px wide on a 390px screen — so under `md` they
 * collapse behind a disclosure rather than wrapping or scrolling sideways.
 *
 * A disclosure, not a modal: Escape closes it, navigating closes it, and the
 * page behind stays readable and scrollable.
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
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (query.matches) setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const link = (href: string, label: string, Icon: (typeof LINKS)[number]["icon"], stacked: boolean) => (
    <Link
      key={href}
      href={href as Route}
      aria-current={isCurrent(pathname, href) ? "page" : undefined}
      onClick={() => setOpen(false)}
      className={cn(
        "flex items-center gap-2 rounded-md transition-colors hover:bg-muted hover:text-foreground",
        stacked ? "px-3 py-2.5 text-base" : "px-3 py-1.5 text-sm",
        isCurrent(pathname, href) ? "bg-muted text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </Link>
  );

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="font-display text-xl text-accent">
          Rickhouse
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((item) => link(item.href, item.label, item.icon, false))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden md:block">{signOut}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="md:hidden"
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
          className="mx-auto flex w-full max-w-6xl flex-col gap-1 border-t border-border px-4 py-3 md:hidden"
        >
          {LINKS.map((item) => link(item.href, item.label, item.icon, true))}
          <div className="mt-2 border-t border-border pt-3">{signOut}</div>
        </nav>
      ) : null}
    </header>
  );
}
