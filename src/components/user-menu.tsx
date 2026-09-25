"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type MenuLink = { href: Route; label: string };

const ACCOUNT_LINKS: MenuLink[] = [{ href: "/account" as Route, label: "Account settings" }];

/** Admin-only pages live here rather than in the main nav. */
const ADMIN_LINKS: MenuLink[] = [
  { href: "/system/users" as Route, label: "Users" },
  { href: "/system/backups" as Route, label: "Backups" },
];

/** "Zach Welker" -> "Zach"; the username stands in for an empty name. */
export function firstName(name: string, username: string): string {
  return name.trim().split(/\s+/)[0] || username;
}

/**
 * The signed-in person's menu, top right: their first name opens account
 * settings and, for admins, the admin-only pages. A popover rather than a
 * page so it stays one click from anywhere, at every width.
 */
export function UserMenu({ name, username, isAdmin }: { name: string; username: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Navigating closes it, like the mobile nav.
  React.useEffect(() => setOpen(false), [pathname]);

  const item = ({ href, label }: MenuLink) => (
    <Link
      key={href}
      href={href}
      aria-current={pathname === href ? "page" : undefined}
      className={cn(
        "block border-l-2 px-3 py-2 text-sm transition-colors",
        pathname === href
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-1 px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground data-[state=open]:text-foreground"
        aria-label={`Account menu for ${name || username}`}
      >
        {firstName(name, username)}
        <ChevronDown className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 py-2">
        <div className="border-b border-border px-3 pb-2 text-xs text-muted-foreground">
          Signed in as <span className="font-mono text-foreground">{username}</span>
        </div>
        <nav aria-label="Account" className="flex flex-col pt-2">
          {ACCOUNT_LINKS.map(item)}
        </nav>
        {isAdmin ? (
          <nav aria-label="Admin" className="mt-2 flex flex-col border-t border-border pt-2">
            <span className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Admin</span>
            {ADMIN_LINKS.map(item)}
          </nav>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
