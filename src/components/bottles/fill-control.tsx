"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  killBottleAction,
  setBottleDateAction,
  setBottleFillAction,
  setBottleOpenAction,
} from "@/app/(app)/bottles/actions";
import type { FieldGroup } from "@/db/schema";
import { clampPct } from "@/lib/bottles/geometry";
import { FILL_STATES, fillState, fillStateDescription } from "@/lib/bottles/fill-state";
import { cn, formatDate } from "@/lib/utils";
import { FillGauge } from "./fill-gauge";

/**
 * The gauge plus everything that has to happen around it: quick fill states
 * (Full, ¾, ½, ¼, Almost gone, Empty), the open/closed toggle, and the prompt
 * that appears when a bottle reaches empty.
 *
 * Writes are debounced, because dragging the gauge produces a value on every
 * pointer move and each one would otherwise be a round trip.
 */
export function FillControl({
  bottleId,
  fillPct,
  fieldGroup,
  isOpen,
  status,
  dateOpened,
  dateKilled,
}: {
  bottleId: number;
  fillPct: number;
  fieldGroup?: FieldGroup;
  isOpen: boolean;
  status: string;
  dateOpened: string | null;
  dateKilled: string | null;
}) {
  const router = useRouter();
  const [pct, setPct] = React.useState(fillPct);
  const [open, setOpen] = React.useState(isOpen);
  const [saving, setSaving] = React.useState(false);
  const [askKill, setAskKill] = React.useState(false);
  const [dateError, setDateError] = React.useState<string | null>(null);
  const [killing, setKilling] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const killed = status === "killed";
  const current = fillState(pct);

  React.useEffect(() => setPct(fillPct), [fillPct]);
  React.useEffect(() => setOpen(isOpen), [isOpen]);

  const commit = React.useCallback(
    (next: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setSaving(true);
        void setBottleFillAction(bottleId, next).then(() => {
          setSaving(false);
          router.refresh();
          // Reaching empty is the moment to ask, not on every drag frame.
          if (next === 0 && !killed) setAskKill(true);
        });
      }, 400);
    },
    [bottleId, killed, router],
  );

  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function change(next: number) {
    const value = clampPct(next);
    setPct(value);
    commit(value);
  }

  async function toggleOpen(next: boolean) {
    setOpen(next);
    await setBottleOpenAction(bottleId, next);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-4 border-t border-foreground pt-5">
      <FillGauge value={pct} onChange={change} fieldGroup={fieldGroup} height={220} label="Fill level" />

      <div className="flex w-full flex-col gap-3">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-medium">
            How much is left
            {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" /> : null}
          </legend>
          {/*
           * Quick states, not a percentage box (DESIGN.md §21): the level is
           * visual, and nobody knows their bottle is at 63%. Native radios, so
           * arrow keys move between states for free. Dragging the gauge still
           * sets anything in between; the nearest state lights up.
           */}
          <div className="grid grid-cols-3 border-l border-t border-border">
            {FILL_STATES.map((state) => (
              <label key={state.key} className="relative">
                <input
                  type="radio"
                  name="fill-state"
                  value={state.key}
                  checked={current.key === state.key}
                  onChange={() => change(state.pct)}
                  className="peer sr-only"
                  aria-label={fillStateDescription(state.pct)}
                />
                <span
                  className={cn(
                    "flex h-10 cursor-pointer items-center justify-center border-b border-r border-border px-1 text-center text-sm peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-2px] peer-focus-visible:outline-ring hover:bg-muted peer-checked:hover:bg-foreground",
                    // Fraction glyphs run small; set them a size up so ¾ reads as easily as "Full".
                    state.label.length === 1 && "text-lg",
                  )}
                >
                  {state.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-2">
          <Checkbox id="is-open" checked={open} onCheckedChange={(c) => void toggleOpen(c === true)} />
          <Label htmlFor="is-open" className="cursor-pointer text-foreground">
            Opened
          </Label>
        </div>

        <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
          {open && dateOpened ? (
            <EditableDate
              bottleId={bottleId}
              field="dateOpened"
              label="Opened"
              value={dateOpened}
              onError={setDateError}
            />
          ) : null}
          {dateKilled ? (
            <EditableDate
              bottleId={bottleId}
              field="dateKilled"
              label="Killed"
              value={dateKilled}
              onError={setDateError}
            />
          ) : null}
        </dl>
        {dateError ? (
          <p role="alert" className="text-xs text-destructive">
            {dateError}
          </p>
        ) : null}
      </div>

      <Dialog open={askKill} onOpenChange={setAskKill}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>That one&rsquo;s empty. Mark it killed?</DialogTitle>
            <DialogDescription>
              Killing it records today&rsquo;s date and sets the status, so it stays in the collection as something you
              finished rather than something you still have.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={killing}>
                Leave it empty
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={killing}
              onClick={() => {
                setKilling(true);
                void killBottleAction(bottleId).then(() => {
                  setKilling(false);
                  setAskKill(false);
                  router.refresh();
                });
              }}
            >
              {killing ? <Loader2 className="size-4 animate-spin" /> : null}
              Mark killed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Opening a bottle stamps today, which is wrong for the one you opened
 * three months ago and are only now logging (SPEC M8). A real date input,
 * revealed on click, rather than a bespoke editor — the phone then gets its
 * native date picker for free.
 */
function EditableDate({
  bottleId,
  field,
  label,
  value,
  onError,
}: {
  bottleId: number;
  field: "dateOpened" | "dateKilled";
  label: string;
  value: string;
  /** Reports a failed save, or null to clear it; FillControl shows the message. */
  onError: (error: string | null) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <dt>{label}</dt>
        <dd>
          <button
            type="button"
            onClick={() => {
              onError(null);
              setEditing(true);
            }}
            className="px-1 tabular-nums underline decoration-dotted underline-offset-2 hover:text-foreground"
            // Not "${label} …": that would collide with the Opened
            // checkbox's own accessible name and make both ambiguous.
            aria-label={`Change the ${label.toLowerCase()} date, currently ${formatDate(value)}`}
          >
            {formatDate(value)}
          </button>
        </dd>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <dt>
        <label htmlFor={`date-${field}`}>{label}</label>
      </dt>
      <dd className="flex items-center gap-1">
        <input
          id={`date-${field}`}
          type="date"
          defaultValue={value}
          max={new Date().toISOString().slice(0, 10)}
          autoFocus
          onBlur={(event) => {
            const next = event.target.value;
            setEditing(false);
            if (next === value) return;
            void setBottleDateAction(bottleId, field, next).then((result) => {
              onError(result.ok ? null : result.error);
              router.refresh();
            });
          }}
          className="h-7 border border-input bg-card px-2 text-xs tabular-nums"
        />
        <button
          type="button"
          // A mousedown fires before the input's blur, so clearing does not
          // race the onBlur save above and get immediately overwritten.
          onMouseDown={(event) => {
            event.preventDefault();
            setEditing(false);
            void setBottleDateAction(bottleId, field, "").then((result) => {
              onError(result.ok ? null : result.error);
              router.refresh();
            });
          }}
          className="px-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Clear
        </button>
      </dd>
    </div>
  );
}
