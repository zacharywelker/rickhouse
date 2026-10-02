import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "@/lib/bottles/filters";
import { SMART_GROUP_LIMIT, smartGroupFilters, smartGroupQuery } from "../smart";

describe("smart group queries", () => {
  it("keeps what the bottles are and their order, not how the screen looked", () => {
    const query = smartGroupQuery({
      ...DEFAULT_FILTERS,
      pick: true,
      storeIds: [3],
      proof: { min: 115, max: null },
      sort: "markup",
      page: 4,
      pageSize: 100,
      view: "gallery",
      hidden: ["photo"],
    });
    expect(new URLSearchParams(query).get("page")).toBeNull();
    expect(new URLSearchParams(query).get("view")).toBeNull();
    expect(new URLSearchParams(query).get("hide")).toBeNull();

    const back = smartGroupFilters(query);
    expect(back).toMatchObject({ pick: true, storeIds: [3], proof: { min: 115, max: null }, sort: "markup" });
    expect(back.page).toBe(1);
    expect(back.pageSize).toBe(SMART_GROUP_LIMIT);
  });

  it("reads a stored query it does not fully understand as the default shelf", () => {
    expect(smartGroupFilters("bogus=1&status=nonsense")).toMatchObject({
      statuses: DEFAULT_FILTERS.statuses,
      pick: false,
    });
  });
});
