"use client";

import * as React from "react";
import { createdOptionAction, referenceOptionsAction, saveResourceAction } from "@/app/(app)/admin/actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { inferFinishType } from "@/lib/admin/finish-type";
import { titleCase, type Problem } from "@/lib/admin/popup-problems";
import { IDLE_RESULT, type Option } from "@/lib/admin/types";
import { FINISH_TYPES, type FinishType } from "@/db/schema";
import { cn } from "@/lib/utils";
import { PopupRow as Row, PopupShell } from "./popup-shell";

const TYPE_LABEL: Record<FinishType, string> = { wood: "Wood", wine: "Wine", fortified: "Fortified", beer: "Beer", spirit: "Spirit", other: "Other" };
const TYPE_MEANS: Record<FinishType, string> = {
  wood: "Oak or another wood: French oak, new charred oak.",
  wine: "A wine cask: red, white, sweet.",
  fortified: "A fortified-wine cask: port, sherry, madeira.",
  beer: "A beer cask: stout, bock, IPA.",
  spirit: "A cask that held another spirit: cognac, rum, brandy.",
  other: "Anything else. You can change the type later.",
};

/**
 * Add finish, or add cask type (Canadian, Irish and Scotch whisky, amaro and liqueur call it that). A name and a
 * type, with the type guessed from the name until you pick one. Saved to the collection and handed back to the
 * picker that opened it.
 */
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  /** "finish" or "cask type". */
  noun?: string;
  onCreated: (option: Option) => void;
};

/**
 * The popup's contents are mounted only while it is open, so every opening starts fresh from what was typed in the
 * picker, and closing ends any save still in flight (its result is ignored once the body is gone).
 */
export function FinishDialog(props: Props) {
  return props.open ? <FinishDialogBody {...props} /> : null;
}

function FinishDialogBody({ open, onOpenChange, initialName, noun = "finish", onCreated }: Props) {
  const [name, setName] = React.useState(initialName);
  const [picked, setPicked] = React.useState<FinishType | null>(null);
  const [notes, setNotes] = React.useState("");
  const [showNotes, setShowNotes] = React.useState(false);
  const [existing, setExisting] = React.useState<Option[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    void referenceOptionsAction("finishes")
      .then((rows) => mounted.current && setExisting(rows))
      .catch(() => undefined);
    return () => {
      mounted.current = false;
    };
  }, []);

  const tidy = titleCase(name);
  const suggested = inferFinishType(tidy);
  const type = picked ?? suggested;
  const duplicate = tidy === "" ? undefined : existing.find((option) => option.label.toLowerCase() === tidy.toLowerCase());

  const problems: Problem[] = [];
  if (tidy === "") problems.push({ text: "Give it a name.", blocking: true });
  if (type === null) problems.push({ text: "Pick a type.", blocking: true });
  if (duplicate) {
    problems.push({
      text: `A ${noun} named “${duplicate.label}” is already in your collection.`,
      blocking: true,
      action: { label: "Use it", onClick: () => { onCreated(duplicate); onOpenChange(false); } },
    });
  }
  // A failed save does not block trying again: the cause may have been a dropped connection.
  if (serverError) problems.push({ text: serverError, blocking: false, notice: true });

  async function save() {
    if (type === null || saving) return;
    const stale = () => !mounted.current;
    setSaving(true);
    setServerError(null);
    try {
      const form = new FormData();
      form.set("name", tidy);
      form.set("finishType", type);
      if (notes.trim() !== "") form.set("notes", notes.trim());
      const result = await saveResourceAction("finishes", null, IDLE_RESULT, form);
      if (stale()) return;
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      const created = result.createdId === undefined ? null : await createdOptionAction("finishes", result.createdId);
      if (stale()) return;
      if (created?.ok) {
        onCreated(created.option);
        onOpenChange(false);
      } else {
        setServerError("It was saved, but could not be chosen here. Close this and pick it from the list.");
      }
    } catch {
      if (!stale()) setServerError("Could not reach the server. Try again.");
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <PopupShell
      title={`Add ${noun}`}
      description="Saved to your collection, and chosen here when you are done."
      open={open}
      onOpenChange={onOpenChange}
      problems={problems}
      saveLabel={`Save ${noun}`}
      saving={saving}
      onSave={() => void save()}
    >
      <Row label="Name" htmlFor="finish-name">
        <Input
          id="finish-name"
          value={name}
          autoFocus
          placeholder="French oak, PX sherry"
          onChange={(event) => {
            setName(event.target.value);
            setServerError(null);
          }}
          onBlur={() => setName(titleCase(name))}
        />
      </Row>
      <Row label="Type">
        <div role="group" aria-label="Type" className="flex flex-wrap gap-1.5">
          {FINISH_TYPES.map((option) => {
            const on = type === option;
            const isSuggestion = on && picked === null;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setPicked(option);
                  setServerError(null);
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border border-foreground px-3 text-xs",
                  on ? "bg-foreground text-background" : "bg-card hover:bg-muted",
                )}
              >
                {on ? <span aria-hidden="true">✓</span> : null}
                {TYPE_LABEL[option]}
                {isSuggestion ? <span className="text-[9px] uppercase tracking-wider opacity-75">suggested</span> : null}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {type ? TYPE_MEANS[type] : "Pick the kind of cask."}
          {type && picked === null && suggested ? " Suggested from the name. Change it if it’s wrong." : ""}
        </p>
      </Row>
      <Row label="More">
        {showNotes ? (
          <Textarea aria-label="Notes" value={notes} onChange={(event) => {
              setNotes(event.target.value);
              setServerError(null);
            }} placeholder="Where it comes from, what it adds" />
        ) : (
          <button type="button" onClick={() => setShowNotes(true)} className="text-sm underline underline-offset-2">
            Notes
          </button>
        )}
      </Row>
    </PopupShell>
  );
}
