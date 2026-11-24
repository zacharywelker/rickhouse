"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import { Search } from "lucide-react";
import { OPEN_SEARCH_EVENT } from "@/lib/nav-search/shortcuts";
import type { NavRow, NavSearchResult } from "@/lib/nav-search/search";
import { cn } from "@/lib/utils";
import { navSearchAction } from "./search-actions";

/** Result groups in display order: heading, key in the result, and the action shown on the row. */
const GROUPS = [
  ["Your bottles", "bottles", null],
  ["Labels", "labels", null],
  ["Brands", "brands", "Show in Collection"],
  ["Distilleries", "distilleries", "Show in Collection"],
  ["Groups", "groups", "Show in Collection"],
] as const;

type Option = { id: string; heading: string | null; row: NavRow; action: string | null };

/** Anything worth searching has a letter or digit in it. */
const HAS_WORDS = /[\p{L}\p{N}]/u;

function optionsFor(result: NavSearchResult | null, query: string, variant: string): Option[] {
  if (!result) return [];
  const options: Option[] = GROUPS.flatMap(([heading, key, action]) =>
    result[key].map((row, index) => ({ id: `nav-search-${variant}-${row.key}`, heading: index === 0 ? heading : null, row, action })),
  );
  if (result.newLabelHref) {
    options.push({
      id: `nav-search-${variant}-new`,
      heading: null,
      row: { key: "new", title: `Add “${query.trim()}” as a new label`, detail: "", href: result.newLabelHref },
      action: null,
    });
  }
  return options;
}

/**
 * The nav search: type to jump to a bottle, label, brand, distillery or group
 * (DESIGN.md §7; spec 2026-11-23-web-navigation-redesign). An ARIA combobox: the
 * input owns focus and `aria-activedescendant` names the highlighted row.
 *
 * `inline` is the compact field in the bar from 720px up. `takeover` fills the
 * bar on a phone, with a Cancel button and the results over the page.
 *
 * Results come from a server action. Each request is numbered and only the
 * latest is kept, so a slow earlier answer cannot overwrite a later one.
 */
export function NavSearch({ variant, onClose }: { variant: "inline" | "takeover"; onClose?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const latest = React.useRef(0);

  const [query, setQuery] = React.useState("");
  // The answer keeps the query it was for, so the "Add ..." row says what its link actually carries.
  const [answer, setAnswer] = React.useState<{ query: string; result: NavSearchResult } | null>(null);
  const [focused, setFocused] = React.useState(variant === "takeover");
  const [active, setActive] = React.useState(0);

  const hasWords = HAS_WORDS.test(query);
  const result = hasWords ? (answer?.result ?? null) : null;
  const options = optionsFor(result, answer?.query ?? query, variant);
  // The list on screen may still be for the previous text while the next answer is in flight; Enter must not open from it.
  const fresh = answer !== null && answer.query.trim() === query.trim();
  const showPanel = focused && result !== null;
  const listId = `nav-search-list-${variant}`;

  React.useEffect(() => {
    if (!hasWords) {
      latest.current += 1; // a late answer for text that is gone must not show
      return;
    }
    const mine = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const next = await navSearchAction(query);
        if (mine !== latest.current) return;
        setAnswer({ query, result: next });
        setActive(0);
      } catch {
        // A failed request (an expired session, a network blip) leaves the last answer in place.
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [query, hasWords]);

  // ⌘K / "/" (see keyboard-shortcuts.tsx).
  React.useEffect(() => {
    const focus = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener(OPEN_SEARCH_EVENT, focus);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, focus);
  }, []);

  React.useEffect(() => {
    if (variant === "takeover") inputRef.current?.focus();
  }, [variant]);

  // Navigating away empties the search.
  const [prevPathname, setPrevPathname] = React.useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setQuery("");
    setAnswer(null);
    setFocused(variant === "takeover");
  }
  // The cursor may still be in the field after choosing a result (Enter, or a click); leaving it there would
  // make "/" type into it and keep the results hidden, since the search now counts as closed.
  React.useEffect(() => {
    if (variant === "inline") inputRef.current?.blur();
  }, [pathname, variant]);

  // Choosing a result closes the search. Keying this on the path alone is not enough: a brand, distillery or
  // group result from the Collection only changes the query string.
  const dismiss = () => {
    setQuery("");
    setAnswer(null);
    setFocused(variant === "takeover");
    inputRef.current?.blur();
    onClose?.();
  };

  const go = (option: Option | undefined) => {
    if (!option) return;
    router.push(option.row.href as Route);
    dismiss();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      setActive((i) => (event.key === "ArrowDown" ? (i + 1) % options.length : (i - 1 + options.length) % options.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (fresh) go(options[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setFocused(false);
      inputRef.current?.blur();
      onClose?.();
    }
  };

  const takeover = variant === "takeover";

  return (
    <div
      ref={containerRef}
      className={cn(takeover ? "flex min-w-0 flex-1 items-center gap-2" : "relative")}
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node | null)) setFocused(takeover);
      }}
    >
      <div
        className={cn(
          "flex items-center gap-2 border bg-card px-2 text-sm",
          takeover ? "h-11 flex-1 border-foreground" : cn("h-9 transition-[width]", focused ? "w-56 border-foreground" : "w-36 border-border"),
        )}
      >
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Quick search"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listId : undefined}
          aria-activedescendant={showPanel ? options[active]?.id : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
        {!takeover && !focused ? (
          <kbd className="border border-border px-1 font-mono text-[11px] text-muted-foreground" aria-hidden>
            ⌘K
          </kbd>
        ) : null}
      </div>
      {takeover ? (
        <button
          type="button"
          onClick={() => {
            setFocused(false);
            onClose?.();
          }}
          className="h-11 px-2 text-sm uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      ) : null}

      {showPanel ? (
        <div
          className={cn(
            "z-30 border border-foreground bg-card shadow-lg",
            takeover ? "absolute inset-x-0 top-full max-h-[calc(100dvh-68px)] overflow-y-auto border-x-0" : "absolute right-0 top-full mt-1 w-[26rem] max-w-[calc(100vw-2rem)]",
          )}
          onMouseDown={(event) => event.preventDefault()}
        >
          <ul id={listId} role="listbox" aria-label="Search results">
            {options.map((option, index) => (
              <React.Fragment key={option.id}>
                {option.heading ? (
                  <li role="presentation" className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {option.heading}
                  </li>
                ) : null}
                <li
                  id={option.id}
                  role="option"
                  aria-selected={index === active}
                  className={cn(
                    "border-t border-border/60",
                    option.row.key === "new" && "border-t-foreground",
                    index === active && "bg-muted",
                  )}
                >
                  <Link
                    href={option.row.href as Route}
                    tabIndex={-1}
                    onMouseEnter={() => setActive(index)}
                    onClick={dismiss}
                    className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className={cn("block truncate", option.row.key === "new" ? "font-medium" : "")}>{option.row.title}</span>
                      {option.row.detail ? <span className="block truncate text-xs text-muted-foreground">{option.row.detail}</span> : null}
                    </span>
                    {option.action ? <span className="shrink-0 border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{option.action}</span> : null}
                  </Link>
                </li>
              </React.Fragment>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
