"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FlightTitle as Title } from "@/lib/tournaments/bracket-model";

/**
 * A flight's name. It can be renamed in place (any flight but a hidden one): Save with an empty box (or "Use the automatic name") clears
 * your name, and a name you gave is marked "Yours".
 */
export function FlightTitle({
  title,
  headingId,
  grip,
  extra,
  number,
  editable,
  busy,
  onRename,
}: {
  title: Title;
  /** The heading's DOM id, which takes focus after a bottle is removed. */
  headingId: string;
  /** The handle that picks the flight up, when it can be reordered. */
  grip?: React.ReactNode;
  /** More controls for the header, set apart on the right (the buttons that move the flight). */
  extra?: React.ReactNode;
  number: number;
  editable: boolean;
  busy: boolean;
  onRename: (label: string | null, done: () => void) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState("");
  const edit = React.useRef<HTMLButtonElement>(null);

  if (editing) {
    const stop = () => {
      setEditing(false);
      requestAnimationFrame(() => edit.current?.focus());
    };
    return (
      <form
        className="flex flex-col gap-2 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          onRename(text.trim() === "" ? null : text.trim(), stop);
        }}
      >
        <label className="sr-only" htmlFor={`rename-${number}`}>
          Name for flight {number}
        </label>
        <Input
          id={`rename-${number}`}
          value={text}
          autoFocus
          maxLength={80}
          placeholder="Leave empty for the automatic name"
          className="h-11"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") stop();
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-11" disabled={busy}>
            Save name
          </Button>
          {title.yours ? (
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => onRename(null, stop)}>
              Use the automatic name
            </Button>
          ) : null}
          <Button type="button" variant="ghost" className="min-h-11" onClick={stop}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2 pt-1">
      {grip}
      <h3 id={headingId} tabIndex={-1} className="min-w-0 text-base font-medium leading-snug focus:outline-none">{title.text}</h3>
      {title.yours ? <Badge className="shrink-0">Yours</Badge> : null}
      {extra ? <div className="ml-auto flex shrink-0">{extra}</div> : null}
      {editable ? (
        <Button
          ref={edit}
          type="button"
          variant="ghost"
          className={cn("size-11 shrink-0 p-0", !extra && "ml-auto")}
          aria-label={`Rename flight ${number}`}
          onClick={() => {
            setText(title.yours ? title.text : "");
            setEditing(true);
          }}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
