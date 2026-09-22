/**
 * Theme preference. Three states, because "system" is a real choice and not
 * just the absence of one — neither light nor dark is the app's "real" theme
 * (SPEC M6).
 *
 * The stored value maps to a `data-theme` stamp on <html>; "system" removes
 * the attribute so the `color-scheme: light dark` default in globals.css
 * follows the OS. Nothing else in the app reads the OS preference directly.
 */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "rickhouse-theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * Runs before first paint, inlined into <head>. Kept to one statement and no
 * dependencies: anything that throws here leaves the page unstyled, so the
 * whole thing is wrapped and a failure just means the OS preference wins.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}`;
