import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { GroupCard } from "@/components/groups/group-card";
import { listGroups } from "@/lib/groups/queries";

export const metadata: Metadata = { title: "Groups" };
export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const groups = await listGroups();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl text-accent">Groups</h1>
        </div>
        <Button asChild>
          <Link href="/groups/new">
            New group
          </Link>
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <p className="text-lg">No groups yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            An unfinished scrapbook page. Start one to pull bottles together around a story.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/groups/new">Create a group</Link>
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <li key={group.id}>
              <GroupCard group={group} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
