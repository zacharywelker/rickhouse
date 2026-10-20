"use client";

import * as React from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTournamentAction } from "@/app/(app)/tournaments/actions";
import type { Option } from "@/lib/admin/types";
import { counts, emptyField, fieldReducer, toEntryInputs } from "@/lib/tournaments/field-selection";
import { DEFAULT_GROUP_ORDER } from "@/lib/tournaments/priority";
import type { GroupKey } from "@/lib/tournaments/types";
import { FieldExtras } from "./field-extras";
import { FieldPicker } from "./field-picker";
import { FieldSummary } from "./field-summary";
import { PriorityList } from "./priority-list";
import { Segmented } from "./segmented";

const HEAT_SIZES = [
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6" },
] as const;
const SEEDING = [
  { value: "similar", label: "Similar" },
  { value: "random", label: "Random" },
] as const;

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  ) : null;
}

/**
 * The setup page: the field on the left, the few settings on the right (below it on a phone). Creating makes a draft;
 * the field and settings stay editable on the draft's page until it starts, so a draft with no entries is allowed.
 */
export function TournamentSetup({ categories }: { categories: Option[] }) {
  const router = useRouter();
  const [field, dispatch] = React.useReducer(fieldReducer, emptyField);
  const [name, setName] = React.useState("");
  const [heatSize, setHeatSize] = React.useState<2 | 3 | 4 | 5 | 6>(4);
  const [blind, setBlind] = React.useState(false);
  const [seeding, setSeeding] = React.useState<"similar" | "random">("similar");
  const [groupOrder, setGroupOrder] = React.useState<GroupKey[]>([...DEFAULT_GROUP_ORDER]);
  const [fieldNote, setFieldNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const { total } = counts(field.entries);
  const nameMissing = name.trim() === "";

  function create() {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await createTournamentAction({
        name,
        heatSize,
        seeding,
        groupOrder,
        blind,
        fieldNote: fieldNote.trim() === "" ? null : fieldNote,
        entries: toEntryInputs(field.entries),
      });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      router.push(`/tournaments/${result.id}` as Route);
    });
  }

  return (
    <form
      className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_21rem]"
      // The Create button is the only way to submit: Enter in a text field (the bottle search, the name) must not create.
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!nameMissing && !pending) create();
      }}
    >
      <section aria-labelledby="field-heading" className="flex min-w-0 flex-col gap-4">
        <h2 id="field-heading" className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Field · {total} {total === 1 ? "entry" : "entries"} chosen
        </h2>
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
        <FieldExtras entries={field.entries} onAddLabel={(label) => dispatch({ type: "addLabel", label })} onAddAdhoc={(n) => dispatch({ type: "addAdhoc", name: n })} />
        <FieldSummary entries={field.entries} onRemove={(key) => dispatch({ type: "remove", key })} />
        <FieldError id="entries-error" message={fieldErrors.entries} />
      </section>

      <section aria-labelledby="settings-heading" className="flex min-w-0 flex-col gap-5">
        <h2 id="settings-heading" className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Settings
        </h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tournament-name">Name</Label>
          <Input
            id="tournament-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bourbon, spring"
            className="h-11"
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
          />
          <FieldError id="name-error" message={fieldErrors.name} />
        </div>

        <div className="flex flex-col gap-1.5">
          <span id="heat-size-label" className="text-sm font-medium leading-none text-muted-foreground">Bottles per flight</span>
          <Segmented label="Bottles per flight" options={HEAT_SIZES} value={heatSize} onChange={setHeatSize} className="self-start" />
          <p className="text-xs text-muted-foreground">A flight is one tasting. Smaller flights are easier on the palate; six is the most.</p>
          <FieldError id="heat-size-error" message={fieldErrors.heatSize} />
        </div>

        <div className="flex items-start gap-3">
          <Checkbox id="blind" checked={blind} onCheckedChange={(v) => setBlind(v === true)} className="mt-0.5" />
          <div className="flex flex-col gap-1">
            <Label htmlFor="blind" className="text-foreground">
              Blind
            </Label>
            <p className="text-xs text-muted-foreground">You will not see names until a flight is decided.</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span id="seeding-label" className="text-sm font-medium leading-none text-muted-foreground">Seeding</span>
          <Segmented label="Seeding" options={SEEDING} value={seeding} onChange={setSeeding} className="self-start" />
          <p className="text-xs text-muted-foreground">
            Similar puts alike bottles in a flight, by the priority below. Random shuffles every round, which gives the ranking more cross-strength matches.
          </p>
          <FieldError id="seeding-error" message={fieldErrors.seeding} />
        </div>

        <div className="flex flex-col gap-1.5">
          <span id="priority-label" className="text-sm font-medium leading-none text-muted-foreground">Grouping priority</span>
          <PriorityList order={groupOrder} onChange={setGroupOrder} />
          <FieldError id="group-order-error" message={fieldErrors.groupOrder} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="field-note">Field note (optional)</Label>
          <Textarea id="field-note" rows={2} maxLength={200} value={fieldNote} onChange={(e) => setFieldNote(e.target.value)} placeholder="How you chose these bottles" />
          <FieldError id="field-note-error" message={fieldErrors.fieldNote} />
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <p className="text-xs tabular-nums text-muted-foreground">
            {nameMissing
              ? "Give the tournament a name to create it."
              : total < 2
                ? `${total === 0 ? "No entries yet" : "One entry"}: you can make the draft now and fill the field later. Starting needs at least 2.`
                : `${total} entries in flights of ${heatSize}. The field and settings stay editable until you start.`}
          </p>
          <Button type="submit" className="min-h-11" disabled={nameMissing || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {pending ? "Creating…" : "Create tournament"}
          </Button>
        </div>
      </section>
    </form>
  );
}
