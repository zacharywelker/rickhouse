"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { THEMES, THEME_STORAGE_KEY, isTheme, type Theme } from "@/lib/theme";

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;
const LABELS = { system: "System", light: "Light", dark: "Dark" } as const;

function stamp(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/**
 * Three real options rather than a light/dark switch, so "follow the system"
 * stays reachable once you have picked one. The inline script in <head> has
 * already stamped <html>, so this only has to catch up with it after hydration
 * — it never writes on mount, which would flip the page for a moment.
 */
export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>("system");

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (isTheme(stored)) setTheme(stored);
    } catch {
      // Private mode, or storage blocked. The OS preference is a fine answer.
    }
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    stamp(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The stamp still applies for this page; it just will not be remembered.
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 border border-border p-0.5"
    >
      {THEMES.map((option) => {
        const Icon = ICONS[option];
        const active = theme === option;
        return (
          <Button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={LABELS[option]}
            title={LABELS[option]}
            variant="ghost"
            size="sm"
            onClick={() => choose(option)}
            className={cn("px-2", active && "bg-muted text-foreground")}
          >
            <Icon className="size-4" />
          </Button>
        );
      })}
    </div>
  );
}
