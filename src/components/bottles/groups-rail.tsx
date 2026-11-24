"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NARROW_QUERY } from "@/components/nav/nav-items";
import { groupHref, railInitiallyOpen, type RailGroup } from "@/lib/groups/rail";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "rickhouse.groupsRail";

/**
 * The Collection with a hideable Groups rail beside it (Collection only; the
 * bulk editor and every other page have none). Picking a group stays on the
 * Collection, filtered (`groupHref`). Open or hidden is remembered once the
 * person changes it; until then it follows the width. Below 720px there is no
 * side rail: the "Groups: <current> ›" button opens the same list as a dropdown.
 *
 * The first render is always closed, so server and client markup agree; the
 * stored or width-based choice is applied right after mount.
 */
export function GroupsRail({
  groups,
  currentId,
  children,
}: {
  groups: RailGroup[];
  /** The group the Collection is currently showing, or null for "All bottles". */
  currentId: number | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage blocked: the width decides.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage and width are only readable after hydration
    setOpen(railInitiallyOpen(window.innerWidth, stored));
  }, []);

  const choose = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "open" : "closed");
    } catch {
      // Not remembered; still applies for this page.
    }
  };

  const current = groups.find((group) => group.id === currentId) ?? null;
  const label = current?.name ?? "All";

  const entry = (href: string, name: string, active: boolean) => (
    <Link
      key={href + name}
      href={href as Route}
      aria-current={active ? "page" : undefined}
      onClick={() => setMenuOpen(false)}
      className={cn(
        "block border-l-2 px-3 py-2 text-sm transition-colors",
        active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {name}
    </Link>
  );

  const list = (
    <nav aria-label="Groups" className="flex flex-col">
      {entry("/bottles", "All bottles", currentId === null)}
      {groups.map((group) => entry(groupHref(group), group.name, group.id === currentId))}
      <Link href={"/groups" as Route} className="mt-2 border-t border-border px-3 pt-3 text-sm text-muted-foreground hover:text-foreground">
        Manage groups
      </Link>
    </nav>
  );

  return (
    <div className="flex items-start gap-6">
      {open ? (
        <aside className="sticky top-4 hidden w-44 shrink-0 min-[720px]:block">
          <div className="mb-2 flex items-center justify-between px-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Groups</span>
            <button
              type="button"
              onClick={() => choose(false)}
              aria-label="Hide groups"
              title="Hide groups"
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
          </div>
          {list}
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* On a wide screen the button only shows while the rail is hidden; below 720px it is always the way in. */}
        <div className={cn("relative", open && "min-[720px]:hidden")}>
          <button
            type="button"
            aria-expanded={menuOpen}
            onClick={() => {
              if (window.matchMedia(NARROW_QUERY).matches) setMenuOpen((v) => !v);
              else choose(true);
            }}
            className="inline-flex h-9 items-center gap-1 border border-border px-3 text-sm hover:bg-muted"
          >
            Groups: {label}
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
          {menuOpen ? (
            <div className="absolute left-0 z-20 mt-1 w-56 border border-border bg-card py-2 shadow-md min-[720px]:hidden">{list}</div>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
