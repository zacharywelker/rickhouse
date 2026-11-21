import { describe, expect, it } from "vitest";
import { ADOPTABLE, allowedAdoptions, planAdoption } from "../adoption";
import { DUPLICATE_KINDS, type DuplicateKind } from "../duplicate-kinds";

const fields: Record<DuplicateKind, string[]> = {
  brands: ["companyId", "notes"],
  distilleries: ["city", "state", "region", "dspNumber", "nomNumber", "founded", "companyId", "notes"],
  companies: ["city", "state", "country", "notes"],
  finishes: ["finishType", "notes"],
  ingredients: ["family"],
  mashbills: ["style"],
  cooperages: ["notes"],
  stores: ["city", "state", "country", "url", "notes"],
  tags: ["color"],
};

describe("planAdoption", () => {
  it("offers a removed distillery's city when the survivor has none", () => {
    expect(planAdoption("distilleries", {}, { city: "Bardstown" })).toEqual([
      { field: "city", label: "City", value: "Bardstown" },
    ]);
  });
  it("keeps the survivor's existing value", () => {
    expect(planAdoption("distilleries", { city: "Frankfort" }, { city: "Bardstown" })).toEqual([]);
  });
  it.each([undefined, null, "", "   "])("treats %j as an empty value", (empty) => {
    expect(planAdoption("distilleries", { city: empty }, { city: "Bardstown" })).toHaveLength(1);
    expect(planAdoption("distilleries", {}, { city: empty })).toEqual([]);
  });
  it("preserves meaningful falsy values and returns the removed value unchanged", () => {
    expect(planAdoption("distilleries", { founded: 0 }, { founded: 1900 })).toEqual([]);
    expect(planAdoption("distilleries", {}, { founded: 0 })).toEqual([{ field: "founded", label: "Founded", value: 0 }]);
    expect(planAdoption("distilleries", {}, { city: " Bardstown " })[0]?.value).toBe(" Bardstown ");
  });
  it.each([
    ["other", "wine", true], ["wine", "beer", false], ["wine", "other", false],
    ["other", "other", false], ["other", null, false], ["other", "", false],
    [undefined, "wine", false],
  ] as const)("offers finish type from %s to %s only when replacing other", (survivorType, removedType, offered) => {
    expect(planAdoption("finishes", { finishType: survivorType }, { finishType: removedType })).toEqual(
      offered ? [{ field: "finishType", label: "Finish type", value: removedType }] : [],
    );
  });
  it("never offers identity, ownership or unlisted fields", () => {
    const removed = { id: 9, ownerId: 1, slug: "name", name: "Name", bogus: "bad" };
    for (const kind of DUPLICATE_KINDS) expect(planAdoption(kind, {}, removed)).toEqual([]);
  });
  it("uses exactly the planned schema fields, with labels, for all nine kinds", () => {
    for (const kind of DUPLICATE_KINDS) {
      expect(ADOPTABLE[kind].map(({ field }) => field)).toEqual(fields[kind]);
      for (const { field, label } of ADOPTABLE[kind]) {
        expect(label.trim().length).toBeGreaterThan(0);
        const survivor = field === "finishType" ? { finishType: "other" } : {};
        const value = field === "companyId" || field === "founded" ? 42 : "value";
        expect(planAdoption(kind, survivor, { [field]: value })).toEqual([{ field, label, value }]);
      }
    }
  });
  it("does not mutate either row and offers fields in registry order", () => {
    const survivor = Object.freeze({ city: null });
    const removed = Object.freeze({ notes: "Note", founded: 1800, city: "Bardstown" });
    expect(planAdoption("distilleries", survivor, removed).map(({ field }) => field)).toEqual(["city", "founded", "notes"]);
    expect(survivor).toEqual({ city: null });
    expect(removed).toEqual({ notes: "Note", founded: 1800, city: "Bardstown" });
  });
});

describe("allowedAdoptions", () => {
  it("drops fields outside the kind's allowlist", () => {
    expect(allowedAdoptions("distilleries", ["city", "ownerId", "bogus"])).toEqual(["city"]);
    expect(allowedAdoptions("tags", ["city", "color", "id", "slug", "constructor", "__proto__"])).toEqual(["color"]);
  });
  it("preserves requested order and ignores repeated requests", () => {
    const requested = Object.freeze(["notes", "city", "notes"]);
    expect(allowedAdoptions("distilleries", requested)).toEqual(["notes", "city"]);
    expect(requested).toEqual(["notes", "city", "notes"]);
    expect(allowedAdoptions("brands", [])).toEqual([]);
  });
});
