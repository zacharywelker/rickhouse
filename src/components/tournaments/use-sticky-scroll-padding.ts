"use client";

import * as React from "react";

/**
 * While the element is mounted, the page keeps `scroll-padding-top` equal to the tallest sticky header inside it (plus
 * the header's `top` offset), so keyboard focus and scrollIntoView never leave a control under a sticky header. The
 * previous value comes back on unmount, like the page bar does for the bottom.
 */
export function useStickyScrollPadding(ref: React.RefObject<HTMLElement | null>, selector = "header") {
  React.useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const root = document.documentElement;
    const before = root.style.scrollPaddingTop;
    const measure = () => {
      let padding = 0;
      for (const header of host.querySelectorAll<HTMLElement>(selector)) {
        const top = Number.parseFloat(getComputedStyle(header).top) || 0;
        padding = Math.max(padding, top + header.offsetHeight);
      }
      root.style.scrollPaddingTop = `${padding}px`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      root.style.scrollPaddingTop = before;
    };
  }, [ref, selector]);
}
