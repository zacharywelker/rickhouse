"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateDraftAction } from "@/app/(app)/tournaments/actions";
import { groupingPatch } from "@/lib/tournaments/grouping-patch";
import type { GroupKey } from "@/lib/tournaments/types";
import { SEEDING } from "./draft-settings";
import { PriorityList } from "./priority-list";
import { Segmented } from "./segmented";

/**
 * Grouping priority and seeding of a running tournament, in a disclosure. Sends only what changed. The page remounts
 * this with the saved values (its `key`), so a refused change shows what is stored.
 */
export function RunningGrouping({ tournamentId, groupOrder: savedOrder, seeding: savedSeeding }: { tournamentId: number; groupOrder: GroupKey[]; seeding: "similar" | "random" }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [groupOrder, setGroupOrder] = React.useState<GroupKey[]>(savedOrder);
  const [seeding, setSeeding] = React.useState(savedSeeding);

  const patch = groupingPatch({ groupOrder: savedOrder, seeding: savedSeeding }, { groupOrder, seeding });

  function save() {
    if (!patch || pending) return;
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateDraftAction(tournamentId, patch);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
      router.refresh(); // on failure too: a stale page is worst
    });
  }

  const err = (key: string) => (fieldErrors[key] ? <p className="text-xs text-destructive">{fieldErrors[key]}</p> : null);

  return (
    <details className="group max-w-xl border-y border-border">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Grouping</summary>
      <div className="flex flex-col gap-4 pb-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium leading-none text-muted-foreground">Seeding</span>
          <Segmented label="Seeding" options={SEEDING} value={seeding} className="self-start" onChange={(v) => !pending && setSeeding(v)} />
          {err("seeding")}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium leading-none text-muted-foreground">Grouping priority</span>
          <PriorityList order={groupOrder} onChange={(next) => !pending && setGroupOrder(next)} />
          {err("groupOrder")}
        </div>
        <p className="text-xs text-muted-foreground">Applies to the next round, or to this one right away with Reset to automatic.</p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="button" className="min-h-11 self-start" disabled={!patch || pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </details>
  );
}
