import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GroupForm } from "@/components/groups/group-form";
import { getGroup } from "@/lib/groups/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const group = Number.isInteger(Number(id)) ? await getGroup(Number(id)) : null;
  return { title: group ? `Edit ${group.name}` : "Edit group" };
}

export default async function EditGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId)) notFound();

  const group = await getGroup(groupId);
  if (!group) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Edit {group.name}</h1>
      </div>
      <GroupForm groupId={groupId} initialValues={{ name: group.name, description: group.description }} />
    </div>
  );
}
