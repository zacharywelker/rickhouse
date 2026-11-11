/**
 * Moving around the sheet from the keyboard, as pure functions of where you are. The component only applies the answer.
 *
 * The one rule that is not obvious is Enter. Tab walks a row's cells left to right; Enter then drops to the next row in
 * the column where that walk *started* (`anchorCol`), the way a spreadsheet does. So entering a bottle at the shelf is
 * type, Tab, type, Tab, type, Enter, and you are at the start of the next bottle. Arrow keys and a click set a new
 * anchor; Tab does not.
 */

export type Pos = { row: number; col: number };
export type Dims = { rows: number; cols: number };
/** Where to go, or `leave`: the move ran off the sheet, so the browser's own Tab should take focus out of it. */
export type Moved = { pos: Pos; anchorCol: number } | { leave: true };
export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

const clamp = (n: number, count: number) => Math.max(0, Math.min(n, count - 1));

/** An arrow, Home or End. With `jump` (Ctrl or Command): to the edge, and Home and End go to the first and last row too. */
export function arrowMove(pos: Pos, key: ArrowKey, dims: Dims, jump = false): Moved {
  let { row, col } = pos;
  switch (key) {
    case "ArrowUp": row = jump ? 0 : row - 1; break;
    case "ArrowDown": row = jump ? dims.rows - 1 : row + 1; break;
    case "ArrowLeft": col = jump ? 0 : col - 1; break;
    case "ArrowRight": col = jump ? dims.cols - 1 : col + 1; break;
    case "Home": col = 0; if (jump) row = 0; break;
    case "End": col = dims.cols - 1; if (jump) row = dims.rows - 1; break;
  }
  const next = { row: clamp(row, dims.rows), col: clamp(col, dims.cols) };
  return { pos: next, anchorCol: next.col };
}

/**
 * Tab (or Shift+Tab with `back`): to the next cell that `canLand`, wrapping to the next (or previous) row. Cells that
 * cannot be edited are skipped, so a run along a row only stops where you can type. Off either end, `leave`. The anchor
 * is kept, not reset: that is what lets Enter return to where the run began.
 */
export function tabMove(pos: Pos, back: boolean, dims: Dims, canLand: (pos: Pos) => boolean, anchorCol: number): Moved {
  const step = back ? -1 : 1;
  let { row, col } = pos;
  for (;;) {
    col += step;
    if (col >= dims.cols) {
      col = 0;
      row += 1;
    } else if (col < 0) {
      col = dims.cols - 1;
      row -= 1;
    }
    if (row < 0 || row >= dims.rows) return { leave: true };
    if (canLand({ row, col })) return { pos: { row, col }, anchorCol };
  }
}

/** Enter (or Shift+Enter with `back`) after typing: the next row up or down, in the column the run started in. Stops at the ends. */
export function enterMove(pos: Pos, anchorCol: number, back: boolean, dims: Dims): Moved {
  return { pos: { row: clamp(pos.row + (back ? -1 : 1), dims.rows), col: clamp(anchorCol, dims.cols) }, anchorCol };
}
