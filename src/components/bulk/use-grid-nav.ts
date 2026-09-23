import * as React from "react";

/**
 * Enter-moves-down navigation for an editable grid.
 *
 * Tab already moves cell to cell in DOM order for free — this only has to
 * add the one thing a native form doesn't: Enter advancing to the same
 * column on the next row, the way a spreadsheet does.
 */
export function useGridNav() {
  const refs = React.useRef(new Map<string, HTMLElement>());

  const key = (row: number, col: string) => `${row}:${col}`;

  const register = React.useCallback(
    (row: number, col: string) => (el: HTMLElement | null) => {
      const k = key(row, col);
      if (el) refs.current.set(k, el);
      else refs.current.delete(k);
    },
    [],
  );

  const focusCell = React.useCallback((row: number, col: string) => {
    refs.current.get(key(row, col))?.focus();
  }, []);

  const handleEnter = React.useCallback(
    (row: number, col: string, rowCount: number) => (event: React.KeyboardEvent) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (row + 1 < rowCount) focusCell(row + 1, col);
    },
    [focusCell],
  );

  return { register, focusCell, handleEnter };
}
