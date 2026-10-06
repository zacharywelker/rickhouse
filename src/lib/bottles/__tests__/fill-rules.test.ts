import { describe, expect, it } from "vitest";
import { fillUpdate } from "../fill-rules";

const today = "2026-10-06";

describe("fillUpdate", () => {
  it("opens a sealed bottle that drops below full, stamping today and promoting owned to open", () => {
    expect(fillUpdate({ isOpen: false, dateOpened: null, status: "owned" }, 75, today)).toEqual({
      fillPct: 75,
      isOpen: true,
      dateOpened: today,
      status: "open",
    });
  });

  it("keeps an earlier opened date and a status that is not owned", () => {
    expect(fillUpdate({ isOpen: false, dateOpened: "2026-01-02", status: "gifted" }, 50, today)).toEqual({
      fillPct: 50,
      isOpen: true,
    });
  });

  it("changes only the level on a bottle that is already open", () => {
    expect(fillUpdate({ isOpen: true, dateOpened: "2026-01-02", status: "open" }, 10, today)).toEqual({ fillPct: 10 });
  });

  it("leaves a sealed bottle sealed at full", () => {
    expect(fillUpdate({ isOpen: false, dateOpened: null, status: "owned" }, 100, today)).toEqual({ fillPct: 100 });
  });
});
