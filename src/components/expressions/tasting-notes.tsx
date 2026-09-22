"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { T8keHint } from "./t8ke-hint";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteTastingNoteAction, saveTastingNoteAction } from "@/app/(app)/bottles/actions";
import { IDLE_RESULT, type ActionResult } from "@/lib/admin/types";

export type TastingNote = {
  id: number;
  tastedOn: string;
  rating: string | null;
  nose: string | null;
  palate: string | null;
  finish: string | null;
  overall: string | null;
};

const PARTS = [
  { name: "nose", label: "Nose" },
  { name: "palate", label: "Palate" },
  { name: "finish", label: "Finish" },
  { name: "overall", label: "Overall" },
] as const;

function NoteForm({
  bottleId,
  note,
  onSaved,
}: {
  bottleId: number;
  note: TastingNote | null;
  onSaved: () => void;
}) {
  const action = saveTastingNoteAction.bind(null, bottleId, note?.id ?? null);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, IDLE_RESULT);

  const saved = state.ok && state.message !== "";
  React.useEffect(() => {
    if (saved) onSaved();
  }, [saved, onSaved]);

  const fieldErrors = !state.ok && state.fieldErrors ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex min-h-0 flex-col">
      <div className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto p-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tastedOn">Tasted on</Label>
          <Input
            id="tastedOn"
            name="tastedOn"
            type="date"
            defaultValue={note?.tastedOn ?? new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="rating">Rating</Label>
            <T8keHint />
          </div>
          <Input
            id="rating"
            name="rating"
            type="number"
            min={0}
            max={10}
            step={0.1}
            placeholder="0–10"
            defaultValue={note?.rating ? String(Number(note.rating)) : ""}
          />
          {fieldErrors.rating ? (
            <p role="alert" className="text-sm text-destructive">
              {fieldErrors.rating}
            </p>
          ) : null}
        </div>
        {PARTS.map((part) => (
          <div key={part.name} className="col-span-full flex flex-col gap-1.5">
            <Label htmlFor={part.name}>{part.label}</Label>
            <Textarea id={part.name} name={part.name} rows={2} defaultValue={note?.[part.name] ?? ""} />
          </div>
        ))}
        {!state.ok && state.error ? (
          <p
            role="alert"
            className="col-span-full rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {note ? "Save changes" : "Save note"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function TastingNotes({ bottleId, notes }: { bottleId: number; notes: TastingNote[] }) {
  const router = useRouter();
  // `undefined` means closed; `null` means the add form; a note means editing.
  const [editing, setEditing] = React.useState<TastingNote | null | undefined>(undefined);
  const close = React.useCallback(() => setEditing(undefined), []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl">Tasting notes</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}>
          <Plus className="size-4" />
          Add note
        </Button>
      </div>

      {notes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing tasted yet. Notes are attached to the bottle rather than the expression, so you can compare two
          batches of the same thing.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-muted-foreground">{note.tastedOn}</span>
                <div className="flex items-center gap-2">
                  {note.rating ? (
                    <span className="font-display text-lg text-accent tabular-nums">
                      {Number(note.rating)}
                      <span className="text-sm text-muted-foreground">/10</span>
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(note)}
                    aria-label={`Edit note from ${note.tastedOn}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void deleteTastingNoteAction(bottleId, note.id).then(() => router.refresh())}
                    aria-label={`Delete note from ${note.tastedOn}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {PARTS.map((part) =>
                  note[part.name] ? (
                    <div key={part.name}>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{part.label}</dt>
                      <dd className="text-sm">{note[part.name]}</dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== undefined} onOpenChange={(next) => !next && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit tasting note" : "Add a tasting note"}</DialogTitle>
            <DialogDescription>Nose, palate, finish and a t8ke score. All optional.</DialogDescription>
          </DialogHeader>
          {editing !== undefined ? (
            <NoteForm
              key={editing ? `edit-${editing.id}` : "create"}
              bottleId={bottleId}
              note={editing}
              onSaved={close}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
