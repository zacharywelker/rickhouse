"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateDraftAction } from "@/app/(app)/tournaments/actions";
import type { GroupKey } from "@/lib/tournaments/types";
import { PriorityList } from "./priority-list";
import { Segmented } from "./segmented";

export type DraftSettingsValues = {
  name: string;
  heatSize: number;
  blind: boolean;
  seeding: "similar" | "random";
  groupOrder: GroupKey[];
  fieldNote: string | null;
};

const HEAT_SIZES = [
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
] as const;
export const SEEDING = [
  { value: "similar", label: "Similar" },
  { value: "random", label: "Random" },
] as const;

/**
 * The draft's settings. Each change is saved at once and the preview is made again from it: flight size, seeding and
 * the grouping order regroup the flights (and clear names you gave them); the name, blind and the note do not. The page
 * remounts this with the saved values (its `key`), so a refused change simply shows what is stored.
 */
export function DraftSettings({ tournamentId, values }: { tournamentId: number; values: DraftSettingsValues }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [name, setName] = React.useState(values.name);
  const [note, setNote] = React.useState(values.fieldNote ?? "");
  const [heatSize, setHeatSize] = React.useState(values.heatSize);
  const [blind, setBlind] = React.useState(values.blind);
  const [seeding, setSeeding] = React.useState(values.seeding);
  const [groupOrder, setGroupOrder] = React.useState<GroupKey[]>(values.groupOrder);

  function save(patch: Record<string, unknown>) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateDraftAction(tournamentId, patch);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        setName(values.name);
        setNote(values.fieldNote ?? "");
        setHeatSize(values.heatSize);
        setBlind(values.blind);
        setSeeding(values.seeding);
        setGroupOrder(values.groupOrder);
        return;
      }
      router.refresh();
    });
  }

  const err = (key: string) =>
    fieldErrors[key] ? (
      <p className="text-xs text-destructive">{fieldErrors[key]}</p>
    ) : null;

  return (
    <section aria-labelledby="draft-settings" className="flex min-w-0 flex-col gap-5">
      <h2 id="draft-settings" className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Settings
      </h2>
      <p className="text-xs text-muted-foreground">Changing flight size, seeding or the grouping order regroups the flights and clears names you gave them.</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="draft-name">Name</Label>
        <Input
          id="draft-name"
          value={name}
          maxLength={80}
          className="h-11"
          disabled={pending}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() !== values.name && save({ name })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        {err("name")}
      </div>

      <div className="flex flex-col gap-1.5">
        <span id="draft-size-label" className="text-sm font-medium leading-none text-muted-foreground">Bottles per flight</span>
        <Segmented
          label="Bottles per flight"
          options={HEAT_SIZES}
          value={heatSize}
          className="self-start"
          onChange={(v) => {
            if (v === heatSize || pending) return;
            setHeatSize(v);
            save({ heatSize: v });
          }}
        />
        {err("heatSize")}
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="draft-blind"
          checked={blind}
          disabled={pending}
          className="mt-0.5"
          onCheckedChange={(v) => {
            setBlind(v === true);
            save({ blind: v === true });
          }}
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor="draft-blind" className="text-foreground">
            Blind
          </Label>
          <p className="text-xs text-muted-foreground">Once it starts, flights you have not tasted show only their proof.</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id="draft-seeding-label" className="text-sm font-medium leading-none text-muted-foreground">Seeding</span>
        <Segmented
          label="Seeding"
          options={SEEDING}
          value={seeding}
          className="self-start"
          onChange={(v) => {
            if (v === seeding || pending) return;
            setSeeding(v);
            save({ seeding: v });
          }}
        />
        <p className="text-xs text-muted-foreground">Similar puts alike bottles in a flight, by the priority below. Random shuffles every round.</p>
        {err("seeding")}
      </div>

      <div className="flex flex-col gap-1.5">
        <span id="draft-priority-label" className="text-sm font-medium leading-none text-muted-foreground">Grouping priority</span>
        <PriorityList
          order={groupOrder}
          onChange={(next) => {
            if (pending) return;
            setGroupOrder(next);
            save({ groupOrder: next });
          }}
        />
        {err("groupOrder")}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="draft-note">Field note (optional)</Label>
        <Textarea
          id="draft-note"
          rows={2}
          maxLength={200}
          value={note}
          disabled={pending}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note.trim() !== (values.fieldNote ?? "") && save({ fieldNote: note.trim() === "" ? null : note })}
          placeholder="How you chose these bottles"
        />
        {err("fieldNote")}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <p role="status" className="min-h-4 text-xs text-muted-foreground">
        {pending ? "Saving…" : ""}
      </p>
    </section>
  );
}
