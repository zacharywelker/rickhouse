"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { isCurrent } from "./nav-items";
import type { MenuSection } from "./account-menu-sections";

/**
 * Everything that is not a main place, in sections: Library, You, and Admin
 * for admins. One component for both homes: the popover under the name (from
 * 720px up) and the narrow menu panel. The You section also holds Appearance
 * and Sign out, which are not links, so the caller supplies Sign out.
 */
export function AccountSections({
  username,
  sections,
  signOut,
}: {
  username: string;
  sections: MenuSection[];
  signOut: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-3">
      <p className="px-3 text-xs text-muted-foreground">
        Signed in as <span className="font-mono text-foreground">{username}</span>
      </p>
      {sections.map((section) => (
        <nav key={section.title} aria-label={section.title} className="flex flex-col border-t border-border pt-2">
          <span className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{section.title}</span>
          {section.items.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isCurrent(pathname, href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center border-l-2 px-3 text-sm transition-colors",
                isCurrent(pathname, href)
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
          {section.title === "You" ? (
            <>
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-muted-foreground">Appearance</span>
                <ThemeToggle />
              </div>
              <div className="px-1">{signOut}</div>
            </>
          ) : null}
        </nav>
      ))}
    </div>
  );
}
