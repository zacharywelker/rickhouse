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
import type { BottleStatus, FieldGroup } from "@/db/schema";
import { clampPct } from "@/lib/bottles/geometry";
import { effectiveBottleStatus, isOnShelf, isSealedBottle } from "@/lib/bottles/terminology";
import { fillReadout, fillStateText } from "@/lib/bottles/fill-state";
import { untickOpened } from "@/lib/bottles/opened-rules";
import { cn, formatDate } from "@/lib/utils";
import { FillGauge } from "./fill-gauge";
import { useFillNudge } from "./fill-nudge";

/**
 * The gauge plus everything that has to happen around it: the open/closed
 * toggle and the prompt that appears when a bottle reaches empty.
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
  const [error, setError] = React.useState<string | null>(null);
  const [killing, setKilling] = React.useState(false);
  // Clearing the opened date of an open bottle asks what to do with it, as the phone does.
  const [askOpened, setAskOpened] = React.useState(false);
  const [answering, setAnswering] = React.useState(false);
  // Unticking Opened on a bottle under full asks first, since sealing puts the level back to full.
  const [askSeal, setAskSeal] = React.useState(false);
  const nudge = useFillNudge();
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when the level really moved, so letting go of the dial dismisses the nudge only after a change.
  const moved = React.useRef(false);
  // The last level the server confirmed, and the latest one asked for, so a failed save can put the dial back
  // without undoing a newer drag.
  const saved = React.useRef(fillPct);
  const wanted = React.useRef(fillPct);
  const killed = status === "killed";
  const nudging = nudge.active && isOnShelf(status as BottleStatus);
  // From the local copies, so the dial un-hatches the moment it is moved.
  const sealed = isSealedBottle({ status: status as BottleStatus, isOpen: open, fillPct: pct });
  // The flag alone misses a bottle whose status says open or whose level is under full; the dial already counts those.
  const opened = open || effectiveBottleStatus({ status: status as BottleStatus, isOpen: open, fillPct: pct }) === "open";

  // The local copies move at once while a save is in flight; a refresh that
  // brings new props wins.
  const [prevFillPct, setPrevFillPct] = React.useState(fillPct);
  if (fillPct !== prevFillPct) {
    setPrevFillPct(fillPct);
    setPct(fillPct);
  }
  const [prevIsOpen, setPrevIsOpen] = React.useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    setOpen(isOpen);
  }

  React.useEffect(() => {
    saved.current = fillPct;
  }, [fillPct]);

  const commit = React.useCallback(
    (next: number) => {
      wanted.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        setSaving(true);
        let result: Awaited<ReturnType<typeof setBottleFillAction>> | null = null;
        try {
          result = await setBottleFillAction(bottleId, next);
        } catch {
          // Offline or the server fell over: handled below, same as a refusal.
        }
        setSaving(false);
        if (result?.ok) {
          saved.current = next;
          setError(null);
          router.refresh();
          // Reaching empty is the moment to ask, not on every drag frame.
          if (next === 0 && !killed) setAskKill(true);
          return;
        }
        // Not saved: show what the server still has, unless the dial has already moved on to a newer level.
        if (wanted.current === next) setPct(saved.current);
        setError(result ? result.error : "Couldn't save the level. Check the connection and try again.");
      }, 400);
    },
    [bottleId, killed, router],
  );

  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function change(next: number) {
    const value = clampPct(next);
    // Pressing End on a full bottle, or Home on an empty one, moves nothing: no write, no second "mark it killed?".
    if (value === pct) return;
    // The prompt stays until the dial is let go: removing it mid-drag would shift the dial under the pointer.
    moved.current = true;
    setPct(value);
    commit(value);
  }

  function settle() {
    if (!moved.current) return;
    moved.current = false;
    nudge.dismiss();
  }

  async function toggleOpen(next: boolean) {
    if (!next) {
      // Back to unopened: the dial reseals, so the level and the opened date go with it.
      if (untickOpened(pct) === "seal") seal();
      else setAskSeal(true);
      return;
    }
    setOpen(true);
    const result = await setBottleOpenAction(bottleId, true).catch(() => null);
    if (result?.ok) {
      setError(null);
    } else {
      setOpen(false);
      setError(result ? result.error : "Couldn't mark it opened. Check the connection and try again.");
    }
    router.refresh();
  }

  /** Marks the bottle sealed (full, unopened, no opened date), at once on screen and then on the server. */
  function seal() {
    // A level write still waiting out its debounce must not land after the seal.
    if (timer.current) clearTimeout(timer.current);
    nudge.dismiss();
    setAnswering(true);
    setOpen(false);
    setPct(100);
    // A level save already in flight must not put the old level back if it fails after this.
    wanted.current = 100;
    void setBottleDateAction(bottleId, "dateOpened", "", "seal").then((result) => {
      setAnswering(false);
      setAskSeal(false);
      setAskOpened(false);
      if (result.ok) {
        saved.current = 100;
        setError(null);
      } else {
        setOpen(true);
        setPct(saved.current);
        setError(result.error);
      }
      router.refresh();
    });
  }

  function answerOpened(choice: "keep_open" | "seal") {
    if (choice === "seal") {
      seal();
      return;
    }
    setAnswering(true);
    void setBottleDateAction(bottleId, "dateOpened", "", choice).then((result) => {
      setAnswering(false);
      setAskOpened(false);
      setError(result.ok ? null : result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-center gap-4 border-t border-foreground pt-5">
      {/*
       * A fuel dial, not a percentage box or a row of buttons (DESIGN.md §21):
       * the level is visual, and nobody knows their bottle is at 63%. Tap or
       * drag anywhere on the dial and the needle snaps to the nearest 5% tick;
       * the arrow keys step it, and the slider role gives assistive tech the
       * same control.
       */}
      <div className="flex flex-col items-center gap-1">
        {nudging ? (
          <div role="status" className="flex w-full items-center justify-between gap-2 border border-foreground px-3 py-2 text-sm">
            <span>How much is left?</span>
            <Button type="button" size="sm" variant="outline" onClick={nudge.dismiss}>
              Done
            </Button>
          </div>
        ) : null}
        <FillGauge value={pct} onChange={change} onSettle={settle} fieldGroup={fieldGroup} height={104} label="Fill level" sealed={sealed} className={cn(nudging && "rounded-sm ring-2 ring-ring ring-offset-4")} />
        <p className="flex h-6 items-center gap-2 text-base font-medium" aria-hidden="true">
          {fillReadout(pct, sealed)}
          {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" /> : null}
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-2">
          <Checkbox id="is-open" checked={opened} onCheckedChange={(c) => void toggleOpen(c === true)} />
          <Label htmlFor="is-open" className="cursor-pointer text-foreground">
            Opened
          </Label>
        </div>

        <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
          {opened ? (
            <EditableDate
              bottleId={bottleId}
              field="dateOpened"
              label="Opened"
              value={dateOpened}
              onError={setError}
              onNeedsChoice={() => setAskOpened(true)}
            />
          ) : null}
          {dateKilled ? (
            <EditableDate
              bottleId={bottleId}
              field="dateKilled"
              label="Killed"
              value={dateKilled}
              onError={setError}
              onNeedsChoice={() => {}}
            />
          ) : null}
        </dl>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <Dialog open={askOpened} onOpenChange={setAskOpened}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Keep the bottle open or mark it sealed?</DialogTitle>
            <DialogDescription>
              You cleared the date it was opened. It is at about {pct}%. Marking it sealed sets the level back to full.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={answering}>
                Keep the date
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="outline"
              disabled={answering}
              onClick={() => answerOpened("seal")}
            >
              Mark it sealed
            </Button>
            <Button type="button" disabled={answering} onClick={() => answerOpened("keep_open")}>
              {answering ? <Loader2 className="size-4 animate-spin" /> : null}
              Keep it open, no date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={askSeal} onOpenChange={setAskSeal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark it sealed?</DialogTitle>
            <DialogDescription>
              Right now it reads &ldquo;{fillStateText(pct)}&rdquo;. Marking it sealed sets the level back to full and
              clears the opened date.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={answering}>
                Keep it open
              </Button>
            </DialogClose>
            <Button type="button" disabled={answering} onClick={seal}>
              {answering ? <Loader2 className="size-4 animate-spin" /> : null}
              Mark it sealed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  onNeedsChoice,
}: {
  bottleId: number;
  field: "dateOpened" | "dateKilled";
  label: string;
  /** Null for an open bottle with no date: it can stay that way, and a date can be added. */
  value: string | null;
  /** Reports a failed save, or null to clear it; FillControl shows the message. */
  onError: (error: string | null) => void;
  /** The server wants to know what to do with the bottle before it drops this date. */
  onNeedsChoice: () => void;
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
            aria-label={
              value
                ? `Change the ${label.toLowerCase()} date, currently ${formatDate(value)}`
                : `Add the ${label.toLowerCase()} date`
            }
          >
            {value ? formatDate(value) : "No date. Add one"}
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
          defaultValue={value ?? ""}
          max={new Date().toISOString().slice(0, 10)}
          autoFocus
          onBlur={(event) => {
            const next = event.target.value;
            setEditing(false);
            if (next === (value ?? "")) return;
            void setBottleDateAction(bottleId, field, next).then((result) => {
              onError(result.ok ? null : result.error);
              router.refresh();
            });
          }}
          className="h-7 border border-input bg-card px-2 text-xs tabular-nums"
        />
        {value ? (
        <button
          type="button"
          // A mousedown fires before the input's blur, so clearing does not
          // race the onBlur save above and get immediately overwritten.
          onMouseDown={(event) => {
            event.preventDefault();
            setEditing(false);
            void setBottleDateAction(bottleId, field, "").then((result) => {
              if (!result.ok && result.needsChoice) {
                onError(null);
                onNeedsChoice();
                return;
              }
              onError(result.ok ? null : result.error);
              router.refresh();
            });
          }}
          className="px-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Clear
        </button>
        ) : null}
      </dd>
    </div>
  );
}
