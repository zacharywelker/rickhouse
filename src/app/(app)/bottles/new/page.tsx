import type { Metadata } from "next";
import Link from "next/link";
import { BottleForm } from "@/components/expressions/bottle-form";
import { Button } from "@/components/ui/button";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import { expressionOptions } from "@/lib/expressions/queries";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Add a bottle" };
export const dynamic = "force-dynamic";

export default async function NewBottlePage({
  searchParams,
}: {
  searchParams: Promise<{ expression?: string }>;
}) {
  const user = await requireSession();
  const [{ expression }, expressions, stores] = await Promise.all([
    searchParams,
    expressionOptions(user.id),
    REFERENCE_OPTION_LOADERS.stores(user.id),
  ]);

  const preselected = expression && /^\d+$/.test(expression) ? Number(expression) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Add a bottle</h1>
      </div>

      {expressions.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <p className="text-lg">No labels yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            A bottle has to be a bottle <em>of</em> something. Create the product first.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/expressions/new">Create a label</Link>
          </Button>
        </div>
      ) : (
        <BottleForm
          bottleId={null}
          initialValues={preselected === null ? null : { expressionId: preselected }}
          options={{ expressionId: expressions, storeId: stores }}
        />
      )}
    </div>
  );
}
