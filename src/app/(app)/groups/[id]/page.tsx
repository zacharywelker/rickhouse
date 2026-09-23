import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupBottleGrid } from "@/components/groups/group-bottle-grid";
import { GroupCoverUpload } from "@/components/groups/group-cover-upload";
import { DeleteGroupButton } from "@/components/groups/delete-group-button";
import { allBottleOptions, getGroupDetail } from "@/lib/groups/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const detail = Number.isInteger(Number(id)) ? await getGroupDetail(Number(id)) : null;
  return { title: detail ? detail.group.name : "Group" };
}

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId)) notFound();

  const [detail, bottleOptions] = await Promise.all([getGroupDetail(groupId), allBottleOptions()]);
  if (!detail) notFound();
  const { group, members } = detail;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/groups" className="hover:text-accent">
              Groups
            </Link>
          </p>
          <h1 className="text-3xl text-accent">{group.name}</h1>
          {group.description ? <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm">{group.description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/groups/${groupId}/edit`}>
              <Pencil className="size-4" />
              Edit
            </Link>
          </Button>
          <DeleteGroupButton groupId={groupId} name={group.name} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[320px_1fr]">
        <GroupCoverUpload groupId={groupId} coverImagePath={group.coverImagePath} />
        <GroupBottleGrid groupId={groupId} members={members} bottleOptions={bottleOptions} />
      </div>
    </div>
  );
}
