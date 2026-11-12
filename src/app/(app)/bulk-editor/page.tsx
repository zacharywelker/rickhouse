import type { Metadata } from "next";
import { BulkEditor } from "@/components/bulk-editor/bulk-editor";
import { requireSession } from "@/lib/auth";
import { loadSheet } from "@/lib/bulk-editor/load";
import { getCurrency } from "@/lib/preferences";

export const metadata: Metadata = { title: "Bulk editor" };
export const dynamic = "force-dynamic";

export default async function BulkEditorPage() {
  const user = await requireSession();
  const [{ labels, bottles, brands, categories, groups, kinds, photos, refs }, currency] = await Promise.all([loadSheet(user.id), getCurrency()]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-3xl text-accent">Bulk editor</h1>
      <BulkEditor labels={labels} bottles={bottles} brands={brands} categories={categories} groups={groups} kinds={kinds} photos={photos} refs={refs} currency={currency} />
    </div>
  );
}
