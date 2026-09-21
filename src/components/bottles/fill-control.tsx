"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { killBottleAction, setBottleFillAction, setBottleOpenAction } from "@/app/(app)/bottles/actions";
import { clampPct } from "@/lib/bottles/geometry";
import { FillGauge } from "./fill-gauge";

/**
 * The gauge plus everything that has to happen around it: a numeric input for
 * precision, the open/closed toggle, and the prompt that appears when a bottle
 * reaches empty.
 *
 * Writes are debounced, because dragging the gauge produces a value on every
 * pointer move and each one would otherwise be a round trip.
 */
export function FillControl({
  bottleId,
  fillPct,
  isOpen,
  status,
  dateOpened,
  dateKilled,
}: {
  bottleId: number;
  fillPct: number;
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
  const [killing, setKilling] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const killed = status === "killed";

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
    <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-5">
      <FillGauge value={pct} onChange={change} height={220} label="Fill level" />

      <div className="flex w-full flex-col gap-3">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="fill-pct">Exact level</Label>
            <div className="flex items-center gap-2">
              <Input
                id="fill-pct"
                type="number"
                min={0}
                max={100}
                step={1}
                value={String(pct)}
                onChange={(e) => change(Number(e.target.value))}
                className="h-9 w-24 tabular-nums"
              />
              <span className="text-sm text-muted-foreground">%</span>
              {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox id="is-open" checked={open} onCheckedChange={(c) => void toggleOpen(c === true)} />
          <Label htmlFor="is-open" className="cursor-pointer text-foreground">
            Opened
          </Label>
        </div>

        <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
          {dateOpened ? (
            <div className="flex justify-between gap-2">
              <dt>Opened</dt>
              <dd className="tabular-nums">{dateOpened}</dd>
            </div>
          ) : null}
          {dateKilled ? (
            <div className="flex justify-between gap-2">
              <dt>Killed</dt>
              <dd className="tabular-nums">{dateKilled}</dd>
            </div>
          ) : null}
        </dl>
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
