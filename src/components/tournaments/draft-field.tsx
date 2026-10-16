"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { updateDraftAction } from "@/app/(app)/tournaments/actions";
import { Button } from "@/components/ui/button";
import type { Option } from "@/lib/admin/types";
import { counts, fieldFromEntries, fieldReducer, toEntryInputs } from "@/lib/tournaments/field-selection";
import type { ViewEntry } from "@/lib/tournaments/view";
import { FieldExtras } from "./field-extras";
import { FieldPicker } from "./field-picker";
import { FieldSummary } from "./field-summary";

/** The picker, started from the draft's current entries. It is mounted only while open, so closing it drops unsaved changes. */
function FieldEditor({ tournamentId, entries, categories, onClose }: { tournamentId: number; entries: ViewEntry[]; categories: Option[]; onClose: () => void }) {
  const router = useRouter();
  const [field, dispatch] = React.useReducer(fieldReducer, entries, fieldFromEntries);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const { total } = counts(field.entries);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateDraftAction(tournamentId, { entries: toEntryInputs(field.entries) });
      if (!result.ok) {
        setError(result.fieldErrors?.entries ?? result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <FieldPicker
        categories={categories}
        entries={field.entries}
        onToggle={(bottle) => dispatch({ type: "toggleBottle", bottle })}
        onSelectAll={(bottles) => dispatch({ type: "selectAll", bottles })}
        onClear={() => dispatch({ type: "clear" })}
      />
      {field.notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {field.notice}
        </p>
      ) : null}
      <FieldExtras entries={field.entries} onAddLabel={(label) => dispatch({ type: "addLabel", label })} onAddAdhoc={(name) => dispatch({ type: "addAdhoc", name })} />
      <FieldSummary entries={field.entries} onRemove={(key) => dispatch({ type: "remove", key })} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="min-h-11" disabled={pending} onClick={save}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? "Saving…" : "Save field"}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <p className="text-xs tabular-nums text-muted-foreground">
          {total} {total === 1 ? "entry" : "entries"} chosen. Saving regroups round 1 and clears names you gave flights.
        </p>
      </div>
    </div>
  );
}

/**
 * The draft's field: how many compete, and an "Edit field" button that reveals the same picker as the setup page. A
 * draft with fewer than two entries cannot start, so it says so and opens the editor at once.
 */
export function DraftField({ tournamentId, entries, categories }: { tournamentId: number; entries: ViewEntry[]; categories: Option[] }) {
  const active = entries.filter((e) => e.status === "active");
  const short = active.length < 2;
  const [open, setOpen] = React.useState(short);
  const c = counts(fieldFromEntries(active).entries);
  const parts = [c.bottles > 0 && `${c.bottles} ${c.bottles === 1 ? "bottle" : "bottles"}`, c.labels > 0 && `${c.labels} label${c.labels === 1 ? "" : "s"} only`, c.adhoc > 0 && `${c.adhoc} outside`].filter(Boolean);

  return (
    <section aria-labelledby="field-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id="field-heading" className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Field
          </h2>
          <p className="text-sm tabular-nums">
            {short ? (
              <span role="status">Add at least 2 bottles to start{c.total === 1 ? " (1 so far)" : ""}.</span>
            ) : (
              <>
                {c.total} entries <span className="text-muted-foreground">({parts.join(", ")})</span>
              </>
            )}
          </p>
        </div>
        {open ? null : (
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
            Edit field
          </Button>
        )}
      </div>
      {open ? <FieldEditor tournamentId={tournamentId} entries={entries} categories={categories} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}
