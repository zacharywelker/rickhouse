"use client";

import * as React from "react";
import { createdOptionAction, saveResourceAction } from "@/app/(app)/admin/actions";
import { GrainEditor, type GrainRow } from "@/components/admin/grain-editor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { titleCase, type Problem } from "@/lib/admin/popup-problems";
import { IDLE_RESULT, type Option } from "@/lib/admin/types";
import { mashbillProblems } from "@/lib/mashbills";
import { cn } from "@/lib/utils";
import { PopupRow as Row, PopupShell } from "./popup-shell";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "bourbon" or "rye" when the label is one: a recipe that does not fit it gets a warning. */
  category: string | null;
  onCreated: (option: Option) => void;
};

/** One line under the toggles, saying what the switched-on state means. */
function kindHint(secret: boolean, generic: boolean, partial: boolean): string {
  if (generic) return "A style such as High Rye: a name and no recipe.";
  if (secret) return "A secret recipe. Give it a reference name; its ingredients can stay empty until you infer them.";
  if (partial) return "Only some grains are published. The shares may add up to less than 100%.";
  return "A recipe with its grains and shares. Switch one on if it is secret, only a style, or partly known.";
}

/**
 * Add mashbill: secret, generic style and partial disclosure as toggle chips, the name only where it is needed, and
 * the ingredients as rows with a running total. Everything that is wrong is in the footer. Opened from the mashbill
 * picker's "Add a new mashbill".
 */
export function MashbillDialog(props: Props) {
  return props.open ? <MashbillDialogBody {...props} /> : null;
}

function MashbillDialogBody({ onOpenChange, category, onCreated }: Props) {
  const [isSecret, setSecret] = React.useState(false);
  const [isGeneric, setGeneric] = React.useState(false);
  const [isPartial, setPartial] = React.useState(false);
  const [name, setName] = React.useState("");
  const [rows, setRows] = React.useState<GrainRow[]>([
    { grain: "", percent: "" },
  ]);
  const [notes, setNotes] = React.useState("");
  const [showNotes, setShowNotes] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const named = isSecret || isGeneric;
  const problems: Problem[] = mashbillProblems({ isSecret, isGeneric, isPartial, name, grains: rows, category });
  if (serverError) problems.push({ text: serverError, blocking: false, notice: true });

  const edit = (change: () => void) => {
    change();
    setServerError(null);
  };

  async function save() {
    if (saving || problems.some((problem) => problem.blocking)) return;
    setSaving(true);
    setServerError(null);
    try {
      const form = new FormData();
      if (isSecret) form.set("isSecret", "on");
      if (isGeneric) form.set("isGeneric", "on");
      if (isPartial) form.set("isPartial", "on");
      if (named && name.trim() !== "") form.set("name", titleCase(name));
      if (notes.trim() !== "") form.set("notes", notes.trim());
      // A style has no recipe; empty rows are not ingredients.
      const grains = isGeneric ? [] : rows.filter((row) => row.grain.trim() !== "" || row.percent.trim() !== "");
      form.set("grains", JSON.stringify(grains));
      const result = await saveResourceAction("mashbills", null, IDLE_RESULT, form);
      if (!mounted.current) return;
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      const created = result.createdId === undefined ? null : await createdOptionAction("mashbills", result.createdId);
      if (!mounted.current) return;
      if (created?.ok) {
        onCreated(created.option);
        onOpenChange(false);
      } else {
        setServerError("It was saved, but could not be chosen here. Close this and pick it from the list.");
      }
    } catch {
      if (mounted.current) setServerError("Could not reach the server. Try again.");
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <PopupShell
      title="Add mashbill"
      description="Saved to your collection, and chosen here when you are done."
      open
      onOpenChange={onOpenChange}
      problems={problems}
      saveLabel="Save mashbill"
      saving={saving}
      onSave={() => void save()}
    >
      <Row label="Kind">
        <div role="group" aria-label="Kind" className="flex flex-wrap gap-1.5">
          <Toggle
            label="Secret"
            on={isSecret}
            onToggle={() =>
              edit(() => {
                setSecret(!isSecret);
                if (!isSecret) setGeneric(false);
              })
            }
          />
          <Toggle
            label="Generic style"
            on={isGeneric}
            onToggle={() =>
              edit(() => {
                setGeneric(!isGeneric);
                if (!isGeneric) setSecret(false);
              })
            }
          />
          <Toggle label="Partial disclosure" on={isPartial} onToggle={() => edit(() => setPartial(!isPartial))} />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{kindHint(isSecret, isGeneric, isPartial)}</p>
      </Row>
      {named ? (
        <Row label="Name" htmlFor="mashbill-name">
          <Input
            id="mashbill-name"
            value={name}
            autoFocus
            placeholder={isGeneric ? "High Rye" : "Buffalo Trace Wheated"}
            onChange={(event) => edit(() => setName(event.target.value))}
            onBlur={() => setName(titleCase(name))}
          />
        </Row>
      ) : null}
      {isGeneric ? null : (
        <Row label="Ingredients">
          <GrainEditor rows={rows} onChange={(next) => edit(() => setRows(next))} isPartial={isPartial} inPopup />
        </Row>
      )}
      <Row label="More">
        {showNotes ? (
          <Textarea aria-label="Notes" value={notes} onChange={(event) => edit(() => setNotes(event.target.value))} />
        ) : (
          <button type="button" onClick={() => setShowNotes(true)} className="text-sm underline underline-offset-2">
            Notes
          </button>
        )}
      </Row>
    </PopupShell>
  );
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border border-foreground px-3 text-xs",
        on ? "bg-foreground text-background" : "bg-card hover:bg-muted",
      )}
    >
      {on ? <span aria-hidden="true">✓</span> : null}
      {label}
    </button>
  );
}
