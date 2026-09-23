import type { Metadata } from "next";
import { GroupForm } from "@/components/groups/group-form";

export const metadata: Metadata = { title: "New group" };

export default function NewGroupPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">New group</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Give it a name. You can add bottles, a cover image and a description once it exists.
        </p>
      </div>
      <GroupForm groupId={null} initialValues={null} />
    </div>
  );
}
