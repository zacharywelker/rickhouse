"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

/** A notice that tells the person what the sheet did for them, and may offer to take it back. */
export type Notice = { id: string; text: string; undo?: () => void };

/** How long a notice stays before it goes by itself. The time starts again when the pointer or focus leaves it. */
export const NOTICE_FADE_MS = 10_000;

function FadingNotice({ notice, onDismiss }: { notice: Notice; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = React.useState(false);
  React.useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(notice.id), NOTICE_FADE_MS);
    return () => clearTimeout(timer);
  }, [paused, notice.id, onDismiss]);
  return (
    <div
      data-notice=""
      className="pointer-events-auto mb-2 flex flex-col gap-2 border border-border bg-card p-3 text-sm shadow-md"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p>{notice.text}</p>
      {notice.undo ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            notice.undo?.();
            onDismiss(notice.id);
          }}
        >
          Undo
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The corner notices, newest on top. They sit in the sheet's own announcing area, so a screen reader hears each as it
 * appears, and none of them takes focus. Each goes by itself after a few seconds, unless it is being read or used.
 */
export function Notices({ notices, onDismiss }: { notices: ReadonlyArray<Notice>; onDismiss: (id: string) => void }) {
  return (
    <>
      {[...notices].reverse().map((notice) => (
        <FadingNotice key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </>
  );
}
