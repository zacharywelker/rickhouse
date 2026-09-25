"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FillGauge } from "@/components/bottles/fill-gauge";
import { humanise } from "@/lib/utils";
import { setBottleGroupMembershipAction } from "@/app/(app)/groups/actions";
import type { GridRow } from "@/lib/bottles/grid";
import type { BottlePickerOption } from "@/lib/groups/queries";

function MemberTile({ row, onRemove }: { row: GridRow; onRemove: () => void }) {
  return (
    <li className="group relative flex flex-col">
      <Link href={`/bottles/${row.id}`} className="flex flex-1 flex-col">
        <div className="relative flex aspect-square items-center justify-center bg-muted/40">
          {row.thumbPath ? (
            <Image
              src={`/api/images/${row.thumbPath}`}
              alt=""
              width={480}
              height={480}
              unoptimized
              className="size-full object-cover"
            />
          ) : (
            <FillGauge
              value={row.fillPct}
              readOnly
              fieldGroup={row.fieldGroup}
              height={110}
              label={`${row.expressionName} fill`}
            />
          )}
        </div>
        <div className="flex flex-col gap-0.5 pt-2">
          <p className="text-xs text-muted-foreground">{row.brand}</p>
          <p className="text-sm font-medium leading-tight group-hover:text-accent">{row.expressionName}</p>
          <Badge className="mt-1 w-fit">{humanise(row.status)}</Badge>
        </div>
      </Link>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${row.expressionName} from this group`}
        className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity hover:bg-black/90 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

function AddBottlesDialog({
  groupId,
  memberIds,
  options,
  open,
  onOpenChange,
}: {
  groupId: number;
  memberIds: ReadonlySet<number>;
  options: BottlePickerOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [pending, setPending] = React.useState<number | null>(null);

  const needle = query.trim().toLowerCase();
  const shown = options.filter((option) => {
    if (needle === "") return true;
    return `${option.brand} ${option.expressionName}`.toLowerCase().includes(needle);
  });

  async function toggle(bottleId: number, member: boolean) {
    setPending(bottleId);
    await setBottleGroupMembershipAction(bottleId, groupId, member);
    setPending(null);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Add bottles</DialogTitle>
          <DialogDescription>Pick any bottle from the collection. A bottle can belong to more than one group.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border px-6 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the collection…"
            aria-label="Search bottles"
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul className="flex-1 overflow-y-auto p-2">
          {shown.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing matches.</li>
          ) : (
            shown.map((option) => {
              const active = memberIds.has(option.id);
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => void toggle(option.id, !active)}
                    disabled={pending === option.id}
                    aria-pressed={active}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-60"
                  >
                    <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden bg-muted/60">
                      {option.thumbPath ? (
                        <Image src={`/api/images/${option.thumbPath}`} alt="" fill unoptimized className="object-cover" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-muted-foreground">{option.brand}</span>
                      <span className="block truncate">
                        {option.expressionName}
                        {option.batch ? ` · ${option.batch}` : ""}
                      </span>
                    </span>
                    <Check className={active ? "size-4 shrink-0 text-primary" : "size-4 shrink-0 opacity-0"} />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function GroupBottleGrid({
  groupId,
  members,
  bottleOptions,
}: {
  groupId: number;
  members: GridRow[];
  bottleOptions: BottlePickerOption[];
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const memberIds = new Set(members.map((row) => row.id));

  async function remove(bottleId: number) {
    await setBottleGroupMembershipAction(bottleId, groupId, false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl">Bottles</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          <Plus className="size-4" />
          Add bottles
        </Button>
      </div>

      {members.length === 0 ? (
        <p className="border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          An unfinished scrapbook page. Add a bottle to get this group started.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {members.map((row) => (
            <MemberTile key={row.id} row={row} onRemove={() => void remove(row.id)} />
          ))}
        </ul>
      )}

      <AddBottlesDialog
        groupId={groupId}
        memberIds={memberIds}
        options={bottleOptions}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
      />
    </div>
  );
}
