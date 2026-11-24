import type { Route } from "next";

export type MenuItem = { href: Route; label: string };
export type MenuSection = { title: "Library" | "You" | "Admin"; items: MenuItem[] };

export function menuSections(isAdmin: boolean): MenuSection[] {
  const sections: MenuSection[] = [
    {
      title: "Library",
      items: [
        { href: "/expressions" as Route, label: "Labels" },
        { href: "/housekeeping" as Route, label: "Housekeeping" },
        { href: "/admin" as Route, label: "Configuration" },
      ],
    },
    {
      title: "You",
      items: [{ href: "/account" as Route, label: "Account settings" }],
    },
  ];

  if (isAdmin) {
    sections.push({
      title: "Admin",
      items: [
        { href: "/system/users" as Route, label: "Users & sign-in" },
        { href: "/system/backups" as Route, label: "Backups" },
      ],
    });
  }

  return sections;
}
