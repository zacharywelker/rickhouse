import { describe, expect, it } from "vitest";
import { openFlagUpdate, statusUpdate, type StatusState } from "../status-rules";

const TODAY = "2026-11-11";
const sealed: StatusState = { isOpen: false, dateOpened: null, dateKilled: null, status: "owned", fillPct: 100 };
const opened: StatusState = { isOpen: true, dateOpened: "2026-01-02", dateKilled: null, status: "open", fillPct: 60 };
const killed: StatusState = { isOpen: true, dateOpened: "2026-01-02", dateKilled: "2026-05-05", status: "killed", fillPct: 0 };

describe("typing a status", () => {
  it("changes nothing when it is the status already", () => {
    expect(statusUpdate(sealed, "owned", TODAY)).toEqual({ ok: true, set: {} });
  });
  it("kills a bottle the way the Kill button does: empty, open, dated today unless it was already dated", () => {
    expect(statusUpdate(opened, "killed", TODAY)).toEqual({ ok: true, set: { status: "killed", fillPct: 0, isOpen: true, dateKilled: TODAY } });
    expect(statusUpdate({ ...opened, dateKilled: "2026-03-03" }, "killed", TODAY)).toMatchObject({ ok: true, set: { dateKilled: "2026-03-03" } });
  });
  it("opens a sealed bottle and stamps the date, keeping one it already has", () => {
    expect(statusUpdate(sealed, "open", TODAY)).toEqual({ ok: true, set: { status: "open", isOpen: true, dateOpened: TODAY } });
    expect(statusUpdate({ ...sealed, dateOpened: "2026-01-01" }, "open", TODAY)).toEqual({ ok: true, set: { status: "open", isOpen: true } });
  });
  it("refuses owned for a bottle that has been opened, and says what to do", () => {
    const r = statusUpdate(opened, "owned", TODAY);
    expect(r).toMatchObject({ ok: false });
    expect(r.ok ? "" : r.message).toMatch(/opened/i);
    expect(statusUpdate({ ...sealed, status: "sold", fillPct: 90 }, "owned", TODAY)).toMatchObject({ ok: false });
    expect(statusUpdate({ ...sealed, status: "sold" }, "owned", TODAY)).toEqual({ ok: true, set: { status: "owned" } });
  });
  it("refuses a wishlist bottle that has been opened", () => {
    expect(statusUpdate(opened, "wishlist", TODAY)).toMatchObject({ ok: false });
    expect(statusUpdate({ ...sealed, status: "sold", dateOpened: "2025-01-01" }, "wishlist", TODAY)).toMatchObject({ ok: false });
    expect(statusUpdate(sealed, "wishlist", TODAY)).toEqual({ ok: true, set: { status: "wishlist" } });
  });
  it("leaves the level alone for sold, traded and sampled", () => {
    for (const status of ["sold", "traded", "sampled"]) expect(statusUpdate(opened, status, TODAY)).toEqual({ ok: true, set: { status } });
  });
  it("drops the killed date on leaving killed, and will not make an empty bottle open or owned", () => {
    expect(statusUpdate(killed, "sold", TODAY)).toEqual({ ok: true, set: { status: "sold", dateKilled: null } });
    expect(statusUpdate(killed, "open", TODAY)).toMatchObject({ ok: false });
    expect(statusUpdate(killed, "owned", TODAY)).toMatchObject({ ok: false });
    expect(statusUpdate({ ...killed, fillPct: 20 }, "open", TODAY)).toEqual({ ok: true, set: { status: "open", isOpen: true, dateKilled: null } });
  });
  it("refuses a status that is not one", () => {
    expect(statusUpdate(sealed, "lost", TODAY)).toMatchObject({ ok: false });
  });
});

describe("the Opened tick", () => {
  it("opens a sealed bottle: stamps the date and owned becomes open", () => {
    expect(openFlagUpdate(sealed, true, TODAY)).toEqual({ ok: true, set: { isOpen: true, dateOpened: TODAY, status: "open" } });
  });
  it("leaves a bottle that is already open and dated alone", () => {
    expect(openFlagUpdate(opened, true, TODAY)).toEqual({ ok: true, set: {} });
  });
  it("seals a full open bottle, but asks (refuses) for one under full rather than resetting its level", () => {
    expect(openFlagUpdate({ ...opened, fillPct: 100 }, false, TODAY)).toEqual({ ok: true, set: { isOpen: false, dateOpened: null, status: "owned" } });
    const r = openFlagUpdate(opened, false, TODAY);
    expect(r).toMatchObject({ ok: false });
    expect(r.ok ? "" : r.message).toMatch(/full/i);
  });
  it("cannot seal a bottle that is finished", () => {
    expect(openFlagUpdate({ ...opened, fillPct: 100, status: "sold" }, false, TODAY)).toMatchObject({ ok: false });
  });
  it("just drops a stale date from a bottle that was never open", () => {
    expect(openFlagUpdate({ ...sealed, dateOpened: "2026-01-01" }, false, TODAY)).toEqual({ ok: true, set: { dateOpened: null } });
    expect(openFlagUpdate(sealed, false, TODAY)).toEqual({ ok: true, set: {} });
  });
});
