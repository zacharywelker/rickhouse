import { describe, expect, it } from "vitest";
import { openedUpdate, type OpenedState } from "../opened-rules";

const TODAY = "2026-10-08";
const open: OpenedState = { isOpen: true, dateOpened: "2026-09-14", dateKilled: null, status: "open", fillPct: 60 };
const sealed: OpenedState = { isOpen: false, dateOpened: null, dateKilled: null, status: "owned", fillPct: 100 };

describe("setting Opened", () => {
  it("opens a sealed bottle and promotes owned to open", () => {
    expect(openedUpdate(sealed, "2026-09-14", undefined, TODAY)).toEqual({
      ok: true,
      set: { dateOpened: "2026-09-14", isOpen: true, status: "open" },
    });
  });

  it("only changes the date of a bottle that is already open", () => {
    expect(openedUpdate(open, "2026-09-01", undefined, TODAY)).toEqual({
      ok: true,
      set: { dateOpened: "2026-09-01", isOpen: true },
    });
  });

  it("leaves a status other than owned alone", () => {
    const r = openedUpdate({ ...sealed, status: "wishlist" }, "2026-09-14", undefined, TODAY);
    expect(r).toEqual({ ok: true, set: { dateOpened: "2026-09-14", isOpen: true } });
  });

  it.each([
    ["a date in the future", "2026-10-09", "That date is in the future."],
    ["something that is not a date", "last week", "That is not a real date."],
    ["an impossible date", "2026-02-31", "That is not a real date."],
  ])("refuses %s", (_name, value, message) => {
    expect(openedUpdate(sealed, value, undefined, TODAY)).toEqual({ ok: false, code: "invalid", message });
  });

  it("refuses an opened date after the bottle was killed", () => {
    const killed: OpenedState = { ...open, status: "killed", fillPct: 0, dateKilled: "2026-09-20" };
    const r = openedUpdate(killed, "2026-09-25", undefined, TODAY);
    expect(r).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("clearing Opened on an open bottle", () => {
  it("asks which, rather than choosing", () => {
    expect(openedUpdate(open, null, undefined, TODAY)).toMatchObject({ ok: false, code: "opened_cleared" });
  });

  it("keep_open drops the date and nothing else", () => {
    expect(openedUpdate(open, null, "keep_open", TODAY)).toEqual({ ok: true, set: { dateOpened: null } });
  });

  it("seal drops the date, closes the bottle, sets the level to full and demotes open to owned", () => {
    expect(openedUpdate(open, null, "seal", TODAY)).toEqual({
      ok: true,
      set: { dateOpened: null, isOpen: false, fillPct: 100, status: "owned" },
    });
  });

  it("seal keeps a status that is not open", () => {
    const r = openedUpdate({ ...open, status: "owned" }, null, "seal", TODAY);
    expect(r).toEqual({ ok: true, set: { dateOpened: null, isOpen: false, fillPct: 100 } });
  });

  it.each(["killed", "sold", "traded", "sampled"])("will not seal a bottle that is %s", (status) => {
    expect(openedUpdate({ ...open, status, fillPct: 0 }, null, "seal", TODAY)).toMatchObject({ ok: false, code: "invalid" });
  });

  it("still lets a finished bottle keep its state and lose the date", () => {
    expect(openedUpdate({ ...open, status: "killed", fillPct: 0 }, null, "keep_open", TODAY)).toEqual({ ok: true, set: { dateOpened: null } });
  });
});

describe("clearing Opened on a bottle that is not open", () => {
  it("does nothing when there is no date", () => {
    expect(openedUpdate(sealed, null, undefined, TODAY)).toEqual({ ok: true, set: {} });
  });

  it("drops a stale date left by a resealed bottle, without asking", () => {
    expect(openedUpdate({ ...sealed, dateOpened: "2026-09-14" }, null, undefined, TODAY)).toEqual({ ok: true, set: { dateOpened: null } });
  });
});
