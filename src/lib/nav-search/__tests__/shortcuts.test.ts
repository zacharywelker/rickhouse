import { describe, expect, it } from "vitest";
import { shortcutFor, type ShortcutInput } from "../shortcuts";

const defaults: ShortcutInput = {
  key: "x",
  meta: false,
  ctrl: false,
  alt: false,
  typing: false,
  hasFilterBox: false,
};

describe("keyboard shortcuts", () => {
  it("opens search for meta+k while typing", () => {
    expect(shortcutFor({ ...defaults, key: "k", meta: true, typing: true })).toBe("open-search");
  });

  it("opens search for ctrl+k", () => {
    expect(shortcutFor({ ...defaults, key: "k", ctrl: true })).toBe("open-search");
  });

  it("opens search for meta+K", () => {
    expect(shortcutFor({ ...defaults, key: "K", meta: true })).toBe("open-search");
  });

  it("ignores / while typing", () => {
    expect(shortcutFor({ ...defaults, key: "/", typing: true })).toBeNull();
  });

  it("focuses the filter for / when a filter box exists", () => {
    expect(shortcutFor({ ...defaults, key: "/", hasFilterBox: true })).toBe("focus-filter");
  });

  it("opens search for / without a filter box", () => {
    expect(shortcutFor({ ...defaults, key: "/" })).toBe("open-search");
  });

  it("creates a new bottle for n when not typing", () => {
    expect(shortcutFor({ ...defaults, key: "n" })).toBe("new-bottle");
  });

  it("ignores meta+n", () => {
    expect(shortcutFor({ ...defaults, key: "n", meta: true })).toBeNull();
  });

  it("ignores n while typing", () => {
    expect(shortcutFor({ ...defaults, key: "n", typing: true })).toBeNull();
  });

  it("ignores alt+/", () => {
    expect(shortcutFor({ ...defaults, key: "/", alt: true })).toBeNull();
  });

  it("ignores alt+meta+k", () => {
    expect(shortcutFor({ ...defaults, key: "k", alt: true, meta: true })).toBeNull();
  });

  it("ignores ctrl+/", () => {
    expect(shortcutFor({ ...defaults, key: "/", ctrl: true })).toBeNull();
  });

  it("ignores the unrelated key x", () => {
    expect(shortcutFor(defaults)).toBeNull();
  });
});
