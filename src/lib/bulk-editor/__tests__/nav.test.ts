import { describe, expect, it } from "vitest";
import { arrowMove, enterMove, tabMove, type Dims, type Moved, type Pos } from "../nav";

const dims: Dims = { rows: 5, cols: 6 };
const at = (m: Moved): Pos => {
  if ("leave" in m) throw new Error("expected a move, got leave");
  return m.pos;
};
const anchor = (m: Moved): number => {
  if ("leave" in m) throw new Error("expected a move, got leave");
  return m.anchorCol;
};

describe("arrowMove", () => {
  it("moves one cell and sets the anchor to the new column", () => {
    const m = arrowMove({ row: 2, col: 2 }, "ArrowRight", dims);
    expect(at(m)).toEqual({ row: 2, col: 3 });
    expect(anchor(m)).toBe(3);
    expect(at(arrowMove({ row: 2, col: 2 }, "ArrowUp", dims))).toEqual({ row: 1, col: 2 });
  });
  it("stops at the edges instead of leaving", () => {
    expect(at(arrowMove({ row: 0, col: 0 }, "ArrowUp", dims))).toEqual({ row: 0, col: 0 });
    expect(at(arrowMove({ row: 0, col: 0 }, "ArrowLeft", dims))).toEqual({ row: 0, col: 0 });
    expect(at(arrowMove({ row: 4, col: 5 }, "ArrowDown", dims))).toEqual({ row: 4, col: 5 });
    expect(at(arrowMove({ row: 4, col: 5 }, "ArrowRight", dims))).toEqual({ row: 4, col: 5 });
  });
  it("Home and End go to the row's ends, and with jump to the sheet's corners", () => {
    expect(at(arrowMove({ row: 2, col: 3 }, "Home", dims))).toEqual({ row: 2, col: 0 });
    expect(at(arrowMove({ row: 2, col: 3 }, "End", dims))).toEqual({ row: 2, col: 5 });
    expect(at(arrowMove({ row: 2, col: 3 }, "Home", dims, true))).toEqual({ row: 0, col: 0 });
    expect(at(arrowMove({ row: 2, col: 3 }, "End", dims, true))).toEqual({ row: 4, col: 5 });
    expect(at(arrowMove({ row: 2, col: 3 }, "ArrowRight", dims, true))).toEqual({ row: 2, col: 5 });
  });
});

describe("tabMove", () => {
  const anyCell = () => true;
  it("goes to the next cell and keeps the anchor", () => {
    const m = tabMove({ row: 1, col: 2 }, false, dims, anyCell, 0);
    expect(at(m)).toEqual({ row: 1, col: 3 });
    expect(anchor(m)).toBe(0);
  });
  it("wraps to the next row at the end of a row, and back with Shift", () => {
    expect(at(tabMove({ row: 1, col: 5 }, false, dims, anyCell, 0))).toEqual({ row: 2, col: 0 });
    expect(at(tabMove({ row: 2, col: 0 }, true, dims, anyCell, 0))).toEqual({ row: 1, col: 5 });
  });
  it("skips cells that cannot be landed on, across rows too", () => {
    const editable = (p: Pos) => p.col === 1 || p.col === 4;
    expect(at(tabMove({ row: 0, col: 1 }, false, dims, editable, 1))).toEqual({ row: 0, col: 4 });
    expect(at(tabMove({ row: 0, col: 4 }, false, dims, editable, 1))).toEqual({ row: 1, col: 1 });
    expect(at(tabMove({ row: 1, col: 1 }, true, dims, editable, 1))).toEqual({ row: 0, col: 4 });
  });
  it("leaves the sheet off either end, so the browser's Tab can take focus out", () => {
    expect(tabMove({ row: 4, col: 5 }, false, dims, anyCell, 0)).toEqual({ leave: true });
    expect(tabMove({ row: 0, col: 0 }, true, dims, anyCell, 0)).toEqual({ leave: true });
  });
  it("leaves when nothing further can be landed on", () => {
    expect(tabMove({ row: 3, col: 1 }, false, dims, (p) => p.row === 3 && p.col === 1, 1)).toEqual({ leave: true });
  });
});

describe("enterMove: the spreadsheet return", () => {
  it("drops to the next row in the column the Tab run started in, not the column you ended in", () => {
    // Started at column 1, Tabbed to column 4, pressed Enter.
    expect(at(enterMove({ row: 2, col: 4 }, 1, false, dims))).toEqual({ row: 3, col: 1 });
  });
  it("goes up with Shift, and stops at the first and last rows", () => {
    expect(at(enterMove({ row: 2, col: 4 }, 1, true, dims))).toEqual({ row: 1, col: 1 });
    expect(at(enterMove({ row: 0, col: 4 }, 1, true, dims))).toEqual({ row: 0, col: 1 });
    expect(at(enterMove({ row: 4, col: 4 }, 1, false, dims))).toEqual({ row: 4, col: 1 });
  });
  it("keeps the anchor, so the next bottle starts in the same place", () => {
    expect(anchor(enterMove({ row: 2, col: 4 }, 1, false, dims))).toBe(1);
  });
  it("is a whole bottle entered by keyboard: Tab, Tab, Tab, Enter, then the same again", () => {
    const editable = (p: Pos) => [1, 3, 4].includes(p.col);
    let pos: Pos = { row: 0, col: 1 };
    let a = 1;
    const run = (m: Moved) => {
      if ("leave" in m) throw new Error("left");
      pos = m.pos;
      a = m.anchorCol;
    };
    run(tabMove(pos, false, dims, editable, a));
    run(tabMove(pos, false, dims, editable, a));
    expect(pos).toEqual({ row: 0, col: 4 });
    run(enterMove(pos, a, false, dims));
    expect(pos).toEqual({ row: 1, col: 1 });
    run(tabMove(pos, false, dims, editable, a));
    expect(pos).toEqual({ row: 1, col: 3 });
  });
});
