"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { NARROW_QUERY } from "@/components/nav/nav-items";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** "Zach Welker" -> "Zach"; the username stands in for an empty name. */
export function firstName(name: string, username: string): string {
  return name.trim().split(/\s+/)[0] || username;
}

/**
 * The signed-in person's menu, top right: their first name opens the account
 * sections (Library, You, and Admin for admins), which the caller supplies as
 * `content` so the same sections can also fill the narrow menu panel. A
 * popover rather than a page so it stays one click from anywhere.
 */
export function UserMenu({ name, username, content }: { name: string; username: string; content: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Navigating closes it, like the narrow menu.
  const [prevPathname, setPrevPathname] = React.useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  // Shrinking into the narrow layout hides the trigger; the portalled popover would be left open beside the narrow panel.
  React.useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const onChange = () => {
      if (query.matches) setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-1 px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground data-[state=open]:text-foreground"
        aria-label={`Account menu for ${name || username}`}
      >
        {firstName(name, username)}
        <ChevronDown className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 py-3">
        {content}
      </PopoverContent>
    </Popover>
  );
}
