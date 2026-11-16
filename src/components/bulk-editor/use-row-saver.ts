"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { createRowAction, patchBottleRowAction, patchLabelRowAction } from "@/app/(app)/bulk-editor/actions";
import type { Moves } from "@/lib/bulk-editor/changes";
import { isBlank, type DraftRow } from "@/lib/bulk-editor/drafts";
import type { Edits } from "@/lib/bulk-editor/editors";
import type { LinkLists } from "@/lib/bulk-editor/links";
import { bottlePatchBody, createBody, draftNeeds, failureColumn, labelPatchBody, settleEdits, settleMoves, type Sent } from "@/lib/bulk-editor/save";
import type { SheetBottle, SheetLabel, SheetView } from "@/lib/bulk-editor/sheet";

/** Where a row's save has got to. A row with nothing here is either untouched or waiting for what it needs. */
export type RowState = { kind: "saving" } | { kind: "saved" } | { kind: "blocked"; column: string; message: string };

type Input = {
  /** The sheet's data: a new set arriving means the saves have been read back, so what was saved is dropped from the edits. */
  labels: SheetLabel[];
  bottles: SheetBottle[];
  view: SheetView;
  edits: Edits;
  moves: Moves;
  drafts: DraftRow[];
  setEdits: React.Dispatch<React.SetStateAction<Edits>>;
  setMoves: React.Dispatch<React.SetStateAction<Moves>>;
  setDrafts: React.Dispatch<React.SetStateAction<DraftRow[]>>;
  /** A new row has saved: the key its saved row will have, so the sheet can keep it on screen whatever is filtered. */
  onLanded?: (savedKey: string) => void;
  /** A saved bottle has been given a status that takes it off the shelf, so the sheet (which lists only owned and open bottles) will stop showing it. */
  onLeftShelf?: (key: string, status: string) => void;
  /** Allows a draft's open editor to finish before creation starts. */
  editingDraft: React.RefObject<string | null>;
  /** Each label's lists as they were last read in full, so what was not edited is sent unchanged. */
  linkCache?: React.MutableRefObject<Map<number, LinkLists>>;
};

/** The quiet time after the last save before the sheet is reloaded, so a run of saves is one reload. */
const REFRESH_AFTER_MS = 500;
/** A row that has landed in its sorted place is followed to only for so long: after that it is old news. */
const REVEAL_FOR_MS = 15_000;
/** How long "just saved" is shown once the reloaded sheet has the change. */
const SAVED_SHOWN_MS = 2500;

/**
 * Saves rows as they are finished. A row on the sheet saves when a cell of it is committed. A new row saves when the
 * cursor leaves it, if it has what it needs. Each row is one request at a time: a change made while one is on its way
 * is saved right after. A failed save keeps everything typed and marks the row; it is tried again on the next change.
 *
 * Edits stay on screen after a save until the reloaded data arrives and has them, so a cell never flickers back to its
 * old value in between.
 */
