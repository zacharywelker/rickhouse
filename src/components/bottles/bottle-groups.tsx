"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Check, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { setBottleGroupMembershipAction } from "@/app/(app)/groups/actions";
import type { GroupOption } from "@/lib/groups/queries";

/**
 * Groups a bottle belongs to (DESIGN.md §19: Bottle Detail lists Groups
 * among what a bottle page may include), with a picker to add or remove it
 * from any group without leaving the page.
 */
export function BottleGroups({
  bottleId,
  memberOf,
  allGroups,
}: {
  bottleId: number;
  memberOf: GroupOption[];
  allGroups: GroupOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [pending, setPending] = React.useState<number | null>(null);
  const memberIds = new Set(memberOf.map((g) => g.id));

  const needle = query.trim().toLowerCase();
  const shown = needle === "" ? allGroups : allGroups.filter((g) => g.name.toLowerCase().includes(needle));

  async function toggle(groupId: number, member: boolean) {
    setPending(groupId);
    await setBottleGroupMembershipAction(bottleId, groupId, member);
    setPending(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">Groups</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {memberOf.map((group) => (
          <Badge key={group.id} className="gap-1 border-border bg-muted text-foreground">
            <Link href={`/groups/${group.id}` as Route} className="hover:text-primary">
              {group.name}
            </Link>
            <button
              type="button"
              onClick={() => void toggle(group.id, false)}
              disabled={pending === group.id}
              aria-label={`Remove from ${group.name}`}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-xs">
              Add to group
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search groups…"
                aria-label="Search groups"
                className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <ul className="max-h-64 overflow-y-auto p-1">
              {shown.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {allGroups.length === 0 ? (
                    <>
                      No groups yet.{" "}
                      <Link href="/groups/new" className="text-primary hover:underline">
                        Create one
                      </Link>
                      .
                    </>
                  ) : (
                    "Nothing matches."
                  )}
                </li>
              ) : (
                shown.map((group) => {
                  const active = memberIds.has(group.id);
                  return (
                    <li key={group.id}>
                      <button
                        type="button"
                        onClick={() => void toggle(group.id, !active)}
                        disabled={pending === group.id}
                        aria-pressed={active}
                        className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-60"
                      >
                        <Check className={cn("size-4 shrink-0", active ? "text-primary opacity-100" : "opacity-0")} />
                        <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
