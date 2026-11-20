import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Prefill } from "@/lib/bulk-editor/expand";
import { clearPrefill, readPrefill, writePrefill } from "../prefill";

/** A sessionStorage for the tests (the unit suite runs in node). */
class FakeStorage {
  private items = new Map<string, string>();
  getItem = (key: string) => this.items.get(key) ?? null;
  setItem = (key: string, value: string) => void this.items.set(key, value);
  removeItem = (key: string) => void this.items.delete(key);
}

const prefill: Prefill = { label: { brandId: 10, name: "Zed Batch", proof: "101" }, bottle: { pricePaid: "45" }, dropped: ["Vintage"], newBrand: null };

describe("a new row's values, handed to the popup through the tab's own storage", () => {
  beforeEach(() => {
    (globalThis as unknown as { sessionStorage: FakeStorage }).sessionStorage = new FakeStorage();
  });
  afterEach(() => {
    delete (globalThis as unknown as { sessionStorage?: FakeStorage }).sessionStorage;
  });

  it("reads back what was written, under a token", () => {
    const token = writePrefill(prefill);
    expect(token).not.toBe("");
    expect(readPrefill(token)).toEqual(prefill);
  });
  it("gives a different token each time", () => {
    expect(writePrefill(prefill)).not.toBe(writePrefill(prefill));
  });
  it("has nothing for an unknown or missing token", () => {
    expect(readPrefill("nope")).toBeNull();
    expect(readPrefill(null)).toBeNull();
    expect(readPrefill("")).toBeNull();
  });
  it("can be read again until it is cleared, so a second render still finds it", () => {
    const token = writePrefill(prefill);
    expect(readPrefill(token)).toEqual(prefill);
    expect(readPrefill(token)).toEqual(prefill);
    clearPrefill(token);
    expect(readPrefill(token)).toBeNull();
  });
  it("does not throw on text that is not a prefill", () => {
    const store = (globalThis as unknown as { sessionStorage: FakeStorage }).sessionStorage;
    store.setItem("bulk-editor:prefill:bad", "{not json");
    store.setItem("bulk-editor:prefill:odd", JSON.stringify({ label: 3 }));
    expect(readPrefill("bad")).toBeNull();
    expect(readPrefill("odd")).toBeNull();
  });
  it("does nothing, and does not throw, where there is no storage", () => {
    delete (globalThis as unknown as { sessionStorage?: FakeStorage }).sessionStorage;
    expect(typeof writePrefill(prefill)).toBe("string");
    expect(readPrefill("x")).toBeNull();
    expect(() => clearPrefill("x")).not.toThrow();
  });
});
