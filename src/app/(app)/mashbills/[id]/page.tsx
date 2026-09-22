import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityPage } from "@/components/entities/entity-page";
import { getMashbill } from "@/lib/entities/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = Number.isInteger(Number(id)) ? await getMashbill(Number(id)) : null;
  return { title: row ? (row.name ?? row.recipe) : "Mashbill" };
}

export default async function MashbillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const mashbillId = Number(id);
  if (!Number.isInteger(mashbillId)) notFound();

  const row = await getMashbill(mashbillId);
  if (!row) notFound();

  return (
    <EntityPage
      kind="Mashbill"
      name={row.name ?? row.recipe}
      meta={[
        { label: "Recipe", value: row.recipe },
        {
          label: "Distillery",
          value: row.distillerySlug ? (
            <Link href={`/distilleries/${row.distillerySlug}` as Route} className="text-primary hover:underline">
              {row.distillery}
            </Link>
          ) : (
            "—"
          ),
        },
      ]}
      notes={row.notes}
      preset={{ mashbillIds: [mashbillId] }}
      searchParams={query}
      emptyMessage="Nothing on the shelf uses this recipe yet."
    />
  );
}
