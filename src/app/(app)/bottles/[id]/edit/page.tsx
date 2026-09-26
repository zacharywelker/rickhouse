import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BottleForm } from "@/components/expressions/bottle-form";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import { expressionOptions, getBottle } from "@/lib/expressions/queries";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Edit bottle" };
export const dynamic = "force-dynamic";

export default async function EditBottlePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession();
  const { id } = await params;
  const bottleId = Number(id);
  if (!Number.isInteger(bottleId)) notFound();

  const row = await getBottle(bottleId, user.id);
  if (!row) notFound();

  const [expressions, stores] = await Promise.all([expressionOptions(user.id), REFERENCE_OPTION_LOADERS.stores(user.id)]);

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">
          {row.brand.name} {row.expression.name}
        </h1>
      </div>
      <BottleForm
        bottleId={bottleId}
        initialValues={row.bottle as unknown as Record<string, string | number | boolean | null>}
        options={{ expressionId: expressions, storeId: stores }}
      />
    </div>
  );
}
