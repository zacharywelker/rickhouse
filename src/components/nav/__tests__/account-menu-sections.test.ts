import { describe, expect, it } from "vitest";
import { menuSections } from "../account-menu-sections";

describe("account menu sections", () => {
  it("shows Library and You for non-admins in that order", () => {
    expect(menuSections(false).map((section) => section.title)).toEqual(["Library", "You"]);
  });

  it("shows Library, You, and Admin for admins in that order", () => {
    expect(menuSections(true).map((section) => section.title)).toEqual(["Library", "You", "Admin"]);
  });

  it("includes exactly the two Admin links", () => {
    expect(menuSections(true).find((section) => section.title === "Admin")?.items).toEqual([
      { label: "Users & sign-in", href: "/system/users" },
      { label: "Backups", href: "/system/backups" },
    ]);
  });

  it("keeps the Library labels and paths in order", () => {
    const items = menuSections(false).find((section) => section.title === "Library")?.items;
    expect(items?.map((item) => item.label)).toEqual(["Labels", "Housekeeping", "Configuration"]);
    expect(items?.map((item) => item.href)).toEqual(["/expressions", "/housekeeping", "/admin"]);
  });

  it("includes only Account settings in You", () => {
    expect(menuSections(false).find((section) => section.title === "You")?.items).toEqual([
      { label: "Account settings", href: "/account" },
    ]);
  });
});
