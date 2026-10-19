"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, ChevronsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canPage, scrollTarget, showTop } from "@/lib/tournaments/page-scroll";

/**
 * A bar glued to the bottom of the window for long pages: your actions on the left, page up, page down and Top on the
 * right. It is solid paper with a hairline top edge (no blur, no shadow) and is a bar, not floating buttons, so it never
 * covers a row's controls. While it is mounted the page keeps scroll padding equal to its height (so keyboard focus is
 * never hidden under it) and a spacer of the same height, so the last row can be scrolled clear of it. Top keeps its
 * space when hidden, so nothing shifts.
 */
export function PageBar({ children }: { children?: React.ReactNode }) {
  const barRef = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState(0);
  const [reach, setReach] = React.useState({ up: false, down: false, top: false });

  React.useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const before = root.style.scrollPaddingBottom;
    const measure = () => {
      const h = bar.offsetHeight;
      setHeight(h);
      root.style.scrollPaddingBottom = `${h}px`;
    };
    const sync = () => {
      const { up, down } = canPage(window.scrollY, window.innerHeight, root.scrollHeight);
      setReach({ up, down, top: showTop(window.scrollY, window.innerHeight) });
    };
    measure();
    sync();
    const resize = new ResizeObserver(() => {
      measure();
      sync();
    });
    resize.observe(bar);
    resize.observe(document.body); // the page grows and shrinks as flights change
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      resize.disconnect();
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      root.style.scrollPaddingBottom = before;
    };
  }, []);

  function go(to: number) {
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: to, behavior: smooth ? "smooth" : "auto" });
  }
  const page = (direction: -1 | 1) =>
    go(scrollTarget(window.scrollY, direction, window.innerHeight, barRef.current?.offsetHeight ?? 0, document.documentElement.scrollHeight));

  return (
    <>
      <div aria-hidden style={{ height }} />
      <div ref={barRef} className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background">
        <div className="mx-auto flex w-full max-w-page flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              className="size-11 p-0 sm:w-auto sm:px-3"
              style={{ visibility: reach.top ? "visible" : "hidden" }}
              tabIndex={reach.top ? 0 : -1}
              aria-label="Jump to top"
              onClick={() => go(0)}
            >
              <ChevronsUp className="size-4 sm:hidden" aria-hidden />
              <span className="hidden sm:inline">Top</span>
            </Button>
            <Button type="button" variant="outline" className="size-11 p-0" aria-label="Page up" disabled={!reach.up} onClick={() => page(-1)}>
              <ChevronUp className="size-4" aria-hidden />
            </Button>
            <Button type="button" variant="outline" className="size-11 p-0" aria-label="Page down" disabled={!reach.down} onClick={() => page(1)}>
              <ChevronDown className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
