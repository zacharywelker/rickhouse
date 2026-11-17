"use client";

import * as React from "react";
import { clampWidth } from "@/lib/bulk-editor/widths";

/**
 * The drag edge on a column header. Pointer only (mouse, pen or touch); the keyboard resizes the active column with
 * Alt+Shift+Left/Right in the sheet. While dragging, `live` moves the column without re-rendering anything; `commit`
 * runs once on release. Double-click gives the column its own width back.
 */
export function ResizeHandle({ measure, live, commit, reset }: { measure: () => number; live: (px: number) => void; commit: (px: number) => void; reset: () => void }) {
  const drag = React.useRef<{ x: number; width: number; last: number } | null>(null);
  return (
    <span
      aria-hidden
      className="group/handle absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none select-none"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const width = measure();
        drag.current = { x: event.clientX, width, last: width };
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d) return;
        d.last = clampWidth(d.width + event.clientX - d.x);
        live(d.last);
      }}
      onPointerUp={(event) => {
        const d = drag.current;
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (d && d.last !== d.width) commit(d.last);
      }}
      onPointerCancel={() => {
        // The browser took the gesture (a scroll, say): put the column back where it was.
        const d = drag.current;
        drag.current = null;
        if (d) live(d.width);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        reset();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="absolute inset-y-1 right-0 w-px bg-border group-hover/handle:w-0.5 group-hover/handle:bg-foreground" />
    </span>
  );
}
