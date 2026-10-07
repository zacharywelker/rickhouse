"use client";

import * as React from "react";

export type ChapterNavItem = {
  id: string;
  number: string;
  title: string;
  /** The chapter's opening figure, shown beside its name in the wide rail. */
  figure: string | null;
};

/**
 * The chapter index. One element at every width: a sticky ruled bar under the
 * lead finding on narrow screens, a sticky left rail from `xl` up. It marks
 * the chapter you are reading (`aria-current="location"`) so the index doubles
 * as a where-am-I.
 */
export function ChapterNav({ items, className }: { items: ChapterNavItem[]; className?: string }) {
  const [current, setCurrent] = React.useState<string | null>(null);

  React.useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    // Current = the last chapter whose top edge has passed the upper fifth of
    // the viewport. The final chapter is often too short to ever get there, so
    // reaching the bottom of the page counts as being in it.
    let frame = 0;
    const update = () => {
      frame = 0;
      const atBottom = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let active: string | null = null;
      if (atBottom) {
        active = sections.at(-1)?.id ?? null;
      } else {
        const line = window.innerHeight * 0.2;
        for (const section of sections) {
          if (section.getBoundingClientRect().top <= line) active = section.id;
        }
      }
      setCurrent(active);
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [items]);

  return (
    <nav aria-label="Chapters" className={className}>
      <ol className="flex min-w-max gap-6 py-2.5 text-sm xl:min-w-0 xl:flex-col xl:gap-0 xl:py-0">
        {items.map((item) => (
          <li key={item.id} className="xl:border-b xl:border-border">
            <a
              href={`#${item.id}`}
              aria-current={current === item.id ? "location" : undefined}
              className="hover:underline hover:underline-offset-4 aria-[current=location]:font-semibold xl:flex xl:items-baseline xl:justify-between xl:gap-3 xl:py-2.5 xl:pl-3 xl:-ml-3 xl:aria-[current=location]:shadow-[inset_3px_0_0_var(--color-foreground)]"
            >
              <span>
                <span className="mr-1.5 tabular-nums text-muted-foreground">{item.number}</span>
                {item.title}
              </span>
              {item.figure ? (
                <span className="hidden font-bold tabular-nums xl:inline">{item.figure}</span>
              ) : null}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
