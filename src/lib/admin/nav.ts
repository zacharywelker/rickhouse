import type { Route } from "next";

/**
 * Plain data so the nav can be a client component without pulling the
 * server-only registry (and the database client) into the browser bundle.
 * Keep in step with RESOURCE_KEYS.
 */
export const ADMIN_NAV: ReadonlyArray<{ href: Route; label: string }> = [
  { href: "/admin" as Route, label: "Overview" },
  { href: "/admin/categories" as Route, label: "Categories" },
  { href: "/admin/companies" as Route, label: "Companies" },
  { href: "/admin/brands" as Route, label: "Brands" },
  { href: "/admin/distilleries" as Route, label: "Distilleries" },
  { href: "/admin/mashbills" as Route, label: "Mashbills" },
  { href: "/admin/finishes" as Route, label: "Finishes" },
  { href: "/admin/stores" as Route, label: "Stores" },
  { href: "/admin/tags" as Route, label: "Tags" },
];
