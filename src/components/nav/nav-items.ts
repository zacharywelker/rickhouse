import type { Route } from "next";

export type NavPlace = { href: Route; label: string };

/**
 * The main places, in bar order. Journal is a "Coming soon" page until the
 * web tasting log is designed; Flights keeps the /tournaments address.
 */
export const PLACES: readonly NavPlace[] = [
  { href: "/bottles" as Route, label: "Collection" },
  { href: "/journal" as Route, label: "Journal" },
  { href: "/tournaments" as Route, label: "Flights" },
  { href: "/numbers" as Route, label: "Numbers" },
];

/** The page itself or anything beneath it. */
export function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Under this width the four places no longer fit and the bar shows a Menu button instead. */
export const NARROW_QUERY = "(max-width: 719px)";