export function useRowSaver(input: Input) {
  const router = useRouter();
  const [rowState, setRowState] = React.useState<Record<string, RowState>>({});
  const latest = React.useRef(input);
  React.useLayoutEffect(() => {
    latest.current = input;
  });

  const inflight = React.useRef(new Set<string>());
  const again = React.useRef(new Set<string>());
  const sent = React.useRef(new Map<string, Sent>());
  const created = React.useRef(new Set<string>());
  const requested = React.useRef(new Set<string>());
  const deleted = React.useRef(new Set<string>());
  /** Successful creates wait for readback unless the bottle's status excludes it from the sheet. */
  const landed = React.useRef(new Map<string, { key: string; waitForRow: boolean }>());
  const [reveal, setReveal] = React.useState<Array<{ key: string; at: number }>>([]);
  /** A saved new row's key, and the key its saved row will have: the sheet hides the new row once that one is in its data. */
  const [createdAs, setCreatedAs] = React.useState<Record<string, string>>({});
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tick, setTick] = React.useState(0);
  /** `save` calling itself for a change made while it was on its way, through a ref so the callback does not refer to itself. */
  const saveAgain = React.useRef<(key: string) => Promise<void>>(async () => {});

  const mark = React.useCallback((key: string, state: RowState | null) => {
    setRowState((prev) => {
      if (state === null) {
        if (!(key in prev)) return prev;
        const { [key]: _gone, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: state };
    });
  }, []);

  const refreshSoon = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => React.startTransition(() => router.refresh()), REFRESH_AFTER_MS);
  }, [router]);
  React.useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  const save = React.useCallback(
    async (key: string): Promise<void> => {
      if (deleted.current.has(key)) return;
      const isDraft = key.startsWith("d");
      if (inflight.current.has(key)) {
        if (!isDraft) again.current.add(key);
        return;
      }
      const { edits, moves, drafts, view } = latest.current;
      const cells = edits[key];
      let call: () => Promise<{ ok: true; bottleId?: number | null; labelId?: number } | { ok: false; error: string; fieldErrors: Record<string, string> }>;
      let snapshot: Sent;
      let scope: "label" | "bottle" = "label";
      let fallback = Object.keys(cells ?? {})[0] ?? "brand";
      const id = Number(key.slice(1));

      if (key.startsWith("b")) {
        const move = moves[key];
        if (!cells && move === undefined) return;
        snapshot = { cells: cells ?? {}, ...(move !== undefined ? { move } : {}) };
        call = () => patchBottleRowAction(id, bottlePatchBody(cells, move));
        scope = "bottle";
        if (!cells) fallback = "name";
      } else if (key.startsWith("l")) {
        if (!cells) return;
        snapshot = { cells };
        const label = latest.current.labels.find((l) => l.id === id);
        call = () => patchLabelRowAction(id, labelPatchBody(cells, label ? { label, loaded: latest.current.linkCache?.current.get(id) } : undefined));
      } else {
        const draft = drafts.find((d) => d.key === key);
        // A new row that has been made is not made again: it stays in the list until the reloaded data has it, and a second
        // request for it (the cursor leaving it as well as the run of Tab and Enter that finished it) would add a duplicate.
        if (!draft || latest.current.editingDraft.current === key || created.current.has(key) || isBlank(draft, edits) || draftNeeds(draft) !== null) return;
        snapshot = { cells: cells ?? {} };
        const body = createBody(draft, cells, view.bottles);
        call = () => createRowAction(body);
      }

      inflight.current.add(key);
      again.current.delete(key);
      mark(key, { kind: "saving" });
      try {
        const outcome = await call();
        if (deleted.current.has(key)) return;
        if (outcome.ok) {
          sent.current.set(key, snapshot);
          const status = key.startsWith("b") ? snapshot.cells.status : undefined;
          if (status !== undefined && status !== "owned" && status !== "open") latest.current.onLeftShelf?.(key, status);
          if (isDraft) {
            created.current.add(key);
            const bottleId = "bottleId" in outcome ? outcome.bottleId : null;
            const savedKey = bottleId != null && view.bottles ? `b${bottleId}` : `l${"labelId" in outcome ? outcome.labelId : 0}`;
            const newStatus = snapshot.cells.status;
            const offShelf = savedKey.startsWith("b") && Boolean(newStatus && newStatus !== "owned" && newStatus !== "open");
            landed.current.set(key, { key: savedKey, waitForRow: !offShelf });
            if (!offShelf) setReveal((prev) => [...prev, { key: savedKey, at: Date.now() }]);
            latest.current.onLanded?.(savedKey);
            setCreatedAs((prev) => ({ ...prev, [key]: savedKey }));
          }
          mark(key, { kind: "saved" });
          refreshSoon();
        } else {
          mark(key, { kind: "blocked", column: failureColumn(outcome.fieldErrors, scope, fallback), message: outcome.error });
        }
      } catch {
        if (deleted.current.has(key)) return;
        mark(key, { kind: "blocked", column: fallback, message: "Could not reach the server. Change the row again to try once more." });
      } finally {
        inflight.current.delete(key);
        if (again.current.delete(key)) void saveAgain.current(key);
      }
    },
    [mark, refreshSoon],
  );

  React.useLayoutEffect(() => {
    saveAgain.current = save;
  }, [save]);

  /** Asks for a row to be saved once the change just made has been rendered, so the save reads it. */
  const request = React.useCallback((key: string) => {
    requested.current.add(key);
    setTick((n) => n + 1);
  }, []);
  React.useEffect(() => {
    if (requested.current.size === 0) return;
    const keys = [...requested.current];
    requested.current = new Set();
    for (const key of keys) void save(key);
  }, [tick, save]);

  /** Saves every new row that has what it needs (the cursor has left them, or has left the sheet). */
  const saveDrafts = React.useCallback(
    (except?: string) => {
      for (const draft of latest.current.drafts) {
        if (draft.key !== except) void save(draft.key);
      }
    },
    [save],
  );

  // New data has arrived. What was saved is in it, so the matching edits and the saved new rows are dropped.
  const first = React.useRef(true);
  const { labels, bottles, setEdits, setMoves, setDrafts } = input;
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (sent.current.size === 0) return;
    const readKeys = new Set([...labels.map((label) => `l${label.id}`), ...bottles.map((bottle) => `b${bottle.id}`)]);
    const done = new Map<string, Sent>();
    const madeRows = new Set<string>();
    for (const [key, snapshot] of sent.current) {
      const made = landed.current.get(key);
      if (made?.waitForRow && !readKeys.has(made.key)) continue;
      if (made) {
        landed.current.delete(key);
        madeRows.add(key);
      }
      sent.current.delete(key);
      done.set(key, snapshot);
    }
    if (done.size === 0) return;
    setEdits((edits) => {
      const settled = settleEdits(edits, done);
      return [...madeRows].reduce((next, key) => {
        const { [key]: _gone, ...rest } = next;
        return rest;
      }, settled);
    });
    setMoves((moves) => settleMoves(moves, done));
    if (madeRows.size > 0) {
      setDrafts((drafts) => drafts.filter((d) => !madeRows.has(d.key)));
    }
    const keys = [...done.keys()];
    // Not cancelled by a later reload: the glyph would then stay on.
    setTimeout(() => {
      setRowState((prev) => Object.fromEntries(Object.entries(prev).filter(([key, state]) => !(keys.includes(key) && state.kind === "saved"))));
    }, SAVED_SHOWN_MS);
  }, [labels, bottles, setEdits, setMoves, setDrafts]);

  /** Forgets failures and what is waiting, for Discard. A save on its way is left alone. */
  const reset = React.useCallback(() => {
    setRowState((prev) => Object.fromEntries(Object.entries(prev).filter(([, state]) => state.kind === "saving" || state.kind === "saved")));
  }, []);

  const clearReveal = React.useCallback(() => setReveal([]), []);

  const forgetDeleted = React.useCallback((keys: ReadonlySet<string>) => {
    for (const key of keys) {
      deleted.current.add(key);
      requested.current.delete(key);
      again.current.delete(key);
      sent.current.delete(key);
    }
    setRowState((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !keys.has(key))));
  }, []);

  const draftSaving = (key: string) => inflight.current.has(key) || created.current.has(key);
  return { rowState, request, save, saveDrafts, reset, forgetDeleted, reveal, clearReveal, revealFor: REVEAL_FOR_MS, createdAs, draftSaving };
}
